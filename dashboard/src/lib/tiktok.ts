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
  error?: { code?: string; message?: string; log_id?: string };
}

export interface TikTokProviderError {
  code: string;
  message: string;
  logId: string | null;
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
}, f: typeof fetch = fetch): Promise<
  { ok: true; publishId: string }
  | { ok: false; reason: string; providerError: TikTokProviderError }
> {
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
      // 2026-10-02 Codex 교차검수(PR #104) MAJOR: body.error?.code는 TikTok이 보내는
      // 외부 문자열이라 검증 없이 로그·DB에 넣으면 안 된다(이 파일의 회귀 테스트가
      // "access_token=provider-secret" 로 그 위험을 흉내 낸다). 알려진 코드 허용 목록
      // (tiktokRejectReasonMessage의 매핑 키)으로만 통과시키고, 그 밖은 전부 고정 코드
      // "provider_rejected"로 접어서 반환한다 — 호출부가 로그에 찍는 reason은 이 시점에
      // 이미 안전이 보장된 값이다.
      const fallbackCode = res.status === 429
        ? "rate_limit_exceeded"
        : res.status >= 500
          ? "provider_unavailable"
          : "provider_rejected";
      const providerError = tikTokProviderError(body.error, fallbackCode);
      return { ok: false, reason: providerError.code, providerError };
    }
    return { ok: true, publishId: body.data.publish_id };
  } catch {
    const providerError = { code: "provider_unavailable", message: "", logId: null };
    return { ok: false, reason: providerError.code, providerError };
  }
}

/**
 * TikTok Content Posting API의 거부 코드 → 한국어 안내. normalizeTikTokReason과
 * tiktokRejectReasonMessage가 같은 허용 목록을 공유한다(2026-10-02 Codex 교차검수 후
 * 하나로 합침 — 목록이 둘로 갈라지면 한쪽만 갱신돼 새 코드가 조용히 새나간다).
 *
 * 2026-10-02 결함(회장 지적): TikTok 거부 사유(startTikTokVideoPost의 reason)를 route.ts가
 * 버리고 "앱 권한과 계정 상태를 확인해주세요" 한 줄로만 답했다. 실측에서 공개
 * (PUBLIC_TO_EVERYONE) 요청이 unaudited_client_can_only_post_to_private_accounts로
 * 거부됐는데 — 심사 전 앱은 TikTok 문서상 비공개 계정에만 올릴 수 있다 — 화면은 그 사실을
 * 한마디도 못 전했다. 원문(body.error.message)은 외부 API 응답 텍스트라 그대로 노출하지
 * 않고, 알려진 코드만 고정 한국어로 번역한다(ADR-007 조용한 실패 금지 + 원문 비노출 원칙
 * 둘 다 지킨다). 참고: https://developers.tiktok.com/doc/content-posting-api-reference-direct-post
 */
// 2026-10-02 독립 리뷰어 MINOR: 매핑 문구를 TikTok 공식 Content Posting API init 오류
// 표(https://developers.tiktok.com/doc/content-posting-api-reference-direct-post)와
// 대조해 교정했다.
// - spam_risk_too_many_posts: 문서상 "하루 게시 한도 초과" — "단시간에 너무 많이"가 아니다.
// - reached_active_user_cap: 앱(계정 전체)의 하루 활성 게시 사용자 수 한도 — 내일 재시도를 안내.
// - url_ownership_unverified: 소스 URL의 운영 설정(도메인 인증) 문제 — 재시도로는 안 풀린다.
// - invalid_file_upload: init 오류 표에 없는 코드(업로드 단계 오류다, 우리는 init만 쓴다) —
//   잘못된 매핑이라 제거한다. 허용 목록에서 빠지면 normalizeTikTokReason이 provider_rejected로
//   접어 안전하게 처리한다.
// - access_token_invalid·scope_not_authorized: 문서의 인증 오류 코드. 재연결을 안내한다.
const TIKTOK_KNOWN_REJECT_MESSAGES: Record<string, string> = {
  unaudited_client_can_only_post_to_private_accounts:
    "TikTok 앱 심사 전이라 공개 게시가 막혀 있습니다. 계정을 비공개로 바꾸고 나만 보기로 올리거나, 심사 통과 후 공개로 올릴 수 있습니다.",
  spam_risk_too_many_posts:
    "오늘 TikTok에 올릴 수 있는 하루 게시 한도를 넘었습니다. 내일 다시 시도해 주세요.",
  spam_risk_user_banned_from_posting:
    "이 TikTok 계정은 게시가 제한된 상태입니다. TikTok 앱에서 계정 상태를 확인해 주세요.",
  reached_active_user_cap:
    "앱이 심사 전이라 TikTok이 허용하는 하루 활성 게시 사용자 수를 넘었습니다. 내일 다시 시도해 주세요.",
  url_ownership_unverified:
    "영상 주소의 운영 설정(도메인 인증)이 TikTok에 확인되지 않았습니다. 다시 시도해도 풀리지 않으니 연결 설정을 다시 확인해 주세요.",
  privacy_level_option_mismatch:
    "선택한 공개 범위를 이 계정에서 쓸 수 없습니다. 공개 범위를 바꿔 다시 시도해 주세요.",
  rate_limit_exceeded:
    "TikTok 요청이 너무 잦아 잠시 막혔습니다. 몇 분 뒤 다시 시도해 주세요.",
  access_token_invalid:
    "TikTok 연결이 끊어졌습니다. 설정에서 TikTok 계정을 다시 연결해 주세요.",
  scope_not_authorized:
    "이 작업에 필요한 TikTok 권한이 없습니다. 설정에서 TikTok 계정을 다시 연결해 권한을 다시 허용해 주세요.",
  provider_rejected: "TikTok이 발행 요청을 거부했습니다. 앱 권한과 계정 상태를 확인해주세요.",
  provider_unavailable: "TikTok 서버에 연결하지 못했습니다. 잠시 후 다시 시도해 주세요.",
};

// 2026-10-02 독립 리뷰어 MINOR: 허용 목록 멤버십 검사만으로도 충분하지만, TikTok이
// 코드 필드에 예상 밖 형태(공백·구두점·과도한 길이)를 보내는 경로까지 방어선을 하나 더
// 둔다. 저장·로그에 쓰기 전 반드시 이 정규식을 통과한 값만 "코드"로 인정한다.
const TIKTOK_REASON_CODE_PATTERN = /^[a-z0-9_]{1,64}$/;

/**
 * TikTok이 돌려준 거부 코드를 허용 목록으로 걸러낸다. 형태가 코드 같지 않거나 목록
 * 밖인 값(TikTok이 문서에 없는 코드를 보내거나, 응답이 손상된 경우)은 전부
 * "provider_rejected"로 접는다 — 이 시점 이후로는 reason이 로그·DB·화면 어디에
 * 찍혀도 안전하다는 것을 함수 경계에서 보장한다.
 */
function normalizeTikTokReason(reason: string | undefined): string {
  if (
    reason &&
    TIKTOK_REASON_CODE_PATTERN.test(reason) &&
    Object.prototype.hasOwnProperty.call(TIKTOK_KNOWN_REJECT_MESSAGES, reason)
  ) {
    return reason;
  }
  return "provider_rejected";
}

function safeTikTokReasonCode(reason: unknown): string | undefined {
  if (typeof reason !== "string" || !TIKTOK_REASON_CODE_PATTERN.test(reason)) return undefined;
  // 문서에 없는 처리 단계 code는 운영 진단을 위해 보존하되, 외부 문자열이 토큰 형태면
  // code 정규식만 통과하더라도 저장하지 않는다. 메시지와 같은 redaction 경계를 공유한다.
  return safeTikTokProviderMessage(reason) === reason ? reason : undefined;
}

function safeTikTokProviderMessage(message: unknown): string {
  if (typeof message !== "string") return "";
  return message
    .replace(/[\u0000-\u001f\u007f]/g, " ")
    .replace(/\b(access[_ -]?token|refresh[_ -]?token|id[_ -]?token|token|api[_ -]?key|client[_ -]?secret|authorization|password|secret|session|cookie)\b["']?\s*[:=]\s*["']?(?:bearer\s+)?[^\s"',;&}]+/gi, "$1=[redacted]")
    .replace(/\bbearer\s+[A-Za-z0-9._~+/-]+=*/gi, "Bearer [redacted]")
    .replace(/\b(?=[A-Za-z0-9._~+/-]{24,}={0,2}(?=$|[\s"',;&}]))(?=[A-Za-z0-9._~+/-]*[A-Za-z])(?=[A-Za-z0-9._~+/-]*\d)[A-Za-z0-9._~+/-]{24,}={0,2}/g, "[redacted]")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, 500);
}

function safeTikTokLogId(logId: unknown): string | null {
  return typeof logId === "string" && /^[A-Za-z0-9_-]{1,128}$/.test(logId) ? logId : null;
}

function tikTokProviderError(
  error: TikTokEnvelope<unknown>["error"],
  fallbackCode = "provider_rejected",
): TikTokProviderError {
  const rawCode = error?.code;
  const code = !rawCode || rawCode === "ok" ? fallbackCode : normalizeTikTokReason(rawCode);
  const message = rawCode && rawCode === code ? safeTikTokProviderMessage(error?.message) : "";
  return {
    code,
    message,
    logId: safeTikTokLogId(error?.log_id),
  };
}

export function tiktokRejectReasonMessage(reason: string): string {
  return TIKTOK_KNOWN_REJECT_MESSAGES[reason] ?? TIKTOK_KNOWN_REJECT_MESSAGES.provider_rejected;
}

export async function fetchTikTokPostStatus(
  accessToken: string,
  publishId: string,
  f: typeof fetch = fetch,
): Promise<
  | { ok: true; status: string; postId?: string; failReason?: string; rawFailReason?: string; providerError: TikTokProviderError }
  | { ok: false; providerError: TikTokProviderError }
> {
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
    if (!res.ok || body.error?.code !== "ok" || !body.data?.status) {
      const fallbackCode = res.status === 429
        ? "rate_limit_exceeded"
        : res.status >= 500 || !body.error?.code || (res.ok && body.error.code === "ok" && !body.data?.status)
          ? "provider_unavailable"
          : "provider_rejected";
      return { ok: false, providerError: tikTokProviderError(body.error, fallbackCode) };
    }
    const postId = body.data.publicaly_available_post_id?.[0];
    const rawFailReason = safeTikTokReasonCode(body.data.fail_reason);
    return {
      ok: true,
      status: body.data.status,
      postId: postId === undefined ? undefined : String(postId),
      failReason: body.data.fail_reason ? normalizeTikTokReason(body.data.fail_reason) : undefined,
      ...(rawFailReason ? { rawFailReason } : {}),
      providerError: {
        code: "ok",
        message: safeTikTokProviderMessage(body.error?.message),
        logId: safeTikTokLogId(body.error?.log_id),
      },
    };
  } catch {
    return {
      ok: false,
      providerError: { code: "provider_unavailable", message: "", logId: null },
    };
  }
}
