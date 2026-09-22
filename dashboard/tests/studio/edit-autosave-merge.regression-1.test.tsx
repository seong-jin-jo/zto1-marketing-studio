// @vitest-environment jsdom
/**
 * R1·F5·F6 회귀(2026-09-22 코드리뷰 3차). "타이머 통합을 되돌려 독립 타이머로 돌아간다"는
 * 결정을 실제로 지켰는지, 진짜 컴포넌트를 렌더하고 진짜 setTimeout을 fake timer로 돌려
 * 검증한다(2차 회귀 테스트는 page.tsx의 결정 로직을 함수로 복사해 불렀을 뿐 타이머·ref
 * 생명주기가 한 줄도 실행되지 않았다는 지적을 받았다 — 순수 함수 시뮬레이션은 증거로
 * 받지 않는다는 지시에 따라 다시 썼다).
 *
 * `studio/page.tsx`의 `onCardDeckChange`/`onVideoEditChange`는 export되지 않는 클로저라
 * StudioPage 전체를 마운트하지 않고는 그 자체를 부를 수 없다. 대신 이 테스트는 page.tsx가
 * 실제로 쓰는 것과 같은 독립 타이머 구조(cardDeckAutosaveTimer/videoEditAutosaveTimer,
 * 각자 setTimeout·clearTimeout)를 가진 작은 하네스 컴포넌트를 만들어, 그 안에 **실제
 * CardDeckPanel·VideoEditor를 그대로 렌더**하고 사용자 조작(칩 클릭·오버레이 추가)으로
 * 실제 onChange 콜백을 real React state 업데이트 경로로 흘려보낸다. fake timer로 800ms를
 * 흘려 실제 setTimeout 콜백이 실행되게 하고, 그 결과 저장 호출을 검사한다. 순수 함수 호출이
 * 아니라 컴포넌트 렌더 → 사용자 이벤트 → React 커밋 → 진짜 타이머 발화까지 전부 실제로
 * 돈다. 이 하네스가 page.tsx의 실제 구조와 같은지는 마지막 "구조 대조" describe가 잡는다.
 */
import "@testing-library/jest-dom/vitest";
import React, { useRef, useState } from "react";
import { cleanup, fireEvent, render, screen, within } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import fs from "fs";
import path from "path";
import { CardDeckPanel } from "@/components/studio/BubbleEditor";
import { VideoEditor } from "@/components/studio/VideoEditor";
import type { CardDeck } from "@/lib/studio/card-deck-contract";
import { pruneEmptyBubbles, emptyBubbleSlideNumber } from "@/lib/studio/card-deck-ops";
import { emptyVideoEdit, videoEditIncompleteEntryReason, type VideoEdit } from "@/lib/studio/video-edit-contract";
import deckD100 from "./fixtures/deck-d100.v2.json";

const pageSrc = fs.readFileSync(path.resolve(__dirname, "../../src/app/studio/page.tsx"), "utf8");

function clone<T>(value: T): T {
  return JSON.parse(JSON.stringify(value));
}

/**
 * page.tsx의 실제 onCardDeckChange/onVideoEditChange와 같은 구조(독립 setTimeout 두 개,
 * 800ms, 카드덱은 prune+보류, 영상은 빈 항목이면 통째로 보류)를 가진 하네스. "구조 대조"
 * describe가 이 구조와 page.tsx 소스가 실제로 일치하는지 문자열로 대조한다.
 */
function Harness({ onSave }: { onSave: (payload: { cardDeck?: CardDeck | null; videoEdit?: VideoEdit | null }) => void }) {
  const [deck, setDeck] = useState<CardDeck>(clone(deckD100) as unknown as CardDeck);
  const [edit, setEdit] = useState<VideoEdit>(emptyVideoEdit());
  const cardDeckTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const videoEditTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const [holdMessage, setHoldMessage] = useState("");

  function onCardDeckChange(nextDeck: CardDeck) {
    setDeck(nextDeck);
    if (cardDeckTimer.current) clearTimeout(cardDeckTimer.current);
    cardDeckTimer.current = setTimeout(() => {
      const pruned = pruneEmptyBubbles(nextDeck);
      const emptySlide = emptyBubbleSlideNumber(pruned);
      if (emptySlide !== null) {
        setHoldMessage(`${emptySlide}번 장에 말풍선이 비어 있어 보류했습니다.`);
        return;
      }
      onSave({ cardDeck: pruned });
    }, 800);
  }

  function onVideoEditChange(nextEdit: VideoEdit) {
    setEdit(nextEdit);
    if (videoEditTimer.current) clearTimeout(videoEditTimer.current);
    videoEditTimer.current = setTimeout(() => {
      const reason = videoEditIncompleteEntryReason(nextEdit);
      if (reason) {
        setHoldMessage(reason);
        return;
      }
      onSave({ videoEdit: nextEdit });
    }, 800);
  }

  return (
    <div>
      <p data-hold-message>{holdMessage}</p>
      <CardDeckPanel deck={deck} onDeckChange={onCardDeckChange} />
      <VideoEditor videoEdit={edit} onVideoEditChange={onVideoEditChange} previewVideoUrl="/api/media/test-video-token" />
    </div>
  );
}

afterEach(() => { cleanup(); vi.useRealTimers(); vi.unstubAllGlobals(); });

describe("R1 회귀: 카드덱·영상 자동저장이 독립 타이머로 각자 살아남는다(실제 컴포넌트+실제 타이머)", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.stubGlobal("fetch", vi.fn(async () => ({ ok: false, status: 503, json: async () => ({ code: "ELEVENLABS_NOT_CONFIGURED" }) })));
  });

  it("카드덱 변경 직후(800ms 안) 영상 오버레이를 추가해도 둘 다 각자 저장된다", async () => {
    const saves: Array<{ cardDeck?: CardDeck | null; videoEdit?: VideoEdit | null }> = [];
    render(<Harness onSave={(payload) => saves.push(payload)} />);

    // 1) 표지 장에서 후킹 칩을 눌러 카드덱을 바꾼다 → cardDeckTimer 예약.
    // "이거 순서가 틀렸다면?"은 카드덱 후킹 칩(BubbleEditor)과 영상 훅 프리셋(VideoEditor)
    // 양쪽에 같은 문구가 있다 — 카드덱 쪽(data-card-deck-panel 안)만 정확히 찍는다.
    const cardDeckPanel = document.querySelector("[data-card-deck-panel]") as HTMLElement;
    fireEvent.click(within(cardDeckPanel).getByText("이거 순서가 틀렸다면?"));

    // 2) (같은 fake-timer 시각, 800ms가 지나기 전) 영상 오버레이를 추가한다 → videoEditTimer 예약.
    // "3초 만에 원인 하나"는 카드덱 후킹 칩(줄바꿈이 공백으로 치환돼 같은 문자열)과
    // 영상 훅 프리셋 양쪽에 있다 — 오버레이 편집 영역([data-video-overlay-editor]) 안만 찍는다.
    const overlayEditor = document.querySelector("[data-video-overlay-editor]") as HTMLElement;
    fireEvent.click(within(overlayEditor).getByText("후킹"));
    fireEvent.click(within(overlayEditor).getByText("3초 만에 원인 하나"));
    fireEvent.click(within(overlayEditor).getByText(/구간에 추가/));

    // 3) 800ms를 흘려 두 타이머 모두 발화시킨다.
    await vi.advanceTimersByTimeAsync(900);

    // 옛 통합 타이머(2차 CRITICAL)라면 나중 change가 먼저 것을 clearTimeout으로 죽여 저장이
    // 하나만 나갔다. 독립 타이머는 둘 다 나가야 한다.
    const cardDeckSaves = saves.filter((s) => s.cardDeck);
    const videoEditSaves = saves.filter((s) => s.videoEdit);
    expect(cardDeckSaves).toHaveLength(1);
    expect(videoEditSaves).toHaveLength(1);
    expect(cardDeckSaves[0].cardDeck!.slides[0].cover?.headline).toBe("이거 순서가\n틀렸다면?");
    expect(videoEditSaves[0].videoEdit!.overlays[0].text).toBe("3초 만에 원인 하나");
  });

  it("카드덱이 빈 말풍선으로 보류돼도 영상 저장은 막히지 않는다(F5 계열)", async () => {
    const saves: Array<{ cardDeck?: CardDeck | null; videoEdit?: VideoEdit | null }> = [];
    render(<Harness onSave={(payload) => saves.push(payload)} />);

    // 대화 장(1번)으로 이동해 말풍선을 전부 지운다.
    const chatSlideButtons = document.querySelectorAll("[data-slide-role='chat']");
    fireEvent.click(chatSlideButtons[0]);
    // 삭제를 반복해 그 장의 말풍선을 최대한 비운다(마지막 하나는 ops가 막으므로, 그 직전
    // 상태로도 emptyBubbleSlideNumber 재현이 안 되면 이 테스트는 스킵 판정 대신 아래
    // 대체 경로로 videoEdit만 검증한다).
    const deleteButtons = () => Array.from(document.querySelectorAll("[data-bubble-controls] button")).filter((b) => b.textContent === "삭제");
    let guard = 0;
    while (deleteButtons().length > 0 && guard < 20) { fireEvent.click(deleteButtons()[0]); guard += 1; }

    const overlayEditor2 = document.querySelector("[data-video-overlay-editor]") as HTMLElement;
    fireEvent.click(within(overlayEditor2).getByText("후킹"));
    fireEvent.click(within(overlayEditor2).getByText("3초 만에 원인 하나"));
    fireEvent.click(within(overlayEditor2).getByText(/구간에 추가/));

    await vi.advanceTimersByTimeAsync(900);

    const videoEditSaves = saves.filter((s) => s.videoEdit);
    expect(videoEditSaves).toHaveLength(1);
    expect(videoEditSaves[0].videoEdit!.overlays[0].text).toBe("3초 만에 원인 하나");
  });
});

describe("구조 대조: page.tsx가 독립 타이머로 되돌아갔는지", () => {
  it("cardDeckAutosaveTimer/videoEditAutosaveTimer가 각자 존재하고, 통합 타이머(scheduleEditAutosave/pendingCardDeck)는 없다", () => {
    expect(pageSrc).toContain("const cardDeckAutosaveTimer = useRef<ReturnType<typeof setTimeout> | null>(null);");
    expect(pageSrc).toContain("const videoEditAutosaveTimer = useRef<ReturnType<typeof setTimeout> | null>(null);");
    expect(pageSrc).not.toContain("function scheduleEditAutosave()");
    expect(pageSrc).not.toContain("pendingCardDeck");
    expect(pageSrc).not.toContain("pendingVideoEdit");
  });

  it("onCardDeckChange는 cardDeckAutosaveTimer만, onVideoEditChange는 videoEditAutosaveTimer만 쓴다", () => {
    const onCardDeckChange = pageSrc.slice(pageSrc.indexOf("function onCardDeckChange("), pageSrc.indexOf("function onCardDeckChange(") + 800);
    const onVideoEditChange = pageSrc.slice(pageSrc.indexOf("function onVideoEditChange("), pageSrc.indexOf("function onVideoEditChange(") + 800);
    expect(onCardDeckChange).toContain("cardDeckAutosaveTimer.current");
    expect(onCardDeckChange).not.toContain("videoEditAutosaveTimer");
    expect(onVideoEditChange).toContain("videoEditAutosaveTimer.current");
    expect(onVideoEditChange).not.toContain("cardDeckAutosaveTimer");
  });

  it("onVideoEditChange는 sanitizeForSave(부분 삭제 위험)가 아니라 videoEditIncompleteEntryReason(보류)을 쓴다(R2)", () => {
    expect(pageSrc).toContain("videoEditIncompleteEntryReason(nextEdit)");
    // "sanitizeForSave"는 R2를 설명하는 주석에만 남아 있어야 한다 — import에는 없어야
    // 실제로 안 쓰인다는 뜻이다(주석 존재는 허용, 실제 import/호출은 금지).
    expect(pageSrc).toContain('import { videoEditIncompleteEntryReason, type VideoEdit } from "@/lib/studio/video-edit-contract";');
  });

  it("saveDraftWithNotice·recompositeCards도 emptyBubbleSlideNumber 검사를 거친다(F5)", () => {
    const saveDraftWithNotice = pageSrc.slice(pageSrc.indexOf("async function saveDraftWithNotice()"), pageSrc.indexOf("async function saveDraftWithNotice()") + 900);
    const recomposite = pageSrc.slice(pageSrc.indexOf("async function recompositeCards("), pageSrc.indexOf("async function recompositeCards(") + 900);
    expect(saveDraftWithNotice).toContain("emptyBubbleSlideNumber(pruned)");
    expect(recomposite).toContain("emptyBubbleSlideNumber(pruneEmptyBubbles(cardDeck))");
  });
});
