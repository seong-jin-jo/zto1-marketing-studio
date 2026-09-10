import { effectiveTenantId } from "@/lib/tenant-auth";

/**
 * POST /api/studio/estimate — 만들기 전 비용과 시간을 산정한다.
 *
 * 왜 있나. 사업계획 v0.4 §7 이 "원가는 생성 호출에서 난다. 그래서 만들기 전에 비용을
 * 보여 주고 승인받는 관문과 재시도 상한이 필요하다"고 못박았고, §10 의 정할 것 표에서
 * "만들기 전 비용 승인 관문 = 예"로 확정했다. 승인 없이 바로 부르면 실패가 그대로
 * 비용이 된다. 응답 모양은 studio 서비스 계약 v3 의 estimate 를 따라, 나중에 그 서비스로
 * 옮겨도 화면을 다시 만들지 않게 한다.
 *
 * 수치 근거도 사업계획 §7 이다. 생성 호출 실측이 건당 5크레딧에서 95크레딧이고
 * 렌더는 1분에 약 0.017달러다. 가정은 응답에 그대로 실어 사용자가 판단할 수 있게 한다.
 */
type MediaKind = "card" | "video";

const CREDIT_KRW = 30; // 사업계획 §7 실측 구간을 원화로 환산한 보수적 상한 가정

export async function POST(request: Request) {
  const body = await request.json().catch(() => ({}));
  const tenantId = await effectiveTenantId(request, body.tenant_id);
  if (!tenantId) return Response.json({ error: "테넌트를 식별할 수 없습니다." }, { status: 401 });

  const kind: MediaKind = body.kind === "video" ? "video" : "card";
  const count = Math.max(1, Math.min(10, Number(body.count) || 1));

  // 카드뉴스는 장당 이미지 1회, 영상은 이미지 1회에 영상 호출 1회가 더 붙는다.
  const callsPerItem = kind === "video" ? 2 : 1;
  const minCredits = 5 * callsPerItem * count;
  const maxCredits = 95 * callsPerItem * count;

  return Response.json({
    ok: true,
    kind,
    count,
    currency: "KRW",
    min_minor: minCredits * CREDIT_KRW,
    max_minor: maxCredits * CREDIT_KRW,
    recommended_ceiling_minor: maxCredits * CREDIT_KRW,
    estimated_seconds_min: kind === "video" ? 60 : 15,
    estimated_seconds_max: kind === "video" ? 300 : 60,
    assumptions: [
      "생성 호출 실측 구간 건당 5에서 95 크레딧(사업계획 v0.4 7절)",
      `크레딧당 ${CREDIT_KRW}원으로 보수적으로 환산`,
      kind === "video" ? "영상 한 편은 이미지 1회와 영상 1회를 부른다" : "카드뉴스는 장당 이미지 1회를 부른다",
      "실패한 호출도 비용이 발생한다",
    ],
  });
}
