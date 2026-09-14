/**
 * 채널 연결 상태를 부르는 말은 하나여야 한다.
 *
 * 2026-09-09 실측: 같은 화면 안에서 세 가지 말이 동시에 쓰였다. 사이드바의 Threads 는
 * "사용 중", 같은 사이드바의 YouTube 는 "연결됨", 설정 화면의 두 채널은 영어로
 * "Connected". **같은 상태를 세 가지로 부르면 사용자는 세 가지 상태가 있다고 읽는다.**
 * 무엇이 다른지 찾느라 시간을 쓰고, 결국 못 찾고 화면을 못 믿게 된다.
 *
 * 게다가 "Connected" 는 한국어 화면에 영어가 튀어나온 것이다. 회장 규칙(§3)이 금지하는
 * 것이 정확히 이것이다. 우리가 만든 말이든 남의 말이든, 회장 언어로 옮기지 않은 것은
 * 출고 금지다.
 *
 * 상태는 실제로 셋이다. 그러니 셋을 정확히 구분해 부른다.
 * - 연결되고 켜져 있다  → "사용 중"  (지금 여기로 나간다)
 * - 연결됐지만 꺼져 있다 → "연결됨"  (연결은 됐고 이번 발행 대상은 아니다)
 * - 연결 안 됨          → 빈 값      (배지를 달지 않는다. 없는 것에 배지를 다는 것은 소음이다)
 *
 * Threads 처럼 켜고 끄는 개념이 없는 채널은 연결되면 곧 사용 중이다.
 */
export type ChannelConnectionState = { connected?: boolean; enabled?: boolean };

export const CONNECTION_IN_USE = "사용 중";
export const CONNECTION_LINKED = "연결됨";

/** 연결 상태 한 줄. 연결 안 됨은 빈 문자열이다(배지를 달지 않는다). */
export function connectionLabel(
  state: ChannelConnectionState | undefined,
  options: { togglable?: boolean } = {},
): string {
  if (!state?.connected) return "";
  // 켜고 끄는 개념이 없는 채널은 연결이 곧 사용이다.
  if (options.togglable === false) return CONNECTION_IN_USE;
  return state.enabled === false ? CONNECTION_LINKED : CONNECTION_IN_USE;
}

/** 배지 색. 말과 색이 따로 놀면 그것도 두 가지 상태로 읽힌다. */
export function connectionBadgeClass(label: string): string {
  if (label === CONNECTION_IN_USE) return "bg-success/15 text-success";
  if (label === CONNECTION_LINKED) return "bg-accent/15 text-accent";
  return "bg-surface-2 text-subtle";
}
