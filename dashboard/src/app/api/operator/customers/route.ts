import { db } from "@/lib/db";
import { ensureTenantForUser } from "@/lib/tenant-auth";
import { reportFailure, normalizeOperatorAction } from "@/lib/observability";
import { publicOrigin } from "@/lib/social-connect";
import { listOAuthCredentialMetadata } from "@/lib/oauth-app-credentials";

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

interface CustomerRow {
  id: string;
  slug: string;
  name: string;
  status: string;
  tier: string;
  owner_auth_id: string | null;
  created_at: string;
  last_accessed_at: string | null;
  recent_access_days_30: number | null;
  shared_cli_approved_at: string | null;
  integrations: Array<{ kind: string; label: string | null; has_secret: boolean; connected_at?: string | null }>;
  channel_accounts: Array<{
    provider: string;
    account_count: number;
    default_username: string | null;
    last_connected_at: string | null;
    default_count: number;
    expiring_at: string | null;
    missing_expiry_count: number;
  }>;
  drafts_count: number;
  published_count: number;
  failed_count: number;
  usage_events_count: number;
  last_usage_at: string | null;
  shorts_used: number | null;
  generations_used: number | null;
}

interface AuthUserRow {
  id: string;
  email: string | null;
  provider: string | null;
  created_at: string;
  email_confirmed_at: string | null;
  confirmation_sent_at: string | null;
  last_sign_in_at: string | null;
  tenant_id: string | null;
  tenant_slug: string | null;
  tenant_status: string | null;
  tenant_shared_ai_approved_at: string | null;
}

// fail-closed: DASHBOARD_AUTH_TOKEN이 설정 안 됐으면(운영 사고) 이 라우트는 무조건 닫는다(503) —
// 과거엔 미설정 시 operatorToken이 falsy라 인증 자체를 건너뛰어(fail-open) 누구나 auth.users +
// integrations 존재여부를 열람할 수 있었다. 토큰이 설정된 경우엔 정확히 일치할 때만 통과(401).
function operatorError(request: Request): Response | null {
  const operatorToken = process.env.DASHBOARD_AUTH_TOKEN || "";
  if (!operatorToken) {
    return Response.json({ error: "operator token not configured" }, { status: 503 });
  }
  const raw = request.headers.get("Authorization")?.replace(/^Bearer\s+/i, "") || "";
  if (raw !== operatorToken) {
    return Response.json({ error: "operator token required" }, { status: 401 });
  }
  return null;
}

export async function GET(request: Request) {
  const authError = operatorError(request);
  if (authError) return authError;

  try {
    const sql = db();
    const rows = await sql<CustomerRow[]>`
      SELECT
        t.id::text,
        t.slug,
        t.name,
        t.status,
        t.tier,
        t.owner_auth_id::text,
        t.created_at::text,
        t.last_accessed_at::text,
        (
          SELECT CASE
            WHEN count(*) = 0 THEN NULL
            ELSE count(DISTINCT (access_event.accessed_at AT TIME ZONE 'UTC')::date)::int
          END
          FROM tenant_access_events access_event
          WHERE access_event.tenant_id = t.id
            AND access_event.accessed_at >= now() - INTERVAL '30 days'
        ) AS recent_access_days_30,
        t.shared_cli_approved_at::text,
        COALESCE((
          SELECT jsonb_agg(jsonb_build_object(
            'kind', i.kind,
            'label', i.label,
            'has_secret', i.secret_enc <> '',
            'connected_at', i.meta->>'connectedAt'
          ) ORDER BY i.kind, i.label)
          FROM integrations i
          WHERE i.tenant_id = t.id
        ), '[]'::jsonb) AS integrations,
        COALESCE((
          SELECT jsonb_agg(jsonb_build_object(
            'provider', grouped.provider,
            'account_count', grouped.account_count,
            'default_username', grouped.default_username,
            'last_connected_at', grouped.last_connected_at,
            'default_count', grouped.default_count,
            'expiring_at', grouped.expiring_at,
            'missing_expiry_count', grouped.missing_expiry_count
          ) ORDER BY grouped.provider)
          FROM (
            SELECT
              ca.provider,
              count(*)::int AS account_count,
              max(CASE WHEN ca.is_default THEN ca.username END) AS default_username,
              max(ca.created_at)::text AS last_connected_at,
              -- 연결이 저장됐는데도 화면이 미연결로 보이는 사고를 값 없이 추측하지 않으려고
              -- 판정 입력 세 가지를 그대로 노출한다. 자격증명은 담지 않는다(2026-09-01).
              count(*) FILTER (WHERE ca.is_default)::int AS default_count,
              max(ca.token_expires_at)::text AS expiring_at,
              count(*) FILTER (WHERE ca.token_expires_at IS NULL)::int AS missing_expiry_count
            FROM channel_accounts ca
            WHERE ca.tenant_id = t.id AND ca.status = 'active'
            GROUP BY ca.provider
          ) grouped
        ), '[]'::jsonb) AS channel_accounts,
        COALESCE((SELECT count(*)::int FROM drafts d WHERE d.tenant_id = t.id), 0) AS drafts_count,
        COALESCE((SELECT count(*)::int FROM published_posts p WHERE p.tenant_id = t.id AND p.status = 'published'), 0) AS published_count,
        COALESCE((SELECT count(*)::int FROM published_posts p WHERE p.tenant_id = t.id AND p.status = 'failed'), 0) AS failed_count,
        COALESCE((SELECT count(*)::int FROM usage_events u WHERE u.tenant_id = t.id), 0) AS usage_events_count,
        (SELECT max(u.created_at)::text FROM usage_events u WHERE u.tenant_id = t.id) AS last_usage_at,
        uq.shorts_used,
        uq.generations_used
      FROM tenants t
      LEFT JOIN usage_quotas uq ON uq.tenant_id = t.id
      ORDER BY t.created_at DESC
      LIMIT 200`;
    // 회원 장부(auth.users)는 Supabase 가 있는 배포에만 있다. 이 조회가 실패해도
    // 작업 공간 목록까지 함께 죽이지 않는다. 한쪽이 없으면 없다고 밝히고 나머지를 준다.
    let authUsersUnavailable: string | null = null;
    const authUsers = await (async () => {
      try {
        return await sql<AuthUserRow[]>`
      SELECT
        u.id::text,
        u.email,
        COALESCE(u.raw_app_meta_data->>'provider', '') AS provider,
        u.created_at::text,
        u.email_confirmed_at::text,
        u.confirmation_sent_at::text,
        u.last_sign_in_at::text,
        t.id::text AS tenant_id,
        t.slug AS tenant_slug,
        t.status AS tenant_status,
        t.shared_cli_approved_at::text AS tenant_shared_ai_approved_at
      FROM auth.users u
      LEFT JOIN tenants t ON t.owner_auth_id = u.id
      ORDER BY u.created_at DESC
      LIMIT 500`;
      } catch (e) {
        authUsersUnavailable = e instanceof Error ? e.message : String(e);
        return [] as AuthUserRow[];
      }
    })();
    const summary = {
      authUsers: authUsers.length,
      workspaces: rows.length,
      activeWorkspaces: rows.filter((row) => row.status === "active").length,
      connectedAccounts: rows.reduce((total, row) => total + (row.channel_accounts || [])
        .reduce((count, item) => count + Number(item.account_count || 0), 0), 0),
      published: rows.reduce((total, row) => total + Number(row.published_count || 0), 0),
      failed: rows.reduce((total, row) => total + Number(row.failed_count || 0), 0),
    };
    const oauthProviders = await listOAuthCredentialMetadata(publicOrigin(request));
    return Response.json({ customers: rows, authUsers, summary, oauthProviders, authUsersUnavailable });
  } catch (e) {
    return Response.json({ customers: [], authUsers: [], error: e instanceof Error ? e.message : String(e) }, { status: 500 });
  }
}

// 공통: user_id → auth.users 존재 검증 후 테넌트 확보(없으면 멱등 생성, OSMU v1.0.0부터 'active').
// 이메일이 아니라 user_id로 키잉한다(이메일은 auth.users에서 unique/stable 식별자가 아니므로
// 이메일 기반 뮤테이션은 의도적으로 금지). 이 레포는 GoTrue REST admin API(service_role key)를
// 어디서도 쓰지 않고 auth.users를 직접 Postgres로 조회하는 패턴을 이미 GET에서 쓰고 있어
// (admin listUsers/getUserById도 내부적으로 이 테이블을 조회) 동일 패턴을 따른다.
async function resolveTargetTenant(userId: unknown): Promise<{ error: Response } | { tenantId: string; id: string }> {
  const id = String(userId || "").trim();
  if (!id || !UUID_RE.test(id)) {
    return { error: Response.json({ error: "valid user_id required" }, { status: 400 }) };
  }
  const sql = db();
  const [authUser] = await sql<{ id: string; email: string | null }[]>`
    SELECT id::text, email FROM auth.users WHERE id = ${id} LIMIT 1`;
  if (!authUser) {
    return { error: Response.json({ error: "unknown user_id" }, { status: 404 }) };
  }
  // 운영자의 계정 조치는 고객 접속이 아니다. 아직 로그인하지 않은 가입자를 정지·재개해도
  // 접속 이력을 만들지 않도록 명시적으로 기록을 끈다.
  const tenantId = await ensureTenantForUser(authUser.id, authUser.email, { recordAccess: false });
  return { tenantId, id };
}

// 계정 정지/재개 — 계정 자체 접근(tenants.status)만 다룬다. OSMU v1.0.0부터 신규 가입은 이미
// active라 "승인"(approve_user) 액션은 없다 — 있는 건 정지(pause_user)와 그 해제(resume_user)뿐.
async function handleAccountStatusAction(action: "pause_user" | "resume_user", userId: unknown): Promise<Response> {
  const resolved = await resolveTargetTenant(userId);
  if ("error" in resolved) return resolved.error;
  const { tenantId, id } = resolved;
  const targetStatus = action === "resume_user" ? "active" : "paused";
  const sql = db();
  await sql`UPDATE tenants SET status = ${targetStatus} WHERE id = ${tenantId}`;
  return Response.json({ ok: true, action, user_id: id, tenant_id: tenantId, status: targetStatus });
}

// 공유 AI(claude -p) 사용 승인/회수 — 계정 접근(paused/active)과 분리된 별도 entitlement
// (tenants.shared_cli_approved_at). 계정이 paused여도 이 액션 자체는 실행 가능(재개 시 바로
// 반영되도록) — 접근 게이트는 tenant-auth.ts/proxy.ts가 별도로 강제한다.
async function handleSharedAiApprovalAction(action: "approve_shared_ai" | "revoke_shared_ai", userId: unknown): Promise<Response> {
  const resolved = await resolveTargetTenant(userId);
  if ("error" in resolved) return resolved.error;
  const { tenantId, id } = resolved;
  const sql = db();
  const approved = action === "approve_shared_ai";
  if (approved) {
    await sql`UPDATE tenants SET shared_cli_approved_at = now() WHERE id = ${tenantId}`;
  } else {
    await sql`UPDATE tenants SET shared_cli_approved_at = NULL WHERE id = ${tenantId}`;
  }
  return Response.json({ ok: true, action, user_id: id, tenant_id: tenantId, shared_ai_approved: approved });
}

export async function POST(request: Request) {
  const authError = operatorError(request);
  if (authError) return authError;

  let actionForReport: string | undefined;
  try {
    const body = await request.json().catch(() => ({})) as { action?: string; user_id?: string };
    actionForReport = body.action;

    if (body.action === "pause_user" || body.action === "resume_user") {
      return await handleAccountStatusAction(body.action, body.user_id);
    }
    if (body.action === "approve_shared_ai" || body.action === "revoke_shared_ai") {
      return await handleSharedAiApprovalAction(body.action, body.user_id);
    }

    // 고객 인증은 Google OAuth 전용(SMTP/Resend/이메일 재설정 없음) — send_password_reset을 포함한
    // 그 외 모든 action은 미지원. 4개 user_id 기반 액션만 허용한다.
    return Response.json({ error: "unsupported action" }, { status: 400 });
  } catch (e) {
    // 운영자 뮤테이션(정지/재개/공유AI 승인·회수) 실행 실패 — 고위험 경계.
    // action(요청 바디 원문, 공격자 통제 가능)은 고정 enum으로 정규화한 값만 담고, user_id/
    // e.message(임의 텍스트)는 애초에 넘기지 않는다(observability.ts 스키마가 마지막 방어선).
    // 응답 status/body는 기존 그대로(fire-and-forget이 이 500 응답을 바꾸지 않는다).
    void reportFailure({
      event: "operator_mutation_failed",
      severity: "error",
      context: { action: normalizeOperatorAction(actionForReport) },
    });
    return Response.json({ error: e instanceof Error ? e.message : String(e) }, { status: 500 });
  }
}
