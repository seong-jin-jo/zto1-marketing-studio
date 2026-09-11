"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { createBrowserSupabase } from "@/lib/supabase";
import { clearAuthToken, safeCustomerReturnTo, setAuthToken } from "@/lib/auth";
import { isAbortError, useAuthAttempt } from "@/lib/auth-attempt";
import { oauthErrorMessage } from "@/lib/oauth-errors";
import { trackEvent } from "@/lib/analytics/events";

// Non-PII marker set right before an OAuth redirect, consumed only once a session is confirmed
// on return. Needed because PKCE-flow returns (Supabase `?code=...` exchange) carry no hash
// token. The old hash-only detection silently missed PKCE logins (Codex review 2026-07-14 #5).
// sessionStorage (not localStorage), scoped to this tab/redirect round-trip only, no identity.
const OAUTH_PENDING_KEY = "osmu_oauth_pending";

// 고객 셀프서브 로그인 = Google OAuth 단일 경로 (회장 확정 2026-07-16: 이메일/비밀번호 가입·로그인·
// 비밀번호 재설정 전부 제거, SMTP/Resend 도입 안 함). 성공 시 Supabase 세션의 access token을 저장 →
// 이후 API 호출이 Bearer로 첨부 → 서버가 검증해 그 고객 테넌트로 스코프.
export default function LoginPage() {
  const router = useRouter();
  const [msg, setMsg] = useState("");
  const [busy, setBusy] = useState(false);
  // OAuth login event de-dupe: enter() can be invoked twice (getSession() resolve +
  // onAuthStateChange SIGNED_IN). This guards a single `login` fire per mount regardless.
  const oauthTrackedRef = useRef(false);
  const validationTokenRef = useRef<string | null>(null);
  const rejectedTokenRef = useRef<string | null>(null);
  // 이 화면을 떠난 뒤 늦게 온 성공 응답이 그 사이 확정된 운영자 신원을 덮지 못하게 한다.
  const { begin: beginAttempt } = useAuthAttempt();

  // OAuth 복귀 감지: Supabase는 URL fragment의 access_token/refresh_token 또는 PKCE ?code=... 으로
  // 되돌아온다. 클라가 URL 해시를 파싱(detectSessionInUrl 기본 on)하므로 mount 시 세션을 거둬
  // 토큰 저장 후 진입.
  useEffect(() => {
    // supabase env 미설정 시 createBrowserSupabase가 throw → 페이지 死 방지(가드).
    let unsub: (() => void) | undefined;
    try {
      const sb = createBrowserSupabase();
      const hash = window.location.hash || "";
      const p = new URLSearchParams(window.location.search);
      const hadHashToken = hash.includes("access_token");
      const isOAuthCallbackError =
        hash.includes("error=") || hash.includes("error_code=") ||
        !!p.get("error") || !!p.get("error_code");
      if (isOAuthCallbackError) {
        // OAuth cancel/error (e.g. user closed the Google consent screen). No session will ever
        // arrive for this attempt. Clear the marker now so it can't leak into and mislabel the
        // next unrelated auth attempt on this tab.
        try { sessionStorage.removeItem(OAUTH_PENDING_KEY); } catch { /* ignore */ }
        // 이전 버전은 마커만 지우고 아무것도 보여주지 않았다. 그래서 Supabase가 redirect URL
        // 허용목록 불일치 등으로 error를 붙여 돌려보내면, 화면은 아무 말 없이 로그인 버튼만
        // 남고 사용자는 "로그인이 그냥 안 된다"로만 경험했다(2026-08-30). 사유를 반드시 띄운다.
        const hashParams = new URLSearchParams(hash.replace(/^#/, ""));
        const detail =
          p.get("error_description") || p.get("error_code") || p.get("error") ||
          hashParams.get("error_description") || hashParams.get("error_code") || hashParams.get("error") || "";
        setMsg(oauthErrorMessage(detail || "로그인이 취소되었거나 완료되지 못했습니다.", "Google"));
        // 사유를 읽은 뒤 URL에서 지운다. 남겨두면 새로고침 때마다 같은 실패가 다시 뜬다.
        // returnTo는 살려서 재시도 후에도 원래 가려던 화면으로 돌아가게 한다.
        const keep = p.get("returnTo");
        history.replaceState(null, "", keep ? `${window.location.pathname}?returnTo=${encodeURIComponent(keep)}` : window.location.pathname);
      }
      const enter = (accessToken: string) => {
        // getSession() reads browser storage and onAuthStateChange can emit the same
        // candidate again. Neither is an authorization verdict, so validate once at
        // our server boundary before persisting or following returnTo.
        if (validationTokenRef.current === accessToken || rejectedTokenRef.current === accessToken) return;
        validationTokenRef.current = accessToken;
        const attempt = beginAttempt();
        // Keep the auth-state callback synchronous. Supabase documents that awaiting
        // another auth method inside onAuthStateChange can deadlock the client.
        void (async () => {
          try {
            const response = await fetch("/api/me", {
              headers: { Authorization: `Bearer ${accessToken}` },
              signal: attempt.signal,
            });
            const identity = response.ok ? await response.json().catch(() => null) : null;
            // A newer TOKEN_REFRESHED/SIGNED_IN candidate owns the login now. A late
            // 401 for the older token must not clear or sign out that replacement.
            if (!attempt.owns() || validationTokenRef.current !== accessToken) return;
            const approvedCustomer = response.ok
              && identity?.isOperator === false
              && typeof identity?.tenant?.id === "string"
              && identity.tenant.id.length > 0
              && identity.tenantError !== true;
            if (!approvedCustomer) {
              rejectedTokenRef.current = accessToken;
              clearAuthToken();
              if (response.status === 401) {
                try { await sb.auth.signOut({ scope: "local" }); } catch { /* keep login stable */ }
                setMsg("세션이 만료되었습니다. Google로 다시 로그인해주세요.");
              } else {
                setMsg("로그인 상태를 확인하지 못했습니다. 잠시 후 다시 시도해주세요.");
              }
              return;
            }
            setAuthToken(accessToken, "customer");
            if (hadHashToken) {
              history.replaceState(null, "", `${window.location.pathname}${window.location.search}`);
            }
            // OAuth 콜백으로 세션이 확정된 순간(백엔드 확인 후). 신규/기존 구분 불가라 login으로 기록.
            // 분류 근거는 오직 osmu_oauth_pending 마커뿐(위 설명).
            // enter()가 getSession()+onAuthStateChange 양쪽에서 호출될 수 있어 ref로 1회만 발행.
            if (!oauthTrackedRef.current) {
              let oauthPending = false;
              try { oauthPending = sessionStorage.getItem(OAUTH_PENDING_KEY) === "1"; } catch { /* ignore */ }
              if (oauthPending) {
                oauthTrackedRef.current = true;
                trackEvent({ name: "login", params: { method: "oauth" } });
              }
            }
            try { sessionStorage.removeItem(OAUTH_PENDING_KEY); } catch { /* ignore */ }
            router.replace(safeCustomerReturnTo(new URLSearchParams(window.location.search).get("returnTo")));
          } catch (cause) {
            if (attempt.owns() && validationTokenRef.current === accessToken && !isAbortError(cause)) {
              setMsg("로그인 상태를 확인하지 못했습니다. 잠시 후 다시 시도해주세요.");
            }
          } finally {
            if (validationTokenRef.current === accessToken) validationTokenRef.current = null;
          }
        })();
      };
      sb.auth.getSession().then(({ data }) => {
        if (data.session) enter(data.session.access_token);
      }).catch(() => { /* ignore */ });
      // 다른 탭에서 로그인하면 이 탭도 자동 진입. Supabase는 세션을 localStorage로 탭 간
      // 동기화하므로 onAuthStateChange가 SIGNED_IN을 받는다.
      const { data: sub } = sb.auth.onAuthStateChange((_event, session) => {
        if (session?.access_token) enter(session.access_token);
      });
      unsub = () => sub.subscription.unsubscribe();
    } catch (e) {
      if (typeof console !== "undefined") console.warn("[login] supabase init:", e);
    }
    return () => { unsub?.(); };
  }, [beginAttempt, router]);

  const google = async () => {
    setMsg("");
    if (busy) return;
    setBusy(true);
    try {
      const returnTo = safeCustomerReturnTo(new URLSearchParams(window.location.search).get("returnTo"));
      const redirectTo = `${window.location.origin}/login?returnTo=${encodeURIComponent(returnTo)}`;
      const r = await fetch(`/api/auth/google?redirect_to=${encodeURIComponent(redirectTo)}`);
      const d = (await r.json()) as { authUrl?: string; error?: string };
      if (!r.ok || !d.authUrl) {
        setMsg(oauthErrorMessage(d.error || "Google 로그인 설정 확인 실패", "Google"));
        return;
      }
      // 리다이렉트 직전 마커 세팅. 복귀 시(PKCE ?code= 또는 hash) 세션 확정 후에만 소비.
      try { sessionStorage.setItem(OAUTH_PENDING_KEY, "1"); } catch { /* ignore */ }
      window.location.href = d.authUrl;
    } catch (e) {
      setMsg(oauthErrorMessage(e instanceof Error ? e.message : String(e), "Google"));
    } finally { setBusy(false); }
  };

  return (
    <div className="min-h-screen flex items-center justify-center bg-bg px-pad-inset">
      <div className="w-full max-w-sm p-stack-section rounded-surface border border-border bg-surface/50">
        <h1 className="text-lead font-semibold text-text mb-micro">OSMU 마케팅 자동화</h1>
        <p className="text-caption text-subtle mb-stack-section">Google 계정으로 로그인하고 내 브랜드 콘텐츠를 자동 생성·발행하세요.</p>

        <div className="space-y-stack-tight">
          <button onClick={google} disabled={busy}
            className="w-full min-h-control-touch px-pad-inset py-stack-tight text-body-sm bg-accent text-accent-fg rounded-control disabled:opacity-50">
            {busy ? "확인 중…" : "Google로 계속"}
          </button>
        </div>

        {msg && <p className="text-caption mt-stack text-warning">{msg}</p>}
      </div>
    </div>
  );
}
