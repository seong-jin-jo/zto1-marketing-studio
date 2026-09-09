/**
 * 성과를 실제로 재 올 수 있는 채널.
 *
 * 2026-09-09 회장 지적("성과 수집이 Threads 만") 후속.
 * POST /api/metrics 는 Threads 만 수집한다. 다른 채널은 수집 시도 자체를 안 하므로
 * 서버가 남기는 "측정 불가" 표식도 안 생긴다. 그래서 그 글들은 화면에서 영원히
 * "미수집" 으로 남는다.
 *
 * "미수집" 과 "측정 미지원" 은 다르다. 앞은 기다리면 채워지고, 뒤는 우리가 그 채널의
 * 수집을 만들기 전까지 영원히 안 채워진다. 같은 말로 쓰면 사용자는 무한정 기다린다.
 * 조용히 비워 두는 것이 가장 나쁘다(ADR-007).
 *
 * 새 채널의 수집을 만들면 여기 한 줄을 추가한다. 화면은 이 목록만 본다.
 */
export const METRICS_COLLECTED_PLATFORMS: ReadonlySet<string> = new Set(["threads", "x", "instagram", "facebook", "youtube", "shorts"]);

export function isMetricsCollected(platform: string | null | undefined): boolean {
  return Boolean(platform && METRICS_COLLECTED_PLATFORMS.has(platform));
}

/** 숫자가 비었을 때 그 자리에 적을 말. 왜 비었는지로 갈라 적는다. */
export function emptyMetricLabel(platform: string | null | undefined, blocked: unknown): string {
  if (!isMetricsCollected(platform)) return "측정 미지원";
  return blocked ? "측정 불가" : "미수집";
}
