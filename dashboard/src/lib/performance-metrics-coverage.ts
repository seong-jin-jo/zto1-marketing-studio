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
  /**
   * 수집에서 내려놓은 글 수. 채널에서 지워졌거나 다른 계정 글이라 다시 시도해도 영원히 안
   * 채워지는 것들이다.
   *
   * 이걸 세지 않으면 지워진 글 한 편이 "발행 8건 중 7건만 수집" 을 영원히 띄운다. 상시로
   * 켜진 경고는 아무도 안 보고, 그 옆에 진짜 미수집이 생겨도 묻힌다. 없애서 조용하게 만드는
   * 것이 아니라 **다른 칸에 세는 것**이다.
   *
   * 옛 호출자는 이 필드를 안 보낸다. 그때는 0 으로 읽어 예전과 똑같이 판정한다.
   */
  retired_count?: unknown;
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
    collectionSupported: true,
    collector: "tiktok_video_query",
    metrics: THREADS_METRICS,
    unsupportedReason: null,
  },
};

/** 안 보낸 필드는 0 이다. 보냈는데 숫자가 아니면 그건 조용히 넘길 것이 아니라 오류다. */
function optionalCount(value: unknown, field: string): number {
  if (value === undefined || value === null) return 0;
  return count(value, field);
}

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
  retiredCount: number,
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
  // 내려놓은 글은 "아직 안 한 것" 이 아니라 "더 할 수 없는 것" 이다. 기다림의 분모에서 뺀다.
  const collectable = publishedCount - retiredCount;
  if (collectedCount === 0 && collectable > 0) {
    return {
      code: "NOT_COLLECTED_YET" as const,
      message: "발행 게시물은 있지만 아직 성과 수집을 실행하지 않았습니다.",
    };
  }
  if (collectedCount < collectable) {
    return {
      code: "PARTIAL_COLLECTION" as const,
      message: retiredCount > 0
        ? `발행 ${publishedCount}건 중 ${retiredCount}건은 채널에서 더 읽을 수 없어 수집에서 내려놓았고, 나머지 ${collectable}건 중 ${collectedCount}건만 성과를 수집했습니다.`
        : `발행 ${publishedCount}건 중 ${collectedCount}건만 성과를 수집했습니다.`,
    };
  }
  return null;
}

export function buildPerformanceMetricsCoverage(rows: MetricsCoverageAggregateRow[]) {
  const normalized = rows.map((row) => {
    const publishedCount = count(row.published_count, "published_count");
    const collectedCount = count(row.collected_count, "collected_count");
    const retiredCount = optionalCount(row.retired_count, "retired_count");
    if (collectedCount > publishedCount) {
      throw new Error("collected_count cannot exceed published_count");
    }
    if (retiredCount > publishedCount) {
      throw new Error("retired_count cannot exceed published_count");
    }
    return { ...row, publishedCount, collectedCount, retiredCount };
  });

  return {
    version: "v1" as const,
    source: "published_posts" as const,
    platforms: PUBLISH_STATUS_TARGETS.map((platform) => {
      const definition = DEFINITIONS[platform];
      const matches = normalized.filter((row) => definition.storagePlatforms.includes(row.platform));
      const publishedCount = matches.reduce((sum, row) => sum + row.publishedCount, 0);
      const collectedCount = matches.reduce((sum, row) => sum + row.collectedCount, 0);
      const retiredCount = matches.reduce((sum, row) => sum + row.retiredCount, 0);
      return {
        platform,
        storagePlatforms: definition.storagePlatforms,
        collectionSupported: definition.collectionSupported,
        collector: definition.collector,
        metrics: definition.metrics,
        publishedCount,
        collectedCount,
        /**
         * 내려놓은 글은 미수집이 아니다. 같은 칸에 섞어 세면 "채워질 것" 과 "영영 안 채워질
         * 것" 이 한 숫자로 뭉개지고, 화면은 영원히 빨간 불을 띄운다.
         */
        retiredCount,
        missingCount: Math.max(0, publishedCount - collectedCount - retiredCount),
        lastCollectedAt: latest(matches.map((row) => row.last_collected_at)),
        missingReason: missingReason(definition, publishedCount, collectedCount, retiredCount),
      };
    }),
  };
}
