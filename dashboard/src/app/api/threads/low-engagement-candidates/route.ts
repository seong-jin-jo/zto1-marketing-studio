import { readJson, dataPath } from "@/lib/file-io";
import { AuthError, effectiveTenantId } from "@/lib/tenant-auth";
import { runWithTenant } from "@/lib/tenant-context";
import {
  DELETE_SUPPORTED_CHANNELS,
  LOW_ENGAGEMENT_MIN_AGE_MS,
  LOW_ENGAGEMENT_MIN_LIKES_DEFAULT,
  LOW_ENGAGEMENT_MIN_VIEWS_DEFAULT,
} from "@/lib/constants";
import { isPerformancePublished } from "@/lib/post-publish-state";

// 읽기 전용 후보 조회 — 절대 삭제하지 않는다. 실제 삭제는 POST /api/threads/low-engagement-cleanup이
// 사람이 고른 postId 목록으로만 수행한다(회장 지시 2026-08-29 — 승낙 없는 삭제 경로 금지).
interface ChannelState {
  status?: string;
  publishedAt?: string | null;
  mediaId?: string | null;
}

interface QueuePost {
  id: string;
  text?: string;
  status?: string;
  publishedAt?: string | null;
  threadsMediaId?: string | null;
  engagement?: { views?: number; likes?: number; replies?: number } | null;
  channels?: Record<string, ChannelState>;
}

interface QueueData {
  posts: QueuePost[];
}

interface ChannelSettingsData {
  [channel: string]: Record<string, boolean | number>;
}

function errorResponse(error: unknown): Response {
  if (error instanceof AuthError) {
    return Response.json({ error: error.message, code: error.code }, { status: error.status });
  }
  return Response.json({ error: "후보 조회 중 오류가 발생했습니다." }, { status: 500 });
}

export async function GET(request: Request) {
  try {
    const url = new URL(request.url);
    const tenantId = await effectiveTenantId(request, url.searchParams.get("tenant_id"));

    return runWithTenant(tenantId, async () => {
      const settings = readJson<ChannelSettingsData>(dataPath("channel-settings.json")) || {};
      const threadsSettings = settings.threads || {};
      const minViews = typeof threadsSettings.low_engagement_min_views === "number"
        ? threadsSettings.low_engagement_min_views
        : LOW_ENGAGEMENT_MIN_VIEWS_DEFAULT;
      const minLikes = typeof threadsSettings.low_engagement_min_likes === "number"
        ? threadsSettings.low_engagement_min_likes
        : LOW_ENGAGEMENT_MIN_LIKES_DEFAULT;

      const queue = readJson<QueueData>(dataPath("queue.json")) || { posts: [] };
      const posts = queue.posts || [];
      const now = Date.now();

      const candidates = posts.filter((post) => {
        const threadsChannel = post.channels?.threads;
        const publishedAt = threadsChannel?.publishedAt ?? post.publishedAt ?? null;
        const mediaId = threadsChannel?.mediaId ?? post.threadsMediaId ?? null;
        // 성과 기준은 최상위 status 가 아니라 "실제로 올라간 채널이 있는가" 다.
        // 일부 채널만 발행된 뒤 나머지를 멈춘 글도 대외에 존재하므로 표본에 남는다
        // (2026-09-12 감사 MAJOR: 부분 발행을 성과에서 숨김 — lib/post-publish-state.ts).
        if (!isPerformancePublished(post as unknown as Record<string, unknown>)) return false;
        if (threadsChannel && threadsChannel.status !== "published") return false;
        if (!mediaId || !publishedAt) return false;
        const age = now - new Date(publishedAt).getTime();
        if (Number.isNaN(age) || age < LOW_ENGAGEMENT_MIN_AGE_MS) return false;
        if (!post.engagement) return false;
        const views = post.engagement.views ?? 0;
        const likes = post.engagement.likes ?? 0;
        return views < minViews && likes < minLikes;
      }).map((post) => {
        const threadsChannel = post.channels?.threads;
        return {
          id: post.id,
          channel: "threads" as const,
          text: (post.text ?? "").slice(0, 140),
          views: post.engagement?.views ?? 0,
          likes: post.engagement?.likes ?? 0,
          replies: post.engagement?.replies ?? 0,
          publishedAt: threadsChannel?.publishedAt ?? post.publishedAt ?? null,
        };
      });

      return Response.json({
        candidates,
        total: candidates.length,
        threshold: { minViews, minLikes, minAgeMs: LOW_ENGAGEMENT_MIN_AGE_MS },
        deleteSupportedChannels: DELETE_SUPPORTED_CHANNELS,
      });
    });
  } catch (error) {
    return errorResponse(error);
  }
}
