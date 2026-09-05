"use client";

import { useEffect, useRef, useState } from "react";
import { useUIStore } from "@/store/ui-store";
import { authHeaders } from "@/lib/auth";
import { oauthErrorMessage } from "@/lib/oauth-errors";
import { SCHEDULABLE_PLATFORMS, VIDEO_PUBLISH_PLATFORMS } from "@/lib/constants";
import {
  CONNECT_READINESS_LABELS,
  type ConnectReadinessEntry,
  type ConnectReadinessStatus,
} from "@/lib/connect-readiness";

type Readiness = ConnectReadinessEntry;
type ReadinessState = Readiness | "error";

// Meta 계열(threads/instagram)은 브라우저가 이미 로그인된 Meta 세션 쿠키를 팝업과 공유한다.
// Meta Business/Instagram Login authorize 엔드포인트에는 "이 계정 말고 다른 계정으로" 강제
// 재인증시키는 공식 문서화된 파라미터가 없다(2026-07-17 WebSearch 확인 — Business Login for
// Instagram / Instagram Platform OAuth Authorize 문서에 force_authentication류 파라미터 미기재).
// classic Facebook Login의 `auth_type=reauthenticate`는 이 business login 플로우 문서에는
// 없어 검증 없이 흉내내지 않는다(추측 파라미터 삽입 금지 — SNS-001 지시). 대신 정직한 안내만 한다.
interface AccountSwitchHelp {
  note: string;
  managementUrl: string;
  managementLabel: string;
}

const META_SWITCH_BOUNDARY = "현재 앱 주소에서는 Meta 도메인의 로그인 쿠키를 지울 수 없습니다. 우리 앱은 자동 로그아웃을 수행했다고 주장하지 않습니다.";

// provider 세션은 각 provider origin이 소유한다. 우리 origin에서 쿠키를 삭제하거나 로그아웃을
// 대행하지 않고, 공식 계정/세션 관리 화면을 새 탭으로 여는 명시적 사용자 동작만 제공한다.
const ACCOUNT_SWITCH_HELP: Record<string, AccountSwitchHelp> = {
  threads: {
    note: `다른 Threads 계정으로 연결하려면 threads.net에서 먼저 로그아웃하세요. Meta 계정 센터에서 사용할 계정과 로그인 세션을 확인한 뒤 이 화면으로 돌아와 다시 연결하세요. ${META_SWITCH_BOUNDARY}`,
    managementUrl: "https://accountscenter.facebook.com/",
    managementLabel: "Meta 계정 센터 열기",
  },
  instagram: {
    note: `다른 Instagram 계정으로 연결하려면 instagram.com에서 먼저 로그아웃하세요. Meta 계정 센터에서 사용할 계정과 로그인 세션을 확인한 뒤 이 화면으로 돌아와 다시 연결하세요. ${META_SWITCH_BOUNDARY}`,
    managementUrl: "https://accountscenter.facebook.com/",
    managementLabel: "Meta 계정 센터 열기",
  },
  facebook: {
    note: `Meta 계정 센터에서 사용할 계정과 로그인 세션을 직접 확인한 뒤 이 화면으로 돌아와 다시 연결하세요. ${META_SWITCH_BOUNDARY}`,
    managementUrl: "https://accountscenter.facebook.com/",
    managementLabel: "Meta 계정 센터 열기",
  },
  x: {
    note: "현재 앱 주소에서는 X 도메인의 로그인 쿠키를 지울 수 없습니다. X 계정 설정을 새 탭에서 열어 사용할 세션을 확인하거나 로그아웃한 뒤 다시 연결하세요.",
    managementUrl: "https://x.com/settings/account",
    managementLabel: "X 계정 설정 열기",
  },
  youtube: {
    note: "YouTube OAuth는 연결할 때 Google 계정 선택 화면을 표시합니다. 현재 앱 주소에서는 Google 로그인 쿠키를 지울 수 없습니다. 연결 권한을 정리하려면 Google 계정의 앱 연결 관리 화면을 새 탭에서 확인한 뒤 다시 연결하세요.",
    managementUrl: "https://myaccount.google.com/permissions",
    managementLabel: "Google 연결 관리 열기",
  },
  tiktok: {
    note: "현재 앱 주소에서는 TikTok 도메인의 로그인 쿠키를 지울 수 없습니다. TikTok 계정 설정을 새 탭에서 열어 사용할 세션을 확인하거나 로그아웃한 뒤 다시 연결하세요.",
    managementUrl: "https://www.tiktok.com/setting",
    managementLabel: "TikTok 계정 설정 열기",
  },
};

// SNS-001: 팝업 콜백(callback/route.ts)이 window.opener로 postMessage하는 결과를 검증해 받는다.
// origin을 window.location.origin과 엄격 일치시켜야 한다 — 다른 origin의 메시지를 신뢰하면
// 임의 스크립트가 "연결 성공"을 위조해 UI를 속일 수 있다.
interface OAuthMessage { source: string; provider: string; ok: boolean; message?: string }
function isOAuthMessage(v: unknown): v is OAuthMessage {
  return typeof v === "object" && v !== null && (v as { source?: unknown }).source === "osmu-oauth-connect";
}

// 소셜 OAuth "연결" 버튼 (ADR-004) — 고객은 비번/토큰 개념 없이 이 버튼만.
// 클릭 → /api/connect/{provider}로 동의 URL 받아 팝업으로 열기 → provider 공식 페이지에서 로그인/동의 →
// callback이 토큰을 받아 테넌트별 저장 + postMessage로 부모에 결과 통지. 부모는 origin을 검증하고
// 채널 설정을 재조회한다.
//
// SNS-001/SNS-003: 마운트 시 /api/connect/readiness로 서버 credential 유무를 먼저 물어
// 미설정 provider는 클릭 전부터 비활성 + 사유를 보여준다("연결→클릭→500 raw error" 방지).
export function SocialConnectButton({ provider, label, onConnected }: { provider: string; label: string; onConnected?: () => void }) {
  const { activeWorkspace } = useUIStore();
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState("");
  const [connectFailed, setConnectFailed] = useState(false);
  const [readiness, setReadiness] = useState<ReadinessState | null>(null);
  const [readinessLoading, setReadinessLoading] = useState(true);
  const [showSwitchNote, setShowSwitchNote] = useState(false);
  const [readinessAttempt, setReadinessAttempt] = useState(0);
  // "노출=발행가능" 원칙(wiki/reference/channel-status.md) — 연결 UI는 12채널이지만
  // 텍스트 예약 발행과 영상 직접 발행 중 하나라도 있으면 발행 가능으로 표시한다.
  const publishReady = ([...SCHEDULABLE_PLATFORMS, ...VIDEO_PUBLISH_PLATFORMS] as readonly string[]).includes(provider);
  const accountSwitchHelp = ACCOUNT_SWITCH_HELP[provider];
  const resolvedRef = useRef(false); // postMessage로 이미 결과를 받았는지(closed-폴링 오탐 방지)
  const watchClosedRef = useRef<number | null>(null); // closed-폴링 interval id. unmount 시 정리
  const mountedRef = useRef(true); // connect fetch가 pending인 동안 unmount되는 레이스 가드

  // 컴포넌트 unmount 시 진행 중인 closed-폴링 interval을 정리한다 — 안 하면 팝업을 열어둔 채
  // 페이지를 이동/언마운트해도 interval이 계속 돌며 unmount된 컴포넌트에 setState를 시도한다.
  // React StrictMode에서 setup-cleanup-setup이 발생하면 cleanup이 mountedRef=false를 남길 수
  // 있으니, 매 setup마다 true로 reset한다(cleanup이 최종 false로 덮음).
  useEffect(() => {
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
      if (watchClosedRef.current !== null) window.clearInterval(watchClosedRef.current);
    };
  }, []);

  // 팝업 결과 postMessage 수신 + popup-blocked/closed-without-callback 추적.
  useEffect(() => {
    function onMessage(ev: MessageEvent) {
      if (ev.origin !== window.location.origin) return; // 다른 origin 메시지는 무조건 무시
      const data = ev.data;
      if (!isOAuthMessage(data) || data.provider !== provider) return;
      // ★ 유효한 메시지 수신 — closed-폴링 interval을 즉시 정리하고 ref도 초기화
      if (watchClosedRef.current !== null) {
        window.clearInterval(watchClosedRef.current);
        watchClosedRef.current = null;
      }
      resolvedRef.current = true;
      setBusy(false);
      if (data.ok) {
        setConnectFailed(false);
        setMsg(`${label} 연결 완료. 채널 상태를 새로고침합니다.`);
        onConnected?.();
      } else {
        setConnectFailed(true);
        setMsg(oauthErrorMessage(data.message || "연결 실패", label));
      }
    }
    window.addEventListener("message", onMessage);
    return () => window.removeEventListener("message", onMessage);
  }, [provider, label, onConnected]);

  useEffect(() => {
    let cancelled = false;
    if (!activeWorkspace) {
      setReadinessLoading(false);
      return;
    }
    setReadinessLoading(true);
    fetch(`/api/connect/readiness?tenant_id=${activeWorkspace.id}`, { headers: authHeaders() })
      .then((r) => {
        if (!r.ok) throw new Error(`readiness ${r.status}`);
        return r.json();
      })
      .then((d: { providers?: Record<string, Readiness> }) => {
        if (cancelled) return;
        const entry = d.providers?.[provider];
        if (!entry) throw new Error("readiness missing provider entry");
        setReadiness(entry);
      })
      .catch(() => {
        // finding 2: readiness 확인 자체가 실패하면(네트워크/인증/파싱 오류) fail-closed —
        // "확인 불가라서 일단 허용"은 미검증 provider로 사용자를 흘려보내 500/raw error를
        // 보게 만든다. 실패는 명시적 에러 상태로 표시하고 연결 버튼은 비활성 유지한다.
        if (!cancelled) setReadiness("error");
      })
      .finally(() => { if (!cancelled) setReadinessLoading(false); });
    return () => { cancelled = true; };
  }, [provider, activeWorkspace, readinessAttempt]);

  const readinessEntry = readiness && readiness !== "error" ? readiness : null;
  const readinessStatus: ConnectReadinessStatus | null = readiness === "error"
    ? "error"
    : readinessEntry?.status
      || (readinessEntry ? (readinessEntry.available ? "not_connected" : "opening_soon") : null);
  const readinessFailed = readinessStatus === "error";
  const known = readinessEntry !== null;
  // 연결(connect) 차단은 available(=우리 앱 credential 부재 or 오류)로만 판단한다. 외부 앱 심사가
  // 남은 publish_pending은 available:true라 연결 버튼을 막지 않는다 — 심사 제약은 발행 단계에서만
  // 적용(회장 2026-08-13 라이브 회귀 수정: 심사대상 채널이 연결까지 막혀 마케팅 가동 불가였음).
  const disabledByReadiness = readinessFailed
    || readinessStatus === "opening_soon"
    || (known && !readinessEntry.available);
  // available=true여도 reason(예: Meta 앱 리뷰 상태 "확인 불가")이 있으면 조용히 버리지 않고
  // 경고로 보여준다 — finding 2.
  const readinessWarning = readinessEntry?.available
    && readinessEntry.reason
    && !readinessEntry.guidance
    ? readinessEntry.reason
    : null;
  const connectLabel = readinessStatus === "connected"
    ? "다른 계정 연결"
    : readinessStatus === "opening_soon"
      ? "오픈 준비중"
      : readinessStatus === "publish_pending"
        ? "발행 준비중"
        : `${label} OAuth 연결`;

  const connect = async () => {
    if (!activeWorkspace) {
      setMsg("워크스페이스를 먼저 선택하세요.");
      return;
    }
    if (busy || disabledByReadiness) return;
    setBusy(true);
    setConnectFailed(false);
    setMsg("");

    // OAuth 팝업은 클릭 이벤트 핸들러 안에서 "동기적으로" 열어야 한다. fetch를 먼저 await하면
    // 그 사이 브라우저의 user-activation(제스처) 토큰이 소멸해, headless/prod Chrome은
    // window.open을 조용히 무시(팝업 0개, 에러도 없음)한다. 그래서 same-origin about:blank
    // 팝업을 클릭 즉시 예약해두고, authUrl이 도착하면 그 예약된 창을 navigate한다.
    // popup.opener를 끊으면 안 된다 — callback/route.ts가 window.opener.postMessage로 결과를
    // 돌려주는 구조라 noopener/noreferrer는 기능을 깨뜨린다(리버스 탭내빙 우려는 same-origin
    // about:blank로 열고 authUrl도 같은 앱이 발급하므로 낮음).
    const popup = window.open("about:blank", "_blank", "width=620,height=760");
    if (!popup) {
      // 팝업 차단 — 아직 fetch도 안 했으니 여기서 바로 중단(네트워크 낭비 방지).
      setMsg("팝업이 차단되었습니다. 브라우저 팝업 차단을 해제한 뒤 다시 시도해주세요.");
      setConnectFailed(true);
      setBusy(false);
      return;
    }

    try {
      const r = await fetch(`/api/connect/${provider}?tenant_id=${activeWorkspace.id}`, { headers: authHeaders() });
      const d = (await r.json()) as { authUrl?: string; error?: string };
      if (!mountedRef.current) {
        // 언마운트된 뒤 fetch가 뒤늦게 resolve된 경우 — 예약해둔 팝업만 정리하고
        // navigate/setState/interval 생성 같은 좀비 부작용은 전부 건너뛴다.
        popup.close();
        return;
      }
      if (d.authUrl) {
        popup.location.href = d.authUrl;
        setMsg("새 창에서 로그인·동의를 완료하면 연결됩니다.");
        resolvedRef.current = false;
        // postMessage가 오면 이 폴링은 의미 없어지지만(정상 종료), 사용자가 콜백 없이 창을
        // 그냥 닫아버린 경우(예: 로그인 취소) 부모가 무한정 "여는 중…" 상태로 남지 않게 감지한다.
        const watchClosed = window.setInterval(() => {
          if (popup.closed) {
            window.clearInterval(watchClosed);
            watchClosedRef.current = null;
            if (!resolvedRef.current) {
              setBusy(false);
              setConnectFailed(true);
              setMsg("연결 창이 결과 없이 닫혔습니다. 다시 시도해주세요.");
            }
          }
        }, 700);
        watchClosedRef.current = watchClosed;
        return; // busy는 postMessage/closed 감지가 최종 해제
      } else {
        popup.close(); // authUrl 없음. 예약해둔 빈 창을 남겨두지 않는다.
        setConnectFailed(true);
        setMsg(oauthErrorMessage(d.error || "OAuth 앱 자격증명이 아직 설정되지 않았습니다.", label));
        setBusy(false);
      }
    } catch (e) {
      popup.close();
      if (!mountedRef.current) return;
      setConnectFailed(true);
      setMsg(oauthErrorMessage(e instanceof Error ? e.message : "연결 실패", label));
      setBusy(false);
    }
  };

  return (
    <div className="rounded-control border border-accent/40 bg-accent/10 p-stack">
      <p className="text-caption text-muted mb-stack-tight">
        <b className="text-text">{label} OAuth 연결</b>. 버튼 한 번이면 끝. 비밀번호·토큰 입력 없이
        {label} 공식 로그인으로 안전하게 연결됩니다.
      </p>
      {!readinessLoading && readinessStatus && (
        <p
          className={`text-caption mb-stack-tight ${
            readinessStatus === "connected"
              ? "text-success"
              : readinessStatus === "publish_pending"
                ? "text-warning"
                : readinessStatus === "error"
                  ? "text-danger"
                  : "text-subtle"
          }`}
          data-testid={`readiness-status-${provider}`}
          data-status={readinessStatus}
        >
          {CONNECT_READINESS_LABELS[readinessStatus]}
        </p>
      )}
      {readinessWarning && (
        <p className="text-caption text-warning mb-stack-tight" data-testid={`readiness-warning-${provider}`}>
          {readinessWarning}
        </p>
      )}
      {readinessEntry?.guidance && (
        <div
          className="mb-stack-tight rounded-control border border-border bg-surface p-stack-tight"
          data-testid={`review-guidance-${provider}`}
        >
          <p className="text-caption text-text">{readinessEntry.guidance.title}</p>
          <ol className="mt-micro list-decimal space-y-micro pl-pad-inset text-caption leading-relaxed text-muted">
            {readinessEntry.guidance.steps.map((step) => <li key={step}>{step}</li>)}
          </ol>
          <a
            href={readinessEntry.guidance.externalLink.url}
            target="_blank"
            rel="noopener noreferrer"
            data-testid={`review-guidance-link-${provider}`}
            className="mt-stack-tight inline-flex text-caption text-accent underline underline-offset-2"
          >
            {readinessEntry.guidance.externalLink.label}
          </a>
        </div>
      )}
      <button
        onClick={connect}
        disabled={busy || readinessLoading || disabledByReadiness}
        data-testid={`connect-${provider}`}
        data-ready={disabledByReadiness ? "false" : "true"}
        className={`px-pad-inset py-stack-tight text-body-sm rounded-control disabled:opacity-50 ${
          disabledByReadiness
            ? "bg-surface-2 text-subtle"
            : "bg-accent text-accent-fg hover:bg-accent-hover"
        }`}
      >
        {busy ? "여는 중…" : readinessLoading ? "확인 중…" : connectLabel}
      </button>
      {accountSwitchHelp && (
        <div className="mt-stack-tight">
          <button
            type="button"
            onClick={() => setShowSwitchNote((v) => !v)}
            data-testid={`switch-account-${provider}`}
            className="text-caption text-accent underline underline-offset-2"
          >
            다른 계정으로 연결하고 싶어요
          </button>
          {showSwitchNote && (
            <div className="mt-micro space-y-stack-tight">
              <p className="text-caption text-muted" data-testid={`switch-account-note-${provider}`}>
                {accountSwitchHelp.note}
              </p>
              <a
                href={accountSwitchHelp.managementUrl}
                target="_blank"
                rel="noopener noreferrer"
                data-testid={`manage-provider-account-${provider}`}
                className="inline-flex text-caption text-accent underline underline-offset-2"
              >
                {accountSwitchHelp.managementLabel} ↗
              </a>
              <p className="text-caption text-subtle">
                새 탭에서 계정 전환·로그아웃을 마친 뒤 이 화면의 OAuth 연결을 다시 누르세요.
              </p>
            </div>
          )}
        </div>
      )}
      {readinessFailed && (
        <div className="mt-stack-tight">
          <p className="text-caption text-danger" data-testid={`readiness-error-${provider}`}>
            준비 상태를 확인하지 못했습니다.
          </p>
          <button
            type="button"
            onClick={() => setReadinessAttempt((attempt) => attempt + 1)}
            className="mt-micro text-caption text-accent underline underline-offset-2"
          >
            다시 확인
          </button>
        </div>
      )}
      {!readinessFailed && disabledByReadiness && (
        <p className="text-caption text-subtle mt-stack-tight" data-testid={`readiness-reason-${provider}`}>
          {readinessEntry?.reason || `${label} 연결이 아직 준비되지 않았습니다.`}
        </p>
      )}
      {!publishReady && (
        <p className="text-caption text-warning mt-stack-tight" data-testid="publish-not-ready-badge">
          발행 준비 중. 지금은 {label} 연결만 미리 가능하고, 대시보드에서 직접 발행은 아직
          지원하지 않습니다.
        </p>
      )}
      {msg && <p className="text-caption text-subtle mt-stack-tight">{msg}</p>}
      {connectFailed && readinessEntry?.guidance && (
        <a
          href={readinessEntry.guidance.externalLink.url}
          target="_blank"
          rel="noopener noreferrer"
          data-testid={`connect-failure-guidance-link-${provider}`}
          className="mt-micro inline-flex text-caption text-accent underline underline-offset-2"
        >
          {readinessEntry.guidance.externalLink.label}
        </a>
      )}
    </div>
  );
}
