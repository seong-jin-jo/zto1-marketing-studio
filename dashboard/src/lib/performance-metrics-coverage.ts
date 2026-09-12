import { PUBLISH_STATUS_TARGETS, type PublishStatusTarget } from "@/lib/publish-job-status";

export type PerformanceMetric = "views" | "likes" | "replies" | "reposts";
export type MetricsMissingReasonCode =
  | "NO_PUBLISHED_POST"
  | "NOT_COLLECTED_YET"
  | "PARTIAL_COLLECTION"
  | "COLLECTOR_NOT_IMPLEMENTED";

export interface MetricsCoverageAggregateRow {
  platform: string;
  published_count: unknown;
  collected_count: unknown;
  last_collected_at: string | null;
}

interface MetricsCollectorDefinition {
  platform: PublishStatusTarget;
  storagePlatforms: readonly string[];
  collectionSupported: boolean;
  collector: string | null;
  metrics: readonly PerformanceMetric[];
  unsupportedReason: string | null;
}

const THREADS_METRICS = ["views", "likes", "replies", "reposts"] as const;
const ENGAGEMENT_METRICS = ["views", "likes", "replies"] as const;

const DEFINITIONS: Record<PublishStatusTarget, MetricsCollectorDefinition> = {
  threads: {
    platform: "threads",
    storagePlatforms: ["threads"],
    collectionSupported: true,
    collector: "threads_post_insights",
    metrics: THREADS_METRICS,
    unsupportedReason: null,
  },
  x: {
    platform: "x",
    storagePlatforms: ["x"],
    collectionSupported: true,
    collector: "x_public_metrics",
    metrics: THREADS_METRICS,
    unsupportedReason: null,
  },
  instagram: {
    platform: "instagram",
    storagePlatforms: ["instagram"],
    collectionSupported: true,
    collector: "instagram_media_insights",
    metrics: ENGAGEMENT_METRICS,
    unsupportedReason: null,
  },
  facebook: {
    platform: "facebook",
    storagePlatforms: ["facebook"],
    collectionSupported: true,
    collector: "facebook_post_insights",
    metrics: ENGAGEMENT_METRICS,
    unsupportedReason: null,
  },
  shorts: {
    platform: "shorts",
    storagePlatforms: ["youtube", "shorts"],
    collectionSupported: true,
    collector: "youtube_video_statistics",
    metrics: ENGAGEMENT_METRICS,
    unsupportedReason: null,
  },
  reels: {
    platform: "reels",
    storagePlatforms: ["instagram_reels", "reels"],
    collectionSupported: true,
    collector: "instagram_media_insights",
    metrics: ENGAGEMENT_METRICS,
    unsupportedReason: null,
  },
  tiktok: {
    platform: "tiktok",
    storagePlatforms: ["tiktok"],
    collectionSupported: false,
    collector: null,
    metrics: [],
    unsupportedReason: "현재 TikTok 게시물 성과 수집기는 연결되지 않았습니다.",
  },
};

function count(value: unknown, field: string): number {
  const parsed = Number(value);
  if (!Number.isInteger(parsed) || parsed < 0) {
    throw new Error(`${field} must be a non-negative integer`);
  }
  return parsed;
}

function latest(values: Array<string | null>): string | null {
  return values.filter((value): value is string => Boolean(value)).sort().at(-1) ?? null;
}

function missingReason(
  definition: MetricsCollectorDefinition,
  publishedCount: number,
  collectedCount: number,
) {
  if (publishedCount === 0) {
    return {
      code: "NO_PUBLISHED_POST" as const,
      message: "성과를 수집할 발행 게시물이 없습니다.",
    };
  }
  if (!definition.collectionSupported) {
    return {
      code: "COLLECTOR_NOT_IMPLEMENTED" as const,
      message: definition.unsupportedReason!,
    };
  }
  if (collectedCount === 0) {
    return {
      code: "NOT_COLLECTED_YET" as const,
      message: "발행 게시물은 있지만 아직 성과 수집을 실행하지 않았습니다.",
    };
  }
  if (collectedCount < publishedCount) {
    return {
      code: "PARTIAL_COLLECTION" as const,
      message: `발행 ${publishedCount}건 중 ${collectedCount}건만 성과를 수집했습니다.`,
    };
  }
  return null;
}

export function buildPerformanceMetricsCoverage(rows: MetricsCoverageAggregateRow[]) {
  const normalized = rows.map((row) => {
    const publishedCount = count(row.published_count, "published_count");
    const collectedCount = count(row.collected_count, "collected_count");
    if (collectedCount > publishedCount) {
      throw new Error("collected_count cannot exceed published_count");
    }
    return { ...row, publishedCount, collectedCount };
  });

  return {
    version: "v1" as const,
    source: "published_posts" as const,
    platforms: PUBLISH_STATUS_TARGETS.map((platform) => {
      const definition = DEFINITIONS[platform];
      const matches = normalized.filter((row) => definition.storagePlatforms.includes(row.platform));
      const publishedCount = matches.reduce((sum, row) => sum + row.publishedCount, 0);
      const collectedCount = matches.reduce((sum, row) => sum + row.collectedCount, 0);
      return {
        platform,
        storagePlatforms: definition.storagePlatforms,
        collectionSupported: definition.collectionSupported,
        collector: definition.collector,
        metrics: definition.metrics,
        publishedCount,
        collectedCount,
        missingCount: publishedCount - collectedCount,
        lastCollectedAt: latest(matches.map((row) => row.last_collected_at)),
        missingReason: missingReason(definition, publishedCount, collectedCount),
      };
    }),
  };
}
