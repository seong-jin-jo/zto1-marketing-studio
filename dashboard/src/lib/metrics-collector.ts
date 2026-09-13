import { db, withTenant } from "@/lib/db";
import { readJson, writeJson, dataPath } from "@/lib/file-io";
import { runWithTenant } from "@/lib/tenant-context";
import {
  fetchMetaPostMetrics,
  fetchXPublicMetrics,
  fetchYouTubeMetrics,
  getChannelCred,
  type ChannelCred,
} from "@/lib/publish";
import { fetchTikTokVideoMetrics } from "@/lib/tiktok";

const THREADS_API = "https://graph.threads.net/v1.0";
const PROVIDER_CONCURRENCY = 3;
const METRICS_FRESHNESS_MINUTES = 5;

/**
 * 방금 올린 글은 채널이 목록에 올리기까지 시간이 걸린다. 그 사이의 실패는 계정 문제가
 * 아니라 집계 대기다.
 *
 * 2026-09-14 실계정 관측(session-state.osmu.md 07시 34분): 발행 직후 수집은
 * `updated 6 / total 7 / failed 1` 로 방금 올린 그 글만 실패했고, 약 한 시간 뒤 같은 계정
 * 같은 토큰으로 다시 돌린 수집은 `updated 7 / total 8` 로 그 글을 정상 집계했다. 계정은
 * 그대로였고 달라진 것은 시간뿐이다.
 *
 * Threads API 는 집계 반영 지연의 상한을 문서로 약속하지 않는다. 그래서 관측된 지연
 * (한 시간 안)을 그대로 유예로 쓴다. 유예를 짧게 잡으면 정상적인 시간차를 계정 오류로
 * 오진하고, 사용자는 멀쩡한 채널을 끊고 다시 연결한다. 그 오진이 이 상수의 존재 이유다.
 */
export const METRICS_INGEST_GRACE_MINUTES = 60;

/**
 * 계정 목록을 되짚어 볼 최대 분량. limit 25 한 장만 보던 때는 글이 25편을 넘는 순간
 * 옛 글이 목록에서 밀려 같은 오진이 났다. 끝까지 못 봤으면 "계정에 없다" 가 아니라
 * "확인하지 못했다" 라고 말한다.
 */
const THREADS_LIST_PAGE_SIZE = 100;
const THREADS_LIST_MAX_PAGES = 5;

const testMetricsLeases = new Set<string>();

type Platform = "threads" | "x" | "instagram" | "instagram_reels" | "facebook" | "youtube" | "tiktok";
type Target = { id: string; external_id: string; published_at?: string | Date | null };
type MetricPatch = {
  id: string;
  views?: number;
  likes?: number;
  replies?: number;
  reposts?: number;
  blockedCode?: string;
};

export interface MetricsCollectionResult {
  ok: boolean;
  updated: number;
  total: number;
  failed: number;
  partial: boolean;
  collectionBlocked: boolean;
  failures: Array<{ channel: string; code: string; count: number }>;
  reason?: string;
}

async function runLimited(tasks: Array<() => Promise<void>>, concurrency: number): Promise<void> {
  let cursor = 0;
  await Promise.all(Array.from({ length: Math.min(concurrency, tasks.length) }, async () => {
    while (cursor < tasks.length) {
      const task = tasks[cursor++];
      await task();
    }
  }));
}

function markAnalyticsViewed(tenantId: string): void {
  try {
    runWithTenant(tenantId, () => {
      const settings = readJson<Record<string, unknown>>(dataPath("settings.json")) || {};
      if (settings.analyticsViewed !== true) {
        settings.analyticsViewed = true;
        writeJson(dataPath("settings.json"), settings);
      }
    });
  } catch {
    // 분석 확인 표시는 성과 저장 성공을 뒤집지 않는다.
  }
}

function failureReason(codes: string[]): string {
  if (codes.includes("collection_in_progress")) return "이 작업 공간의 성과를 이미 수집하고 있습니다. 잠시 뒤 다시 확인해주세요.";
  if (codes.some((code) => code.endsWith("_429") || code === "provider_429")) return "채널 요청 한도에 도달해 일부 성과를 읽지 못했습니다. 잠시 뒤 다시 시도해주세요.";
  if (codes.some((code) => /_(5\d\d)$/.test(code) || /^provider_5\d\d$/.test(code))) return "채널 서비스 오류로 일부 성과를 읽지 못했습니다. 잠시 뒤 다시 시도해주세요.";
  if (codes.includes("exception")) return "성과 조회 중 오류가 났습니다. 잠시 후 다시 시도해 주세요.";
  // 진짜 계정 불일치일 때만 재연결을 말한다. 사용자에게 하지 않아도 될 일을 시키지 않는다.
  if (codes.includes("post_not_in_account")) {
    // 대기 중인 글이 섞여 있으면 그 글까지 계정 문제로 읽히지 않게 함께 말한다.
    const waiting = codes.includes("metrics_pending_ingest") ? " 방금 올린 글은 집계를 기다리는 중이니 그대로 두셔도 됩니다." : "";
    return `일부 글이 연결된 채널 계정에 없습니다. 다른 계정으로 올린 글이라면 그 계정으로 다시 연결해 주세요.${waiting}`;
  }
  if (codes.includes("metrics_lookup_incomplete")) return "채널 목록을 끝까지 확인하지 못해 성과를 읽지 못했습니다. 잠시 뒤 다시 시도해 주세요. 채널을 다시 연결할 필요는 없습니다.";
  if (codes.includes("metrics_pending_ingest")) return "방금 올린 글은 채널이 집계하는 데 시간이 걸립니다. 한 시간쯤 뒤에 성과가 채워집니다. 채널을 다시 연결할 필요는 없습니다.";
  if (codes.includes("video_not_visible")) return "연결된 채널 계정에서 영상을 찾을 수 없습니다. 공개 상태와 발행 계정을 확인해 주세요.";
  if (codes.includes("insights_forbidden")) return "게시물은 확인되지만 성과 조회 권한이 없습니다. 채널을 다시 연결해 권한을 허용해 주세요.";
  return `일부 채널이 성과 조회를 거절했습니다. 응답: ${codes[0] || "알 수 없음"}`;
}

async function loadTargets(tenantId: string): Promise<Record<Platform, Target[]>> {
  return withTenant(tenantId, async (sql) => ({
    threads: await sql<Target[]>`SELECT id, external_id, published_at FROM published_posts WHERE tenant_id = ${tenantId} AND platform = 'threads' AND external_id IS NOT NULL AND (metrics_at IS NULL OR metrics_at < now() - (${METRICS_FRESHNESS_MINUTES} * interval '1 minute'))`,
    x: await sql<Target[]>`SELECT id, external_id, published_at FROM published_posts WHERE tenant_id = ${tenantId} AND platform = 'x' AND external_id IS NOT NULL AND (metrics_at IS NULL OR metrics_at < now() - (${METRICS_FRESHNESS_MINUTES} * interval '1 minute'))`,
    instagram: await sql<Target[]>`SELECT id, external_id, published_at FROM published_posts WHERE tenant_id = ${tenantId} AND platform = 'instagram' AND external_id IS NOT NULL AND (metrics_at IS NULL OR metrics_at < now() - (${METRICS_FRESHNESS_MINUTES} * interval '1 minute'))`,
    instagram_reels: await sql<Target[]>`SELECT id, external_id, published_at FROM published_posts WHERE tenant_id = ${tenantId} AND platform IN ('instagram_reels', 'reels') AND external_id IS NOT NULL AND (metrics_at IS NULL OR metrics_at < now() - (${METRICS_FRESHNESS_MINUTES} * interval '1 minute'))`,
    facebook: await sql<Target[]>`SELECT id, external_id, published_at FROM published_posts WHERE tenant_id = ${tenantId} AND platform = 'facebook' AND external_id IS NOT NULL AND (metrics_at IS NULL OR metrics_at < now() - (${METRICS_FRESHNESS_MINUTES} * interval '1 minute'))`,
    youtube: await sql<Target[]>`SELECT id, external_id, published_at FROM published_posts WHERE tenant_id = ${tenantId} AND platform IN ('youtube', 'shorts') AND external_id IS NOT NULL AND (metrics_at IS NULL OR metrics_at < now() - (${METRICS_FRESHNESS_MINUTES} * interval '1 minute'))`,
    tiktok: await sql<Target[]>`SELECT id, external_id, published_at FROM published_posts WHERE tenant_id = ${tenantId} AND platform = 'tiktok' AND external_id IS NOT NULL AND (metrics_at IS NULL OR metrics_at < now() - (${METRICS_FRESHNESS_MINUTES} * interval '1 minute'))`,
  }));
}

async function acquireMetricsLease(tenantId: string): Promise<(() => Promise<void>) | null> {
  if (process.env.NODE_ENV === "test") {
    if (testMetricsLeases.has(tenantId)) return null;
    testMetricsLeases.add(tenantId);
    return async () => { testMetricsLeases.delete(tenantId); };
  }

  const reserved = await db().reserve();
  const lockKey = `metrics:${tenantId}`;
  try {
    const [row] = await reserved<{ locked: boolean }[]>`
      SELECT pg_try_advisory_lock(hashtextextended(${lockKey}, 0)) AS locked
    `;
    if (!row?.locked) {
      reserved.release();
      return null;
    }
    return async () => {
      try {
        await reserved`SELECT pg_advisory_unlock(hashtextextended(${lockKey}, 0))`;
      } finally {
        reserved.release();
      }
    };
  } catch (error) {
    reserved.release();
    throw error;
  }
}

/** 발행 시각이 유예 안이면 아직 집계 전이다. 시각을 모르면 단정하지 않는다(=false). */
export function isWithinIngestGrace(publishedAt: string | Date | null | undefined, now: number = Date.now()): boolean {
  if (!publishedAt) return false;
  const published = publishedAt instanceof Date ? publishedAt.getTime() : Date.parse(publishedAt);
  if (!Number.isFinite(published)) return false;
  const window = METRICS_INGEST_GRACE_MINUTES * 60_000;
  const age = now - published;
  // 살짝 미래인 시각(시계 어긋남)도 "방금 올린 글" 로 본다. 계정 오류로 단정하는 쪽이 더
  // 비싸다. 다만 한없이 미래인 시각까지 받아 주면 잘못 저장된 시각 하나가 영원히 "집계
  // 대기" 로 남는다. 그래서 앞뒤로 같은 폭만 연다.
  return age < window && age > -window;
}

type ThreadsListVerdict = "found" | "absent" | "incomplete";

/** 토큰을 실어 보낼 주소인지 본다. 문자열 앞글자가 아니라 파싱한 origin 으로 판정한다. */
function isThreadsApiUrl(candidate: unknown): candidate is string {
  if (typeof candidate !== "string" || candidate.length === 0) return false;
  try {
    const url = new URL(candidate);
    const base = new URL(THREADS_API);
    return url.protocol === "https:" && url.host === base.host && url.pathname.startsWith(base.pathname);
  } catch {
    return false;
  }
}

/**
 * 계정 글 목록을 되짚어 그 글이 정말 이 계정에 없는지 본다.
 *
 * 목록은 최신순이다. 그러므로 대상 글의 발행 시각보다 오래된 글까지 봤는데도 안 나왔으면
 * 그 글은 이 계정에 없는 것이다(=absent). 반대로 다음 쪽이 남았는데 거기까지 못 갔으면
 * "없다" 가 아니라 "확인 못 했다"(=incomplete) 다. 전에는 첫 25편만 보고 없으면 곧장
 * 계정 불일치로 단정했고, 글이 25편을 넘는 계정은 옛 글마다 오진이 났다.
 */
async function lookupThreadsPost(
  cred: ChannelCred,
  externalId: string,
  publishedAt: string | Date | null | undefined,
): Promise<ThreadsListVerdict> {
  const publishedMs = publishedAt
    ? (publishedAt instanceof Date ? publishedAt.getTime() : Date.parse(publishedAt))
    : Number.NaN;
  let url = `${THREADS_API}/me/threads?fields=id,timestamp&limit=${THREADS_LIST_PAGE_SIZE}&access_token=${cred.token}`;

  for (let page = 0; page < THREADS_LIST_MAX_PAGES; page += 1) {
    // 목록 한 쪽이 멈추면 수집 전체가 끝나지 않는다. 기다릴 상한을 건다.
    const response = await fetch(url, { signal: AbortSignal.timeout(8000) });
    if (!response.ok) return "incomplete";
    const payload = await response.json() as {
      data?: Array<{ id?: string; timestamp?: string }>;
      paging?: { next?: string; cursors?: { after?: string } };
    };
    const rows = payload.data || [];
    if (rows.some((item) => item.id === externalId)) return "found";

    // 이 쪽의 마지막 글이 대상보다 오래됐다면 목록은 그 글을 지나쳤다. 즉 계정에 없다.
    //
    // 중간의 아무 글이나 보고 판정하면 안 된다. 고정 글(pinned)처럼 오래된 글이 목록 앞에
    // 끼어 있으면, 대상 글이 뒤쪽에 멀쩡히 있는데도 "지나쳤다" 로 읽힌다. 목록의 꼬리만
    // 본다.
    const tail = rows[rows.length - 1];
    const tailAt = tail?.timestamp ? Date.parse(tail.timestamp) : Number.NaN;
    if (Number.isFinite(publishedMs) && Number.isFinite(tailAt) && tailAt < publishedMs) return "absent";

    // paging.next 는 공급자가 준 URL 이고 우리 토큰이 실려 나간다. 주소를 실제로 파싱해
    // 우리가 아는 곳일 때만 따라간다. 다음 쪽이 있다는데 따라갈 수 없으면 "다 봤다" 가
    // 아니라 "확인 못 했다" 다.
    const rawNext = payload.paging?.next;
    const advertised = isThreadsApiUrl(rawNext) ? rawNext : undefined;
    if (typeof rawNext === "string" && rawNext.length > 0 && !advertised) return "incomplete";
    const next = advertised
      ?? (payload.paging?.cursors?.after
        ? `${THREADS_API}/me/threads?fields=id,timestamp&limit=${THREADS_LIST_PAGE_SIZE}&after=${payload.paging.cursors.after}&access_token=${cred.token}`
        : null);
    // 다음 쪽이 없으면 계정 전체를 다 본 것이다. 그때만 "없다" 로 단정한다.
    if (!next) return "absent";
    url = next;
  }
  return "incomplete";
}

async function classifyThreadsFailure(
  cred: ChannelCred,
  externalId: string,
  status: number,
  publishedAt?: string | Date | null,
): Promise<string> {
  // 한도 초과와 채널 장애는 계정 문제가 아니다. 원래 응답이 그렇게 말하고 있으면 계정을
  // 의심하는 판정으로 넘어가지 않는다. 넘어가면 잠깐의 장애가 재연결 안내로 둔갑한다.
  if (status === 429 || status >= 500) return `provider_${status}`;

  try {
    const basic = await fetch(`${THREADS_API}/${externalId}?fields=id&access_token=${cred.token}`, {
      signal: AbortSignal.timeout(8000),
    });
    if (basic.ok) return "insights_forbidden";

    // 방금 올린 글이면 목록에 없는 것이 정상이다. 계정을 의심하기 전에 시간을 본다.
    if (isWithinIngestGrace(publishedAt)) return "metrics_pending_ingest";

    const verdict = await lookupThreadsPost(cred, externalId, publishedAt);
    if (verdict === "absent") return "post_not_in_account";
    if (verdict === "incomplete") return "metrics_lookup_incomplete";
  } catch {
    return "exception";
  }
  return `provider_${status}`;
}

export async function collectMetrics(tenantId: string): Promise<MetricsCollectionResult | null> {
  const releaseLease = await acquireMetricsLease(tenantId);
  if (!releaseLease) {
    return {
      ok: false,
      updated: 0,
      total: 0,
      failed: 0,
      partial: false,
      collectionBlocked: true,
      failures: [{ channel: "system", code: "collection_in_progress", count: 1 }],
      reason: "이 작업 공간의 성과를 이미 수집하고 있습니다. 잠시 뒤 다시 확인해주세요.",
    };
  }
  try {
    return await collectMetricsWithLease(tenantId);
  } finally {
    await releaseLease();
  }
}

async function collectMetricsWithLease(tenantId: string): Promise<MetricsCollectionResult | null> {
  const [threadsCred, xCred, instagramCred, facebookCred, youtubeCred, tiktokCred] = await Promise.all([
    getChannelCred(tenantId, "threads"),
    getChannelCred(tenantId, "x"),
    getChannelCred(tenantId, "instagram"),
    getChannelCred(tenantId, "facebook"),
    getChannelCred(tenantId, "youtube"),
    getChannelCred(tenantId, "tiktok"),
  ]);
  if (!threadsCred && !xCred && !instagramCred && !facebookCred && !youtubeCred && !tiktokCred) return null;

  // 이 transaction은 대상만 읽고 즉시 연결을 돌려준다. 외부 I/O는 아래에서 수행한다.
  const targets = await loadTargets(tenantId);
  const patches: MetricPatch[] = [];
  const failureCodes: Array<{ channel: string; code: string }> = [];
  const tasks: Array<() => Promise<void>> = [];

  if (threadsCred) {
    for (const target of targets.threads) {
      tasks.push(async () => {
        try {
          const response = await fetch(`${THREADS_API}/${target.external_id}/insights?metric=views,likes,replies,reposts&access_token=${threadsCred.token}`);
          if (!response.ok) {
            const code = await classifyThreadsFailure(threadsCred, target.external_id, response.status, target.published_at);
            patches.push({ id: target.id, blockedCode: code });
            failureCodes.push({ channel: "threads", code });
            return;
          }
          const payload = await response.json() as { data?: Array<{ name: string; values?: Array<{ value?: number }> }> };
          const values: Record<string, number> = {};
          for (const item of payload.data || []) values[item.name] = Number(item.values?.[0]?.value ?? 0) || 0;
          patches.push({ id: target.id, views: values.views, likes: values.likes, replies: values.replies, reposts: values.reposts });
        } catch {
          patches.push({ id: target.id, blockedCode: "exception" });
          failureCodes.push({ channel: "threads", code: "exception" });
        }
      });
    }
  }

  if (xCred && targets.x.length > 0) tasks.push(async () => {
    const result = await fetchXPublicMetrics(xCred, targets.x.map((row) => row.external_id));
    const attempted = new Set(result.attemptedIds ?? []);
    const failed = new Set(result.failedIds ?? []);
    for (const row of targets.x) {
      const metric = result.metrics?.[row.external_id];
      if (metric) patches.push({ id: row.id, ...metric });
      else if (failed.has(row.external_id)) {
        const batch = result.failures?.find((failure) => failure.ids.includes(row.external_id));
        const code = batch?.code ?? `x_${!result.ok ? result.status || "error" : "error"}`;
        patches.push({ id: row.id, blockedCode: code });
        failureCodes.push({ channel: "x", code });
      } else if (attempted.has(row.external_id)) {
        // Threads 와 같은 오진이 여기에도 있었다. 방금 올린 글은 계정 불일치가 아니다.
        const code = isWithinIngestGrace(row.published_at) ? "metrics_pending_ingest" : "post_not_in_account";
        patches.push({ id: row.id, blockedCode: code });
        failureCodes.push({ channel: "x", code });
      } else if (!result.ok) {
        const code = `x_${result.status || "error"}`;
        patches.push({ id: row.id, blockedCode: code });
        failureCodes.push({ channel: "x", code });
      }
    }
  });

  for (const [platform, cred] of [
    ["instagram", instagramCred],
    ["instagram_reels", instagramCred],
    ["facebook", facebookCred],
  ] as const) {
    if (!cred || targets[platform].length === 0) continue;
    tasks.push(async () => {
      const result = await fetchMetaPostMetrics(cred, platform, targets[platform].map((row) => row.external_id));
      const attempted = new Set(result.attemptedIds ?? []);
      const failed = new Set(result.failedIds ?? []);
      for (const row of targets[platform]) {
        const metric = result.metrics?.[row.external_id];
        if (metric) patches.push({ id: row.id, ...metric });
        else if (failed.has(row.external_id)) {
          const code = result.failures?.find((failure) => failure.id === row.external_id)?.code
            ?? `${platform}_${!result.ok ? result.status || "error" : "error"}`;
          patches.push({ id: row.id, blockedCode: code });
          failureCodes.push({ channel: platform, code });
        } else if (attempted.has(row.external_id)) {
          patches.push({ id: row.id, blockedCode: "insights_forbidden" });
          failureCodes.push({ channel: platform, code: "insights_forbidden" });
        } else if (!result.ok) {
          const code = `${platform}_${result.status || "error"}`;
          patches.push({ id: row.id, blockedCode: code });
          failureCodes.push({ channel: platform, code });
        }
      }
    });
  }

  if (youtubeCred && targets.youtube.length > 0) tasks.push(async () => {
    const result = await fetchYouTubeMetrics(youtubeCred, targets.youtube.map((row) => row.external_id));
    const attempted = new Set(result.attemptedIds ?? []);
    const failed = new Set(result.failedIds ?? []);
    for (const row of targets.youtube) {
      const metric = result.metrics?.[row.external_id];
      if (metric) patches.push({ id: row.id, ...metric });
      else if (failed.has(row.external_id)) {
        const batch = result.failures?.find((failure) => failure.ids.includes(row.external_id));
        const code = batch?.code ?? `youtube_${!result.ok ? result.status || "error" : "error"}`;
        patches.push({ id: row.id, blockedCode: code });
        failureCodes.push({ channel: "youtube", code });
      } else if (attempted.has(row.external_id)) {
        patches.push({ id: row.id, blockedCode: "video_not_visible" });
        failureCodes.push({ channel: "youtube", code: "video_not_visible" });
      } else if (!result.ok) {
        const code = `youtube_${result.status || "error"}`;
        patches.push({ id: row.id, blockedCode: code });
        failureCodes.push({ channel: "youtube", code });
      }
    }
  });

  if (tiktokCred && targets.tiktok.length > 0) tasks.push(async () => {
    const result = await fetchTikTokVideoMetrics(tiktokCred.token, targets.tiktok.map((row) => row.external_id));
    if (!result.ok) {
      const code = result.status === 401 || result.status === 403 ? "insights_forbidden" : `tiktok_${result.status || "error"}`;
      for (const row of targets.tiktok) patches.push({ id: row.id, blockedCode: code });
      failureCodes.push({ channel: "tiktok", code });
      return;
    }
    for (const row of targets.tiktok) {
      const metric = result.metrics[row.external_id];
      if (metric) patches.push({ id: row.id, ...metric });
      else {
        patches.push({ id: row.id, blockedCode: "video_not_visible" });
        failureCodes.push({ channel: "tiktok", code: "video_not_visible" });
      }
    }
  });

  await runLimited(tasks, PROVIDER_CONCURRENCY);

  // 외부 호출이 모두 끝난 뒤 결과만 짧은 transaction으로 반영한다.
  if (patches.length > 0) await withTenant(tenantId, async (sql) => {
    for (const patch of patches) {
      if (patch.blockedCode) {
        await sql`UPDATE published_posts SET provider_meta = COALESCE(provider_meta, '{}'::jsonb) || ${sql.json({ metricsBlocked: { code: patch.blockedCode, at: new Date().toISOString() } } as never)} WHERE tenant_id = ${tenantId} AND id = ${patch.id}`;
      } else {
        await sql`UPDATE published_posts SET views = ${patch.views ?? 0}, likes = ${patch.likes ?? 0}, replies = ${patch.replies ?? 0}, reposts = ${patch.reposts ?? 0}, metrics_at = now(), provider_meta = COALESCE(provider_meta, '{}'::jsonb) - 'metricsBlocked' WHERE tenant_id = ${tenantId} AND id = ${patch.id}`;
      }
    }
  });

  markAnalyticsViewed(tenantId);
  const total = Object.values(targets).reduce((sum, rows) => sum + rows.length, 0);
  const updated = patches.filter((patch) => !patch.blockedCode).length;
  const failed = Math.max(0, total - updated);
  const counts = new Map<string, number>();
  for (const failure of failureCodes) {
    const key = `${failure.channel}\n${failure.code}`;
    counts.set(key, (counts.get(key) || 0) + 1);
  }
  const failures = [...counts.entries()].map(([key, count]) => {
    const [channel, code] = key.split("\n");
    return { channel, code, count };
  });
  const codes = failures.map((failure) => failure.code);
  return {
    ok: failed === 0,
    updated,
    total,
    failed,
    partial: updated > 0 && failed > 0,
    collectionBlocked: total > 0 && updated === 0,
    failures,
    ...(failed > 0 ? { reason: failureReason(codes) } : {}),
  };
}
