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

/**
 * PR #87 리뷰(2026-09-25) 실측 회귀: 이 파일만 `HTMLCanvasElement.getContext`를 null로
 * 죽이지 않아, `CardDeckPanel`이 v70에서 새로 붙은 `useSlideRenderCheck`(발행 렌더러를
 * 400ms 디바운스로 다시 그려 표지·CTA 미리보기와 레이아웃 경고를 만드는 훅, M5·M6)를 통해
 * jsdom이 자동 로드하는 진짜 "canvas" npm 네이티브 바인딩으로 실제 픽셀을 그렸다.
 * `vi.useFakeTimers()`는 setTimeout의 "논리 시간"만 앞당길 뿐, 그 콜백 안에서 실제로 도는
 * 네이티브 캔버스 그리기(한글 폰트 메트릭 조회 포함)의 "실제 CPU 시간"은 그대로다 — 이
 * 공유 머신처럼 다른 vitest 워커와 CPU를 다툴 때 그 실제 시간이 이 테스트의 5000ms 실벽시계
 * testTimeout을 넘겼다(p1 단독 재현, p2 단독 통과 — p2엔 이 훅이 없다). 다른 형제 테스트
 * (`bubble-editor.test.tsx`, `editroom-v70-phase1.regression.test.tsx` 등)는 이미 이 자리를
 * null로 죽여 캔버스를 안 그리는 관행을 쓴다 — 여기만 빠져 있었다. 테스트 제한시간을
 * 늘리는 대신(회장 지시: 덮지 말 것) 같은 관행을 따라 실제 원인(불필요한 실캔버스 렌더)을
 * 없앤다 — 실제 발행 렌더러 자체의 회귀는 `card-templates-chat-bubble.render.test.ts`가
 * 이미 전담해 커버한다.
 */
if (typeof HTMLCanvasElement !== "undefined") {
  HTMLCanvasElement.prototype.getContext = (() => null) as unknown as typeof HTMLCanvasElement.prototype.getContext;
}

function clone<T>(value: T): T {
  return JSON.parse(JSON.stringify(value));
}

/**
 * page.tsx의 실제 onCardDeckChange/onVideoEditChange와 같은 구조(독립 setTimeout 두 개,
 * 800ms, 카드덱은 prune+보류, 영상은 빈 항목이면 통째로 보류)를 가진 하네스. "구조 대조"
 * describe가 이 구조와 page.tsx 소스가 실제로 일치하는지 문자열로 대조한다.
 */
function Harness({ onSave, initialDeck }: { onSave: (payload: { cardDeck?: CardDeck | null; videoEdit?: VideoEdit | null }) => void; initialDeck?: CardDeck }) {
  const [deck, setDeck] = useState<CardDeck>(initialDeck ?? (clone(deckD100) as unknown as CardDeck));
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

  it("F: 카드덱이 진짜로 빈 말풍선 상태로 보류되고(직접 단언), 그 상태에서도 영상 저장은 막히지 않는다", async () => {
    // 이전 판(3차)은 UI 삭제 버튼을 반복 클릭해 "가능한 만큼" 비웠을 뿐, ops가 마지막
    // 말풍선 삭제를 거부해 실제로는 한 번도 진짜 빈 상태에 도달하지 못했다 — 그런데도
    // 이름은 "보류됐다"고 주장했다(F 지적). 여기서는 초기 deck 자체를 1번 장 bubbles:[]로
    // 만들어 emptyBubbleSlideNumber가 반드시 걸리게 하고, 그 보류가 실제로 일어났는지
    // holdMessage로 직접 단언한다.
    const brokenDeck = clone(deckD100) as unknown as CardDeck;
    brokenDeck.slides[1] = { ...brokenDeck.slides[1], bubbles: [] };

    const saves: Array<{ cardDeck?: CardDeck | null; videoEdit?: VideoEdit | null }> = [];
    render(<Harness onSave={(payload) => saves.push(payload)} initialDeck={brokenDeck} />);

    // 카드덱을 "건드리기만"(값은 그대로, 여전히 1번 장이 비어 있는 채) 해 카드덱 타이머를
    // 예약시킨다 — 표지 헤드라인 칩을 눌러도 되지만, 1번 장이 비어 있다는 사실 자체가
    // 핵심이므로 표지만 살짝 바꾼다.
    const cardDeckPanel = document.querySelector("[data-card-deck-panel]") as HTMLElement;
    fireEvent.click(within(cardDeckPanel).getByText("왜 나만\n안 될까".replace("\n", " ")));

    const overlayEditor2 = document.querySelector("[data-video-overlay-editor]") as HTMLElement;
    fireEvent.click(within(overlayEditor2).getByText("후킹"));
    fireEvent.click(within(overlayEditor2).getByText("3초 만에 원인 하나"));
    fireEvent.click(within(overlayEditor2).getByText(/구간에 추가/));

    await vi.advanceTimersByTimeAsync(900);

    // 카드덱은 실제로 보류됐다(직접 단언 — 이전 판은 이 줄이 없어서 0회여도 초록이었다).
    expect(document.querySelector("[data-hold-message]")!.textContent).toContain("2번 장");
    const cardDeckSaves = saves.filter((s) => s.cardDeck);
    expect(cardDeckSaves).toHaveLength(0);

    // 영상은 그 보류와 무관하게 저장된다.
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
    const onCardDeckChange = pageSrc.slice(pageSrc.indexOf("function onCardDeckChange("), pageSrc.indexOf("function onCardDeckChange(") + 1300);
    const onVideoEditChange = pageSrc.slice(pageSrc.indexOf("function onVideoEditChange("), pageSrc.indexOf("function onVideoEditChange(") + 1300);
    expect(onCardDeckChange).toContain("cardDeckAutosaveTimer.current");
    expect(onCardDeckChange).not.toContain("videoEditAutosaveTimer");
    expect(onVideoEditChange).toContain("videoEditAutosaveTimer.current");
    expect(onVideoEditChange).not.toContain("cardDeckAutosaveTimer");
  });

  it("A/B(4차): onCardDeckChange는 videoEdit 자리에 명시 null을, onVideoEditChange는 cardDeck 자리에 명시 null을 넘긴다", () => {
    const onCardDeckChange = pageSrc.slice(pageSrc.indexOf("function onCardDeckChange("), pageSrc.indexOf("function onCardDeckChange(") + 1300);
    const onVideoEditChange = pageSrc.slice(pageSrc.indexOf("function onVideoEditChange("), pageSrc.indexOf("function onVideoEditChange(") + 1300);
    expect(onCardDeckChange, "카드덱 자동저장이 videoEdit 자리에 null을 안 넘기면 state의 videoEdit이 검증 없이 같이 나간다").toContain("pruned, null)");
    expect(onVideoEditChange, "영상 자동저장이 cardDeck 자리에 null을 안 넘기면 state의 cardDeck이 pruning 없이 같이 나간다").toContain("null, nextEdit)");
  });

  it("C(4차): 카드덱·영상 자동저장 보류 사유가 서로 다른 state를 쓴다(공유 state가 서로를 지우지 않는다)", () => {
    const onCardDeckChange = pageSrc.slice(pageSrc.indexOf("function onCardDeckChange("), pageSrc.indexOf("function onCardDeckChange(") + 1300);
    const onVideoEditChange = pageSrc.slice(pageSrc.indexOf("function onVideoEditChange("), pageSrc.indexOf("function onVideoEditChange(") + 1300);
    expect(onCardDeckChange).toContain("setCardDeckAutosaveError");
    expect(onCardDeckChange).not.toContain("setVideoEditAutosaveError");
    expect(onVideoEditChange).toContain("setVideoEditAutosaveError");
    expect(onVideoEditChange).not.toContain("setCardDeckAutosaveError");
  });

  it("onVideoEditChange는 sanitizeForSave(부분 삭제 위험)가 아니라 videoEditIncompleteEntryReason(보류)을 쓴다(R2)", () => {
    expect(pageSrc).toContain("videoEditIncompleteEntryReason(nextEdit)");
    // "sanitizeForSave"는 R2를 설명하는 주석에만 남아 있어야 한다 — import에는 없어야
    // 실제로 안 쓰인다는 뜻이다(주석 존재는 허용, 실제 import/호출은 금지).
    expect(pageSrc).toContain('import { videoEditIncompleteEntryReason, type VideoEdit } from "@/lib/studio/video-edit-contract";');
  });

  it("saveDraftWithNotice·recompositeCards도 emptyBubbleSlideNumber 검사를 거친다(F5)", () => {
    const saveDraftWithNotice = pageSrc.slice(pageSrc.indexOf("async function saveDraftWithNotice()"), pageSrc.indexOf("async function saveDraftWithNotice()") + 900);
    const recomposite = pageSrc.slice(pageSrc.indexOf("async function recompositeCards("), pageSrc.indexOf("async function recompositeCards(") + 1300);
    expect(saveDraftWithNotice).toContain("emptyBubbleSlideNumber(pruned)");
    expect(recomposite).toContain("const pruned = pruneEmptyBubbles(cardDeck)");
    expect(recomposite).toContain("emptyBubbleSlideNumber(pruned)");
    // D(4차): 검사만 하고 렌더는 원본을 쓰면 안 된다 — 렌더 호출도 pruned를 써야 한다.
    expect(recomposite).toContain("deck: pruned");
  });
});
