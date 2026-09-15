import { generateText, sharedAiApprovalErrorResponse, sharedGenerationQuotaErrorResponse } from "@/lib/anthropic";
import { effectiveTenantId } from "@/lib/tenant-auth";

export async function POST(request: Request) {
  const data = await request.json();
  const channel = (data.channel || "").trim();
  const industry = (data.industry || "").trim();
  const currentKeywords = (data.currentKeywords || []) as string[];

  if (!channel) return Response.json({ error: "channel required" }, { status: 400 });
  const tenantId = await effectiveTenantId(request, typeof data.tenant_id === "string" ? data.tenant_id : null);
  if (!tenantId) return Response.json({ error: "작업 공간을 식별할 수 없습니다." }, { status: 401 });

  const context = currentKeywords.length > 0
    ? `현재 키워드: ${currentKeywords.slice(0, 20).join(", ")}\n\n위 키워드를 참고하여 추가 키워드를 제안하라.`
    : `새로 제안하라.${industry ? ` 업종: ${industry}` : ""}`;

  const msg = `${channel} 채널의 검색 키워드를 제안하라.

${context}

규칙:
- 트렌드 수집 + 콘텐츠 생성에 사용할 키워드
- 카테고리별로 분류 (핵심/트렌드/롱테일/경쟁사)
- 15~25개 제안
- 100% 한국어

출력 형식 (JSON만, 다른 텍스트 없이):
{"keywords": ["키워드1", "키워드2", ...]}`;

  try {
    const result = (await generateText(msg, tenantId)).trim();

    const jsonMatch = result.match(/\{[\s\S]*"keywords"[\s\S]*\}/);
    if (jsonMatch) {
      const parsed = JSON.parse(jsonMatch[0]);
      return Response.json({ success: true, keywords: parsed.keywords });
    }
    return Response.json({ error: "AI 응답에서 JSON을 추출할 수 없음", raw: result.slice(-300) }, { status: 500 });
  } catch (e) {
    const approval = sharedAiApprovalErrorResponse(e);
    if (approval) return approval;
    const quota = sharedGenerationQuotaErrorResponse(e);
    if (quota) return quota;
    const msg2 = e instanceof Error ? e.message : String(e);
    if (msg2.includes("TIMEOUT") || msg2.includes("timed out")) {
      return Response.json({ error: "AI 제안 생성 타임아웃 (2분 제한)" }, { status: 504 });
    }
    return Response.json({ error: msg2.slice(0, 500) }, { status: 500 });
  }
}
