import {
  publishThreads,
  publishXReply,
  isAmbiguousProviderHttpStatus,
  type ChannelCred,
  type PublishResult,
} from "@/lib/publish";

export const FIRST_COMMENT_PLATFORMS = [
  "threads",
  "x",
  "instagram",
  "facebook",
  "shorts",
  "reels",
  "tiktok",
] as const;

export type FirstCommentPlatform = (typeof FIRST_COMMENT_PLATFORMS)[number];

export interface FirstCommentCapability {
  platform: FirstCommentPlatform;
  supported: boolean;
  requiredPermission: string | null;
  reason: string | null;
}

const CAPABILITIES: Record<FirstCommentPlatform, FirstCommentCapability> = {
  threads: { platform: "threads", supported: true, requiredPermission: "threads_manage_replies", reason: null },
  x: { platform: "x", supported: true, requiredPermission: "tweet.write", reason: null },
  instagram: { platform: "instagram", supported: true, requiredPermission: "instagram_business_manage_comments", reason: null },
  facebook: { platform: "facebook", supported: true, requiredPermission: "Page comments permission in Facebook Login for Business", reason: null },
  shorts: { platform: "shorts", supported: false, requiredPermission: "youtube.force-ssl", reason: "YouTube 영상 발행 route에 첫 댓글 후속 호출이 아직 연결되지 않았습니다." },
  reels: { platform: "reels", supported: false, requiredPermission: "instagram_business_manage_comments", reason: "Reels 영상 발행 route에 첫 댓글 후속 호출이 아직 연결되지 않았습니다." },
  tiktok: { platform: "tiktok", supported: false, requiredPermission: null, reason: "현재 TikTok provider adapter는 댓글 생성 계약을 제공하지 않습니다." },
};

export function listFirstCommentCapabilities(): FirstCommentCapability[] {
  return FIRST_COMMENT_PLATFORMS.map((platform) => CAPABILITIES[platform]);
}

export function getFirstCommentCapability(platform: string): FirstCommentCapability | null {
  return Object.prototype.hasOwnProperty.call(CAPABILITIES, platform)
    ? CAPABILITIES[platform as FirstCommentPlatform]
    : null;
}

export function normalizeFirstComment(value: unknown): string | null {
  if (value == null) return null;
  if (typeof value !== "string") throw new TypeError("first_comment must be a string");
  const text = value.trim();
  if (!text) throw new TypeError("first_comment must not be empty");
  if (text.length > 10_000) throw new TypeError("first_comment is too long");
  return text;
}

async function publishGraphComment(
  base: string,
  cred: ChannelCred,
  parentId: string,
  text: string,
): Promise<PublishResult> {
  const response = await fetch(`${base}/${encodeURIComponent(parentId)}/comments`, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({ message: text, access_token: cred.token }),
    signal: AbortSignal.timeout(15_000),
  });
  if (!response.ok) return { ok: false, error: `first comment 실패(${response.status})`,
    failureKind: isAmbiguousProviderHttpStatus(response.status) ? "indeterminate" : "definitive" };
  const body = (await response.json().catch(() => ({}))) as { id?: string };
  if (!body.id) return { ok: false, error: "first comment 응답에 id가 없습니다.", failureKind: "indeterminate" };
  return { ok: true, externalId: body.id };
}

export async function publishFirstComment(
  platform: FirstCommentPlatform,
  cred: ChannelCred,
  parentId: string,
  text: string,
): Promise<PublishResult> {
  if (platform === "threads") return publishThreads(cred, text, undefined, parentId);
  if (platform === "x") return publishXReply(cred, text, parentId);
  if (platform === "instagram") {
    const base = cred.meta?.api === "instagram_login"
      ? "https://graph.instagram.com/v21.0"
      : "https://graph.facebook.com/v21.0";
    return publishGraphComment(base, cred, parentId, text);
  }
  if (platform === "facebook") {
    return publishGraphComment("https://graph.facebook.com/v21.0", cred, parentId, text);
  }
  return { ok: false, error: CAPABILITIES[platform].reason ?? "first comment unsupported" };
}
