import { afterEach, describe, expect, it } from "vitest";
import postgres from "postgres";
import { upsertChannelAccount } from "@/lib/channel-accounts";
import { getDatabaseUrl } from "../isolation/_env";

type Sql = ReturnType<typeof postgres>;

const previousSecretKey = process.env.OSMU_SECRET_KEY;
const previousDatabaseUrl = process.env.DATABASE_URL;

async function tryConnect(): Promise<Sql | null> {
  const url = getDatabaseUrl();
  if (!url) return null;
  let sql: Sql | null = null;
  try {
    sql = postgres(url, { max: 3, idle_timeout: 5, connect_timeout: 8, onnotice: () => {} });
    await sql`select 1`;
    return sql;
  } catch {
    if (sql) await sql.end({ timeout: 5 });
    return null;
  }
}

afterEach(() => {
  if (previousSecretKey === undefined) delete process.env.OSMU_SECRET_KEY;
  else process.env.OSMU_SECRET_KEY = previousSecretKey;
  if (previousDatabaseUrl === undefined) delete process.env.DATABASE_URL;
  else process.env.DATABASE_URL = previousDatabaseUrl;
});

describe("channel_accounts first-account concurrency (live Postgres)", () => {
  it("serializes two first callbacks and leaves exactly one default account", async (ctx) => {
    const sql = await tryConnect();
    if (!sql) {
      if (process.env.CI) throw new Error("CI requires a reachable PostgreSQL service for concurrency QA");
      return ctx.skip();
    }

    const [tenant] = await sql<{ id: string }[]>`
      select id from tenants where slug = 'seed-a' limit 1`;
    if (!tenant) {
      await sql.end({ timeout: 5 });
      if (process.env.CI) throw new Error("CI requires the seed-a tenant for concurrency QA");
      return ctx.skip();
    }

    const provider = `qa-concurrency-${Date.now()}-${Math.random().toString(16).slice(2)}`;
    process.env.DATABASE_URL = getDatabaseUrl()!;
    process.env.OSMU_SECRET_KEY = "qa-channel-account-concurrency-key";

    try {
      const results = await Promise.all([
        upsertChannelAccount({
          tenantId: tenant.id,
          provider,
          externalId: "account-a",
          accessToken: "token-a",
        }),
        upsertChannelAccount({
          tenantId: tenant.id,
          provider,
          externalId: "account-b",
          accessToken: "token-b",
        }),
      ]);

      expect(results.filter((result) => result.isDefault)).toHaveLength(1);

      const [counts] = await sql<{ total: number; defaults: number }[]>`
        select count(*)::int as total,
               count(*) filter (where is_default)::int as defaults
        from channel_accounts
        where tenant_id = ${tenant.id} and provider = ${provider}`;

      expect(counts).toEqual({ total: 2, defaults: 1 });
    } finally {
      await sql`
        delete from channel_accounts
        where tenant_id = ${tenant.id} and provider = ${provider}`;
      await sql.end({ timeout: 5 });
    }
  });

  it("채널-재연결-01 정상: 같은 외부 계정을 두 번 저장하면 한 행을 갱신하고 기본 계정을 유지한다", async (ctx) => {
    const sql = await tryConnect();
    if (!sql) {
      if (process.env.CI) throw new Error("CI requires a reachable PostgreSQL service for reconnect QA");
      return ctx.skip();
    }

    const [tenant] = await sql<{ id: string }[]>`
      select id from tenants where slug = 'seed-a' limit 1`;
    if (!tenant) {
      await sql.end({ timeout: 5 });
      if (process.env.CI) throw new Error("CI requires the seed-a tenant for reconnect QA");
      return ctx.skip();
    }

    const provider = `qa-reconnect-${Date.now()}-${Math.random().toString(16).slice(2)}`;
    const externalId = "same-account";
    const firstExpiry = new Date(Date.now() + 3_600_000).toISOString();
    const secondExpiry = new Date(Date.now() + 7_200_000).toISOString();
    const secretKey = "qa-channel-account-reconnect-key";
    process.env.DATABASE_URL = getDatabaseUrl()!;
    process.env.OSMU_SECRET_KEY = secretKey;

    try {
      const first = await upsertChannelAccount({
        tenantId: tenant.id,
        provider,
        externalId,
        displayName: "연결 전 이름",
        username: "before-user",
        accessToken: "access-before",
        refreshToken: "refresh-before",
        meta: { api: "before", userId: externalId },
        tokenExpiresAt: firstExpiry,
      });
      const second = await upsertChannelAccount({
        tenantId: tenant.id,
        provider,
        externalId,
        displayName: "연결 후 이름",
        username: "after-user",
        accessToken: "access-after",
        refreshToken: "refresh-after",
        meta: { api: "after", userId: externalId },
        tokenExpiresAt: secondExpiry,
      });

      const [stored] = await sql<{
        total: number;
        defaults: number;
        id: string;
        display_name: string;
        username: string;
        access_token: string;
        refresh_token: string;
        status: string;
        token_expires_at: string;
        meta: Record<string, unknown>;
      }[]>`
        select (count(*) over ())::int as total,
               (count(*) filter (where is_default) over ())::int as defaults,
               id, display_name, username,
               pgp_sym_decrypt(dearmor(secret_enc), ${secretKey}) as access_token,
               pgp_sym_decrypt(dearmor(refresh_enc), ${secretKey}) as refresh_token,
               status, token_expires_at::text as token_expires_at, meta
        from channel_accounts
        where tenant_id = ${tenant.id} and provider = ${provider}`;

      expect(first).toMatchObject({ isDefault: true, reconnected: false });
      expect(second).toMatchObject({ id: first.id, isDefault: true, reconnected: true });
      expect(stored).toMatchObject({
        total: 1,
        defaults: 1,
        id: first.id,
        display_name: "연결 후 이름",
        username: "after-user",
        access_token: "access-after",
        refresh_token: "refresh-after",
        status: "active",
        meta: { api: "after", userId: externalId },
      });
      expect(Date.parse(stored.token_expires_at)).toBe(Date.parse(secondExpiry));
      console.info([
        "RECONNECT_DB_EVIDENCE",
        "first_save_success=1",
        "second_save_success=1",
        `provider_rows=${stored.total}`,
        `token_updated=${Number(stored.access_token === "access-after")}`,
        `display_name_updated=${Number(stored.display_name === "연결 후 이름")}`,
        `default_rows=${stored.defaults}`,
        `default_preserved=${Number(first.id === second.id && second.isDefault)}`,
      ].join(" "));
    } finally {
      await sql`
        delete from channel_accounts
        where tenant_id = ${tenant.id} and provider = ${provider}`;
      await sql.end({ timeout: 5 });
    }
  });

  it("채널-재연결-02 거절: 암호화 키가 없으면 계정 저장을 시작하지 않는다", async () => {
    delete process.env.OSMU_SECRET_KEY;
    await expect(upsertChannelAccount({
      tenantId: "tenant-without-key",
      provider: "threads",
      externalId: "account-without-key",
      accessToken: "not-stored",
    })).rejects.toThrow(/OSMU_SECRET_KEY/);
  });

  // 2026-09-05 운영 장애 회귀 고정. 운영 로그: duplicate key value violates unique constraint
  // "uq_channel_accounts_one_default". 기본계정 승격을 한 문장으로 뒤집으면 행 물리 순서에
  // 따라 true 가 잠깐 둘이 되어 터진다. 승격 대상 행을 기존 기본계정보다 먼저 넣어 그 순서를
  // 강제한다. 이 배치에서 예외 없이 통과해야 한다.
  it("채널-재연결-02 회귀: 기존 기본계정이 앞줄이 아닐 때도 승격이 duplicate key 로 터지지 않는다", async (ctx) => {
    const sql = await tryConnect();
    if (!sql) {
      if (process.env.CI) throw new Error("CI requires a reachable PostgreSQL service for promotion QA");
      return ctx.skip();
    }

    const [tenant] = await sql<{ id: string }[]>`
      select id from tenants where slug = 'seed-a' limit 1`;
    if (!tenant) {
      await sql.end({ timeout: 5 });
      if (process.env.CI) throw new Error("CI requires the seed-a tenant for promotion QA");
      return ctx.skip();
    }

    const provider = `qa-promote-${Date.now()}-${Math.random().toString(16).slice(2)}`;
    process.env.DATABASE_URL = getDatabaseUrl()!;
    process.env.OSMU_SECRET_KEY = "qa-channel-account-promote-key";

    try {
      // 승격될 계정을 먼저 넣어 물리 순서를 불리하게 만든다
      await sql`
        insert into channel_accounts (tenant_id, provider, external_account_id, secret_enc, is_default, status)
        values (${tenant.id}, ${provider}, 'new-account', 'x', false, 'active')`;
      // 못 쓰는 기존 기본계정을 뒤에 넣는다
      await sql`
        insert into channel_accounts (tenant_id, provider, external_account_id, secret_enc, is_default, status)
        values (${tenant.id}, ${provider}, 'dead-account', 'x', true, 'revoked')`;

      const result = await upsertChannelAccount({
        tenantId: tenant.id,
        provider,
        externalId: "new-account",
        accessToken: "token-new",
      });

      expect(result.isDefault).toBe(true);
      expect(result.reconnected).toBe(true);

      const [counts] = await sql<{ total: number; defaults: number; default_external: string }[]>`
        select count(*)::int as total,
               count(*) filter (where is_default)::int as defaults,
               max(external_account_id) filter (where is_default) as default_external
        from channel_accounts
        where tenant_id = ${tenant.id} and provider = ${provider}`;

      expect(counts.total).toBe(2);
      expect(counts.defaults).toBe(1);
      expect(counts.default_external).toBe("new-account");
    } finally {
      await sql`
        delete from channel_accounts
        where tenant_id = ${tenant.id} and provider = ${provider}`;
      await sql.end({ timeout: 5 });
    }
  });
});
