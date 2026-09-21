"use client";

/**
 * 편집실 말풍선 편집 UI (설계 §5 F4, PR4).
 *
 * "직접 편집 기본, AI는 보조"(D-2026-09-09-1) — 이 컴포넌트는 순수 직접 편집 도구다.
 * 모든 상태 변화는 `card-deck-ops.ts` 의 순수 함수만 거친다(직접 상태 조작 금지, 세션맥락).
 * 실패는 `CardDeckOpsError(code, message)` 로 이유를 데리고 나오므로, 그 이유를 그대로
 * 화면에 문구로 보여준다(조용한 실패 금지).
 */
import { useEffect, useMemo, useRef, useState } from "react";
import { Button } from "@/components/shared/Button";
import type { Bubble, CardDeck, CardSlide } from "@/lib/studio/card-deck-contract";
import {
  CardDeckOpsError,
  addBubble,
  addSlide,
  deleteBubble,
  deleteSlide,
  groupTurns,
  mergeBubble,
  moveBubble,
  moveSlide,
  splitBubble,
  toggleBold,
  toggleSpeaker,
} from "@/lib/studio/card-deck-ops";
import { renderChatBubbleSlideToCanvas } from "@/lib/studio/card-templates/chat-bubble";

const SLIDE_ROLE_LABEL: Record<CardSlide["role"], string> = {
  cover: "표지",
  chat: "대화",
  comment_prompt: "댓글유도",
  cta: "CTA",
};

/**
 * 4역할 배지 색(세션맥락 과제 ③). `card-deck-contract.ts` 의 `SlideRole` 이 이미
 * 표지=0번·CTA=마지막·댓글유도=CTA 바로 앞 한 장이라는 순서 불변식을 `validateCardDeck`
 * 으로 강제하므로, 배지는 그 필드를 그대로 읽을 뿐 인덱스로 역할을 추정하지 않는다.
 */
const SLIDE_ROLE_BADGE_CLASS: Record<CardSlide["role"], string> = {
  cover: "border-accent/40 bg-accent-soft text-accent",
  chat: "border-border bg-surface-2 text-muted",
  comment_prompt: "border-warning/40 bg-warning/10 text-warning",
  cta: "border-success/40 bg-success/10 text-success",
};

export interface BubbleEditorProps {
  deck: CardDeck;
  slideId: string;
  onDeckChange: (deck: CardDeck) => void;
}

function bubbleText(bubble: Bubble): string {
  return bubble.segments.map((s) => s.text).join("");
}

/** 편집실 카드 탭: 선택된 장(chat/comment_prompt/cta)의 말풍선을 직접 편집한다. */
export function BubbleEditor({ deck, slideId, onDeckChange }: BubbleEditorProps) {
  const [error, setError] = useState<string | null>(null);
  const [selectedBubbleId, setSelectedBubbleId] = useState<string | null>(null);
  const textareaRefs = useRef<Record<string, HTMLTextAreaElement | null>>({});

  const slide = deck.slides.find((s) => s.id === slideId) ?? null;
  const bubbles = slide?.bubbles ?? [];
  const turns = useMemo(() => groupTurns(bubbles), [bubbles]);

  function run(op: (deck: CardDeck) => CardDeck) {
    try {
      setError(null);
      onDeckChange(op(deck));
    } catch (cause) {
      if (cause instanceof CardDeckOpsError) {
        setError(cause.message);
      } else {
        setError("말풍선을 바꾸지 못했습니다. 잠시 후 다시 시도해 주세요.");
      }
    }
  }

  if (!slide) {
    return <p className="text-caption text-danger" data-bubble-editor-missing-slide>이 장을 찾지 못했습니다.</p>;
  }
  if (slide.role === "cover") {
    return <CoverEditor slide={slide} onChange={(cover) => run((d) => ({
      ...d,
      slides: d.slides.map((s) => (s.id === slide.id ? { ...s, cover } : s)),
      revision: d.revision + 1,
    }))} />;
  }

  const currentSlideId = slide.id;

  function updateBubbleText(bubbleId: string, text: string) {
    // 텍스트 직접 편집은 연산이 아니라 상태 대입이지만, segments 구조를 지키기 위해
    // 첫 세그먼트만 교체하는 단일-세그먼트 편집으로 제한한다(볼드 범위는 toggleBold 로만).
    run((d) => ({
      ...d,
      slides: d.slides.map((s) => {
        if (s.id !== currentSlideId) return s;
        return {
          ...s,
          bubbles: (s.bubbles ?? []).map((b) =>
            b.id === bubbleId ? { ...b, segments: [{ text, bold: b.segments[0]?.bold ?? false }] } : b,
          ),
        };
      }),
      revision: d.revision + 1,
    }));
  }

  function handleToggleBold(bubble: Bubble) {
    const el = textareaRefs.current[bubble.id];
    const from = el?.selectionStart ?? 0;
    const to = el?.selectionEnd ?? bubbleText(bubble).length;
    if (from === to) {
      setError("굵게 만들 글을 먼저 선택해 주세요.");
      return;
    }
    run((d) => toggleBold(d, currentSlideId, bubble.id, { from, to }));
  }

  return (
    <div className="space-y-stack" data-bubble-editor data-bubble-editor-slide-role={slide.role}>
      <div className="flex items-center justify-between">
        <b className="text-caption font-semibold text-text">{SLIDE_ROLE_LABEL[slide.role]} 장 · 말풍선 {bubbles.length}개</b>
        <Button size="sm" onClick={() => run((d) => addBubble(d, slide.id, selectedBubbleId))}>말풍선 추가</Button>
      </div>
      {error ? <p role="alert" className="rounded-control border border-danger/30 bg-danger/10 p-stack text-caption text-danger" data-bubble-editor-error>{error}</p> : null}
      <ul className="space-y-stack-tight" data-bubble-editor-turns>
        {turns.map((turn, turnIndex) => (
          <li key={turnIndex} className={turn.speaker === "reader" ? "flex justify-end" : "flex justify-start"}>
            <ul className="max-w-[80%] space-y-stack-tight">
              {turn.bubbles.map((bubble) => (
                <li
                  key={bubble.id}
                  data-bubble-id={bubble.id}
                  data-bubble-speaker={bubble.speaker}
                  className={`rounded-surface border p-stack ${bubble.speaker === "reader" ? "border-transparent bg-[#FEE500]" : "border-border bg-surface"}`}
                  onClick={() => setSelectedBubbleId(bubble.id)}
                >
                  <textarea
                    ref={(el) => { textareaRefs.current[bubble.id] = el; }}
                    value={bubbleText(bubble)}
                    onChange={(event) => updateBubbleText(bubble.id, event.target.value)}
                    onFocus={() => setSelectedBubbleId(bubble.id)}
                    aria-label="말풍선 내용"
                    className="w-full resize-none bg-transparent text-body text-text"
                    rows={2}
                  />
                  <div className="mt-stack-tight flex flex-wrap gap-stack-tight" data-bubble-controls>
                    <Button size="sm" onClick={() => handleToggleBold(bubble)}>굵게</Button>
                    <Button size="sm" onClick={() => run((d) => toggleSpeaker(d, slide.id, bubble.id))}>화자 전환</Button>
                    <Button size="sm" onClick={() => run((d) => moveBubble(d, slide.id, bubble.id, -1))}>▲</Button>
                    <Button size="sm" onClick={() => run((d) => moveBubble(d, slide.id, bubble.id, 1))}>▼</Button>
                    <Button size="sm" onClick={() => {
                      const el = textareaRefs.current[bubble.id];
                      const at = el?.selectionStart ?? bubbleText(bubble).length;
                      run((d) => splitBubble(d, slide.id, bubble.id, { segmentIndex: 0, offset: at }));
                    }}>쪼개기</Button>
                    <Button size="sm" onClick={() => run((d) => mergeBubble(d, slide.id, bubble.id))}>합치기</Button>
                    <Button size="sm" variant="secondary" onClick={() => run((d) => deleteBubble(d, slide.id, bubble.id))}>삭제</Button>
                  </div>
                </li>
              ))}
            </ul>
          </li>
        ))}
      </ul>
      {slide.role === "cta" ? <CtaEditor deck={deck} onChange={(cta) => run((d) => ({ ...d, cta, revision: d.revision + 1 }))} /> : null}
    </div>
  );
}

function CoverEditor({ slide, onChange }: { slide: CardSlide; onChange: (cover: NonNullable<CardSlide["cover"]>) => void }) {
  const cover = slide.cover ?? { headline: "", sub: null };
  return (
    <div className="space-y-stack" data-bubble-editor-cover>
      <label className="block text-caption text-muted">표지 헤드라인 (3줄 이내, 줄당 10자)
        <textarea
          value={cover.headline}
          onChange={(event) => onChange({ ...cover, headline: event.target.value })}
          className="mt-stack-tight w-full rounded-control border border-border bg-surface-2 p-stack text-body text-text"
          rows={3}
        />
      </label>
      <label className="block text-caption text-muted">보조 문구
        <input
          value={cover.sub ?? ""}
          onChange={(event) => onChange({ ...cover, sub: event.target.value || null })}
          className="mt-stack-tight w-full rounded-control border border-border bg-surface-2 p-stack text-body text-text"
        />
      </label>
    </div>
  );
}

/**
 * 편집실 카드 탭 전체 패널: 좌 9장 목록(역할 배지) · 중 실시간 캔버스 미리보기 ·
 * 우/하 BubbleEditor. `EditRoom` 이 `cardDeck` 을 받았을 때 기존 EditOutline/EditPreview
 * 대신 이 패널을 그린다(F4). 03c 직접 편집 우선 정책(D-2026-09-09-1) — AI 자동 배치는
 * 여기서 다루지 않는다.
 */
export function CardDeckPanel({ deck, onDeckChange }: { deck: CardDeck; onDeckChange: (deck: CardDeck) => void }) {
  const [activeSlideId, setActiveSlideId] = useState(deck.slides[0]?.id ?? "");
  const [slideError, setSlideError] = useState<string | null>(null);
  const canvasHostRef = useRef<HTMLDivElement | null>(null);
  const activeIndex = deck.slides.findIndex((s) => s.id === activeSlideId);
  const activeSlide = activeIndex >= 0 ? deck.slides[activeIndex] : deck.slides[0];

  useEffect(() => {
    if (!deck.slides.find((s) => s.id === activeSlideId)) {
      setActiveSlideId(deck.slides[0]?.id ?? "");
    }
  }, [deck.slides, activeSlideId]);

  useEffect(() => {
    const host = canvasHostRef.current;
    if (!host || !activeSlide) return;
    // 300ms 디바운스(설계 §5 F4). 연산마다 즉시 다시 그리면 타이핑 중 캔버스가 계속
    // 깜빡인다.
    const timer = setTimeout(() => {
      host.innerHTML = "";
      try {
        const canvas = renderChatBubbleSlideToCanvas({
          deck,
          slide: activeSlide,
          index: deck.slides.findIndex((s) => s.id === activeSlide.id),
          total: deck.slides.length,
        });
        if (canvas) {
          canvas.style.width = "100%";
          canvas.style.height = "auto";
          canvas.style.borderRadius = "var(--radius-surface, 12px)";
          host.appendChild(canvas);
        }
      } catch (cause) {
        const p = document.createElement("p");
        p.className = "text-caption text-danger";
        p.textContent = cause instanceof Error ? cause.message : "미리보기를 그리지 못했습니다.";
        host.appendChild(p);
      }
    }, 300);
    return () => clearTimeout(timer);
  }, [deck, activeSlide]);

  function runSlide(op: (deck: CardDeck) => CardDeck) {
    try {
      setSlideError(null);
      onDeckChange(op(deck));
    } catch (cause) {
      setSlideError(cause instanceof CardDeckOpsError ? cause.message : "장을 바꾸지 못했습니다.");
    }
  }

  return (
    <div className="grid min-w-0 gap-pad-inset lg:grid-cols-[14rem_minmax(0,1fr)_18rem]" data-card-deck-panel>
      <nav aria-label="카드 목록" className="min-w-0 space-y-stack-tight" data-card-deck-slide-list>
        {deck.slides.map((slide, index) => {
          const locked = slide.role === "cover" || slide.role === "cta";
          return (
            <div key={slide.id} className="space-y-stack-tight">
              <button
                type="button"
                onClick={() => setActiveSlideId(slide.id)}
                aria-pressed={slide.id === activeSlideId}
                data-slide-id={slide.id}
                data-slide-role={slide.role}
                className={`flex w-full items-center justify-between rounded-control border p-stack text-left text-caption ${slide.id === activeSlideId ? "border-accent bg-accent-soft" : "border-border bg-surface"}`}
              >
                <span className="flex items-center gap-stack-tight">
                  <span>{index + 1}.</span>
                  <span
                    data-slide-role-badge={slide.role}
                    className={`rounded-chip border px-micro text-caption font-semibold ${SLIDE_ROLE_BADGE_CLASS[slide.role]}`}
                  >
                    {SLIDE_ROLE_LABEL[slide.role]}
                  </span>
                </span>
              </button>
              <div className="flex gap-stack-tight">
                <Button size="sm" onClick={() => runSlide((d) => moveSlide(d, index, index - 1))} disabled={locked || index === 0}>▲</Button>
                <Button size="sm" onClick={() => runSlide((d) => moveSlide(d, index, index + 1))} disabled={locked || index === deck.slides.length - 1}>▼</Button>
                <Button size="sm" onClick={() => runSlide((d) => addSlide(d, index))} disabled={index === deck.slides.length - 1}>+장</Button>
                {locked ? (
                  <span className="rounded-chip border border-dashed border-border px-micro text-caption text-subtle" data-slide-locked>{SLIDE_ROLE_LABEL[slide.role]}는 지울 수 없습니다</span>
                ) : (
                  <Button size="sm" variant="secondary" onClick={() => runSlide((d) => deleteSlide(d, index))}>삭제</Button>
                )}
              </div>
            </div>
          );
        })}
      </nav>
      <section aria-label="카드 미리보기" className="min-w-0" data-card-deck-preview>
        <div ref={canvasHostRef} className="overflow-hidden rounded-surface border border-border bg-surface-2" />
        {slideError ? <p role="alert" className="mt-stack-tight text-caption text-danger">{slideError}</p> : null}
      </section>
      <section aria-label="말풍선 편집" className="min-w-0" data-card-deck-editor>
        {activeSlide ? <BubbleEditor deck={deck} slideId={activeSlide.id} onDeckChange={onDeckChange} /> : null}
      </section>
    </div>
  );
}

function CtaEditor({ deck, onChange }: { deck: CardDeck; onChange: (cta: CardDeck["cta"]) => void }) {
  const { cta } = deck;
  return (
    <div className="space-y-stack-tight rounded-surface border border-border bg-surface-2 p-stack" data-bubble-editor-cta>
      <b className="block text-caption font-semibold text-text">CTA 정보</b>
      <label className="block text-caption text-muted">댓글 키워드
        <input value={cta.keyword} onChange={(event) => onChange({ ...cta, keyword: event.target.value })} className="mt-stack-tight w-full rounded-control border border-border bg-surface p-stack text-body text-text" />
      </label>
      <label className="block text-caption text-muted">댓글 예시
        <input value={cta.comment_example} onChange={(event) => onChange({ ...cta, comment_example: event.target.value })} className="mt-stack-tight w-full rounded-control border border-border bg-surface p-stack text-body text-text" />
      </label>
      <label className="block text-caption text-muted">저장 명분
        <input value={cta.save_reason} onChange={(event) => onChange({ ...cta, save_reason: event.target.value })} className="mt-stack-tight w-full rounded-control border border-border bg-surface p-stack text-body text-text" />
      </label>
    </div>
  );
}
