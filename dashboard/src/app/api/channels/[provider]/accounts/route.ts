import { UPSTREAM_FAILED } from "@/lib/api-failure";
import { effectiveTenantId, AuthError } from "@/lib/tenant-auth";
import { listChannelAccounts, upsertChannelAccount, syncLegacyIntegration } from "@/lib/channel-accounts";

// SNS-007: provider별 다중 계정 관리 REST API.
// GET  /api/channels/{provider}/accounts       — 목록(토큰 절대 미반환 — listChannelAccounts가 이미 컬럼 화이트리스트)
// POST /api/channels/{provider}/accounts       — 수동 계정 등록(현재 Bluesky만: OAuth가 아니라 App Password 방식)
//
// OAuth provider(threads/x/instagram/facebook/youtube 등)는 이 POST가 아니라 /api/connect/{provider}/auth-url
// 흐름으로 계정을 추가한다(재연결 = 새 계정, callback route가 upsertChannelAccount 처리).

async function resolveTenant(request: Request): Promise<{ tenantId: string } | Response> {
  let tenantId: string | null;
  try {
    tenantId = await effectiveTenantId(request, new URL(request.url).searchParams.get("tenant_id"));
  } catch (e) {
    if (e instanceof AuthError) return Response.json({ error: e.message, code: e.code }, { status: e.status });
    return Response.json({ error: e instanceof Error ? e.message : String(e) }, { status: 500 });
  }
  if (!tenantId) return Response.json({ error: "테넌트를 식별할 수 없습니다." }, { status: 401 });
  return { tenantId };
}

export async function GET(request: Request, { params }: { params: Promise<{ provider: string }> }) {
  const { provider } = await params;
  const resolved = await resolveTenant(request);
  if (resolved instanceof Response) return resolved;
  try {
    const accounts = await listChannelAccounts(resolved.tenantId, provider);
    return Response.json({ accounts });
  } catch (e) {
    return Response.json({ error: e instanceof Error ? e.message : String(e) }, { status: 500 });
  }
}

// Bluesky createSession 응답 최소 형태 — 원문 응답을 그대로 클라에 노출하지 않기 위해 필요 필드만 취급.
interface BlueskySession {
  did?: string;
  handle?: string;
  accessJwt?: string;
  refreshJwt?: string;
}

function koreanBlueskyError(status: number): string {
  if (status === 401 || status === 400) return "Bluesky 핸들과 App Password를 다시 확인해 입력해주세요.";
  if (status === 429) return "Bluesky API 요청이 일시적으로 제한되었습니다. 잠시 후 다시 시도해주세요.";
  if (status >= 500) return "Bluesky 서버가 일시적으로 응답하지 않습니다. 잠시 후 다시 시도해주세요.";
  return `Bluesky 연결에 실패했습니다 (오류 코드 ${status}).`;
}

export async function POST(request: Request, { params }: { params: Promise<{ provider: string }> }) {
  const { provider } = await params;
  const resolved = await resolveTenant(request);
  if (resolved instanceof Response) return resolved;

  if (provider !== "bluesky") {
    return Response.json(
      { error: `${provider}는 OAuth 연결만 지원합니다. /api/connect/${provider}/auth-url을 사용하세요.` },
      { status: 400 },
    );
  }

  let body: { handle?: string; appPassword?: string };
  try {
    body = await request.json();
  } catch {
    return Response.json({ error: "요청 본문이 올바르지 않습니다." }, { status: 400 });
  }
  const handle = (body.handle || "").trim();
  const appPassword = body.appPassword || "";
  if (!handle || !appPassword) {
    return Response.json({ error: "Bluesky 핸들과 App Password를 모두 입력해주세요." }, { status: 400 });
  }

  let session: BlueskySession;
  try {
    const res = await fetch("https://bsky.social/xrpc/com.atproto.server.createSession", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ identifier: handle, password: appPassword }),
      signal: AbortSignal.timeout(5000),
    });
    const data = (await res.json()) as BlueskySession;
    if (!res.ok || !data.did || !data.accessJwt) {
      return Response.json({ error: koreanBlueskyError(res.status) }, { status: res.status === 401 || res.status === 400 ? 400 : 502 });
    }
    session = data;
  } catch {
    return Response.json({ ok: false, error: "Bluesky 서버에 연결할 수 없습니다. 잠시 후 다시 시도해주세요." }, { status: UPSTREAM_FAILED });
  }

  try {
    // resolveExternalIdentity를 거치지 않는다 — Bluesky는 OAuth가 아니라 createSession 응답 자체가
    // authoritative id(did)를 이미 제공한다(2026-07-17 확인: AT Protocol
    // com.atproto.server.createSession 응답의 did가 계정의 영구 식별자 — handle은 변경 가능하므로
    // dedup 키로 부적합해 did를 external_account_id로 쓴다).
    const { id: accountId, isDefault } = await upsertChannelAccount({
      tenantId: resolved.tenantId,
      provider: "bluesky",
      externalId: session.did!,
      username: session.handle,
      displayName: session.handle,
      accessToken: session.accessJwt!,
      refreshToken: session.refreshJwt,
      meta: { handle: session.handle, api: "bluesky_app_password" },
    });
    if (isDefault) await syncLegacyIntegration(resolved.tenantId, "bluesky", accountId);
    return Response.json({ ok: true, accountId, isDefault, account: `@${session.handle || ""}` });
  } catch (e) {
    return Response.json({ error: e instanceof Error ? e.message : String(e) }, { status: 500 });
  }
}
