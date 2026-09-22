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
  caretToSegment,
  deleteBubble,
  deleteSlide,
  groupTurns,
  mergeBubble,
  moveBubble,
  moveSlide,
  setBubbleText,
  splitBubble,
  toggleBold,
  toggleSpeaker,
} from "@/lib/studio/card-deck-ops";
import { renderChatBubbleSlideToCanvas } from "@/lib/studio/card-templates/chat-bubble";
import { DeliveredMedia } from "./DeliveredMedia";

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
  cover: "border-accent bg-accent-soft text-accent",
  chat: "border-border bg-surface-2 text-muted",
  // 2026-09-22 코드리뷰 MINOR 3: `bg-warning/10`·`bg-success/10` 은 임의 opacity 변형.
  // `--color-warning-soft`·`--color-success-soft`(globals.css) 가 이미 있다.
  comment_prompt: "border-warning bg-warning-soft text-warning",
  cta: "border-success bg-success-soft text-success",
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
    return (
      <CoverEditor
        slide={slide}
        onChange={(cover) => run((d) => ({
          ...d,
          slides: d.slides.map((s) => (s.id === slide.id ? { ...s, cover } : s)),
          revision: d.revision + 1,
        }))}
        onImageChange={(image_url) => run((d) => ({
          ...d,
          slides: d.slides.map((s) => (s.id === slide.id ? { ...s, image_url } : s)),
          revision: d.revision + 1,
        }))}
      />
    );
  }

  const currentSlideId = slide.id;

  // 2026-09-22 코드리뷰 MAJOR 5: 세그먼트를 첫 조각 값으로 갈아엎지 않고
  // `card-deck-ops.setBubbleText`(비율 재분배로 기존 볼드 조각 보존)만 거친다. 헤더 주석
  // "모든 상태 변화는 card-deck-ops.ts 의 순수 함수만 거친다" 를 텍스트 입력에도 지킨다.
  function updateBubbleText(bubbleId: string, text: string) {
    run((d) => setBubbleText(d, currentSlideId, bubbleId, text));
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
        {turns.map((turn) => (
          <li key={turn.bubbles[0].id} className={turn.speaker === "reader" ? "flex justify-end" : "flex justify-start"}>
            <ul className="max-w-[80%] space-y-stack-tight">
              {turn.bubbles.map((bubble) => (
                <li
                  key={bubble.id}
                  data-bubble-id={bubble.id}
                  data-bubble-speaker={bubble.speaker}
                  className={`rounded-surface border p-stack ${bubble.speaker === "reader" ? "border-transparent bg-chat-reader-bg" : "border-border bg-surface"}`}
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
                      // 2026-09-22 코드리뷰 MAJOR 5: caret 은 말풍선 전체 텍스트 기준인데
                      // splitBubble 은 세그먼트 좌표를 받는다. caretToSegment 로 바꾼다
                      // (세그먼트가 2개 이상이면 예전 코드는 잘못된 자리에서 쪼갰다).
                      const el = textareaRefs.current[bubble.id];
                      const caret = el?.selectionStart ?? bubbleText(bubble).length;
                      run((d) => splitBubble(d, slide.id, bubble.id, caretToSegment(bubble.segments, caret)));
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
      {slide.role === "cta" ? (
        <>
          <CtaEditor deck={deck} onChange={(cta) => run((d) => ({ ...d, cta, revision: d.revision + 1 }))} />
          <div>
            <span className="block text-caption text-muted">마지막 장 사진</span>
            <div className="mt-stack-tight">
              <CoverImagePicker
                imageUrl={slide.image_url}
                onChange={(image_url) => run((d) => ({
                  ...d,
                  slides: d.slides.map((s) => (s.id === slide.id ? { ...s, image_url } : s)),
                  revision: d.revision + 1,
                }))}
              />
            </div>
          </div>
        </>
      ) : null}
    </div>
  );
}

/**
 * 후킹 헤드라인 프리셋(세션맥락 과제 A-4). 표지 훅 3공식(질문형·숫자형·고통인식형) — 근거는
 * docs/design/osmu-content-quality-benchmark-v1-claude-opus.html REF A-3(표지 훅 3공식,
 * 첫 장 3줄 이내)과 §⑦CTA(댓글 키워드 유도·댓글 예시 칩·저장 명분, 표면 링크 금지).
 * `COVER_HEADLINE_MAX_CHARS_PER_LINE`(10자) 안에 들어가는 짧은 문장만 담았다.
 */
const HOOK_PRESETS: Record<"question" | "number" | "pain", string[]> = {
  question: ["이거 순서가\n틀렸다면?", "왜 나만\n안 될까"],
  number: ["3초 만에\n원인 하나", "10년차가 짚은\n딱 한 가지"],
  pain: ["안 되는 건\n재능이 아니다", "머리가 아니라\n순서였다"],
};
const CTA_KEYWORD_PRESETS = ["순서", "방법", "정리본"];
const CTA_COMMENT_EXAMPLE_PRESETS = ["댓글에 '순서' 남기면 보내줄게", "댓글 남기면 DM으로 보내줄게"];
const CTA_SAVE_REASON_PRESETS = ["저장해두고 나중에 다시 펴봐", "저장해두고 D-90에 다시 봐"];

function HookChips({ onPick }: { onPick: (text: string) => void }) {
  return (
    <div className="space-y-stack-tight" data-hook-chip-bank>
      {(Object.keys(HOOK_PRESETS) as Array<keyof typeof HOOK_PRESETS>).map((hookType) => (
        <div key={hookType} className="flex flex-wrap items-center gap-stack-tight">
          <span className="text-caption text-subtle">{hookType === "question" ? "질문형" : hookType === "number" ? "숫자형" : "고통인식형"}</span>
          {HOOK_PRESETS[hookType].map((preset) => (
            <Button key={preset} size="sm" variant="secondary" onClick={() => onPick(preset)} data-hook-chip={preset}>
              {preset.replace("\n", " ")}
            </Button>
          ))}
        </div>
      ))}
    </div>
  );
}

/**
 * 대문·마지막 장 사진 선택(세션맥락 과제 A-3). 업로드는 기존 `/api/images/upload`
 * (SNS-016, 테넌트 격리·서명 URL)를 그대로 쓴다 — 새 업로드 API를 만들지 않는다.
 */
function CoverImagePicker({ imageUrl, onChange }: { imageUrl: string | null; onChange: (url: string | null) => void }) {
  const [busy, setBusy] = useState(false);
  const [uploadError, setUploadError] = useState<string | null>(null);
  const inputRef = useRef<HTMLInputElement | null>(null);

  async function handleFile(file: File) {
    setBusy(true);
    setUploadError(null);
    try {
      const form = new FormData();
      form.append("file", file);
      const res = await fetch("/api/images/upload", { method: "POST", body: form });
      const data = (await res.json().catch(() => ({}))) as { url?: string; error?: string };
      if (!res.ok || !data.url) {
        setUploadError(data.error || "사진을 올리지 못했습니다. 잠시 후 다시 시도해 주세요.");
        return;
      }
      onChange(data.url);
    } catch {
      setUploadError("연결이 끊겨 사진을 올리지 못했습니다.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="space-y-stack-tight" data-cover-image-picker>
      {imageUrl ? (
        <DeliveredMedia
          src={imageUrl}
          type="image"
          alt="선택된 표지 사진"
          className="h-24 w-24 rounded-control border border-border object-cover"
          testId="cover-image-picker-preview"
        />
      ) : (
        <p className="text-caption text-muted" data-cover-image-empty>아직 사진을 고르지 않았습니다. 이 장은 배경색으로만 나갑니다.</p>
      )}
      <div className="flex flex-wrap gap-stack-tight">
        <Button size="sm" disabled={busy} onClick={() => inputRef.current?.click()}>{busy ? "올리는 중…" : "사진 올리기"}</Button>
        {imageUrl ? <Button size="sm" variant="secondary" onClick={() => onChange(null)}>사진 빼기</Button> : null}
      </div>
      <input
        ref={inputRef}
        type="file"
        accept="image/png,image/jpeg,image/webp,image/gif"
        className="hidden"
        onChange={(event) => {
          const file = event.target.files?.[0];
          if (file) void handleFile(file);
          event.target.value = "";
        }}
      />
      {uploadError ? <p role="alert" className="text-caption text-danger" data-cover-image-error>{uploadError}</p> : null}
    </div>
  );
}

function CoverEditor({ slide, onChange, onImageChange }: {
  slide: CardSlide;
  onChange: (cover: NonNullable<CardSlide["cover"]>) => void;
  onImageChange: (url: string | null) => void;
}) {
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
      <div>
        <span className="block text-caption text-muted">후킹 문구 바로 넣기</span>
        <div className="mt-stack-tight"><HookChips onPick={(text) => onChange({ ...cover, headline: text })} /></div>
      </div>
      <label className="block text-caption text-muted">보조 문구
        <input
          value={cover.sub ?? ""}
          onChange={(event) => onChange({ ...cover, sub: event.target.value || null })}
          className="mt-stack-tight w-full rounded-control border border-border bg-surface-2 p-stack text-body text-text"
        />
      </label>
      <div>
        <span className="block text-caption text-muted">표지 사진</span>
        <div className="mt-stack-tight"><CoverImagePicker imageUrl={slide.image_url} onChange={onImageChange} /></div>
      </div>
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
              <Button
                variant="secondary"
                onClick={() => setActiveSlideId(slide.id)}
                aria-pressed={slide.id === activeSlideId}
                data-slide-id={slide.id}
                data-slide-role={slide.role}
                // 2026-09-22 코드리뷰 CI 재검토: 맨 button 태그 대신 공용 Button 을 쓴다
                // (QA-APP-TOUCH-08 기준선 239→238). Button 기본값(inline-flex·
                // justify-center·px 만 있는 size 패딩)과 이 목록 행의 레이아웃(꽉 찬
                // 너비·양끝 정렬·상하좌우 패딩·왼쪽 정렬)이 충돌하는 자리만 `!` 로 이긴다.
                className={`!flex w-full !justify-between !p-stack text-left text-caption ${slide.id === activeSlideId ? "!border-accent !bg-accent-soft" : "!border-border !bg-surface"}`}
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
              </Button>
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
      <div className="flex flex-wrap gap-stack-tight" data-cta-keyword-chips>
        {CTA_KEYWORD_PRESETS.map((preset) => (
          <Button key={preset} size="sm" variant="secondary" onClick={() => onChange({ ...cta, keyword: preset })}>{preset}</Button>
        ))}
      </div>
      <label className="block text-caption text-muted">댓글 예시
        <input value={cta.comment_example} onChange={(event) => onChange({ ...cta, comment_example: event.target.value })} className="mt-stack-tight w-full rounded-control border border-border bg-surface p-stack text-body text-text" />
      </label>
      <div className="flex flex-wrap gap-stack-tight" data-cta-comment-chips>
        {CTA_COMMENT_EXAMPLE_PRESETS.map((preset) => (
          <Button key={preset} size="sm" variant="secondary" onClick={() => onChange({ ...cta, comment_example: preset })}>{preset}</Button>
        ))}
      </div>
      <label className="block text-caption text-muted">저장 명분
        <input value={cta.save_reason} onChange={(event) => onChange({ ...cta, save_reason: event.target.value })} className="mt-stack-tight w-full rounded-control border border-border bg-surface p-stack text-body text-text" />
      </label>
      <div className="flex flex-wrap gap-stack-tight" data-cta-save-chips>
        {CTA_SAVE_REASON_PRESETS.map((preset) => (
          <Button key={preset} size="sm" variant="secondary" onClick={() => onChange({ ...cta, save_reason: preset })}>{preset}</Button>
        ))}
      </div>
    </div>
  );
}
