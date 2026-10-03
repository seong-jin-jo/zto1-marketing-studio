/**
 * TikTok Content Posting API — 상업 콘텐츠 공개(Commercial Content Disclosure)와
 * 음악 이용 확인(Music Usage Confirmation) 결정 로직.
 *
 * 근거: https://developers.tiktok.com/doc/content-sharing-guidelines (2026-10-03 조회).
 * - "Content Disclosure Setting"은 "Your brand"(오가닉 자사 홍보)와 "Branded content"
 *   (유료 파트너십) 두 체크박스로 구성된다.
 * - Branded content를 공개하면 "it can only be configured with visibility as
 *   public/friends" — 전체공개·친구공개만 가능하고 비공개(SELF_ONLY)는 안 된다.
 * - 음악 이용 확인 문구는 조합에 따라 달라진다: 상업 공개가 전혀 없으면 "By posting,
 *   you agree to TikTok's Music Usage Confirmation."이고, Branded content가 하나라도
 *   켜지면 "By posting, you agree to TikTok's Branded Content Policy and Music Usage
 *   Confirmation."이 된다.
 * - 댓글·듀엣·스티치 상호작용 토글은 "should be no default value... none should be
 *   checked by default" — 기본값 없이 전부 꺼진 채로 시작해 사용자가 직접 켠다.
 *
 * ⚠️ 이 모듈은 화면의 결정 로직만 다룬다. TikTok Content Posting API로 실제 전송되는
 * 요청 필드명·서버측 검증(/api/video/publish route.ts)은 아직 이 디스클로저를 받지
 * 않는다 — 화면 계약(studio 발행실 + videos 페이지)을 videos 페이지와 맞추는 것이
 * 이번 라운드의 범위이고, 서버가 실제로 TikTok API에 이 값을 실어 보내는 배선은
 * 별도 작업으로 남긴다(지어내지 않는다).
 */

export interface TikTokDisclosureState {
  disclosureEnabled: boolean;
  brandOrganic: boolean;
  brandContent: boolean;
}

export const TIKTOK_PRIVATE_PRIVACY_LEVEL = "SELF_ONLY";

/**
 * 상업 콘텐츠 공개를 켰는데 "내 브랜드"도 "유료 파트너십"도 안 고르면 TikTok이
 * 요구하는 공개 내용이 비어버린다(가이드라인: 둘 중 최소 하나는 골라야 공개가 의미를
 * 갖는다). 공개를 안 켰으면 애초에 물을 것이 없다.
 */
export function disclosureValidationError(state: TikTokDisclosureState): string | null {
  if (!state.disclosureEnabled) return null;
  if (!state.brandOrganic && !state.brandContent) {
    return "상업 콘텐츠 공개를 켰으면 내 브랜드 홍보 또는 유료 파트너십 중 하나를 골라주세요.";
  }
  return null;
}

/**
 * 유료 파트너십(브랜드 콘텐츠)을 공개하면 비공개(SELF_ONLY)로는 올릴 수 없다
 * (가이드라인: "public/friends"만 허용). 그 외 공개 범위는 창작자 계정이 쓸 수
 * 있는 목록을 그대로 돌려준다.
 */
export function allowedPrivacyLevels(
  state: TikTokDisclosureState,
  creatorLevels: readonly string[],
): string[] {
  if (state.disclosureEnabled && state.brandContent) {
    return creatorLevels.filter((level) => level !== TIKTOK_PRIVATE_PRIVACY_LEVEL);
  }
  return [...creatorLevels];
}

/**
 * 디스클로저 상태가 바뀌어 지금 고른 공개 범위가 더 이상 허용 목록에 없으면(예:
 * SELF_ONLY를 고른 채로 브랜드 콘텐츠를 켬) 그 값을 지운다. 절대 다른 값으로
 * 자동 대체하지 않는다 — "사용자가 직접 고른다" 원칙은 전환 중에도 유지된다.
 */
export function resolvePrivacyAfterDisclosureChange(
  current: string,
  state: TikTokDisclosureState,
  creatorLevels: readonly string[],
): string {
  const allowed = allowedPrivacyLevels(state, creatorLevels);
  return allowed.includes(current) ? current : "";
}

/**
 * 공개 조합별 음악 이용 확인 문구. TikTok이 요구하는 영문 원문을 그대로 두고(법적
 * 문구는 임의 번역하지 않는다) 한국어 안내를 덧붙인다.
 */
export function musicUsageConfirmationText(state: TikTokDisclosureState): string {
  if (state.disclosureEnabled && state.brandContent) {
    return "게시하면 TikTok 브랜드 콘텐츠 정책과 음악 이용 정책에 동의하는 것으로 간주됩니다. (By posting, you agree to TikTok's Branded Content Policy and Music Usage Confirmation.)";
  }
  return "게시하면 TikTok 음악 이용 정책에 동의하는 것으로 간주됩니다. (By posting, you agree to TikTok's Music Usage Confirmation.)";
}
