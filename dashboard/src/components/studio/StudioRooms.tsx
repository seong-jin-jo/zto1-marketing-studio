"use client";

import { useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { Button } from "@/components/shared/Button";
import { StateNotice } from "@/components/shared/StateNotice";
import { EditPreview, type CardTextPosition } from "./EditPreview";
import { Field } from "@/components/shared/Field";
import { Stack } from "@/components/shared/Stack";
import {
  discardStudioDerivations,
  quoteStudioDerivations,
  regenerateStudioCandidates,
  requestStudioCandidates,
  requestStudioDerivations,
  type StudioDerivationBatch,
  type StudioDerivationQuote,
  type StudioGenerationCandidate,
} from "@/lib/studio/generation/client";
import { getAuthToken } from "@/lib/auth";
import { workspaceDisplayName } from "@/lib/workspace-display-name";
import {
  CARD_ASPECT_RATIOS,
  EDIT_BACKGROUNDS,
  EDIT_MUSIC_TRACKS,
  EDIT_MUSIC_VOLUMES,
  EDIT_VOICES,
  PLAYBACK_SPEEDS,
  SUBTITLE_SIZES,
  VIDEO_ASPECT_RATIOS,
  defaultContentEditFormat,
  validateContentEditFormat,
  type ContentEditFormat,
} from "@/lib/studio/content-edit-format";
import {
  AUDIENCE_CARDS,
  INDUSTRY_CARDS,
  LEARNING_SLOT_TOTAL,
  PURPOSE_CARDS,
  countFilledLearningSlots,
  readLearningInfo,
  writeLearningInfo,
  type LearningInfo,
} from "./learning-info";
import styles from "./StudioRooms.module.css";

export type CreateContentBranch = "text_image" | "video";
export type EditContentKind = "video" | "card" | "audio" | "text";
/** 화면에서 고르는 갈래. 글과 카드뉴스는 만드는 방식이 달라 따로 고른다. */
export type CreateKind = "video" | "card" | "text";
export interface CreateStructureChoice {
  label: "A" | "B" | "C";
  title: string;
  outline: readonly string[];
}
export interface QuickDraftResult {
  threads?: string;
  facebook?: string;
  x?: string;
  instagram?: { caption?: string; hashtags?: string[]; slides?: string[] };
  shorts?: { hook?: string; body?: string; cta?: string };
}
const ONBOARDING_CONTENT_BRANCH_KEY = "studio_content_branch";
const CREATE_DRAFT_STORAGE_PREFIX = "studio_create_state";

const CREATE_KIND_LABELS: Record<CreateKind, string> = { video: "영상", card: "카드뉴스", text: "글" };
const CREATE_KIND_ORDER: CreateKind[] = ["video", "card", "text"];
const kindToBranch = (kind: CreateKind): CreateContentBranch => (kind === "video" ? "video" : "text_image");

interface PersistedCreateDraft {
  primaryKind: CreateKind | null;
  alsoKinds: CreateKind[];
  questionIndex: number;
  purpose: string;
  audience: string;
  rightsConfirmed: boolean;
  topicOpen: boolean;
  candidates: StudioGenerationCandidate[];
  selected: "A" | "B" | "C" | null;
  quickStructure: CreateStructureChoice | null;
}

function createDraftStorageKey(workspaceId: string): string {
  return `${CREATE_DRAFT_STORAGE_PREFIX}:${workspaceId}`;
}

function isCreateKind(value: unknown): value is CreateKind {
  return value === "video" || value === "card" || value === "text";
}

function isCandidateLabel(value: unknown): value is "A" | "B" | "C" {
  return value === "A" || value === "B" || value === "C";
}

function isStudioGenerationCandidate(value: unknown): value is StudioGenerationCandidate {
  if (!value || typeof value !== "object") return false;
  const candidate = value as Partial<StudioGenerationCandidate>;
  return typeof candidate.candidate_id === "string"
    && isCandidateLabel(candidate.label)
    && typeof candidate.title === "string"
    && Boolean(candidate.format)
    && Array.isArray(candidate.format?.outline)
    && candidate.format.outline.every((line) => typeof line === "string");
}

function readCreateDraft(workspaceId: string): PersistedCreateDraft | null {
  try {
    const raw = localStorage.getItem(createDraftStorageKey(workspaceId));
    if (!raw) return null;
    const value = JSON.parse(raw) as Partial<PersistedCreateDraft>;
    const questionIndex = Number(value.questionIndex);
    if ((value.primaryKind !== null && !isCreateKind(value.primaryKind))
      || !Array.isArray(value.alsoKinds)
      || value.alsoKinds.some((kind) => !isCreateKind(kind))
      || !Number.isInteger(questionIndex)
      || questionIndex < 0
      || questionIndex >= CREATE_QUESTIONS.length
      || typeof value.purpose !== "string"
      || typeof value.audience !== "string"
      || typeof value.rightsConfirmed !== "boolean"
      || typeof value.topicOpen !== "boolean"
      || !Array.isArray(value.candidates)
      || value.candidates.some((candidate) => !isStudioGenerationCandidate(candidate))
      || (value.selected !== null && !isCandidateLabel(value.selected))) {
      throw new Error("생성실 임시 저장 형식이 올바르지 않습니다");
    }
    const quickStructure = value.quickStructure;
    if (quickStructure !== null && (!quickStructure
      || !isCandidateLabel(quickStructure.label)
      || typeof quickStructure.title !== "string"
      || !Array.isArray(quickStructure.outline)
      || quickStructure.outline.some((line) => typeof line !== "string"))) {
      throw new Error("생성실 구조 임시 저장 형식이 올바르지 않습니다");
    }
    return {
      primaryKind: value.primaryKind ?? null,
      alsoKinds: value.alsoKinds as CreateKind[],
      questionIndex,
      purpose: value.purpose,
      audience: value.audience,
      rightsConfirmed: value.rightsConfirmed,
      topicOpen: value.topicOpen,
      candidates: value.candidates as StudioGenerationCandidate[],
      selected: value.selected ?? null,
      quickStructure: quickStructure ?? null,
    };
  } catch {
    localStorage.removeItem(createDraftStorageKey(workspaceId));
    return null;
  }
}

function AssistantPanel({ title, children }: { title: string; children: ReactNode }) {
  return (
    <aside className="card h-fit min-w-0 overflow-y-auto max-lg:sticky max-lg:bottom-0 max-lg:z-30 max-lg:max-h-44 max-lg:rounded-b-none lg:sticky lg:top-pad-inset" aria-label={`${title} 대화창`} data-chat-dock="persistent" data-chat-always="true">
      <div className="flex items-center gap-stack-tight border-b border-border p-stack">
        <div className="grid h-10 w-10 place-items-center rounded-pill bg-accent text-body font-bold text-accent-fg" aria-hidden="true">O</div>
        <div><b className="block text-body text-text">{title}</b><span className="text-caption text-success">지금 대기 중</span></div>
      </div>
      <div className="bg-surface-2 p-stack">{children}</div>
    </aside>
  );
}

interface CreateRoomProps {
  workspaceId?: string;
  workspaceName?: string;
  guide: string;
  topic: string;
  contentBranch?: CreateContentBranch;
  onContentBranchChange?: (branch: CreateContentBranch) => void;
  onTopicChange: (value: string) => void;
  onOpenLearning: () => void;
  onCandidateSelect: (candidate: StudioGenerationCandidate) => void;
  onOpenEditor?: () => void;
  /** 생성실에서 첫 형식을 고르기 전 헤더가 특정 형식을 추측하지 않게 현재 선택을 전달한다. */
  onPrimaryKindChange?: (kind: CreateKind | null) => void;
  /** 같이 만들 갈래가 바뀌면 헤더 상태판이 따라 바뀐다 */
  onAlsoKindsChange?: (kinds: CreateKind[]) => void;
  /** 학습 정보가 문답에서 갱신되면 이 값이 올라가고 생성실이 다시 읽는다 */
  learningVersion?: number;
  /** 만들던 것 이어서 하기. 0이면 줄이 아예 안 뜬다 */
  resumeCount?: number;
  onResume?: () => void;
  quickDraft?: QuickDraftResult | null;
  quickDraftLoading?: boolean;
  quickDraftError?: string | null;
  onQuickDraftGenerate?: (structure: CreateStructureChoice) => Promise<void> | void;
}

const CREATE_EXAMPLES = [
  { label: "A", title: "문제 제시형", outline: ["고객이 겪는 문제", "문제가 생기는 이유", "바로 적용할 방법"] },
  { label: "B", title: "결과 제시형", outline: ["먼저 보여 줄 결과", "결과를 만든 과정", "적용할 조건"] },
  { label: "C", title: "과정 설명형", outline: ["시작 상태", "진행 순서", "확인할 변화"] },
] as const;

// 주제도 빈칸으로 주지 않는다. 학습 정보에서 고른 하는 일과 목적으로 후보를 지어 카드로 준다.
// 카드에 없을 때만 "직접 적겠습니다"로 입력창이 열린다.
const TOPIC_TEMPLATES: Record<string, string[]> = {
  "브랜드 알리기": ["{{일}}을 처음 접하는 고객이 가장 많이 묻는 질문", "{{일}}을 시작하기 전에 알아둘 점", "우리가 {{일}}을 하는 이유"],
  "신뢰 높이기": ["{{일}}을 하며 실제로 해결한 고객 문제", "직접 겪은 실패와 바꾼 방법", "고객이 선택 전에 확인할 기준"],
  "문의 늘리기": ["이런 상황이라면 상담이 필요한 이유", "{{일}} 상담 전에 준비할 것", "고객이 자주 헷갈리는 조건"],
  "방문·예약 늘리기": ["처음 방문하는 고객을 위한 안내", "{{일}} 예약 전에 확인할 것", "방문하면 받을 수 있는 서비스"],
  "구매 늘리기": ["{{일}}을 고를 때 비교할 기준", "가격에 포함된 항목", "구매 전에 가장 많이 묻는 질문"],
  "재방문 늘리기": ["기존 고객이 다시 찾는 이유", "두 번째 이용에서 달라지는 점", "이용 후 관리 방법"],
};

function topicCandidates(industryTitle: string, purposeTitle: string): string[] {
  const work = industryTitle || "우리 일";
  const templates = TOPIC_TEMPLATES[purposeTitle] || TOPIC_TEMPLATES["브랜드 알리기"];
  return templates.map((template) => template.replaceAll("{{일}}", work));
}

type CreateQuestion = "kind" | "purpose" | "audience" | "topic" | "rights" | "review";
const CREATE_QUESTIONS: readonly CreateQuestion[] = ["kind", "purpose", "audience", "topic", "rights", "review"];

export function generationErrorMessage(cause: unknown): string {
  const message = cause instanceof Error ? cause.message : "";
  if (/저장소|무결성|constraint|database|relation|schema/i.test(message)) {
    return "구조 초안을 저장하지 못했습니다. 잠시 후 다시 시도해 주세요.";
  }
  if (/인증|로그인|unauthorized|forbidden/i.test(message)) return "로그인이 만료됐습니다. 다시 로그인해 주세요.";
  return message || "구조 초안을 만들지 못했습니다. 잠시 후 다시 시도해 주세요.";
}

export function CreateRoom({ workspaceId, workspaceName, guide, topic, contentBranch = "text_image", onContentBranchChange, onTopicChange, onCandidateSelect, onOpenEditor, onPrimaryKindChange, onAlsoKindsChange, learningVersion = 0, resumeCount = 0, onResume, quickDraft, quickDraftLoading = false, quickDraftError, onQuickDraftGenerate }: CreateRoomProps) {
  const topicInputRef = useRef<HTMLInputElement>(null);
  const [hydratedCreateWorkspaceId, setHydratedCreateWorkspaceId] = useState<string | null>(null);
  const [primaryKind, setPrimaryKind] = useState<CreateKind | null>(null);
  const [alsoKinds, setAlsoKinds] = useState<CreateKind[]>([]);
  const [questionIndex, setQuestionIndex] = useState(0);
  const [purpose, setPurpose] = useState("");
  const [audience, setAudience] = useState("");
  const [rightsConfirmed, setRightsConfirmed] = useState(false);
  const [topicOpen, setTopicOpen] = useState(false);
  const [learning, setLearning] = useState<LearningInfo>({});
  const [candidates, setCandidates] = useState<StudioGenerationCandidate[]>([]);
  const [selected, setSelected] = useState<"A" | "B" | "C" | null>(null);
  const [quickStructure, setQuickStructure] = useState<CreateStructureChoice | null>(null);
  const [loading, setLoading] = useState(false);
  const [alsoQuote, setAlsoQuote] = useState<StudioDerivationQuote | null>(null);
  const [alsoBatch, setAlsoBatch] = useState<StudioDerivationBatch | null>(null);
  const [alsoBusy, setAlsoBusy] = useState(false);
  // 초안을 못 만드는 이유를 단추 옆에서 말한다(조용한 비활성 금지).
  const [quickBlockReason, setQuickBlockReason] = useState<string | null>(null);
  const generationInFlight = useRef(false);
  const [error, setError] = useState<string | null>(null);
  const facts = useMemo(() => guide.trim() ? [guide.trim()] : [], [guide]);
  const learnedCount = countFilledLearningSlots(learning, { guide });
  const missing = [!primaryKind && "만들 형식", !topic.trim() && "주제", !purpose.trim() && "목표", !audience.trim() && "고객", !rightsConfirmed && "사용 권리 확인"].filter(Boolean) as string[];
  const selectedCandidate = candidates.find((candidate) => candidate.label === selected) ?? null;
  const displayCandidates = candidates.length ? candidates : CREATE_EXAMPLES;
  const question = CREATE_QUESTIONS[questionIndex];
  const stage = selected ? { count: "3 / 3", label: "선택한 구조 확인" } : candidates.length ? { count: "2 / 3", label: "구조 초안 고르기" } : { count: "1 / 3", label: `만들 조건 확인 ${Math.min(questionIndex + 1, 6)} / 6` };
  const industryTitle = useMemo(() => INDUSTRY_CARDS.find((card) => card.sample === learning.industry)?.title || "", [learning.industry]);
  const purposeTitle = useMemo(() => PURPOSE_CARDS.find((card) => card.sample === purpose)?.title || "", [purpose]);
  const topicCards = useMemo(() => topicCandidates(industryTitle, purposeTitle), [industryTitle, purposeTitle]);

  // 학습 정보는 작업 공간마다 다시 읽는다. 생성실 문답의 임시 저장과는 별도다.
  useEffect(() => {
    if (!workspaceId) return;
    const saved = readLearningInfo(workspaceId);
    setLearning(saved);
    setAudience((current) => current || saved.audience || "");
    setRightsConfirmed((current) => current || Boolean(saved.rights));
  }, [workspaceId, learningVersion]);

  // 새로고침해도 생성실 질문, 선택 구조, 생성 후보를 작업 공간별로 이어 간다.
  // 깨진 저장값은 조용히 폐기하고 학습 정보에서 확인된 기본값만 사용한다.
  useEffect(() => {
    setHydratedCreateWorkspaceId(null);
    setPrimaryKind(null);
    setAlsoKinds([]);
    setQuestionIndex(0);
    setPurpose("");
    setAudience("");
    setRightsConfirmed(false);
    setTopicOpen(false);
    setCandidates([]);
    setSelected(null);
    setQuickStructure(null);
    onPrimaryKindChange?.(null);
    onAlsoKindsChange?.([]);
    if (!workspaceId) return;

    const learned = readLearningInfo(workspaceId);
    const onboardingBranch = sessionStorage.getItem(ONBOARDING_CONTENT_BRANCH_KEY);
    if (onboardingBranch === "text_image" || onboardingBranch === "video") {
      const onboardingKind: CreateKind = onboardingBranch === "video" ? "video" : "card";
      setPrimaryKind(onboardingKind);
      onPrimaryKindChange?.(onboardingKind);
      onContentBranchChange?.(onboardingBranch);
      setAudience(learned.audience || "");
      setRightsConfirmed(Boolean(learned.rights));
      sessionStorage.removeItem(ONBOARDING_CONTENT_BRANCH_KEY);
      setHydratedCreateWorkspaceId(workspaceId);
      return;
    }
    const saved = readCreateDraft(workspaceId);
    if (saved) {
      setPrimaryKind(saved.primaryKind);
      setAlsoKinds(saved.alsoKinds);
      setQuestionIndex(saved.questionIndex);
      setPurpose(saved.purpose);
      setAudience(saved.audience || learned.audience || "");
      setRightsConfirmed(saved.rightsConfirmed || Boolean(learned.rights));
      setTopicOpen(saved.topicOpen);
      setCandidates(saved.candidates);
      setSelected(saved.selected);
      setQuickStructure(saved.quickStructure);
      onPrimaryKindChange?.(saved.primaryKind);
      onAlsoKindsChange?.(saved.alsoKinds);
      if (saved.primaryKind) onContentBranchChange?.(kindToBranch(saved.primaryKind));
      const savedCandidate = saved.candidates.find((candidate) => candidate.label === saved.selected);
      if (savedCandidate) onCandidateSelect(savedCandidate);
    } else {
      setAudience(learned.audience || "");
      setRightsConfirmed(Boolean(learned.rights));
    }
    setHydratedCreateWorkspaceId(workspaceId);
  }, [workspaceId]);

  useEffect(() => {
    if (!workspaceId || hydratedCreateWorkspaceId !== workspaceId) return;
    const value: PersistedCreateDraft = {
      primaryKind,
      alsoKinds,
      questionIndex,
      purpose,
      audience,
      rightsConfirmed,
      topicOpen,
      candidates,
      selected,
      quickStructure,
    };
    try {
      localStorage.setItem(createDraftStorageKey(workspaceId), JSON.stringify(value));
    } catch {
      setError("생성실 입력을 임시 저장하지 못했습니다. 브라우저 저장 공간을 확인해 주세요.");
    }
  }, [workspaceId, hydratedCreateWorkspaceId, primaryKind, alsoKinds, questionIndex, purpose, audience, rightsConfirmed, topicOpen, candidates, selected, quickStructure]);

  const rememberLearning = (patch: LearningInfo) => {
    setLearning((current) => {
      const next = { ...current, ...patch };
      if (workspaceId) writeLearningInfo(workspaceId, next);
      return next;
    });
  };

  const choosePrimary = (kind: CreateKind) => {
    if (!primaryKind) {
      setPrimaryKind(kind);
      onPrimaryKindChange?.(kind);
      onContentBranchChange?.(kindToBranch(kind));
      return;
    }
    if (primaryKind === kind) {
      if (alsoKinds.length) {
        const [nextPrimary, ...rest] = alsoKinds;
        setPrimaryKind(nextPrimary);
        setAlsoKinds(rest);
        onPrimaryKindChange?.(nextPrimary);
        onAlsoKindsChange?.(rest);
        onContentBranchChange?.(kindToBranch(nextPrimary));
      } else {
        setPrimaryKind(null);
        onPrimaryKindChange?.(null);
      }
      return;
    }
    const next = alsoKinds.includes(kind) ? alsoKinds.filter((one) => one !== kind) : [...alsoKinds, kind];
    setAlsoKinds(next);
    onAlsoKindsChange?.(next);
  };

  const chooseAudience = (value: string) => {
    setAudience(value);
    rememberLearning({ audience: value });
    setQuestionIndex(3);
  };

  const confirmRights = (value: boolean) => {
    setRightsConfirmed(value);
    rememberLearning({ rights: value ? "직접 만든 자료 또는 콘텐츠 제작·게시 허가를 받은 자료만 사용합니다." : "" });
  };

  async function generate() {
    if (generationInFlight.current) return;
    setError(null);
    if (!workspaceId) { setError("작업 공간을 먼저 선택하세요"); return; }
    const token = getAuthToken();
    generationInFlight.current = true;
    setLoading(true);
    try {
      const next = await requestStudioCandidates({ workspaceId, topic, purpose, audience, workspaceFacts: facts, forbiddenPhrases: [], materialRightsConfirmed: rightsConfirmed, contentBranch }, token);
      setCandidates(next);
      setSelected(null);
    } catch (cause) {
      setError(generationErrorMessage(cause));
    } finally {
      generationInFlight.current = false;
      setLoading(false);
    }
  }

  async function regenerateAll() {
    if (generationInFlight.current) return;
    const jobId = candidates[0]?.generation_id;
    if (!jobId) { setError("다시 만들 기존 후보를 찾지 못했습니다"); return; }
    generationInFlight.current = true;
    setLoading(true);
    setError(null);
    try {
      setCandidates(await regenerateStudioCandidates(jobId, getAuthToken()));
      setSelected(null);
    } catch (cause) {
      setError(generationErrorMessage(cause));
    } finally {
      generationInFlight.current = false;
      setLoading(false);
    }
  }

  function choose(candidate: StudioGenerationCandidate) {
    setSelected(candidate.label);
    onCandidateSelect(candidate);
  }

  function chooseStructureCandidate(candidate: StudioGenerationCandidate) {
    choose(candidate);
    const structure: CreateStructureChoice = {
      label: candidate.label,
      title: candidate.title,
      outline: candidate.format.outline,
    };
    setQuickStructure(structure);
    void onQuickDraftGenerate?.(structure);
  }

  // 같이 만들 갈래를 고른 채로 후보를 고르면, 확정을 누르기 전에 값을 먼저 보여 준다.
  // 값을 못 본 상태에서는 확정 단추가 뜨지 않으므로 조용히 나가는 경로가 없다.
  useEffect(() => {
    const jobId = candidates[0]?.generation_id;
    if (!selectedCandidate || !jobId || alsoKinds.length === 0) { setAlsoQuote(null); return; }
    let live = true;
    quoteStudioDerivations(jobId, alsoKinds, getAuthToken())
      .then((quote) => { if (live) setAlsoQuote(quote); })
      .catch(() => { if (live) setAlsoQuote(null); });
    return () => { live = false; };
  }, [selectedCandidate, alsoKinds, candidates]);

  async function confirmAlsoKinds() {
    const jobId = candidates[0]?.generation_id;
    if (!jobId || !selectedCandidate || !alsoQuote) return;
    setAlsoBusy(true);
    setError(null);
    try {
      setAlsoBatch(await requestStudioDerivations({
        jobId,
        candidateId: selectedCandidate.candidate_id,
        kinds: alsoKinds,
        acknowledgedCost: { currency: alsoQuote.currency, totalMinor: alsoQuote.total_minor },
        token: getAuthToken(),
      }));
    } catch (cause) {
      setError(generationErrorMessage(cause));
    } finally {
      setAlsoBusy(false);
    }
  }

  async function discardAlso() {
    if (!alsoBatch) return;
    setAlsoBusy(true);
    try {
      setAlsoBatch(await discardStudioDerivations(alsoBatch.batch_id, getAuthToken()));
    } catch (cause) {
      setError(generationErrorMessage(cause));
    } finally {
      setAlsoBusy(false);
    }
  }

  const kindHeading = primaryKind ? `${CREATE_KIND_LABELS[primaryKind]} 구성 초안 예시` : "콘텐츠 구성 초안 예시";
  const quickDraftSections = (primaryKind ? [primaryKind, ...alsoKinds] : CREATE_KIND_ORDER)
    .map((kind) => {
      if (kind === "video") {
        const lines = [quickDraft?.shorts?.hook, quickDraft?.shorts?.body, quickDraft?.shorts?.cta].filter((line): line is string => Boolean(line));
        return { kind, label: "영상 대본 후보", lines };
      }
      if (kind === "card") {
        const lines = [...(quickDraft?.instagram?.slides || []), quickDraft?.instagram?.caption || ""].filter(Boolean);
        return { kind, label: "카드뉴스 후보", lines };
      }
      const lines = [quickDraft?.threads || quickDraft?.facebook || quickDraft?.x || ""].filter(Boolean);
      return { kind, label: "글 후보", lines };
    })
    .filter((section) => section.lines.length > 0);
  const learningRows = [
    ["작업 공간", workspaceDisplayName(workspaceName)],
    ["업종", learning.industry || guide || "아직 없음"],
    ["말투", learning.voice || "아직 없음"],
    ["콘텐츠 목표", purpose || "아직 없음"],
    ["주요 고객", audience || "아직 없음"],
    ["성과에서 배운 규칙", learning.learnedRules || "아직 없음"],
  ];

  return (
    <section data-room="create" className="space-y-region">
      {resumeCount > 0 ? (
        <section data-create-resume={resumeCount} className="flex min-h-control-touch flex-wrap items-center gap-stack rounded-surface border border-border bg-surface-2 px-pad-inset py-stack">
          <span className="mr-auto break-keep text-body-sm text-muted">저장된 작업물 {resumeCount}건이 있습니다. 지금 입력도 새로고침 뒤 이어집니다</span>
          <Button size="sm" onClick={onResume}>이어서 하기</Button>
        </section>
      ) : null}
      <section data-room-top="create" data-create-stage={stage.count} aria-label="이 방에서 지금 알아야 할 것" className="flex min-h-control-touch flex-wrap items-start gap-stack rounded-surface border border-border bg-surface px-pad-inset py-stack">
        <div className="mr-auto min-w-0">
          <p className="text-caption font-semibold text-accent">1단계</p>
          <h1 className="text-heading font-bold text-text">생성실</h1>
          <p className="break-keep text-body-sm text-muted">형식을 먼저 고르고, 학습 정보를 반영한 구조 초안 세 개를 비교합니다.</p>
        </div>
        <div className="text-right"><b className="block text-body font-bold text-accent">{stage.count}</b><span className="text-caption text-subtle">{stage.label}</span></div>
      </section>
      <div className="grid gap-stack-section lg:grid-cols-[minmax(0,1fr)_20rem]">
        <div className="min-w-0 space-y-region" data-create-workspace>
          <section className="card space-y-stack-section p-pad-inset" aria-labelledby="create-quick-title" data-create-quick-start>
            <div>
              <h2 id="create-quick-title" className="text-subheading font-bold text-text">주제로 바로 초안 만들기</h2>
              <p className="break-keep text-caption text-subtle">주제를 적고 아래 구조를 고른 뒤 초안을 만드세요. 기존 생성 담당 문답도 그대로 사용할 수 있습니다.</p>
            </div>
            <Field label="초안 주제" htmlFor="studio-quick-topic">
              <input
                id="studio-quick-topic"
                value={topic}
                onChange={(event) => onTopicChange(event.target.value)}
                placeholder="고객에게 전할 주제를 입력하세요"
                className="h-control-touch w-full rounded-control border border-border bg-surface-2 px-stack text-body text-text"
              />
            </Field>
            {quickStructure ? (
              <article className="rounded-control border border-accent/30 bg-accent-soft p-stack" data-quick-structure={quickStructure.label}>
                <b className="block text-body-sm text-accent">{quickStructure.label} {quickStructure.title} 후보</b>
                <ol className="mt-stack-tight space-y-micro text-caption text-accent">
                  {quickStructure.outline.map((line, index) => <li key={`${quickStructure.label}-${line}`}><span className="mr-micro font-semibold">{index + 1}.</span>{line}</li>)}
                </ol>
              </article>
            ) : (
              <p className="text-caption text-subtle">아래 A, B, C 중 하나를 골라 생성 구조를 정해 주세요.</p>
            )}
            {/*
              2026-09-05 회장 계정 실측: 이 단추를 눌렀는데 화면이 한 글자도 안 바뀌었다.
              구조를 안 골랐다는 이유로 조용히 비활성이었기 때문이다. 못 누르는 단추는
              고장으로 읽힌다. 눌리게 두고, 무엇이 없어서 못 만드는지 그 자리에서 말한다.
            */}
            <Button
              variant="primary"
              className="w-full min-w-0"
              onClick={() => {
                const missing = !workspaceId
                  ? "작업 공간을 먼저 고르세요."
                  : !topic.trim()
                    ? "초안 주제를 먼저 적어 주세요."
                    : !quickStructure
                      ? "아래 A, B, C 중 하나를 골라 구조를 정해 주세요."
                      : null;
                if (missing) {
                  setQuickBlockReason(missing);
                  if (!topic.trim()) document.getElementById("studio-quick-topic")?.focus();
                  else if (!quickStructure) document.querySelector("[data-quick-structure-picker]")?.scrollIntoView({ block: "center" });
                  return;
                }
                setQuickBlockReason(null);
                if (quickStructure) onQuickDraftGenerate?.(quickStructure);
              }}
              disabled={quickDraftLoading}
            >
              {quickDraftLoading ? "초안 만드는 중" : "초안 만들기"}
            </Button>
            {quickBlockReason ? <p role="alert" className="text-caption text-danger">{quickBlockReason}</p> : null}
            {quickDraftError ? <p role="alert" className="text-caption text-danger">{quickDraftError}</p> : null}
          </section>
          <section className="grid gap-stack sm:grid-cols-3" aria-label="생성실 요약">
            <article className="card p-pad-inset"><span className="text-caption text-subtle">선택한 형식</span><b className="mt-micro block text-body text-text">{primaryKind ? CREATE_KIND_LABELS[primaryKind] : "선택 전"}</b></article>
            <article className="card p-pad-inset"><span className="text-caption text-subtle">반영한 학습 정보</span><b className="mt-micro block text-body text-text">{learnedCount}개</b></article>
            <article className="card p-pad-inset"><span className="text-caption text-subtle">구조 초안</span><b className="mt-micro block text-body text-text">{candidates.length}개</b></article>
          </section>
          <section className="min-w-0" aria-labelledby="create-display-title">
            <div className="mb-stack flex items-center justify-between border-b border-border pb-stack">
              <h2 id="create-display-title" className="text-subheading font-bold text-text">{selectedCandidate ? "선택한 구조 초안" : candidates.length ? "구조 초안 세 개" : kindHeading}</h2>
              <span className="text-caption text-subtle">카드를 눌러 구조를 선택하세요</span>
            </div>
            <div className="grid gap-stack md:grid-cols-3" data-create-candidate-deck data-quick-structure-picker>
              {displayCandidates.filter((candidate) => !selectedCandidate || candidate.label === selectedCandidate.label).map((candidate) => {
                const outline = "format" in candidate ? candidate.format.outline : candidate.outline;
                return (
                  <article key={candidate.label} data-create-candidate={candidate.label} className={`flex min-w-0 flex-col gap-stack rounded-surface border p-pad-inset ${selected === candidate.label ? "border-accent bg-accent-soft" : "border-border bg-surface"}`}>
                    <div>
                      <div className="mb-stack flex items-start gap-stack-tight"><span className="grid h-8 w-8 shrink-0 place-items-center rounded-pill bg-accent text-caption font-bold text-accent-fg">{candidate.label}</span><b className="break-keep text-body-sm text-text">{candidate.title}</b></div>
                      <p className="break-keep text-caption text-muted">{primaryKind ? `${CREATE_KIND_LABELS[primaryKind]}에 적용할 이야기 순서` : "형식을 고른 뒤 주제에 맞춰 바뀌는 이야기 순서"}</p>
                    </div>
                    <ol className="mt-auto space-y-stack-tight border-t border-border pt-stack">
                      {outline.map((item, index) => <li key={`${candidate.label}-${index}`} className="flex gap-stack-tight text-caption text-muted"><span className="text-accent">{index + 1}</span><span className="break-keep">{item}</span></li>)}
                    </ol>
                    {"format" in candidate ? (
                      <Button
                        variant={selected === candidate.label ? "primary" : "secondary"}
                        className="w-full min-w-0"
                        onClick={() => chooseStructureCandidate(candidate)}
                        disabled={quickDraftLoading}
                      >
                        {quickDraftLoading ? "후보 만드는 중" : `${candidate.label} 구조를 본문에서 선택`}
                      </Button>
                    ) : (
                      <Button
                        variant={quickStructure?.label === candidate.label ? "primary" : "secondary"}
                        className="w-full min-w-0"
                        aria-pressed={quickStructure?.label === candidate.label}
                        onClick={() => setQuickStructure({ label: candidate.label, title: candidate.title, outline: candidate.outline })}
                      >
                        {candidate.label} 구조 사용
                      </Button>
                    )}
                  </article>
                );
              })}
            </div>
          </section>
          {quickDraftSections.length ? (
            <section className="rounded-surface border border-success/30 bg-success/10 p-pad-inset" aria-labelledby="quick-draft-result-title" data-quick-draft-result>
              <h3 id="quick-draft-result-title" className="text-body font-bold text-text">고른 형식의 생성 후보</h3>
              <div className="mt-stack grid gap-stack md:grid-cols-2">
                {quickDraftSections.map((section) => (
                  <article key={section.kind} className="rounded-control border border-success/30 bg-surface p-stack" data-quick-draft-format={section.kind}>
                    <b className="block text-body-sm text-text">{section.label}</b>
                    <ol className="mt-stack-tight space-y-stack-tight">
                      {section.lines.map((line, index) => <li key={`${section.kind}-${index}`} className="whitespace-pre-wrap break-keep text-caption text-muted">{line}</li>)}
                    </ol>
                  </article>
                ))}
              </div>
            </section>
          ) : null}
          <section className="card p-pad-inset" aria-labelledby="create-learning-title">
            <div className="mb-stack flex flex-wrap items-center justify-between gap-stack"><div><h2 id="create-learning-title" className="text-body font-bold text-text">이번에 반영한 학습 정보</h2><p className="text-caption text-subtle">사용자가 승인한 내용만 적용합니다.</p></div><span className="text-caption text-subtle">{learnedCount} / {LEARNING_SLOT_TOTAL}</span></div>
            <progress className="progress-semantic mb-stack w-full" max={LEARNING_SLOT_TOTAL} value={learnedCount} aria-label="학습 정보 수집 정도" />
            <dl className="flex flex-wrap gap-stack-tight">
              {learningRows.map(([label, value]) => <div key={label} className="min-w-0 rounded-pill bg-surface-2 px-stack py-stack-tight text-caption text-muted"><dt className="sr-only">{label}</dt><dd className="max-w-full truncate">{label}: {value}</dd></div>)}
            </dl>
          </section>
        </div>
        <AssistantPanel title="생성 담당">
          <Stack gap={16}>
            <div className="max-w-[90%] rounded-surface rounded-tl-control border border-border bg-surface p-stack text-body-sm text-text" data-empty-next={!candidates.length ? "create" : undefined}>
              {selectedCandidate ? "구조 초안이 준비됐습니다. 영상은 대본과 장면 구성까지만 제공하며 렌더링은 아직 지원하지 않습니다." : candidates.length ? "A, B, C 구조 중 편집할 초안을 하나 골라 주세요." : "한 번에 하나씩 묻겠습니다. 선택한 답은 다음 질문에 반영됩니다."}
            </div>
            <div className="rounded-control border border-border bg-surface-2 p-stack text-caption text-muted" data-generation-capability>
              <b className="block text-text">현재 제공</b>
              <span className="block">일곱 칸 학습 정보를 반영한 구성 초안 3개</span>
              <b className="mt-stack-tight block text-text">준비 중</b>
              <span className="block">영상 렌더링, 카드뉴스 이미지 생성</span>
            </div>
            {!candidates.length ? <>
              <div className="space-y-stack rounded-surface border border-border bg-surface p-stack" data-create-question={question}>
                {question === "kind" ? <fieldset data-create-kind-picker><legend className="mb-stack-tight text-caption font-semibold text-text">무엇을 만들까요?</legend>
                  <p className="mb-stack break-keep text-caption text-subtle">여러 형식을 고를 수 있습니다. 처음 고른 형식의 구조 초안 3개를 먼저 보여 드립니다.</p>
                  <div className="flex flex-wrap gap-stack-tight">
                    {CREATE_KIND_ORDER.map((kind) => (
                      <Button key={kind} size="sm" variant={primaryKind === kind || alsoKinds.includes(kind) ? "primary" : "secondary"} aria-pressed={primaryKind === kind || alsoKinds.includes(kind)} onClick={() => choosePrimary(kind)}>{CREATE_KIND_LABELS[kind]}</Button>
                    ))}
                  </div>
                  {primaryKind ? <p className="mt-stack-tight break-keep text-caption text-subtle">{CREATE_KIND_LABELS[primaryKind]} 구조를 먼저 확인합니다.{alsoKinds.length ? ` 추가 선택: ${alsoKinds.map((kind) => CREATE_KIND_LABELS[kind]).join(", ")}` : ""}</p> : null}
                  <div className="mt-stack flex justify-end"><Button variant="primary" onClick={() => setQuestionIndex(1)} disabled={!primaryKind}>다음</Button></div>
                </fieldset> : null}

                {question === "purpose" ? <fieldset data-create-purpose-picker><legend className="mb-stack-tight text-caption font-semibold text-text">이번 콘텐츠로 원하는 결과는 무엇인가요?</legend>
                  <div className="flex flex-wrap gap-stack-tight">
                    {PURPOSE_CARDS.map((card) => (
                      <Button key={card.id} size="sm" variant={purpose === card.sample ? "primary" : "secondary"} aria-pressed={purpose === card.sample} title={card.sample} onClick={() => { setPurpose(card.sample); setQuestionIndex(2); }}>{card.title}</Button>
                    ))}
                  </div>
                  {purpose ? <p className="mt-stack-tight break-keep text-caption text-subtle">{purpose}</p> : null}
                </fieldset> : null}

                {question === "audience" ? <fieldset data-create-audience-picker><legend className="mb-stack-tight text-caption font-semibold text-text">누가 이 콘텐츠를 보나요?</legend>
                  <p className="mb-stack break-keep text-caption text-subtle">우리 서비스를 이용하거나 구매할 고객을 기준으로 고르세요.</p>
                  <div className="flex flex-wrap gap-stack-tight">
                    {AUDIENCE_CARDS.map((card) => (
                      <Button key={card.id} size="sm" variant={audience === card.sample ? "primary" : "secondary"} aria-pressed={audience === card.sample} title={card.sample} onClick={() => chooseAudience(card.sample)}>{card.title}</Button>
                    ))}
                  </div>
                  {audience ? <p className="mt-stack-tight break-keep text-caption text-subtle">{audience}</p> : null}
                </fieldset> : null}

                {question === "topic" ? <fieldset data-create-topic-picker><legend className="mb-stack-tight text-caption font-semibold text-text">어떤 주제로 만들까요?</legend>
                  <p className="mb-stack break-keep text-caption text-subtle">학습 정보의 업종과 방금 고른 목표를 기준으로 제안했습니다.</p>
                  <div className="space-y-stack-tight">
                    {topicCards.map((suggestion) => (
                      <Button key={suggestion} size="sm" variant={topic === suggestion ? "primary" : "secondary"} aria-pressed={topic === suggestion} onClick={() => { onTopicChange(suggestion); setTopicOpen(false); setQuestionIndex(4); }} className="ds-label-fill w-full min-w-0 justify-start text-left"><span className="min-w-0 truncate">{suggestion}</span></Button>
                    ))}
                    {topicOpen ? (
                      <><Field label="직접 입력한 주제" htmlFor="studio-topic"><input ref={topicInputRef} id="studio-topic" value={topic} onChange={(event) => onTopicChange(event.target.value)} placeholder="고객에게 전할 주제를 입력하세요" className="w-full rounded-control border border-border bg-surface-2 px-stack text-body text-text" /></Field><Button variant="primary" onClick={() => setQuestionIndex(4)} disabled={!topic.trim()}>이 주제로 계속</Button></>
                    ) : (
                      <Button size="sm" onClick={() => { setTopicOpen(true); setTimeout(() => topicInputRef.current?.focus(), 0); }}>직접 입력</Button>
                    )}
                  </div>
                </fieldset> : null}

                {question === "rights" ? <fieldset data-create-rights-picker><legend className="mb-stack-tight text-caption font-semibold text-text">사용할 자료의 권리를 확인해 주세요.</legend>
                  <p className="mb-stack break-keep text-caption text-subtle">직접 만든 자료이거나, 저작권자에게 콘텐츠 제작과 게시 허가를 받은 사진·영상·글만 사용할 수 있습니다.</p>
                  <label className="flex items-start gap-stack-tight text-caption text-muted"><input type="checkbox" checked={rightsConfirmed} onChange={(event) => confirmRights(event.target.checked)} />위 조건을 확인했습니다.</label>
                  <div className="mt-stack flex justify-end"><Button variant="primary" onClick={() => setQuestionIndex(5)} disabled={!rightsConfirmed}>입력 내용 확인</Button></div>
                </fieldset> : null}

                {question === "review" ? <section data-create-review>
                  <b className="text-caption font-semibold text-text">입력 내용을 확인해 주세요.</b>
                  <dl className="mt-stack space-y-stack-tight text-caption text-muted">
                    <div><dt className="text-subtle">형식</dt><dd>{primaryKind ? [primaryKind, ...alsoKinds].map((kind) => CREATE_KIND_LABELS[kind]).join(", ") : "미입력"}</dd></div>
                    <div><dt className="text-subtle">목표</dt><dd>{purpose || "미입력"}</dd></div>
                    <div><dt className="text-subtle">고객</dt><dd>{audience || "미입력"}</dd></div>
                    <div><dt className="text-subtle">주제</dt><dd>{topic || "미입력"}</dd></div>
                    <div><dt className="text-subtle">사용 권리</dt><dd>{rightsConfirmed ? "확인됨" : "미확인"}</dd></div>
                  </dl>
                </section> : null}
              </div>
              {questionIndex > 0 && question !== "review" ? <Button onClick={() => setQuestionIndex((current) => Math.max(0, current - 1))}>이전 질문</Button> : null}
              {question === "review" && missing.length ? <div className="rounded-control border border-warning/30 bg-warning/10 p-stack text-caption text-warning">확인 필요: {missing.join(", ")}</div> : null}
              {question === "review" ? <><Button onClick={() => setQuestionIndex(0)}>입력 내용 수정</Button><Button variant="primary" onClick={generate} disabled={loading || missing.length > 0}>{loading ? "구조 초안 만드는 중" : "구조 초안 3개 보기"}</Button></> : null}
            </> : null}
            {candidates.length && !selectedCandidate ? <>
              {candidates.map((candidate) => <Button key={candidate.label} variant="secondary" onClick={() => chooseStructureCandidate(candidate)} disabled={quickDraftLoading}>{quickDraftLoading ? "후보 만드는 중" : `${candidate.label} 구조 초안 선택`}</Button>)}
              <Button onClick={regenerateAll} disabled={loading}>{loading ? "다시 만드는 중" : "3개 모두 바꾸기"}</Button>
            </> : null}
            {selectedCandidate && alsoQuote && !alsoBatch ? (
              <div className="space-y-stack rounded-surface border border-border bg-surface p-stack" data-create-also-confirm>
                <b className="block text-caption font-semibold text-text">추가 형식의 구성 초안 비용</b>
                <ul className="space-y-stack-tight">
                  {alsoQuote.lines.map((line) => (
                    <li key={line.kind} className="flex justify-between text-caption text-muted">
                      <span>{line.label}</span>
                      <span>{line.unit_minor.toLocaleString("ko-KR")}원</span>
                    </li>
                  ))}
                </ul>
                <p className="flex justify-between border-t border-border pt-stack-tight text-caption font-semibold text-text" data-also-total-minor={alsoQuote.total_minor}>
                  <span>구성 초안 생성 비용</span>
                  <span>{alsoQuote.total_minor.toLocaleString("ko-KR")}원</span>
                </p>
                <p className="break-keep text-caption text-subtle">완성 미디어가 아니라 선택한 구조를 다른 형식에 맞춘 구성 초안입니다. 실패한 형식은 청구하지 않습니다.</p>
                <Button variant="primary" onClick={confirmAlsoKinds} disabled={alsoBusy}>{alsoBusy ? "구성 초안 만드는 중" : "선택한 형식의 구성 초안 만들기"}</Button>
              </div>
            ) : null}
            {alsoBatch ? (
              <div className="space-y-stack rounded-surface border border-border bg-surface p-stack" data-create-also-result={alsoBatch.status}>
                <b className="block text-caption font-semibold text-text">{alsoBatch.discarded_at ? "추가 구성 초안을 버렸습니다" : "추가 형식의 구성 초안"}</b>
                <ul className="space-y-stack-tight">
                  {alsoBatch.items.map((item) => (
                    <li key={item.kind} className="break-keep text-caption text-muted" data-also-item={item.kind} data-also-item-status={item.status}>
                      {item.label}: {item.status === "succeeded" ? (item.kind === "video" ? "대본과 장면 구성을 준비했습니다. 영상 렌더링은 아직 제공하지 않습니다" : "구성 초안을 준비했습니다") : `구성 초안을 만들지 못했습니다. ${item.failure_reason ?? ""}`}
                    </li>
                  ))}
                </ul>
                <p className="text-caption text-subtle">나간 값 {alsoBatch.cost.charged_minor.toLocaleString("ko-KR")}원</p>
                {alsoBatch.discarded_at ? null : <Button onClick={discardAlso} disabled={alsoBusy}>추가 구성 초안 버리기</Button>}
              </div>
            ) : null}
            {selectedCandidate && (alsoKinds.length === 0 || Boolean(alsoBatch)) ? <Stack gap={8}><Button variant="primary" onClick={onOpenEditor}>편집실에서 다듬기</Button><Button onClick={() => setSelected(null)}>구조 초안 다시 고르기</Button></Stack> : null}
            {quickDraftError ? <p role="alert" className="text-caption text-danger">{quickDraftError}</p> : null}
            {error ? <p role="alert" className="text-caption text-danger">{error}</p> : null}
          </Stack>
        </AssistantPanel>
      </div>
    </section>
  );
}
interface EditRoomProps {
  lines: string[];
  onLinesChange: (lines: string[]) => void;
  kind?: EditContentKind;
  onKindChange?: (kind: EditContentKind) => void;
  previewReady?: boolean;
  commandPanel?: ReactNode;
  initialFormat?: ContentEditFormat;
  onFormatChange?: (format: ContentEditFormat) => void;
  cardTextPositions?: CardTextPosition[];
  onCardTextPositionsChange?: (positions: CardTextPosition[]) => void;
  state?: "default" | "loading" | "error" | "overflow";
  onOpenCreate?: () => void;
  onRetry?: () => void;
  onOpenPublish?: () => void;
  lastSavedAt?: string;
  moveBusy?: boolean;
  autosaveError?: string;
}
type ToolName = "비율" | "배경" | "목소리" | "속도" | "자막" | "음악" | "음량";
const VIDEO_TOOLS: ToolName[] = ["비율", "목소리", "속도", "자막"];
const CARD_TOOLS: ToolName[] = ["비율", "배경", "자막"];
const AUDIO_TOOLS: ToolName[] = ["목소리", "음악", "음량"];

type ToolValues = Record<ToolName, string>;

const EDIT_KIND_LABELS: Record<EditContentKind, string> = {
  text: "글",
  card: "카드뉴스",
  video: "영상",
  audio: "음악",
};
const EDIT_KIND_ORDER: EditContentKind[] = ["text", "card", "video", "audio"];
const SUBTITLE_SIZE_LABELS: Record<string, string> = {
  작게: "작은 글자",
  보통: "기본 글자",
  크게: "큰 글자",
};
const BACKGROUND_LABELS: Record<string, string> = {
  "작업실 책상": "책상 위 제품 사진",
  "삭제 커밋 화면": "프로그램 작업 화면",
  "창밖 새벽": "새벽 창가 사진",
};

function visibleToolName(kind: EditContentKind, tool: ToolName): string {
  if (tool === "비율") return kind === "card" ? "카드 비율" : "영상 비율";
  if (tool === "배경") return "배경 이미지";
  if (tool === "자막") return kind === "card" ? "카드 글자 크기" : "자막 크기";
  if (tool === "속도") return "영상 재생 속도";
  if (tool === "음량") return "배경음악 음량";
  return tool;
}

function visibleToolValue(tool: ToolName, value: string, kind?: EditContentKind): string {
  if (tool === "비율" && kind === "card" && value === "4:5") return "4:5 · 1080 × 1350픽셀";
  if (tool === "비율" && kind === "video" && value === "9:16") return "9:16 · 1080 × 1920픽셀";
  if (tool === "자막" && kind === "card" && value === "보통") return "기본 28픽셀";
  if (tool === "자막") return SUBTITLE_SIZE_LABELS[value] ?? value;
  if (tool === "배경") return BACKGROUND_LABELS[value] ?? value;
  return value;
}

function toolOptions(kind: EditContentKind, tool: ToolName): string[] {
  if (tool === "비율") return [...(kind === "card" ? CARD_ASPECT_RATIOS : VIDEO_ASPECT_RATIOS)];
  if (tool === "배경") return [...EDIT_BACKGROUNDS];
  if (tool === "목소리") return [...EDIT_VOICES];
  if (tool === "속도") return PLAYBACK_SPEEDS.map((value) => `${value}배`);
  if (tool === "자막") return [...SUBTITLE_SIZES];
  if (tool === "음악") return [...EDIT_MUSIC_TRACKS];
  return EDIT_MUSIC_VOLUMES.map((value) => `${value}%`);
}

function toolValuesFromFormat(format: ContentEditFormat): ToolValues {
  const defaults: ToolValues = {
    비율: "9:16",
    배경: "작업실 책상",
    목소리: "차분한 남성",
    속도: "1배",
    자막: "보통",
    음악: "없음",
    음량: "20%",
  };
  if (format.kind === "video") {
    return { ...defaults, 비율: format.aspectRatio, 목소리: format.voice, 속도: `${format.playbackSpeed}배`, 자막: format.subtitleSize };
  }
  if (format.kind === "card") {
    return { ...defaults, 비율: format.aspectRatio, 배경: format.background, 자막: format.subtitleSize };
  }
  if (format.kind === "text") return defaults;
  return { ...defaults, 목소리: format.voice, 음악: format.musicTrack, 음량: `${format.musicVolume}%` };
}

function formatFromToolValues(kind: ContentEditFormat["kind"], values: ToolValues): ContentEditFormat {
  const candidate = kind === "text"
    ? { kind }
    : kind === "video"
    ? { kind, aspectRatio: values.비율, subtitleSize: values.자막, playbackSpeed: Number.parseFloat(values.속도), voice: values.목소리 }
    : kind === "card"
      ? { kind, aspectRatio: values.비율, subtitleSize: values.자막, background: values.배경 }
      : { kind, voice: values.목소리, musicTrack: values.음악, musicVolume: Number.parseInt(values.음량, 10) };
  const validation = validateContentEditFormat(candidate);
  return validation.valid ? validation.value : defaultContentEditFormat(kind);
}

function ToolIcon({ tool }: { tool: ToolName }) {
  const paths: Record<ToolName, ReactNode> = {
    비율: <><rect x="4" y="6" width="16" height="12" rx="2" /><path d="M9 6v12" /></>,
    배경: <><circle cx="12" cy="12" r="8" /><path d="M12 4a8 8 0 0 0 0 16" /></>,
    목소리: <><path d="M5 10v4h3l4 3V7L8 10H5Z" /><path d="M16 9c1 1 1 5 0 6" /></>,
    속도: <><circle cx="12" cy="12" r="8" /><path d="m12 12 4-3" /></>,
    자막: <><rect x="3" y="5" width="18" height="14" rx="2" /><path d="M7 10h10M7 14h7" /></>,
    음악: <><path d="M9 18V6l10-2v12" /><circle cx="6" cy="18" r="3" /><circle cx="16" cy="16" r="3" /></>,
    음량: <><path d="M5 10v4h3l4 3V7L8 10H5Z" /><path d="M16 9c1 1 1 5 0 6" /></>,
  };
  return <svg aria-hidden="true" viewBox="0 0 24 24" className="h-5 w-5" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">{paths[tool]}</svg>;
}

export function EditRoom({
  lines,
  onLinesChange,
  kind = "video",
  onKindChange,
  previewReady = false,
  commandPanel,
  initialFormat,
  onFormatChange,
  cardTextPositions = [],
  onCardTextPositionsChange,
  state = "default",
  onOpenCreate,
  onRetry,
  onOpenPublish,
  lastSavedAt,
  moveBusy = false,
  autosaveError,
}: EditRoomProps) {
  const formatKind = kind;
  const safeLines = lines.length ? lines : [""];
  const [activeLine, setActiveLine] = useState(0);
  const [activeTool, setActiveTool] = useState<ToolName>("비율");
  const [toolValues, setToolValues] = useState<ToolValues>(() => toolValuesFromFormat(
    initialFormat?.kind === formatKind ? initialFormat : defaultContentEditFormat(formatKind),
  ));
  const [visibleLines, setVisibleLines] = useState<boolean[]>(() => safeLines.map(() => true));
  const [bulkMessage, setBulkMessage] = useState("");
  const selectedFormat = useMemo(() => formatFromToolValues(formatKind, toolValues), [formatKind, toolValues]);
  const lastEmittedFormat = useRef("");
  useEffect(() => { setVisibleLines((current) => safeLines.map((_, index) => current[index] ?? true)); setActiveLine((current) => Math.min(current, safeLines.length - 1)); }, [safeLines.length]);
  useEffect(() => {
    const nextFormat = initialFormat?.kind === formatKind ? initialFormat : defaultContentEditFormat(formatKind);
    if (JSON.stringify(nextFormat) !== lastEmittedFormat.current) {
      setToolValues(toolValuesFromFormat(nextFormat));
    }
    setActiveTool(kind === "audio" ? "목소리" : "비율");
  }, [formatKind, initialFormat, kind]);
  useEffect(() => {
    lastEmittedFormat.current = JSON.stringify(selectedFormat);
    onFormatChange?.(selectedFormat);
  }, [onFormatChange, selectedFormat]);
  const visibleCount = visibleLines.filter((visible, index) => visible && Boolean(safeLines[index]?.trim())).length;
  const secondsPerLine = kind === "video" && selectedFormat.kind === "video" ? 4 / selectedFormat.playbackSpeed : 4;
  const duration = visibleCount * secondsPerLine;
  const durationLabel = Number.isInteger(duration) ? String(duration) : duration.toFixed(1);
  const selectedLine = safeLines[activeLine] ?? "";
  const silenceIndexes = safeLines.map((line, index) => (/…|\.{3}|^\s*$/.test(line) ? index : -1)).filter((index) => index >= 0);
  const visibleSilences = silenceIndexes.filter((index) => visibleLines[index]).length;
  const tools = kind === "card" || kind === "text" ? CARD_TOOLS : kind === "audio" ? AUDIO_TOOLS : VIDEO_TOOLS;
  const outlineTitle = kind === "text" ? "글 문단" : kind === "card" ? "카드 목록" : kind === "audio" ? "대사 목록" : "영상 장면";
  const unit = kind === "card" ? "장" : kind === "text" ? "문단" : "장면";
  const hasEditableContent = safeLines.some((line) => line.trim().length > 0);
  const roomState = state === "default" && !hasEditableContent ? "empty" : state;
  const editorVisible = roomState === "default" || roomState === "overflow";
  const updateLine = (value: string) => onLinesChange(safeLines.map((line, index) => index === activeLine ? value : line));
  const toggleLine = (index: number) => setVisibleLines((current) => current.map((visible, lineIndex) => lineIndex === index ? !visible : visible));
  const trimSilences = () => setVisibleLines((current) => current.map((visible, index) => silenceIndexes.includes(index) ? false : visible));
  const shortenAll = () => {
    const next = safeLines.map((line) => line.length > 24 ? `${line.slice(0, 23)}…` : line);
    const changed = next.filter((line, index) => line !== safeLines[index]).length;
    if (changed) onLinesChange(next);
    setBulkMessage(changed ? `긴 문장 ${changed}개를 줄였습니다.` : "줄일 긴 문장이 없습니다.");
  };
  const politeAll = () => {
    const next = safeLines.map((line) => line.replace(/(다|음|함)\.?$/u, "습니다").replace(/\s+$/u, ""));
    const changed = next.filter((line, index) => line !== safeLines[index]).length;
    if (changed) onLinesChange(next);
    setBulkMessage(changed ? `${changed}개 문장의 말끝을 높임말로 맞췄습니다.` : "말끝이 이미 높임말입니다.");
  };
  const dropEmpty = () => {
    const next = safeLines.filter((line) => line.trim());
    const removed = safeLines.length - next.length;
    if (removed) onLinesChange(next);
    setBulkMessage(removed ? `빈 줄 ${removed}개를 걷어냈습니다.` : "빈 줄이 없습니다.");
  };
  return (
    <section data-room="edit" data-edit-kind={kind} data-edit-state={roomState} className="space-y-stack-section">
      <div className={styles.editRoomGrid}>
        <main className="min-w-0 space-y-pad-inset">
          {editorVisible ? (
            <>
              <section data-room-top="edit" aria-label="편집실 현재 작업">
                <h2 className="break-keep text-heading font-bold text-text">내용과 화면을 직접 다듬습니다</h2>
                <p className="mt-stack-tight break-keep text-body-sm text-muted">만들 형식을 고른 뒤 결과물 자체를 고칩니다. 올릴 채널과 채널별 문구는 발행실에서 정합니다.</p>
              </section>
              <div role="group" aria-label="만들 콘텐츠 형식" className="flex flex-wrap gap-stack-tight">
                {EDIT_KIND_ORDER.map((editKind) => (
                  <Button
                    key={editKind}
                    size="sm"
                    aria-label={EDIT_KIND_LABELS[editKind]}
                    aria-pressed={kind === editKind}
                    variant="secondary"
                    className={kind === editKind ? "border-accent bg-accent-soft text-accent" : ""}
                    onClick={() => onKindChange?.(editKind)}
                  >
                    {EDIT_KIND_LABELS[editKind]}
                  </Button>
                ))}
              </div>
              <p className="rounded-control bg-surface-2 p-pad-inset text-caption text-muted" data-platform-boundary>
                <strong className="text-text">형식과 채널은 다릅니다.</strong> 여기서는 무엇을 만들지 고칩니다. 스레드, 인스타그램처럼 어디에 올릴지는 발행실에서 정합니다.
              </p>
              <div className={`card overflow-hidden ${styles.editWorkbench}`} data-edit-workspace data-text-document-editor={kind === "text" ? "true" : undefined}>
                <nav className={`max-h-80 min-w-0 overflow-y-auto p-pad-inset ${styles.editOutline}`} aria-label={outlineTitle} data-edit-outline>
                  <b className="text-body text-text">{outlineTitle}</b>
                  <ol className="mt-stack space-y-stack-tight">{safeLines.map((line, index) => (
                    <li key={`${index}-${line.slice(0, 16)}`}>
                      <Button size="sm" variant="secondary" aria-pressed={activeLine === index} onClick={() => setActiveLine(index)} className={`ds-label-fill w-full min-w-0 justify-start overflow-hidden text-left ${activeLine === index ? "border-accent bg-accent-soft text-accent" : ""} ${visibleLines[index] ? "" : "line-through opacity-60"}`}>
                        <span className="min-w-0 break-keep text-left">{index + 1}. {line || (kind === "text" ? "빈 문단" : "빈 대사")}</span>
                      </Button>
                    </li>
                  ))}</ol>
                </nav>
                <div className="min-w-0 p-pad-inset">
                  {kind === "text" ? (
                    <section aria-labelledby="whole-text-title" data-edit-stage>
                      <div className="mb-stack flex flex-wrap items-start justify-between gap-stack-tight">
                        <div><b id="whole-text-title" className="text-body text-text">글 전체 편집</b><p className="text-caption text-subtle">공백 포함 {safeLines.join("\n\n").length}자 · 문단 {safeLines.length}개</p></div>
                      </div>
                      <textarea
                        aria-label="글 전체"
                        value={safeLines.join("\n\n")}
                        rows={14}
                        onChange={(event) => onLinesChange(event.target.value.split(/\n\s*\n/))}
                        className="min-h-80 w-full resize-y overflow-y-auto rounded-control border border-border bg-surface p-pad-inset text-body leading-relaxed text-text"
                      />
                      <p className="mt-stack-tight text-caption text-subtle">문단을 나누거나 합쳐도 자동 저장됩니다.</p>
                    </section>
                  ) : (
                    <>
                      {kind === "audio" ? (
                        <section className="space-y-pad-inset" data-edit-readiness>
                          <div className="grid min-h-80 place-items-center rounded-surface bg-surface-2 p-region text-center"><b className="text-subheading text-text">나레이션 대사 편집</b></div>
                          <p className="rounded-control border border-warning bg-warning-soft p-pad-inset text-body-sm text-warning">음악 파일 생성은 아직 제공하지 않습니다. 지금은 나레이션 대사만 편집할 수 있습니다.</p>
                        </section>
                      ) : (
                        <>
                          <section aria-label={kind === "card" ? "카드뉴스 미리보기" : "영상 미리보기"} data-edit-stage>
                            <EditPreview
                              kind={kind}
                              lines={safeLines.map((line, index) => (visibleLines[index] ? line : ""))}
                              activeLine={activeLine}
                              onActiveLine={setActiveLine}
                              subtitleSize={toolValues.자막}
                              renderReady={previewReady}
                              onLinesChange={onLinesChange}
                              cardTextPositions={cardTextPositions}
                              onCardTextPositionsChange={onCardTextPositionsChange}
                              aspectRatio={toolValues.비율}
                              onAspectRatioChange={(aspectRatio) => {
                                if (toolOptions(formatKind, "비율").includes(aspectRatio)) {
                                  setToolValues((current) => ({ ...current, 비율: aspectRatio }));
                                }
                              }}
                            />
                          </section>
                          <section className="mt-pad-inset border-b border-border pb-pad-inset" aria-label="간편 편집 도구" data-edit-tools>
                            <div className="flex flex-wrap gap-stack-tight">{tools.map((tool) => <Button key={tool} size="sm" variant="secondary" className={activeTool === tool ? "border-accent bg-accent-soft text-accent" : ""} onClick={() => setActiveTool(tool)} aria-pressed={activeTool === tool} aria-label={`${visibleToolName(kind, tool)} 도구`}><ToolIcon tool={tool} /><span>{visibleToolName(kind, tool)}: {visibleToolValue(tool, toolValues[tool], kind)}</span></Button>)}
                              {kind === "video" ? <Button size="sm" onClick={trimSilences} disabled={visibleSilences === 0}>무음 구간 {visibleSilences}개 줄이기</Button> : null}
                            </div>
                            <div className="mt-pad-inset flex flex-wrap gap-stack-tight" aria-label={`${visibleToolName(kind, activeTool)} 선택지`}>{toolOptions(formatKind, activeTool).map((option) => <Button key={option} size="sm" variant="secondary" className={toolValues[activeTool] === option ? "border-accent bg-accent-soft text-accent" : ""} aria-pressed={toolValues[activeTool] === option} onClick={() => setToolValues((current) => ({ ...current, [activeTool]: option }))}>{visibleToolValue(activeTool, option, kind)}</Button>)}</div>
                          </section>
                        </>
                      )}
                      <section className="mt-pad-inset" aria-labelledby="edit-script-title" data-edit-script>
                        <div className="mb-stack flex flex-wrap items-center justify-between gap-stack-tight"><b id="edit-script-title" className="text-body text-text">{kind === "card" ? "카드 글자" : kind === "audio" ? "나레이션 대사" : "선택한 장면 대사"}</b><span className="text-caption text-subtle" data-edit-duration={kind === "video" ? durationLabel : undefined}>{visibleCount}개 {unit}{kind === "video" ? ` · ${durationLabel}초` : ""}</span></div>
                        <ol className="space-y-stack-tight">{safeLines.map((line, index) => <li key={`script-${index}`} className={`grid gap-stack-tight rounded-control border border-border bg-surface-2 p-stack md:grid-cols-[4rem_minmax(0,1fr)_auto] ${visibleLines[index] ? "" : "opacity-60"}`} data-script-line={index + 1}>
                          <span className="text-caption text-subtle">{kind === "card" ? `${index + 1}장` : kind === "audio" ? `${index + 1}번째` : `${index * secondsPerLine}초부터`}</span>
                          {activeLine === index ? <input aria-label={`${kind === "card" ? "문구" : "대사"} ${index + 1}`} value={line} onChange={(event) => updateLine(event.target.value)} className={`min-h-control-touch min-w-0 rounded-control border border-border bg-surface px-stack text-body-sm text-text ${visibleLines[index] ? "" : "line-through"}`} /> : <button type="button" onClick={() => setActiveLine(index)} className={`min-h-control-touch min-w-0 break-keep rounded-control px-stack text-left text-body-sm text-text hover:bg-surface ${visibleLines[index] ? "" : "line-through"}`}>{line || "빈 대사"}</button>}
                          <Button size="sm" onClick={() => toggleLine(index)}>{visibleLines[index] ? "빼기" : "되살리기"}</Button>
                        </li>)}</ol>
                      </section>
                    </>
                  )}
                </div>
              </div>
            </>
          ) : roomState === "empty" ? (
            <StateNotice tone="empty" title="아직 편집할 작업물이 없습니다" description="생성실에서 초안을 고르면 글, 카드뉴스, 영상 형식에 맞는 편집 도구가 열립니다." actionLabel="생성실에서 작업물 고르기" onAction={onOpenCreate} className="min-h-80 justify-center" />
          ) : roomState === "error" ? (
            <StateNotice tone="error" title="편집 내용을 불러오지 못했어요" description="마지막 자동 저장본은 남아 있습니다. 연결을 확인한 뒤 다시 불러오세요." actionLabel="다시 불러오기" onAction={onRetry} className="min-h-80 justify-center" />
          ) : (
            <section aria-label="편집 내용 불러오는 중" aria-busy="true" className="card grid min-h-80 place-items-center p-region">
              <div className="w-full max-w-sm space-y-pad-inset"><div className="h-10 animate-pulse rounded-control bg-surface-2" /><div className="h-44 animate-pulse rounded-control bg-surface-2" /><div className="h-10 animate-pulse rounded-control bg-surface-2" /></div>
            </section>
          )}
        </main>
        {commandPanel ?? (
          <aside className={`card p-pad-inset ${styles.editHelper}`} aria-label="편집 담당 대화창" data-edit-helper>
            <div className={styles.editHelperActions}>
              <h2 className="text-body font-bold text-text">전체에 한 번에 적용</h2>
              <p className="mt-stack-tight break-keep text-caption text-muted">반복해서 고칠 일은 담당에게 맡길 수 있습니다.</p>
              <div className="mt-pad-inset grid gap-stack-tight">
                <Button className="w-full min-w-0 justify-start" onClick={shortenAll} disabled={!hasEditableContent}>전부 짧게 줄이기</Button>
                <Button className="w-full min-w-0 justify-start" onClick={politeAll} disabled={!hasEditableContent}>말끝을 높임말로 맞추기</Button>
                <Button className="w-full min-w-0 justify-start" onClick={dropEmpty} disabled={!hasEditableContent}>빈 줄 걷어내기</Button>
              </div>
              {bulkMessage ? <p className="mt-stack text-caption text-success" aria-live="polite">{bulkMessage}</p> : null}
            </div>
            <div className={styles.editHelperFooter}>
              <small className={autosaveError ? "text-caption text-danger" : "text-caption text-success"}>{autosaveError || (lastSavedAt ? `마지막 자동 저장 ${lastSavedAt}` : "고치는 대로 자동 저장됨")}</small>
              <Button variant="primary" size="lg" className="w-full min-w-0" onClick={onOpenPublish} disabled={!editorVisible || !hasEditableContent || Boolean(autosaveError) || moveBusy}>{moveBusy ? "저장하고 이동 중" : "발행실로 이동"}</Button>
            </div>
          </aside>
        )}
      </div>
    </section>
  );
}
