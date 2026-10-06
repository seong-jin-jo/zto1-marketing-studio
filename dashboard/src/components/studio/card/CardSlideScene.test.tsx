// @vitest-environment jsdom
import "@testing-library/jest-dom/vitest";
import React from "react";
import { cleanup, render, within } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";
import type { CardDeckV3 } from "@/lib/studio/card-element-contract";
import { cardSlideRenderModel } from "@/lib/studio/card-render-model";
import { CardSlideScene } from "./CardSlideScene";

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
});
