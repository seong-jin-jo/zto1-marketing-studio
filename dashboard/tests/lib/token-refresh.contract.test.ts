import { describe, expect, it, vi } from "vitest";
import { refreshAccessToken } from "@/lib/social-connect";

// 2026-09-07 회장 계정 실측 재발 방지.
// X 접근 토큰이 오전에 만료돼 발행실 채널이 통째로 잠겼고 회장이 손으로 다시 연결했다.
// 갱신 토큰은 연결 때부터 보관하고 있었는데 그것을 쓰는 코드가 저장소에 하나도 없었다.
// 계약: 갱신 토큰이 있으면 새 접근 토큰을 받아오고, 기밀 클라이언트에는 Basic 인증을 붙인다.
vi.mock("@/lib/oauth-app-credentials", () => ({
  resolveOAuthCredentialSet: async () => ({
    complete: true,
    values: { clientId: "cid", clientSecret: "csec" },
  }),
}));

describe("refreshAccessToken", () => {
  it("갱신 토큰으로 새 접근 토큰을 받아온다", async () => {
    const fetchMock = vi.fn(async () => new Response(
      JSON.stringify({ access_token: "new-token", refresh_token: "new-refresh", expires_in: 7200 }),
      { status: 200 },
    ));
    const result = await refreshAccessToken("x", "old-refresh", fetchMock as unknown as typeof fetch);
    expect(result.accessToken).toBe("new-token");
    expect(result.refreshToken).toBe("new-refresh");
    expect(result.expiresInSeconds).toBe(7200);

    const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(url).toContain("oauth2/token");
    const body = String(init.body);
    expect(body).toContain("grant_type=refresh_token");
    expect(body).toContain("refresh_token=old-refresh");
    // X 는 기밀 클라이언트라 Basic 을 요구한다. 없으면 교환이 거절된다.
    expect((init.headers as Record<string, string>).Authorization).toMatch(/^Basic /);
  });

  it("제공자가 새 갱신 토큰을 안 주면 쓰던 것을 유지한다", async () => {
    const fetchMock = vi.fn(async () => new Response(
      JSON.stringify({ access_token: "t2", expires_in: 3600 }), { status: 200 },
    ));
    const result = await refreshAccessToken("x", "keep-me", fetchMock as unknown as typeof fetch);
    expect(result.refreshToken).toBe("keep-me");
  });

  it("실패하면 이유를 남기고 빈 토큰을 돌려준다", async () => {
    const fetchMock = vi.fn(async () => new Response(
      JSON.stringify({ error: "invalid_grant", error_description: "만료된 갱신 토큰" }), { status: 400 },
    ));
    const result = await refreshAccessToken("x", "dead", fetchMock as unknown as typeof fetch);
    expect(result.accessToken).toBe("");
    expect(result.error).toContain("만료된 갱신 토큰");
  });

  it("장기 토큰 방식 채널은 이 경로를 쓰지 않는다", async () => {
    const result = await refreshAccessToken("instagram", "r", (async () => {
      throw new Error("불려서는 안 된다");
    }) as unknown as typeof fetch);
    expect(result.accessToken).toBe("");
    expect(result.error).toContain("갱신 토큰 방식이 아닙니다");
  });
});
