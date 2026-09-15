import { generateText, sharedAiApprovalErrorResponse, sharedGenerationQuotaErrorResponse } from "@/lib/anthropic";
import { effectiveTenantId } from "@/lib/tenant-auth";
import { parseCardOutlineOutput } from "@/lib/ai-json-contract";

export async function POST(request: Request) {
  const data = await request.json();
  const title = (data.title || "").trim();
  if (!title) return Response.json({ error: "title required" }, { status: 400 });
  const tenantId = await effectiveTenantId(request, typeof data.tenant_id === "string" ? data.tenant_id : null);
  if (!tenantId) return Response.json({ error: "작업 공간을 식별할 수 없습니다." }, { status: 401 });

  const msg = `다음 주제로 Instagram 카드뉴스 슬라이드 초안을 만들어라: "${title}"

규칙:
- 슬라이드 4~5장 분량
- 각 슬라이드는 핵심 포인트 1개
- 짧고 임팩트 있게 (각 슬라이드 2~3줄)
- 100% 한국어
- 마지막 슬라이드는 CTA (프로필 링크 유도)

출력 형식 (JSON만, 다른 텍스트 없이):
{"slides": ["슬라이드1 내용", "슬라이드2 내용", ...], "caption": "Instagram 캡션", "hashtags": ["태그1", "태그2", ...]}`;

  try {
    const parsed = parseCardOutlineOutput(await generateText(msg, tenantId));
    if (parsed) return Response.json({ success: true, ...parsed });
    return Response.json({ success: false, code: "AI_OUTPUT_INVALID", error: "AI 카드뉴스 응답 형식이 올바르지 않습니다." }, { status: 502 });
  } catch (e) {
    const approval = sharedAiApprovalErrorResponse(e);
    if (approval) return approval;
    const quota = sharedGenerationQuotaErrorResponse(e);
    if (quota) return quota;
    const msg2 = e instanceof Error ? e.message : String(e);
    if (msg2.includes("TIMEOUT") || msg2.includes("timed out")) {
      return Response.json({ error: "AI outline generation timed out (2분 제한)" }, { status: 504 });
    }
    return Response.json({ error: msg2.slice(0, 500) }, { status: 500 });
  }
}
