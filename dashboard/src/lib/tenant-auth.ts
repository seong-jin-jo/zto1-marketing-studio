import crypto from "node:crypto";
import { db } from "@/lib/db";
import { verifySupabaseJwt } from "@/lib/supabase";
import { reportFailure } from "@/lib/observability";

// 인증 검증기/서비스 장애(503) 전용 알림 헬퍼 — 무효 토큰(401)·정지 계정(403)은 정상적인 사용자
// 입력 결과일 뿐이라 알림 대상이 아니다(스팸 방지). "서비스가 검증 자체를 수행 못 함"(DB/Supabase
// 연결 실패)만 고위험 장애 신호라 여기 한 곳(throw 직전)에서만 report한다 — effectiveTenantId를
// 호출하는 모든 API route가 각자 다시 보고하지 않아도 되는 단일 경계.
function reportAuthServiceUnavailable(reason: string): void {
  void reportFailure({ event: "auth_service_unavailable", severity: "critical", context: { reason } });
}

// 고객 접속은 인증 성공 뒤 최대 15분에 한 번만 기록한다. 조건부 UPDATE와 이력 INSERT를 한 SQL
// 문장으로 묶어 둘 중 하나만 반영되는 상태를 막는다. PostgreSQL Read Committed는 경합한 UPDATE가
// 기다린 뒤 WHERE를 최신 행에 다시 평가하므로 같은 tenant의 동시 요청 중 하나만 touched_tenant를
// 통과한다. 이력에는 tenant_id와 시각 외 개인정보를 전달하지 않는다.
export async function recordTenantAccess(tenantId: string): Promise<void> {
  const sql = db();
  await sql`
    WITH touched_tenant AS (
      UPDATE tenants
      SET last_accessed_at = now()
      WHERE id = ${tenantId}
        AND (
          last_accessed_at IS NULL
          OR last_accessed_at <= now() - INTERVAL '15 minutes'
        )
      RETURNING id, last_accessed_at
    )
    INSERT INTO tenant_access_events (tenant_id, accessed_at)
    SELECT id, last_accessed_at
    FROM touched_tenant
    ON CONFLICT (tenant_id, accessed_at) DO NOTHING`;
}

async function recordTenantAccessWithoutBlockingAuth(tenantId: string): Promise<void> {
  try {
    await recordTenantAccess(tenantId);
  } catch {
    // 접속 장부 장애가 로그인과 고객 요청을 막아서는 안 된다. 원문 오류나 tenant 식별자는
    // 관측 payload에 싣지 않고 고정 reason만 남긴다.
    reportAuthServiceUnavailable("tenant_access_record_failed");
  }
}

// 무효/미인식 bearer 또는 검증 인프라 장애 시 던짐 — effectiveTenantId가 절대 fallback/공유 root로
// 새지 않게 하는 타입드 에러. 401(무효·미인식) / 403(유효하지만 계정 정지·이용불가) / 503(검증기·env·DB 장애).
// code는 안정된 machine-readable 식별자(클라가 accessPaused/accountUnavailable 화면분기에 사용).
export class AuthError extends Error {
  readonly status: 401 | 403 | 503;
  readonly code: string;
  constructor(reason: "invalid" | "unavailable" | "forbidden", message: string, code?: string) {
    super(message);
    this.name = "AuthError";
    this.status = reason === "unavailable" ? 503 : reason === "forbidden" ? 403 : 401;
    this.code = code ?? (reason === "unavailable" ? "service_unavailable" : reason === "forbidden" ? "forbidden" : "invalid_token");
  }
}

// 인증모델 b — 테넌트 API 토큰. 포크 프론트가 Bearer 토큰으로 중앙 API 호출 →
// 서버가 토큰을 tenant_id로 해석해 withTenant(tenant)로 못박음(클라가 tenant_id 못 속임).
// 원문은 발급 시 1회만 노출, DB엔 sha256 해시만 저장.

export function hashToken(raw: string): string {
  return crypto.createHash("sha256").update(raw).digest("hex");
}

// 토큰 발급(운영자) — 원문 1회 반환. 포크에 전달해 OSMU_TENANT_TOKEN으로 설정.
export async function issueTenantToken(tenantId: string, label?: string): Promise<{ token: string; id: string }> {
  const raw = "osmu_" + crypto.randomBytes(24).toString("base64url");
  const sql = db();
  const [row] = await sql<{ id: string }[]>`
    INSERT INTO tenant_tokens (tenant_id, token_hash, label)
    VALUES (${tenantId}, ${hashToken(raw)}, ${label ?? null}) RETURNING id`;
  return { token: raw, id: row.id };
}

// 토큰 → tenant_id 해석. RLS 컨텍스트 진입 전이라 db() 직접(tenant_tokens는 RLS 제외).
// 폐기/미존재면 null. last_used_at은 비차단 갱신.
export async function resolveTenantToken(raw: string | null | undefined): Promise<string | null> {
  if (!raw) return null;
  const sql = db();
  const h = hashToken(raw);
  const [row] = await sql<{ tenant_id: string }[]>`
    SELECT tenant_id FROM tenant_tokens WHERE token_hash = ${h} AND revoked = false LIMIT 1`;
  if (!row) return null;
  void sql`UPDATE tenant_tokens SET last_used_at = now() WHERE token_hash = ${h}`.catch(() => {});
  return row.tenant_id;
}

// Host 헤더 → tenant_id (커스텀 도메인 CNAME, 호스팅 멀티테넌트). tenants.domain 매핑.
// localhost/빈 host는 skip(운영자 중앙 도메인·dev → fallback 사용).
export async function resolveTenantByHost(request: Request): Promise<string | null> {
  const host = (request.headers.get("host") || "").split(":")[0].toLowerCase();
  if (!host || host === "localhost" || host === "127.0.0.1") return null;
  const sql = db();
  const [row] = await sql<{ id: string }[]>`
    SELECT id FROM tenants WHERE domain = ${host} AND status = 'active' LIMIT 1`;
  return row?.id || null;
}

// auth 유저 → tenant(owner_auth_id 매핑). 없으면 생성(첫 로그인 셀프서브 온보딩).
// tenants는 RLS 제외라 bare db(). slug 충돌은 base+난수로 회피.
// ⚠️ 멱등·레이스 안전: 동시 첫로그인(여러 요청 병렬)이면 SELECT가 둘 다 비어 INSERT가 충돌해
//   unique 위반 throw → 500 → 클라 재시도 폭주 → CPU 100% 고착(2026-06-28 장애). 그래서
//   ON CONFLICT (owner_auth_id) DO UPDATE ... RETURNING로 중복이어도 기존 id를 throw 없이 반환한다.
export async function ensureTenantForUser(
  authId: string,
  email: string | null,
  opts?: { recordAccess?: boolean },
): Promise<string> {
  const sql = db();
  const [existing] = await sql<{ id: string }[]>`SELECT id FROM tenants WHERE owner_auth_id = ${authId} LIMIT 1`;
  if (existing) {
    if (opts?.recordAccess !== false) await recordTenantAccessWithoutBlockingAuth(existing.id);
    return existing.id;
  }
  const base = (email?.split("@")[0] || "user").toLowerCase().replace(/[^a-z0-9]+/g, "-").slice(0, 24) || "user";
  const slug = `${base}-${crypto.randomBytes(3).toString("hex")}`;
  // OSMU v1.0.0 셀프서브 오픈: 신규 가입 = 'active'(계정 자체는 가입 즉시 이용 가능 — 공개 대시보드).
  // 공유 claude -p("공유 AI") 사용은 tenants.shared_cli_approved_at(null=미승인, 기본값)으로 별도
  // 게이트된다(lib/anthropic.ts) — BYO Anthropic 키를 등록하면 그 게이트와 무관하게 즉시 생성 가능.
  // 기존 테넌트는 이 INSERT를 안 타므로 status 영향 없음(ON CONFLICT DO UPDATE는 owner_auth_id만 갱신).
  const [row] = await sql<{ id: string }[]>`
    INSERT INTO tenants (slug, name, status, tier, owner_auth_id)
    VALUES (${slug}, ${email || slug}, 'active', 'team', ${authId})
    ON CONFLICT (owner_auth_id) DO UPDATE SET owner_auth_id = EXCLUDED.owner_auth_id
    RETURNING id`;
  if (opts?.recordAccess !== false) await recordTenantAccessWithoutBlockingAuth(row.id);
  return row.id;
}

// 테넌트 status 조회 — 승인 게이트 판정용. DB 장애는 호출측이 AuthError(503)로 승격.
export async function getTenantStatus(tenantId: string): Promise<string | null> {
  const sql = db();
  const [row] = await sql<{ status: string }[]>`SELECT status FROM tenants WHERE id = ${tenantId} LIMIT 1`;
  return row?.status ?? null;
}

// fail-closed: status='active'만 통과. paused는 기존 code, 그 외(레거시 pending/null/미존재/
// 알수없는 값)는 전부 account_unavailable로 403 — 레이스나 조회 실패를 "통과"로 해석하지 않는다
// (Codex 2nd-pass 반려 수정). OSMU v1.0.0부터 계정 게이트는 paused/unavailable만 — 신규 가입은
// ensureTenantForUser가 즉시 'active'로 생성하므로 'pending' 분기(approval_required)는 제거됐다.
// 공유 AI 사용 승인(별도 entitlement)은 lib/anthropic.ts의 shared_cli_approved_at 게이트를 본다.
async function assertTenantActive(tenantId: string): Promise<void> {
  let status: string | null;
  try {
    status = await getTenantStatus(tenantId);
  } catch {
    reportAuthServiceUnavailable("tenant_status_db_unreachable");
    throw new AuthError("unavailable", "테넌트 상태 확인 실패(DB 연결 불가)");
  }
  if (status === "active") return;
  if (status === "paused") throw new AuthError("forbidden", "계정 이용이 중지되었습니다", "account_paused");
  throw new AuthError("forbidden", "테넌트 상태를 확인할 수 없습니다", "account_unavailable");
}

// 유효 tenantId 결정.
// Bearer가 있으면 그 토큰이 유일한 진실원이다 — 운영자 정확일치만 fallback(쿼리 tenant_id 등으로
// 워크스페이스 선택) 허용, osmu_/JWT는 각각 매핑된 tenant만 반환, 그 외 모든 bearer는 AuthError를
// throw해 fallback/공유 root로 새지 않는다(구 버전 버그: 무효 bearer가 조용히 fallback으로 폴스루).
// Bearer가 아예 없을 때만 CNAME(Host) → 그래도 없으면 fallback. 단 fallback은 "운영자 토큰이
// 아예 설정되지 않았고(=서비스가 인증을 강제할 수 없는 상태) 동시에 dev(NODE_ENV!=production)
// 이거나 명시적 OSMU_AUTH_OPTIONAL=1"일 때만 허용한다(proxy L0-1과 동일 조건). Codex 2nd-pass
// 반려 수정: DASHBOARD_AUTH_TOKEN이 설정된 production에서 Authorization 헤더 없이 오는 요청은
// (프록시가 이미 401을 냈어야 정상이지만) effectiveTenantId 레벨에서도 fallback으로 새지 않게
// 독립적으로 막는다 — 방어심층이 프록시 한 겹에만 의존하지 않도록.
// opts.allowInactive: true면 paused/그 외 비-active 테넌트여도 403 없이 tenantId를 반환한다.
// /api/me 같은 "테넌트 상태 자체를 조회해 화면분기해야 하는" 경로 전용 — 일반 tenant-aware API는
// 기본값(false)으로 호출해 paused/그 외를 403(account_paused/account_unavailable)으로 막는다.
export async function effectiveTenantId(
  request: Request,
  fallback?: string | null,
  opts?: { allowInactive?: boolean },
): Promise<string | null> {
  const raw = request.headers.get("Authorization")?.replace(/^Bearer\s+/i, "") || "";
  const operatorToken = process.env.DASHBOARD_AUTH_TOKEN;

  if (raw) {
    if (operatorToken && raw === operatorToken) return fallback || null;

    if (raw.startsWith("osmu_")) {
      let tenantId: string | null;
      try {
        tenantId = await resolveTenantToken(raw);
      } catch {
        reportAuthServiceUnavailable("osmu_token_db_unreachable");
        throw new AuthError("unavailable", "osmu 토큰 검증 실패(DB 연결 불가)");
      }
      if (!tenantId) throw new AuthError("invalid", "알 수 없거나 폐기된 osmu 토큰");
      if (!opts?.allowInactive) await assertTenantActive(tenantId);
      return tenantId;
    }

    const verified = await verifySupabaseJwt(raw);
    if (verified.status === "unavailable") {
      reportAuthServiceUnavailable("supabase_jwt_verify_unreachable");
      throw new AuthError("unavailable", "세션 토큰 검증 불가(Supabase 연결 실패)");
    }
    if (verified.status === "invalid") {
      throw new AuthError("invalid", "유효하지 않은 세션 토큰");
    }
    const tenantId = await ensureTenantForUser(verified.user.id, verified.user.email ?? null);
    if (!opts?.allowInactive) await assertTenantActive(tenantId);
    return tenantId;
  }

  const fromHost = await resolveTenantByHost(request);
  if (fromHost) return fromHost;

  const authDisabledDev = !operatorToken && (process.env.NODE_ENV !== "production" || process.env.OSMU_AUTH_OPTIONAL === "1");
  if (authDisabledDev) return fallback || null;

  throw new AuthError("invalid", "Authorization 헤더 없음 — 무인증 fallback은 auth-disabled dev에서만 허용");
}
