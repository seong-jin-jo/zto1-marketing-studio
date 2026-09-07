import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

// 2026-09-07 회귀 재발 방지.
// 토큰 자동 갱신을 넣으면서 자격증명 조회에서 만료 검사를 뺐다. 그 결과 만료됐거나 만료
// 시각조차 없는 자격증명이 발행 경로를 그대로 통과했고, 못 쓰는 토큰을 들고 제공자까지
// 가서 502 로 죽었다. 종전이면 "연결되지 않았습니다" 로 깔끔히 닫혔을 요청이다.
// 갱신은 되살릴 수 있을 때 되살리는 장치이지 관문을 여는 장치가 아니다.
const src = readFileSync(
  resolve(__dirname, "../../src/lib/channel-accounts.ts"),
  "utf8",
);

describe("자격증명 만료 관문", () => {
  it("갱신 뒤에도 만료 상태면 자격증명을 돌려주지 않는다", () => {
    const fn = src.slice(src.indexOf("getSelectedChannelAccountCredFresh"));
    expect(fn).toContain("stillExpired");
    expect(fn).toContain("missingExpiry");
    expect(fn).toMatch(/if\s*\(stillExpired\s*\|\|\s*missingExpiry\)\s*return null;/);
  });

  it("만료 시각을 요구하는 제공자 목록을 그대로 쓴다", () => {
    const fn = src.slice(src.indexOf("getSelectedChannelAccountCredFresh"));
    expect(fn).toContain("DEFAULT_REQUIRES_EXPIRY");
  });

  it("갱신을 시도한 뒤에 관문을 통과시킨다(순서가 뒤집히면 갱신이 무의미해진다)", () => {
    const fn = src.slice(src.indexOf("getSelectedChannelAccountCredFresh"));
    expect(fn.indexOf("refreshAccessToken")).toBeLessThan(fn.indexOf("stillExpired"));
  });
});
