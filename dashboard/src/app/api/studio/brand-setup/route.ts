import { UPSTREAM_FAILED } from "@/lib/api-failure";
import { withTenant } from "@/lib/db";
import { effectiveTenantId } from "@/lib/tenant-auth";
import { generateText, sharedGenerationQuotaErrorResponse, sharedAiApprovalErrorResponse } from "@/lib/anthropic";

// GET /api/studio/brand-setup?tenant_id=... — 워크스페이스 브랜드 가이드 조회
export async function GET(request: Request) {
  const tenantId = await effectiveTenantId(request, new URL(request.url).searchParams.get("tenant_id"));
  if (!tenantId) return Response.json({ error: "tenant_id required" }, { status: 400 });
  try {
    const [row] = await withTenant(tenantId, (sql) => sql`
      SELECT prompt_guide, visual_rules, source, synced_at
      FROM brand_guides WHERE tenant_id = ${tenantId}`);
    return Response.json({ guide: row || null });
  } catch (e) {
    return Response.json({ error: String(e) }, { status: 500 });
  }
}

// POST /api/studio/brand-setup — 6문항 → generateText 증류 → brand_guides upsert.
// generateText는 테넌트가 등록한 Anthropic 키 우선(고객 과금·격리), 없으면 claude -p 폴백(내부/운영자).
// body: { tenant_id, answers: { service, target, tone, banned, hooks, visual } }
export async function POST(request: Request) {
  const __b = await request.json();
  const { answers } = __b;
  const tenant_id = await effectiveTenantId(request, __b.tenant_id);
  if (!tenant_id || !answers) {
    return Response.json({ error: "tenant_id, answers required" }, { status: 400 });
  }
  const a = answers as Record<string, string>;
  const prompt = `너는 브랜드 전략가다. 아래 답변을 SNS 마케팅 콘텐츠 생성용 "브랜드 가이드"로 증류하라.

서비스: ${a.service || ""}
타겟: ${a.target || ""}
톤/보이스: ${a.tone || ""}
금지어/금지표현: ${a.banned || ""}
핵심 hook/메시지: ${a.hooks || ""}
비주얼(색·서체·분위기): ${a.visual || ""}

출력은 JSON만(다른 텍스트 없이):
{
 "prompt_guide": "콘텐츠 생성 시 주입할 브랜드 톤 가이드 (한국어, 5~10줄: 보이스·톤·페르소나·핵심 hook·금지표현 명시. 카피라이터가 바로 쓸 수 있게 구체적으로)",
 "visual_rules": {"colors": ["#hex 또는 색이름", ...], "typography": "서체/타이포 느낌", "forbidden": ["금지 비주얼 요소", ...]}
}`;
  try {
    const stdout = await generateText(prompt, tenant_id);
    const m = stdout.match(/\{[\s\S]*\}/);
    if (!m) return Response.json({ ok: false, error: "생성기가 알아볼 수 없는 형식으로 답했습니다. 잠시 후 다시 시도해 주세요.", raw: stdout.slice(-400) }, { status: UPSTREAM_FAILED });
    const parsed = JSON.parse(m[0]) as { prompt_guide?: string; visual_rules?: Record<string, unknown> };
    await withTenant(tenant_id, (sql) => sql`
      INSERT INTO brand_guides (tenant_id, prompt_guide, visual_rules, source, synced_at)
      VALUES (${tenant_id}, ${parsed.prompt_guide || ""}, ${sql.json((parsed.visual_rules ?? {}) as Parameters<typeof sql.json>[0])}, 'wizard', now())
      ON CONFLICT (tenant_id) DO UPDATE
        SET prompt_guide = EXCLUDED.prompt_guide,
            visual_rules = EXCLUDED.visual_rules,
            source = 'wizard',
            synced_at = now()`);
    return Response.json({ ok: true, guide: { prompt_guide: parsed.prompt_guide, visual_rules: parsed.visual_rules } });
  } catch (e) {
    const approvalResponse = sharedAiApprovalErrorResponse(e);
    if (approvalResponse) return approvalResponse;
    const quotaResponse = sharedGenerationQuotaErrorResponse(e);
    if (quotaResponse) return quotaResponse;
    const msg = e instanceof Error ? e.message : String(e);
    return Response.json({ ok: false, error: msg.slice(0, 400) }, { status: UPSTREAM_FAILED });
  }
}
