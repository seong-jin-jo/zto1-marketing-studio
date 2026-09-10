import { describe, it, expect } from "vitest";

// 기본계정 승격 판정 규칙을 고정한다.
// 2026-09-01 회장 계정에서 새 Threads 연결이 성공했는데도 낡은 기본계정(만료 시각 없음) 때문에
// 화면이 계속 미연결이었고 발행 대상도 죽은 계정을 가리켰다. 같은 상황을 다시 만들지 않는다.
function usableAsDefault(provider: string, status: string | null, tokenExpiresAt: string | null): boolean {
  const requiresExpiry = new Set(["threads", "instagram", "facebook"]);
  if (status !== "active") return false;
  if (!tokenExpiresAt) return !requiresExpiry.has(provider);
  const at = Date.parse(tokenExpiresAt);
  return Number.isFinite(at) && at > Date.now();
}

const future = new Date(Date.now() + 60 * 24 * 3600 * 1000).toISOString();
const past = new Date(Date.now() - 24 * 3600 * 1000).toISOString();

describe("기본계정 사용 가능 판정", () => {
  it("Meta 계열은 장기 토큰 만료 시각이 없으면 기본계정으로 쓸 수 없다", () => {
    expect(usableAsDefault("threads", "active", null)).toBe(false);
    expect(usableAsDefault("instagram", "active", null)).toBe(false);
    expect(usableAsDefault("facebook", "active", null)).toBe(false);
  });

  it("Meta 계열이라도 유효한 만료 시각이 있으면 쓸 수 있다", () => {
    expect(usableAsDefault("threads", "active", future)).toBe(true);
  });

  it("만료가 지났거나 비활성이면 쓸 수 없다", () => {
    expect(usableAsDefault("threads", "active", past)).toBe(false);
    expect(usableAsDefault("threads", "revoked", future)).toBe(false);
  });

  it("만료를 요구하지 않는 provider 는 만료 시각이 없어도 쓸 수 있다", () => {
    expect(usableAsDefault("x", "active", null)).toBe(true);
  });
});
