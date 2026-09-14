import crypto from "node:crypto";
import { withTenant } from "@/lib/db";
import { effectiveTenantId } from "@/lib/tenant-auth";
import { generateText, sharedGenerationQuotaErrorResponse, sharedAiApprovalErrorResponse } from "@/lib/anthropic";
import { getRepoToken, fetchRepoFile } from "@/lib/github";

// 레포 위키 → 브랜드 가이드 인입. 소스(repo,path,ref)는 brand_guides에 저장.
// 생성기는 brand_guides만 읽음 — 레포 직접 안 봄(인입↔생성 분리).
// GitHub fetch 헬퍼(getRepoToken/fetchRepoFile)는 lib/github로 이관(sync-wiki 공용).

interface BrandRow {
  prompt_guide?: string; visual_rules?: unknown; source?: string;
  source_repo?: string; source_path?: string; source_ref?: string;
  source_hash?: string; synced_at?: string;
}

// GET /api/brand/sync-repo?tenant_id=... — 현재 레포 소스 정보
export async function GET(request: Request) {
  const tenantId = await effectiveTenantId(request, new URL(request.url).searchParams.get("tenant_id"));
  if (!tenantId) return Response.json({ error: "tenant_id required" }, { status: 400 });
  try {
    const [row] = await withTenant(tenantId, (sql) => sql<BrandRow[]>`
      SELECT source, source_repo, source_path, source_ref, synced_at, prompt_guide
      FROM brand_guides WHERE tenant_id = ${tenantId}`);
    return Response.json({ source: row || null });
  } catch (e) {
    return Response.json({ error: String(e) }, { status: 500 });
  }
}

// POST /api/brand/sync-repo — { tenant_id, repo:'owner/name', path, ref? }
// public 레포 raw fetch → claude -p 증류 → brand_guides upsert(source='repo').
export async function POST(request: Request) {
  const __b = await request.json();
  const { repo, path, ref } = __b;
  const tenant_id = await effectiveTenantId(request, __b.tenant_id);
  if (!tenant_id || !repo || !path) {
    return Response.json({ error: "tenant_id, repo, path required" }, { status: 400 });
  }
  // 입력 검증: repo='owner/name', path에 .. 금지
  if (!/^[\w.-]+\/[\w.-]+$/.test(String(repo))) {
    return Response.json({ error: "repo 형식은 owner/name" }, { status: 400 });
  }
  // path: 쉼표/줄바꿈으로 여러 파일 지원
  const paths = String(path).split(/[,\n]/).map((p) => p.trim().replace(/^\/+/, "")).filter(Boolean);
  if (paths.length === 0) return Response.json({ error: "path 필요" }, { status: 400 });
  if (paths.some((p) => p.includes(".."))) return Response.json({ error: "path에 .. 불가" }, { status: 400 });
  const joinedPath = paths.join(", ");
  const branch = (ref && String(ref).trim()) || "main";

  // 1) fetch — 비공개 레포 토큰 있으면 GitHub API, 없으면 public raw. 다중파일 합치기.
  const token = await getRepoToken(tenant_id);
  const parts: string[] = [];
  const failed: string[] = [];
  for (const p of paths) {
    const r = await fetchRepoFile(repo, p, branch, token);
    if (r.ok && r.text) parts.push(paths.length > 1 ? `## ${p}\n\n${r.text}` : r.text);
    else failed.push(`${p}(${r.status})`);
  }
  if (parts.length === 0) {
    return Response.json({
      error: `파일을 못 가져옴: ${failed.join(", ")}. ${token ? "토큰 권한·경로·브랜치 확인" : "public 레포·경로·브랜치 확인 (비공개는 GitHub 토큰 등록)"}`,
    }, { status: 400 });
  }
  const markdown = parts.join("\n\n---\n\n");
  if (markdown.trim().length < 30) {
    return Response.json({ error: "문서가 너무 짧음(30자 미만)" }, { status: 400 });
  }

  // 2) 해시 비교 — 동일하면 재증류 skip(claude -p 비용 절감)
  const hash = crypto.createHash("sha256").update(markdown).digest("hex");
  const [existing] = await withTenant(tenant_id, (sql) => sql<BrandRow[]>`
    SELECT source_hash FROM brand_guides WHERE tenant_id = ${tenant_id}`);
  if (existing?.source_hash === hash) {
    return Response.json({ ok: true, skipped: true, reason: "원문 변경 없음", repo, path: joinedPath, ref: branch });
  }

  // 3) generateText 증류 (위저드와 동일 출력 스키마 — brand_guides 정합)
  //    테넌트 Anthropic 키 우선, 없으면 claude -p 폴백.
  const input = markdown.slice(0, 20000); // 과대 프롬프트 방지
  const prompt = `너는 브랜드 전략가다. 아래 "마케팅 위키 문서"를 SNS 마케팅 콘텐츠 생성용 "브랜드 가이드"로 증류하라.

=== 마케팅 위키 문서 시작 ===
${input}
=== 마케팅 위키 문서 끝 ===

출력은 JSON만(다른 텍스트 없이):
{
 "prompt_guide": "콘텐츠 생성 시 주입할 브랜드 톤 가이드 (한국어, 5~10줄: 보이스·톤·페르소나·핵심 hook·금지표현 명시. 카피라이터가 바로 쓸 수 있게 구체적으로)",
 "visual_rules": {"colors": ["#hex 또는 색이름", ...], "typography": "서체/타이포 느낌", "forbidden": ["금지 비주얼 요소", ...]}
}`;
  try {
    const stdout = await generateText(prompt, tenant_id);
    const m = stdout.match(/\{[\s\S]*\}/);
    if (!m) return Response.json({ error: "생성기가 알아볼 수 없는 형식으로 답했습니다. 잠시 후 다시 시도해 주세요.", raw: stdout.slice(-400) }, { status: 502 });
    const parsed = JSON.parse(m[0]) as { prompt_guide?: string; visual_rules?: Record<string, unknown> };

    // 4) brand_guides upsert (source='repo' + 소스 포인터 + 해시)
    await withTenant(tenant_id, (sql) => sql`
      INSERT INTO brand_guides (tenant_id, prompt_guide, visual_rules, source, source_repo, source_path, source_ref, source_hash, synced_at)
      VALUES (${tenant_id}, ${parsed.prompt_guide || ""}, ${sql.json((parsed.visual_rules ?? {}) as Parameters<typeof sql.json>[0])},
              'repo', ${repo}, ${joinedPath}, ${branch}, ${hash}, now())
      ON CONFLICT (tenant_id) DO UPDATE
        SET prompt_guide = EXCLUDED.prompt_guide, visual_rules = EXCLUDED.visual_rules,
            source = 'repo', source_repo = EXCLUDED.source_repo, source_path = EXCLUDED.source_path,
            source_ref = EXCLUDED.source_ref, source_hash = EXCLUDED.source_hash, synced_at = now()`);
    return Response.json({ ok: true, repo, path: joinedPath, ref: branch, guide: { prompt_guide: parsed.prompt_guide, visual_rules: parsed.visual_rules } });
  } catch (e) {
    const approvalResponse = sharedAiApprovalErrorResponse(e);
    if (approvalResponse) return approvalResponse;
    const quotaResponse = sharedGenerationQuotaErrorResponse(e);
    if (quotaResponse) return quotaResponse;
    const msg = e instanceof Error ? e.message : String(e);
    return Response.json({ error: msg.slice(0, 400) }, { status: 502 });
  }
}
