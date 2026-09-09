"use client";

import { useRef, useState, useEffect, useCallback } from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import useSWR from "swr";
import {
  fetcher,
  apiPost,
  isExternalPublishPersistenceError,
  ApiResponseError,
  type ExternalPublishPersistenceFailure,
} from "@/lib/api";
import { useToast } from "@/components/layout/Toast";
import { PlatformPreview, PREVIEW_PLATFORMS, type PreviewAccount, type PreviewInlineEditor, type PreviewPlatform } from "@/components/studio/PlatformPreview";
import { PlatformFocusFilter } from "@/components/studio/PlatformFocusFilter";
import { CreateRoom, EditRoom, type CreateContentBranch, type CreateKind, type CreateStructureChoice, type EditContentKind } from "@/components/studio/StudioRooms";
import type { StudioGenerationCandidate } from "@/lib/studio/generation/client";
import { useUsage } from "@/hooks/useOverview";
import { useUIStore, type StudioRoom } from "@/store/ui-store";
import { LearningCardWizard } from "@/components/studio/LearningCardWizard";
import { LearningStatus } from "@/components/studio/LearningStatus";
import { buildImagePrompt, pickImageSubject } from "@/components/studio/image-style";
import { countFilledUserSlots, fetchLearningInfo, mergeLearningInfo, readLearningInfo, saveLearningInfo, type LearningInfo } from "@/components/studio/learning-info";
import { RepoConnect } from "@/components/studio/RepoConnect";
import { SchedulePanel } from "@/components/studio/SchedulePanel";
import { trackEvent, type AnalyticsChannel } from "@/lib/analytics/events";
import { authHeaders } from "@/lib/auth";
import { CHANNEL_TEXT_LIMITS, countTextCharacters } from "@/lib/channel-text-limits";
import { Button } from "@/components/shared/Button";
import { CostApprovalDialog, type CostApprovalRequest } from "@/components/studio/CostApprovalDialog";
import { ConfirmDialog, type ConfirmRequest } from "@/components/shared/ConfirmDialog";
import { CREATE_DRAFT_STORAGE_PREFIX } from "@/components/studio/StudioRooms";
import { RoomHeader } from "@/components/shared/RoomHeader";
import { Field } from "@/components/shared/Field";
import { Stack } from "@/components/shared/Stack";
import { GettingStartedStrip } from "@/components/shared/GettingStartedStrip";
import { SCHEDULABLE_PLATFORMS } from "@/lib/constants";
import type { CardTextPosition } from "@/components/studio/EditPreview";
import type { EditorHandoff } from "@/lib/studio/editor-handoff";
import { resolveStudioRoom, shouldLoadPublishResources } from "@/lib/studio/room-routing";
import {
  HASHTAG_BUDGET,
  parseHashtags,
  parsePublishCommand,
  spreadHashtags,
  type BulkPlatform,
} from "@/lib/studio/publish-bulk";
import { buildPublishReturnWork, readPublishReturnRequest, resolvePublishReturnDraftId } from "@/lib/publish-return-context";
import {
  defaultContentEditFormat,
  validateContentEditFormat,
  type ContentEditFormat,
} from "@/lib/studio/content-edit-format";
import {
  buildPlatformPublishText,
  trimBodyToFit,
  validatePlatformPublish,
  type PlatformPublishInput,
} from "@/lib/studio/platform-publish-fields";
import type { CurrentWork } from "@/lib/studio/current-work";
import { attemptRequiredDraftPersistence } from "@/lib/studio/required-draft-persistence";
import { PLATFORM_FIELD_CONTRACT } from "@/lib/studio/platform-publish-fields";
import { DEFAULT_COVER_SECONDS, coverUnsupportedReason, supportsCoverTimestamp } from "@/lib/video-cover";

// SNS-007: /api/publish가 실제로 계정별 발행을 받는 4개 플랫폼(threads/x/facebook/instagram)만
// 계정 셀렉터를 노출한다. shorts/reels/tiktok은 /api/publish 미지원(실발행 분기 없음. 위
// ChannelConnect.tsx 주석과 동일 SSOT 판단)이라 대상에서 뺀다.
const PREVIEW_PLATFORM_KEYS = new Set<string>(PREVIEW_PLATFORMS.map((platform) => platform.key));
/**
 * 영상으로 올리는 채널. 글 발행 경로가 아니라 영상 발행 경로(/api/video/publish)로 간다.
 *
 * 2026-09-08 회장 실사용: "왜 영상쪽은 다 미지원이라고 뜸". 영상 발행 기능은 이미 다
 * 구현돼 있는데 발행실이 그 경로를 부르지 않아 세 칸이 "미지원" 으로 닫혀 있었다.
 * 만든 영상을 올릴 데가 없으면 영상을 만들 이유가 없다.
 */
const VIDEO_ROOM_PLATFORMS = new Set<PreviewPlatform>(["shorts", "reels", "tiktok"] as PreviewPlatform[]);
/** 영상 발행 경로가 쓰는 플랫폼 이름. 화면 이름과 다르다. */
const VIDEO_PUBLISH_NAME: Record<string, string> = { shorts: "youtube", reels: "reels", tiktok: "tiktok" };
/** 영상 채널이 쓰는 계정 제공자. 릴스는 인스타그램 계정을 쓴다. */
const VIDEO_ACCOUNT_PROVIDER: Record<string, string> = { shorts: "youtube", reels: "instagram", tiktok: "tiktok" };

import { draftStatusLabel } from "@/lib/studio/draft-status-label";

const ROOM_LABEL: Record<StudioRoom, string> = { create: "생성실", edit: "편집실", publish: "발행실" };



/**
 * 이 작업물을 누르면 어느 방으로 데려갈 것인가.
 *
 * 2026-09-09 회장 지적: "작업물 클릭하면 어디로 이동해서 뭘 하는건지."
 * 종전에는 눌러도 방이 안 바뀌고 상태만 조용히 채워졌다. 무엇이 일어났는지도,
 * 이제 어디로 가야 하는지도 화면이 말하지 않았다.
 *
 * 판정은 그 작업물이 어디까지 왔는지로 한다. 이미 발행했으면 발행실, 본문이 있으면
 * 이어서 다듬을 편집실, 아직 아무것도 없으면 생성실이다.
 */
function draftLandingRoom(draft: Record<string, unknown>): StudioRoom {
  const status = typeof draft.status === "string" ? draft.status : "";
  if (status === "published" || status === "scheduled") return "publish";
  const text = draft.text as Record<string, unknown> | null | undefined;
  const hasBody = !!text && typeof text === "object" && Object.values(text).some((v) => typeof v === "string" ? v.trim() : v);
  return hasBody ? "edit" : "create";
}

// 채널 화면 주소는 제공자 이름으로 만든다.
// 2026-09-08 회장 실사용: 발행실에서 쇼츠·릴스의 "계정 관리" 를 누르면 "알 수 없는 채널: shorts"
// 만 뜨고 아무것도 못 했다. 계정 **조회**는 이미 제공자로 바꿔 부르고 있었는데(YouTube·Instagram)
// **링크만** 미리보기 이름을 그대로 붙이고 있었다. /channels/shorts 라는 화면은 없다.
// 같은 값을 두 곳에서 각각 만들면 한쪽만 낡는다. 한 함수로 만든다.
function channelHref(platform: string): string {
  return `/channels/${VIDEO_ACCOUNT_PROVIDER[platform] || platform}`;
}

const PUBLISH_SUPPORTED = new Set<PreviewPlatform>([
  ...(SCHEDULABLE_PLATFORMS.filter((platform) => PREVIEW_PLATFORM_KEYS.has(platform)) as PreviewPlatform[]),
  ...Array.from(VIDEO_ROOM_PLATFORMS),
]);
const ACCOUNT_SELECTABLE = PUBLISH_SUPPORTED;
/** 계정 조회 응답 한 줄. 화면이 쓰는 것만 추린다. */
interface ChannelAccountRaw {
  id: string;
  display_name: string | null;
  username: string | null;
  is_default: boolean;
  connection_state?: string;
}

interface AccountOption {
  id: string;
  label: string;
  displayName?: string;
  username?: string;
  is_default: boolean;
  /**
   * 서버가 이미 판정해 내려 주는 값이다. "reconnect" 는 토큰이 만료·해지돼 이 계정으로는
   * 못 올린다는 뜻이다. 종전에는 이 값을 버려서, 인스타그램 토큰이 해지된 상태인데도
   * 발행 대상에 그대로 들어갔고 누를 때마다 실패했다(2026-09-05 운영 로그 token_revoked).
   */
  connectionState: "connected" | "reconnect";
}
interface FirstCommentCapability { platform: PreviewPlatform; supported: boolean; reason: string | null }

// apiPost는 non-2xx에서 throw한다(ApiResponseError). 생성 함수들이 `r?.ok` 체크만 믿고
// try/catch를 안 하면 403(shared_ai_approval_required) 같은 실패가 콘솔에만 찍히고 화면엔
// 조용히 죽는다(결함 실측: /studio 생성 실패 시 lastError/toast 미표시). 여기서 공통 추출.
/**
 * 배달 주소(/api/media/<토큰>)에서 서버가 읽을 파일명을 꺼낸다.
 * 토큰 본문은 base64url JSON 이라 화면에서도 읽을 수 있다(비밀이 아니다).
 */
function videoFilename(mediaUrl: string): string {
  if (!mediaUrl) return "";
  const marker = "/api/media/";
  const at = mediaUrl.indexOf(marker);
  if (at < 0) return "";
  try {
    const token = decodeURIComponent(mediaUrl.slice(at + marker.length));
    const body = token.split(".")[0].replace(/-/g, "+").replace(/_/g, "/");
    const parsed = JSON.parse(atob(body)) as { f?: string };
    return typeof parsed.f === "string" ? parsed.f : "";
  } catch {
    return "";
  }
}

function extractApiErrorMessage(e: unknown, fallback: string): string {
  // 2026-09-08 회장 실사용: 화면에 "Request failed: 502" 라는 숫자만 떴다. 그 말은
  // 사용자에게 아무 뜻이 없고 다음에 무엇을 하면 되는지도 말해 주지 않는다.
  // 서버 문구가 있으면 그것을 쓰고, 없으면 상태 코드가 아니라 사람 말로 바꿔 준다.
  if (e instanceof ApiResponseError) {
    const payload = e.payload as { error?: string; nsfw?: boolean; credits?: boolean } | null;
    if (payload?.nsfw) return "이 주제는 생성기가 만들 수 없다고 했습니다. 글감이나 결을 바꿔 다시 시도해 주세요.";
    if (payload?.credits) return "생성기 잔액이 부족합니다. 충전하면 바로 만들 수 있습니다.";
    if (payload?.error) return payload.error;
    if (e.status === 401 || e.status === 403) return "권한이 없어 요청이 막혔습니다. 로그아웃 후 다시 로그인해 주세요.";
    if (e.status === 429) return "요청이 너무 잦습니다. 잠시 후 다시 시도해 주세요.";
    if (e.status >= 500) return "서버가 요청을 끝내지 못했습니다. 잠시 후 다시 시도해 주세요.";
    return fallback;
  }
  // 네트워크 단계 실패("Load failed", "Failed to fetch")도 그대로 보여 주지 않는다.
  if (e instanceof Error) {
    if (/load failed|failed to fetch|networkerror/i.test(e.message)) {
      return "연결이 끊겨 요청이 끝나지 않았습니다. 잠시 후 다시 시도해 주세요.";
    }
    return e.message && !/^Request failed/i.test(e.message) ? e.message : fallback;
  }
  return fallback;
}

interface TextVariants {
  threads?: string; facebook?: string; x?: string;
  instagram?: { caption?: string; hashtags?: string[]; slides?: string[] };
  shorts?: { hook?: string; body?: string; cta?: string };
  image_prompt?: string;
}
interface ImgResult { url: string; file: string; localPath: string }
interface VidResult {
  url: string;
  file: string;
  model: string;
  hasAudio?: boolean;
  narration?: { requested: boolean; included: boolean; reason?: string; message?: string };
}
type PubStatus = "wait" | "doing" | "done" | "failed";
type PublishReconciliation = ExternalPublishPersistenceFailure["persistence"]["reconciliation"];
type PublishReconciliationMap = Record<string, PublishReconciliation>;

function normalizePublishReconciliations(value: unknown): PublishReconciliationMap {
  if (!value || typeof value !== "object" || Array.isArray(value)) return {};
  const candidate = value as Record<string, unknown>;
  if (candidate.retryPublish === false && typeof candidate.platform === "string") {
    return { [candidate.platform]: candidate as PublishReconciliation };
  }
  return Object.fromEntries(Object.entries(candidate).filter((entry): entry is [string, PublishReconciliation] => {
    const reconciliation = entry[1] as Partial<PublishReconciliation> | null;
    return Boolean(reconciliation && reconciliation.retryPublish === false && reconciliation.platform === entry[0]);
  }));
}

function studioWorkStorageKey(workspaceId: string): string {
  return `studio_work:${workspaceId}`;
}

const GROUPS: { title: string; platforms: PreviewPlatform[] }[] = [
  { title: "텍스트", platforms: ["threads", "x", "facebook"] },
  { title: "세로 영상", platforms: ["shorts", "reels", "tiktok"] },
  { title: "카드뉴스", platforms: ["instagram"] },
];
const ALL: PreviewPlatform[] = PREVIEW_PLATFORMS.map((platform) => platform.key);

// 플랫폼마다 본문을 다르게 지어내지 않는다. 같은 본문을 그 플랫폼 한도까지만 줄여 보여준다.
// 한도를 넘으면 줄임표를 붙여 잘린 사실이 화면에서 보이게 한다.
function trimToChannelLimit(body: string, channel: keyof typeof CHANNEL_TEXT_LIMITS): string {
  const limit = CHANNEL_TEXT_LIMITS[channel];
  if (countTextCharacters(body) <= limit) return body;
  return `${body.slice(0, Math.max(0, limit - 1))}…`;
}
const DEFAULT_PUBLISH_TARGETS = new Set<PreviewPlatform>(["threads", "x", "instagram"]);
const normalizeIncludes = (saved?: Record<string, boolean>): Record<string, boolean> => (
  Object.fromEntries(ALL.map((platform) => [
    platform,
    PUBLISH_SUPPORTED.has(platform) && (saved?.[platform] ?? DEFAULT_PUBLISH_TARGETS.has(platform)),
  ]))
);
const selectedPublishTargets = (includes: Record<string, boolean>): PreviewPlatform[] => (
  ALL.filter((platform) => PUBLISH_SUPPORTED.has(platform) && includes[platform])
);
// 발행 완료 뱃지 클릭 시 이동할 URL (시뮬: 플랫폼 위치. 실 발행 연동 시 게시물 permalink로 대체)
const POST_URL: Record<string, string> = {
  threads: "https://www.threads.net", x: "https://x.com", facebook: "https://www.facebook.com",
  instagram: "https://www.instagram.com", shorts: "https://www.youtube.com/shorts",
  reels: "https://www.instagram.com/reels", tiktok: "https://www.tiktok.com",
};
const isVideo = (p: PreviewPlatform) => p === "shorts" || p === "reels" || p === "tiktok";

export default function StudioPage() {
  const { showToast } = useToast();
  const router = useRouter();
  const searchParams = useSearchParams();
  const search = searchParams?.toString() ?? "";
  const { activeWorkspace, studioRoom: storedRoom, setStudioRoom: setActiveRoom } = useUIStore();
  // 없는 방 이름으로 들어오면 조용히 다른 방을 그리지 않는다. 아는 별칭은 제 주소로
  // 보내고, 모르는 값은 화면이 그 사실을 말한다(ADR-007).
  const roomResolution = resolveStudioRoom(`?${search}`, storedRoom);
  const activeRoom = roomResolution.room;
  useEffect(() => {
    if (roomResolution.redirectTo) window.location.replace(roomResolution.redirectTo);
  }, [roomResolution.redirectTo]);
  useEffect(() => {
    if (roomResolution.unknownRoom) {
      showToast(`"${roomResolution.unknownRoom}" 이라는 방은 없습니다. 생성실·편집실·발행실 중에서 고르시거나 성과실은 왼쪽 차림표에서 여세요.`, "error");
    }
  }, [roomResolution.unknownRoom]);
  const publishReturnRequest = readPublishReturnRequest(search);
  const { data: me } = useSWR<{ isOperator?: boolean }>("/api/me", fetcher);
  // 운영자 전용으로 남는 것은 종합 관리 화면(상태 조회, 거래 내역)이다.
  // 생성 자체는 고객에게 열려 있다(회장 2026-09-06 확정).
  const isOperator = me?.isOperator === true;
  // 2026-09-06 회장 확정: "토큰 잔여량이나 생성 이력은 고객도 봐야지".
  // 고객은 자기 작업 공간 사용량을 보고, 운영자는 종합 관리 화면을 따로 본다.
  const { data: usageData } = useUsage(activeWorkspace?.id);
  // 사용량 칩을 누르면 이 작업 공간의 생성 이력을 편다. 숫자만 있고 무엇을 만들었는지
  // 볼 수 없으면 고객은 자기 사용을 판단할 수 없다(회장 2026-09-06 확정).
  const [showUsageHistory, setShowUsageHistory] = useState(false);
  const { data: historyData } = useSWR<{ ok?: boolean; items?: Array<{ at: string; kind: string; model: string; label: string; totalTokens: number | null }>; error?: string }>(
    showUsageHistory && activeWorkspace ? `/api/studio/generation-history?tenant_id=${activeWorkspace.id}&limit=20` : null,
    fetcher,
  );
  const usage = usageData as { thisMonth?: Record<string, number>; tier?: string; quota?: Record<string, unknown> | null } | undefined;
  // 한도는 이미 서버가 usage_quotas 에서 내려주고 있었는데 화면이 안 썼다.
  // 쓴 건수만 보여 주면 "이 숫자가 뭔데" 로 끝난다(2026-09-09 회장 지적).
  const quotaUsed = Number(usage?.quota?.generations_used ?? usage?.thisMonth?.aiGenerations ?? 0);
  const quotaIncluded = usage?.quota?.generations_included != null
    ? Number(usage.quota.generations_included)
    : null;
  const quotaRemaining = quotaIncluded !== null ? Math.max(0, quotaIncluded - quotaUsed) : null;
  const { data: acct, mutate: mutateAcct } = useSWR<{ credits?: number; needsLogin?: boolean }>(
    isOperator ? "/api/higgsfield/status" : null,
    fetcher,
  );
  const { data: engine } = useSWR<{ mode?: string; label?: string; model?: string; error?: string }>(
    activeWorkspace ? `/api/studio/engine-status?tenant_id=${activeWorkspace.id}` : "/api/studio/engine-status",
    fetcher,
  );
  const { data: hist, mutate: mutateHist } = useSWR<{ drafts: Array<Record<string, unknown>>; currentWork?: CurrentWork | null }>(activeWorkspace ? `/api/studio/drafts?tenant_id=${activeWorkspace.id}` : null, fetcher);
  const { data: publishReturnQueue } = useSWR<{ posts: Array<Record<string, unknown>> }>(
    activeWorkspace && publishReturnRequest
      ? `/api/queue?status=all&returnTo=${publishReturnRequest.sourceRoute}&tenant_id=${activeWorkspace.id}`
      : null,
    fetcher,
  );
  const { data: brandData, mutate: mutateBrand } = useSWR<{ guide: { prompt_guide?: string } | null }>(
    activeWorkspace ? `/api/studio/brand-setup?tenant_id=${activeWorkspace.id}` : null, fetcher);
  const { data: firstCommentData } = useSWR<{ capabilities: FirstCommentCapability[] }>(
    shouldLoadPublishResources(activeRoom) ? "/api/publish/first-comment-capabilities" : null,
    fetcher,
  );
  const [showWorks, setShowWorks] = useState(false);
  const [chatOpen, setChatOpen] = useState(true); // 좁은 화면에서도 대화창은 항상 손에 닿는다
  const [showWizard, setShowWizard] = useState(false);
  const [showRepo, setShowRepo] = useState(false); // 레포 위키 연동 모달
  const [showSchedule, setShowSchedule] = useState(false); // P6 예약 발행 패널 토글
  const [autoGen, setAutoGen] = useState(false);           // P8 AI 자동초안 진행중

  const [idea, setIdea] = useState("");
  const [guide, setGuide] = useState("");
  // 활성 워크스페이스 브랜드 가이드 → 생성에 자동 주입(P3)
  useEffect(() => { if (brandData?.guide?.prompt_guide) setGuide(brandData.guide.prompt_guide); }, [brandData]);
  // 헤더 학습 정보가 네 방 어디서든 같은 숫자를 보이게 작업 공간이 바뀔 때 다시 읽는다.
  useEffect(() => {
    if (!activeWorkspace) {
      setLearningInfo({});
      return;
    }
    const nextLearningInfo = readLearningInfo(activeWorkspace.id);
    setLearningInfo(nextLearningInfo);
    // 브라우저에 있던 값을 먼저 그리고, 서버 값이 오면 그것으로 맞춘다. 학습 정보가 이
    // 브라우저에만 있으면 기기를 바꾼 순간 일곱 칸이 0 이 된다(2026-09-07 감사).
    // 서버에 없고 여기에만 있는 칸은 이관분이라 그대로 올려 준다.
    let cancelled = false;
    (async () => {
      const workspaceId = activeWorkspace.id;
      const server = await fetchLearningInfo(workspaceId, authHeaders());
      if (cancelled) return;
      const merged = mergeLearningInfo(server, nextLearningInfo);
      setLearningInfo(merged);
      if (JSON.stringify(merged) !== JSON.stringify(server ?? {})) {
        void saveLearningInfo(workspaceId, merged, authHeaders());
      }
    })();
    return () => { cancelled = true; };
    // 첫 화면을 덮는 강제 모달 대신 헤더에서 남은 칸 수와 이어 채우기 경로를 항상 보여 준다.
  }, [activeWorkspace?.id]);
  // 온보딩 위저드에서 "브랜드 설정하기"(/studio?setup=brand)로 오면 브랜드 위저드 자동 오픈.
  useEffect(() => {
    if (typeof window !== "undefined" && new URLSearchParams(window.location.search).get("setup") === "brand") {
      setShowWizard(true);
    }
  }, []);
  // 비용 승인을 화면 안에서 받는다. window.confirm 은 페이지를 멈춰 세워 무엇을 승인하는지
  // 나란히 볼 수 없었고, 돈이 나가는 관문에 맞는 화면이 아니었다(회장 2026-09-07 실사용).
  const [costApproval, setCostApproval] = useState<CostApprovalRequest | null>(null);
  const costApprovalResolve = useRef<((ok: boolean) => void) | null>(null);
  function askCostApproval(req: CostApprovalRequest): Promise<boolean> {
    setCostApproval(req);
    return new Promise<boolean>((resolve) => { costApprovalResolve.current = resolve; });
  }
  // 되돌릴 수 없는 조작도 화면 안에서 묻는다. 브라우저 기본 확인창은 페이지를 통째로
  // 멈춰 세워 무엇이 사라지는지 나란히 볼 수 없다(2026-09-07 회장 실사용).
  // 만들 그림의 결. 만들기 전에 고른다(회장 2026-09-08).
  const [imageStyleId, setImageStyleId] = useState("photo");
  const [imageStyleCustom, setImageStyleCustom] = useState("");
  const [confirmRequest, setConfirmRequest] = useState<ConfirmRequest | null>(null);
  const confirmResolve = useRef<((ok: boolean) => void) | null>(null);
  function askConfirm(req: ConfirmRequest): Promise<boolean> {
    setConfirmRequest(req);
    return new Promise<boolean>((resolve) => { confirmResolve.current = resolve; });
  }
  function settleConfirm(ok: boolean) {
    setConfirmRequest(null);
    confirmResolve.current?.(ok);
    confirmResolve.current = null;
  }
  function settleCostApproval(ok: boolean) {
    setCostApproval(null);
    costApprovalResolve.current?.(ok);
    costApprovalResolve.current = null;
  }
  // 화면에 모델 선택이 없다. 고르게 할 때까지는 상수로 둔다(죽은 상태값 금지).
  const videoModel = "minimax_hailuo";
  const [busy, setBusy] = useState<string | null>(null);
  // 2026-09-06 회장 스모크: 생성이 시작되면 끝날 때까지 취소할 방법이 없었고, 도는 동안
  // 화면에 아무 표시도 없었다. 진행 중임을 보여 주고 그만둘 수 있게 한다.
  const generationAbort = useRef<AbortController | null>(null);
  function cancelGeneration() {
    generationAbort.current?.abort();
    generationAbort.current = null;
    setBusy(null);
    showToast("생성을 취소했습니다", "success");
  }
  const [lastError, setLastError] = useState<string | null>(null);
  const [text, setText] = useState<TextVariants | null>(null);

  /**
   * 생성이 만든 채널별 메타를 발행실 칸에 채운다.
   *
   * 2026-09-09 회장 지적: "지금 화면에서 왜 이런 메타정보(해시태그 첫댓글 캡션 등등)는
   * 비어있어." 원인은 단절이었다. 생성은 인스타그램 해시태그를 실제로 만들어 내려보내는데
   * (/api/studio/text 계약의 instagram.hashtags), 발행실은 그 값을 한 번도 읽지 않고
   * 사용자가 손으로 채우기만 기다렸다. 만들어 놓고 안 쓰면 없는 것과 같다.
   *
   * 사업계획 §3.2 는 "채널별 제목·소개·해시태그·첫 댓글은 발행실이 맡는다" 고 정했다.
   * 맡는다는 것은 빈 칸을 내주는 것이 아니라 채워 놓고 고치게 하는 것이다.
   *
   * 사용자가 이미 손댄 칸은 건드리지 않는다. 채우는 것이 덮어쓰기가 되면 안 된다.
   */
  useEffect(() => {
    const tags = text?.instagram?.hashtags;
    if (!Array.isArray(tags) || tags.length === 0) return;
    const line = tags
      .map((tag) => String(tag).trim())
      .filter(Boolean)
      .map((tag) => (tag.startsWith("#") ? tag : `#${tag}`))
      .join(" ");
    if (!line) return;
    setHashtags((current) => {
      const next = { ...current };
      let changed = false;
      for (const [platform, contract] of Object.entries(PLATFORM_FIELD_CONTRACT)) {
        if (!contract.hashtags) continue;
        if (next[platform]?.trim()) continue; // 손댄 칸은 그대로 둔다
        next[platform] = line;
        changed = true;
      }
      return changed ? next : current;
    });
  }, [text]);
  const [img, setImg] = useState<ImgResult | null>(null);
  const [vid, setVid] = useState<VidResult | null>(null);
  const [draftId, setDraftId] = useState<string | null>(null);
  const [publishReconciliations, setPublishReconciliations] = useState<PublishReconciliationMap>({});
  const [editorHandoff, setEditorHandoff] = useState<EditorHandoff | null>(null);
  const [includes, setIncludes] = useState<Record<string, boolean>>(() => normalizeIncludes());
  const [titles, setTitles] = useState<Record<string, string>>({});
  const [hashtags, setHashtags] = useState<Record<string, string>>({});
  const [topicTags, setTopicTags] = useState<Record<string, string>>({});
  const [firstComments, setFirstComments] = useState<Record<string, string>>({});
  // 플랫폼별 캡션 덮어쓰기. 세로영상 세 곳(Shorts, Reels, TikTok)은 원본 대본 하나를 공유하던
  // 탓에 한 곳을 고치면 나머지도 같이 바뀌었다. 여기에 플랫폼 키로 따로 담아 각자 편집한다.
  const [captions, setCaptions] = useState<Record<string, string>>({});
  const [reviewQueueId, setReviewQueueId] = useState<string | null>(null);
  const [reviewBusy, setReviewBusy] = useState(false);
  const [publishChatDraft, setPublishChatDraft] = useState("");
  const [editLines, setEditLines] = useState<string[]>([]);
  const [cardTextPositions, setCardTextPositions] = useState<CardTextPosition[]>([]);
  const [editSavedAt, setEditSavedAt] = useState("");
  const [editAutosaveError, setEditAutosaveError] = useState("");
  const [moveToPublishBusy, setMoveToPublishBusy] = useState(false);
  const [selectedCandidate, setSelectedCandidate] = useState<StudioGenerationCandidate | null>(null);
  const [createBranch, setCreateBranch] = useState<CreateContentBranch>("video");
  // "새로 시작" 이 생성실 안쪽까지 닿게 하는 신호. 값이 바뀌면 생성실이 스스로 비운다.
  /**
   * 영상의 대문으로 쓸 시점(초). 채널마다 따로 정한다.
   *
   * 2026-09-09 회장 지적: "영상에서는 뭘 대문 썸네일로 지정할지도 세팅해야하지않나 API있지."
   * 실제로 있었고 우리가 안 쓰고 있었다. 안 주면 플랫폼이 첫 프레임을 쓰는데, 숏폼에서
   * 첫 프레임은 대개 아직 아무것도 안 보이는 순간이라 가장 나쁜 대문이 된다.
   */
  const [coverSeconds, setCoverSeconds] = useState<Record<string, number>>({});
  const [createResetToken, setCreateResetToken] = useState(0);
  const [createPrimaryKind, setCreatePrimaryKind] = useState<CreateKind | null>(null);
  const [alsoKinds, setAlsoKinds] = useState<CreateKind[]>([]);
  const [learningInfo, setLearningInfo] = useState<LearningInfo>({});
  const [learningFlash, setLearningFlash] = useState(0);
  const [editKind, setEditKind] = useState<EditContentKind>("video");
  const [editFormat, setEditFormat] = useState<ContentEditFormat>(() => defaultContentEditFormat("video"));
  const [editing, setEditing] = useState<PreviewPlatform | null>(null);
  const [showTx, setShowTx] = useState(false);
  const { data: tx } = useSWR<{ items?: Array<{ display_name?: string; credits?: number; action?: string; created_at?: string; output?: string | null; outputKind?: string | null }> }>(
    isOperator && showTx ? "/api/higgsfield/transactions?size=25" : null,
    fetcher,
  );

  const [pub, setPub] = useState<{
    running: boolean;
    stopped: boolean;
    status: Record<string, PubStatus>;
    urls: Record<string, string>;
    errors: Record<string, string>;
  }>({ running: false, stopped: false, status: {}, urls: {}, errors: {} });
  // SNS-007: 플랫폼별 다중계정 중 이번 발행에 쓸 계정. 미선택(undefined)이면 getChannelCred가
  // 기본계정으로 resolve(/api/publish 계약과 동일). 계정이 1개뿐이면 셀렉터 자체를 숨긴다.
  const [accountsByPlatform, setAccountsByPlatform] = useState<Record<string, AccountOption[]>>({});
  const [selectedAccounts, setSelectedAccounts] = useState<Record<string, string>>({});
  const [accountLoadErrors, setAccountLoadErrors] = useState<Record<string, boolean>>({});
  const [accountsLoaded, setAccountsLoaded] = useState(false);
  // 복원한 작업물의 선택 상태는 계정 조회와 별개다. 계정 조회가 느려도 본문과 선택 채널은
  // 먼저 복원해 보여 주고, 실제 발행 가능 대상만 조회 완료 뒤 따로 좁힌다.
  const selectedTargets = selectedPublishTargets(includes);
  const usableAccounts = (platform: PreviewPlatform) => (accountsByPlatform[platform] || []).filter((account) => account.connectionState === "connected");
  const publishTargets = selectedTargets.filter((platform) => usableAccounts(platform).length > 0);
  // 다시 연결해야 올릴 수 있는 채널. Buffer 도 끊긴 채널을 목록 위로 올려 재연결을 먼저 시킨다.
  const reconnectTargets = selectedTargets.filter((platform) =>
    (accountsByPlatform[platform] || []).length > 0 && usableAccounts(platform).length === 0);
  // 일부만 성공한 뒤에는 버튼이 '다시 발행'이 아니라 '실패한 곳만'이어야 한다.
  const publishRetryOnly = publishTargets.some((platform) => pub.status[platform] === "done")
    && publishTargets.some((platform) => pub.status[platform] === "failed");

  useEffect(() => {
    const requested = resolveStudioRoom(`?${search}`, storedRoom).room;
    if (requested !== storedRoom) setActiveRoom(requested);
  }, [search, setActiveRoom, storedRoom]);

  const changeRoom = (room: StudioRoom) => {
    setActiveRoom(room);
    window.history.replaceState(null, "", `/studio?room=${room}`);
    setShowWorks(false);
  };

  useEffect(() => {
    setAccountsLoaded(false);
    setAccountLoadErrors({});
    if (!shouldLoadPublishResources(activeRoom) || !activeWorkspace) { setAccountsByPlatform({}); return; }
    let cancelled = false;
    (async () => {
      // 영상 채널은 자기 이름의 계정이 없다. 쇼츠는 유튜브, 릴스는 인스타그램, 틱톡은
      // 틱톡 계정을 쓴다. 화면 이름 그대로 조회하면 늘 빈 목록이 나온다. 그리고 여러
      // 화면 이름이 같은 제공자를 가리키므로 제공자당 한 번만 부른다(릴스·인스타그램).
      // 응답 객체를 재사용하면 본문을 두 번 읽을 수 없다. 파싱 결과를 캐시한다.
      const providerCache = new Map<string, Promise<{ ok: boolean; data: { accounts?: ChannelAccountRaw[] } }>>();
      const fetchAccounts = (provider: string) => {
        const hit = providerCache.get(provider);
        if (hit) return hit;
        // 캐시한 약속이 거부되면 그것을 기다리는 모든 채널이 함께 매달린다. 실패도
        // 값으로 돌려 한 채널의 조회 실패가 화면 전체를 멈추지 않게 한다.
        const call = (async () => {
          try {
            const res = await fetch(`/api/channels/${provider}/accounts?tenant_id=${activeWorkspace.id}`, { headers: authHeaders() });
            const data = await res.json().catch(() => ({}));
            return { ok: res.ok, data: data as { accounts?: ChannelAccountRaw[] } };
          } catch {
            return { ok: false, data: {} as { accounts?: ChannelAccountRaw[] } };
          }
        })();
        providerCache.set(provider, call);
        return call;
      };
      const entries = await Promise.all(
        Array.from(ACCOUNT_SELECTABLE).map(async (p) => {
          try {
            const provider = VIDEO_ACCOUNT_PROVIDER[p] || p;
            const { ok, data: d } = await fetchAccounts(provider);
            if (!ok) return [p, [] as AccountOption[], true] as const;
            const opts: AccountOption[] = (d.accounts ?? []).map((a: { id: string; display_name: string | null; username: string | null; is_default: boolean; connection_state?: string }) => ({
              id: a.id,
              label: a.display_name || (a.username ? `@${a.username}` : a.id.slice(0, 8)),
              displayName: a.display_name || undefined,
              username: a.username || undefined,
              is_default: a.is_default,
              connectionState: a.connection_state === "reconnect" ? "reconnect" : "connected",
            }));
            return [p, opts, false] as const;
          } catch {
            return [p, [] as AccountOption[], true] as const;
          }
        }),
      );
      if (cancelled) return;
      const nextAccounts = Object.fromEntries(entries.map(([platform, accounts]) => [platform, accounts]));
      setAccountsByPlatform(nextAccounts);
      setAccountLoadErrors(Object.fromEntries(entries.map(([platform, , failed]) => [platform, failed])));
      setSelectedAccounts((current) => Object.fromEntries(Object.entries(current).filter(([platform, accountId]) => (
        (nextAccounts[platform] || []).some((account) => account.id === accountId)
      ))));
      setIncludes((current) => Object.fromEntries(ALL.map((platform) => [
        platform,
        Boolean(current[platform]) && (nextAccounts[platform]?.length ?? 0) > 0,
      ])));
      setAccountsLoaded(true);
    })();
    return () => { cancelled = true; };
  }, [activeRoom, activeWorkspace]);
  const cancelRef = useRef(false);
  const drawerRef = useRef<HTMLDivElement>(null);
  const dragRef = useRef(false);
  const onDrag = useCallback((event: MouseEvent) => {
    if (!dragRef.current || !drawerRef.current) return;
    const width = Math.min(window.innerWidth * 0.9, Math.max(320, window.innerWidth - event.clientX));
    drawerRef.current.style.width = `${width}px`;
  }, []);
  useEffect(() => {
    const up = () => (dragRef.current = false);
    window.addEventListener("mousemove", onDrag); window.addEventListener("mouseup", up);
    return () => { window.removeEventListener("mousemove", onDrag); window.removeEventListener("mouseup", up); };
  }, [onDrag]);
  // ── 작업 데이터 유지 (나갔다 와도 복원) ──
  const [hydratedWorkspaceId, setHydratedWorkspaceId] = useState<string | null>(null);
  useEffect(() => {
    setSelectedAccounts({});
    const workspaceId = activeWorkspace?.id ?? null;
    setHydratedWorkspaceId(null);
    setIdea(""); setText(null); setImg(null); setVid(null); setDraftId(null);
    setIncludes(normalizeIncludes()); setPublishReconciliations({}); setEditorHandoff(null);
    setTitles({}); setHashtags({}); setTopicTags({}); setFirstComments({}); setCaptions({});
    setEditLines([]); setCardTextPositions([]); setReviewQueueId(null); setSelectedCandidate(null);
    setCreateBranch("video"); setCreatePrimaryKind(null); setEditKind("video"); setEditFormat(defaultContentEditFormat("video"));
    setPub({ running: false, stopped: false, status: {}, urls: {}, errors: {} });
    if (!workspaceId) return;
    try {
      localStorage.removeItem("studio_work");
      const raw = localStorage.getItem(studioWorkStorageKey(workspaceId));
      if (raw) {
        const w = JSON.parse(raw);
        setIdea(w.idea || "");
        setText(w.text || null); setImg(w.img || null); setVid(w.vid || null);
        if (w.includes) setIncludes(normalizeIncludes(w.includes)); setDraftId(w.draftId || null);
        setPublishReconciliations(normalizePublishReconciliations(w.publishReconciliations ?? w.publishReconciliation));
        setTitles(w.titles || {}); setHashtags(w.hashtags || {}); setTopicTags(w.topicTags || {});
        setFirstComments(w.firstComments || {}); setCaptions(w.captions || {}); setSelectedAccounts(w.selectedAccounts || {}); setEditLines(w.editLines || []); setCardTextPositions(w.cardTextPositions || []); setReviewQueueId(w.reviewQueueId || null);
        if (w.editKind === "video" || w.editKind === "card" || w.editKind === "audio" || w.editKind === "text") {
          setEditKind(w.editKind);
          const formatKind = w.editKind;
          const savedFormat = validateContentEditFormat(w.editFormat);
          setEditFormat(savedFormat.valid && savedFormat.value.kind === formatKind
            ? savedFormat.value
            : defaultContentEditFormat(formatKind));
        }
      }
    } catch { /* noop */ }
    setHydratedWorkspaceId(workspaceId);
  }, [activeWorkspace?.id]);
  useEffect(() => {
    const workspaceId = activeWorkspace?.id;
    if (!workspaceId || hydratedWorkspaceId !== workspaceId) return;
    try {
      localStorage.setItem(studioWorkStorageKey(workspaceId), JSON.stringify({ idea, text, img, vid, includes, draftId, publishReconciliations, titles, hashtags, topicTags, firstComments, captions, selectedAccounts, editLines, cardTextPositions, reviewQueueId, editKind, editFormat }));
      setEditSavedAt(new Intl.DateTimeFormat("ko-KR", { hour: "2-digit", minute: "2-digit", hour12: false }).format(new Date()));
      setEditAutosaveError("");
    } catch {
      setEditAutosaveError("자동 저장하지 못했습니다. 브라우저 저장 공간을 확인해 주세요.");
    }
  }, [activeWorkspace?.id, hydratedWorkspaceId, idea, text, img, vid, includes, draftId, publishReconciliations, titles, hashtags, topicTags, firstComments, captions, selectedAccounts, editLines, cardTextPositions, reviewQueueId, editKind, editFormat]);

  const media = { imgUrl: img?.file, vidUrl: vid?.file };
  const upText = (patch: Partial<TextVariants>) => setText((p) => ({ ...(p || {}), ...patch }));
  const upIg = (patch: Partial<NonNullable<TextVariants["instagram"]>>) => setText((p) => ({ ...(p || {}), instagram: { ...(p?.instagram || {}), ...patch } }));
  const syncEditLines = (nextLines: string[]) => {
    setEditLines(nextLines);
    setText((current) => {
      if (!current) return current;
      const body = nextLines.join("\n\n");
      if (editKind === "text") {
        return {
          ...current,
          threads: body,
          x: body,
          facebook: body,
          instagram: { ...(current.instagram || {}), caption: body },
        };
      }
      if (editKind === "card") {
        return { ...current, instagram: { ...(current.instagram || {}), slides: nextLines } };
      }
      if (editKind === "video") {
        const [hook = "", ...rest] = nextLines;
        const cta = rest.length > 0 ? rest[rest.length - 1] : "";
        const middle = rest.length > 1 ? rest.slice(0, -1) : [];
        return { ...current, shorts: { ...(current.shorts || {}), hook, body: middle.join("\n"), cta } };
      }
      return current;
    });
  };

  async function genText(structure?: CreateStructureChoice) {
    setLastError(null);
    try {
      const r = await apiPost<TextVariants & { ok?: boolean; error?: string }>("/api/studio/text", {
        idea,
        guide,
        tenant_id: activeWorkspace?.id,
        structure: structure ? { label: structure.label, title: structure.title, outline: structure.outline } : undefined,
      }, { signal: generationAbort.current?.signal });
      if (!r?.ok) { const msg = r?.error || "텍스트 생성 실패"; setLastError(`텍스트: ${msg}`); showToast(msg, "error"); return null; }
      // API가 성공을 확인한 뒤에만 발행한다. 클릭 시점 아님.
      trackEvent({ name: "content_generate", params: { kind: "text" } });
      setText(r);
      return r;
    } catch (e) {
      const msg = extractApiErrorMessage(e, "텍스트 생성 실패");
      setLastError(`텍스트: ${msg}`); showToast(msg, "error"); return null;
    }
  }
  async function generateQuickDraft(structure: CreateStructureChoice) {
    if (!idea.trim()) { showToast("주제를 입력해 주세요", "error"); return; }
    generationAbort.current = new AbortController();
    setBusy("초안 만드는 중");
    try {
      const result = await genText(structure);
      if (result) {
        // 2026-09-05 회장 계정 실측: 새 초안을 만들어도 이전 초안 번호를 그대로 들고 가서,
        // 그 번호가 이미 발행된 것이면 발행이 매번 "이미 올라갔습니다"로 닫혔다. 스튜디오에서
        // 두 번째 글을 영영 못 올리는 상태였다. 새로 만든 것은 새 작업물이므로 이전 번호와
        // 발행 흔적을 끊는다. 끊지 않으면 새 글이 옛 글의 발행 기록에 덮어써진다.
        setDraftId(null);
        setPub({ running: false, stopped: false, status: {}, urls: {}, errors: {} });
        setPublishReconciliations({});
        const nextKind = createPrimaryKind ?? "text";
        const nextLines = nextKind === "video"
          ? [result.shorts?.hook, result.shorts?.body, result.shorts?.cta].filter((line): line is string => Boolean(line))
          : nextKind === "card"
            ? (result.instagram?.slides?.length ? result.instagram.slides : [result.instagram?.caption || ""]).filter(Boolean)
            /*
              2026-09-09: 글을 한 덩어리로 넘기면 편집실에서 줄이 하나뿐이라 문단을 고르거나
              순서를 바꿀 수가 없다. 카드뉴스와 영상은 이미 조각으로 오는데 글만 통짜였다.
              빈 줄로 갈라 문단으로 만든다. 붙일 때도 빈 줄로 붙이므로 원문이 그대로 돌아온다.
            */
            : (result.threads || result.facebook || result.x || "")
              .split(/\n\s*\n/)
              .map((paragraph) => paragraph.trim())
              .filter(Boolean);
        setEditKind(nextKind);
        setEditFormat(defaultContentEditFormat(nextKind));
        setEditLines(nextLines);
        showToast(`${structure.label} 구조로 초안을 만들었습니다`, "success");
      }
    } finally {
      generationAbort.current = null;
      setBusy(null);
    }
  }
  // 2026-09-06 회장 확정: "고객이 이미지 영상 생성 하려고 서비스 쓰는거아니야?"
  // 종전에는 운영자만 생성할 수 있어 고객 계정에서는 카드뉴스와 영상이 아예 안 만들어졌다.
  // PRD v8.2.1 이 고객 핵심 기능으로 규정한 것과도 어긋나 있었다. 고객에게 연다.
  // 누가 얼마나 썼는지는 작업 공간별로 남겨 사용량 화면이 그것을 읽는다.
  // 비율을 9:16 으로 못 박아 두면 카드뉴스가 세로 영상 비율로 나온다. 카드뉴스는 정사각이고
  // 숏폼 히어로 이미지는 세로다. 쓰는 쪽이 정하게 한다(사업계획 v0.4 10절 첫 매체 = 카드뉴스).
  // 생성기가 받는 값은 정해져 있다: 1:1, 16:9, 9:16, 4:3 등. 4:5 는 거절된다(2026-09-06 실측).
  async function genImage(prompt: string, aspectRatio: "1:1" | "9:16" = "9:16") {
    if (!activeWorkspace) { showToast("작업 공간을 먼저 고르세요", "error"); return null; }
    setLastError(null);
    try {
      const r = await apiPost<ImgResult & { ok?: boolean; error?: string; nsfw?: boolean; credits?: boolean }>("/api/higgsfield/image", { prompt, aspectRatio, label: idea, tenant_id: activeWorkspace.id });
      if (!r?.ok) {
        // 문구는 회장이 읽는 말로 쓴다. 생성기 이름과 영어 용어는 화면에 내지 않는다.
        const msg = r?.credits
          ? "이미지 생성기 잔액이 부족합니다. 충전하면 바로 만들 수 있습니다."
          : r?.nsfw
            ? "이 주제는 생성기가 만들 수 없다고 했습니다. 글감이나 결을 바꿔 다시 시도해 주세요."
            : (r?.error || "이미지를 만들지 못했습니다. 잠시 후 다시 시도해 주세요.");
        setLastError(`이미지: ${msg}`); showToast(msg, "error"); return null;
      }
      setImg(r); mutateAcct(); return r;
    } catch (e) {
      // 2026-09-08 실측: 생성기가 막은 주제였는데 화면에는 "Request failed: 502" 만 떴다.
      // 서버는 이유(nsfw·크레딧 부족)를 응답 본문에 담아 보내는데, 응답이 2xx 가 아니면
      // 그 본문을 읽지 않고 버리고 있었다. 이유를 아는 실패는 이유를 말한다.
      const payload = e instanceof ApiResponseError
        ? (e.payload as { error?: string; nsfw?: boolean; credits?: boolean } | undefined)
        : undefined;
      const msg = payload?.nsfw
        ? "이 주제는 생성기가 만들 수 없다고 했습니다. 글감을 바꾸거나 결을 바꿔 다시 시도해 주세요."
        : payload?.credits
          ? "이미지 생성기 잔액이 부족합니다. 충전하면 바로 만들 수 있습니다."
          : payload?.error || extractApiErrorMessage(e, "이미지 생성 실패");
      setLastError(`이미지: ${msg}`); showToast(msg, "error"); return null;
    }
  }
  // 바탕 그림을 서버 내부 경로로도, 파일 이름으로도 넘길 수 있게 한다.
  // 방금 만든 그림은 내부 경로를 갖고 있지만, 승인함이나 달력에서 가져온 작업물은
  // 웹 주소만 갖고 있다. 종전에는 후자로 영상을 만들 수 없었다(코드 감사 F-05).
  async function genVideo(source: { localPath?: string; filename?: string }) {
    if (!activeWorkspace) { showToast("작업 공간을 먼저 고르세요", "error"); return null; }
    setLastError(null);
    const s = text?.shorts;
    const narration = [s?.hook, s?.body, s?.cta].filter(Boolean).join(". ");
    try {
      const r = await apiPost<VidResult & { ok?: boolean; error?: string; nsfw?: boolean; credits?: boolean }>("/api/higgsfield/video", { localPath: source.localPath, filename: source.filename, prompt: "subtle idle motion, gentle glow, fixed camera", model: videoModel, narration, label: idea, tenant_id: activeWorkspace.id });
      if (!r?.ok) {
        const msg = r?.nsfw
          ? "이 주제는 생성기가 만들 수 없다고 했습니다. 글감이나 결을 바꿔 다시 시도해 주세요."
          : r?.credits
            ? "영상 생성기 잔액이 부족합니다. 충전하면 바로 만들 수 있습니다."
            : (r?.error || "영상을 만들지 못했습니다. 잠시 후 다시 시도해 주세요.");
        setLastError(`영상: ${msg}`); showToast(msg, "error"); return null;
      }
      setVid(r); mutateAcct(); return r;
    } catch (e) {
      const msg = extractApiErrorMessage(e, "영상 생성 실패");
      setLastError(`영상: ${msg}`); showToast(msg, "error"); return null;
    }
  }
  // 지금 작업물을 버리고 처음부터 시작한다.
  //
  // 2026-09-06 회장 스모크: "생성실, 편집실, 발행실 리셋을 어떻게 해야하나 모르겠음
  // (폐기하거나 다른 작업하고 싶을때)". 실제로 세 방 어디에도 새로 시작하는 길이 없었다.
  // 이미 발행한 작업물이 남아 있으면 발행이 중복으로 막히기까지 한다.
  // 되돌릴 수 없는 조작이므로 한 번 확인하고 지운다.
  async function discardCurrentWork() {
    // 생성실이 브라우저에 남긴 후보까지 봐야 한다. 부모 상태만 보면, 부모는 비었는데
    // 생성실에는 옛 후보가 살아 있는 상태에서 "이미 비어 있습니다" 로 닫혀 사용자가 그
    // 후보를 영원히 못 지운다(2026-09-09 실사용에서 확인).
    let createLeftover = false;
    try {
      createLeftover = Boolean(activeWorkspace && localStorage.getItem(`${CREATE_DRAFT_STORAGE_PREFIX}:${activeWorkspace.id}`));
    } catch { /* 저장을 못 읽으면 없는 것으로 본다 */ }
    if (!text && !idea.trim() && !draftId && !createLeftover) { showToast("이미 비어 있습니다", "success"); return; }
    const ok = await askConfirm({
      title: "지금 작업물을 버리고 새로 시작할까요?",
      description: "저장하지 않은 본문과 방금 만든 이미지·영상이 이 화면에서 사라집니다. 이미 저장된 작업물은 작업물 전체에 그대로 남습니다.",
      confirmLabel: "버리고 새로 시작",
      cancelLabel: "그냥 두기",
      destructive: true,
    });
    if (!ok) return;
    generationAbort.current?.abort();
    generationAbort.current = null;
    setBusy(null);
    setIdea(""); setText(null); setImg(null); setVid(null); setDraftId(null);
    setEditLines([]); setEditorHandoff(null);
    setPublishReconciliations({});
    setPub({ running: false, stopped: false, status: {}, urls: {}, errors: {} });
    setTitles({}); setHashtags({}); setTopicTags({}); setFirstComments({}); setCaptions({});
    // 생성실이 들고 있는 구조 초안과 답한 질문까지 비운다. 여기를 빼먹으면 "버렸다" 고
    // 말해 놓고 화면에는 앞서 만든 후보가 그대로 남는다(2026-09-09 실사용에서 확인).
    setCreatePrimaryKind(null); setAlsoKinds([]);
    setCreateResetToken((value) => value + 1);
    showToast("새로 시작합니다", "success");
  }
  /**
   * 카드뉴스 이미지를 만든다. 만들기 전에 비용을 보여 주고 승인을 받는다.
   *
   * 사업계획 v0.4 7절과 10절이 정한 관문이다. "원가는 생성 호출에서 난다. 그래서 만들기
   * 전에 비용을 보여 주고 승인받는 관문과 재시도 상한이 필요하다." 승인 없이 부르면
   * 실패가 그대로 비용이 된다. 같은 이유로 첫 매체는 카드뉴스다(10절).
   */
  async function generateCardImages() {
    if (!activeWorkspace) { showToast("작업 공간을 먼저 고르세요", "error"); return; }
    const slides = text?.instagram?.slides?.length ? text.instagram.slides : [];
    if (!slides.length) { showToast("먼저 카드뉴스 초안을 만들어 주세요", "error"); return; }

    const est = await apiPost<{
      ok?: boolean; min_minor?: number; max_minor?: number;
      estimated_seconds_min?: number; estimated_seconds_max?: number; assumptions?: string[];
    }>("/api/studio/estimate", { tenant_id: activeWorkspace.id, kind: "card", count: 1 });
    if (!est?.ok) { showToast("비용을 산정하지 못했습니다. 잠시 후 다시 시도해 주세요.", "error"); return; }

    const approved = await askCostApproval({
      title: "카드뉴스 대표 이미지",
      description: "고른 구조의 첫 장을 대표 이미지로 만듭니다. 정사각형으로 나옵니다.",
      minMinor: est.min_minor, maxMinor: est.max_minor,
      secondsMin: est.estimated_seconds_min, secondsMax: est.estimated_seconds_max,
      assumptions: est.assumptions,
    });
    if (!approved) { showToast("만들지 않았습니다", "success"); return; }

    generationAbort.current = new AbortController();
    setBusy("카드뉴스 이미지 만드는 중");
    try {
      // 고른 결과 학습 정보의 브랜드 색을 함께 실어 보낸다. 브랜드 색은 고객이 이미
      // 골라 둔 값인데 종전에는 그림 생성에 한 번도 쓰이지 않았다.
      // 카드뉴스 본문을 그림 지시문으로 넘기지 않는다. 넘기면 생성기가 그 말을 그림 속
      // 글자로 그려서 쓸 수 없는 이미지가 나온다(2026-09-08 실측).
      await genImage(
        buildImagePrompt(
          pickImageSubject({ imagePrompt: text?.image_prompt, topic: idea }),
          { id: imageStyleId, custom: imageStyleCustom },
          learningInfo.palette,
        ),
        "1:1",
      );
    } finally {
      generationAbort.current = null;
      setBusy(null);
    }
  }
  // 회장 2026-09-07 "생성실에는 영상 버튼 자체가 없는데". 영상은 API 로만 만들 수 있고
  // 화면에는 길이 없었다. 카드뉴스와 같은 비용 승인 관문을 태워 화면에서 만들 수 있게 한다.
  // 영상은 대표 이미지를 움직이게 하는 것이라 이미지가 먼저 있어야 한다.
  async function generateShortVideo() {
    if (!activeWorkspace) { showToast("작업 공간을 먼저 고르세요", "error"); return; }
    // 2026-09-08 회장: "왜 카드뉴스 대표이미지를 만들어야 숏폼 영상만들기가 되는거냐".
    // 영상은 그림을 움직여 만드는 것이라 바탕 그림이 필요한 것은 맞다. 그런데 그 사정은
    // 우리 사정이지 고객 사정이 아니다. 고객은 "영상 만들기" 를 눌렀을 뿐인데 거절당하고
    // 다른 단추를 먼저 누르라는 말을 듣는다. 필요한 것이면 우리가 만들고 이어서 간다.
    let source = img;
    const needsBaseImage = !source;

    const est = await apiPost<{
      ok?: boolean; min_minor?: number; max_minor?: number;
      estimated_seconds_min?: number; estimated_seconds_max?: number; assumptions?: string[];
    }>("/api/studio/estimate", { tenant_id: activeWorkspace.id, kind: "video", count: 1 });
    if (!est?.ok) { showToast("비용을 산정하지 못했습니다. 잠시 후 다시 시도해 주세요.", "error"); return; }

    const approved = await askCostApproval({
      title: "숏폼 영상",
      description: needsBaseImage
        ? "바탕이 될 그림을 먼저 만들고, 그 그림을 움직이는 영상으로 바꿉니다. 소리는 없습니다."
        : "방금 만든 대표 이미지를 움직이는 영상으로 바꿉니다. 소리는 없습니다.",
      minMinor: est.min_minor, maxMinor: est.max_minor,
      secondsMin: est.estimated_seconds_min, secondsMax: est.estimated_seconds_max,
      assumptions: est.assumptions,
    });
    if (!approved) { showToast("만들지 않았습니다", "success"); return; }

    generationAbort.current = new AbortController();
    try {
      if (needsBaseImage) {
        setBusy("영상 바탕 그림 만드는 중");
        source = await genImage(
          buildImagePrompt(
            pickImageSubject({ imagePrompt: text?.image_prompt, topic: idea }),
            { id: imageStyleId, custom: imageStyleCustom },
            learningInfo.palette,
          ),
          "9:16",
        );
        if (!source) return; // 실패 사유는 genImage 가 이미 화면에 말했다
      }
      setBusy("숏폼 영상 만드는 중");
      // 내부 경로가 없으면 배달 주소에서 파일 이름을 꺼내 넘긴다. 서버가 그것으로 찾는다.
      const baseFilename = videoFilename(source?.file || source?.url || img?.file || img?.url || "");
      if (!source?.localPath && !baseFilename) {
        showToast("영상의 바탕이 될 그림을 찾지 못했습니다. 생성실에서 그림을 다시 만들어 주세요.", "error");
        return;
      }
      await genVideo({ localPath: source?.localPath, filename: baseFilename });
    } finally {
      generationAbort.current = null;
      setBusy(null);
    }
  }
  // P8: AI 자동초안. 브랜드 가이드 + 글감을 소스로 후보 초안 N개를 생성(status=draft).
  // 게이트웨이 크론(generate-drafts)의 수동 대응. /api/sourcing 재사용(longform→후보 청킹).
  async function save(
    status: "draft" | "published" | "partial" | "stopped" = "draft",
    reconciliations: PublishReconciliationMap = publishReconciliations,
    persistedDraftId: string | null = draftId,
    persistedEditLines: string[] = editLines,
  ) {
    const r = await apiPost<{ id?: string }>("/api/studio/drafts", {
      tenant_id: activeWorkspace?.id,
      id: persistedDraftId,
      idea,
      text,
      img,
      vid,
      includes,
      status,
      publishReconciliations: reconciliations,
      titles,
      hashtags,
      topicTags,
      firstComments,
      captions,
      selectedAccounts,
      editLines: persistedEditLines,
      cardTextPositions,
      editKind,
      editFormat,
      reviewQueueId,
      publishedAt: status === "published" ? new Date().toISOString() : undefined,
    });
    if (r?.id) setDraftId(r.id); mutateHist(); return r?.id;
  }
  async function saveDraftWithNotice() {
    try {
      const savedDraftId = await save("draft");
      if (!savedDraftId) {
        showToast("초안을 저장하지 못했습니다", "error");
        return;
      }
      showToast("임시 저장했습니다", "success");
    } catch (error) {
      showToast(extractApiErrorMessage(error, "초안을 저장하지 못했습니다"), "error");
    }
  }
  async function moveToPublish() {
    const linesToPersist = editLines.length ? editLines : [text?.shorts?.hook || "", text?.shorts?.body || "", text?.shorts?.cta || ""].filter(Boolean);
    if (!linesToPersist.some((line) => line.trim())) {
      showToast("발행실로 넘길 편집 내용이 없습니다", "error");
      return;
    }
    setMoveToPublishBusy(true);
    try {
      const savedDraftId = await save("draft", publishReconciliations, draftId, linesToPersist);
      if (!savedDraftId) throw new Error("편집 내용을 저장하지 못했습니다");
      if (!editLines.length) setEditLines(linesToPersist);
      changeRoom("publish");
      showToast("편집 내용을 저장하고 발행실로 이동했습니다", "success");
    } catch (error) {
      showToast(extractApiErrorMessage(error, "편집 내용을 저장하지 못했습니다"), "error");
    } finally {
      setMoveToPublishBusy(false);
    }
  }
  // 플랫폼별 발행 텍스트 추출
  function platformText(p: PreviewPlatform): string {
    if (p === "shorts" || p === "reels" || p === "tiktok") {
      const override = captions[p];
      if (typeof override === "string") return override;
      if (!text) return "";
      return [text.shorts?.hook, text.shorts?.body, text.shorts?.cta].filter(Boolean).join("\n") || text.threads || "";
    }
    if (!text) return "";
    if (p === "threads") return text.threads || "";
    if (p === "facebook") return text.facebook || "";
    if (p === "x") return text.x || "";
    if (p === "instagram") return text.instagram?.caption || "";
    return "";
  }

  function platformPublishInput(p: PreviewPlatform): PlatformPublishInput {
    return {
      title: titles[p] || "",
      body: platformText(p),
      hashtags: hashtags[p] || "",
      topicTag: topicTags[p] || "",
    };
  }

  function publishText(p: PreviewPlatform): string {
    return buildPlatformPublishText(p, platformPublishInput(p));
  }

  function capabilityFor(platform: PreviewPlatform): FirstCommentCapability {
    return firstCommentData?.capabilities.find((capability) => capability.platform === platform)
      ?? { platform, supported: false, reason: "백엔드 응답 확인 중" };
  }

  // 외부에는 올라갔는데 내부 기록을 못 남긴 상태를 사용자가 스스로 닫게 한다.
  // 2026-09-05 회장 계정 실측: 이 상태에 걸리면 발행을 누를 때마다 "재발행하지 말고 내부
  // 기록을 먼저 복구하세요" 만 뜨고, 정작 복구할 방법이 화면에 없었다. 막기만 하고 길이
  // 없으면 그것은 보호가 아니라 막다른 길이다. Buffer 도 실패 건에 한 번 누르는 조치를 준다.
  async function resolvePublishReconciliation() {
    const platforms = Object.keys(publishReconciliations);
    if (!platforms.length) return;
    try {
      const savedDraftId = await save("published", {}, draftId);
      if (!savedDraftId) throw new Error("기록 저장 실패");
      setPublishReconciliations({});
      showToast(`${platforms.map((platform) => LABEL[platform as keyof typeof LABEL]).join(", ")} 은 이미 올라간 것으로 기록했습니다. 이제 다음 작업을 이어가실 수 있습니다.`, "success");
    } catch {
      showToast("기록을 정리하지 못했습니다. 잠시 뒤 다시 눌러 주세요.", "error");
    }
  }

  async function publish() {
    // 2026-09-05 회장 계정 실측: 발행 단추를 눌렀는데 요청도 안 나가고 알림도 없었다.
    // 여기서 아무 말 없이 돌아섰기 때문이다. 조용한 반환은 고장으로 읽힌다. 이유를 말한다.
    if (!text) {
      showToast("발행할 본문이 없습니다. 생성실이나 작업물 전체에서 올릴 작업물을 먼저 가져와 주세요.", "error");
      return;
    }
    if (!activeWorkspace) { showToast("워크스페이스를 선택하세요", "error"); return; }
    if (Object.keys(publishReconciliations).length > 0) {
      showToast("외부 게시가 이미 완료된 항목입니다. 재발행하지 말고 내부 기록을 먼저 복구하세요.", "error");
      return;
    }
    const blocked = publishTargets
      .map((platform) => ({ platform, issue: validatePlatformPublish(platform, platformPublishInput(platform)).blocking[0] }))
      .find((entry) => entry.issue);
    if (blocked?.issue) {
      showToast(`${LABEL[blocked.platform]}: ${blocked.issue.message}`, "error");
      return;
    }
    const draftPersistence = await attemptRequiredDraftPersistence(() => save("draft"));
    if (!draftPersistence.ok) {
      showToast("발행할 초안을 저장하지 못했습니다", "error");
      return;
    }
    const did = draftPersistence.draftId;
    // 2026-09-05 회장 실사용: threads 는 실제로 올라갔는데 instagram 토큰 만료로 실패해
    // 전체가 실패로 보였고, 발행 버튼이 그대로 남아 다시 누르면 이미 올라간 채널까지
    // 재발행 대상이 됐다. 이번 초안에서 이미 성공한 채널은 대상에서 뺀다.
    const alreadyPublished = publishTargets.filter((platform) => pub.status[platform] === "done");
    const targets = publishTargets.filter((platform) => pub.status[platform] !== "done");
    if (!targets.length && alreadyPublished.length) {
      showToast(`${alreadyPublished.map((platform) => LABEL[platform]).join(", ")} 은 이미 발행됐습니다. 다시 올리지 않았습니다.`, "success");
      return;
    }
    if (!targets.length) { showToast("연결된 발행 계정이 없습니다. 설정에서 채널을 먼저 연결하세요", "error"); return; }
    const status: Record<string, PubStatus> = {}; targets.forEach((p) => (status[p] = "wait"));
    const urls: Record<string, string> = {};
    const errors: Record<string, string> = {};
    alreadyPublished.forEach((platform) => {
      status[platform] = "done";
      if (pub.urls[platform]) urls[platform] = pub.urls[platform];
    });
    const errs: string[] = [];
    const pendingReconciliations: PublishReconciliationMap = {};
    setPub({ running: true, stopped: false, status: { ...status }, urls: {}, errors: {} });
    await Promise.all(targets.map(async (p) => {
      status[p] = "doing";
      setPub({ running: true, stopped: false, status: { ...status }, urls: { ...urls }, errors: { ...errors } });
      let failureReason: string | null = null;
      try {
        // 실 발행: /api/publish (테넌트 채널 토큰). 토큰 없으면 graceful 에러.
        // publish_attempt = 실제 제출 시점(클릭 즉시가 아니라 이 루프 진입 시점). publish_success는
        // API가 ok:true를 반환한 뒤에만 처리한다. 낙관적 발행 금지.
        trackEvent({ name: "publish_attempt", params: { channel: p as AnalyticsChannel } });
        if (VIDEO_ROOM_PLATFORMS.has(p)) {
          // 영상 채널은 서버가 파일을 직접 읽는다. 화면이 들고 있는 배달 주소에서 파일명을 꺼낸다.
          const filename = videoFilename(vid?.file || vid?.url || "");
          if (!filename) {
            failureReason = "올릴 영상이 없습니다. 생성실에서 숏폼 영상을 먼저 만들어 주세요.";
            errs.push(`${LABEL[p]}: ${failureReason}`);
          } else {
            const vr = await apiPost<{ ok?: boolean; processing?: boolean; url?: string; error?: string }>("/api/video/publish", {
              filename,
              platform: VIDEO_PUBLISH_NAME[p] || p,
              title: titles[p] || idea || "",
              description: publishText(p),
              account_id: selectedAccounts[p] || undefined,
              draft_id: did,
              // 대문으로 쓸 시점. 지원하는 플랫폼만 실제로 쓴다(lib/video-cover.ts).
              cover_seconds: supportsCoverTimestamp(p) ? (coverSeconds[p] ?? DEFAULT_COVER_SECONDS) : undefined,
            });
            if (vr?.ok) {
              urls[p] = vr.url || POST_URL[p] || "#";
              trackEvent({ name: "publish_success", params: { channel: p as AnalyticsChannel } });
            } else {
              failureReason = vr?.error || "영상 발행에 실패했습니다";
              errs.push(`${LABEL[p]}: ${failureReason}`);
            }
          }
          status[p] = failureReason ? "failed" : "done";
          if (failureReason) errors[p] = failureReason;
          setPub({ running: true, stopped: false, status: { ...status }, urls: { ...urls }, errors: { ...errors } });
          return;
        }
        const r = await apiPost<{ ok?: boolean; partial?: boolean; permalink?: string; error?: string; firstComment?: { ok?: boolean; error?: string } }>("/api/publish", {
          tenant_id: activeWorkspace.id, platform: p, text: publishText(p), image_url: img?.url, draft_id: did,
          publish_fields: platformPublishInput(p),
          account_id: selectedAccounts[p] || undefined,
          first_comment: capabilityFor(p).supported && firstComments[p]?.trim() ? firstComments[p].trim() : undefined,
          edit_format: editFormat,
        });
        if (r?.ok && !r.partial) { urls[p] = r.permalink || POST_URL[p] || "#"; trackEvent({ name: "publish_success", params: { channel: p as AnalyticsChannel } }); }
        else {
          failureReason = r?.partial
            ? r.firstComment?.error || "본문은 올라갔지만 첫 댓글 발행에 실패했습니다"
            : r?.error || "실패";
          errs.push(`${LABEL[p]}: ${failureReason}`);
        }
      } catch (e) {
        if (isExternalPublishPersistenceError(e)) {
          const reconciliation = e.payload.persistence.reconciliation;
          pendingReconciliations[p] = reconciliation;
          if (e.payload.permalink) urls[p] = e.payload.permalink;
          failureReason = "외부 게시 완료·내부 기록 복구 필요 (재발행 금지)";
          errs.push(`${LABEL[p]}: ${failureReason}`);
        } else {
          failureReason = e instanceof Error ? e.message : "오류";
          errs.push(`${LABEL[p]}: ${failureReason}`);
        }
      }
      status[p] = failureReason ? "failed" : "done";
      if (failureReason) errors[p] = failureReason;
      setPub({
        running: true,
        stopped: false,
        status: { ...status },
        urls: { ...urls },
        errors: { ...errors },
      });
    }));
    setPub({
      running: false,
      stopped: false,
      status: { ...status },
      urls: { ...urls },
      errors: { ...errors },
    });
    if (Object.keys(pendingReconciliations).length > 0) {
      setPublishReconciliations(pendingReconciliations);
      try {
        await save("partial", pendingReconciliations, did);
      } catch {
        // The same storage incident can prevent the draft write too. The state was
        // already copied to localStorage-bound React state, so keep the no-republish
        // guard active and tell the operator that server-side recovery metadata is absent.
        errs.push("복구 정보 서버 저장 실패·현재 브라우저에만 보존됨");
      }
    } else {
      try {
        const savedDraftId = await save(errs.length ? "partial" : "published", {}, did);
        if (!savedDraftId) errs.push("발행 결과를 저장하지 못했습니다");
      } catch {
        errs.push("발행 결과를 저장하지 못했습니다");
      }
      setPublishReconciliations({});
    }
    // 일부만 실패했을 때 성공한 곳을 같이 말한다. 종전엔 실패만 보여서 전부 실패로 읽혔다.
    const doneNow = Object.keys(status).filter((platform) => status[platform] === "done");
    if (errs.length) {
      const head = doneNow.length ? `발행됨 ${doneNow.map((platform) => LABEL[platform as keyof typeof LABEL]).join(", ")} · ` : "";
      showToast(`${head}실패 ${errs.join(" / ")}`.slice(0, 180), "error");
    } else showToast("발행 완료", "success");
  }
  function loadDraft(d: Record<string, unknown>) {
    setIdea((d.idea as string) || ""); setText((d.text as TextVariants) || null);
    setImg((d.img as ImgResult) || null); setVid((d.vid as VidResult) || null);
    setIncludes(d.includes ? normalizeIncludes(d.includes as Record<string, boolean>) : includes); setDraftId(d.id as string);
    const savedReconciliations = normalizePublishReconciliations(d.publishReconciliations ?? d.publishReconciliation);
    setPublishReconciliations(savedReconciliations);
    setEditorHandoff((d.editorHandoff as EditorHandoff) || null);
    setTitles((d.titles as Record<string, string>) || {});
    setHashtags((d.hashtags as Record<string, string>) || {});
    setTopicTags((d.topicTags as Record<string, string>) || {});
    setFirstComments((d.firstComments as Record<string, string>) || {});
    setCaptions((d.captions as Record<string, string>) || {});
    setSelectedAccounts((d.selectedAccounts as Record<string, string>) || {});
    setEditLines((d.editLines as string[]) || []);
    setCardTextPositions((d.cardTextPositions as CardTextPosition[]) || []);
    setReviewQueueId((d.reviewQueueId as string) || null);
    const savedFormat = validateContentEditFormat(d.editFormat);
    if (savedFormat.valid) {
      setEditKind(savedFormat.value.kind);
      setEditFormat(savedFormat.value);
    } else if (d.editKind === "video" || d.editKind === "card" || d.editKind === "audio" || d.editKind === "text") {
      setEditKind(d.editKind);
      setEditFormat(defaultContentEditFormat(d.editKind));
    }
    showToast(
      Object.keys(savedReconciliations).length > 0
        ? "외부 게시 완료·내부 기록 복구 필요. 재발행 금지"
        : "불러옴. 수정 후 재발행 가능",
      Object.keys(savedReconciliations).length > 0 ? "error" : "success",
    );
  }
  function resumeCurrentWork() {
    const current = hist?.currentWork;
    if (!current) return;
    const draft = hist.drafts.find((item) => item.id === current.draftId);
    if (!draft) return;
    loadDraft(draft);
    if (current.stage === "performance") {
      window.location.assign("/performance");
      return;
    }
    changeRoom(current.stage);
  }
  const commentHandoffLoaded = useRef<string | null>(null);
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const requestedDraftId = params.get("draft_id");
    const sourceCommentId = params.get("comment_id");
    if (!requestedDraftId || !sourceCommentId || commentHandoffLoaded.current === requestedDraftId || !hist?.drafts) return;
    const requestedDraft = hist.drafts.find((draft) => draft.id === requestedDraftId);
    if (!requestedDraft) return;
    loadDraft(requestedDraft);
    setActiveRoom("edit");
    commentHandoffLoaded.current = requestedDraftId;
  }, [hist?.drafts, setActiveRoom]);
  const publishReturnLoaded = useRef<string | null>(null);
  useEffect(() => {
    if (!publishReturnRequest || !publishReturnQueue?.posts) return;
    const loadKey = `${publishReturnRequest.sourceRoute}:${publishReturnRequest.queuePostId}`;
    if (publishReturnLoaded.current === loadKey) return;
    const queuePost = publishReturnQueue.posts.find((post) => post.id === publishReturnRequest.queuePostId);
    if (!queuePost) {
      publishReturnLoaded.current = loadKey;
      showToast("돌아갈 작업물을 찾지 못했습니다", "error");
      return;
    }
    const draftResolution = resolvePublishReturnDraftId(publishReturnRequest, queuePost);
    if (!draftResolution.ok) {
      publishReturnLoaded.current = loadKey;
      showToast("주소의 초안과 작업물 연결 정보가 달라 불러오지 않았습니다", "error");
      return;
    }
    const linkedDraftId = draftResolution.draftId;
    if (linkedDraftId && !hist?.drafts) return;
    const linkedDraft = linkedDraftId
      ? hist?.drafts.find((draft) => draft.id === linkedDraftId)
      : null;
    const linkedDraftHasPublishText = linkedDraft?.text !== null
      && typeof linkedDraft?.text === "object";
    if (linkedDraft && linkedDraftHasPublishText) {
      loadDraft(linkedDraft);
    } else {
      const work = buildPublishReturnWork(queuePost);
      if (!work) {
        publishReturnLoaded.current = loadKey;
        showToast("작업물 본문이 없어 발행실로 가져오지 못했습니다", "error");
        return;
      }
      const tagText = work.hashtags.map((tag) => tag.replace(/^#/, "")).join(" ");
      setIdea((linkedDraft?.idea as string) || work.idea);
      setText({
        threads: work.body,
        x: work.body,
        facebook: work.body,
        instagram: { caption: work.body, hashtags: work.hashtags.map((tag) => tag.replace(/^#/, "")) },
        shorts: { hook: work.body, body: "", cta: "" },
      });
      setImg(work.imageUrl ? { url: work.imageUrl, file: work.imageUrl, localPath: work.imageUrl } : null);
      setVid(work.videoUrl ? { url: work.videoUrl, file: work.videoUrl, model: "기존 작업물" } : null);
      setIncludes(work.includedPlatforms.length
        ? normalizeIncludes(Object.fromEntries(ALL.map((platform) => [platform, work.includedPlatforms.includes(platform)])))
        : normalizeIncludes());
      setTitles((linkedDraft?.titles as Record<string, string>) || {});
      setHashtags((linkedDraft?.hashtags as Record<string, string>) || (tagText ? { instagram: tagText } : {}));
      setTopicTags((linkedDraft?.topicTags as Record<string, string>) || {});
      setFirstComments((linkedDraft?.firstComments as Record<string, string>) || {});
      setCaptions((linkedDraft?.captions as Record<string, string>) || {});
      setSelectedAccounts((linkedDraft?.selectedAccounts as Record<string, string>) || {});
      setEditLines((linkedDraft?.editLines as string[]) || []);
      setCardTextPositions((linkedDraft?.cardTextPositions as CardTextPosition[]) || []);
      const linkedFormat = validateContentEditFormat(linkedDraft?.editFormat);
      if (linkedFormat.valid) {
        setEditKind(linkedFormat.value.kind);
        setEditFormat(linkedFormat.value);
      }
      setDraftId(linkedDraftId);
      setPublishReconciliations(normalizePublishReconciliations(linkedDraft?.publishReconciliations ?? linkedDraft?.publishReconciliation));
      setEditorHandoff((linkedDraft?.editorHandoff as EditorHandoff) || null);
    }
    setReviewQueueId(publishReturnRequest.queuePostId);
    setActiveRoom("publish");
    publishReturnLoaded.current = loadKey;
    showToast(publishReturnRequest.sourceRoute === "inbox" ? "검토 대기 작업물을 불러왔습니다" : "발행 일정 작업물을 불러왔습니다", "success");
  }, [hist?.drafts, publishReturnQueue?.posts, publishReturnRequest, setActiveRoom, showToast]);
  const pubPct = (() => { const v = Object.values(pub.status); return v.length ? Math.round((v.filter((s) => s === "done").length / v.length) * 100) : 0; })();
  const pubFailed = Object.values(pub.status).filter((s) => s === "failed").length;
  const hasPublishedResult = !pub.running && Object.values(pub.status).some((status) => status === "done");
  const pubResultLabel = pub.running
    ? "발행 중…"
    : pub.stopped
      ? "발행 중지됨"
      : pubFailed > 0 && pubPct > 0
        ? "일부 발행 실패"
        : pubFailed > 0
          ? "발행 실패"
          : "발행 완료";
  const LABEL: Record<string, string> = { threads: "Threads", x: "X", facebook: "Facebook", instagram: "Instagram", shorts: "Shorts", reels: "Reels", tiktok: "TikTok" };

  function chooseCandidate(candidate: StudioGenerationCandidate) {
    setSelectedCandidate(candidate);
    const body = [candidate.title, candidate.rationale, ...candidate.format.outline].join("\n");
    setText({
      threads: body,
      x: trimToChannelLimit(body, "x"),
      facebook: body,
      instagram: { caption: candidate.rationale, slides: candidate.format.outline, hashtags: [] },
      shorts: { hook: candidate.title, body: candidate.format.outline.join("\n"), cta: candidate.rationale },
    });
    setEditLines([candidate.title, ...candidate.format.outline, candidate.rationale]);
    /*
      2026-09-09 실사용에서 찾았다. 생성실에서 "글" 을 골라 구조를 고르고 편집실로 갔더니
      종류가 카드뉴스로 잡혔다. content_branch 는 text_image 와 video 둘뿐이라 글과
      카드뉴스를 못 가른다. 그래서 글도 카드로 떨어졌다.
      사용자가 방금 고른 형식(createPrimaryKind)이 있으면 그것이 맞다. 그 값이 없을 때만
      갈래로 추측한다.
    */
    const nextKind: EditContentKind = createPrimaryKind
      ?? (candidate.format.content_branch === "video" ? "video" : "card");
    setEditKind(nextKind);
    setEditFormat(defaultContentEditFormat(nextKind));
  }

  function updatePreviewCaption(platform: PreviewPlatform, value: string) {
    setCaptions((current) => ({ ...current, [platform]: value }));
    if (platform === "threads") upText({ threads: value });
    else if (platform === "x") upText({ x: value });
    else if (platform === "facebook") upText({ facebook: value });
    else if (platform === "instagram") upIg({ caption: value });
    else {
      // Shorts는 편집실 대본과 같은 원본을 쓰므로 저장 대상 본문에도 반영한다.
      if (platform === "shorts") upText({ shorts: { ...(text?.shorts || {}), hook: value } });
    }
  }

  function previewAccount(platform: PreviewPlatform): PreviewAccount {
    if (!PUBLISH_SUPPORTED.has(platform)) return { status: "unsupported" };
    if (!accountsLoaded) return { status: "loading" };
    if (accountLoadErrors[platform]) return { status: "error" };
    const accounts = accountsByPlatform[platform] || [];
    if (!accounts.length) return { status: "missing" };
    const selected = accounts.find((account) => account.id === selectedAccounts[platform])
      || accounts.find((account) => account.is_default)
      || accounts[0];
    return { status: "connected", displayName: selected.displayName, username: selected.username };
  }

  function previewEditor(platform: PreviewPlatform): PreviewInlineEditor {
    const capability = capabilityFor(platform);
    return {
      account: previewAccount(platform),
      title: titles[platform] || "",
      caption: platformText(platform),
      hashtags: hashtags[platform] || (platform === "instagram" ? (text?.instagram?.hashtags || []).join(" ") : ""),
      topicTag: topicTags[platform] || "",
      firstComment: firstComments[platform] || "",
      firstCommentSupported: capability.supported,
      firstCommentReason: capability.reason || undefined,
      onTitleChange: (value) => setTitles((current) => ({ ...current, [platform]: value })),
      onCaptionChange: (value) => updatePreviewCaption(platform, value),
      onHashtagsChange: (value) => {
        setHashtags((current) => ({ ...current, [platform]: value }));
        if (platform === "instagram") upIg({ hashtags: value.split(/[,\s]+/).map((item) => item.replace(/^#/, "")).filter(Boolean) });
      },
      onTopicTagChange: (value) => setTopicTags((current) => ({ ...current, [platform]: value })),
      onFirstCommentChange: (value) => setFirstComments((current) => ({ ...current, [platform]: value })),
    };
  }

  // ── 발행실에서만 한 번에 되는 일 ──
  // 손으로 하면 칸을 일곱 번 열어 일곱 번 고쳐야 하는 것들이다. 채널마다 다른 규격(해시태그 개수,
  // 본문 한도)을 고객이 외우지 않아도 되게 대화창이 대신 맞춘다. 규칙은 lib/studio/publish-bulk.ts.
  const bulkTargets = ALL.filter((platform) => PUBLISH_SUPPORTED.has(platform)) as BulkPlatform[];
  const connectedTargets = bulkTargets.filter((platform) => (accountsByPlatform[platform] || []).length > 0);
  const previewTargets = ALL as BulkPlatform[];

  function selectAllChannels() {
    if (!connectedTargets.length) { showToast("연결된 채널이 아직 없습니다. 먼저 계정을 연결해 주세요", "error"); return; }
    setIncludes((current) => ({ ...current, ...Object.fromEntries(connectedTargets.map((platform) => [platform, true])) }));
    showToast(`연결된 ${connectedTargets.length}곳을 모두 골랐습니다`, "success");
  }
  function clearAllChannels() {
    setIncludes((current) => ({ ...current, ...Object.fromEntries(bulkTargets.map((platform) => [platform, false])) }));
    showToast("고른 곳을 모두 해제했습니다", "success");
  }
  function excludeChannel(platform: BulkPlatform) {
    setIncludes((current) => ({ ...current, [platform]: false }));
    showToast(`${LABEL[platform]}만 빼고 두었습니다`, "success");
  }
  function keepOnlyChannel(platform: BulkPlatform) {
    if (!(accountsByPlatform[platform] || []).length) { showToast(`${LABEL[platform]} 계정이 아직 연결되지 않았습니다`, "error"); return; }
    setIncludes((current) => ({ ...current, ...Object.fromEntries(bulkTargets.map((p) => [p, p === platform])) }));
    showToast(`${LABEL[platform]} 한 곳만 남겼습니다`, "success");
  }
  function unifyHashtagsAcrossChannels() {
    const source = hashtags.instagram || Object.values(hashtags).find((value) => value?.trim()) || (text?.instagram?.hashtags || []).join(" ");
    const tags = parseHashtags(source);
    if (!tags.length) { showToast("맞출 해시태그가 아직 없습니다. 한 곳에 먼저 적어 주세요", "error"); return; }
    const spread = spreadHashtags(source, previewTargets);
    setHashtags((current) => ({ ...current, ...spread }));
    upIg({ hashtags: tags.slice(0, HASHTAG_BUDGET.instagram) });
    showToast(`해시태그를 일곱 곳 규격에 맞춰 나눴습니다. X는 ${HASHTAG_BUDGET.x}개, 인스타그램은 ${HASHTAG_BUDGET.instagram}개입니다`, "success");
  }
  function trimOverLimitChannels() {
    // 자르는 잣대를 막는 잣대와 같게 한다. 종전에는 본문만 코드포인트로 세어
    // 잘랐는데 X 는 본문과 해시태그를 합쳐 가중 문자로 재기 때문에, 한글 본문은
    // 이 단추를 눌러도 끝내 한도 안으로 못 들어왔다(2026-09-07 회장 계정 실측).
    const next: Record<string, string> = {};
    for (const platform of previewTargets) {
      const trimmed = trimBodyToFit(platform as PreviewPlatform, platformPublishInput(platform as PreviewPlatform));
      if (trimmed !== null) next[platform] = trimmed;
    }
    const changed = Object.keys(next);
    if (!changed.length) { showToast("한도를 넘긴 곳이 없습니다", "success"); return; }
    for (const platform of changed) updatePreviewCaption(platform as PreviewPlatform, next[platform]);
    showToast(`한도를 넘긴 ${changed.map((platform) => LABEL[platform]).join(", ")}만 줄였습니다`, "success");
  }

  async function requestReview() {
    if (!text || !activeWorkspace) {
      showToast("검토할 작업물이 없습니다", "error");
      return;
    }
    setReviewBusy(true);
    try {
      let queueId = reviewQueueId;
      if (!queueId) {
        const linkedDraftId = draftId || await save("draft");
        if (!linkedDraftId) throw new Error("검토 요청용 초안을 저장하지 못했습니다");
        const added = await apiPost<{ post?: { id?: string } }>("/api/queue/add", {
          tenant_id: activeWorkspace.id,
          draftId: linkedDraftId,
          text: publishText(publishTargets[0] || "threads"),
          topic: idea || "Studio 작업물",
          hashtags: (hashtags.instagram || "").split(/[\s,]+/).map((value) => value.replace(/^#/, "")).filter(Boolean),
          imageUrl: img?.url || null,
          videoUrl: vid?.url || null,
        });
        queueId = added?.post?.id || null;
        if (!queueId) throw new Error("검토 요청용 초안을 만들지 못했습니다");
        setReviewQueueId(queueId);
      }
      const response = await apiPost<{ reused?: boolean }>(`/api/queue/${queueId}/request-review`, {
        tenant_id: activeWorkspace.id,
      });
      showToast(response?.reused ? "이미 검토 요청된 작업물입니다" : "검토 요청을 보냈습니다", "success");
    } catch (error) {
      showToast(extractApiErrorMessage(error, "검토 요청에 실패했습니다"), "error");
    } finally {
      setReviewBusy(false);
    }
  }

  async function submitPublishChat(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const raw = publishChatDraft.trim();
    if (!raw) return;
    setPublishChatDraft("");
    const command = parsePublishCommand(raw);
    switch (command.kind) {
      case "selectAll": selectAllChannels(); return;
      case "clearAll": clearAllChannels(); return;
      case "exclude": excludeChannel(command.platform); return;
      case "onlyOne": keepOnlyChannel(command.platform); return;
      case "unifyHashtags": unifyHashtagsAcrossChannels(); return;
      case "trimOverLimit": trimOverLimitChannels(); return;
      case "schedule": setShowSchedule(true); return;
      case "requestReview": await requestReview(); return;
      case "saveDraft": await saveDraftWithNotice(); return;
      case "publishNow": await publish(); return;
      default:
        showToast("전부 고르기, 한 곳 빼기, 해시태그 맞추기, 한도 넘는 곳 줄이기, 예약 발행, 검토 요청, 임시 저장, 지금 발행 중 하나로 말씀해 주세요", "error");
    }
  }

  // 도는 동안 무엇이 도는지와 그만두는 길을 같은 자리에서 보여 준다. 없으면 사용자는
  // 멈춘 것인지 도는 것인지 알 수 없다(2026-09-06 회장 스모크: "로딩스피너가 없어서
  // 전반적으로 진행상황 UI 확인이 안됨").
  const progressStrip = busy ? (
    <div role="status" aria-live="polite" data-generation-progress
      className="mb-stack flex flex-wrap items-center gap-stack rounded-control border border-accent/40 bg-accent-soft px-stack py-stack-tight text-body-sm text-accent">
      <span aria-hidden className="inline-block h-4 w-4 animate-spin rounded-pill border-2 border-accent border-t-transparent" />
      <b className="font-semibold">{busy}</b>
      <span className="text-caption text-muted">끝날 때까지 이 자리에 표시됩니다.</span>
      <span className="ml-auto">
        <Button size="sm" data-testid="generation-cancel" onClick={cancelGeneration}>생성 취소</Button>
      </span>
    </div>
  ) : null;

  const roomHeader = (
    <RoomHeader
      workspaceName={activeWorkspace?.name}
      subtitle="콘텐츠 작업실"
      roomLabel={activeRoom === "create" ? "생성실" : activeRoom === "edit" ? "편집실" : "발행실"}
      currentRoom={activeRoom}
      leading={
        <>
          <Button onClick={() => { setShowUsageHistory(false); setShowWorks((value) => !value); }} aria-expanded={showWorks} aria-controls="studio-work-overview">
            작업물 전체 <span className="ml-micro text-accent">{hist?.drafts.length ?? 0}</span>
          </Button>
          <LearningStatus
            filled={countFilledUserSlots(learningInfo, { guide })}
            flashToken={learningFlash}
            onOpen={() => { setShowUsageHistory(false); setShowWorks(false); setShowWizard(true); }}
          />
          {/* 세 방 어디서나 같은 자리에서 지금 작업물을 버리고 새로 시작한다. */}
          <Button data-testid="studio-discard-work" onClick={discardCurrentWork}>새로 시작</Button>
          {/* 내가 이번 달 얼마나 썼는지. 안 보이면 고객은 쓰다가 갑자기 막힌다. */}
          {usage ? (
            <button type="button" data-testid="studio-usage-chip"
              onClick={() => { setShowWorks(false); setShowUsageHistory((open) => !open); }}
              aria-expanded={showUsageHistory}
              className="inline-flex min-h-control-touch items-center gap-stack-tight rounded-control border border-border bg-surface-2 px-stack text-body-sm text-muted hover:bg-surface"
              title="눌러서 이 작업 공간의 생성 이력을 봅니다">
              <span>이번 달 생성</span>
              {/*
                2026-09-06 실측: 여기서 읽던 이름이 응답 필드와 달라(aiGeneration 대
                aiGenerations) 실제 22건인데 화면에는 0건으로 떴다. 응답 정본 이름을 쓴다.
              */}
              {/*
                2026-09-09 회장 지적: "이번 달 생성은 뭐하는거지 토큰관리야? UI가 이상한데."
                종전에는 쓴 건수만 적었다. 그러면 이것이 무엇을 세는 숫자인지, 얼마까지
                쓸 수 있는지, 넘으면 어떻게 되는지를 화면이 한 마디도 안 한다.
                실제로는 월 한도가 걸려 있고 넘으면 생성이 막힌다. 쓰다가 갑자기 막히는
                것이 가장 나쁘다. 쓴 건수와 한도를 함께 적고 남은 건수를 앞세운다.
              */}
              <b className="text-accent">
                {quotaIncluded === null
                  ? `${quotaUsed}건`
                  : `${quotaUsed} / ${quotaIncluded}건`}
              </b>
              {quotaRemaining !== null ? (
                <span className={`text-caption ${quotaRemaining <= 5 ? "text-warning" : "text-subtle"}`}>
                  {quotaRemaining > 0 ? `${quotaRemaining}건 남음` : "한도 다 씀"}
                </span>
              ) : null}
              {usage.tier ? <span className="text-caption text-subtle">{usage.tier} 요금제</span> : null}
            </button>
          ) : null}
        </>
      }
      trailing={
        <>
          {activeRoom === "create" || activeRoom === "edit" ? (
            <span className="rounded-pill border border-accent/30 bg-surface px-stack py-stack-tight text-caption font-semibold text-accent" data-kind-board>
              지금 만드는 것: {activeRoom === "create" ? createPrimaryKind ? createPrimaryKind === "video" ? "영상" : createPrimaryKind === "card" ? "카드뉴스" : "글" : "선택 전" : editKind === "video" ? "영상" : editKind === "card" ? "카드뉴스" : editKind === "text" ? "글" : "음악"}
              {activeRoom === "create" && alsoKinds.length ? <span className="font-normal text-subtle">, {alsoKinds.map((kind) => (kind === "video" ? "영상" : kind === "card" ? "카드뉴스" : "글")).join(", ")}</span> : null}
            </span>
          ) : null}
          <span className="rounded-control border border-border bg-surface-2 px-stack py-stack-tight text-caption text-subtle" title={activeRoom === "create" ? "현재 생성실은 일곱 칸 학습 정보를 바탕으로 AI 구성 초안을 만듭니다." : "AI 작업 상태"}>{activeRoom === "create" ? "AI 구성 초안" : engine?.error ? "AI 연결 확인 필요" : "AI 사용 가능"}</span>
        </>
      }
    >
      {/*
        머리줄에서 여는 판(생성 이력·작업물 전체)은 같은 자리에 겹쳐 뜬다. 그래서 하나를
        열 때 다른 하나를 닫는다. 2026-09-08 회장 실사용: "이번 달 생성" 을 누른 다음
        "학습 정보" 를 누르니 생성 이력 판이 학습 정보를 덮어 아무것도 못 했다.
        판이 서로를 모르면 사용자가 손으로 닫아 줘야 하고, 덮인 쪽은 닫을 수도 없다.
      */}
      {showUsageHistory ? (
        <div id="studio-usage-history" data-usage-history
          className="absolute left-0 right-0 top-full z-50 mt-stack space-y-stack-tight rounded-surface border border-border bg-surface p-pad-inset shadow-lg">
          <b className="block text-body text-text">이 작업 공간의 생성 이력</b>
          <p className="break-keep text-caption text-subtle">최근 20건입니다. 무엇을 언제 만들었는지와 쓴 토큰을 보여 드립니다.</p>
          {historyData && historyData.ok === false ? (
            <p role="alert" className="text-caption text-danger">{historyData.error || "생성 이력을 불러오지 못했습니다."}</p>
          ) : !historyData ? (
            <p className="text-caption text-muted">불러오는 중입니다.</p>
          ) : (historyData.items ?? []).length === 0 ? (
            <p className="text-caption text-muted">아직 만든 것이 없습니다. 생성실에서 첫 초안을 만들어 보세요.</p>
          ) : (historyData.items ?? []).map((item, index) => (
            <div key={`${item.at}-${index}`} data-usage-history-item
              className="flex flex-wrap items-center gap-stack rounded-control border border-border bg-surface-2 px-stack py-stack-tight text-body-sm">
              <span className="shrink-0 rounded-pill bg-accent-soft px-stack-tight text-caption font-semibold text-accent">{item.kind}</span>
              <b className="min-w-0 flex-1 truncate text-text">{item.label || "제목 없음"}</b>
              {item.totalTokens ? <span className="shrink-0 text-caption text-subtle">토큰 {item.totalTokens.toLocaleString()}</span> : null}
              <span className="shrink-0 text-caption text-subtle">{new Date(item.at).toLocaleString("ko-KR", { month: "numeric", day: "numeric", hour: "2-digit", minute: "2-digit" })}</span>
            </div>
          ))}
        </div>
      ) : null}
      {showWorks ? (
        /*
          2026-09-06 회장 스모크: "발행실에서는 팝업이 챗봇에 가려짐". 이 판은 z-20 인데
          발행실 대화 패널이 z-40 이라 좁은 화면에서 덮였다. 머리줄에서 연 판은 그 아래
          어떤 패널보다 위에 있어야 한다.
        */
        <div id="studio-work-overview" className="absolute left-0 right-0 top-full z-50 mt-stack space-y-stack rounded-surface border border-border bg-surface p-pad-inset shadow-lg">
          {hist?.currentWork && hist.drafts.some((draft) => draft.id === hist.currentWork?.draftId) ? (
            <div className="flex flex-wrap items-center gap-stack border-b border-border pb-stack" data-current-work={hist.currentWork.stage}>
              <div className="mr-auto min-w-0">
                <span className="block text-caption text-subtle">현재 작업 · {hist.currentWork.stageLabel}</span>
                <b className="block truncate text-body text-text">{hist.currentWork.idea}</b>
              </div>
              <Button variant="primary" onClick={resumeCurrentWork}>
                {hist.currentWork.stage === "create" ? "이어 생성하기" : hist.currentWork.stage === "edit" ? "이어 편집하기" : hist.currentWork.stage === "publish" ? "이어 발행하기" : "성과 보기"}
              </Button>
            </div>
          ) : null}
          {/*
            2026-09-06 회장 스모크: "작업물 전체 12 클릭하면 1개밖에 없고 생성실/편집실/
            발행실/성과실은 왜 있는지 모르겠음". 숫자는 작업물 수를 가리키는데 판에는
            작업물이 없고 방 이동 단추만 있었다. 방 이동은 머리줄에 이미 있으므로 여기서
            빼고, 숫자가 약속한 목록을 실제로 보여 준다.
          */}
          <div className="space-y-stack-tight" data-work-list>
            {(hist?.drafts ?? []).length === 0 ? (
              <p className="break-keep text-body-sm text-muted">아직 작업물이 없습니다. 생성실에서 첫 초안을 만들어 보세요.</p>
            ) : (hist?.drafts ?? []).slice(0, 20).map((draft) => (
              <button
                key={String((draft as { id?: unknown }).id ?? "")}
                type="button"
                data-work-item={String((draft as { id?: unknown }).id ?? "")}
                onClick={() => {
                  const room = draftLandingRoom(draft as unknown as Record<string, unknown>);
                  loadDraft(draft as unknown as Record<string, unknown>);
                  setActiveRoom(room);
                  setShowWorks(false);
                  showToast(`${ROOM_LABEL[room]}에서 이어 작업합니다`, "success");
                }}
                className="flex min-h-control-touch w-full flex-wrap items-center gap-stack rounded-control border border-border bg-surface-2 px-stack py-stack-tight text-left hover:bg-surface"
              >
                <b className="min-w-0 flex-1 truncate text-body-sm text-text">{(draft as { idea?: string }).idea || "제목 없는 작업물"}</b>
                <span className="shrink-0 text-caption text-subtle">{draftStatusLabel((draft as { status?: string }).status)}</span>
                {/*
                  2026-09-09 회장 지적: "작업물 클릭하면 어디로 이동해서 뭘 하는건지."
                  종전에는 눌러도 방이 안 바뀌고 상태만 조용히 채워졌다. 그래서 무엇이
                  일어났는지도, 어디로 가야 하는지도 알 수 없었다. 누르기 전에 갈 곳을
                  적고, 누르면 실제로 그 방으로 데려간다.
                */}
                <span className="shrink-0 rounded-pill border border-accent/30 bg-accent-soft px-stack-tight text-caption font-semibold text-accent">
                  {ROOM_LABEL[draftLandingRoom(draft as unknown as Record<string, unknown>)]}로
                </span>
              </button>
            ))}
            {(hist?.drafts ?? []).length > 20 ? (
              <p className="text-caption text-subtle">최근 20개만 보여 드립니다. 전체 {hist?.drafts.length}개.</p>
            ) : null}
          </div>
        </div>
      ) : null}
    </RoomHeader>
  );

  if (activeWorkspace && hydratedWorkspaceId !== activeWorkspace.id) {
    return <div aria-busy="true" className="min-h-screen bg-bg" />;
  }

  if (activeRoom === "create") return (
    <div className="px-stack-section py-pad-inset">
      {showWizard && activeWorkspace ? <LearningCardWizard workspaceId={activeWorkspace.id} workspaceName={activeWorkspace.name} onSaved={(info, completed) => { setLearningInfo(info); if (completed) { setShowWizard(false); mutateBrand(); showToast("학습 정보를 배웠습니다"); } else { setLearningFlash((value) => value + 1); } }} onClose={() => setShowWizard(false)} /> : null}
      {roomHeader}
      {/* 처음 온 사람은 생성실에 있다. 시작 안내가 발행실에만 붙어 있어서, 정작 첫 화면에서는
          무엇을 할 차례인지 보이지 않았다(2026-09-08 회장 계정 실측). 첫 화면에도 둔다. */}
      <GettingStartedStrip />
      {progressStrip}
      <CreateRoom
        workspaceId={activeWorkspace?.id}
        workspaceName={activeWorkspace?.name}
        guide={guide}
        topic={idea}
        contentBranch={createBranch}
        onContentBranchChange={setCreateBranch}
        onPrimaryKindChange={setCreatePrimaryKind}
        onTopicChange={setIdea}
        onOpenLearning={() => setShowWizard(true)}
        onCandidateSelect={chooseCandidate}
        onOpenEditor={() => changeRoom("edit")}
        onAlsoKindsChange={setAlsoKinds}
        learningVersion={learningFlash + countFilledUserSlots(learningInfo, { guide })}
        resumeCount={hist?.drafts.length ?? 0}
        onResume={() => setShowWorks(true)}
        quickDraft={text}
        quickDraftLoading={busy === "초안 만드는 중"}
        quickDraftError={lastError}
        onQuickDraftGenerate={generateQuickDraft}
        onGenerateCardImages={generateCardImages}
        onGenerateVideo={generateShortVideo}
        videoBusy={busy === "숏폼 영상 만드는 중"}
        imageStyleId={imageStyleId}
        imageStyleCustom={imageStyleCustom}
        onImageStyleChange={(styleId, custom) => { setImageStyleId(styleId); setImageStyleCustom(custom); }}
        resetToken={createResetToken}
        madeImageUrl={img?.file || img?.url || null}
        madeVideoUrl={vid?.file || vid?.url || null}
        cardImageBusy={busy === "카드뉴스 이미지 만드는 중"}
      />
      <CostApprovalDialog request={costApproval} onApprove={() => settleCostApproval(true)} onCancel={() => settleCostApproval(false)} />
      <ConfirmDialog request={confirmRequest} onConfirm={() => settleConfirm(true)} onCancel={() => settleConfirm(false)} />
    </div>
  );

  // 편집실 본 화면과 대화창이 같은 대사를 본다. 대화창만 빈 배열을 받으면 일괄 편집이 죽은 단추가 된다.
  const resolvedEditLines = editLines.length ? editLines : [text?.shorts?.hook || "", text?.shorts?.body || "", text?.shorts?.cta || ""].filter(Boolean);

  if (activeRoom === "edit") return (
    <div className="px-stack-section py-pad-inset">
      {showWizard && activeWorkspace ? <LearningCardWizard workspaceId={activeWorkspace.id} workspaceName={activeWorkspace.name} onSaved={(info, completed) => { setLearningInfo(info); if (completed) { setShowWizard(false); mutateBrand(); showToast("학습 정보를 배웠습니다"); } else { setLearningFlash((value) => value + 1); } }} onClose={() => setShowWizard(false)} /> : null}
      {roomHeader}
      <EditRoom
        workspaceId={activeWorkspace?.id}
        lines={resolvedEditLines}
        onLinesChange={syncEditLines}
        kind={editKind}
        onKindChange={(nextKind) => {
          setEditKind(nextKind);
          setEditFormat(defaultContentEditFormat(nextKind));
        }}
        initialFormat={editFormat}
        onFormatChange={setEditFormat}
        previewReady={editKind === "video" ? Boolean(vid?.file) : editKind === "card" ? Boolean(img?.file) : false}
        previewImageUrl={img?.file || img?.url || null}
        previewVideoUrl={vid?.file || vid?.url || null}
        cardTextPositions={cardTextPositions}
        onCardTextPositionsChange={setCardTextPositions}
        onOpenCreate={() => changeRoom("create")}
        onOpenPublish={moveToPublish}
        lastSavedAt={editSavedAt}
        moveBusy={moveToPublishBusy}
        autosaveError={editAutosaveError}
      />
    </div>
  );

  if (activeRoom === "publish") return (
    <div className="px-stack-section py-pad-inset">
      {showWizard && activeWorkspace ? <LearningCardWizard workspaceId={activeWorkspace.id} workspaceName={activeWorkspace.name} onSaved={(info, completed) => { setLearningInfo(info); if (completed) { setShowWizard(false); mutateBrand(); showToast("학습 정보를 배웠습니다"); } else { setLearningFlash((value) => value + 1); } }} onClose={() => setShowWizard(false)} /> : null}
      {showRepo && activeWorkspace ? <RepoConnect workspace={activeWorkspace} onSynced={() => { mutateBrand(); showToast("브랜드 가이드 갱신됨"); }} onClose={() => setShowRepo(false)} /> : null}
      {roomHeader}
      <GettingStartedStrip connectedCount={accountsLoaded && connectedTargets.length === 0 ? 0 : undefined} />
      {/*
        연결된 채널이 하나도 없으면 발행실에서는 무엇을 눌러도 아무 데도 안 올라간다.
        그 안내를 종전에는 시작 스트립에 기대고 있었다. 그런데 그 줄은 진행 칸이 다 차면
        사라지고, 가리키는 곳도 그때그때 다르다. 발행 직전에 반드시 있어야 하는 말을
        사라질 수 있는 줄에 맡기면 안 된다(2026-09-08 코드 감사 F-02 후속).
        발행실이 자기 말로 한다.
      */}
      {accountsLoaded && connectedTargets.length === 0 ? (
        <div data-testid="publish-no-channel" className="mb-pad-inset flex flex-wrap items-center gap-stack rounded-surface border border-warning/40 bg-warning/10 px-stack py-stack-tight text-caption text-warning">
          <span className="min-w-0 flex-1 break-keep">
            아직 연결된 채널이 없어 발행할 수 없습니다. 채널을 하나만 연결하면 이 작업물을 바로 올릴 수 있습니다.
          </span>
          <Link href="/settings?tab=channels" className="inline-flex min-h-control-touch shrink-0 items-center rounded-control bg-accent px-stack text-caption font-semibold text-accent-fg">
            채널 연결하기
          </Link>
        </div>
      ) : null}
      <section data-room="publish" className="grid gap-stack-section pb-wide lg:grid-cols-[minmax(0,1fr)_20rem] lg:pb-none">
        <div className="min-w-0 space-y-region">
          {/*
            2026-09-07 실계정 E2E 에서 찾았다. 본문 없는 작업물을 고르면 발행실이 "0/500" 인
            채로 아무 말도 하지 않았다. 왜 비었는지도, 어디로 가야 하는지도 없다. 조용한
            실패다(ADR-007). 비었으면 그 사실과 빠져나갈 길을 같이 준다.
          */}
          {!text ? (
            <div data-testid="publish-empty" role="status" className="rounded-surface border border-warning/30 bg-warning/10 p-stack-section">
              <b className="block text-body text-text">올릴 본문이 아직 없습니다</b>
              <p className="mt-stack-tight break-keep text-body-sm text-muted">
                이 작업물에는 본문이 없습니다. 생성실에서 새로 만들거나, 작업물 전체에서 본문이 있는 것을 고르세요.
              </p>
              <div className="mt-stack flex flex-wrap gap-stack-tight">
                <Button size="sm" data-testid="publish-empty-create" onClick={() => changeRoom("create")}>생성실에서 만들기</Button>
                <Button size="sm" variant="secondary" data-testid="publish-empty-works" onClick={() => setShowWorks(true)}>다른 작업물 고르기</Button>
              </div>
            </div>
          ) : null}
          <section data-room-top="publish" aria-label="이 방에서 지금 알아야 할 것" className="flex min-h-control-touch flex-wrap items-center gap-stack rounded-surface border border-border bg-surface px-pad-inset py-stack">
            <b className="text-lead text-accent">{selectedTargets.length}곳</b>
            <span className="mr-auto text-caption text-subtle">
              발행할 채널 · 연결된 곳 {connectedTargets.length}
            </span>
            <Button
              size="sm"
              data-testid="publish-select-all"
              onClick={selectAllChannels}
              disabled={!accountsLoaded || connectedTargets.length === 0 || publishTargets.length === connectedTargets.length}
            >
              연결된 {connectedTargets.length}곳 전부 고르기
            </Button>
            <Button
              size="sm"
              data-testid="publish-clear-all"
              onClick={clearAllChannels}
              disabled={selectedTargets.length === 0}
            >
              전부 해제
            </Button>
          </section>
          <PlatformFocusFilter>
            {(focus) => (
              <>
          {lastError ? <div className="rounded-control border border-danger/30 bg-danger/10 p-stack text-caption text-danger">마지막 실패: {lastError}</div> : null}
          {vid?.narration?.message ? <div className="rounded-control border border-warning/30 bg-warning/10 p-stack text-caption text-warning">{vid.narration.message}</div> : null}
          {(pub.running || Object.keys(pub.status).length > 0) ? (
            <div className="card flex items-center gap-stack p-stack">
              <div className="w-12 shrink-0"><div className="text-center text-caption font-bold text-success">{pubPct}%</div><progress className="progress-semantic mt-micro h-micro w-full" max={100} value={pubPct} aria-label="발행 진행률" /></div>
              <div className="min-w-0 flex-1">
                <b className="text-body text-text">{pubResultLabel}</b>
                <div className="mt-stack-tight flex flex-wrap gap-stack-tight">{Object.entries(pub.status).map(([key, status]) => {
                  const cls = `rounded-pill border px-stack-tight py-micro text-caption ${status === "done" ? "border-success/30 bg-success/10 text-success" : status === "failed" ? "border-danger/30 bg-danger/10 text-danger" : status === "doing" ? "border-warning/30 bg-warning/10 text-warning" : "border-border bg-surface-2 text-subtle"}`;
                  const value = `${status === "done" ? "완료 " : status === "failed" ? "실패 " : status === "doing" ? "발행 중 " : ""}${LABEL[key]}`;
                  return status === "done" && pub.urls[key] ? <a key={key} href={pub.urls[key]} target="_blank" rel="noopener noreferrer" className={cls} title="게시물 보기">{value}<span className="sr-only"> 새 창</span></a> : <span key={key} className={cls}>{value}{status === "failed" && pub.errors[key] ? <span className="ml-micro"><span>{pub.errors[key]}</span></span> : null}</span>;
                })}</div>
              </div>
              {hasPublishedResult ? <Link href="/performance" className="shrink-0 rounded-control bg-accent px-stack py-stack-tight text-body-sm font-semibold text-accent-fg">성과실에서 결과 보기</Link> : null}
            </div>
          ) : null}
          {showSchedule && activeWorkspace ? (
            <SchedulePanel
              tenantId={activeWorkspace.id}
              draftId={draftId}
              defaultPlatforms={publishTargets}
              onScheduled={(iso) => {
                // 예약을 건 다음 확인할 곳이 없어 흐름이 끊겨 있었다. 그 예약이 놓인 날짜의
                // 발행 캘린더로 바로 데려간다. 별도 예약 완료 화면을 새로 만들지 않는다.
                const when = new Date(iso);
                const dateKey = `${when.getFullYear()}-${String(when.getMonth() + 1).padStart(2, "0")}-${String(when.getDate()).padStart(2, "0")}`;
                router.push(`/calendar?from=publish&date=${dateKey}`);
              }}
            />
          ) : null}
          {text ? (
            <div className="card space-y-stack p-stack">
              <div className="flex flex-wrap items-center gap-stack">
              <b className="mr-auto min-w-0 truncate text-body text-text">{idea || "현재 작업물"}</b>
              <Button onClick={saveDraftWithNotice}>임시 저장하기</Button>
              <Button onClick={requestReview} disabled={reviewBusy}>{reviewBusy ? "보내는 중" : "검토 요청하기"}</Button>
              {/*
                계정을 아직 못 불러온 동안에는 고른 수를 그대로 보여 준다. 그때는 몇 곳에
                올릴 수 있는지 알 수 없고, 0곳이라고 쓰면 없는 사실을 말하는 것이 된다.
                다 불러온 뒤에는 실제로 올라갈 수만 센다. 고른 수를 그대로 쓰면 연결이
                끊긴 채널까지 세어 "2곳에 발행"이라 해 놓고 아무 데도 안 올라간다.
              */}
              <Button variant="primary" onClick={publish} disabled={pub.running || !accountsLoaded || publishTargets.length === 0}>선택한 {accountsLoaded ? publishTargets.length : selectedTargets.length}곳에 지금 발행{accountsLoaded && selectedTargets.length > publishTargets.length ? ` (올릴 수 없는 ${selectedTargets.length - publishTargets.length}곳 제외)` : ""}</Button>
              {activeWorkspace ? <Button variant={showSchedule ? "primary" : "secondary"} onClick={() => setShowSchedule((value) => !value)}>예약 발행</Button> : null}
              </div>
              {/* 단추 이름만으로는 무엇이 일어나는지 안 갈린다. 넷이 어떻게 다른지 한 줄로 적는다.
                  눌러 봐야 아는 단추는 없는 단추다(R191). */}
              <p className="break-keep text-caption text-subtle" data-publish-actions-note>
                임시 저장은 아무 데도 안 올리고 이 작업물만 남깁니다.
                검토 요청은 다른 사람이 확인한 뒤 발행할 수 있도록 검토 대기로 보냅니다.
                지금 발행은 고른 곳에 바로 올립니다.
                예약 발행은 날짜와 시각을 잡고 그 날의 발행 캘린더로 이어집니다.
              </p>
            </div>
          ) : null}
          {GROUPS.map((group) => {
              const visiblePlatforms = focus === "all"
                ? group.platforms
                : group.platforms.filter((platform) => platform === focus);
              if (visiblePlatforms.length === 0) return null;
              return (
                <section key={group.title}>
                  <div className="mb-stack flex items-center gap-stack-tight border-b border-border pb-stack"><b className="text-body text-text">{group.title}</b><span className="text-caption text-subtle">{visiblePlatforms.map((platform) => LABEL[platform]).join(" · ")}</span></div>
                  {/*
                    2026-09-09 회장 지적: "스레드는 컴포넌트 위치가 왜 살짝 아래로 내려갔냐."
                    items-start 라 카드가 각자 내용만큼만 높아졌고, 미리보기 길이가 채널마다
                    달라 그 아래 편집 칸 시작점이 제각각이었다(실측 1417·1448·1532픽셀).
                    같은 줄의 카드가 같은 높이를 갖게 하면 편집 칸이 한 줄에서 시작한다.
                  */}
                  <div className="grid gap-stack-section md:grid-cols-2 xl:grid-cols-3">
                    {visiblePlatforms.map((platform) => (
                  <div key={platform} data-room-preview={platform} className="flex min-w-0 flex-col rounded-surface border border-border bg-surface p-stack">
                    <PlatformPreview
                      platform={platform}
                      text={text || {}}
                      media={media}
                      editor={previewEditor(platform)}
                      headerRight={
                        <div className="flex flex-wrap items-center justify-end gap-stack-tight">
                          {PUBLISH_SUPPORTED.has(platform) ? (
                            <label className="flex items-center gap-micro text-caption text-muted">
                              <input aria-label={`${LABEL[platform]} 발행`} type="checkbox" checked={Boolean(includes[platform])} disabled={!accountsLoaded || (accountsByPlatform[platform] || []).length === 0} onChange={(event) => setIncludes((current) => ({ ...current, [platform]: event.target.checked }))} />
                              발행
                            </label>
                          ) : (
                            <label className="flex items-center gap-micro text-caption text-warning">
                              <input aria-label={`${LABEL[platform]} 발행 미지원`} type="checkbox" checked={false} disabled />
                              미지원
                            </label>
                          )}
                          {/*
                            2026-09-09 회장 지적: "영상에서는 뭘 대문 썸네일로 지정할지도
                            세팅해야하지않나 API있지." 실제로 있었고 우리가 안 쓰고 있었다.
                            안 주면 플랫폼이 첫 프레임을 쓰는데, 숏폼에서 첫 프레임은 대개
                            아직 아무것도 안 보이는 순간이라 가장 나쁜 대문이 된다.
                            시점으로 정할 수 있는 채널만 이 칸을 준다. YouTube 는 이미지를
                            따로 올려야 해서 시점으로는 안 되고, 그 사실을 글로 적는다.
                          */}
                          {supportsCoverTimestamp(platform) ? (
                            <label className="flex items-center gap-micro text-caption text-muted" title="영상에서 이 시점 화면을 대문으로 씁니다">
                              대문
                              <input
                                type="number"
                                min={0}
                                max={600}
                                step={0.5}
                                aria-label={`${LABEL[platform]} 대문 시점(초)`}
                                data-cover-seconds={platform}
                                value={coverSeconds[platform] ?? DEFAULT_COVER_SECONDS}
                                onChange={(event) => setCoverSeconds((current) => ({ ...current, [platform]: Number(event.target.value) }))}
                                className="min-h-control-touch w-16 rounded-control border border-border bg-surface px-stack-tight text-caption text-text"
                              />
                              초
                            </label>
                          ) : coverUnsupportedReason(platform) ? (
                            <span className="text-caption text-subtle" data-cover-note={platform} title={coverUnsupportedReason(platform) || undefined}>
                              대문 자동
                            </span>
                          ) : null}
                          {accountsLoaded && PUBLISH_SUPPORTED.has(platform) && (accountsByPlatform[platform] || []).length === 0 ? (
                            <Link
                              href={channelHref(platform)}
                              data-testid={`publish-connect-link-${platform}`}
                              title={`${LABEL[platform]} 연결 화면으로 갑니다. 연결한 뒤 그 화면에서 기본 계정도 정할 수 있습니다`}
                              className="inline-flex min-h-control-touch items-center rounded-control border border-accent/40 bg-accent-soft px-stack-tight text-caption font-semibold text-accent hover:bg-surface"
                            >
                              계정 연결하기
                            </Link>
                          ) : null}
                          {ACCOUNT_SELECTABLE.has(platform) && (accountsByPlatform[platform] || []).length > 0 ? (
                            <>
                              <select
                                aria-label={`${LABEL[platform]} 발행 계정`}
                                data-testid={`publish-account-select-${platform}`}
                                value={selectedAccounts[platform] ?? ""}
                                onChange={(event) => setSelectedAccounts((current) => ({ ...current, [platform]: event.target.value }))}
                                className="min-h-control-touch max-w-32 rounded-control border border-border bg-surface-2 px-stack-tight text-caption text-text"
                              >
                                {/* 어느 계정으로 올라가는지 이름으로 말한다. "기본계정"만 적으면 그게 누구인지 화면이 답을 못 한다. */}
                                <option value="">
                                  기본 {(accountsByPlatform[platform] || []).find((account) => account.is_default)?.label || "계정"}
                                </option>
                                {(accountsByPlatform[platform] || []).map((account) => <option key={account.id} value={account.id}>{account.label}</option>)}
                              </select>
                              <Link
                                href={channelHref(platform)}
                                data-testid={`publish-account-manage-${platform}`}
                                title={`${LABEL[platform]} 계정을 더 연결하거나 기본 계정을 바꿉니다`}
                                className="inline-flex min-h-control-touch items-center rounded-control border border-border bg-surface-2 px-stack-tight text-caption font-semibold text-muted hover:bg-surface"
                              >
                                계정 관리
                              </Link>
                            </>
                          ) : null}
                        </div>
                      }
                    />
                  </div>
                    ))}
                  </div>
                </section>
              );
            })}
              </>
            )}
          </PlatformFocusFilter>
        </div>

        {/* 좁은 화면에서는 아래에서 올라오는 시트, 넓은 화면에서는 오른쪽 기둥이다. 두 벌의 규칙이
            한 줄에 섞여 있어 넓은 화면에서 높이가 0으로 접혔고 대화창이 통째로 안 보였다.
            회장이 "왜 여긴 챗봇 없어"라고 하신 자리가 여기다. max-lg로 갈라 둔다. */}
        <aside
          data-chat-dock="persistent"
          data-chat-always="true"
          aria-label="발행 담당 대화창"
          className={`card z-40 overflow-y-auto transition-transform max-lg:fixed max-lg:inset-x-0 max-lg:bottom-0 max-lg:max-h-[60vh] max-lg:rounded-b-none max-lg:shadow-lg lg:sticky lg:top-pad-inset lg:h-fit lg:rounded-surface lg:border ${chatOpen ? "max-lg:translate-y-0" : "max-lg:translate-y-[calc(100%-3.5rem)]"}`}
        >
          <button
            type="button"
            onClick={() => setChatOpen((open) => !open)}
            aria-expanded={chatOpen}
            className="min-h-control-touch w-full border-b border-border px-stack text-left text-body-sm text-text-muted lg:hidden"
          >
            {chatOpen ? "대화창 접기" : "발행 담당에게 말하기"}
          </button>
          <div className="flex items-center gap-stack-tight border-b border-border p-stack">
            <div className="grid h-10 w-10 place-items-center rounded-pill bg-accent text-body font-bold text-accent-fg">O</div>
            <div><b className="block text-body text-text">발행 담당</b><span className="text-caption text-success">지금 대기 중</span></div>
          </div>
          <div className="space-y-stack bg-surface-2 p-stack">
            <div className="max-w-[90%] rounded-surface rounded-tl-chip border border-border bg-surface p-stack text-body-sm text-text" data-empty-next={!text ? "publish" : undefined}>
              {text
                ? `일곱 칸을 하나씩 고치지 않으셔도 됩니다. 지금 ${selectedTargets.length}곳이 골라져 있습니다.`
                : "발행할 작업물을 먼저 가져와 주세요."}
            </div>
            {text ? (
              <div className="flex flex-wrap gap-stack-tight" aria-label="발행 담당 빠른 답장">
                <Button size="sm" onClick={publish} disabled={!accountsLoaded || publishTargets.length === 0 || pub.running}>{publishRetryOnly ? "실패한 곳만 다시 발행" : "지금 발행하기"}</Button>
                <Button size="sm" onClick={() => setShowSchedule(true)}>시간은 내가 골라 줘</Button>
                <Button size="sm" onClick={requestReview}>먼저 검토받기</Button>
              </div>
            ) : (
              <Button variant="primary" onClick={() => changeRoom("create")}>생성실 열기</Button>
            )}
          </div>
          {text ? (
            <div className="space-y-stack border-t border-border bg-surface-2 p-stack" data-chat-only-actions="publish">
              <span className="text-caption font-semibold text-text">여러 채널 함께 바꾸기</span>
              <p className="break-keep text-caption text-subtle">
                아래는 미리보기 칸에서 손으로 하면 일곱 번 반복해야 하는 일입니다. 채널마다 다른 규격은 제가 맞춥니다.
              </p>
              {Object.keys(publishReconciliations).length ? (
                <div className="break-keep rounded-control border border-warning bg-warning-soft p-stack text-caption text-warning" role="alert" data-publish-reconciliation>
                  <b className="block">{Object.keys(publishReconciliations).map((platform) => LABEL[platform as keyof typeof LABEL]).join(", ")} 은 이미 올라갔습니다.</b>
                  올라간 것은 확인됐는데 이 작업물의 내부 기록이 남지 않았습니다. 그대로 다시 발행하면 같은 글이 두 번 올라갑니다.
                  아래를 누르면 이미 올라간 것으로 기록하고 이 알림을 닫습니다.
                  <span className="mt-stack-tight block">
                    <Button size="sm" data-testid="publish-reconciliation-resolve" onClick={resolvePublishReconciliation}>이미 올라간 것으로 기록하기</Button>
                  </span>
                </div>
              ) : null}
              <Stack direction="horizontal" gap={8} wrap>
                <Button size="sm" data-testid="publish-bulk-select-all" onClick={selectAllChannels} disabled={!accountsLoaded || connectedTargets.length === 0}>연결된 곳 전부 고르기</Button>
                <Button size="sm" data-testid="publish-bulk-clear" onClick={clearAllChannels} disabled={selectedTargets.length === 0}>전부 해제</Button>
              </Stack>
              <Stack direction="horizontal" gap={8} wrap>
                <Button size="sm" data-testid="publish-bulk-hashtags" onClick={unifyHashtagsAcrossChannels}>해시태그 규격대로 맞추기</Button>
                <Button size="sm" data-testid="publish-bulk-trim" onClick={trimOverLimitChannels}>한도 넘는 곳만 줄이기</Button>
              </Stack>
              <p className="break-keep text-caption text-subtle">
                해시태그는 X {HASHTAG_BUDGET.x}개, 인스타그램 {HASHTAG_BUDGET.instagram}개, Threads {HASHTAG_BUDGET.threads}개로 자동으로 갈립니다.
                본문 한도는 X {CHANNEL_TEXT_LIMITS.x}자, Threads {CHANNEL_TEXT_LIMITS.threads}자입니다.
              </p>
              {/*
                끊긴 채널을 먼저, 아직 연결 안 한 채널을 그다음에 보여 준다. Buffer 도 연결이
                풀린 채널을 목록 맨 위로 올리고 다시 연결을 먼저 시킨다
                (support.buffer.com 채널 새로 고침 문서). 둘은 사용자가 할 일이 다르다.
                끊긴 곳은 다시 연결, 안 한 곳은 처음 연결이다.
              */}
              {reconnectTargets.length ? (
                <p className="break-keep rounded-control border border-warning bg-warning-soft p-stack text-caption text-warning" role="alert" data-reconnect-notice>
                  연결이 만료되었거나 해제된 곳이 있습니다. 다시 연결하기 전에는 발행 대상에서 빠집니다.
                  <span className="mt-stack-tight flex flex-wrap gap-stack-tight">
                    {reconnectTargets.map((platform) => (
                      <Link
                        key={`reconnect-${platform}`}
                        href={channelHref(platform)}
                        data-testid={`publish-reconnect-link-${platform}`}
                        title={`${LABEL[platform]} 연결 화면으로 갑니다. 다시 연결한 뒤 발행하세요`}
                        className="inline-flex min-h-control-touch items-center rounded-control border border-warning bg-surface px-stack-tight text-caption font-semibold text-warning hover:bg-surface-2"
                      >
                        {LABEL[platform]} 다시 연결하기
                      </Link>
                    ))}
                  </span>
                </p>
              ) : null}
              {/* 계정을 아직 못 읽은 동안에는 "연결 안 됨"이라고 단정하지 않는다. 종전에는
                  발행실에 들어온 첫 십수 초 동안 멀쩡히 연결된 Threads·X·Instagram 이
                  미연결로 적혀 나왔다. 화면이 사실이 아닌 것을 사실처럼 말하는 것은
                  아무 말도 안 하는 것보다 나쁘다(ADR-007). 다 읽은 뒤에만 판정한다.
                  2026-09-07 회장 계정 실측. */}
              {!accountsLoaded ? (
                <p className="break-keep text-caption text-muted">연결된 채널을 확인하고 있습니다.</p>
              ) : connectedTargets.length < bulkTargets.length ? (
                <p className="break-keep text-caption text-warning">
                  아직 연결 안 된 곳: {bulkTargets.filter((platform) => !connectedTargets.includes(platform)).map((platform) => LABEL[platform]).join(", ")}. 각 칸의 계정 연결하기로 갑니다.
                </p>
              ) : null}
            </div>
          ) : null}
          <form onSubmit={submitPublishChat} className="flex gap-stack-tight border-t border-border p-stack">
            <input aria-label="발행 담당에게 명령" value={publishChatDraft} onChange={(event) => setPublishChatDraft(event.target.value)} placeholder="직접 쓰셔도 됩니다" className="min-h-control-touch min-w-0 flex-1 rounded-control border border-border bg-surface px-stack text-body-sm text-text" />
            <Button type="submit" variant="primary">보내기</Button>
          </form>
        </aside>
      </section>
    </div>
  );

  return null;
}
