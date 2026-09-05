"use client";

import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import Link from "next/link";
import { ApiResponseError, apiPost, fetcher } from "@/lib/api";
import type { EngagementCapability } from "@/lib/channel-capabilities";
import { Logo, PREVIEW_PLATFORMS, type PreviewPlatform } from "@/components/studio/PlatformPreview";
import { Button } from "@/components/shared/Button";
import { Card } from "@/components/shared/Card";
import { Stack } from "@/components/shared/Stack";
import { fmtAgo } from "@/lib/format";
import { PerformanceChatPanel } from "./PerformanceChatPanel";
import { AutomationRulesPanel } from "./AutomationRulesPanel";
import { workspaceDisplayName } from "@/lib/workspace-display-name";

export interface PerformancePost {
  id: string;
  platform: string;
  permalink?: string;
  text?: string;
  status: string;
  error?: string;
  published_at: string;
  views?: number;
  likes?: number;
  replies?: number;
  reposts?: number;
  /**
   * 이 글을 지금 계정으로는 성과를 못 잰다는 표식. 서버가 수집 시도에서 남긴다.
   * 없으면 아직 안 쟀거나 정상적으로 잰 것이다. 있으면 기다려도 안 채워진다.
   */
  metrics_blocked?: { code?: string; at?: string } | null;
}

interface PerformanceSampleAssessment {
  count: number;
  threshold: number;
  thresholdMet: boolean;
}

interface SuggestionEvidence {
  postIds: string[];
  signalIds: string[];
  sampleCount: number;
  sampleThreshold: number;
  sampleThresholdMet: boolean;
  brandContextAvailable: boolean;
  marketTrendAvailable: boolean;
}

interface PerformanceSuggestion {
  id: string;
  text: string;
  basis: "hypothesis" | "performance" | "trend";
  label: string;
  verified: boolean;
  evidence: SuggestionEvidence;
}

interface SuggestionResponse {
  suggestions?: PerformanceSuggestion[];
  sampleAssessment?: PerformanceSampleAssessment;
  note?: string;
}

interface QueueResponse {
  ok?: boolean;
  id?: string;
  reused?: boolean;
}

interface EngagementComment {
  id: string;
  parentId: string | null;
  author: string;
  body: string;
  createdAt: string;
  likeCount: number | null;
  permalink: string | null;
  state: "unread" | "deferred" | "replying" | "replied" | "editor_handoff";
  repliedAt: string | null;
  replyText: string | null;
  likedAt: string | null;
  deferredAt: string | null;
  editorHandoffAt: string | null;
  editorDraftId: string | null;
}

interface EngagementResponse {
  postId: string;
  platform: string;
  items: EngagementComment[];
  capability: EngagementCapability;
  unavailableReason?: string | null;
}

interface EngagementMutationResponse {
  ok?: boolean;
  draft?: string;
  href?: string;
}

interface UsageSummary {
  today?: Record<string, number>;
  thisWeek?: Record<string, number>;
  tier?: string;
  quota?: Record<string, number>;
}

interface PerformanceRoomProps {
  dedicated?: boolean;
  workspaceId?: string;
  workspaceName?: string;
  metricsLoaded: boolean;
  posts: PerformancePost[];
  publishedCount: number;
  followers: string;
  followerDelta?: number;
  engagementRate?: number | null;
  queuedCount: number;
  viralCount: number;
  usage?: UsageSummary;
  collecting: boolean;
  onCollectMetrics: () => Promise<void>;
}

const SAMPLE_THRESHOLD = 5;

function average(values: number[]): number {
  if (values.length === 0) return 0;
  return Math.round(values.reduce((sum, value) => sum + value, 0) / values.length);
}

function metricValue(value: string | number | null | undefined, empty: boolean): string {
  if (empty || value === null || value === undefined || value === "") return "미수집";
  return typeof value === "number" ? value.toLocaleString() : value;
}

function platformLabel(platform: string): string {
  return PREVIEW_PLATFORMS.find((item) => item.key === platform)?.label ?? platform;
}

function platformPreviewKey(platform: string): PreviewPlatform | null {
  return PREVIEW_PLATFORMS.some((item) => item.key === platform)
    ? platform as PreviewPlatform
    : null;
}

function postStatusLabel(status: string): string {
  if (status === "published") return "발행됨";
  if (status === "failed") return "오류";
  return status;
}

function PerformanceTableCell({
  label,
  children,
  className = "",
}: {
  label: string;
  children: ReactNode;
  className?: string;
}) {
  return (
    <td className={`grid grid-cols-3 gap-stack py-stack text-body-sm lg:table-cell lg:p-stack ${className}`}>
      <span className="text-caption font-semibold text-subtle lg:hidden">{label}</span>
      <span className="col-span-2 min-w-0 lg:block">{children}</span>
    </td>
  );
}

export function PerformanceRoom({
  dedicated = false,
  workspaceId,
  workspaceName,
  metricsLoaded,
  posts,
  publishedCount,
  followers,
  followerDelta,
  engagementRate,
  queuedCount,
  viralCount,
  usage,
  collecting,
  onCollectMetrics,
}: PerformanceRoomProps) {
  const [focus, setFocus] = useState<PreviewPlatform | "all">("all");
  const [suggestions, setSuggestions] = useState<PerformanceSuggestion[]>([]);
  const [sampleAssessment, setSampleAssessment] = useState<PerformanceSampleAssessment | null>(null);
  const [loadingSuggestions, setLoadingSuggestions] = useState(false);
  const [suggestionError, setSuggestionError] = useState("");
  const [queueState, setQueueState] = useState<Record<string, "loading" | "queued" | "reused" | "error">>({});
  const [engagementByPost, setEngagementByPost] = useState<Record<string, EngagementResponse>>({});
  const [engagementErrors, setEngagementErrors] = useState<Record<string, string>>({});
  const [engagementBusy, setEngagementBusy] = useState<Record<string, string>>({});
  const [replyDrafts, setReplyDrafts] = useState<Record<string, string>>({});
  const [reactionFilter, setReactionFilter] = useState<"all" | "reply" | "fix" | "hold">("all");
  const autoRequested = useRef(new Set<string>());
  const engagementRequested = useRef(new Set<string>());

  const publishedPosts = useMemo(
    () => posts.filter((post) => post.status === "published"),
    [posts],
  );
  const measuredPosts = useMemo(
    () => publishedPosts.filter((post) => post.views !== null && post.views !== undefined),
    [publishedPosts],
  );
  const focusedPosts = useMemo(
    () => focus === "all" ? publishedPosts : publishedPosts.filter((post) => post.platform === focus),
    [focus, publishedPosts],
  );
  const focusedMeasuredPosts = useMemo(
    () => focusedPosts.filter((post) => post.views !== null && post.views !== undefined),
    [focusedPosts],
  );
  const rankedPosts = useMemo(
    () => [...focusedMeasuredPosts].sort((a, b) => Number(b.views || 0) - Number(a.views || 0)),
    [focusedMeasuredPosts],
  );

  const focusedAssessment: PerformanceSampleAssessment = {
    count: focusedMeasuredPosts.length,
    threshold: SAMPLE_THRESHOLD,
    thresholdMet: focusedMeasuredPosts.length >= SAMPLE_THRESHOLD,
  };
  const assessment = focus === "all" ? sampleAssessment ?? focusedAssessment : focusedAssessment;
  const empty = focusedMeasuredPosts.length === 0;

  const winnerCount = rankedPosts.length >= SAMPLE_THRESHOLD ? 2 : Math.min(1, rankedPosts.length);
  const winnerAverage = average(rankedPosts.slice(0, winnerCount).map((post) => Number(post.views || 0)));
  const remainingAverage = average(rankedPosts.slice(winnerCount).map((post) => Number(post.views || 0)));
  const comparisonMax = Math.max(winnerAverage, remainingAverage, 1);
  const ratio = remainingAverage > 0 ? winnerAverage / remainingAverage : null;
  const verdict = empty
    ? "아직 판정할 표본이 없습니다"
    : !assessment.thresholdMet
      ? "아직 무엇이 통했는지 단정할 수 없습니다"
      : ratio
        ? `조회 상위 ${winnerCount}편이 나머지보다 ${ratio.toFixed(1)}배 멀리 갔습니다`
        : `조회 상위 ${winnerCount}편이 현재 성과를 이끌고 있습니다`;

  const totalViews = focusedPosts.reduce((sum, post) => sum + Number(post.views || 0), 0);
  const totalReplies = focusedPosts.reduce((sum, post) => sum + Number(post.replies || 0), 0);
  const topPosts = rankedPosts.slice(0, 3);
  const reactionPosts = useMemo(
    () => focusedPosts.filter((post) => Number(post.replies || 0) > 0),
    [focusedPosts],
  );

  const loadEngagement = useCallback(async (post: PerformancePost) => {
    if (!workspaceId) return;
    try {
      const response = await fetcher<EngagementResponse>(`/api/engagement?tenant_id=${encodeURIComponent(workspaceId)}&post_id=${encodeURIComponent(post.id)}`);
      setEngagementByPost((current) => ({ ...current, [post.id]: response }));
      setEngagementErrors((current) => ({ ...current, [post.id]: "" }));
    } catch {
      setEngagementErrors((current) => ({ ...current, [post.id]: "댓글 본문을 불러오지 못했습니다. 잠시 후 다시 시도해주세요." }));
    }
  }, [workspaceId]);

  useEffect(() => {
    for (const post of reactionPosts.slice(0, 10)) {
      if (engagementRequested.current.has(post.id)) continue;
      engagementRequested.current.add(post.id);
      void loadEngagement(post);
    }
  }, [loadEngagement, reactionPosts]);

  const commentKey = (postId: string, commentId: string) => `${postId}:${commentId}`;

  const engagementAction = async (
    post: PerformancePost,
    comment: EngagementComment,
    action: "draft_reply" | "send_reply" | "like" | "defer" | "editor_handoff",
  ) => {
    if (!workspaceId) return;
    const key = commentKey(post.id, comment.id);
    setEngagementBusy((current) => ({ ...current, [key]: action }));
    setEngagementErrors((current) => ({ ...current, [key]: "" }));
    try {
      const response = await apiPost<EngagementMutationResponse>("/api/engagement", {
        tenant_id: workspaceId,
        post_id: post.id,
        comment_id: comment.id,
        action,
        text: replyDrafts[key] ?? "",
        request_key: typeof crypto.randomUUID === "function" ? crypto.randomUUID() : `reply-${Date.now()}-${comment.id}`,
      });
      if (action === "draft_reply" && response?.draft) {
        setReplyDrafts((current) => ({ ...current, [key]: response.draft! }));
      } else if (action === "editor_handoff" && response?.href) {
        window.location.assign(response.href);
      } else {
        await loadEngagement(post);
      }
    } catch (error) {
      const message = error instanceof ApiResponseError ? error.message : "댓글 동작을 처리하지 못했습니다. 잠시 후 다시 시도해주세요.";
      setEngagementErrors((current) => ({ ...current, [key]: message }));
    } finally {
      setEngagementBusy((current) => ({ ...current, [key]: "" }));
    }
  };

  const visibleEngagement = reactionPosts.slice(0, 10).flatMap((post) =>
    (engagementByPost[post.id]?.items ?? []).map((comment) => ({ post, comment, capability: engagementByPost[post.id].capability })),
  ).filter(({ comment }) => {
    if (reactionFilter === "reply") return comment.state === "unread" || comment.state === "replying";
    if (reactionFilter === "fix") return comment.state === "editor_handoff";
    if (reactionFilter === "hold") return comment.state === "deferred";
    return true;
  });

  const loadSuggestions = useCallback(async () => {
    if (!workspaceId || loadingSuggestions) return;
    setLoadingSuggestions(true);
    setSuggestionError("");
    try {
      const response = await apiPost<SuggestionResponse>("/api/suggestions", { tenant_id: workspaceId });
      setSuggestions(response?.suggestions ?? []);
      setSampleAssessment(response?.sampleAssessment ?? null);
      if (!response?.suggestions?.length) {
        setSuggestionError(response?.note || "제안을 만들지 못했어요. 잠시 후 다시 받아 주세요.");
      }
    } catch {
      setSuggestionError("제안을 불러오지 못했어요. 잠시 후 다시 받아 주세요.");
    } finally {
      setLoadingSuggestions(false);
    }
  }, [loadingSuggestions, workspaceId]);

  useEffect(() => {
    if (!metricsLoaded || measuredPosts.length !== 0 || !workspaceId || autoRequested.current.has(workspaceId)) return;
    autoRequested.current.add(workspaceId);
    void loadSuggestions();
  }, [loadSuggestions, measuredPosts.length, metricsLoaded, workspaceId]);

  const enqueueSuggestion = async (suggestion: PerformanceSuggestion) => {
    if (!workspaceId || queueState[suggestion.id] === "loading") return;
    setQueueState((current) => ({ ...current, [suggestion.id]: "loading" }));
    try {
      const response = await apiPost<QueueResponse>("/api/suggestions/enqueue", {
        tenant_id: workspaceId,
        suggestion,
      });
      setQueueState((current) => ({
        ...current,
        [suggestion.id]: response?.reused ? "reused" : "queued",
      }));
    } catch {
      setQueueState((current) => ({ ...current, [suggestion.id]: "error" }));
    }
  };

  const coreMetrics = [
    { label: "조회", value: metricValue(totalViews, empty), detail: empty ? "발행 뒤부터 집계" : "선택한 플랫폼 합계" },
    { label: "저장", value: "미수집", detail: "채널 제공 뒤부터 집계" },
    { label: "답글", value: metricValue(totalReplies, empty), detail: empty ? "발행 뒤부터 집계" : "선택한 플랫폼 합계" },
    { label: "구독", value: metricValue(followers, empty), detail: empty ? "발행 뒤부터 집계" : followerDelta === undefined ? "지난 기간 비교 미수집" : `이번 주 ${followerDelta >= 0 ? "+" : ""}${followerDelta}` },
  ];
  const previewCoreMetrics = [
    { label: "조회", value: "18,420", detail: "12% 증가" },
    { label: "저장", value: "1,284", detail: "24% 증가" },
    { label: "답글", value: "316", detail: "8% 증가" },
    { label: "구독", value: "428", detail: "31명 증가" },
  ];
  const secondaryMetrics = [
    { label: "총 발행", value: metricValue(focus === "all" ? publishedCount : focusedPosts.length, empty) },
    { label: "참여율", value: metricValue(focus === "all" && engagementRate != null ? `${engagementRate}%` : null, empty) },
    { label: "대기 큐", value: metricValue(queuedCount, empty) },
    { label: "터진 글", value: metricValue(viralCount, empty) },
    { label: "도달", value: "미수집" },
    { label: "참여", value: "미수집" },
  ];

  const roomColumn = dedicated ? "lg:col-start-1" : "";
  const RoomTitle = dedicated ? "h1" : "p";
  const VerdictTitle = dedicated ? "h2" : "h1";

  return (
    <div className={`mb-region gap-region ${dedicated ? "grid lg:grid-cols-[minmax(0,1fr)_20rem]" : "space-y-region"}`} data-room="performance" data-performance-layout={dedicated ? "dedicated" : "embedded"}>
      <section
        aria-label="이 방에서 지금 알아야 할 것"
        className={`${roomColumn} flex min-h-control-touch flex-wrap items-start gap-stack rounded-surface border border-border bg-surface px-pad-inset py-stack`}
        data-room-top="performance"
      >
        <div className="mr-auto min-w-0">
          <p className="text-caption font-semibold text-accent">4단계</p>
          <RoomTitle className="text-heading font-bold text-text">성과실</RoomTitle>
          <p className="break-keep text-body-sm text-muted">채널 전체를 먼저 보고, 잘된 이유와 다음 행동을 확인합니다.</p>
        </div>
        <div className="text-right">
          <b className="block text-body font-bold tabular-nums text-accent">표본 {assessment.count}건</b>
          <span className="text-caption text-muted">최근 30일</span>
        </div>
        <Link
          href="/calendar?from=performance"
          className="ml-auto inline-flex min-h-control-touch shrink-0 items-center rounded-control border border-border bg-surface-2 px-stack text-caption font-semibold text-muted hover:bg-surface"
        >
          발행 캘린더에서 보기
        </Link>
      </section>

      <div className={dedicated ? "lg:sticky lg:top-pad-inset lg:col-start-2 lg:row-start-1 lg:row-span-[12] lg:h-fit" : ""}>
        <PerformanceChatPanel workspaceId={workspaceId} posts={posts} focus={focus} expandedByDefault={dedicated} />
      </div>

      <section
        className={`${roomColumn} card p-region`}
        data-perf-verdict={empty ? "empty" : assessment.thresholdMet ? "ready" : "thin"}
        data-perf-sample={assessment.count}
        data-sample-threshold={assessment.threshold}
        data-sample-met={assessment.thresholdMet}
      >
        <Stack gap={16}>
          <Stack gap={8}>
            <p className="text-caption font-semibold text-subtle">성과 요약 · {workspaceDisplayName(workspaceName)} · 최근 30일</p>
            <VerdictTitle className="flex items-start gap-stack text-display font-bold text-text break-keep">
              <span aria-hidden="true" className="mt-micro inline-grid size-stack-section shrink-0 place-items-center rounded-pill bg-accent text-caption text-accent-fg">1</span>
              <span>{verdict}</span>
            </VerdictTitle>
            <p className="text-body-sm text-muted break-keep">
              {!assessment.thresholdMet && <span className="mr-stack-tight inline-flex rounded-pill bg-warning/15 px-stack-tight py-micro font-semibold text-warning">근거 부족</span>}
              성과 표본 {assessment.count}건입니다. {assessment.threshold}건부터 판정합니다.
            </p>
          </Stack>

          {!empty && (
            <div className="rounded-surface border border-border bg-surface-2 p-stack" data-perf-proof="2">
              <Stack gap={8}>
                <div className="grid grid-cols-[minmax(0,1fr)_auto] items-center gap-stack sm:grid-cols-[minmax(0,1fr)_minmax(0,2fr)_auto]">
                  <span className="text-caption font-semibold text-text break-keep">조회 상위 {winnerCount}편 평균</span>
                  <progress className="progress-semantic order-last col-span-2 h-stack-tight w-full sm:order-none sm:col-span-1" max={comparisonMax} value={winnerAverage} aria-label={`조회 상위 ${winnerCount}편 평균 ${winnerAverage.toLocaleString()}`} />
                  <b className="text-body-sm tabular-nums text-text">{winnerAverage.toLocaleString()} 조회</b>
                </div>
                <div className="grid grid-cols-[minmax(0,1fr)_auto] items-center gap-stack sm:grid-cols-[minmax(0,1fr)_minmax(0,2fr)_auto]">
                  <span className="text-caption font-semibold text-text break-keep">나머지 글 평균</span>
                  <progress className="progress-semantic order-last col-span-2 h-stack-tight w-full opacity-60 sm:order-none sm:col-span-1" max={comparisonMax} value={remainingAverage} aria-label={`나머지 글 평균 ${remainingAverage.toLocaleString()}`} />
                  <b className="text-body-sm tabular-nums text-text">{remainingAverage.toLocaleString()} 조회</b>
                </div>
              </Stack>
            </div>
          )}

          {empty ? (
            <div className="grid gap-stack rounded-surface border border-border bg-surface p-pad-inset sm:grid-cols-[minmax(0,1fr)_auto] sm:items-center" data-perf-empty-guide>
              <div>
                <h3 className="text-body font-bold text-text">아직 성과를 수집할 채널이 없습니다</h3>
                <p className="mt-micro break-keep text-caption text-muted">채널을 연결하면 발행한 글의 조회, 저장, 답글, 구독이 이곳에 모입니다. 연결 뒤 첫 수집까지 시간이 조금 걸립니다.</p>
              </div>
              <Link href="/settings?tab=channels" className="inline-flex min-h-control-touch items-center justify-center rounded-control bg-accent px-stack text-caption font-semibold text-accent-fg">채널 연결하기</Link>
            </div>
          ) : null}

          <Stack direction="horizontal" gap={4} scroll className="scrollbar-semantic pb-micro" role="group" aria-label="플랫폼 집중">
            <Button variant={focus === "all" ? "primary" : "secondary"} size="sm" aria-pressed={focus === "all"} onClick={() => setFocus("all")}>전체</Button>
            {PREVIEW_PLATFORMS.map((platform) => (
              <Button key={platform.key} variant={focus === platform.key ? "primary" : "secondary"} size="sm" aria-pressed={focus === platform.key} onClick={() => setFocus(platform.key)}>
                <Logo p={platform.key} />
                <span>{platform.label}</span>
              </Button>
            ))}
          </Stack>
          <span className="text-caption text-subtle sm:hidden">옆으로 밀어 더 보기</span>
          {focus !== "all" && (
            <Link
              href={`/channels/${focus}`}
              className="inline-flex w-fit items-center gap-micro text-caption font-semibold text-accent hover:underline"
            >
              {platformLabel(focus)} 계정 자세히 보기 →
            </Link>
          )}

          {empty ? (
            <p className="text-caption text-muted" data-perf-preview-note><span className="mr-stack-tight rounded-pill bg-surface-2 px-stack-tight py-micro font-semibold">예시 데이터</span>채널을 연결하면 아래 자리가 실제 수치로 바뀝니다.</p>
          ) : null}
          <div className={`grid grid-cols-2 gap-stack-tight lg:grid-cols-4 ${empty ? "opacity-60" : ""}`} data-perf-tier="core" data-perf-preview={empty ? "example" : undefined}>
            {(empty ? previewCoreMetrics : coreMetrics).map((metric) => (
              <Card key={metric.label} className="p-pad-inset">
                <Stack gap={4}>
                  <span className="text-caption text-muted">{metric.label}</span>
                  <b className="text-heading font-bold tabular-nums text-text">{metric.value}</b>
                  <small className="text-caption text-subtle break-keep">{metric.detail}</small>
                </Stack>
              </Card>
            ))}
          </div>

          {!empty ? (
            <div className="flex flex-wrap gap-x-stack-section gap-y-micro border-t border-border pt-stack" data-perf-tier="rest">
              {secondaryMetrics.map((metric) => (
                <span key={metric.label} className="inline-flex items-baseline gap-stack-tight">
                  <small className="text-caption text-muted">{metric.label}</small>
                  <b className="text-body font-bold tabular-nums text-text">{metric.value}</b>
                </span>
              ))}
            </div>
          ) : null}

          {usage && (
            <div className="flex flex-wrap items-center gap-x-stack-section gap-y-micro border-t border-border pt-stack text-caption text-muted">
              {usage.tier && <span className="rounded-pill bg-accent-soft px-stack-tight py-micro font-semibold text-accent">{usage.tier} 요금제</span>}
              <span>오늘 생성 {usage.today?.aiGenerations || 0} · 발행 {usage.today?.publications || 0} · 크론 {usage.today?.cronRuns || 0}</span>
              <span>이번 주 생성 {usage.thisWeek?.aiGenerations || 0} · 발행 {usage.thisWeek?.publications || 0} · 크론 {usage.thisWeek?.cronRuns || 0}</span>
            </div>
          )}
        </Stack>
      </section>

      <section className={`${roomColumn} border-t border-border pt-stack-section`} data-perf-loop={topPosts.length}>
        <Stack gap={16}>
          <Stack gap={4}>
            <h2 className="text-subheading font-bold text-text"><span aria-hidden="true" className="mr-stack-tight inline-grid size-stack-section place-items-center rounded-pill bg-accent text-caption text-accent-fg">2</span>무엇이 통했나</h2>
            <p className="text-caption text-muted">위 판정이 어느 글에서 나왔는지</p>
          </Stack>
          {topPosts.length > 0 ? (
            <div className="grid gap-stack lg:grid-cols-3">
              {topPosts.map((post, index) => {
                const previewKey = platformPreviewKey(post.platform);
                return (
                  <Card key={post.id} className={`p-pad-inset ${index === 0 ? "border-accent ring-4 ring-accent-soft" : ""}`}>
                    <Stack gap={12}>
                      <div className="min-h-control-touch rounded-control border border-border bg-surface-2 p-stack">
                        <Stack gap={8}>
                          <div className="flex items-center gap-stack-tight text-caption font-semibold text-text">
                            {previewKey && <Logo p={previewKey} />}
                            <span>{platformLabel(post.platform)}</span>
                          </div>
                          <p className="line-clamp-3 text-body-sm text-muted break-keep">{post.text || "게시물 본문 미수집"}</p>
                        </Stack>
                      </div>
                      <span className="text-caption font-semibold text-accent">{index === 0 ? "가장 멀리 간 글" : `조회 ${index + 1}위`}</span>
                      <b className="line-clamp-2 text-body font-bold text-text break-keep">{post.text || "제목 미수집"}</b>
                      <div className="flex flex-wrap gap-stack-section text-caption text-muted">
                        <span>조회 <b className="text-text">{Number(post.views || 0).toLocaleString()}</b></span>
                        <span>좋아요 <b className="text-text">{Number(post.likes || 0).toLocaleString()}</b></span>
                        <span>답글 <b className="text-text">{Number(post.replies || 0).toLocaleString()}</b></span>
                      </div>
                      {index === 0 && (
                        <Button
                          aria-controls="performance-suggestions"
                          className="w-full"
                          disabled={loadingSuggestions || !workspaceId}
                          onClick={() => void loadSuggestions()}
                          variant="primary"
                        >
                          {loadingSuggestions ? "제안 불러오는 중" : "이 결로 한 편 더"}
                        </Button>
                      )}
                      {post.permalink && <a className="text-caption font-semibold text-accent hover:underline" href={post.permalink} target="_blank" rel="noopener noreferrer">실제 게시물 보기</a>}
                    </Stack>
                  </Card>
                );
              })}
            </div>
          ) : (
            <div className="rounded-surface border border-dashed border-border p-pad-inset text-body-sm text-muted break-keep">
              아직 통한 글을 판정할 수 없습니다. 첫 편이 나가면 실제 모습과 성과가 이 자리에 쌓입니다.
            </div>
          )}
        </Stack>
      </section>

      <section className={`${roomColumn} border-t border-border pt-stack-section`} data-perf-suggestions={suggestions.length} id="performance-suggestions">
        <Stack gap={16}>
          <div className="flex flex-wrap items-center justify-between gap-stack">
            <Stack gap={4}>
              <h2 className="text-subheading font-bold text-text">성과에서 제안으로</h2>
            </Stack>
            <Button onClick={() => void loadSuggestions()} disabled={loadingSuggestions || !workspaceId}>
              {loadingSuggestions ? "제안 불러오는 중" : suggestions.length ? "제안 새로 받기" : "성과에서 제안 받기"}
            </Button>
          </div>
          {suggestionError && <p role="alert" className="rounded-control bg-danger/10 p-stack text-body-sm text-danger break-keep">{suggestionError}</p>}
          {suggestions.length > 0 && (
            <div className="grid items-stretch gap-stack lg:grid-cols-3">
              {suggestions.map((suggestion) => {
                const state = queueState[suggestion.id];
                return (
                  <Card key={suggestion.id} className={`flex h-full flex-col ${suggestion.verified ? "p-pad-inset" : "border-dashed p-pad-inset"}`}>
                    <Stack gap={12} className="h-full">
                      <span className={`self-start rounded-pill px-stack-tight py-micro text-caption font-semibold ${suggestion.verified ? "bg-success/15 text-success" : "bg-warning/15 text-warning"}`}>{suggestion.label}</span>
                      <p className="break-keep text-body font-semibold text-text">{suggestion.text}</p>
                      <Button variant="primary" className="ds-label-fill mt-auto w-full min-w-0" disabled={state === "loading" || state === "queued" || state === "reused"} onClick={() => void enqueueSuggestion(suggestion)}>
                        {state === "loading" ? "새 콘텐츠 준비하는 중" : state === "queued" ? "생성실 대기 목록에 넣었어요" : state === "reused" ? "이미 생성실 대기 목록에 있어요" : "이 제안으로 새 콘텐츠 만들기"}
                      </Button>
                      {state === "queued" || state === "reused" ? (
                        <Link href="/studio" className="text-caption font-semibold text-accent hover:underline">생성실에서 바로 확인하기</Link>
                      ) : null}
                      {state === "error" && <p role="alert" className="text-caption text-danger break-keep">준비하지 못했어요. 잠시 후 다시 눌러 주세요.</p>}
                    </Stack>
                  </Card>
                );
              })}
            </div>
          )}
        </Stack>
      </section>

      <section className={`${roomColumn} border-t border-border pt-stack-section`} data-perf-comments={reactionPosts.length}>
        <Stack gap={16}>
          <Stack gap={4}>
            <h2 className="text-subheading font-bold text-text"><span aria-hidden="true" className="mr-stack-tight inline-grid size-stack-section place-items-center rounded-pill bg-accent text-caption text-accent-fg">3</span>달린 반응</h2>
          </Stack>
          {reactionPosts.length > 0 ? (
            <div className="grid min-w-0 gap-stack lg:grid-cols-[minmax(0,12rem)_minmax(0,1fr)]" data-engagement-stream>
              <aside aria-label="댓글 분류" className="min-w-0 rounded-surface border border-border bg-surface-2 p-stack">
                <Stack gap={8}>
                  <p className="text-caption font-semibold text-subtle">무엇부터</p>
                  {([
                    ["all", "전체"], ["reply", "답할 것"], ["fix", "고칠 것"], ["hold", "보류"],
                  ] as const).map(([value, label]) => (
                    <Button key={value} size="sm" variant={reactionFilter === value ? "primary" : "secondary"} aria-pressed={reactionFilter === value} onClick={() => setReactionFilter(value)}>
                      {label}
                    </Button>
                  ))}
                </Stack>
              </aside>
              <div className="min-w-0 divide-y divide-border border-y border-border">
                {visibleEngagement.map(({ post, comment, capability }) => {
                  const key = commentKey(post.id, comment.id);
                  const busy = engagementBusy[key];
                  const draft = replyDrafts[key] ?? comment.replyText ?? "";
                  return (
                    <article key={key} className="py-pad-inset" data-engagement-comment={comment.id}>
                      <Stack gap={12}>
                        <div className="flex flex-wrap items-center gap-stack-tight">
                          <b className="text-body text-text">{comment.author}</b>
                          <span className="text-caption text-muted">{platformLabel(post.platform)} · {fmtAgo(comment.createdAt)}</span>
                          <span className="ml-auto rounded-pill bg-surface-2 px-stack-tight py-micro text-caption font-semibold text-muted">
                            {comment.state === "deferred" ? "보류" : comment.state === "editor_handoff" ? "편집실로" : comment.state === "replied" ? "답함" : "답할 것"}
                          </span>
                        </div>
                        <div className="flex flex-wrap items-center gap-stack-tight text-caption text-subtle">
                          <p className="min-w-0 flex-1 break-keep">올린 글 · {post.text || "게시물 본문 미수집"}</p>
                          {post.permalink
                            ? <a className="font-semibold text-accent" href={post.permalink} target="_blank" rel="noopener noreferrer">게시물에서 확인하기</a>
                            : <span>원문 연동 준비 중</span>}
                        </div>
                        <p className="text-body text-text break-keep">{comment.body || "댓글 본문 미수집"}</p>
                        {comment.likeCount !== null && <p className="text-caption text-muted">좋아요 {comment.likeCount.toLocaleString()}개</p>}
                        <label className="grid gap-micro text-caption font-semibold text-muted">
                          답글
                          <textarea
                            aria-label={`${comment.author} 답글`}
                            className="min-h-control-comfortable w-full rounded-control border border-border bg-surface px-stack py-stack text-body text-text"
                            maxLength={1000}
                            value={draft}
                            onChange={(event) => setReplyDrafts((current) => ({ ...current, [key]: event.target.value }))}
                          />
                        </label>
                        <div className="flex flex-wrap gap-stack-tight">
                          <Button disabled={Boolean(busy) || comment.state === "replied"} onClick={() => void engagementAction(post, comment, "draft_reply")}>
                            {busy === "draft_reply" ? "초안 만드는 중" : "답글 초안 만들기"}
                          </Button>
                          <Button variant="primary" disabled={Boolean(busy) || !draft.trim() || comment.state === "replied"} onClick={() => void engagementAction(post, comment, "send_reply")}>
                            {busy === "send_reply" ? "답글 보내는 중" : comment.state === "replied" ? "답글 보냄" : "이 답글 보내기"}
                          </Button>
                          {capability.like.supported ? (
                            <Button disabled={Boolean(busy) || Boolean(comment.likedAt)} onClick={() => void engagementAction(post, comment, "like")}>
                              {comment.likedAt ? "좋아요 함" : busy === "like" ? "좋아요 처리 중" : "좋아요"}
                            </Button>
                          ) : null}
                          <Button disabled={Boolean(busy) || comment.state === "deferred"} onClick={() => void engagementAction(post, comment, "defer")}>
                            {comment.state === "deferred" ? "나중 처리로 보냄" : "나중 처리"}
                          </Button>
                          <Button disabled={Boolean(busy) || comment.state === "editor_handoff"} onClick={() => void engagementAction(post, comment, "editor_handoff")}>
                            {comment.state === "editor_handoff" ? "편집실로 넘김" : "편집실에서 고치기"}
                          </Button>
                        </div>
                        {!capability.like.supported && capability.like.reason ? <p className="text-caption text-subtle break-keep">좋아요 미지원: {capability.like.reason}</p> : null}
                        {engagementErrors[key] ? <p role="alert" className="text-caption text-danger break-keep">{engagementErrors[key]}</p> : null}
                      </Stack>
                    </article>
                  );
                })}
                {reactionPosts.map((post) => {
                  const response = engagementByPost[post.id];
                  const error = engagementErrors[post.id];
                  if (!response?.unavailableReason && !error && response) return null;
                  return (
                    <div key={`state-${post.id}`} className="flex flex-wrap items-center gap-stack py-pad-inset text-body-sm text-muted break-keep">
                      <p className="min-w-0 flex-1"><b className="text-text">{platformLabel(post.platform)}</b>: {error || response?.unavailableReason || "댓글 본문을 불러오는 중입니다."}</p>
                      {post.permalink
                        ? <a className="font-semibold text-accent" href={post.permalink} target="_blank" rel="noopener noreferrer">게시물에서 확인하기</a>
                        : <span className="text-caption text-subtle">원문 연동 준비 중</span>}
                    </div>
                  );
                })}
                {visibleEngagement.length === 0 && reactionPosts.slice(0, 10).every((post) => engagementByPost[post.id]) ? (
                  <div className="py-pad-inset text-body-sm text-muted break-keep">선택한 분류에 표시할 댓글이 없습니다.</div>
                ) : null}
              </div>
            </div>
          ) : (
            <div className="rounded-surface border border-dashed border-border p-pad-inset text-body-sm text-muted break-keep">
              {/*
                2026-09-05 회장 계정 실측: 글은 이미 나갔는데도 "첫 편이 나가면 모입니다"
                라고 말하고 있었다. 실제 이유는 성과 수집이 막힌 것인데 빈 화면이 엉뚱한
                이유를 대면 사용자는 기다리기만 한다. Sprout 의 통합 인박스도 비어 있을 때
                왜 비었는지와 다음 조치를 같이 준다. 나간 글이 있는지로 문구를 가른다.
              */}
              {publishedCount > 0
                ? "글은 나갔는데 반응을 아직 못 모았습니다. 위의 성과 다시 수집하기를 눌러 보시고, 거절 안내가 뜨면 그 안내대로 채널을 다시 연결해 주세요."
                : "아직 달린 반응이 없습니다. 첫 편이 나가면 댓글과 반응이 이 자리에 모입니다."}
            </div>
          )}
        </Stack>
      </section>

      <div className={roomColumn}><AutomationRulesPanel workspaceId={workspaceId} /></div>

      <section className={`${roomColumn} border-t border-border pt-stack-section`} data-perf-inherit="app/page.tsx">
        <details>
          <summary className="flex min-h-control-touch cursor-pointer items-center gap-stack text-body font-bold text-text">
            <span>올린 글별 성적</span>
            <span className="text-caption font-normal text-muted">{posts.length}건</span>
          </summary>
          <div className="pt-stack">
            <table className="block w-full text-body lg:table">
              <thead className="hidden lg:table-header-group">
                <tr className="border-b border-border text-caption text-subtle">
                  <th className="p-stack text-left">플랫폼</th>
                  <th className="p-stack text-left">내용</th>
                  <th className="p-stack">상태</th>
                  <th className="p-stack">조회</th>
                  <th className="p-stack">좋아요</th>
                  <th className="p-stack">답글</th>
                  <th className="p-stack">발행</th>
                </tr>
              </thead>
              <tbody className="block divide-y divide-border lg:table-row-group">
                {posts.map((post) => (
                  <tr key={post.id} className="block py-stack text-muted lg:table-row lg:border-b lg:border-border lg:py-none">
                    <PerformanceTableCell label="플랫폼">{platformLabel(post.platform)}</PerformanceTableCell>
                    <PerformanceTableCell label="내용" className="lg:max-w-xs">
                      <span className="line-clamp-2">{post.text || "게시물 본문 미수집"}</span>
                      {post.status === "failed" && <span className="block text-caption text-danger">{post.error?.slice(0, 60)}</span>}
                    </PerformanceTableCell>
                    <PerformanceTableCell label="상태" className="lg:text-center">
                      <span className={`rounded-pill px-stack-tight py-micro text-caption ${post.status === "published" ? "bg-success/15 text-success" : "bg-danger/15 text-danger"}`}>{postStatusLabel(post.status)}</span>
                    </PerformanceTableCell>
                    {/*
                      "미수집"과 "측정 불가"는 다르다. 앞은 기다리면 채워지고, 뒤는 계정을
                      바꾸기 전까지 영원히 안 채워진다. 같은 말로 쓰면 사용자는 무한정
                      기다린다(2026-09-05 회장 계정 실측).
                    */}
                    <PerformanceTableCell label="조회" className="tabular-nums lg:text-center">{post.views ?? (post.metrics_blocked ? "측정 불가" : "미수집")}</PerformanceTableCell>
                    <PerformanceTableCell label="좋아요" className="tabular-nums lg:text-center">{post.likes ?? (post.metrics_blocked ? "측정 불가" : "미수집")}</PerformanceTableCell>
                    <PerformanceTableCell label="답글" className="tabular-nums lg:text-center">{post.replies ?? (post.metrics_blocked ? "측정 불가" : "미수집")}</PerformanceTableCell>
                    <PerformanceTableCell label="발행" className="text-subtle lg:text-center">{fmtAgo(post.published_at)}</PerformanceTableCell>
                  </tr>
                ))}
                {posts.length === 0 && <tr className="block lg:table-row"><td colSpan={7} className="block p-stack-section text-center text-caption text-subtle lg:table-cell">아직 나간 글이 없습니다. 발행실에서 올리면 여기에 쌓입니다.</td></tr>}
              </tbody>
            </table>
          </div>
          <div className="mt-stack flex flex-wrap gap-stack">
            <Button onClick={() => void onCollectMetrics()} disabled={collecting || !workspaceId}>{collecting ? "성과 수집 중" : "성과 다시 수집하기"}</Button>
          </div>
        </details>
      </section>
    </div>
  );
}
