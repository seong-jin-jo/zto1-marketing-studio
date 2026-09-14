import { describe, it, expect, beforeEach, vi } from "vitest";

// SNS-007: channel-accounts.ts 자체 계약 테스트(실 모듈, DB만 in-memory 시뮬레이션 모킹).
// 요구사항 10(b): 2계정 연결, 재연결이 새 계정을 안 만듦, 기본전환, 삭제(기본삭제시 승격,
// 마지막삭제시 legacy 해제), cross-tenant 404 등가(notFound).

interface Row {
  id: string;
  tenant_id: string;
  provider: string;
  external_account_id: string;
  display_name: string | null;
  username: string | null;
  secret_enc: string;
  refresh_enc: string | null;
  meta: Record<string, unknown> | null;
  is_default: boolean;
  status: string;
  token_expires_at: string | null;
  created_at: number; // 삽입 순서 시뮬레이션(ORDER BY created_at ASC)
}

const H = vi.hoisted(() => ({
  rows: [] as Row[],
  legacyIntegrations: new Map<string, { secret_enc: string; meta: unknown }>(), // key = tenant:provider
  seq: 0,
  transactionTail: Promise.resolve(),
}));

function reset() {
  H.rows = [];
  H.legacyIntegrations = new Map();
  H.seq = 0;
  H.transactionTail = Promise.resolve();
}

// 최소 postgres.js 태그드템플릿 흉내 — channel-accounts.ts의 각 쿼리 패턴만 식별해 처리한다.
function fakeSql(strings: TemplateStringsArray, ...vals: unknown[]) {
  const text = strings.join("?");

  if (text.includes("CASE WHEN secret_enc") && text.includes("FROM channel_accounts")) {
    const hasAccountId = text.includes("AND id =");
    const accountId = hasAccountId ? String(vals.at(-2)) : undefined;
    const provider = String(vals.at(hasAccountId ? -3 : -2));
    const tenantId = String(vals.at(hasAccountId ? -4 : -3));
    const row = H.rows.find((candidate) => (
      candidate.tenant_id === tenantId
      && candidate.provider === provider
      && candidate.status === "active"
      && (accountId ? candidate.id === accountId : candidate.is_default)
      && (!candidate.token_expires_at || Date.parse(candidate.token_expires_at) > Date.now())
      && (candidate.token_expires_at || !["threads", "instagram", "facebook"].includes(candidate.provider))
    ));
    return Promise.resolve(row ? [{
      id: row.id,
      token: row.secret_enc,
      refresh_token: row.refresh_enc,
      meta: row.meta,
    }] : []);
  }

  if (text.includes("SELECT id, is_default FROM channel_accounts") && text.includes("external_account_id")) {
    const [tenantId, provider, externalId] = vals as [string, string, string];
    const row = H.rows.find((r) => r.tenant_id === tenantId && r.provider === provider && r.external_account_id === externalId);
    return Promise.resolve(row ? [{ id: row.id, is_default: row.is_default }] : []);
  }
  if (text.includes("SELECT id, status, token_expires_at::text AS token_expires_at") && text.includes("is_default = true")) {
    const [tenantId, provider] = vals as [string, string];
    const row = H.rows.find((r) => r.tenant_id === tenantId && r.provider === provider && r.is_default);
    return Promise.resolve(row ? [{ id: row.id, status: row.status, token_expires_at: row.token_expires_at }] : []);
  }
  if (text.includes("UPDATE channel_accounts SET is_default = (id =")) {
    const [accountId, tenantId, provider] = vals as [string, string, string];
    H.rows
      .filter((r) => r.tenant_id === tenantId && r.provider === provider)
      .forEach((r) => (r.is_default = r.id === accountId));
    return Promise.resolve([]);
  }
  if (text.includes("UPDATE channel_accounts") && text.includes("SET secret_enc")) {
    // upsert 기존 계정 갱신 경로
    const id = vals[vals.length - 1] ?? vals[0]; // WHERE id = ${existing.id} 는 마지막 값
    const row = H.rows.find((r) => r.id === id);
    if (row) { row.secret_enc = String(vals[0]); }
    return Promise.resolve([]);
  }
  if (text.includes("SELECT count(*)::text AS cnt FROM channel_accounts WHERE tenant_id") && !text.includes("provider =")) {
    return Promise.resolve([{ cnt: String(H.rows.length) }]);
  }
  if (text.includes("SELECT count(*)::text AS cnt FROM channel_accounts")) {
    const [tenantId, provider] = vals as [string, string];
    const cnt = H.rows.filter((r) => r.tenant_id === tenantId && r.provider === provider).length;
    return Promise.resolve([{ cnt: String(cnt) }]);
  }
  if (text.includes("INSERT INTO channel_accounts")) {
    const [tenantId, provider, externalId, displayName, username, accessToken, , refreshToken, meta, isDefault, status, tokenExpiresAt] = vals;
    const existing = H.rows.find((r) => (
      r.tenant_id === tenantId
      && r.provider === provider
      && r.external_account_id === externalId
    ));
    if (existing) {
      existing.secret_enc = accessToken as string;
      if (refreshToken) existing.refresh_enc = refreshToken as string;
      if (displayName) existing.display_name = displayName as string;
      if (username) existing.username = username as string;
      if (meta) existing.meta = meta as Record<string, unknown>;
      existing.status = status as string;
      existing.token_expires_at = (tokenExpiresAt as string) ?? null;
      return Promise.resolve([{ id: existing.id, is_default: existing.is_default }]);
    }
    const id = `acc-${++H.seq}`;
    H.rows.push({
      id, tenant_id: tenantId as string, provider: provider as string, external_account_id: externalId as string,
      secret_enc: accessToken as string, refresh_enc: (refreshToken as string) ?? null,
      display_name: (displayName as string) ?? null, username: (username as string) ?? null,
      meta: (meta as Record<string, unknown>) ?? null, is_default: Boolean(isDefault), status: status as string,
      token_expires_at: (tokenExpiresAt as string) ?? null, created_at: H.seq,
    });
    return Promise.resolve([{ id, is_default: Boolean(isDefault) }]);
  }
  if (text.includes("SELECT id, status, token_expires_at::text AS token_expires_at") && text.includes("WHERE id =")) {
    const [accountId, tenantId, provider] = vals as [string, string, string];
    const row = H.rows.find((r) => r.id === accountId && r.tenant_id === tenantId && r.provider === provider);
    return Promise.resolve(row ? [{ id: row.id, status: row.status, token_expires_at: row.token_expires_at }] : []);
  }
  if (text.includes("SELECT id FROM channel_accounts WHERE id") && text.includes("provider = ")) {
    const [accountId, tenantId, provider] = vals as [string, string, string];
    const row = H.rows.find((r) => r.id === accountId && r.tenant_id === tenantId && r.provider === provider);
    return Promise.resolve(row ? [{ id: row.id }] : []);
  }
  if (text.includes("UPDATE channel_accounts SET is_default = false")) {
    const [tenantId, provider] = vals as [string, string];
    H.rows.filter((r) => r.tenant_id === tenantId && r.provider === provider && r.is_default).forEach((r) => (r.is_default = false));
    return Promise.resolve([]);
  }
  if (text.includes("UPDATE channel_accounts SET is_default = true")) {
    const [accountId] = vals as [string];
    const row = H.rows.find((r) => r.id === accountId);
    if (row) row.is_default = true;
    return Promise.resolve([]);
  }
  if (text.includes("SELECT id, is_default FROM channel_accounts WHERE id") && text.includes("AND provider =")) {
    const [accountId, tenantId, provider] = vals as [string, string, string];
    const row = H.rows.find((r) => r.id === accountId && r.tenant_id === tenantId && r.provider === provider);
    return Promise.resolve(row ? [{ id: row.id, is_default: row.is_default }] : []);
  }
  if (text.includes("DELETE FROM channel_accounts WHERE id")) {
    const [accountId] = vals as [string];
    H.rows = H.rows.filter((r) => r.id !== accountId);
    return Promise.resolve([]);
  }
  if (text.includes("SELECT id, status, token_expires_at::text AS token_expires_at") && text.includes("ORDER BY created_at ASC")) {
    const [tenantId, provider] = vals as [string, string];
    return Promise.resolve(H.rows
      .filter((r) => r.tenant_id === tenantId && r.provider === provider)
      .sort((a, b) => a.created_at - b.created_at)
      .map((row) => ({ id: row.id, status: row.status, token_expires_at: row.token_expires_at })));
  }
  if (text.includes("DELETE FROM integrations WHERE tenant_id")) {
    const [tenantId, provider] = vals as [string, string];
    H.legacyIntegrations.delete(`${tenantId}:${provider}`);
    return Promise.resolve([]);
  }
  if (text.includes("SELECT secret_enc, meta FROM channel_accounts WHERE id")) {
    const [accountId, tenantId] = vals as [string, string];
    const row = H.rows.find((r) => r.id === accountId && r.tenant_id === tenantId);
    return Promise.resolve(row ? [{ secret_enc: row.secret_enc, meta: row.meta }] : []);
  }
  if (text.includes("INSERT INTO integrations")) {
    const [tenantId, provider, secretEnc, meta] = vals as [string, string, string, unknown];
    H.legacyIntegrations.set(`${tenantId}:${provider}`, { secret_enc: secretEnc, meta });
    return Promise.resolve([]);
  }
  if (text.includes("SELECT id, provider, external_account_id, display_name, username, is_default, status")) {
    const [tenantId, provider] = vals as [string, string];
    const list = H.rows
      .filter((r) => r.tenant_id === tenantId && r.provider === provider)
      .sort((a, b) => (b.is_default ? 1 : 0) - (a.is_default ? 1 : 0) || a.created_at - b.created_at)
      .map((r) => ({ id: r.id, provider: r.provider, external_account_id: r.external_account_id, is_default: r.is_default, status: r.status }));
    return Promise.resolve(list);
  }
  if (text.includes("SELECT id FROM channel_accounts WHERE id = ") && text.includes("AND tenant_id")) {
    const [accountId, tenantId] = vals as [string, string];
    const row = H.rows.find((r) => r.id === accountId && r.tenant_id === tenantId);
    return Promise.resolve(row ? [{ id: row.id }] : []);
  }
  return Promise.resolve([]);
}

vi.mock("@/lib/db", () => ({
  withTenant: vi.fn(async (_t: string, cb: (sql: unknown) => unknown) => {
    const sql = Object.assign(fakeSql, { json: (v: unknown) => v });
    const previous = H.transactionTail;
    let release = () => {};
    H.transactionTail = new Promise<void>((resolve) => {
      release = resolve;
    });
    await previous;
    try {
      return await cb(sql);
    } finally {
      release();
    }
  }),
  db: vi.fn(() => Object.assign(fakeSql, { json: (v: unknown) => v })),
}));

beforeEach(() => {
  reset();
  vi.unstubAllGlobals();
  process.env.OSMU_SECRET_KEY = "enc-key";
});

describe("upsertChannelAccount — 2계정 + 재연결 idempotency", () => {
  it("같은 tenant/provider에 서로 다른 external id 2개 upsert → 2행, 첫번째만 기본", async () => {
    const { upsertChannelAccount, listChannelAccounts } = await import("@/lib/channel-accounts");
    const future = new Date(Date.now() + 60_000).toISOString();
    const a = await upsertChannelAccount({ tenantId: "t1", provider: "threads", externalId: "ext-1", accessToken: "tok-1", tokenExpiresAt: future });
    const b = await upsertChannelAccount({ tenantId: "t1", provider: "threads", externalId: "ext-2", accessToken: "tok-2", tokenExpiresAt: future });
    expect(a.isDefault).toBe(true);
    expect(b.isDefault).toBe(false);
    const list = await listChannelAccounts("t1", "threads");
    expect(list).toHaveLength(2);
  });

  it("채널-재연결-04 정상: 동일 external id는 새 행 없이 토큰과 표시 정보를 갱신하고 기본을 유지한다", async () => {
    const { upsertChannelAccount } = await import("@/lib/channel-accounts");
    const future = new Date(Date.now() + 60_000).toISOString();
    const first = await upsertChannelAccount({ tenantId: "t1", provider: "threads", externalId: "ext-1", displayName: "연결 전", accessToken: "tok-1", tokenExpiresAt: future });
    const reconnect = await upsertChannelAccount({ tenantId: "t1", provider: "threads", externalId: "ext-1", displayName: "연결 후", accessToken: "tok-1-new", tokenExpiresAt: future });
    expect(reconnect.id).toBe(first.id);
    expect(reconnect).toMatchObject({ isDefault: true, reconnected: true });
    expect(H.rows).toHaveLength(1);
    expect(H.rows[0]).toMatchObject({ secret_enc: "tok-1-new", display_name: "연결 후", is_default: true });
  });

  it("두 번째 계정 추가가 첫 번째(기본) 계정의 토큰을 덮어쓰지 않는다", async () => {
    const { upsertChannelAccount } = await import("@/lib/channel-accounts");
    const future = new Date(Date.now() + 60_000).toISOString();
    await upsertChannelAccount({ tenantId: "t1", provider: "threads", externalId: "ext-1", accessToken: "tok-1", tokenExpiresAt: future });
    await upsertChannelAccount({ tenantId: "t1", provider: "threads", externalId: "ext-2", accessToken: "tok-2", tokenExpiresAt: future });
    const defaultRow = H.rows.find((r) => r.is_default);
    expect(defaultRow?.secret_enc).toBe("tok-1");
  });

  it("교환 응답에서 계산한 tokenExpiresAt을 channel_accounts에 저장한다", async () => {
    const tokenExpiresAt = new Date(Date.now() + 3_600_000).toISOString();
    const { upsertChannelAccount } = await import("@/lib/channel-accounts");
    await upsertChannelAccount({
      tenantId: "t1",
      provider: "youtube",
      externalId: "yt-1",
      accessToken: "yt-access",
      refreshToken: "yt-refresh",
      tokenExpiresAt,
    });
    expect(H.rows[0]?.token_expires_at).toBe(tokenExpiresAt);
  });
});

describe("getSelectedChannelAccountCred: 만료 토큰 사전 차단", () => {
  it("채널-만료-01 정상: 만료 전 active 계정은 발행 자격으로 반환한다", async () => {
    const { upsertChannelAccount, getSelectedChannelAccountCred } = await import("@/lib/channel-accounts");
    const account = await upsertChannelAccount({
      tenantId: "t1", provider: "threads", externalId: "live", accessToken: "token-live",
      tokenExpiresAt: new Date(Date.now() + 60_000).toISOString(),
    });
    await expect(getSelectedChannelAccountCred("t1", "threads", account.id))
      .resolves.toMatchObject({ accountId: account.id, token: "token-live" });
  });

  it("채널-만료-02 거절: active여도 만료 시각이 지났으면 공급자 호출용 자격을 반환하지 않는다", async () => {
    const { upsertChannelAccount, getSelectedChannelAccountCred } = await import("@/lib/channel-accounts");
    const account = await upsertChannelAccount({
      tenantId: "t1", provider: "threads", externalId: "expired", accessToken: "token-expired",
      tokenExpiresAt: new Date(Date.now() - 60_000).toISOString(),
    });
    await expect(getSelectedChannelAccountCred("t1", "threads", account.id)).resolves.toBeNull();
  });

  it("계정-발행-02 거절: 만료 시각 없는 Threads 계정은 최초 계정이어도 기본과 발행 자격이 되지 않는다", async () => {
    const { upsertChannelAccount, getSelectedChannelAccountCred, listChannelAccounts } = await import("@/lib/channel-accounts");
    const account = await upsertChannelAccount({
      tenantId: "t1", provider: "threads", externalId: "missing-expiry", accessToken: "token-unknown",
    });

    expect(account.isDefault).toBe(false);
    await expect(getSelectedChannelAccountCred("t1", "threads")).resolves.toBeNull();
    await expect(listChannelAccounts("t1", "threads")).resolves.toEqual([
      expect.objectContaining({
        id: account.id,
        is_default: false,
        connection_state: "reconnect",
        can_be_default: false,
        default_blocked_reason: "token_expiry_missing",
      }),
    ]);
  });
});

describe("resolveExternalIdentity fail-closed", () => {
  it.each(["threads", "instagram", "x", "youtube"])("%s /me 검증 실패를 fallback ID로 덮지 않는다", async (provider) => {
    vi.stubGlobal("fetch", vi.fn(async () => new Response(JSON.stringify({ error: { code: 190 } }), { status: 400 })));
    const { resolveExternalIdentity } = await import("@/lib/channel-accounts");
    await expect(resolveExternalIdentity(provider, "invalid-token", "fallback-id", "t1"))
      .rejects.toThrow(/계정 신원 검증/);
  });

  it("Threads /me가 반환한 실제 ID와 username을 사용한다", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => Response.json({ id: "live-id", username: "live-user" })));
    const { resolveExternalIdentity } = await import("@/lib/channel-accounts");
    await expect(resolveExternalIdentity("threads", "valid-token", "fallback-id", "t1"))
      .resolves.toEqual({ externalId: "live-id", username: "live-user" });
  });
});

describe("setDefaultAccount — 기본전환 + cross-tenant", () => {
  it("기본 전환 시 이전 기본이 해제되고 신규가 기본이 된다", async () => {
    const { upsertChannelAccount, setDefaultAccount } = await import("@/lib/channel-accounts");
    const future = new Date(Date.now() + 60_000).toISOString();
    await upsertChannelAccount({ tenantId: "t1", provider: "threads", externalId: "ext-1", accessToken: "tok-1", tokenExpiresAt: future });
    const b = await upsertChannelAccount({ tenantId: "t1", provider: "threads", externalId: "ext-2", accessToken: "tok-2", tokenExpiresAt: future });
    const result = await setDefaultAccount("t1", "threads", b.id);
    expect(result.ok).toBe(true);
    expect(H.rows.filter((r) => r.is_default)).toHaveLength(1);
    expect(H.rows.find((r) => r.id === b.id)?.is_default).toBe(true);
  });

  it("cross-tenant accountId → notFound", async () => {
    const { upsertChannelAccount, setDefaultAccount } = await import("@/lib/channel-accounts");
    const a = await upsertChannelAccount({ tenantId: "t1", provider: "x", externalId: "ext-1", accessToken: "tok-1" });
    const result = await setDefaultAccount("t2", "threads", a.id);
    expect(result.notFound).toBe(true);
    expect(H.rows.find((r) => r.id === a.id)?.is_default).toBe(true); // 변경 안 됨
  });

  it("계정-기본-02 거절: 만료됐거나 비활성인 계정은 기존 기본을 바꾸지 않는다", async () => {
    const { upsertChannelAccount, setDefaultAccount } = await import("@/lib/channel-accounts");
    const future = new Date(Date.now() + 60_000).toISOString();
    const current = await upsertChannelAccount({ tenantId: "t1", provider: "threads", externalId: "live", accessToken: "tok-live", tokenExpiresAt: future });
    const expired = await upsertChannelAccount({
      tenantId: "t1", provider: "threads", externalId: "expired", accessToken: "tok-expired",
      tokenExpiresAt: new Date(Date.now() - 60_000).toISOString(),
    });
    const inactive = await upsertChannelAccount({
      tenantId: "t1", provider: "threads", externalId: "inactive", accessToken: "tok-inactive",
      tokenExpiresAt: future, status: "inactive",
    });

    await expect(setDefaultAccount("t1", "threads", expired.id)).resolves.toEqual({
      ok: false,
      blockedReason: "token_expired",
    });
    await expect(setDefaultAccount("t1", "threads", inactive.id)).resolves.toEqual({
      ok: false,
      blockedReason: "status_inactive",
    });
    expect(H.rows.find((row) => row.id === current.id)?.is_default).toBe(true);
  });

  it("계정-기본-03 경합: 두 기본 전환 요청이 겹쳐도 provider당 기본은 하나다", async () => {
    const { upsertChannelAccount, setDefaultAccount } = await import("@/lib/channel-accounts");
    const future = new Date(Date.now() + 60_000).toISOString();
    await upsertChannelAccount({ tenantId: "t1", provider: "threads", externalId: "one", accessToken: "tok-1", tokenExpiresAt: future });
    const second = await upsertChannelAccount({ tenantId: "t1", provider: "threads", externalId: "two", accessToken: "tok-2", tokenExpiresAt: future });
    const third = await upsertChannelAccount({ tenantId: "t1", provider: "threads", externalId: "three", accessToken: "tok-3", tokenExpiresAt: future });

    await Promise.all([
      setDefaultAccount("t1", "threads", second.id),
      setDefaultAccount("t1", "threads", third.id),
    ]);

    expect(H.rows.filter((row) => row.is_default)).toHaveLength(1);
  });

  it("계정-발행-01 정상: 기본 전환 뒤 기본 발행 자격 조회는 새 계정 토큰과 id를 사용한다", async () => {
    const { upsertChannelAccount, setDefaultAccount, getSelectedChannelAccountCred } = await import("@/lib/channel-accounts");
    const future = new Date(Date.now() + 60_000).toISOString();
    await upsertChannelAccount({ tenantId: "t1", provider: "threads", externalId: "old", accessToken: "tok-old", tokenExpiresAt: future });
    const next = await upsertChannelAccount({ tenantId: "t1", provider: "threads", externalId: "new", accessToken: "tok-new", tokenExpiresAt: future });

    await setDefaultAccount("t1", "threads", next.id);

    await expect(getSelectedChannelAccountCred("t1", "threads")).resolves.toMatchObject({
      accountId: next.id,
      token: "tok-new",
    });
  });
});

describe("deleteChannelAccount — 승격/legacy 해제/cross-tenant", () => {
  it("기본계정 삭제 시 가장 오래된 다른 계정이 승격된다", async () => {
    const { upsertChannelAccount, deleteChannelAccount } = await import("@/lib/channel-accounts");
    const future = new Date(Date.now() + 60_000).toISOString();
    const a = await upsertChannelAccount({ tenantId: "t1", provider: "threads", externalId: "ext-1", accessToken: "tok-1", tokenExpiresAt: future });
    const b = await upsertChannelAccount({ tenantId: "t1", provider: "threads", externalId: "ext-2", accessToken: "tok-2", tokenExpiresAt: future });
    const result = await deleteChannelAccount("t1", "threads", a.id);
    expect(result.ok).toBe(true);
    expect(result.promotedId).toBe(b.id);
    expect(H.rows.find((r) => r.id === b.id)?.is_default).toBe(true);
  });

  it("마지막 계정 삭제 시 legacy integrations 행도 제거된다", async () => {
    const { upsertChannelAccount, syncLegacyIntegration, deleteChannelAccount } = await import("@/lib/channel-accounts");
    const a = await upsertChannelAccount({ tenantId: "t1", provider: "x", externalId: "ext-1", accessToken: "tok-1" });
    await syncLegacyIntegration("t1", "x", a.id);
    expect(H.legacyIntegrations.has("t1:x")).toBe(true);
    await deleteChannelAccount("t1", "x", a.id);
    expect(H.legacyIntegrations.has("t1:x")).toBe(false);
  });

  it("cross-tenant accountId 삭제 시도 → notFound, 행 유지", async () => {
    const { upsertChannelAccount, deleteChannelAccount } = await import("@/lib/channel-accounts");
    const a = await upsertChannelAccount({ tenantId: "t1", provider: "x", externalId: "ext-1", accessToken: "tok-1" });
    const result = await deleteChannelAccount("t2", "x", a.id);
    expect(result.notFound).toBe(true);
    expect(H.rows).toHaveLength(1);
  });

  it("계정-해제-02 거절: 기본 삭제 뒤 만료 계정만 남으면 자동 승격하지 않는다", async () => {
    const { upsertChannelAccount, deleteChannelAccount } = await import("@/lib/channel-accounts");
    const current = await upsertChannelAccount({ tenantId: "t1", provider: "x", externalId: "live", accessToken: "tok-live" });
    await upsertChannelAccount({
      tenantId: "t1", provider: "x", externalId: "expired", accessToken: "tok-expired",
      tokenExpiresAt: new Date(Date.now() - 60_000).toISOString(),
    });

    const result = await deleteChannelAccount("t1", "x", current.id);

    expect(result).toEqual({ ok: true });
    expect(H.rows).toHaveLength(1);
    expect(H.rows[0]?.is_default).toBe(false);
  });
});
