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
type Target = {
  id: string;
  external_id: string;
  published_at?: string | Date | null;
  account_id?: string | null;
  metrics_retired?: unknown;
};

/**
 * 다시 시도해도 절대 풀리지 않는 판정.
 *
 * 이 둘은 "기다리면 채워지는" 실패가 아니다. 글이 채널에서 사라졌거나, 지금 연결된 계정의
 * 글이 아니다. 수집을 백 번 더 돌려도 결과가 같다. 그래서 수집 대상에서 **내려놓는다**.
 *
 * 왜 내려놓아야 하나. 2026-09-04 에 올린 글 한 편이 그 뒤 채널에서 사라졌고, 그때부터
 * 수집을 돌릴 때마다 `ok:false / partial:true / failed 1` 이 나왔다. 지워진 글은 다시
 * 생기지 않으므로 이 빨간 불은 영원하다. **빨간 불이 상시가 되면 아무도 안 본다.** 진짜
 * 문제가 나도 그 옆에 묻힌다. 경보를 지키려면 끝난 것은 끝났다고 말해야 한다.
 *
 * 내려놓는 것과 지우는 것은 다르다. 글 기록은 그대로 두고, 왜 언제 어떤 근거로 내려놨는지를
 * `provider_meta.metricsRetired` 에 적는다. 나중에 "그 글 어디 갔냐" 고 물으면 그 줄이
 * 답한다. 없애서 조용하게 만드는 것이 아니라 제대로 분류하는 것이다(ADR-007).
 */
export const METRICS_TERMINAL_CODES: ReadonlySet<string> = new Set(["post_deleted", "post_not_in_account"]);

/** 수집 대상에서 내려놓은 기록. 지우개가 아니라 꼬리표다. */
export interface MetricsRetirement {
  code: string;
  at: string;
  /** 왜 내려놨는지. 그때 무엇을 보고 그렇게 정했는지 그대로. */
  evidence: string;
  /** 내려놓을 때 연결돼 있던 계정. 이 값이 되돌리기의 열쇠다(`retirementDecision`). */
  accountId: string | null;
}

export function parseRetirement(value: unknown): MetricsRetirement | null {
  if (typeof value !== "object" || value === null) return null;
  const row = value as Record<string, unknown>;
  if (typeof row.code !== "string" || row.code.length === 0) return null;
  return {
    code: row.code,
    at: typeof row.at === "string" ? row.at : "",
    evidence: typeof row.evidence === "string" ? row.evidence : "",
    accountId: typeof row.accountId === "string" ? row.accountId : null,
  };
}

/**
 * 내려놓은 글을 이번 수집에서 어떻게 할 것인가.
 *
 * 한 번 빼면 영영 못 돌아오는 구조는 만들지 않는다. 우리 판정이 틀릴 수 있기 때문이다.
 * 되돌리는 길을 둘 둔다.
 *
 *  1) **자동**: 내려놓을 때와 **다른 계정**으로 연결이 바뀌었으면 판정의 전제가 무너진 것이다.
 *     "이 계정에 그 글이 없다" 는 그 계정에서만 참이다. 계정이 바뀌면 다시 물어봐야 한다.
 *     이것이 "다른 계정으로 올린 글이면 그 계정으로 다시 연결하라" 는 안내와 짝을 이룬다.
 *     안내를 따랐는데 아무 일도 안 일어나면 그 안내는 거짓말이다.
 *  2) **수동**: 운영자가 글 번호로 되돌린다(`POST /api/metrics` 의 `reinstate`). 계정은
 *     그대로인데 우리 판정만 틀린 경우가 여기 해당한다.
 *
 * 연결된 계정을 모를 때(null)는 자동으로 되돌리지 않는다. 모른다는 것은 "달라졌다" 의
 * 근거가 못 된다. 모름을 근거로 움직이면 매 수집마다 되돌렸다 다시 내려놓기를 반복한다.
 */
export function retirementDecision(
  retirement: MetricsRetirement | null,
  connectedAccountId: string | null | undefined,
): "collect" | "reinstate" | "skip" {
  if (!retirement) return "collect";
  if (connectedAccountId && retirement.accountId && connectedAccountId !== retirement.accountId) return "reinstate";
  return "skip";
}

type MetricPatch = {
  id: string;
  views?: number;
  likes?: number;
  replies?: number;
  reposts?: number;
  blockedCode?: string;
  /** 수집 대상에서 내려놓는다. `blockedCode` 와 함께 온다. */
  retire?: MetricsRetirement;
  /** 내려놨던 것을 다시 대상으로 돌린다. */
  reinstate?: boolean;
};

/**
 * 어느 글이 왜 그 코드로 판정됐는지.
 *
 * 2026-09-14: 수집이 `failed 1` 이라고만 말하고 **어느 글인지 말하지 않아서** 원인 판정이
 * 세 번 막혔다. 채널과 코드와 개수만으로는 "방금 올린 글의 집계 지연" 과 "다른 계정에 올린
 * 옛 글" 을 가를 수 없다. 실패했다고는 말하는데 무엇이 실패했는지 안 말하는 것은 ADR-007
 * (조용한 실패 금지) 위반이다.
 *
 * 필드가 둘로 갈린다. 앞쪽은 고객에게도 주는 것이고(=자기 글을 찾아 판단하는 데 필요),
 * `operator` 묶음은 운영자에게만 준다. 갈라 놓은 근거는 `redactFailureDetail` 에 적었다.
 */
export interface MetricsFailureDetail {
  /** 내부 글 번호. 고객 화면의 그 글과 1:1 로 맞는 유일한 열쇠다. */
  postId: string;
  channel: string;
  code: string;
  /** 발행 시각. 집계 유예 판정의 근거 그 자체다. */
  publishedAt: string | null;
  /** 발행 후 몇 분 지났나. 유예(60분) 안팎을 사람이 바로 읽게 한다. */
  ageMinutes: number | null;
  /** 왜 이 코드로 판정했나. 추측이 아니라 그때 무엇을 보고 그렇게 정했는지. */
  evidence: string;
  /** 운영자 전용 진단. 고객 응답에서는 통째로 뺀다. */
  operator?: {
    /** 채널 쪽 식별자. */
    externalId: string;
    /** 공급자가 돌려준 HTTP 상태. */
    providerStatus?: number;
    /** 계정 목록을 몇 쪽까지 되짚었나. */
    lookupPages?: number;
    /** 이 글이 올라갈 때 쓴 계정. */
    postAccountId: string | null;
    /** 이번 수집이 쓴 계정. 위와 다르면 "계정에 없다" 는 판정의 진짜 원인이 여기다. */
    collectedWithAccountId: string | null;
  };
}

export interface MetricsCollectionResult {
  ok: boolean;
  updated: number;
  total: number;
  failed: number;
  partial: boolean;
  collectionBlocked: boolean;
  failures: Array<{ channel: string; code: string; count: number }>;
  failureDetails: MetricsFailureDetail[];
  /**
   * 이번 수집이 **일부러 건너뛴** 글. 실패가 아니라 이미 끝난 것으로 판정해 내려놓은 글이다.
   * 개수만 줄이고 목록을 안 주면 그게 바로 조용한 실패다(ADR-007). 사람이 "그 글 어디
   * 갔냐" 고 물을 자리를 응답 안에 미리 열어 둔다.
   */
  excluded: Array<{ postId: string; channel: string; code: string; retiredAt: string }>;
  reason?: string;
}

/**
 * 고객에게 줄 몫만 남긴다.
 *
 * 왜 가르나. 이건 남의 개인정보를 가리는 일이 아니다(전부 그 작업 공간 자신의 데이터다).
 * 가르는 이유는 둘이다.
 *  1) **행동 가능성**: 고객이 할 수 있는 일은 "어느 글이 왜 안 잡혔나" 를 보고 기다리거나
 *     채널을 다시 연결하는 것뿐이다. 공급자 HTTP 상태나 목록 조회 쪽수는 고객이 할 수 있는
 *     일을 하나도 늘리지 않고 문의만 늘린다.
 *  2) **자격증명 경계**: `collectedWithAccountId` 는 글이 아니라 **연결된 계정**을 가리킨다.
 *     글 진단에 계정 식별자를 섞어 내보내면, 화면·로그·문의 캡처를 타고 계정 바인딩이
 *     퍼진다. 이 대조는 운영자만 필요하다.
 * 반대로 `postId` 와 `publishedAt` 은 고객에게 **반드시** 준다. 그게 없으면 고객도 우리와
 * 똑같이 "뭔가 하나 실패했다" 만 보게 되고, 그 상태가 이번 사고의 원인이었다.
 */
export function redactFailureDetail(detail: MetricsFailureDetail): MetricsFailureDetail {
  const { operator: _operator, ...customerSafe } = detail;
  return customerSafe;
}

export function failureDetailsFor(
  details: MetricsFailureDetail[],
  audience: "operator" | "customer",
): MetricsFailureDetail[] {
  return audience === "operator" ? details : details.map(redactFailureDetail);
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
  // 지워진 글은 사용자가 할 일이 없다. 재연결을 권하면 없는 문제를 만든다.
  if (codes.includes("post_deleted")) {
    const waiting = codes.includes("metrics_pending_ingest") ? " 방금 올린 글은 집계를 기다리는 중이니 그대로 두셔도 됩니다." : "";
    return `일부 글이 채널에서 지워져 성과를 더 읽을 수 없습니다. 그 글은 성과 수집에서 내려놓았고 발행 기록은 그대로 남습니다. 채널을 다시 연결할 필요는 없습니다.${waiting}`;
  }
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
    threads: await sql<Target[]>`SELECT id, external_id, published_at, account_id, provider_meta -> 'metricsRetired' AS metrics_retired FROM published_posts WHERE tenant_id = ${tenantId} AND platform = 'threads' AND external_id IS NOT NULL AND (metrics_at IS NULL OR metrics_at < now() - (${METRICS_FRESHNESS_MINUTES} * interval '1 minute'))`,
    x: await sql<Target[]>`SELECT id, external_id, published_at, account_id, provider_meta -> 'metricsRetired' AS metrics_retired FROM published_posts WHERE tenant_id = ${tenantId} AND platform = 'x' AND external_id IS NOT NULL AND (metrics_at IS NULL OR metrics_at < now() - (${METRICS_FRESHNESS_MINUTES} * interval '1 minute'))`,
    instagram: await sql<Target[]>`SELECT id, external_id, published_at, account_id, provider_meta -> 'metricsRetired' AS metrics_retired FROM published_posts WHERE tenant_id = ${tenantId} AND platform = 'instagram' AND external_id IS NOT NULL AND (metrics_at IS NULL OR metrics_at < now() - (${METRICS_FRESHNESS_MINUTES} * interval '1 minute'))`,
    instagram_reels: await sql<Target[]>`SELECT id, external_id, published_at, account_id, provider_meta -> 'metricsRetired' AS metrics_retired FROM published_posts WHERE tenant_id = ${tenantId} AND platform IN ('instagram_reels', 'reels') AND external_id IS NOT NULL AND (metrics_at IS NULL OR metrics_at < now() - (${METRICS_FRESHNESS_MINUTES} * interval '1 minute'))`,
    facebook: await sql<Target[]>`SELECT id, external_id, published_at, account_id, provider_meta -> 'metricsRetired' AS metrics_retired FROM published_posts WHERE tenant_id = ${tenantId} AND platform = 'facebook' AND external_id IS NOT NULL AND (metrics_at IS NULL OR metrics_at < now() - (${METRICS_FRESHNESS_MINUTES} * interval '1 minute'))`,
    youtube: await sql<Target[]>`SELECT id, external_id, published_at, account_id, provider_meta -> 'metricsRetired' AS metrics_retired FROM published_posts WHERE tenant_id = ${tenantId} AND platform IN ('youtube', 'shorts') AND external_id IS NOT NULL AND (metrics_at IS NULL OR metrics_at < now() - (${METRICS_FRESHNESS_MINUTES} * interval '1 minute'))`,
    tiktok: await sql<Target[]>`SELECT id, external_id, published_at, account_id, provider_meta -> 'metricsRetired' AS metrics_retired FROM published_posts WHERE tenant_id = ${tenantId} AND platform = 'tiktok' AND external_id IS NOT NULL AND (metrics_at IS NULL OR metrics_at < now() - (${METRICS_FRESHNESS_MINUTES} * interval '1 minute'))`,
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

/**
 * 근거 문구에 비밀값이 섞여 나가지 않게 한다.
 *
 * 예외 메시지는 우리가 만든 문장이 아니다. 런타임이나 fetch 구현이 요청 URL 을 통째로
 * 메시지에 넣는 경우가 있고, 그 URL 에는 `access_token` 이 실려 있다. 근거는 응답과 서버
 * 로그 양쪽으로 나가므로 여기서 한 번 걸러 둔다. 걸러도 판정 근거는 그대로 남는다.
 */
export function scrubEvidence(text: string): string {
  return text
    .replace(/(access_token|token|key|secret|password)=[^&\s"']+/gi, "$1=[가려짐]")
    .replace(/Bearer\s+[A-Za-z0-9._~+/=-]+/gi, "Bearer [가려짐]");
}

/** 발행 시각을 사람이 읽고 기계가 비교할 수 있는 한 가지 모양으로. 못 읽으면 null. */
export function toIsoOrNull(value: string | Date | null | undefined): string | null {
  if (!value) return null;
  const ms = value instanceof Date ? value.getTime() : Date.parse(value);
  return Number.isFinite(ms) ? new Date(ms).toISOString() : null;
}

/** 발행 후 몇 분 지났나. 유예 안팎을 보고서에서 바로 읽게 한다. 모르면 null. */
export function ageMinutes(value: string | Date | null | undefined, now: number = Date.now()): number | null {
  const iso = toIsoOrNull(value);
  if (!iso) return null;
  return Math.round((now - Date.parse(iso)) / 60_000);
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
type ThreadsLookup = {
  verdict: ThreadsListVerdict;
  pages: number;
  note: string;
  /**
   * 목록을 **끝까지** 봤나(다음 쪽이 더 없었나).
   *
   * `absent` 는 두 가지 길로 나온다. ①다음 쪽이 없어서 계정 전체를 다 본 경우 ②이 쪽의
   * 마지막 글이 대상보다 오래돼서 "목록이 지나쳤다" 고 앞질러 끊은 경우. ②는 목록이
   * **최신순으로 정렬돼 있다**는 공급자 계약에 기댄 지름길이다. 고정 글이 섞이거나 정렬이
   * 흔들리면 그 전제가 깨진다.
   *
   * 재연결로 되돌릴 수 있는 "다른 계정 글" 판정에는 ②로도 충분하다. 그러나 "지워졌다" 는
   * 되돌릴 길이 좁은 판정이라 ①만 근거로 쓴다. 확신의 값이 다르면 근거의 값도 달라야 한다.
   */
  exhaustive: boolean;
};

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
): Promise<ThreadsLookup> {
  const publishedMs = publishedAt
    ? (publishedAt instanceof Date ? publishedAt.getTime() : Date.parse(publishedAt))
    : Number.NaN;
  let url = `${THREADS_API}/me/threads?fields=id,timestamp&limit=${THREADS_LIST_PAGE_SIZE}&access_token=${cred.token}`;
  let pages = 0;

  for (let page = 0; page < THREADS_LIST_MAX_PAGES; page += 1) {
    // 목록 한 쪽이 멈추면 수집 전체가 끝나지 않는다. 기다릴 상한을 건다.
    const response = await fetch(url, { signal: AbortSignal.timeout(8000) });
    pages += 1;
    if (!response.ok) {
      return { verdict: "incomplete", pages, note: `목록 조회가 HTTP ${response.status} 로 끊겼습니다`, exhaustive: false };
    }
    const payload = await response.json() as {
      data?: Array<{ id?: string; timestamp?: string }>;
      paging?: { next?: string; cursors?: { after?: string } };
    };
    // `data` 가 아예 없거나 배열이 아니면 그건 "빈 계정" 이 아니라 우리가 못 읽은 응답이다.
    // 이 둘을 같이 취급하면 공급자 스키마 오류 한 번이 곧장 "계정에 없다"(422, 재연결 안내)로
    // 굳는다. 빈 배열(`data: []`)은 진짜 빈 목록이므로 그대로 판정에 쓴다.
    if (!Array.isArray(payload.data)) {
      return { verdict: "incomplete", pages, note: "목록 응답에 글 목록이 없어 읽지 못했습니다", exhaustive: false };
    }
    const rows = payload.data;
    if (rows.some((item) => item.id === externalId)) {
      return { verdict: "found", pages, note: `목록 ${pages}쪽에서 이 글을 찾았습니다`, exhaustive: false };
    }
    // 글 번호 없는 항목이 섞여 있으면 "이 글이 없다" 를 말할 수 없다. 번호를 못 읽었는데 번호로
    // 비교한 셈이기 때문이다. 배열 모양만 맞으면 통과시키던 때는 `{data:[{}]}` 한 번이 곧장
    // "계정에 없다" 로 굳었다.
    if (rows.some((item) => typeof item.id !== "string" || item.id.length === 0)) {
      return { verdict: "incomplete", pages, note: `목록 ${pages}쪽에 글 번호가 없는 항목이 있어 대조하지 못했습니다`, exhaustive: false };
    }

    // paging.next 는 공급자가 준 URL 이고 우리 토큰이 실려 나간다. 주소를 실제로 파싱해
    // 우리가 아는 곳일 때만 따라간다. 다음 쪽이 있다는데 따라갈 수 없으면 "다 봤다" 가
    // 아니라 "확인 못 했다" 다.
    const rawNext = payload.paging?.next;
    const advertised = isThreadsApiUrl(rawNext) ? rawNext : undefined;
    if (typeof rawNext === "string" && rawNext.length > 0 && !advertised) {
      return { verdict: "incomplete", pages, note: "다음 쪽 주소가 우리가 아는 곳이 아니라 따라가지 않았습니다", exhaustive: false };
    }
    const next = advertised
      ?? (payload.paging?.cursors?.after
        ? `${THREADS_API}/me/threads?fields=id,timestamp&limit=${THREADS_LIST_PAGE_SIZE}&after=${payload.paging.cursors.after}&access_token=${cred.token}`
        : null);

    // 다음 쪽이 없으면 계정 전체를 다 본 것이다. 이것이 가장 강한 근거다.
    if (!next) {
      return { verdict: "absent", pages, note: `계정 글 목록 ${pages}쪽을 끝까지 봤는데 이 글이 없었습니다`, exhaustive: true };
    }

    // 이 쪽의 마지막 글이 대상보다 오래됐다면 목록은 그 글을 지나쳤다. 즉 계정에 없다.
    //
    // 중간의 아무 글이나 보고 판정하면 안 된다. 고정 글(pinned)처럼 오래된 글이 목록 앞에
    // 끼어 있으면, 대상 글이 뒤쪽에 멀쩡히 있는데도 "지나쳤다" 로 읽힌다. 목록의 꼬리만
    // 본다. 그래도 이건 "최신순 정렬" 계약에 기댄 지름길이라 `exhaustive` 로 표시하지 않는다.
    const tail = rows[rows.length - 1];
    const tailAt = tail?.timestamp ? Date.parse(tail.timestamp) : Number.NaN;
    if (Number.isFinite(publishedMs) && Number.isFinite(tailAt) && tailAt < publishedMs) {
      return {
        verdict: "absent",
        pages,
        note: `목록 ${pages}쪽의 마지막 글(${tail?.timestamp})이 이 글의 발행 시각보다 오래됐는데도 이 글이 없었습니다`,
        exhaustive: false,
      };
    }
    url = next;
  }
  return {
    verdict: "incomplete",
    pages,
    note: `목록 상한 ${THREADS_LIST_MAX_PAGES}쪽(최대 ${THREADS_LIST_MAX_PAGES * THREADS_LIST_PAGE_SIZE}편)까지 봤지만 아직 남아 있습니다`,
    exhaustive: false,
  };
}

type ThreadsVerdict = { code: string; evidence: string; lookupPages?: number };

async function classifyThreadsFailure(
  cred: ChannelCred,
  externalId: string,
  status: number,
  publishedAt?: string | Date | null,
  postAccountId?: string | null,
): Promise<ThreadsVerdict> {
  // 한도 초과와 채널 장애는 계정 문제가 아니다. 원래 응답이 그렇게 말하고 있으면 계정을
  // 의심하는 판정으로 넘어가지 않는다. 넘어가면 잠깐의 장애가 재연결 안내로 둔갑한다.
  if (status === 429 || status >= 500) {
    return {
      code: `provider_${status}`,
      evidence: `성과 조회가 HTTP ${status} 로 거절됐습니다. 채널 쪽 문제라 계정 확인으로 넘어가지 않았습니다.`,
    };
  }

  try {
    const basic = await fetch(`${THREADS_API}/${externalId}?fields=id&access_token=${cred.token}`, {
      signal: AbortSignal.timeout(8000),
    });
    if (basic.ok) {
      return {
        code: "insights_forbidden",
        evidence: `게시물 단건 조회는 성공했고 성과 조회만 HTTP ${status} 로 거절됐습니다. 글은 있고 권한이 없습니다.`,
      };
    }

    // 방금 올린 글이면 목록에 없는 것이 정상이다. 계정을 의심하기 전에 시간을 본다.
    const age = ageMinutes(publishedAt);
    if (isWithinIngestGrace(publishedAt)) {
      return {
        code: "metrics_pending_ingest",
        evidence: `발행 ${age ?? "?"}분 전이라 집계 유예 ${METRICS_INGEST_GRACE_MINUTES}분 안입니다. 계정 목록을 확인하지 않았습니다.`,
      };
    }

    const lookup = await lookupThreadsPost(cred, externalId, publishedAt);
    if (lookup.verdict === "absent") {
      /**
       * 여기까지 오면 두 가지를 독립적으로 확인한 것이다. ①글 번호로 단건 조회했는데
       * 채널이 거절했다(HTTP ${status}). ②계정 글 목록을 끝까지 되짚었는데 없었다.
       *
       * 그래도 "지워졌다" 와 "다른 계정 글이다" 는 아직 안 갈린다. Threads/Graph 는 없는 글과
       * 권한 없는 글을 **일부러 같은 문구로** 돌려준다("does not exist, cannot be loaded due to
       * missing permissions"). 응답만으로는 영원히 못 가른다.
       *
       * 가르는 축은 응답이 아니라 **우리 기록**이다. 이 글을 올릴 때 쓴 계정(`account_id`)이
       * 지금 수집에 쓴 계정과 **같다면**, 자기 계정의 전체 목록에 자기가 올린 글이 없는
       * 것이다. 그건 지워진 것이다. 계정이 **다르거나 모르면** 그 전제가 없으므로 단정하지
       * 않고 계정 불일치로 남긴다(사용자가 할 일이 "재연결" 로 다르다).
       *
       * 목록이 `incomplete` 면 여기 오지 않는다. 끝까지 못 본 목록으로는 아무것도 단정하지
       * 않는다는 규칙이 이 판정의 밑돌이다.
       */
      const sameAccount = Boolean(postAccountId && cred.accountId && postAccountId === cred.accountId);
      /**
       * "지워졌다" 는 세 근거가 **모두** 서야 말한다. 하나라도 빠지면 되돌리기 쉬운 쪽
       * (`post_not_in_account`)으로 남긴다. 살아 있는 글을 지워진 것으로 부르는 쪽이 그
       * 반대보다 훨씬 비싸기 때문이다.
       *
       *  ①`sameAccount` — 올린 계정과 수집한 계정이 같다.
       *  ②`lookup.exhaustive` — 목록을 끝까지 봤다. 정렬 계약에 기댄 지름길로는 안 된다.
       *  ③`age > 0` — 발행 시각이 과거다. 시계가 크게 어긋나 미래로 저장된 글은 목록의
       *    어떤 글보다도 새것이라 무조건 "지나쳤다" 로 읽힌다. 그건 글에 대한 사실이 아니라
       *    우리 시각 기록에 대한 사실이다.
       */
      const trustworthyAge = typeof age === "number" && age > 0;
      if (sameAccount && lookup.exhaustive && trustworthyAge) {
        return {
          code: "post_deleted",
          lookupPages: lookup.pages,
          evidence: `발행 ${age ?? "?"}분 전이라 유예 ${METRICS_INGEST_GRACE_MINUTES}분을 지났고, 단건 조회가 HTTP ${status} 로 거절됐으며, ${lookup.note}. 이 글을 올린 계정과 수집에 쓴 계정이 같으므로 채널에서 지워진 글로 봅니다.`,
        };
      }
      return {
        code: "post_not_in_account",
        lookupPages: lookup.pages,
        evidence: `발행 ${age ?? "?"}분 전이라 유예 ${METRICS_INGEST_GRACE_MINUTES}분을 지났고, ${lookup.note}. ${
          !sameAccount
            ? (postAccountId ? "이 글을 올린 계정이 수집에 쓴 계정과 다릅니다" : "이 글을 올린 계정 기록이 없어 지워진 글로 단정하지 않았습니다")
            : !lookup.exhaustive
              ? "목록을 끝까지 본 것이 아니라 정렬 순서로 앞질러 끊었으므로 지워진 글로 단정하지 않았습니다"
              : "발행 시각이 미래로 기록돼 있어 지워진 글로 단정하지 않았습니다"
        }.`,
      };
    }
    if (lookup.verdict === "incomplete") {
      return {
        code: "metrics_lookup_incomplete",
        lookupPages: lookup.pages,
        evidence: `${lookup.note}. 그래서 계정에 없다고 단정하지 않았습니다.`,
      };
    }
    // 목록에는 있는데 성과만 안 나온다. 계정 문제가 아니다.
    return {
      code: `provider_${status}`,
      lookupPages: lookup.pages,
      evidence: `${lookup.note}. 글은 이 계정에 있는데 성과 조회만 HTTP ${status} 로 실패했습니다.`,
    };
  } catch (error) {
    return {
      code: "exception",
      evidence: `판정 중 예외가 났습니다: ${error instanceof Error ? error.message : String(error)}`,
    };
  }
}

/**
 * 내려놓은 글을 사람이 손으로 다시 수집 대상에 올린다.
 *
 * 자동 되돌림(계정이 바뀐 경우)이 못 잡는 나머지가 여기로 온다. 우리 판정이 그냥 틀렸을 수
 * 있고, 사용자가 지웠다가 다시 올렸을 수도 있다. 되돌릴 길이 없는 자동 판정은 만들지
 * 않는다는 것이 이 함수의 존재 이유다.
 *
 * 되돌림은 꼬리표를 떼는 것까지다. 실제로 읽히는지는 다음 수집이 답하고, 또 안 읽히면 같은
 * 근거로 다시 내려놓는다. 그래서 되돌림은 언제 눌러도 안전하다.
 */
export async function reinstateMetricsTarget(
  tenantId: string,
  postId: string,
): Promise<{ reinstated: boolean; wasRetired: MetricsRetirement | null }> {
  return withTenant(tenantId, async (sql) => {
    /**
     * 읽고 나서 쓰지 않는다. 한 문장 안에서 잠그고, 확인하고, 지우고, 지운 값을 돌려받는다.
     *
     * 읽기와 쓰기를 갈라 놓으면 그 틈에 수집기가 새 판정을 써 넣을 수 있고, 그러면 되돌리기가
     * 자기가 본 적도 없는 판정을 지운다. 되돌리기는 "내가 본 그 판정" 만 지워야 한다.
     * `FOR UPDATE` 가 그 사이 행을 잠그고, `was IS NOT NULL` 이 지울 것이 있을 때만 쓴다.
     */
    const rows = await sql<Array<{ was_retired: unknown }>>`
      WITH target AS (
        SELECT id, provider_meta -> 'metricsRetired' AS was
        FROM published_posts
        WHERE tenant_id = ${tenantId} AND id = ${postId}
        FOR UPDATE
      )
      UPDATE published_posts AS post
      SET provider_meta = COALESCE(post.provider_meta, '{}'::jsonb) - 'metricsRetired' - 'metricsBlocked'
      FROM target
      WHERE post.tenant_id = ${tenantId} AND post.id = target.id AND target.was IS NOT NULL
      RETURNING target.was AS was_retired`;
    // 없는 글과 안 내려놓은 글을 "됐다" 로 뭉뚱그리지 않는다. 누른 사람이 결과를 알아야 한다.
    const wasRetired = rows.length > 0 ? parseRetirement(rows[0].was_retired) : null;
    if (!wasRetired) return { reinstated: false, wasRetired: null };
    console.warn("[metrics][reinstate]", JSON.stringify({ tenantId, postId, wasRetired }));
    return { reinstated: true, wasRetired };
  });
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
      // 글 단위 실패가 아니다. 아직 아무 글도 판정하지 않았으므로 비운다.
      failureDetails: [],
      excluded: [],
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
  const failureDetails: MetricsFailureDetail[] = [];
  const tasks: Array<() => Promise<void>> = [];

  const collectedWith: Record<string, string | null> = {
    threads: threadsCred?.accountId ?? null,
    x: xCred?.accountId ?? null,
    instagram: instagramCred?.accountId ?? null,
    instagram_reels: instagramCred?.accountId ?? null,
    facebook: facebookCred?.accountId ?? null,
    youtube: youtubeCred?.accountId ?? null,
    tiktok: tiktokCred?.accountId ?? null,
  };

  /**
   * 이미 끝난 것으로 내려놓은 글을 이번 수집에서 걷어낸다.
   *
   * SQL 에서 바로 거르지 않고 여기서 거르는 이유가 있다. 되돌림 판정(`retirementDecision`)은
   * **지금 연결된 계정**을 알아야 내릴 수 있고, 그 값은 자격증명을 읽은 뒤에야 손에 들어온다.
   * SQL 로 미리 걸러 버리면 계정이 바뀌어도 그 글은 영원히 쿼리에 안 잡히고, 그건 이 과제가
   * 없애려던 "한 번 빼면 못 돌아오는 구조" 를 반대 방향으로 다시 만드는 것이다.
   */
  const excluded: MetricsCollectionResult["excluded"] = [];
  for (const platform of Object.keys(targets) as Platform[]) {
    targets[platform] = targets[platform].filter((row) => {
      const retirement = parseRetirement(row.metrics_retired);
      const decision = retirementDecision(retirement, collectedWith[platform]);
      if (decision === "skip" && retirement) {
        excluded.push({ postId: row.id, channel: platform, code: retirement.code, retiredAt: retirement.at });
        return false;
      }
      // 계정이 바뀌었다. 판정의 전제가 사라졌으니 꼬리표를 떼고 다시 물어본다.
      if (decision === "reinstate") patches.push({ id: row.id, reinstate: true });
      return true;
    });
  }

  /**
   * 실패 하나를 세 곳에 동시에 남긴다: 글에 붙는 표시(patch), 집계(코드), 그리고 사람이
   * 추적할 수 있는 상세. 한 곳만 남기면 다음에 또 "뭔가 하나 실패했다" 로 끝난다.
   * 서버 로그에도 같은 줄을 남겨, 화면도 응답도 못 볼 때 로그만으로 추적되게 한다.
   */
  const noteFailure = (
    channel: string,
    row: Target,
    code: string,
    evidence: string,
    extra: { providerStatus?: number; lookupPages?: number } = {},
  ): void => {
    const scrubbed = scrubEvidence(evidence);
    // 다시 시도해도 안 풀리는 판정이면 이번 한 번만 실패로 세고 다음부터는 대상에서 뺀다.
    // 빼는 것이 아니라 "왜 뺐는지" 를 함께 적는 것이 핵심이다.
    const retire = METRICS_TERMINAL_CODES.has(code)
      ? {
        code,
        at: new Date().toISOString(),
        evidence: scrubbed,
        accountId: collectedWith[channel] ?? null,
      }
      : undefined;
    patches.push({ id: row.id, blockedCode: code, ...(retire ? { retire } : {}) });
    failureCodes.push({ channel, code });
    const detail: MetricsFailureDetail = {
      postId: row.id,
      channel,
      code,
      publishedAt: toIsoOrNull(row.published_at),
      ageMinutes: ageMinutes(row.published_at),
      // 근거 문구가 응답과 로그 양쪽으로 나가는 유일한 길목이다. 가림은 여기 한 곳에서만.
      evidence: scrubbed,
      operator: {
        externalId: row.external_id,
        postAccountId: row.account_id ?? null,
        collectedWithAccountId: collectedWith[channel] ?? null,
        ...(extra.providerStatus !== undefined ? { providerStatus: extra.providerStatus } : {}),
        ...(extra.lookupPages !== undefined ? { lookupPages: extra.lookupPages } : {}),
      },
    };
    failureDetails.push(detail);
    // 토큰은 절대 싣지 않는다. 글·계정 식별자와 판정 근거만 남긴다.
    console.warn("[metrics][failure]", JSON.stringify({ tenantId, ...detail }));
  };

  if (threadsCred) {
    for (const target of targets.threads) {
      tasks.push(async () => {
        try {
          const response = await fetch(`${THREADS_API}/${target.external_id}/insights?metric=views,likes,replies,reposts&access_token=${threadsCred.token}`);
          if (!response.ok) {
            const verdict = await classifyThreadsFailure(threadsCred, target.external_id, response.status, target.published_at, target.account_id);
            noteFailure("threads", target, verdict.code, verdict.evidence, {
              providerStatus: response.status,
              ...(verdict.lookupPages !== undefined ? { lookupPages: verdict.lookupPages } : {}),
            });
            return;
          }
          const payload = await response.json() as { data?: Array<{ name: string; values?: Array<{ value?: number }> }> };
          const values: Record<string, number> = {};
          for (const item of payload.data || []) values[item.name] = Number(item.values?.[0]?.value ?? 0) || 0;
          patches.push({ id: target.id, views: values.views, likes: values.likes, replies: values.replies, reposts: values.reposts });
        } catch (error) {
          noteFailure("threads", target, "exception",
            `성과 조회 중 예외가 났습니다: ${error instanceof Error ? error.message : String(error)}`);
        }
      });
    }
  }

  if (xCred && targets.x.length > 0) tasks.push(async () => {
    const result = await fetchXPublicMetrics(xCred, targets.x.map((row) => row.external_id));
    const attempted = new Set(result.attemptedIds ?? []);
    const failed = new Set(result.failedIds ?? []);
    // ok 일 때는 status 자체가 없다. 진단에 실을 상태는 실패했을 때만 있다.
    const callStatus = result.ok ? undefined : result.status;
    for (const row of targets.x) {
      const metric = result.metrics?.[row.external_id];
      if (metric) patches.push({ id: row.id, ...metric });
      else if (failed.has(row.external_id)) {
        const batch = result.failures?.find((failure) => failure.ids.includes(row.external_id));
        const code = batch?.code ?? `x_${!result.ok ? result.status || "error" : "error"}`;
        noteFailure("x", row, code, `X 가 이 글을 실패로 돌려줬습니다(${code}).`,
          callStatus ? { providerStatus: callStatus } : {});
      } else if (attempted.has(row.external_id)) {
        // Threads 와 같은 오진이 여기에도 있었다. 방금 올린 글은 계정 불일치가 아니다.
        const within = isWithinIngestGrace(row.published_at);
        const age = ageMinutes(row.published_at);
        noteFailure("x", row, within ? "metrics_pending_ingest" : "post_not_in_account", within
          ? `조회는 했는데 응답에 이 글이 없었고, 발행 ${age ?? "?"}분 전이라 유예 ${METRICS_INGEST_GRACE_MINUTES}분 안입니다.`
          : `조회는 했는데 응답에 이 글이 없었고, 발행 ${age ?? "?"}분 전이라 유예 ${METRICS_INGEST_GRACE_MINUTES}분을 지났습니다.`);
      } else if (!result.ok) {
        noteFailure("x", row, `x_${result.status || "error"}`,
          `X 조회 자체가 실패해 이 글까지 읽지 못했습니다(HTTP ${result.status || "알 수 없음"}).`,
          callStatus ? { providerStatus: callStatus } : {});
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
      // ok 일 때는 status 자체가 없다. 진단에 실을 상태는 실패했을 때만 있다.
      const callStatus = result.ok ? undefined : result.status;
      for (const row of targets[platform]) {
        const metric = result.metrics?.[row.external_id];
        if (metric) patches.push({ id: row.id, ...metric });
        else if (failed.has(row.external_id)) {
          const code = result.failures?.find((failure) => failure.id === row.external_id)?.code
            ?? `${platform}_${!result.ok ? result.status || "error" : "error"}`;
          noteFailure(platform, row, code, `채널이 이 글을 실패로 돌려줬습니다(${code}).`,
            callStatus ? { providerStatus: callStatus } : {});
        } else if (attempted.has(row.external_id)) {
          noteFailure(platform, row, "insights_forbidden",
            "조회는 했는데 응답에 이 글의 성과가 없었습니다. 권한 문제로 봅니다.");
        } else if (!result.ok) {
          noteFailure(platform, row, `${platform}_${result.status || "error"}`,
            `채널 조회 자체가 실패해 이 글까지 읽지 못했습니다(HTTP ${result.status || "알 수 없음"}).`,
            callStatus ? { providerStatus: callStatus } : {});
        }
      }
    });
  }

  if (youtubeCred && targets.youtube.length > 0) tasks.push(async () => {
    const result = await fetchYouTubeMetrics(youtubeCred, targets.youtube.map((row) => row.external_id));
    const attempted = new Set(result.attemptedIds ?? []);
    const failed = new Set(result.failedIds ?? []);
    // ok 일 때는 status 자체가 없다. 진단에 실을 상태는 실패했을 때만 있다.
    const callStatus = result.ok ? undefined : result.status;
    for (const row of targets.youtube) {
      const metric = result.metrics?.[row.external_id];
      if (metric) patches.push({ id: row.id, ...metric });
      else if (failed.has(row.external_id)) {
        const batch = result.failures?.find((failure) => failure.ids.includes(row.external_id));
        const code = batch?.code ?? `youtube_${!result.ok ? result.status || "error" : "error"}`;
        noteFailure("youtube", row, code, `YouTube 가 이 영상을 실패로 돌려줬습니다(${code}).`,
          callStatus ? { providerStatus: callStatus } : {});
      } else if (attempted.has(row.external_id)) {
        noteFailure("youtube", row, "video_not_visible",
          "조회는 했는데 응답에 이 영상이 없었습니다. 공개 상태나 발행 계정을 봐야 합니다.");
      } else if (!result.ok) {
        noteFailure("youtube", row, `youtube_${result.status || "error"}`,
          `YouTube 조회 자체가 실패해 이 영상까지 읽지 못했습니다(HTTP ${result.status || "알 수 없음"}).`,
          callStatus ? { providerStatus: callStatus } : {});
      }
    }
  });

  if (tiktokCred && targets.tiktok.length > 0) tasks.push(async () => {
    const result = await fetchTikTokVideoMetrics(tiktokCred.token, targets.tiktok.map((row) => row.external_id));
    if (!result.ok) {
      const code = result.status === 401 || result.status === 403 ? "insights_forbidden" : `tiktok_${result.status || "error"}`;
      // 이 갈래는 호출 한 번이 통째로 실패한 것이라 집계 코드는 하나다. 그래도 어느 글이
      // 못 채워졌는지는 글마다 남긴다. 그게 없으면 또 "뭔가 실패했다" 로 끝난다.
      for (const row of targets.tiktok) {
        patches.push({ id: row.id, blockedCode: code });
        const detail: MetricsFailureDetail = {
          postId: row.id,
          channel: "tiktok",
          code,
          publishedAt: toIsoOrNull(row.published_at),
          ageMinutes: ageMinutes(row.published_at),
          evidence: scrubEvidence(`TikTok 조회 한 번이 통째로 실패해 이 영상까지 읽지 못했습니다(HTTP ${result.status || "알 수 없음"}).`),
          operator: {
            externalId: row.external_id,
            postAccountId: row.account_id ?? null,
            collectedWithAccountId: collectedWith.tiktok ?? null,
            ...(result.status ? { providerStatus: result.status } : {}),
          },
        };
        failureDetails.push(detail);
        console.warn("[metrics][failure]", JSON.stringify({ tenantId, ...detail }));
      }
      failureCodes.push({ channel: "tiktok", code });
      return;
    }
    for (const row of targets.tiktok) {
      const metric = result.metrics[row.external_id];
      if (metric) patches.push({ id: row.id, ...metric });
      else {
        noteFailure("tiktok", row, "video_not_visible",
          "조회는 됐는데 응답에 이 영상이 없었습니다. 공개 상태나 발행 계정을 봐야 합니다.");
      }
    }
  });

  await runLimited(tasks, PROVIDER_CONCURRENCY);

  // 외부 호출이 모두 끝난 뒤 결과만 짧은 transaction으로 반영한다.
  if (patches.length > 0) await withTenant(tenantId, async (sql) => {
    for (const patch of patches) {
      if (patch.reinstate) {
        // 꼬리표만 뗀다. 성과 숫자는 건드리지 않는다. 이 글이 정말 읽히는지는 이번 수집이
        // 답한다.
        await sql`UPDATE published_posts SET provider_meta = COALESCE(provider_meta, '{}'::jsonb) - 'metricsRetired' WHERE tenant_id = ${tenantId} AND id = ${patch.id}`;
      } else if (patch.blockedCode) {
        await sql`UPDATE published_posts SET provider_meta = COALESCE(provider_meta, '{}'::jsonb) || ${sql.json({
          metricsBlocked: { code: patch.blockedCode, at: new Date().toISOString() },
          ...(patch.retire ? { metricsRetired: patch.retire } : {}),
        } as never)} WHERE tenant_id = ${tenantId} AND id = ${patch.id}`;
      } else {
        // 읽혔다는 것은 살아 있다는 것이다. 과거 판정이 무엇이었든 꼬리표를 함께 뗀다.
        await sql`UPDATE published_posts SET views = ${patch.views ?? 0}, likes = ${patch.likes ?? 0}, replies = ${patch.replies ?? 0}, reposts = ${patch.reposts ?? 0}, metrics_at = now(), provider_meta = COALESCE(provider_meta, '{}'::jsonb) - 'metricsBlocked' - 'metricsRetired' WHERE tenant_id = ${tenantId} AND id = ${patch.id}`;
      }
    }
  });

  markAnalyticsViewed(tenantId);
  const total = Object.values(targets).reduce((sum, rows) => sum + rows.length, 0);
  // 꼬리표를 뗀 것(reinstate)은 성과를 읽은 것이 아니다. 세면 수집 건수가 부풀어 오른다.
  const updated = patches.filter((patch) => !patch.blockedCode && !patch.reinstate).length;
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
    // 실패한 글마다 한 줄. 오래된 것부터 보여야 "유예 밖의 그 글" 이 맨 위에 온다.
    failureDetails: [...failureDetails].sort((a, b) => (b.ageMinutes ?? -1) - (a.ageMinutes ?? -1)),
    excluded,
    ...(failed > 0 ? { reason: failureReason(codes) } : {}),
  };
}
