const API_BASE = "https://open.tiktokapis.com/v2/post/publish";
const DISPLAY_API_BASE = "https://open.tiktokapis.com/v2";
const TIMEOUT_MS = 10_000;
const VIDEO_QUERY_LIMIT = 20;

export const TIKTOK_PRIVACY_LEVELS = [
  "PUBLIC_TO_EVERYONE",
  "MUTUAL_FOLLOW_FRIENDS",
  "FOLLOWER_OF_CREATOR",
  "SELF_ONLY",
] as const;
export type TikTokPrivacyLevel = (typeof TIKTOK_PRIVACY_LEVELS)[number];

export interface TikTokCreatorInfo {
  username: string;
  nickname: string;
  avatarUrl: string;
  privacyLevels: TikTokPrivacyLevel[];
  commentDisabled: boolean;
  duetDisabled: boolean;
  stitchDisabled: boolean;
  maxVideoDurationSec: number;
}

interface TikTokEnvelope<T> {
  data?: T;
  error?: { code?: string; message?: string };
}

export interface TikTokVideoMetrics {
  views: number;
  likes: number;
  replies: number;
  reposts: number;
}

export type TikTokVideoMetricsResult =
  | { ok: true; metrics: Record<string, TikTokVideoMetrics> }
  | { ok: false; status?: number; error: string };

function headers(accessToken: string): Record<string, string> {
  return {
    Authorization: `Bearer ${accessToken}`,
    "Content-Type": "application/json; charset=UTF-8",
  };
}

function validPrivacyLevels(value: unknown): TikTokPrivacyLevel[] {
  if (!Array.isArray(value)) return [];
  return value.filter((item): item is TikTokPrivacyLevel =>
    typeof item === "string" && (TIKTOK_PRIVACY_LEVELS as readonly string[]).includes(item));
}

/**
 * 발행이 끝난 TikTok 영상의 공개 성과를 읽어 온다.
 *
 * TikTok Display API의 video/query는 요청당 영상 ID를 최대 20개 받는다. 호출부가 게시물을
 * 몇 개 넘기더라도 이 경계에서 20개씩 나눠 모든 결과를 되받는다. share_count는 제품의
 * 공통 성과 축인 reposts에 저장한다.
 *
 * 공식 계약: https://developers.tiktok.com/docs/en/tiktok-api-v2-video-query
 */
export async function fetchTikTokVideoMetrics(
  accessToken: string,
  videoIds: string[],
  f: typeof fetch = fetch,
): Promise<TikTokVideoMetricsResult> {
  const ids = [...new Set(videoIds.filter(Boolean))];
  if (ids.length === 0) return { ok: true, metrics: {} };
  if (!accessToken) return { ok: false, error: "TikTok 연결이 없습니다." };

  const metrics: Record<string, TikTokVideoMetrics> = {};
  for (let start = 0; start < ids.length; start += VIDEO_QUERY_LIMIT) {
    const batch = ids.slice(start, start + VIDEO_QUERY_LIMIT);
    try {
      const res = await f(
        `${DISPLAY_API_BASE}/video/query/?fields=id,view_count,like_count,comment_count,share_count`,
        {
          method: "POST",
          headers: headers(accessToken),
          body: JSON.stringify({ filters: { video_ids: batch } }),
          signal: AbortSignal.timeout(TIMEOUT_MS),
        },
      );
      const body = await res.json().catch(() => ({})) as TikTokEnvelope<{
        videos?: Array<{
          id?: string;
          view_count?: number;
          like_count?: number;
          comment_count?: number;
          share_count?: number;
        }>;
      }>;
      if (!res.ok || body.error?.code !== "ok") {
        return {
          ok: false,
          status: res.status,
          error: `TikTok 성과 조회 실패(${body.error?.code || res.status})`,
        };
      }
      for (const video of body.data?.videos ?? []) {
        if (!video.id) continue;
        metrics[video.id] = {
          views: Number(video.view_count ?? 0) || 0,
          likes: Number(video.like_count ?? 0) || 0,
          replies: Number(video.comment_count ?? 0) || 0,
          reposts: Number(video.share_count ?? 0) || 0,
        };
      }
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      return { ok: false, error: `TikTok 성과 조회 중 오류: ${message.slice(0, 120)}` };
    }
  }
  return { ok: true, metrics };
}

export async function queryTikTokCreatorInfo(
  accessToken: string,
  f: typeof fetch = fetch,
): Promise<TikTokCreatorInfo | null> {
  try {
    const res = await f(`${API_BASE}/creator_info/query/`, {
      method: "POST",
      headers: headers(accessToken),
      signal: AbortSignal.timeout(TIMEOUT_MS),
    });
    const body = await res.json() as TikTokEnvelope<{
      creator_username?: string;
      creator_nickname?: string;
      creator_avatar_url?: string;
      privacy_level_options?: unknown;
      comment_disabled?: boolean;
      duet_disabled?: boolean;
      stitch_disabled?: boolean;
      max_video_post_duration_sec?: number;
    }>;
    if (!res.ok || body.error?.code !== "ok" || !body.data) return null;
    const privacyLevels = validPrivacyLevels(body.data.privacy_level_options);
    if (!body.data.creator_username || privacyLevels.length === 0) return null;
    return {
      username: body.data.creator_username,
      nickname: body.data.creator_nickname || body.data.creator_username,
      avatarUrl: body.data.creator_avatar_url || "",
      privacyLevels,
      commentDisabled: body.data.comment_disabled === true,
      duetDisabled: body.data.duet_disabled === true,
      stitchDisabled: body.data.stitch_disabled === true,
      maxVideoDurationSec: Number(body.data.max_video_post_duration_sec) || 0,
    };
  } catch {
    return null;
  }
}

export async function startTikTokVideoPost(input: {
  accessToken: string;
  videoUrl: string;
  title: string;
  privacyLevel: TikTokPrivacyLevel;
  disableComment: boolean;
  disableDuet: boolean;
  disableStitch: boolean;
  isAiGenerated: boolean;
  /** 대문으로 쓸 시점(밀리초). 안 주면 TikTok 이 알아서 고른다(대개 첫 프레임). */
  coverTimestampMs?: number;
}, f: typeof fetch = fetch): Promise<{ ok: true; publishId: string } | { ok: false; reason: string }> {
  try {
    const res = await f(`${API_BASE}/video/init/`, {
      method: "POST",
      headers: headers(input.accessToken),
      body: JSON.stringify({
        post_info: {
          title: input.title,
          privacy_level: input.privacyLevel,
          disable_comment: input.disableComment,
          disable_duet: input.disableDuet,
          disable_stitch: input.disableStitch,
          brand_content_toggle: false,
          brand_organic_toggle: false,
          is_aigc: input.isAiGenerated,
          // 안 주면 TikTok 이 첫 프레임을 쓴다. 숏폼에서 첫 프레임은 대개 아직 아무것도
          // 안 보이는 순간이라 가장 나쁜 대문이 된다(회장 2026-09-09).
          ...(typeof input.coverTimestampMs === "number"
            ? { video_cover_timestamp_ms: input.coverTimestampMs }
            : {}),
        },
        source_info: { source: "PULL_FROM_URL", video_url: input.videoUrl },
      }),
      signal: AbortSignal.timeout(TIMEOUT_MS),
    });
    const body = await res.json() as TikTokEnvelope<{ publish_id?: string }>;
    if (!res.ok || body.error?.code !== "ok" || !body.data?.publish_id) {
      return { ok: false, reason: body.error?.code || "provider_rejected" };
    }
    return { ok: true, publishId: body.data.publish_id };
  } catch {
    return { ok: false, reason: "provider_unavailable" };
  }
}

export async function fetchTikTokPostStatus(
  accessToken: string,
  publishId: string,
  f: typeof fetch = fetch,
): Promise<{ status: string; postId?: string; failReason?: string } | null> {
  try {
    const res = await f(`${API_BASE}/status/fetch/`, {
      method: "POST",
      headers: headers(accessToken),
      body: JSON.stringify({ publish_id: publishId }),
      signal: AbortSignal.timeout(TIMEOUT_MS),
    });
    const body = await res.json() as TikTokEnvelope<{
      status?: string;
      fail_reason?: string;
      publicaly_available_post_id?: Array<string | number>;
    }>;
    if (!res.ok || body.error?.code !== "ok" || !body.data?.status) return null;
    const postId = body.data.publicaly_available_post_id?.[0];
    return {
      status: body.data.status,
      postId: postId === undefined ? undefined : String(postId),
      failReason: body.data.fail_reason,
    };
  } catch {
    return null;
  }
}
