// F2(fdd-r02): 채널 "연결됨" 판정의 단일 소스. 사이드바/배너/Settings/Admin이 모두 이 함수(또는
// 이를 감싼 /api/channel-config 응답)를 통해서만 연결 여부를 판정한다. 레거시 integrations와
// openclaw.json config는 판정에서 배제(발행 폴백 미러링만 별도 유지, schema.sql:259~).
//
// 판정 규칙 자체는 lib/channel-accounts.ts 의 defaultAccountEligibility 가 정본이다.
// 계정 카드도 같은 함수를 부른다. 화면 두 곳이 다른 말을 하지 않게 하는 유일한 방법이다.
import { withTenant } from "@/lib/db";
import { defaultAccountEligibility } from "@/lib/channel-accounts";

export type ChannelConnectionState = "connected" | "reconnect" | "disconnected";

interface ConnectionRow {
  provider?: string;
  status: string;
  token_expires_at: string | null;
  has_refresh: boolean;
}

// 판정 규칙은 여기 있지 않다. defaultAccountEligibility 하나가 정본이고 이 파일은 그것을 부른다.
//
// 2026-09-08 회장 실사용: X 화면 머리말이 "연결됨", 바로 아래 유일한 계정이 "재연결 필요" 라고
// 동시에 적혀 있었다. 이 파일과 channel-accounts.ts 가 같은 사실을 서로 다른 규칙으로 판정했기
// 때문이다. 두 곳 다 주석에는 "같은 기준을 쓴다" 고 적혀 있었다. 주석은 규칙을 붙들어 매지
// 못한다. 규칙을 한 함수로 합쳐 갈라질 자리 자체를 없앤다.
function resolveStoredConnection(provider: string, row: ConnectionRow): ChannelConnectionState {
  const { eligible } = defaultAccountEligibility(provider, row.status, row.token_expires_at, row.has_refresh);
  return eligible ? "connected" : "reconnect";
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
