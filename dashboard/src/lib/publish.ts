import crypto from "node:crypto";
import { withTenant } from "@/lib/db";
import { getSelectedChannelAccountCred } from "@/lib/channel-accounts";
import { CHANNEL_TEXT_LIMITS, countTextCharacters } from "@/lib/channel-text-limits";
import { validatePlatformPublish } from "@/lib/studio/platform-publish-fields";

// 대시보드 직접 발행(게이트웨이 docker 불필요). 토큰=integrations 테이블(테넌트별) → env 폴백(dev).
// 게이트웨이 extensions/{ch}-publish 로직 포팅. 실발행은 실 토큰 필요.

const THREADS_API = "https://graph.threads.net/v1.0";
const IG_API = "https://graph.facebook.com/v21.0";           // 레거시 env(INSTAGRAM_ACCESSTOKEN) = Facebook Graph
const IG_LOGIN_API = "https://graph.instagram.com/v21.0";    // 테넌트 연결(Instagram Login API) 토큰
const FB_API = "https://graph.facebook.com/v21.0";
const X_API = "https://api.twitter.com/2";
const BLUESKY_API = "https://bsky.social/xrpc";               // AT Protocol PDS(개인 서버 호스팅 시 다를 수 있음 — bsky.social 기본값)
const TELEGRAM_API = "https://api.telegram.org";

export interface PublishResult {
  ok: boolean;
  externalId?: string;
  permalink?: string;
  error?: string;
  failureKind?: "definitive" | "indeterminate";
}

// SSRF 가드 1단계(lexical) — 서버가 직접 fetch하는 image_url에만 적용(현재 Bluesky uploadBlob 경로).
// 다른 채널은 image_url을 플랫폼 API에 넘겨 "플랫폼이" 가져오므로 우리 서버 표면 아님.
// 정당한 image_url = R2/공개 자산 URL(https). 사설·루프백·링크로컬·메타데이터 IP 리터럴 차단.
// 이 검사만으로는 "공개 hostname이 fetch 시점에 사설 IP로 resolve"되는 DNS rebinding을 막지 못한다
// (파싱 시점엔 hostname만 보이고 IP는 아직 안 보임) — 그래서 실제 서버-fetch 허용 여부는 이 함수
// 단독이 아니라 아래 isAllowedServerFetchImageHost(운영자 제어 exact-host allowlist)와 AND로 판정한다.
export function isSafePublicImageUrl(raw: string): boolean {
  let u: URL;
  try { u = new URL(raw); } catch { return false; }
  if (u.protocol !== "http:" && u.protocol !== "https:") return false;
  // IPv6 리터럴은 WHATWG URL hostname에 대괄호가 포함됨("[::1]") — 비교 전 제거.
  const host = u.hostname.toLowerCase().replace(/^\[|\]$/g, "");
  if (host === "localhost" || host.endsWith(".localhost") || host.endsWith(".local")) return false;
  // IPv6 루프백/링크로컬/ULA(+ IPv4-mapped ::ffff: 표기)
  if (host.includes(":")) {
    if (host === "::1" || host === "::" || host.startsWith("fe80:") || host.startsWith("fc") || host.startsWith("fd")) return false;
    if (host.startsWith("::ffff:")) return false; // IPv4-mapped — 매핑 우회 차단(공개 IPv4는 일반 표기로 쓰면 됨)
  }
  // IPv4 리터럴 사설/루프백/링크로컬/메타데이터(169.254.169.254 포함)
  const m = host.match(/^(\d{1,3})\.(\d{1,3})\.(\d{1,3})\.(\d{1,3})$/);
  if (m) {
    const [a, b] = [Number(m[1]), Number(m[2])];
    if (a === 10 || a === 127 || a === 0) return false;
    if (a === 169 && b === 254) return false;            // link-local + cloud metadata
    if (a === 192 && b === 168) return false;
    if (a === 172 && b >= 16 && b <= 31) return false;
    if (a === 100 && b >= 64 && b <= 127) return false;  // CGNAT
  }
  return true;
}

// meta = 채널별 부가 자격증명. userId(threads/ig user, fb pageId) + X는 4키(OAuth1.0a)를 meta에 저장.
// refreshToken: channel_accounts.refresh_enc(암호화)에서 복호화해 온 값 또는(레거시 폴백만) integrations
// meta에 이미 평문으로 존재하던 값. 새로 평문 저장은 어디서도 하지 않는다(SNS-007 감사).
export interface ChannelCred { token: string; userId?: string; meta?: Record<string, unknown>; accountId?: string; refreshToken?: string }

// 테넌트 채널 자격증명 resolve. SNS-007: accountId(선택) → channel_accounts 기본계정 →
// legacy integrations(kind=channel,label=platform) → env 폴백. 3계층 우선순위.
// accountId를 명시했는데 그 계정이 없으면(삭제됨/cross-tenant) 조용히 기본/legacy로
// 떨어지지 않고 즉시 null을 반환한다 — "선택한 계정으로 발행"이 다른 계정으로 새는 것을 방지.
export async function getChannelCred(tenantId: string, platform: string, accountId?: string): Promise<ChannelCred | null> {
  if (accountId) {
    const sel = await getSelectedChannelAccountCred(tenantId, platform, accountId);
    if (!sel) return null;
    return { token: sel.token, userId: sel.userId, meta: sel.meta, accountId: sel.accountId, refreshToken: sel.refreshToken };
  }
  const defaultAcc = await getSelectedChannelAccountCred(tenantId, platform);

  const key = process.env.OSMU_SECRET_KEY;
  // L1+L2: withTenant 트랜잭션(RLS) 안에서 암호화 secret 복호화. 토큰은 메모리에만.
  const [row] = await withTenant(tenantId, (sql) => sql<{ token: string | null; meta: Record<string, unknown> | null }[]>`
    SELECT CASE WHEN secret_enc <> '' AND ${key ?? ""} <> ''
             THEN pgp_sym_decrypt(dearmor(secret_enc), ${key ?? ""}) ELSE NULL END AS token, meta
    FROM integrations
    WHERE tenant_id = ${tenantId} AND kind = 'channel' AND label = ${platform}`);
  if (row) {
    const meta = (row.meta ?? {}) as Record<string, unknown>;
    const userId = typeof meta.userId === "string" ? meta.userId : undefined;
    // 레거시 integrations 폴백 전용: 이미 예전에 평문으로 저장돼 있던 meta.refreshToken이 있으면만
    // 읽는다(하위호환) — 새로 이 필드에 쓰는 코드는 이제 어디에도 없다(callback route에서 제거됨).
    const refreshToken = typeof meta.refreshToken === "string" ? meta.refreshToken : undefined;
    if (defaultAcc) {
      return {
        token: defaultAcc.token,
        userId: defaultAcc.userId,
        meta: defaultAcc.meta,
        accountId: defaultAcc.accountId,
        // 기존 YouTube integration의 평문 refresh token은 첫 갱신 때 refresh_enc로 승격한다.
        refreshToken: defaultAcc.refreshToken ?? (platform === "youtube" ? refreshToken : undefined),
      };
    }
    // X는 token 컬럼 미사용 가능 — 4키가 meta에 적재되면 cred 인정
    if (platform === "x" && (meta.apiKey || meta.accessToken)) {
      return { token: row.token ?? "", userId, meta, refreshToken };
    }
    if (row.token) return { token: row.token, userId, meta, refreshToken };
  }
  if (defaultAcc) {
    return {
      token: defaultAcc.token,
      userId: defaultAcc.userId,
      meta: defaultAcc.meta,
      accountId: defaultAcc.accountId,
      refreshToken: defaultAcc.refreshToken,
    };
  }
  // dev 폴백(단일 env — 중앙 대시보드엔 테넌트별 env 없음)
  if (platform === "threads" && process.env.THREADS_ACCESS_TOKEN) {
    return { token: process.env.THREADS_ACCESS_TOKEN, userId: process.env.THREADS_USER_ID };
  }
  if (platform === "instagram" && process.env.INSTAGRAM_ACCESSTOKEN) {
    return { token: process.env.INSTAGRAM_ACCESSTOKEN, userId: process.env.INSTAGRAM_USERID };
  }
  if (platform === "facebook" && process.env.FACEBOOK_ACCESSTOKEN) {
    return { token: process.env.FACEBOOK_ACCESSTOKEN, userId: process.env.FACEBOOK_PAGEID };
  }
  if (platform === "x" && process.env.X_API_KEY) {
    // 4키 OAuth1.0a — env 폴백은 meta에 담아 publishX가 동일 경로로 소비
    return {
      token: "",
      meta: {
        apiKey: process.env.X_API_KEY,
        apiSecret: process.env.X_API_KEY_SECRET,
        accessToken: process.env.X_ACCESS_TOKEN,
        accessSecret: process.env.X_ACCESS_TOKEN_SECRET,
      },
    };
  }
  return null;
}

// 저장된 meta.userId는 stale할 수 있다(SNS-009: 재연결/토큰 회전 후 갱신되지 않은 값으로
// 발행 URL을 구성하면 provider가 400 Unsupported post request를 반환). 컨테이너 생성 전
// 항상 토큰의 실제 신원(/me?fields=id)을 조회해 그 id로 발행한다 — 저장값은 신뢰하지 않는다.
async function resolveThreadsIdentity(token: string): Promise<{ id: string } | { error: string }> {
  try {
    const res = await fetch(`${THREADS_API}/me?fields=id&access_token=${encodeURIComponent(token)}`, {
      signal: AbortSignal.timeout(5000),
    });
    if (!res.ok) {
      // provider raw body/토큰 조각을 그대로 노출하지 않는다 — 상태코드로만 분류.
      return { error: `Threads 계정 확인에 실패했습니다 (오류 코드 ${res.status}). 채널을 다시 연결해주세요.` };
    }
    const data = (await res.json()) as { id?: string };
    if (!data.id) return { error: "Threads 계정 확인에 실패했습니다. 채널을 다시 연결해주세요." };
    return { id: data.id };
  } catch {
    return { error: "Threads 계정 확인 중 네트워크 오류가 발생했습니다. 잠시 후 다시 시도해주세요." };
  }
}

async function waitForThreadsContainer(containerId: string, token: string): Promise<{ ok: true } | { error: string }> {
  for (let attempt = 0; attempt < 20; attempt++) {
    try {
      const res = await fetch(
        `${THREADS_API}/${containerId}?fields=status,error_message&access_token=${encodeURIComponent(token)}`,
        { signal: AbortSignal.timeout(5000) },
      );
      if (!res.ok) {
        return { error: `Threads container 상태 확인에 실패했습니다 (오류 코드 ${res.status}). 잠시 후 다시 시도해주세요.` };
      }
      const body = (await res.json()) as { status?: string };
      if (body.status === "FINISHED") return { ok: true };
      if (body.status === "ERROR" || body.status === "EXPIRED") {
        return { error: "Threads container 처리에 실패했습니다. 채널을 다시 연결하거나 콘텐츠를 확인해주세요." };
      }
      if (body.status !== "IN_PROGRESS") {
        return { error: "Threads container 상태를 확인할 수 없습니다. 잠시 후 다시 시도해주세요." };
      }
    } catch {
      return { error: "Threads container 상태 확인 중 네트워크 오류가 발생했습니다. 잠시 후 다시 시도해주세요." };
    }
    await new Promise((resolve) => setTimeout(resolve, 1000));
  }
  return { error: "Threads container 준비 시간이 초과됐습니다. 잠시 후 다시 시도해주세요." };
}

export async function fetchThreadsPermalink(token: string, mediaId: string): Promise<string | undefined> {
  for (let attempt = 0; attempt < 5; attempt++) {
    try {
      const response = await fetch(
        `${THREADS_API}/${mediaId}?fields=permalink&access_token=${encodeURIComponent(token)}`,
        { signal: AbortSignal.timeout(5000) },
      );
      if (response.ok) {
        const permalink = ((await response.json()) as { permalink?: string }).permalink;
        if (permalink) return permalink;
      }
    } catch { /* retry below */ }
    if (attempt < 4) await new Promise((resolve) => setTimeout(resolve, 1000));
  }
  return undefined;
}

// Threads 발행 (text + 선택 image). 2-step container→publish.
export interface ProviderReadbackHit {
  externalId: string;
  permalink?: string;
}

// 만료된 예약을 회수하기 전에 공급자에게 "이미 올라갔는지"를 먼저 묻는다.
// 예약만 남기고 프로세스가 죽은 경우와, 게시까지 끝내고 죽은 경우를 구분하지 않으면
// 회수가 곧 중복 게시가 된다. 같은 본문이 예약 시각 이후에 올라와 있으면 그 게시물을
// 이 예약의 결과로 받아들이고 다시 올리지 않는다.
// 공급자가 조회를 거절하거나 응답하지 않으면 null 이 아니라 "unknown"을 돌려준다.
// 모른다는 것을 없다는 것으로 바꾸면 안 된다.
export async function findRecentProviderPost(
  platform: string,
  cred: ChannelCred,
  text: string,
  since: Date,
): Promise<{ state: "found"; hit: ProviderReadbackHit } | { state: "absent" } | { state: "unknown" }> {
  const normalized = (text || "").trim();
  if (!normalized) return { state: "unknown" };
  if (!cred.token) return { state: "unknown" };

  try {
    if (platform === "threads") {
      const identity = await resolveThreadsIdentity(cred.token);
      if ("error" in identity) return { state: "unknown" };
      const response = await fetch(
        `${THREADS_API}/${identity.id}/threads?fields=id,text,timestamp,permalink&limit=25&access_token=${encodeURIComponent(cred.token)}`,
        { signal: AbortSignal.timeout(10_000) },
      );
      if (!response.ok) return { state: "unknown" };
      const body = (await response.json()) as {
        data?: { id?: string; text?: string; timestamp?: string; permalink?: string }[];
      };
      if (!Array.isArray(body.data)) return { state: "unknown" };
      const hit = body.data.find((post) =>
        typeof post.id === "string"
        && (post.text ?? "").trim() === normalized
        && typeof post.timestamp === "string"
        && new Date(post.timestamp).getTime() >= since.getTime() - 60_000);
      return hit?.id ? { state: "found", hit: { externalId: hit.id, permalink: hit.permalink } } : { state: "absent" };
    }

    if (platform === "instagram") {
      const base = cred.meta?.api === "instagram_login" ? IG_LOGIN_API : IG_API;
      const response = await fetch(
        `${base}/me/media?fields=id,caption,timestamp,permalink&limit=25&access_token=${encodeURIComponent(cred.token)}`,
        { signal: AbortSignal.timeout(10_000) },
      );
      if (!response.ok) return { state: "unknown" };
      const body = (await response.json()) as {
        data?: { id?: string; caption?: string; timestamp?: string; permalink?: string }[];
      };
      if (!Array.isArray(body.data)) return { state: "unknown" };
      const hit = body.data.find((media) =>
        typeof media.id === "string"
        && (media.caption ?? "").trim() === normalized
        && typeof media.timestamp === "string"
        && new Date(media.timestamp).getTime() >= since.getTime() - 60_000);
      return hit?.id ? { state: "found", hit: { externalId: hit.id, permalink: hit.permalink } } : { state: "absent" };
    }
  } catch {
    return { state: "unknown" };
  }

  // 조회 계약이 없는 채널은 "없다"고 단정하지 않는다.
  return { state: "unknown" };
}

export async function publishThreads(
  cred: ChannelCred,
  text: string,
  imageUrl?: string,
  replyToId?: string,
  topicTag?: string,
): Promise<PublishResult> {
  const validation = validatePlatformPublish("threads", { body: text, topicTag });
  if (validation.blocking.length > 0) {
    return {
      ok: false,
      error: validation.blocking[0].message,
    };
  }
  if (!cred.token) return { ok: false, error: "Threads 채널 토큰이 없습니다. 채널을 다시 연결해주세요." };
  const identity = await resolveThreadsIdentity(cred.token);
  if ("error" in identity) return { ok: false, error: identity.error };
  const threadsUserId = identity.id;
  const params: Record<string, string> = {
    media_type: imageUrl ? "IMAGE" : "TEXT", text, access_token: cred.token,
  };
  if (imageUrl) params.image_url = imageUrl;
  if (replyToId) params.reply_to_id = replyToId;
  if (topicTag?.trim()) params.topic_tag = topicTag.trim().replace(/^#/, "");

  let containerId: string;
  try {
    const create = await fetch(`${THREADS_API}/${threadsUserId}/threads`, {
      method: "POST", headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams(params),
      signal: AbortSignal.timeout(15_000),
    });
    if (!create.ok) return { ok: false, error: `container 실패(${create.status}): Threads 채널 권한을 확인하거나 다시 연결해주세요.` };
    const createBody = (await create.json()) as { id?: string };
    if (!createBody.id) return { ok: false, error: "Threads container 생성에 실패했습니다. 잠시 후 다시 시도해주세요." };
    containerId = createBody.id;
  } catch {
    return { ok: false, error: "Threads container 처리 중 오류가 발생했습니다. 잠시 후 다시 시도해주세요." };
  }

  const ready = await waitForThreadsContainer(containerId, cred.token);
  if ("error" in ready) return { ok: false, error: ready.error };

  let mediaId: string;
  try {
    const pub = await fetch(`${THREADS_API}/${threadsUserId}/threads_publish`, {
      method: "POST", headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({ creation_id: containerId, access_token: cred.token }),
    });
    if (!pub.ok) return { ok: false, error: `publish 실패(${pub.status}): Threads 채널 권한을 확인하거나 다시 연결해주세요.`, failureKind: "definitive" };
    const pubBody = (await pub.json()) as { id?: string };
    if (!pubBody.id) return { ok: false, error: "Threads 발행 결과를 확인하지 못했습니다. 중복 방지를 위해 상태 확인이 필요합니다.", failureKind: "indeterminate" };
    mediaId = pubBody.id;
  } catch {
    return { ok: false, error: "Threads 발행 결과를 확인하지 못했습니다. 중복 방지를 위해 상태 확인이 필요합니다.", failureKind: "indeterminate" };
  }

  // 발행 직후 media 조회가 아직 비어 있을 수 있어 짧게 재시도한다. permalink 실패는 발행 성공을 뒤집지 않는다.
  const permalink = await fetchThreadsPermalink(cred.token, mediaId);
  return { ok: true, externalId: mediaId, permalink };
}

// Instagram 발행 (caption + 단일 image, Graph API). image_url은 공개 URL 필요.
export async function fetchInstagramPermalink(cred: ChannelCred, mediaId: string): Promise<string | undefined> {
  const base = cred.meta?.api === "instagram_login" ? IG_LOGIN_API : IG_API;
  for (let i = 0; i < 5; i++) {
    try {
      const res = await fetch(`${base}/${mediaId}?fields=permalink&access_token=${encodeURIComponent(cred.token)}`);
      if (res.ok) {
        const permalink = String(((await res.json()) as { permalink?: string }).permalink ?? "");
        if (permalink) return permalink;
      }
    } catch {
      // The post is already published; permalink recovery must not reverse that success.
    }
    if (i < 4) await new Promise((resolve) => setTimeout(resolve, 1000));
  }
  return undefined;
}

export async function publishInstagram(cred: ChannelCred, caption: string, imageUrl?: string): Promise<PublishResult> {
  if (!cred.userId) return { ok: false, error: "INSTAGRAM_USERID(meta.userId) 없음" };
  if (!imageUrl) return { ok: false, error: "Instagram은 이미지 필수" };
  // 테넌트가 "연결"(Instagram Login API)로 붙인 토큰은 graph.instagram.com, 레거시 env는 graph.facebook.com.
  const base = cred.meta?.api === "instagram_login" ? IG_LOGIN_API : IG_API;
  const create = await fetch(`${base}/${cred.userId}/media`, {
    method: "POST", headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({ image_url: imageUrl, caption, access_token: cred.token }),
  });
  if (!create.ok) return { ok: false, error: `IG container 실패(${create.status})` };
  const { id: creationId } = (await create.json()) as { id: string };
  // 이미지 컨테이너는 인스타가 비동기 처리한다. status_code=FINISHED 될 때까지 폴링해야
  // media_publish가 "Media ID is not available"(9007) 없이 성공한다.
  let finished = false;
  for (let i = 0; i < 20; i++) {
    const st = await fetch(`${base}/${creationId}?fields=status_code&access_token=${encodeURIComponent(cred.token)}`);
    const { status_code } = (await st.json().catch(() => ({}))) as { status_code?: string };
    if (status_code === "FINISHED") {
      finished = true;
      break;
    }
    if (status_code === "ERROR") return { ok: false, error: "IG 미디어 처리 실패(status ERROR — 이미지 형식/접근성 확인)" };
    await new Promise((r) => setTimeout(r, 1500));
  }
  if (!finished) return { ok: false, error: "IG 미디어 처리 시간 초과 — 잠시 후 다시 시도해주세요." };
  const pub = await fetch(`${base}/${cred.userId}/media_publish`, {
    method: "POST", headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({ creation_id: creationId, access_token: cred.token }),
  });
  if (!pub.ok) return { ok: false, error: `IG publish 실패(${pub.status})` };
  const { id: mediaId } = (await pub.json()) as { id: string };
  const permalink = await fetchInstagramPermalink(cred, mediaId);
  return { ok: true, externalId: mediaId, permalink };
}

// SNS-015: Instagram Reels 발행 (media_type=REELS + 프로바이더가 직접 가져갈 공개 video_url).
// IMAGE 경로(publishInstagram)와 계약이 동일하다 — 컨테이너 생성 → status_code 폴링 →
// FINISHED에서만 media_publish → permalink 재시도. 차이는 media_type/video_url뿐.
// fail-closed 원칙: ERROR·타임아웃·폴링 실패에서 media_publish를 호출하지 않는다(SNS-014 회귀 방지).
// 노출 원칙: 프로바이더 응답 본문·토큰·URL을 에러 문자열에 넣지 않는다(상태 코드만).
export interface ReelsPollOptions {
  attempts?: number;
  intervalMs?: number;
  timeoutMs?: number;
}

export async function publishInstagramReels(
  cred: ChannelCred,
  caption: string,
  videoUrl: string,
  opts: ReelsPollOptions = {},
): Promise<PublishResult> {
  if (!cred.userId) return { ok: false, error: "INSTAGRAM_USERID(meta.userId) 없음" };
  if (!videoUrl) return { ok: false, error: "Reels는 공개 video URL 필수" };
  if (!isSafePublicImageUrl(videoUrl) || !videoUrl.startsWith("https://")) {
    return { ok: false, error: "Reels video URL이 공개 HTTPS가 아닙니다." };
  }
  // Meta 공식 가이드(Instagram Platform Content Publishing, developers.facebook.com/docs/
  // instagram-platform/instagram-api-with-instagram-login/content-publishing): "querying a
  // container's status once per minute, for no more than 5 minutes." 기본값을 그대로 따른다
  // (60s × 5회 = 5분). 테스트는 opts로 짧게 오버라이드.
  const attempts = opts.attempts ?? 5;
  const intervalMs = opts.intervalMs ?? 60_000;
  const timeoutMs = opts.timeoutMs ?? 15000;
  // 연결 토큰(Instagram Login API)은 graph.instagram.com, 레거시 env는 graph.facebook.com.
  const base = cred.meta?.api === "instagram_login" ? IG_LOGIN_API : IG_API;

  let create: Response;
  try {
    create = await fetch(`${base}/${cred.userId}/media`, {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({
        media_type: "REELS",
        video_url: videoUrl,
        caption,
        access_token: cred.token,
      }),
      signal: AbortSignal.timeout(timeoutMs),
    });
  } catch {
    return { ok: false, error: "IG Reels 컨테이너 요청 실패 — 잠시 후 다시 시도해주세요." };
  }
  if (!create.ok) return { ok: false, error: `IG Reels container 실패(${create.status})` };
  const { id: creationId } = (await create.json().catch(() => ({}))) as { id?: string };
  if (!creationId) return { ok: false, error: "IG Reels container 실패(응답에 컨테이너 ID 없음)" };

  // 영상은 인코딩이 있어 IMAGE보다 오래 걸린다 → 더 긴 폴링 예산.
  let finished = false;
  for (let i = 0; i < attempts; i++) {
    let statusCode: string | undefined;
    try {
      const st = await fetch(
        `${base}/${creationId}?fields=status_code&access_token=${encodeURIComponent(cred.token)}`,
        { signal: AbortSignal.timeout(timeoutMs) },
      );
      statusCode = ((await st.json().catch(() => ({}))) as { status_code?: string }).status_code;
    } catch {
      statusCode = undefined; // 일시 오류는 재시도 — 단, 성공으로 간주하지 않는다(fail-closed).
    }
    if (statusCode === "FINISHED") {
      finished = true;
      break;
    }
    if (statusCode === "ERROR") {
      return { ok: false, error: "IG Reels 미디어 처리 실패(status ERROR — 영상 형식/길이/접근성 확인)" };
    }
    // EXPIRED: 24시간 내 media_publish가 호출되지 않아 컨테이너가 만료된 상태(공식 문서).
    // ERROR와 동일하게 fail-closed — media_publish를 절대 호출하지 않는다.
    if (statusCode === "EXPIRED") {
      return { ok: false, error: "IG Reels 컨테이너가 만료되었습니다(status EXPIRED) — 다시 시도해주세요." };
    }
    if (i < attempts - 1) await new Promise((r) => setTimeout(r, intervalMs));
  }
  if (!finished) return { ok: false, error: "IG Reels 미디어 처리 시간 초과 — 잠시 후 다시 시도해주세요." };

  let pub: Response;
  try {
    pub = await fetch(`${base}/${cred.userId}/media_publish`, {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({ creation_id: creationId, access_token: cred.token }),
      signal: AbortSignal.timeout(timeoutMs),
    });
  } catch {
    return { ok: false, error: "IG Reels 발행 요청 실패 — 잠시 후 다시 시도해주세요." };
  }
  if (!pub.ok) return { ok: false, error: `IG Reels publish 실패(${pub.status})` };
  const { id: mediaId } = (await pub.json().catch(() => ({}))) as { id?: string };
  if (!mediaId) return { ok: false, error: "IG Reels publish 실패(응답에 media ID 없음)" };
  // permalink 실패가 발행 성공을 뒤집지 않는다(SNS-014와 동일 계약).
  const permalink = await fetchInstagramPermalink(cred, mediaId);
  return { ok: true, externalId: mediaId, permalink };
}

// ── X(Twitter) OAuth1.0a 서명 ─────────────────────────────────────────────
// RFC5849: 서명베이스 = METHOD&percentEnc(URL)&percentEnc(정렬파라미터).
// POST /2/tweets는 본문이 JSON이라 서명 대상 파라미터 = oauth_* 만(쿼리·폼 없음).
// 서명키 = percentEnc(consumerSecret)&percentEnc(tokenSecret), HMAC-SHA1 → base64.

// OAuth 전용 퍼센트 인코딩(예약문자 !'()* 추가 인코딩 — encodeURIComponent 미처리분)
function xPercentEncode(str: string): string {
  return encodeURIComponent(str).replace(
    /[!'()*]/g,
    (c) => `%${c.charCodeAt(0).toString(16).toUpperCase()}`,
  );
}

export interface XKeys { apiKey: string; apiSecret: string; accessToken: string; accessSecret: string }

// X 자격 실검증(OAuth1 서명된 read-only GET). 발행 없이 키 유효성·계정 확인.
// ok=true면 @screen_name. networkError면 네트워크로 확인 불가(키는 보존). status로 인증 실패 구분.
export async function verifyXCredentials(
  k: XKeys,
): Promise<{ ok: boolean; account?: string; status?: number; networkError?: boolean }> {
  const url = "https://api.twitter.com/1.1/account/verify_credentials.json";
  const auth = buildXOAuthHeader("GET", url, k);
  try {
    const resp = await fetch(url, { method: "GET", headers: { Authorization: auth }, signal: AbortSignal.timeout(5000) });
    if (resp.ok) {
      const d = (await resp.json()) as { screen_name?: string };
      return { ok: true, account: d.screen_name ? `@${d.screen_name}` : "(X 연결됨)" };
    }
    return { ok: false, status: resp.status };
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    if (/fetch failed|ENOTFOUND|name resolution|timeout|aborted|abort/i.test(msg)) return { ok: false, networkError: true };
    return { ok: false };
  }
}

function buildXOAuthHeader(method: string, url: string, k: XKeys): string {
  const oauth: Record<string, string> = {
    oauth_consumer_key: k.apiKey,
    oauth_nonce: crypto.randomBytes(16).toString("hex"),
    oauth_signature_method: "HMAC-SHA1",
    oauth_timestamp: Math.floor(Date.now() / 1000).toString(),
    oauth_token: k.accessToken,
    oauth_version: "1.0",
  };
  // 1) 파라미터 정렬 후 직렬화 → 서명베이스 구성
  const sorted = Object.keys(oauth)
    .sort()
    .map((key) => `${xPercentEncode(key)}=${xPercentEncode(oauth[key])}`)
    .join("&");
  const base = `${method.toUpperCase()}&${xPercentEncode(url)}&${xPercentEncode(sorted)}`;
  // 2) 서명키 = consumerSecret&tokenSecret, HMAC-SHA1 → base64
  const signingKey = `${xPercentEncode(k.apiSecret)}&${xPercentEncode(k.accessSecret)}`;
  oauth.oauth_signature = crypto.createHmac("sha1", signingKey).update(base).digest("base64");
  // 3) Authorization 헤더 직렬화(oauth_signature 포함, 정렬)
  const headerParts = Object.keys(oauth)
    .sort()
    .map((key) => `${xPercentEncode(key)}="${xPercentEncode(oauth[key])}"`)
    .join(", ");
  return `OAuth ${headerParts}`;
}

// X 발행 (text only, API v2). 4키 OAuth1.0a 서명. 공식 가중 문자가 280을 넘으면 차단한다.
export async function publishX(cred: ChannelCred, text: string): Promise<PublishResult> {
  const validation = validatePlatformPublish("x", { body: text });
  if (validation.blocking.length > 0) {
    return { ok: false, error: validation.blocking[0].message };
  }
  const meta = (cred.meta ?? {}) as Record<string, unknown>;
  // apiSecret/accessSecret은 게이트웨이 표기(apiKeySecret/accessTokenSecret)도 허용
  const keys: XKeys = {
    apiKey: String(meta.apiKey ?? ""),
    apiSecret: String(meta.apiSecret ?? meta.apiKeySecret ?? ""),
    accessToken: String(meta.accessToken ?? ""),
    accessSecret: String(meta.accessSecret ?? meta.accessTokenSecret ?? ""),
  };
  if (!keys.apiKey || !keys.apiSecret || !keys.accessToken || !keys.accessSecret) {
    return { ok: false, error: "X 4키(apiKey/apiSecret/accessToken/accessSecret) 누락" };
  }
  const body = text ?? "";
  const url = `${X_API}/tweets`;
  const auth = buildXOAuthHeader("POST", url, keys);
  const resp = await fetch(url, {
    method: "POST",
    headers: { Authorization: auth, "Content-Type": "application/json" },
    body: JSON.stringify({ text: body }),
  });
  if (!resp.ok) return { ok: false, error: `X tweet 실패(${resp.status}): ${(await resp.text()).slice(0, 200)}` };
  const data = (await resp.json()) as { data?: { id?: string } };
  const tweetId = data.data?.id;
  return { ok: true, externalId: tweetId, permalink: tweetId ? `https://x.com/i/web/status/${tweetId}` : undefined };
}

export async function publishXReply(cred: ChannelCred, text: string, parentId: string): Promise<PublishResult> {
  const validation = validatePlatformPublish("x", { body: text });
  if (validation.blocking.length > 0) {
    return { ok: false, error: validation.blocking[0].message };
  }
  const meta = (cred.meta ?? {}) as Record<string, unknown>;
  const keys: XKeys = {
    apiKey: String(meta.apiKey ?? ""),
    apiSecret: String(meta.apiSecret ?? meta.apiKeySecret ?? ""),
    accessToken: String(meta.accessToken ?? ""),
    accessSecret: String(meta.accessSecret ?? meta.accessTokenSecret ?? ""),
  };
  if (!keys.apiKey || !keys.apiSecret || !keys.accessToken || !keys.accessSecret) {
    return { ok: false, error: "X 4키(apiKey/apiSecret/accessToken/accessSecret) 누락" };
  }
  const body = text;
  const url = `${X_API}/tweets`;
  const resp = await fetch(url, {
    method: "POST",
    headers: { Authorization: buildXOAuthHeader("POST", url, keys), "Content-Type": "application/json" },
    body: JSON.stringify({ text: body, reply: { in_reply_to_tweet_id: parentId } }),
  });
  if (!resp.ok) return { ok: false, error: `X reply 실패(${resp.status})` };
  const data = (await resp.json()) as { data?: { id?: string } };
  const id = data.data?.id;
  return { ok: true, externalId: id, permalink: id ? `https://x.com/i/web/status/${id}` : undefined };
}

// Facebook 페이지 발행 (Graph API). imageUrl 있으면 /photos(caption), 없으면 /feed(message).
export async function publishFacebook(cred: ChannelCred, message: string, imageUrl?: string): Promise<PublishResult> {
  const pageId = cred.userId;
  if (!pageId) return { ok: false, error: "Facebook pageId(meta.userId) 없음" };
  if (!cred.token) return { ok: false, error: "Facebook access token 없음" };
  const endpoint = imageUrl ? "photos" : "feed";
  const params: Record<string, string> = { access_token: cred.token };
  if (imageUrl) {
    params.url = imageUrl;
    if (message) params.caption = message;
  } else {
    params.message = message ?? "";
  }
  const resp = await fetch(`${FB_API}/${pageId}/${endpoint}`, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams(params),
  });
  if (!resp.ok) return { ok: false, error: `Facebook ${endpoint} 실패(${resp.status}): ${(await resp.text()).slice(0, 200)}` };
  // photos → { id, post_id }, feed → { id }
  const data = (await resp.json()) as { id?: string; post_id?: string };
  return { ok: true, externalId: data.post_id ?? data.id };
}

// ── 채널별 공식 한도(초과분은 발행 전 절단 — 플랫폼이 400으로 전체 거부하는 것보다 낫다) ──
// Bluesky lexicon app.bsky.feed.post: text maxGraphemes=300, maxLength(UTF-8)=3000 /
//   이미지 개당 1,000,000바이트 (https://docs.bsky.app/docs/advanced-guides/posts)
// Telegram sendMessage text=1-4096자, sendPhoto caption=0-1024자 (https://core.telegram.org/bots/api)
// Discord Execute Webhook content ≤2000자 (https://docs.discord.com/developers/resources/webhook)
// Slack section block text ≤3000자 (https://docs.slack.dev/reference/block-kit/blocks/section-block)
const REQUEST_TIMEOUT_MS = 15_000;
const BLUESKY_MAX_GRAPHEMES = CHANNEL_TEXT_LIMITS.bluesky;
const BLUESKY_MAX_TEXT_BYTES = 3000;
const BLUESKY_MAX_IMAGE_BYTES = 1_000_000;
const TELEGRAM_MAX_TEXT = CHANNEL_TEXT_LIMITS.telegram;
const TELEGRAM_MAX_CAPTION = CHANNEL_TEXT_LIMITS.telegramCaption;
const DISCORD_MAX_CONTENT = CHANNEL_TEXT_LIMITS.discord;
const SLACK_MAX_SECTION_TEXT = CHANNEL_TEXT_LIMITS.slack;

// "문자" 셈법이 코드포인트인지 UTF-16 단위인지 플랫폼 문서에 명시가 없어 둘 다 max 이하로
// 절단한다(서로게이트 쌍을 쪼개지 않음).
export function truncateChars(text: string, max: number): string {
  let out = "";
  let units = 0;
  let count = 0;
  for (const cp of text ?? "") {
    if (count >= max || units + cp.length > max) break;
    out += cp;
    units += cp.length;
    count++;
  }
  return out;
}

// 자소(grapheme) 단위 절단 — Bluesky는 자소·UTF-8바이트 이중 한도(lexicon). ZWJ 이모지처럼
// 다바이트 자소가 많으면 바이트 한도가 먼저 걸린다. 자소를 중간에서 쪼개지 않는다.
export function truncateGraphemes(text: string, maxGraphemes: number, maxBytes: number): string {
  const enc = new TextEncoder();
  const seg = new Intl.Segmenter(undefined, { granularity: "grapheme" });
  let out = "";
  let bytes = 0;
  let count = 0;
  for (const { segment } of seg.segment(text ?? "")) {
    const b = enc.encode(segment).length;
    if (count >= maxGraphemes || bytes + b > maxBytes) break;
    out += segment;
    bytes += b;
    count++;
  }
  return out;
}

// ── credential/webhook 방식 4채널(OAuth 앱 등록 불필요) ────────────────────────
// cred 저장 위치: channel-config bridge(toIntegration)가 integrations.secret_enc(=token)
// + meta에 적재 → getChannelCred의 범용 분기(`if (row.token) return {...}`)가 그대로 반환.
//   bluesky : token=appPassword,  meta.handle
//   telegram: token=botToken,     meta.chatId
//   discord : token=webhookUrl,   meta 없음
//   slack   : token=webhookUrl,   meta 없음

// SSRF 가드 2단계(host identity) — 서버가 직접 fetch하는 image_url은 isSafePublicImageUrl(사설
// 리터럴 lexical 차단)만으론 부족하다: 공개 hostname이 fetch 시점에 사설/메타데이터 IP로 resolve되는
// DNS rebinding은 파싱 단계에서 안 보인다. 그래서 "운영자가 명시적으로 신뢰하는 정확한 호스트명"만
// 허용하는 exact-host allowlist를 별도로 둔다. 조건(모두 만족):
//   https 스킴 · userinfo 없음(https://user:pass@host 형태 차단) · 기본 443 포트만(명시 비표준 포트 거부) ·
//   hostname이 allowlist에 "정확히" 일치(wildcard/suffix 매칭 없음 — evil-example.com.attacker.tld 류 우회 차단).
// allowlist 구성 = OSMU_PUBLIC_URL의 hostname(자동, 배포가 스스로를 신뢰) + OSMU_PUBLISH_IMAGE_HOSTS
// (쉼표구분 exact hostname, 운영자가 명시 추가하는 CDN/자산 호스트). 둘 다 없으면 allowlist가 비어
// 있어 모든 이미지 fetch가 스킵되고 텍스트만 발행된다(fail-closed).
// 출처: OWASP SSRF Prevention Cheat Sheet(https://cheatsheetseries.owasp.org/cheatsheets/Server_Side_Request_Forgery_Prevention_Cheat_Sheet.html)
//   — allowlist를 denylist보다 우선하라는 권고, redirect 비활성(아래 fetch의 redirect:"manual"과 결합) (2026-07 조사)
function serverFetchImageAllowlist(): Set<string> {
  const hosts = new Set<string>();
  const pub = process.env.OSMU_PUBLIC_URL;
  if (pub) {
    try { hosts.add(new URL(pub).hostname.toLowerCase()); } catch { /* 잘못된 OSMU_PUBLIC_URL — 무시 */ }
  }
  const extra = process.env.OSMU_PUBLISH_IMAGE_HOSTS;
  if (extra) {
    for (const raw of extra.split(",")) {
      const h = raw.trim().toLowerCase();
      if (h) hosts.add(h);
    }
  }
  return hosts;
}

export function isAllowedServerFetchImageHost(raw: string): boolean {
  let u: URL;
  try { u = new URL(raw); } catch { return false; }
  if (u.protocol !== "https:") return false;
  if (u.username || u.password) return false;
  // WHATWG URL은 스킴 기본 포트(https=443)를 명시해도 u.port를 빈 문자열로 정규화한다 —
  // 그래서 u.port !== "" 는 "443이 아닌 포트를 명시"한 경우만 걸러낸다.
  if (u.port !== "") return false;
  return serverFetchImageAllowlist().has(u.hostname.toLowerCase());
}

// 스트리밍 body 읽기(메모리 DoS 방지) — response.arrayBuffer()로 전체를 먼저 메모리에 올린 뒤 크기를
// 검사하면, 공격자가 매우 큰(또는 무한) body를 흘려보내는 것만으로 서버 메모리를 소진시킬 수 있다.
// 대신 reader로 청크 단위 누적하며 합계가 maxBytes를 넘는 "즉시" reader.cancel()하고 스킵한다.
// 출처: MDN Streams API "Using readable streams"(getReader/read/cancel),
//       WHATWG Streams Standard(https://streams.spec.whatwg.org/) (2026-07 조사)
// 반환 타입을 Uint8Array<ArrayBuffer>로 명시(TS 5.7+ typed array 제네릭화) — bare `Uint8Array`는
// 기본 제네릭이 ArrayBufferLike라 fetch()의 BodyInit(Uint8Array<ArrayBuffer> 요구)에 그대로 넘길 수
// 없다. 실제 `new Uint8Array(total)`은 항상 새 ArrayBuffer를 할당하므로 이 타입이 실체와 일치한다.
async function readBodyWithLimit(body: ReadableStream<Uint8Array>, maxBytes: number): Promise<Uint8Array<ArrayBuffer> | null> {
  const reader = body.getReader();
  const chunks: Uint8Array[] = [];
  let total = 0;
  try {
    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;
      if (!value) continue;
      total += value.byteLength;
      if (total > maxBytes) {
        await reader.cancel();
        return null;
      }
      chunks.push(value);
    }
  } finally {
    try { reader.releaseLock(); } catch { /* cancel 경로에서 이미 해제됐을 수 있음 — 무해 */ }
  }
  const out = new Uint8Array(total);
  let offset = 0;
  for (const c of chunks) { out.set(c, offset); offset += c.byteLength; }
  return out;
}

// Bluesky 발행 (AT Protocol). createSession(handle+appPassword→accessJwt+did) →
// (이미지 있으면 uploadBlob) → createRecord(app.bsky.feed.post).
// 출처: https://docs.bsky.app/docs/api/com-atproto-repo-create-record ,
//       https://docs.bsky.app/docs/tutorials/creating-a-post (2026-07 조사)
export async function publishBluesky(cred: ChannelCred, text: string, imageUrl?: string): Promise<PublishResult> {
  const handle = typeof cred.meta?.handle === "string" ? cred.meta.handle : "";
  const appPassword = cred.token;
  if (!handle) return { ok: false, error: "Bluesky handle(meta.handle) 없음" };
  if (!appPassword) return { ok: false, error: "Bluesky App Password 없음" };

  try {
    const session = await fetch(`${BLUESKY_API}/com.atproto.server.createSession`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ identifier: handle, password: appPassword }),
      signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
    });
    if (!session.ok) return { ok: false, error: `Bluesky 세션 실패(${session.status}): ${(await session.text()).slice(0, 200)}` };
    const { accessJwt, did } = (await session.json()) as { accessJwt: string; did: string };

    // 이미지 첨부는 선택 — 실패해도 텍스트 발행은 계속 진행(관찰 가능한 부분 실패로 둔다).
    // SSRF: 이 경로만 서버가 직접 image_url을 fetch한다. 2단 가드 — (1) isSafePublicImageUrl:
    // 사설/루프백/링크로컬/메타데이터 IP 리터럴 lexical 차단. (2) isAllowedServerFetchImageHost:
    // 운영자 제어 exact-host allowlist(https+기본포트+userinfo없음+hostname 정확일치) — 공개 hostname
    // DNS rebinding은 (1)만으론 못 막으므로 allowlist가 실질 방어선이다. allowlist 비어있거나 불일치면
    // 이미지 fetch/업로드를 통째로 스킵하고 텍스트만 발행(fail-closed).
    // redirect:"manual" — 공개 URL이 내부망으로 302 리다이렉트해 가드를 우회하는 것도 차단(3xx=스킵).
    let embed: Record<string, unknown> | undefined;
    if (imageUrl && isSafePublicImageUrl(imageUrl) && isAllowedServerFetchImageHost(imageUrl)) {
      try {
        const imgResp = await fetch(imageUrl, { redirect: "manual", signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS) });
        const contentType = imgResp.headers.get("content-type") || "";
        if (imgResp.ok && contentType.startsWith("image/") && imgResp.body) {
          // Content-Length 선차단 — 명시돼 있고 한도 초과면 body를 아예 읽지 않는다(메모리 DoS 방지,
          // 스트리밍 누적 검사보다도 앞서 최단경로로 스킵).
          const clHeader = imgResp.headers.get("content-length");
          const declaredLen = clHeader != null ? Number(clHeader) : NaN;
          const overDeclared = Number.isFinite(declaredLen) && declaredLen > BLUESKY_MAX_IMAGE_BYTES;
          if (!overDeclared) {
            // Content-Length 없거나(청크 전송) 선언값이 한도 이내 — 실제 스트리밍하며 누적 검사.
            // 합계가 개당 1,000,000바이트(공식 한도)를 넘는 즉시 reader.cancel() 후 스킵.
            const bytes = await readBodyWithLimit(imgResp.body, BLUESKY_MAX_IMAGE_BYTES);
            if (bytes) {
              const upload = await fetch(`${BLUESKY_API}/com.atproto.repo.uploadBlob`, {
                method: "POST",
                headers: { Authorization: `Bearer ${accessJwt}`, "Content-Type": contentType },
                body: bytes,
                signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
              });
              if (upload.ok) {
                const { blob } = (await upload.json()) as { blob: unknown };
                embed = { $type: "app.bsky.embed.images", images: [{ image: blob, alt: "" }] };
              }
            }
          }
        }
      } catch { /* 이미지 업로드 실패 무시 — 텍스트만 발행 */ }
    }

    const body = truncateGraphemes(text, BLUESKY_MAX_GRAPHEMES, BLUESKY_MAX_TEXT_BYTES);
    const record: Record<string, unknown> = { $type: "app.bsky.feed.post", text: body, createdAt: new Date().toISOString() };
    if (embed) record.embed = embed;

    const create = await fetch(`${BLUESKY_API}/com.atproto.repo.createRecord`, {
      method: "POST",
      headers: { Authorization: `Bearer ${accessJwt}`, "Content-Type": "application/json" },
      body: JSON.stringify({ repo: did, collection: "app.bsky.feed.post", record }),
      signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
    });
    if (!create.ok) return { ok: false, error: `Bluesky 게시 실패(${create.status}): ${(await create.text()).slice(0, 200)}` };
    const { uri } = (await create.json()) as { uri: string };
    const rkey = uri?.split("/").pop();
    const permalink = rkey ? `https://bsky.app/profile/${handle}/post/${rkey}` : undefined;
    return { ok: true, externalId: uri, permalink };
  } catch (e) {
    // 타임아웃(AbortSignal)·네트워크 오류를 PublishResult 계약으로 강등 — 호출부(직접 발행 route)가 500 나지 않게.
    return { ok: false, error: `Bluesky 요청 실패: ${e instanceof Error ? e.message : String(e)}` };
  }
}

// Telegram 발행 (Bot API). 이미지 없으면 sendMessage(text), 있으면 sendPhoto(photo=imageUrl, caption=text).
// chat_id는 meta.chatId(Settings에서 선택 입력) — 없으면 발행 대상 불명이라 명확히 에러.
// 출처: https://core.telegram.org/bots/api#sendmessage , #sendphoto (2026-07 조사)
export async function publishTelegram(cred: ChannelCred, text: string, imageUrl?: string): Promise<PublishResult> {
  const token = cred.token;
  const chatIdRaw = cred.meta?.chatId;
  const chatId = typeof chatIdRaw === "string" || typeof chatIdRaw === "number" ? String(chatIdRaw) : "";
  if (!token) return { ok: false, error: "Telegram Bot Token 없음" };
  if (!chatId) return { ok: false, error: "Telegram Chat ID(meta.chatId) 없음 — Settings에서 입력 필요" };

  // 공식 한도: sendMessage text 4096자 / sendPhoto caption 1024자 — 초과 시 400 거부라 절단.
  // photo=URL은 텔레그램이 서버측에서 다운로드(5MB·가로+세로 10000 한도도 그쪽에서 검증) — 우리 표면 아님.
  const method = imageUrl ? "sendPhoto" : "sendMessage";
  const body: Record<string, string> = imageUrl
    ? { chat_id: chatId, photo: imageUrl, caption: truncateChars(text ?? "", TELEGRAM_MAX_CAPTION) }
    : { chat_id: chatId, text: truncateChars(text ?? "", TELEGRAM_MAX_TEXT) };

  try {
    const resp = await fetch(`${TELEGRAM_API}/bot${token}/${method}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
      signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
    });
    const data = (await resp.json().catch(() => ({}))) as { ok?: boolean; description?: string; result?: { message_id?: number } };
    if (!resp.ok || !data.ok) {
      return { ok: false, error: `Telegram ${method} 실패(${resp.status}): ${(data.description ?? "unknown error").slice(0, 180)}` };
    }
    return { ok: true, externalId: data.result?.message_id != null ? String(data.result.message_id) : undefined };
  } catch (e) {
    return { ok: false, error: `Telegram 요청 실패: ${e instanceof Error ? e.message : String(e)}` };
  }
}

// webhook cred 사용처 재검증 — 저장 시 verify-channel이 prefix를 검사하지만, 같은 integrations
// 행(kind=channel,label=slack)을 OAuth 연결 콜백이 access token으로 덮어쓸 수 있다(connect/callback).
// 비-URL/딴 호스트 secret을 서버가 fetch하지 않게(크래시·SSRF 방지) 발행 직전 호스트를 고정한다.
function isAllowedWebhookUrl(raw: string, host: string, pathPrefix: string): boolean {
  let u: URL;
  try { u = new URL(raw); } catch { return false; }
  return u.protocol === "https:" && u.hostname.toLowerCase() === host && u.pathname.startsWith(pathPrefix);
}

// Discord 발행 (Incoming Webhook). ?wait=true로 생성된 메시지 객체(id)를 응답받는다(기본은 204 No Content).
// 이미지는 embeds[0].image.url로 첨부(별도 업로드 불필요 — 공개 URL 참조 방식).
// 출처: https://discord.com/developers/docs/resources/webhook#execute-webhook (2026-07 조사)
export async function publishDiscord(cred: ChannelCred, text: string, imageUrl?: string): Promise<PublishResult> {
  const webhookUrl = cred.token;
  if (!webhookUrl) return { ok: false, error: "Discord Webhook URL 없음" };
  if (!isAllowedWebhookUrl(webhookUrl, "discord.com", "/api/webhooks/")) {
    return { ok: false, error: "Discord Webhook URL 형식 아님 — Settings에서 https://discord.com/api/webhooks/... 재등록 필요" };
  }

  // 공식 한도: content 2000자("up to 2000 characters") — 초과 시 400 거부라 절단. embeds는 최대 10개(여기선 1개).
  const body: Record<string, unknown> = { content: truncateChars(text ?? "", DISCORD_MAX_CONTENT) };
  if (imageUrl) body.embeds = [{ image: { url: imageUrl } }];

  const sep = webhookUrl.includes("?") ? "&" : "?";
  try {
    const resp = await fetch(`${webhookUrl}${sep}wait=true`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
      signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
    });
    if (!resp.ok) return { ok: false, error: `Discord webhook 실패(${resp.status}): ${(await resp.text()).slice(0, 200)}` };
    const data = (await resp.json().catch(() => ({}))) as { id?: string };
    return { ok: true, externalId: data.id };
  } catch (e) {
    return { ok: false, error: `Discord 요청 실패: ${e instanceof Error ? e.message : String(e)}` };
  }
}

// Slack 발행 (Incoming Webhook). text + 선택 image(blocks의 image 블록). 응답은 JSON이 아니라
// 평문 "ok"라 externalId/permalink는 제공되지 않는다(Slack Incoming Webhook 사양).
// 출처: https://docs.slack.dev/messaging/sending-messages-using-incoming-webhooks/ (2026-07 조사)
export async function publishSlack(cred: ChannelCred, text: string, imageUrl?: string): Promise<PublishResult> {
  const webhookUrl = cred.token;
  if (!webhookUrl) return { ok: false, error: "Slack Webhook URL 없음" };
  // 이번 출시는 Incoming Webhook만 정직하게 지원(OAuth 앱/xoxb 봇 토큰 미지원) — ChannelConnect가
  // Slack을 더 이상 OAUTH_LABELS에 노출하지 않지만, connect/[provider]/callback이 과거에 같은
  // integrations 행(kind=channel,label=slack)을 xoxb 액세스 토큰으로 덮어썼을 수 있으므로 호스트뿐
  // 아니라 저장 시점에 channel-config bridge가 찍은 meta.api==="slack_webhook"까지 요구해 OAuth
  // 토큰/행을 명확히 거부한다(방식 충돌 = 조용한 오발행이 아니라 즉시 에러).
  if (cred.meta?.api !== "slack_webhook") {
    return { ok: false, error: "Slack은 Incoming Webhook만 지원 — OAuth 연결 토큰으로는 발행 불가, Settings에서 https://hooks.slack.com/... webhook 재등록 필요" };
  }
  if (!isAllowedWebhookUrl(webhookUrl, "hooks.slack.com", "/")) {
    return { ok: false, error: "Slack Webhook URL 형식 아님 — OAuth 연결 토큰으로는 발행 불가, Settings에서 https://hooks.slack.com/... webhook 재등록 필요" };
  }

  const body: Record<string, unknown> = { text: text ?? "" };
  if (imageUrl) {
    // section 블록 text 공식 한도 3000자 — 초과 시 invalid_blocks로 전체 거부라 절단(top-level text는 명시 한도 없음).
    body.blocks = [
      { type: "section", text: { type: "mrkdwn", text: truncateChars(text, SLACK_MAX_SECTION_TEXT) || " " } },
      { type: "image", image_url: imageUrl, alt_text: "attached image" },
    ];
  }

  try {
    const resp = await fetch(webhookUrl, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
      signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
    });
    if (!resp.ok) return { ok: false, error: `Slack webhook 실패(${resp.status}): ${(await resp.text()).slice(0, 200)}` };
    return { ok: true };
  } catch (e) {
    return { ok: false, error: `Slack 요청 실패: ${e instanceof Error ? e.message : String(e)}` };
  }
}
