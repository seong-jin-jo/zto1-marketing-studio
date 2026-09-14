import { effectiveTenantId } from "@/lib/tenant-auth";
import { getProvider, buildAuthUrl, publicOrigin, generateCodeVerifier, generateCodeChallenge, signState } from "@/lib/social-connect";
import { auditConnectTenantQueryMismatch } from "@/lib/connect-tenant-audit";

// GET /api/connect/{provider}?tenant_id=... — OAuth "연결" 동의 URL 반환.
// 프론트의 "연결" 버튼이 호출 → 받은 authUrl을 팝업으로 연다 → 사용자가 provider 공식 페이지에서
// 로그인/동의(비번은 거기서만) → callback이 토큰을 받아 테넌트별 저장. (ADR-004)
//
// PKCE 채널(X, TikTok): code_verifier 생성 → httpOnly 쿠키(10분) 저장,
//   code_challenge(SHA-256) → authUrl에 첨부. callback에서 쿠키 꺼내 검증.
export async function GET(request: Request, { params }: { params: Promise<{ provider: string }> }) {
  const { provider } = await params;
  const cfg = getProvider(provider);
  if (!cfg) return Response.json({ error: `지원하지 않는 provider: ${provider}` }, { status: 400 });

  const requestedTenantId = new URL(request.url).searchParams.get("tenant_id");
  const tenantId = await effectiveTenantId(request, requestedTenantId);
  if (!tenantId) return Response.json({ error: "tenant_id required" }, { status: 400 });
  auditConnectTenantQueryMismatch(request, tenantId, requestedTenantId);

  const origin = publicOrigin(request);

  // PKCE 채널: code_verifier 생성 → SHA-256 challenge 계산 → 쿠키에 verifier 저장
  let extraParams: Record<string, string> | undefined;
  const cookieHeaders: string[] = [];

  if (cfg.pkce) {
    const verifier = generateCodeVerifier();
    const challenge = await generateCodeChallenge(verifier);
    extraParams = { code_challenge: challenge, code_challenge_method: "S256" };
    // httpOnly 쿠키(10분) — callback GET 요청에 자동 첨부(SameSite=Lax: OAuth 리다이렉트는 top-level GET이므로 OK)
    const isSecure = origin.startsWith("https://");
    cookieHeaders.push([
      `pkce_${provider}=${encodeURIComponent(verifier)}`,
      "HttpOnly",
      "SameSite=Lax",
      "Max-Age=600",
      `Path=/api/connect/${provider}/callback`,
      ...(isSecure ? ["Secure"] : []),
    ].join("; "));
  }

  // state는 서명만으로 끝내지 않고 이 브라우저에만 httpOnly 쿠키로도 묶는다. callback은 이 쿠키와
  // 정확히 일치하는 state만 수락하고 응답에서 쿠키를 만료한다. 따라서 유효한 state URL이 유출돼도
  // 다른 브라우저가 같은 provider callback을 재생해 피해자 tenant에 계정을 연결할 수 없다.
  const state = await signState(tenantId, provider);
  // 다른 계정으로 바꾸려는 요청이면 제공자에게 계정 선택 화면을 강제로 띄우라고 말한다.
  //
  // 2026-09-09 회장 지적: "X는 다른 계정으로 로그인하는게 왜 없음."
  // 화면에는 "다른 계정으로 연결하고 싶어요" 가 있었지만 그것은 **안내문**이었다.
  // 누르면 "X 에서 먼저 로그아웃하세요" 라는 설명이 펼쳐질 뿐 계정을 바꾸는 동작이 없다.
  // 사용자에게는 그 둘이 같아 보이지 않는다. 시키기만 하고 해 주지 않으면 없는 기능이다.
  //
  // 제공자마다 이름이 다르다. X 는 force_login, Google 은 prompt=select_account,
  // Meta 계열은 auth_type=reauthenticate 로 같은 뜻을 전한다.
  if (new URL(request.url).searchParams.get("switch_account") === "1") {
    const forceChoice: Record<string, Record<string, string>> = {
      x: { force_login: "true" },
      youtube: { prompt: "select_account consent" },
      facebook: { auth_type: "reauthenticate" },
      instagram: { auth_type: "reauthenticate" },
      threads: { auth_type: "reauthenticate" },
    };
    const forced = forceChoice[provider];
    if (forced) extraParams = { ...(extraParams || {}), ...forced };
  }

  const authUrl = await buildAuthUrl(cfg, origin, provider, state, extraParams);
  if (!authUrl) {
    const reason = provider === "facebook"
      ? "Facebook OAuth 앱 자격증명(FB_APP_ID/FB_APP_SECRET/FB_CONFIG_ID)이 미설정 또는 불완전합니다."
      : `${cfg.label} OAuth 앱 자격증명이 미설정 또는 불완전합니다.`;
    return Response.json({ error: reason }, { status: 503 });
  }

  const isSecure = origin.startsWith("https://");
  cookieHeaders.push([
    `oauth_state_${provider}=${encodeURIComponent(state)}`,
    "HttpOnly",
    "SameSite=Lax",
    "Max-Age=600",
    `Path=/api/connect/${provider}/callback`,
    ...(isSecure ? ["Secure"] : []),
  ].join("; "));
  const headers = new Headers();
  for (const cookie of cookieHeaders) headers.append("Set-Cookie", cookie);
  return Response.json({ authUrl }, { headers });
}
