"use client";

import { useCallback, useEffect, useMemo, useRef, useState, type CSSProperties, type PointerEvent as ReactPointerEvent } from "react";
import { Button } from "@/components/shared/Button";
import { authHeaders } from "@/lib/auth";
import type { CardDeckV3, CardElement, CardElementType } from "@/lib/studio/card-element-contract";
import {
  addCardElement,
  commitCardCommand,
  createCardCommandHistory,
  deleteCardElement,
  duplicateCardElement,
  moveCardElement,
  moveCardElementLayer,
  nudgeCardElement,
  patchTextElement,
  redoCardCommand,
  resizeCardElement,
  rotateCardElement,
  setCardElementGeometry,
  snapCardElementPosition,
  toggleCardElementFlag,
  undoCardCommand,
  type CardCommandHistory,
  type LayerDirection,
  type ResizeHandle,
  type SnapGuide,
} from "@/lib/studio/card-element-commands";
import { cardSlideRenderModel } from "@/lib/studio/card-render-model";
import { CardElementList } from "./CardElementList";
import { CardElementToolbar } from "./CardElementToolbar";
import { CardSlideScene } from "./CardSlideScene";
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
  assetUrls?: Record<string, string>;
  onDeckChange: (deck: CardDeckV3) => void;
}

export function CardCanvasEditor({ deck, assetUrls = {}, onDeckChange }: CardCanvasEditorProps) {
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
  const stageRef = useRef<HTMLDivElement | null>(null);
  const interactionRef = useRef<Interaction | null>(null);
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const lastExternalDeckRef = useRef(deck);
  const commitRef = useRef<(next: CardDeckV3) => void>(() => {});
  const textEditorRef = useRef<HTMLTextAreaElement | null>(null);
  const textEditBaseDeckRef = useRef<CardDeckV3 | null>(null);
  const textEditCommitTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const textEditPendingRef = useRef<{ slideId: string; elementId: string; value: string } | null>(null);
  const textEditFlushRef = useRef<(slideId: string, elementId: string, value: string) => void>(() => {});
  const textEditCommittedRef = useRef(false);
  const textEditLastCommittedValueRef = useRef<string | null>(null);
  const workingDeck = previewDeck ?? history.present;
  const activeSlide = workingDeck.slides.find((slide) => slide.id === activeSlideId) ?? workingDeck.slides[0];
  const logicalHeight = workingDeck.ratio === "4:5" ? 1350 : 1080;
  const selected = activeSlide?.elements.find((element) => element.id === selectedId) ?? null;
  const model = useMemo(() => cardSlideRenderModel(workingDeck, activeSlideId, { ...assetUrls, ...localAssetUrls }), [workingDeck, activeSlideId, assetUrls, localAssetUrls]);

  useEffect(() => {
    // 최신본 불러오기와 충돌 복구는 같은 revision 안에서도 내용을 통째로 바꿀 수 있다.
    // id/revision만 비교하면 editor history가 옛 덱을 계속 그려 서버 최신본이 화면에 안 뜬다.
    if (deck === lastExternalDeckRef.current) return;
    lastExternalDeckRef.current = deck;
    if (JSON.stringify(deck) === JSON.stringify(history.present)) return;
    setHistory(createCardCommandHistory(deck));
    setPreviewDeck(null);
  }, [deck, history.present]);

  const commit = useCallback((next: CardDeckV3) => {
    setHistory((current) => commitCardCommand(current, next));
    setPreviewDeck(null);
    setGuides([]);
    onDeckChange(next);
  }, [onDeckChange]);
  commitRef.current = commit;

  useEffect(() => {
    if (editingTextId) textEditorRef.current?.focus();
  }, [editingTextId]);

  const apply = useCallback((command: (current: CardDeckV3) => CardDeckV3) => commit(command(history.present)), [commit, history.present]);
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
    const source = activeSlide?.elements.find((element) => element.id === elementId);
    if (!source || !activeSlide) return;
    const id = nextElementId(source.type);
    apply((current) => duplicateCardElement(current, activeSlide.id, elementId, id));
    setSelectedId(id);
  }, [activeSlide, apply]);

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
      siblings: activeSlide.elements,
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
    apply((current) => addCardElement(current, activeSlide.id, type, { id, ...seed }));
    setSelectedId(id);
  };

  const uploadImage = async (file: File) => {
    setUploadError("");
    const body = new FormData();
    body.append("file", file);
    try {
      const response = await fetch("/api/images/upload", { method: "POST", headers: authHeaders(), body });
      const data = await response.json() as { filename?: string; url?: string; error?: string };
      if (!response.ok || !data.filename || !data.url) throw new Error(data.error || "사진을 올리지 못했습니다");
      setLocalAssetUrls((current) => ({ ...current, [data.filename!]: data.url! }));
      add("image", { assetId: data.filename, assetAlt: file.name });
    } catch (error) {
      setUploadError(error instanceof Error ? error.message : "사진을 올리지 못했습니다");
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
        <span className={styles.toolbarDivider} aria-hidden="true" />
        <Button size="sm" disabled={history.past.length === 0} onClick={() => { const next = undoCardCommand(history); setHistory(next); onDeckChange(next.present); }}>실행 취소</Button>
        <Button size="sm" disabled={history.future.length === 0} onClick={() => { const next = redoCardCommand(history); setHistory(next); onDeckChange(next.present); }}>다시 실행</Button>
      </div>
      {uploadError ? <p role="alert" className={styles.error}>{uploadError}</p> : null}
      <div className={styles.workspace}>
        <nav className={styles.slideStrip} aria-label="카드 장 목록">
          {workingDeck.slides.map((slide) => <Button key={slide.id} size="sm" aria-pressed={slide.id === activeSlide.id} onClick={() => { setActiveSlideId(slide.id); setSelectedId(null); }}>{slide.order + 1}장</Button>)}
        </nav>
        <div className={styles.stageColumn}>
          {selected ? <CardElementToolbar element={selected} onTextChange={(patch) => apply((current) => patchTextElement(current, activeSlide.id, selected.id, patch))} onGeometryChange={(patch) => apply((current) => setCardElementGeometry(current, activeSlide.id, selected.id, patch))} onLayer={(direction) => apply((current) => moveCardElementLayer(current, activeSlide.id, selected.id, direction))} onDuplicate={() => duplicate(selected.id)} onDelete={() => deleteAndRestoreStageFocus(selected.id)} /> : null}
          <div ref={stageRef} className={styles.stage} data-card-stage tabIndex={0} aria-label="카드 편집 스테이지" onPointerDown={() => { setSelectedId(null); setEditingTextId(null); }}>
            <CardSlideScene model={model} renderMode="editor" />
            {activeSlide.elements.filter((element) => !element.hidden).map((element) => (
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
        <CardElementList
          elements={activeSlide.elements}
          selectedId={selectedId}
          onSelect={setSelectedId}
          onMove={(id, dx, dy) => apply((current) => nudgeCardElement(current, activeSlide.id, id, dx, dy))}
          onLayer={(id, direction: LayerDirection) => apply((current) => moveCardElementLayer(current, activeSlide.id, id, direction))}
          onToggle={(id, flag) => apply((current) => toggleCardElementFlag(current, activeSlide.id, id, flag))}
          onDuplicate={duplicate}
          onDelete={deleteAndRestoreStageFocus}
        />
      </div>
    </section>
  );
}
