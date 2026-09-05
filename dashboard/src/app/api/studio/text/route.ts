import { effectiveTenantId } from "@/lib/tenant-auth";
import { getWikiContext } from "@/lib/wiki-retrieve";
import { generateText, sharedGenerationQuotaErrorResponse, sharedAiApprovalErrorResponse } from "@/lib/anthropic";
import { fetchRepoFile } from "@/lib/github";
import { CHANNEL_TEXT_LIMITS } from "@/lib/channel-text-limits";

// POST /api/studio/text — 글감 1개 → 플랫폼별 텍스트 변형(OSMU).
// body: { idea, guide?, tenant_id?, context_sources? } 
// 0차: context_sources for multi-repo wiki (operator's other services). See sourcing for format.
// tenant_id for Brand Wiki. Respects handoff deploy (no new build vars).
export async function POST(request: Request) {
  const { idea, guide = "", tenant_id, context_sources, structure } = await request.json();
  if (!idea || typeof idea !== "string") {
    return Response.json({ error: "idea required" }, { status: 400 });
  }
  const structureInput = structure as { label?: unknown; title?: unknown; outline?: unknown } | undefined;
  if (structureInput && (
    !["A", "B", "C"].includes(String(structureInput.label))
    || typeof structureInput.title !== "string"
    || !structureInput.title.trim()
    || !Array.isArray(structureInput.outline)
    || structureInput.outline.length === 0
    || structureInput.outline.some((item) => typeof item !== "string" || !item.trim())
  )) {
    return Response.json({ error: "structure invalid" }, { status: 400 });
  }
  const structureGuide = structureInput
    ? `\n사용자가 고른 구조: ${structureInput.label} ${structureInput.title}\n이야기 순서: ${(structureInput.outline as string[]).join(" → ")}\n모든 플랫폼 초안에 이 구조와 순서를 반드시 반영한다.\n`
    : "";
  // 위키 근거: 위키 전체 주입(작으면) 또는 관련 top-K(크면 자동 폴백) → 프롬프트 주입(사실 기반 생성)
  const tenantId = await effectiveTenantId(request, tenant_id);
  const { text: wiki } = tenantId ? await getWikiContext(tenantId, idea) : { text: "" };
  let extraContext = "";
  // 0차: multi-repo context pulling (github raw + local) for operator's other repos
  if (context_sources && Array.isArray(context_sources)) {
    for (const src of context_sources) {
      try {
        let content = "";
        if (src.type === "github" && src.owner && src.repo && src.path) {
          const ref = src.ref || "main";
          const result = await fetchRepoFile(
            `${src.owner}/${src.repo}`,
            src.path,
            ref,
            src.token || null,
          );
          if (result.ok) content = result.text || "";
        } else if (src.type === "local" && src.path) {
          content = require("fs").readFileSync(require("path").resolve(process.cwd(), src.path), "utf8");
        }
        if (content) extraContext += `\n\n## Context from ${src.owner || "local"}/${src.repo || src.path}\n${content.slice(0, 1200)}`; // 0차: sourcing의 MAX_CONTEXT_CHARS와 동일 (prompt bloat 방지)
      } catch (e) {
        // 0차: explainable error (handoff)
        extraContext += `\n\n[context error] ${src.path || "source"}: ${(e as Error).message}. Check access/path.`;
      }
    }
  }
  const prompt = `너는 SNS 마케팅 카피라이터다. 아래 글감을 플랫폼 특성에 맞춰 변형하라.
${guide ? `브랜드 톤 가이드:\n${guide}\n` : ""}${wiki ? `\n=== 위키 참조(아래 사실에 근거해 작성, 없는 내용 지어내기 금지) ===\n${wiki}\n===\n` : ""}${extraContext ? `\n=== 추가 컨텍스트 (0차 multi-repo) ===\n${extraContext}\n===\n` : ""}
글감: "${idea}"
${structureGuide}

규칙: 100% 한국어, AI가 쓴 티 금지, 후킹 첫 문장, 과한 이모지 금지.
출력은 JSON만(다른 텍스트 없이):
{
 "threads": "Threads용 본문 (${CHANNEL_TEXT_LIMITS.threads}자 이내, 구어체, 첫 줄 훅)",
 "facebook": "Facebook용 본문 (확인되지 않은 글자 상한을 만들지 말고, Threads 문장을 재사용하지 않으며 Facebook 독자 맥락에 맞춰 독립 작성)",
 "x": "X용 (${CHANNEL_TEXT_LIMITS.x}자 이내, 압축)",
 "instagram": {"caption": "IG 캡션", "hashtags": ["태그", ...], "slides": ["카드1(표지 훅)", "카드2", "카드3", "카드4(CTA)"]},
 "shorts": {"hook": "0~3초 훅", "body": "3~20초 3포인트", "cta": "20~30초 CTA"},
 "image_prompt": "히어로 이미지 생성용 영문 프롬프트(텍스트 없이, 플랫 일러스트)"
}`;
  try {
    // 고객이 자기 Anthropic 키 등록 시 그 키로(고객 과금), 없으면 공유 claude -p
    const stdout = await generateText(prompt, tenantId);
    const m = stdout.match(/\{[\s\S]*\}/);
    if (!m) return Response.json({ error: "JSON 추출 실패", raw: stdout.slice(-400) }, { status: 502 });
    return Response.json({ ok: true, ...JSON.parse(m[0]) });
  } catch (e) {
    const approvalResponse = sharedAiApprovalErrorResponse(e);
    if (approvalResponse) return approvalResponse;
    const quotaResponse = sharedGenerationQuotaErrorResponse(e);
    if (quotaResponse) return quotaResponse;
    const msg = e instanceof Error ? e.message : String(e);
    return Response.json({ error: msg.slice(0, 400) }, { status: 502 });
  }
}
