import { generateText, sharedAiApprovalErrorResponse, sharedGenerationQuotaErrorResponse } from "@/lib/anthropic";
import { effectiveTenantId } from "@/lib/tenant-auth";

export async function POST(request: Request) {
  const data = await request.json();
  const channel = (data.channel || "").trim();
  const industry = (data.industry || "").trim();
  const currentGuide = (data.currentGuide || "").trim();

  if (!channel) return Response.json({ error: "channel required" }, { status: 400 });
  const tenantId = await effectiveTenantId(request, typeof data.tenant_id === "string" ? data.tenant_id : null);
  if (!tenantId) return Response.json({ error: "작업 공간을 식별할 수 없습니다." }, { status: 401 });

  // 현재 가이드가 있으면 참고해서 개선, 없으면 새로 작성
  const context = currentGuide
    ? `현재 가이드:\n${currentGuide.slice(0, 500)}\n\n위 가이드를 개선/보완하라.`
    : `새로 작성하라.${industry ? ` 업종: ${industry}` : ""}`;

  const msg = `${channel} 채널의 콘텐츠 가이드를 제안하라.

${context}

규칙:
- [목적] 섹션: 채널의 목표 (유입, 브랜딩, 전환 등)
- [타겟] 섹션: 주 대상 고객층
- [톤] 섹션: 글쓰기 톤앤매너 (길이, 이모지 사용, 말투)
- [유형] 섹션: 콘텐츠 유형 (정보성/공감형/일상/반응파악/유입유도)
- [주제] 섹션: 다룰 주제 키워드
- 100% 한국어
- 실제 마케팅에 바로 사용 가능한 수준

출력 형식 (JSON만, 다른 텍스트 없이):
{"guide": "전체 가이드 텍스트"}`;

  try {
    const result = (await generateText(msg, tenantId)).trim();

    const jsonMatch = result.match(/\{[\s\S]*"guide"[\s\S]*\}/);
    if (jsonMatch) {
      const parsed = JSON.parse(jsonMatch[0]);
      return Response.json({ success: true, guide: parsed.guide });
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
