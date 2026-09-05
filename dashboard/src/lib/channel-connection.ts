// F2(fdd-r02): 채널 "연결됨" 판정의 단일 소스. 사이드바/배너/Settings/Admin이 모두 이 함수(또는
// 이를 감싼 /api/channel-config 응답)를 통해서만 연결 여부를 판정한다. 레거시 integrations와
// openclaw.json config는 판정에서 배제(발행 폴백 미러링만 별도 유지, schema.sql:259~).
//
// 판정 = channel_accounts의 기본 계정 status + token_expires_at + refresh_enc.
// active여도 Meta 장기 토큰 만료시각이 없거나, 만료 토큰을 갱신할 refresh_enc가 없으면 reconnect다.
import { withTenant } from "@/lib/db";

export type ChannelConnectionState = "connected" | "reconnect" | "disconnected";

interface ConnectionRow {
  provider?: string;
  status: string;
  token_expires_at: string | null;
  has_refresh: boolean;
}

const DURABLE_EXPIRY_REQUIRED = new Set(["threads", "instagram", "facebook"]);

function resolveStoredConnection(provider: string, row: ConnectionRow): ChannelConnectionState {
  if (row.status !== "active") return "reconnect";
  if (!row.token_expires_at) {
    return DURABLE_EXPIRY_REQUIRED.has(provider) ? "reconnect" : "connected";
  }
  const expiresAt = Date.parse(row.token_expires_at);
  if (!Number.isFinite(expiresAt)) return "reconnect";
  if (expiresAt <= Date.now() && !row.has_refresh) return "reconnect";
  return "connected";
}

export async function isChannelConnected(tenantId: string, provider: string): Promise<ChannelConnectionState> {
  if (!tenantId) return "disconnected";
  const [row] = await withTenant(tenantId, (sql) => sql<ConnectionRow[]>`
    SELECT status, token_expires_at, (refresh_enc IS NOT NULL) AS has_refresh FROM channel_accounts
    WHERE tenant_id = ${tenantId} AND provider = ${provider} AND is_default = true
    ORDER BY created_at DESC LIMIT 1`);
  if (!row) return "disconnected";
  return resolveStoredConnection(provider, row);
}

// 여러 provider를 한 번에 판정(사이드바/배너/Settings 벌크 조회용).
export async function getChannelConnectionStates(
  tenantId: string,
  providers: string[],
): Promise<Record<string, ChannelConnectionState>> {
  if (!tenantId || providers.length === 0) return {};
  const rows = await withTenant(tenantId, (sql) => sql<ConnectionRow[]>`
    SELECT provider, status, token_expires_at,
           (refresh_enc IS NOT NULL) AS has_refresh
    FROM channel_accounts
    WHERE tenant_id = ${tenantId} AND provider = ANY(${providers}) AND is_default = true`);
  const out: Record<string, ChannelConnectionState> = {};
  for (const p of providers) out[p] = "disconnected";
  for (const r of rows) {
    if (r.provider) out[r.provider] = resolveStoredConnection(r.provider, r);
  }
  return out;
}
