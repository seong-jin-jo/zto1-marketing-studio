"use client";

import Link from "next/link";
import type { ReactNode } from "react";
import { workspaceDisplayName } from "@/lib/workspace-display-name";

export type ProductRoom = "create" | "edit" | "publish" | "performance";

const ROOM_FLOW: ReadonlyArray<{ key: ProductRoom; number: string; label: string; href: string }> = [
  { key: "create", number: "01", label: "생성실", href: "/studio?room=create" },
  { key: "edit", number: "02", label: "편집실", href: "/studio?room=edit" },
  { key: "publish", number: "03", label: "발행실", href: "/studio?room=publish" },
  { key: "performance", number: "04", label: "성과실", href: "/performance" },
];

// 네 방이 함께 쓰는 머리줄. 생성실, 편집실, 발행실에만 있고 성과실에서는 사라져 있어서
// 같은 서비스 안인데도 방을 옮기면 길잡이가 없어지는 문제가 있었다. 한 곳에서 만들어 네 방이
// 같은 자리, 같은 순서로 쓴다.

const ROOM_UTILITY_CLASS =
  "relative inline-flex min-h-control-touch min-w-control-touch items-center justify-center rounded-control border border-border bg-surface px-stack-tight text-caption font-semibold text-muted hover:bg-surface-2";

export function RoomShortcutLinks() {
  return (
    <>
      <Link href="/inbox" aria-label="승인 인박스 열기" title="발행 전에 검토를 기다리는 작업물 목록" data-room-utility="review" className={ROOM_UTILITY_CLASS}>
        검토
      </Link>
      <Link href="/calendar" aria-label="발행 일정 열기" title="예약해 둔 발행 일정을 날짜별로 보는 곳" data-room-utility="schedule" className={ROOM_UTILITY_CLASS}>
        일정
      </Link>
    </>
  );
}

export function RoomBadge({ label }: { label: string }) {
  return (
    <span className="rounded-pill bg-accent-soft px-stack py-stack-tight text-caption font-semibold text-accent">
      {label}
    </span>
  );
}

export function RoomFlowHeader({ currentRoom }: { currentRoom: ProductRoom }) {
  const activeIndex = ROOM_FLOW.findIndex((room) => room.key === currentRoom);

  return (
    <nav className="col-span-full grid w-full grid-cols-4 gap-stack-tight" aria-label="작업 단계" data-room-flow={currentRoom}>
      {ROOM_FLOW.map((room, index) => {
        const active = room.key === currentRoom;
        const done = index < activeIndex;
        return (
          <Link
            key={room.key}
            href={room.href}
            aria-current={active ? "step" : undefined}
            data-room-step={room.key}
            className={`flex min-h-control-touch min-w-0 items-center justify-center gap-micro rounded-control border px-stack-tight text-caption font-semibold transition-colors ${
              active
                ? "border-accent bg-accent-soft text-accent"
                : done
                  ? "border-border bg-surface-2 text-muted"
                  : "border-transparent text-subtle hover:border-border hover:bg-surface-2"
            }`}
          >
            <span className="tabular-nums">{room.number}</span>
            <span className="truncate">{room.label}</span>
          </Link>
        );
      })}
    </nav>
  );
}

export function RoomHeader({
  workspaceName,
  subtitle,
  roomLabel,
  currentRoom,
  leading,
  trailing,
  children,
}: {
  workspaceName?: string;
  subtitle: string;
  roomLabel: string;
  currentRoom?: ProductRoom;
  leading?: ReactNode;
  trailing?: ReactNode;
  children?: ReactNode;
}) {
  return (
    <header
      data-room-header={roomLabel}
      className="relative mb-stack-section grid grid-cols-[minmax(0,1fr)_auto] items-center gap-stack border-b border-border pb-pad-inset"
    >
      <div className="min-w-0">
        <b className="block truncate text-lead text-text">{workspaceDisplayName(workspaceName)}</b>
        <span className="text-caption text-subtle">{subtitle}</span>
      </div>
      <div className="ml-auto flex shrink-0 items-center gap-stack-tight" aria-label="검토와 일정">
        <RoomShortcutLinks />
        {trailing ? (
          <details className="relative" data-room-context-menu>
            <summary className={`${ROOM_UTILITY_CLASS} list-none cursor-pointer`}>작업</summary>
            <div className="absolute right-0 top-full z-30 mt-stack-tight flex w-max flex-col gap-stack-tight rounded-surface border border-border bg-surface p-stack shadow-card">
              {trailing}
            </div>
          </details>
        ) : null}
      </div>
      {leading ? (
        <div className="col-span-full flex min-w-0 flex-wrap items-center gap-stack-tight" data-room-leading>
          {leading}
        </div>
      ) : null}
      {children}
      {currentRoom ? <RoomFlowHeader currentRoom={currentRoom} /> : null}
    </header>
  );
}
