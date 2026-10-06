// @vitest-environment jsdom
import "@testing-library/jest-dom/vitest";
import React from "react";
import { cleanup, render, within } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";
import type { CardDeckV3 } from "@/lib/studio/card-element-contract";
import { createPlainCardDeckV3 } from "@/lib/studio/card-element-commands";
import { cardSlideRenderModel } from "@/lib/studio/card-render-model";
import { migrateCardDeckV2ToV3 } from "@/lib/studio/card-deck-v2-to-v3";
import type { CardDeck } from "@/lib/studio/card-deck-contract";
import { PHOTO_TEXT_PRIMARY, PHOTO_TEXT_SECONDARY } from "@/lib/studio/card-templates/chat-bubble";
import chatDeckFixture from "../../../../tests/studio/fixtures/deck-d100.v2.json";
import { assertChatListFits, assertChatListFitsAfterFonts, CardSlideScene } from "./CardSlideScene";

afterEach(cleanup);

function chatDeck(): CardDeckV3 {
  return {
    contract_version: "3.0", id: "deck_chat", template: "chat_bubble", ratio: "4:5", revision: 1,
    theme: { background: "#B2C7DA", foreground: "#12100E", accent: "#2563EB" },
    brand: { display_name: "OSMU", handle: "@osmu" }, hook_type: "pain",
    cta: { keyword: "저장", comment_example: "저장", save_reason: "나중에 다시 보기" },
    slides: [{
      id: "slide_chat", order: 0, role: "body", content_state: "filled", background: { kind: "solid", color: "#B2C7DA" },
      base: { kind: "chat_bubble", cover: null, bubbles: [
        { id: "bubble_reader", order: 0, speaker: "reader", segments: [{ text: "어떻게 바꿔요?", bold: false }], reaction: null },
        { id: "bubble_brand", order: 1, speaker: "brand", segments: [{ text: "로고를 ", bold: false }, { text: "직접 올리세요", bold: true }], reaction: "heart" },
      ] },
      elements: [
        { id: "el_bubble_reader", type: "text", name: "독자 말풍선", x: 420, y: 100, width: 590, height: 190, rotation: 0, z_index: 0, opacity: 1, locked: false, hidden: false, text: "어떻게 바꿔요?", style: { font_family: "Pretendard Variable", font_size: 38, font_weight: 500, line_height: 1.2, letter_spacing: 0, color: "#111111", align: "right", vertical_align: "middle" } },
        { id: "logo_overlay", type: "logo", name: "로고", x: 210, y: 300, width: 300, height: 120, rotation: 17, z_index: 2, opacity: .8, locked: false, hidden: false, asset_id: "builtin:logo-osmu", alt: "OSMU 로고", fit: "contain" },
      ],
    }],
  };
}

describe("CardSlideScene S5 카톡 원형과 자유 요소", () => {
  it("S5-AC4 화면과 PNG가 같은 컴포넌트에서 말풍선 원형·볼드·reaction·로고 좌표를 렌더한다", () => {
    const model = cardSlideRenderModel(chatDeck(), "slide_chat");
    const editor = render(<CardSlideScene model={model} renderMode="editor" />);
    const exportView = render(<CardSlideScene model={model} renderMode="export" />);
    const editorScene = editor.container.querySelector<HTMLElement>("[data-card-slide-scene]")!;
    const exportScene = exportView.container.querySelector<HTMLElement>("[data-card-slide-scene]")!;
    expect(within(editorScene).getByText("어떻게 바꿔요?")).toBeInTheDocument();
    expect(within(editorScene).getByText("직접 올리세요").tagName).toBe("STRONG");
    expect(within(editorScene).getByLabelText("좋아요")).toHaveTextContent("♥");
    expect(editorScene).not.toHaveTextContent("어떻게 바꿔요?어떻게 바꿔요?");
    const editorLogo = editorScene.querySelector<HTMLElement>("[data-card-element='logo_overlay']")!;
    const exportLogo = exportScene.querySelector<HTMLElement>("[data-card-element='logo_overlay']")!;
    expect(editorLogo.getAttribute("style")).toBe(exportLogo.getAttribute("style"));
    expect(exportScene).toHaveTextContent("어떻게 바꿔요?");
  });

  it("S5-R1-M1 표지·CTA를 대화 배경 위에 실제 장면으로 렌더한다", () => {
    const deck = migrateCardDeckV2ToV3(structuredClone(chatDeckFixture) as unknown as CardDeck);
    const cover = cardSlideRenderModel(deck, deck.slides[0].id);
    const cta = cardSlideRenderModel(deck, deck.slides.at(-1)!.id);
    const coverView = render(<CardSlideScene model={cover} renderMode="export" />);
    const ctaView = render(<CardSlideScene model={cta} renderMode="export" />);
    const coverScene = coverView.container.querySelector<HTMLElement>("[data-card-slide-scene]")!;
    const ctaScene = ctaView.container.querySelector<HTMLElement>("[data-card-slide-scene]")!;

    expect(cover.slide.background).toEqual({ kind: "solid", color: deck.theme.background });
    expect(cta.slide.background).toEqual({ kind: "solid", color: deck.theme.background });
    expect(coverScene).toHaveTextContent(deck.brand.display_name);
    expect(ctaScene).toHaveTextContent(deck.brand.display_name);
    expect(within(ctaScene).getAllByText(String(deck.slides.length)).length).toBeGreaterThan(0);
  });

  it("S5-R1-M2 사진 표지는 legacy PNG 렌더러와 같은 흰색 주·보조 글자 상수를 쓴다", () => {
    const source = structuredClone(chatDeckFixture) as unknown as CardDeck;
    source.slides[0].cover_image_url = "https://example.test/photo-cover.png";
    const deck = migrateCardDeckV2ToV3(source, {
      coverImageAssetIds: { "https://example.test/photo-cover.png": "photo-cover.png" },
    });
    const model = cardSlideRenderModel(deck, deck.slides[0].id);
    const view = render(<CardSlideScene model={model} renderMode="export" />);
    const scene = view.container.querySelector<HTMLElement>("[data-card-slide-scene]")!;

    expect(scene).toHaveStyle(`--card-chat-primary-text: ${PHOTO_TEXT_PRIMARY}`);
    expect(scene).toHaveStyle(`--card-chat-muted-text: ${PHOTO_TEXT_SECONDARY}`);
    expect(within(scene).getByRole("heading", { level: 2 })).toHaveTextContent(source.slides[0].cover!.headline.replace(/\s+/g, " "));
  });

  it("S5-R1-M3 export 장면은 말풍선 목록의 실측 높이가 할당 높이를 넘으면 잘라내지 않고 거절한다", () => {
    expect(() => assertChatListFits({ clientHeight: 600, scrollHeight: 602 }, 2))
      .toThrow("CARD_CHAT_OVERFLOW: 3번 장 말풍선이 카드보다 깁니다");
    expect(() => assertChatListFits({ clientHeight: 600, scrollHeight: 600 }, 2)).not.toThrow();
  });

  it("S5-R2-B Pretendard 로드가 끝난 뒤의 실측 높이로 넘침을 거절한다", async () => {
    let releaseFonts!: () => void;
    const fontsReady = new Promise<void>((resolve) => { releaseFonts = resolve; });
    const verification = assertChatListFitsAfterFonts({ clientHeight: 600, scrollHeight: 602 }, 2, fontsReady);
    let settled = false;
    void verification.finally(() => { settled = true; }).catch(() => undefined);

    await Promise.resolve();
    expect(settled).toBe(false);
    releaseFonts();
    await expect(verification).rejects.toThrow("CARD_CHAT_OVERFLOW: 3번 장 말풍선이 카드보다 깁니다");
  });

  it("S5-R2-A 작성자 첫 말풍선에만 이름·프로필을 렌더하고 독자 이름은 높이를 차지하지 않는다", () => {
    const deck = chatDeck();
    deck.brand.reader_name = "절대 렌더하지 않을 독자 이름";
    deck.brand.profile_image_asset_id = "profile-owned.png";
    const slide = deck.slides[0];
    if (slide.base.kind !== "chat_bubble") throw new Error("chat fixture required");
    slide.base.bubbles.push({ id: "bubble_brand_second", order: 2, speaker: "brand", segments: [{ text: "두 번째 답변", bold: false }], reaction: null });
    const model = cardSlideRenderModel(deck, "slide_chat", { "profile-owned.png": "https://example.test/profile.png" });
    const view = render(<CardSlideScene model={model} renderMode="editor" />);
    const scene = view.container.querySelector<HTMLElement>("[data-card-slide-scene]")!;
    expect(scene).not.toHaveTextContent("절대 렌더하지 않을 독자 이름");
    expect(scene.querySelectorAll("[data-chat-speaker-name]")).toHaveLength(1);
    expect(scene.querySelector("[data-chat-speaker-name]")).toHaveTextContent("OSMU");
    expect(scene.querySelectorAll("img")).toHaveLength(1);
    expect(scene.querySelector("img")).toHaveAttribute("src", "https://example.test/profile.png");
  });

  it("S5-R2-MINOR 대화 장 번호는 legacy PNG처럼 아래에 한 번만 렌더한다", () => {
    const view = render(<CardSlideScene model={cardSlideRenderModel(chatDeck(), "slide_chat")} renderMode="editor" />);
    const scene = view.container.querySelector<HTMLElement>("[data-card-slide-scene]")!;
    expect(within(scene).getAllByText("1")).toHaveLength(1);
  });

  it("S5-R2-MINOR 사진 배경의 흰 기본 글자색은 카톡 덱에만 적용한다", () => {
    const deck = createPlainCardDeckV3(["일반 카드", "두 번째 카드"], "deck_plain_photo");
    deck.theme.foreground = "#123456";
    deck.slides[0].background = { kind: "image", asset_id: "photo.png", fit: "cover", overlay: null };
    const view = render(<CardSlideScene model={cardSlideRenderModel(deck, deck.slides[0].id)} renderMode="editor" />);
    const scene = view.container.querySelector<HTMLElement>("[data-card-slide-scene]")!;
    expect(scene).toHaveStyle("--card-chat-primary-text: #123456");
    expect(scene).not.toHaveStyle(`--card-chat-primary-text: ${PHOTO_TEXT_PRIMARY}`);
  });
});
