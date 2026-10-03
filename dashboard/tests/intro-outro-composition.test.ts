import { describe, expect, it } from "vitest";
import {
  INTRO_OUTRO_COMPS,
  DEFAULT_BRAND_PROPS,
  COMP_WIDTH,
  COMP_HEIGHT,
  COMP_FPS,
} from "../remotion/IntroOutroComps";

// 2026-10-02 Remotion 인트로/아웃트로 도입 — 컴포지션 카탈로그와 기본 props 계약 단위 테스트.
// PRD §8.3: 1080x1920, 30fps, 1.5~3초(45~90프레임), 인트로 2종 + 아웃트로 2종.
describe("INTRO_OUTRO_COMPS 카탈로그", () => {
  it("1080x1920 30fps 를 쓴다", () => {
    expect(COMP_WIDTH).toBe(1080);
    expect(COMP_HEIGHT).toBe(1920);
    expect(COMP_FPS).toBe(30);
  });

  it("인트로 2종 + 아웃트로 2종을 노출한다", () => {
    const ids = Object.keys(INTRO_OUTRO_COMPS);
    expect(ids).toEqual(
      expect.arrayContaining(["intro-logo-reveal", "intro-title-card", "outro-logo-reveal", "outro-title-card"]),
    );
    expect(ids.filter((id) => id.startsWith("intro-"))).toHaveLength(2);
    expect(ids.filter((id) => id.startsWith("outro-"))).toHaveLength(2);
  });

  it("각 컴포지션 길이가 1.5~3초(45~90프레임) 안에 있다", () => {
    for (const [id, comp] of Object.entries(INTRO_OUTRO_COMPS)) {
      expect(comp.durationInFrames, id).toBeGreaterThanOrEqual(45);
      expect(comp.durationInFrames, id).toBeLessThanOrEqual(90);
    }
  });

  it("brandName 기본값이 비어있지 않다(logoUrl 없어도 안전 렌더)", () => {
    expect(DEFAULT_BRAND_PROPS.brandName.length).toBeGreaterThan(0);
    expect(DEFAULT_BRAND_PROPS.logoUrl).toBe("");
  });
});
