// @vitest-environment jsdom
import "@testing-library/jest-dom/vitest";
import React from "react";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { EditRoom } from "@/components/studio/StudioRooms";
import { createPlainCardDeckV3 } from "@/lib/studio/card-element-commands";
import type { CardDeckV3 } from "@/lib/studio/card-element-contract";
import type { CardDeck } from "@/lib/studio/card-deck-contract";
import { cardDeckV3EntryEnabled } from "@/lib/studio/card-deck-v3-render-feature";
import chatBubbleDeck from "./fixtures/deck-d100.v2.json";

afterEach(() => { cleanup(); vi.unstubAllGlobals(); });

describe("StudioRooms CardDeckV3 실제 연결", () => {
  it("S1-AC1 정상: 카드 편집실이 자유 배치 편집기를 열고 요소 변경을 상위 저장 경계로 전달한다", () => {
    let deck = createPlainCardDeckV3(["첫 장", "마지막 장"], "deck_rooms_v3");
    const onDeckChange = (next: CardDeckV3) => { deck = next; };
    const view = render(<EditRoom kind="card" lines={["첫 장", "마지막 장"]} onLinesChange={() => {}} cardDeckV3={deck} onCardDeckV3Change={onDeckChange} />);
    expect(screen.getByRole("region", { name: "카드 자유 배치 편집기" })).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "도형 추가" }));
    view.rerender(<EditRoom kind="card" lines={["첫 장", "마지막 장"]} onLinesChange={() => {}} cardDeckV3={deck} onCardDeckV3Change={onDeckChange} />);
    expect(deck.slides[0].elements.some((element) => element.type === "shape")).toBe(true);
    expect(document.querySelector('[data-card-deck-v3-workbench]')).toBeInTheDocument();
  });

  it("S1 회귀 거절: v3 덱이 없으면 기존 plain 카드 편집기를 유지한다", () => {
    render(<EditRoom kind="card" lines={["기존 카드"]} onLinesChange={() => {}} />);
    expect(document.querySelector('[data-card-deck-v3-workbench]')).not.toBeInTheDocument();
    expect(document.querySelector('[data-plain-card-shell]')).toBeInTheDocument();
  });

  it("S2-A 기존 plain과 복구 가능한 AI 카드에서 자유 배치 시작 행동을 노출한다", () => {
    const onStart = vi.fn();
    const view = render(<EditRoom kind="card" lines={["첫 장", "둘째 장"]} onLinesChange={() => {}} onStartCardDeckV3={onStart} />);
    fireEvent.click(screen.getByRole("button", { name: "자유 배치로 편집" }));
    expect(onStart).toHaveBeenCalledOnce();

    view.rerender(<EditRoom kind="card" lines={["글자 내장 첫 장", "글자 내장 둘째 장"]} onLinesChange={() => {}} cardTextEmbedded cardTextSourceRecoverable onStartCardDeckV3={onStart} />);
    expect(screen.getByRole("button", { name: "자유 배치로 편집" })).toBeEnabled();

  });

  it("S2-R4-M1 flag off면 S1 일반·plain v2 진입은 보존하고 AI·말풍선만 숨긴다", () => {
    const onStart = vi.fn();
    const s1Enabled = cardDeckV3EntryEnabled(false, { hasCardDeckV2: false, textEmbedded: false });
    const view = render(<EditRoom kind="card" lines={["plain 카드"]} onLinesChange={() => {}} onStartCardDeckV3={s1Enabled ? onStart : undefined} />);
    fireEvent.click(screen.getByRole("button", { name: "자유 배치로 편집" }));
    expect(onStart).toHaveBeenCalledOnce();

    const plainV2Deck = { ...chatBubbleDeck, template: "plain" } as CardDeck;
    const plainV2Enabled = cardDeckV3EntryEnabled(false, { hasCardDeckV2: true, cardDeckTemplate: "plain", textEmbedded: false });
    view.rerender(<EditRoom kind="card" lines={["plain v2 카드"]} onLinesChange={() => {}} cardDeck={plainV2Deck} onCardDeckChange={() => {}} onStartCardDeckV3={plainV2Enabled ? onStart : undefined} />);
    fireEvent.click(screen.getByRole("button", { name: "자유 배치로 편집" }));
    expect(onStart).toHaveBeenCalledTimes(2);

    const aiEnabled = cardDeckV3EntryEnabled(false, { hasCardDeckV2: false, textEmbedded: true });
    view.rerender(<EditRoom kind="card" lines={["AI 카드"]} onLinesChange={() => {}} cardTextEmbedded cardTextSourceRecoverable onStartCardDeckV3={aiEnabled ? onStart : undefined} />);
    expect(screen.queryByRole("button", { name: "자유 배치로 편집" })).not.toBeInTheDocument();

    const chatBubbleEnabled = cardDeckV3EntryEnabled(false, { hasCardDeckV2: true, cardDeckTemplate: "chat_bubble", textEmbedded: false });
    view.rerender(<EditRoom kind="card" lines={["말풍선 카드"]} onLinesChange={() => {}} cardDeck={chatBubbleDeck as CardDeck} onCardDeckChange={() => {}} onStartCardDeckV3={chatBubbleEnabled ? onStart : undefined} />);
    expect(screen.queryByRole("button", { name: "자유 배치로 편집" })).not.toBeInTheDocument();
  });

  it("S5-R2-M4 말풍선 카드는 flag on이어도 고급 도구 없는 자유 배치 진입을 막는다", () => {
    const onStart = vi.fn();
    const entryEnabled = cardDeckV3EntryEnabled(true, { hasCardDeckV2: true, cardDeckTemplate: "chat_bubble", textEmbedded: false });
    render(<EditRoom
      kind="card"
      lines={["말풍선 카드"]}
      onLinesChange={() => {}}
      cardDeck={chatBubbleDeck as CardDeck}
      onCardDeckChange={() => {}}
      onStartCardDeckV3={entryEnabled ? onStart : undefined}
    />);
    expect(screen.queryByRole("button", { name: "자유 배치로 편집" })).not.toBeInTheDocument();
    expect(screen.getByLabelText("카톡 대화 고급 편집 도구")).toBeInTheDocument();
    expect(onStart).not.toHaveBeenCalled();
  });

  it("S2-A 복구 불가 AI 카드는 버튼을 숨기지 않고 비활성 사유를 보여준다", () => {
    const onStart = vi.fn();
    render(<EditRoom
      kind="card"
      lines={["픽셀에 박힌 첫 장", "픽셀에 박힌 둘째 장"]}
      onLinesChange={() => {}}
      cardTextEmbedded
      cardTextSourceRecoverable={false}
      onStartCardDeckV3={onStart}
    />);
    expect(screen.getByRole("button", { name: "자유 배치로 편집" })).toBeDisabled();
    expect(screen.getByText("이 카드는 그림 안에 글자가 박혀 있어 글자를 따로 움직일 수 없습니다.")).toBeInTheDocument();
  });

  it("S2-A AI 카드의 v3 덱이 생기면 textEmbedded 여부와 무관하게 직접 편집 장면을 연다", () => {
    const deck = createPlainCardDeckV3(["첫 장", "마지막 장"], "deck_embedded_visible");
    render(<EditRoom kind="card" lines={["첫 장", "마지막 장"]} onLinesChange={() => {}} cardTextEmbedded cardTextSourceRecoverable cardDeckV3={deck} onCardDeckV3Change={() => {}} />);
    expect(screen.getByRole("region", { name: "카드 자유 배치 편집기" })).toBeInTheDocument();
  });

  it("S1-R7-HYDRATION-GUARD-01 상세 지연과 실패 중에는 진입과 발행을 막고 실패 시 다시 시도한다", () => {
    const onStart = vi.fn();
    const onPublish = vi.fn();
    const onRetry = vi.fn();
    const view = render(<EditRoom
      kind="card"
      lines={["첫 장", "둘째 장"]}
      onLinesChange={() => {}}
      onStartCardDeckV3={onStart}
      onOpenPublish={onPublish}
      cardDeckV3EntryBlockedReason="저장된 자유 배치 내용을 불러오는 중입니다."
      publishBlockedReason="저장된 자유 배치 내용을 불러오는 중입니다."
    />);
    expect(screen.getByRole("button", { name: "자유 배치로 편집" })).toBeDisabled();
    expect(screen.getByRole("button", { name: "발행실로 이동" })).toBeDisabled();
    fireEvent.click(screen.getByRole("button", { name: "자유 배치로 편집" }));
    expect(onStart).not.toHaveBeenCalled();
    expect(onPublish).not.toHaveBeenCalled();

    view.rerender(<EditRoom
      kind="card"
      lines={["첫 장", "둘째 장"]}
      onLinesChange={() => {}}
      onStartCardDeckV3={onStart}
      onOpenPublish={onPublish}
      cardDeckV3EntryBlockedReason="저장된 자유 배치 내용을 불러오지 못했습니다. 다시 시도해 주세요."
      publishBlockedReason="저장된 자유 배치 내용을 불러오지 못했습니다. 다시 시도해 주세요."
      onRetryCardDeckV3Detail={onRetry}
    />);
    fireEvent.click(screen.getByRole("button", { name: "다시 시도" }));
    expect(onRetry).toHaveBeenCalledOnce();
  });

  it("S1-R4-RETURN-01 자유 배치에서 기본 편집 복원 행동과 데이터 보존 안내를 노출한다", () => {
    const onReturn = vi.fn();
    const deck = createPlainCardDeckV3(["첫 장", "둘째 장"], "deck_return");
    render(<EditRoom kind="card" lines={["첫 장", "둘째 장"]} onLinesChange={() => {}} cardDeckV3={deck} onCardDeckV3Change={() => {}} onReturnFromCardDeckV3={onReturn} />);

    expect(screen.getByText(/진입 직전의 글과 위치를 그대로 복원/)).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "기본 편집으로 돌아가기" }));
    expect(onReturn).toHaveBeenCalledOnce();
  });

  it("S5-R2-M4 저장된 카톡 v3 덱이 있어도 기본 편집과 고급 도구를 유지하고 덧붙임은 보존한다", () => {
    const onReturn = vi.fn();
    const deck = createPlainCardDeckV3(["첫 장", "둘째 장"], "deck_chat_combined");
    deck.template = "chat_bubble";
    deck.slides[0].base = {
      kind: "chat_bubble",
      cover: null,
      bubbles: [{ id: "bubble_reader", order: 0, speaker: "reader", segments: [{ text: "한 화면 편집", bold: false }], reaction: null }],
    };
    const projection = deck.slides[0].elements[0];
    if (projection.type !== "text") throw new Error("fixture");
    projection.id = "el_bubble_reader";
    projection.text = "한 화면 편집";

    render(<EditRoom
      kind="card"
      lines={["첫 장", "둘째 장"]}
      onLinesChange={() => {}}
      cardDeck={chatBubbleDeck as CardDeck}
      onCardDeckChange={() => {}}
      cardDeckV3={deck}
      onCardDeckV3Change={() => {}}
      onReturnFromCardDeckV3={onReturn}
    />);

    expect(document.querySelector("[data-card-deck-v3-workbench]")).not.toBeInTheDocument();
    expect(document.querySelector("[data-card-deck-workbench]")).toBeInTheDocument();
    expect(screen.getByLabelText("카톡 대화 고급 편집 도구")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "이 장 화자 서로 바꾸기" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "화자 이름·프로필" })).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: /2장/ }));
    expect(document.querySelector("[data-bubble-editor]")).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "기본 편집으로 돌아가기" })).not.toBeInTheDocument();
    expect(onReturn).not.toHaveBeenCalled();
  });

  it("S1-R4-PUBLISH-GATE-01 v3 덱은 S2 전 발행실 이동을 막고 이유를 계속 보여준다", () => {
    const onOpenPublish = vi.fn();
    const deck = createPlainCardDeckV3(["첫 장", "둘째 장"], "deck_publish_block");
    render(<EditRoom kind="card" lines={["첫 장", "둘째 장"]} onLinesChange={() => {}} cardDeckV3={deck} onCardDeckV3Change={() => {}} onOpenPublish={onOpenPublish} publishBlockedReason="자유 배치 결과물 만들기는 다음 업데이트에서 열립니다." />);
    expect(screen.getByRole("alert")).toHaveTextContent("다음 업데이트");
    expect(screen.getByRole("button", { name: "발행실로 이동" })).toBeDisabled();
    fireEvent.click(screen.getByRole("button", { name: "발행실로 이동" }));
    expect(onOpenPublish).not.toHaveBeenCalled();
  });

  it("S1-R3-ASSET-RESIGN-01 복원한 asset_id를 테넌트 범위 서명 URL로 바꿔 사진을 표시한다", async () => {
    const deck = createPlainCardDeckV3(["첫 장", "마지막 장"], "deck_asset_restore");
    deck.slides[0].elements.push({
      id: "el_uploaded_photo", type: "image", name: "업로드 사진", x: 40, y: 40, width: 300, height: 300,
      rotation: 0, z_index: 1, opacity: 1, locked: false, hidden: false,
      asset_id: "8f6a04d2c911.png", alt: "새로고침 뒤 사진", decorative: false, fit: "cover",
      crop: { x: 0, y: 0, width: 1, height: 1 }, corner_radius: 0,
    });
    const fetchMock = vi.fn(async (_input: RequestInfo | URL, _init?: RequestInit) => ({ ok: true, json: async () => ({ ok: true, file: "/api/images/deliver/renewed" }) }) as Response);
    vi.stubGlobal("fetch", fetchMock);

    render(<EditRoom workspaceId="tenant-s1" kind="card" lines={["첫 장", "마지막 장"]} onLinesChange={() => {}} cardDeckV3={deck} onCardDeckV3Change={() => {}} />);

    await waitFor(() => expect(screen.getByAltText("새로고침 뒤 사진")).toHaveAttribute("src", "/api/images/deliver/renewed"));
    expect(JSON.parse(String(fetchMock.mock.calls[0]?.[1]?.body))).toEqual({ filename: "8f6a04d2c911.png", purpose: "image", tenant_id: "tenant-s1" });
  });
});
