import { beforeEach, describe, expect, it, vi } from "vitest";

const H = vi.hoisted(() => ({
  rows: [] as Array<{ provider?: string; status: string; token_expires_at?: string | null; has_refresh?: boolean }>,
  query: "",
}));

vi.mock("@/lib/db", () => ({
  withTenant: vi.fn(async (_tenantId: string, callback: (sql: unknown) => unknown) => {
    const sql = (strings: TemplateStringsArray) => {
      H.query = Array.from(strings).join(" ");
      return Promise.resolve(H.rows);
    };
    return callback(sql);
  }),
}));

beforeEach(() => {
  H.rows = [];
  H.query = "";
});

describe("channel_accounts 연결상태 SSOT", () => {
  it.each([
    ["active", "connected"],
    ["expired", "reconnect"],
    ["revoked", "reconnect"],
  ] as const)("단일 계정 status=%s를 %s로 판정한다", async (status, expected) => {
    H.rows = [{ status }];
    const { isChannelConnected } = await import("@/lib/channel-connection");

    await expect(isChannelConnected("tenant-1", "x")).resolves.toBe(expected);
    expect(H.query).toContain("FROM channel_accounts");
    expect(H.query).toContain("is_default = true");
  });

  it("계정 행이 없으면 disconnected다", async () => {
    const { isChannelConnected } = await import("@/lib/channel-connection");
    await expect(isChannelConnected("tenant-1", "x")).resolves.toBe("disconnected");
  });

  it.each(["threads", "instagram", "facebook"])("%s active 계정은 만료시각이 없으면 reconnect다", async (provider) => {
    H.rows = [{ status: "active", token_expires_at: null, has_refresh: false }];
    const { isChannelConnected } = await import("@/lib/channel-connection");
    await expect(isChannelConnected("tenant-1", provider)).resolves.toBe("reconnect");
  });

  it("Threads active 계정은 만료시각이 미래일 때만 connected다", async () => {
    H.rows = [{ status: "active", token_expires_at: new Date(Date.now() + 60_000).toISOString(), has_refresh: false }];
    const { isChannelConnected } = await import("@/lib/channel-connection");
    await expect(isChannelConnected("tenant-1", "threads")).resolves.toBe("connected");
  });

  it("만료된 access token에 refresh token도 없으면 reconnect다", async () => {
    H.rows = [{ status: "active", token_expires_at: new Date(Date.now() - 60_000).toISOString(), has_refresh: false }];
    const { isChannelConnected } = await import("@/lib/channel-connection");
    await expect(isChannelConnected("tenant-1", "youtube")).resolves.toBe("reconnect");
  });

  it("만료된 YouTube access token에 암호화 refresh token이 있으면 connected를 유지한다", async () => {
    H.rows = [{ status: "active", token_expires_at: new Date(Date.now() - 60_000).toISOString(), has_refresh: true }];
    const { isChannelConnected } = await import("@/lib/channel-connection");
    await expect(isChannelConnected("tenant-1", "youtube")).resolves.toBe("connected");
  });

  it("벌크 판정은 누락 provider를 disconnected로 채운다", async () => {
    H.rows = [
      { provider: "x", status: "active", token_expires_at: null, has_refresh: false },
      { provider: "threads", status: "expired", token_expires_at: null, has_refresh: false },
    ];
    const { getChannelConnectionStates } = await import("@/lib/channel-connection");

    await expect(getChannelConnectionStates("tenant-1", ["x", "threads", "instagram"]))
      .resolves.toEqual({ x: "connected", threads: "reconnect", instagram: "disconnected" });
    expect(H.query).toContain("is_default = true");
  });
});
