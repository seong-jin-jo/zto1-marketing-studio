import { describe, expect, it } from "vitest";
import {
  allowedPrivacyLevels,
  disclosureValidationError,
  musicUsageConfirmationText,
  resolvePrivacyAfterDisclosureChange,
} from "@/lib/studio/tiktok-disclosure";

// 2026-10-03 독립 리뷰 m3: TikTok Content Sharing Guidelines
// (https://developers.tiktok.com/doc/content-sharing-guidelines, 2026-10-03 조회) 준수.
const LEVELS = ["PUBLIC_TO_EVERYONE", "MUTUAL_FOLLOW_FRIENDS", "FOLLOWER_OF_CREATOR", "SELF_ONLY"];

describe("disclosureValidationError", () => {
  it("공개를 안 켰으면 항상 통과한다", () => {
    expect(disclosureValidationError({ disclosureEnabled: false, brandOrganic: false, brandContent: false })).toBeNull();
  });

  it("공개를 켰는데 둘 다 안 고르면 거절한다", () => {
    expect(disclosureValidationError({ disclosureEnabled: true, brandOrganic: false, brandContent: false }))
      .toMatch(/내 브랜드|유료 파트너십/);
  });

  it("하나라도 고르면 통과한다", () => {
    expect(disclosureValidationError({ disclosureEnabled: true, brandOrganic: true, brandContent: false })).toBeNull();
    expect(disclosureValidationError({ disclosureEnabled: true, brandOrganic: false, brandContent: true })).toBeNull();
  });
});

describe("allowedPrivacyLevels — 유료 파트너십은 비공개를 뺀다", () => {
  it("공개를 안 켰으면 창작자 전체 목록 그대로다", () => {
    expect(allowedPrivacyLevels({ disclosureEnabled: false, brandOrganic: false, brandContent: false }, LEVELS)).toEqual(LEVELS);
  });

  it("내 브랜드(오가닉)만이면 비공개도 그대로 허용한다", () => {
    expect(allowedPrivacyLevels({ disclosureEnabled: true, brandOrganic: true, brandContent: false }, LEVELS)).toEqual(LEVELS);
  });

  it("유료 파트너십(브랜드 콘텐츠)이면 SELF_ONLY(비공개)를 뺀다", () => {
    const result = allowedPrivacyLevels({ disclosureEnabled: true, brandOrganic: false, brandContent: true }, LEVELS);
    expect(result).not.toContain("SELF_ONLY");
    expect(result).toContain("PUBLIC_TO_EVERYONE");
    expect(result).toContain("MUTUAL_FOLLOW_FRIENDS");
  });
});

describe("resolvePrivacyAfterDisclosureChange — 허용 목록 밖이면 지우되 대신 고르지 않는다", () => {
  it("이미 고른 값이 여전히 허용되면 그대로 둔다", () => {
    expect(resolvePrivacyAfterDisclosureChange("PUBLIC_TO_EVERYONE", { disclosureEnabled: true, brandOrganic: false, brandContent: true }, LEVELS))
      .toBe("PUBLIC_TO_EVERYONE");
  });

  it("비공개를 고른 채로 유료 파트너십을 켜면 값을 지운다(다른 값으로 대체하지 않는다)", () => {
    expect(resolvePrivacyAfterDisclosureChange("SELF_ONLY", { disclosureEnabled: true, brandOrganic: false, brandContent: true }, LEVELS))
      .toBe("");
  });

  it("아무것도 안 고른 상태(\"\")는 그대로 \"\"다", () => {
    expect(resolvePrivacyAfterDisclosureChange("", { disclosureEnabled: true, brandOrganic: false, brandContent: true }, LEVELS))
      .toBe("");
  });
});

describe("musicUsageConfirmationText — TikTok이 요구하는 영문 원문을 조합별로 그대로 보존한다", () => {
  it("상업 공개가 없으면 기본 음악 이용 확인 문구다", () => {
    expect(musicUsageConfirmationText({ disclosureEnabled: false, brandOrganic: false, brandContent: false }))
      .toContain("By posting, you agree to TikTok's Music Usage Confirmation.");
  });

  it("내 브랜드(오가닉)만이면 기본 문구와 같다(브랜드 콘텐츠 정책 문구는 유료 파트너십에만 붙는다)", () => {
    const text = musicUsageConfirmationText({ disclosureEnabled: true, brandOrganic: true, brandContent: false });
    expect(text).toContain("By posting, you agree to TikTok's Music Usage Confirmation.");
    expect(text).not.toContain("Branded Content Policy");
  });

  it("유료 파트너십이 있으면 브랜드 콘텐츠 정책 문구가 추가된다", () => {
    expect(musicUsageConfirmationText({ disclosureEnabled: true, brandOrganic: false, brandContent: true }))
      .toContain("By posting, you agree to TikTok's Branded Content Policy and Music Usage Confirmation.");
  });
});
