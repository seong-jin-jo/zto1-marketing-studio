import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

// 2026-09-07 회장 계정 실측 재발 방지.
// 유튜브 연결이 "youtube 계정 신원 검증에 실패했습니다. 다시 연결해주세요" 로 끝났다.
// 실제 원인은 그 구글 계정에 유튜브 채널이 없는 것이었다. 재연결로는 절대 풀리지 않는데
// 화면은 재연결을 시켰고, 회장은 같은 화면을 반복해서 봤다.
// 계약: 원인을 아는 실패는 그 원인과 다음 행동을 말한다.
const src = readFileSync(resolve(__dirname, "../../src/lib/channel-accounts.ts"), "utf8");

describe("신원 검증 실패 안내", () => {
  it("유튜브 채널 없음을 별도 원인으로 구분한다", () => {
    expect(src).toContain("youtube_no_channel");
    expect(src).toContain("IdentityMissingError");
  });

  it("채널이 없을 때는 채널을 만들라고 안내한다", () => {
    expect(src).toContain("유튜브 채널이 없습니다");
    expect(src).toContain("채널을 먼저 만든 뒤");
  });

  it("원인을 모르는 실패는 종전 문구를 유지한다", () => {
    expect(src).toContain("계정 신원 검증에 실패했습니다. 다시 연결해주세요.");
  });
});
