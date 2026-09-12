// 발행기 경합 차단 — 순수 판정 모듈 (파일 I/O·SDK 의존 없음).
//
// 갭: docs/_archive/legacy-20260912/audit/osmu-code-review-2026-09-12.md 의 MAJOR
// "extensions/threads-queue/src/threads-queue-tool.ts:345 — get_approved 로 가져간
// 스냅샷에 claim/lease/공급자 호출 직전 재검증이 없어 cancel API 가 200 을 준 뒤에도
// 외부 게시가 진행된다".
//
// 계약(순서대로 세 겹):
//  1) get_approved 는 스냅샷을 주는 것이 아니라 lease 를 건 claim 을 준다. 같은 글을
//     두 워커가 동시에 가져갈 수 없다.
//  2) 공급자(Threads·X·Instagram) 호출 직전에 반드시 verifyPublishable 로 파일의
//     최신 상태를 다시 본다. 취소가 그 사이에 들어왔으면 게시하지 않는다.
//  3) update_channel 은 취소된 글·채널에 published 를 기록하지 못한다. 재검증을
//     건너뛴 워커가 있어도 마지막 관문에서 막힌다.
//
// 왜 순수 모듈인가: 경합은 실제 외부 발행 없이 증명해야 한다(돈·대외 상태). 파일
// 상태 두 개를 손으로 만들어 판정만 돌리면 공급자 호출 없이 계약을 시험할 수 있다.

export type ChannelKey = "threads" | "x" | "instagram";

export type ClaimableChannelStatus =
  | "pending"
  | "published"
  | "failed"
  | "skipped"
  | "canceled";

export interface ClaimableChannel {
  status: ClaimableChannelStatus;
  [k: string]: unknown;
}

export interface QueueClaim {
  workerId: string;
  token: string;
  claimedAt: string;
  expiresAt: string;
}

export interface ClaimablePost {
  id: string;
  status: string;
  scheduledAt?: string | null;
  channels?: Partial<Record<ChannelKey, ClaimableChannel>> | undefined;
  claim?: QueueClaim | null;
  [k: string]: unknown;
}

export const DEFAULT_LEASE_MS = 5 * 60 * 1000;

/** 이 글에 아직 살아 있는 다른 워커의 lease 가 걸려 있는가. */
export function isClaimActive(post: ClaimablePost, now: Date = new Date()): boolean {
  const claim = post.claim;
  if (!claim || typeof claim.expiresAt !== "string") return false;
  const expires = new Date(claim.expiresAt).getTime();
  if (Number.isNaN(expires)) return false;
  return expires > now.getTime();
}

/**
 * 글에 lease 를 건다. 이미 살아 있는 claim 이 있으면 null 을 돌려 가져가지 못하게 한다.
 * 만료된 claim 은 회수 대상이므로 덮어쓴다(워커가 죽어도 큐가 멈추지 않게).
 */
export function claimPost(
  post: ClaimablePost,
  options: { workerId: string; token: string; now?: Date; leaseMs?: number },
): QueueClaim | null {
  const now = options.now ?? new Date();
  if (isClaimActive(post, now)) return null;
  const leaseMs = options.leaseMs && options.leaseMs > 0 ? options.leaseMs : DEFAULT_LEASE_MS;
  const claim: QueueClaim = {
    workerId: options.workerId,
    token: options.token,
    claimedAt: now.toISOString(),
    expiresAt: new Date(now.getTime() + leaseMs).toISOString(),
  };
  post.claim = claim;
  return claim;
}

/** 취소·발행 완료처럼 더 이상 발행기가 건드리면 안 되는 최상위 상태. */
export const PUBLISHER_BLOCKED_POST_STATUSES = new Set(["canceled", "published", "failed"]);

export type PublishVerdict =
  | { ok: true }
  | {
      ok: false;
      reason:
        | "post-canceled"
        | "post-finished"
        | "channel-canceled"
        | "channel-not-pending"
        | "claim-missing"
        | "claim-expired"
        | "claim-mismatch";
      message: string;
    };

/**
 * 공급자 호출 직전 재검증. 반드시 파일에서 새로 읽은 post 로 호출한다.
 * claimToken 을 주면 lease 소유권까지 확인한다(주지 않으면 상태 검사만).
 */
export function verifyPublishable(
  post: ClaimablePost | null | undefined,
  channel: ChannelKey,
  options: { claimToken?: string | null; now?: Date } = {},
): PublishVerdict {
  const now = options.now ?? new Date();
  if (!post) {
    return { ok: false, reason: "post-canceled", message: "작업물이 큐에 없습니다" };
  }
  if (post.status === "canceled") {
    return { ok: false, reason: "post-canceled", message: "고객이 발행을 중지한 작업물입니다" };
  }
  const channelState = post.channels?.[channel];
  if (channelState?.status === "canceled") {
    return { ok: false, reason: "channel-canceled", message: `${channel} 채널 발행이 중지됐습니다` };
  }
  if (channelState && channelState.status !== "pending") {
    return {
      ok: false,
      reason: "channel-not-pending",
      message: `${channel} 채널이 이미 ${channelState.status} 상태입니다`,
    };
  }
  if (!channelState && PUBLISHER_BLOCKED_POST_STATUSES.has(post.status)) {
    return { ok: false, reason: "post-finished", message: `이미 ${post.status} 상태인 작업물입니다` };
  }

  const token = options.claimToken;
  if (token) {
    const claim = post.claim;
    if (!claim) {
      return { ok: false, reason: "claim-missing", message: "이 작업물의 발행 예약이 해제됐습니다" };
    }
    if (claim.token !== token) {
      return { ok: false, reason: "claim-mismatch", message: "다른 워커가 이 작업물을 가져갔습니다" };
    }
    if (!isClaimActive(post, now)) {
      return { ok: false, reason: "claim-expired", message: "발행 예약 시간이 만료됐습니다" };
    }
  }
  return { ok: true };
}

/** 취소 시 발행 예약을 함께 해제한다. 대시보드 취소 경로와 발행기가 공유하는 규칙. */
export function releaseClaim(post: ClaimablePost): void {
  post.claim = null;
}
