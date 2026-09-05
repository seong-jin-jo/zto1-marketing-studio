import { getProvider, exchangeCode, exchangeFacebookCode, publicOrigin, verifyState } from "@/lib/social-connect";
import { escapeHtml, oauthErrorMessage } from "@/lib/oauth-errors";
import { resolveExternalIdentity, upsertChannelAccount, syncLegacyIntegration } from "@/lib/channel-accounts";

// GET /api/connect/{provider}/callback?code=...&state=<tenantId>
// provider OAuth 리다이렉트(인증 없음 — middleware 공개). state로 테넌트 식별 → code를 토큰 교환 →
// integrations(kind='channel', label=provider)에 암호화 저장. 비번은 우리를 거치지 않음(ADR-004).
//
// PKCE 채널(X, TikTok): httpOnly 쿠키 pkce_{provider}에서 code_verifier 꺼내 토큰 교환 body에 포함.
// YouTube: refresh_token은 upsertChannelAccount가 channel_accounts.refresh_enc에 암호화 저장한다
// (offline.access 갱신용). meta에는 절대 평문으로 넣지 않는다 — SNS-007 감사에서 지적된 대로
// meta는 JSONB 그대로 저장되는 필드라 여기 refreshToken을 넣으면 암호화 우회 평문 유출이 된다.
// Slack: access_token 또는 authed_user.access_token 자동 처리(exchangeCode 내부).

// SNS-001: 팝업 콜백이 window.close()만 하면 부모 창은 "언제 끝났는지"를 알 방법이 없어
// (부모가 타이머로 폴링하거나, 사용자가 수동 새로고침해야 함) 연결 성공/실패를 놓치거나 낡은
// 상태를 보여줄 수 있다. postMessage로 명시적 결과를 opener에 알리고, 부모는 origin을 엄격히
// 검증한 뒤에만 메시지를 신뢰한다(SocialConnectButton.tsx의 message 리스너와 짝).
// JSON.stringify()의 출력은 HTML-safe가 아니다 — provider가 돌려준 에러 메시지에
// "</script>"가 그대로 들어 있으면(예: error_description=</script><script>alert(1)</script>)
// HTML 파서는 JS 문법을 모른 채 문자열 그대로 스캔하므로 <script> 태그가 조기 종료되고
// 뒤 내용이 실행 가능한 HTML/JS로 주입된다(CVE급 클래식 패턴). 인라인 <script> 안에 JSON을
// 넣을 땐 <, >, &, U+2028/U+2029(JS 문자열에서도 줄바꿈으로 파싱돼 문법 깨짐)를 반드시
// \uXXXX로 이스케이프해야 한다. 출처: OWASP XSS Prevention Cheat Sheet "JSON Encoding" +
// MDN JSON.stringify 문서의 "escaping for use in <script>" 권고 (2026-07-17 확인).
function safeInlineJson(value: unknown): string {
  return JSON.stringify(value)
    .replace(/</g, "\\u003c")
    .replace(/>/g, "\\u003e")
    .replace(/&/g, "\\u0026")
    .replace(/\u2028/g, "\\u2028")
    .replace(/\u2029/g, "\\u2029");
}

function resultHtml(title: string, sub: string, opts: { provider: string; ok: boolean; origin: string }): Response {
  const payload = safeInlineJson({ source: "osmu-oauth-connect", provider: opts.provider, ok: opts.ok, message: sub });
  const targetOrigin = safeInlineJson(opts.origin);
  const html = `<!doctype html><html lang="ko"><head><meta charset="utf-8"><title>${escapeHtml(title)}</title><style>
    :root{--surface:rgb(10 10 10);--text:rgb(255 255 255);--muted:rgb(170 170 170)}
    body{background:var(--surface);color:var(--text);font-family:sans-serif;display:flex;align-items:center;justify-content:center;height:100vh}
    main{text-align:center;max-width:520px;padding:24px}p{color:var(--muted);line-height:1.5}
  </style></head><body>
    <main><h2>${escapeHtml(title)}</h2><p>${escapeHtml(sub)}</p>
    <script>
      try {
        if (window.opener) { window.opener.postMessage(${payload}, ${targetOrigin}); }
      } catch (e) { /* opener가 다른 origin이거나 이미 닫힘 — 무시하고 창은 닫는다 */ }
      setTimeout(function(){ window.close(); }, 1200);
    </script></main></body></html>`;
  const headers = new Headers({ "Content-Type": "text/html; charset=utf-8" });
  // provider는 URL path param이므로, 지원 목록에 있는 값일 때만 cookie name/path에 사용한다.
  // 그렇지 않으면 CRLF 등을 넣은 provider가 Set-Cookie 헤더를 깨거나 주입하는 경로가 될 수 있다.
  const cfg = getProvider(opts.provider);
  if (!cfg) return new Response(html, { headers });

  // state와 PKCE verifier는 callback 응답에서 성공/실패와 무관하게 함께 폐기한다. 실패 응답에서
  // 남겨두면 정상적인 브라우저 재시도·URL 유출로 같은 OAuth 시도를 반복할 여지가 생긴다.
  const isSecure = opts.origin.startsWith("https://");
  const expiredCookies = [
    `oauth_state_${opts.provider}`,
    ...(cfg.pkce ? [`pkce_${opts.provider}`] : []),
  ];
  for (const cookieName of expiredCookies) {
    headers.append("Set-Cookie", [
      `${cookieName}=`,
      "HttpOnly",
      "SameSite=Lax",
      "Max-Age=0",
      `Path=/api/connect/${opts.provider}/callback`,
      ...(isSecure ? ["Secure"] : []),
    ].join("; "));
  }
  return new Response(html, { headers });
}

function readCookie(request: Request, name: string): string | null {
  const prefix = `${name}=`;
  const entry = (request.headers.get("cookie") || "")
    .split(";")
    .map((value) => value.trim())
    .find((value) => value.startsWith(prefix));
  if (!entry) return null;
  try {
    return decodeURIComponent(entry.slice(prefix.length));
  } catch {
    return null;
  }
}

export async function GET(request: Request, { params }: { params: Promise<{ provider: string }> }) {
  const { provider } = await params;
  const { searchParams } = new URL(request.url);
  // 토큰 교환의 redirect_uri도 auth-url과 동일한 공개 origin이어야 한다(Meta가 일치 검증).
  const origin = publicOrigin(request);
  const code = searchParams.get("code") || "";
  const rawState = searchParams.get("state") || ""; // auth-url에서 signState()로 서명해 넣음(CSRF 방지)
  const err = searchParams.get("error_description") || searchParams.get("error");

  const cfg = getProvider(provider);
  const fail = (sub: string) => resultHtml("연결 실패", sub, { provider, ok: false, origin });
  if (!cfg) return fail(`지원하지 않는 provider: ${provider}`);
  if (err) return fail(oauthErrorMessage(String(err), cfg.label).slice(0, 240));
  if (!code || !rawState) return fail("code/state 누락");

  // state 서명·provider 바인딩·만료(10분) 검증 — 위조/재사용된(다른 provider용 포함) state로
  // 남의 테넌트에 연결되는 것을 차단.
  const stateCheck = await verifyState(rawState, provider);
  if (!stateCheck.valid) return fail(stateCheck.reason || "state 검증 실패");
  // HMAC state만 검증하면 유효기간 안의 URL을 다른 브라우저에서 재생할 수 있다. auth-url을
  // 호출한 인증 브라우저에만 심은 httpOnly state 쿠키를 대조해 OAuth callback을 원 요청에 묶고,
  // resultHtml이 Max-Age=0으로 정상적인 순차 재생을 줄인다. 서버 저장 nonce가 없으므로 동시 요청
  // 경쟁까지 원자적으로 1회 소비해야 한다면 별도 state 저장소/스키마가 필요하다.
  if (readCookie(request, `oauth_state_${provider}`) !== rawState) {
    return fail("연결 요청이 현재 브라우저와 일치하지 않거나 이미 처리되었습니다. 대시보드에서 다시 연결하세요.");
  }
  const tenantId = stateCheck.tenantId;
  if (!tenantId) return fail("code/state 누락");

  const key = process.env.OSMU_SECRET_KEY;
  if (!key) return fail("OSMU_SECRET_KEY 미설정 — 토큰 암호화 불가");

  try {
    // PKCE 채널: 쿠키에서 code_verifier 꺼내기
    let codeVerifier: string | undefined;
    if (cfg.pkce) {
      const cookieStr = request.headers.get("cookie") || "";
      const cookieName = `pkce_${provider}=`;
      const match = cookieStr.split(";").map(c => c.trim()).find(c => c.startsWith(cookieName));
      if (match) {
        codeVerifier = decodeURIComponent(match.slice(cookieName.length));
      }
    }

    const tok = provider === "facebook"
      ? await exchangeFacebookCode(code, origin)
      : await exchangeCode(provider, code, origin, { codeVerifier });
    if (!tok.accessToken) {
      // 진단(2026-08-14 회장 재연결 실패 추적): 토큰/시크릿 미포함, 에러 사유만 기록. 원인 확정 후 제거.
      console.error("[connect-callback][exchange-fail]", provider, tok.error);
      return fail(oauthErrorMessage(tok.error || "토큰 교환 실패", cfg.label).slice(0, 240));
    }

    // api 플래그: 발행 라우터가 어느 API 경로를 써야 할지 판별하는 힌트.
    // Meta 계열은 구분자 유지, 표준 OAuth 채널은 provider 라벨 그대로.
    const apiFlag = provider === "instagram"
      ? "instagram_login"
      : provider === "threads"
      ? "threads_login"
      : provider === "facebook"
      ? "facebook_graph"
      : provider;

    // meta 구성: refresh_token은 여기 넣지 않는다 — upsertChannelAccount가 refresh_enc(암호화 컬럼)에
    // 별도로 저장한다(아래 tok.refreshToken 인자). meta는 평문 JSONB라 여기 넣으면 암호화 우회가 된다.
    const meta: Record<string, unknown> = { api: apiFlag, connectedAt: new Date().toISOString() };

    // SNS-007: 저장 전 provider 토큰으로 authoritative 외부 식별자를 resolve한다.
    // `/me`·channels.list를 구현한 provider는 실제 왕복 실패 시 callback을 fail-closed한다.
    // 이 id가 channel_accounts UNIQUE(tenant_id,provider,external_account_id)의 dedup 키라
    // 부정확하면 "재연결"이 "새 계정 추가"로 오분류된다.
    const identity = await resolveExternalIdentity(provider, tok.accessToken, tok.userId, tenantId);
    meta.userId = identity.externalId;
    const tokenExpiresAt = tok.expiresInSeconds
      ? new Date(Date.now() + tok.expiresInSeconds * 1000).toISOString()
      : null;

    const { id: accountId, isDefault, reconnected } = await upsertChannelAccount({
      tenantId,
      provider,
      externalId: identity.externalId,
      displayName: identity.displayName,
      username: identity.username,
      accessToken: tok.accessToken,
      refreshToken: tok.refreshToken,
      meta,
      status: "active",
      tokenExpiresAt,
    });

    // legacy integrations는 "현재 기본계정"만 미러링한다 — 신규 비기본 계정 추가가 기존
    // 기본계정의 토큰을 덮어쓰면 안 된다(요구사항 2). isDefault=true일 때만 동기화.
    if (isDefault) await syncLegacyIntegration(tenantId, provider, accountId);

    const title = reconnected ? `${cfg.label} 연결 새로 고침` : `${cfg.label} 연결 완료`;
    const message = reconnected
      ? "연결을 새로 고쳤습니다. 이 창을 닫고 대시보드로 돌아가세요."
      : "이 창을 닫고 대시보드로 돌아가세요.";
    return resultHtml(title, message, { provider, ok: true, origin });
  } catch (e) {
    // 진단(2026-08-14 회장 재연결 실패 추적): 신원검증/저장 예외 사유 기록(토큰 미포함). 원인 확정 후 제거.
    console.error("[connect-callback][catch]", provider, e instanceof Error ? e.message : String(e));
    return fail(oauthErrorMessage(e instanceof Error ? e.message : String(e), cfg.label).slice(0, 240));
  }
}
