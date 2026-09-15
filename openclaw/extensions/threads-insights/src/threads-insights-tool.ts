import fs from "node:fs/promises";
import path from "node:path";
import { Type } from "typebox";
import { jsonResult, readStringParam } from "openclaw/plugin-sdk/agent-runtime";
import { optionalStringEnum } from "openclaw/plugin-sdk/core";
import type { OpenClawPluginApi } from "openclaw/plugin-sdk/plugin-runtime";
import { withQueueLock } from "../../threads-queue/src/queue-lock.js";

const THREADS_API_BASE = "https://graph.threads.net/v1.0";

type InsightsConfig = {
  accessToken?: string;
  userId?: string;
  queuePath?: string;
  stylePath?: string;
  popularPostsPath?: string;
  viralThreshold?: number;
};

type Engagement = {
  views: number;
  likes: number;
  replies: number;
  reposts: number;
  quotes: number;
  collectedAt: string;
  collectCount: number;
  fedToPopular: boolean;
  fedToStyle: boolean;
};

type Post = {
  id: string;
  text: string;
  originalText: string | null;
  topic: string;
  hashtags: string[];
  status: string;
  generatedAt: string;
  approvedAt: string | null;
  scheduledAt: string | null;
  publishedAt: string | null;
  threadsMediaId: string | null;
  error: string | null;
  abVariant: string;
  model: string | null;
  engagement: Engagement | null;
};

type QueueData = {
  version: number;
  posts: Post[];
};

type StyleEntry = {
  original: string;
  edited: string;
  editType: string;
  timestamp: string;
};

type StyleData = {
  version: number;
  entries: StyleEntry[];
};

type CollectedMetrics = Omit<Engagement, "collectCount" | "fedToPopular" | "fedToStyle"> & {
  postId: string;
  threadsMediaId: string;
};

const DEFAULT_DATA_DIR = path.resolve(process.cwd(), "data");

function resolveConfig(api: OpenClawPluginApi) {
  const cfg = (api.pluginConfig ?? {}) as InsightsConfig;
  const accessToken =
    (typeof cfg.accessToken === "string" && cfg.accessToken.trim()) ||
    process.env.THREADS_ACCESS_TOKEN ||
    "";
  const userId =
    (typeof cfg.userId === "string" && cfg.userId.trim()) ||
    process.env.THREADS_USER_ID ||
    "";
  if (!accessToken) {
    throw new Error("Threads access token not configured. Set THREADS_ACCESS_TOKEN env var or configure in plugin settings.");
  }
  if (!userId) {
    throw new Error("Threads user ID not configured. Set THREADS_USER_ID env var or configure in plugin settings.");
  }
  const queuePath =
    (typeof cfg.queuePath === "string" && cfg.queuePath.trim()) ||
    process.env.THREADS_QUEUE_PATH ||
    path.join(DEFAULT_DATA_DIR, "queue.json");
  const stylePath =
    (typeof cfg.stylePath === "string" && cfg.stylePath.trim()) ||
    process.env.THREADS_STYLE_PATH ||
    path.join(DEFAULT_DATA_DIR, "style-data.json");
  const popularPostsPath =
    (typeof cfg.popularPostsPath === "string" && cfg.popularPostsPath.trim()) ||
    path.join(DEFAULT_DATA_DIR, "popular-posts.txt");
  const viralThreshold =
    (typeof cfg.viralThreshold === "number" && cfg.viralThreshold) ||
    Number(process.env.VIRAL_THRESHOLD) ||
    500;
  return { accessToken, userId, queuePath, stylePath, popularPostsPath, viralThreshold };
}

async function readJson<T>(filePath: string, fallback: T): Promise<T> {
  try {
    const raw = await fs.readFile(filePath, "utf-8");
    return JSON.parse(raw) as T;
  } catch {
    return fallback;
  }
}

async function writeJson(filePath: string, data: unknown): Promise<void> {
  await fs.mkdir(path.dirname(filePath), { recursive: true });
  await fs.writeFile(filePath, JSON.stringify(data, null, 2), "utf-8");
}

async function readTextFile(filePath: string): Promise<string> {
  try {
    return await fs.readFile(filePath, "utf-8");
  } catch {
    return "";
  }
}

async function writeTextFile(filePath: string, content: string): Promise<void> {
  await fs.mkdir(path.dirname(filePath), { recursive: true });
  await fs.writeFile(filePath, content, "utf-8");
}

function extractMetricValue(data: { data?: Array<{ name: string; values?: Array<{ value: number }>; total_value?: { value: number } }> }, metric: string): number {
  const entry = data.data?.find((d) => d.name === metric);
  if (!entry) return 0;
  if (entry.total_value?.value !== undefined) return entry.total_value.value;
  if (entry.values && entry.values.length > 0) return entry.values[entry.values.length - 1].value;
  return 0;
}

const ThreadsInsightsToolSchema = Type.Object(
  {
    action: optionalStringEnum(["collect"] as const, {
      description: 'Action: "collect" — collect engagement metrics for published posts, detect viral posts, and auto-feed patterns.',
    }),
  },
  { additionalProperties: false },
);

export function createThreadsInsightsTool(api: OpenClawPluginApi) {
  return {
    name: "threads_insights",
    label: "Threads Insights",
    description:
      "Collect engagement metrics (views/likes/replies/reposts/quotes) for published Threads posts. Detects viral posts and auto-feeds patterns to popular-posts.txt and style-data.json.",
    parameters: ThreadsInsightsToolSchema,
    async execute(_toolCallId: string, rawParams: Record<string, unknown>) {
      const action = readStringParam(rawParams, "action") ?? "collect";
      if (action !== "collect") {
        throw new Error(`Unknown action: ${action}. Use "collect".`);
      }

      const config = resolveConfig(api);
      const queue = await readJson<QueueData>(config.queuePath, { version: 1, posts: [] });

      // Filter posts needing collection
      const now = new Date();
      const DAY_MS = 24 * 60 * 60 * 1000;
      const targets = queue.posts.filter((p) => {
        if (p.status !== "published" || !p.threadsMediaId) return false;
        if (!p.engagement) return true;
        const elapsed = now.getTime() - new Date(p.engagement.collectedAt).getTime();
        return elapsed >= DAY_MS && p.engagement.collectCount < 3;
      });

      if (targets.length === 0) {
        return jsonResult({ message: "No posts to collect", collected: 0, viral: 0, errors: 0 });
      }

      let collected = 0;
      let viral = 0;
      let errors = 0;
      const collectedMetrics: CollectedMetrics[] = [];

      for (const post of targets) {
        try {
          const url = `${THREADS_API_BASE}/${post.threadsMediaId}/insights?metric=views,likes,replies,reposts,quotes&access_token=${config.accessToken}`;
          const resp = await fetch(url);
          if (!resp.ok) {
            const errText = await resp.text();
            throw new Error(`API error (${resp.status}): ${errText}`);
          }
          const data = await resp.json();

          const views = extractMetricValue(data, "views");
          const likes = extractMetricValue(data, "likes");
          const replies = extractMetricValue(data, "replies");
          const reposts = extractMetricValue(data, "reposts");
          const quotes = extractMetricValue(data, "quotes");

          collectedMetrics.push({
            postId: post.id,
            threadsMediaId: post.threadsMediaId as string,
            views,
            likes,
            replies,
            reposts,
            quotes,
            collectedAt: now.toISOString(),
          });

          collected++;
        } catch (err) {
          errors++;
        }
      }

      // 외부 API는 잠금 밖에서 호출하되, 반영 직전 큐를 다시 읽고 같은 글과 mediaId에만
      // 결과를 병합한다. 수집 중 고객이 취소하거나 다른 워커가 갱신한 큐 전체를 되쓰지 않는다.
      await withQueueLock(config.queuePath, async () => {
        const freshQueue = await readJson<QueueData>(config.queuePath, { version: 1, posts: [] });
        const viralPosts: Post[] = [];
        for (const metrics of collectedMetrics) {
          const post = freshQueue.posts.find((candidate) => candidate.id === metrics.postId);
          if (!post || post.status !== "published" || post.threadsMediaId !== metrics.threadsMediaId) continue;
          const previous = post.engagement;
          post.engagement = {
            views: metrics.views,
            likes: metrics.likes,
            replies: metrics.replies,
            reposts: metrics.reposts,
            quotes: metrics.quotes,
            collectedAt: metrics.collectedAt,
            collectCount: (previous?.collectCount ?? 0) + 1,
            fedToPopular: previous?.fedToPopular ?? false,
            fedToStyle: previous?.fedToStyle ?? false,
          };
          if (metrics.views >= config.viralThreshold) viralPosts.push(post);
        }

        viral = viralPosts.length;
        if (viralPosts.length > 0) {
          let popularContent = await readTextFile(config.popularPostsPath);
          const styleData = await readJson<StyleData>(config.stylePath, { version: 1, entries: [] });

          for (const post of viralPosts) {
          // Feed to popular-posts.txt
          if (!post.engagement!.fedToPopular) {
            const textOneLine = post.text.replace(/\n/g, " ");
            if (!popularContent.includes(textOneLine.substring(0, 100))) {
              const entry = `\n---\ntopic: ${post.topic}\nengagement: viral (${post.engagement!.views} views, ${post.engagement!.likes} likes)\nlikes: ${post.engagement!.likes}\nsource: own-viral\ncollected: ${now.toISOString().split("T")[0]}\ntext: ${textOneLine}\n`;
              popularContent += entry;
              post.engagement!.fedToPopular = true;
            }
          }

          // Feed to style-data.json
          if (!post.engagement!.fedToStyle) {
            const editedText = post.text;
            const alreadyExists = styleData.entries.some((e) => e.edited === editedText);
            if (!alreadyExists) {
              const entry: StyleEntry = {
                original: post.originalText ?? post.text,
                edited: post.text,
                editType: post.originalText ? "style_rewrite" : "viral_pattern",
                timestamp: now.toISOString(),
              };
              styleData.entries.push(entry);
              post.engagement!.fedToStyle = true;
            }
          }
          }

          await writeTextFile(config.popularPostsPath, popularContent);
          await writeJson(config.stylePath, styleData);
        }

        await writeJson(config.queuePath, freshQueue);
      });

      return jsonResult({
        message: `Done: collected=${collected}, viral=${viral}, errors=${errors}`,
        collected,
        viral,
        errors,
        targets: targets.length,
      });
    },
  };
}
