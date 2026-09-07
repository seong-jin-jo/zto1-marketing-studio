import { UPSTREAM_FAILED } from "@/lib/api-failure";
import { execFile } from "child_process";
import { promisify } from "util";
import fs from "fs";
import path from "path";
import { withTenant } from "@/lib/db";
import { effectiveTenantId } from "@/lib/tenant-auth";
import { importShortDraftsToQueue } from "@/lib/sourcing-bridge";
import { fetchRepoFile } from "@/lib/github";

// P9 롱폼→숏폼 소싱 API.
// POST: 긴 글(longform_text) → claude -p 청킹으로 숏폼 후보 N개(훅+본문) 추출.
//       선택적으로 viral_signals(원문 시그널) + drafts(후보 초안)를 워크스페이스에 저장.
// GET:  ?tenant_id= → 해당 워크스페이스의 viral_signals 목록(최근 50).
// 모든 테넌트-스코프 쿼리는 withTenant 경유(RLS 방어심층).

const execFileP = promisify(execFile);
const CLAUDE_BIN = process.env.CLAUDE_BIN || "claude";

// 청크당 문자 수 / 청크당 후보 수 / 총 후보 상한(env로 조정 가능).
const CHUNK_CHARS = Number(process.env.LONGFORM_CHUNK_CHARS) || 6000;
const PER_CHUNK = Number(process.env.LONGFORM_PER_CHUNK) || 3;
const MAX_CANDIDATES = Number(process.env.LONGFORM_MAX_CANDIDATES) || 8;

// 0차 multi-repo context: prompt 과부하 방지용 (studio/text와 동일하게 1200자 슬라이스)
const MAX_CONTEXT_CHARS = 1200;

interface ShortCandidate {
  hook: string;
  body: string;
  caption?: string;
  hashtags?: string[];
  source_quote?: string;
}

interface ViralSignalRow {
  id: string;
  tenant_id: string;
  source: string | null;
  external_ref: string | null;
  content: string | null;
  score: string | null; // NUMERIC → 문자열로 반환됨
  captured_at: string;
  created_at: string;
}

// 긴 텍스트를 문장 경계 우선으로 chunkChars 단위 분할.
function chunkText(text: string, chunkChars: number): string[] {
  if (text.length <= chunkChars) return [text];
  const chunks: string[] = [];
  let start = 0;
  while (start < text.length) {
    let end = Math.min(start + chunkChars, text.length);
    if (end < text.length) {
      const slice = text.slice(start, end);
      const lastBreak = Math.max(
        slice.lastIndexOf("\n"),
        slice.lastIndexOf(". "),
        slice.lastIndexOf("? "),
        slice.lastIndexOf("! "),
        slice.lastIndexOf("다. "),
      );
      if (lastBreak > chunkChars * 0.5) end = start + lastBreak + 1;
    }
    chunks.push(text.slice(start, end).trim());
    start = end;
  }
  return chunks.filter((c) => c.length > 0);
}

// 청킹 프롬프트: 한 청크 → 숏폼 후보 N개를 JSON 배열로만 출력.
function buildChunkPrompt(chunk: string, perChunk: number, idx: number, total: number): string {
  return `너는 롱폼 콘텐츠를 숏폼(릴스/쇼츠/틱톡)으로 쪼개는 편집자다.
아래는 긴 원문의 ${idx + 1}/${total}번째 조각이다. 이 조각에서 독립적으로 성립하는 숏폼 후보를 최대 ${perChunk}개 뽑아라.

규칙 (중요 - 사실 기반):
- 100% 한국어. AI가 쓴 티 금지. 첫 문장(훅)으로 손가락을 멈추게 할 것.
- 각 후보는 30초 안에 끝나는 단일 메시지. 브랜드 위키 사실을 반드시 존중하고, 원문에 없는 사실 지어내기 절대 금지.
- 훅(hook): 0~3초, 궁금증/충격/공감 한 문장.
- 본문(body): 3~30초 분량, 핵심 1~3포인트.
- source_quote: 이 후보의 근거가 된 원문 문장 한 줄(요약 아님, 원문 발췌).

출력은 JSON 배열만(다른 텍스트/설명/마크다운 코드펜스 없이):
[
  {
    "hook": "0~3초 훅 한 문장",
    "body": "3~30초 본문",
    "caption": "게시물 캡션(짧게)",
    "hashtags": ["태그", "태그"],
    "source_quote": "원문 근거 발췌 한 줄"
  }
]

원문 조각:
"""
${chunk}
"""`;
}

// claude -p 1회 호출 → JSON 배열 파싱. 실패 시 빈 배열.
async function runClaudeChunk(prompt: string): Promise<ShortCandidate[]> {
  const { stdout } = await execFileP(CLAUDE_BIN, ["-p", prompt], {
    timeout: 120000,
    maxBuffer: 8 * 1024 * 1024,
  });
  const m = stdout.match(/\[[\s\S]*\]/);
  if (!m) return [];
  try {
    const arr = JSON.parse(m[0]) as unknown;
    if (!Array.isArray(arr)) return [];
    return arr
      .filter((x): x is Record<string, unknown> => !!x && typeof x === "object")
      .map((x) => ({
        hook: String(x.hook ?? "").trim(),
        body: String(x.body ?? "").trim(),
        caption: x.caption ? String(x.caption).trim() : undefined,
        hashtags: Array.isArray(x.hashtags) ? x.hashtags.map((h) => String(h)) : undefined,
        source_quote: x.source_quote ? String(x.source_quote).trim() : undefined,
      }))
      .filter((c) => c.hook && c.body);
  } catch {
    return [];
  }
}

// POST /api/sourcing — { tenant_id, longform_text, count?, save? }
// save !== false 이면 viral_signals 1행 + drafts N행 저장(withTenant 경유).
export async function POST(request: Request) {
  const body = await request.json().catch(() => ({}));
  const tenantId = await effectiveTenantId(request, body.tenant_id);

  let longform: string = typeof body.longform_text === "string" ? body.longform_text.trim() : "";
  // 0차: early declare for multi-repo context accumulation
  let wikiFacts = "";
  // context_sources 로드 실패 등 비차단 경고 누적(아래 청킹 단계에서도 재사용).
  const errors: string[] = [];

  // NEW: wiki_path support (project wiki integration for shorts factory)
  // e.g. POST { wiki_path: "product/shorts-factory.md" } → loads from wiki/ as longform source
  // Useful for generating project-update shorts, docs-to-content, or dev demos from our own wiki/.
  // Note: project wiki (repo) vs tenant Brand Wiki (for customer content facts) are separate.
  if (body.wiki_path && typeof body.wiki_path === "string") {
    try {
      // Resolve relative to project root (works in dev + typical docker where cwd has wiki/)
      const wikiRoot = path.resolve(process.cwd(), "wiki");
      const fullPath = path.join(wikiRoot, body.wiki_path);
      const fileContent = fs.readFileSync(fullPath, "utf8");
      longform = fileContent.trim();
    } catch (e) {
      return Response.json(
        { error: `wiki_path load failed: ${body.wiki_path} (${(e as Error).message})` },
        { status: 400 },
      );
    }
  }

  // 0차: Multi-repo wiki context pulling (for operator's other services/repos)
  // body.context_sources = [{type: 'github', owner: 'user', repo: 'other-service', path: 'wiki/brand.md', ref?: 'main', token?: '...' }, ...]
  // or local paths. Appends to longform and facts for injection.
  // Respects current deploy (no new build-time vars). Errors explainable per handoff.
  if (body.context_sources && Array.isArray(body.context_sources)) {
    for (const src of body.context_sources) {
      try {
        let content = '';
        if (src.type === 'github' && src.owner && src.repo && src.path) {
          const ref = src.ref || 'main';
          const result = await fetchRepoFile(
            `${src.owner}/${src.repo}`,
            src.path,
            ref,
            src.token || null,
          );
          if (!result.ok) throw new Error(`HTTP ${result.status}`);
          content = result.text || "";
        } else if (src.type === 'local' && src.path) {
          const p = path.resolve(process.cwd(), src.path);
          content = fs.readFileSync(p, 'utf8');
        }
        if (content) {
          longform += `\n\n## Context from ${src.owner || 'local'}/${src.repo || src.path}\n${content}`;
          wikiFacts += `\n\n## ${src.path}\n${content.slice(0, MAX_CONTEXT_CHARS)}`;
        }
      } catch (e) {
        // 0차: make error explainable (handoff: 사용자가 설명 가능하게)
        const srcDesc = src.type === 'github' ? `${src.owner}/${src.repo}/${src.path}` : src.path;
        errors.push(`[context ${src.type}] ${srcDesc} load failed: ${(e as Error).message}. Check repo access, path, ref. For private: provide token.`);
      }
    }
  }

  if (!tenantId) return Response.json({ error: "tenant_id required" }, { status: 400 });
  if (!longform || longform.length < 50) {
    return Response.json({ error: "longform_text required (최소 50자)" }, { status: 400 });
  }

  // Basic quota guard (hybrid pricing, ADR-003). Extend with real enforcement.
  try {
    const month = new Date().toISOString().slice(0, 7);
    await withTenant(tenantId, async (sql) => {
      const [q] = await sql`SELECT shorts_included, shorts_used FROM usage_quotas WHERE tenant_id=${tenantId} AND period=${month}`;
      if (q && q.shorts_used >= q.shorts_included) {
        // allow but flag; in prod could 402 or reduce count
        // for now proceed with warning
      }
    });
  } catch {}
  const count =
    typeof body.count === "number" && body.count > 0 ? Math.floor(body.count) : MAX_CANDIDATES;
  const save = body.save !== false;

  // Load tenant Brand Wiki facts for grounding (to reduce hallucination/discard per benchmark)
  // wikiFacts already declared above for 0차 multi-repo accumulation
  try {
    await withTenant(tenantId, async (sql) => {
      const facts = await sql<{ path: string; content: string }[]>`
        SELECT path, content FROM wiki_docs 
        WHERE tenant_id = ${tenantId} 
        ORDER BY updated_at DESC 
        LIMIT 3`;
      if (facts.length) {
        wikiFacts = facts.map(f => `## ${f.path}\n${f.content.slice(0, MAX_CONTEXT_CHARS)}`).join("\n\n");
      }
    });
  } catch {}

  // 1) claude -p 청킹으로 숏폼 후보 추출 (wiki facts injected for accuracy)
  const chunks = chunkText(longform, CHUNK_CHARS);
  const candidates: ShortCandidate[] = [];
  const seenHooks = new Set<string>();
  for (let i = 0; i < chunks.length; i++) {
    try {
      let prompt = buildChunkPrompt(chunks[i], PER_CHUNK, i, chunks.length);
      if (wikiFacts) {
        prompt = `브랜드 사실 정보 (반드시 준수, 지어내지 마):\n${wikiFacts.slice(0, 2000)}\n\n` + prompt; // 0차: MAX_CONTEXT_CHARS 로 이미 제한된 facts 사용
      }
      const cands = await runClaudeChunk(prompt);
      for (const c of cands) {
        const key = c.hook.slice(0, 40);
        if (seenHooks.has(key)) continue;
        seenHooks.add(key);
        candidates.push(c);
      }
    } catch (e) {
      errors.push(`chunk ${i + 1}: ${e instanceof Error ? e.message.slice(0, 120) : String(e)}`);
    }
    if (candidates.length >= count) break;
  }
  const finalCandidates = candidates.slice(0, count);

  if (finalCandidates.length === 0) {
    return Response.json(
      { ok: false, error: "숏폼 후보 추출 실패", chunks: chunks.length, errors },
      { status: UPSTREAM_FAILED },
    );
  }

  // 2) 선택 저장: viral_signals(원문 시그널) + drafts(후보별 초안)
  let signalId: string | null = null;
  let savedDrafts = 0;
  if (save) {
    try {
      await withTenant(tenantId, async (sql) => {
        // 원문을 viral_signal 1행으로 적재(소스=longform, 점수=후보 수).
        const [sig] = await sql<{ id: string }[]>`
          INSERT INTO viral_signals (tenant_id, source, external_ref, content, score)
          VALUES (${tenantId}, 'longform', ${null}, ${longform.slice(0, 4000)}, ${finalCandidates.length})
          RETURNING id`;
        signalId = sig?.id ?? null;
        // 후보별 draft 행 적재(payload jsonb에 훅/본문/캡션/해시태그 보관).
        for (const c of finalCandidates) {
          const payload = {
            kind: "short",
            hook: c.hook,
            body: c.body,
            caption: c.caption ?? null,
            hashtags: c.hashtags ?? [],
            source_quote: c.source_quote ?? null,
            signal_id: signalId,
          };
          await sql`
            INSERT INTO drafts (tenant_id, idea, payload, status)
            VALUES (${tenantId}, ${c.hook}, ${sql.json(payload)}, 'draft')`;
          savedDrafts++;
        }
      });
    } catch (e) {
      errors.push(`save: ${e instanceof Error ? e.message.slice(0, 160) : String(e)}`);
    }
  }

  // 선택: 저장한 short draft를 곧장 운영 큐(queue.json)로 가져오기(멱등 브리지).
  let importedToQueue = 0;
  if (save && body.toQueue === true && savedDrafts > 0) {
    try {
      const r = await importShortDraftsToQueue(tenantId);
      importedToQueue = r.imported;
    } catch (e) {
      errors.push(`toQueue: ${e instanceof Error ? e.message.slice(0, 160) : String(e)}`);
    }
  }

  // Record usage (for hybrid pricing / quotas per ADR-003)
  // shortsGeneration counts as generation activity; later can track video minutes on render
  try {
    const recordUrl = new URL("/api/usage/record", request.url);
    const authorization = request.headers.get("authorization");
    await fetch(recordUrl.toString(), {
      method: "POST",
      headers: {
        "content-type": "application/json",
        ...(authorization ? { authorization } : {}),
      },
      body: JSON.stringify({ event: "shortsGeneration", count: Math.max(1, finalCandidates.length) }),
    });
  } catch (e) {
    errors.push(`usage record: ${(e as Error).message}`);
  }

  return Response.json({
    ok: true,
    message: `롱폼 ${longform.length}자 → ${chunks.length}청크 → 숏폼 후보 ${finalCandidates.length}개`,
    sourceChars: longform.length,
    chunks: chunks.length,
    candidates: finalCandidates,
    signalId,
    savedDrafts,
    importedToQueue,
    wikiFactsUsed: !!wikiFacts,
    errors: errors.length ? errors : undefined,
  });
}

// GET /api/sourcing?tenant_id=... — 워크스페이스 viral_signals 목록(최근 50)
export async function GET(request: Request) {
  const tenantId = await effectiveTenantId(request, new URL(request.url).searchParams.get("tenant_id"));
  if (!tenantId) return Response.json({ signals: [] });
  try {
    const rows = await withTenant(tenantId, (sql) => sql<ViralSignalRow[]>`
      SELECT id, tenant_id, source, external_ref, content, score, captured_at, created_at
      FROM viral_signals WHERE tenant_id = ${tenantId}
      ORDER BY captured_at DESC LIMIT 50`);
    const signals = rows.map((r) => ({
      id: r.id,
      source: r.source,
      externalRef: r.external_ref,
      content: r.content,
      score: r.score != null ? Number(r.score) : null,
      capturedAt: r.captured_at,
    }));
    return Response.json({ signals });
  } catch (e) {
    return Response.json({ signals: [], error: String(e) }, { status: 500 });
  }
}
