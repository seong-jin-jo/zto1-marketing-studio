import { mutateJson, dataPath } from "@/lib/file-io";
import { effectiveTenantId } from "@/lib/tenant-auth";
import { runWithTenant } from "@/lib/tenant-context";
import { mirrorQueuePostWithOutbox } from "@/lib/queue-mirror-outbox";
import {
  CANCELLABLE_POST_STATUSES,
  normalizeChannels,
  publishedChannelKeys,
} from "@/lib/post-publish-state";
import type { ChannelStatus, Post } from "@/types/queue";

interface QueueData { posts: Array<Record<string, unknown>> }

// POST /api/queue/[postId]/cancel — 승인/예약된 작업물을 발행 전에 서버가 중지한다.
//
// 갭: docs/_archive/legacy-20260912/audit/osmu-v62-api-gap-audit-v1-gpt-codex.md 와
// docs/_archive/legacy-20260912/audit/osmu-gap-recheck-2026-08-28.md 가 공통으로 남긴 "일곱 플랫폼을 아우르는
// 서버 측 발행 중지 계약"이 없었다. 삭제(delete)만 있었는데, 삭제는 기록 자체를 지워
// 왜 멈췄는지 남기지 않는다.
//
// 계약: 아직 pending 인 채널만 canceled 로 바꾼다. 이미 published/skipped/failed 인
// 채널은 그대로 둔다. cron(get_approved→update_channel)이 이 요청과 같은 순간에
// 일부 채널을 이미 발행했을 수 있으므로, mutateJson 의 fresh-read 로 그 시점의
// 실제 채널 상태를 다시 보고 판단한다 — 상상한 상태가 아니라 쓰기 직전 상태로 판정한다.
//
// 2026-09-12 감사(docs/_archive/legacy-20260912/audit/osmu-code-review-2026-09-12.md) 수리:
//  - :34 종료 상태 덮어쓰기 — channels 가 없는 레거시 published·failed 글이 검사 없이
//    canceled 로 바뀌었다. 이제 채널을 먼저 정규화하고 취소 가능 최상위 상태로 제한한다.
//  - :41 부분 발행 숨김 — 이미 올라간 채널이 있으면 그 사실을 응답과 글에 남겨
//    성과 표본에서 사라지지 않게 한다(lib/post-publish-state.ts 가 계약 정본).
//  - :58 부분 실패를 전체 성공으로 셈 — 파일 결과와 DB 미러 결과를 분리해 응답하고,
//    DB 가 밀리면 outbox 에 적어 나중에 수렴시킨다.
//  - 발행기 경합 — 취소 시 발행 lease(claim)를 함께 해제한다. 발행기는 공급자 호출
//    직전 verify_claim 으로 이 상태를 다시 본다(extensions/threads-queue/src/queue-claim.ts).
export async function POST(request: Request, { params }: { params: Promise<{ postId: string }> }) {
  const __t = await effectiveTenantId(request, null);
  return runWithTenant(__t, async () => {
    const { postId } = await params;
    let found: Record<string, unknown> | null = null;
    // code 는 기존 고객 계약(NOTHING_TO_CANCEL)을 유지하고, 왜 거절인지는 detail 로 구분한다.
    let rejection: { code: string; detail: string; error: string } | null = null;
    let alreadyPublishedChannels: string[] = [];

    await mutateJson<QueueData>(dataPath("queue.json"), (queue) => {
      const post = (queue.posts || []).find((p) => p.id === postId) as Post | undefined;
      if (!post) return queue;

      // 레거시 항목은 정규화 후 판정한다. channels 가 없다는 이유로 통과시키지 않는다.
      const channels = normalizeChannels(post as unknown as Record<string, unknown>) as Record<string, ChannelStatus>;
      const cancellable = Object.keys(channels).filter((key) => channels[key].status === "pending");
      const publishedKeys = publishedChannelKeys({ ...post, channels } as unknown as Record<string, unknown>);

      // 취소 가능한 최상위 상태인가. published·failed·canceled 는 종료 상태라 덮지 않는다.
      if (!CANCELLABLE_POST_STATUSES.has(post.status)) {
        rejection = {
          code: "NOTHING_TO_CANCEL",
          detail: "NOT_CANCELLABLE",
          error: `이미 ${post.status === "canceled" ? "중지" : "종료"}된 작업물이라 중지할 수 없습니다`,
        };
        found = post as unknown as Record<string, unknown>;
        return queue;
      }

      if (cancellable.length === 0) {
        // 취소할 대기 채널이 하나도 없다 — 이미 전부 끝났거나 실패했다. 조용히 덮어쓰지 않는다.
        rejection = {
          code: "NOTHING_TO_CANCEL",
          detail: "NO_PENDING_CHANNEL",
          error: "이미 발행됐거나 종료된 작업물이라 중지할 수 없습니다",
        };
        found = post as unknown as Record<string, unknown>;
        return queue;
      }

      for (const key of cancellable) {
        channels[key] = { ...channels[key], status: "canceled", error: null };
      }
      post.channels = channels;
      post.status = "canceled";
      post.canceledAt = new Date().toISOString();
      // 발행기 lease 해제 — 이 글을 가져간 워커는 공급자 호출 직전 재검증에서 막힌다.
      (post as unknown as Record<string, unknown>).claim = null;
      // 부분 발행 표시. 성과 소비자는 이 값이 아니라 채널 상태를 읽지만,
      // 화면이 "멈췄지만 일부는 이미 올라갔다"를 말할 근거를 글 자체에 남긴다.
      (post as unknown as Record<string, unknown>).publishedChannels = publishedKeys;
      (post as unknown as Record<string, unknown>).partiallyPublished = publishedKeys.length > 0;
      alreadyPublishedChannels = publishedKeys;
      found = post as unknown as Record<string, unknown>;
      return queue;
    }, { posts: [] });

    if (!found) return Response.json({ error: "post not found" }, { status: 404 });
    if (rejection) {
      const reason = rejection as { code: string; detail: string; error: string };
      return Response.json(
        { error: reason.error, code: reason.code, detail: reason.detail, post: found },
        { status: 409 },
      );
    }

    // 파일 쓰기는 끝났다(고객 요청 성립). DB 미러는 별도 결과로 분리해 보고한다.
    const persistence = await mirrorQueuePostWithOutbox(
      __t,
      found as Record<string, unknown> & { id: string },
    );

    return Response.json({
      ok: true,
      post: found,
      persistence,
      // 이미 대외에 올라간 채널. 비어 있지 않으면 화면은 부분 발행 사실을 말해야 한다.
      alreadyPublishedChannels,
      partiallyPublished: alreadyPublishedChannels.length > 0,
    });
  });
}
