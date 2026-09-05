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
import { useUIStore, type StudioRoom } from "@/store/ui-store";
import { LearningCardWizard } from "@/components/studio/LearningCardWizard";
import { LearningStatus } from "@/components/studio/LearningStatus";
import { countFilledLearningSlots, readLearningInfo, type LearningInfo } from "@/components/studio/learning-info";
import { RepoConnect } from "@/components/studio/RepoConnect";
import { SchedulePanel } from "@/components/studio/SchedulePanel";
import { trackEvent, type AnalyticsChannel } from "@/lib/analytics/events";
import { authHeaders } from "@/lib/auth";
import { CHANNEL_TEXT_LIMITS, countTextCharacters } from "@/lib/channel-text-limits";
import { Button } from "@/components/shared/Button";
import { RoomHeader } from "@/components/shared/RoomHeader";
import { Field } from "@/components/shared/Field";
import { Stack } from "@/components/shared/Stack";
import { GettingStartedStrip } from "@/components/shared/GettingStartedStrip";
import { SCHEDULABLE_PLATFORMS } from "@/lib/constants";
import type { CardTextPosition } from "@/components/studio/EditPreview";
import type { EditorHandoff } from "@/lib/studio/editor-handoff";
import { resolveStudioRoomFromSearch, shouldLoadPublishResources } from "@/lib/studio/room-routing";
import {
  HASHTAG_BUDGET,
  parseHashtags,
  parsePublishCommand,
  spreadHashtags,
  trimAllOverLimit,
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
  validatePlatformPublish,
  type PlatformPublishInput,
} from "@/lib/studio/platform-publish-fields";
import type { CurrentWork } from "@/lib/studio/current-work";
import { attemptRequiredDraftPersistence } from "@/lib/studio/required-draft-persistence";

// SNS-007: /api/publish가 실제로 계정별 발행을 받는 4개 플랫폼(threads/x/facebook/instagram)만
// 계정 셀렉터를 노출한다. shorts/reels/tiktok은 /api/publish 미지원(실발행 분기 없음. 위
// ChannelConnect.tsx 주석과 동일 SSOT 판단)이라 대상에서 뺀다.
const PREVIEW_PLATFORM_KEYS = new Set<string>(PREVIEW_PLATFORMS.map((platform) => platform.key));
const PUBLISH_SUPPORTED = new Set<PreviewPlatform>(
  SCHEDULABLE_PLATFORMS.filter((platform) => PREVIEW_PLATFORM_KEYS.has(platform)) as PreviewPlatform[],
);
const ACCOUNT_SELECTABLE = PUBLISH_SUPPORTED;
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
function extractApiErrorMessage(e: unknown, fallback: string): string {
  if (e instanceof ApiResponseError) {
    const payload = e.payload as { error?: string } | null;
    return payload?.error || e.message || fallback;
  }
  if (e instanceof Error) return e.message || fallback;
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
  const activeRoom = resolveStudioRoomFromSearch(
    `?${search}`,
    storedRoom,
  );
  const publishReturnRequest = readPublishReturnRequest(search);
  const { data: me } = useSWR<{ isOperator?: boolean }>("/api/me", fetcher);
  const canGenerate = me?.isOperator === true;
  const { data: acct, mutate: mutateAcct } = useSWR<{ credits?: number; needsLogin?: boolean }>(
    canGenerate ? "/api/higgsfield/status" : null,
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
    // 첫 화면을 덮는 강제 모달 대신 헤더에서 남은 칸 수와 이어 채우기 경로를 항상 보여 준다.
  }, [activeWorkspace?.id]);
  // 온보딩 위저드에서 "브랜드 설정하기"(/studio?setup=brand)로 오면 브랜드 위저드 자동 오픈.
  useEffect(() => {
    if (typeof window !== "undefined" && new URLSearchParams(window.location.search).get("setup") === "brand") {
      setShowWizard(true);
    }
  }, []);
  const [withVideo, setWithVideo] = useState(true);
  const [videoModel, setVideoModel] = useState("minimax_hailuo");
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
  const [createPrimaryKind, setCreatePrimaryKind] = useState<CreateKind | null>(null);
  const [alsoKinds, setAlsoKinds] = useState<CreateKind[]>([]);
  const [learningInfo, setLearningInfo] = useState<LearningInfo>({});
  const [learningFlash, setLearningFlash] = useState(0);
  const [editKind, setEditKind] = useState<EditContentKind>("video");
  const [editFormat, setEditFormat] = useState<ContentEditFormat>(() => defaultContentEditFormat("video"));
  const [editing, setEditing] = useState<PreviewPlatform | null>(null);
  const [showTx, setShowTx] = useState(false);
  const { data: tx } = useSWR<{ items?: Array<{ display_name?: string; credits?: number; action?: string; created_at?: string; output?: string | null; outputKind?: string | null }> }>(
    canGenerate && showTx ? "/api/higgsfield/transactions?size=25" : null,
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
    const requested = resolveStudioRoomFromSearch(`?${search}`, storedRoom);
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
      const entries = await Promise.all(
        Array.from(ACCOUNT_SELECTABLE).map(async (p) => {
          try {
            const r = await fetch(`/api/channels/${p}/accounts?tenant_id=${activeWorkspace.id}`, { headers: authHeaders() });
            const d = await r.json();
            if (!r.ok) return [p, [] as AccountOption[], true] as const;
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
            : [result.threads || result.facebook || result.x || ""].filter(Boolean);
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
  async function genImage(prompt: string) {
    if (!canGenerate) {
      showToast("이미지 생성은 운영자 전용 기능입니다.", "error");
      return null;
    }
    setLastError(null);
    try {
      const r = await apiPost<ImgResult & { ok?: boolean; error?: string; nsfw?: boolean; credits?: boolean }>("/api/higgsfield/image", { prompt, aspectRatio: "9:16", label: idea });
      if (!r?.ok) { const msg = r?.credits ? "Higgsfield 크레딧 부족" : r?.nsfw ? "Higgsfield NSFW 차단" : (r?.error || "이미지 실패"); setLastError(`이미지: ${msg}`); showToast(msg, "error"); return null; }
      setImg(r); mutateAcct(); return r;
    } catch (e) {
      const msg = extractApiErrorMessage(e, "이미지 생성 실패");
      setLastError(`이미지: ${msg}`); showToast(msg, "error"); return null;
    }
  }
  async function genVideo(localPath: string) {
    if (!canGenerate) {
      showToast("영상 생성은 운영자 전용 기능입니다.", "error");
      return null;
    }
    setLastError(null);
    const s = text?.shorts;
    const narration = [s?.hook, s?.body, s?.cta].filter(Boolean).join(". ");
    try {
      const r = await apiPost<VidResult & { ok?: boolean; error?: string; nsfw?: boolean; credits?: boolean }>("/api/higgsfield/video", { localPath, prompt: "subtle idle motion, gentle glow, fixed camera", model: videoModel, narration, label: idea });
      if (!r?.ok) { const msg = r?.nsfw ? "Higgsfield NSFW 차단" : r?.credits ? "Higgsfield 크레딧 부족" : (r?.error || "영상 실패"); setLastError(`영상: ${msg}`); showToast(msg, "error"); return null; }
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
  function discardCurrentWork() {
    if (!text && !idea.trim() && !draftId) { showToast("이미 비어 있습니다", "success"); return; }
    if (!window.confirm("지금 작업물을 버리고 새로 시작할까요? 저장하지 않은 내용은 사라집니다.")) return;
    generationAbort.current?.abort();
    generationAbort.current = null;
    setBusy(null);
    setIdea(""); setText(null); setImg(null); setVid(null); setDraftId(null);
    setEditLines([]); setEditorHandoff(null);
    setPublishReconciliations({});
    setPub({ running: false, stopped: false, status: {}, urls: {}, errors: {} });
    setTitles({}); setHashtags({}); setTopicTags({}); setFirstComments({}); setCaptions({});
    showToast("새로 시작합니다", "success");
  }
  async function runOSMU() {
    if (!idea.trim()) { showToast("글감을 입력하세요", "error"); return; }
    setLastError(null);
    setText(null); setImg(null); setVid(null); setDraftId(null); setPublishReconciliations({}); setEditorHandoff(null);
    try {
      setBusy("텍스트 변형 생성 중..."); const t = await genText(); if (!t) return;
      if (canGenerate) {
        setBusy("히어로 이미지 생성 중..."); const image = await genImage(t.image_prompt || idea);
        if (image && withVideo) { setBusy("숏폼 영상 생성 중 (1~2분)..."); await genVideo(image.localPath); }
      }
      showToast(canGenerate ? "OSMU 생성 완료" : "텍스트 생성 완료", "success");
    } finally { setBusy(null); }
  }
  // P8: AI 자동초안. 브랜드 가이드 + 글감을 소스로 후보 초안 N개를 생성(status=draft).
  // 게이트웨이 크론(generate-drafts)의 수동 대응. /api/sourcing 재사용(longform→후보 청킹).
  async function autoGenerate() {
    if (!activeWorkspace) { showToast("워크스페이스를 선택하세요", "error"); return; }
    const seed = [guide, idea].filter(Boolean).join("\n\n").trim();
    if (seed.length < 50) { showToast("브랜드 가이드 설정 또는 글감을 더 입력하세요 (최소 50자)", "error"); return; }
    setAutoGen(true);
    try {
      const r = await apiPost<{ ok?: boolean; savedDrafts?: number; error?: string }>("/api/sourcing", {
        tenant_id: activeWorkspace.id, longform_text: seed, count: 5,
      });
      if (r?.ok) { showToast(`AI 자동초안 ${r.savedDrafts ?? 0}개 생성됨. 작업물 전체에서 확인`, "success"); mutateHist(); }
      else showToast(r?.error || "자동초안 생성 실패", "error");
    } catch (e) {
      showToast(e instanceof Error ? e.message : "자동초안 생성 실패", "error");
    } finally { setAutoGen(false); }
  }
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
    const nextKind = candidate.format.content_branch === "video" ? "video" : "card";
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
    const next = trimAllOverLimit((platform) => platformText(platform), previewTargets);
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
          <Button onClick={() => setShowWorks((value) => !value)} aria-expanded={showWorks} aria-controls="studio-work-overview">
            작업물 전체 <span className="ml-micro text-accent">{hist?.drafts.length ?? 0}</span>
          </Button>
          <LearningStatus
            filled={countFilledLearningSlots(learningInfo, { guide })}
            flashToken={learningFlash}
            onOpen={() => setShowWizard(true)}
          />
          {/* 세 방 어디서나 같은 자리에서 지금 작업물을 버리고 새로 시작한다. */}
          <Button data-testid="studio-discard-work" onClick={discardCurrentWork}>새로 시작</Button>
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
      {showWorks ? (
        <div id="studio-work-overview" className="absolute left-0 right-0 top-full z-20 mt-stack space-y-stack rounded-surface border border-border bg-surface p-pad-inset shadow-lg">
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
          <div className="grid gap-stack md:grid-cols-4">
            {(["create", "edit", "publish"] as StudioRoom[]).map((room) => (
              <Button key={room} variant={activeRoom === room ? "primary" : "secondary"} onClick={() => changeRoom(room)} className="min-w-0">
                {room === "create" ? "생성실" : room === "edit" ? "편집실" : "발행실"}
              </Button>
            ))}
            <Link href="/performance" className="inline-flex min-h-control-touch items-center justify-center rounded-control border border-border bg-surface-2 px-stack text-body-sm font-semibold text-muted hover:bg-surface">성과실</Link>
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
        learningVersion={learningFlash + countFilledLearningSlots(learningInfo, { guide })}
        resumeCount={hist?.drafts.length ?? 0}
        onResume={() => setShowWorks(true)}
        quickDraft={text}
        quickDraftLoading={busy === "초안 만드는 중"}
        quickDraftError={lastError}
        onQuickDraftGenerate={generateQuickDraft}
      />
    </div>
  );

  // 편집실 본 화면과 대화창이 같은 대사를 본다. 대화창만 빈 배열을 받으면 일괄 편집이 죽은 단추가 된다.
  const resolvedEditLines = editLines.length ? editLines : [text?.shorts?.hook || "", text?.shorts?.body || "", text?.shorts?.cta || ""].filter(Boolean);

  if (activeRoom === "edit") return (
    <div className="px-stack-section py-pad-inset">
      {showWizard && activeWorkspace ? <LearningCardWizard workspaceId={activeWorkspace.id} workspaceName={activeWorkspace.name} onSaved={(info, completed) => { setLearningInfo(info); if (completed) { setShowWizard(false); mutateBrand(); showToast("학습 정보를 배웠습니다"); } else { setLearningFlash((value) => value + 1); } }} onClose={() => setShowWizard(false)} /> : null}
      {roomHeader}
      <EditRoom
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
      <section data-room="publish" className="grid gap-stack-section pb-wide lg:grid-cols-[minmax(0,1fr)_20rem] lg:pb-none">
        <div className="min-w-0 space-y-region">
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
                  <div className="grid items-start gap-stack-section md:grid-cols-2 xl:grid-cols-3">
                    {visiblePlatforms.map((platform) => (
                  <div key={platform} data-room-preview={platform} className="min-w-0 rounded-surface border border-border bg-surface p-stack">
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
                          {accountsLoaded && PUBLISH_SUPPORTED.has(platform) && (accountsByPlatform[platform] || []).length === 0 ? (
                            <Link
                              href={`/channels/${platform}`}
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
                                href={`/channels/${platform}`}
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
                        href={`/channels/${platform}`}
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
              {connectedTargets.length < bulkTargets.length ? (
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
