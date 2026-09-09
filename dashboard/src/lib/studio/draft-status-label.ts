/**
 * 작업물 상태를 회장 언어로 옮긴다.
 *
 * 2026-09-10 실측: 작업물 전체 목록이 상태를 draft·published·partial 로 **영어 그대로**
 * 보여 주고 있었다. 한국어 화면에 영어가 튀어나온 것이고, 더 나쁜 것은 partial 이 무슨
 * 뜻인지 이 화면만 보고는 알 수 없다는 것이다. 일부 채널만 나갔다는 뜻인데, 그 말을 안
 * 해 주면 사용자는 다 나간 줄 알고 넘어간다.
 *
 * 오늘 같은 결함을 연결 상태 표기에서도 고쳤다(Connected). 화면에 영어가 남아 있으면
 * 그 자리는 아직 회장께 보여 줄 상태가 아니다.
 */
const DRAFT_STATUS_LABEL: Record<string, string> = {
  draft: "작성 중",
  published: "발행함",
  partial: "일부만 나감",
  scheduled: "예약함",
  stopped: "멈춤",
};

export function draftStatusLabel(status: unknown): string {
  const key = typeof status === "string" ? status : "";
  // 모르는 상태를 영어로 흘리느니 "작성 중" 이라고 말한다. 목록에서 상태 한 칸이
  // 틀리는 것보다 영어가 튀어나오는 것이 더 나쁘다.
  return DRAFT_STATUS_LABEL[key] ?? (key ? "작성 중" : "작성 중");
}
