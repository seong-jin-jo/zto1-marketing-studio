"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useState } from "react";
import useSWR from "swr";
import { useChannelConfig } from "@/hooks/useChannelConfig";
import {
  CH_LABELS,
} from "@/lib/constants";
import { CHANNEL_GROUPS } from "@/lib/channel-capabilities";
import { getChannelIcon } from "@/lib/channel-icons";
import { useUIStore, type StudioRoom, type Workspace } from "@/store/ui-store";
import { fetcher } from "@/lib/api";
import { clearAuthToken, getAuthToken } from "@/lib/auth";
import { ThemeToggle } from "./ThemeToggle";

interface MeResponse {
  isOperator?: boolean;
  tenant?: Workspace | null;
  tenantError?: boolean;
}

/* ── Sidebar Group ── */
function SidebarGroup({
  groupKey,
  title,
  items,
  showNarrowLabels = false,
}: {
  groupKey: string;
  title: string;
  showNarrowLabels?: boolean;
  items: Array<{
    key?: string;
    href?: string;
    label: string;
    icon: string;
    iconClass?: string;
    nav?: boolean;
    soon?: boolean;
    status?: string;
    statusClass?: string;
  }>;
}) {
  const pathname = usePathname();
  const { sidebarCollapsed, toggleSidebar } = useUIStore();

  const collapsed = sidebarCollapsed[groupKey] ?? false; // 기본 펼침 (사용자가 접으면 그 상태 유지)

  return (
    <div className="mt-pad-inset">
      <button
        onClick={() => toggleSidebar(groupKey)}
        className="px-stack mb-micro w-full flex items-center justify-between cursor-pointer hover:opacity-80"
      >
        <span className={`text-caption font-medium text-subtle uppercase tracking-wider ${showNarrowLabels ? "" : "max-xl:sr-only"}`}>{title}</span>
        <span className="flex items-center gap-micro">
          <svg
            className={`w-3 h-3 text-subtle transition-transform ${collapsed ? "" : "rotate-180"}`}
            fill="none"
            stroke="currentColor"
            viewBox="0 0 24 24"
          >
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
          </svg>
        </span>
      </button>
      {!collapsed &&
        items.map((i, idx) => {
          const href = i.href ?? (i.key === "blog" ? "/blog" : i.key ? `/channels/${i.key}` : "#");
          const hrefPath = href.split(/[?#]/, 1)[0];
          const isActive = pathname === hrefPath;
          const textColor = i.status === "사용 중" || i.status === "연결됨" ? "text-muted" : "text-subtle";
          return (
            <Link
              key={i.key || `${i.label}-${idx}`}
              href={href}
              title={i.label}
              className={`sidebar-item ${isActive ? "active" : ""} w-full text-left px-pad-inset py-stack-tight text-body-sm ${textColor} flex items-center gap-stack`}
            >
              <span
                className={`w-4 h-4 rounded-chip ${i.iconClass || "text-subtle"} flex items-center justify-center`}
              >
                {i.key ? getChannelIcon(i.key) : <span className="text-caption font-bold">{i.icon}</span>}
              </span>
              <span className={showNarrowLabels ? "" : "max-xl:sr-only"}>{i.label}</span>
              {i.status && (
                <span className={`ml-auto text-caption px-stack-tight py-micro rounded-pill ${showNarrowLabels ? "" : "max-xl:hidden"} ${i.statusClass || "bg-surface-2 text-subtle"}`}>
                  {i.status}
                </span>
              )}
            </Link>
          );
        })}
    </div>
  );
}

const ROOM_FLOW: Array<{ key: StudioRoom | "performance"; label: string; href: string }> = [
  { key: "create", label: "생성실", href: "/studio?room=create" },
  { key: "edit", label: "편집실", href: "/studio?room=edit" },
  { key: "publish", label: "발행실", href: "/studio?room=publish" },
  { key: "performance", label: "성과실", href: "/performance" },
];

function RoomFlowNav({ pathname, onNavigate }: { pathname: string; onNavigate?: () => void }) {
  const { studioRoom, setStudioRoom } = useUIStore();
  const activeIndex = pathname === "/performance"
    ? ROOM_FLOW.length - 1
    : pathname === "/studio"
      ? ROOM_FLOW.findIndex((room) => room.key === studioRoom)
      : -1;
  const outsideRoom = pathname === "/inbox"
    ? { label: "승인 인박스", href: "/inbox" }
    : pathname === "/calendar"
      ? { label: "발행 캘린더", href: "/calendar" }
      : null;

  return (
    <section className="border-b border-border px-stack pb-stack" aria-label="한 편의 제작 순서">
      <p className="mb-stack text-caption font-semibold text-subtle max-xl:text-center">한 편의 제작 순서</p>
      <ol className="space-y-micro">
        {ROOM_FLOW.map((room, index) => {
          const active = index === activeIndex;
          const done = activeIndex >= 0 && index < activeIndex;
          return (
            <li key={room.key} className="relative">
              {index < ROOM_FLOW.length - 1 ? (
                <span className={`absolute left-4 top-8 h-5 border-l ${done ? "border-accent" : "border-border"}`} aria-hidden />
              ) : null}
              <Link
                href={room.href}
                onClick={() => {
                  if (room.key !== "performance") setStudioRoom(room.key);
                  onNavigate?.();
                }}
                aria-current={active ? "page" : undefined}
                className={`flex min-h-control-touch items-center gap-stack-tight rounded-control px-stack-tight py-stack-tight text-body-sm font-semibold transition-colors max-xl:flex-col max-xl:gap-micro max-xl:px-micro ${active ? "bg-accent text-accent-fg" : "text-muted hover:bg-surface-2"}`}
              >
                <span className={`relative z-10 grid h-8 w-8 shrink-0 place-items-center rounded-pill border text-caption ${active ? "border-accent-fg/40 bg-accent-fg/15 text-accent-fg" : done ? "border-accent bg-accent-soft text-accent" : "border-border bg-surface text-subtle"}`}>
                  {`0${index + 1}`}
                </span>
                <span>{room.label}</span>
              </Link>
            </li>
          );
        })}
      </ol>
      {outsideRoom ? (
        <Link
          href={outsideRoom.href}
          onClick={onNavigate}
          aria-current="page"
          data-outside-room-current
          className="mt-stack flex min-h-control-touch items-center gap-stack-tight rounded-control border border-accent bg-accent-soft px-stack text-body-sm font-semibold text-accent max-xl:flex-col max-xl:gap-micro max-xl:px-micro"
        >
          <span className="text-caption">현재 위치</span>
          <span>{outsideRoom.label}</span>
        </Link>
      ) : null}
    </section>
  );
}

/* ── Helper: build sidebar item from channel config ── */
function chSidebarItem(key: string, channelConfig: Record<string, Record<string, unknown>>) {
  const ch = channelConfig[key] || {};
  const status = (ch.status as string) || "soon";
  const label = CH_LABELS[key] || key;

  if (status === "live") {
    return {
      key,
      label,
      icon: label[0],
      nav: true,
      status: "사용 중" as const,
      statusClass: "bg-success/15 text-success",
    };
  }
  if (status === "connected") {
    return {
      key,
      label,
      icon: label[0],
      nav: true,
      status: "연결됨" as const,
      statusClass: "bg-accent/15 text-accent",
    };
  }
  // 미연결. 클릭 가능, 흰 글씨.
  return { key, label, icon: label[0], nav: true };
}

/* ── 고객 워크스페이스 identity (운영자 shell과 완전 분리) ── */
function CustomerWorkspaceIdentity({
  me,
  mutateMe,
  compactOnNarrow = false,
}: {
  me: MeResponse;
  mutateMe: () => Promise<unknown>;
  compactOnNarrow?: boolean;
}) {
  const { activeWorkspace, setActiveWorkspace } = useUIStore();

  // 고객은 /api/me가 반환한 자기 테넌트만 활성화한다.
  // ⚠️ 반드시 "값이 실제로 바뀔 때만" set. 무조건 set하면 set→재렌더→effect→set 무한 루프(React 오류 185).
  // 로그아웃 직후에는 이전 /api/me 응답이 남아 있어도 workspace를 다시 persist하지 않는다.
  useEffect(() => {
    if (me.tenant && getAuthToken()) {
      if (activeWorkspace?.id !== me.tenant.id) setActiveWorkspace(me.tenant);
    }
  }, [me.tenant, activeWorkspace?.id, setActiveWorkspace]);

  // 테넌트 해석 실패(세션 만료/일시적 DB 오류 등). 명시적 재시도 경로 제공.
  if (me.tenantError) {
    return (
      <button onClick={() => void mutateMe()} className={`mt-micro text-caption text-subtle hover:text-muted ${compactOnNarrow ? "max-xl:sr-only" : ""}`}>
        워크스페이스 연결 확인 중… <span className="underline">다시 시도</span>
      </button>
    );
  }

  return (
    <div className="mt-micro text-caption">
      <span className={`bg-gradient-to-r from-accent to-accent-hover bg-clip-text text-transparent font-medium ${compactOnNarrow ? "max-xl:sr-only" : ""}`}>
        {me.tenant?.name || activeWorkspace?.name || "내 워크스페이스"}
      </span>
    </div>
  );
}

function SidebarFooter({ isOperator, compactOnNarrow = false }: { isOperator: boolean; compactOnNarrow?: boolean }) {
  const setActiveWorkspace = useUIStore((state) => state.setActiveWorkspace);

  return (
    <div className="shrink-0 px-pad-inset py-stack border-t border-border/50 space-y-stack-tight max-xl:px-stack-tight">
      <ThemeToggle compactOnNarrow={compactOnNarrow} />
      <button
        onClick={async () => {
          try {
            const { createBrowserSupabase } = await import("@/lib/supabase");
            await createBrowserSupabase().auth.signOut();
          } catch { /* env 미설정/세션 없음 무시 */ }
          clearAuthToken();
          setActiveWorkspace(null);
          window.location.href = isOperator ? "/operator" : "/login";
        }}
        className="w-full flex items-center gap-stack-tight px-micro py-micro text-caption text-subtle hover:text-danger transition-colors"
        title="로그아웃"
      >
        <span aria-hidden>⎋</span><span className={compactOnNarrow ? "max-xl:sr-only" : ""}>로그아웃</span>
      </button>
    </div>
  );
}

function OperatorSidebar() {
  const pathname = usePathname();

  return (
    <aside className="w-56 border-r border-border/50 bg-surface flex flex-col h-screen sticky top-0">
      <div className="px-pad-inset py-stack-section border-b border-border/50">
        <div className="flex items-center gap-stack-tight">
          <svg width="24" height="24" viewBox="0 0 24 24" fill="none" className="text-muted shrink-0" aria-label="운영자">
            <rect x="3" y="3" width="18" height="18" rx="5" fill="var(--accent)" opacity="0.25" />
            <path d="M8 12h8M12 8v8" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
          </svg>
          <h1 className="text-body font-semibold text-text tracking-tight">운영자</h1>
        </div>
        <p className="mt-micro text-caption text-subtle">운영자 콘솔</p>
      </div>

      <nav className="flex-1 min-h-0 overflow-y-auto py-stack">
        <div className="px-stack mb-stack-tight">
          <span className="text-caption font-medium text-subtle uppercase tracking-wider">운영</span>
        </div>
        <Link
          href="/operator/customers"
          className={`sidebar-item ${pathname === "/operator/customers" ? "active" : ""} w-full text-left px-pad-inset py-stack-tight text-body-sm text-muted flex items-center gap-stack`}
        >
          <span className="text-accent" aria-hidden>◎</span>
          고객 관리
        </Link>
      </nav>

      <SidebarFooter isOperator />
    </aside>
  );
}

/* ── Customer Sidebar ── */
function CustomerSidebar({
  me,
  mutateMe,
}: {
  me: MeResponse;
  mutateMe: () => Promise<unknown>;
}) {
  const pathname = usePathname();
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const { data: channelConfig } = useChannelConfig();
  const { data: images } = useSWR<unknown[]>("/api/images", fetcher);
  const studioRoom = useUIStore((state) => state.studioRoom);

  const cfg = (channelConfig || {}) as unknown as Record<string, Record<string, unknown>>;
  const imageCount = Array.isArray(images) ? images.length : 0;
  const narrowLabelClass = mobileMenuOpen ? "" : "max-xl:sr-only";

  useEffect(() => {
    setMobileMenuOpen(false);
  }, [pathname]);

  useEffect(() => {
    if (!mobileMenuOpen) return;
    const closeOnEscape = (event: KeyboardEvent) => {
      if (event.key === "Escape") setMobileMenuOpen(false);
    };
    window.addEventListener("keydown", closeOnEscape);
    return () => window.removeEventListener("keydown", closeOnEscape);
  }, [mobileMenuOpen]);

  const currentRoomLabel = pathname === "/performance"
    ? "성과실"
    : pathname === "/studio"
      ? ROOM_FLOW.find((room) => room.key === studioRoom)?.label
      : undefined;

  // Build threads item specially
  const threadsItem = {
    key: "threads",
    label: "Threads",
    icon: "T",
    iconClass: "bg-accent text-accent-fg",
    nav: true,
    status: (cfg.threads?.connected ? "사용 중" : "") as string,
    statusClass: cfg.threads?.connected
      ? "bg-success/15 text-success"
      : "bg-surface-2 text-subtle",
  };

  // Build X item specially
  const xItem = {
    key: "x",
    label: "X (Twitter)",
    icon: "X",
    nav: true,
    status: cfg.x?.connected
      ? cfg.x?.enabled
        ? "사용 중"
        : "연결됨"
      : ("" as string),
    statusClass: cfg.x?.connected
      ? cfg.x?.enabled
        ? "bg-success/15 text-success"
        : "bg-accent/15 text-accent"
      : "",
  };

  return (
    <>
      {mobileMenuOpen ? (
        <button
          type="button"
          aria-label="메뉴 바깥 닫기"
          onClick={() => setMobileMenuOpen(false)}
          className="fixed inset-0 z-40 border-0 bg-text/40 md:hidden"
        />
      ) : null}

      <header className="flex min-h-control-touch w-full items-center gap-stack border-b border-border bg-surface px-stack md:hidden">
        <button
          type="button"
          aria-controls="customer-sidebar"
          aria-expanded={mobileMenuOpen}
          aria-label="메뉴 열기"
          onClick={() => setMobileMenuOpen(true)}
          className="grid min-h-control-touch min-w-control-touch place-items-center rounded-control border border-border bg-surface-2 text-text"
        >
          <svg className="h-5 w-5" fill="none" stroke="currentColor" viewBox="0 0 24 24" aria-hidden>
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 7h16M4 12h16M4 17h16" />
          </svg>
        </button>
        <p className="text-body-sm font-semibold text-text">
          {currentRoomLabel ?? "작업 공간"}
        </p>
      </header>

      <aside
        id="customer-sidebar"
        aria-label="주요 사이드바"
        className={`${mobileMenuOpen ? "fixed inset-y-0 left-0 z-50 flex" : "hidden"} h-dvh min-w-0 w-[min(20rem,86vw)] shrink-0 flex-col overflow-hidden border-r border-border bg-surface md:sticky md:top-0 md:flex md:h-screen md:w-24 md:min-w-24 md:max-w-24 xl:w-56 xl:min-w-56 xl:max-w-56`}
      >
        <div className="flex items-start gap-stack border-b border-border px-stack py-pad-inset max-xl:px-stack-tight">
          <div className="min-w-0 flex-1">
            <p className="text-caption font-semibold text-subtle max-xl:text-center">작업 공간</p>
            <CustomerWorkspaceIdentity me={me} mutateMe={mutateMe} compactOnNarrow={!mobileMenuOpen} />
          </div>
          <button
            type="button"
            aria-label="메뉴 닫기"
            onClick={() => setMobileMenuOpen(false)}
            className="grid min-h-control-touch min-w-control-touch place-items-center rounded-control border border-border bg-surface-2 text-text md:hidden"
          >
            <svg className="h-5 w-5" fill="none" stroke="currentColor" viewBox="0 0 24 24" aria-hidden>
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 6l12 12M18 6L6 18" />
            </svg>
          </button>
        </div>

      <nav className="flex-1 min-h-0 overflow-y-auto py-stack">
        <RoomFlowNav pathname={pathname} onNavigate={() => setMobileMenuOpen(false)} />

        {/* 발행 채널 그룹. constants의 PUBLISH_CHANNEL_GROUPS 단일 소스(Settings>Channels와 동일).
            threads/x는 연결상태 뱃지가 특수해 별도 아이템 유지. */}
        {CHANNEL_GROUPS.map((g) => (
          <SidebarGroup
            key={g.key}
            groupKey={g.key}
            title={g.title}
            showNarrowLabels={mobileMenuOpen}
            items={g.channels.map((ch) =>
              ch === "threads" ? threadsItem : ch === "x" ? xItem : chSidebarItem(ch, cfg),
            )}
          />
        ))}

        {/* 데이터·검색 채널 그룹 제거. /channels/* 빈 연결폼으로 가던 죽은 항목이었음.
            동작하는 읽기 대시보드는 아래 데이터와 분석 섹션이 제공(사이드바=연결가능 원칙). */}

        {/* ── Data & Analytics ── */}
        <div className="px-stack mt-stack-section mb-stack-tight">
          <span className={`text-caption font-medium text-subtle uppercase tracking-wider ${narrowLabelClass}`}>데이터와 분석</span>
        </div>
        {[
          { href: "/blog-performance", key: "blog_performance", label: "블로그 성과" },
        ].map((item) => (
          <Link key={item.key} href={item.href}
            className={`sidebar-item ${pathname === item.href ? "active" : ""} w-full text-left px-pad-inset py-stack-tight text-body-sm text-muted flex items-center gap-stack`}>
            <span className="w-4 h-4 rounded-chip text-subtle flex items-center justify-center">{getChannelIcon(item.key)}</span>
            <span className={narrowLabelClass}>{item.label}</span>
          </Link>
        ))}

        {/* ── Keyword Research ── */}
        <div className="px-stack mt-stack-section mb-stack-tight">
          <span className={`text-caption font-medium text-subtle uppercase tracking-wider ${narrowLabelClass}`}>키워드 조사</span>
        </div>
        {[
          { href: "/keyword-planner", key: "keyword_planner", label: "키워드 찾기" },
          { href: "/naver-trends", key: "naver_trends", label: "네이버 트렌드" },
          { href: "/google-trends", key: "google_trends", label: "구글 트렌드" },
        ].map((item) => (
          <Link key={item.key} href={item.href}
            className={`sidebar-item ${pathname === item.href ? "active" : ""} w-full text-left px-pad-inset py-stack-tight text-body-sm text-muted flex items-center gap-stack`}>
            <span className="w-4 h-4 rounded-chip text-subtle flex items-center justify-center">{getChannelIcon(item.key)}</span>
            <span className={narrowLabelClass}>{item.label}</span>
          </Link>
        ))}

        {/* 외부 연동: custom_api/rss는 연결 미구현(빈 페이지)이라 제거. 블로그만 노출(→/blog 동작). */}
        <SidebarGroup
          groupKey="custom"
          title="외부 연동"
          showNarrowLabels={mobileMenuOpen}
          items={[
            { key: "blog", label: "블로그", icon: "B", nav: true },
          ]}
        />

        <div className="px-stack mt-stack-section mb-stack-tight">
          <span className={`text-caption font-medium text-subtle uppercase tracking-wider ${narrowLabelClass}`}>자산과 도구</span>
        </div>
        <Link
          href="/images"
          className={`sidebar-item ${pathname === "/images" ? "active" : ""} w-full text-left px-pad-inset py-stack-tight text-body-sm text-muted flex items-center gap-stack`}
        >
          <svg className="w-4 h-4 text-subtle" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeWidth={1.5}
              d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z"
            />
          </svg>
          <span className={narrowLabelClass}>이미지</span>
          <span className={`ml-auto text-caption px-stack-tight py-micro rounded-pill bg-surface-2 text-subtle ${mobileMenuOpen ? "" : "max-xl:hidden"}`}>{imageCount}</span>
        </Link>
        <Link
          href="/videos"
          className={`sidebar-item ${pathname === "/videos" ? "active" : ""} w-full text-left px-pad-inset py-stack-tight text-body-sm text-muted flex items-center gap-stack`}
        >
          <svg className="w-4 h-4 text-subtle" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeWidth={1.5}
              d="M15 10l4.553-2.276A1 1 0 0121 8.618v6.764a1 1 0 01-1.447.894L15 14M5 18h8a2 2 0 002-2V8a2 2 0 00-2-2H5a2 2 0 00-2 2v8a2 2 0 002 2z"
            />
          </svg>
          <span className={narrowLabelClass}>영상</span>
        </Link>
        {(() => {
          const mjCfg = cfg.midjourney || {};
          return (
            <Link
              href="/channels/midjourney"
              className={`sidebar-item ${pathname === "/channels/midjourney" ? "active" : ""} w-full text-left px-pad-inset py-stack-tight text-body-sm text-muted flex items-center gap-stack`}
            >
              <span className="w-4 h-4 rounded-chip bg-accent/50 flex items-center justify-center text-caption font-bold text-accent">MJ</span>
              <span className={narrowLabelClass}>Midjourney</span>
              <span className={`ml-auto w-2 h-2 rounded-pill ${mobileMenuOpen ? "" : "max-xl:hidden"} ${mjCfg.connected ? "bg-success" : "bg-surface-2"}`} />
            </Link>
          );
        })()}

        <div className="px-stack mt-stack-section mb-stack-tight">
          <span className={`text-caption font-medium text-subtle uppercase tracking-wider ${narrowLabelClass}`}>시스템</span>
        </div>
        <Link
          href="/settings"
          className={`sidebar-item ${pathname === "/settings" ? "active" : ""} w-full text-left px-pad-inset py-stack-tight text-body-sm text-muted flex items-center gap-stack`}
        >
          <svg className="w-4 h-4 text-subtle" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeWidth={1.5}
              d="M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.066 2.573c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.573 1.066c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.066-2.573c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z"
            />
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
          </svg>
          <span className={narrowLabelClass}>설정</span>
        </Link>
      </nav>

      <SidebarFooter isOperator={false} compactOnNarrow={!mobileMenuOpen} />
      </aside>
    </>
  );
}

/* ── Identity-aware shell router ── */
export function Sidebar() {
  const { data: me, mutate } = useSWR<MeResponse>("/api/me", fetcher);
  const setActiveWorkspace = useUIStore((state) => state.setActiveWorkspace);

  // AuthGate가 operator identity를 확인할 때 먼저 지우지만, Sidebar도 직접 진입/identity 전환을
  // 방어한다. 운영자 shell은 어떤 customer workspace도 읽거나 표시하지 않는다.
  useEffect(() => {
    if (me?.isOperator) setActiveWorkspace(null);
  }, [me?.isOperator, setActiveWorkspace]);

  if (!me) return null;
  if (me.isOperator) return <OperatorSidebar />;
  return <CustomerSidebar me={me} mutateMe={mutate} />;
}
