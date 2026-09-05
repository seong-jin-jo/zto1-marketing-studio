"use client";

import { useState, useEffect, useCallback, useRef } from "react";
import { usePathname, useRouter } from "next/navigation";
import {
  clearAuthToken,
  customerLoginUrl,
  getAuthIdentityKind,
  getAuthToken,
  isCustomerAuthToken,
  setAuthToken,
} from "@/lib/auth";
import { Sidebar } from "@/components/layout/Sidebar";
import { ErrorBoundary } from "@/components/shared/ErrorBoundary";
import { useUIStore } from "@/store/ui-store";

type GateStatus = "checking" | "ok" | "access_paused" | "account_unavailable" | "auth_error" | "service_error";

/* ─── 정지/이용불가 풀스크린 — 로그아웃 후 랜딩(로그인 CTA)으로 보내는 게 misleading해서
   여기서는 새로고침(재확인)과 로그아웃 두 액션만 제공 ─── */
function GateBlockScreen({
  title,
  desc,
  primaryLabel = "새로고침",
  secondaryLabel = "로그아웃",
  onPrimary,
  onSecondary,
}: {
  title: string;
  desc: string;
  primaryLabel?: string;
  secondaryLabel?: string;
  onPrimary: () => void;
  onSecondary: () => void;
}) {
  return (
    <div role="alert" className="min-h-screen w-full bg-bg flex items-center justify-center px-stack-section">
      <div className="card p-region w-full max-w-sm text-center">
        <h1 className="text-lead font-bold text-text mb-stack-tight">{title}</h1>
        <p className="text-body-sm text-subtle mb-stack-section">{desc}</p>
        <div className="flex flex-col gap-stack-tight">
          <button
            onClick={onPrimary}
            className="w-full py-stack rounded-control text-accent-fg font-semibold text-body-sm bg-accent hover:bg-accent-hover transition-colors"
          >
            {primaryLabel}
          </button>
          <button
            onClick={onSecondary}
            className="w-full py-stack rounded-control text-caption text-subtle hover:text-muted transition-colors"
          >
            {secondaryLabel}
          </button>
        </div>
      </div>
    </div>
  );
}

/* Pipeline step semantic tones. */
const PIPELINE_STEPS = [
  { num: "1", label: "Trend Collection", desc: "외부 인기글 자동 수집", tone: "bg-accent-soft text-accent" },
  { num: "2", label: "AI Generation", desc: "Claude가 맞춤 콘텐츠 생성", tone: "bg-accent-soft text-accent" },
  { num: "3", label: "Human Review", desc: "대시보드에서 검수·편집", tone: "bg-warning/15 text-warning" },
  { num: "4", label: "Auto Publish", desc: "주요 채널 동시 발행", tone: "bg-success/15 text-success" },
  { num: "5", label: "Feedback Loop", desc: "반응 분석 → 자동 학습", tone: "bg-danger/15 text-danger" },
] as const;

const FEATURES = [
  {
    icon: "발행",
    title: "주요 채널 동시 발행",
    desc: "Threads, X, Facebook, Instagram, Bluesky, Telegram, Discord, Slack에 한 번에 예약 발행합니다.",
    tags: ["Threads", "X", "Facebook", "Instagram", "Bluesky", "Telegram", "Discord", "Slack"],
  },
  {
    icon: "생성",
    title: "AI 콘텐츠 생성",
    desc: "Content Guide 기반으로 Claude가 브랜드 톤에 맞는 콘텐츠를 자동 생성합니다. 채널별 맞춤 최적화 포함.",
    tags: ["Claude", "맞춤 톤", "채널별 최적화"],
  },
  {
    icon: "예약",
    title: "크론 자동 발행",
    desc: "생성 → 검수 → 발행 파이프라인이 24시간 자동 운영됩니다. 승인만 누르면 나머지는 자동.",
    tags: ["24/7", "자동화", "크론잡"],
  },
  {
    icon: "분석",
    title: "AI 피드백 루프",
    desc: "터진 글을 자동 감지하여 스타일과 패턴을 학습합니다. 다음 콘텐츠 품질이 자동으로 개선됩니다.",
    tags: ["Viral 감지", "자동 학습", "품질 개선"],
  },
  {
    icon: "편집",
    title: "카드뉴스 에디터",
    desc: "Instagram 카드뉴스를 AI가 자동 생성합니다. Midjourney 이미지 연동으로 비주얼 퀄리티를 높입니다.",
    tags: ["Instagram", "카드뉴스", "Midjourney"],
  },
  {
    icon: "성과",
    title: "실시간 대시보드",
    desc: "모든 채널의 성과를 한 화면에서 모니터링합니다. 팔로워 추이, 반응률, 터진 글 알림까지.",
    tags: ["통합 관제", "실시간", "알림"],
  },
] as const;

// SCHEDULABLE_PLATFORMS(lib/constants.ts)의 SSOT와 1:1 — "예약 발행이 실제 지원하는 채널"만 나열한다.
// (PUBLISH_CHANNEL_GROUPS는 연결 UI 범위일 뿐 발행 지원 목록이 아님 — LinkedIn/Pinterest/Tumblr/TikTok/
//  YouTube/Naver Blog/LINE은 연결만 가능하고 예약 발행 미지원이라 랜딩 나열에서 제외, 지원범위 과장 방지.
//  authgate-contract.test.ts가 이 목록을 SCHEDULABLE_PLATFORMS와 교차검증한다.)
const CHANNEL_ICONS = [
  "Threads", "X", "Facebook", "Instagram",
  "Bluesky", "Telegram", "Discord", "Slack",
];

/* ─── Landing Page ─── */
function LandingPage() {
  const scrollToLogin = useCallback(() => {
    // 고객 가입/로그인 페이지로 (Google OAuth 전용). 운영자 진입은 /operator로 분리.
    window.location.href = "/login";
  }, []);

  return (
    <div className="min-h-screen bg-bg">

      {/* ────── Hero ────── */}
      <section className="relative overflow-hidden">
        <div className="relative flex flex-col items-center px-stack-section pt-wide pb-wide text-center max-w-4xl mx-auto">
          {/* Badge */}
          <div className="inline-flex items-center gap-stack-tight px-pad-inset py-stack-tight rounded-pill text-caption font-medium mb-region border border-success/30 bg-success/10 text-success">
            <span className="w-2 h-2 rounded-pill bg-success animate-pulse" />
            베타 운영 중 · 가입 즉시 이용
          </div>

          <h1 className="text-display sm:text-display md:text-display font-extrabold text-text leading-tight mb-stack-section tracking-tight">
            AI가 SNS 마케팅을
            <br />
            <span className="text-accent">
              자동화합니다
            </span>
          </h1>

          <p className="text-lead sm:text-subheading text-subtle max-w-2xl mb-stack leading-relaxed">
            검수만 하세요. 콘텐츠 생성부터 발행, 반응 분석까지
            <br className="hidden sm:block" />
            AI가 처리합니다.
          </p>
          <p className="text-body-sm text-subtle mb-wide">
            주요 채널 통합 발행 · 24/7 자동 운영 · 피드백 루프
          </p>

          <div className="flex flex-col sm:flex-row gap-stack">
            <button
              onClick={scrollToLogin}
              className="px-region py-stack rounded-control bg-accent text-accent-fg hover:bg-accent-hover font-semibold text-body-sm transition-colors"
            >
              베타 신청하기
            </button>
            <a
              href="https://github.com/openclaw"
              target="_blank"
              rel="noopener noreferrer"
              className="px-region py-stack rounded-control text-muted font-medium text-body-sm border border-border hover:border-border hover:text-text transition-colors"
            >
              GitHub에서 보기
            </a>
          </div>
        </div>
      </section>

      {/* ────── Channel Marquee ────── */}
      <section className="py-region border-t border-b border-border/50">
        <div className="flex flex-wrap justify-center gap-stack max-w-4xl mx-auto px-stack-section">
          {CHANNEL_ICONS.map((ch) => (
            <span key={ch} className="px-stack py-micro text-caption rounded-pill bg-surface-2/60 text-subtle border border-border">
              {ch}
            </span>
          ))}
        </div>
      </section>

      {/* ────── Pipeline ────── */}
      <section className="max-w-5xl mx-auto px-stack-section py-wide">
        <div className="text-center mb-wide">
          <p className="text-caption font-semibold tracking-widest uppercase text-accent mb-stack">이용 방법</p>
          <h2 className="text-heading sm:text-display font-bold text-text mb-stack">완전 자동화 파이프라인</h2>
          <p className="text-body-sm text-subtle">설정 한 번이면 24/7 자동 운영</p>
        </div>

        {/* Desktop: horizontal */}
        <div className="hidden md:flex items-start justify-between gap-stack">
          {PIPELINE_STEPS.map((s, i) => (
            <div key={s.num} className="contents">
              <div className="flex-1 text-center">
                <div
                  className={`w-14 h-14 rounded-surface flex items-center justify-center mx-auto mb-pad-inset text-lead font-bold ${s.tone}`}
                >
                  {s.num}
                </div>
                <p className="text-body-sm font-semibold text-text mb-micro">{s.label}</p>
                <p className="text-caption text-subtle">{s.desc}</p>
              </div>
              {i < PIPELINE_STEPS.length - 1 && (
                <div className="flex items-center pt-stack-section text-subtle text-subheading select-none">&rarr;</div>
              )}
            </div>
          ))}
        </div>

        {/* Mobile: vertical */}
        <div className="flex md:hidden flex-col gap-pad-inset">
          {PIPELINE_STEPS.map((s, i) => (
            <div key={s.num}>
              <div className="flex items-center gap-pad-inset">
                <div
                  className={`w-12 h-12 rounded-surface flex items-center justify-center text-body font-bold shrink-0 ${s.tone}`}
                >
                  {s.num}
                </div>
                <div>
                  <p className="text-body-sm font-semibold text-text">{s.label}</p>
                  <p className="text-caption text-subtle">{s.desc}</p>
                </div>
              </div>
              {i < PIPELINE_STEPS.length - 1 && (
                <div className="ml-stack-section h-4 border-l border-border" />
              )}
            </div>
          ))}
        </div>
      </section>

      {/* ────── Features ────── */}
      <section className="max-w-5xl mx-auto px-stack-section py-wide">
        <div className="text-center mb-wide">
          <p className="text-caption font-semibold tracking-widest uppercase text-accent mb-stack">주요 기능</p>
          <h2 className="text-heading sm:text-display font-bold text-text mb-stack">마케팅에 필요한 모든 것</h2>
          <p className="text-body-sm text-subtle">채널 관리부터 콘텐츠 생성, 분석까지 한 곳에서</p>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-stack-section">
          {FEATURES.map((f) => (
            <div key={f.title} className="card p-stack-section hover:border-border transition-colors group">
              <div className="text-heading mb-pad-inset">{f.icon}</div>
              <h3 className="text-body-sm font-semibold text-text mb-stack-tight group-hover:text-accent transition-colors">
                {f.title}
              </h3>
              <p className="text-caption text-subtle leading-relaxed mb-pad-inset">{f.desc}</p>
              <div className="flex flex-wrap gap-stack-tight">
                {f.tags.map((t) => (
                  <span key={t} className="text-caption px-stack-tight py-micro rounded-chip bg-surface-2/80 text-subtle">
                    {t}
                  </span>
                ))}
              </div>
            </div>
          ))}
        </div>
      </section>

      {/* ────── Pricing ────── */}
      <section className="max-w-3xl mx-auto px-stack-section py-wide">
        <div className="text-center mb-wide">
          <p className="text-caption font-semibold tracking-widest uppercase text-success mb-stack">요금</p>
          <h2 className="text-heading sm:text-display font-bold text-text mb-stack">심플한 요금제</h2>
          <p className="text-body-sm text-subtle">베타 기간 월 기본 제공량 내 무료입니다</p>
        </div>

        <div className="card p-region max-w-md mx-auto text-center relative overflow-hidden">
          {/* Glow accent */}
          <div className="absolute top-0 left-1/2 -translate-x-1/2 w-40 h-0.5 bg-success" />

          <div className="inline-flex items-center px-stack py-micro rounded-pill text-caption font-medium mb-stack-section border border-success/30 bg-success/10 text-success">
            베타 무료 제공
          </div>

          <h3 className="text-display font-bold text-text mb-micro">무료</h3>
          <p className="text-body-sm text-subtle mb-region">₩0 / 월</p>

          <ul className="text-left space-y-stack mb-region">
            {[
              "주요 채널 연결",
              "AI 콘텐츠 자동 생성",
              "크론 자동 발행",
              "피드백 루프 · 반응 분석",
              "카드뉴스 에디터",
              "실시간 대시보드",
            ].map((item) => (
              <li key={item} className="flex items-center gap-stack text-body-sm text-muted">
                <span className="text-success text-body">✓</span>
                {item}
              </li>
            ))}
          </ul>

          <button
            onClick={scrollToLogin}
            className="w-full py-stack rounded-control bg-accent text-accent-fg hover:bg-accent-hover font-semibold text-body-sm transition-colors"
          >
            베타 신청하기
          </button>

          <p className="text-caption text-subtle mt-pad-inset">가입 즉시 대시보드 이용 가능 · 공유 AI 생성은 운영자 승인 또는 자체 Anthropic 키 등록 후 · 추후 Pro / Business 플랜 추가 예정</p>
        </div>
      </section>

      {/* ────── Login ────── */}
      <section className="max-w-md mx-auto px-stack-section py-wide">
        <div className="card p-region relative overflow-hidden">
          {/* Top accent line */}
          <div className="absolute top-0 left-1/2 -translate-x-1/2 w-40 h-0.5 bg-accent" />

          <div className="text-center mb-stack-section">
            <h3 className="text-lead font-bold text-text mb-stack-tight">시작하기</h3>
            <p className="text-caption text-subtle">Google 계정으로 시작하고 내 브랜드 콘텐츠를 자동 생성·발행하세요</p>
          </div>

          {/* 고객 가입/로그인 — Google OAuth 전용 (중앙정렬된 /login 페이지) */}
          <a
            href="/login"
            className="block w-full py-stack rounded-control bg-accent text-accent-fg hover:bg-accent-hover font-semibold text-body-sm text-center transition-colors"
          >
            로그인 / 회원가입 →
          </a>

          {/* 운영자 진입은 /operator로 분리 — 고객 화면엔 비번 박스 노출 안 함 */}
          <a
            href="/operator"
            className="block w-full mt-stack text-center text-caption text-subtle hover:text-muted transition-colors"
          >
            운영자세요? 운영자 콘솔로 →
          </a>
        </div>
      </section>

      {/* ────── Footer ────── */}
      <footer className="border-t border-border/50 py-wide">
        <div className="max-w-5xl mx-auto px-stack-section flex flex-col sm:flex-row items-center justify-between gap-pad-inset">
          <p className="text-caption text-subtle">
            Powered by{" "}
            <a href="https://openclaw.ai" target="_blank" rel="noopener noreferrer"
              className="text-subtle hover:text-muted transition-colors">
              OpenClaw
            </a>
            {" "}+ Claude
          </p>
          <div className="flex items-center gap-stack-section">
            <a href="/privacy" className="text-caption text-subtle hover:text-muted transition-colors">
              개인정보처리방침
            </a>
            <a href="/terms" className="text-caption text-subtle hover:text-muted transition-colors">
              이용약관
            </a>
            <a href="/data-deletion" className="text-caption text-subtle hover:text-muted transition-colors">
              데이터 삭제
            </a>
            <a href="https://github.com/openclaw" target="_blank" rel="noopener noreferrer"
              className="text-caption text-subtle hover:text-muted transition-colors">
              GitHub
            </a>
          </div>
        </div>
      </footer>
    </div>
  );
}

/**
 * AuthGate — wraps the app.
 * If no token in localStorage, show full-page landing (no sidebar).
 * If token exists, render children (sidebar + content).
 */
export function AuthGate({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const router = useRouter();
  const [hasToken, setHasToken] = useState<boolean | null>(null);
  const [gateStatus, setGateStatus] = useState<GateStatus>("checking");
  const [verifiedAccessKey, setVerifiedAccessKey] = useState<string | null>(null);
  const reauthInFlight = useRef(false);
  const reauthOwnerToken = useRef<string | null>(null);
  const pollGeneration = useRef(0);
  const pollAbortController = useRef<AbortController | null>(null);
  const setActiveWorkspace = useUIStore((state) => state.setActiveWorkspace);
  const isPublicPath = ["/login", "/signup", "/operator", "/privacy", "/terms", "/data-deletion"].includes(pathname);
  const isCustomerProtectedPath = !isPublicPath && pathname !== "/" && !pathname.startsWith("/operator");

  useEffect(() => {
    setHasToken(!!getAuthToken());
  }, []);

  const reauthenticateCurrentIdentity = useCallback(async (expectedToken?: string) => {
    if (expectedToken !== undefined && getAuthToken() !== expectedToken) return;
    if (reauthInFlight.current) return;
    reauthInFlight.current = true;
    const token = expectedToken ?? getAuthToken();
    const identityKind = getAuthIdentityKind();
    // A legacy malformed customer snapshot has no reliable JWT shape. On a customer
    // route it still belongs to the customer login boundary unless an operator login
    // explicitly stamped the credential as operator.
    const customerCredential = !pathname.startsWith("/operator")
      || identityKind === "customer"
      || isCustomerAuthToken(token);
    // 어떤 보호 화면에서 401이 발생해도 provider signOut 완료를 기다리는 동안 이전 데이터와
    // 행동 버튼이 살아 있으면 안 된다. 즉시 children을 내리고 재로그인 안내로 fail-closed한다.
    setGateStatus("auth_error");
    if (customerCredential) {
      // Supabase emits SIGNED_OUT from signOut(). This operation owns that event:
      // the auth-state listener must not independently clear a replacement session.
      reauthOwnerToken.current = token;
      try {
        const { createBrowserSupabase } = await import("@/lib/supabase");
        if (getAuthToken() !== token) {
          if (reauthOwnerToken.current === token) reauthOwnerToken.current = null;
          reauthInFlight.current = false;
          return;
        }
        // 만료는 로그아웃 사유가 아니다. 먼저 갱신을 시도한다.
        //
        // 2026-09-05 실측: 스튜디오에서 작업하는 도중 접근 토큰 수명이 끝나자 그대로
        // 로그인 화면으로 튕겼다. 여기서 갱신 토큰을 한 번도 쓰지 않고 바로 로그아웃했기
        // 때문이다. 접근 토큰은 원래 짧게 살고 갱신 토큰으로 이어 가는 것이 정상이다.
        // 갱신에 성공하면 사용자는 있던 자리에 그대로 남고, 실패했을 때만 아래로 내려가
        // 종전대로 로그아웃한다. 갱신 실패는 진짜 재로그인 사유다.
        const refreshed = await createBrowserSupabase().auth.refreshSession();
        const renewedToken = refreshed.data.session?.access_token;
        if (!refreshed.error && renewedToken && renewedToken !== token) {
          setAuthToken(renewedToken, "customer");
          setHasToken(true);
          setGateStatus("checking");
          if (reauthOwnerToken.current === token) reauthOwnerToken.current = null;
          reauthInFlight.current = false;
          return;
        }
        // Reauthenticate only this rejected browser session. A global sign-out can
        // revoke a replacement session that completed while this request was pending.
        await createBrowserSupabase().auth.signOut({ scope: "local" });
      } catch {
        // Provider sign-out failure must not retain a JWT already rejected by our API.
      }
    }
    if (getAuthToken() !== token) {
      if (reauthOwnerToken.current === token) reauthOwnerToken.current = null;
      reauthInFlight.current = false;
      return;
    }
    clearAuthToken();
    setActiveWorkspace(null);
    setHasToken(false);
    setGateStatus("checking");
    if (reauthOwnerToken.current === token) reauthOwnerToken.current = null;
    const returnTo = `${pathname}${typeof window !== "undefined" ? window.location.search : ""}`;
    router.replace(customerCredential ? customerLoginUrl(returnTo) : "/operator");
  }, [pathname, router, setActiveWorkspace]);

  useEffect(() => {
    const handler = () => { void reauthenticateCurrentIdentity(); };
    window.addEventListener("auth:customer-reauth-required", handler);
    return () => window.removeEventListener("auth:customer-reauth-required", handler);
  }, [reauthenticateCurrentIdentity]);

  // Protected customer routes never render the public marketing landing while a
  // rejected or missing credential is being handed to the customer login page.
  // This also makes router replacement resilient to Supabase SIGNED_OUT races.
  useEffect(() => {
    if (hasToken !== false || !isCustomerProtectedPath) return;
    const returnTo = `${pathname}${window.location.search}`;
    router.replace(customerLoginUrl(returnTo));
  }, [hasToken, isCustomerProtectedPath, pathname, router]);

  // Supabase 세션 ↔ localStorage 토큰 스냅샷 동기화.
  // 수동 스냅샷은 자동갱신이 안 돼 만료(~1h) 후에도 "로그인됨"으로 보여 전 API가 401이 된다.
  // getSession으로 갱신된 토큰을 스냅샷에 반영하고, onAuthStateChange로 계속 동기화.
  // SIGNED_OUT이면 스냅샷 제거 → 랜딩으로.
  useEffect(() => {
    // LoginPage is the sole owner of validating a recovered Supabase session before
    // redirecting. Promoting here would race getSession/onAuthStateChange and could
    // re-install an expired token that LoginPage is simultaneously rejecting.
    if (pathname === "/login") return;
    let cancelled = false;
    let unsub: (() => void) | undefined;
    // 운영자 콘솔에서는 비-JWT 운영자 토큰을 Supabase 세션보다 우선한다. 반대로 고객 로그인/
    // 고객 화면에서 Supabase 세션이 확립되면 잔존 운영자 토큰보다 고객 JWT를 승격한다.
    // 두 identity가 같은 localStorage 키를 공유하므로 path 경계를 함께 봐야 한다.
    const operatorConsoleActive = pathname.startsWith("/operator");
    const operatorActive = () => getAuthIdentityKind() === "operator"
      || (pathname.startsWith("/operator") && !!getAuthToken() && !isCustomerAuthToken(getAuthToken()));
    const promoteCustomerSession = (accessToken: string) => {
      if (cancelled) return;
      if (getAuthToken() !== accessToken) setActiveWorkspace(null);
      setAuthToken(accessToken, "customer");
      setVerifiedAccessKey(null);
      setGateStatus("checking");
      setHasToken(true);
    };
    (async () => {
      try {
        const { createBrowserSupabase } = await import("@/lib/supabase");
        const sb = createBrowserSupabase();
        const { data: { session } } = await sb.auth.getSession();
        // pathname 변경/unmount 뒤 완료된 초기화는 이전 경로의 identity 정책을 적용하거나
        // auth listener를 되살리면 안 된다.
        if (cancelled) return;
        if (session?.access_token && (!operatorActive() || !operatorConsoleActive)) {
          promoteCustomerSession(session.access_token);
        }
        const { data } = sb.auth.onAuthStateChange((event, sess) => {
          if (cancelled) return;
          if (sess?.access_token) {
            if (operatorActive() && operatorConsoleActive) return;
            promoteCustomerSession(sess.access_token);
          } else if (event === "SIGNED_OUT") {
            if (operatorActive()) return; // Supabase sign-out은 운영자 토큰을 폐기하지 않는다.
            // A 401-triggered signOut owns its SIGNED_OUT event and will clear only
            // if its failed request token is still current after signOut resolves.
            // With no owner, this is a legitimate user/provider sign-out.
            if (reauthOwnerToken.current) return;
            clearAuthToken();
            setActiveWorkspace(null);
            setHasToken(false);
          }
        });
        if (cancelled) {
          data.subscription.unsubscribe();
          return;
        }
        unsub = () => data.subscription.unsubscribe();
      } catch {
        /* supabase env 미설정/dev — 무시(운영자 토큰 경로는 영향 없음) */
      }
    })();
    return () => {
      cancelled = true;
      unsub?.();
    };
  }, [pathname, setActiveWorkspace]);

  // 계정 게이트: /api/me를 15초마다 폴링해 paused(정지)/accountUnavailable(알수없는 상태)만 화면분기.
  // OSMU v1.0.0부터 active 계정은 승인 대기 없이 즉시 대시보드에 진입한다(공유 AI 사용 승인은
  // 별도 entitlement — sharedAiApproved 플래그로 화면 내 quota 안내에만 쓰인다).
  // 운영자가 정지를 해제하면 수동 새로고침 없이 이 폴링으로 자동 해제된다.
  useEffect(() => {
    if (isPublicPath || !hasToken) return;
    let cancelled = false;

    async function poll() {
      const generation = ++pollGeneration.current;
      pollAbortController.current?.abort();
      const controller = new AbortController();
      pollAbortController.current = controller;
      const requestToken = getAuthToken();
      const requestAccessKey = `${pathname}\u0000${requestToken}`;
      const ownsPoll = () => !cancelled
        && generation === pollGeneration.current
        && !controller.signal.aborted
        && getAuthToken() === requestToken;
      try {
        const res = await fetch("/api/me", {
          headers: requestToken ? { Authorization: `Bearer ${requestToken}` } : {},
          signal: controller.signal,
        });
        if (!ownsPoll()) return;
        if (res.status === 401) {
          // Customer JWTs re-enter the only supported login path (Google/Supabase).
          // Operator tokens retain their separate /operator credential entry.
          void reauthenticateCurrentIdentity(requestToken);
          return;
        }
        let statusRes = res;
        if (!statusRes.ok) {
          // 상태를 신뢰할 수 없으니 fail-closed 다. 다만 한 번의 실패로 곧장 막지는 않는다.
          //
          // 2026-09-05 회장 계정 실측: 배포로 컨테이너가 잠깐 재시작하는 사이 이 검사가 한 번
          // 실패해 작업 중이던 화면이 통째로 "서비스 확인 실패"로 덮였다. 바로 뒤에 같은
          // 토큰으로 부르니 200 이었다. 순간적인 장애로 작업 맥락을 잃게 만드는 것은 과하다.
          // 서버 오류 계열만 한 번 더 물어보고, 성공하면 그 응답으로 평소 흐름을 이어간다.
          // 권한 거부는 재시도해도 답이 같으므로 즉시 막는다.
          if (statusRes.status >= 500) {
            await new Promise((resolve) => setTimeout(resolve, 1200));
            if (!ownsPoll()) return;
            const retry = await fetch("/api/me", {
              headers: requestToken ? { Authorization: `Bearer ${requestToken}` } : {},
              signal: controller.signal,
            }).catch(() => null);
            if (!ownsPoll()) return;
            if (retry?.ok) statusRes = retry;
          }
        }
        if (!statusRes.ok) {
          setVerifiedAccessKey(requestAccessKey);
          setGateStatus("service_error");
          return;
        }
        const data = await statusRes.json().catch(() => null);
        if (!ownsPoll()) return;
        if (!data) {
          setVerifiedAccessKey(requestAccessKey);
          setGateStatus("service_error");
          return;
        }
        // 운영자는 customer tenant 문맥을 갖지 않는다. persisted workspace를 children/Sidebar
        // mount 전에 제거해 고객 identity·쿼리 스코프가 운영자 shell에 한 프레임도 섞이지 않게 한다.
        if (data.isOperator) {
          setActiveWorkspace(null);
          if (pathname !== "/operator/customers") {
            // Operator and customer shells are mutually exclusive. Keep the gate closed
            // until App Router replaces the customer route with the Admin entry point.
            router.replace("/operator/customers");
            return;
          }
        } else {
          const validCustomerTenant = typeof data.tenant?.id === "string"
            && data.tenant.id.length > 0
            && data.tenantError !== true;
          if (!validCustomerTenant) {
            setVerifiedAccessKey(requestAccessKey);
            setGateStatus("account_unavailable");
            return;
          }
          if (pathname.startsWith("/operator")) {
            // A customer credential can never authorize the operator shell. Keep
            // children closed while returning to the customer home.
            router.replace("/");
            return;
          }
        }
        setVerifiedAccessKey(requestAccessKey);
        if (data.accessPaused) setGateStatus("access_paused");
        else if (data.accountUnavailable) setGateStatus("account_unavailable");
        else setGateStatus("ok");
      } catch (error) {
        if (ownsPoll() && !(error instanceof DOMException && error.name === "AbortError")) {
          setVerifiedAccessKey(requestAccessKey);
          setGateStatus("service_error");
        }
      } finally {
        if (pollAbortController.current === controller) pollAbortController.current = null;
      }
    }

    poll();
    const id = setInterval(poll, 15000);
    return () => {
      cancelled = true;
      pollGeneration.current += 1;
      pollAbortController.current?.abort();
      pollAbortController.current = null;
      clearInterval(id);
    };
  }, [isPublicPath, hasToken, pathname, reauthenticateCurrentIdentity, router, setActiveWorkspace]);

  const doLogout = useCallback(async () => {
    const t = getAuthToken();
    // 고객(JWT) 세션은 Supabase 서버 세션도 함께 끊어야 안전한 로그아웃이다 — localStorage만
    // 지우면 refresh token이 남아 다른 탭/재접속에서 세션이 되살아날 수 있다. 운영자(비-JWT)
    // 토큰은 Supabase auth와 무관하므로 signOut을 호출하지 않는다.
    if (getAuthIdentityKind() === "customer" || isCustomerAuthToken(t)) {
      try {
        const { createBrowserSupabase } = await import("@/lib/supabase");
        await createBrowserSupabase().auth.signOut();
      } catch {
        /* Supabase 세션 종료 실패해도 로컬 토큰은 반드시 지운다 */
      }
    }
    clearAuthToken();
    setActiveWorkspace(null);
    window.location.href = "/login";
  }, [setActiveWorkspace]);

  const doRefresh = useCallback(() => {
    window.location.reload();
  }, []);

  // 로그인/가입/운영자 콘솔은 인증 없이 풀스크린으로(진입점) — 사이드바·게이트 없이.
  if (isPublicPath) {
    return <main className="min-h-screen w-full">{children}</main>;
  }

  // SSR: localStorage 확인 전엔 아무것도 안 그림
  if (hasToken === null) return null;

  // 미인증: 랜딩(마케팅 + 로그인/회원가입 CTA → /login)
  if (!hasToken) {
    if (isCustomerProtectedPath) {
      return (
        <div className="min-h-screen w-full bg-bg flex items-center justify-center px-stack-section">
          <p className="text-body-sm text-subtle">로그인 화면으로 이동 중...</p>
        </div>
      );
    }
    return <LandingPage />;
  }

  const currentAccessKey = `${pathname}\u0000${getAuthToken()}`;

  // 승인된 token+pathname 쌍이 아니면 이전 경로의 children/SWR cache를 한 프레임도 mount하지 않는다.
  if (gateStatus === "checking" || verifiedAccessKey !== currentAccessKey) {
    return (
      <div className="min-h-screen w-full bg-bg flex items-center justify-center px-stack-section">
        <p className="text-body-sm text-subtle">확인 중...</p>
      </div>
    );
  }

  if (gateStatus === "auth_error") {
    return (
      <GateBlockScreen
        title="세션이 만료되었습니다"
        desc="계속하려면 다시 로그인해주세요. 이전 화면의 데이터와 행동은 사용할 수 없습니다."
        primaryLabel="로그인 화면으로 이동"
        secondaryLabel="새로고침"
        onPrimary={doLogout}
        onSecondary={doRefresh}
      />
    );
  }

  if (gateStatus === "service_error") {
    return (
      <GateBlockScreen
        title="서비스 확인 실패"
        desc="계정 상태를 확인하지 못했습니다. 잠시 후 다시 시도해주세요."
        onPrimary={doRefresh}
        onSecondary={doLogout}
      />
    );
  }

  if (gateStatus === "access_paused") {
    return (
      <GateBlockScreen
        title="계정 이용이 중지되었습니다"
        desc="문의사항은 운영팀에 연락해주세요."
        onPrimary={doRefresh}
        onSecondary={doLogout}
      />
    );
  }

  if (gateStatus === "account_unavailable") {
    return (
      <GateBlockScreen
        title="계정 상태를 확인할 수 없습니다"
        desc="일시적인 문제일 수 있습니다. 잠시 후 다시 시도하거나 운영팀에 문의해주세요."
        onPrimary={doRefresh}
        onSecondary={doLogout}
      />
    );
  }

  // 인증됨: 사이드바 + 콘텐츠
  return (
    <div className="flex min-h-screen w-full flex-col md:flex-row">
      <Sidebar />
      <main data-app-main="true" className="min-h-0 min-w-0 flex-1 overflow-y-auto md:min-h-screen">
        <ErrorBoundary>{children}</ErrorBoundary>
      </main>
    </div>
  );
}
