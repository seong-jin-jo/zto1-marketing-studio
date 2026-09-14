import { createClient, isAuthRetryableFetchError, type User } from "@supabase/supabase-js";

// 고객 셀프서브 인증(Supabase Auth). 하드코딩 금지 — env(공개키라 NEXT_PUBLIC_).
const URL = process.env.NEXT_PUBLIC_SUPABASE_URL || "";
const ANON = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || "";

// 브라우저용 — 로그인/가입. 세션은 클라가 보관하고 API 호출 시 access token을 Bearer로 첨부.
let _browserClient: ReturnType<typeof createClient> | null = null;

export function createBrowserSupabase() {
  // AuthGate, LoginPage, Sidebar가 같은 탭에서 이 함수를 여러 번 부른다. 매번 새
  // GoTrueClient를 만들면 같은 storage key를 두 인스턴스가 감시해 실제 브라우저에서
  // `Multiple GoTrueClient instances` 경고와 동시 세션 이벤트 경쟁이 생긴다.
  if (!_browserClient) {
    _browserClient = createClient(URL, ANON, { auth: { persistSession: true, autoRefreshToken: true } });
  }
  return _browserClient;
}

// 서버용 — 클라가 보낸 access token(JWT) 검증. anon 키로 getUser(jwt) 서명검증.
let _verifier: ReturnType<typeof createClient> | null = null;

export type SupabaseVerifyResult =
  | { status: "valid"; user: User }
  | { status: "invalid" }
  | { status: "unavailable" };

// tri-state: valid(서명검증 통과) / invalid(위조·만료·미인식 토큰) / unavailable(Supabase env 미설정
// 또는 검증 요청 자체가 실패 — 이걸 401로 오인해 미검증 통과시키면 안 되므로 503으로 구분).
export async function verifySupabaseJwt(accessToken: string): Promise<SupabaseVerifyResult> {
  if (!accessToken) return { status: "invalid" };
  if (!URL || !ANON) return { status: "unavailable" };
  try {
    if (!_verifier) _verifier = createClient(URL, ANON, { auth: { persistSession: false, autoRefreshToken: false } });
    const { data, error } = await _verifier.auth.getUser(accessToken);
    if (error) {
      // AuthRetryableFetchError = fetch 자체가 실패(DNS·연결거부·타임아웃) — auth-js가 status:0으로
      // 감싸 error로 반환한다(throw 아님). 5xx급 응답도 서비스 장애. 이 둘만 unavailable, 그 외
      // (401/403 등 실제 인증 거부 응답)는 invalid. status:0을 "invalid"로 오분류하면 Supabase
      // 장애 시 정상 고객까지 401(위조 취급)로 막혀버려 스펙(검증기 장애=503)을 위반한다.
      if (isAuthRetryableFetchError(error)) return { status: "unavailable" };
      const status = (error as { status?: number }).status;
      if (typeof status === "number" && status >= 500) return { status: "unavailable" };
      return { status: "invalid" };
    }
    if (!data?.user) return { status: "invalid" };
    return { status: "valid", user: data.user };
  } catch {
    return { status: "unavailable" };
  }
}
