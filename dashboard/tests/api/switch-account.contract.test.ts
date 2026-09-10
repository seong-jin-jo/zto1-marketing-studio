import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

// 2026-09-09 회장 지적 재발 방지: "X 는 다른 계정으로 로그인하는게 왜 없음."
// 화면에는 "다른 계정으로 연결하고 싶어요" 가 있었지만 그것은 안내문이었다. 누르면
// "먼저 로그아웃하세요" 라는 설명이 펼쳐질 뿐 계정을 바꾸는 동작이 없었다.
// 사용자에게 그 둘은 같아 보이지 않는다. 시키기만 하고 해 주지 않으면 없는 기능이다.
// 계약: 그 자리는 실제로 연결을 시작하고, 제공자에게 계정 선택 화면을 강제로 띄우라고 말한다.
const src = (p: string) => readFileSync(resolve(__dirname, "../../src", p), "utf8");

describe("다른 계정으로 연결", () => {
  it("화면이 안내문이 아니라 연결을 시작한다", () => {
    const text = src("components/channel/SocialConnectButton.tsx");
    expect(text).toContain("다른 계정으로 연결하기");
    expect(text).toContain("connect(true)");
    expect(text).toContain("switch_account=1");
  });

  it("서버가 제공자별 계정 선택 강제 파라미터를 넣는다", () => {
    const text = src("app/api/connect/[provider]/route.ts");
    // 제공자마다 이름이 다르다. 하나로 뭉뚱그리면 그 제공자에서는 안 먹는다.
    expect(text).toContain('force_login');            // X
    expect(text).toContain('prompt: "select_account'); // Google/YouTube
    expect(text).toContain('auth_type: "reauthenticate"'); // Meta 계열
  });

  it("평소 연결에는 강제 파라미터를 붙이지 않는다", () => {
    const text = src("app/api/connect/[provider]/route.ts");
    // 조건 없이 붙이면 매번 계정 선택 화면이 떠서 정상 연결이 번거로워진다.
    expect(text).toMatch(/searchParams\.get\("switch_account"\) === "1"/);
  });
});
