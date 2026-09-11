import { mutateJson, dataPath } from "@/lib/file-io";
import { effectiveTenantId } from "@/lib/tenant-auth";
import { runWithTenant } from "@/lib/tenant-context";
import { mirrorQueuePost } from "@/lib/queue-store";
import type { ChannelStatus, Post } from "@/types/queue";

interface QueueData { posts: Array<Record<string, unknown>> }

// POST /api/queue/[postId]/cancel — 승인/예약된 작업물을 발행 전에 서버가 중지한다.
//
// 갭: docs/audit/osmu-v62-api-gap-audit-v1-gpt-codex.md 와
// docs/audit/osmu-gap-recheck-2026-08-28.md 가 공통으로 남긴 "일곱 플랫폼을 아우르는
// 서버 측 발행 중지 계약"이 없었다. 삭제(delete)만 있었는데, 삭제는 기록 자체를 지워
// 왜 멈췄는지 남기지 않는다.
//
// 계약: 아직 pending 인 채널만 canceled 로 바꾼다. 이미 published/skipped/failed 인
// 채널은 그대로 둔다. cron(get_approved→update_channel)이 이 요청과 같은 순간에
// 일부 채널을 이미 발행했을 수 있으므로, mutateJson 의 fresh-read 로 그 시점의
// 실제 채널 상태를 다시 보고 판단한다 — 상상한 상태가 아니라 쓰기 직전 상태로 판정한다.
export async function POST(request: Request, { params }: { params: Promise<{ postId: string }> }) {
  const __t = await effectiveTenantId(request, null);
  return runWithTenant(__t, async () => {
    const { postId } = await params;
    let found: Record<string, unknown> | null = null;
    let alreadyPublished = false;
    await mutateJson<QueueData>(dataPath("queue.json"), (queue) => {
      const post = (queue.posts || []).find((p) => p.id === postId) as Post | undefined;
      if (!post) return queue;

      const channels = (post.channels ?? {}) as Record<string, ChannelStatus>;
      const channelKeys = Object.keys(channels);
      const cancellable = channelKeys.filter((key) => channels[key].status === "pending");

      if (channelKeys.length > 0 && cancellable.length === 0) {
        // 취소할 대기 채널이 하나도 없다 — 이미 전부 끝났거나 실패했다. 조용히 덮어쓰지 않는다.
        alreadyPublished = true;
        found = post as unknown as Record<string, unknown>;
        return queue;
      }

      for (const key of cancellable) {
        channels[key] = { ...channels[key], status: "canceled", error: null };
      }
      post.channels = channels;
      post.status = "canceled";
      post.canceledAt = new Date().toISOString();
      found = post as unknown as Record<string, unknown>;
      return queue;
    }, { posts: [] });

    if (!found) return Response.json({ error: "post not found" }, { status: 404 });
    if (alreadyPublished) {
      return Response.json(
        { error: "이미 발행됐거나 종료된 작업물이라 중지할 수 없습니다", code: "NOTHING_TO_CANCEL", post: found },
        { status: 409 },
      );
    }
    await mirrorQueuePost(__t, found as Record<string, unknown> & { id: string });
    return Response.json({ ok: true, post: found });
  });
}
