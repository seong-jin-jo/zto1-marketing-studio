import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { defaultAccountEligibility } from "@/lib/channel-accounts";

// 2026-09-08 회장 실사용 재발 방지.
// X 채널 화면에서 머리말은 "연결됨", 바로 아래 유일한 계정은 "재연결 필요" 라고 동시에 적혀
// 있었다. 같은 사실에 규칙이 둘이었다 — 머리말(channel-connection.ts)은 갱신 토큰이 있으면
// 살아있다고 봤고, 계정 카드(channel-accounts.ts)는 만료 시각만 보고 죽었다고 봤다.
// 사용자에게는 어느 쪽이 참인지 알 방법이 없고, 연결 화면이 스스로 모순되면 "연결됐다" 는
// 말 전체를 믿을 수 없게 된다.
// 계약: 연결 판정 규칙은 defaultAccountEligibility 하나뿐이고, 다른 곳은 그것을 부르기만 한다.
const src = (path: string) => readFileSync(resolve(__dirname, "../../src", path), "utf8");

const HOUR = 3600_000;

describe("연결 판정 규칙은 하나다", () => {
  it("채널 머리말 판정이 자기 규칙을 갖지 않고 정본 함수를 부른다", () => {
    const text = src("lib/channel-connection.ts");
    expect(text).toContain("defaultAccountEligibility(");
    // 예전에 여기 있던 자기 규칙의 흔적이 남아 있으면 또 갈라진다.
    expect(text).not.toContain("DURABLE_EXPIRY_REQUIRED");
    expect(text).not.toMatch(/Date\.parse\(row\.token_expires_at\)/);
  });

  it("계정 카드도 같은 정본 함수로 상태를 정한다", () => {
    const text = src("lib/channel-accounts.ts");
    expect(text).toContain('connection_state: eligibility.eligible ? "connected" : "reconnect"');
    // 갱신 토큰 유무를 넘기지 않으면 머리말과 다시 갈라진다.
    expect(text).toContain("row.token_expires_at, has_refresh");
  });

  it("만료됐지만 갱신 토큰이 있으면 살아있다고 본다", () => {
    const past = new Date(Date.now() - HOUR).toISOString();
    expect(defaultAccountEligibility("x", "active", past, true).eligible).toBe(true);
    expect(defaultAccountEligibility("x", "active", past, false).eligible).toBe(false);
    expect(defaultAccountEligibility("x", "active", past, false).blockedReason).toBe("token_expired");
  });

  it("해제·만료 표시된 계정은 갱신 토큰이 있어도 살아있다고 하지 않는다", () => {
    const future = new Date(Date.now() + HOUR).toISOString();
    expect(defaultAccountEligibility("x", "revoked", future, true).eligible).toBe(false);
    expect(defaultAccountEligibility("x", "expired", future, true).eligible).toBe(false);
  });

  it("Meta 계열은 만료 시각이 없으면 살아있다고 하지 않는다", () => {
    for (const p of ["threads", "instagram", "facebook"]) {
      expect(defaultAccountEligibility(p, "active", null, true).eligible).toBe(false);
    }
    expect(defaultAccountEligibility("x", "active", null, false).eligible).toBe(true);
  });
});
