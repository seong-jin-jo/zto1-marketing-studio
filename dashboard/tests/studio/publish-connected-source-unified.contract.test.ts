import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

// 2026-10-01 실측(회장 지적): 발행실 도우미 문구("아직 연결 안 된 곳: X, Facebook, Shorts,
// Reels, TikTok")가 사이드바의 "연결됨" 표시(X·YouTube·TikTok)와 모순됐다. 원인은 같은
// 화면(studio/page.tsx) 안에서도 "연결됨" 판정이 두 가지였다: publishTargets 는
// usableAccounts(connectionState === "connected")로 엄격하게 재는데, connectedTargets
// (도우미 문구·"연결된 곳 전부 고르기")는 계정 행이 하나라도 있으면(재연결 필요 상태 포함)
// 연결됨으로 셌다. 사이드바(channel-config → getChannelConnectionStates)도 엄격한 쪽과
// 같은 기준(connectionState === "connected")이다. 이 계약은 한 화면 안에서 "연결됨" 판정이
// 갈라지지 않게 고정한다.
const pageSrc = readFileSync(resolve(__dirname, "../../src/app/studio/page.tsx"), "utf8");

describe("발행실 연결 상태 판정은 단일 소스를 쓴다", () => {
  it("connectedTargets 가 usableAccounts(엄격한 connectionState==='connected')를 쓴다", () => {
    expect(pageSrc).toMatch(/const connectedTargets = bulkTargets\.filter\(\(platform\) =>\s*usableAccounts\(platform\)\.length > 0/);
  });

  it("계정 행이 있기만 하면 연결됨으로 보는 예전 방식이 되살아나지 않았다", () => {
    expect(pageSrc).not.toMatch(/const connectedTargets = bulkTargets\.filter\(\(platform\) => \(accountsByPlatform\[platform\] \|\| \[\]\)\.length > 0\);/);
  });

  it("publishTargets 와 connectedTargets 가 같은 usableAccounts 함수를 부른다", () => {
    const publishIdx = pageSrc.indexOf("const publishTargets = selectedTargets.filter");
    const connectedIdx = pageSrc.indexOf("const connectedTargets = bulkTargets.filter");
    expect(publishIdx).toBeGreaterThan(-1);
    expect(connectedIdx).toBeGreaterThan(-1);
    expect(pageSrc.slice(publishIdx, publishIdx + 200)).toContain("usableAccounts(platform)");
    expect(pageSrc.slice(connectedIdx, connectedIdx + 200)).toContain("usableAccounts(platform)");
  });
});
