// @vitest-environment jsdom
/**
 * PR4 남은 3건(세션맥락 과제 ①②③) 계약.
 *
 * ① 발행실 9장 PNG 업로드 연동: `page.tsx recompositeCards`가 `cardDeck.template
 *    ==="chat_bubble"` 이면 옛 lines 경로 대신 `renderAndUploadCardDeck({template:
 *    "chat_bubble", deck})` 을 부른다. cardDeck 이 없는 기존 글자 카드 3장 경로는 무변경
 *    (회귀 0) — 소스 계약으로 확인한다(다른 카드뉴스 테스트가 이미 기존 경로를 실행 검증).
 * ② 생성실 "방금 만든 것" 9장 실제 썸네일: `CardDeckThumbnailStrip` 이 실제 캔버스로
 *    9장을 그리고, `CreateRoom` 은 `cardDeckByDraftId` 로 찾은 덱이 있을 때만 그것을
 *    붙인다(못 찾으면 기존 텍스트 요약으로 물러선다 — 조용한 실패 아님).
 * ③ 편집실 카드 목록 4역할 배지: `CardDeckPanel` 카드 목록 각 항목에
 *    `data-slide-role-badge` 가 역할값 그대로 붙는다(추정 아니라 계약 필드 그대로).
 */
import "@testing-library/jest-dom/vitest";
import fs from "fs";
import path from "path";
import { cleanup, render, screen, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { CardDeckPanel, type BubbleEditorProps } from "@/components/studio/BubbleEditor";
import { CardDeckThumbnailStrip } from "@/components/studio/StudioRooms";
import type { CardDeck } from "@/lib/studio/card-deck-contract";
import deckD100 from "./fixtures/deck-d100.v2.json";

vi.mock("@/lib/studio/card-templates/chat-bubble", async () => {
  const actual = await vi.importActual<typeof import("@/lib/studio/card-templates/chat-bubble")>(
    "@/lib/studio/card-templates/chat-bubble",
  );
  return {
    ...actual,
    // M4 회귀 재현: 표지(0번 장) 렌더가 항상 던지게 만들어, try/catch 없이 우회했던 옛
    // 코드라면 생성실 useEffect 가 그대로 throw 해 컴포넌트가 언마운트된다.
    renderChatBubbleSlideToCanvas: vi.fn((input: Parameters<typeof actual.renderChatBubbleSlideToCanvas>[0]) => {
      if (input.index === 0) throw new actual.ChatBubbleRenderError("1번 장 말풍선이 카드보다 깁니다. 쪼개세요");
      return actual.renderChatBubbleSlideToCanvas(input);
    }),
  };
});

const pageSrc = fs.readFileSync(path.resolve(__dirname, "../../src/app/studio/page.tsx"), "utf8");
const roomsSrc = fs.readFileSync(path.resolve(__dirname, "../../src/components/studio/StudioRooms.tsx"), "utf8");

function deck(): CardDeck {
  return JSON.parse(JSON.stringify(deckD100)) as CardDeck;
}

afterEach(() => cleanup());

describe("PR4 잔여 배선 ① 발행실 9장 업로드", () => {
  it("recompositeCards가 chat_bubble 덱이면 template/deck 을 그대로 renderAndUploadCardDeck 에 넘긴다", () => {
    expect(pageSrc).toContain('cardDeck && cardDeck.template === "chat_bubble"');
    expect(pageSrc).toContain('template: "chat_bubble", deck: cardDeck');
  });

  it("cardDeck 없는 기존 글자 카드 3장 경로(lines/positions)는 그대로 남아 있다(회귀 0)", () => {
    expect(pageSrc).toContain("positions: cardTextPositions");
  });
});

describe("PR4 잔여 배선 ② 생성실 실제 썸네일", () => {
  it("CreateRoom 이 cardDeckByDraftId 로 찾은 덱을 CardDeckThumbnailStrip 에 붙인다", () => {
    expect(roomsSrc).toContain("cardDeckByDraftId?.(item.draft_id)");
    expect(roomsSrc).toContain("<CardDeckThumbnailStrip deck={deck} />");
  });

  it("못 찾으면(null) 기존 deck_summary 텍스트 요약이 그대로 남는다(조용한 실패 아님)", () => {
    expect(roomsSrc).toContain("카톡 말풍선 카드뉴스 ${item.deck_summary.slides}장을 만들었습니다");
  });

  it("2026-09-22 코드리뷰 MAJOR 4 회귀: 한 장이 렌더 실패해도 CardDeckThumbnailStrip 은 언마운트되지 않고 나머지 장 + 이유 칩을 보여준다", async () => {
    // vi.mock 위에서 index===0(표지) 렌더를 항상 throw 하게 만들었다. try/catch 없이
    // 우회했던 옛 코드라면 이 render() 호출 자체가 throw 로 실패한다.
    // J1(2026-09-22 코드리뷰) 이후 렌더러가 비동기라 장마다 순서대로 그려진다 — waitFor로
    // 마지막 장까지 다 그려질 때까지 기다린다.
    render(<CardDeckThumbnailStrip deck={deck()} />);
    const strip = document.querySelector("[data-card-deck-thumbnail-strip]")!;
    expect(strip).toBeTruthy();
    await waitFor(() => {
      expect(strip.querySelectorAll("canvas").length).toBe(deck().slides.length - 1);
    });
    // 실패한 장은 canvas 대신 이유 칩(문단)으로 대체된다.
    expect(strip.textContent).toContain("1번 장");
    expect(strip.textContent).toContain("카드보다 깁니다");
  });
});

describe("PR4 잔여 배선 M3: 담당 대화창 일괄 편집이 chat_bubble 덱에 역적용된다", () => {
  it("EditRoom 이 chat_bubble 이면 safeLines 를 deckProjection 에서 파생하고 askBulk 결과를 applyProjection 으로 역적용한다(2026-09-22 코드리뷰 MAJOR 3)", () => {
    expect(roomsSrc, "chat_bubble 이 deckProjection 을 안 쓴다").toContain("deckProjection(cardDeck!)");
    expect(roomsSrc, "askBulk 결과가 applyProjection 으로 역적용 안 된다").toContain(
      "onCardDeckChange(applyProjection(cardDeck, data.lines, deckProj.refs))",
    );
  });
});

describe("PR4 잔여 배선 M2: 자동저장 전 빈 말풍선을 정리하고 보류 이유를 보여준다", () => {
  // N1(2026-09-22 코드리뷰) 재설계로 이 로직은 onCardDeckChange 본문이 아니라 카드덱·영상
  // 공용 타이머 scheduleEditAutosave 로 옮겨졌다(둘 다 바뀌어도 서로 덮어쓰지 않게).
  it("page.tsx scheduleEditAutosave 가 저장 전 pruneEmptyBubbles + emptyBubbleSlideNumber 를 부른다(2026-09-22 코드리뷰 MAJOR 2)", () => {
    const scheduleEditAutosave = pageSrc.slice(
      pageSrc.indexOf("function scheduleEditAutosave()"),
      pageSrc.indexOf("function scheduleEditAutosave()") + 1600,
    );
    expect(scheduleEditAutosave).toContain("pruneEmptyBubbles(deckToSave)");
    expect(scheduleEditAutosave).toContain("emptyBubbleSlideNumber(pruned)");
    expect(scheduleEditAutosave, "빈 말풍선이 남으면 카드덱을 payload에서 빼고 보류 문구를 남겨야 한다").toMatch(/emptySlide !== null[\s\S]{0,220}holdMessage/);
  });
});

describe("PR4 잔여 배선 ①' M1 회귀: cardDeck 리셋 경로 3곳", () => {
  it("워크스페이스 전환·새 초안 생성·버리기 세 리셋 경로 모두 setCardDeck(null) 을 포함한다(2026-09-22 코드리뷰 MAJOR 1)", () => {
    // 옛 말풍선 덱이 새 글자 카드 초안에 그대로 남아 저장되는 회귀. 세 함수 각각의 본문
    // 안에서 setCardDeck(null) 을 찾는다(전역 카운트가 아니라 자리별 확인).
    const workspaceSwitchEffect = pageSrc.slice(
      pageSrc.indexOf("const [hydratedWorkspaceId, setHydratedWorkspaceId] = useState"),
      pageSrc.indexOf("const upText ="),
    );
    expect(workspaceSwitchEffect, "워크스페이스 전환 리셋에 setCardDeck(null) 이 없다").toContain("setCardDeck(null)");

    const generateQuickDraft = pageSrc.slice(
      pageSrc.indexOf("async function generateQuickDraft("),
      pageSrc.indexOf("async function genImage("),
    );
    expect(generateQuickDraft, "새 초안 생성 리셋에 setCardDeck(null) 이 없다").toContain("setCardDeck(null)");

    const discardCurrentWork = pageSrc.slice(
      pageSrc.indexOf("async function discardCurrentWork("),
      pageSrc.indexOf("async function discardCurrentWork(") + 2000,
    );
    expect(discardCurrentWork, "버리고 새로 시작 리셋에 setCardDeck(null) 이 없다").toContain("setCardDeck(null)");
  });
});

describe("PR4 잔여 배선 ③ 편집실 4역할 배지", () => {
  const onDeckChange: BubbleEditorProps["onDeckChange"] = () => {};

  it("카드 목록에 표지·대화·댓글유도·CTA 역할 배지가 계약 role 값 그대로 붙는다", () => {
    render(<CardDeckPanel deck={deck()} onDeckChange={onDeckChange} />);
    const badges = document.querySelectorAll("[data-slide-role-badge]");
    expect(badges).toHaveLength(deck().slides.length);
    const roles = Array.from(badges).map((el) => el.getAttribute("data-slide-role-badge"));
    expect(roles[0]).toBe("cover");
    expect(roles[roles.length - 1]).toBe("cta");
    expect(roles).toContain("comment_prompt");
    expect(screen.getAllByText("표지").length).toBeGreaterThan(0);
    expect(screen.getAllByText("CTA").length).toBeGreaterThan(0);
    expect(screen.getAllByText("댓글유도").length).toBeGreaterThan(0);
  });
});
