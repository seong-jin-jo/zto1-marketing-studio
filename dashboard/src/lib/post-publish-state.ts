// 발행 상태 계약 — 취소와 성과 집계가 같은 기준을 쓰게 한다.
//
// 갭 두 건(docs/_archive/legacy-20260912/audit/osmu-code-review-2026-09-12.md):
//  1) cancel/route.ts:41 — 일부 채널이 이미 published 여도 최상위 상태를 canceled 로
//     덮어, 실제로 대외에 올라간 글이 성과 표본에서 사라진다. 소비자들이 최상위
//     status === "published" 만 읽기 때문이다.
//  2) cancel/route.ts:34 — channels 가 없는 레거시 published·failed 글은 종료 상태
//     검사 없이 canceled 로 바뀐다.
//
// 계약:
//  - 성과의 기준은 "최상위 status" 가 아니라 "채널 하나라도 실제로 published 인가" 다.
//    한 채널만 올라간 뒤 나머지를 멈춘 글도 대외에 존재하므로 성과 표본에 남는다.
//  - 취소는 approved·scheduled·draft 처럼 아직 안 끝난 글에만 허용한다.
//    published·failed·canceled 는 종료 상태이므로 덮어쓰지 않는다.
//  - channels 가 없는 레거시 글은 최상위 status 로부터 채널을 정규화한 뒤 판정한다.
//    판정 대상이 없다는 이유로 통과시키지 않는다.

import type { ChannelStatus, Post } from "@/types/queue";

type LoosePost = Partial<Post> & Record<string, unknown>;

/** 취소 요청을 받을 수 있는 최상위 상태. 나머지는 전부 종료 상태로 본다. */
export const CANCELLABLE_POST_STATUSES = new Set(["draft", "approved", "scheduled", "pending"]);

/** 발행기가 더 이상 건드리면 안 되는 종료 상태. */
export const TERMINAL_POST_STATUSES = new Set(["published", "failed", "canceled"]);

export function isTerminalPostStatus(status: unknown): boolean {
  return typeof status === "string" && TERMINAL_POST_STATUSES.has(status);
}

/**
 * channels 가 없는 레거시 글을 최상위 status 기준으로 정규화한다.
 * extensions/threads-queue 의 migratePost 와 같은 규칙이다. 원본을 바꾸지 않고 사본을 돌려준다.
 */
export function normalizeChannels(post: LoosePost): Record<string, ChannelStatus> {
  const existing = (post.channels ?? null) as Record<string, ChannelStatus> | null;
  if (existing && Object.keys(existing).length > 0) return existing;

  const status = typeof post.status === "string" ? post.status : "draft";
  if (status === "draft") return {};

  const derived: ChannelStatus["status"] =
    status === "published"
      ? "published"
      : status === "failed"
        ? "failed"
        : status === "canceled"
          ? "canceled"
          : "pending";

  return {
    threads: {
      status: derived,
      mediaId: (post.threadsMediaId as string | undefined) ?? null,
      publishedAt: (post.publishedAt as string | undefined) ?? null,
      error: status === "failed" ? ((post.error as string | undefined) ?? null) : null,
    },
  };
}

/** 실제로 대외에 올라간 채널 키 목록. */
export function publishedChannelKeys(post: LoosePost): string[] {
  const channels = normalizeChannels(post);
  return Object.keys(channels).filter((key) => channels[key]?.status === "published");
}

/**
 * 성과 표본에 들어가는가.
 * 최상위 published 이거나, 취소·실패로 끝났더라도 채널 하나라도 실제로 발행됐으면 포함한다.
 */
export function isPerformancePublished(post: LoosePost): boolean {
  if (post.status === "published") return true;
  return publishedChannelKeys(post).length > 0;
}

/** 부분 발행 후 취소된 글인가(성과실에서 "일부만 올라감"으로 구분해 보여줄 근거). */
export function isPartiallyPublished(post: LoosePost): boolean {
  return post.status !== "published" && publishedChannelKeys(post).length > 0;
}
