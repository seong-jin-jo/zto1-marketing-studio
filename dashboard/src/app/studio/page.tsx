"use client";

import { useRef, useState, useEffect, useCallback, useMemo } from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import useSWR from "swr";
import {
  fetcher,
  apiPost,
  isExternalPublishPersistenceError,
  isExternalPublishConfirmedPayload,
  isUnresolvedPublishPayload,
  isUnresolvedPublishError,
  ApiResponseError,
  type ExternalPublishPersistenceFailure,
} from "@/lib/api";
import { useToast } from "@/components/layout/Toast";
import { PlatformPreview, PREVIEW_PLATFORMS, type PreviewAccount, type PreviewInlineEditor, type PreviewPlatform } from "@/components/studio/PlatformPreview";
import { PlatformFocusFilter } from "@/components/studio/PlatformFocusFilter";
import { PublishHeaderControls } from "@/components/studio/PublishHeaderControls";
import { ExportPanel, type ExportPanelKind } from "@/components/studio/ExportPanel";
import { exportKindForDraftState } from "@/lib/studio/export-eligibility";
import { CreateRoom, EditRoom, type CreateContentBranch, type CreateKind, type CreateStructureChoice, type EditContentKind } from "@/components/studio/StudioRooms";
import type { StudioGenerationCandidate } from "@/lib/studio/generation/client";
import { useUsage } from "@/hooks/useOverview";
import { useUIStore, type StudioRoom } from "@/store/ui-store";
import { LearningCardWizard } from "@/components/studio/LearningCardWizard";
import { LearningStatus } from "@/components/studio/LearningStatus";
import { buildImagePrompt, buildImageToVideoMotionPrompt, pickImageSubject } from "@/components/studio/image-style";
import { DeliveredMedia } from "@/components/studio/DeliveredMedia";
import { countFilledUserSlots, fetchLearningInfo, LEARNING_USER_SLOT_TOTAL, mergeLearningInfo, readLearningInfo, saveLearningInfo, type LearningInfo } from "@/components/studio/learning-info";
import { RepoConnect } from "@/components/studio/RepoConnect";
import { SchedulePanel } from "@/components/studio/SchedulePanel";
import { trackEvent, type AnalyticsChannel } from "@/lib/analytics/events";
import { authHeaders } from "@/lib/auth";
import { pollHiggsfieldJob, savePendingJob, readPendingJob, clearPendingJob } from "@/lib/higgsfield-poll";
import { pollJobUntilDone, JOB_POLL_INTERVAL_MS } from "@/lib/job-poll";
import { wakeableSleep } from "@/lib/wakeable-sleep";
import {
  savePendingVideoPublishJob, readPendingVideoPublishJob, clearPendingVideoPublishJob,
  savePendingSocialPublishJob, readPendingSocialPublishJob, clearPendingSocialPublishJob,
} from "@/lib/publish-job-store";
import {
  browserCardUploader,
  cardRatioFrom,
  firstEmptyCardNumber,
  renderAndUploadCardDeck,
  renderAndUploadEmbeddedTextCard,
  renderPlainCardDeckIncremental,
  type PlainCardRenderCacheEntry,
} from "@/lib/studio/card-deck";
import type { CardDeck } from "@/lib/studio/card-deck-contract";
import { cardDeckV3Projection, type CardDeckV3 } from "@/lib/studio/card-element-contract";
import { applyGeneratedImageBackground, createPlainCardDeckV3, createRecoverableEmbeddedCardDeckV3, plainCardDeckV3EntryBlockReason } from "@/lib/studio/card-element-commands";
import { cardDeckV3ForSave, migrateCardDeckV2ToV3, projectCardDeckV3ToV2, synchronizeChatCardDeckV3 } from "@/lib/studio/card-deck-v2-to-v3";
import { cardDeckV3EntryEnabled, cardDeckV3ForDraft, cardDeckV3RenderingEnabled, usesChatBubbleV2 } from "@/lib/studio/card-deck-v3-render-feature";
import { cardTemplateStatePatchForSave, defaultCardTemplateState, type CardDeckTemplateId, type CardTemplateState } from "@/lib/studio/card-templates";
import { buildGeneratedCardTemplate } from "@/lib/studio/s7-generated-card-template";
import { textCandidateLines, textCandidateSelectionWouldDiscardEdits } from "@/lib/studio/text-candidate-selection";
import { CARD_DECK_V3_PUBLISH_BLOCK_MESSAGE } from "@/lib/studio/card-deck-v3-publish-contract";
import { videoEditIncompleteEntryReason, type VideoEdit } from "@/lib/studio/video-edit-contract";
import { cutRanges, isIntroOutroStale, setIntroOutroApplied } from "@/lib/studio/video-edit-contract";
import { deckProjection, applyProjection, type ProjectionRef } from "@/lib/studio/card-deck-contract";
import { emptyBubbleSlideNumber, pruneEmptyBubbles } from "@/lib/studio/card-deck-ops";
import { limitedChannelNotice, planChannelImages } from "@/lib/studio/channel-image-capacity";
import { decideVideoRequest, droppedMediaNotice, mediaTopicKey, stalePublishBlock } from "@/lib/studio/work-media";
import { themeFromPalette } from "@/lib/studio/text-card-image";
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
import { blockedPublishFailures, partitionBlockedPublishTargets } from "@/lib/studio/publish-partial-block";
import type { CurrentWork } from "@/lib/studio/current-work";
import { attemptRequiredDraftPersistence } from "@/lib/studio/required-draft-persistence";
import { PLATFORM_FIELD_CONTRACT } from "@/lib/studio/platform-publish-fields";
import { DEFAULT_COVER_SECONDS, coverUnsupportedReason, supportsCoverTimestamp } from "@/lib/video-cover";
import { runWithConcurrency } from "@/lib/async-pool";
import { embeddedTextCardImage, recoverDraftEmbeddedTextCard } from "@/lib/studio/text-card-provenance";

const PUBLISH_CONCURRENCY = 3;
// 2026-10-02 컨트롤러 감사: 이 타임아웃은 더 이상 "서버가 끝날 때까지" 기다리는 역할이
// 아니다 — 서버가 예산(기본 8초, PUBLISH_FAST_PATH_BUDGET_MS/VIDEO_PUBLISH_FAST_PATH_
// BUDGET_MS)을 넘기면 이제 202 + processing을 그 안에 돌려주고, 실제 완료는
// awaitAsyncSocialPublish/awaitAsyncVideoPublish가 별도로(15분 상한) 기다린다. 이 상수들은
// "접수 자체가 이 시간 안에도 안 끝나면 네트워크 이상"을 가르는 안전망일 뿐이라 8초
// 예산+정상 네트워크 지연에 넉넉히 여유 있다.
const PUBLISH_REQUEST_TIMEOUT_MS = 45_000;
const VIDEO_PUBLISH_REQUEST_TIMEOUT_MS = 130_000;

// SNS-007: /api/publish가 실제로 계정별 발행을 받는 4개 플랫폼(threads/x/facebook/instagram)만
// 계정 셀렉터를 노출한다. shorts/reels/tiktok은 /api/publish 미지원(실발행 분기 없음. 위
// ChannelConnect.tsx 주석과 동일 SSOT 판단)이라 대상에서 뺀다.
const PREVIEW_PLATFORM_KEYS = new Set<string>(PREVIEW_PLATFORMS.map((platform) => platform.key));
const CARD_DECK_V3_RENDER_ENABLED = cardDeckV3RenderingEnabled({
  NEXT_PUBLIC_CARD_DECK_V3_RENDER_ENABLED: process.env.NEXT_PUBLIC_CARD_DECK_V3_RENDER_ENABLED,
});
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
import {
  alignVideoEditToRenderSource,
  isLegacyIntroOutroBakedResult,
  resolveUnbakedVideoSource,
  resolveVideoPublishFilename,
} from "@/lib/studio/video-publish-filename";
import { connectedOnlyTargets, publishableTargets as computePublishableTargets, type ChannelReadiness } from "@/lib/studio/publish-connected-targets";
import { channelNameList, PLATFORM_LABEL } from "@/lib/studio/channel-name-list";
import {
  allowedPrivacyLevels,
  disclosureValidationError,
  musicUsageConfirmationText,
  resolvePrivacyAfterDisclosureChange,
  type TikTokDisclosureState,
} from "@/lib/studio/tiktok-disclosure";
import {
  resolveRestoredQuickDraftTopic,
  sanitizeRestoredQuickDraftLines,
  sanitizeRestoredQuickDraftText,
  shouldInvalidateQuickDraft,
} from "@/lib/studio/quick-draft-topic";
import type { TextCandidate } from "@/lib/studio/text-candidate-contract";

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

function draftPreviewMedia(draft: Record<string, unknown>): { type: "image" | "video"; src: string } | null {
  const video = draft.vid as { file?: unknown; url?: unknown } | null | undefined;
  const videoSrc = typeof video?.file === "string" ? video.file : typeof video?.url === "string" ? video.url : "";
  if (videoSrc) return { type: "video", src: videoSrc };
  const image = draft.img as { file?: unknown; url?: unknown; imageUrls?: unknown } | null | undefined;
  const firstImage = Array.isArray(image?.imageUrls) && typeof image.imageUrls[0] === "string" ? image.imageUrls[0] : "";
  const imageSrc = typeof image?.file === "string" ? image.file : typeof image?.url === "string" ? image.url : firstImage;
  return imageSrc ? { type: "image", src: imageSrc } : null;
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
  const marker = mediaUrl.includes("/api/exports/deliver/") ? "/api/exports/deliver/" : "/api/media/";
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

function videoResultFilename(result: VidResult | null): string {
  return result?.filename || videoFilename(result?.file || result?.url || "");
}

function extractApiErrorMessage(e: unknown, fallback: string): string {
  // 2026-09-08 회장 실사용: 화면에 "Request failed: 502" 라는 숫자만 떴다. 그 말은
  // 사용자에게 아무 뜻이 없고 다음에 무엇을 하면 되는지도 말해 주지 않는다.
  // 서버 문구가 있으면 그것을 쓰고, 없으면 상태 코드가 아니라 사람 말로 바꿔 준다.
  if (e instanceof ApiResponseError) {
    const payload = e.payload as { error?: string; code?: string; nsfw?: boolean; credits?: boolean } | null;
    if (payload?.nsfw) return "이 주제는 생성기가 만들 수 없다고 했습니다. 글감이나 결을 바꿔 다시 시도해 주세요.";
    if (payload?.credits) return "생성기 잔액이 부족합니다. 충전하면 바로 만들 수 있습니다.";
    // N3(2026-09-22 코드리뷰): INVALID_CARD_DECK/INVALID_VIDEO_EDIT의 payload.error는
    // 서버 검증기의 영문 필드 경로 원문("comments[0].author must be...")이다. 그걸 그대로
    // 찍으면 회장 화면에 영문 디버그 문구가 뜬다. 원문은 로그로만 보내고 화면은 고정
    // 한국어 문구로 바꾼다.
    if (payload?.code === "INVALID_CARD_DECK" || payload?.code === "CARD_DECK_TOO_LARGE") {
      console.error("카드덱 저장 검증 실패", payload);
      return "카드덱 내용에 저장할 수 없는 값이 있어 자동 저장을 보류했습니다. 방금 고친 내용을 확인해 주세요.";
    }
    if (payload?.code === "INVALID_VIDEO_EDIT" || payload?.code === "VIDEO_EDIT_TOO_LARGE") {
      console.error("영상 편집 저장 검증 실패", payload);
      return "영상 편집 내용에 저장할 수 없는 값이 있어 자동 저장을 보류했습니다. 방금 고친 내용을 확인해 주세요.";
    }
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
  text_candidates?: TextCandidate[];
  selected_text_candidate_id?: string;
  recommended_text_candidate_id?: string;
  card_template_id?: CardDeckTemplateId;
}
interface BodyRevisionConflict {
  latest: { lines: string[]; text: TextVariants | null; cardDeckV3: CardDeckV3 | null; serverRevision: number };
  local: { lines: string[]; text: TextVariants | null; cardDeckV3: CardDeckV3 | null };
  viewingLatest: boolean;
}
interface CardDeckV3SourceSnapshot {
  editLines: string[];
  cardTextPositions: CardTextPosition[];
}
// topicKey = 이 매체가 **어느 주제로** 만들어졌는지 찍는 도장(lib/studio/work-media.ts).
// 도장이 없으면 새 주제에 어제 영상이 그대로 붙는다. 2026-09-14 실측 사고.
// aspectRatio = 이 그림이 어떤 비율로 만들어졌는지(work-media.ts isReusableVideoBaseImage).
// 1:1 대표 이미지를 영상 바탕으로 잘못 재사용해 정사각 영상이 나오는 것을 막는다(2026-09-16).
interface ImgResult {
  url: string;
  file: string;
  filename?: string;
  imageUrls?: string[];
  topicKey?: string;
  aspectRatio?: string;
  /** 카드 문구가 이미지 픽셀에 이미 합성돼 편집 레이어를 다시 얹으면 안 되는 산출물. */
  textEmbedded?: boolean;
  /** 대기열 복귀 뒤에도 장별 대본·위치·형식이 있어 안전하게 다시 그릴 수 있는지. */
  textSourceRecoverable?: boolean;
}
interface VidResult {
  url: string;
  file: string;
  /** 만료되는 배달 URL과 별도로 보존하는 영구 영상 파일 키. 발행은 이 값을 사용한다. */
  filename?: string;
  model: string;
  topicKey?: string;
  hasAudio?: boolean;
  narration?: { requested: boolean; included: boolean; reason?: string; message?: string };
  /** 자막·오버레이를 굽기 전 편집용 기준 파일. 구운 결과를 다시 굽거나 DOM 글자층과 겹치지 않게 한다. */
  editSource?: { filename: string; url: string };
  /** 현재 file/url에 자막·오버레이가 이미 픽셀로 들어간 결과인지. 초안과 로컬 복원에도 보존한다. */
  subtitlesBaked?: boolean;
  /** 서버 굽기 기록 조회 결과. unknown은 과거 UUID 파일을 원본이라고 추측하지 않는 안전 상태다. */
  subtitleLineageState?: "baked" | "unbaked" | "unknown";
}
// "unknown" = 비동기 발행이 상한(15분)을 넘겨 더 기다리지 않지만, "실패"로 단정하지도
// 않는 상태(세션맥락: 524 오판으로 인한 재발행이 중복 게시를 부른다 — 재발행을 유도하지
// 않기 위해 failed와 분리한다). 게시물 목록에서 실제 결과를 확인하라고 안내한다.
type PubStatus = "wait" | "doing" | "done" | "failed" | "unknown";
type PublishProgress = {
  running: boolean; stopped: boolean; status: Record<string, PubStatus>;
  urls: Record<string, string>; errors: Record<string, string>; already: Record<string, string | true>;
};
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

function normalizePublishProgress(value: unknown): PublishProgress | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  const candidate = value as Partial<PublishProgress>;
  if (!candidate.status || typeof candidate.status !== "object" || Array.isArray(candidate.status)) return null;
  const status = Object.fromEntries(Object.entries(candidate.status).filter((entry): entry is [string, PubStatus] =>
    ["wait", "doing", "done", "failed", "unknown"].includes(entry[1])));
  return { running: false, stopped: false, status,
    urls: candidate.urls && typeof candidate.urls === "object" ? candidate.urls : {},
    errors: candidate.errors && typeof candidate.errors === "object" ? candidate.errors : {},
    already: candidate.already && typeof candidate.already === "object" ? candidate.already : {} };
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
  // 상단 작업 단계는 URL을 바꾸고, 사이드바는 ui-store의 방을 읽는다. URL의 방을
  // 공통 저장 상태로 되돌려 주지 않으면 상단은 발행실인데 사이드바는 편집실인 식으로
  // 현재 위치가 한 단계 뒤에 남는다. 유효한 Studio URL만 단일 현재 방으로 동기화한다.
  useEffect(() => {
    if (!roomResolution.redirectTo && !roomResolution.unknownRoom && storedRoom !== activeRoom) {
      setActiveRoom(activeRoom);
    }
  }, [activeRoom, roomResolution.redirectTo, roomResolution.unknownRoom, setActiveRoom, storedRoom]);
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
  // B-6(6차 재리뷰 BLOCKER): 목록 조회가 실패하면 아래 reconcile 감시 효과가
  // `!hist?.drafts`에 영원히 걸려 편집이 잠긴 채로 안 풀렸다 — error를 받아 그 경우
  // 단건 GET으로 대체 경로를 연다.
  const { data: hist, error: histError, mutate: mutateHist } = useSWR<{ drafts: Array<Record<string, unknown>>; currentWork?: CurrentWork | null }>(activeWorkspace ? `/api/studio/drafts?tenant_id=${activeWorkspace.id}` : null, fetcher);
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
  // 2026-10-02 리뷰 MINOR: 새로고침 복구 폴링(아래 복구 effect)은 자기 전용
  // AbortController를 쓴다(MAJOR 5b) — 그런데 사용자가 "생성 취소"나 "버리고 새로
  // 시작"을 누르면 그 복구 폴링도 함께 끊겨야 한다. 끊지 않으면 취소했다고 말해 놓고
  // 복구 폴링이 뒤에서 계속 돌며 지운 화면에 결과를 다시 꽂으려 든다.
  const resumePollAbort = useRef<AbortController | null>(null);
  function cancelGeneration() {
    generationAbort.current?.abort();
    generationAbort.current = null;
    resumePollAbort.current?.abort();
    setBusy(null);
    showToast("생성을 취소했습니다", "success");
  }
  const [lastError, setLastError] = useState<string | null>(null);
  const [text, setText] = useState<TextVariants | null>(null);
  const textRef = useRef<TextVariants | null>(null);
  textRef.current = text;
  // 2026-10-01 운영 실측: 생성실 "고른 형식의 생성 후보" 패널(quickDraft = text)이 주제를
  // 바꿔도 안 비워졌다. candidatesTopicRef(StudioRooms.tsx, PR#96)와 같은 패턴 —
  // 후보를 만들 때의 주제를 기억해 두고, 실제 주제가 달라지면(trim 비교) 후보를 비운다.
  const quickDraftTopicRef = useRef<string | null>(null);

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
  const lineageFilename = videoResultFilename(vid);
  const needsVideoLineageLookup = Boolean(
    activeWorkspace
    && lineageFilename
    && vid?.subtitlesBaked === undefined
    && vid?.subtitleLineageState === undefined,
  );
  const { data: storedVideoLineage } = useSWR<{
    ok?: boolean;
    state?: "baked" | "unbaked" | "unknown";
    sourceFilename?: string;
    sourceFile?: string;
  }>(
    needsVideoLineageLookup
      ? `/api/video/subtitle?tenant_id=${encodeURIComponent(activeWorkspace!.id)}&filename=${encodeURIComponent(lineageFilename)}`
      : null,
    fetcher,
  );
  useEffect(() => {
    if (!needsVideoLineageLookup || !storedVideoLineage?.ok || !storedVideoLineage.state) return;
    setVid((current) => {
      if (!current || videoFilename(current.file || current.url || "") !== lineageFilename) return current;
      const source = storedVideoLineage.sourceFilename && storedVideoLineage.sourceFile
        ? { filename: storedVideoLineage.sourceFilename, url: storedVideoLineage.sourceFile }
        : undefined;
      return {
        ...current,
        subtitleLineageState: storedVideoLineage.state,
        ...(storedVideoLineage.state === "baked" ? { subtitlesBaked: true } : {}),
        ...(source ? { editSource: source } : {}),
      };
    });
  }, [lineageFilename, needsVideoLineageLookup, storedVideoLineage]);
  const [draftId, setDraftId] = useState<string | null>(null);
  const [publishReconciliations, setPublishReconciliations] = useState<PublishReconciliationMap>({});
  const [reconciliationError, setReconciliationError] = useState<string | null>(null);
  const [editorHandoff, setEditorHandoff] = useState<EditorHandoff | null>(null);
  const [includes, setIncludes] = useState<Record<string, boolean>>(() => normalizeIncludes());
  /**
   * 2026-10-03 독립 리뷰 MINOR-g 근본원인 수정: 발행 선택 사고의 실제 뿌리는 미리보기
   * 탭을 선택으로 착각한 것보다, **이전 세션의 선택이 아무 표시 없이 조용히 되살아난
   * 것**이다(이 세션 자체가 그 패턴으로 Threads에 실제 발행했다). 두 안을 저울질했다:
   * ①발행 전 채널 이름을 보여주는 확인 단계(모달/추가 클릭) ②되살아난 선택임을 그
   * 자리에서 표시만("지난번 선택 유지: Threads"). ①은 publish() 흐름 자체를 바꿔야
   * 하고 "선택한 N곳에 지금 발행" 버튼 클릭 한 번으로 바로 발행되던 기존 테스트 수십
   * 개(studio-publish-ui.test.tsx)의 흐름을 전부 다시 짜야 한다. ②는 상태 하나와 배지
   * 하나만 더하면 되고, 사용자의 기존 동작(바로 발행)을 막지 않으면서 "이거 내가 지금
   * 고른 게 아니라 전에 고른 거다"를 알린다. 더 작은 ②를 택한다.
   */
  const [restoredSelectionNotice, setRestoredSelectionNotice] = useState(false);
  /**
   * 운영 사고(9444 회원 계정, 2026-10-03): TikTok 발행이 /api/video/publish의
   * privacy_level 필수 검사(route.ts:727-729)에 걸려 "TikTok 공개 범위를 직접
   * 선택해주세요" 400으로 항상 실패했다. 발행실에는 그 값을 고르는 자리 자체가 없었고
   * /api/video/publish 요청에도 안 실었다. /app/videos/page.tsx에만 그 선택기가 있었다
   * (tiktokCreator.privacyLevels, creator-info 조회). 여기서도 같은 계약을 그대로
   * 따른다 — TikTok의 Content Posting 정책은 공개 범위를 사람이 직접 고르게 강제하므로
   * 기본값을 미리 고르지 않는다(빈 문자열 시작). 상호작용 토글(댓글/듀엣/스티치)과 AI
   * 생성 공개는 videos 페이지가 이미 쓰는 기본값 정책을 그대로 따른다(토글 셋은
   * creator의 disabled 플래그로 동기화, AI 생성은 기본 true — 창작자가 아니오로
   * 끄는 쪽이 "거짓으로 아니라고 답하기"보다 안전하다는 videos 페이지의 기존 판단).
   */
  const [tiktokPrivacy, setTiktokPrivacy] = useState(""); // 절대 기본값을 미리 고르지 않는다
  const [tiktokDisableComment, setTiktokDisableComment] = useState(false);
  const [tiktokDisableDuet, setTiktokDisableDuet] = useState(false);
  const [tiktokDisableStitch, setTiktokDisableStitch] = useState(false);
  const [tiktokAiGenerated, setTiktokAiGenerated] = useState(true);
  /**
   * 2026-10-03 독립 리뷰 m3(TikTok Content Sharing Guidelines): 상업 콘텐츠 공개
   * ("Your brand"/"Branded content")도 사람이 직접 켜야 한다 — 기본은 전부 꺼짐.
   */
  const [tiktokDisclosureEnabled, setTiktokDisclosureEnabled] = useState(false);
  const [tiktokBrandOrganic, setTiktokBrandOrganic] = useState(false);
  const [tiktokBrandContent, setTiktokBrandContent] = useState(false);
  /**
   * m3: 공개 범위는 "이번 한 번만" 고르는 값이다 — 새 초안을 시작하거나, 작업 공간을
   * 바꾸거나, 발행에 성공한 뒤에는 다음 영상에 지난 선택이 그대로 넘어가면 안 된다
   * (사용자가 매번 다시 확인하지 않으면 엉뚱한 계정 공개 범위로 올라갈 수 있다).
   * 상업 콘텐츠 공개도 같이 초기화한다.
   */
  const resetTiktokDisclosure = useCallback(() => {
    setTiktokPrivacy("");
    setTiktokDisclosureEnabled(false);
    setTiktokBrandOrganic(false);
    setTiktokBrandContent(false);
  }, []);
  const [titles, setTitles] = useState<Record<string, string>>({});
  const [hashtags, setHashtags] = useState<Record<string, string>>({});
  const [topicTags, setTopicTags] = useState<Record<string, string>>({});
  const [firstComments, setFirstComments] = useState<Record<string, string>>({});
  // 플랫폼별 캡션 덮어쓰기. 세로영상 세 곳(Shorts, Reels, TikTok)은 원본 대본 하나를 공유하던
  // 탓에 한 곳을 고치면 나머지도 같이 바뀌었다. 여기에 플랫폼 키로 따로 담아 각자 편집한다.
  const [captions, setCaptions] = useState<Record<string, string>>({});
  const [reviewQueueId, setReviewQueueId] = useState<string | null>(null);
  const [publishExportPinNotice, setPublishExportPinNotice] = useState<{
    status: "pinned" | "unpinned";
    message: string;
  } | null>(null);
  const [reviewBusy, setReviewBusy] = useState(false);
  const [publishChatDraft, setPublishChatDraft] = useState("");
  const [editLines, setEditLines] = useState<string[]>([]);
  /**
   * PR87 재리뷰 r3: 글 본문의 유일한 최신값 출처.
   *
   * React state는 렌더 뒤에 갱신되므로 디바운스 타이머와 비동기 저장이 닫힌 값을 잡으면
   * 더 최신인 사용자 입력을 이전 값으로 되돌릴 수 있다. 모든 본문 교체는 이 함수로만
   * 들어오며, ref의 세대와 값은 같은 tick에 먼저 바뀐다. 저장은 아래 직렬 큐에서 이
   * 스냅샷만 읽고, 응답을 기다리는 동안 세대가 바뀌면 최신 세대를 다시 저장한다.
   * `text`와 `editLines`는 같은 서버 기준판 안에서만 저장한다. 로컬 변경 순서는
   * generation이 맡고, serverRevision은 마지막 저장 성공 때 서버가 돌려준 값만 가진다.
   * 오래된 탭·타이머·응답이 로컬 편집 횟수로 최신 본문을 덮을 수 없어야 한다.
  */
  const bodySnapshotRef = useRef<{
    generation: number;
    serverRevision: number;
    lines: string[];
    text: TextVariants | null;
  }>({ generation: 0, serverRevision: 0, lines: [], text: null });
  // 서버 판이 바뀌면 localStorage 효과도 다시 실행돼 재접속 기준판이 낡지 않게 한다.
  const [bodyServerRevision, setBodyServerRevision] = useState(0);
  const [bodyRevisionConflict, setBodyRevisionConflict] = useState<BodyRevisionConflict | null>(null);
  const [bodyConflictResolving, setBodyConflictResolving] = useState(false);
  const bodyConflictRetryRef = useRef<Array<{
    retry: () => Promise<string | undefined>;
    retryWithoutVideo: () => Promise<string | undefined>;
  }>>([]);
  const editDocumentGenerationRef = useRef(0);
  const draftSaveQueueRef = useRef<Promise<unknown>>(Promise.resolve());
  function replaceBodySnapshot(
    nextLines: string[],
    nextText: TextVariants | null,
    options: { replaceDocument?: boolean; serverRevision?: number } = {},
  ) {
    const lines = [...nextLines];
    if (options.replaceDocument) {
      editDocumentGenerationRef.current += 1;
      setBodyRevisionConflict(null);
      setBodyConflictResolving(false);
      bodyConflictRetryRef.current = [];
    }
    const serverRevision = options.serverRevision
      ?? (options.replaceDocument ? 0 : bodySnapshotRef.current.serverRevision);
    bodySnapshotRef.current = {
      generation: bodySnapshotRef.current.generation + 1,
      serverRevision,
      lines,
      text: nextText,
    };
    setBodyServerRevision(serverRevision);
    textRef.current = nextText;
    setText(nextText);
    setEditLines(lines);
  }
  function replaceEditLines(nextLines: string[], replaceDocument = false) {
    replaceBodySnapshot(nextLines, textRef.current, { replaceDocument });
  }
  function replaceText(nextText: TextVariants | null) {
    replaceBodySnapshot(bodySnapshotRef.current.lines, nextText);
  }
  // 2026-09-23 사고: 카드덱 경로(생성실→편집실)는 말풍선 13개를 `editLines`에 담아
  // 저장하지만, 발행실 본문(`text`)은 이 경로에서 한 번도 채워진 적이 없다(별도
  // 파생 API로만 채워짐). 그래서 편집실엔 내용이 있는데 발행실은 "본문이 없다"고
  // 말했다 — 회장이 "하나도 안 올라갔다"고 지적한 근본 원인. 새 규칙을 만들지 않고
  // 편집실이 이미 쓰는 `editLines`를 발행 본문의 대체 원천으로 그대로 잇는다. 채널별
  // 상한을 넘는 경우는 발행실에 이미 있는 `trimBodyToFit`·"한도 넘긴 곳만 줄이기"
  // 경로가 그대로 처리한다(여기서는 원문만 잇는다). early room return(생성실 등)보다
  // 앞에 둬야 한다 — platformText/publish() 같은 클로저가 렌더 도중(생성실·편집실
  // 방에서도) 호출될 수 있어, 아래쪽에 두면 TDZ로 죽는다(2026-09-23 vitest 전체
  // 실행에서 9개 파일 실패로 실측).
  const deckFallbackBody = !text && editLines.some((line) => line.trim())
    ? editLines.filter((line) => line.trim()).join("\n\n")
    : "";
  const hasPublishableBody = Boolean(text) || Boolean(deckFallbackBody);
  const [cardTextPositions, setCardTextPositions] = useState<CardTextPosition[]>([]);
  // 카드뉴스 v2 덱(PR4). 있으면 편집실이 CardDeckPanel(말풍선 직접 편집)을 그린다.
  const [cardDeck, setCardDeck] = useState<CardDeck | null>(null);
  const [cardDeckV3, setCardDeckV3] = useState<CardDeckV3 | null>(null);
  const [cardTemplateState, setCardTemplateState] = useState<CardTemplateState | null>(null);
  const [cardDeckV3SourceSnapshot, setCardDeckV3SourceSnapshot] = useState<CardDeckV3SourceSnapshot | null>(null);
  const [cardDeckV3DetailStatus, setCardDeckV3DetailStatus] = useState<"idle" | "loading" | "ready" | "error">("idle");
  const cardDeckV3Ref = useRef<CardDeckV3 | null>(null);
  const cardDeckV3DetailStatusRef = useRef<"idle" | "loading" | "ready" | "error">("idle");
  const cardDeckV3HydratedDraftRef = useRef<string | null>(null);
  const cardDeckV3EditGenerationRef = useRef(0);
  const cardDeckV3SavePendingGenerationRef = useRef<number | null>(null);
  const cardDeckV3PendingSourceSnapshotRef = useRef<CardDeckV3SourceSnapshot | null>(null);
  const cardDeckV3DirtyRef = useRef(false);
  cardDeckV3Ref.current = cardDeckV3;
  cardDeckV3DetailStatusRef.current = cardDeckV3DetailStatus;
  // 영상 편집 v1(세션맥락 과업 B). 있으면 편집실이 VideoEditor를 그린다.
  const [videoEdit, setVideoEdit] = useState<VideoEdit | null>(null);
  const [editSavedAt, setEditSavedAt] = useState("");
  const [editAutosaveError, setEditAutosaveError] = useState("");
  // C(2026-09-22 코드리뷰 4차): 카드덱·영상 자동저장이 editAutosaveError 하나를 공유하면
  // 영상 쪽 보류 사유("N번째 오버레이 문구가 비어 있어 보류")를 직후에 도는 카드덱 타이머의
  // 성공(빈 문자열 set)이 지운다 — 사용자는 저장된 줄 알고 방을 뜬다. 도메인별로 쪼갠다.
  const [cardDeckAutosaveError, setCardDeckAutosaveError] = useState("");
  const [videoEditAutosaveError, setVideoEditAutosaveError] = useState("");
  const [moveToPublishBusy, setMoveToPublishBusy] = useState(false);
  const [exportPanel, setExportPanel] = useState<{ draftId: string; kind: ExportPanelKind } | null>(null);
  const [requestedCardSlide, setRequestedCardSlide] = useState<{ id: string; requestId: number } | null>(null);
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
  // 카드 비율 하나만 본다. 생성실도 편집실도 발행 그림도 이 값을 쓴다.
  // 종전에는 생성실이 "4:5" 를 코드에 박아 두어 무엇을 골라도 픽셀이 1080×1350 하나였다.
  const cardAspectRatio = editFormat.kind === "card" ? editFormat.aspectRatio : "4:5";
  // 발행에 실을 카드 한 벌. 여러 장이면 여러 장 그대로, 없으면 대표 한 장.
  const publishDeck = img?.imageUrls?.length ? img.imageUrls : img?.url ? [img.url] : [];
  // 편집실 본 화면과 대화창이 같은 대사를 본다. 대화창만 빈 배열을 받으면 일괄 편집이 죽은 단추가 된다.
  const resolvedEditLines = useMemo(
    () => editLines.length
      ? editLines
      : [text?.shorts?.hook || "", text?.shorts?.body || "", text?.shorts?.cta || ""].filter(Boolean),
    [editLines, text],
  );
  const liveTextCardPreviewCacheRef = useRef<PlainCardRenderCacheEntry[]>([]);
  // v70 544행 계약: 글자 내장 카드도 입력·위치 변경 즉시 같은 렌더러로 다시 그린다.
  // 매 렌더마다 1080px 캔버스를 다시 만들지 않고 실제 입력·위치·비율·테마가 바뀔 때만
  // data URL을 갱신한다. 서버 업로드는 발행실 이동 때 한 번만 한다.
  const liveTextCardPreview = useMemo(() => {
    if (editKind !== "card" || img?.textEmbedded !== true || img.textSourceRecoverable === false || cardDeck?.template === "chat_bubble") {
      liveTextCardPreviewCacheRef.current = [];
      return null;
    }
    try {
      const rendered = renderPlainCardDeckIncremental({
        lines: resolvedEditLines,
        ratio: cardRatioFrom(cardAspectRatio),
        theme: themeFromPalette(learningInfo.palette),
        positions: cardTextPositions,
      }, liveTextCardPreviewCacheRef.current);
      liveTextCardPreviewCacheRef.current = rendered.cache;
      return rendered.urls;
    } catch {
      // 캔버스가 없는 시험·서버 렌더에서는 저장된 그림을 유지한다. 실제 브라우저의 최종
      // 업로드 경로는 recompositeCards가 별도로 실패를 알리고 발행실 이동을 막는다.
      return null;
    }
  }, [cardAspectRatio, cardDeck, cardTextPositions, editKind, img?.textEmbedded, img?.textSourceRecoverable, learningInfo.palette, resolvedEditLines]);
  const [editing, setEditing] = useState<PreviewPlatform | null>(null);
  const [showTx, setShowTx] = useState(false);
  const { data: tx } = useSWR<{ items?: Array<{ display_name?: string; credits?: number; action?: string; created_at?: string; output?: string | null; outputKind?: string | null }> }>(
    isOperator && showTx ? "/api/higgsfield/transactions?size=25" : null,
    fetcher,
  );

  // 이미 올라간 글의 발행 시각은 already에 따로 둬 재발행 성공처럼 보이지 않게 한다.
  const [pub, setPub] = useState<PublishProgress>({
    running: false, stopped: false, status: {}, urls: {}, errors: {}, already: {},
  });
  // SNS-007: 플랫폼별 다중계정 중 이번 발행에 쓸 계정. 미선택(undefined)이면 getChannelCred가
  // 기본계정으로 resolve(/api/publish 계약과 동일). 계정이 1개뿐이면 셀렉터 자체를 숨긴다.
  const [accountsByPlatform, setAccountsByPlatform] = useState<Record<string, AccountOption[]>>({});
  const [selectedAccounts, setSelectedAccounts] = useState<Record<string, string>>({});
  const [accountLoadErrors, setAccountLoadErrors] = useState<Record<string, boolean>>({});
  const [accountLoadPending, setAccountLoadPending] = useState<Record<string, boolean>>({});
  const [accountsLoaded, setAccountsLoaded] = useState(false);
  // 복원한 작업물의 선택 상태는 계정 조회와 별개다. 계정 조회가 느려도 본문과 선택 채널은
  // 먼저 복원해 보여 주고, 실제 발행 가능 대상만 조회 완료 뒤 따로 좁힌다.
  // 저장된 선택 의도는 보존하되, 화면의 체크 수와 발행 버튼에는 지금 올릴 수 있는
  // 채널만 포함한다. 초기 복원 중 잠깐 비어 있는 본문 때문에 includes 자체를 지우면
  // 정상 본문이 들어온 뒤에도 사용자가 고른 채널이 돌아오지 않는 경쟁이 생긴다.
  const usableAccounts = (platform: PreviewPlatform) => (accountsByPlatform[platform] || []).filter((account) => account.connectionState === "connected");
  const defaultConnectedAccount = (platform: PreviewPlatform) => {
    const accounts = usableAccounts(platform);
    return accounts.find((account) => account.is_default) || accounts[0];
  };
  // 계정 선택 UI가 없는 v70에서는 계정 관리에서 정한 현재 기본 계정이 화면과 요청의
  // 공통 정본이다. 저장된 과거 작업별 선택값을 보내면 사용자가 고칠 수 없는 숨은 상태가 된다.
  const selectedConnectedAccountId = (platform: PreviewPlatform) => defaultConnectedAccount(platform)?.id;

  // TikTok 패널(결함: 공개 범위 미선택 400) — app/videos/page.tsx와 같은 계약.
  // 연결된 TikTok 계정이 있을 때만 creator-info를 조회한다(없는데 부르면 404 토스트만
  // 쌓인다). 계정은 v70 규칙대로 기본 연결 계정 하나를 쓴다(계정 선택 UI 없음).
  // 2026-10-03 독립 리뷰 CI 수정: publishGuard가 아래 tiktokCreatorFailed/tiktokPrivacy를
  // 읽으므로, publishGuard를 처음 부르는 selectedTargets 계산보다 반드시 앞에 있어야
  // 한다(TDZ — "Cannot access before initialization"로 전체 화면이 죽은 실측).
  const tiktokAccountIdForCreator = selectedConnectedAccountId("tiktok");
  const tiktokCreatorUrl = usableAccounts("tiktok").length > 0
    ? `/api/tiktok/creator-info${tiktokAccountIdForCreator ? `?account_id=${encodeURIComponent(tiktokAccountIdForCreator)}` : ""}`
    : null;
  const { data: tiktokCreatorData, error: tiktokCreatorError } = useSWR<{
    connected?: boolean;
    ready?: boolean;
    creator?: { username: string; privacyLevels: string[]; commentDisabled: boolean; duetDisabled: boolean; stitchDisabled: boolean };
  }>(tiktokCreatorUrl, fetcher);
  const tiktokCreator = tiktokCreatorData?.creator;
  /**
   * 2026-10-03 독립 리뷰 m2: /api/tiktok/creator-info가 404(미연결)·502(계정 확인
   * 실패, route.ts)를 주면 fetcher가 던지고 tiktokCreator는 그냥 undefined가 된다.
   * 그러면 패널이 통째로 안 뜨고 publishGuard의 "공개 범위를 먼저 선택해주세요."만
   * 남아 — 고를 칸 자체가 없는데 "선택해주세요"만 뜨는 막다른 길이 된다. 계정은
   * 연결(usableAccounts>0)돼 있는데 creator-info 조회 자체가 실패했음을 구분해
   * 다른 안내와 재연결 링크를 보여준다.
   */
  const tiktokCreatorFailed = Boolean(tiktokCreatorUrl) && !tiktokCreator && Boolean(tiktokCreatorError);
  /**
   * 2026-10-03 독립 리뷰 m3(TikTok Content Sharing Guidelines): 유료 파트너십(브랜드
   * 콘텐츠)을 공개하면 비공개로는 못 올린다. 창작자가 쓸 수 있는 공개 범위 목록을
   * 이 상태로 좁힌다(순수 로직은 tiktok-disclosure.ts).
   */
  const tiktokDisclosureState: TikTokDisclosureState = {
    disclosureEnabled: tiktokDisclosureEnabled,
    brandOrganic: tiktokBrandOrganic,
    brandContent: tiktokBrandContent,
  };
  const tiktokAllowedPrivacyLevels = tiktokCreator ? allowedPrivacyLevels(tiktokDisclosureState, tiktokCreator.privacyLevels) : [];
  const tiktokDisclosureError = disclosureValidationError(tiktokDisclosureState);
  useEffect(() => {
    // 유료 파트너십을 켜서 비공개가 허용 목록 밖으로 나가면 그 값을 지운다(다른 값으로
    // 대신 고르지 않는다 — "사용자가 직접 고른다" 원칙, tiktok-disclosure.ts).
    setTiktokPrivacy((current) => resolvePrivacyAfterDisclosureChange(current, tiktokDisclosureState, tiktokCreator?.privacyLevels ?? []));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tiktokDisclosureEnabled, tiktokBrandContent, tiktokCreator?.privacyLevels]);

  const selectedTargets = selectedPublishTargets(includes)
    .filter((platform) => !publishGuard(platform).disabledReason);
  const publishTargets = selectedTargets.filter((platform) => usableAccounts(platform).length > 0);
  /**
   * 2026-10-03 독립 리뷰 MINOR-h: 상단 배너는 selectedTargets(사용자가 고른 전체)로 채널
   * 이름을 보여주고, "지금 발행" 버튼 옆 배지는 publishTargets(지금 실제로 올릴 수 있는
   * 것)로 보여줘서 두 이름 목록이 서로 달라질 수 있었다(예: 선택은 했는데 계정이 끊긴
   * 채널). 이름 목록은 이 값 하나로만 만든다 — 숫자 표시(선택 N곳 / 발행가능 M곳)는
   * 각자 다른 뜻이라 그대로 두고, "이름이 무엇인가"만 단일 정본으로 합친다.
   *
   * 이미 이번 발행에서 성공한(pub.status === "done") 채널은 재선택 대상처럼 이름에
   * 끼워 보여주지 않는다 — 다시 누르면 재발행처럼 보이는 혼동을 줄인다. 뒤따르는 다른
   * PR이 도입하는 "이미 완료"·"상태 불명" 상태는 이 필터에 조건을 추가하는 자리다
   * (지금은 done만 존재하고 unknown류 상태가 아직 코드에 없어 추측해서 만들지 않았다).
   */
  const publishNameTargets = (accountsLoaded ? publishTargets : selectedTargets)
    .filter((platform) => pub.status[platform] !== "done");
  // 선택이 자동으로 꺼진 뒤에도 재연결 행동이 사라지면 사용자는 복구할 길이 없다.
  // 현재 발행 체크와 무관하게 만료·해제 계정이 하나라도 있는 채널을 안내한다.
  const reconnectTargets = ALL.filter((platform) =>
    (accountsByPlatform[platform] || []).some((account) => account.connectionState === "reconnect"));
  // 일부만 성공한 뒤에는 버튼이 '다시 발행'이 아니라 '실패한 곳만'이어야 한다.
  const publishRetryOnly = publishTargets.some((platform) => pub.status[platform] === "done")
    && publishTargets.some((platform) => pub.status[platform] === "failed");

  useEffect(() => {
    // videos/page.tsx와 같은 동기화: 창작자 계정이 이미 막아둔 상호작용은 토글도
    // 그 상태로 맞춰 둔다(사용자가 끌 필요가 없는 걸 또 묻지 않는다).
    setTiktokDisableComment(tiktokCreator?.commentDisabled ?? false);
    setTiktokDisableDuet(tiktokCreator?.duetDisabled ?? false);
    setTiktokDisableStitch(tiktokCreator?.stitchDisabled ?? false);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tiktokAccountIdForCreator, tiktokCreator?.username, tiktokCreator?.commentDisabled, tiktokCreator?.duetDisabled, tiktokCreator?.stitchDisabled]);

  useEffect(() => {
    const requested = resolveStudioRoom(`?${search}`, storedRoom).room;
    if (requested !== storedRoom) setActiveRoom(requested);
  }, [search, setActiveRoom, storedRoom]);

  const requestedEditKind = (() => {
    const value = searchParams?.get("kind");
    return value === "text" || value === "card" || value === "video" ? value : null;
  })();

  const changeRoom = (room: StudioRoom, resolvedEditKind: EditContentKind = editKind) => {
    setActiveRoom(room);
    const kindQuery = room === "edit" && resolvedEditKind !== "audio" ? `&kind=${resolvedEditKind}` : "";
    window.history.replaceState(null, "", `/studio?room=${room}${kindQuery}`);
    setShowWorks(false);
  };

  const changeEditKind = (nextKind: EditContentKind) => {
    setEditKind(nextKind);
    setEditFormat(defaultContentEditFormat(nextKind));
    const kindQuery = nextKind === "audio" ? "" : `&kind=${nextKind}`;
    window.history.replaceState(null, "", `/studio?room=edit${kindQuery}`);
  };

  const openCreateForEditKind = () => {
    const nextKind: CreateKind = editKind === "audio" ? "text" : editKind;
    setCreateBranch(nextKind === "video" ? "video" : "text_image");
    setCreatePrimaryKind(nextKind);
    setActiveRoom("create");
    window.history.replaceState(null, "", `/studio?room=create&kind=${nextKind}`);
    setShowWorks(false);
  };

  useEffect(() => {
    setAccountsLoaded(false);
    setAccountLoadErrors({});
    setAccountLoadPending(Object.fromEntries(Array.from(ACCOUNT_SELECTABLE).map((platform) => [platform, true])));
    if (!shouldLoadPublishResources(activeRoom) || !activeWorkspace) {
      setAccountsByPlatform({});
      setAccountLoadPending({});
      return;
    }
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
            const res = await fetch(`/api/channels/${provider}/accounts?tenant_id=${activeWorkspace.id}`, {
              headers: authHeaders(),
              signal: AbortSignal.timeout(10_000),
            });
            const data = await res.json().catch(() => ({}));
            return { ok: res.ok, data: data as { accounts?: ChannelAccountRaw[] } };
          } catch {
            return { ok: false, data: {} as { accounts?: ChannelAccountRaw[] } };
          }
        })();
        providerCache.set(provider, call);
        return call;
      };
      const resolvedAccounts: Record<string, AccountOption[]> = {};
      await Promise.allSettled(
        Array.from(ACCOUNT_SELECTABLE).map(async (p) => {
          let opts: AccountOption[] = [];
          let failed = false;
          try {
            const provider = VIDEO_ACCOUNT_PROVIDER[p] || p;
            const { ok, data: d } = await fetchAccounts(provider);
            failed = !ok;
            if (ok) {
              opts = (d.accounts ?? []).map((a: { id: string; display_name: string | null; username: string | null; is_default: boolean; connection_state?: string }) => ({
                id: a.id,
                // 내부 UUID는 사용자에게 계정 이름이 아니다. 표시 이름·핸들이 모두
                // 비어도 제공자 이름으로 설명하고, id는 요청에만 쓴다.
                // 발행실 계정 행은 사람 이름보다 실제 공개 핸들을 우선한다. 핸들이
                // 없을 때만 표시 이름으로 물러나며 내부 id나 "@연결 계정"은 만들지 않는다.
                label: a.username ? `@${a.username.replace(/^@/, "")}` : (a.display_name || `${LABEL[p]} 계정`),
                displayName: a.display_name || undefined,
                username: a.username || undefined,
                is_default: a.is_default,
                connectionState: a.connection_state === "reconnect" ? "reconnect" : "connected",
              }));
            }
          } catch {
            failed = true;
          }
          resolvedAccounts[p] = opts;
          if (cancelled) return;
          setAccountsByPlatform((current) => ({ ...current, [p]: opts }));
          setAccountLoadErrors((current) => ({ ...current, [p]: failed }));
          setAccountLoadPending((current) => ({ ...current, [p]: false }));
        }),
      );
      if (cancelled) return;
      setIncludes((current) => Object.fromEntries(ALL.map((platform) => [
        platform,
        Boolean(current[platform])
          && (resolvedAccounts[platform] || []).some((account) => account.connectionState === "connected"),
      ])));
      setAccountLoadPending({});
      setAccountsLoaded(true);
    })();
    return () => { cancelled = true; };
  }, [activeRoom, activeWorkspace]);

  useEffect(() => {
    if (!accountsLoaded) return;
    const invalidPlatforms = Object.entries(selectedAccounts)
      .filter(([platform, accountId]) => !(accountsByPlatform[platform] || [])
        .some((account) => account.id === accountId && account.connectionState === "connected"))
      .map(([platform]) => platform);
    if (!invalidPlatforms.length) return;
    const invalid = new Set(invalidPlatforms);
    setSelectedAccounts((current) => Object.fromEntries(
      Object.entries(current).filter(([platform]) => !invalid.has(platform)),
    ));
    setIncludes((current) => ({
      ...current,
      ...Object.fromEntries(invalidPlatforms.map((platform) => [platform, false])),
    }));
  }, [accountsByPlatform, accountsLoaded, selectedAccounts]);
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
    // [보안](교차 리뷰 BLOCK): 워크스페이스를 바꾸는 이 효과가 cardDeck은 비우면서
    // videoEdit은 비우지 않았다 — 옛 워크스페이스의 오버레이·댓글이 새 워크스페이스로
    // 그대로 넘어가 있다가, 새 워크스페이스의 draft가 videoEdit을 안 갖고 있으면(또는
    // localStorage에 그 키가 없으면) 그 남의 값이 그대로 저장됐다. 대기 중인 자동저장
    // 타이머도 반드시 같이 끈다 — 안 그러면 이미 예약된 저장이 새 워크스페이스로 넘어간
    // 뒤에 옛 워크스페이스의 videoEdit을 그 위에 그대로 쏜다.
    if (cardDeckAutosaveTimer.current) { clearTimeout(cardDeckAutosaveTimer.current); cardDeckAutosaveTimer.current = null; }
    if (videoEditAutosaveTimer.current) { clearTimeout(videoEditAutosaveTimer.current); videoEditAutosaveTimer.current = null; }
    setHydratedWorkspaceId(null);
    setIdea(""); setImg(null); setVid(null); setDraftId(null);
    setIncludes(normalizeIncludes()); setRestoredSelectionNotice(false); setPublishReconciliations({}); setEditorHandoff(null);
    // m3: 작업 공간을 바꾸면 TikTok 공개 범위·상업 콘텐츠 공개를 초기화한다(다른
    // 공간의 영상에 지난 선택이 그대로 넘어가면 안 된다).
    resetTiktokDisclosure();
    setTitles({}); setHashtags({}); setTopicTags({}); setFirstComments({}); setCaptions({});
    replaceBodySnapshot([], null, { replaceDocument: true, serverRevision: 0 }); setCardTextPositions([]); setCardDeck(null); setCardDeckV3(null); setCardTemplateState(null); setCardDeckV3SourceSnapshot(null); setCardDeckV3DetailStatus("idle"); setVideoEdit(null); setReviewQueueId(null); setSelectedCandidate(null);
    quickDraftTopicRef.current = null;
    videoEditReconciledRef.current = true; reconciledDraftIdRef.current = null; videoEditBaseRevisionRef.current = null;
    invalidateVideoEditReconcile(); // B-7: 진행 중이던 맞춤 결과를 버린다
    setCreateBranch("video"); setCreatePrimaryKind(null); setEditKind("video"); setEditFormat(defaultContentEditFormat("video"));
    setPub({ running: false, stopped: false, status: {}, urls: {}, errors: {}, already: {} });
    if (!workspaceId) return;
    try {
      localStorage.removeItem("studio_work");
      const raw = localStorage.getItem(studioWorkStorageKey(workspaceId));
      if (raw) {
        const w = JSON.parse(raw);
        setIdea(w.idea || "");
        // 서버 초안과 같은 엄격한 서명으로만 구형 무료 글자 카드를 승격한다. 일반 생성
        // 이미지는 aspectRatio 도장이 있고, 말풍선 덱은 template이 달라 여기서 제외된다.
        setImg(recoverDraftEmbeddedTextCard<ImgResult>(w)); setVid(w.vid || null);
        if (w.includes) {
          setIncludes(normalizeIncludes(w.includes));
          setRestoredSelectionNotice(Object.values(w.includes as Record<string, boolean>).some(Boolean));
        }
        setDraftId(w.draftId || null);
        setPublishReconciliations(normalizePublishReconciliations(w.publishReconciliations ?? w.publishReconciliation));
        setPub(normalizePublishProgress(w.publishProgress) ?? { running: false, stopped: false, status: {}, urls: {}, errors: {}, already: {} });
        setTitles(w.titles || {}); setHashtags(w.hashtags || {}); setTopicTags(w.topicTags || {});
        setFirstComments(w.firstComments || {}); setCaptions(w.captions || {}); setSelectedAccounts(w.selectedAccounts || {});
        // 2026-10-01 운영 실측: 구조 초안 복원부(StudioRooms.tsx)는 PR#96에서 이미
        // filterInstructionPlaceholderLines 를 탔는데, 여기(생성 후보 패널의 복원 경로)는
        // 안 걸려 있어 자리표시 문장이 그대로 화면에 복원됐다. 같은 판정 함수를 재사용한다
        // (새 필터 금지 — 2026-10-01 PR#96 반려 "재창조 금지").
        const restoredQuickDraftText = sanitizeRestoredQuickDraftText(w.text || null);
        const restoredQuickDraftLines = sanitizeRestoredQuickDraftLines(w.editLines || []);
        replaceBodySnapshot(restoredQuickDraftLines, restoredQuickDraftText, { replaceDocument: true, serverRevision: Number.isSafeInteger(w.bodyRevision) ? w.bodyRevision : 0 });
        quickDraftTopicRef.current = resolveRestoredQuickDraftTopic({
          hasText: Boolean(restoredQuickDraftText),
          savedTopic: typeof w.quickDraftTopic === "string" ? w.quickDraftTopic : null,
          restoredIdea: String(w.idea || ""),
        });
        const restoredCardDeck = (w.cardDeck as CardDeck) || null;
        const restoredCardDeckV3 = cardDeckV3ForDraft(restoredCardDeck, w.cardDeckV3 as CardDeckV3 | null);
        setCardTextPositions(w.cardTextPositions || []); setCardDeck(restoredCardDeck); setCardDeckV3(restoredCardDeckV3); setCardTemplateState(restoredCardDeckV3 ? (w.cardTemplateState as CardTemplateState | null) ?? defaultCardTemplateState(restoredCardDeckV3) : null); setCardDeckV3SourceSnapshot(restoredCardDeckV3 ? (w.cardDeckV3SourceSnapshot as CardDeckV3SourceSnapshot) || null : null); setCardDeckV3DetailStatus(restoredCardDeckV3 ? "ready" : "idle"); setReviewQueueId(w.reviewQueueId || null);
        // B1(교차 리뷰 BLOCK, 재리뷰로 절반만 닫힘 지적): videoEdit이 이 복원 블록에
        // 없으면 편집기가 빈 videoEdit을 받았다. 이제 무조건 세팅한다(없으면 null —
        // 이전 워크스페이스 값이 남아 있으면 안 된다, 위 리셋과 짝). 다만 localStorage
        // 값은 오래됐을 수 있다(다른 탭·기기가 서버에 더 최신을 저장했을 수 있다) — 그래서
        // draftId가 있으면 이 값을 잠정치로만 쓰고, 아래 서버 재동기화 효과가 draft 목록이
        // 오면 서버 값으로 다시 덮는다. 그 전까지는 videoEdit 자동저장을 보류한다
        // (videoEditReconciledRef).
        setVideoEdit((w.videoEdit as VideoEdit) ?? null);
        // B-5(5차 재리뷰 BLOCKER): 목록이 도착하기 전 창에서 이 ref만 false였고 화면이
        // 보는 syncing(videoEditReconciling state)은 그대로 false라, +훅 등 컨트롤이
        // 계속 열려 있었다 — 그 창에서 만든 편집이 목록 도착 후 재동기화에 조용히
        // 덮여 사라졌다. "재조정이 끝나기 전에는 편집 불가"를 하나의 신호(state)로
        // 묶는다: 복원된 draftId가 있으면 이 시점부터 syncing을 true로 켜서 run()·
        // startDrag 게이트가 즉시 잠그게 한다. 재동기화 효과(reconcileVideoEditFromServer)
        // 가 끝나야 false로 풀린다.
        videoEditReconciledRef.current = !w.draftId;
        if (w.draftId) setVideoEditReconciling(true);
        reconciledDraftIdRef.current = null;
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
  // 2026-10-01 운영 실측: 생성실 "고른 형식의 생성 후보" 패널(quickDraft = text)이 주제를
  // 바꿔도 이전 주제의 후보가 그대로 남았다. 구조 초안(StudioRooms.tsx, PR#96)과 같은
  // 규칙 — 후보를 만든 실제 주제와 지금 주제가 달라지면(trim 비교) 후보를 비운다. 이 효과가
  // 자기 복원(hydratedWorkspaceId)을 끝내기 전에는 판정을 미룬다(복원 직후 오삭제 금지 —
  // 부모의 늦은 주제 복원을 "주제 변경"으로 오판하면 막 복원한 후보가 지워진다).
  useEffect(() => {
    const workspaceId = activeWorkspace?.id ?? null;
    if (!workspaceId || hydratedWorkspaceId !== workspaceId) return;
    if (!shouldInvalidateQuickDraft(quickDraftTopicRef.current, idea)) return;
    replaceBodySnapshot([], null, { replaceDocument: true, serverRevision: 0 });
    quickDraftTopicRef.current = null;
  }, [idea, hydratedWorkspaceId, activeWorkspace?.id]);
  // user-flow.md의 딥링크 계약. 로컬 초안 복원이 먼저 실행돼도 URL에 명시된 형식이
  // 마지막 선택권을 가진다. 종전에는 항상 저장된 카드 형식이 이 값을 덮어
  // /studio?room=edit&kind=video 에서도 카드 화면이 열렸다.
  useEffect(() => {
    if (activeRoom !== "edit" || !requestedEditKind) return;
    if (editKind !== requestedEditKind) {
      setEditKind(requestedEditKind);
      setEditFormat(defaultContentEditFormat(requestedEditKind));
    }
  }, [activeRoom, editKind, hydratedWorkspaceId, requestedEditKind]);
  // 발행실의 미디어 누락 복구 행동은 "영상 만들기"·"카드 만들기"라고 약속한다.
  // URL만 create로 바꾸고 kind를 소비하지 않으면 직전 생성 종류가 남아 그 약속과 다른
  // 생성기가 열린다. 생성실 딥링크도 편집실과 같은 kind를 실제 선택 상태로 반영한다.
  useEffect(() => {
    if (activeRoom !== "create" || !requestedEditKind) return;
    setCreateBranch(requestedEditKind === "video" ? "video" : "text_image");
    setCreatePrimaryKind(requestedEditKind);
  }, [activeRoom, requestedEditKind]);
  useEffect(() => {
    const workspaceId = activeWorkspace?.id;
    if (!workspaceId || hydratedWorkspaceId !== workspaceId) return;
    try {
      localStorage.setItem(studioWorkStorageKey(workspaceId), JSON.stringify({ idea, text, bodyRevision: bodySnapshotRef.current.serverRevision, img, vid, includes, draftId, publishReconciliations, publishProgress: pub, titles, hashtags, topicTags, firstComments, captions, selectedAccounts, editLines, cardTextPositions, cardDeck, cardDeckV3, cardTemplateState, cardDeckV3SourceSnapshot, reviewQueueId, editKind, editFormat, videoEdit, quickDraftTopic: quickDraftTopicRef.current ?? undefined }));
      setEditSavedAt(new Intl.DateTimeFormat("ko-KR", { hour: "2-digit", minute: "2-digit", hour12: false }).format(new Date()));
      setEditAutosaveError("");
    } catch {
      setEditAutosaveError("자동 저장하지 못했습니다. 브라우저 저장 공간을 확인해 주세요.");
    }
  }, [activeWorkspace?.id, hydratedWorkspaceId, idea, text, bodyServerRevision, img, vid, includes, draftId, publishReconciliations, pub, titles, hashtags, topicTags, firstComments, captions, selectedAccounts, editLines, cardTextPositions, cardDeck, cardDeckV3, cardTemplateState, cardDeckV3SourceSnapshot, reviewQueueId, editKind, editFormat, videoEdit]);

  const upText = (patch: Partial<TextVariants>) => replaceText({ ...(textRef.current || {}), ...patch });
  const upIg = (patch: Partial<NonNullable<TextVariants["instagram"]>>) => replaceText({
    ...(textRef.current || {}),
    instagram: { ...(textRef.current?.instagram || {}), ...patch },
  });
  const syncEditLines = (nextLines: string[]) => {
    const current = textRef.current;
    let nextText = current;
    if (current) {
      const body = nextLines.join("\n\n");
      if (editKind === "text") {
        nextText = {
          ...current,
          threads: body,
          x: body,
          facebook: body,
          instagram: { ...(current.instagram || {}), caption: body },
        };
      }
      if (editKind === "card") {
        nextText = { ...current, instagram: { ...(current.instagram || {}), slides: nextLines } };
      }
      if (editKind === "video") {
        const [hook = "", ...rest] = nextLines;
        const cta = rest.length > 0 ? rest[rest.length - 1] : "";
        const middle = rest.length > 1 ? rest.slice(0, -1) : [];
        nextText = { ...current, shorts: { ...(current.shorts || {}), hook, body: middle.join("\n"), cta } };
      }
    }
    replaceBodySnapshot(nextLines, nextText);
  };

  async function genText(structure?: CreateStructureChoice, cardTemplateId?: CardDeckTemplateId) {
    setLastError(null);
    try {
      const r = await apiPost<TextVariants & { ok?: boolean; error?: string }>("/api/studio/text", {
        idea,
        guide,
        tenant_id: activeWorkspace?.id,
        structure: structure ? { label: structure.label, title: structure.title, outline: structure.outline } : undefined,
        card_template_id: cardTemplateId,
      }, { signal: generationAbort.current?.signal });
      if (!r?.ok) { const msg = r?.error || "텍스트 생성 실패"; setLastError(`텍스트: ${msg}`); showToast(msg, "error"); return null; }
      // API가 성공을 확인한 뒤에만 발행한다. 클릭 시점 아님.
      trackEvent({ name: "content_generate", params: { kind: "text" } });
      return r;
    } catch (e) {
      const msg = extractApiErrorMessage(e, "텍스트 생성 실패");
      setLastError(`텍스트: ${msg}`); showToast(msg, "error"); return null;
    }
  }
  async function generateQuickDraft(structure: CreateStructureChoice, cardTemplateId?: CardDeckTemplateId) {
    if (!idea.trim()) { showToast("주제를 입력해 주세요", "error"); return; }
    generationAbort.current = new AbortController();
    setBusy("초안 만드는 중");
    try {
      const result = await genText(structure, cardTemplateId);
      if (result) {
        // 2026-09-05 회장 계정 실측: 새 초안을 만들어도 이전 초안 번호를 그대로 들고 가서,
        // 그 번호가 이미 발행된 것이면 발행이 매번 "이미 올라갔습니다"로 닫혔다. 스튜디오에서
        // 두 번째 글을 영영 못 올리는 상태였다. 새로 만든 것은 새 작업물이므로 이전 번호와
        // 발행 흔적을 끊는다. 끊지 않으면 새 글이 옛 글의 발행 기록에 덮어써진다.
        draftIdRef.current = null;
        setDraftId(null);
        const freshPublishProgress: PublishProgress = { running: false, stopped: false, status: {}, urls: {}, errors: {}, already: {} };
        setPub(freshPublishProgress);
        setPublishReconciliations({});
        // 2026-09-14 실측: 초안번호와 발행 흔적은 끊으면서 **그림과 영상만 그대로 뒀다.**
        // 그래서 주제를 바꿔 새 초안을 만들어도 발행실에는 어제 주제의 영상이 붙어 있었고,
        // 화면이 멀쩡해 보여 그대로 발행된다. 새 작업물에는 새 매체만 붙는다.
        // 남기고 경고만 띄우는 안은 버렸다(근거: lib/studio/work-media.ts droppedMediaNotice).
        const dropped = droppedMediaNotice({ img: Boolean(img), vid: Boolean(vid) });
        // [보안](교차 리뷰 재리뷰 BLOCK 2): 새 초안을 만드는 이 경로도 cardDeck만 비우고
        // videoEdit은 그대로 뒀다 — 옛 주제의 오버레이·댓글이 새 초안에 그대로 남았다.
        if (cardDeckAutosaveTimer.current) { clearTimeout(cardDeckAutosaveTimer.current); cardDeckAutosaveTimer.current = null; }
        if (videoEditAutosaveTimer.current) { clearTimeout(videoEditAutosaveTimer.current); videoEditAutosaveTimer.current = null; }
        setImg(null); setVid(null); setCardTextPositions([]); setCardDeck(null); setCardDeckV3(null); setCardDeckV3DetailStatus("idle"); setCardTemplateState(null); setCardDeckV3SourceSnapshot(null); setVideoEdit(null);
        videoEditReconciledRef.current = true; reconciledDraftIdRef.current = null; videoEditBaseRevisionRef.current = null;
        invalidateVideoEditReconcile(); // B-7: 진행 중이던 맞춤 결과를 버린다
        if (dropped) showToast(dropped, "success");
        const nextKind = createPrimaryKind ?? "text";
        const pendingTextCandidates = nextKind === "text" && result.text_candidates?.length
          ? result.text_candidates
          : null;
        const nextLines = pendingTextCandidates
          ? []
          : nextKind === "video"
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
        const nextEditFormat = defaultContentEditFormat(nextKind);
        setEditKind(nextKind);
        setEditFormat(nextEditFormat);
        let generatedCardTemplate: ReturnType<typeof buildGeneratedCardTemplate> = null;
        if (nextKind === "card" && result.card_template_id && result.card_template_id !== "chat_bubble") {
          try {
            generatedCardTemplate = buildGeneratedCardTemplate({
              renderEnabled: CARD_DECK_V3_RENDER_ENABLED,
              templateId: result.card_template_id,
              lines: nextLines,
            });
          } catch (error) {
            showToast(extractApiErrorMessage(error, "카드가 2장 이상일 때 템플릿을 적용할 수 있습니다."), "error");
          }
          if (!CARD_DECK_V3_RENDER_ENABLED) {
            showToast("카드 직접 편집 기능이 꺼져 있어 기본 카드 편집으로 만들었습니다.", "success");
          }
        }
        replaceBodySnapshot(
          nextLines,
          pendingTextCandidates
            ? { text_candidates: pendingTextCandidates, recommended_text_candidate_id: result.recommended_text_candidate_id }
            : result,
          { replaceDocument: true, serverRevision: 0 },
        );
        if (generatedCardTemplate) {
          const { deck: generatedDeck, sourceSnapshot, templateState } = generatedCardTemplate;
          setCardDeckV3(generatedDeck);
          cardDeckV3Ref.current = generatedDeck;
          setCardTemplateState(templateState);
          setCardDeckV3SourceSnapshot(sourceSnapshot);
          cardDeckV3PendingSourceSnapshotRef.current = sourceSnapshot;
          setCardDeckV3DetailStatus("ready");
          try {
            await save(
              "draft",
              {},
              null,
              null,
              null,
              null,
              null,
              generatedDeck,
              "tail",
              freshPublishProgress,
              {
                sourceSnapshot,
                templateState,
                editKind: nextKind,
                editFormat: nextEditFormat,
              },
            );
          } catch (error) {
            // S7-R2 MINOR 7: 생성 직후 첫 저장이 실패한 자유 배치 덱을 화면에만 남기면
            // 사용자는 저장됐다고 믿고 이탈할 수 있다. 자유 배치 상태를 먼저 걷고 같은
            // 본문을 기본 카드 편집으로 한 번 더 저장해, 서버와 화면이 서로 다른 상태를
            // 유지하지 않게 한다.
            setCardDeckV3(null);
            cardDeckV3Ref.current = null;
            setCardTemplateState(null);
            setCardDeckV3SourceSnapshot(null);
            cardDeckV3PendingSourceSnapshotRef.current = null;
            setCardDeckV3DetailStatus("idle");
            try {
              await save(
                "draft",
                {},
                null,
                null,
                null,
                null,
                null,
                null,
                "tail",
                freshPublishProgress,
                {
                  clear: true,
                  sourceSnapshot: null,
                  templateState: null,
                  editKind: nextKind,
                  editFormat: nextEditFormat,
                },
              );
              setCardDeckAutosaveError("");
              showToast("카드 직접 편집 저장에 실패해 기본 카드 편집으로 저장했습니다.", "error");
            } catch (fallbackError) {
              setCardDeckAutosaveError(extractApiErrorMessage(fallbackError, extractApiErrorMessage(error, "생성한 카드를 서버에 저장하지 못했습니다. 초안을 다시 만들어 주세요.")));
            }
          }
        }
        // 이 후보를 만든 실제 주제를 기억해 둔다. 이후 주제가 바뀌면(trim 비교) 옛 주제로
        // 만든 후보를 비운다 — 2026-10-01 운영 실측.
        quickDraftTopicRef.current = idea.trim() || null;
        showToast(`${structure.label} 구조로 초안을 만들었습니다`, "success");
      }
    } finally {
      generationAbort.current = null;
      setBusy(null);
    }
  }

  async function selectTextCandidate(candidate: TextCandidate) {
    const candidates = textRef.current?.text_candidates ?? [candidate];
    if (textCandidateSelectionWouldDiscardEdits({
      currentSelectedId: textRef.current?.selected_text_candidate_id,
      currentLines: bodySnapshotRef.current.lines,
      nextCandidateId: candidate.id,
      candidates,
    })) {
      const confirmed = await askConfirm({
        title: "고친 본문을 다른 후보로 바꿀까요?",
        description: "현재 본문에서 직접 고친 내용이 사라지고, 선택한 후보의 원문으로 교체됩니다.",
        confirmLabel: "고친 내용을 버리고 바꾸기",
        cancelLabel: "현재 본문 유지",
        destructive: true,
      });
      if (!confirmed) return;
    }
    const nextText: TextVariants = {
      ...candidate.content,
      text_candidates: candidates,
      selected_text_candidate_id: candidate.id,
      recommended_text_candidate_id: textRef.current?.recommended_text_candidate_id,
    };
    const nextLines = textCandidateLines(candidate);
    setEditKind("text");
    setEditFormat(defaultContentEditFormat("text"));
    replaceBodySnapshot(nextLines, nextText);
    showToast(`${candidate.label} 후보를 본문에 적용했습니다`, "success");
  }
  // 2026-09-06 회장 확정: "고객이 이미지 영상 생성 하려고 서비스 쓰는거아니야?"
  // 종전에는 운영자만 생성할 수 있어 고객 계정에서는 카드뉴스와 영상이 아예 안 만들어졌다.
  // PRD v8.2.1 이 고객 핵심 기능으로 규정한 것과도 어긋나 있었다. 고객에게 연다.
  // 누가 얼마나 썼는지는 작업 공간별로 남겨 사용량 화면이 그것을 읽는다.
  // 비율을 9:16 으로 못 박아 두면 카드뉴스가 세로 영상 비율로 나온다. 카드뉴스는 정사각이고
  // 숏폼 히어로 이미지는 세로다. 쓰는 쪽이 정하게 한다(사업계획 v0.4 10절 첫 매체 = 카드뉴스).
  // 생성기가 받는 값은 정해져 있다: 1:1, 16:9, 9:16, 4:3 등. 4:5 는 거절된다(2026-09-06 실측).
  // 2026-10-01 비동기 전환: POST는 jobId만 접수해 돌려준다(202). 실제 생성은 생성기 대기열에서
  // 몇 분~20분대로 걸릴 수 있어(세션맥락 실측 cb35f3fd), 프록시 100초 한도에 안 끊기도록
  // 서버는 즉시 돌아오고 화면이 GET /api/higgsfield/job/[id] 를 폴링한다. 폴링 중 jobId를
  // localStorage(작업 공간+화면 스코프)에 적어 두어 새로고침·탭 재방문 뒤에도 이어서 확인할 수
  // 있게 한다 — 안 그러면 완료된 결과(크레딧은 이미 씀)를 영영 못 받는다.
  async function pollAndFinishImage(
    jobId: string, tenantId: string, aspectRatio: "1:1" | "9:16",
    opts?: { signal?: AbortSignal; topicLabel?: string },
  ) {
    const result = await pollHiggsfieldJob<ImgResult & { ok?: boolean; error?: string; nsfw?: boolean; credits?: boolean; status?: string }>(
      jobId, tenantId,
      {
        // 2026-10-02 리뷰 MAJOR 5b: 상호작용 중인 폴링은 generationAbort.current(전역
        // "지금 작업물 버리기" 신호)를, 새로고침 복구 폴링은 그 effect 자신의
        // AbortController를 쓴다 — 전역 신호에 섞이면 복구 폴링이 다른 생성 취소에
        // 엉뚱하게 끊기거나, 반대로 언마운트돼도 안 끊긴다.
        signal: opts?.signal ?? generationAbort.current?.signal,
        headers: authHeaders(),
        onStatus: (status) => {
          setBusy(
            status === "queued" ? "이미지 생성 대기열에서 기다리는 중"
              : status === "retrying" ? "이미지 생성기 연결을 복구하는 중입니다. 잠시만 기다려 주세요"
                : "이미지 만드는 중",
          );
        },
      },
    );
    // 2026-10-02 리뷰 MINOR: 취소·시간초과 때는 pending 기록을 지우지 않는다. 이미
    // 202로 접수된 작업은 서버·생성기 쪽에서 계속 만들어지고 있을 수 있다(크레딧도 이미
    // 썼을 수 있다) — 여기서 지우면 다음 방문에서 그 결과를 영영 회수할 수 없다. 정상
    // 종결(성공/실패 확정) 때만 더 이상 회수할 게 없으므로 지운다.
    if (result.aborted) return null;
    // 2026-10-02 리뷰 MAJOR 5b: 결과가 왔을 때 작업 공간이 이미 다른 곳으로 바뀌었으면
    // 화면 상태(setImg/setLastError/showToast)를 건드리지 않는다 — 지금 보고 있는
    // 작업공간에 남의 결과가 꽂히면 안 된다. pending 기록은 그 작업공간 것이므로 여기서
    // 건드리지 않는다(그 작업공간으로 돌아오면 복구 effect가 다시 잡는다).
    if (activeWorkspaceIdRef.current !== tenantId) return null;
    if (result.timedOut) {
      // "다시 시도" 유도 금지(MINOR) — 접수된 작업은 서버에서 계속 만들어지고 있다.
      // pending 기록을 지우지 않아 다음 방문에서 복구 effect가 이어서 확인한다.
      const msg = "이미지 생성이 평소보다 오래 걸리고 있습니다. 생성실을 다시 열면 이어서 받아옵니다.";
      setLastError(`이미지: ${msg}`); showToast(msg, "error"); return null;
    }
    if (result.notFound) {
      // 작업 자체가 없다(만료·삭제 등) — 더는 회수할 게 없으므로 기록을 지운다.
      clearPendingJob(tenantId, "image");
      const msg = result.error || "이미지 생성 작업을 찾지 못했습니다. 다시 만들어 주세요.";
      setLastError(`이미지: ${msg}`); showToast(msg, "error"); return null;
    }
    // 정상 종결(성공/실패 확정) — 더 회수할 게 없으니 지운다.
    clearPendingJob(tenantId, "image");
    const r = result.data;
    if (!result.ok || !r?.ok) {
      const msg = r?.credits
        ? "이미지 생성기 잔액이 부족합니다. 충전하면 바로 만들 수 있습니다."
        : r?.nsfw
          ? "이 주제는 생성기가 만들 수 없다고 했습니다. 글감이나 결을 바꿔 다시 시도해 주세요."
          : (r?.error || result.error || "이미지를 만들지 못했습니다. 잠시 후 다시 시도해 주세요.");
      setLastError(`이미지: ${msg}`); showToast(msg, "error"); return null;
    }
    // ADR-007: `ok: true` 인데 배달 주소가 비어 있으면 setImg 가 빈 값을 들고 조용히
    // 성립한다 — "방금 만든 것" 칸을 그리는 조건(madeImageUrl = img.file || img.url)이
    // 거짓이 되어 화면엔 아무것도 안 뜨고, 그렇다고 오류 토스트도 안 뜬다. 성공인데
    // 아무 표시가 없는 것은 실패보다 나쁘다 — 사용자는 다시 눌러야 할지도 모른다.
    if (!r.file && !r.url) {
      const msg = "이미지를 만들었지만 화면에 걸 주소를 받지 못했습니다. 잠시 후 다시 시도해 주세요.";
      setLastError(`이미지: ${msg}`); showToast(msg, "error"); return null;
    }
    // 만든 그림에 주제 도장과 비율 도장을 찍는다. 주제 도장은 재사용 여부를,
    // 비율 도장은 영상 바탕으로 써도 되는지를 가른다(work-media.ts isReusableVideoBaseImage,
    // 2026-09-16 실측: 1:1 대표 이미지를 영상 바탕으로 재사용해 정사각 영상이 나갔다).
    const stamped = { ...r, topicKey: mediaTopicKey(opts?.topicLabel ?? idea), aspectRatio };
    setImg(stamped);
    await save("draft", publishReconciliations, draftIdRef.current, stamped, vid, cardDeck, videoEdit, cardDeckV3);
    await mutateHist();
    mutateAcct();
    return stamped;
  }
  async function genImage(prompt: string, aspectRatio: "1:1" | "9:16" = "9:16") {
    if (!activeWorkspace) { showToast("작업 공간을 먼저 고르세요", "error"); return null; }
    setLastError(null);
    try {
      const r = await apiPost<{ ok?: boolean; jobId?: string; error?: string; nsfw?: boolean; credits?: boolean }>("/api/higgsfield/image", { prompt, aspectRatio, label: idea, tenant_id: activeWorkspace.id });
      if (!r?.ok || !r.jobId) {
        const msg = r?.credits
          ? "이미지 생성기 잔액이 부족합니다. 충전하면 바로 만들 수 있습니다."
          : r?.nsfw
            ? "이 주제는 생성기가 만들 수 없다고 했습니다. 글감이나 결을 바꿔 다시 시도해 주세요."
            : (r?.error || "이미지를 만들지 못했습니다. 잠시 후 다시 시도해 주세요.");
        setLastError(`이미지: ${msg}`); showToast(msg, "error"); return null;
      }
      savePendingJob(activeWorkspace.id, "image", { jobId: r.jobId, aspectRatio, idea });
      return await pollAndFinishImage(r.jobId, activeWorkspace.id, aspectRatio);
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
  // 바탕 그림은 파일 이름으로만 넘긴다(2026-09-25 코드리뷰 MAJOR-0b: 서버 절대경로를 클라이언트가
  // 들고 다니며 그대로 서버에 되돌려주는 통로를 없앴다). 방금 만든 그림도, 승인함이나 달력에서
  // 가져온 작업물(파일 이름만 앎)도 이 한 가지 방식으로 처리된다(코드 감사 F-05 취지 유지).
  async function pollAndFinishVideo(
    jobId: string, tenantId: string,
    opts?: { signal?: AbortSignal; topicLabel?: string; sourceImage?: ImgResult | null },
  ) {
    const result = await pollHiggsfieldJob<VidResult & { ok?: boolean; error?: string; nsfw?: boolean; credits?: boolean; status?: string }>(
      jobId, tenantId,
      {
        signal: opts?.signal ?? generationAbort.current?.signal,
        headers: authHeaders(),
        onStatus: (status) => {
          setBusy(
            status === "queued" ? "영상 생성 대기열에서 기다리는 중"
              : status === "retrying" ? "영상 생성기 연결을 복구하는 중입니다. 잠시만 기다려 주세요"
                : "영상 만드는 중",
          );
        },
      },
    );
    // 2026-10-02 리뷰 MINOR: 취소·시간초과 때는 pending 기록을 지우지 않는다(이미지와
    // 같은 이유 — 접수된 작업은 서버에서 계속 만들어지고 있을 수 있다).
    if (result.aborted) return null;
    // 2026-10-02 리뷰 MAJOR 5b: 작업 공간이 바뀐 뒤 돌아온 결과는 화면에 꽂지 않는다.
    if (activeWorkspaceIdRef.current !== tenantId) return null;
    if (result.timedOut) {
      const msg = "영상 생성이 평소보다 오래 걸리고 있습니다. 생성실을 다시 열면 이어서 받아옵니다.";
      setLastError(`영상: ${msg}`); showToast(msg, "error"); return null;
    }
    if (result.notFound) {
      clearPendingJob(tenantId, "video");
      const msg = result.error || "영상 생성 작업을 찾지 못했습니다. 다시 만들어 주세요.";
      setLastError(`영상: ${msg}`); showToast(msg, "error"); return null;
    }
    clearPendingJob(tenantId, "video");
    const r = result.data;
    if (!result.ok || !r?.ok) {
      const msg = r?.nsfw
        ? "이 주제는 생성기가 만들 수 없다고 했습니다. 글감이나 결을 바꿔 다시 시도해 주세요."
        : r?.credits
          ? "영상 생성기 잔액이 부족합니다. 충전하면 바로 만들 수 있습니다."
          : (r?.error || result.error || "영상을 만들지 못했습니다. 잠시 후 다시 시도해 주세요.");
      setLastError(`영상: ${msg}`); showToast(msg, "error"); return null;
    }
    // ADR-007: 이미지와 같은 이유로 배달 주소 없는 "성공"을 성공으로 두지 않는다.
    if (!r.file && !r.url) {
      const msg = "영상을 만들었지만 화면에 걸 주소를 받지 못했습니다. 잠시 후 다시 시도해 주세요.";
      setLastError(`영상: ${msg}`); showToast(msg, "error"); return null;
    }
    const stamped = {
      ...r,
      topicKey: mediaTopicKey(opts?.topicLabel ?? idea),
      subtitlesBaked: false,
      subtitleLineageState: "unbaked" as const,
    };
    setVid(stamped);
    await save("draft", publishReconciliations, draftIdRef.current, opts?.sourceImage ?? img, stamped, cardDeck, videoEdit, cardDeckV3);
    await mutateHist();
    mutateAcct();
    return stamped;
  }
  async function genVideo(source: { filename?: string; image?: ImgResult | null }) {
    if (!activeWorkspace) { showToast("작업 공간을 먼저 고르세요", "error"); return null; }
    setLastError(null);
    const s = text?.shorts;
    const narration = [s?.hook, s?.body, s?.cta].filter(Boolean).join(". ");
    try {
      // 2026-09-14 이전에는 여기 지시문이 고정 문자열이라 주제도 학습 정보도 실리지 않았다.
      // 무엇에 관한 영상이든 같은 지시가 갔고, 결과가 주제와 무관하게 나오는 원인 중 하나였다.
      const motion = buildImageToVideoMotionPrompt(learningInfo);
      const r = await apiPost<{ ok?: boolean; jobId?: string; error?: string; nsfw?: boolean; credits?: boolean }>("/api/higgsfield/video", { filename: source.filename, prompt: motion, model: videoModel, narration, label: idea, tenant_id: activeWorkspace.id });
      if (!r?.ok || !r.jobId) {
        const msg = r?.nsfw
          ? "이 주제는 생성기가 만들 수 없다고 했습니다. 글감이나 결을 바꿔 다시 시도해 주세요."
          : r?.credits
            ? "영상 생성기 잔액이 부족합니다. 충전하면 바로 만들 수 있습니다."
            : (r?.error || "영상을 만들지 못했습니다. 잠시 후 다시 시도해 주세요.");
        setLastError(`영상: ${msg}`); showToast(msg, "error"); return null;
      }
      savePendingJob(activeWorkspace.id, "video", { jobId: r.jobId, idea });
      return await pollAndFinishVideo(r.jobId, activeWorkspace.id, { sourceImage: source.image ?? img });
    } catch (e) {
      const msg = extractApiErrorMessage(e, "영상 생성 실패");
      setLastError(`영상: ${msg}`); showToast(msg, "error"); return null;
    }
  }
  // 새로고침·탭 재방문 뒤에도 진행 중이던 생성을 잃지 않는다(세션맥락 2026-10-01 추가 실측
  // cb35f3fd — 15~20분 뒤 완료됐는데 서버 쪽 호출은 이미 끊겨 크레딧만 쓰고 결과를 못
  // 받았다). genImage/genVideo가 접수 직후 localStorage에 적어 둔 jobId가 작업 공간
  // 전환 시점에 남아 있으면 자동으로 이어서 조회한다.
  // resumePendingJobsRef: 작업공간 전환 effect와 탭-재표시 effect가 같은 복구 로직을
  // 공유한다(2026-10-02 server-side finalize 보강 — 세션맥락 22분 소실 재발방지). 서버가
  // 이제 백그라운드 루프로 작업을 스스로 끝내지만, 화면이 그 결과를 "받아서 보여주는" 것은
  // 여전히 이 폴링이 한다 — 탭이 백그라운드에서 오래 있다가 포그라운드로 돌아왔을 때
  // (같은 작업공간이라 effect가 재실행되지 않는 경우) 다시 확인하지 않으면 사용자는 이미
  // 완료된 결과를 화면에서 영영 못 본다.
  const resumePendingJobs = useCallback(() => {
    if (!activeWorkspace) return;
    if (resumePollAbort.current) return; // 이미 복구 폴링이 돌고 있다 — 중복 시작 금지.
    const workspaceId = activeWorkspace.id;
    const pendingImg = readPendingJob(workspaceId, "image");
    const pendingVid = readPendingJob(workspaceId, "video");
    if (!pendingImg && !pendingVid) return;
    const controller = new AbortController();
    resumePollAbort.current = controller;
    showToast("이전에 시작한 생성을 이어서 확인하는 중", "success");
    const restoredIdea = pendingImg?.idea ?? pendingVid?.idea;
    if (restoredIdea) {
      setIdea((current) => (current.trim() ? current : restoredIdea));
    }
    const tasks: Promise<unknown>[] = [];
    if (pendingImg) {
      setBusy("이미지 생성 대기열에서 기다리는 중");
      tasks.push(pollAndFinishImage(pendingImg.jobId, workspaceId, pendingImg.aspectRatio ?? "9:16", {
        signal: controller.signal,
        topicLabel: pendingImg.idea,
      }));
    }
    if (pendingVid) {
      setBusy("영상 생성 대기열에서 기다리는 중");
      tasks.push(pollAndFinishVideo(pendingVid.jobId, workspaceId, {
        signal: controller.signal,
        topicLabel: pendingVid.idea,
      }));
    }
    Promise.allSettled(tasks).finally(() => {
      setBusy(null);
      if (resumePollAbort.current === controller) resumePollAbort.current = null;
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeWorkspace?.id]);
  // 새로고침·탭 재방문 뒤에도 진행 중이던 생성을 잃지 않는다(세션맥락 2026-10-01 추가 실측
  // cb35f3fd — 15~20분 뒤 완료됐는데 서버 쪽 호출은 이미 끊겨 크레딧만 쓰고 결과를 못
  // 받았다). genImage/genVideo가 접수 직후 localStorage에 적어 둔 jobId가 작업 공간
  // 전환 시점에 남아 있으면 자동으로 이어서 조회한다.
  useEffect(() => {
    resumePendingJobs();
    return () => {
      resumePollAbort.current?.abort();
      resumePollAbort.current = null;
    };
    // activeWorkspace.id가 바뀔 때(작업 공간 전환)만 재확인한다.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeWorkspace?.id]);
  // 2026-10-02 server-side finalize 보강: 탭이 백그라운드에 있다가 다시 보일 때도 복구를
  // 다시 확인한다. activeWorkspace.id가 바뀌지 않아 위 effect는 재실행되지 않지만, 그동안
  // 서버가 백그라운드로 작업을 끝냈을 수 있고 화면 쪽 폴링은 (브라우저가 타이머를 묶어
  // 두거나, 탭을 완전히 닫았다 다시 연 경우) 이어지지 않았을 수 있다.
  useEffect(() => {
    const onWake = () => {
      if (typeof document === "undefined" || document.visibilityState === "visible") {
        resumePendingJobs();
      }
    };
    document.addEventListener("visibilitychange", onWake);
    window.addEventListener("focus", onWake);
    window.addEventListener("pageshow", onWake);
    return () => {
      document.removeEventListener("visibilitychange", onWake);
      window.removeEventListener("focus", onWake);
      window.removeEventListener("pageshow", onWake);
    };
  }, [resumePendingJobs]);
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
    // 2026-09-14 실측: 글은 없고 만든 영상만 남은 상태에서 "새로 시작" 을 누르면 여기서
    // "이미 비어 있습니다" 로 닫혀 **영상이 살아남았다.** 그 영상이 다음 주제에 그대로
    // 붙는다. 비어 있음은 그림·영상까지 봐야 판정할 수 있다.
    if (!text && !idea.trim() && !draftId && !createLeftover && !img && !vid) { showToast("이미 비어 있습니다", "success"); return; }
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
    resumePollAbort.current?.abort(); // MINOR: 버리고 새로 시작하면 복구 폴링도 함께 끊는다.
    setBusy(null);
    // [보안](교차 리뷰 재리뷰 BLOCK 2): "버리고 새로"도 cardDeck만 비우고 videoEdit은
    // 그대로 뒀다.
    if (cardDeckAutosaveTimer.current) { clearTimeout(cardDeckAutosaveTimer.current); cardDeckAutosaveTimer.current = null; }
    if (videoEditAutosaveTimer.current) { clearTimeout(videoEditAutosaveTimer.current); videoEditAutosaveTimer.current = null; }
    setIdea(""); setImg(null); setVid(null); draftIdRef.current = null; setDraftId(null);
    replaceBodySnapshot([], null, { replaceDocument: true, serverRevision: 0 }); setEditorHandoff(null); setCardDeck(null); setCardDeckV3(null); setCardDeckV3DetailStatus("idle"); setCardDeckV3SourceSnapshot(null); setVideoEdit(null);
    quickDraftTopicRef.current = null;
    videoEditReconciledRef.current = true; reconciledDraftIdRef.current = null; videoEditBaseRevisionRef.current = null;
    invalidateVideoEditReconcile(); // B-7: 진행 중이던 맞춤 결과를 버린다
    setPublishReconciliations({});
    setPub({ running: false, stopped: false, status: {}, urls: {}, errors: {}, already: {} });
    // m3: 새 초안을 시작하면 TikTok 공개 범위·상업 콘텐츠 공개도 같이 비운다.
    resetTiktokDisclosure();
    setTitles({}); setHashtags({}); setTopicTags({}); setFirstComments({}); setCaptions({});
    // 생성실이 들고 있는 구조 초안과 답한 질문까지 비운다. 여기를 빼먹으면 "버렸다" 고
    // 말해 놓고 화면에는 앞서 만든 후보가 그대로 남는다(2026-09-09 실사용에서 확인).
    setCreatePrimaryKind(null); setAlsoKinds([]);
    setCreateResetToken((value) => value + 1);
    // 버리기 전에 접수된 생성(202)이 있었는지 보고 지운다 — 다음 방문에서 다시 이어서
    // 올라오지 않게. MINOR: 있었다면 "새로 시작합니다"가 무료 취소처럼 읽히면 안 된다.
    const hadPendingGeneration = Boolean(activeWorkspace && (readPendingJob(activeWorkspace.id, "image") || readPendingJob(activeWorkspace.id, "video")));
    if (activeWorkspace) { clearPendingJob(activeWorkspace.id, "image"); clearPendingJob(activeWorkspace.id, "video"); }
    showToast("새로 시작합니다", "success");
    if (hadPendingGeneration) {
      showToast("진행 중이던 이미지·영상 생성은 화면에서만 지워졌습니다. 이미 접수된 건이라면 비용이 났을 수 있습니다.", "error");
    }
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

    // ADR-007: 비용 산정·승인 단계가 여기서 예외를 던지면(네트워크 오류·401 등)
    // try 밖이라 아무도 못 잡아 "눌러도 아무 일이 없다"가 됐다(2026-09-23 회장 지적,
    // 생성실 스모크에서 카드 이미지 이후 상태가 흔들릴 때 이 자리가 조용히 죽었다).
    // 비용 산정부터 생성 호출까지 전부 한 try 안에 넣어 어디서 죽어도 이유를 말한다.
    try {
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
      // 학습 정보를 **통째로** 실어 보낸다. 2026-09-14 이전에는 브랜드 색 한 칸만 실리고
      // 업종·말투·목표·금지어는 고객이 골라 뒀는데도 그림에 한 번도 닿지 않았다.
      // 카드뉴스 본문을 그림 지시문으로 넘기지 않는다. 넘기면 생성기가 그 말을 그림 속
      // 글자로 그려서 쓸 수 없는 이미지가 나온다(2026-09-08 실측).
      await genImage(
        buildImagePrompt(
          pickImageSubject({ imagePrompt: text?.image_prompt, topic: idea, industry: learningInfo.industry }),
          { id: imageStyleId, custom: imageStyleCustom },
          learningInfo,
        ),
        "1:1",
      );
    } catch (e) {
      // genImage 자체는 이미 실패 사유를 화면에 말한다. 여기서 잡는 것은 그 앞뒤
      // (비용 산정·승인 단계)에서 던진 예외다 — 이유를 말하지 않으면 조용한 실패다.
      const msg = extractApiErrorMessage(e, "카드뉴스 이미지를 만들지 못했습니다. 잠시 후 다시 시도해 주세요.");
      setLastError(`이미지: ${msg}`); showToast(msg, "error");
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
    // 2026-09-14 실측 사고. 종전에는 남아 있는 그림을 **어느 주제의 것인지 묻지 않고** 바탕
    // 으로 썼고, 영상이 이미 있으면 사용자는 무엇이 일어났는지 알 길이 없었다. 주제 도장으로
    // 가른다: 도장이 다르면 묻지 않고 새로 만들고(옛것이 발행되면 안 된다), 같으면 한 번
    // 물어 중복 과금을 막는다(근거: lib/studio/work-media.ts decideVideoRequest).
    //
    // ADR-007: 아래 비용 산정·승인·생성 전체를 한 try 로 감싼다. 종전에는 비용 산정
    // (est) 과 승인 호출이 try 밖에 있어, 거기서 예외가 나면 아무도 못 잡고 함수가
    // 조용히 죽었다 — 화면은 "숏폼 영상 만들기" 를 누른 그대로였고 토스트도, 진행
    // 표시도, 오류 문구도 없었다(2026-09-23 회장 지적 "영상이 없으면 만들어서라도
    // 배포해야지"의 직접 원인 중 하나: 실패조차 보이지 않아 재시도할 계기가 없었다).
    try {
      const decision = decideVideoRequest({ idea, img, vid });
      if (decision.action === "confirm" && decision.confirm) {
        const again = await askConfirm({
          title: decision.confirm.title,
          description: decision.confirm.description,
          confirmLabel: "다시 만들기",
          cancelLabel: "지금 영상 그대로 두기",
        });
        if (!again) { showToast("지금 영상을 그대로 둡니다", "success"); return; }
      }
      let source = decision.baseImage === "reuse" ? img : null;
      const needsBaseImage = !source;
      if (decision.notice) showToast(decision.notice, "success");

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

      // 옛 주제 영상은 만들기 시작하는 순간 내린다. 생성이 실패해도 화면에 남아 발행되면
      // 안 된다. 승인 **뒤**에 내리는 이유는, 비용 승인 창에서 취소한 사용자에게서까지
      // 되돌릴 수 없이 영상을 뺏지 않기 위해서다(2026-09-14 Codex 교차리뷰 P1).
      // 취소하고 그대로 두더라도 발행 문에서 다시 막힌다(stalePublishBlock).
      if (decision.notice) setVid(null);
      generationAbort.current = new AbortController();
      if (needsBaseImage) {
        setBusy("영상 바탕 그림 만드는 중");
        source = await genImage(
          buildImagePrompt(
            pickImageSubject({ imagePrompt: text?.image_prompt, topic: idea, industry: learningInfo.industry }),
            { id: imageStyleId, custom: imageStyleCustom },
            learningInfo,
          ),
          "9:16",
        );
        if (!source) return; // 실패 사유는 genImage 가 이미 화면에 말했다
      }
      setBusy("숏폼 영상 만드는 중");
      // 방금 만든 그림은 /api/higgsfield/image가 filename을 직접 준다. 승인함·달력에서 가져온
      // 작업물은 filename이 없고 배달 주소만 있으니 거기서 파일 이름을 꺼낸다.
      // 여기서 `img` 로 한 번 더 떨어지면 방금 가른 것이 무의미해진다. 바탕은 source 뿐이다.
      const baseFilename = source?.filename || videoFilename(source?.file || source?.url || "");
      if (!baseFilename) {
        // 잠깐 뜨는 알림만으로는 옛 영상이 화면에 남아 있는 것을 사용자가 알 수 없다.
        // 사라지지 않는 자리에도 남긴다(ADR-007).
        const msg = "영상의 바탕이 될 그림을 찾지 못했습니다. 생성실에서 그림을 다시 만들어 주세요.";
        setLastError(`영상: ${msg}`);
        showToast(msg, "error");
        return;
      }
      await genVideo({ filename: baseFilename, image: source });
    } catch (e) {
      // genImage/genVideo 는 각자 실패 사유를 이미 화면에 말한다. 여기서 잡는 것은
      // 그 앞뒤(주제 재확인·비용 산정·승인) 단계에서 던진 예외다.
      const msg = extractApiErrorMessage(e, "영상을 만들지 못했습니다. 잠시 후 다시 시도해 주세요.");
      setLastError(`영상: ${msg}`); showToast(msg, "error");
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
    // 방금 다시 그린 카드는 아직 상태에 반영되기 전이다. 상태를 기다리면 옛 그림이 저장된다.
    persistedImg: ImgResult | null = img,
    // 방금 자막을 구운 영상도 같은 이유로 인자로 받는다. 상태를 기다리면 자막 없는 옛
    // 파일이 저장되고, 발행실은 저장된 것을 올린다.
    persistedVid: VidResult | null = vid,
    // 방금 연산한 덱도 같은 이유로 인자로 받는다(§5 F4 자동저장, 800ms 디바운스).
    // (2026-09-22 코드리뷰 5차 항목1) 기본값을 없애 필수 인자로 만들었다. state를 대신
    // 넣는 기본값이 있으면 호출부가 자기 도메인만 저장할 뜻이어도 남의 도메인 state가
    // 검증 없이 같이 실린다(4차 A·B가 그 결함이었다). 기본값을 없애면 컴파일러가 모든
    // 호출부를 짚어 강제로 명시하게 한다 — 다음에 같은 결함이 또 나는 것을 막는다.
    persistedCardDeck: CardDeck | null,
    persistedVideoEdit: VideoEdit | null,
    // 자유 배치 덱은 기존 cardDeck/videoEdit 위치 계약 뒤에 붙인다. 기본값도 state가 아닌
    // null이라, 기존 도메인 한정 저장이 새 도메인을 암묵적으로 함께 보내지 않는다.
    persistedCardDeckV3: CardDeckV3 | null = null,
    bodyConflictRetryPlacement: "tail" | "head" = "tail",
    // 채널별 발행 진행 상태(완료·실패·링크)를 초안에 함께 남겨 새로고침·다른 기기에서도
    // 어느 채널이 이미 올라갔는지 복원한다. 발행 직후 호출은 setPub 반영 전 값을 넘긴다.
    persistedProgress: PublishProgress = pub,
    cardDeckV3Options: {
      clear?: boolean;
      sourceSnapshot?: CardDeckV3SourceSnapshot | null;
      cardTextPositions?: CardTextPosition[];
      templateState?: CardTemplateState | null;
      editKind?: EditContentKind;
      editFormat?: ContentEditFormat;
    } = {},
  ) {
    const saveTenantId = activeWorkspace?.id ?? null;
    const saveDocumentGeneration = editDocumentGenerationRef.current;
    const invocationBodySnapshot = bodySnapshotRef.current;
    // 저장 큐가 실행되기 전에 다른 초안으로 이동해도, 이 요청의 v3 덱에 새 문서의 템플릿
    // 상태가 섞이지 않도록 호출 시점의 짝을 고정한다.
    const invocationCardTemplateState = cardTemplateState;
    // PR87 재리뷰 r2 MAJOR 1: 모든 저장을 한 큐에서 직렬 실행한다. 네트워크 응답 순서가
    // 뒤집혀도 먼저 시작한 요청이 나중 요청 뒤에 서버를 덮을 수 없다. 각 실행은 호출
    // 시점의 인자에서 글 본문만 예외로 두고, 반드시 유일한 최신값 출처를 읽는다.
    const queuedSave = draftSaveQueueRef.current.catch(() => undefined).then(async () => {
      const sameDocumentAtStart = editDocumentGenerationRef.current === saveDocumentGeneration
        && activeWorkspaceIdRef.current === saveTenantId;
      let currentDraftId = persistedDraftId ?? (sameDocumentAtStart ? draftIdRef.current : null);
      let savedDraftId: string | undefined;
      let includeSourceSnapshot = Object.prototype.hasOwnProperty.call(cardDeckV3Options, "sourceSnapshot");
      const synchronizedCardDeckV3 = cardDeckV3ForSave(persistedCardDeck, persistedCardDeckV3);
      const cardTemplateStatePatch = cardTemplateStatePatchForSave(
        synchronizedCardDeckV3,
        invocationCardTemplateState,
        cardDeckV3Options,
      );

      for (;;) {
        const sameDocument = editDocumentGenerationRef.current === saveDocumentGeneration
          && activeWorkspaceIdRef.current === saveTenantId;
        // 작업 공간·초안을 바꾼 뒤에는 새 문서의 최신값을 옛 저장에 섞지 않는다. 전환 전
        // 호출이 소유한 스냅샷을 한 번만 저장하고 현재 화면 state도 건드리지 않는다.
        const bodySnapshot = sameDocument
          ? bodySnapshotRef.current
          : invocationBodySnapshot;
        // B-7 두 번째 방어선(6차 재리뷰 BLOCKER, 보안): 자동저장 타이머가 들고 온 영상이
        // 현재 작업 공간 소유가 아니면 이 저장에서 영상 편집만 제외한다.
        const videoEditTenantMismatch = persistedVideoEdit !== null
          && videoEditTenantRef.current !== null
          && videoEditTenantRef.current !== saveTenantId;
        const safeVideoEdit = videoEditTenantMismatch ? null : persistedVideoEdit;
        let r: { id?: string; bodyRevision?: number; videoEditServerRevision?: number | null } | null;
        try {
          r = await apiPost<{ id?: string; bodyRevision?: number; videoEditServerRevision?: number | null }>("/api/studio/drafts", {
            tenant_id: saveTenantId,
            id: currentDraftId,
            idea,
            text: bodySnapshot.text,
            bodyBaseRevision: currentDraftId ? bodySnapshot.serverRevision : undefined,
            img: persistedImg,
            vid: persistedVid,
            includes,
            status,
            publishReconciliations: reconciliations,
            publishProgress: persistedProgress,
            titles,
            hashtags,
            topicTags,
            firstComments,
            captions,
            selectedAccounts,
            editLines: bodySnapshot.lines,
            cardTextPositions: cardDeckV3Options.cardTextPositions ?? cardTextPositions,
            // 자기 도메인만 저장하는 호출도 반대 도메인을 명시적으로 null로 보낸다. route.ts는
            // clear 플래그가 없는 null을 "기존 값 보존"으로 다룬다.
            cardDeck: persistedCardDeck,
            cardDeckV3: synchronizedCardDeckV3,
            clearCardDeckV3: cardDeckV3Options.clear || undefined,
            ...(includeSourceSnapshot
              ? { cardDeckV3SourceSnapshot: cardDeckV3Options.sourceSnapshot }
              : {}),
            ...cardTemplateStatePatch,
            videoEdit: safeVideoEdit,
            videoEditBaseRevision: safeVideoEdit ? videoEditBaseRevisionRef.current : undefined,
            editKind: cardDeckV3Options.editKind ?? editKind,
            editFormat: cardDeckV3Options.editFormat ?? editFormat,
            reviewQueueId,
            publishedAt: status === "published" ? new Date().toISOString() : undefined,
          });
        } catch (error) {
          const payload = error instanceof ApiResponseError
            ? error.payload as { code?: string; latestBody?: { text?: TextVariants | null; editLines?: string[]; cardDeckV3?: CardDeckV3 | null; bodyRevision?: number } }
            : undefined;
          const latest = payload?.latestBody;
          const stillSameDocument = editDocumentGenerationRef.current === saveDocumentGeneration
            && activeWorkspaceIdRef.current === saveTenantId
            && draftIdRef.current === currentDraftId;
          if (payload?.code === "BODY_STALE_REVISION"
            && stillSameDocument
            && latest
            && Array.isArray(latest.editLines)
            && Number.isSafeInteger(latest.bodyRevision)) {
            const local = bodySnapshotRef.current;
            const latestLines = [...latest.editLines];
            const latestText = latest.text ?? null;
            const latestServerRevision = latest.bodyRevision as number;
            setBodyRevisionConflict((current) => ({
              latest: {
                lines: latestLines,
                text: latestText,
                cardDeckV3: latest.cardDeckV3 ?? null,
                serverRevision: latestServerRevision,
              },
              // 최초 409에서 실패 직전 사용자 입력을 한 번만 보관한다. 사용자가 최신본을
              // 확인한 뒤 대기 중이던 저장이 다시 409를 받아도 현재 편집기(서버 본문)를
              // local로 재캡처하면 복구할 원문이 사라진다. 해결할 때까지 이 슬롯은 불변이다.
              local: current?.local ?? {
                lines: [...local.lines],
                text: local.text,
                // 이 요청이 실제로 보낸 덱을 보관한다. React state는 연속 편집 직후 한 렌더
                // 늦을 수 있어 그것을 읽으면 409 재적용에서 마지막 조작 한 번이 사라진다.
                cardDeckV3: persistedCardDeckV3 ?? cardDeckV3,
              },
              // 후속 409가 더 새 서버판을 알렸으므로, 직전에 최신본을 보고 있었더라도
              // 이제 화면의 본문은 최신이 아니다. 사용자가 새 최신본을 다시 불러오게 한다.
              viewingLatest: false,
            }));
            // 저장 큐에 카드·영상 의도가 연달아 들어와 둘 다 같은 본문 충돌을 만나도
            // 마지막 한 건으로 덮지 않는다. 최신 기준판을 받은 뒤 원래 순서대로 모두
            // 재시도해야 각 도메인의 자동저장 변경이 남는다.
            const retryIntent = {
              retry: () => save(
                status,
                reconciliations,
                currentDraftId,
                persistedImg,
                persistedVid,
                persistedCardDeck,
                safeVideoEdit,
                persistedCardDeckV3,
                "head",
                persistedProgress,
                cardDeckV3Options,
              ),
              retryWithoutVideo: () => save(
                status,
                reconciliations,
                currentDraftId,
                persistedImg,
                persistedVid,
                persistedCardDeck,
                null,
                persistedCardDeckV3,
                "head",
                persistedProgress,
                cardDeckV3Options,
              ),
            };
            // 원본 저장 충돌은 직렬 큐 도착 순서대로 tail에 쌓는다. 재적용 중 같은
            // intent가 또 충돌하면 원래 자리인 head로 돌아가야 한다. tail로 보내면
            // [옛 A, 최신 B]가 [B, A]로 역전돼 A가 마지막에 덮을 수 있다.
            if (bodyConflictRetryPlacement === "head") bodyConflictRetryRef.current.unshift(retryIntent);
            else bodyConflictRetryRef.current.push(retryIntent);
            // 공통 save는 발행실에서도 호출된다. 복구 UI가 있는 편집실로 데려가지 않으면
            // 사용자는 일반 저장 실패만 보고 최신본/재적용 행동을 찾을 수 없다.
            if (activeRoom !== "edit") changeRoom("edit");
          }
          throw error;
        }
        savedDraftId = r?.id ?? savedDraftId;
        currentDraftId = r?.id ?? currentDraftId;
        if (includeSourceSnapshot) {
          includeSourceSnapshot = false;
          if (cardDeckV3Options.sourceSnapshot !== null
            && cardDeckV3PendingSourceSnapshotRef.current === cardDeckV3Options.sourceSnapshot) {
            cardDeckV3PendingSourceSnapshotRef.current = null;
          }
        }

        // B-2(4차 재리뷰 BLOCKER): 첫 저장으로 받은 id는 state보다 ref에 먼저 반영해
        // 같은 직렬 큐의 다음 저장이 중복 초안을 만들지 않게 한다.
        const stillSameDocument = editDocumentGenerationRef.current === saveDocumentGeneration
          && activeWorkspaceIdRef.current === saveTenantId;
        if (r?.id && stillSameDocument) {
          if (safeVideoEdit) {
            reconciledDraftIdRef.current = r.id;
            videoEditReconciledRef.current = true;
          }
          draftIdRef.current = r.id;
          setDraftId(r.id);
        }
        if (stillSameDocument && Number.isSafeInteger(r?.bodyRevision)) {
          const serverRevision = r!.bodyRevision as number;
          bodySnapshotRef.current = { ...bodySnapshotRef.current, serverRevision };
          setBodyServerRevision(serverRevision);
        }
        if (safeVideoEdit && stillSameDocument && r && Object.prototype.hasOwnProperty.call(r, "videoEditServerRevision")) {
          videoEditBaseRevisionRef.current = r.videoEditServerRevision ?? null;
        }
        if (!stillSameDocument) break;
        // 요청을 기다리는 동안 글이 바뀌었으면 같은 저장 계약으로 최신 세대를 한 번 더
        // 보낸다. 따라서 오래된 응답은 잠깐 도착할 수 있어도 최종 서버값이 될 수 없다.
        if (bodySnapshot.generation === bodySnapshotRef.current.generation) break;
      }

      mutateHist();
      return savedDraftId;
    });
    draftSaveQueueRef.current = queuedSave.then(() => undefined, () => undefined);
    return queuedSave;
  }
  function loadLatestBodyAfterConflict() {
    if (!bodyRevisionConflict) return;
    const { latest } = bodyRevisionConflict;
    replaceBodySnapshot(latest.lines, latest.text, { serverRevision: latest.serverRevision });
    setCardDeckV3(latest.cardDeckV3);
    setBodyRevisionConflict((current) => current ? { ...current, viewingLatest: true } : current);
  }
  async function reapplyLocalBodyAfterConflict() {
    if (!bodyRevisionConflict || bodyConflictResolving) return;
    const { local, latest } = bodyRevisionConflict;
    replaceBodySnapshot(local.lines, local.text, { serverRevision: latest.serverRevision });
    setCardDeckV3(local.cardDeckV3);
    // 재저장이 끝나기 전에는 충돌 상태와 보관본을 유지한다. 여기서 먼저 지우면 느린
    // 네트워크 동안 workbench의 inert가 풀려, 사용자가 보관본 위에 제3의 편집을 섞거나
    // 실패 뒤 복구 단추 자체를 잃을 수 있다.
    setBodyRevisionConflict((current) => current ? { ...current, viewingLatest: false } : current);
    setBodyConflictResolving(true);
    try {
      // 스냅샷으로 한 번만 복사하지 않는다. 첫 충돌 UI가 열린 뒤에도 앞서 직렬 큐에
      // 들어간 다른 저장이 늦게 409를 받아 새 의도를 추가할 수 있다. shift→await를
      // 반복하면 현재 재시도보다 앞에 있던 원본 저장이 모두 끝난 뒤, 그 과정에서 새로
      // 들어온 의도까지 같은 잠금 안에서 끝까지 drain한다.
      for (;;) {
        const pending = bodyConflictRetryRef.current.shift();
        if (!pending) break;
        try {
          await pending.retry();
        } catch (error) {
          const code = error instanceof ApiResponseError
            ? (error.payload as { code?: string } | undefined)?.code
            : undefined;
          if (code === "BODY_STALE_REVISION") {
            // save()가 새 latestBody와 현재 의도를 큐 머리에 다시 넣었다. 기존 대기 의도도
            // ref에 그대로 있으므로 충돌 UI를 유지한 채 사용자의 다음 선택을 기다린다.
            return;
          }
          if (code === "VIDEO_EDIT_STALE_REVISION") {
            // 서버는 본문 CAS를 먼저 검사한다. 둘 다 stale이면 본문 재적용에서 뒤늦게
            // 영상 충돌이 드러나므로, 원래 영상 자동저장 catch와 같은 복구 UI를 연다.
            // 본문 재시도에서는 영상을 빼 이 충돌이 본문 복구까지 영구히 막지 않게 한다.
            bodyConflictRetryRef.current.unshift({ retry: pending.retryWithoutVideo, retryWithoutVideo: pending.retryWithoutVideo });
            setVideoEditConflict(true);
            setVideoEditAutosaveError("다른 곳에서 더 최신으로 저장된 영상 편집이 있습니다. 최신 값을 다시 불러온 뒤 다시 시도해 주세요.");
            return;
          }
          bodyConflictRetryRef.current.unshift(pending);
          showToast(extractApiErrorMessage(error, "내 변경을 다시 저장하지 못했습니다. 잠시 후 다시 시도해 주세요."), "error");
          return;
        }
      }
      setBodyRevisionConflict(null);
      bodyConflictRetryRef.current = [];
    } finally {
      setBodyConflictResolving(false);
    }
  }
  async function saveDraftWithNotice() {
    // F5(2026-09-22 코드리뷰 3차): 자동저장 경로(onCardDeckChange)만 pruneEmptyBubbles·
    // emptyBubbleSlideNumber를 거치고 이 수동 "임시 저장" 경로는 빠져 있었다. 빈 말풍선
    // 상태에서 누르면 서버가 400을 내고 이유 없는 토스트만 떴다. 자동저장과 같은 검사를
    // 그대로 적용한다.
    // B(4차): "세 경로를 같게 맞췄다"는 3차 커밋 메시지는 거짓이었다 — 영상 자동저장
    // (onVideoEditChange)이 pruning 없이 원본 cardDeck을 실어 보내는 네 번째 경로였다.
    // 지금 이 파일 안에서 pruneEmptyBubbles를 실제로 부르는 자리는: onCardDeckChange,
    // 이 함수, recompositeCards, moveToPublish 넷이다(grep으로 재확인 가능).
    let prunedCardDeck: CardDeck | null = null;
    if (cardDeck) {
      const pruned = pruneEmptyBubbles(cardDeck);
      const emptySlide = emptyBubbleSlideNumber(pruned);
      if (emptySlide !== null) {
        showToast(`${emptySlide}번 장에 말풍선이 비어 있어 저장하지 못했습니다. 내용을 채운 뒤 다시 눌러 주세요.`, "error");
        return;
      }
      prunedCardDeck = pruned;
      // MINOR(4차): 서버엔 pruned를 보내면서 화면 state는 원본 그대로라 다음 자동저장이
      // 다시 원본을 기준으로 돌았다. state도 맞춘다.
      setCardDeck(pruned);
    }
    try {
      // 수동 "임시 저장"은 카드덱·영상 자동저장과 달리 도메인 한정 저장이 아니라 전체
      // 스냅샷 저장이다 — 카드덱만 pruned로 검사·교체하고(위에서 이미 함) videoEdit는
      // 현재 state를 그대로 싣는다(이전 기본값 동작과 동일, 이번엔 명시적으로만 적었다).
      const savedDraftId = await save("draft", undefined, undefined, undefined, undefined, prunedCardDeck, videoEdit, cardDeckV3);
      if (!savedDraftId) {
        showToast("초안을 저장하지 못했습니다", "error");
        return;
      }
      showToast("임시 저장했습니다", "success");
    } catch (error) {
      showToast(extractApiErrorMessage(error, "초안을 저장하지 못했습니다"), "error");
    }
  }
  /**
   * 편집실에서 고친 글자와 자리와 비율로 카드를 **다시 그려** 저장한다.
   *
   * 2026-09-14 실측: 편집실에서 글자를 고치고 비율을 1:1 로 바꿔도 발행실에는 옛 그림이
   * 그대로 있었다. 편집실 미리보기는 그림 위에 글자를 얹어 보여 줄 뿐 합성이 없었기
   * 때문이다. 나가는 그림을 생성실과 같은 렌더러(renderTextCard)로 다시 그려 그 불일치를
   * 없앤다(설계 §2.2).
   *
   * 못 그리면 이유를 밝히고 발행실로 넘어가지 않는다(막는다) — 안 막으면 그림 없는
   * 초안이 발행실에 그대로 뜬다. MINOR(2026-09-22 코드리뷰 4차): 이 주석이 실제 구현보다
   * 낙관적으로 쓰여 있었다(이전엔 "막지 않고 밝힌다"였는데 실제로는 return null로 막는다).
   *
   * 2026-09-22 PR4 배선: `cardDeck.template === "chat_bubble"` 이면 옛 9칸 글자 자리(lines·
   * positions) 경로가 아니라 말풍선 덱을 그대로 `card-templates/chat-bubble.ts` 렌더러로
   * 9장 그린다(설계 §5 F2·F4). `cardDeck` 이 없거나 `template==="plain"` 이면 기존 글자
   * 카드 3장 경로는 한 글자도 안 바뀐다(회귀 0, 기존 테스트 그대로 통과).
   */
  async function recompositeCards(lines: string[]): Promise<ImgResult | null> {
    if (editKind !== "card") return null;
    // v3 카드는 서버 내보내기가 실제 요소 좌표와 배경 사진을 렌더한다. 여기서 옛 plain
    // 글자 카드 렌더러를 먼저 돌리면 생성 사진과 드래그 좌표를 잃은 임시 PNG가 발행실에
    // 남는다. 현재 미디어는 내보내기 완료 전까지 보존하고, 고정된 산출물 주소는 enqueue
    // 응답으로 교체한다.
    if (cardDeckV3) return img;
    if (img?.textEmbedded === true && img.textSourceRecoverable === false) {
      const preservedCardCount = img.imageUrls?.length ?? (img.url || img.file ? 1 : 0);
      showToast(`이전 카드 ${preservedCardCount}장의 장별 원본 정보가 없어 다시 그리지 않고 기존 이미지를 유지합니다.`, "success");
      return img;
    }
    if (cardDeck && cardDeck.template === "chat_bubble") {
      // F5(2026-09-22 코드리뷰 3차)·D(4차): 발행 경로도 자동저장·수동저장과 같은 검사를
      // 거친다. D 수정: 검사는 pruned로 하고 렌더는 원본으로 하면 검사를 통과한 뒤에도
      // prune이 걷어냈어야 할 빈 말풍선이 그대로 PNG에 찍힌다 — 검사와 렌더가 같은
      // pruned 값을 봐야 한다. state도 pruned로 맞춰(setCardDeck) 이후 자동저장과 갈리지
      // 않게 한다.
      const pruned = pruneEmptyBubbles(cardDeck);
      const emptySlide = emptyBubbleSlideNumber(pruned);
      if (emptySlide !== null) {
        showToast(`${emptySlide}번 장에 말풍선이 비어 있어 카드를 다시 그리지 못했습니다. 내용을 채운 뒤 다시 시도해 주세요.`, "error");
        return null;
      }
      setCardDeck(pruned);
      try {
        const urls = await renderAndUploadCardDeck(
          { lines: [], ratio: cardRatioFrom(cardAspectRatio), template: "chat_bubble", deck: pruned },
          { upload: browserCardUploader(authHeaders()) },
        );
        const next: ImgResult = { url: urls[0], file: urls[0], imageUrls: urls, topicKey: mediaTopicKey(idea) };
        setImg(next);
        return next;
      } catch (error) {
        // G(2026-09-22 코드리뷰 4차): 사진 로딩 실패(서명 URL 만료 등)면 "다시 시도"만으로는
        // 안 풀린다 — 만료된 URL은 다시 시도해도 계속 만료돼 있다. 빠져나갈 길을 문구에
        // 담는다(ADR-007 §3). 자동으로 사진을 빼는 것까지는 이번에 안 하지만("확인 없이
        // 사용자 데이터를 지우지 않는다"), 무엇을 하면 되는지는 말한다.
        const message = extractApiErrorMessage(error, "카드뉴스 9장을 다시 그리지 못했습니다.");
        const isPhotoFailure = /사진/.test(message);
        showToast(
          isPhotoFailure
            ? `${message} 편집실에서 그 장의 사진을 빼거나 새 사진으로 바꾼 뒤 다시 시도해 주세요.`
            : `${message} 다시 시도해 주세요.`,
          "error",
        );
        return null;
      }
    }
    const emptyCardNumber = firstEmptyCardNumber(lines);
    if (emptyCardNumber !== null) {
      showToast(`${emptyCardNumber}번 카드가 비어 있어 발행실로 이동하지 않았습니다. 내용을 채운 뒤 다시 시도해 주세요.`, "error");
      return null;
    }
    if (!lines.some((line) => line.trim())) return null;
    try {
      const next = await renderAndUploadEmbeddedTextCard({
        // 빈 줄을 여기서 먼저 걷어내면 글자 자리 목록과 장 번호가 한 칸씩 어긋난다.
        // 걷어내기는 카드 한 벌을 만드는 쪽이 원래 번호를 아는 채로 한다.
        lines,
        ratio: cardRatioFrom(cardAspectRatio),
        theme: themeFromPalette(learningInfo.palette),
        positions: cardTextPositions,
      }, { upload: browserCardUploader(authHeaders()) }, mediaTopicKey(idea));
      setImg(next);
      return next;
    } catch (error) {
      showToast(extractApiErrorMessage(error, "고친 글자를 카드 그림에 다시 그리지 못해 발행실로 이동하지 않았습니다. 다시 시도해주세요."), "error");
      return null;
    }
  }
  /**
   * 편집실의 장면 대사와 자막 크기를 **나가는 영상 파일에 굽는다**.
   *
   * 2026-09-14 실측: 발행 대기 중이던 영상을 내려받아 프레임을 떠 보니 자막이 한 자도
   * 없었다. 편집실에는 자막 크기를 고르는 자리가 있는데 결과물에는 자막이 아예 없다.
   * 소리 없는 숏폼에서 자막은 내용 전달의 전부다.
   *
   * 카드가 `recompositeCards` 로 푼 것과 같은 자리, 같은 성질의 문제다. 화면에서 고친
   * 것이 나가는 파일에 없으면 고치는 기능은 없는 것과 같다. 다만 카드는 브라우저가 다시
   * 그리고 영상은 서버가 굽는다(ffmpeg).
   *
   * **못 구우면 넘어가지 않는다.** 카드가 다시 그리기에 실패하면 발행실로 안 보내는 것과
   * 같은 판단이다(교차 리뷰 2026-09-14 HIGH 지적). 굽기에 실패했는데 그냥 통과시키면 자막
   * 없는 파일이 그대로 발행된다. 그것은 이 작업이 고치려는 바로 그 상태이고, 사용자는
   * 자막을 넣었다고 믿은 채로 무자막 영상을 내보내게 된다. 조용한 통과가 가장 나쁘다.
   *
   * "해당 없음"(영상 편집이 아니거나 올릴 영상이 아직 없음)과 "실패"는 다르다. 해당 없으면
   * 길을 막지 않는다.
   */
  type SubtitleBurnOutcome =
    | { kind: "skipped" }
    | { kind: "done"; vid: VidResult; videoEdit: VideoEdit | null }
    | { kind: "failed" };
  async function burnVideoSubtitles(lines: string[], queueDraftId: string): Promise<SubtitleBurnOutcome> {
    if (editKind !== "video") return { kind: "skipped" };
    if (!activeWorkspace) return { kind: "skipped" };
    const currentResultFilename = videoResultFilename(vid);
    if (!currentResultFilename) return { kind: "skipped" };
    // 글자를 이미 구운 결과를 다시 입력으로 쓰면 기존 글자 위에 새 글자가 겹친다. 파일명과
    // URL이 함께 보존된 글자 없는 계보만 입력으로 허용하고, 없으면 사용자에게 복구 사유를
    // 밝힌 뒤 중단한다. 특히 기존 introOutro.deliverUrl은 첫 굽기 뒤 구운 결과로 바뀌므로
    // compositeDeliverUrl 대용으로 쓰면 안 된다.
    const source = resolveUnbakedVideoSource({
      currentFilename: currentResultFilename,
      currentUrl: vid?.url || vid?.file || "",
      lineage: {
        subtitlesBaked: vid?.subtitlesBaked,
        state: vid?.subtitleLineageState
          ?? (vid?.subtitlesBaked === true ? "baked" : vid?.subtitlesBaked === false ? "unbaked" : "unknown"),
        editSource: vid?.editSource,
      },
      introOutro: videoEdit?.introOutro ?? null,
    });
    if (!source.ok) {
      showToast("자막 없는 원본 영상을 찾지 못해 다시 굽지 않았습니다. 생성실에서 영상을 다시 만들거나 원본을 복원해 주세요.", "error");
      return { kind: "failed" };
    }
    const { filename, url: sourceUrl } = source;
    const renderVideoEdit = videoEdit
      ? alignVideoEditToRenderSource(videoEdit, videoEdit.introOutro, currentResultFilename)
      : null;
    const spoken = lines.filter((line) => line.trim());
    const editNeedsFile = Boolean(videoEdit && (
      videoEdit.subtitles.some((line) => line.cut || line.text.trim().length > 0)
      || videoEdit.overlays.some((item) => item.text.trim().length > 0)
      || videoEdit.comments.some((item) => item.author.trim().length > 0 && item.text.trim().length > 0)
    ));
    if (!spoken.length && !editNeedsFile) return { kind: "skipped" };
    const subtitleSize = editFormat.kind === "video" ? editFormat.subtitleSize : "보통";
    try {
      const latest = await fetcher<{ current_source_revision: number; current_source_hash: string }>(`/api/studio/drafts/${queueDraftId}/exports/latest?kind=video&tenant_id=${encodeURIComponent(activeWorkspace.id)}`);
      const enqueueResponse = await fetch(`/api/studio/drafts/${queueDraftId}/exports`, {
        method: "POST",
        headers: { "Content-Type": "application/json", "Idempotency-Key": crypto.randomUUID(), ...authHeaders() },
        body: JSON.stringify({
          kind: "video",
          expected_source_revision: latest.current_source_revision,
          expected_source_hash: latest.current_source_hash,
          item_keys: null,
          tenant_id: activeWorkspace.id,
        }),
      });
      const queued = await enqueueResponse.json() as { export_id?: string; status_url?: string; error?: string };
      if (!enqueueResponse.ok || !queued.export_id || !queued.status_url) {
        showToast(queued.error || "영상 내보내기 대기열에 넣지 못했습니다.", "error");
        return { kind: "failed" };
      }
      let artifactUrl = "";
      let artifactFilename = "";
      for (let attempt = 0; attempt < 240; attempt += 1) {
        const status = await fetcher<{ status: string; items: Array<{ status: string; artifact_url?: string; artifact_filename?: string; error_code?: string }> }>(`${queued.status_url}?tenant_id=${encodeURIComponent(activeWorkspace.id)}`);
        const item = status.items[0];
        if (item?.status === "succeeded" && item.artifact_url && item.artifact_filename) {
          artifactUrl = item.artifact_url;
          artifactFilename = item.artifact_filename;
          break;
        }
        if (status.status === "failed" || item?.status === "failed") {
          showToast(`영상 내보내기에 실패했습니다${item?.error_code ? ` (${item.error_code})` : ""}. 편집 내용은 보존했습니다.`, "error");
          return { kind: "failed" };
        }
        await wakeableSleep(1000);
      }
      if (!artifactUrl) {
        showToast("영상 내보내기는 대기열에서 계속 진행 중입니다. 잠시 뒤 다시 시도해 주세요.", "error");
        return { kind: "failed" };
      }
      const resultFilename = artifactFilename;
      const next: VidResult = {
        ...(vid as VidResult),
        filename: resultFilename,
        url: artifactUrl,
        file: artifactUrl,
        subtitlesBaked: true,
        subtitleLineageState: "baked",
        editSource: { filename, url: sourceUrl },
      };
      let nextVideoEdit = videoEdit;
      if (nextVideoEdit?.introOutro && resultFilename && !isIntroOutroStale(nextVideoEdit.introOutro, currentResultFilename)) {
        nextVideoEdit = setIntroOutroApplied(nextVideoEdit, {
          ...nextVideoEdit.introOutro,
          compositeFilename: nextVideoEdit.introOutro.compositeFilename || nextVideoEdit.introOutro.resultFilename,
          resultFilename,
          renderedCutRanges: cutRanges(nextVideoEdit),
          deliverUrl: artifactUrl,
        });
        setVideoEdit(nextVideoEdit);
        videoEditRef.current = nextVideoEdit;
      }
      setVid(next);
      return { kind: "done", vid: next, videoEdit: nextVideoEdit };
    } catch (error) {
      showToast(extractApiErrorMessage(error, "자막을 영상에 넣지 못해 발행실로 이동하지 않았습니다. 다시 시도해주세요."), "error");
      return { kind: "failed" };
    }
  }
  async function moveToPublish() {
    if (rejectWhileCardDeckV3DetailPending()) return;
    if (cardDeckV3 && !CARD_DECK_V3_RENDER_ENABLED) {
      showToast(CARD_DECK_V3_PUBLISH_BLOCK_MESSAGE, "error");
      return;
    }
    const linesToPersist = editLines.length ? editLines : [text?.shorts?.hook || "", text?.shorts?.body || "", text?.shorts?.cta || ""].filter(Boolean);
    if (!linesToPersist.some((line) => line.trim())) {
      showToast("발행실로 넘길 편집 내용이 없습니다", "error");
      return;
    }
    // 2026-09-14 Codex 교차리뷰 P1. 여기서 안 막으면 옛 주제 영상에 새 주제 자막을 구워
    // 저장까지 하게 된다. 그 파일은 화면상 멀쩡해 보이므로 그대로 발행된다.
    const staleForEdit = stalePublishBlock(vid, idea, "영상") ?? stalePublishBlock(img, idea, "이미지");
    if (staleForEdit) { showToast(staleForEdit, "error"); setLastError(staleForEdit); return; }
    setMoveToPublishBusy(true);
    try {
      const redrawn = await recompositeCards(linesToPersist);
      if (editKind === "card" && !cardDeckV3 && !redrawn) return;
      let subtitled: SubtitleBurnOutcome = { kind: "skipped" };
      if (editKind === "video") {
        // 영상 내보내기 대기열은 현재 source revision/hash를 기준으로 작업을 만든다.
        // 따라서 영상만 대기열 등록 전에 최신 편집 상태를 저장한다. 텍스트·카드는
        // 아래 공통 최종 저장만 수행해야 본문 revision이 사용자 저장 1회당 1번 오른다.
        if (!bodySnapshotRef.current.lines.length) replaceEditLines(linesToPersist);
        const queueDraftId = await save(
          "draft", publishReconciliations, draftId, redrawn ?? img, vid,
          cardDeck ? pruneEmptyBubbles(cardDeck) : null, videoEdit, cardDeckV3,
        );
        if (!queueDraftId) throw new Error("편집 내용을 저장하지 못했습니다");
        subtitled = await burnVideoSubtitles(linesToPersist, queueDraftId);
      }
      // 자막을 못 구웠으면 넘어가지 않는다. 넘어가면 무자막 파일이 그대로 발행된다.
      if (subtitled.kind === "failed") return;
      // 생성 결과에서 곧장 발행실로 이동해 editLines가 아직 비어 있어도, 저장보다 먼저
      // 파생 본문을 유일한 최신값 경로에 올린다. save에 별도 본문 인자를 다시 만들면
      // 자동저장과 같은 경합이 재발하므로 정본 자체를 승격시킨 뒤 같은 경로를 쓴다.
      if (!bodySnapshotRef.current.lines.length) replaceEditLines(linesToPersist);
      // D(2026-09-22 코드리뷰 4차): recompositeCards가 내부에서 pruned 덱으로 렌더·
      // setCardDeck 했지만, 그 setState는 비동기라 여기 클로저의 `cardDeck`은 아직 옛
      // 값일 수 있다(리액트 배치). 발행 직전 저장은 그 클로저 값에 기대지 않고 여기서
      // 다시 한번 명시적으로 prune해 렌더된 것과 저장되는 것을 같게 만든다.
      const savedDraftId = await save(
        "draft", publishReconciliations, draftId,
        redrawn ?? img,
        subtitled.kind === "done" ? subtitled.vid : vid,
        cardDeck ? pruneEmptyBubbles(cardDeck) : null,
        // 발행실로 넘어가기 직전 전체 스냅샷 저장이다(도메인 한정 자동저장이 아니다) —
        // 현재 videoEdit state를 그대로 싣는다(이전 기본값 동작과 동일, 이번엔 명시).
        subtitled.kind === "done" ? subtitled.videoEdit : videoEdit,
        cardDeckV3,
      );
      if (!savedDraftId) throw new Error("편집 내용을 저장하지 못했습니다");
      const exportKind: ExportPanelKind | null = exportKindForDraftState(editKind, { cardDeckV3, videoEdit });
      if (!exportKind) {
        changeRoom("publish");
        showToast("편집 내용을 저장하고 발행실로 이동했습니다", "success");
        return;
      }
      setExportPanel({ draftId: savedDraftId, kind: exportKind });
      showToast("편집 내용을 저장했습니다. 최신 파일을 내보내면 발행실로 갈 수 있습니다.", "success");
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
      if (!text) return deckFallbackBody;
      return [text.shorts?.hook, text.shorts?.body, text.shorts?.cta].filter(Boolean).join("\n") || text.threads || "";
    }
    if (!text) return deckFallbackBody;
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

  function publishGuard(platform: PreviewPlatform): {
    disabledReason?: string;
    createHref?: string;
    createActionLabel?: string;
  } {
    if (isVideo(platform) && !(vid?.file || vid?.url)) {
      return {
        disabledReason: "발행할 영상이 아직 없습니다.",
        createHref: "/studio?room=create&kind=video",
        createActionLabel: "생성실에서 영상 만들기",
      };
    }
    if (platform === "instagram" && publishDeck.length === 0) {
      return {
        disabledReason: "발행할 카드뉴스가 아직 없습니다.",
        createHref: "/studio?room=create&kind=card",
        createActionLabel: "생성실에서 카드 만들기",
      };
    }
    // 2026-10-03 독립 리뷰 m2: creator-info 조회 자체가 404/502로 실패하면 고를 칸이
    // 없다. 그런데도 "공개 범위를 먼저 선택해주세요"만 뜨면 막다른 길이다 — 재연결
    // 안내로 먼저 갈라야 한다.
    if (platform === "tiktok" && tiktokCreatorFailed) {
      return {
        disabledReason: "TikTok 계정 정보를 확인하지 못했습니다. 계정을 다시 연결해주세요.",
        createHref: channelHref("tiktok"),
        createActionLabel: "TikTok 다시 연결하기",
      };
    }
    // 2026-10-03 운영 사고: TikTok은 공개 범위(privacy_level)를 사람이 직접 고르지
    // 않으면 서버가 400으로 거부한다(route.ts:727-729). 화면에 그 값을 고르는 자리가
    // 없었으니 매번 실패했다. 아래 TikTok 패널에서 값을 고르기 전까지는 "지금 발행"을
    // 막고, 왜 막혔는지를 이 disabledReason으로 그 자리에서 말한다.
    if (platform === "tiktok" && !tiktokPrivacy) {
      return { disabledReason: "TikTok 공개 범위를 먼저 선택해주세요." };
    }
    // 2026-10-03 독립 리뷰 m3: 상업 콘텐츠 공개를 켰는데 어느 쪽도 안 고르면 TikTok이
    // 요구하는 공개 내용이 비어버린다(tiktok-disclosure.ts).
    if (platform === "tiktok" && tiktokDisclosureError) {
      return { disabledReason: tiktokDisclosureError };
    }
    const blocking = validatePlatformPublish(platform, platformPublishInput(platform)).blocking[0];
    if (blocking) return { disabledReason: blocking.message };
    return {};
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
      const result = await apiPost<{
        repaired?: Array<{ platform: string; publicationId: string; firstCommentStatus?: string }>;
        failed?: Array<{ platform: string; error: string }>;
      }>("/api/publish/reconcile", {
        tenant_id: activeWorkspace?.id,
        reconciliations: Object.values(publishReconciliations),
      });
      const repairedPlatforms = new Set((result?.repaired ?? []).map((item) => item.platform));
      const remaining = Object.fromEntries(
        Object.entries(publishReconciliations).filter(([platform]) => !repairedPlatforms.has(platform)),
      );
      if (repairedPlatforms.size === 0) throw new Error("발행 원장 복구 실패");
      const nextStatus = { ...pub.status };
      for (const repaired of result?.repaired ?? []) {
        nextStatus[repaired.platform] = repaired.firstCommentStatus === "failed" || repaired.firstCommentStatus === "uncertain"
          ? "failed" : "done";
      }
      // Legacy drafts have no per-platform result. They cannot be promoted to
      // published merely because the last persistence receipt was repaired.
      const incomplete = Object.keys(remaining).length > 0 || Object.keys(pub.status).length === 0
        || Object.values(nextStatus).some((status) => status !== "done");
      const nextProgress = { ...pub, running: false, status: nextStatus };
      // 발행 원장 기록만 남기는 호출이다 — 카드덱·영상 내용은 이 호출의 관심사가
      // 아니므로 null,null로 키 자체를 빼서 서버에 이미 저장된 값을 건드리지 않는다.
      const savedDraftId = await save(incomplete ? "partial" : "published", remaining, draftId, undefined, undefined, null, null, null, "tail", nextProgress);
      if (!savedDraftId) throw new Error("기록 저장 실패");
      setPublishReconciliations(remaining);
      setReconciliationError(null);
      setPub(nextProgress);
      const repairedLabels = [...repairedPlatforms].map((platform) => LABEL[platform as keyof typeof LABEL]).join(", ");
      if (incomplete) {
        showToast(`${repairedLabels} 내부 기록을 복구했습니다. 실패하거나 결과 미확인인 채널은 아직 완료되지 않았습니다.`, "error");
      } else {
        showToast(`${repairedLabels} 발행 원장과 사용량 기록을 복구했습니다. 이제 다음 작업을 이어가실 수 있습니다.`, "success");
      }
    } catch (error) {
      const failed = error instanceof ApiResponseError
        ? (error.payload as { failed?: Array<{ error?: string }> } | null)?.failed : undefined;
      const reason = failed?.map((item) => item.error).filter(Boolean).join(" ");
      const message = reason || "기록을 정리하지 못했습니다. 외부 게시 상태를 확인한 뒤 다시 시도해 주세요.";
      setReconciliationError(message);
      showToast(message, "error");
    }
  }

  // 2026-10-02 컨트롤러 감사 반려: video/publish가 202 + jobId(status:"processing")를 줘도
  // 화면은 그 응답을 몰라 ok:true로 읽고 바로 "완료"로 표시했다 — 거짓-성공이었다. 서버가
  // 실제로 끝날 때까지 이 폴링이 기다린다. 15분 상한을 넘기면 "실패"가 아니라 "결과 확인
  // 중"으로 남겨 재발행(중복 게시)을 유도하지 않는다.
  async function awaitAsyncVideoPublish(
    tenantId: string, filename: string, platform: string, jobId: string, signal?: AbortSignal,
  ): Promise<{ ok: boolean; url?: string; error?: string; unresolved?: boolean }> {
    savePendingVideoPublishJob(tenantId, filename, platform, jobId);
    const outcome = await pollJobUntilDone<{ ok?: boolean; url?: string; error?: string; status?: string; processing?: boolean; publishId?: string }>(
      `/api/video/publish/job/${encodeURIComponent(jobId)}?tenant_id=${encodeURIComponent(tenantId)}`,
      // MAJOR-2: 고정 헤더 대신 매 요청마다 새로 만든다 — 15분 폴링 중 토큰이 돌면
      // 고정 헤더는 그 뒤로 계속 401을 받는다.
      // MINOR(2026-10-02 재재검토): signal을 넘기면 effect cleanup(언마운트·작업공간
      // 전환)이 cancelled=true만 찍는 게 아니라 이 폴링 자체를 즉시 멈춘다 — 안 그러면
      // 사용자가 떠난 뒤에도 15분까지 네트워크 폴링이 백그라운드에 남는다.
      { headers: () => authHeaders(), timeoutMs: 15 * 60 * 1000, signal },
    );
    if (outcome.timedOut) {
      // pending 기록을 지우지 않는다 — 다음 방문(탭 재표시/새로고침)에서 복구 효과가 이어서
      // 확인한다. 상한을 넘겼다고 포기한 게 아니라 "이 폴링만" 멈춘 것이다.
      return { ok: false, unresolved: true, error: "결과 확인 중입니다. 게시물 목록에서 확인해 주세요." };
    }
    if (outcome.aborted) {
      // MINOR: effect cleanup으로 멈춘 것 — pending 기록을 지우지 않는다(다음 방문에서
      // 이어서 확인한다). 호출부가 보통 이 결과를 버리지만, 혹시 쓰더라도 "실패"로
      // 잘못 읽히면 안 된다.
      return { ok: false, unresolved: true, error: "확인이 중단됐습니다." };
    }
    clearPendingVideoPublishJob(tenantId, filename, platform);
    // MINOR(2026-10-02 재재검토): 작업을 못 찾은 것도 "실패로 확정됐다"가 아니라 "결과를
    // 모른다"다 — 외부 게시가 실제로 일어났는데 기록만 사라졌을 가능성을 배제할 수 없다.
    // failed로 두면 재발행 버튼이 뜬다.
    if (outcome.notFound) return { ok: false, unresolved: true, error: "발행 작업을 찾지 못했습니다. 게시물 목록에서 확인해 주세요." };
    const data = outcome.data;
    // MAJOR-3 구멍(2026-10-02 재재검토): TikTok 접수(init) 자체가 8초를 넘기면, 바깥
    // job(jobId) 경로가 먼저 타임아웃 승리해 그 작업의 "완료된 결과"가 TikTok 자체의
    // 비동기 봉투({ok:true, processing:true, publishId})가 된다. 이 함수는 그걸 그냥
    // `ok:true`로 읽어 url 없는 "완료"를 내버렸다 — 실제로는 TikTok이 아직도 처리
    // 중이다. publishId가 보이면 TikTok 전용 폴러로 넘긴다.
    if (data?.processing && data.publishId) {
      return awaitAsyncTikTokPublish(data.publishId, signal);
    }
    if (!data?.ok) {
      // BLOCK-1(2026-10-02 독립 리뷰): "외부에는 올라갔는데 우리 기록만 못 남겼다" 또는
      // "외부 결과를 확인하지 못했다"는 신호를 평범한 "실패"로 읽으면 안 된다 — 실패로
      // 보이면 재발행 버튼이 다시 눌려 같은 영상이 두 번 올라간다. unresolved로 돌려
      // 호출부가 "unknown"(결과 확인 중)으로 남기게 한다(재발행 대상에서 제외).
      // M-A 사이드이펙트(2026-10-02 재재검토 회귀): isUnresolvedPublishPayload가 이제
      // ①(확정된 외부 게시)을 일부러 제외하므로, 이 data 경로(에러로 던져지지 않고 job
      // 결과로 들어온 경우 — pendingReconciliations 배너가 없는 경로)에서는 ①도 여기서
      // 같이 "unresolved"로 막아야 한다 — 안 그러면 ①이 평범한 failed로 떨어져 재발행
      // 버튼이 뜬다(바로 이 BLOCK-1이 막으려던 것).
      if (isUnresolvedPublishPayload(data) || isExternalPublishConfirmedPayload(data)) {
        return {
          ok: false, unresolved: true,
          error: data?.error || "외부 게시 여부를 확인하지 못했습니다. 게시물 목록에서 확인해 주세요.",
        };
      }
      return { ok: false, error: data?.error || "영상 발행에 실패했습니다" };
    }
    return { ok: true, url: data.url };
  }

  // MAJOR-3(2026-10-02 독립 리뷰): TikTok은 video/publish와 다른, 자체 비동기 계약을 쓴다
  // — 202 + {ok:true, processing:true, publishId}(jobId도 status:"processing"도 없음).
  // 위 awaitAsyncVideoPublish의 `vr?.jobId && vr.status==="processing"` 분기가 이 모양을
  // 못 잡아 `vr?.ok && !vr.partial`로 떨어져 "완료"(링크 없는 성공)로 잘못 표시됐다.
  // 기존에 이미 있던 조회 엔드포인트(/api/tiktok/publish-status, videos/page.tsx의
  // rememberTikTokPending과 같은 정본)를 그대로 쓴다 — 그 라우트도 진행 중이면
  // status:"processing"을 주므로 job-poll.ts와 계약이 맞는다.
  async function awaitAsyncTikTokPublish(
    publishId: string, signal?: AbortSignal,
  ): Promise<{ ok: boolean; url?: string; error?: string; unresolved?: boolean }> {
    let latestPollError = "";
    const outcome = await pollJobUntilDone<{ ok?: boolean; status?: string; url?: string; error?: string }>(
      `/api/tiktok/publish-status?publish_id=${encodeURIComponent(publishId)}`,
      {
        headers: () => authHeaders(),
        timeoutMs: 15 * 60 * 1000,
        signal,
        onStatus: (_status, data) => {
          if (!data.error || data.error === latestPollError) return;
          latestPollError = data.error;
          showToast(data.error, "error");
        },
      },
    );
    if (outcome.timedOut) {
      return {
        ok: false,
        unresolved: true,
        error: latestPollError || "결과 확인 중입니다. 게시물 목록에서 확인해 주세요.",
      };
    }
    if (outcome.aborted) return { ok: false, unresolved: true, error: "확인이 중단됐습니다." };
    if (outcome.notFound) return { ok: false, unresolved: true, error: "발행 작업을 찾지 못했습니다. 게시물 목록에서 확인해 주세요." };
    const data = outcome.data;
    if (data?.status === "failed" || data?.ok === false) {
      if (isUnresolvedPublishPayload(data) || isExternalPublishConfirmedPayload(data)) {
        return { ok: false, unresolved: true, error: data?.error || "외부 게시 여부를 확인하지 못했습니다." };
      }
      return { ok: false, error: data?.error || "TikTok 발행에 실패했습니다" };
    }
    if (data?.status === "published" && data.ok === true) {
      return { ok: true, url: data.url };
    }
    // 409/503 JSON 오류처럼 status가 없는 응답도 발행 성공이 아니다. 실패로 확정해
    // 재발행을 열지 않고 unknown으로 남겨 다음 조회에서 DB 확정 상태를 회수한다.
    return {
      ok: false,
      unresolved: true,
      error: data?.error || "외부 게시 여부를 확인하지 못했습니다. 게시물 목록에서 확인해 주세요.",
    };
  }

  // 같은 감사 반려: /api/publish도 150초대 폴링(인스타 캐러셀·Threads 상태확인)이 예산(8초)을
  // 넘으면 202 + {processing:true, draftId, platform}을 준다. 결과는 새 작업 저장소가 아니라
  // 기존 GET /api/publish?draft_id=...&platforms=...(buildUnifiedPublishStatus)가 그대로
  // 맡는다(draftId가 작업 id 역할). 그 응답의 종결 신호는 최상위 status가 아니라
  // targets[0].status(queued/processing/published/failed)라서 job-poll의 "최상위 status"
  // 계약과 안 맞는다 — pollJobUntilDone으로 억지로 끼워맞추지 않고, 같은 2.5초 간격·
  // 백그라운드 깨우기(wakeableSleep, job-poll.ts와 같은 정본)로 직접 루프를 돈다.
  async function awaitAsyncSocialPublish(
    tenantId: string, draftId: string, platform: string, signal?: AbortSignal,
  ): Promise<{ ok: boolean; permalink?: string; publishedAt?: string; error?: string; unresolved?: boolean; partial?: boolean }> {
    savePendingSocialPublishJob(tenantId, draftId, platform);
    const start = Date.now();
    const timeoutMs = 15 * 60 * 1000;
    for (;;) {
      // MINOR(2026-10-02 재재검토): effect cleanup이 abort하면 이 루프를 즉시 멈춘다 —
      // 안 그러면 사용자가 떠난 뒤에도 15분까지 백그라운드 폴링이 남는다.
      if (signal?.aborted) return { ok: false, unresolved: true, error: "확인이 중단됐습니다." };
      if (Date.now() - start > timeoutMs) {
        // pending 기록을 지우지 않는다 — 다음 방문에서 복구 효과가 이어서 확인한다.
        return { ok: false, unresolved: true, error: "결과 확인 중입니다. 게시물 목록에서 확인해 주세요." };
      }
      let res: Response;
      try {
        res = await fetch(
          `/api/publish?draft_id=${encodeURIComponent(draftId)}&platforms=${encodeURIComponent(platform)}&tenant_id=${encodeURIComponent(tenantId)}`,
          { headers: authHeaders(), signal },
        );
      } catch {
        if (signal?.aborted) return { ok: false, unresolved: true, error: "확인이 중단됐습니다." };
        await wakeableSleep(JOB_POLL_INTERVAL_MS, signal);
        continue;
      }
      if (res.status === 404) {
        // MINOR(2026-10-02 재재검토): 못 찾은 것도 "실패 확정"이 아니라 "모른다"다.
        clearPendingSocialPublishJob(tenantId, draftId, platform);
        return { ok: false, unresolved: true, error: "발행 작업을 찾지 못했습니다. 게시물 목록에서 확인해 주세요." };
      }
      const body = await res.json().catch(() => null) as {
        targets?: Array<{
          status: string; permalink: string | null; error: string | null; updatedAt: string | null;
          firstComment?: { status: string | null; error: string | null };
        }>;
      } | null;
      const target = body?.targets?.[0];
      // MAJOR-2: 401(토큰 만료)·503(DB 장애, route.ts GET catch)·그 밖의 비정상 응답은
      // targets 배열이 없으므로 target이 undefined가 되어 이미 여기서 재시도된다 — 토큰이
      // 돌거나 DB가 잠깐 끊긴 걸 "실패"로 단정하지 않는다(authHeaders()도 루프 매번 새로
      // 호출돼 최신 토큰을 쓴다).
      if (!target || target.status === "queued" || target.status === "processing") {
        await wakeableSleep(JOB_POLL_INTERVAL_MS, signal);
        continue;
      }
      clearPendingSocialPublishJob(tenantId, draftId, platform);
      if (target.status !== "published") {
        return { ok: false, error: target.error || "발행에 실패했습니다" };
      }
      // MAJOR-5(2026-10-02 독립 리뷰): 동기 경로는 본문 성공 + 첫 댓글 실패를 partial:true로
      // 구분해 "완전 성공"으로 보여주지 않는다(위 동기 분기의 r.partial 처리와 같다). 느린
      // 경로는 그 결과가 백그라운드 Response에만 있었고 폴링 쪽은 target.status만 봐서
      // 첫 댓글 실패를 삼켰다 — published_posts.first_comment_status는 동기 경로와 똑같이
      // 이미 기록돼 있으므로(백그라운드도 같은 코드를 탄다) 그걸 읽어 복원한다.
      const firstCommentFailed = target.firstComment?.status === "failed" || target.firstComment?.status === "uncertain";
      if (firstCommentFailed) {
        return {
          ok: true, partial: true, permalink: target.permalink ?? undefined, publishedAt: target.updatedAt ?? undefined,
          error: target.firstComment?.error || "본문은 올라갔지만 첫 댓글 발행에 실패했습니다",
        };
      }
      return { ok: true, permalink: target.permalink ?? undefined, publishedAt: target.updatedAt ?? undefined };
    }
  }

  async function publish() {
    if (rejectWhileCardDeckV3DetailPending()) return;
    if (cardDeckV3 && !CARD_DECK_V3_RENDER_ENABLED) {
      showToast(CARD_DECK_V3_PUBLISH_BLOCK_MESSAGE, "error");
      return;
    }
    // 2026-09-05 회장 계정 실측: 발행 단추를 눌렀는데 요청도 안 나가고 알림도 없었다.
    // 여기서 아무 말 없이 돌아섰기 때문이다. 조용한 반환은 고장으로 읽힌다. 이유를 말한다.
    if (!text && !editLines.some((line) => line.trim())) {
      showToast("발행할 본문이 없습니다. 생성실이나 작업물 전체에서 올릴 작업물을 먼저 가져와 주세요.", "error");
      return;
    }
    if (!activeWorkspace) { showToast("워크스페이스를 선택하세요", "error"); return; }
    if (Object.keys(publishReconciliations).length > 0) {
      showToast("외부 게시가 이미 완료된 항목입니다. 재발행하지 말고 내부 기록을 먼저 복구하세요.", "error");
      return;
    }
    // 2026-09-14 Codex 교차리뷰 P0. 생성 단추에만 주제 도장을 걸면 구멍이 남는다. 주제만
    // 고쳐 놓고 생성 없이 바로 발행하면 옛 매체가 그대로 나간다. 나가는 문에도 건다.
    const staleMedia = stalePublishBlock(vid, idea, "영상") ?? stalePublishBlock(img, idea, "이미지");
    if (staleMedia) { showToast(staleMedia, "error"); setLastError(staleMedia); return; }
    // 2026-09-16 실측(j.the.great.investor): X 본문이 280 가중 문자를 넘으면(한 채널) 이
    // 검사가 전체 publishTargets 중 "첫 번째로 걸리는 것"을 찾아 발행 자체를 통째로
    // 멈췄다. Threads·YouTube 등 한도를 넘지 않은 다른 채널까지 아무것도 시작되지
    // 않았고, 사용자는 버튼이 안 눌리는 줄 알았다(회장 "다 진행해 왜 멈춰" 계열 결함).
    // 한도를 넘은 채널만 빼고 나머지는 그대로 발행한다. 전부 넘었을 때만 아무것도
    // 못 올린다.
    const { blocked: blockedEntries } = partitionBlockedPublishTargets(
      publishTargets,
      (platform) => validatePlatformPublish(platform, platformPublishInput(platform)).blocking[0],
    );
    const blockedPlatforms = new Set(blockedEntries.map((entry) => entry.platform));
    if (blockedEntries.length) {
      const summary = blockedEntries.map((entry) => `${LABEL[entry.platform]}: ${entry.issue.message}`).join(" / ");
      if (blockedEntries.length === publishTargets.length) {
        showToast(`${summary} · 한도 넘는 곳만 줄이기를 눌러 맞춘 뒤 다시 시도하세요`, "error");
        return;
      }
      showToast(`한도를 넘은 곳은 빼고 발행합니다. ${summary}`, "error");
    }
    // 발행 직전 초안 존재를 확인하는 저장이다 — 카드덱·영상은 moveToPublish가 이미
    // 커밋했으므로 여기서는 건드리지 않는다(null,null로 키를 빼 서버 값을 보존한다).
    const draftPersistence = await attemptRequiredDraftPersistence(() => save("draft", undefined, undefined, undefined, undefined, null, null, null));
    if (!draftPersistence.ok) {
      showToast("발행할 초안을 저장하지 못했습니다", "error");
      return;
    }
    const did = draftPersistence.draftId;
    // 2026-09-05 회장 실사용: threads 는 실제로 올라갔는데 instagram 토큰 만료로 실패해
    // 전체가 실패로 보였고, 발행 버튼이 그대로 남아 다시 누르면 이미 올라간 채널까지
    // 재발행 대상이 됐다. 이번 초안에서 이미 성공한 채널은 대상에서 뺀다.
    const alreadyPublished = publishTargets.filter((platform) => pub.status[platform] === "done");
    // "unknown"(15분 상한으로 결과를 못 받은 상태)은 "실패"가 아니므로 재발행 대상에서도
    // 뺀다 — 서버 쪽 draft_id 예약이 중복 게시를 막아 주더라도, 사용자가 다시 누를 때마다
    // 바로 409로 튕기는 것보다는 "게시물 목록에서 확인"으로 유도하는 편이 낫다.
    const unresolved = publishTargets.filter((platform) => pub.status[platform] === "unknown");
    const targets = publishTargets.filter((platform) =>
      pub.status[platform] !== "done" && pub.status[platform] !== "unknown" && !blockedPlatforms.has(platform));
    if (!targets.length && alreadyPublished.length && blockedEntries.length === 0 && unresolved.length === 0) {
      showToast(`${alreadyPublished.map((platform) => LABEL[platform]).join(", ")} 은 이미 발행됐습니다. 다시 올리지 않았습니다.`, "success");
      return;
    }
    if (!targets.length && unresolved.length && blockedEntries.length === 0) {
      showToast(`${unresolved.map((platform) => LABEL[platform]).join(", ")}은 결과 확인 중입니다. 게시물 목록에서 확인해 주세요.`, "error");
      return;
    }
    if (!targets.length && blockedEntries.length === 0) { showToast("연결된 발행 계정이 없습니다. 설정에서 채널을 먼저 연결하세요", "error"); return; }
    const blockedFailure = blockedPublishFailures(blockedEntries, (platform) => LABEL[platform]);
    const status: Record<string, PubStatus> = { ...blockedFailure.status };
    targets.forEach((p) => (status[p] = "wait"));
    const urls: Record<string, string> = {};
    const errors: Record<string, string> = { ...blockedFailure.errors };
    const already: Record<string, string | true> = {};
    alreadyPublished.forEach((platform) => {
      status[platform] = "done";
      if (pub.urls[platform]) urls[platform] = pub.urls[platform];
    });
    unresolved.forEach((platform) => {
      status[platform] = "unknown";
      if (pub.errors[platform]) errors[platform] = pub.errors[platform];
    });
    const errs: string[] = [...blockedFailure.messages];
    const pendingReconciliations: PublishReconciliationMap = {};
    setReconciliationError(null);
    setPub({ running: true, stopped: false, status: { ...status }, urls: {}, errors: {}, already: {} });
    await runWithConcurrency(targets, PUBLISH_CONCURRENCY, async (p) => {
      status[p] = "doing";
      setPub({ running: true, stopped: false, status: { ...status }, urls: { ...urls }, errors: { ...errors }, already: { ...already } });
      let failureReason: string | null = null;
      try {
        // 실 발행: /api/publish (테넌트 채널 토큰). 토큰 없으면 graceful 에러.
        // publish_attempt = 실제 제출 시점(클릭 즉시가 아니라 이 루프 진입 시점). publish_success는
        // API가 ok:true를 반환한 뒤에만 처리한다. 낙관적 발행 금지.
        trackEvent({ name: "publish_attempt", params: { channel: p as AnalyticsChannel } });
        if (VIDEO_ROOM_PLATFORMS.has(p)) {
          // 영상 채널은 서버가 파일을 직접 읽는다. 화면이 들고 있는 배달 주소에서 파일명을 꺼낸다.
          // 인트로/아웃트로가 적용돼 있으면(videoEdit.introOutro) 원본이 아니라 그 합성
          // 결과 파일을 올린다 — 안 그러면 "적용됐다"는 화면과 실제 발행물이 어긋난다
          // (2026-10-02 회장 반려).
          const filename = resolveVideoPublishFilename(videoResultFilename(vid), videoEdit?.introOutro ?? null);
          if (!filename) {
            failureReason = "올릴 영상이 없습니다. 생성실에서 숏폼 영상을 먼저 만들어 주세요.";
            errs.push(`${LABEL[p]}: ${failureReason}`);
          } else {
            const videoPlatform = VIDEO_PUBLISH_NAME[p] || p;
            // 2026-10-02 반려 수정: 서버는 예산(8초)을 넘기면 202 + {status:"processing",
            // jobId}를 준다. 이걸 그대로 ok:true로 읽으면 아직 올라가지도 않은 채널을
            // "완료"로 보여주는 거짓-성공이 된다(세션맥락). jobId가 있으면 실제로 끝날
            // 때까지 기다린다.
            const vr = await apiPost<{ ok?: boolean; partial?: boolean; status?: string; jobId?: string; processing?: boolean; publishId?: string; url?: string; error?: string }>("/api/video/publish", {
              filename,
              platform: videoPlatform,
              title: titles[p] || idea || "",
              description: publishText(p),
              // 저장된 ID가 연결 해제·만료 상태로 바뀌어도 발행 요청에는 절대 싣지 않는다.
              account_id: selectedConnectedAccountId(p),
              draft_id: did,
              queue_post_id: reviewQueueId || undefined,
              // 대문으로 쓸 시점. 지원하는 플랫폼만 실제로 쓴다(lib/video-cover.ts).
              cover_seconds: supportsCoverTimestamp(p) ? (coverSeconds[p] ?? DEFAULT_COVER_SECONDS) : undefined,
              // 2026-10-03 운영 사고: TikTok은 이 네 필드가 없으면 서버가 400으로 거부한다
              // (route.ts:727-736). publishGuard가 privacy_level 미선택이면 이미 이 채널을
              // 발행 대상에서 뺐으니, 여기 도달했다는 것은 tiktokPrivacy가 채워져 있다는
              // 뜻이다. videos/page.tsx와 같은 필드·같은 기본값 정책을 그대로 싣는다.
              ...(p === "tiktok" ? {
                privacy_level: tiktokPrivacy,
                disable_comment: tiktokDisableComment,
                disable_duet: tiktokDisableDuet,
                disable_stitch: tiktokDisableStitch,
                is_ai_generated: tiktokAiGenerated,
                // 2026-10-03 독립 리뷰 m3: TikTok Content Sharing Guidelines의 상업
                // 콘텐츠 공개("Your brand"/"Branded content"). ⚠️ /api/video/publish
                // route.ts는 아직 이 세 필드를 받지 않는다(서버가 실제로 TikTok
                // Content Posting API에 실어 보내는 배선은 별도 작업) — 화면 계약을
                // videos 페이지와 맞추는 이번 범위에서는 값을 함께 보내 두되, 서버가
                // 소비하지 않는다는 사실을 숨기지 않는다.
                disclosure_enabled: tiktokDisclosureEnabled,
                brand_organic_toggle: tiktokBrandOrganic,
                brand_content_toggle: tiktokBrandContent,
              } : {}),
            }, { signal: AbortSignal.timeout(VIDEO_PUBLISH_REQUEST_TIMEOUT_MS) });
            if (vr?.jobId && vr.status === "processing") {
              // "doing"(발행 중) 그대로 유지하며 기다린다 — "완료"로 앞서가지 않는다.
              setPub({ running: true, stopped: false, status: { ...status }, urls: { ...urls }, errors: { ...errors }, already: { ...already } });
              const resolved = await awaitAsyncVideoPublish(activeWorkspace.id, filename, videoPlatform, vr.jobId);
              if (resolved.unresolved) {
                status[p] = "unknown";
                errors[p] = resolved.error || "결과 확인 중입니다. 게시물 목록에서 확인해 주세요.";
              } else if (resolved.ok) {
                urls[p] = resolved.url || POST_URL[p] || "#";
                trackEvent({ name: "publish_success", params: { channel: p as AnalyticsChannel } });
              } else {
                failureReason = resolved.error || "영상 발행에 실패했습니다";
                errs.push(`${LABEL[p]}: ${failureReason}`);
              }
            } else if (vr?.processing && vr.publishId) {
              // MAJOR-3: TikTok의 자체 비동기 계약(ok:true, processing:true, publishId) —
              // jobId 패턴과 다르다. 이걸 놓치면 "완료"(링크 없는 성공)로 잘못 표시된다.
              setPub({ running: true, stopped: false, status: { ...status }, urls: { ...urls }, errors: { ...errors }, already: { ...already } });
              const resolved = await awaitAsyncTikTokPublish(vr.publishId);
              if (resolved.unresolved) {
                status[p] = "unknown";
                errors[p] = resolved.error || "결과 확인 중입니다. 게시물 목록에서 확인해 주세요.";
              } else if (resolved.ok) {
                urls[p] = resolved.url || POST_URL[p] || "#";
                trackEvent({ name: "publish_success", params: { channel: p as AnalyticsChannel } });
              } else {
                failureReason = resolved.error || "TikTok 발행에 실패했습니다";
                errs.push(`${LABEL[p]}: ${failureReason}`);
              }
            } else if (vr?.ok && !vr.partial) {
              urls[p] = vr.url || POST_URL[p] || "#";
              trackEvent({ name: "publish_success", params: { channel: p as AnalyticsChannel } });
              // m3: TikTok 발행이 성공하면 공개 범위·상업 콘텐츠 공개를 비운다. 다음
              // 영상에 지난 선택이 조용히 그대로 넘어가 엉뚱한 공개 범위로 올라가는
              // 사고를 막는다 — 매번 다시 확인해 고른다.
              if (p === "tiktok") resetTiktokDisclosure();
            } else {
              failureReason = vr?.error || "영상 발행에 실패했습니다";
              errs.push(`${LABEL[p]}: ${failureReason}`);
            }
          }
          status[p] = failureReason ? "failed" : status[p] === "unknown" ? "unknown" : "done";
          if (failureReason) errors[p] = failureReason;
          setPub({ running: true, stopped: false, status: { ...status }, urls: { ...urls }, errors: { ...errors }, already: { ...already } });
          return;
        }
        const r = await apiPost<{ ok?: boolean; partial?: boolean; permalink?: string; error?: string; alreadyPublished?: boolean; publishedAt?: string; firstComment?: { ok?: boolean; error?: string } }>("/api/publish", {
          tenant_id: activeWorkspace.id, platform: p,
          text: publishText(p),
          // 채널이 몇 장까지 받는지는 채널 규격 한 자리에서 정한다(channel-image-capacity.ts).
          // 종전에는 인스타그램만 여러 장이었고 나머지는 대표 한 장으로 조용히 잘렸다.
          image_url: planChannelImages(p, publishDeck).images[0] ?? img?.url,
          image_urls: planChannelImages(p, publishDeck).images.length > 1
            ? planChannelImages(p, publishDeck).images
            : undefined,
          draft_id: did,
          queue_post_id: reviewQueueId || undefined,
          publish_fields: platformPublishInput(p),
          account_id: selectedConnectedAccountId(p),
          first_comment: capabilityFor(p).supported && firstComments[p]?.trim() ? firstComments[p].trim() : undefined,
          edit_format: editFormat,
        }, { signal: AbortSignal.timeout(PUBLISH_REQUEST_TIMEOUT_MS) });
        // 2026-10-02 반려 수정: Instagram carousel/Threads 상태 폴링이 150초대라 서버
        // 예산(8초)을 넘으면 202 + {processing:true, draftId, platform}을 준다. 이것도
        // ok:true로 읽으면 아직 올라가지 않은 글을 "완료"로 보여주는 거짓-성공이 된다.
        const processingDraftId = (r as { processing?: boolean; draftId?: string } | undefined)?.processing
          ? (r as { draftId?: string }).draftId
          : undefined;
        if (processingDraftId) {
          setPub({ running: true, stopped: false, status: { ...status }, urls: { ...urls }, errors: { ...errors }, already: { ...already } });
          const resolved = await awaitAsyncSocialPublish(activeWorkspace.id, processingDraftId, p);
          if (resolved.unresolved) {
            status[p] = "unknown";
            errors[p] = resolved.error || "결과 확인 중입니다. 게시물 목록에서 확인해 주세요.";
          } else if (resolved.ok && resolved.partial) {
            // MAJOR-5: 본문은 올라갔지만 첫 댓글은 실패 — 동기 분기(r.partial)와 같은
            // 취급으로 완전 성공 집계·표시를 하지 않는다.
            failureReason = resolved.error || "본문은 올라갔지만 첫 댓글 발행에 실패했습니다";
            errs.push(`${LABEL[p]}: ${failureReason}`);
          } else if (resolved.ok) {
            urls[p] = resolved.permalink || POST_URL[p] || "#";
            trackEvent({ name: "publish_success", params: { channel: p as AnalyticsChannel } });
          } else {
            failureReason = resolved.error || "실패";
            errs.push(`${LABEL[p]}: ${failureReason}`);
          }
        }
        // 2026-09-16 실측: 서버가 dedupe 로 옛 글을 돌려준 것을 방금 새로 올라간 것과
        // 구분한다. 이미 있던 것이면 "새로 올렸다" 이벤트를 다시 세지 않는다.
        else if (r?.ok && !r.partial) { urls[p] = r.permalink || POST_URL[p] || "#"; if (!r.alreadyPublished) trackEvent({ name: "publish_success", params: { channel: p as AnalyticsChannel } }); else already[p] = r.publishedAt || true; }
        else {
          failureReason = r?.partial
            ? r.firstComment?.error || "본문은 올라갔지만 첫 댓글 발행에 실패했습니다"
            : r?.error || "실패";
          errs.push(`${LABEL[p]}: ${failureReason}`);
        }
      } catch (e) {
        if (isExternalPublishPersistenceError(e)) {
          // ① 외부 게시는 확정됐다 — persistence.reconciliation이 보장된 모양이라
          // 안전하게 접근한다(M-A 전에는 이 분기가 ②·③도 함께 잡아 TypeError가 났다).
          const reconciliation = e.payload.persistence.reconciliation;
          pendingReconciliations[p] = reconciliation;
          if (e.payload.permalink) urls[p] = e.payload.permalink;
          failureReason = "외부 게시 완료·내부 기록 복구 필요 (재발행 금지)";
          errs.push(`${LABEL[p]}: ${failureReason}`);
        } else if (isUnresolvedPublishError(e)) {
          // M-A(2026-10-02 독립 리뷰): ②·③(외부 결과를 모른다, 예: 409
          // PUBLISH_STATE_UNCERTAIN) — "실패"로 단정해 재발행을 유도하지 않는다.
          // errs에 넣지 않는다(다른 "unknown" 분기들과 같은 관례 — 끝 토스트가 "실패"로
          // 뭉뚱그리지 않게).
          status[p] = "unknown";
          errors[p] = e instanceof ApiResponseError
            ? ((e.payload as { error?: string } | null)?.error || "외부 게시 여부를 확인하지 못했습니다. 게시물 목록에서 확인해 주세요.")
            : "외부 게시 여부를 확인하지 못했습니다. 게시물 목록에서 확인해 주세요.";
        } else {
          failureReason = e instanceof Error ? e.message : "오류";
          errs.push(`${LABEL[p]}: ${failureReason}`);
        }
      }
      status[p] = failureReason ? "failed" : status[p] === "unknown" ? "unknown" : "done";
      if (failureReason) errors[p] = failureReason;
      setPub({
        running: true,
        stopped: false,
        status: { ...status },
        urls: { ...urls },
        errors: { ...errors },
        already: { ...already },
      });
    });
    const completedProgress: PublishProgress = {
      running: false,
      stopped: false,
      status: { ...status },
      urls: { ...urls },
      errors: { ...errors },
      already: { ...already },
    };
    setPub(completedProgress);
    if (Object.keys(pendingReconciliations).length > 0) {
      setPublishReconciliations(pendingReconciliations);
      try {
        // 발행 결과 기록만 남긴다 — 카드덱·영상은 이 호출의 관심사가 아니다.
        await save("partial", pendingReconciliations, did, undefined, undefined, null, null, null, "tail", completedProgress);
      } catch {
        // The same storage incident can prevent the draft write too. The state was
        // already copied to localStorage-bound React state, so keep the no-republish
        // guard active and tell the operator that server-side recovery metadata is absent.
        errs.push("복구 정보 서버 저장 실패·현재 브라우저에만 보존됨");
      }
    } else {
      try {
        // 발행 결과 기록만 남긴다 — 카드덱·영상은 이 호출의 관심사가 아니다.
        const savedDraftId = await save(errs.length ? "partial" : "published", {}, did, undefined, undefined, null, null, null, "tail", completedProgress);
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
  // 새로고침·탭 재방문 뒤에도 진행 중이던 발행(비디오/소셜 비동기 경로)을 잃지 않는다
  // (2026-10-02 컨트롤러 감사 반려 — publish-job-store.ts가 적어 둔 jobId/draftId가 이
  // 작업공간+초안에 남아 있으면 자동으로 이어서 확인한다).
  useEffect(() => {
    if (!activeWorkspace || !draftId) return;
    const workspaceId = activeWorkspace.id;
    const currentDraftId = draftId;
    const videoFilenameNow = videoResultFilename(vid);
    let cancelled = false;
    // MINOR(2026-10-02 재재검토): cancelled 플래그만으로는 "이 effect의 setPub을 더는
    // 안 쓴다"만 멈춘다 — 그 밑에서 돌던 네트워크 폴링(fetch 루프)은 그대로 계속 돈다.
    // 실제 effect cleanup(언마운트·작업공간 전환·draftId 변경)이 일어나면 이 signal로
    // 폴링 자체를 즉시 끊는다.
    const controller = new AbortController();
    void (async () => {
      for (const p of publishTargets) {
        if (cancelled) break;
        if (VIDEO_ROOM_PLATFORMS.has(p)) {
          if (!videoFilenameNow) continue;
          const videoPlatform = VIDEO_PUBLISH_NAME[p] || p;
          const pending = readPendingVideoPublishJob(workspaceId, videoFilenameNow, videoPlatform);
          if (!pending) continue;
          setPub((current) => ({ ...current, running: true, status: { ...current.status, [p]: "doing" } }));
          const resolved = await awaitAsyncVideoPublish(workspaceId, videoFilenameNow, videoPlatform, pending.jobId, controller.signal);
          if (cancelled || activeWorkspaceIdRef.current !== workspaceId) continue;
          setPub((current) => {
            const status = { ...current.status };
            const urls = { ...current.urls };
            const errors = { ...current.errors };
            if (resolved.unresolved) { status[p] = "unknown"; errors[p] = resolved.error || "결과 확인 중입니다. 게시물 목록에서 확인해 주세요."; }
            else if (resolved.ok) { status[p] = "done"; urls[p] = resolved.url || POST_URL[p] || "#"; }
            else { status[p] = "failed"; errors[p] = resolved.error || "영상 발행에 실패했습니다"; }
            return { ...current, running: false, status, urls, errors };
          });
        } else {
          const pending = readPendingSocialPublishJob(workspaceId, currentDraftId, p);
          if (!pending) continue;
          setPub((current) => ({ ...current, running: true, status: { ...current.status, [p]: "doing" } }));
          const resolved = await awaitAsyncSocialPublish(workspaceId, currentDraftId, p, controller.signal);
          if (cancelled || activeWorkspaceIdRef.current !== workspaceId) continue;
          setPub((current) => {
            const status = { ...current.status };
            const urls = { ...current.urls };
            const errors = { ...current.errors };
            if (resolved.unresolved) { status[p] = "unknown"; errors[p] = resolved.error || "결과 확인 중입니다. 게시물 목록에서 확인해 주세요."; }
            else if (resolved.ok && resolved.partial) { status[p] = "failed"; errors[p] = resolved.error || "본문은 올라갔지만 첫 댓글 발행에 실패했습니다"; }
            else if (resolved.ok) { status[p] = "done"; urls[p] = resolved.permalink || POST_URL[p] || "#"; }
            else { status[p] = "failed"; errors[p] = resolved.error || "실패"; }
            return { ...current, running: false, status, urls, errors };
          });
        }
      }
    })();
    return () => { cancelled = true; controller.abort(); };
    // publishTargets 자체는 매 렌더 재계산되지만 effect 의존성에 그대로 넣으면 재구독으로
    // 중복 폴링이 된다. 다만 MAJOR-6(2026-10-02 독립 리뷰): workspace·draftId만 의존성으로
    // 두면, 새로고침 직후 계정 목록이 아직 fetch 중일 때 이 effect가 먼저 실행돼
    // publishTargets가 빈 배열이고(usableAccounts가 아직 0개), 그 뒤 계정이 로드돼
    // publishTargets가 채워져도 이 effect는 다시 돌지 않아 복구가 영원히 일어나지 않는다.
    // accountsLoaded가 false→true로 바뀌는 시점(계정 로딩 완료, 작업공간당 한 번)에 한 번
    // 더 돌게 해 그 때는 실제 publishTargets로 복구를 시도한다. videoFilenameNow(vid)도
    // 새로고침 뒤 vid가 비동기로 복원되는 경우를 대비해 넣는다.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeWorkspace?.id, draftId, accountsLoaded, vid?.file, vid?.url]);
  function loadDraft(d: Record<string, unknown>): EditContentKind | null {
    // B1(교차 리뷰 BLOCK): 서버 초안을 불러오는 이 순간 이전에 예약돼 있던 자동 저장
    // 타이머가 있으면(예: 방금 전 영상 탭에서 시딩·조작으로 예약된 저장) 그 타이머가
    // 지금 불러오는 이 초안 위에 낡은 값을 덮어쓴다. 불러오기 전에 반드시 끈다.
    if (cardDeckAutosaveTimer.current) { clearTimeout(cardDeckAutosaveTimer.current); cardDeckAutosaveTimer.current = null; }
    if (videoEditAutosaveTimer.current) { clearTimeout(videoEditAutosaveTimer.current); videoEditAutosaveTimer.current = null; }
    setIdea((d.idea as string) || "");
    setImg(recoverDraftEmbeddedTextCard<ImgResult>(d)); setVid((d.vid as VidResult) || null);
    setIncludes(d.includes ? normalizeIncludes(d.includes as Record<string, boolean>) : includes);
    // MINOR-g 근본원인: 초안을 불러오면 그 초안이 저장했던 체크 상태가 아무 표시 없이
    // 되살아난다. "지금 내가 고른 것"처럼 보이면 안 되므로 복원임을 배지로 남긴다.
    setRestoredSelectionNotice(Boolean(d.includes) && Object.values(d.includes as Record<string, boolean>).some(Boolean));
    const loadedDraftId = d.id as string;
    setDraftId(loadedDraftId);
    const savedReconciliations = normalizePublishReconciliations(d.publishReconciliations ?? d.publishReconciliation);
    setPublishReconciliations(savedReconciliations);
    setReconciliationError(null);
    setPub(normalizePublishProgress(d.publishProgress) ?? { running: false, stopped: false, status: {}, urls: {}, errors: {}, already: {} });
    setEditorHandoff((d.editorHandoff as EditorHandoff) || null);
    setTitles((d.titles as Record<string, string>) || {});
    setHashtags((d.hashtags as Record<string, string>) || {});
    setTopicTags((d.topicTags as Record<string, string>) || {});
    setFirstComments((d.firstComments as Record<string, string>) || {});
    setCaptions((d.captions as Record<string, string>) || {});
    setSelectedAccounts((d.selectedAccounts as Record<string, string>) || {});
    replaceBodySnapshot(
      (d.editLines as string[]) || [],
      (d.text as TextVariants) || null,
      { replaceDocument: true, serverRevision: Number.isSafeInteger(d.bodyRevision) ? d.bodyRevision as number : 0 },
    );
    // 2026-10-01 재리뷰 BLOCK: 이 불러오기가 quickDraftTopicRef 를 안 맞춰, 주제 A로
    // 빠른 초안을 만든 뒤 주제 B의 저장 초안을 불러오면 아래 "주제 변경 시 무효화" 효과가
    // 방금 불러온 본문을 주제가 바뀐 것으로 오판해 지웠다. 불러온 초안의 실제 주제로
    // 기준값을 맞춘다(같은 헬퍼 재사용 — 재창조 금지).
    quickDraftTopicRef.current = resolveRestoredQuickDraftTopic({
      hasText: Boolean(d.text),
      savedTopic: null,
      restoredIdea: String(d.idea || ""),
    });
    setCardTextPositions((d.cardTextPositions as CardTextPosition[]) || []);
    const loadedCardDeck = (d.cardDeck as CardDeck) || null;
    setCardDeck(loadedCardDeck);
    const includesCardDeckV3 = Object.prototype.hasOwnProperty.call(d, "cardDeckV3");
    const hasCardDeckV3 = !usesChatBubbleV2(loadedCardDeck) && (includesCardDeckV3
      ? d.cardDeckV3 != null
      : d.hasCardDeckV3 === true);
    const loadedCardDeckV3 = cardDeckV3ForDraft(loadedCardDeck, includesCardDeckV3 ? d.cardDeckV3 as CardDeckV3 | null : null);
    setCardDeckV3(loadedCardDeckV3);
    setCardTemplateState(loadedCardDeckV3 ? (d.cardTemplateState as CardTemplateState | null) ?? defaultCardTemplateState(loadedCardDeckV3) : null);
    cardDeckV3Ref.current = loadedCardDeckV3;
    cardDeckV3HydratedDraftRef.current = includesCardDeckV3 ? loadedDraftId : null;
    const detailStatus = includesCardDeckV3 ? "ready" : hasCardDeckV3 ? "loading" : "idle";
    setCardDeckV3DetailStatus(detailStatus);
    cardDeckV3DetailStatusRef.current = detailStatus;
    cardDeckV3EditGenerationRef.current = 0;
    cardDeckV3SavePendingGenerationRef.current = null;
    cardDeckV3DirtyRef.current = false;
    setCardDeckV3SourceSnapshot(loadedCardDeckV3 ? (d.cardDeckV3SourceSnapshot as CardDeckV3SourceSnapshot) || null : null);
    setVideoEdit((d.videoEdit as VideoEdit) || null);
    setReviewQueueId((d.reviewQueueId as string) || null);
    const savedFormat = validateContentEditFormat(d.editFormat);
    let loadedEditKind: EditContentKind | null = null;
    if (savedFormat.valid) {
      loadedEditKind = savedFormat.value.kind;
      setEditKind(savedFormat.value.kind);
      setEditFormat(savedFormat.value);
    } else if (d.editKind === "video" || d.editKind === "card" || d.editKind === "audio" || d.editKind === "text") {
      loadedEditKind = d.editKind;
      setEditKind(d.editKind);
      setEditFormat(defaultContentEditFormat(d.editKind));
    }
    showToast(
      Object.keys(savedReconciliations).length > 0
        ? "외부 게시 완료·내부 기록 복구 필요. 재발행 금지"
        : "불러옴. 수정 후 재발행 가능",
      Object.keys(savedReconciliations).length > 0 ? "error" : "success",
    );
    return loadedEditKind;
  }
  async function fetchDraftDetail(draftToLoad: Record<string, unknown>): Promise<Record<string, unknown> | null> {
    const requestedDraftId = typeof draftToLoad.id === "string" ? draftToLoad.id : "";
    const tenantId = activeWorkspaceIdRef.current;
    if (!requestedDraftId || !tenantId) return null;
    try {
      const response = await fetch(`/api/studio/drafts?tenant_id=${encodeURIComponent(tenantId)}&id=${encodeURIComponent(requestedDraftId)}`, { headers: authHeaders() });
      if (!response.ok) return null;
      const body = await response.json().catch(() => null) as { draft?: Record<string, unknown> } | null;
      return body?.draft ?? null;
    } catch {
      return null;
    }
  }
  async function hydrateCardDeckV3Detail(draftToLoad: Record<string, unknown>, notifyFailure = true): Promise<boolean> {
    const requestedDraftId = typeof draftToLoad.id === "string" ? draftToLoad.id : "";
    if (!requestedDraftId) return false;
    const expectsCardDeckV3 = draftToLoad.hasCardDeckV3 === true
      || (Object.prototype.hasOwnProperty.call(draftToLoad, "cardDeckV3") && draftToLoad.cardDeckV3 != null);
    if (expectsCardDeckV3) {
      setCardDeckV3DetailStatus("loading");
      cardDeckV3DetailStatusRef.current = "loading";
    }
    const detail = await fetchDraftDetail(draftToLoad);
    if (!detail) {
      if (expectsCardDeckV3 && draftIdRef.current === requestedDraftId) {
        setCardDeckV3DetailStatus("error");
        cardDeckV3DetailStatusRef.current = "error";
        if (notifyFailure) showToast("작업물은 목록 내용으로 열었습니다. 카드 직접 편집 내용은 최신 상태를 불러오지 못했습니다. 다시 시도해 주세요.", "error");
      }
      return false;
    }
    if (!requestedDraftId
      || draftIdRef.current !== requestedDraftId
      || cardDeckV3DirtyRef.current
      || cardDeckV3SavePendingGenerationRef.current !== null) return false;
    const includesCardDeckV3 = Object.prototype.hasOwnProperty.call(detail, "cardDeckV3");
    if (!includesCardDeckV3) {
      setCardDeckV3DetailStatus("error");
      cardDeckV3DetailStatusRef.current = "error";
      return false;
    }
    const serverDeck = (detail.cardDeckV3 as CardDeckV3 | null | undefined) ?? null;
    setCardDeckV3(serverDeck);
    setCardTemplateState(serverDeck ? (detail.cardTemplateState as CardTemplateState | null | undefined) ?? defaultCardTemplateState(serverDeck) : null);
    cardDeckV3Ref.current = serverDeck;
    setCardDeckV3SourceSnapshot((detail.cardDeckV3SourceSnapshot as CardDeckV3SourceSnapshot | null | undefined) ?? null);
    cardDeckV3HydratedDraftRef.current = requestedDraftId;
    const detailStatus = serverDeck ? "ready" : "idle";
    setCardDeckV3DetailStatus(detailStatus);
    cardDeckV3DetailStatusRef.current = detailStatus;
    return true;
  }
  async function loadDraftDetail(draftToLoad: Record<string, unknown>): Promise<{ kind: EditContentKind | null }> {
    // 목록 응답은 큰 v3 덱만 제외하고 편집에 필요한 나머지 필드를 모두 갖는다. 화면은
    // 목록 값으로 즉시 열고, 자유 배치 덱만 단건 응답으로 나중에 보강한다. 상세 조회가
    // 실패해도 기존 카드·영상 편집 화면 자체를 잃지 않는다.
    const kind = loadDraft(draftToLoad);
    void hydrateCardDeckV3Detail(draftToLoad);
    return { kind };
  }
  function cardDeckV3DetailBlockedReason(status = cardDeckV3DetailStatusRef.current): string | null {
    if (status === "loading") return "저장된 카드 직접 편집 내용을 불러오는 중입니다. 불러온 뒤 편집하거나 발행할 수 있습니다.";
    if (status === "error") return "저장된 카드 직접 편집 내용을 불러오지 못했습니다. 다시 시도해 주세요.";
    return null;
  }
  function rejectWhileCardDeckV3DetailPending(): boolean {
    const reason = cardDeckV3DetailBlockedReason();
    if (!reason) return false;
    showToast(reason, "error");
    return true;
  }
  function retryCardDeckV3Detail() {
    const currentDraftId = draftIdRef.current;
    if (!currentDraftId) return;
    void hydrateCardDeckV3Detail({ id: currentDraftId, hasCardDeckV3: true }, false);
  }
  async function resumeCurrentWork() {
    const current = hist?.currentWork;
    if (!current) return;
    const draft = hist.drafts.find((item) => item.id === current.draftId);
    if (!draft) return;
    const loaded = await loadDraftDetail(draft);
    if (!loaded) return;
    const loadedEditKind = loaded.kind;
    if (current.stage === "performance") {
      window.location.assign("/performance");
      return;
    }
    changeRoom(current.stage, loadedEditKind ?? editKind);
  }
  const commentHandoffLoaded = useRef<string | null>(null);
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const requestedDraftId = params.get("draft_id");
    const sourceCommentId = params.get("comment_id");
    // draft_id는 댓글 인계 전용이 아니다. 발행 복귀, 작업물 목록의 딥링크, 새로고침 뒤
    // 편집실 복원도 같은 주소를 쓴다. 종전에는 comment_id가 함께 있을 때만 읽어서
    // /studio?room=edit&draft_id=...가 빈 편집실로 열렸다.
    // queue_id가 함께 있으면 publishReturnRequest가 큐와 draft의 연결을 검증한다. 이
    // 효과가 먼저 실행되면 불일치 draft가 잠깐 화면에 주입됐다가 뒤늦게 거부된다(M4).
    if (!requestedDraftId || publishReturnRequest || commentHandoffLoaded.current === requestedDraftId || !hist?.drafts) return;
    const requestedDraft = hist.drafts.find((draft) => draft.id === requestedDraftId);
    if (!requestedDraft) return;
    // 목록 우선 열기는 loadDraftDetail 안에서 동기적으로 여러 state를 갱신한다. SWR mock이나
    // 재검증 응답이 매 렌더 새 drafts 배열을 주면 다음 렌더가 이 async 작업의 await 뒤보다
    // 먼저 들어올 수 있다. 완료 뒤에만 표식을 세우면 같은 초안을 다시 주입하는 렌더 루프가
    // 된다. 목록 초안은 이미 확보했으므로 주입 시작 전에 이 draft를 선점한다.
    commentHandoffLoaded.current = requestedDraftId;
    void (async () => {
      const loaded = await loadDraftDetail(requestedDraft);
      if (!loaded) return;
      // 댓글 인계는 편집실로, 발행 복귀는 요청 주소가 정한 방으로 남긴다. room이 없거나
      // create로 들어온 일반 초안 딥링크는 작업물을 바로 다듬을 수 있게 편집실로 연다.
      const requestedRoom = new URLSearchParams(window.location.search).get("room");
      if (sourceCommentId || !requestedRoom || requestedRoom === "create") setActiveRoom("edit");
    })();
  }, [hist?.drafts, publishReturnRequest, setActiveRoom]);
  const publishReturnLoaded = useRef<string | null>(null);
  // 카드뉴스 v2 덱 연산 후 800ms 디바운스 자동저장이 쓰는 타이머(설계 §5 F4, onCardDeckChange
  // 정의는 아래 편집실 렌더 직전). 모든 hook 은 1990행 조건부 early return 앞에서 불러야
  // 렌더마다 순서가 같다.
  const cardDeckAutosaveTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  // R1(2026-09-22 코드리뷰 3차): 타이머 통합(2차)이 CRITICAL을 두 라운드 연달아 냈다
  // (2차: 영상저장 삼킴 · 3차: 실패/언마운트 시 pending 유실). "덜 만들고 되돌린다" —
  // 카드덱·영상 자동저장을 독립 타이머로 되돌린다. 각자 최신 state를 통째로 실어
  // 보내는 구 방식은 다음 자동저장에서 자연 복구되는 성질이 있다(한쪽이 실패해도
  // 다음 변경이 다시 최신 state를 통째로 보낸다). 두 저장이 서로 덮는 문제는 회장이
  // 실제로 밟은 적 없는 가설이었고, 재설계가 만든 유실 경로가 더 비쌌다.
  const videoEditAutosaveTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  // setTimeout 콜백이 클로저로 오래된 draftId 를 붙잡지 않게(2026-09-22 코드리뷰 MINOR 6:
  // 발행실 이동이 타이머보다 먼저 끝나면 뒤늦은 콜백이 draftId=null 로 중복 초안을 만든다).
  const draftIdRef = useRef<string | null>(null);
  draftIdRef.current = draftId;
  // B-7(6차 재리뷰 BLOCKER, 보안): reconcile은 비동기라 await 중에 워크스페이스·초안이
  // 바뀔 수 있다. tenant도 draftIdRef와 같은 패턴으로 매 렌더 최신값을 ref에 담아,
  // await가 끝난 시점에 "그 결과가 지금도 유효한 요청인지" 판정할 수 있게 한다.
  const activeWorkspaceIdRef = useRef<string | null>(null);
  activeWorkspaceIdRef.current = activeWorkspace?.id ?? null;
  // 초안 목록은 카드 자유 배치 JSON을 싣지 않는다. 목록에서 작업물을 고르거나 딥링크를
  // 새로고침한 뒤에는 단건 응답을 읽어야만 v3 덱을 복원할 수 있다. draft/tenant가 바뀐
  // 뒤 늦게 도착한 응답은 다른 작업물에 칠하지 않는다.
  useEffect(() => {
    const requestedDraftId = draftId;
    const requestedTenantId = activeWorkspace?.id ?? null;
    if (!requestedDraftId || !requestedTenantId || usesChatBubbleV2(cardDeck)
      || cardDeckV3HydratedDraftRef.current === requestedDraftId
      || cardDeckV3Ref.current !== null
      || cardDeckV3DirtyRef.current
      || cardDeckV3SavePendingGenerationRef.current !== null) return;
    const controller = new AbortController();
    void (async () => {
      try {
        const response = await fetch(`/api/studio/drafts?tenant_id=${encodeURIComponent(requestedTenantId)}&id=${encodeURIComponent(requestedDraftId)}`, {
          headers: authHeaders(),
          signal: controller.signal,
        });
        if (!response.ok) return;
        const data = await response.json().catch(() => null) as { draft?: { cardDeckV3?: CardDeckV3 | null; cardDeckV3SourceSnapshot?: CardDeckV3SourceSnapshot | null } } | null;
        if (controller.signal.aborted
          || draftIdRef.current !== requestedDraftId
          || activeWorkspaceIdRef.current !== requestedTenantId
          || cardDeckV3HydratedDraftRef.current === requestedDraftId
          || cardDeckV3Ref.current !== null
          || cardDeckV3DirtyRef.current
          || cardDeckV3SavePendingGenerationRef.current !== null) return;
        const serverDeck = data?.draft?.cardDeckV3 ?? null;
        setCardDeckV3(serverDeck);
        cardDeckV3Ref.current = serverDeck;
        setCardDeckV3SourceSnapshot(data?.draft?.cardDeckV3SourceSnapshot ?? null);
        cardDeckV3HydratedDraftRef.current = requestedDraftId;
      } catch {
        // 목록의 기존 편집 데이터는 유지한다. 네트워크 복구 뒤 새로고침하면 단건 조회를
        // 다시 시도하며, 실패를 null 덮어쓰기로 오인하지 않는다.
      }
    })();
    return () => controller.abort();
  }, [activeWorkspace?.id, cardDeck, draftId]);
  // 영상 편집 state의 최신값은 닫힌 클로저 대신 ref로 비교한다. 글 본문은 위의
  // bodySnapshotRef 하나만 소유하므로 영상 전용 pending 복사본을 두지 않는다.
  const videoEditRef = useRef<VideoEdit | null>(null);
  videoEditRef.current = videoEdit;
  /**
   * [보안·데이터 유실](교차 리뷰 재리뷰 BLOCK 1) localStorage의 videoEdit은 잠정치다 —
   * 다른 탭·기기가 서버에 더 최신을 저장했을 수 있다. draftId가 있는 동안은 이 값이
   * false다가, 아래 서버 재동기화 효과가 hist.drafts에서 그 draft를 찾아 서버 값으로
   * 덮은 뒤에야 true가 된다. onVideoEditChange의 자동저장은 이 값이 true일 때만 실제로
   * 나간다 — 그 전에 나가면 서버의 최신 오버레이·댓글·목소리를 잠정치로 덮어쓴다.
   */
  const videoEditReconciledRef = useRef(true);
  const reconciledDraftIdRef = useRef<string | null>(null);
  /**
   * B-7(6차 재리뷰 BLOCKER, 보안): "비동기 맞춤 결과는 발급 세대가 현재 세대와 같을
   * 때만 반영한다"는 단일 원칙. 맞추기 시작마다(reconcileVideoEditFromServer 호출)
   * +1 해서 자기 세대 번호를 갖고, 워크스페이스 전환·새 작업·후보 선택·버리고 새로
   * 시작 네 곳도 이 카운터를 올려 "지금 진행 중인 맞춤은 전부 낡았다"고 선언한다.
   * await 뒤에 이 값이 자기 세대와 다르면(다른 곳이 먼저 올렸으면) 결과를 버린다 —
   * 증상(워크스페이스 하나, 탭 하나)마다 따로 막지 않고 이 카운터 하나로 전부 막는다.
   */
  const videoEditReconcileGenerationRef = useRef(0);
  const videoEditReconcileAbortRef = useRef<AbortController | null>(null);
  /**
   * B-7 두 번째 방어선: 지금 `videoEdit` state가 "어느 테넌트 것인지" 기록한다.
   * reconcile 가드가 대부분 막지만, 자동저장 타이머의 클로저가 전환 직전 순간의
   * persistedVideoEdit을 들고 있다가 전환 뒤에 실행되는 경로까지 막으려면 save() 쪽에도
   * 독립된 출처 확인이 필요하다(단일 원칙을 한 곳만 믿지 않고 저장 직전에도 다시 잰다).
   */
  const videoEditTenantRef = useRef<string | null>(null);
  /** 3차 재리뷰 BLOCKER(a): 서버가 소유한 videoEdit 판 번호. 저장 요청에 실어 보내
   * compare-and-set 기준으로 쓴다(save() 참조). */
  const videoEditBaseRevisionRef = useRef<number | null>(null);
  const [videoEditReconciling, setVideoEditReconciling] = useState(false);
  const [videoEditConflict, setVideoEditConflict] = useState(false);
  /**
   * 서버 값으로 videoEdit을 다시 맞춘다. draftId가 목록(LIMIT 50) 안에 있으면 그 값을
   * 쓰고, 없으면(BLOCKER b) 단건 조회(GET ?id=)로 직접 읽는다. MAJOR2: 맞추는 동안
   * 대기 중이던 자동저장 타이머를 반드시 먼저 끈다 — 안 그러면 재동기화 도중 그 타이머가
   * 잠정값을 서버로 내보내 방금 서버에서 읽어온 최신 값을 덮어쓴다. 맞추는 동안은
   * videoEditReconciling으로 편집을 막는다(사용자 수정이 조용히 사라지는 것을 막는
   * 더 단순하고 안전한 쪽 — 코드리뷰가 준 두 선택지 중 "막는다"를 택했다).
   */
  /**
   * B-7(6차 재리뷰 BLOCKER, 보안): 워크스페이스 전환·새 작업·후보 선택·버리고 새로
   * 시작 네 곳이 전부 이 함수를 부른다. 세대를 올려 진행 중이던 reconcile의 결과가
   * 반영되지 않게 하고, 기다리는 단건 GET이 있으면 그 자리에서 끊고, 잠금(syncing)도
   * 같이 풀어 다음 화면이 "맞추는 중" 상태로 시작하지 않게 한다.
   */
  function invalidateVideoEditReconcile() {
    videoEditReconcileGenerationRef.current += 1;
    videoEditReconcileAbortRef.current?.abort();
    videoEditReconcileAbortRef.current = null;
    setVideoEditReconciling(false);
    // 호출부가 전부 곧이어 setVideoEdit(null)도 함께 하므로, "지금 videoEdit이 어느
    // 테넌트 것인지" 표식도 같이 비운다 — null 상태에 남의 테넌트 표식이 붙어 있으면
    // 안 된다.
    videoEditTenantRef.current = null;
  }
  async function reconcileVideoEditFromServer(id: string, force = false) {
    // B-7(6차 재리뷰 BLOCKER, 보안): 이 호출의 세대 번호와 시작 시점의 테넌트를 찍어
    // 둔다. await 뒤에 세대가 바뀌었거나(다른 reconcile·리셋이 먼저 올렸다) 그 사이
    // draftId·워크스페이스가 바뀌었으면, 이 결과는 "이미 낡은 요청"이라 절대 반영하지
    // 않는다 — A 테넌트에서 시작한 조회가 B 테넌트로 전환된 화면에 A의 값을 칠하는
    // 것을 이 한 판정으로 막는다.
    const myGeneration = ++videoEditReconcileGenerationRef.current;
    const myTenantId = activeWorkspaceIdRef.current;
    if (videoEditAutosaveTimer.current) { clearTimeout(videoEditAutosaveTimer.current); videoEditAutosaveTimer.current = null; }
    videoEditReconciledRef.current = false;
    setVideoEditReconciling(true);
    // M-1(4차 재리뷰 MAJOR): "다시 불러오기" 버튼은 force=true로 부른다. hist 목록
    // 캐시(LIMIT 50)를 먼저 보면, 방금 충돌난 초안이 그 목록에 없을 때 다시 불러오기가
    // 아무것도 못 읽고 409가 무한 반복된다 — force면 목록 지름길을 건너뛰고 항상 단건
    // GET으로 읽는다.
    let serverDraft = force ? undefined : hist?.drafts?.find((d) => d.id === id) as Record<string, unknown> | undefined;
    let fetchFailed = false;
    if (!serverDraft) {
      const controller = new AbortController();
      videoEditReconcileAbortRef.current = controller;
      // MINOR(4차 재리뷰): 단건 조회가 걸려 있으면 reconciling이 영원히 안 풀린다 —
      // 타임아웃을 걸어 실패로 확정짓는다.
      const timeoutId = setTimeout(() => controller.abort(), 10_000);
      try {
        const res = await fetch(`/api/studio/drafts?tenant_id=${encodeURIComponent(myTenantId ?? "")}&id=${encodeURIComponent(id)}`, { headers: authHeaders(), signal: controller.signal });
        if (res.ok) {
          const data = await res.json().catch(() => null) as { draft?: Record<string, unknown> } | null;
          serverDraft = data?.draft ?? undefined;
        } else if (res.status !== 404) {
          // MINOR(4차 재리뷰): 500·403 등은 "서버에 없음"이 아니라 오류다. 없음으로
          // 오인하면 videoEdit을 null로 덮어써 있던 값을 지운다.
          fetchFailed = true;
        }
      } catch {
        // 네트워크 실패·타임아웃(또는 B-7 리셋이 abort() 한 경우)도 "없음"이 아니라
        // 오류다 — 아래에서 별도 처리한다. 리셋으로 abort된 경우는 아래 세대 판정이
        // fetchFailed 분기보다 먼저 걸려 조용히 버려진다.
        fetchFailed = true;
      } finally {
        clearTimeout(timeoutId);
        if (videoEditReconcileAbortRef.current === controller) videoEditReconcileAbortRef.current = null;
      }
    }
    // B-7 핵심 판정: 이 시점에도 여전히 "지금 세대"이고, draftId·워크스페이스가 그
    // 사이 안 바뀌었을 때만 아래에서 결과를 반영한다. 넷 중 하나라도 어긋나면 이
    // 함수는 화면 상태를 전혀 건드리지 않고 조용히 끝난다(리셋 쪽이 이미
    // videoEditReconciling=false 등 정리를 마쳤다).
    const stillCurrent = videoEditReconcileGenerationRef.current === myGeneration
      && draftIdRef.current === id
      && activeWorkspaceIdRef.current === myTenantId;
    if (!stillCurrent) return;
    if (fetchFailed) {
      // 오류면 지금 화면 값(옛 상태)을 그대로 두고 맞추는 시도만 접는다 — 사용자가
      // 다시 시도할 수 있게 reconciling만 풀고, videoEdit을 지우거나 "맞춰짐" 처리하지
      // 않는다(맞춰짐 처리하면 그 다음 자동저장이 안 맞춘 값을 서버로 내보낼 수 있다).
      setVideoEditReconciling(false);
      // MINOR(5차 재리뷰): 안내만 뜨고 재시도 길이 없었다 — 토스트 자체에 "다시 시도"를
      // 달아 force 재조회로 바로 이어지게 한다.
      showToast("서버 값을 다시 불러오지 못했습니다. 네트워크를 확인한 뒤 다시 시도해 주세요.", "error", {
        label: "다시 시도",
        onClick: () => { void reconcileVideoEditFromServer(id, true); },
      });
      return;
    }
    const serverVideoEdit = (serverDraft?.videoEdit as VideoEdit | undefined) ?? null;
    setVideoEdit(serverVideoEdit);
    videoEditBaseRevisionRef.current = serverVideoEdit?.revision ?? null;
    reconciledDraftIdRef.current = id;
    videoEditTenantRef.current = myTenantId; // B-7: 이 값은 myTenantId 테넌트 것이라고 기록
    videoEditReconciledRef.current = true;
    setVideoEditReconciling(false);
    setVideoEditConflict(false);
    if (force) mutateHist();
  }
  // B-7(6차 재리뷰 BLOCKER, 보안 — 자체 실측으로 추가 발견): 워크스페이스를 바꾸면
  // hist(SWR) 데이터의 "객체 참조"도 바뀐다(다른 테넌트의 새 목록이므로) — 내용이
  // 똑같이 빈 배열이어도 참조가 다르면 React가 "바뀌었다"고 보고 이 효과를 그 커밋
  // 안에서 즉시 다시 돌린다. 그런데 그 커밋에서는 아직 옛 draftId(예: A의 XA)가
  // state에 남아 있다(setDraftId(null)이 워크스페이스 리셋 효과 안에서 예약됐을 뿐
  // 아직 반영 전) — 그래서 "지금 워크스페이스는 B인데 A의 draftId로" 재조회를 새로
  // 시작해버리는 유령 호출이 생겼다(reconcile 내부의 stillCurrent 판정이 결과 반영은
  // 막지만, 그 유령 호출이 올린 syncing=true를 아무도 꺼주지 않아 B가 잠긴 채 남았다).
  // hist?.drafts의 "내용 유무"(불리언)만 의존값으로 삼으면 참조가 바뀌어도 유무가
  // 똑같은 한(빈 배열→빈 배열) 이 커밋에서 다시 안 돈다 — draftId가 실제로 바뀐 다음
  // 커밋에서만, 그때는 이미 최신 draftId(null)로 정확히 판단한다.
  const histDraftsReady = Boolean(hist?.drafts);
  const histFailed = Boolean(histError);
  useEffect(() => {
    if (!draftId) { videoEditReconciledRef.current = true; videoEditBaseRevisionRef.current = null; return; }
    if (reconciledDraftIdRef.current === draftId) return;
    // B-6(6차 재리뷰 BLOCKER): 목록(SWR)이 계속 로딩 중이면 다음 도착을 기다리는 게
    // 맞지만, 목록 자체가 에러로 끝났으면(histError) 영원히 안 온다 — 그 경우 목록을
    // 포기하고 단건 GET(force)으로 넘어간다. 그래야 "잠근 채 12초 뒤에도 안 풀림"이
    // 아니라 최소한 10초 타임아웃(reconcileVideoEditFromServer 내부)까지만 잠긴다.
    if (!histDraftsReady && !histFailed) return; // SWR 로딩 중 — hist가 도착하면 이 효과가 다시 돈다.
    void reconcileVideoEditFromServer(draftId, histFailed);
  }, [draftId, histDraftsReady, histFailed]);
  useEffect(() => () => {
    if (cardDeckAutosaveTimer.current) clearTimeout(cardDeckAutosaveTimer.current);
    if (videoEditAutosaveTimer.current) clearTimeout(videoEditAutosaveTimer.current);
  }, []);
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
      // 목록에는 v3 본문이 없으므로 발행 복귀도 같은 상세 보강을 시작한다. 목록 신호가
      // true인 동안은 아래 발행 행동이 잠겨, 상세 지연 창에서 plain 결과를 내보내지 않는다.
      void loadDraftDetail(linkedDraft);
    } else {
      const work = buildPublishReturnWork(queuePost);
      if (!work) {
        publishReturnLoaded.current = loadKey;
        showToast("작업물 본문이 없어 발행실로 가져오지 못했습니다", "error");
        return;
      }
      const tagText = work.hashtags.map((tag) => tag.replace(/^#/, "")).join(" ");
      // B1(교차 리뷰 BLOCK): loadDraft와 같은 이유. 이 경로도 videoEdit을 직접 세팅한다.
      if (cardDeckAutosaveTimer.current) { clearTimeout(cardDeckAutosaveTimer.current); cardDeckAutosaveTimer.current = null; }
      if (videoEditAutosaveTimer.current) { clearTimeout(videoEditAutosaveTimer.current); videoEditAutosaveTimer.current = null; }
      setIdea((linkedDraft?.idea as string) || work.idea);
      const returnedText: TextVariants = {
        threads: work.body,
        x: work.body,
        facebook: work.body,
        instagram: { caption: work.body, hashtags: work.hashtags.map((tag) => tag.replace(/^#/, "")) },
        shorts: { hook: work.body, body: "", cta: "" },
      };
      const queueImageUrls = Array.isArray(queuePost.imageUrls)
        ? queuePost.imageUrls.filter((value): value is string => typeof value === "string" && value.trim().length > 0)
        : [];
      const returnedImageUrls = queueImageUrls.length
        ? queueImageUrls
        : work.imageUrl
          ? [work.imageUrl]
          : [];
      const isUnlinkedQueueCard = !linkedDraft && returnedImageUrls.length > 0 && !work.videoUrl;
      const primaryImageUrl = returnedImageUrls[0] ?? work.imageUrl;
      setImg(primaryImageUrl ? {
        url: primaryImageUrl,
        file: primaryImageUrl,
        imageUrls: returnedImageUrls,
        ...(isUnlinkedQueueCard ? { textEmbedded: true, textSourceRecoverable: false } : {}),
      } : null);
      setVid(work.videoUrl ? { url: work.videoUrl, file: work.videoUrl, model: "기존 작업물" } : null);
      setIncludes(work.includedPlatforms.length
        ? normalizeIncludes(Object.fromEntries(ALL.map((platform) => [platform, work.includedPlatforms.includes(platform)])))
        : normalizeIncludes());
      // MINOR-g 근본원인: 인박스/큐 작업물을 발행실 상태로 복원할 때도 그 작업물이 저장한
      // 체크 상태가 표시 없이 되살아난다. 같은 배지로 복원임을 남긴다.
      setRestoredSelectionNotice(work.includedPlatforms.length > 0);
      setTitles((linkedDraft?.titles as Record<string, string>) || {});
      setHashtags((linkedDraft?.hashtags as Record<string, string>) || (tagText ? { instagram: tagText } : {}));
      setTopicTags((linkedDraft?.topicTags as Record<string, string>) || {});
      setFirstComments((linkedDraft?.firstComments as Record<string, string>) || {});
      setCaptions((linkedDraft?.captions as Record<string, string>) || {});
      setSelectedAccounts((linkedDraft?.selectedAccounts as Record<string, string>) || {});
      const returnedEditLines = (linkedDraft?.editLines as string[]) || (isUnlinkedQueueCard
        ? returnedImageUrls.map((_, index) => index === 0 ? work.body : "")
        : []);
      replaceBodySnapshot(
        returnedEditLines,
        returnedText,
        { replaceDocument: true, serverRevision: Number.isSafeInteger(linkedDraft?.bodyRevision) ? linkedDraft?.bodyRevision as number : 0 },
      );
      // 2026-10-01 재리뷰 BLOCK: loadDraft 와 같은 이유. 이 경로도 quickDraftTopicRef 를
      // 불러온 작업물의 실제 주제로 맞춘다.
      quickDraftTopicRef.current = resolveRestoredQuickDraftTopic({
        hasText: Boolean(returnedText),
        savedTopic: null,
        restoredIdea: String((linkedDraft?.idea as string) || work.idea || ""),
      });
      setCardTextPositions((linkedDraft?.cardTextPositions as CardTextPosition[]) || []);
      const linkedCardDeck = (linkedDraft?.cardDeck as CardDeck) || null;
      setCardDeck(linkedCardDeck);
      setCardDeckV3(cardDeckV3ForDraft(linkedCardDeck, linkedDraft?.cardDeckV3 as CardDeckV3 | null));
      setVideoEdit((linkedDraft?.videoEdit as VideoEdit) || null);
      // MINOR(7차 재리뷰): 이 분기도 videoEdit을 reconcile 밖에서 직접 세팅한다(워크스페이스
      // 전환·새 작업·후보 선택·버리고 새로 시작과 같은 계열) — 그 아래 setDraftId(linkedDraftId)가
      // null일 수 있는데, 그러면 진행 중이던 맞춤의 syncing 잠금이 안 풀릴 수 있었다. 다른 네 곳과
      // 같은 invalidateVideoEditReconcile()로 세대를 올리고 잠금을 확실히 푼다.
      invalidateVideoEditReconcile();
      const linkedFormat = validateContentEditFormat(linkedDraft?.editFormat);
      if (linkedFormat.valid) {
        setEditKind(linkedFormat.value.kind);
        setEditFormat(linkedFormat.value);
      } else if (!linkedDraft && work.videoUrl) {
        setEditKind("video");
        setEditFormat(defaultContentEditFormat("video"));
      } else if (isUnlinkedQueueCard) {
        setEditKind("card");
        setEditFormat(defaultContentEditFormat("card"));
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
  // 2026-10-03 독립 리뷰 MINOR-g: 이 맵이 channel-name-list.ts(PLATFORM_LABEL)와 내용이
  // 똑같이 중복 선언돼 있었다. 한쪽만 고치면 다른 쪽이 조용히 낡는다. 하나로 합친다.
  // (타입은 기존처럼 Record<string,string>으로 느슨하게 — 이 아래에서 BulkPlatform 등
  // 더 넓은 string 키로 인덱싱하는 자리가 여럿이라 PreviewPlatform 리터럴로 좁히면
  // 그 자리들이 전부 타입 에러가 난다.)
  const LABEL: Record<string, string> = PLATFORM_LABEL;
  function chooseCandidate(candidate: StudioGenerationCandidate) {
    // [보안](교차 리뷰 재리뷰 BLOCK 2): 후보를 고르는 이 경로는 cardDeck·videoEdit
    // 둘 다 비우지 않아 이전 후보(또는 이전 세션)의 오버레이·댓글이 새 후보로 그대로
    // 넘어갔다.
    if (cardDeckAutosaveTimer.current) { clearTimeout(cardDeckAutosaveTimer.current); cardDeckAutosaveTimer.current = null; }
    if (videoEditAutosaveTimer.current) { clearTimeout(videoEditAutosaveTimer.current); videoEditAutosaveTimer.current = null; }
    setCardDeck(null); setCardDeckV3(null); setCardDeckV3DetailStatus("idle"); setCardDeckV3SourceSnapshot(null); setVideoEdit(null);
    // MINOR(3차 재리뷰): draftId도 끊는다 — 남겨 두면 다음 저장이 이 후보와 무관한
    // 옛 초안 id 위에 그대로 얹혀 저장된다.
    draftIdRef.current = null;
    setDraftId(null);
    videoEditReconciledRef.current = true; reconciledDraftIdRef.current = null; videoEditBaseRevisionRef.current = null;
    invalidateVideoEditReconcile(); // B-7: 진행 중이던 맞춤 결과를 버린다
    setSelectedCandidate(candidate);
    // 새 구조 초안은 새 작업물이다. 본문만 교체하고 이전 작업물의 해시태그를 남기면
    // 모든 채널에 무관한 태그가 따라가고, X 글자수 한도까지 그 태그 때문에 부풀어 오른다.
    // 후보를 고르는 순간 기존 발행 메타에서 해시태그만 명시적으로 끊는다. 새 본문이
    // 실제 태그를 제공하면 아래 text 동기화 효과가 새 값으로 다시 채운다.
    setHashtags({});
    /*
      ★rationale 은 **고객에게 보여 줄 글이 아니다.** "이 구조를 왜 골랐는가" 를 우리가
      우리에게 설명하는 내부 메모다. 예: "결과(사례)를 먼저 보여줘서 신뢰를 쌓고, 그 사례가
      가능했던 조건을 역순으로 설명해 상담 동기를 만듭니다."

      그런데 이것을 본문에 그대로 끼워 넣고 있었다. 2026-09-11 품질 측정에서 저장된 글
      15편 중 9편의 본문이 제목과 이 메모로 시작하고 있는 것을 찾았다. 그대로 발행하면
      **고객의 독자가 우리 내부 메모를 읽는다.** 발행실 미리보기에도 그 줄이 그대로 떠
      있었는데 나는 그것을 보고도 못 알아봤다.

      본문은 제목과 이야기 순서로만 만든다. rationale 은 화면에서 "왜 이 구조인가" 를
      설명하는 자리에만 쓴다.
    */
    const body = [candidate.title, ...candidate.format.outline].join("\n");
    const candidateText: TextVariants = {
      threads: body,
      x: trimToChannelLimit(body, "x"),
      facebook: body,
      // 캡션도 본문이다. 내부 메모를 캡션으로 내보내면 같은 사고가 인스타그램에서 난다.
      instagram: { caption: candidate.title, slides: candidate.format.outline, hashtags: [] },
      // 마무리 문구도 독자가 읽는다. 이야기 순서의 마지막 줄을 쓴다.
      shorts: {
        hook: candidate.title,
        body: candidate.format.outline.join("\n"),
        cta: candidate.format.outline[candidate.format.outline.length - 1] ?? candidate.title,
      },
    };
    replaceBodySnapshot([candidate.title, ...candidate.format.outline], candidateText, { replaceDocument: true, serverRevision: 0 });
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
    if (accountLoadPending[platform]) return { status: "loading" };
    if (accountLoadErrors[platform]) return { status: "error" };
    const accounts = usableAccounts(platform);
    if (!accounts.length) return { status: "missing" };
    const selected = defaultConnectedAccount(platform);
    return { status: "connected", displayName: selected?.displayName, username: selected?.username };
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
  // 2026-09-16 실측: 한도 초과가 토스트 한 번으로만 떴다가 사라지고 나면 사용자는 "왜 안
  // 눌리지" 상태로 남았다. 발행 단추 옆에 계속 보이는 자리를 둬 어느 채널이 왜 막혔는지와
  // 바로 고치는 단추를 붙인다.
  const publishBlockedEntries = partitionBlockedPublishTargets(
    ALL.filter((platform) => usableAccounts(platform).length > 0),
    (platform) => validatePlatformPublish(platform, platformPublishInput(platform)).blocking[0],
  ).blocked;
  /**
   * 2026-10-03 독립 리뷰 m1: Threads+TikTok처럼 섞어 고르고 TikTok 공개 범위를 안
   * 고른 경우, TikTok 체크박스 칸(각 미리보기 카드 머리)에는 이유가 보이지만 발행
   * 버튼 쪽에는 "선택 2곳 (Threads)"처럼 TikTok이 조용히 빠진 걸로만 보였다 — 왜
   * 2에서 1로 줄었는지 그 자리에서 안 보였다. publishGuard(영상/카드뉴스 없음,
   * TikTok 공개 범위 등)에 걸려 빠진, 그런데 사용자가 체크는 한 채널을 이름+이유로
   * 발행 버튼 옆에 보여준다. publishBlockedEntries(글자수·해시태그 한도)와는 다른
   * 축이라 따로 둔다 — 한쪽은 "본문이 한도를 넘음", 한쪽은 "그 채널 자체가 아직
   * 준비되지 않음"이다.
   */
  const guardExcludedSelections = ALL.filter((platform) => Boolean(includes[platform]))
    .map((platform) => ({ platform, reason: publishGuard(platform).disabledReason }))
    .filter((entry): entry is { platform: PreviewPlatform; reason: string } => Boolean(entry.reason));
  const bulkTargets = ALL.filter((platform) => PUBLISH_SUPPORTED.has(platform)) as BulkPlatform[];
  // 2026-10-01 실측(회장 지적, PR#96 결함3 리뷰 BLOCK): 사이드바(channel-config →
  // getChannelConnectionStates)와 publishTargets 는 connectionState === "connected" 인
  // 것만 연결됨으로 본다. "연결됨"은 계정이 이어져 있는가 하나만 묻는 질문이다.
  // 그런데 여기 connectedTargets 는 한때 publishGuard(영상 없음·본문 미검증 등 "지금
  // 발행 가능한가")까지 섞어 판정했다. 그래서 X 계정을 연결해 놓고 영상만 아직 안
  // 올렸을 뿐인데도 "아직 연결 안 된 곳: X" 로 뜨는 거짓말이 났다 — 연결과 "지금 당장
  // 올릴 수 있는가"는 서로 다른 질문이라 하나로 합치면 안 된다. "지금 발행 불가"
  // 사유는 이미 채널별 카드(PublishHeaderControls/publishGuard, 약 3270줄)가 따로
  // 보여준다. 여기 connectedTargets 는 usableAccounts 단독으로만 판정한다.
  const channelReadiness = new Map<BulkPlatform, ChannelReadiness>(
    bulkTargets.map((platform) => [platform, {
      connected: usableAccounts(platform).length > 0,
      disabledReason: publishGuard(platform).disabledReason,
    }]),
  );
  const connectedTargets = connectedOnlyTargets(channelReadiness);
  // 2026-10-01 재리뷰 BLOCK: connectedTargets(순수 연결 여부)를 "전부 고르기"·선택
  // 카운트·비활성 비교에도 그대로 썼더니, 연결은 됐지만 지금 발행 불가(영상 없음·본문
  // 미검증)한 채널까지 "고를 수 있다"고 버튼이 우기는 새 거짓말이 났다("연결된 3곳을
  // 모두 골랐습니다"라며 실제로는 1곳만 선택). "전부 고르기"가 실제로 고르는 대상은
  // 언제나 publishableTargets(연결 + 지금 발행 가능) 여야 한다. connectedTargets는
  // "아직 연결 안 된 곳" 문구(순수 연결 여부)에만 남긴다.
  const publishableTargets = computePublishableTargets(channelReadiness);
  const previewTargets = ALL as BulkPlatform[];

  // 아래 네 함수 + 체크박스 onCheckedChange는 전부 사용자가 **지금** 직접 고른 행동이다.
  // 그 순간부터는 "지난번 선택 유지" 배지가 더 이상 맞지 않는다(복원이 아니라 지금의
  // 의도된 선택이므로) — 눌렀으면 끈다(MINOR-g 근본원인 수정).
  function selectAllChannels() {
    if (!publishableTargets.length) { showToast("지금 바로 발행할 수 있는 채널이 아직 없습니다. 연결 상태와 발행 조건을 확인해 주세요", "error"); return; }
    setIncludes((current) => ({ ...current, ...Object.fromEntries(publishableTargets.map((platform) => [platform, true])) }));
    setRestoredSelectionNotice(false);
    showToast(`발행 가능한 ${publishableTargets.length}곳을 모두 골랐습니다`, "success");
  }
  function clearAllChannels() {
    setIncludes((current) => ({ ...current, ...Object.fromEntries(bulkTargets.map((platform) => [platform, false])) }));
    setRestoredSelectionNotice(false);
    showToast("고른 곳을 모두 해제했습니다", "success");
  }
  function excludeChannel(platform: BulkPlatform) {
    setIncludes((current) => ({ ...current, [platform]: false }));
    setRestoredSelectionNotice(false);
    showToast(`${LABEL[platform]}만 빼고 두었습니다`, "success");
  }
  function keepOnlyChannel(platform: BulkPlatform) {
    if (!usableAccounts(platform).length) { showToast(`${LABEL[platform]} 계정을 다시 연결해야 합니다`, "error"); return; }
    const guard = publishGuard(platform as PreviewPlatform);
    if (guard.disabledReason) { showToast(guard.disabledReason, "error"); return; }
    setIncludes((current) => ({ ...current, ...Object.fromEntries(bulkTargets.map((p) => [p, p === platform])) }));
    setRestoredSelectionNotice(false);
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
    if (rejectWhileCardDeckV3DetailPending()) return;
    if (cardDeckV3 && !CARD_DECK_V3_RENDER_ENABLED) {
      showToast(CARD_DECK_V3_PUBLISH_BLOCK_MESSAGE, "error");
      return;
    }
    if ((!text && !editLines.some((line) => line.trim())) || !activeWorkspace) {
      showToast("검토할 작업물이 없습니다", "error");
      return;
    }
    setReviewBusy(true);
    try {
      // 신규·기존 초안과 기존 검토 큐를 가리지 않고, 검토 요청은 반드시 최신 본문
      // 스냅샷 저장이 끝난 뒤에만 진행한다. draftId 단축 평가는 저장을 건너뛰므로 금지한다.
      const linkedDraftId = await save("draft", undefined, undefined, undefined, undefined, cardDeck, videoEdit, cardDeckV3);
      if (!linkedDraftId) throw new Error("검토 요청용 초안을 저장하지 못했습니다");
      let queueId = reviewQueueId;
      if (!queueId) {
        const added = await apiPost<{ post?: { id?: string } }>("/api/queue/add", {
          tenant_id: activeWorkspace.id,
          draftId: linkedDraftId,
          text: publishText(publishTargets[0] || "threads"),
          topic: idea || "Studio 작업물",
          hashtags: (hashtags.instagram || "").split(/[\s,]+/).map((value) => value.replace(/^#/, "")).filter(Boolean),
          imageUrl: img?.url || null,
          imageUrls: img?.imageUrls || null,
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
      case "schedule":
        if (rejectWhileCardDeckV3DetailPending()) return;
        if (cardDeckV3 && !CARD_DECK_V3_RENDER_ENABLED) {
          showToast(CARD_DECK_V3_PUBLISH_BLOCK_MESSAGE, "error");
          return;
        }
        setShowSchedule(true);
        return;
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
      currentEditKind={editKind}
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
              지금 만드는 것: {activeRoom === "create" ? createPrimaryKind ? createPrimaryKind === "video" ? "영상" : createPrimaryKind === "card" ? "카드뉴스" : "글" : "선택 전" : editKind === "video" ? "영상" : editKind === "card" ? "카드뉴스" : editKind === "text" ? "글" : "나레이션"}
              {activeRoom === "create" && alsoKinds.length ? <span className="font-normal text-subtle">, {alsoKinds.map((kind) => (kind === "video" ? "영상" : kind === "card" ? "카드뉴스" : "글")).join(", ")}</span> : null}
            </span>
          ) : null}
          <span className="rounded-control border border-border bg-surface-2 px-stack py-stack-tight text-caption text-subtle" title={activeRoom === "create" ? "현재 생성실은 일곱 칸 학습 정보를 바탕으로 AI 구성 초안을 만듭니다." : engine?.error ? "생성 엔진 확인에 실패했습니다. 설정에서 연결을 확인해 주세요." : "생성 엔진의 설정 정보입니다. 실제 생성 가능 여부는 생성 요청 결과로 확인됩니다."}>{activeRoom === "create" ? "AI 구성 초안" : engine?.error ? "AI 연결 확인 필요" : "AI 엔진 설정됨"}</span>
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
            ) : (hist?.drafts ?? []).slice(0, 20).map((draft) => {
              const preview = draftPreviewMedia(draft);
              return (
              <button
                key={String((draft as { id?: unknown }).id ?? "")}
                type="button"
                data-work-item={String((draft as { id?: unknown }).id ?? "")}
                onClick={() => { void (async () => {
                  const room = draftLandingRoom(draft as unknown as Record<string, unknown>);
                  const loaded = await loadDraftDetail(draft as unknown as Record<string, unknown>);
                  if (!loaded) return;
                  changeRoom(room, loaded.kind ?? editKind);
                  showToast(`${ROOM_LABEL[room]}에서 이어 작업합니다`, "success");
                })(); }}
                className="flex min-h-control-touch w-full flex-wrap items-center gap-stack rounded-control border border-border bg-surface-2 px-stack py-stack-tight text-left hover:bg-surface"
              >
                {preview ? (
                  <DeliveredMedia
                    type={preview.type}
                    src={preview.src}
                    tenantId={activeWorkspace?.id}
                    testId={`work-thumbnail-${String((draft as { id?: unknown }).id ?? "")}`}
                    alt="작업물 미리보기"
                    preload="none"
                    loading="lazy"
                    className="h-control-touch w-control-touch shrink-0 rounded-control object-cover"
                  />
                ) : (
                  <span aria-hidden="true" className="grid h-control-touch w-control-touch shrink-0 place-items-center rounded-control bg-surface text-caption text-subtle">없음</span>
                )}
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
              );
            })}
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
      <GettingStartedStrip
        learningFilled={countFilledUserSlots(learningInfo, { guide })}
        learningTotal={LEARNING_USER_SLOT_TOTAL}
        onOpenLearning={() => setShowWizard(true)}
      />
      {progressStrip}
      <CreateRoom
        workspaceId={activeWorkspace?.id}
        workspaceName={activeWorkspace?.name}
        guide={guide}
        topic={idea}
        contentBranch={createBranch}
        onContentBranchChange={setCreateBranch}
        requestedPrimaryKind={requestedEditKind}
        onPrimaryKindChange={setCreatePrimaryKind}
        onTopicChange={setIdea}
        onOpenLearning={() => setShowWizard(true)}
        onCandidateSelect={chooseCandidate}
        onOpenEditor={(draftId) => { void (async () => {
          // 설계 §6.1 "201 batch → 편집실 진입(draft 로드)" 계약. draftId 가 있으면(방금
          // 카톡 말풍선 카드뉴스 9장을 확정) 그 초안을 실어 넣고 연다 — 안 그러면
          // 회원이 돈을 내고 만든 덱이 편집실에서 안 보인다(코드리뷰 2026-09-22 M4).
          let loadedEditKind: EditContentKind | null = null;
          if (draftId) {
            const draft = hist?.drafts.find((d) => d.id === draftId);
            if (draft) loadedEditKind = (await loadDraftDetail(draft))?.kind ?? null;
          }
          changeRoom("edit", loadedEditKind ?? editKind);
        })(); }}
        onDerivationSucceeded={async () => {
          // 확정 성공 직후 초안 목록을 재검증해야 cardDeckByDraftId 가 방금 만든 덱을
          // 실제로 찾는다 — 안 하면 탭 포커스가 바뀔 때까지 썸네일이 안 뜬다
          // (코드리뷰 2026-09-22 M3, "형식만 통과하는 얕은 테스트" 재발 방지).
          await mutateHist();
        }}
        onAlsoKindsChange={setAlsoKinds}
        onLearningInfoChange={setLearningInfo}
        learningVersion={learningFlash + countFilledUserSlots(learningInfo, { guide })}
        resumeCount={hist?.drafts.length ?? 0}
        onResume={() => setShowWorks(true)}
        quickDraft={text}
        quickDraftLoading={busy === "초안 만드는 중"}
        quickDraftError={lastError}
        onQuickDraftGenerate={generateQuickDraft}
        onTextCandidateSelect={selectTextCandidate}
        onGenerateCardImages={generateCardImages}
        cardDeckByDraftId={(draftId) => {
          const draft = hist?.drafts.find((d) => d.id === draftId);
          return (draft?.cardDeck as CardDeck | undefined) ?? null;
        }}
        onTextCardsCreated={(urls, cardLines) => {
          if (!urls.length) return;
          // renderTextCard가 문구를 PNG 픽셀에 이미 그렸다. 이 표식을 저장·재개까지 보존해
          // 편집실이 같은 문구 textarea를 카드 면 위에 한 벌 더 얹지 않게 한다.
          setImg(embeddedTextCardImage({ url: urls[0], file: urls[0], imageUrls: urls, topicKey: mediaTopicKey(idea) }));
          setEditKind("card");
          setEditFormat((current) => {
            const base = defaultContentEditFormat("card");
            // 고른 비율은 지킨다. 카드로 형식을 바꿀 때마다 4:5 로 되돌리면 고른 값이 사라진다.
            return base.kind === "card" ? { ...base, aspectRatio: cardAspectRatio } : current;
          });
          // 그림만 넘기면 편집실은 카드가 몇 장인지 모른다. 실제로 그래서 3장을 만들어도
          // 편집실이 `1 / 1` 을 그렸다(2026-09-14 실측). 장에 적힌 글자를 같이 넘긴다.
          if (cardLines.length) replaceEditLines(cardLines);
        }}
        cardRatio={cardAspectRatio}
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

  // 카드뉴스 v2 덱 연산 후 800ms 디바운스 자동저장(설계 §5 F4). 연산마다 즉시 서버에 쏘면
  // 타이핑·연속 클릭마다 요청이 나간다. hook(useRef·useEffect)은 위(다른 useRef 들 옆,
  // 1990행 조건부 조기 return 앞)에서 선언한다 — 이 자리는 여러 방 early return 사이라
  // hook 순서가 렌더마다 달라진다(2026-09-22 실측: studio-publish-ui.test.tsx 37건이
  // "Rendered more hooks than during the previous render" 로 전멸했던 것과 같은 유형).
  //
  // 2026-09-22 코드리뷰 MAJOR 2·MINOR 6 반영: 빈 말풍선(추가 직후 placeholder)을 그대로
  // 저장하면 서버 validator 가 400 을 낸다. 저장 전에 `pruneEmptyBubbles` 로 걷어내고,
  // 그래도 말풍선이 하나도 안 남는 장이 있으면 저장 자체를 보류하고 이유를 보여준다(조용한
  // 실패 금지). `draftId` 는 setTimeout 콜백이 오래된 값을 캡처하지 않게 최신 ref 로 읽는다
  // (ref 갱신·언마운트 정리는 위 early return 앞에서 한다).
  function onCardDeckChange(nextDeck: CardDeck) {
    setCardDeck(nextDeck);
    if (cardDeckAutosaveTimer.current) clearTimeout(cardDeckAutosaveTimer.current);
    cardDeckAutosaveTimer.current = setTimeout(() => {
      const pruned = pruneEmptyBubbles(nextDeck);
      const emptySlide = emptyBubbleSlideNumber(pruned);
      if (emptySlide !== null) {
        setCardDeckAutosaveError(`${emptySlide}번 장에 말풍선이 비어 있어 자동 저장을 보류했습니다. 내용을 채우면 저장됩니다.`);
        return;
      }
      // A(2026-09-22 코드리뷰 4차): 이 타이머는 카드덱 도메인만 책임진다. videoEdit 자리에
      // null을 명시하지 않으면 영상 state가 검증 없이 같이 실릴 수 있다 —
      // 사용자가 영상 오버레이 문구를 지우고 다시 타이핑하는 중(정상 편집 중, 보류
      // 대상)이면 그 state가 여기 실려가 서버 validateVideoEdit 400을 내고, 카드덱
      // 저장까지 함께 실패한다. null을 명시해 videoEdit 키 자체를 payload에서 뺀다
      // (drafts/route.ts는 키가 없으면 기존 값을 보존한다).
      save("draft", publishReconciliations, draftIdRef.current, img, vid, pruned, null)
        .then(() => { setEditSavedAt(new Intl.DateTimeFormat("ko-KR", { hour: "2-digit", minute: "2-digit", hour12: false }).format(new Date())); setCardDeckAutosaveError(""); })
        .catch((error) => {
          if (error instanceof ApiResponseError && (error.payload as { code?: string } | undefined)?.code === "BODY_STALE_REVISION") return;
          setCardDeckAutosaveError(extractApiErrorMessage(error, "자동 저장하지 못했습니다. 잠시 후 다시 시도해 주세요."));
        });
    }, 800);
  }

  function onCardDeckV3Change(
    nextDeck: CardDeckV3,
    templateStateOrOptions?: CardTemplateState | { sourceSnapshot?: CardDeckV3SourceSnapshot | null },
  ) {
    const options: { sourceSnapshot?: CardDeckV3SourceSnapshot | null; templateState?: CardTemplateState } = templateStateOrOptions && "activeTemplateId" in templateStateOrOptions
      ? { templateState: templateStateOrOptions }
      : templateStateOrOptions ?? {};
    const nextTemplateState = options.templateState
      ?? cardTemplateState
      ?? defaultCardTemplateState(nextDeck);
    setCardTemplateState(nextTemplateState);
    if (Object.prototype.hasOwnProperty.call(options, "sourceSnapshot") && options.sourceSnapshot) {
      cardDeckV3PendingSourceSnapshotRef.current = options.sourceSnapshot;
    }
    const legacyProjection = cardDeck ? projectCardDeckV3ToV2(nextDeck, cardDeck) : null;
    const persistedDeck = legacyProjection && nextDeck.template === "chat_bubble"
      ? synchronizeChatCardDeckV3(nextDeck, legacyProjection)
      : nextDeck;
    if (legacyProjection) setCardDeck(legacyProjection);
    // 저장본에만 v2 동기화 지문을 붙인다. 편집기 state까지 별도 객체로 치환하면
    // CardCanvasEditor가 외부 덱 교체로 판단해 방금 쌓은 undo 이력을 지운다.
    setCardDeckV3(nextDeck);
    cardDeckV3Ref.current = nextDeck;
    cardDeckV3DirtyRef.current = true;
    const editGeneration = cardDeckV3EditGenerationRef.current + 1;
    cardDeckV3EditGenerationRef.current = editGeneration;
    replaceEditLines(cardDeckV3Projection(nextDeck));
    if (cardDeckAutosaveTimer.current) clearTimeout(cardDeckAutosaveTimer.current);
    cardDeckAutosaveTimer.current = setTimeout(() => {
      cardDeckV3SavePendingGenerationRef.current = editGeneration;
      // 진입 직후 800ms 안에 요소를 조작하면 다음 편집이 진입 타이머를 취소한다. 원문
      // 스냅샷을 타이머 지역값으로만 들고 있으면 첫 저장에서 영원히 빠진다. 서버가 실제로
      // 한 번 수락할 때까지 ref에 보관하되, 수락 뒤 일반 자동저장에는 키를 다시 싣지 않는다.
      const pendingSourceSnapshot = Object.prototype.hasOwnProperty.call(options, "sourceSnapshot")
        ? options.sourceSnapshot
        : cardDeckV3PendingSourceSnapshotRef.current;
      const saveOptions = {
        ...(pendingSourceSnapshot ? { sourceSnapshot: pendingSourceSnapshot } : {}),
        templateState: nextTemplateState,
      };
      save("draft", publishReconciliations, draftIdRef.current, img, vid, legacyProjection, null, persistedDeck, "tail", pub, saveOptions)
        .then(() => {
          if (cardDeckV3EditGenerationRef.current === editGeneration) {
            cardDeckV3DirtyRef.current = false;
            cardDeckV3HydratedDraftRef.current = draftIdRef.current;
          }
          if (cardDeckV3SavePendingGenerationRef.current === editGeneration) cardDeckV3SavePendingGenerationRef.current = null;
          setEditSavedAt(new Intl.DateTimeFormat("ko-KR", { hour: "2-digit", minute: "2-digit", hour12: false }).format(new Date()));
          setCardDeckAutosaveError("");
        })
        .catch((error) => {
          if (cardDeckV3SavePendingGenerationRef.current === editGeneration) cardDeckV3SavePendingGenerationRef.current = null;
          if (error instanceof ApiResponseError && (error.payload as { code?: string } | undefined)?.code === "BODY_STALE_REVISION") return;
          setCardDeckAutosaveError(extractApiErrorMessage(error, "카드 직접 편집 내용을 자동 저장하지 못했습니다. 잠시 후 다시 시도해 주세요."));
        });
    }, 800);
  }

  async function startCardDeckV3(): Promise<boolean> {
    if (!cardDeckV3EntryEnabled(CARD_DECK_V3_RENDER_ENABLED, {
      hasCardDeckV2: Boolean(cardDeck),
      cardDeckTemplate: cardDeck?.template ?? null,
      textEmbedded: img?.textEmbedded === true,
    })) return false;
    if (rejectWhileCardDeckV3DetailPending()) return false;
    const blockedReason = cardDeck ? null : plainCardDeckV3EntryBlockReason(resolvedEditLines);
    if (blockedReason) {
      showToast(blockedReason, "error");
      return false;
    }
    const snapshot = {
      editLines: [...resolvedEditLines],
      cardTextPositions: [...cardTextPositions],
    } satisfies CardDeckV3SourceSnapshot;
    if (cardDeck?.template !== "chat_bubble") setCardDeckV3SourceSnapshot(snapshot);
    try {
      let nextDeck: CardDeckV3;
      if (cardDeck && CARD_DECK_V3_RENDER_ENABLED) {
        const upload = browserCardUploader(authHeaders());
        const coverImageAssetIds: Record<string, string> = {};
        let profileImageAssetId = cardDeck.brand.profile_image_asset_id ?? undefined;
        const rollback: Array<() => Promise<void>> = [];
        try {
          for (const [index, slide] of cardDeck.slides.entries()) {
            if (!slide.cover_image_url || coverImageAssetIds[slide.cover_image_url]) continue;
            const uploaded = await upload(slide.cover_image_url, index);
            if (typeof uploaded === "string" || !uploaded.filename) throw new Error(`${index + 1}번 표지 사진 파일명을 받지 못했습니다.`);
            coverImageAssetIds[slide.cover_image_url] = uploaded.filename;
            if (uploaded.rollback) rollback.push(uploaded.rollback);
          }
          if (cardDeck.brand.profile_image_url && !profileImageAssetId) {
            const uploaded = await upload(cardDeck.brand.profile_image_url, cardDeck.slides.length);
            if (typeof uploaded === "string" || !uploaded.filename) throw new Error("작성자 프로필 사진 파일명을 받지 못했습니다.");
            profileImageAssetId = uploaded.filename;
            if (uploaded.rollback) rollback.push(uploaded.rollback);
          }
          nextDeck = migrateCardDeckV2ToV3(cardDeck, { coverImageAssetIds, profileImageAssetId });
        } catch (error) {
          await Promise.allSettled(rollback.reverse().map((remove) => remove()));
          throw error;
        }
      } else if (img?.textEmbedded === true && img.textSourceRecoverable !== false) {
        const rendered = renderPlainCardDeckIncremental({
          lines: snapshot.editLines.map(() => ""),
          ratio: cardRatioFrom(cardAspectRatio),
          theme: themeFromPalette(learningInfo.palette),
          positions: snapshot.cardTextPositions,
        });
        const upload = browserCardUploader(authHeaders());
        const backgrounds = [] as Array<{ assetId: string; alt: string }>;
        const rollback: Array<() => Promise<void>> = [];
        try {
          for (let index = 0; index < rendered.urls.length; index += 1) {
            const uploaded = await upload(rendered.urls[index], index);
            if (typeof uploaded === "string" || !uploaded.filename) throw new Error(`${index + 1}번 카드 바탕 파일명을 받지 못했습니다.`);
            backgrounds.push({ assetId: uploaded.filename, alt: `${index + 1}번 카드 글자 없는 바탕` });
            if (uploaded.rollback) rollback.push(uploaded.rollback);
          }
        } catch (error) {
          await Promise.allSettled(rollback.reverse().map((remove) => remove()));
          throw error;
        }
        nextDeck = createRecoverableEmbeddedCardDeckV3(snapshot.editLines, snapshot.cardTextPositions, backgrounds);
      } else {
        nextDeck = createPlainCardDeckV3(snapshot.editLines, snapshot.cardTextPositions);
        if (img?.filename) nextDeck = applyGeneratedImageBackground(nextDeck, img.filename);
      }
      onCardDeckV3Change(nextDeck, cardDeck?.template === "chat_bubble" ? undefined : { sourceSnapshot: snapshot });
    } catch (error) {
      showToast(extractApiErrorMessage(error, "카드 직접 편집용 바탕을 준비하지 못했습니다."), "error");
      return false;
    }
    const currentDraftId = draftIdRef.current;
    const tenantId = activeWorkspaceIdRef.current;
    if (currentDraftId && tenantId) {
      void fetch(`/api/schedule?tenant_id=${encodeURIComponent(tenantId)}`, { headers: authHeaders() })
        .then(async (response) => response.ok ? response.json() : null)
        .then((data: { schedules?: Array<{ draftId?: string | null; status?: string }> } | null) => {
          const hasPendingSchedule = data?.schedules?.some((schedule) => schedule.draftId === currentDraftId
            && (schedule.status === "scheduled" || schedule.status === "processing"));
          if (hasPendingSchedule) {
            showToast("이 작업물에 대기 중인 예약이 있습니다. 카드 편집 결과는 예약 시각에도 보류되므로 다시 예약해야 합니다.", "error");
          }
        })
        .catch(() => {
          // 예약 안내 조회 실패가 편집 시작을 막지는 않는다. 서버 예약 실행 안전문이
          // 결과 불일치 발행을 최종 차단한다.
        });
    }
    return true;
  }

  async function returnFromCardDeckV3(projectedChatDeck?: CardDeck) {
    const returningChatDeck = cardDeckV3?.template === "chat_bubble" && projectedChatDeck?.template === "chat_bubble"
      ? projectedChatDeck
      : null;
    let snapshot = cardDeckV3SourceSnapshot;
    // 목록 우선 열기와 단건 보강 사이에 사용자가 바로 복귀를 누를 수 있다. 이 짧은
    // 구간에서 React state가 아직 null이라는 이유로 복귀를 막으면 서버에 보존된 원문을
    // 쓸 수 없게 된다. 현재 초안의 단건 원문만 다시 확인하고, 다른 초안 값은 섞지 않는다.
    if (!returningChatDeck && !snapshot && draftIdRef.current) {
      const detail = await fetchDraftDetail({ id: draftIdRef.current });
      snapshot = (detail?.cardDeckV3SourceSnapshot as CardDeckV3SourceSnapshot | null | undefined) ?? null;
      if (snapshot) setCardDeckV3SourceSnapshot(snapshot);
    }
    if (!returningChatDeck && !snapshot) {
      showToast("카드 직접 편집 이전 내용을 찾지 못했습니다. 현재 작업은 그대로 보존했습니다.", "error");
      return;
    }
    const confirmed = await askConfirm({
      title: returningChatDeck ? "기본 말풍선 편집기로 돌아갈까요?" : "이전 카드 내용으로 복원할까요?",
      description: returningChatDeck
        ? "말풍선, 화자, 표지 문구와 표지·마지막 사진은 기본 편집기로 옮깁니다. 직접 편집에서 덧붙인 글, 스티커, 로고와 위치 작업은 사라집니다."
        : "현재 카드에서 바꾼 글, 사진, 크기, 위치와 회전 작업은 사라집니다. 직접 편집을 시작하기 전 내용으로 복원합니다.",
      confirmLabel: returningChatDeck ? "기본 말풍선 편집기로 돌아가기" : "이전 카드 내용 복원",
      cancelLabel: "현재 카드 계속 편집",
      destructive: true,
    });
    if (!confirmed) return;
    if (cardDeckAutosaveTimer.current) {
      clearTimeout(cardDeckAutosaveTimer.current);
      cardDeckAutosaveTimer.current = null;
    }
    if (returningChatDeck) {
      setCardDeck(returningChatDeck);
      replaceEditLines(deckProjection(returningChatDeck).lines);
      setCardTextPositions([]);
    } else {
      replaceEditLines(snapshot!.editLines);
      setCardTextPositions(snapshot!.cardTextPositions);
    }
    setCardDeckV3(null);
    setCardTemplateState(null);
    cardDeckV3Ref.current = null;
    cardDeckV3DirtyRef.current = true;
    const returnGeneration = cardDeckV3EditGenerationRef.current + 1;
    cardDeckV3EditGenerationRef.current = returnGeneration;
    cardDeckV3SavePendingGenerationRef.current = returnGeneration;
    setCardDeckV3SourceSnapshot(null);
    try {
      await save(
        "draft", publishReconciliations, draftIdRef.current, img, vid, returningChatDeck, null, null,
        "tail", pub, { clear: true, sourceSnapshot: null, cardTextPositions: returningChatDeck ? [] : snapshot!.cardTextPositions, templateState: null },
      );
      cardDeckV3DirtyRef.current = false;
      cardDeckV3HydratedDraftRef.current = draftIdRef.current;
      cardDeckV3SavePendingGenerationRef.current = null;
      setCardDeckAutosaveError("");
      showToast("이전 카드 내용으로 복원했습니다.", "success");
    } catch (error) {
      cardDeckV3SavePendingGenerationRef.current = null;
      setCardDeckAutosaveError(extractApiErrorMessage(error, "기본 편집 복원을 서버에 저장하지 못했습니다. 화면의 복원 내용은 유지했습니다."));
    }
  }

  /**
   * R2(2026-09-22 코드리뷰 3차): sanitizeForSave(빈 항목만 걸러 보냄)를 되돌렸다.
   * drafts/route.ts는 videoEdit를 통째 치환한다(부분 병합 아님) — 걸러낸 전체 객체를
   * 보내면 서버에 이미 저장돼 있던 항목까지 조용히 사라진다(화면엔 남아 있어 사용자는
   * 모르고 새로고침하면 사라져 있었다). 그래서 빈 항목이 있으면 저장 자체를 보류한다
   * (cardDeck의 pruneEmptyBubbles/emptyBubbleSlideNumber와 같은 패턴).
   */
  function onVideoEditChange(nextEdit: VideoEdit) {
    const previousSubtitleLines = [...(videoEditRef.current?.subtitles ?? [])]
      .sort((left, right) => left.order - right.order)
      .map((subtitle) => subtitle.text);
    const nextSubtitleLines = [...nextEdit.subtitles]
      .sort((left, right) => left.order - right.order)
      .map((subtitle) => subtitle.text);
    if (previousSubtitleLines.length !== nextSubtitleLines.length
      || previousSubtitleLines.some((line, index) => line !== nextSubtitleLines[index])) {
      // 자막 변경도 다른 글 편집과 같은 최신값 경로를 즉시 통과한다. 이후 글 화면에서
      // 더 새 값을 쓰면 그 세대가 이 값을 자연스럽게 대체한다.
      syncEditLines(nextSubtitleLines);
    }
    setVideoEdit(nextEdit);
    videoEditRef.current = nextEdit;
    if (videoEditAutosaveTimer.current) clearTimeout(videoEditAutosaveTimer.current);
    const attempt = (retriesLeft: number, delayMs = 800) => {
      videoEditAutosaveTimer.current = setTimeout(() => {
        // [보안·데이터 유실](교차 리뷰 재리뷰 BLOCK 1): 서버 값을 아직 못 읽었으면(같은
        // draft를 다른 탭·기기가 먼저 저장했을 수 있는 창) 저장을 미룬다. 짧게 재시도하고,
        // 그래도 안 되면(오프라인 등) 포기하지 않고 그냥 보낸다 — 서버가 revision으로
        // 한 번 더 막는다(드래프트 route.ts StaleVideoEditRevisionError, 409).
        if (!videoEditReconciledRef.current && retriesLeft > 0) {
          // 최초 800ms는 사용자 입력 디바운스다. 그 뒤 서버 맞춤만 남았는데 다시
          // 800ms씩 기다리면, 맞춤이 같은 순간 끝나도 자동저장이 한 박자 늦어진다.
          // 안전 잠금은 그대로 유지하고 완료 여부만 짧게 다시 확인한다.
          attempt(retriesLeft - 1, 50);
          return;
        }
        const blockedReason = videoEditIncompleteEntryReason(nextEdit);
        if (blockedReason) {
          setVideoEditAutosaveError(blockedReason);
          return;
        }
        // B(2026-09-22 코드리뷰 4차): 반대 방향의 같은 결함. 이 타이머는 영상 도메인만
        // 책임진다 — cardDeck을 그대로 실으면(pruning 없이) 빈 말풍선이 서버에 그대로
        // 박히거나, 저장 자체가 카드덱 검증 실패로 통째로 막힌다. null을 명시해 cardDeck
        // 키 자체를 payload에서 뺀다(기존 서버 값 보존).
        // 영상 저장도 수동 저장·카드 자동저장·검토 요청과 같은 save 경로를 쓴다. save가
        // 실행 시점의 본문 세대를 읽으므로 예약 당시 자막 복사본은 존재하지 않는다.
        save("draft", publishReconciliations, draftIdRef.current, img, vid, null, nextEdit)
          .then(() => {
            setEditSavedAt(new Intl.DateTimeFormat("ko-KR", { hour: "2-digit", minute: "2-digit", hour12: false }).format(new Date()));
            setVideoEditAutosaveError("");
          })
          .catch((error) => {
            // 본문 충돌은 save()가 로컬 입력과 latestBody를 함께 보관하고 전용 복구 UI를
            // 연다. 영상 오류로도 중복 표시하면 복구 성공 뒤 영상 오류가 남아 발행을
            // 계속 막으므로 이 경로에서는 별도 오류를 만들지 않는다.
            if (error instanceof ApiResponseError && (error.payload as { code?: string } | undefined)?.code === "BODY_STALE_REVISION") return;
            // MAJOR1(3차 재리뷰): 409가 나면 빠져나갈 길("서버 값 다시 불러오기")을 준다.
            if (error instanceof ApiResponseError && (error.payload as { code?: string } | undefined)?.code === "VIDEO_EDIT_STALE_REVISION") {
              setVideoEditConflict(true);
              setVideoEditAutosaveError("다른 곳에서 더 최신으로 저장된 영상 편집이 있습니다. 최신 값을 다시 불러온 뒤 다시 시도해 주세요.");
              return;
            }
            setVideoEditAutosaveError(extractApiErrorMessage(error, "자동 저장하지 못했습니다. 잠시 후 다시 시도해 주세요."));
          });
      }, delayMs);
    };
    attempt(10);
  }

  const cardDeckV3HydrationBlockedReason = cardDeckV3DetailBlockedReason(cardDeckV3DetailStatus);
  const cardDeckV3PublishBlocked = Boolean(cardDeckV3HydrationBlockedReason) || (Boolean(cardDeckV3) && !CARD_DECK_V3_RENDER_ENABLED);

  if (activeRoom === "edit") {
    // 초안 목록 조회는 편집 데이터의 유일한 소스가 아니다. localStorage 복원값이나 이미
    // 생성된 미디어가 있으면 목록 재조회가 실패해도 편집기를 그대로 유지한다. 저장 실패는
    // 아래 autosaveError 경로에서 별도로 보여 준다.
    const hasEditableContent = resolvedEditLines.some((line) => line.trim().length > 0)
      || Boolean(vid?.file || vid?.url || img?.file || img?.url || cardDeck || videoEdit)
      || Boolean(cardDeckV3);
    const editRoomState = !hist && !hasEditableContent
      ? (histError ? "error" : "loading")
      : "default";
    const currentVideoUrl = vid?.url || vid?.file || "";
    const currentVideoFilename = videoResultFilename(vid);
    const previewSource = currentVideoFilename
      ? resolveUnbakedVideoSource({
        currentFilename: currentVideoFilename,
        currentUrl: currentVideoUrl,
        lineage: {
          subtitlesBaked: vid?.subtitlesBaked,
          state: vid?.subtitleLineageState
            ?? (vid?.subtitlesBaked === true ? "baked" : vid?.subtitlesBaked === false ? "unbaked" : "unknown"),
          editSource: vid?.editSource,
        },
        introOutro: videoEdit?.introOutro ?? null,
      })
      : null;
    const previewContainsBakedText = Boolean(previewSource && !previewSource.ok && (
      vid?.subtitlesBaked === true
      || vid?.subtitleLineageState === "baked"
      || vid?.subtitleLineageState === "unknown"
      || (vid?.subtitleLineageState === undefined && vid?.subtitlesBaked === undefined)
      || isLegacyIntroOutroBakedResult(currentVideoFilename, videoEdit?.introOutro ?? null)
    ));
    return (
    <div className="px-stack-section py-pad-inset">
      {showWizard && activeWorkspace ? <LearningCardWizard workspaceId={activeWorkspace.id} workspaceName={activeWorkspace.name} onSaved={(info, completed) => { setLearningInfo(info); if (completed) { setShowWizard(false); mutateBrand(); showToast("학습 정보를 배웠습니다"); } else { setLearningFlash((value) => value + 1); } }} onClose={() => setShowWizard(false)} /> : null}
      {roomHeader}
      <EditRoom
        workspaceId={activeWorkspace?.id}
        state={activeWorkspace ? editRoomState : "default"}
        onRetry={() => { void mutateHist(); }}
        lines={resolvedEditLines}
        onLinesChange={syncEditLines}
        kind={editKind}
        onKindChange={changeEditKind}
        initialFormat={editFormat}
        onFormatChange={setEditFormat}
        previewReady={editKind === "video" ? Boolean(vid?.file) : editKind === "card" ? Boolean(img?.file) : false}
        previewImageUrl={liveTextCardPreview?.[0] || img?.file || img?.url || null}
        previewImageUrls={liveTextCardPreview ?? img?.imageUrls ?? null}
        cardTextEmbedded={img?.textEmbedded === true}
        cardTextSourceRecoverable={img?.textSourceRecoverable !== false}
        previewVideoUrl={previewSource?.ok ? previewSource.url : currentVideoUrl || null}
        videoSourceFilename={previewSource?.ok ? previewSource.filename : currentVideoFilename || null}
        previewContainsBakedText={previewContainsBakedText}
        cardTextPositions={cardTextPositions}
        onCardTextPositionsChange={setCardTextPositions}
        cardDeck={cardDeck}
        onCardDeckChange={onCardDeckChange}
        cardDeckV3={cardDeckV3}
        cardTemplateState={cardTemplateState}
        onCardDeckV3Change={onCardDeckV3Change}
        requestedCardSlide={requestedCardSlide}
        onStartCardDeckV3={cardDeckV3EntryEnabled(CARD_DECK_V3_RENDER_ENABLED, {
          hasCardDeckV2: Boolean(cardDeck),
          cardDeckTemplate: cardDeck?.template ?? null,
          textEmbedded: img?.textEmbedded === true,
        }) ? startCardDeckV3 : undefined}
        cardDeckV3EntryBlockedReason={cardDeckV3HydrationBlockedReason ?? (cardDeck ? null : plainCardDeckV3EntryBlockReason(resolvedEditLines))}
        onRetryCardDeckV3Detail={cardDeckV3DetailStatus === "error" ? retryCardDeckV3Detail : undefined}
        onReturnFromCardDeckV3={(projectedChatDeck) => { void returnFromCardDeckV3(projectedChatDeck); }}
        videoEdit={videoEdit}
        onVideoEditChange={onVideoEditChange}
        onOpenCreate={openCreateForEditKind}
        onOpenPublish={moveToPublish}
        publishBlockedReason={cardDeckV3 && !CARD_DECK_V3_RENDER_ENABLED ? CARD_DECK_V3_PUBLISH_BLOCK_MESSAGE : cardDeckV3HydrationBlockedReason}
        lastSavedAt={editSavedAt}
        moveBusy={moveToPublishBusy}
        autosaveError={[editAutosaveError, cardDeckAutosaveError, videoEditAutosaveError].filter(Boolean).join(" ")}
        cardDeckAutosaveError={cardDeckAutosaveError}
        videoEditAutosaveError={videoEditAutosaveError}
        videoEditConflict={videoEditConflict}
        onVideoEditReload={() => { if (draftIdRef.current) void reconcileVideoEditFromServer(draftIdRef.current, true); }}
        videoEditReconciling={videoEditReconciling}
        bodyEditConflict={Boolean(bodyRevisionConflict)}
        bodyConflictViewingLatest={Boolean(bodyRevisionConflict?.viewingLatest)}
        bodyConflictResolving={bodyConflictResolving}
        onBodyConflictLoadLatest={loadLatestBodyAfterConflict}
        onBodyConflictReapply={() => { void reapplyLocalBodyAfterConflict(); }}
      />
      {exportPanel && activeWorkspace ? (
        <ExportPanel
          tenantId={activeWorkspace.id}
          draftId={exportPanel.draftId}
          kind={exportPanel.kind}
          onClose={() => setExportPanel(null)}
          onOpenEmptySlide={(slide) => {
            setExportPanel(null);
            changeEditKind("card");
            setRequestedCardSlide({ id: slide.item_key, requestId: Date.now() });
            showToast(`${slide.number}장이 비어 있습니다. 내용을 채운 뒤 다시 내보내 주세요.`, "error");
          }}
          onOpenPublish={async (receipt) => {
            setExportPanel(null);
            changeRoom("publish");
            setPublishExportPinNotice(null);
            try {
              const response = await fetch(`/api/studio/drafts/${encodeURIComponent(exportPanel.draftId)}/enqueue`, {
                method: "POST",
                headers: { ...authHeaders(), "Content-Type": "application/json" },
                body: JSON.stringify({
                  tenant_id: activeWorkspace.id,
                  purpose: "publish_room",
                  expected_export_id: receipt.exportId,
                  expected_source_hash: receipt.sourceHash,
                }),
              });
              const payload = await response.json().catch(() => ({})) as {
                error?: string;
                code?: string;
                export_id?: string;
                source_hash?: string;
                pin_status?: "publish_ready" | "unpinned";
                post?: {
                  id?: string;
                  imageUrl?: string | null;
                  imageUrls?: string[] | null;
                  videoFilename?: string | null;
                  videoUrl?: string | null;
                };
              };
              if (!response.ok) throw new Error(payload.error || "내보내기 판을 고정하지 못했습니다.");
              if (payload.pin_status === "unpinned") {
                throw new Error(payload.error || "내보내기 판을 고정하지 못했습니다.");
              }
              if (payload.export_id !== receipt.exportId || payload.source_hash !== receipt.sourceHash) {
                throw new Error("고정된 내보내기 판이 화면에서 확인한 판과 다릅니다.");
              }
              const pinnedPost = payload.post;
              if (pinnedPost?.id) setReviewQueueId(pinnedPost.id);
              if (exportPanel.kind === "card_deck") {
                const imageUrls = pinnedPost?.imageUrls?.filter(Boolean) ?? [];
                const imageUrl = imageUrls[0] ?? pinnedPost?.imageUrl ?? null;
                if (imageUrl) {
                  setImg((current) => ({
                    ...(current ?? { topicKey: mediaTopicKey(idea) }),
                    url: imageUrl,
                    file: imageUrl,
                    imageUrls: imageUrls.length ? imageUrls : [imageUrl],
                    textEmbedded: true,
                    textSourceRecoverable: true,
                  }));
                }
              } else if (pinnedPost?.videoUrl) {
                setVid((current) => current ? {
                  ...current,
                  url: pinnedPost.videoUrl!,
                  file: pinnedPost.videoUrl!,
                  filename: pinnedPost.videoFilename ?? current.filename,
                } : current);
              }
              const message = "내보내기 판을 고정했고 발행실도 같은 파일을 미리 봅니다.";
              setPublishExportPinNotice({ status: "pinned", message });
              showToast("발행실로 이동했습니다. 내보내기 판 기록도 완료했습니다", "success");
            } catch (error) {
              const reason = error instanceof Error ? error.message : "내보내기 판을 고정하지 못했습니다.";
              const message = `발행실로 이동했습니다. 내보내기 판은 고정되지 않았습니다: ${reason}`;
              setPublishExportPinNotice({ status: "unpinned", message });
              showToast(message, "error");
            }
          }}
        />
      ) : null}
      <ConfirmDialog request={confirmRequest} onConfirm={() => settleConfirm(true)} onCancel={() => settleConfirm(false)} />
    </div>
  );
  }

  if (activeRoom === "publish") return (
    <div className="px-stack-section py-pad-inset">
      {showWizard && activeWorkspace ? <LearningCardWizard workspaceId={activeWorkspace.id} workspaceName={activeWorkspace.name} onSaved={(info, completed) => { setLearningInfo(info); if (completed) { setShowWizard(false); mutateBrand(); showToast("학습 정보를 배웠습니다"); } else { setLearningFlash((value) => value + 1); } }} onClose={() => setShowWizard(false)} /> : null}
      {showRepo && activeWorkspace ? <RepoConnect workspace={activeWorkspace} onSynced={() => { mutateBrand(); showToast("브랜드 가이드 갱신됨"); }} onClose={() => setShowRepo(false)} /> : null}
      {roomHeader}
      {/*
        2026-09-16 실측(j.the.great.investor): 시작 스트립 "채널 연결 0/15" 가 같은 세션의
        다른 화면(예: 생성실)에서는 "3/15" 로 떴다. 여기서 `connectedTargets`(이 발행실
        화면의 대량 발행 대상 채널만 세는 좁은 집합)를 강제로 얹어 GettingStartedStrip 의
        진짜 소스(channel-config, 15개 전체)를 덮어썼기 때문이다. 소스를 하나로 통일한다
        — 이 화면도 GettingStartedStrip 자체 조회 결과를 그대로 쓴다.
      */}
      <GettingStartedStrip
        learningFilled={countFilledUserSlots(learningInfo, { guide })}
        learningTotal={LEARNING_USER_SLOT_TOTAL}
        onOpenLearning={() => setShowWizard(true)}
      />
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
      {/*
        2026-09-14 실측: 카드를 여러 장 만들어도 대부분의 채널에는 첫 장만 올라간다.
        우리 발행 코드가 여러 장을 실제로 보낼 수 있는 곳은 인스타그램뿐이다.
        받을 수 있는 척하고 조용히 버리면 그건 거짓말이다. 몇 장 중 몇 장이 나가는지 밝힌다.
      */}
      {limitedChannelNotice(publishTargets, publishDeck.length, (platform) => LABEL[platform as keyof typeof LABEL] ?? platform) ? (
        <p data-testid="publish-image-capacity" role="status" className="mb-pad-inset break-keep rounded-surface border border-warning/40 bg-warning/10 px-stack py-stack-tight text-caption text-warning">
          {limitedChannelNotice(publishTargets, publishDeck.length, (platform) => LABEL[platform as keyof typeof LABEL] ?? platform)}
        </p>
      ) : null}
      <section data-testid="publish-learning-context" className="mb-pad-inset rounded-surface border border-accent/30 bg-accent-soft p-stack">
        <div className="flex flex-wrap items-start gap-stack">
          <div className="mr-auto min-w-0">
            <b className="block text-body-sm text-text">이 작업 공간이 배운 기준</b>
            <p className="mt-micro break-keep text-caption text-muted">다음 생성과 다시 만들기에 이어집니다. 지금 본문은 아래 미리보기에서 확인하고, 바꿀 내용은 편집실에서 고칩니다.</p>
          </div>
          <Button size="sm" variant="secondary" onClick={() => setShowWizard(true)}>학습 정보 고치기</Button>
        </div>
      </section>
      <section data-room="publish" className="grid gap-stack-section pb-wide lg:grid-cols-[minmax(0,1fr)_20rem] lg:pb-none">
        <div className="min-w-0 space-y-region">
          {/*
            2026-09-07 실계정 E2E 에서 찾았다. 본문 없는 작업물을 고르면 발행실이 "0/500" 인
            채로 아무 말도 하지 않았다. 왜 비었는지도, 어디로 가야 하는지도 없다. 조용한
            실패다(ADR-007). 비었으면 그 사실과 빠져나갈 길을 같이 준다.
          */}
          {!hasPublishableBody ? (
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
            {/*
              2026-10-03 독립 리뷰 m4: 큰 숫자(이 <b>)는 publishTargets.length를 썼는데
              바로 아래 괄호 이름 목록은 publishNameTargets(이미 완료한 곳 제외)를 썼다 —
              숫자와 이름이 서로 다른 집합을 가리켜 어긋날 수 있었다. 숫자와 이름이 항상
              같은 출처(publishNameTargets)를 쓰게 한다.
            */}
            <b className="text-lead text-accent">{accountsLoaded ? publishNameTargets.length : selectedTargets.length}곳</b>
            <span data-testid="publish-availability" className="mr-auto text-caption text-subtle">
              {accountsLoaded
                ? `선택 ${selectedTargets.length}곳 · 실제 발행 가능 ${publishNameTargets.length}곳${publishNameTargets.length ? ` (${channelNameList(publishNameTargets)})` : ""} · 연결된 채널 ${connectedTargets.length}곳`
                : "발행 가능한 계정을 확인하는 중입니다"}
            </span>
            <Button
              size="sm"
              data-testid="publish-select-all"
              onClick={selectAllChannels}
              disabled={!accountsLoaded || publishableTargets.length === 0 || publishTargets.length === publishableTargets.length}
            >
              발행 가능한 {publishableTargets.length}곳 전부 고르기
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
          {img?.file || vid?.file ? (
            <section data-testid="publish-selected-media" aria-label="선택한 초안 실제 미디어" className="rounded-surface border border-border bg-surface p-stack">
              <div className="mb-stack-tight flex flex-wrap items-center gap-stack-tight">
                <b className="mr-auto text-body text-text">선택한 초안 미디어</b>
                <span className="text-caption text-subtle">발행할 이미지와 영상을 먼저 확인합니다</span>
              </div>
              <div className="grid grid-cols-1 gap-stack sm:grid-cols-2">
                {img?.file ? (
                  <figure className="min-w-0">
                    <DeliveredMedia type="image" src={img.file} tenantId={activeWorkspace?.id} testId="publish-selected-image" alt="선택한 초안 이미지" className="h-48 w-full rounded-control bg-surface-2 object-cover" />
                    <figcaption className="mt-micro text-caption text-muted">이미지</figcaption>
                  </figure>
                ) : null}
                {vid?.file ? (
                  <figure className="min-w-0">
                    <DeliveredMedia type="video" src={vid.file} tenantId={activeWorkspace?.id} testId="publish-selected-video" poster={img?.file} preload="metadata" className="h-48 w-full rounded-control bg-player-surface object-cover" />
                    <figcaption className="mt-micro text-caption text-muted">영상</figcaption>
                  </figure>
                ) : null}
              </div>
            </section>
          ) : null}
          {/*
            2026-10-03 독립 리뷰 MINOR-g 근본원인: 운영 사고의 실제 뿌리는 "이전 세션의
            선택이 표시 없이 되살아난 것"이다. 되살아난 직후(사용자가 아직 체크박스를
            직접 건드리기 전)에는 이 배지로 "이건 네가 지금 고른 게 아니라 전에 고른
            거다"를 알린다. 사용자가 체크박스를 한 번이라도 누르면(onCheckedChange 등)
            restoredSelectionNotice가 꺼지고 이 배지도 사라진다.
          */}
          {restoredSelectionNotice && publishNameTargets.length > 0 ? (
            <p data-testid="publish-restored-selection-notice" role="status" className="rounded-control border border-warning/30 bg-warning/10 p-stack text-caption text-warning">
              지난번 선택 유지: {channelNameList(publishNameTargets)}
            </p>
          ) : null}
          {publishExportPinNotice ? (
            <p
              data-testid="publish-export-pin-notice"
              data-pin-status={publishExportPinNotice.status}
              role="status"
              className={`rounded-control border p-stack text-caption ${publishExportPinNotice.status === "pinned" ? "border-success/30 bg-success/10 text-success" : "border-warning/30 bg-warning/10 text-warning"}`}
            >
              {publishExportPinNotice.message}
            </p>
          ) : null}
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
                  const cls = `rounded-pill border px-stack-tight py-micro text-caption ${status === "done" ? "border-success/30 bg-success/10 text-success" : status === "failed" ? "border-danger/30 bg-danger/10 text-danger" : status === "doing" ? "border-warning/30 bg-warning/10 text-warning" : status === "unknown" ? "border-border bg-surface-2 text-text" : "border-border bg-surface-2 text-subtle"}`;
                  // 2026-09-16 실측(j.the.great.investor): "지금 발행"을 다시 누르면 서버가
                  // dedupe 로 옛 글을 돌려주는데, "완료" + "새 창" 링크만 보여 새로 올라간
                  // 것처럼 읽혔다. 이미 있던 것이면 그 사실과(있으면) 발행 시각을 말한다.
                  const already = pub.already[key];
                  const alreadyLabel = already
                    ? `이미 올라간 글입니다${typeof already === "string" ? ` (${new Date(already).toLocaleString("ko-KR")})` : ""}`
                    : "";
                  const value = already
                    ? `${LABEL[key]} · ${alreadyLabel}`
                    : `${status === "done" ? "완료 " : status === "failed" ? "실패 " : status === "doing" ? "발행 중 " : status === "unknown" ? "결과 확인 중 " : ""}${LABEL[key]}`;
                  return status === "done" && pub.urls[key] ? <a key={key} href={pub.urls[key]} target="_blank" rel="noopener noreferrer" className={cls} title={already ? alreadyLabel : "게시물 보기"}>{value}<span className="sr-only"> 새 창</span></a> : <span key={key} className={cls}>{value}{(status === "failed" || status === "unknown") && pub.errors[key] ? <span className="ml-micro"><span>{pub.errors[key]}</span></span> : null}</span>;
                })}</div>
              </div>
              {hasPublishedResult ? <Link href="/performance" className="shrink-0 rounded-control bg-accent px-stack py-stack-tight text-body-sm font-semibold text-accent-fg">성과실에서 결과 보기</Link> : null}
            </div>
          ) : null}
          {showSchedule && activeWorkspace && !cardDeckV3PublishBlocked ? (
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
          {cardDeckV3PublishBlocked ? (
            <div role="alert" className="flex flex-wrap items-center gap-stack-tight rounded-control border border-warning bg-warning-soft p-stack text-caption text-warning" data-card-deck-v3-publish-block>
              <span>{cardDeckV3 && !CARD_DECK_V3_RENDER_ENABLED ? CARD_DECK_V3_PUBLISH_BLOCK_MESSAGE : cardDeckV3HydrationBlockedReason}</span>
              {!cardDeckV3 && cardDeckV3DetailStatus === "error" ? <Button size="sm" variant="secondary" onClick={retryCardDeckV3Detail}>다시 시도</Button> : null}
            </div>
          ) : null}
          {hasPublishableBody ? (
            <div className="card space-y-stack p-stack">
              <div className="flex flex-wrap items-center gap-stack">
              <b className="mr-auto min-w-0 truncate text-body text-text">{idea || "현재 작업물"}</b>
              <Button onClick={saveDraftWithNotice}>임시 저장하기</Button>
              <Button onClick={requestReview} disabled={reviewBusy || cardDeckV3PublishBlocked}>{reviewBusy ? "보내는 중" : "검토 요청하기"}</Button>
              {/*
                계정을 아직 못 불러온 동안에는 고른 수를 그대로 보여 준다. 그때는 몇 곳에
                올릴 수 있는지 알 수 없고, 0곳이라고 쓰면 없는 사실을 말하는 것이 된다.
                다 불러온 뒤에는 실제로 올라갈 수만 센다. 고른 수를 그대로 쓰면 연결이
                끊긴 채널까지 세어 "2곳에 발행"이라 해 놓고 아무 데도 안 올라간다.
              */}
              <Button variant="primary" onClick={publish} disabled={cardDeckV3PublishBlocked || pub.running || !accountsLoaded || publishTargets.length === 0}>선택한 {accountsLoaded ? publishTargets.length : selectedTargets.length}곳에 지금 발행{accountsLoaded && selectedTargets.length > publishTargets.length ? ` (올릴 수 없는 ${selectedTargets.length - publishTargets.length}곳 제외)` : ""}</Button>
              {/*
                2026-10-02 운영 사고(결함 D): 버튼 문구는 숫자만 말해서("선택한 1곳에 지금
                발행"), 미리보기 탭(보기 필터)에서 방금 Instagram 을 봐 놓고 실제로는 이전
                세션에 체크된 채 남은 Threads 1곳이 발행 대상이라는 사실이 전혀 안 드러났다.
                "선택한 1곳에 지금 발행"이라는 버튼 접근성 이름 문자열은 수십 개 기존 테스트가
                고정 계약으로 쓰고 있어(studio-publish-ui.test.tsx) 버튼 글자 자체는 바꾸지
                않는다. 대신 버튼 바로 옆에 채널 이름을 보이는 배지로 덧붙인다 — 미리보기
                탭과 실제 선택이 어긋나면 이 배지가 그 자리에서 드러낸다. 이름은 위 배너와
                같은 publishNameTargets(단일 정본, MINOR-h)에서 가져온다.
              */}
              {publishNameTargets.length > 0 ? (
                <span data-testid="publish-now-target-names" className="text-caption text-subtle">
                  ({channelNameList(publishNameTargets)})
                </span>
              ) : null}
              {activeWorkspace ? <Button variant={showSchedule ? "primary" : "secondary"} onClick={() => setShowSchedule((value) => !value)} disabled={cardDeckV3PublishBlocked}>예약 발행</Button> : null}
              </div>
              {/*
                2026-10-03 독립 리뷰 m1: 체크는 했는데 publishGuard에 걸려 지금 발행
                대상에서 빠진 채널을 이름+이유로 보여준다. Threads+TikTok을 섞어
                고르고 TikTok 공개 범위를 안 고르면 "TikTok: TikTok 공개 범위를 먼저
                선택해주세요."가 바로 이 자리에 뜬다.
              */}
              {guardExcludedSelections.length ? (
                <p data-testid="publish-guard-excluded" role="status" className="break-keep rounded-control border border-warning/30 bg-warning/10 p-stack text-caption text-warning">
                  {guardExcludedSelections.map((entry) => `${LABEL[entry.platform]}: ${entry.reason}`).join(" · ")}
                  {" (지금 발행 대상에서 빠집니다.)"}
                </p>
              ) : null}
              {/*
                2026-09-16 실측(j.the.great.investor): X 본문이 280 가중 문자를 넘으면
                토스트만 뜨고 사라져 사용자는 발행 단추가 안 눌리는 줄 알았다. 발행 단추
                옆에 계속 남는 자리에 어느 채널이 왜 막혔는지와 바로 고치는 단추를 둔다.
                이제 한도 넘는 곳은 발행 대상에서 빠지고 나머지는 그대로 올라간다.
              */}
              {publishBlockedEntries.length ? (
                <div data-testid="publish-blocked-channels" role="alert" className="rounded-control border border-warning/30 bg-warning/10 p-stack text-caption text-warning">
                  <p className="break-keep">
                    {publishBlockedEntries.map((entry) => `${LABEL[entry.platform]}: ${entry.issue.message}`).join(" · ")}
                    {" (한도를 넘은 곳은 발행에서 빠집니다.)"}
                  </p>
                  <Button size="sm" className="mt-stack-tight" onClick={trimOverLimitChannels}>한도 넘는 곳만 줄이기</Button>
                </div>
              ) : null}
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
                  <div className="grid grid-cols-1 gap-stack-section" data-publish-preview-stack>
                    {visiblePlatforms.map((platform) => (
                  <div key={platform} data-room-preview={platform} className="flex min-w-0 flex-col rounded-surface border border-border bg-surface p-stack">
                    {(() => {
                      const guard = publishGuard(platform);
                      const accountUnavailable = Boolean(accountLoadPending[platform]) || usableAccounts(platform).length === 0;
                      return (
                    <>
                    <PlatformPreview
                      platform={platform}
                      text={text || {}}
                      media={{
                        imgUrl: img?.file,
                        imgUrls: planChannelImages(platform, publishDeck).images,
                        vidUrl: vid?.file,
                      }}
                      tenantId={activeWorkspace?.id}
                      editor={previewEditor(platform)}
                      headerRight={
                        /*
                          2026-09-23 실수 원장 count:9 봉합: 이 마크업은 측정 하네스
                          (qa-alignment-harness)와 손으로 두 번 베껴 유지되다 드리프트로
                          "delta 0px 수렴" 거짓 보고를 다섯 라운드 냈다. 이제 화면과 하네스가
                          같은 PublishHeaderControls 를 렌더한다. 첫 행(발행 · 계정 · 계정 관리)과
                          영상 공용 둘째 행(표지 시점)은 그 컴포넌트가 단독으로 책임진다.
                        */
                        <PublishHeaderControls
                          platform={platform}
                          label={LABEL[platform]}
                          publishSupported={PUBLISH_SUPPORTED.has(platform)}
                          accountSelectable={ACCOUNT_SELECTABLE.has(platform)}
                          checked={Boolean(includes[platform]) && !guard.disabledReason && !accountUnavailable}
                          checkboxDisabled={accountUnavailable || Boolean(guard.disabledReason)}
                          onCheckedChange={(next) => { setIncludes((current) => ({ ...current, [platform]: next })); setRestoredSelectionNotice(false); }}
                          coverSeconds={coverSeconds[platform] ?? DEFAULT_COVER_SECONDS}
                          onCoverSecondsChange={(next) => setCoverSeconds((current) => ({ ...current, [platform]: next }))}
                          accountsLoading={Boolean(accountLoadPending[platform])}
                          accountLoadError={Boolean(accountLoadErrors[platform])}
                          accounts={(accountsByPlatform[platform] || []).map((account) => ({ id: account.id, label: account.label, isDefault: Boolean(account.is_default) }))}
                          selectedAccountId={defaultConnectedAccount(platform)?.id ?? ""}
                          channelHref={channelHref(platform)}
                          disabledReason={guard.disabledReason}
                          createHref={guard.createHref}
                          createActionLabel={guard.createActionLabel}
                        />
                      }
                    />
                    {/*
                      2026-10-03 운영 사고(9444 회원 계정): TikTok 발행이 공개 범위
                      (privacy_level) 미선택으로 항상 400 실패했다. app/videos/page.tsx의
                      TikTok 패널과 같은 계약(creator-info의 privacyLevels, 상호작용
                      토글, AI 생성 공개)을 여기에도 둔다. TikTok 정책상 공개 범위는
                      기본값을 미리 골라주지 않는다 — "선택" 옵션만 있고 고르지 않으면
                      위 publishGuard가 발행을 막는다.
                    */}
                    {/*
                      2026-10-03 독립 리뷰 m2: creator-info 조회가 실패(404/502)하면
                      패널이 아예 안 뜨고 위 publishGuard의 "공개 범위를 먼저
                      선택해주세요."만 남아 — 고를 칸이 없는 막다른 길이었다. 계정은
                      연결됐는데 조회가 실패했음을 여기서도 직접 말하고 재연결 링크를
                      준다(헤더의 disabledReason과 중복이지만, 패널 자리 자체가 비어
                      보이지 않게 한다).
                    */}
                    {platform === "tiktok" && tiktokCreatorFailed ? (
                      <div data-testid="tiktok-creator-info-error" role="alert" className="mt-stack-tight rounded-control border border-danger/30 bg-danger-soft p-stack text-caption text-danger">
                        TikTok 계정 정보를 확인하지 못했습니다. 계정을 다시 연결해주세요.
                        <Link
                          href={channelHref("tiktok")}
                          className="mt-stack-tight inline-flex min-h-control-touch items-center rounded-control border border-danger bg-surface px-stack-tight text-caption font-semibold text-danger hover:bg-surface-2"
                        >
                          TikTok 다시 연결하기
                        </Link>
                      </div>
                    ) : null}
                    {platform === "tiktok" && tiktokCreator ? (
                      <div data-testid="tiktok-privacy-panel" className="mt-stack-tight grid grid-cols-2 gap-stack-tight rounded-control border border-border bg-surface-2 p-stack text-caption">
                        {/*
                          m3(TikTok Content Sharing Guidelines §4): "The upload page
                          must display the creator's nickname, so users are aware of
                          which TikTok account the content will be uploaded to."
                        */}
                        <p className="col-span-2 text-text">업로드 대상 계정: <b>@{tiktokCreator.username}</b></p>
                        <label className="col-span-2 text-subtle">
                          공개 범위
                          <select
                            data-testid="tiktok-publish-privacy-select"
                            aria-label="TikTok 공개 범위"
                            value={tiktokPrivacy}
                            onChange={(event) => setTiktokPrivacy(event.target.value)}
                            className="mt-micro w-full rounded-chip border border-border bg-surface p-stack-tight text-text"
                          >
                            <option value="">선택</option>
                            {tiktokAllowedPrivacyLevels.map((privacy) => <option key={privacy} value={privacy}>{privacy}</option>)}
                          </select>
                          {tiktokDisclosureEnabled && tiktokBrandContent ? (
                            <span className="mt-micro block text-caption text-subtle">
                              유료 파트너십을 공개하면 비공개로는 올릴 수 없습니다(전체공개·친구공개만 가능).
                            </span>
                          ) : null}
                        </label>
                        <label>
                          <input
                            type="checkbox"
                            aria-label="TikTok 댓글 끄기"
                            checked={tiktokDisableComment}
                            disabled={tiktokCreator.commentDisabled}
                            onChange={(event) => setTiktokDisableComment(event.target.checked)}
                          /> 댓글 끄기
                        </label>
                        <label>
                          <input
                            type="checkbox"
                            aria-label="TikTok 듀엣 끄기"
                            checked={tiktokDisableDuet}
                            disabled={tiktokCreator.duetDisabled}
                            onChange={(event) => setTiktokDisableDuet(event.target.checked)}
                          /> 듀엣 끄기
                        </label>
                        <label>
                          <input
                            type="checkbox"
                            aria-label="TikTok 스티치 끄기"
                            checked={tiktokDisableStitch}
                            disabled={tiktokCreator.stitchDisabled}
                            onChange={(event) => setTiktokDisableStitch(event.target.checked)}
                          /> 스티치 끄기
                        </label>
                        <label>
                          <input
                            type="checkbox"
                            aria-label="TikTok AI 생성 영상"
                            checked={tiktokAiGenerated}
                            onChange={(event) => setTiktokAiGenerated(event.target.checked)}
                          /> AI 생성 영상
                        </label>
                        {/*
                          m3: "Content Disclosure Setting" — "Your brand"(오가닉)과
                          "Branded content"(유료 파트너십) 두 체크박스. 공개를 켠
                          뒤에야 둘을 고를 수 있다(둘 다 사람이 직접 켜는 선택이다).
                        */}
                        <label className="col-span-2 border-t border-border pt-stack-tight text-text">
                          <input
                            type="checkbox"
                            aria-label="TikTok 상업 콘텐츠 공개"
                            checked={tiktokDisclosureEnabled}
                            onChange={(event) => {
                              const next = event.target.checked;
                              setTiktokDisclosureEnabled(next);
                              if (!next) { setTiktokBrandOrganic(false); setTiktokBrandContent(false); }
                            }}
                          /> 상업 콘텐츠 공개
                        </label>
                        {tiktokDisclosureEnabled ? (
                          <>
                            <label>
                              <input
                                type="checkbox"
                                aria-label="TikTok 내 브랜드 홍보"
                                checked={tiktokBrandOrganic}
                                onChange={(event) => setTiktokBrandOrganic(event.target.checked)}
                              /> 내 브랜드 홍보
                            </label>
                            <label>
                              <input
                                type="checkbox"
                                aria-label="TikTok 유료 파트너십"
                                checked={tiktokBrandContent}
                                onChange={(event) => setTiktokBrandContent(event.target.checked)}
                              /> 유료 파트너십
                            </label>
                            {tiktokDisclosureError ? (
                              <p role="alert" className="col-span-2 text-danger">{tiktokDisclosureError}</p>
                            ) : null}
                          </>
                        ) : null}
                        {/*
                          m3: 음악 이용 확인 — TikTok이 요구하는 영문 원문을 조합별로
                          그대로 보존한다(tiktok-disclosure.ts musicUsageConfirmationText).
                        */}
                        <p data-testid="tiktok-music-usage-confirmation" className="col-span-2 text-subtle">
                          {musicUsageConfirmationText(tiktokDisclosureState)}
                        </p>
                      </div>
                    ) : null}
                    </>
                      );
                    })()}
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
            <div className="max-w-[90%] rounded-surface rounded-tl-chip border border-border bg-surface p-stack text-body-sm text-text" data-empty-next={!hasPublishableBody ? "publish" : undefined}>
              {hasPublishableBody
                ? `일곱 칸을 하나씩 고치지 않으셔도 됩니다. 지금 ${selectedTargets.length}곳이 골라져 있습니다.`
                : "발행할 작업물을 먼저 가져와 주세요."}
            </div>
            {hasPublishableBody ? (
              <div className="flex flex-wrap gap-stack-tight" aria-label="발행 담당 빠른 답장">
                <Button size="sm" onClick={publish} disabled={cardDeckV3PublishBlocked || !accountsLoaded || publishTargets.length === 0 || pub.running}>{publishRetryOnly ? "실패한 곳만 다시 발행" : "지금 발행하기"}</Button>
                <Button size="sm" onClick={() => setShowSchedule(true)} disabled={cardDeckV3PublishBlocked}>시간은 내가 골라 줘</Button>
                <Button size="sm" onClick={requestReview} disabled={cardDeckV3PublishBlocked}>먼저 검토받기</Button>
              </div>
            ) : (
              <Button variant="primary" onClick={() => changeRoom("create")}>생성실 열기</Button>
            )}
          </div>
          {hasPublishableBody ? (
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
                  {reconciliationError ? <p className="mt-stack-tight" role="alert">{reconciliationError}</p> : null}
                  <p className="mt-stack-tight">증표가 만료되었거나 기록 복구가 실패하면 다시 게시하지 말고 외부 게시 주소와 작업물 번호를 준비해 지원에 문의해 주세요.</p>
                  <a className="mt-stack-tight inline-flex text-accent underline" href="mailto:code0to1@gmail.com?subject=%EB%B0%9C%ED%96%89%20%EA%B8%B0%EB%A1%9D%20%EB%B3%B5%EA%B5%AC%20%EC%9A%94%EC%B2%AD" data-testid="publish-recovery-support">복구 문의 메일 열기</a>
                </div>
              ) : null}
              <Stack direction="horizontal" gap={8} wrap>
                <Button size="sm" data-testid="publish-bulk-select-all" onClick={selectAllChannels} disabled={!accountsLoaded || publishableTargets.length === 0}>발행 가능한 곳 전부 고르기</Button>
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
