/**
 * 영상의 대문 사진(커버)을 어느 시점으로 할지.
 *
 * 2026-09-09 회장 지적: "영상에서는 뭘 대문 썸네일로 지정할지도 세팅해야하지않나 API있지."
 * 실제로 있었고 우리가 안 쓰고 있었다. 지정하지 않으면 플랫폼이 첫 프레임이나 임의 프레임을
 * 고른다. 숏폼에서 첫 프레임은 대개 아직 아무것도 안 보이는 순간이라 가장 나쁜 대문이 된다.
 *
 * 플랫폼마다 받는 방식이 다르다. 같은 값을 주더라도 이름과 단위가 다르므로 각자 변환한다.
 * - TikTok: post_info.video_cover_timestamp_ms (밀리초)
 * - Instagram Reels: thumb_offset (밀리초)
 * - YouTube: 시점으로는 못 정한다. 이미지 파일을 따로 올려야 한다(thumbnails.set).
 *   그래서 여기서는 지원하지 않는다고 정직하게 말하고, 화면도 그렇게 적는다.
 */
export const VIDEO_COVER_PLATFORMS: ReadonlySet<string> = new Set(["tiktok", "reels"]);

/** 커버 시점을 초 단위로 받는 화면 기본값. 0초는 대개 아무것도 안 보인다. */
export const DEFAULT_COVER_SECONDS = 1;

export function supportsCoverTimestamp(platform: string | null | undefined): boolean {
  return Boolean(platform && VIDEO_COVER_PLATFORMS.has(platform));
}

/**
 * 화면이 준 초를 플랫폼에 넘길 밀리초로 바꾼다.
 * 음수·NaN·터무니없이 큰 값은 기본값으로 접는다. 잘못된 값을 그대로 보내면 플랫폼이
 * 발행 자체를 거절하는데, 그 이유가 커버 때문이라는 것을 화면에서 알 길이 없다.
 */
export function coverTimestampMs(seconds: unknown): number {
  // Number(null) 은 0 이고 Number("") 도 0 이다. 값이 없는 것을 "0초" 로 읽으면 첫 프레임이
  // 대문이 되는데, 그것이 바로 피하려던 상황이다. 없는 값은 없는 값으로 다룬다.
  if (seconds === null || seconds === undefined || seconds === "") return DEFAULT_COVER_SECONDS * 1000;
  const value = typeof seconds === "number" ? seconds : Number(seconds);
  if (!Number.isFinite(value) || value < 0 || value > 600) return DEFAULT_COVER_SECONDS * 1000;
  return Math.round(value * 1000);
}

/** 커버 시점을 못 정하는 플랫폼에 화면이 적을 말. 침묵하지 않는다. */
export function coverUnsupportedReason(platform: string): string | null {
  if (supportsCoverTimestamp(platform)) return null;
  if (platform === "shorts" || platform === "youtube") {
    return "YouTube 는 시점 대신 대문 이미지를 따로 올려야 합니다. 지금은 YouTube 가 자동으로 고릅니다.";
  }
  return null;
}
