/**
 * 발행실의 "연결됨" 판정.
 *
 * 2026-10-01 실측(회장 지적) + 2026-10-01 리뷰 BLOCK 재발견: 발행실 도우미 문구
 * ("아직 연결 안 된 곳: X, Facebook, Shorts, Reels, TikTok")가 사이드바의 "연결됨"
 * 표시(X·YouTube·TikTok)와 모순됐다. 원인은 studio/page.tsx 안에서 "연결됨" 판정이
 * 실제로는 두 가지 다른 질문을 하나로 섞어서 나왔기 때문이다.
 *
 * - "계정이 이어져 있는가" (connected) — 사이드바·publishTargets 가 쓰는 엄격한 기준
 *   (connectionState === "connected").
 * - "지금 당장 이 내용을 이 채널에 올릴 수 있는가" (disabledReason, 예: 영상 없음·본문
 *   미검증) — publishGuard 가 채널별 카드에서 이미 따로 보여 준다.
 *
 * 계정을 연결해 놓고 영상만 아직 안 올렸을 뿐인 채널을 "아직 연결 안 된 곳" 목록에 넣는
 * 것은 거짓말이다. "연결됨" 은 오직 첫째 질문(connected)만 본다.
 */
export interface ChannelReadiness {
  /** usableAccounts(platform).length > 0 — 계정이 실제로 이어져 있는가. */
  connected: boolean;
  /** publishGuard(platform).disabledReason — "지금 당장" 못 올리는 사유. 연결 여부와 무관. */
  disabledReason?: string;
}

/**
 * 연결된 채널만 고른다. disabledReason 은 연결 판정에 영향을 주지 않는다 — 그건 채널별
 * 카드가 따로 말한다.
 *
 * "아직 연결 안 된 곳" 문구에만 쓴다. "전부 고르기"·선택 카운트·비활성 비교에 이 함수를
 * 쓰면 안 된다 — 2026-10-01 재리뷰 BLOCK: connectedOnlyTargets 를 "전부 고르기"에도
 * 썼더니 연결은 됐지만 지금 발행 불가(영상 없음·본문 미검증)한 채널까지 고를 수 있다고
 * 버튼이 우겼다("연결된 3곳을 모두 골랐습니다"라면서 실제 선택은 1곳). 그 자리는
 * publishableTargets 를 써야 한다.
 */
export function connectedOnlyTargets<T extends string>(
  readiness: ReadonlyMap<T, ChannelReadiness>,
): T[] {
  return [...readiness.entries()]
    .filter(([, entry]) => entry.connected)
    .map(([platform]) => platform);
}

/**
 * 연결됐고 disabledReason 도 없는, 지금 당장 실제로 고를 수 있는 채널만 고른다.
 * "전부 고르기" 버튼·선택 카운트 알림·비활성 비교는 이 함수를 써야 한다.
 */
export function publishableTargets<T extends string>(
  readiness: ReadonlyMap<T, ChannelReadiness>,
): T[] {
  return [...readiness.entries()]
    .filter(([, entry]) => entry.connected && !entry.disabledReason)
    .map(([platform]) => platform);
}
