"use client";

import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { Button } from "@/components/shared/Button";
import { StateNotice } from "@/components/shared/StateNotice";
import { EditPreview, type CardTextPosition } from "./EditPreview";
import { EditOutline } from "./EditOutline";
import { CardDeckPanel } from "./BubbleEditor";
import type { CardDeck } from "@/lib/studio/card-deck-contract";
import { deckProjection, applyProjection } from "@/lib/studio/card-deck-contract";
import { VideoEditor } from "./VideoEditor";
import { emptyVideoEdit, type VideoEdit } from "@/lib/studio/video-edit-contract";
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
import { IMAGE_STYLES, CUSTOM_STYLE_ID } from "@/components/studio/image-style";
import { themeFromPalette, type CardRatio } from "@/lib/studio/text-card-image";
import { browserCardUploader, renderAndUploadCardDeck } from "@/lib/studio/card-deck";
import { renderChatBubbleSlideToCanvas } from "@/lib/studio/card-templates/chat-bubble";
import {
  CARD_ASPECT_RATIOS,
  EDIT_BACKGROUNDS,
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
  isCardChosen,
  readLearningInfo,
  writeLearningInfo,
  type LearningInfo,
} from "./learning-info";
import styles from "./StudioRooms.module.css";
import { DeliveredMedia } from "@/components/studio/DeliveredMedia";
import { authHeaders } from "@/lib/auth";

// M5(2026-09-22 코드리뷰): 매 렌더 새 객체를 만들지 않게 모듈 스코프에서 한 번만 만든다.
// videoEdit는 순수함수(video-edit-contract.ts)로만 바뀌므로 이 상수를 직접 변형하지 않는다.
const EMPTY_VIDEO_EDIT: VideoEdit = emptyVideoEdit();

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
// 생성실이 답한 질문과 만든 후보를 브라우저에 남기는 자리.
// 부모(작업실)도 이 키를 알아야 한다. "새로 시작" 이 이것을 못 보면, 부모 상태는 비었는데
// 여기에 후보가 남아 화면에는 계속 옛 후보가 뜨고 "이미 비어 있습니다" 로 닫힌다.
// 그러면 사용자는 그 후보를 영원히 못 지운다(2026-09-09 실사용에서 확인).
export const CREATE_DRAFT_STORAGE_PREFIX = "studio_create_state";

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
  /** draftId 를 주면(카톡 말풍선 카드뉴스 9장을 방금 만들었을 때) 그 초안을 실어 편집실로 연다. */
  onOpenEditor?: (draftId?: string) => void;
  /**
   * 파생(derivations) 확정이 성공하면 draft_id 를 준다. 부모가 초안 목록을 재검증
   * (SWR mutate)해야 `cardDeckByDraftId` 가 방금 만든 덱을 실제로 찾는다 — 안 하면
   * 탭 포커스가 바뀔 때까지 썸네일이 안 뜬다(코드리뷰 2026-09-22 M3).
   */
  onDerivationSucceeded?: (draftId: string) => Promise<void> | void;
  /** 생성실에서 첫 형식을 고르기 전 헤더가 특정 형식을 추측하지 않게 현재 선택을 전달한다. */
  onPrimaryKindChange?: (kind: CreateKind | null) => void;
  /** 같이 만들 갈래가 바뀌면 헤더 상태판이 따라 바뀐다 */
  onAlsoKindsChange?: (kinds: CreateKind[]) => void;
  /** 학습 정보가 문답에서 갱신되면 이 값이 올라가고 생성실이 다시 읽는다 */
  learningVersion?: number;
  /** 생성실 문답에서 바뀐 학습 정보를 작업실 헤더와 다음 방에도 즉시 전달한다. */
  onLearningInfoChange?: (info: LearningInfo) => void;
  /** 만들던 것 이어서 하기. 0이면 줄이 아예 안 뜬다 */
  resumeCount?: number;
  onResume?: () => void;
  quickDraft?: QuickDraftResult | null;
  quickDraftLoading?: boolean;
  quickDraftError?: string | null;
  /** 카드뉴스 대표 이미지 생성. 비용 승인 관문은 호출부가 담당한다. */
  onGenerateCardImages?: () => Promise<void>;
  /**
   * 무료 글자 카드를 작업 공간 자산으로 저장한 뒤 편집·발행 상태에 연결한다.
   *
   * 그림 주소만 넘기면 편집실은 카드가 몇 장인지 모른다. 실제로 그래서 3장을 만들어도
   * 편집실이 `1 / 1` 을 그렸다(2026-09-14 실측). 카드에 적힌 글자를 같이 넘겨야
   * 편집실 목록과 발행 그림의 장수가 맞는다.
   */
  onTextCardsCreated?: (urls: string[], lines: string[]) => void;
  /** 글자 카드를 어느 비율로 그릴지. 화면에서 고른 값이 실제 픽셀이 된다. */
  cardRatio?: CardRatio;
  /** 숏폼 영상 생성. 카드뉴스와 같이 비용 승인 관문은 호출부가 담당한다. */
  onGenerateVideo?: () => Promise<void>;
  videoBusy?: boolean;
  /** 방금 만든 결과. 만든 자리에서 보여야 만들어졌다는 것을 안다(회장 2026-09-07). */
  /** 만들 그림의 결. 고객이 만들기 전에 고른다(회장 2026-09-08). */
  imageStyleId?: string;
  imageStyleCustom?: string;
  onImageStyleChange?: (styleId: string, custom: string) => void;
  /**
   * 값이 바뀌면 생성실이 자기 상태를 비운다.
   *
   * 2026-09-09 실사용에서 찾았다. 머리줄의 "새로 시작" 을 누르고 확인까지 했는데
   * 생성실에는 앞서 만든 구조 초안 세 개가 그대로 남아 "3 / 3 선택한 구조 확인" 이었다.
   * 부모는 본문·이미지·영상을 지웠지만 후보와 답한 질문은 이 컴포넌트 안에 있어서
   * 손이 닿지 않았다. **버렸다고 말하고 안 버리는 것**이 가장 나쁘다.
   */
  resetToken?: number;
  madeImageUrl?: string | null;
  madeVideoUrl?: string | null;
  cardImageBusy?: boolean;
  onQuickDraftGenerate?: (structure: CreateStructureChoice) => Promise<void> | void;
  /**
   * "다른 형식도 같이" 로 만든 카톡 말풍선 카드뉴스의 실제 덱을 draft_id 로 찾는다.
   *
   * 2026-09-22 PR4: `deck_summary`(장수·훅·CTA 키워드) 텍스트만으로는 "방금 만든 것"을
   * 눈으로 확인할 수 없다. 목록(`GET /api/studio/drafts`)에 이미 `cardDeck` 이 실려
   * 오므로(§7.3) 그것을 찾아 캔버스로 실제 9장을 그린다. 못 찾으면(아직 목록에 안 온
   * 낙관적 응답 구간 등) 조용히 비우지 않고 기존 텍스트 요약으로 물러선다.
   */
  cardDeckByDraftId?: (draftId: string) => CardDeck | null;
}

/**
 * 카드 덱 한 벌을 작은 썸네일 9장으로 캔버스에 그린다("방금 만든 것" 실물 확인).
 *
 * 2026-09-22 실측: PR3 까지는 카드뉴스 생성 직후 화면에 "9장을 만들었습니다(훅: pain,
 * 댓글 키워드: '순서')" 라는 글줄만 떴다. 글자로는 훅 표지가 무엇을 만들었는지, 말풍선이
 * 잘 나뉘었는지 확인할 길이 없다. 편집실에서 쓰는 같은 렌더러(`chat-bubble.ts`)를 그대로
 * 재사용해 생성실에도 실제 그림을 보여 준다(설계 §5 F2, "미리보기와 결과가 같은 코드").
 */
/**
 * 2026-09-22 코드리뷰 MAJOR 4: 렌더러(`renderChatBubbleSlideToCanvas`)는 말풍선이
 * 세이프존을 넘으면 던진다(설계 F2 "넘침 = 렌더 실패로 이유 반환"). 회원 브라우저 폰트로
 * 한 장이라도 넘치면 이 useEffect 가 잡지 않은 예외는 React 가 가장 가까운 error
 * boundary 까지 언마운트하고, 그러면 돈 내고 만든 결과 화면이 통째로 사라진다. 장별로
 * try/catch 해서 실패한 장은 이유 칩으로만 대체한다(`CardDeckPanel` 의 미리보기와 같은
 * 패턴, BubbleEditor.tsx:224-241).
 */
export function CardDeckThumbnailStrip({ deck }: { deck: CardDeck }) {
  const hostRef = useRef<HTMLDivElement | null>(null);
  useEffect(() => {
    const host = hostRef.current;
    if (!host) return;
    // J1(2026-09-22 코드리뷰): 렌더러가 표지·CTA 사진 로딩을 기다리는 비동기 함수로
    // 바뀌었다. `cancelled`로 deck이 또 바뀌기 전에 그린 결과만 host에 붙인다.
    let cancelled = false;
    host.innerHTML = "";
    const total = deck.slides.length;
    void (async () => {
      for (let index = 0; index < deck.slides.length; index += 1) {
        if (cancelled) return;
        const slide = deck.slides[index];
        try {
          const canvas = await renderChatBubbleSlideToCanvas({ deck, slide, index, total });
          if (cancelled) return;
          if (!canvas) continue;
          canvas.className = "h-auto w-[4.5rem] rounded-control border border-border";
          host.appendChild(canvas);
        } catch (cause) {
          if (cancelled) return;
          const chip = document.createElement("p");
          chip.className = "rounded-chip border border-dashed border-danger bg-danger-soft px-micro text-caption text-danger";
          chip.textContent = `${index + 1}번 장: ${cause instanceof Error ? cause.message : "미리보기를 그리지 못했습니다."}`;
          host.appendChild(chip);
        }
      }
    })();
    return () => { cancelled = true; };
  }, [deck]);
  return <div ref={hostRef} data-card-deck-thumbnail-strip className="flex flex-wrap gap-stack-tight" aria-label={`카톡 말풍선 카드뉴스 ${deck.slides.length}장 미리보기`} />;
}

type CardHookType = "auto" | "question" | "number" | "pain";
const CARD_HOOK_TYPE_OPTIONS: ReadonlyArray<readonly [CardHookType, string]> = [
  ["auto", "자동(모델이 고름)"],
  ["question", "질문형"],
  ["number", "숫자형"],
  ["pain", "고통 인식형"],
];

/**
 * 표지 훅 공식 4칩. also(다른 형식도 같이)와 주 형식=card 확정 블록 둘 다 같은 선택지를
 * 쓴다(코드리뷰 2026-09-22 m4 — 복붙 두 벌이었다).
 */
function CardHookTypePicker({ value, onChange, label = "표지 헤드라인 공식" }: { value: CardHookType; onChange: (next: CardHookType) => void; label?: string }) {
  return (
    <div role="group" aria-label="표지 훅 공식" className="space-y-stack-tight" data-card-hook-type-picker>
      <span className="text-caption text-subtle">{label}</span>
      <div className="flex flex-wrap gap-stack-tight">
        {CARD_HOOK_TYPE_OPTIONS.map(([optionValue, optionLabel]) => (
          <Button key={optionValue} size="sm" variant={value === optionValue ? "primary" : "secondary"} aria-pressed={value === optionValue} onClick={() => onChange(optionValue)}>{optionLabel}</Button>
        ))}
      </div>
    </div>
  );
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

/**
 * 생성 실패를 사람 말로 옮긴다.
 *
 * 2026-09-09 실사용에서 찾았다. 생성이 실패하자 화면에 "The string did not match the
 * expected pattern." 이 그대로 떴다. 브라우저가 던진 개발자 문구다. 사용자는 무엇이
 * 잘못됐는지도, 무엇을 하면 되는지도 알 수 없다. 회장이 앞서 "인라인에러좀 잘해라" 라고
 * 지적한 것과 같은 종류다.
 *
 * 원인은 마지막 줄의 `return message ||` 였다. 아는 오류는 옮겨 적고, 모르는 오류는
 * **원문을 그대로 내보냈다.** 우리가 쓴 한국어 문구만 사용자에게 보이고, 모르는 것은
 * 사람 말로 닫는다. 개발자가 볼 원문은 콘솔에만 남긴다.
 */
export function generationErrorMessage(cause: unknown): string {
  const message = cause instanceof Error ? cause.message : "";
  if (/저장소|무결성|constraint|database|relation|schema/i.test(message)) {
    return "구조 초안을 저장하지 못했습니다. 잠시 후 다시 시도해 주세요.";
  }
  if (/인증|로그인|unauthorized|forbidden|401|403/i.test(message)) return "로그인이 만료됐습니다. 다시 로그인해 주세요.";
  if (/승인|shared_ai_approval/i.test(message)) return "공유 AI 사용이 아직 열리지 않았습니다. 설정에서 자체 키를 등록하면 바로 쓸 수 있습니다.";
  if (/한도|quota|429/i.test(message)) return "이번 달 생성 한도를 다 쓰셨습니다. 다음 달에 다시 채워집니다.";
  if (/load failed|failed to fetch|networkerror|network|timeout|aborted/i.test(message)) {
    return "연결이 끊겨 요청이 끝나지 않았습니다. 잠시 후 다시 시도해 주세요.";
  }
  // 우리가 쓴 한국어 문구는 그대로 보여 준다. 그 외(브라우저·라이브러리가 던진 영문
  // 개발자 문구)는 사용자에게 아무 도움이 안 되므로 사람 말로 닫고 원문은 콘솔에 남긴다.
  if (/[가-힣]/.test(message)) return message;
  if (message) console.error("[create] 알 수 없는 생성 실패:", message);
  return "구조 초안을 만들지 못했습니다. 잠시 후 다시 시도해 주세요.";
}

/**
 * 기다리는 동안 아무것도 안 보여 주면 사용자는 고장이라고 읽는다.
 *
 * 2026-09-09 실측: 구조 초안 만들기는 글 35초, 영상 54초가 걸린다. 그동안 화면에는 버튼
 * 글씨가 "만드는 중" 으로 바뀌는 것 말고 아무 변화가 없었다. 내가 직접 여덟 번을 기다려
 * 봤는데 매번 멈춘 것인지 도는 것인지 알 수 없었다. **만든 사람이 그렇게 느끼면 처음
 * 쓰는 사람은 확실히 그렇게 느낀다.**
 *
 * 벤치마크: Vrew·Descript·Canva 는 생성 중에 진행 표시와 예상 시간을 함께 준다. Buffer 는
 * 오래 걸리는 일에 "보통 얼마" 를 미리 말해 둔다. 공통점은 지금 얼마나 지났고 보통 얼마나
 * 걸리는지를 숨기지 않는 것이다.
 *
 * 진행률은 지어내지 않는다. 지난 시간을 정직하게 세는 편이 낫다. 가짜 진행 막대는 한 번
 * 어긋나면 그때부터 아무도 안 믿는다. 예상 시간을 넘기면 사과 대신 사정을 말한다.
 * 기다리는 사람에게 필요한 것은 사과가 아니라 계속 가고 있다는 사실이다.
 */
function WaitingNotice({ label, typicalSeconds }: { label: string; typicalSeconds: number }) {
  const [seconds, setSeconds] = useState(0);
  useEffect(() => {
    const started = Date.now();
    const timer = setInterval(() => setSeconds(Math.floor((Date.now() - started) / 1000)), 1000);
    return () => clearInterval(timer);
  }, []);
  const late = seconds > typicalSeconds;
  return (
    <div
      className="rounded-control border border-border bg-surface p-stack text-caption text-muted"
      data-waiting-notice
      role="status"
      aria-live="polite"
    >
      <b className="block font-semibold text-text">{label}</b>
      <span data-waiting-elapsed>{seconds}초 지났습니다. 보통 {typicalSeconds}초쯤 걸립니다.</span>
      <span className="mt-stack-tight block">
        {late
          ? "생각보다 걸리고 있습니다. 그대로 두시면 계속 만듭니다."
          : "학습 정보를 반영해 서로 다른 구조 세 개를 짓고 있습니다."}
      </span>
    </div>
  );
}

/**
 * 성과실에서 승낙한 규칙을 생성실 화면이 직접 읽는다.
 *
 * 2026-09-10 실측: 성과실에서 규칙을 하나 승낙하고("threads 채널 글이 상위권을
 * 차지합니다") 생성실로 왔더니 여전히 **"성과에서 배운 규칙: 아직 없음"** 이라고 떠 있었다.
 * 서버는 그 규칙을 실제로 프롬프트에 넣고 있는데 화면만 없다고 말한 것이다.
 *
 * **화면이 거짓말하는 방향이 뒤집혔을 뿐 거짓말인 것은 같다.** 종전에는 쓴다고 해 놓고 안
 * 썼고, 지금은 쓰면서 안 쓴다고 말한다. 사용자는 승낙한 것이 반영됐는지 확인할 길이 없고,
 * 확인이 안 되면 다시 승낙하거나 이 기능을 안 믿게 된다.
 *
 * 규칙의 정본은 성과실 저장소다. 화면이 들고 다니는 학습 정보 사본이 아니라 그 정본을 읽는다.
 */
function useLearnedRules(workspaceId: string): string {
  const [text, setText] = useState("");
  useEffect(() => {
    if (!workspaceId) return;
    let alive = true;
    // 인증 없이 부르면 401 이 돌아오고 화면은 조용히 "아직 없음" 으로 남는다. 조용히 틀리는
    // 것이 가장 나쁘다. 다른 호출과 같은 방식으로 회원 표를 함께 보낸다(2026-09-10 실측).
    const token = getAuthToken();
    fetch(`/api/performance/learned-rules?tenant_id=${encodeURIComponent(workspaceId)}`, {
      headers: token ? { Authorization: `Bearer ${token}` } : undefined,
    })
      .then((response) => (response.ok ? response.json() : { rules: [] }))
      .then((body: { rules?: { text?: string }[] }) => {
        if (!alive) return;
        const rules = (body.rules ?? [])
          .map((rule) => String(rule.text ?? "").trim())
          .filter(Boolean);
        // 여러 개면 몇 개인지 함께 말한다. 하나만 보여 주면 나머지는 안 쓰는 줄 안다.
        setText(rules.length > 1 ? `${rules[rules.length - 1]} (외 ${rules.length - 1}개)` : rules[0] ?? "");
      })
      .catch(() => undefined);
    return () => { alive = false; };
  }, [workspaceId]);
  return text;
}

export function CreateRoom({ workspaceId, workspaceName, guide, topic, contentBranch = "text_image", onContentBranchChange, onTopicChange, onCandidateSelect, onOpenEditor, onDerivationSucceeded, onPrimaryKindChange, onAlsoKindsChange, learningVersion = 0, onLearningInfoChange, resumeCount = 0, onResume, quickDraft, quickDraftLoading = false, quickDraftError, onQuickDraftGenerate, onGenerateCardImages, onTextCardsCreated, cardRatio = "4:5", cardImageBusy = false, onGenerateVideo, videoBusy = false, imageStyleId = "photo", imageStyleCustom = "", onImageStyleChange, resetToken = 0, madeImageUrl = null, madeVideoUrl = null, cardDeckByDraftId }: CreateRoomProps) {
  const topicInputRef = useRef<HTMLInputElement>(null);
  const [hydratedCreateWorkspaceId, setHydratedCreateWorkspaceId] = useState<string | null>(null);
  const [primaryKind, setPrimaryKind] = useState<CreateKind | null>(null);
  /**
   * 사용자가 형식을 손으로 골랐는가.
   *
   * 2026-09-09 실사용에서 찾았다. 생성실에서 "카드뉴스" 를 골랐는데 화면에는 "선택한 형식:
   * 영상" 이 뜨고 영상 구성으로 만들어졌다. 아래 복원 효과가 학습 정보 로드에 맞물려
   * 다시 돌면서, 방금 고른 값을 저장된 옛 값이나 온보딩 기본값으로 덮어썼기 때문이다.
   * 사람이 방금 누른 것을 화면이 몰래 되돌리면, 무엇을 고르든 소용이 없다.
   */
  const pickedByHand = useRef(false);
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
  /**
   * 주 형식이 카드뉴스일 때의 카톡 말풍선 카드뉴스 9장(chat_bubble 덱) 생성 상태.
   *
   * 2026-09-22 실측: 회원이 기본값인 카드뉴스를 주 형식으로 고르면 "다른 형식도 같이"
   * (alsoKinds)에만 걸린 이 버튼을 영원히 못 만났다. 주 형식이 card 면 also 선택과
   * 무관하게 항상 이 버튼을 보여 별도 흐름으로 견적·확정한다(alsoKinds 흐름은 그대로 둔다).
   */
  const [primaryCardDeckQuote, setPrimaryCardDeckQuote] = useState<StudioDerivationQuote | null>(null);
  const [primaryCardDeckQuoteError, setPrimaryCardDeckQuoteError] = useState<string | null>(null);
  const [primaryCardDeckBatch, setPrimaryCardDeckBatch] = useState<StudioDerivationBatch | null>(null);
  const [primaryCardDeckBusy, setPrimaryCardDeckBusy] = useState(false);
  /**
   * 재시도 간 같은 Idempotency-Key 를 재사용한다(Stripe 관행, 코드리뷰 2026-09-22 m1).
   * 후보가 바뀌면(새 확정 대상) 비운다. 실패 재시도는 같은 값을 그대로 쓴다.
   */
  const primaryCardDeckIdemKeyRef = useRef<string | null>(null);
  const primaryCardDeckInFlight = useRef(false);
  // 카톡 말풍선 카드뉴스 9장의 표지 훅 공식. 기본은 모델이 고르는 auto(설계 §8 OD-D 추천안).
  const [cardHookType, setCardHookType] = useState<"auto" | "question" | "number" | "pain">("auto");
  // 초안을 못 만드는 이유를 단추 옆에서 말한다(조용한 비활성 금지).
  const [quickBlockReason, setQuickBlockReason] = useState<string | null>(null);
  const generationInFlight = useRef(false);
  const [error, setError] = useState<string | null>(null);
  /**
   * 2026-09-22 실측(j.the.great.creator): "초안 만들기" 를 눌러 약 40초 뒤
   * `/api/studio/text` 가 200 으로 후보를 만들었는데, 화면 상단 "구조 초안" 카운터는
   * 그대로 0 이고 결과는 아래 "고른 형식의 생성 후보" 섹션에만 붙어 회장이 "안 되는 것
   * 같다" 고 판단했다. 그 카운터는 A/B/C 구조 선택지(`candidates`) 를 세는 것이지 이
   * 빠른 길의 결과(`quickDraftSections`) 를 세지 않는다 — 서로 다른 값이다. 결과가
   * 생겼음을 화면이 스스로 알리지 않으면 사용자는 완료를 알 길이 없다.
   */
  const quickDraftResultRef = useRef<HTMLDivElement>(null);
  const [justCompletedDraft, setJustCompletedDraft] = useState(false);
  const prevQuickDraftLoading = useRef(quickDraftLoading);
  useEffect(() => {
    const wasLoading = prevQuickDraftLoading.current;
    prevQuickDraftLoading.current = quickDraftLoading;
    if (wasLoading && !quickDraftLoading && quickDraft && !quickDraftError) {
      // jsdom(이 프로젝트의 다른 시험 다수)은 scrollIntoView 를 안 채워 둔다. 없는
      // 환경에서 부르면 그 테스트가 죽으므로 있을 때만 부른다.
      quickDraftResultRef.current?.scrollIntoView?.({ behavior: "smooth", block: "start" });
      setJustCompletedDraft(true);
      const timer = setTimeout(() => setJustCompletedDraft(false), 2600);
      return () => clearTimeout(timer);
    }
    return undefined;
  }, [quickDraftLoading, quickDraft, quickDraftError]);
  // 부모가 "새로 시작" 을 확정하면 이 방도 처음으로 돌아간다. 부모 상태만 비우고 여기를
  // 두면 화면에는 지운 적 없는 후보가 남아 사용자는 무엇이 버려졌는지 알 수 없다.
  const firstReset = useRef(true);
  useEffect(() => {
    if (firstReset.current) { firstReset.current = false; return; }
    pickedByHand.current = false;
    setQuestionIndex(0);
    setPurpose(""); setAudience(""); setRightsConfirmed(false); setTopicOpen(false);
    setPrimaryKind(null); setAlsoKinds([]);
    setCandidates([]); setSelected(null); setQuickStructure(null);
    setAlsoQuote(null); setAlsoBatch(null); setQuickBlockReason(null); setError(null);
    setPrimaryCardDeckQuote(null); setPrimaryCardDeckQuoteError(null); setPrimaryCardDeckBatch(null);
    primaryCardDeckIdemKeyRef.current = null;
    try { localStorage.removeItem(`${CREATE_DRAFT_STORAGE_PREFIX}:${workspaceId}`); } catch { /* 저장이 막혀 있어도 화면은 이미 비웠다 */ }
  }, [resetToken, workspaceId]);


  const facts = useMemo(() => guide.trim() ? [guide.trim()] : [], [guide]);
  /**
   * 학습 정보의 "쓰지 않을 표현" 을 생성 계약이 받는 모양으로 옮긴다.
   *
   * 이 칸은 "별도 제한 없음. 예: ..." 처럼 견본 문장이 붙어 저장된다. 그것을 통째로
   * 금지어로 넘기면 그 문장 전체가 결과에 있는지 찾게 되어 아무것도 안 걸린다.
   * 그리고 "별도 제한 없음" 은 금지어가 아니라 **금지어가 없다는 답**이다. 그것을
   * 금지어로 넣으면 그 말이 들어간 정상 문장이 통째로 버려진다.
   */
  const forbiddenFromLearning = useMemo(() => {
    const raw = (learning.forbidden ?? "").split("예:")[0].trim();
    if (!raw || /별도 제한 없음|없음|제한 없음/.test(raw)) return [];
    return raw.split(/[,·]/).map((word) => word.trim()).filter(Boolean).slice(0, 20);
  }, [learning.forbidden]);
  const learnedCount = countFilledLearningSlots(learning, { guide });
  const missing = [!primaryKind && "만들 형식", !topic.trim() && "주제", !purpose.trim() && "목표", !audience.trim() && "고객", !rightsConfirmed && "사용 권리 확인"].filter(Boolean) as string[];
  const selectedCandidate = candidates.find((candidate) => candidate.label === selected) ?? null;
  /*
   * M1(코드리뷰 2026-09-22): 워크스페이스 전환·regenerateAll·"구조 초안 다시 고르기"
   * 는 모두 고른 후보(candidate_id)를 바꾸거나 비운다. 그 값이 바뀔 때마다 이전
   * 후보에 딸린 카드 덱 견적·배치·멱등키를 비워, 새 후보 밑에 옛 결과가 붙거나 새
   * 후보로는 버튼이 영영 안 뜨는 것을 막는다(resetToken 리셋 하나로는 이 경로들을 못
   * 덮었다 — PR #71 "리셋 경로 누락" 재발 유형). `selected` 라벨(A/B/C)만 보면 다른
   * 워크스페이스의 같은 라벨과 헷갈리므로 candidate_id 로 가른다.
   */
  const selectedCandidateId = selectedCandidate?.candidate_id ?? null;
  useEffect(() => {
    setPrimaryCardDeckQuote(null); setPrimaryCardDeckQuoteError(null); setPrimaryCardDeckBatch(null);
    primaryCardDeckIdemKeyRef.current = null;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedCandidateId]);
  const displayCandidates = candidates.length ? candidates : CREATE_EXAMPLES;
  const question = CREATE_QUESTIONS[questionIndex];
  const stage = selected ? { count: "3 / 3", label: "선택한 구조 확인" } : candidates.length ? { count: "2 / 3", label: "구조 초안 고르기" } : { count: "1 / 3", label: `만들 조건 확인 ${Math.min(questionIndex + 1, 6)} / 6` };
  const industryTitle = useMemo(() => INDUSTRY_CARDS.find((card) => isCardChosen(card, learning.industry))?.title || "", [learning.industry]);
  const purposeTitle = useMemo(() => PURPOSE_CARDS.find((card) => isCardChosen(card, purpose || learning.purpose))?.title || "", [learning.purpose, purpose]);
  const topicCards = useMemo(() => topicCandidates(industryTitle, purposeTitle), [industryTitle, purposeTitle]);

  // 학습 정보는 작업 공간마다 다시 읽는다. 생성실 문답의 임시 저장과는 별도다.
  useEffect(() => {
    if (!workspaceId) return;
    const saved = readLearningInfo(workspaceId);
    setLearning(saved);
    setAudience((current) => current || saved.audience || "");
    setPurpose((current) => current || PURPOSE_CARDS.find((card) => isCardChosen(card, saved.purpose))?.sample || saved.purpose || "");
    setRightsConfirmed((current) => current || Boolean(saved.rights));
    onLearningInfoChange?.(saved);
  }, [learningVersion, onLearningInfoChange, workspaceId]);

  // 새로고침해도 생성실 질문, 선택 구조, 생성 후보를 작업 공간별로 이어 간다.
  // 깨진 저장값은 조용히 폐기하고 학습 정보에서 확인된 기본값만 사용한다.
  useEffect(() => {
    setHydratedCreateWorkspaceId(null);
    // 사람이 방금 고른 형식은 되돌리지 않는다. 학습 정보가 늦게 로드돼 이 효과가 다시
    // 돌더라도, 그 사이 사용자가 누른 것이 옛 값으로 덮이면 안 된다.
    if (!pickedByHand.current) setPrimaryKind(null);
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
      if (!pickedByHand.current) {
        setPrimaryKind(onboardingKind);
        onPrimaryKindChange?.(onboardingKind);
        onContentBranchChange?.(onboardingBranch);
      }
      setAudience(learned.audience || "");
      setPurpose(PURPOSE_CARDS.find((card) => isCardChosen(card, learned.purpose))?.sample || learned.purpose || "");
      setRightsConfirmed(Boolean(learned.rights));
      sessionStorage.removeItem(ONBOARDING_CONTENT_BRANCH_KEY);
      setHydratedCreateWorkspaceId(workspaceId);
      return;
    }
    const saved = readCreateDraft(workspaceId);
    if (saved) {
      if (!pickedByHand.current) setPrimaryKind(saved.primaryKind);
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
      setPurpose(PURPOSE_CARDS.find((card) => isCardChosen(card, learned.purpose))?.sample || learned.purpose || "");
      setAudience(learned.audience || "");
      setRightsConfirmed(Boolean(learned.rights));
    }
    setHydratedCreateWorkspaceId(workspaceId);
  }, [onLearningInfoChange, workspaceId]);

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
    const next = { ...learning, ...patch };
    setLearning(next);
    if (workspaceId) writeLearningInfo(workspaceId, next);
    onLearningInfoChange?.(next);
  };

  const choosePurpose = (value: string) => {
    setPurpose(value);
    const card = PURPOSE_CARDS.find((one) => one.sample === value);
    rememberLearning({ purpose: card ? `${card.title}. 예: ${card.sample}` : value });
    setQuestionIndex(2);
  };

  const choosePrimary = (kind: CreateKind) => {
    if (!primaryKind) {
      pickedByHand.current = true;
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
      // 학습 정보에서 고른 말투와 쓰지 않을 표현을 실제로 보낸다. 종전에는 화면에만
      // 보여 주고 생성기에는 말투를 null, 금지 표현을 빈 목록으로 보냈다. **일곱 칸을
      // 채우게 해 놓고 쓰지 않으면 그 문답은 장식이다**(2026-09-10 실측).
      const next = await requestStudioCandidates({
        workspaceId, topic, purpose, audience,
        workspaceFacts: facts,
        forbiddenPhrases: forbiddenFromLearning,
        materialRightsConfirmed: rightsConfirmed,
        contentBranch,
        tone: learning.voice,
        palette: learning.palette,
      }, token);
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
        cardHookType,
      }));
    } catch (cause) {
      setError(generationErrorMessage(cause));
    } finally {
      setAlsoBusy(false);
    }
  }

  // 주 형식이 카드뉴스면 alsoKinds 선택과 무관하게 카톡 말풍선 카드뉴스 9장 견적을 미리
  // 받아 둔다(위 alsoQuote 효과와 같은 이유 — 값을 못 본 채로는 확정 단추를 안 보인다).
  // 재시도 단추가 같은 함수를 다시 부를 수 있게 effect 밖 함수로 뺐다(코드리뷰 2026-09-22 M6).
  const fetchPrimaryCardDeckQuote = useCallback(() => {
    const jobId = candidates[0]?.generation_id;
    if (primaryKind !== "card" || !selectedCandidate || !jobId) { setPrimaryCardDeckQuote(null); setPrimaryCardDeckQuoteError(null); return () => {}; }
    let live = true;
    setPrimaryCardDeckQuoteError(null);
    quoteStudioDerivations(jobId, ["card"], getAuthToken())
      .then((quote) => { if (live) { setPrimaryCardDeckQuote(quote); setPrimaryCardDeckQuoteError(null); } })
      .catch((cause) => { if (live) { setPrimaryCardDeckQuote(null); setPrimaryCardDeckQuoteError(generationErrorMessage(cause)); } });
    return () => { live = false; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [primaryKind, selectedCandidate, candidates]);
  useEffect(() => fetchPrimaryCardDeckQuote(), [fetchPrimaryCardDeckQuote]);

  async function makePrimaryCardDeck() {
    // 더블클릭 방어(코드리뷰 2026-09-22 m1). generate()의 generationInFlight ref 관습과 같다.
    if (primaryCardDeckInFlight.current) return;
    const jobId = candidates[0]?.generation_id;
    if (!jobId || !selectedCandidate || !primaryCardDeckQuote) return;
    primaryCardDeckInFlight.current = true;
    setPrimaryCardDeckBusy(true);
    setError(null);
    if (!primaryCardDeckIdemKeyRef.current) primaryCardDeckIdemKeyRef.current = crypto.randomUUID();
    try {
      const batch = await requestStudioDerivations({
        jobId,
        candidateId: selectedCandidate.candidate_id,
        kinds: ["card"],
        acknowledgedCost: { currency: primaryCardDeckQuote.currency, totalMinor: primaryCardDeckQuote.total_minor },
        token: getAuthToken(),
        cardHookType,
        idempotencyKey: primaryCardDeckIdemKeyRef.current,
      });
      setPrimaryCardDeckBatch(batch);
      // M3(코드리뷰 2026-09-22): 성공하면 부모가 초안 목록(SWR)을 재검증해야
      // cardDeckByDraftId 가 방금 만든 덱을 실제로 찾는다. 목 주입 없이 이 콜백이
      // 진짜로 안 불리면 화면은 탭 포커스가 바뀔 때까지 썸네일을 못 그린다.
      const succeededCard = batch.items.find((item) => item.kind === "card" && item.status === "succeeded");
      if (succeededCard?.draft_id) {
        await onDerivationSucceeded?.(succeededCard.draft_id);
      } else {
        // M7(재리뷰 2026-09-22): 서버(GenerationService.derive)는 실패 배치도 그대로
        // persist 하고, 같은 Idempotency-Key 가 오면 status 와 무관하게 그 배치를
        // 돌려준다(service.ts). m1 에서 재시도 간 키를 재사용하게 고쳤더니 "다시
        // 만들기" 가 서버에서 LLM 을 다시 안 부르고 같은 실패를 되돌려주는 부작용이
        // 생겼다. 실패하면 키를 비워 다음 클릭이 새 배치를 만들게 한다(실패는 청구
        // 0 이라 중복 청구 위험이 없다).
        primaryCardDeckIdemKeyRef.current = null;
      }
    } catch (cause) {
      setError(generationErrorMessage(cause));
    } finally {
      setPrimaryCardDeckBusy(false);
      primaryCardDeckInFlight.current = false;
    }
  }

  async function discardPrimaryCardDeck() {
    if (!primaryCardDeckBatch) return;
    setPrimaryCardDeckBusy(true);
    setError(null);
    try {
      setPrimaryCardDeckBatch(await discardStudioDerivations(primaryCardDeckBatch.batch_id, getAuthToken()));
      // 버렸으면 다음은 새 시도다 — 같은 키를 재사용하면 서버가 버린 결과를 그대로 돌려줄 수 있다.
      primaryCardDeckIdemKeyRef.current = null;
    } catch (cause) {
      setError(generationErrorMessage(cause));
    } finally {
      setPrimaryCardDeckBusy(false);
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
  const learnedRules = useLearnedRules(workspaceId ?? "");
  const [textCardBusy, setTextCardBusy] = useState(false);
  const [textCards, setTextCards] = useState<string[]>([]);
  const [textCardError, setTextCardError] = useState<string | null>(null);

  /**
   * 고른 구조의 각 줄을 글자 카드 그림으로 만든다.
   *
   * 2026-09-10 회장 지적("왜 영상 이미지 등은 하나도 없냐") 실측: 카드뉴스 대표 이미지도
   * 숏폼 영상도 전부 바깥 그림 생성기 하나를 거치는데 그 생성기가 서버에서 로그아웃
   * 상태여서 그림이 한 장도 없었다. **볼 수 있는 결과물 전체가 바깥 기계 하나에 매달려
   * 있었던 것이 진짜 문제다.**
   *
   * 이 길은 바깥 기계를 안 쓴다. 브라우저가 직접 그린다. 즉시 나오고 돈이 안 들고 브랜드
   * 색이 정확하다. 사진이 필요한 카드는 여전히 생성기를 쓰면 된다. 둘 다 있어야 한 쪽이
   * 자도 제품이 선다.
   */
  async function makeTextCards() {
    const source = selectedCandidate?.format.outline?.length
      ? selectedCandidate.format.outline
      : (quickStructure?.outline ?? []);
    if (!source.length) { setTextCardError("먼저 구조 초안을 하나 골라 주세요."); return; }
    setTextCardError(null);
    setTextCardBusy(true);
    try {
      // 비율을 여기서 "4:5" 로 박아 두었더니 화면에서 무엇을 고르든 픽셀이 늘 1080×1350
      // 하나였다(2026-09-14 실측). 고른 값을 그대로 쓴다.
      const theme = themeFromPalette(learning.palette);
      const lines = source.filter((line) => line.trim().length > 0);
      const persisted = await renderAndUploadCardDeck(
        { lines, ratio: cardRatio, theme },
        { upload: browserCardUploader(authHeaders()) },
      );
      setTextCards(persisted);
      onTextCardsCreated?.(persisted, lines);
    } catch (error) {
      setTextCardError(error instanceof Error ? error.message : "글자 카드를 저장하지 못했습니다");
    } finally {
      setTextCardBusy(false);
    }
  }
  const learningRows = [
    ["작업 공간", workspaceDisplayName(workspaceName)],
    // 업종 칸이 비면 브랜드 문서 전문(수백 자)을 업종 자리에 대신 넣고 있었다. 라벨은
    // "업종" 인데 내용은 페르소나·보이스·금지 표현이 뒤섞인 문서 전체다. 사용자는 자기가
    // 업종을 그렇게 적었다고 오해하고, 바로 아래 말투 칸과 같은 내용이 두 번 보인다.
    // 브랜드 문서는 아래에 따로 "브랜드 문서도 그대로 반영합니다" 로 이미 알려 준다.
    // 비었으면 비었다고 말하는 편이 정확하다(2026-09-10 실측).
    ["업종", learning.industry || "아직 없음"],
    ["말투", learning.voice || "아직 없음"],
    ["콘텐츠 목표", purpose || "아직 없음"],
    ["주요 고객", audience || "아직 없음"],
    ["성과에서 배운 규칙", learnedRules || learning.learnedRules || "아직 없음"],
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
          <section className="grid gap-stack sm:grid-cols-4" aria-label="생성실 요약">
            <article className="card p-pad-inset"><span className="text-caption text-subtle">선택한 형식</span><b className="mt-micro block text-body text-text">{primaryKind ? CREATE_KIND_LABELS[primaryKind] : "선택 전"}</b></article>
            <article className="card p-pad-inset"><span className="text-caption text-subtle">반영한 학습 정보</span><b className="mt-micro block text-body text-text">{learnedCount}개</b></article>
            {/*
              2026-09-22 실측(j.the.great.creator): "초안 만들기" 결과(`quickDraftSections`)와
              이 "구조 초안"(A, B, C 구조 예시, `candidates`) 은 서로 다른 값인데 이름이 같아,
              결과가 생겼는데도 이 칸이 0 으로 보여 "안 된다"로 오해했다. 승인된 V68 계약
              (tests/components/create-room-v68.test.tsx)이 라벨에 "구조 초안" 문구를
              고정해 두었으므로 그 문구는 유지하고, A/B/C 축임을 괄호로 덧붙이고 별도로
              "생성한 후보" 칸을 새로 둬서 구분한다.
            */}
            <article className="card p-pad-inset"><span className="text-caption text-subtle">구조 초안(A/B/C)</span><b className="mt-micro block text-body text-text">{candidates.length}개</b></article>
            <article className="card p-pad-inset" data-quick-draft-count={quickDraftSections.length}><span className="text-caption text-subtle">생성한 후보</span><b className="mt-micro block text-body text-text">{quickDraftLoading ? "만드는 중" : `${quickDraftSections.length}개`}</b></article>
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
            <section
              ref={quickDraftResultRef}
              className={`rounded-surface border p-pad-inset transition-colors duration-500 ${justCompletedDraft ? "border-accent bg-accent-soft" : "border-success/30 bg-success/10"} ${quickDraftLoading ? "opacity-50" : ""}`}
              aria-labelledby="quick-draft-result-title"
              data-quick-draft-result
              data-quick-draft-just-completed={justCompletedDraft || undefined}
              data-quick-draft-stale={quickDraftLoading || undefined}
            >
              <h3 id="quick-draft-result-title" className="text-body font-bold text-text">고른 형식의 생성 후보</h3>
              {justCompletedDraft ? (
                <p role="status" className="mt-stack-tight text-caption font-semibold text-accent" data-quick-draft-toast>
                  후보 {quickDraftSections.length}개가 만들어졌습니다. 아래에서 확인하세요.
                </p>
              ) : null}
              {/*
                2026-09-22 교차 리뷰 MINOR: 다시 만드는 중에는 이 섹션에 여전히 "이전"
                후보가 떠 있다. 무엇이 새 결과인지 헷갈리지 않게, 만드는 동안은 옅게
                흐리고 "이전 결과" 라고 알린다(위 카운터는 이미 "만드는 중" 이라고 말한다).
              */}
              {quickDraftLoading ? (
                <p className="mt-stack-tight text-caption text-subtle" data-quick-draft-stale-notice>
                  다시 만드는 중입니다. 아래는 이전 결과입니다.
                </p>
              ) : null}
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
            {/*
              2026-09-09 실사용에서 찾았다. 만들어진 세 후보가 모두 "저희는 회사를 손님으로
              모시는 곳" 이라고 썼는데 업종 칸은 "동네 가게" 였다. 어디서 온 문장인지 화면에서
              찾을 수 없었다. 브랜드 문서 전문이 생성 입력으로 통째로 들어가는데 이 자리는
              여덟 칸만 보여 주고 그 문서는 감췄기 때문이다.
              **화면에 없는 입력이 결과를 좌우하면 사용자는 결과를 고칠 수가 없다.** 무엇을
              바꿔야 그 문장이 사라지는지 알 방법이 없다. 들어가는 것은 다 보여 준다.
            */}
            {guide.trim() ? (
              <details className="mt-stack rounded-control border border-border bg-surface-2 p-stack" data-brand-guide-used>
                <summary className="cursor-pointer text-caption font-semibold text-muted">
                  브랜드 문서도 그대로 반영합니다 ({guide.trim().length}자)
                </summary>
                <p className="mt-stack-tight whitespace-pre-wrap break-keep text-caption text-subtle">{guide.trim()}</p>
                <p className="mt-stack-tight break-keep text-caption text-subtle">
                  이 글도 위 여덟 칸과 함께 생성에 들어갑니다. 결과에 원치 않는 표현이 나오면 여기서 그 문장을 찾아 브랜드 문서를 고쳐 주세요.
                </p>
              </details>
            ) : null}
          </section>
        </div>
        <AssistantPanel title="생성 담당">
          <Stack gap={16}>
            <div className="max-w-[90%] rounded-surface rounded-tl-control border border-border bg-surface p-stack text-body-sm text-text" data-empty-next={!candidates.length ? "create" : undefined}>
              {selectedCandidate ? "구조 초안이 준비됐습니다. 카드뉴스 이미지와 숏폼 영상을 여기서 바로 만들 수 있습니다." : candidates.length ? "A, B, C 구조 중 편집할 초안을 하나 골라 주세요." : "한 번에 하나씩 묻겠습니다. 선택한 답은 다음 질문에 반영됩니다."}
            </div>
            <div className="rounded-control border border-border bg-surface-2 p-stack text-caption text-muted" data-generation-capability>
              <b className="block text-text">현재 제공</b>
              <span className="block">일곱 칸 학습 정보를 반영한 구성 초안 3개</span>
              <span className="block">카드뉴스 대표 이미지(만들기 전 비용을 보여 드립니다)</span>
              <span className="block">숏폼 영상(대표 이미지를 움직이는 영상으로)</span>
            </div>
            {/*
              사업계획 v0.4 10절이 첫 매체를 카드뉴스로 정했고 7절이 만들기 전 비용 승인
              관문을 요구한다. 그동안 이 자리에 "준비 중"만 적혀 있어 고객은 카드뉴스를
              만들 수 없었다(2026-09-06 회장 스모크).
            */}
            {/*
              영상 버튼이 여기 없어서, 화면에서는 못 만드는데 세션이 API 를 직접 불러 만들어
              놓고 "된다"고 보고한 사고가 났다(회장 2026-09-07 "생성실에는 영상 버튼 자체가
              없는데 했다고 거짓보고한 이유"). 만들 수 있으면 버튼이 여기 있어야 한다.
            */}
            {/*
              만들기 전에 결을 고른다. 종전에는 결을 고를 자리가 없어 같은 글감으로 늘 같은
              결의 그림만 나왔고, 마음에 안 들면 다시 만드는 수밖에 없었다. 다시 만들면
              그만큼 돈이 나간다. 고르는 것이 결과를 고르는 가장 싼 방법이다(회장 2026-09-08).
              카드만 두면 준비된 것 밖으로 못 나가므로 직접 적는 칸을 함께 둔다.
            */}
            {onImageStyleChange ? (
              <section className="mb-stack" aria-label="그림 결 고르기" data-image-style>
                <b className="text-caption font-semibold text-text">어떤 결로 만들까요</b>
                <div className="mt-stack-tight flex flex-wrap gap-stack-tight">
                  {IMAGE_STYLES.map((one) => (
                    <button
                      key={one.id}
                      type="button"
                      data-testid={`image-style-${one.id}`}
                      aria-pressed={imageStyleId === one.id}
                      onClick={() => onImageStyleChange(one.id, imageStyleCustom)}
                      className={`min-h-control-touch rounded-control border px-stack text-caption ${imageStyleId === one.id ? "border-accent bg-accent-soft font-semibold text-accent" : "border-border text-muted"}`}
                    >
                      {one.title}
                      <span className="ml-stack-tight text-caption text-subtle">{one.hint}</span>
                    </button>
                  ))}
                  <button
                    type="button"
                    data-testid="image-style-custom"
                    aria-pressed={imageStyleId === CUSTOM_STYLE_ID}
                    onClick={() => onImageStyleChange(CUSTOM_STYLE_ID, imageStyleCustom)}
                    className={`min-h-control-touch rounded-control border px-stack text-caption ${imageStyleId === CUSTOM_STYLE_ID ? "border-accent bg-accent-soft font-semibold text-accent" : "border-border text-muted"}`}
                  >
                    직접 적기
                  </button>
                </div>
                {imageStyleId === CUSTOM_STYLE_ID ? (
                  <input
                    data-testid="image-style-custom-input"
                    aria-label="원하는 결을 직접 적기"
                    value={imageStyleCustom}
                    placeholder="예: 비 오는 날 창가, 필름 사진 느낌"
                    onChange={(event) => onImageStyleChange(CUSTOM_STYLE_ID, event.target.value)}
                    className="mt-stack-tight min-h-control-touch w-full rounded-control border border-border bg-surface px-stack text-caption text-text"
                  />
                ) : null}
              </section>
            ) : null}
            <div className="flex flex-wrap gap-stack-tight">
              {onGenerateCardImages ? (
                <Button size="sm" data-testid="create-card-image" onClick={() => void onGenerateCardImages()} disabled={cardImageBusy || videoBusy}>
                  {cardImageBusy ? "카드뉴스 이미지 만드는 중" : "카드뉴스 대표 이미지 만들기"}
                </Button>
              ) : null}
              <Button size="sm" variant="secondary" data-testid="create-text-card" onClick={() => void makeTextCards()} disabled={textCardBusy || cardImageBusy || videoBusy}>
                {textCardBusy ? "글자 카드 만드는 중" : "글자 카드로 만들기 (바로·무료)"}
              </Button>
              {onGenerateVideo ? (
                <Button size="sm" variant="secondary" data-testid="create-video" onClick={() => void onGenerateVideo()} disabled={cardImageBusy || videoBusy}>
                  {videoBusy ? "숏폼 영상 만드는 중" : "숏폼 영상 만들기"}
                </Button>
              ) : null}
            </div>
            {/*
              2026-09-16 실측(j.the.great.investor): 생성기 로그인이 안 된 상태에서 "대표
              이미지 만들기" 를 누르면 토스트가 스치듯 뜨고 사라져 "아무 일도 안 일어났다"
              로 읽혔다. 실패 사유(setLastError)는 이미 있는데 이 버튼들 옆에는 그것을
              계속 보여 주는 자리가 없었다 — 글자 카드 실패(textCardError)에는 있는데
              생성기 호출 실패에는 없었다. 같은 자리를 만든다.
            */}
            {quickDraftError ? (
              <p role="alert" className="text-caption text-danger" data-testid="create-media-error">{quickDraftError}</p>
            ) : null}
            {textCardError ? (
              <p className="text-caption text-warning" data-text-card-error>{textCardError}</p>
            ) : null}
            {textCards.length ? (
              <section className="rounded-control border border-border bg-surface p-stack" data-text-card-result={textCards.length}>
                <b className="block text-caption font-semibold text-text">글자 카드 {textCards.length}장</b>
                <p className="mt-stack-tight text-caption text-subtle">
                  브라우저가 바로 그린 그림입니다. 올릴 규격 그대로라 흐리지 않습니다.
                </p>
                <div className="mt-stack grid grid-cols-2 gap-stack-tight sm:grid-cols-3">
                  {textCards.map((src, index) => (
                    // raw-media-ok: 글자 카드는 브라우저가 그 자리에서 그린 canvas 결과라
                    // data: URL 이다(lib/studio/text-card-image.ts toDataURL). 만료가 없다.
                    // eslint-disable-next-line @next/next/no-img-element
                    <img key={index} src={src} alt={`글자 카드 ${index + 1}장`} className="w-full rounded-control border border-border" data-text-card-image={index} />
                  ))}
                </div>
              </section>
            ) : null}
            {/*
              만든 결과가 만든 자리에 안 보이면 고객은 만들어졌는지 알 수 없다. 실제로
              단추를 눌러 생성이 끝났는데 화면이 그대로라 "안 된다" 로 읽혔다
              (회장 2026-09-07). 만든 것은 그 자리에서 보여 준다.
            */}
            {madeImageUrl || madeVideoUrl ? (
              <div data-testid="create-made" className="space-y-stack-tight rounded-control border border-border bg-surface p-stack">
                <b className="block text-caption text-text">방금 만든 것</b>
                {madeImageUrl ? (
                  <DeliveredMedia type="image" src={madeImageUrl} testId="create-made-image"
                    alt="방금 만든 카드뉴스 대표 이미지" tenantId={workspaceId}
                    className="max-h-64 w-full rounded-control object-contain" />
                ) : null}
                {madeVideoUrl ? (
                  <DeliveredMedia type="video" src={madeVideoUrl} testId="create-made-video"
                    tenantId={workspaceId} className="max-h-64 w-full rounded-control" />
                ) : null}
                <p className="text-caption text-subtle break-keep">편집실에서 글자를 얹고 발행실로 보낼 수 있습니다.</p>
              </div>
            ) : null}
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
                      <Button key={card.id} size="sm" variant={purpose === card.sample ? "primary" : "secondary"} aria-pressed={purpose === card.sample} title={card.sample} onClick={() => choosePurpose(card.sample)}>{card.title}</Button>
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
              {loading ? <WaitingNotice label="구조 초안을 만들고 있습니다" typicalSeconds={primaryKind === "video" ? 55 : primaryKind === "card" ? 120 : 35} /> : null}
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
                {alsoKinds.includes("card") ? (
                  <CardHookTypePicker value={cardHookType} onChange={setCardHookType} label="표지 헤드라인 공식(카톡 말풍선 카드뉴스 9장)" />
                ) : null}
                <p className="break-keep text-caption text-subtle">완성 미디어가 아니라 선택한 구조를 다른 형식에 맞춘 구성 초안입니다. 실패한 형식은 청구하지 않습니다.</p>
                <Button variant="primary" onClick={confirmAlsoKinds} disabled={alsoBusy}>{alsoBusy ? "구성 초안 만드는 중" : alsoKinds.includes("card") && alsoKinds.length === 1 ? "카톡 말풍선 카드뉴스 9장 만들기" : "선택한 형식의 구성 초안 만들기"}</Button>
              </div>
            ) : null}
            {alsoBatch ? (
              <div className="space-y-stack rounded-surface border border-border bg-surface p-stack" data-create-also-result={alsoBatch.status}>
                <b className="block text-caption font-semibold text-text">{alsoBatch.discarded_at ? "추가 구성 초안을 버렸습니다" : "추가 형식의 구성 초안"}</b>
                <ul className="space-y-stack-tight">
                  {alsoBatch.items.map((item) => {
                    const deck = item.kind === "card" && item.deck_summary && item.draft_id
                      ? cardDeckByDraftId?.(item.draft_id) ?? null
                      : null;
                    return (
                      <li key={item.kind} className="break-keep text-caption text-muted" data-also-item={item.kind} data-also-item-status={item.status}>
                        {item.label}: {item.status === "succeeded"
                          ? (item.kind === "video"
                            ? "대본과 장면 구성을 준비했습니다. 영상 렌더링은 아직 제공하지 않습니다"
                            : item.kind === "card" && item.deck_summary
                              ? `카톡 말풍선 카드뉴스 ${item.deck_summary.slides}장을 만들었습니다(훅: ${item.deck_summary.hook_type}, 댓글 키워드: '${item.deck_summary.cta_keyword}')`
                              : "구성 초안을 준비했습니다")
                          : `구성 초안을 만들지 못했습니다. ${item.failure_reason ?? ""}`}
                        {deck ? <div className="mt-stack-tight"><CardDeckThumbnailStrip deck={deck} /></div> : null}
                      </li>
                    );
                  })}
                </ul>
                <p className="text-caption text-subtle">나간 값 {alsoBatch.cost.charged_minor.toLocaleString("ko-KR")}원</p>
                {alsoBatch.discarded_at ? null : <Button onClick={discardAlso} disabled={alsoBusy}>추가 구성 초안 버리기</Button>}
              </div>
            ) : null}
            {/*
              주 형식이 카드뉴스면 이 버튼은 alsoKinds 선택과 무관하게 항상 보인다.
              (2026-09-22 실측: 카드뉴스를 주 형식으로 고른 회원은 이전까지 "다른 형식도
              같이" 를 함께 골라야만 이 버튼을 만났다 — 기본 경로에서 말풍선 덱을 영원히
              못 만드는 결함이었다.)
              확정 블록은 아직 시도한 적이 없거나(!primaryCardDeckBatch), 실패했거나
              (status !== "succeeded"), 성공했지만 버렸을 때(discarded_at) 다시 뜬다
              (코드리뷰 2026-09-22 M2 — 실패해도 "새로 시작" 으로 후보까지 버리지 않고
              바로 다시 만들 수 있어야 한다).
            */}
            {selectedCandidate && primaryKind === "card" && (!primaryCardDeckBatch || primaryCardDeckBatch.status !== "succeeded" || Boolean(primaryCardDeckBatch.discarded_at)) ? (
              <div className="space-y-stack rounded-surface border border-border bg-surface p-stack" data-create-primary-card-deck-confirm>
                <b className="block text-caption font-semibold text-text">카톡 말풍선 카드뉴스 9장</b>
                <p className="break-keep text-caption text-subtle">고른 구조를 재료로 대화형 말풍선 카드뉴스 9장을 만듭니다.</p>
                <CardHookTypePicker value={cardHookType} onChange={setCardHookType} />
                {primaryCardDeckQuote ? (
                  <p className="flex justify-between border-t border-border pt-stack-tight text-caption font-semibold text-text" data-primary-card-deck-total-minor={primaryCardDeckQuote.total_minor}>
                    <span>생성 비용</span>
                    <span>{primaryCardDeckQuote.total_minor.toLocaleString("ko-KR")}원</span>
                  </p>
                ) : primaryCardDeckQuoteError ? (
                  // 조용한 비활성 금지(464행 관습, 설계 §7.4). 이유 없이 단추만 죽어 있으면
                  // 못 쓰는 화면으로 읽힌다.
                  <div className="space-y-stack-tight rounded-control border border-warning/30 bg-warning/10 p-stack-tight" data-primary-card-deck-quote-error>
                    <p className="break-keep text-caption text-warning">비용을 불러오지 못했습니다. {primaryCardDeckQuoteError}</p>
                    <Button size="sm" onClick={fetchPrimaryCardDeckQuote}>다시 시도</Button>
                  </div>
                ) : null}
                <Button variant="primary" onClick={makePrimaryCardDeck} disabled={primaryCardDeckBusy || !primaryCardDeckQuote}>
                  {primaryCardDeckBusy ? "만드는 중" : primaryCardDeckBatch ? "다시 만들기" : "카톡 말풍선 카드뉴스 9장 만들기"}
                </Button>
              </div>
            ) : null}
            {primaryCardDeckBatch ? (() => {
              const item = primaryCardDeckBatch.items.find((one) => one.kind === "card");
              const deck = item?.draft_id ? cardDeckByDraftId?.(item.draft_id) ?? null : null;
              const succeeded = item?.status === "succeeded" && !primaryCardDeckBatch.discarded_at;
              return (
                <div aria-live="polite" className="space-y-stack rounded-surface border border-border bg-surface p-stack" data-create-primary-card-deck-result={primaryCardDeckBatch.status}>
                  <b className="block text-caption font-semibold text-text">카톡 말풍선 카드뉴스</b>
                  <p className="break-keep text-caption text-muted">
                    {primaryCardDeckBatch.discarded_at
                      ? "카톡 말풍선 카드뉴스를 버렸습니다"
                      : item?.status === "succeeded" && item.deck_summary
                        ? `${item.deck_summary.slides}장을 만들었습니다(훅: ${item.deck_summary.hook_type}, 댓글 키워드: '${item.deck_summary.cta_keyword}')`
                        : `만들지 못했습니다. ${item?.failure_reason ?? ""}`}
                  </p>
                  {succeeded && deck ? <div className="mt-stack-tight"><CardDeckThumbnailStrip deck={deck} /></div> : null}
                  <p className="text-caption text-subtle">나간 값 {primaryCardDeckBatch.cost.charged_minor.toLocaleString("ko-KR")}원</p>
                  {succeeded ? (
                    <Stack gap={8}>
                      {/*
                        m7(재리뷰 2026-09-22): makePrimaryCardDeck 은 setPrimaryCardDeckBatch(batch)
                        직후에도 onDerivationSucceeded(hist 재검증)가 끝날 때까지
                        primaryCardDeckBusy 를 true 로 둔다. 그 창에서 이 단추를 누르면
                        page.tsx 의 hist.drafts.find 가 아직 갱신 전 목록이라 못 찾고
                        덱 없이 편집실이 열린다. busy 동안은 눌러도 소용없게 막는다.
                      */}
                      <Button variant="primary" onClick={() => onOpenEditor?.(item?.draft_id ?? undefined)} disabled={primaryCardDeckBusy}>편집실에서 다듬기</Button>
                      <Button onClick={discardPrimaryCardDeck} disabled={primaryCardDeckBusy}>버리고 다시 만들기</Button>
                    </Stack>
                  ) : null}
                </div>
              );
            })() : null}
            {(() => {
              // 성공한 primary 카드 덱 결과 블록이 이미 "편집실에서 다듬기" 를 draft_id 와
              // 함께 보여준다(M4). 여기서 또 보이면 어느 쪽을 눌러야 덱이 실리는지
              // 헷갈리므로 중복 없이 하나만 둔다 — "구조 초안 다시 고르기" 는 항상 남긴다.
              const primaryDeckAlreadyOffersEditor = primaryKind === "card" && primaryCardDeckBatch?.status === "succeeded" && !primaryCardDeckBatch.discarded_at;
              if (!selectedCandidate || !(alsoKinds.length === 0 || Boolean(alsoBatch))) return null;
              return (
                <Stack gap={8}>
                  {primaryDeckAlreadyOffersEditor ? null : <Button variant="primary" onClick={() => onOpenEditor?.()} disabled={primaryKind === "card" && primaryCardDeckBusy}>편집실에서 다듬기</Button>}
                  <Button onClick={() => setSelected(null)}>구조 초안 다시 고르기</Button>
                </Stack>
              );
            })()}
            {quickDraftError ? <p role="alert" className="text-caption text-danger">{quickDraftError}</p> : null}
            {error ? <p role="alert" className="text-caption text-danger">{error}</p> : null}
          </Stack>
        </AssistantPanel>
      </div>
    </section>
  );
}
interface EditRoomProps {
  /** 말로 시키는 일괄 변경이 어느 작업 공간의 사용량으로 잡히는지. */
  workspaceId?: string;
  lines: string[];
  onLinesChange: (lines: string[]) => void;
  kind?: EditContentKind;
  onKindChange?: (kind: EditContentKind) => void;
  previewReady?: boolean;
  /** 생성실 산출물 주소. 편집실이 실제로 만든 것을 보여 주기 위해 받는다(2026-09-08). */
  previewImageUrl?: string | null;
  /**
   * 카드뉴스 한 벌 전체의 그림 주소.
   *
   * 2026-09-14 실측: 카드 3장을 만들어도 편집실은 대표 한 장만 받아 `1 / 1` 을 그렸다.
   * 장마다 그림이 다르므로 장 목록과 같은 길이의 목록으로 받는다.
   */
  previewImageUrls?: string[] | null;
  previewVideoUrl?: string | null;
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
  /**
   * 항목2(2026-09-22 코드리뷰 5차): autosaveError가 하나로 합쳐지면 어느 도메인이
   * 막고 있는지, 어디로 가야 풀리는지 화면이 말을 못 한다 — 영구 잠금(ADR-007 위반).
   * 도메인별로 따로 받아 그 도메인 편집으로 바로 갈 수 있는 단추를 붙인다.
   */
  cardDeckAutosaveError?: string;
  videoEditAutosaveError?: string;
  /**
   * 카드뉴스 v2 덱(PR4). 있으면 `template==="chat_bubble"` 편집을 `CardDeckPanel` 이
   * 대신하고, 없으면 기존 `lines` 편집 그대로다(회귀 0 — 세션맥락).
   */
  cardDeck?: CardDeck | null;
  onCardDeckChange?: (deck: CardDeck) => void;
  /**
   * 영상 편집 v1(세션맥락 과업 B). 있으면 `kind==="video"` 편집 워크벤치 위에
   * `VideoEditor`(후킹 CTA·댓글 오버레이·자막 기반 편집·음성 변경)를 얹는다. 기존
   * VIDEO_TOOLS(비율·목소리·속도·자막 셀렉트)는 그대로 두고 회귀시키지 않는다.
   */
  videoEdit?: VideoEdit | null;
  onVideoEditChange?: (edit: VideoEdit) => void;
}
type ToolName = "비율" | "배경" | "목소리" | "속도" | "자막";
const VIDEO_TOOLS: ToolName[] = ["비율", "목소리", "속도", "자막"];
const CARD_TOOLS: ToolName[] = ["비율", "배경", "자막"];
const NARRATION_TOOLS: ToolName[] = ["목소리"];

type ToolValues = Record<ToolName, string>;
type AudioFormat = Extract<ContentEditFormat, { kind: "audio" }>;
type PreservedAudioSettings = Pick<AudioFormat, "musicTrack" | "musicVolume">;

const EDIT_KIND_LABELS: Record<Exclude<EditContentKind, "audio">, string> = {
  text: "글",
  card: "카드뉴스",
  video: "영상",
};
const EDIT_KIND_ORDER = ["text", "card", "video"] as const;
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
  return [...SUBTITLE_SIZES];
}

function toolValuesFromFormat(format: ContentEditFormat): ToolValues {
  const defaults: ToolValues = {
    비율: "9:16",
    배경: "작업실 책상",
    목소리: "차분한 남성",
    속도: "1배",
    자막: "보통",
  };
  if (format.kind === "video") {
    return { ...defaults, 비율: format.aspectRatio, 목소리: format.voice, 속도: `${format.playbackSpeed}배`, 자막: format.subtitleSize };
  }
  if (format.kind === "card") {
    return { ...defaults, 비율: format.aspectRatio, 배경: format.background, 자막: format.subtitleSize };
  }
  if (format.kind === "text") return defaults;
  return { ...defaults, 목소리: format.voice };
}

function audioSettingsFromFormat(format: ContentEditFormat | undefined): PreservedAudioSettings {
  const audio = format?.kind === "audio" ? format : defaultContentEditFormat("audio") as AudioFormat;
  return { musicTrack: audio.musicTrack, musicVolume: audio.musicVolume };
}

function formatFromToolValues(
  kind: ContentEditFormat["kind"],
  values: ToolValues,
  preservedAudio: PreservedAudioSettings,
): ContentEditFormat {
  const candidate = kind === "text"
    ? { kind }
    : kind === "video"
    ? { kind, aspectRatio: values.비율, subtitleSize: values.자막, playbackSpeed: Number.parseFloat(values.속도), voice: values.목소리 }
    : kind === "card"
      ? { kind, aspectRatio: values.비율, subtitleSize: values.자막, background: values.배경 }
      : { kind, voice: values.목소리, ...preservedAudio };
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
  };
  return <svg aria-hidden="true" viewBox="0 0 24 24" className="h-5 w-5" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">{paths[tool]}</svg>;
}

const CHANNEL_TEXT_LIMITS = [
  { key: "x", label: "X", limit: 280, weighted: true },
  { key: "threads", label: "Threads", limit: 500, weighted: false },
  { key: "instagram", label: "Instagram", limit: 2200, weighted: false },
] as const;

/** v70 §2: X의 한글은 2칸, 나머지 문자는 1칸으로 센다. */
export function countXWeightedCharacters(value: string): number {
  return Array.from(value).reduce((total, character) => (
    /[\u1100-\u11ff\u3130-\u318f\uac00-\ud7af]/u.test(character) ? total + 2 : total + 1
  ), 0);
}

function ChannelLimitMeter({ label, count, limit, channel }: { label: string; count: number; limit: number; channel: string }) {
  const ratio = count / limit;
  const tone = ratio > 1 ? "danger" : ratio >= 0.8 ? "warning" : "normal";
  return (
    <div className={styles.channelMeter} data-channel-limit={channel} data-channel-limit-tone={tone}>
      <span>{label}</span>
      <meter min={0} max={limit} low={limit * 0.8} high={limit} optimum={0} value={Math.min(count, limit)} aria-label={`${label} 글자 수 ${count}/${limit}`} />
      <b>{count.toLocaleString("ko-KR")}/{limit.toLocaleString("ko-KR")}</b>
    </div>
  );
}

function TextDocumentEditor({ lines, onLinesChange }: { lines: string[]; onLinesChange: (lines: string[]) => void }) {
  const body = lines.join("\n\n");
  return (
    <section className={styles.textDocumentCanvas} aria-labelledby="whole-text-title" data-edit-stage>
      <article className={styles.textDocumentSheet} data-text-document-sheet>
        <header className={styles.textDocumentHeader}>
          <h3 id="whole-text-title">글 전체 편집</h3>
          <p>공백 포함 {Array.from(body).length.toLocaleString("ko-KR")}자</p>
        </header>
        <textarea
          aria-label="글 전체"
          value={body}
          onChange={(event) => onLinesChange(event.target.value.split(/\n\s*\n/))}
          className={styles.textDocumentBody}
        />
        <footer className={styles.channelMeters} aria-label="채널별 글자 수 상한">
          {CHANNEL_TEXT_LIMITS.map((channel) => (
            <ChannelLimitMeter
              key={channel.key}
              channel={channel.key}
              label={channel.label}
              limit={channel.limit}
              count={channel.weighted ? countXWeightedCharacters(body) : Array.from(body).length}
            />
          ))}
        </footer>
      </article>
    </section>
  );
}

export function EditRoom({
  workspaceId,
  lines,
  onLinesChange,
  kind = "video",
  onKindChange,
  previewReady = false,
  previewImageUrl = null,
  previewImageUrls = null,
  previewVideoUrl = null,
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
  cardDeckAutosaveError,
  videoEditAutosaveError,
  cardDeck = null,
  onCardDeckChange,
  videoEdit = null,
  onVideoEditChange,
}: EditRoomProps) {
  const formatKind = kind;
  // 2026-09-22 코드리뷰 MAJOR 3: chat_bubble 이면 `lines`(옛 `editLines` 상태)가 아니라
  // 덱 자체를 문장 단위로 투영한다. 말풍선을 직접 고친 직후 담당 대화창(`askBulk`)이 고친
  // 전 문장을 보고 일괄 편집하던 것(D-2026-09-09-1 "두 길이 다 열려 있어야 한다" 위반)을
  // 막는다. `deckProj.refs` 는 askBulk 결과를 다시 덱에 역적용할 때 각 줄이 어느
  // 장/말풍선에서 왔는지 찾는 데 쓴다.
  const isChatDeck = kind === "card" && Boolean(cardDeck) && cardDeck!.template === "chat_bubble";
  const deckProj = useMemo(() => (isChatDeck ? deckProjection(cardDeck!) : null), [isChatDeck, cardDeck]);
  const safeLines = isChatDeck ? (deckProj!.lines.length ? deckProj!.lines : [""]) : (lines.length ? lines : [""]);
  const [activeLine, setActiveLine] = useState(0);
  const [activeTool, setActiveTool] = useState<ToolName>(() => kind === "audio" ? "목소리" : "비율");
  const [toolValues, setToolValues] = useState<ToolValues>(() => toolValuesFromFormat(
    initialFormat?.kind === formatKind ? initialFormat : defaultContentEditFormat(formatKind),
  ));
  const [visibleLines, setVisibleLines] = useState<boolean[]>(() => safeLines.map(() => true));
  const [bulkMessage, setBulkMessage] = useState("");
  const [bulkAsk, setBulkAsk] = useState("");
  const [bulkBusy, setBulkBusy] = useState(false);
  const initialAudioSettings = audioSettingsFromFormat(initialFormat);
  const preservedAudio = useMemo<PreservedAudioSettings>(() => ({
    musicTrack: initialAudioSettings.musicTrack,
    musicVolume: initialAudioSettings.musicVolume,
  }), [initialAudioSettings.musicTrack, initialAudioSettings.musicVolume]);
  const selectedFormat = useMemo(
    () => formatFromToolValues(formatKind, toolValues, preservedAudio),
    [formatKind, preservedAudio, toolValues],
  );
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
  // v70 §4.3: 실제 서비스는 이 값을 읽지 않는다(위 참조). onVideoEditChange 없는 legacy
  // 경로(레거시 테스트)에서만 옛 "무음 구간 줄이기" 단추가 이 값을 쓴다 — 회귀 0 유지.
  const silenceIndexes = safeLines.map((line, index) => (/…|\.{3}|^\s*$/.test(line) ? index : -1)).filter((index) => index >= 0);
  const visibleSilences = silenceIndexes.filter((index) => visibleLines[index]).length;
  const tools = kind === "card" || kind === "text" ? CARD_TOOLS : kind === "audio" ? NARRATION_TOOLS : VIDEO_TOOLS;
  const outlineTitle = kind === "text" ? "글 문단" : kind === "card" ? "카드 목록" : kind === "audio" ? "대사 목록" : "영상 장면";
  const unit = kind === "card" ? "장" : kind === "text" ? "문단" : "장면";
  const hasEditableContent = safeLines.some((line) => line.trim().length > 0);
  const roomState = state === "default" && !hasEditableContent ? "empty" : state;
  const editorVisible = roomState === "default" || roomState === "overflow";
  const updateLine = (value: string) => onLinesChange(safeLines.map((line, index) => index === activeLine ? value : line));
  // 순서 이동. 줄과 함께 그 줄의 보임 여부와 글자 위치도 같이 옮긴다.
  // 따로 놀면 엉뚱한 줄이 지워진 것처럼 보이고 엉뚱한 장에 남의 글자 위치가 붙는다.
  // 끌어서 놓기는 한 칸이 아니라 먼 자리로 건너뛰므로 뽑아서 끼우는 방식으로 옮긴다.
  // 붙어 있는 두 칸이면 이것은 자리 맞바꾸기와 같은 결과다.
  const moveLineTo = (from: number, to: number) => {
    if (from === to || from < 0 || to < 0 || from >= safeLines.length || to >= safeLines.length) return;
    const nextLines = [...safeLines];
    const [movedLine] = nextLines.splice(from, 1);
    nextLines.splice(to, 0, movedLine);
    setVisibleLines((current) => {
      const next = safeLines.map((_, index) => current[index] ?? true);
      const [movedVisible] = next.splice(from, 1);
      next.splice(to, 0, movedVisible);
      return next;
    });
    if (onCardTextPositionsChange && cardTextPositions.length) {
      const next = safeLines.map((_, index) => cardTextPositions[index] ?? "center");
      const [movedPosition] = next.splice(from, 1);
      next.splice(to, 0, movedPosition);
      onCardTextPositionsChange(next);
    }
    setActiveLine(to);
    onLinesChange(nextLines);
  };
  const moveLine = (index: number, delta: number) => moveLineTo(index, index + delta);
  // 목록 끝에 한 장 더. 더한 장으로 바로 옮겨 간다. 더해 놓고 어디 갔는지 찾게 하지 않는다.
  const addLine = () => {
    onLinesChange([...safeLines, ""]);
    setActiveLine(safeLines.length);
  };
  // 장 삭제. 줄만 지우면 보임 여부와 글자 위치가 한 칸씩 밀려 엉뚱한 장의 값이 붙는다.
  // 마지막 한 장은 지우지 않는다. 편집 대상이 0이 되면 방이 빈 상태로 튕긴다.
  const removeLine = (index: number) => {
    if (safeLines.length <= 1) return;
    const next = safeLines.filter((_, lineIndex) => lineIndex !== index);
    setVisibleLines((current) => current.filter((_, lineIndex) => lineIndex !== index));
    if (onCardTextPositionsChange && cardTextPositions.length) {
      onCardTextPositionsChange(cardTextPositions.filter((_, lineIndex) => lineIndex !== index));
    }
    setActiveLine((current) => Math.min(current, next.length - 1));
    onLinesChange(next);
  };
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
  // 말로 시키는 일괄 변경. 줄 수와 순서가 어긋나면 서버가 거절하므로 여기서는 결과만 받는다.
  const askBulk = async () => {
    const instruction = bulkAsk.trim();
    if (!instruction || !hasEditableContent || bulkBusy) return;
    setBulkBusy(true);
    setBulkMessage("");
    try {
      const res = await fetch("/api/studio/edit-bulk", {
        method: "POST",
        headers: { "content-type": "application/json", ...authHeaders() },
        body: JSON.stringify({ lines: safeLines, instruction, tenant_id: workspaceId }),
      });
      const data = (await res.json().catch(() => ({}))) as { ok?: boolean; lines?: string[]; changed?: number; error?: string };
      if (!data.ok || !Array.isArray(data.lines)) {
        setBulkMessage(data.error || "고치지 못했습니다. 잠시 후 다시 시도해 주세요.");
        return;
      }
      // chat_bubble 이면 결과 줄을 덱에 역적용한다(applyProjection). 그냥 onLinesChange 로
      // 보내면 editLines 로만 저장되는데, 저장 시 서버가 항상 cardDeck 투영으로 그
      // editLines 를 덮어써서(§3.3 "cardDeck 이 이긴다") AI 편집 결과가 조용히 사라진다.
      if (isChatDeck && cardDeck && deckProj && onCardDeckChange) {
        onCardDeckChange(applyProjection(cardDeck, data.lines, deckProj.refs));
      } else {
        onLinesChange(data.lines);
      }
      setBulkAsk("");
      setBulkMessage(data.changed ? `${data.changed}개 줄을 고쳤습니다.` : "바꿀 것이 없었습니다.");
    } catch {
      setBulkMessage("연결이 끊겨 요청이 끝나지 않았습니다. 잠시 후 다시 시도해 주세요.");
    } finally {
      setBulkBusy(false);
    }
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
              {kind === "card" && cardDeck && cardDeck.template === "chat_bubble" && onCardDeckChange ? (
                <div className="card overflow-hidden p-pad-inset" data-edit-workspace data-card-deck-workbench>
                  <p className="mb-stack rounded-control bg-surface-2 p-stack text-caption text-muted" data-card-deck-editor-note>
                    말풍선 카드뉴스는 직접 편집이 기본입니다. 여기서 고친 내용은 자동 저장됩니다.
                  </p>
                  <CardDeckPanel deck={cardDeck} onDeckChange={onCardDeckChange} />
                </div>
              ) : (
              <div className={`card overflow-hidden ${styles.editWorkbench} ${kind === "text" ? styles.textDocumentWorkbench : ""} ${kind === "video" && onVideoEditChange ? styles.videoDocumentWorkbench : ""}`} data-edit-workspace data-text-document-editor={kind === "text" ? "true" : undefined}>
                {/*
                  2026-09-23 세션맥락(과업 C): 카드뉴스가 말풍선 덱(chat_bubble)이 아니면
                  위 CardDeckPanel 분기를 안 타 말풍선 편집 기능이 통째로 안 보인다.
                  회장이 지적한 "카드뉴스 화면에 아무것도 안 뜬다"를 조용히 두지 않는다
                  (ADR-007 조용한 실패 금지). 왜 안 보이는지와 만드는 경로만 안내하고,
                  생성이 지금 실패한다고 단정하지 않는다(로컬·운영 상태가 다를 수 있음,
                  세션맥락 원문).
                */}
                {kind === "card" && (!cardDeck || cardDeck.template !== "chat_bubble") ? (
                  <p className="m-pad-inset rounded-control border border-border bg-surface-2 p-stack text-caption text-muted" data-card-deck-missing-note>
                    말풍선 대화 편집은 카톡 말풍선 카드뉴스 9장 덱에만 있습니다. 이 작업물은 아직 그 덱이 아니라 아래 목록형 편집만 보입니다.{" "}
                    {onOpenCreate ? <Button size="sm" variant="secondary" onClick={onOpenCreate}>생성실에서 &ldquo;카톡 말풍선 카드뉴스 9장 만들기&rdquo;로 가기</Button> : null}
                  </p>
                ) : null}
                {/*
                  2026-09-14. 여기는 `1. 첫 장` 같은 글자 목록이었고, 장을 옮기려면 미리보기
                  아래 `앞 장`·`다음 장` 화살표를 여러 번 눌러야 했다. 카드뉴스는 장과 장의
                  흐름이 곧 상품인데 그 흐름이 화면에 없었다. DESIGN.md §4 가 이 칸을 이미
                  계약해 뒀으므로 새 칸을 만들지 않고 있는 집을 채운다.
                */}
                {/*
                  v70 §4: 영상이 새 VideoEditor(플레이어+자막 대본+타임라인)로 그려질
                  때는 목차 나브를 같이 두지 않는다 — 같은 장면 목록이 두 곳에서 따로 놀아
                  어느 쪽이 진짜인지 알 수 없다. onVideoEditChange가 없는 legacy 경로(옛
                  4단 도구줄, 레거시 테스트 전용 — 실제 서비스는 항상 onVideoEditChange를
                  준다)는 예전처럼 목차를 그대로 둔다(회귀 0).
                */}
                {kind !== "text" && !(kind === "video" && onVideoEditChange) ? <nav className={`min-w-0 p-pad-inset ${styles.editOutline}`} aria-label={outlineTitle} data-edit-outline>
                  <EditOutline
                    title={outlineTitle}
                    unit={unit}
                    lines={safeLines}
                    activeIndex={activeLine}
                    onSelect={setActiveLine}
                    visibleLines={visibleLines}
                    // 카드뉴스만 장마다 그림이 다르다. 나머지 형식은 순번 자리표시자를 쓴다.
                    thumbnails={kind === "card" ? (previewImageUrls ?? undefined) : undefined}
                    tenantId={workspaceId}
                    showRoles={kind === "card"}
                    note={kind === "card" ? "순서는 끌어서 놓거나 ▲▼로 바꿉니다. 자유 배치는 아직 제공하지 않습니다. 글자는 상단·중앙·하단 중에서 고릅니다." : undefined}
                    onMove={moveLine}
                    onMoveTo={moveLineTo}
                    onAdd={addLine}
                    onRemove={removeLine}
                  />
                </nav> : null}
                <div className={kind === "text" ? "min-w-0" : "min-w-0 p-pad-inset"}>
                  {kind === "text" ? (
                    <TextDocumentEditor lines={safeLines} onLinesChange={onLinesChange} />
                  ) : kind === "video" && onVideoEditChange ? (
                    // v70 §4: 영상은 전용 편집기 한 벌(플레이어+자막 대본+타임라인)이 본체다.
                    // 옛 표준 편집 작업대(장면 순서·비율·자막 크기 도구줄)와 VideoEditor를
                    // 겹쳐 띄우던 것이 회장이 지적한 "씹창"이었다 — 이번엔 형식마다 전용
                    // 편집기로 가르되, 비율·자막 크기(굽기 값)·재생 속도·목소리 도구줄은
                    // 사유 없이 지운 게 아니라 이 얇은 줄로 남긴다(교차 리뷰 M5).
                    <>
                      <section className="mb-pad-inset flex flex-wrap gap-stack-tight border-b border-border pb-pad-inset" aria-label="형식 도구" data-edit-tools>
                        {tools.map((tool) => (
                          <Button key={tool} size="sm" variant="secondary" className={activeTool === tool ? "border-accent bg-accent-soft text-accent" : ""} onClick={() => setActiveTool(tool)} aria-pressed={activeTool === tool} aria-label={`${visibleToolName(kind, tool)} 도구`}>
                            <ToolIcon tool={tool} /><span>{visibleToolName(kind, tool)}: {visibleToolValue(tool, toolValues[tool], kind)}</span>
                          </Button>
                        ))}
                      </section>
                      <div className="mb-pad-inset flex flex-wrap gap-stack-tight" aria-label={`${visibleToolName(kind, activeTool)} 선택지`}>
                        {toolOptions(formatKind, activeTool).map((option) => (
                          <Button key={option} size="sm" variant="secondary" className={toolValues[activeTool] === option ? "border-accent bg-accent-soft text-accent" : ""} aria-pressed={toolValues[activeTool] === option} onClick={() => setToolValues((current) => ({ ...current, [activeTool]: option }))}>
                            {visibleToolValue(activeTool, option, kind)}
                          </Button>
                        ))}
                      </div>
                      <VideoEditor
                        videoEdit={videoEdit ?? EMPTY_VIDEO_EDIT}
                        onVideoEditChange={onVideoEditChange}
                        previewVideoUrl={previewVideoUrl}
                        lines={safeLines}
                        onLinesChange={onLinesChange}
                        onOpenCreate={onOpenCreate}
                      />
                    </>
                  ) : (
                    <>
                      {kind === "audio" ? (
                        <>
                          <section className="grid min-h-80 place-items-center rounded-surface bg-surface-2 p-region text-center" data-edit-stage>
                            <b className="text-subheading text-text">나레이션 대사 편집</b>
                          </section>
                          <section className="mt-pad-inset border-b border-border pb-pad-inset" aria-label="나레이션 편집 도구" data-edit-tools>
                            <div className="flex flex-wrap gap-stack-tight">
                              {tools.map((tool) => <Button key={tool} size="sm" variant="secondary" className={activeTool === tool ? "border-accent bg-accent-soft text-accent" : ""} onClick={() => setActiveTool(tool)} aria-pressed={activeTool === tool} aria-label={`${visibleToolName(kind, tool)} 도구`}><ToolIcon tool={tool} /><span>{visibleToolName(kind, tool)}: {visibleToolValue(tool, toolValues[tool], kind)}</span></Button>)}
                            </div>
                            <div className="mt-pad-inset flex flex-wrap gap-stack-tight" aria-label={`${visibleToolName(kind, activeTool)} 선택지`}>
                              {toolOptions(formatKind, activeTool).map((option) => <Button key={option} size="sm" variant="secondary" className={toolValues[activeTool] === option ? "border-accent bg-accent-soft text-accent" : ""} aria-pressed={toolValues[activeTool] === option} onClick={() => setToolValues((current) => ({ ...current, [activeTool]: option }))}>{visibleToolValue(activeTool, option, kind)}</Button>)}
                            </div>
                          </section>
                        </>
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
                              // 영상은 대표 이미지를 움직여 만든다. 영상이 아직 없으면 그 바탕이 된
                              // 이미지를 보여 주는 편이 자리표시자보다 결과에 가깝다.
                              mediaUrl={(kind === "video" ? (previewVideoUrl || previewImageUrl) : previewImageUrl) || undefined}
                              // 카드뉴스는 장마다 그림이 다르다. 한 벌을 통째로 넘겨 고른 장의
                              // 그림을 그린다(2026-09-14 실측: 늘 대표 한 장만 보였다).
                              mediaUrls={kind === "card" ? (previewImageUrls ?? undefined) : undefined}
                              mediaType={kind === "video" && previewVideoUrl ? "video" : "image"}
                              // 만료된 배달 주소를 되살릴 때 어느 작업 공간인지 함께 보낸다.
                              // 없으면 운영자 경로에서 401 로 닫힌다(2026-09-13).
                              tenantId={workspaceId}
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
                            {/*
                              2026-09-09 회장 지적: "대문 사진, 본문, 마지막 사진 등 사진
                              여러개 흐름이 한 세트가 되는 경우가 많을거같은데."
                              종전에는 한 장씩만 보여 세트의 흐름이 안 보였다. 카드뉴스는
                              장과 장 사이의 순서가 곧 내용인데, 지금 보는 한 장만으로는
                              그 흐름을 판단할 수 없다. 우리 팀이 이미 만든 카드 편집
                              도구(D-EDU 카드컨셉13)도 슬라이드 전체를 늘어놓고 고른다.
                              전체를 늘어놓고 누르면 그 장으로 간다.
                            */}
                            {safeLines.length > 1 ? (
                              <div className="mt-stack" data-card-strip aria-label={`${unit} 전체 ${safeLines.length}개`}>
                                <div className="mb-stack-tight flex items-center justify-between">
                                  <b className="text-caption text-muted">{unit} 전체</b>
                                  <span className="text-caption text-subtle">{activeLine + 1} / {safeLines.length}</span>
                                </div>
                                <ol className="flex gap-stack-tight overflow-x-auto pb-stack-tight">
                                  {safeLines.map((entry, index) => (
                                    <li key={`strip-${index}`}>
                                      <button
                                        type="button"
                                        data-card-strip-item={index}
                                        aria-current={activeLine === index}
                                        onClick={() => setActiveLine(index)}
                                        className={`h-20 w-16 shrink-0 rounded-control border p-micro text-left text-caption leading-tight ${activeLine === index ? "border-accent bg-accent-soft text-accent" : "border-border bg-surface-2 text-subtle hover:bg-surface"} ${visibleLines[index] ? "" : "opacity-50 line-through"}`}
                                      >
                                        <span className="block font-semibold">{index + 1}</span>
                                        <span className="line-clamp-3 break-keep">{entry || "빈 " + unit}</span>
                                      </button>
                                    </li>
                                  ))}
                                </ol>
                              </div>
                            ) : null}
                          </section>
                          <section className="mt-pad-inset border-b border-border pb-pad-inset" aria-label="간편 편집 도구" data-edit-tools>
                            {/*
                              v70 §4.3: 실제 서비스(onVideoEditChange 있음)는 이 분기에
                              닿지 않는다 — 위에서 VideoEditor(플레이어+자막 대본+타임라인)로
                              완전히 갈랐고, 새 자막 대본에는 "무음·군말 한번에 컷" 단추를
                              넣지 않았다(실제 무음 검출 데이터가 없다 — 옛 trimSilences는
                              정규식(말줄임표·빈 줄)으로 흉내 낸 것이었다, ADR-007). 이 아래
                              단추는 onVideoEditChange가 없는 legacy 경로(레거시 테스트 전용)
                              에서만 보이는 옛 동작이라 회귀 0을 위해 그대로 남긴다.
                            */}
                            <div className="flex flex-wrap gap-stack-tight">{tools.map((tool) => <Button key={tool} size="sm" variant="secondary" className={activeTool === tool ? "border-accent bg-accent-soft text-accent" : ""} onClick={() => setActiveTool(tool)} aria-pressed={activeTool === tool} aria-label={`${visibleToolName(kind, tool)} 도구`}><ToolIcon tool={tool} /><span>{visibleToolName(kind, tool)}: {visibleToolValue(tool, toolValues[tool], kind)}</span></Button>)}
                              {kind === "video" ? <Button size="sm" onClick={trimSilences} disabled={visibleSilences === 0}>무음 구간 {visibleSilences}개 줄이기</Button> : null}
                            </div>
                            <div className="mt-pad-inset flex flex-wrap gap-stack-tight" aria-label={`${visibleToolName(kind, activeTool)} 선택지`}>{toolOptions(formatKind, activeTool).map((option) => <Button key={option} size="sm" variant="secondary" className={toolValues[activeTool] === option ? "border-accent bg-accent-soft text-accent" : ""} aria-pressed={toolValues[activeTool] === option} onClick={() => setToolValues((current) => ({ ...current, [activeTool]: option }))}>{visibleToolValue(activeTool, option, kind)}</Button>)}</div>
                          </section>
                        </>
                      )}
                      <section className="mt-pad-inset" aria-labelledby="edit-script-title" data-edit-script>
                        <div className="mb-stack flex flex-wrap items-center justify-between gap-stack-tight"><b id="edit-script-title" className="text-body text-text">{kind === "card" ? "카드 문구" : kind === "audio" ? "나레이션 대사" : "장면 대사"}</b><span className="text-caption text-subtle" data-edit-duration={kind === "video" ? durationLabel : undefined}>{visibleCount}개 {unit}{kind === "video" ? ` · ${durationLabel}초` : ""}</span></div>
                        <ol className="space-y-stack-tight">{safeLines.map((line, index) => <li key={`script-${index}`} className={`grid gap-stack-tight rounded-control border border-border bg-surface-2 p-stack md:grid-cols-[4rem_minmax(0,1fr)_auto] ${visibleLines[index] ? "" : "opacity-60"}`} data-script-line={index + 1}>
                          <span className="text-caption text-subtle">{kind === "card" ? `${index + 1}장` : kind === "audio" ? `${index + 1}번째` : `${index * secondsPerLine}초부터`}</span>
                          {/*
                            2026-09-09 회장 지적("목차의 의미 몰라? vrew 처럼 장면 대사보고
                            자막이나 음성 바로 편집가능하게하는건데")과 경쟁사 조사 반영.
                            종전에는 한 줄을 눌러 고른 뒤 그 줄만 입력칸이 됐다. 나머지는
                            읽기만 되는 목록이었다. 그래서 이 자리가 편집기가 아니라 목차로
                            읽혔다. 고칠 곳을 고르는 동작이 고치는 동작 앞에 하나 더 있으면
                            그만큼 손이 는다.
                            Vrew 가 하는 것은 대본을 그대로 고치게 두는 것이다. 모든 줄이
                            언제나 입력칸이다. 고르는 단계를 없앤다.
                          */}
                          <input
                            aria-label={`${kind === "card" ? "문구" : "대사"} ${index + 1}`}
                            data-line-input={index}
                            value={line}
                            onChange={(event) => onLinesChange(safeLines.map((current, lineIndex) => lineIndex === index ? event.target.value : current))}
                            onFocus={() => setActiveLine(index)}
                            placeholder={kind === "card" ? "빈 문구" : "빈 대사"}
                            className={`min-h-control-touch min-w-0 rounded-control border px-stack text-body-sm text-text ${activeLine === index ? "border-accent bg-accent-soft/30" : "border-transparent bg-transparent hover:border-border hover:bg-surface"} ${visibleLines[index] ? "" : "line-through opacity-60"}`}
                          />
                          {/*
                            여러 장이 한 세트인 흐름이라 순서가 곧 내용이다(회장 2026-09-09
                            "대문 사진, 본문, 마지막 사진 등 사진 여러개 흐름이 한 세트").
                            우리 팀이 이미 만든 카드 편집 도구도 슬라이드 순서 이동을 갖고 있다.
                          */}
                          <div className="flex shrink-0 gap-micro">
                            <Button size="sm" aria-label={`${index + 1}번째를 위로`} data-line-up={index}
                              disabled={index === 0} onClick={() => moveLine(index, -1)}>▲</Button>
                            <Button size="sm" aria-label={`${index + 1}번째를 아래로`} data-line-down={index}
                              disabled={index === safeLines.length - 1} onClick={() => moveLine(index, 1)}>▼</Button>
                            <Button size="sm" onClick={() => toggleLine(index)}>{visibleLines[index] ? "빼기" : "되살리기"}</Button>
                          </div>
                        </li>)}</ol>
                        <div className="mt-stack flex flex-wrap gap-stack-tight">
                          <Button size="sm" data-line-add onClick={() => onLinesChange([...safeLines, ""])}>
                            {kind === "card" ? "카드 추가" : kind === "audio" ? "대사 추가" : "장면 추가"}
                          </Button>
                        </div>
                      </section>
                    </>
                  )}
                </div>
              </div>
              )}
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
          /*
            2026-09-09 회장 지적: "편집실 AI 챗봇은 왜 다른곳이랑 UI가 다름?"
            다른 방(생성실·발행실·성과실)은 AssistantPanel 이라는 같은 대화창을 쓰는데
            편집실만 이 자리가 버튼판이었다. 같은 역할이면 같은 모양이어야 한다.
            대화창 안에 넣되, 편집실이 하는 일(전체 일괄 변경과 발행실 이동)은 그대로 둔다.
          */
          <aside className={`card p-pad-inset ${styles.editHelper}`} aria-label="편집 담당 대화창" data-edit-helper>
            <div className={styles.editHelperActions}>
              <div className="flex items-center gap-stack-tight border-b border-border pb-stack">
                <div className="grid h-10 w-10 place-items-center rounded-pill bg-accent text-body font-bold text-accent-fg" aria-hidden="true">O</div>
                <div><b className="block text-body text-text">편집 담당</b><span className="text-caption text-success">지금 대기 중</span></div>
              </div>
              <h2 className="mt-stack text-body font-bold text-text">전체에 한 번에 적용</h2>
              <p className="mt-stack-tight break-keep text-caption text-muted">한 곳을 정확히 고치는 것은 손이 빠릅니다. 여러 곳을 같은 규칙으로 바꾸는 것은 말이 빠릅니다.</p>
              {/*
                2026-09-09 회장 지시: "AI 챗봇에서는 '자막에서 어투 이렇게 바꿔줘' 이렇게
                요청할수도있는거고." 고정 단추 셋으로는 그 말을 받을 수 없었다. 자유롭게
                시킬 자리를 연다. 줄 수와 순서는 서버가 지킨다(app/api/studio/edit-bulk).
              */}
              <form
                className="mt-pad-inset flex gap-stack-tight"
                data-bulk-ask-form
                onSubmit={(event) => { event.preventDefault(); void askBulk(); }}
              >
                <input
                  aria-label="전체에 적용할 요청"
                  data-bulk-ask
                  value={bulkAsk}
                  onChange={(event) => setBulkAsk(event.target.value)}
                  placeholder="예: 자막 어투를 더 부드럽게 바꿔줘"
                  disabled={!hasEditableContent || bulkBusy}
                  className="min-h-control-touch min-w-0 flex-1 rounded-control border border-border bg-surface px-stack text-body-sm text-text"
                />
                {/*
                  이 방의 다음 단계는 "발행실로 이동" 하나다. 도구 단추가 같은 강조를 가지면
                  다음 단계가 묻힌다. 강조는 방마다 하나여야 한다.
                */}
                <Button type="submit" disabled={!hasEditableContent || bulkBusy || !bulkAsk.trim()}>
                  {bulkBusy ? "고치는 중" : "시키기"}
                </Button>
              </form>
              <div className="mt-pad-inset grid gap-stack-tight">
                <Button className="w-full min-w-0 justify-start" onClick={shortenAll} disabled={!hasEditableContent}>전부 짧게 줄이기</Button>
                <Button className="w-full min-w-0 justify-start" onClick={politeAll} disabled={!hasEditableContent}>말끝을 높임말로 맞추기</Button>
                <Button className="w-full min-w-0 justify-start" onClick={dropEmpty} disabled={!hasEditableContent}>빈 줄 걷어내기</Button>
              </div>
              {bulkMessage ? <p className="mt-stack text-caption text-success" aria-live="polite">{bulkMessage}</p> : null}
            </div>
            {/*
              항목2(2026-09-22 코드리뷰 5차): 영상 편집기의 미완성 오버레이 하나가
              카드덱만 손보고 있는 사용자에게 "발행실로 이동"을 영구히 막았는데, 문구는
              영상 얘기만 했고 그 방으로 가는 길이 없었다(ADR-007 §1·§3 위반). 어느
              도메인이 막고 있는지와 그 도메인 편집으로 바로 가는 단추를 붙인다.
            */}
            {cardDeckAutosaveError ? (
              <p role="alert" className="rounded-control border border-danger bg-danger-soft p-stack text-caption text-danger" data-blocked-domain="card">
                {cardDeckAutosaveError}{" "}
                {kind !== "card" ? <Button size="sm" variant="secondary" onClick={() => onKindChange?.("card")}>카드덱 편집으로 가기</Button> : null}
              </p>
            ) : null}
            {videoEditAutosaveError ? (
              <p role="alert" className="rounded-control border border-danger bg-danger-soft p-stack text-caption text-danger" data-blocked-domain="video">
                {videoEditAutosaveError}{" "}
                {kind !== "video" ? <Button size="sm" variant="secondary" onClick={() => onKindChange?.("video")}>영상 편집으로 가기</Button> : null}
              </p>
            ) : null}
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
