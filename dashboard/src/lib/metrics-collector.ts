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
const testMetricsLeases = new Set<string>();

type Platform = "threads" | "x" | "instagram" | "instagram_reels" | "facebook" | "youtube" | "tiktok";
type Target = { id: string; external_id: string };
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
  if (codes.includes("post_not_in_account")) return "연결된 채널 계정에서 게시물을 찾을 수 없습니다. 글을 올린 계정으로 다시 연결해 주세요.";
  if (codes.includes("video_not_visible")) return "연결된 채널 계정에서 영상을 찾을 수 없습니다. 공개 상태와 발행 계정을 확인해 주세요.";
  if (codes.includes("insights_forbidden")) return "게시물은 확인되지만 성과 조회 권한이 없습니다. 채널을 다시 연결해 권한을 허용해 주세요.";
  return `일부 채널이 성과 조회를 거절했습니다. 응답: ${codes[0] || "알 수 없음"}`;
}

async function loadTargets(tenantId: string): Promise<Record<Platform, Target[]>> {
  return withTenant(tenantId, async (sql) => ({
    threads: await sql<Target[]>`SELECT id, external_id FROM published_posts WHERE tenant_id = ${tenantId} AND platform = 'threads' AND external_id IS NOT NULL AND (metrics_at IS NULL OR metrics_at < now() - (${METRICS_FRESHNESS_MINUTES} * interval '1 minute'))`,
    x: await sql<Target[]>`SELECT id, external_id FROM published_posts WHERE tenant_id = ${tenantId} AND platform = 'x' AND external_id IS NOT NULL AND (metrics_at IS NULL OR metrics_at < now() - (${METRICS_FRESHNESS_MINUTES} * interval '1 minute'))`,
    instagram: await sql<Target[]>`SELECT id, external_id FROM published_posts WHERE tenant_id = ${tenantId} AND platform = 'instagram' AND external_id IS NOT NULL AND (metrics_at IS NULL OR metrics_at < now() - (${METRICS_FRESHNESS_MINUTES} * interval '1 minute'))`,
    instagram_reels: await sql<Target[]>`SELECT id, external_id FROM published_posts WHERE tenant_id = ${tenantId} AND platform IN ('instagram_reels', 'reels') AND external_id IS NOT NULL AND (metrics_at IS NULL OR metrics_at < now() - (${METRICS_FRESHNESS_MINUTES} * interval '1 minute'))`,
    facebook: await sql<Target[]>`SELECT id, external_id FROM published_posts WHERE tenant_id = ${tenantId} AND platform = 'facebook' AND external_id IS NOT NULL AND (metrics_at IS NULL OR metrics_at < now() - (${METRICS_FRESHNESS_MINUTES} * interval '1 minute'))`,
    youtube: await sql<Target[]>`SELECT id, external_id FROM published_posts WHERE tenant_id = ${tenantId} AND platform IN ('youtube', 'shorts') AND external_id IS NOT NULL AND (metrics_at IS NULL OR metrics_at < now() - (${METRICS_FRESHNESS_MINUTES} * interval '1 minute'))`,
    tiktok: await sql<Target[]>`SELECT id, external_id FROM published_posts WHERE tenant_id = ${tenantId} AND platform = 'tiktok' AND external_id IS NOT NULL AND (metrics_at IS NULL OR metrics_at < now() - (${METRICS_FRESHNESS_MINUTES} * interval '1 minute'))`,
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

async function classifyThreadsFailure(cred: ChannelCred, externalId: string, status: number): Promise<string> {
  try {
    const basic = await fetch(`${THREADS_API}/${externalId}?fields=id&access_token=${cred.token}`);
    if (basic.ok) return "insights_forbidden";
    const own = await fetch(`${THREADS_API}/me/threads?fields=id&limit=25&access_token=${cred.token}`);
    if (own.ok) {
      const payload = await own.json() as { data?: Array<{ id?: string }> };
      if (!(payload.data || []).some((item) => item.id === externalId)) return "post_not_in_account";
    }
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
            const code = await classifyThreadsFailure(threadsCred, target.external_id, response.status);
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
        patches.push({ id: row.id, blockedCode: "post_not_in_account" });
        failureCodes.push({ channel: "x", code: "post_not_in_account" });
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
