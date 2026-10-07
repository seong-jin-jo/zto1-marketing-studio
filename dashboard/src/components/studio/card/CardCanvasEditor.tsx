"use client";

import { useCallback, useEffect, useMemo, useRef, useState, type CSSProperties, type PointerEvent as ReactPointerEvent } from "react";
import { Button } from "@/components/shared/Button";
import { authHeaders } from "@/lib/auth";
import type { CardDeckV3, CardElement, CardElementType } from "@/lib/studio/card-element-contract";
import type { CardDeck } from "@/lib/studio/card-deck-contract";
import {
  addCardElement,
  addChatOverlayElement,
  addChatBubble,
  addChatSlide,
  clearChatSlideBackgroundImage,
  commitCardCommand,
  createCardCommandHistory,
  deleteCardElement,
  deleteChatBubble,
  deleteChatSlide,
  duplicateCardElement,
  duplicateChatSlide,
  mergeChatBubbleWithNext,
  moveCardElement,
  moveCardElementLayer,
  moveChatBubble,
  moveChatBubbleToSlide,
  moveChatSlide,
  nudgeCardElement,
  patchTextElement,
  patchChatBubbleText,
  patchChatDeckBrand,
  patchChatSlideCover,
  redoCardCommand,
  resizeCardElement,
  rotateCardElement,
  setCardElementGeometry,
  setChatSlideBackgroundImage,
  snapCardElementPosition,
  splitChatBubble,
  splitChatSlideAtBubble,
  splitChatSlideAtBubbleOffset,
  swapChatSpeakers,
  toggleChatBubbleBold,
  toggleChatBubbleBoldRange,
  toggleChatBubbleReaction,
  toggleChatBubbleSpeaker,
  toggleCardElementFlag,
  undoCardCommand,
  type CardCommandHistory,
  type LayerDirection,
  type ResizeHandle,
  type SnapGuide,
} from "@/lib/studio/card-element-commands";
import { assertValidChatCardDeckV3CommandResult, projectChatCardDeckV3ToRenderableV2 } from "@/lib/studio/card-deck-v2-to-v3";
import { assertChatSlidesRenderable } from "@/lib/studio/chat-deck-layout";
import { CHAT_TONE_IDS, isChatToneCandidateList, type ChatToneCandidate, type ChatToneId } from "@/lib/studio/chat-tone-suggestions";
import { cardSlideRenderModel, isChatBaseProjectionElement } from "@/lib/studio/card-render-model";
import { CardElementList } from "./CardElementList";
import { CardElementToolbar } from "./CardElementToolbar";
import { CardSlideScene } from "./CardSlideScene";
import { CardTemplateGallery } from "./CardTemplateGallery";
import {
  applyCardDeckTemplate,
  cardTemplateName,
  defaultCardTemplateState,
  type CardTemplateState,
  type CardDeckTemplateId,
} from "@/lib/studio/card-templates";
import styles from "./CardCanvasEditor.module.css";

const RESIZE_HANDLES: ResizeHandle[] = ["nw", "n", "ne", "e", "se", "s", "sw", "w"];

type Interaction = {
  kind: "move" | "resize" | "rotate";
  element: CardElement;
  handle?: ResizeHandle;
  pointerId: number;
  startClientX: number;
  startClientY: number;
  centerClientX: number;
  centerClientY: number;
  baseDeck: CardDeckV3;
  slideId: string;
  siblings: CardElement[];
  ratio: CardDeckV3["ratio"];
  logicalHeight: number;
  latestDeck?: CardDeckV3;
};

function isTextEntryTarget(target: EventTarget | null): boolean {
  if (!(target instanceof HTMLElement)) return false;
  return target.matches("input, select, textarea, [contenteditable='true']") || Boolean(target.closest("input, select, textarea, [contenteditable='true']"));
}

function isCanvasShortcutTarget(target: EventTarget | null, stage: HTMLElement | null): boolean {
  if (!(target instanceof HTMLElement) || isTextEntryTarget(target)) return false;
  return target === stage || Boolean(target.closest("[data-element-selection]"));
}

function nextElementId(type: CardElementType): string {
  return `el_${type}_${crypto.randomUUID().replaceAll("-", "").slice(0, 12)}`;
}

function elementOverlayStyle(element: CardElement, logicalHeight: number): CSSProperties {
  return {
    "--selection-left": `${element.x / 1080 * 100}%`,
    "--selection-top": `${element.y / logicalHeight * 100}%`,
    "--selection-width": `${element.width / 1080 * 100}%`,
    "--selection-height": `${element.height / logicalHeight * 100}%`,
    "--selection-rotation": `${element.rotation}deg`,
    "--selection-z": element.z_index + 100,
  } as CSSProperties;
}

export interface CardCanvasEditorProps {
  deck: CardDeckV3;
  templateState?: CardTemplateState | null;
  sourceDeck?: CardDeck | null;
  assetUrls?: Record<string, string>;
  onAssetUrlChange?: (assetId: string, url: string) => void;
  onDeckChange: (deck: CardDeckV3, templateState?: CardTemplateState) => void;
}

export function CardCanvasEditor({ deck, templateState = null, sourceDeck = null, assetUrls = {}, onAssetUrlChange, onDeckChange }: CardCanvasEditorProps) {
  const initialTemplateState = templateState ?? defaultCardTemplateState(deck);
  const [history, setHistory] = useState<CardCommandHistory>(() => createCardCommandHistory(deck));
  const [activeSlideId, setActiveSlideId] = useState(deck.slides[0]?.id ?? "");
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [previewDeck, setPreviewDeck] = useState<CardDeckV3 | null>(null);
  const [guides, setGuides] = useState<SnapGuide[]>([]);
  const [localAssetUrls, setLocalAssetUrls] = useState<Record<string, string>>({});
  const [uploadError, setUploadError] = useState("");
  const [editingTextId, setEditingTextId] = useState<string | null>(null);
  const [editingTextValue, setEditingTextValue] = useState("");
  const [rotationPreview, setRotationPreview] = useState<number | null>(null);
  const [bubbleEditError, setBubbleEditError] = useState("");
  const [selectedBubbleId, setSelectedBubbleId] = useState<string | null>(null);
  const [selectedBubbleRange, setSelectedBubbleRange] = useState<{ bubbleId: string; from: number; to: number } | null>(null);
  const [toneScope, setToneScope] = useState<"one" | "slide" | "all">("slide");
  const [toneId, setToneId] = useState<ChatToneId>("learned");
  const [toneBusy, setToneBusy] = useState(false);
  const [toneError, setToneError] = useState("");
  const [activeTemplateId, setActiveTemplateId] = useState<CardDeckTemplateId>(() => initialTemplateState.activeTemplateId);
  const [pendingTemplateId, setPendingTemplateId] = useState<CardDeckTemplateId>(() => initialTemplateState.activeTemplateId);
  const [templateScope, setTemplateScope] = useState<"all" | "slide">("all");
  const [previousTemplate, setPreviousTemplate] = useState<{ id: CardDeckTemplateId; deck: CardDeckV3 } | null>(() => initialTemplateState.previousTemplate);
  const [splitNotice, setSplitNotice] = useState("");
  const [sceneOverflow, setSceneOverflow] = useState(false);
  const [toneCandidates, setToneCandidates] = useState<{ targets: Array<{ slideId: string; bubbleId: string; text: string }>; candidates: ChatToneCandidate[]; revision: number } | null>(null);
  const [speakerEditorOpen, setSpeakerEditorOpen] = useState(false);
  const stageRef = useRef<HTMLDivElement | null>(null);
  const interactionRef = useRef<Interaction | null>(null);
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const profileInputRef = useRef<HTMLInputElement | null>(null);
  const backgroundInputRef = useRef<HTMLInputElement | null>(null);
  const rememberAssetUrl = useCallback((assetId: string, url: string) => {
    setLocalAssetUrls((current) => ({ ...current, [assetId]: url }));
    onAssetUrlChange?.(assetId, url);
  }, [onAssetUrlChange]);
  const lastExternalDeckRef = useRef(deck);
  const commitRef = useRef<(next: CardDeckV3) => void>(() => {});
  const textEditorRef = useRef<HTMLTextAreaElement | null>(null);
  const textEditBaseDeckRef = useRef<CardDeckV3 | null>(null);
  const textEditCommitTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const textEditPendingRef = useRef<{ slideId: string; elementId: string; value: string } | null>(null);
  const textEditFlushRef = useRef<(slideId: string, elementId: string, value: string) => void>(() => {});
  const textEditCommittedRef = useRef(false);
  const textEditLastCommittedValueRef = useRef<string | null>(null);
  const lastTextPointerDownRef = useRef<{ elementId: string; at: number } | null>(null);
  const workingDeck = previewDeck ?? history.present;
  const activeSlide = workingDeck.slides.find((slide) => slide.id === activeSlideId) ?? workingDeck.slides[0];
  const logicalHeight = workingDeck.ratio === "4:5" ? 1350 : 1080;
  const editableElements = activeSlide?.elements.filter((element) => !isChatBaseProjectionElement(activeSlide, element)) ?? [];
  const selected = editableElements.find((element) => element.id === selectedId) ?? null;
  // 첫 클릭 뒤 도구막대가 새로 삽입되면 스테이지가 아래로 밀려 두 번째 클릭 좌표가
  // 다른 곳을 가리킨다. 선택 전에도 첫 글 요소 크기의 숨은 도구막대를 두어 레이아웃을
  // 고정하고, 실제 선택 뒤 같은 자리를 활성화한다.
  const toolbarElement = selected ?? editableElements.find((element) => element.type === "text") ?? null;
  const resolvedAssetUrls = useMemo(() => ({ ...assetUrls, ...localAssetUrls }), [assetUrls, localAssetUrls]);
  const model = useMemo(() => cardSlideRenderModel(workingDeck, activeSlideId, resolvedAssetUrls), [workingDeck, activeSlideId, resolvedAssetUrls]);
  const templatePreviewDeck = useMemo(() => {
    try {
      return applyCardDeckTemplate(history.present, pendingTemplateId, templateScope === "slide" ? { kind: "slide", slideId: activeSlideId } : { kind: "all" });
    } catch {
      return null;
    }
  }, [activeSlideId, history.present, pendingTemplateId, templateScope]);

  const editorComparableDeck = useCallback((candidate: CardDeckV3) => JSON.stringify({
    ...candidate,
    migration: candidate.migration
      ? { ...candidate.migration, source_sha256: "" }
      : undefined,
  }), []);

  useEffect(() => {
    // 최신본 불러오기와 충돌 복구는 같은 revision 안에서도 내용을 통째로 바꿀 수 있다.
    // id/revision만 비교하면 editor history가 옛 덱을 계속 그려 서버 최신본이 화면에 안 뜬다.
    if (deck === lastExternalDeckRef.current) return;
    lastExternalDeckRef.current = deck;
    if (editorComparableDeck(deck) === editorComparableDeck(history.present)) return;
    setHistory(createCardCommandHistory(deck));
    setPreviewDeck(null);
  }, [deck, editorComparableDeck, history.present]);

  useEffect(() => {
    if (!templateState) return;
    setActiveTemplateId(templateState.activeTemplateId);
    setPendingTemplateId(templateState.activeTemplateId);
    setPreviousTemplate(templateState.previousTemplate ? structuredClone(templateState.previousTemplate) : null);
  }, [templateState]);

  const commit = useCallback((next: CardDeckV3, nextTemplateState?: CardTemplateState) => {
    if (sourceDeck) assertValidChatCardDeckV3CommandResult(next, sourceDeck);
    setHistory((current) => commitCardCommand(current, next));
    setPreviewDeck(null);
    setGuides([]);
    onDeckChange(next, nextTemplateState ?? { activeTemplateId, previousTemplate });
  }, [activeTemplateId, onDeckChange, previousTemplate, sourceDeck]);
  commitRef.current = commit;

  useEffect(() => {
    if (editingTextId) textEditorRef.current?.focus();
  }, [editingTextId]);

  const apply = useCallback((command: (current: CardDeckV3) => CardDeckV3) => commit(command(history.present)), [commit, history.present]);
  const applyTemplate = useCallback(() => {
    const before = structuredClone(history.present);
    const next = applyCardDeckTemplate(before, pendingTemplateId, templateScope === "slide" ? { kind: "slide", slideId: activeSlideId } : { kind: "all" });
    const nextPrevious = { id: activeTemplateId, deck: before };
    setPreviousTemplate(nextPrevious);
    commit(next, { activeTemplateId: pendingTemplateId, previousTemplate: nextPrevious });
    setActiveTemplateId(pendingTemplateId);
  }, [activeSlideId, activeTemplateId, commit, history.present, pendingTemplateId, templateScope]);
  const restorePreviousTemplate = useCallback(() => {
    if (!previousTemplate) return;
    const current = structuredClone(history.present);
    const restored = { ...structuredClone(previousTemplate.deck), revision: history.present.revision + 1 };
    const nextPrevious = { id: activeTemplateId, deck: current };
    commit(restored, { activeTemplateId: previousTemplate.id, previousTemplate: nextPrevious });
    setPreviousTemplate(nextPrevious);
    setActiveTemplateId(previousTemplate.id);
    setPendingTemplateId(previousTemplate.id);
  }, [activeTemplateId, commit, history.present, previousTemplate]);
  const beginTextEdit = useCallback((element: CardElement) => {
    if (element.type !== "text" || element.locked) return;
    setSelectedId(element.id);
    setEditingTextId(element.id);
    setEditingTextValue(element.text);
    textEditBaseDeckRef.current = history.present;
    textEditCommittedRef.current = false;
    textEditLastCommittedValueRef.current = null;
  }, [history.present]);
  const flushTextEdit = useCallback((slideId: string, elementId: string, value: string) => {
    const baseDeck = textEditBaseDeckRef.current;
    if (!baseDeck || textEditLastCommittedValueRef.current === value) return;
    const next = patchTextElement(baseDeck, slideId, elementId, { text: value });
    lastExternalDeckRef.current = next;
    setHistory((current) => textEditCommittedRef.current
      ? { ...current, present: next, future: [] }
      : commitCardCommand(current, next));
    textEditCommittedRef.current = true;
    textEditLastCommittedValueRef.current = value;
    setPreviewDeck(null);
    onDeckChange(next);
  }, [onDeckChange]);
  textEditFlushRef.current = flushTextEdit;
  const deleteAndRestoreStageFocus = useCallback((elementId: string) => {
    if (!activeSlide) return;
    apply((current) => deleteCardElement(current, activeSlide.id, elementId));
    setSelectedId(null);
    requestAnimationFrame(() => stageRef.current?.focus());
  }, [activeSlide, apply]);
  const duplicate = useCallback((elementId: string) => {
    const source = editableElements.find((element) => element.id === elementId);
    if (!source || !activeSlide) return;
    const id = nextElementId(source.type);
    apply((current) => duplicateCardElement(current, activeSlide.id, elementId, id));
    setSelectedId(id);
  }, [activeSlide, apply, editableElements]);

  const beginInteraction = (event: ReactPointerEvent, element: CardElement, kind: Interaction["kind"], handle?: ResizeHandle) => {
    if (element.locked) return;
    event.preventDefault();
    event.stopPropagation();
    setSelectedId(element.id);
    const rect = stageRef.current?.getBoundingClientRect();
    if (!rect) return;
    const centerClientX = rect.left + (element.x + element.width / 2) / 1080 * rect.width;
    const centerClientY = rect.top + (element.y + element.height / 2) / logicalHeight * rect.height;
    interactionRef.current = {
      kind,
      element: structuredClone(element),
      handle,
      pointerId: event.pointerId,
      startClientX: event.clientX,
      startClientY: event.clientY,
      centerClientX,
      centerClientY,
      baseDeck: history.present,
      slideId: activeSlide.id,
      siblings: editableElements,
      ratio: workingDeck.ratio,
      logicalHeight,
    };
    if (kind === "rotate") setRotationPreview(element.rotation);
    event.currentTarget.setPointerCapture?.(event.pointerId);
  };

  useEffect(() => {
    const move = (event: PointerEvent) => {
      const interaction = interactionRef.current;
      const rect = stageRef.current?.getBoundingClientRect();
      if (!interaction || !rect || event.pointerId !== interaction.pointerId) return;
      const dx = (event.clientX - interaction.startClientX) / rect.width * 1080;
      const dy = (event.clientY - interaction.startClientY) / rect.height * interaction.logicalHeight;
      if (interaction.kind === "move") {
        const snapped = snapCardElementPosition(interaction.element, interaction.element.x + dx, interaction.element.y + dy, interaction.siblings, interaction.ratio);
        setGuides(snapped.guides);
        interaction.latestDeck = moveCardElement(interaction.baseDeck, interaction.slideId, interaction.element.id, snapped.x, snapped.y);
      } else if (interaction.kind === "resize" && interaction.handle) {
        interaction.latestDeck = resizeCardElement(interaction.baseDeck, interaction.slideId, interaction.element.id, interaction.handle, dx, dy);
      } else {
        const startAngle = Math.atan2(interaction.startClientY - interaction.centerClientY, interaction.startClientX - interaction.centerClientX) * 180 / Math.PI;
        const nextAngle = Math.atan2(event.clientY - interaction.centerClientY, event.clientX - interaction.centerClientX) * 180 / Math.PI;
        interaction.latestDeck = rotateCardElement(interaction.baseDeck, interaction.slideId, interaction.element.id, interaction.element.rotation + nextAngle - startAngle, event.shiftKey);
        const rotated = interaction.latestDeck.slides.find((slide) => slide.id === interaction.slideId)?.elements.find((candidate) => candidate.id === interaction.element.id);
        setRotationPreview(rotated?.rotation ?? null);
      }
      setPreviewDeck(interaction.latestDeck);
    };
    const end = (event: PointerEvent) => {
      const interaction = interactionRef.current;
      if (!interaction || event.pointerId !== interaction.pointerId) return;
      interactionRef.current = null;
      setRotationPreview(null);
      if (interaction.latestDeck) commitRef.current(interaction.latestDeck);
      else setGuides([]);
    };
    window.addEventListener("pointermove", move);
    window.addEventListener("pointerup", end);
    window.addEventListener("pointercancel", end);
    return () => {
      window.removeEventListener("pointermove", move);
      window.removeEventListener("pointerup", end);
      window.removeEventListener("pointercancel", end);
    };
  }, []);

  useEffect(() => () => {
    if (textEditCommitTimerRef.current) clearTimeout(textEditCommitTimerRef.current);
    const pending = textEditPendingRef.current;
    if (pending) textEditFlushRef.current(pending.slideId, pending.elementId, pending.value);
    textEditPendingRef.current = null;
  }, []);

  const onKeyDown = (event: React.KeyboardEvent<HTMLDivElement>) => {
    if (!isCanvasShortcutTarget(event.target, stageRef.current)) return;
    if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === "z") {
      event.preventDefault();
      const nextHistory = event.shiftKey ? redoCardCommand(history) : undoCardCommand(history);
      setHistory(nextHistory);
      onDeckChange(nextHistory.present);
      return;
    }
    if (!activeSlide || !selected || selected.locked) return;
    if (event.key === "Enter" && selected.type === "text") {
      event.preventDefault();
      beginTextEdit(selected);
      return;
    }
    if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === "d") {
      event.preventDefault();
      duplicate(selected.id);
      return;
    }
    if (event.key === "Delete" || event.key === "Backspace") {
      event.preventDefault();
      deleteAndRestoreStageFocus(selected.id);
      return;
    }
    const delta = event.shiftKey ? 10 : 1;
    const movement = event.key === "ArrowLeft" ? [-delta, 0] : event.key === "ArrowRight" ? [delta, 0] : event.key === "ArrowUp" ? [0, -delta] : event.key === "ArrowDown" ? [0, delta] : null;
    if (movement) {
      event.preventDefault();
      apply((current) => nudgeCardElement(current, activeSlide.id, selected.id, movement[0], movement[1]));
    }
  };

  const add = (type: CardElementType, seed?: { assetId?: string; assetAlt?: string }) => {
    if (!activeSlide) return;
    const id = nextElementId(type);
    apply((current) => activeSlide.base.kind === "chat_bubble"
      ? addChatOverlayElement(current, activeSlide.id, type, { id, ...seed })
      : addCardElement(current, activeSlide.id, type, { id, ...seed }));
    setSelectedId(id);
  };

  const commitBubbleText = (bubbleId: string, text: string) => {
    if (!activeSlide) return;
    try {
      apply((current) => patchChatBubbleText(current, activeSlide.id, bubbleId, text));
      setBubbleEditError("");
    } catch (error) {
      setBubbleEditError(error instanceof RangeError && error.message === "CARD_CHAT_BUBBLE_TEXT_REQUIRED"
        ? "말풍선 내용은 비워 둘 수 없습니다."
        : "말풍선은 120자 안에서 입력해 주세요.");
    }
  };

  const runChatCommand = (command: (current: CardDeckV3) => CardDeckV3): CardDeckV3 | null => {
    try {
      const next = command(history.present);
      commit(next);
      setBubbleEditError("");
      return next;
    } catch (error) {
      const code = error instanceof RangeError ? error.message : "";
      const message = code === "CARD_CHAT_BUBBLE_MIN_ONE" ? "한 장에는 말풍선이 하나 이상 있어야 합니다."
        : code === "CARD_CHAT_BUBBLE_TOO_SHORT_TO_SPLIT" ? "두 글자 이상인 말풍선만 나눌 수 있습니다."
          : code === "CARD_CHAT_BUBBLE_NEXT_REQUIRED" ? "합칠 다음 말풍선이 없습니다."
            : code === "CARD_CHAT_BUBBLE_TEXT_TOO_LONG" ? "합친 말풍선은 120자를 넘을 수 없습니다."
              : code === "OPS_BOLD_EMPTY_RANGE" ? "굵게 만들 글을 먼저 선택해 주세요."
                : code === "OPS_BOLD_LIMIT" ? "한 장에 굵은 덩이는 하나만 둘 수 있습니다."
                  : code === "OPS_SLIDE_LIMIT" ? "카드는 11장을 넘을 수 없습니다."
                    : code === "OPS_SLIDE_MIN" ? "카드는 7장 아래로 줄일 수 없습니다."
                      : code === "CARD_CHAT_COMMENT_PROMPT_REQUIRED" ? "댓글 유도 장은 삭제하거나 역할을 바꿀 수 없습니다."
                        : code === "CARD_CHAT_SLIDE_MIN" ? "대화 장은 4장 아래로 줄일 수 없습니다."
                          : code === "CARD_CHAT_DECK_INVALID" ? "저장 계약을 깨는 변경이라 적용하지 않았습니다."
                          : code === "OPS_SLIDE_LOCKED" ? "표지·댓글 유도·마지막 장은 이동·복제·삭제할 수 없습니다."
                        : code === "OPS_BUBBLE_TARGET_LOCKED" ? "표지와 마지막 장에는 말풍선을 옮길 수 없습니다."
                          : "말풍선 편집을 적용하지 못했습니다.";
      setBubbleEditError(message);
      return null;
    }
  };

  const handleSceneOverflowChange = useCallback((overflow: boolean) => {
    setSceneOverflow(overflow);
    setSplitNotice(overflow ? "발행 장면 기준으로 대화가 넘칩니다. 버튼을 눌러 다음 장으로 나눠 주세요." : "");
  }, []);

  const splitOverflowToNextSlide = () => {
    if (activeSlide.base.kind !== "chat_bubble" || activeSlide.role !== "body" || !activeSlide.base.bubbles.length) return;
    const bubbles = activeSlide.base.bubbles;
    const next = bubbles.length > 1
      ? runChatCommand((current) => splitChatSlideAtBubble(current, activeSlide.id, Math.ceil(bubbles.length / 2)))
      : runChatCommand((current) => {
          const length = bubbles[0].segments.reduce((sum, segment) => sum + segment.text.length, 0);
          return splitChatSlideAtBubbleOffset(current, activeSlide.id, 0, Math.max(1, Math.floor(length / 2)));
        });
    if (next) {
      setActiveSlideId(next.slides[activeSlide.order + 1]?.id ?? activeSlide.id);
      setSceneOverflow(false);
      setSplitNotice("넘친 대화를 다음 장으로 나눴습니다.");
    }
  };

  const toneTargets = () => workingDeck.slides.flatMap((slide) => slide.base.kind === "chat_bubble"
    ? slide.base.bubbles.map((bubble) => ({
      slideId: slide.id,
      bubbleId: bubble.id,
      text: bubble.segments.map((segment) => segment.text).join(""),
    }))
    : []).filter((target) => toneScope === "all"
      || (target.slideId === activeSlide.id && (toneScope === "slide" || target.bubbleId === selectedBubbleId)));

  const requestToneSuggestions = async () => {
    const targets = toneTargets();
    if (!targets.length) {
      setToneError(toneScope === "one" ? "먼저 말풍선 하나를 골라 주세요." : "다듬을 말풍선이 없습니다.");
      return;
    }
    setToneBusy(true);
    setToneError("");
    try {
      const response = await fetch("/api/studio/commands", {
        method: "POST",
        headers: { "content-type": "application/json", ...authHeaders() },
        body: JSON.stringify({ action: "suggest_chat_tone", tone: toneId, lines: targets.map((target) => target.text) }),
      });
      const data = await response.json().catch(() => ({})) as { ok?: boolean; candidates?: ChatToneCandidate[]; error?: string };
      if (!response.ok || !data.ok || !isChatToneCandidateList(data.candidates, targets.length)) {
        throw new Error(data.error || "말투 후보를 만들지 못했습니다.");
      }
      setToneCandidates({ targets, candidates: data.candidates, revision: workingDeck.revision });
    } catch (error) {
      setToneError(error instanceof Error ? error.message : "말투 후보를 만들지 못했습니다.");
    } finally {
      setToneBusy(false);
    }
  };

  const applyToneCandidate = async (candidate: ChatToneCandidate) => {
    if (!toneCandidates || toneCandidates.revision !== workingDeck.revision) {
      setToneError("후보를 만든 뒤 대화가 바뀌었습니다. 다시 비교해 주세요.");
      return;
    }
    const next = toneCandidates.targets.reduce((current, target, index) => (
      patchChatBubbleText(current, target.slideId, target.bubbleId, candidate.lines[index])
    ), history.present);
    try {
      await assertChatSlidesRenderable(projectChatCardDeckV3ToRenderableV2(next, resolvedAssetUrls), toneCandidates.targets.map((target) => target.slideId));
    } catch (error) {
      setToneError(error instanceof Error ? error.message : "말투를 적용하면 카드가 넘칩니다.");
      return;
    }
    commit(next);
    setToneCandidates(null);
  };

  const uploadImage = async (file: File) => {
    setUploadError("");
    const body = new FormData();
    body.append("file", file);
    try {
      const response = await fetch("/api/images/upload", { method: "POST", headers: authHeaders(), body });
      const data = await response.json() as { filename?: string; url?: string; error?: string };
      if (!response.ok || !data.filename || !data.url) throw new Error(data.error || "사진을 올리지 못했습니다");
      rememberAssetUrl(data.filename, data.url);
      add("image", { assetId: data.filename, assetAlt: file.name });
    } catch (error) {
      setUploadError(error instanceof Error ? error.message : "사진을 올리지 못했습니다");
    }
  };

  const uploadProfileImage = async (file: File) => {
    setUploadError("");
    const body = new FormData();
    body.append("file", file);
    try {
      const response = await fetch("/api/images/upload", { method: "POST", headers: authHeaders(), body });
      const data = await response.json() as { filename?: string; url?: string; error?: string };
      if (!response.ok || !data.filename || !data.url) throw new Error(data.error || "프로필 사진을 올리지 못했습니다");
      rememberAssetUrl(data.filename, data.url);
      apply((current) => patchChatDeckBrand(current, { profile_image_asset_id: data.filename, profile_image_url: data.url }));
    } catch (error) {
      setUploadError(error instanceof Error ? error.message : "프로필 사진을 올리지 못했습니다");
    }
  };

  const uploadBackgroundImage = async (file: File) => {
    if (!activeSlide || (activeSlide.role !== "cover" && activeSlide.role !== "cta")) return;
    setUploadError("");
    const body = new FormData();
    body.append("file", file);
    try {
      const response = await fetch("/api/images/upload", { method: "POST", headers: authHeaders(), body });
      const data = await response.json() as { filename?: string; url?: string; error?: string };
      if (!response.ok || !data.filename || !data.url) throw new Error(data.error || "배경 사진을 올리지 못했습니다");
      rememberAssetUrl(data.filename, data.url);
      runChatCommand((current) => setChatSlideBackgroundImage(current, activeSlide.id, data.filename!));
    } catch (error) {
      setUploadError(error instanceof Error ? error.message : "배경 사진을 올리지 못했습니다");
    }
  };

  if (!activeSlide) return null;
  return (
    <section className={styles.editor} data-card-canvas-editor onKeyDown={onKeyDown} aria-label="카드 자유 배치 편집기">
      <div className={styles.addToolbar} role="toolbar" aria-label="카드 요소 추가">
        <Button size="sm" onClick={() => add("text")}>글 추가</Button>
        <Button size="sm" onClick={() => fileInputRef.current?.click()}>사진 추가</Button>
        <Button size="sm" onClick={() => add("shape")}>도형 추가</Button>
        <Button size="sm" onClick={() => add("sticker")}>스티커 추가</Button>
        <Button size="sm" onClick={() => add("logo")}>로고 추가</Button>
        <input ref={fileInputRef} className={styles.fileInput} type="file" accept="image/png,image/jpeg,image/webp,image/gif" aria-label="사진 파일" onChange={(event) => { const file = event.target.files?.[0]; if (file) void uploadImage(file); event.target.value = ""; }} />
        <input ref={backgroundInputRef} className={styles.fileInput} type="file" accept="image/png,image/jpeg,image/webp" aria-label="표지 또는 마지막 장 배경 사진 파일" onChange={(event) => { const file = event.target.files?.[0]; if (file) void uploadBackgroundImage(file); event.target.value = ""; }} />
        <span className={styles.toolbarDivider} aria-hidden="true" />
        <Button size="sm" disabled={history.past.length === 0} onClick={() => { const next = undoCardCommand(history); setHistory(next); onDeckChange(next.present); }}>실행 취소</Button>
        <Button size="sm" disabled={history.future.length === 0} onClick={() => { const next = redoCardCommand(history); setHistory(next); onDeckChange(next.present); }}>다시 실행</Button>
        {activeSlide.base.kind === "chat_bubble" ? <>
          <span className={styles.toolbarDivider} aria-hidden="true" />
          <Button size="sm" variant="secondary" onClick={() => runChatCommand((current) => swapChatSpeakers(current, activeSlide.id))}>이 장 화자 서로 바꾸기</Button>
          <Button size="sm" variant="secondary" onClick={() => runChatCommand((current) => swapChatSpeakers(current, null))}>덱 전체 화자 서로 바꾸기</Button>
          <Button size="sm" variant="secondary" onClick={() => setSpeakerEditorOpen((open) => !open)}>화자 이름·프로필</Button>
        </> : null}
      </div>
      {activeSlide.base.kind === "chat_bubble" ? <section className={styles.advancedToolbar} aria-label="카톡 대화 고급 편집 도구">
        {speakerEditorOpen ? <div className={styles.profileGrid}>
          <label>작성자 이름<input aria-label="작성자 이름" value={workingDeck.brand.display_name} onChange={(event) => runChatCommand((current) => patchChatDeckBrand(current, { display_name: event.target.value }))} /></label>
          <label>독자 이름<input aria-label="독자 이름" value={workingDeck.brand.reader_name ?? "구독자"} onChange={(event) => runChatCommand((current) => patchChatDeckBrand(current, { reader_name: event.target.value }))} /></label>
          <Button size="sm" variant="secondary" onClick={() => profileInputRef.current?.click()}>프로필 사진 바꾸기</Button>
          <input ref={profileInputRef} className={styles.fileInput} type="file" accept="image/png,image/jpeg,image/webp" aria-label="프로필 사진 파일" onChange={(event) => { const file = event.target.files?.[0]; if (file) void uploadProfileImage(file); event.target.value = ""; }} />
        </div> : null}
        <div className={styles.toneToolbar}>
          <label>범위<select aria-label="말투 다듬기 범위" value={toneScope} onChange={(event) => setToneScope(event.target.value as typeof toneScope)}><option value="one">고른 말풍선</option><option value="slide">이 장</option><option value="all">덱 전체</option></select></label>
          <label>말투<select aria-label="다듬을 말투" value={toneId} onChange={(event) => setToneId(event.target.value as ChatToneId)}>{CHAT_TONE_IDS.map((id) => <option key={id} value={id}>{id === "learned" ? "학습 정보 말투" : id === "warm" ? "더 친근하게" : id === "short" ? "더 짧게" : "반말↔존댓말"}</option>)}</select></label>
          <Button size="sm" onClick={() => void requestToneSuggestions()} disabled={toneBusy}>{toneBusy ? "후보 만드는 중" : "후보 3개 비교"}</Button>
        </div>
        {toneError ? <p role="alert" className={styles.error}>{toneError}</p> : null}
        {toneCandidates ? <div className={styles.toneCandidates} role="dialog" aria-label="말투 다듬기 비교">{toneCandidates.candidates.map((candidate) => <article key={candidate.id} data-tone-candidate={candidate.id}><b>{candidate.label}</b><p>{candidate.lines.join("\n")}</p><Button size="sm" onClick={() => void applyToneCandidate(candidate)}>이 후보 적용</Button></article>)}</div> : null}
      </section> : null}
      {splitNotice ? <p role="status" className={styles.error}>{splitNotice}</p> : null}
      {uploadError ? <p role="alert" className={styles.error}>{uploadError}</p> : null}
      <CardTemplateGallery
        mode="edit"
        selectedId={pendingTemplateId}
        onSelect={setPendingTemplateId}
        disabledReasons={history.present.template === "plain" ? { chat_bubble: "카톡 대화는 생성실의 기존 카톡 덱 만들기에서 선택해 주세요." } : undefined}
        beforeDeck={history.present}
        afterDeck={templatePreviewDeck}
        scope={templateScope}
        canApplySlide={history.present.template !== "chat_bubble"}
        previousTemplateName={previousTemplate ? cardTemplateName(previousTemplate.id) : null}
        onScopeChange={setTemplateScope}
        onApply={applyTemplate}
        onRestore={restorePreviousTemplate}
      />
      <div className={styles.workspace}>
        <nav className={styles.slideStrip} aria-label="카드 장 목록">
          {workingDeck.slides.map((slide) => <Button key={slide.id} size="sm" aria-pressed={slide.id === activeSlide.id} onClick={() => { setActiveSlideId(slide.id); setSelectedId(null); }}>{slide.order + 1}장</Button>)}
        </nav>
        <div className={styles.stageColumn} data-card-stage-column>
          {activeSlide.base.kind === "chat_bubble" ? <div className={styles.bubbleActions} role="toolbar" aria-label="카톡 장 편집 도구">
            <Button size="sm" variant="secondary" disabled={activeSlide.role === "cta"} onClick={() => {
              const next = runChatCommand((current) => addChatSlide(current, activeSlide.id));
              if (next) setActiveSlideId(next.slides[activeSlide.order + 1]?.id ?? activeSlide.id);
            }}>새 장 추가</Button>
            <Button size="sm" variant="secondary" disabled={activeSlide.role !== "body"} onClick={() => {
              const next = runChatCommand((current) => duplicateChatSlide(current, activeSlide.id));
              if (next) setActiveSlideId(next.slides[activeSlide.order + 1]?.id ?? activeSlide.id);
            }}>이 장 복제</Button>
            <Button size="sm" variant="secondary" disabled={activeSlide.role !== "body" || workingDeck.slides[activeSlide.order - 1]?.role !== "body"} onClick={() => runChatCommand((current) => moveChatSlide(current, activeSlide.id, -1))}>장 앞으로</Button>
            <Button size="sm" variant="secondary" disabled={activeSlide.role !== "body" || workingDeck.slides[activeSlide.order + 1]?.role !== "body"} onClick={() => runChatCommand((current) => moveChatSlide(current, activeSlide.id, 1))}>장 뒤로</Button>
            <Button size="sm" variant="secondary" disabled={activeSlide.role !== "body"} onClick={() => {
              const fallback = workingDeck.slides[activeSlide.order - 1]?.id ?? workingDeck.slides[0]?.id;
              const next = runChatCommand((current) => deleteChatSlide(current, activeSlide.id));
              if (next && fallback) setActiveSlideId(fallback);
            }}>이 장 삭제</Button>
            {(activeSlide.role === "cover" || activeSlide.role === "cta") ? <Button size="sm" variant="secondary" onClick={() => backgroundInputRef.current?.click()}>배경 사진 고르기</Button> : null}
            {(activeSlide.role === "cover" || activeSlide.role === "cta") && activeSlide.background.kind === "image" ? <Button size="sm" variant="secondary" onClick={() => runChatCommand((current) => clearChatSlideBackgroundImage(current, activeSlide.id))}>사진 빼기</Button> : null}
          </div> : null}
          {toolbarElement ? (
            <div className={styles.toolbarSlot} data-placeholder={selected ? "false" : "true"}>
              <CardElementToolbar
                element={toolbarElement}
                onTextChange={(patch) => apply((current) => patchTextElement(current, activeSlide.id, toolbarElement.id, patch))}
                onGeometryChange={(patch) => apply((current) => setCardElementGeometry(current, activeSlide.id, toolbarElement.id, patch))}
                onLayer={(direction) => apply((current) => moveCardElementLayer(current, activeSlide.id, toolbarElement.id, direction))}
                onDuplicate={() => duplicate(toolbarElement.id)}
                onDelete={() => deleteAndRestoreStageFocus(toolbarElement.id)}
              />
            </div>
          ) : null}
          <div
            ref={stageRef}
            className={styles.stage}
            data-card-stage
            tabIndex={0}
            aria-label="카드 편집 스테이지"
            onPointerDownCapture={(event) => {
              const target = event.target instanceof HTMLElement ? event.target.closest<HTMLElement>("[data-element-selection]") : null;
              const elementId = target?.dataset.elementSelection;
              const element = elementId ? editableElements.find((candidate) => candidate.id === elementId) : null;
              if (!element || element.type !== "text" || element.locked) {
                lastTextPointerDownRef.current = null;
                return;
              }
              // selection overlay는 첫 클릭의 선택 상태 변경으로 교체될 수 있다. dblclick을
              // 자식에게만 걸면 두 번째 click이 새 DOM으로 가며 이벤트가 사라지므로,
              // 교체되지 않는 stage의 capture 단계에서 같은 요소의 연속 누름을 판정한다.
              const now = performance.now();
              const previous = lastTextPointerDownRef.current;
              lastTextPointerDownRef.current = { elementId: element.id, at: now };
              if (previous && previous.elementId === element.id && now - previous.at <= 500) {
                lastTextPointerDownRef.current = null;
                event.preventDefault();
                event.stopPropagation();
                beginTextEdit(element);
              }
            }}
            onPointerDown={() => { setSelectedId(null); setEditingTextId(null); }}
          >
            <CardSlideScene model={model} renderMode="editor" onChatOverflowChange={handleSceneOverflowChange} />
            {editableElements.filter((element) => !element.hidden).map((element) => (
              <div
                key={element.id}
                className={styles.selectionBox}
                data-element-selection={element.id}
                data-selected={selectedId === element.id}
                data-locked={element.locked}
                style={elementOverlayStyle(element, logicalHeight)}
                tabIndex={0}
                aria-label={`${element.name} 요소`}
                onFocus={() => setSelectedId(element.id)}
                onDoubleClick={(event) => {
                  if (element.type !== "text" || element.locked) return;
                  event.stopPropagation();
                  beginTextEdit(element);
                }}
                onClick={(event) => {
                  if (event.detail < 2 || element.type !== "text" || element.locked) return;
                  event.preventDefault();
                  event.stopPropagation();
                  beginTextEdit(element);
                }}
                onPointerDown={(event) => {
                  if (editingTextId === element.id) return;
                  beginInteraction(event, element, "move");
                }}
              >
                {editingTextId === element.id && element.type === "text" ? (
                  <textarea
                    ref={textEditorRef}
                    className={styles.directTextEditor}
                    aria-label="글 내용 직접 편집"
                    value={editingTextValue}
                    onPointerDown={(event) => event.stopPropagation()}
                    onChange={(event) => {
                      const value = event.target.value;
                      setEditingTextValue(value);
                      textEditPendingRef.current = { slideId: activeSlide.id, elementId: element.id, value };
                      const baseDeck = textEditBaseDeckRef.current ?? history.present;
                      setPreviewDeck(patchTextElement(baseDeck, activeSlide.id, element.id, { text: value }));
                      if (textEditCommitTimerRef.current) clearTimeout(textEditCommitTimerRef.current);
                      textEditCommitTimerRef.current = setTimeout(() => {
                        textEditCommitTimerRef.current = null;
                        flushTextEdit(activeSlide.id, element.id, value);
                      }, 250);
                    }}
                    onBlur={() => {
                      if (textEditCommitTimerRef.current) {
                        clearTimeout(textEditCommitTimerRef.current);
                        textEditCommitTimerRef.current = null;
                      }
                      flushTextEdit(activeSlide.id, element.id, editingTextValue);
                      textEditPendingRef.current = null;
                      textEditBaseDeckRef.current = null;
                      textEditCommittedRef.current = false;
                      textEditLastCommittedValueRef.current = null;
                      setEditingTextId(null);
                    }}
                  />
                ) : null}
                {selectedId === element.id && !element.locked ? <>
                  {RESIZE_HANDLES.map((handle) => <Button key={handle} size="sm" className={styles.resizeHandle} data-handle={handle} aria-label={`${handle} 크기 조절`} onPointerDown={(event) => beginInteraction(event, element, "resize", handle)} />)}
                  <Button size="sm" className={styles.rotationHandle} aria-label="회전" onPointerDown={(event) => beginInteraction(event, element, "rotate")} />
                  {rotationPreview !== null ? <span className={styles.rotationBadge} aria-live="polite">{rotationPreview}°</span> : null}
                </> : null}
              </div>
            ))}
            {guides.map((guide, index) => <span key={`${guide.axis}-${guide.value}-${index}`} className={styles.snapGuide} data-axis={guide.axis} style={{ "--snap-position": `${guide.value / (guide.axis === "x" ? 1080 : logicalHeight) * 100}%` } as CSSProperties} />)}
          </div>
        </div>
        <aside className={styles.rightPanel} data-card-right-panel>
          {activeSlide.base.kind === "chat_bubble" && activeSlide.role === "cover" ? (
            <section className={styles.chatBaseEditor} aria-label="표지 문구 편집">
              <h3>표지 문구</h3>
              <label>제목<input aria-label="표지 제목" value={activeSlide.base.cover?.headline ?? ""} onChange={(event) => runChatCommand((current) => patchChatSlideCover(current, activeSlide.id, { headline: event.target.value, sub: activeSlide.base.kind === "chat_bubble" ? activeSlide.base.cover?.sub ?? null : null }))} /></label>
              <label>부제<input aria-label="표지 부제" value={activeSlide.base.cover?.sub ?? ""} onChange={(event) => runChatCommand((current) => patchChatSlideCover(current, activeSlide.id, { headline: activeSlide.base.kind === "chat_bubble" ? activeSlide.base.cover?.headline ?? "" : "", sub: event.target.value || null }))} /></label>
            </section>
          ) : null}
          {activeSlide.base.kind === "chat_bubble" && activeSlide.base.bubbles.length ? (
            <section className={styles.chatBaseEditor} aria-label="말풍선 직접 편집">
              <h3>말풍선 직접 편집</h3>
              <p>말풍선과 로고·스티커를 이 화면에서 함께 고칩니다.</p>
              {activeSlide.base.bubbles.map((bubble, index) => {
                const text = bubble.segments.map((segment) => segment.text).join("");
                const speaker = bubble.speaker === "brand"
                  ? workingDeck.brand.display_name
                  : workingDeck.brand.reader_name?.trim() || "구독자";
                return (
                  <article key={`${bubble.id}:${text}`} className={styles.bubbleCard} data-chat-bubble-id={bubble.id} data-selected={selectedBubbleId === bubble.id}>
                    <label>
                    <span>{speaker} · {index + 1}번째</span>
                    <textarea
                      aria-label={`${index + 1}번째 말풍선 내용`}
                      defaultValue={text}
                      maxLength={120}
                      onBlur={(event) => commitBubbleText(bubble.id, event.target.value)}
                      onFocus={() => setSelectedBubbleId(bubble.id)}
                      onSelect={(event) => setSelectedBubbleRange({ bubbleId: bubble.id, from: event.currentTarget.selectionStart, to: event.currentTarget.selectionEnd })}
                    />
                    </label>
                    <div className={styles.bubbleActions}>
                      <Button size="sm" variant="secondary" onClick={() => runChatCommand((current) => toggleChatBubbleSpeaker(current, activeSlide.id, bubble.id))}>화자 바꾸기</Button>
                      <Button size="sm" variant="secondary" onClick={() => runChatCommand((current) => toggleChatBubbleBold(current, activeSlide.id, bubble.id))}>전체 굵게</Button>
                      <Button size="sm" variant="secondary" onMouseDown={(event) => event.preventDefault()} onClick={() => runChatCommand((current) => toggleChatBubbleBoldRange(current, activeSlide.id, bubble.id, selectedBubbleRange?.bubbleId === bubble.id ? { from: selectedBubbleRange.from, to: selectedBubbleRange.to } : { from: 0, to: 0 }))}>선택 굵게</Button>
                      <Button size="sm" variant="secondary" onClick={() => runChatCommand((current) => toggleChatBubbleReaction(current, activeSlide.id, bubble.id))}>하트</Button>
                      <Button size="sm" variant="secondary" disabled={index === 0} onClick={() => runChatCommand((current) => moveChatBubble(current, activeSlide.id, bubble.id, -1))}>위로</Button>
                      <Button size="sm" variant="secondary" disabled={index === (activeSlide.base.kind === "chat_bubble" ? activeSlide.base.bubbles.length : 0) - 1} onClick={() => runChatCommand((current) => moveChatBubble(current, activeSlide.id, bubble.id, 1))}>아래로</Button>
                      <Button size="sm" variant="secondary" onClick={() => runChatCommand((current) => splitChatBubble(current, activeSlide.id, bubble.id))}>둘로 나누기</Button>
                      <Button size="sm" variant="secondary" disabled={index === (activeSlide.base.kind === "chat_bubble" ? activeSlide.base.bubbles.length : 0) - 1} onClick={() => runChatCommand((current) => mergeChatBubbleWithNext(current, activeSlide.id, bubble.id))}>다음과 합치기</Button>
                      {workingDeck.slides.filter((slide) => slide.id !== activeSlide.id && slide.role === "body" && slide.base.kind === "chat_bubble").map((slide) => <Button key={slide.id} size="sm" variant="secondary" onClick={() => runChatCommand((current) => moveChatBubbleToSlide(current, activeSlide.id, bubble.id, slide.id))}>{slide.order + 1}장으로</Button>)}
                      <Button size="sm" variant="secondary" onClick={() => runChatCommand((current) => deleteChatBubble(current, activeSlide.id, bubble.id))}>삭제</Button>
                    </div>
                  </article>
                );
              })}
              <Button size="sm" onClick={() => runChatCommand((current) => addChatBubble(current, activeSlide.id))}>말풍선 추가</Button>
              {activeSlide.role === "body" && (sceneOverflow || activeSlide.base.bubbles.length > 1) ? <Button size="sm" variant="secondary" onClick={splitOverflowToNextSlide}>넘침을 다음 장으로 나누기</Button> : null}
              {bubbleEditError ? <p role="alert" className={styles.error}>{bubbleEditError}</p> : null}
            </section>
          ) : null}
          <CardElementList
            elements={editableElements}
            selectedId={selectedId}
            onSelect={setSelectedId}
            onMove={(id, dx, dy) => apply((current) => nudgeCardElement(current, activeSlide.id, id, dx, dy))}
            onLayer={(id, direction: LayerDirection) => apply((current) => moveCardElementLayer(current, activeSlide.id, id, direction))}
            onToggle={(id, flag) => apply((current) => toggleCardElementFlag(current, activeSlide.id, id, flag))}
            onDuplicate={duplicate}
            onDelete={deleteAndRestoreStageFocus}
          />
        </aside>
      </div>
    </section>
  );
}
