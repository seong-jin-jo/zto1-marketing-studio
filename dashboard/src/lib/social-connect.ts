// 소셜 채널 OAuth "연결" 헬퍼 (ADR-004 — 고객은 비번 없이 버튼만, 우리가 토큰 받아 저장).
// 고객이 "연결" 클릭 → provider OAuth 동의 → callback이 code를 토큰으로 교환 → integrations(per-tenant)
// 에 저장. 비번은 절대 우리를 거치지 않음(provider 공식 페이지에서만).
//
// 앱 자격증명은 플랫폼 env(우리 앱 하나). 고객별 발급이 아니라 우리 앱이 OAuth 주체.
//
// PKCE(Proof Key for Code Exchange, RFC 7636) — X·TikTok 필수.
//   code_verifier(32바이트 랜덤 → base64url) → SHA-256 → code_challenge(base64url)
//   verifier는 httpOnly 쿠키(10분)에 임시 저장 → callback에서 꺼내 검증.

import { resolveOAuthCredentialSet } from "@/lib/oauth-app-credentials";

export interface ProviderConfig {
  label: string;            // integrations.label
  authorizeUrl: string;
  scopes: string[];
  appIdEnv: string;
  appSecretEnv: string;
  tokenUrl: string;         // 단기 토큰 교환(POST form)
  longTokenUrl: string;     // 장기 토큰 교환(GET). "" = 표준 OAuth(단계 없음)
  longGrant: string;        // ig_exchange_token | th_exchange_token | "" (표준 OAuth)
  pkce?: boolean;           // PKCE(RFC 7636) 필수 여부 — X, TikTok
  scopeSeparator?: string;  // scope 구분자. 기본 "," (Meta계열). 표준 OAuth는 " "
  extraAuthParams?: Record<string, string>; // authorize URL 추가 파라미터(YouTube: access_type, prompt)
  clientIdParam?: string;   // provider가 client_id 대신 쓰는 이름(TikTok: client_key)
}

// ── PKCE 헬퍼(RFC 7636) ──────────────────────────────────────────────────────
// Web Crypto API 사용(Node.js 18+·Edge Runtime 모두 지원).

/** 32바이트 랜덤 base64url code_verifier (43자) */
export function generateCodeVerifier(): string {
  const bytes = new Uint8Array(32);
  crypto.getRandomValues(bytes);
  return base64urlEncode(bytes);
}

/** code_verifier → SHA-256 → base64url code_challenge */
export async function generateCodeChallenge(verifier: string): Promise<string> {
  const data = new TextEncoder().encode(verifier);
  const digest = await crypto.subtle.digest("SHA-256", data);
  return base64urlEncode(new Uint8Array(digest));
}

function base64urlEncode(bytes: Uint8Array): string {
  return btoa(String.fromCharCode(...Array.from(bytes)))
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=/g, "");
}

function base64urlDecode(input: string): Uint8Array {
  const b64 = input.replace(/-/g, "+").replace(/_/g, "/");
  const pad = b64.length % 4;
  const padded = pad === 0 ? b64 : b64 + "=".repeat(4 - pad);
  const binary = atob(padded);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
  return bytes;
}

// ── OAuth state 서명(HMAC) ───────────────────────────────────────────────────
// state=tenantId 평문은 위조 가능(CSRF — 공격자가 남의 tenantId로 콜백을 조작해 자기 계정에
// 연결시킬 수 있음). state를 `base64url(JSON.stringify({t,p,ts})).HMAC(OSMU_SECRET_KEY, 그 base64url문자열)`
// 2-파트로 서명하고 callback에서 서명·payload 파싱·provider 일치·만료(10분)를 검증한다.
// payload를 JSON으로 직렬화 후 base64url로 감싸는 이유: tenantId/provider를 "."로 직접 이어붙이면
// (예: 구버전 `tenantId.provider.timestamp.sig`) tenantId 자체에 "."가 섞일 경우 split(".")이
// 필드 경계를 잘못 잡아 정상 서명 state도 거부될 수 있었다(Codex 2nd-pass Major, 2026-07-10 —
// 현재 tenantId는 UUID/slug라 실위험은 낮지만 구분자 주입/파싱 혼동은 견고성 결함). JSON+base64url은
// 필드를 이스케이프해 직렬화하므로 tenantId/provider에 어떤 문자가 들어가도 파싱이 어긋나지 않는다.
// OSMU_SECRET_KEY 미설정(로컬 dev)이면 서명 없이 평문 tenantId로 폴백.
// ⚠️ 키가 설정된 환경(prod)에서는 평문/서명되지 않은 state를 절대 신뢰하지 않는다 — 신뢰하면
// "평문 state 다운그레이드 공격"(공격자가 state=<victimTenantId>로 직접 OAuth를 열어 callback이
// 그 값을 그대로 믿고 피해자 테넌트에 공격자 토큰을 저장)이 가능해진다(Codex 2nd-pass Critical, 2026-07-10).
// provider를 서명 payload에 묶는 이유: 안 묶으면 유출된 signed state를 같은 테넌트의 "다른"
// provider callback에 10분 내 재사용(cross-provider replay)할 수 있다(Codex 2nd-pass Major, 2026-07-10).
// TODO(후속 스코프): "같은" provider에 대한 재사용(single-provider replay)까지 막으려면 state를
// one-time nonce로 만들어 httpOnly 쿠키 또는 DB에 소비 기록을 남겨야 한다 — 이번 스코프 밖.
const STATE_MAX_AGE_MS = 10 * 60 * 1000; // 10분

async function hmacSha256Hex(key: string, message: string): Promise<string> {
  const enc = new TextEncoder();
  const cryptoKey = await crypto.subtle.importKey(
    "raw",
    enc.encode(key),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"],
  );
  const sig = await crypto.subtle.sign("HMAC", cryptoKey, enc.encode(message));
  return Array.from(new Uint8Array(sig)).map((b) => b.toString(16).padStart(2, "0")).join("");
}

interface StatePayload {
  t: string;  // tenantId
  p: string;  // provider
  ts: number; // 발급 시각(ms epoch)
}

/** authorize URL에 실을 state 생성. 키 없으면 평문 tenantId(레거시/로컬 dev 폴백). */
export async function signState(tenantId: string, provider: string): Promise<string> {
  const secret = process.env.OSMU_SECRET_KEY;
  if (!secret) return tenantId;
  const payload: StatePayload = { t: tenantId, p: provider, ts: Date.now() };
  const payloadB64 = base64urlEncode(new TextEncoder().encode(JSON.stringify(payload)));
  const sig = await hmacSha256Hex(secret, payloadB64);
  return `${payloadB64}.${sig}`;
}

export interface VerifiedState {
  tenantId: string;
  valid: boolean;
  reason?: string;
}

// 상수시간 비교 — 일반 `!==` 문자열 비교는 첫 불일치 문자에서 조기 반환해 응답시간으로
// 서명을 한 글자씩 추정하는 타이밍 공격에 취약하다(HMAC 검증에서 표준적으로 피해야 하는 패턴).
function timingSafeEqualHex(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return diff === 0;
}

/**
 * callback이 받은 state를 검증. provider(URL의 실제 provider)와 교차검증해 다른 provider용으로
 * 발급된 state의 재사용을 막는다.
 *
 * - OSMU_SECRET_KEY 미설정(로컬 dev): 서명 검증 자체가 불가하므로 state 전체를 그대로 tenantId로
 *   신뢰한다(signState도 키 없으면 평문 tenantId를 그대로 반환하므로 왕복이 일치 — 레거시/로컬 dev 폴백).
 * - OSMU_SECRET_KEY 설정(prod): `base64url(payload).sig` 2-파트 형식이 아닌 state는 무조건 거부한다.
 *   키가 있는데 평문을 신뢰하면 다운그레이드 공격이 그대로 열린다 — "키 있음 + 평문 state"를
 *   valid로 반환하면 안 된다(Codex 2nd-pass Critical, 2026-07-10).
 *   서명은 payload를 파싱하기 "전"에 검증한다 — 인증 안 된(위조 가능한) 데이터를 먼저 파싱하지 않기 위함.
 */
export async function verifyState(state: string, provider: string): Promise<VerifiedState> {
  const secret = process.env.OSMU_SECRET_KEY;

  if (!secret) {
    // 로컬 dev 폴백 — 서명 검증이 원천적으로 불가하므로 state 전체를 tenantId로 신뢰한다.
    return { tenantId: state, valid: true };
  }

  const parts = state.split(".");
  if (parts.length !== 2) {
    return { tenantId: "", valid: false, reason: "state 서명 형식이 아닙니다(다운그레이드 공격 의심) — 연결을 다시 시도하세요" };
  }
  const [payloadB64, sig] = parts;

  const expected = await hmacSha256Hex(secret, payloadB64);
  if (!timingSafeEqualHex(expected, sig)) {
    return { tenantId: "", valid: false, reason: "state 서명이 위조되었거나 손상되었습니다" };
  }

  let payload: Partial<StatePayload>;
  try {
    payload = JSON.parse(new TextDecoder().decode(base64urlDecode(payloadB64))) as Partial<StatePayload>;
  } catch {
    return { tenantId: "", valid: false, reason: "state payload가 손상되었습니다" };
  }
  if (typeof payload.t !== "string" || !payload.t || typeof payload.p !== "string" || typeof payload.ts !== "number") {
    return { tenantId: "", valid: false, reason: "state payload 형식이 올바르지 않습니다" };
  }
  if (payload.p !== provider) {
    return { tenantId: "", valid: false, reason: "state가 다른 provider용으로 발급되었습니다(재사용 의심)" };
  }
  const age = Date.now() - payload.ts;
  if (!Number.isFinite(age) || age < 0 || age > STATE_MAX_AGE_MS) {
    return { tenantId: "", valid: false, reason: "state가 만료되었습니다(10분 초과) — 연결을 다시 시도하세요" };
  }
  return { tenantId: payload.t, valid: true };
}

// ── Instagram·Threads (Meta LoginAPI — 단기→장기 2단계 교환) ─────────────────
// ── 표준 OAuth 2.0 채널 (longTokenUrl/longGrant = "" → 단일 교환) ────────────
export const PROVIDERS: Record<string, ProviderConfig> = {
  instagram: {
    label: "instagram",
    authorizeUrl: "https://www.instagram.com/oauth/authorize",
    scopes: [
      "instagram_business_basic",
      "instagram_business_content_publish",
      "instagram_business_manage_comments",
      // 쓰는 화면이 없어 첫 심사 범위에서 제외한다. 인사이트 화면 구현 후 2차 제출에 추가한다.
    ],
    appIdEnv: "IG_APP_ID",
    appSecretEnv: "IG_APP_SECRET",
    tokenUrl: "https://api.instagram.com/oauth/access_token",
    longTokenUrl: "https://graph.instagram.com/access_token",
    longGrant: "ig_exchange_token",
  },
  threads: {
    label: "threads",
    authorizeUrl: "https://threads.net/oauth/authorize",
    scopes: ["threads_basic", "threads_content_publish", "threads_manage_insights", "threads_read_replies", "threads_manage_replies"],
    appIdEnv: "THREADS_APP_ID",
    appSecretEnv: "THREADS_APP_SECRET",
    tokenUrl: "https://graph.threads.net/oauth/access_token",
    longTokenUrl: "https://graph.threads.net/access_token",
    longGrant: "th_exchange_token",
  },
  x: {
    label: "x",
    authorizeUrl: "https://twitter.com/i/oauth2/authorize",
    scopes: ["tweet.read", "tweet.write", "users.read", "offline.access"],
    appIdEnv: "X_CLIENT_ID",
    appSecretEnv: "X_CLIENT_SECRET",
    tokenUrl: "https://api.twitter.com/2/oauth2/token",
    longTokenUrl: "",
    longGrant: "",
    pkce: true,
    scopeSeparator: " ",
  },
  linkedin: {
    label: "linkedin",
    authorizeUrl: "https://www.linkedin.com/oauth/v2/authorization",
    scopes: ["openid", "profile", "w_member_social"],
    appIdEnv: "LINKEDIN_CLIENT_ID",
    appSecretEnv: "LINKEDIN_CLIENT_SECRET",
    tokenUrl: "https://www.linkedin.com/oauth/v2/accessToken",
    longTokenUrl: "",
    longGrant: "",
    scopeSeparator: " ",
  },
  youtube: {
    label: "youtube",
    authorizeUrl: "https://accounts.google.com/o/oauth2/v2/auth",
    scopes: ["https://www.googleapis.com/auth/youtube.upload", "https://www.googleapis.com/auth/youtube"],
    appIdEnv: "YOUTUBE_CLIENT_ID",
    appSecretEnv: "YOUTUBE_CLIENT_SECRET",
    tokenUrl: "https://oauth2.googleapis.com/token",
    longTokenUrl: "",
    longGrant: "",
    scopeSeparator: " ",
    extraAuthParams: { access_type: "offline", prompt: "consent select_account" },
  },
  naver_blog: {
    label: "naver_blog",
    authorizeUrl: "https://nid.naver.com/oauth2.0/authorize",
    scopes: ["blog"],
    appIdEnv: "NAVER_CLIENT_ID",
    appSecretEnv: "NAVER_CLIENT_SECRET",
    tokenUrl: "https://nid.naver.com/oauth2.0/token",
    longTokenUrl: "",
    longGrant: "",
    scopeSeparator: " ",
  },
  pinterest: {
    label: "pinterest",
    authorizeUrl: "https://www.pinterest.com/oauth/",
    scopes: ["boards:read", "pins:write"],
    appIdEnv: "PINTEREST_APP_ID",
    appSecretEnv: "PINTEREST_APP_SECRET",
    tokenUrl: "https://api.pinterest.com/v5/oauth/token",
    longTokenUrl: "",
    longGrant: "",
    scopeSeparator: " ",
  },
  tumblr: {
    label: "tumblr",
    authorizeUrl: "https://www.tumblr.com/oauth2/authorize",
    scopes: ["write", "basic"],
    appIdEnv: "TUMBLR_CONSUMER_KEY",
    appSecretEnv: "TUMBLR_CONSUMER_SECRET",
    tokenUrl: "https://api.tumblr.com/v2/oauth2/token",
    longTokenUrl: "",
    longGrant: "",
    scopeSeparator: " ",
  },
  tiktok: {
    label: "tiktok",
    authorizeUrl: "https://www.tiktok.com/v2/auth/authorize/",
    scopes: ["user.info.basic", "video.publish"],
    appIdEnv: "TIKTOK_CLIENT_KEY",
    appSecretEnv: "TIKTOK_CLIENT_SECRET",
    tokenUrl: "https://open.tiktokapis.com/v2/oauth/token/",
    longTokenUrl: "",
    longGrant: "",
    pkce: true,
    scopeSeparator: ",",
    clientIdParam: "client_key",
    extraAuthParams: { disable_auto_auth: "1" },
  },
  slack: {
    label: "slack",
    authorizeUrl: "https://slack.com/oauth/v2/authorize",
    scopes: ["chat:write"],
    appIdEnv: "SLACK_CLIENT_ID",
    appSecretEnv: "SLACK_CLIENT_SECRET",
    tokenUrl: "https://slack.com/api/oauth.v2.access",
    longTokenUrl: "",
    longGrant: "",
    scopeSeparator: " ",
  },
  line: {
    label: "line",
    authorizeUrl: "https://access.line.me/oauth2/v2.1/authorize",
    scopes: ["profile", "openid"],
    appIdEnv: "LINE_CLIENT_ID",
    appSecretEnv: "LINE_CLIENT_SECRET",
    tokenUrl: "https://api.line.me/oauth2/v2.1/token",
    longTokenUrl: "",
    longGrant: "",
    scopeSeparator: " ",
  },
};

// Facebook은 "비즈니스용 Facebook 로그인"(Facebook Login for Business) 앱이다.
// classic Facebook Login과 달리 authorize dialog에서 scope 대신 config_id를 넘긴다:
//   "config_id has replaced scope ... we recommend that you do not use [scope]"
//   — https://developers.facebook.com/documentation/facebook-login/facebook-login-for-business
// config_id는 사람이 App Dashboard에서 login configuration을 만들면 발급되는 값으로,
// 그 configuration에 pages_manage_posts / pages_show_list 등 권한·asset이 묶인다.
// 코드는 이 값을 env FB_CONFIG_ID 로 "소비"만 한다(콘솔서 생성 → 여기서 사용).
// 토큰 교환(exchangeFacebookCode)은 classic manual-flow와 동일 엔드포인트를 쓴다:
//   GET graph.facebook.com/v21.0/oauth/access_token?client_id&client_secret&redirect_uri&code
//   — https://developers.facebook.com/docs/facebook-login/guides/advanced/manual-flow/
// 페이지 토큰 흐름(user token → /me/accounts → page token)은 그대로 유효.
export const FACEBOOK = {
  label: "facebook",
  authorizeUrl: "https://www.facebook.com/v21.0/dialog/oauth",
  // scope는 config_id 모델에서 미사용(참고용으로만 남김 — buildAuthUrl은 config_id를 보낸다).
  scopes: ["pages_show_list", "pages_manage_posts", "pages_read_engagement"],
  appIdEnv: "FB_APP_ID",
  appSecretEnv: "FB_APP_SECRET",
  configIdEnv: "FB_CONFIG_ID",
};

export function getProvider(name: string): ProviderConfig | null {
  if (name === "facebook") {
    // FACEBOOK는 별도 흐름이나 auth-url 구성은 동일 필드만 필요 — shim.
    return { ...FACEBOOK, tokenUrl: "", longTokenUrl: "", longGrant: "" } as ProviderConfig;
  }
  // URL path param은 신뢰할 수 없다. 일반 객체의 `PROVIDERS[name]` 조회는 `toString` 같은
  // Object.prototype 속성도 반환하므로, 지원 provider key 자체만 명시적으로 허용한다.
  return Object.hasOwn(PROVIDERS, name) ? PROVIDERS[name] : null;
}

export function redirectUri(origin: string, provider: string): string {
  return `${origin}/api/connect/${provider}/callback`;
}

// 공개 origin 확정 — OAuth redirect_uri는 Meta 콘솔 등록값과 "글자까지" 일치해야 한다.
// 리버스 프록시(Cloudflare 터널) 뒤에선 request.url이 컨테이너 내부 bind(0.0.0.0:PORT)를 가리켜
// redirect_uri가 어긋난다("Invalid redirect_uri" 실측 2026-07-03). 그래서:
//   1) OSMU_PUBLIC_URL (배포가 아는 정본 공개 URL) — 가장 확실, 애매함 0.
//   2) x-forwarded-proto/host (프록시가 넘긴 원 Host).
//   3) request.url.origin (로컬 dev fallback).
// 도메인은 env로만 — 공개 레포에 하드코딩 금지.
export function publicOrigin(request: Request): string {
  const env = process.env.OSMU_PUBLIC_URL;
  if (env) return env.replace(/\/+$/, "");
  const h = request.headers;
  const host = h.get("x-forwarded-host") || h.get("host");
  if (host) {
    const proto = h.get("x-forwarded-proto") || "https";
    return `${proto}://${host}`;
  }
  return new URL(request.url).origin;
}

// SNS-015: 프로바이더(Meta)가 서버 대 서버로 직접 가져가는 signed video_url 전용 origin.
// publicOrigin()의 x-forwarded-host/host 폴백은 OAuth redirect_uri(브라우저가 같은 요청으로
// 왕복하는 값)에는 안전하지만, 여기서는 위조 가능한 요청 헤더가 "Meta가 실제로 접근 가능한
// 도메인"을 대신 결정하게 둘 수 없다(헤더를 조작해 내부/사설 호스트로 리다이렉트시키는
// SSRF성 오용 방지) — OSMU_PUBLIC_URL이 없으면 폴백 없이 null로 fail-closed.
export function canonicalPublicOrigin(): string | null {
  const env = process.env.OSMU_PUBLIC_URL;
  if (!env) return null;
  const trimmed = env.replace(/\/+$/, "");
  return trimmed.startsWith("https://") ? trimmed : null;
}

// OAuth 동의 URL.
// state = tenantId(콜백서 어느 테넌트인지 식별 — 위변조 방지는 짧은 수명+서명이 이상적이나
// 1차는 tenantId 그대로; 콜백서 effectiveTenantId와 교차검증 가능).
// extraParams: 라우터가 미리 계산한 PKCE code_challenge 등 추가 파라미터(선택).
export async function buildAuthUrl(
  provider: ProviderConfig,
  origin: string,
  providerName: string,
  state: string,
  extraParams?: Record<string, string>,
): Promise<string | null> {
  const credentials = await resolveOAuthCredentialSet(providerName);
  if (!credentials?.complete) return null;
  const clientId = credentials.values.clientId;
  if (!clientId) return null;
  const params: Record<string, string> = {
    [provider.clientIdParam ?? "client_id"]: clientId,
    redirect_uri: redirectUri(origin, providerName),
    response_type: "code",
    state,
  };
  if (providerName === "facebook") {
    // 비즈니스용 Facebook 로그인 = scope 대신 config_id. 없으면 authorize 불가(콘솔서 발급 필요).
    const configId = credentials.values.configId;
    if (!configId) return null;
    params.config_id = configId;
  } else {
    // scope: provider별 구분자 사용(기본 "," = Meta계열, " " = 표준 OAuth 2.0).
    const sep = provider.scopeSeparator ?? ",";
    params.scope = provider.scopes.join(sep);
  }
  // provider 고유 추가 파라미터(YouTube: access_type=offline, prompt=consent)
  if (provider.extraAuthParams) {
    Object.assign(params, provider.extraAuthParams);
  }
  // 라우터 주입 파라미터(PKCE: code_challenge, code_challenge_method 등) — 우선순위 최상
  if (extraParams) {
    Object.assign(params, extraParams);
  }
  return `${provider.authorizeUrl}?${new URLSearchParams(params).toString()}`;
}

export interface ExchangedToken {
  accessToken: string;
  userId?: string;
  refreshToken?: string; // channel_accounts.refresh_enc에 암호화 저장
  expiresInSeconds?: number; // provider expires_in. callback이 절대시각으로 변환해 DB에 저장
  error?: string;
}

function positiveExpiresIn(value: unknown): number | undefined {
  const seconds = typeof value === "number" ? value : typeof value === "string" ? Number(value) : NaN;
  return Number.isFinite(seconds) && seconds > 0 ? Math.floor(seconds) : undefined;
}

// Meta 토큰 교환 실패 사유 문자열. provider가 준 message와 HTTP status를 함께 남겨야
// 운영 로그에서 원인(자격증명 / 권한 / 만료 / 응답 형식)을 가를 수 있다. client_secret 등
// 우리 비밀값은 여기 절대 들어가지 않는다(응답 본문과 status만 사용).
function metaExchangeError(step: string, status: number, detail?: string): string {
  const tail = detail ? `: ${String(detail).slice(0, 160)}` : "";
  return `${step} 실패 (HTTP ${status})${tail}`;
}

// code → 토큰 교환. Instagram·Threads는 단기→장기 2단계. 표준 OAuth 채널은 단일 교환.
// options.codeVerifier: PKCE 채널(X, TikTok)은 callback이 쿠키에서 꺼내 전달.
// fetch 주입 가능(테스트).
export async function exchangeCode(
  providerName: string,
  code: string,
  origin: string,
  options: { codeVerifier?: string } = {},
  f: typeof fetch = fetch,
): Promise<ExchangedToken> {
  const p = getProvider(providerName);
  if (!p) return { accessToken: "", error: `unknown provider: ${providerName}` };
  const credentials = await resolveOAuthCredentialSet(providerName);
  const clientId = credentials?.complete ? credentials.values.clientId || "" : "";
  const clientSecret = credentials?.complete ? credentials.values.clientSecret || "" : "";
  if (!clientId || !clientSecret) {
    return { accessToken: "", error: `${p.label} OAuth 앱 자격증명(${p.appIdEnv}/${p.appSecretEnv}) 미설정 또는 불완전` };
  }

  // Instagram 문서: 인가 code 끝의 "#_" 는 code가 아니므로 제거.
  const cleanCode = code.replace(/#_.*$/, "").replace(/#.*$/, "");
  const ru = redirectUri(origin, providerName);

  // ── 표준 OAuth 2.0 (단일 교환 — longTokenUrl 없음) ───────────────────────
  if (!p.longTokenUrl) {
    const bodyParams: Record<string, string> = {
      [p.clientIdParam ?? "client_id"]: clientId,
      client_secret: clientSecret,
      grant_type: "authorization_code",
      redirect_uri: ru,
      code: cleanCode,
    };
    // PKCE: callback이 쿠키에서 꺼낸 verifier를 주입(없으면 생략 — 비PKCE 채널)
    if (options.codeVerifier) {
      bodyParams.code_verifier = options.codeVerifier;
    }
    const res = await f(p.tokenUrl, {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams(bodyParams).toString(),
    });
    const text = await res.text();
    let data: Record<string, unknown> = {};
    try { data = JSON.parse(text); } catch { data = {}; }

    // Slack 특수 처리: bot token = 최상위 access_token, user token = authed_user.access_token
    let accessToken = (data.access_token as string) || "";
    if (providerName === "slack") {
      const slack = data as { access_token?: string; authed_user?: { access_token?: string } };
      accessToken = slack.access_token || slack.authed_user?.access_token || "";
    }
    if (!res.ok || !accessToken) {
      return { accessToken: "", error: ((data.error_description || data.error || "토큰 교환 실패") as string) };
    }
    return {
      accessToken,
      userId: data.user_id ? String(data.user_id) : (data.open_id ? String(data.open_id) : undefined),
      refreshToken: (data.refresh_token as string) || undefined, // YouTube offline
      expiresInSeconds: positiveExpiresIn(data.expires_in),
    };
  }

  // ── Meta LoginAPI 계열 (단기→장기 2단계 교환) ─────────────────────────────
  // redirect_uri는 authorize와 동일값(단발). Instagram은 첫 exchange 시도에서 code를 소비하므로 재시도 금지.
  const shortRes = await f(p.tokenUrl, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      client_id: clientId,
      client_secret: clientSecret,
      grant_type: "authorization_code",
      redirect_uri: ru,
      code: cleanCode,
    }).toString(),
  });
  const lastText = await shortRes.text();
  let short: { access_token?: string; user_id?: string; error_message?: string; error?: { message?: string } } = {};
  try { short = JSON.parse(lastText); } catch { short = {}; }
  if (!shortRes.ok || !short.access_token) {
    // Meta는 두 가지 오류 형태를 섞어 쓴다: Instagram Basic Display 계열의 {error_message}와
    // Graph 계열의 {error:{message}}. 후자를 못 읽어서 "단기 토큰 교환 실패"라는 사유 없는
    // 문자열만 남던 것을 고친다(2026-08-30 threads 재연결 실패 추적).
    return {
      accessToken: "",
      error: metaExchangeError("단기 토큰 교환", shortRes.status, short.error_message || short.error?.message),
    };
  }
  // 2) 장기 토큰(60일)
  const longRes = await f(
    `${p.longTokenUrl}?grant_type=${p.longGrant}&client_secret=${encodeURIComponent(clientSecret)}&access_token=${encodeURIComponent(short.access_token)}`,
  );
  const longText = await longRes.text();
  let long: { access_token?: string; expires_in?: number | string; error?: { message?: string }; error_message?: string } = {};
  try { long = JSON.parse(longText); } catch { long = {}; }
  const expiresInSeconds = positiveExpiresIn(long.expires_in);
  // 단기 토큰으로 폴백하면 연결 직후만 성공하고 곧 실패하면서 active가 남는다.
  // 장기 토큰과 만료시각 둘 다 확인된 경우에만 콜백이 저장하도록 fail-closed한다.
  if (!longRes.ok || !long.access_token || !expiresInSeconds) {
    // 이전 버전은 provider 응답을 통째로 버리고 `${label} 장기 토큰 교환 실패`만 남겼다.
    // 그래서 운영 로그만으로는 "앱 자격증명 문제인지 / 권한 문제인지 / expires_in 누락인지"를
    // 가릴 수 없었다(2026-08-30 threads 재연결 실패). 사유를 반드시 실어 보낸다.
    const detail = long.error?.message || long.error_message
      || (longRes.ok && long.access_token && !expiresInSeconds ? "응답에 expires_in 없음" : undefined);
    return { accessToken: "", error: metaExchangeError(`${p.label} 장기 토큰 교환`, longRes.status, detail) };
  }
  return {
    accessToken: long.access_token,
    userId: short.user_id ? String(short.user_id) : undefined,
    expiresInSeconds,
  };
}

// Facebook: code → user token → 장기 user token → /me/accounts → 첫 페이지 토큰+id.
// 저장값 = 페이지 토큰(발행용) + meta.pageId. (다중 페이지면 첫 번째 — 향후 선택 UI.)
// config_id는 authorize 단계에서만 필요하고, 토큰 교환은 classic manual-flow와 동일 엔드포인트다
// (graph.facebook.com/v21.0/oauth/access_token, client_id+client_secret+redirect_uri+code).
// FB_APP_SECRET가 반드시 필요(교환·장기토큰 서명). redirect_uri는 authorize와 글자까지 동일해야 한다.
const FB_V = "https://graph.facebook.com/v21.0";
export async function exchangeFacebookCode(code: string, origin: string, f: typeof fetch = fetch): Promise<ExchangedToken> {
  const credentials = await resolveOAuthCredentialSet("facebook");
  const clientId = credentials?.complete ? credentials.values.clientId || "" : "";
  const clientSecret = credentials?.complete ? credentials.values.clientSecret || "" : "";
  if (!clientId || !clientSecret) return { accessToken: "", error: "Facebook OAuth 앱 자격증명 미설정 또는 불완전" };
  const cb = redirectUri(origin, "facebook");
  // 1) user token
  const tRes = await f(`${FB_V}/oauth/access_token?client_id=${clientId}&client_secret=${clientSecret}&redirect_uri=${encodeURIComponent(cb)}&code=${encodeURIComponent(code)}`);
  const t = (await tRes.json()) as { access_token?: string; error?: { message?: string } };
  if (!tRes.ok || !t.access_token) return { accessToken: "", error: t.error?.message || "user 토큰 교환 실패" };
  // 2) 장기 user token
  const lRes = await f(`${FB_V}/oauth/access_token?grant_type=fb_exchange_token&client_id=${clientId}&client_secret=${clientSecret}&fb_exchange_token=${encodeURIComponent(t.access_token)}`);
  const l = (await lRes.json()) as { access_token?: string; expires_in?: number | string; error?: { message?: string } };
  const expiresInSeconds = positiveExpiresIn(l.expires_in);
  if (!lRes.ok || !l.access_token || !expiresInSeconds) {
    return { accessToken: "", error: l.error?.message || "Facebook 장기 user 토큰 교환 실패" };
  }
  const userToken = l.access_token;
  // 3) 페이지 토큰
  const pRes = await f(`${FB_V}/me/accounts?access_token=${encodeURIComponent(userToken)}`);
  const p = (await pRes.json()) as { data?: Array<{ access_token?: string; id?: string }> };
  const page = p.data?.[0];
  if (!pRes.ok || !page?.access_token || !page.id) {
    return { accessToken: "", error: "연결된 Facebook 페이지 검증 실패(페이지 권한 확인)" };
  }
  return { accessToken: page.access_token, userId: page.id, expiresInSeconds };
}
