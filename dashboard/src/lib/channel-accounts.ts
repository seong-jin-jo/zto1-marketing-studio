// SNS-007: 사이트 내 provider별 다중 계정. channel_accounts는 additive 테이블(db/schema.sql) —
// integrations(kind='channel')는 그대로 두고(rollback 경로 보존), 이 파일이 두 테이블을 함께
// 관리한다. integrations는 "그 provider의 현재 기본 계정"만 계속 미러링해 미마이그레이트
// 소비자(getChannelCred 폴백, publish-due 등)가 무중단으로 동작하게 한다.
//
// 근거(2026-07-17 primary-source 확인):
//   - X API v2 GET /2/users/me — OAuth2 유저 토큰으로 authoritative user id 조회
//     (https://docs.x.com/fundamentals/authentication/guides/v2-authentication-mapping)
//   - YouTube Data API v3 channels.list(part=id,snippet, mine=true) — OAuth 유저 토큰으로
//     authoritative channel id 조회 (https://developers.google.com/youtube/v3/docs/channels/list)
//   - Meta LoginAPI(Threads/Instagram)는 단기 토큰 교환 응답 자체에 user_id를 반환(이미 social-connect.ts
//     exchangeCode가 획득) — 별도 /me 호출 불필요, 그 값을 authoritative id로 사용.
import { withTenant } from "@/lib/db";

export interface ChannelAccountRow {
  id: string;
  provider: string;
  external_account_id: string;
  display_name: string | null;
  username: string | null;
  is_default: boolean;
  status: string;
  token_expires_at: string | null;
  created_at: string;
  updated_at: string;
  connection_state: "connected" | "reconnect";
  can_be_default: boolean;
  default_blocked_reason: DefaultAccountBlockedReason | null;
}

export type DefaultAccountBlockedReason =
  | "status_expired"
  | "status_revoked"
  | "status_inactive"
  | "token_expired"
  | "token_expiry_missing"
  | "token_expiry_invalid";

export interface DefaultAccountEligibility {
  eligible: boolean;
  blockedReason: DefaultAccountBlockedReason | null;
}

export interface ResolvedIdentity {
  externalId: string;
  displayName?: string;
  username?: string;
}

const TIMEOUT_MS = 5000;

const LIVE_IDENTITY_PROVIDERS = new Set(["threads", "instagram", "x", "youtube"]);

// provider 토큰으로 authoritative 외부 식별자를 resolve한다. `/me`를 구현한 provider는
// 실패 시 fallback ID로 active 계정을 만들지 않고 콜백 전체를 실패시킨다. 외부 신원 조회를
// 구현하지 않은 provider만 토큰 교환 응답 ID 또는 legacy ID 폴백을 유지한다.
export async function resolveExternalIdentity(
  provider: string,
  accessToken: string,
  fallbackUserId?: string,
  tenantId?: string,
): Promise<ResolvedIdentity> {
  try {
    if (provider === "x") {
      const res = await fetch("https://api.twitter.com/2/users/me", {
        headers: { Authorization: `Bearer ${accessToken}` },
        signal: AbortSignal.timeout(TIMEOUT_MS),
      });
      if (!res.ok) throw new Error("x identity response not ok");
      const data = (await res.json()) as { data?: { id?: string; username?: string; name?: string } };
      if (data.data?.id) {
        return { externalId: data.data.id, username: data.data.username, displayName: data.data.name };
      }
      throw new Error("x identity missing");
    } else if (provider === "youtube") {
      const res = await fetch(
        "https://www.googleapis.com/youtube/v3/channels?part=id,snippet&mine=true",
        { headers: { Authorization: `Bearer ${accessToken}` }, signal: AbortSignal.timeout(TIMEOUT_MS) },
      );
      if (!res.ok) throw new Error("youtube identity response not ok");
      const data = (await res.json()) as { items?: Array<{ id?: string; snippet?: { title?: string } }> };
      const ch = data.items?.[0];
      if (ch?.id) return { externalId: ch.id, displayName: ch.snippet?.title };
      throw new Error("youtube identity missing");
    } else if (provider === "threads") {
      const res = await fetch(`https://graph.threads.net/v1.0/me?fields=id,username&access_token=${encodeURIComponent(accessToken)}`, {
        signal: AbortSignal.timeout(TIMEOUT_MS),
      });
      if (!res.ok) throw new Error("threads identity response not ok");
      const data = (await res.json()) as { id?: string; username?: string };
      if (data.id) return { externalId: data.id, username: data.username };
      throw new Error("threads identity missing");
    } else if (provider === "instagram") {
      const res = await fetch(`https://graph.instagram.com/v21.0/me?fields=id,username&access_token=${encodeURIComponent(accessToken)}`, {
        signal: AbortSignal.timeout(TIMEOUT_MS),
      });
      if (!res.ok) throw new Error("instagram identity response not ok");
      const data = (await res.json()) as { id?: string; username?: string };
      if (data.id) return { externalId: data.id, username: data.username };
      throw new Error("instagram identity missing");
    }
    // facebook: fallbackUserId는 이미 exchangeFacebookCode가 확정한 페이지 id(authoritative) —
    // 별도 /me 불필요. 그 외 provider(linkedin/naver_blog/pinterest/tumblr/tiktok/slack/line)는
    // 이 스코프에서 별도 /me 미구현 — fallback으로 처리.
  } catch {
    if (LIVE_IDENTITY_PROVIDERS.has(provider)) {
      throw new Error(`${provider} 계정 신원 검증에 실패했습니다. 다시 연결해주세요.`);
    }
  }
  if (fallbackUserId) return { externalId: fallbackUserId };
  // synthetic id — tenantId+provider+시각 기반(2026-07-17 표기, 진짜 랜덤 대신 결정적 폴백이
  // 필요하면 호출부가 own nonce를 fallbackUserId로 넘긴다). 여기선 최소 유일성 보장을 위해
  // provider명 + tenant 조합만 사용 — 실제 재연결 시 동일 계정으로 수렴하도록 유지한다.
  return { externalId: `legacy-${provider}-${tenantId || "unknown"}` };
}

interface UpsertInput {
  tenantId: string;
  provider: string;
  externalId: string;
  displayName?: string | null;
  username?: string | null;
  accessToken: string;
  refreshToken?: string | null;
  meta?: Record<string, unknown>;
  status?: string;
  tokenExpiresAt?: string | null;
}


// 기본계정으로 쓸 수 있는 행인가. channel-connection.ts 의 판정과 같은 기준을 쓴다.
const DEFAULT_REQUIRES_EXPIRY = new Set(["threads", "instagram", "facebook"]);

export function defaultAccountEligibility(
  provider: string,
  status: string | null,
  tokenExpiresAt: string | null,
  now = Date.now(),
): DefaultAccountEligibility {
  if (status === "expired") return { eligible: false, blockedReason: "status_expired" };
  if (status === "revoked") return { eligible: false, blockedReason: "status_revoked" };
  if (status !== "active") return { eligible: false, blockedReason: "status_inactive" };
  if (!tokenExpiresAt) {
    return DEFAULT_REQUIRES_EXPIRY.has(provider)
      ? { eligible: false, blockedReason: "token_expiry_missing" }
      : { eligible: true, blockedReason: null };
  }
  const at = Date.parse(tokenExpiresAt);
  if (!Number.isFinite(at)) return { eligible: false, blockedReason: "token_expiry_invalid" };
  if (at <= now) return { eligible: false, blockedReason: "token_expired" };
  return { eligible: true, blockedReason: null };
}

export function defaultAccountBlockedMessage(reason: DefaultAccountBlockedReason): string {
  if (reason === "status_revoked") return "연결이 해제된 계정은 기본 계정으로 지정할 수 없습니다. 다시 연결해 주세요.";
  if (reason === "status_inactive") return "비활성 계정은 기본 계정으로 지정할 수 없습니다.";
  if (reason === "token_expiry_missing" || reason === "token_expiry_invalid") {
    return "토큰 만료 시각을 확인할 수 없어 기본 계정으로 지정할 수 없습니다. 다시 연결해 주세요.";
  }
  return "토큰이 만료된 계정은 기본 계정으로 지정할 수 없습니다. 다시 연결해 주세요.";
}

function usableAsDefault(provider: string, status: string | null, tokenExpiresAt: string | null): boolean {
  return defaultAccountEligibility(provider, status, tokenExpiresAt).eligible;
}


// 이번에 붙은 계정이 쓸 수 있고 기존 기본계정이 못 쓰는 상태면 기본을 넘긴다.
// 넘기지 않으면 새로 연결해도 화면은 미연결로 남고 발행은 죽은 계정으로 간다.
async function promoteIfDefaultUnusable(
  sql: Parameters<Parameters<typeof withTenant>[1]>[0],
  input: UpsertInput,
  accountId: string,
  alreadyDefault: boolean,
): Promise<boolean> {
  if (alreadyDefault) return true;
  if (!usableAsDefault(input.provider, input.status ?? "active", input.tokenExpiresAt ?? null)) return false;

  const [current] = await sql<{ id: string; status: string | null; token_expires_at: string | null }[]>`
    SELECT id, status, token_expires_at::text AS token_expires_at
    FROM channel_accounts
    WHERE tenant_id = ${input.tenantId} AND provider = ${input.provider} AND is_default = true`;
  if (current && usableAsDefault(input.provider, current.status, current.token_expires_at)) return false;

  // 한 문장으로 뒤집으면 안 된다. uq_channel_accounts_one_default 는 부분 유니크 인덱스라
  // 지연 검사가 불가능하고, 갱신은 행 물리 순서대로 즉시 검사된다. 기본이 될 행이 기존
  // 기본계정보다 앞에 있으면 true 가 잠깐 둘이 되어 duplicate key 로 터진다.
  // 2026-09-05 회장 계정 연결 실패가 이것이었다(운영 로그 uq_channel_accounts_one_default).
  // 순서를 고정한다: 먼저 전부 내리고, 그 다음 이번 계정만 올린다.
  await sql`
    UPDATE channel_accounts SET is_default = false, updated_at = now()
    WHERE tenant_id = ${input.tenantId} AND provider = ${input.provider} AND is_default = true`;
  await sql`
    UPDATE channel_accounts SET is_default = true, updated_at = now()
    WHERE id = ${accountId}`;
  return true;
}

// tenant/provider/externalId로 upsert. 최초 계정이면 기본(is_default=true), 이후는 비기본으로 추가.
// 재연결(동일 external id)은 그 계정의 토큰/메타만 갱신 — 기본 여부는 건드리지 않는다.
//
// 단, 기존 기본계정이 못 쓰는 상태(비활성이거나 Meta 계열인데 장기 토큰 만료 시각이 없음)이고
// 이번에 붙은 계정이 쓸 수 있으면 기본을 이번 계정으로 넘긴다. 2026-09-01 회장 계정에서
// 실제로 난 일이다. 새 계정이 정상 연결됐는데도 낡은 기본계정 때문에 화면은 계속 미연결이었고
// 발행 대상도 죽은 계정을 가리키고 있었다. 사용자가 고칠 수 있는 화면이 없으므로 서버가 고친다.
// 반환: 이 upsert가 만든/갱신한 계정이 기본계정인지(legacy integrations 동기화 판단용)와
// 기존 계정을 갱신한 재연결인지(사용자 결과 안내용).
export async function upsertChannelAccount(input: UpsertInput): Promise<{ id: string; isDefault: boolean; reconnected: boolean }> {
  const key = process.env.OSMU_SECRET_KEY;
  if (!key) throw new Error("OSMU_SECRET_KEY 미설정 — 토큰 암호화 불가");
  return withTenant(input.tenantId, async (sql) => {
    // 같은 provider의 최초 OAuth callback 두 개가 동시에 count=0을 읽지 못하게 직렬화한다.
    await sql`SELECT pg_advisory_xact_lock(hashtextextended(${`${input.tenantId}:${input.provider}`}, 0))`;

    const [existing] = await sql<{ id: string; is_default: boolean }[]>`
      SELECT id, is_default FROM channel_accounts
      WHERE tenant_id = ${input.tenantId} AND provider = ${input.provider} AND external_account_id = ${input.externalId}`;

    const [{ cnt }] = await sql<{ cnt: string }[]>`
      SELECT count(*)::text AS cnt FROM channel_accounts WHERE tenant_id = ${input.tenantId} AND provider = ${input.provider}`;
    const isFirst = !existing && Number(cnt) === 0;
    const isInitialDefault = isFirst && usableAsDefault(
      input.provider,
      input.status ?? "active",
      input.tokenExpiresAt ?? null,
    );

    const [inserted] = await sql<{ id: string; is_default: boolean }[]>`
      INSERT INTO channel_accounts
        (tenant_id, provider, external_account_id, display_name, username, secret_enc, refresh_enc, meta, is_default, status, token_expires_at)
      VALUES (
        ${input.tenantId}, ${input.provider}, ${input.externalId},
        ${input.displayName ?? null}, ${input.username ?? null},
        armor(pgp_sym_encrypt(${input.accessToken}, ${key})),
        ${input.refreshToken ? sql`armor(pgp_sym_encrypt(${input.refreshToken}, ${key}))` : null},
        ${input.meta ? sql.json(input.meta as Parameters<typeof sql.json>[0]) : null},
        ${isInitialDefault}, ${input.status ?? "active"}, ${input.tokenExpiresAt ?? null}
      )
      ON CONFLICT (tenant_id, provider, external_account_id) DO UPDATE
        SET secret_enc = EXCLUDED.secret_enc,
            refresh_enc = COALESCE(EXCLUDED.refresh_enc, channel_accounts.refresh_enc),
            display_name = COALESCE(EXCLUDED.display_name, channel_accounts.display_name),
            username = COALESCE(EXCLUDED.username, channel_accounts.username),
            meta = COALESCE(EXCLUDED.meta, channel_accounts.meta),
            status = EXCLUDED.status,
            token_expires_at = EXCLUDED.token_expires_at,
            updated_at = now()
      RETURNING id, is_default`;
    const promoted = await promoteIfDefaultUnusable(
      sql, input, inserted.id, inserted.is_default,
    );
    return { id: inserted.id, isDefault: promoted, reconnected: Boolean(existing) };
  });
}

// channel_accounts의 기본계정 상태를 legacy integrations(kind='channel', label=provider)로 미러링.
// dual-write — integrations UNIQUE(tenant_id,kind,label) 그대로, ON CONFLICT UPDATE.
export async function syncLegacyIntegration(tenantId: string, provider: string, accountId: string): Promise<void> {
  await withTenant(tenantId, async (sql) => {
    const [acc] = await sql<{ secret_enc: string; meta: Record<string, unknown> | null }[]>`
      SELECT secret_enc, meta FROM channel_accounts WHERE id = ${accountId} AND tenant_id = ${tenantId}`;
    if (!acc) return;
    await sql`
      INSERT INTO integrations (tenant_id, kind, label, secret_enc, meta)
      VALUES (${tenantId}, 'channel', ${provider}, ${acc.secret_enc}, ${sql.json((acc.meta ?? {}) as Parameters<typeof sql.json>[0])})
      ON CONFLICT (tenant_id, kind, label) DO UPDATE
        SET secret_enc = EXCLUDED.secret_enc, meta = EXCLUDED.meta`;
  });
}

// tenant+provider 스코프 계정 목록. 토큰은 절대 반환하지 않는다(display/username/status/default만).
export async function listChannelAccounts(tenantId: string, provider: string): Promise<ChannelAccountRow[]> {
  const rows = await withTenant(tenantId, (sql) => sql<Omit<ChannelAccountRow, "connection_state" | "can_be_default" | "default_blocked_reason">[]>`
    SELECT id, provider, external_account_id, display_name, username, is_default, status,
           token_expires_at, created_at, updated_at
    FROM channel_accounts
    WHERE tenant_id = ${tenantId} AND provider = ${provider}
    ORDER BY is_default DESC, created_at ASC`);
  return rows.map((row) => {
    const eligibility = defaultAccountEligibility(row.provider, row.status, row.token_expires_at);
    return {
      ...row,
      connection_state: eligibility.eligible ? "connected" : "reconnect",
      can_be_default: eligibility.eligible,
      default_blocked_reason: eligibility.blockedReason,
    };
  });
}

// 기본계정 전환 — 트랜잭션 내에서 기존 기본 해제 → 신규 기본 지정 → legacy integrations 동기화.
// accountId가 tenant/provider 스코프 밖이면(cross-tenant) 0행 갱신 → notFound.
export async function setDefaultAccount(
  tenantId: string,
  provider: string,
  accountId: string,
): Promise<{ ok: boolean; notFound?: boolean; blockedReason?: DefaultAccountBlockedReason }> {
  return withTenant(tenantId, async (sql) => {
    await sql`SELECT pg_advisory_xact_lock(hashtextextended(${`${tenantId}:${provider}`}, 0))`;
    const [target] = await sql<{ id: string; status: string; token_expires_at: string | null }[]>`
      SELECT id, status, token_expires_at::text AS token_expires_at
      FROM channel_accounts
      WHERE id = ${accountId} AND tenant_id = ${tenantId} AND provider = ${provider}`;
    if (!target) return { ok: false, notFound: true };
    const eligibility = defaultAccountEligibility(provider, target.status, target.token_expires_at);
    if (!eligibility.eligible) {
      return { ok: false, blockedReason: eligibility.blockedReason ?? "status_inactive" };
    }
    await sql`UPDATE channel_accounts SET is_default = false, updated_at = now() WHERE tenant_id = ${tenantId} AND provider = ${provider} AND is_default = true`;
    await sql`UPDATE channel_accounts SET is_default = true, updated_at = now() WHERE id = ${accountId}`;
    const [account] = await sql<{ secret_enc: string; meta: Record<string, unknown> | null }[]>`
      SELECT secret_enc, meta FROM channel_accounts WHERE id = ${accountId} AND tenant_id = ${tenantId}`;
    await sql`
      INSERT INTO integrations (tenant_id, kind, label, secret_enc, meta)
      VALUES (${tenantId}, 'channel', ${provider}, ${account.secret_enc}, ${sql.json((account.meta ?? {}) as Parameters<typeof sql.json>[0])})
      ON CONFLICT (tenant_id, kind, label) DO UPDATE
        SET secret_enc = EXCLUDED.secret_enc, meta = EXCLUDED.meta`;
    return { ok: true };
  });
}

// 계정 삭제. 기본계정을 지우면 쓸 수 있는 다른 계정 중 가장 오래된 계정을 승격한다.
// 쓸 수 있는 계정이 없으면 남은 만료·비활성 행은 보존하되 legacy 연결은 제거한다.
export async function deleteChannelAccount(tenantId: string, provider: string, accountId: string): Promise<{ ok: boolean; notFound?: boolean; promotedId?: string }> {
  return withTenant(tenantId, async (sql) => {
    await sql`SELECT pg_advisory_xact_lock(hashtextextended(${`${tenantId}:${provider}`}, 0))`;
    const [target] = await sql<{ id: string; is_default: boolean }[]>`
      SELECT id, is_default FROM channel_accounts WHERE id = ${accountId} AND tenant_id = ${tenantId} AND provider = ${provider}`;
    if (!target) return { ok: false as const, notFound: true as const };

    await sql`DELETE FROM channel_accounts WHERE id = ${accountId}`;

    if (!target.is_default) return { ok: true as const };

    const candidates = await sql<{ id: string; status: string; token_expires_at: string | null }[]>`
      SELECT id, status, token_expires_at::text AS token_expires_at
      FROM channel_accounts
      WHERE tenant_id = ${tenantId} AND provider = ${provider}
      ORDER BY created_at ASC`;
    const next = candidates.find((candidate) => (
      defaultAccountEligibility(provider, candidate.status, candidate.token_expires_at).eligible
    ));
    if (next) {
      await sql`UPDATE channel_accounts SET is_default = true, updated_at = now() WHERE id = ${next.id}`;
      const [account] = await sql<{ secret_enc: string; meta: Record<string, unknown> | null }[]>`
        SELECT secret_enc, meta FROM channel_accounts WHERE id = ${next.id} AND tenant_id = ${tenantId}`;
      await sql`
        INSERT INTO integrations (tenant_id, kind, label, secret_enc, meta)
        VALUES (${tenantId}, 'channel', ${provider}, ${account.secret_enc}, ${sql.json((account.meta ?? {}) as Parameters<typeof sql.json>[0])})
        ON CONFLICT (tenant_id, kind, label) DO UPDATE
          SET secret_enc = EXCLUDED.secret_enc, meta = EXCLUDED.meta`;
      return { ok: true as const, promotedId: next.id };
    }
    // 마지막 계정이거나 남은 계정이 모두 만료·비활성이면 legacy 연결도 완전 해제한다.
    await sql`DELETE FROM integrations WHERE tenant_id = ${tenantId} AND kind = 'channel' AND label = ${provider}`;
    return { ok: true as const };
  });
}

export interface SelectedChannelCred {
  token: string;
  refreshToken?: string;
  userId?: string;
  meta?: Record<string, unknown>;
  accountId: string;
}

// getChannelCred(publish.ts)의 다중계정 확장. accountId 지정 시 그 계정(tenant+provider 스코프만),
// 없으면 기본계정. 둘 다 없으면 null → 호출부가 legacy integrations/env로 폴백.
export async function getSelectedChannelAccountCred(
  tenantId: string,
  provider: string,
  accountId?: string,
): Promise<SelectedChannelCred | null> {
  const key = process.env.OSMU_SECRET_KEY;
  const [row] = await withTenant(tenantId, (sql) => {
    if (accountId) {
      return sql<{ id: string; token: string | null; refresh_token: string | null; meta: Record<string, unknown> | null }[]>`
        SELECT id,
               CASE WHEN secret_enc <> '' AND ${key ?? ""} <> '' THEN pgp_sym_decrypt(dearmor(secret_enc), ${key ?? ""}) ELSE NULL END AS token,
               CASE WHEN refresh_enc IS NOT NULL AND ${key ?? ""} <> '' THEN pgp_sym_decrypt(dearmor(refresh_enc), ${key ?? ""}) ELSE NULL END AS refresh_token,
               meta
        FROM channel_accounts
        WHERE tenant_id = ${tenantId} AND provider = ${provider} AND id = ${accountId}
          AND status = 'active'
          AND (token_expires_at > now() OR (token_expires_at IS NULL AND ${!DEFAULT_REQUIRES_EXPIRY.has(provider)}))`;
    }
    return sql<{ id: string; token: string | null; refresh_token: string | null; meta: Record<string, unknown> | null }[]>`
      SELECT id,
             CASE WHEN secret_enc <> '' AND ${key ?? ""} <> '' THEN pgp_sym_decrypt(dearmor(secret_enc), ${key ?? ""}) ELSE NULL END AS token,
             CASE WHEN refresh_enc IS NOT NULL AND ${key ?? ""} <> '' THEN pgp_sym_decrypt(dearmor(refresh_enc), ${key ?? ""}) ELSE NULL END AS refresh_token,
             meta
      FROM channel_accounts
      WHERE tenant_id = ${tenantId} AND provider = ${provider} AND is_default = true
        AND status = 'active'
        AND (token_expires_at > now() OR (token_expires_at IS NULL AND ${!DEFAULT_REQUIRES_EXPIRY.has(provider)}))`;
  });
  if (!row || !row.token) return null;
  const meta = row.meta ?? {};
  const userId = typeof meta.userId === "string" ? meta.userId : undefined;
  return { token: row.token, refreshToken: row.refresh_token ?? undefined, userId, meta, accountId: row.id };
}

// tenant 스코프 확인 없이 accountId만으로 provider를 알아낼 때 쓰는 헬퍼(선택 스케줄 due 처리 등).
// 존재하지 않거나 cross-tenant면 null.
export async function accountExists(tenantId: string, accountId: string): Promise<boolean> {
  const [row] = await withTenant(tenantId, (sql) => sql<{ id: string }[]>`
    SELECT id FROM channel_accounts WHERE id = ${accountId} AND tenant_id = ${tenantId}`);
  return Boolean(row);
}

export async function channelAccountBelongsToProvider(
  tenantId: string,
  provider: string,
  accountId: string,
): Promise<boolean> {
  const [row] = await withTenant(tenantId, (sql) => sql<{ id: string }[]>`
    SELECT id FROM channel_accounts
    WHERE id = ${accountId} AND tenant_id = ${tenantId} AND provider = ${provider}
      AND status = 'active'
      AND (token_expires_at > now() OR (token_expires_at IS NULL AND ${!DEFAULT_REQUIRES_EXPIRY.has(provider)}))`);
  return Boolean(row);
}
