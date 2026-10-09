// @vitest-environment jsdom
import "@testing-library/jest-dom/vitest";
import React from "react";
import { readFileSync } from "node:fs";
import path from "node:path";
import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { EditPreview } from "@/components/studio/EditPreview";
import {
  renderAndUploadEmbeddedTextCard,
  renderPlainCardDeck,
  renderPlainCardDeckIncremental,
} from "@/lib/studio/card-deck";
import type { TextCardInput } from "@/lib/studio/text-card-image";
import {
  embeddedTextCardImage,
  isLegacyEmbeddedTextCard,
  recoverDraftEmbeddedTextCard,
  recoverEmbeddedTextCard,
} from "@/lib/studio/text-card-provenance";

afterEach(() => cleanup());

describe("TEXTCARD-OVERLAY-01 무료 글자 카드 편집 무대", () => {
  it("TEXTCARD-OVERLAY-01W 배선: 생성실 글자 카드 표식이 편집실까지 같은 정본으로 전달된다", () => {
    const pageSource = readFileSync(path.join(process.cwd(), "src/app/studio/page.tsx"), "utf8");

    expect(pageSource).toContain("onTextCardsCreated={(urls, cardLines) => {");
    expect(pageSource).toContain("embeddedTextCardImage({ url: urls[0], file: urls[0], imageUrls: urls, topicKey: mediaTopicKey(idea) })");
    expect(pageSource).toContain("renderAndUploadEmbeddedTextCard({");
    // R7: 운영 구형·신형 이미지 필드를 먼저 compatibleDraft로 정규화한 뒤에도
    // embedded text provenance 복구가 반드시 같은 경로를 지나야 한다.
    expect(pageSource).toContain("img: normalizeDraftImage(d)");
    expect(pageSource).toContain("recoverDraftEmbeddedTextCard<ImgResult>(compatibleDraft)");
    expect(pageSource).toContain("recoverDraftEmbeddedTextCard<ImgResult>(w)");
    expect(pageSource).toContain('cardDeck?.template === "chat_bubble"');
    expect(pageSource).toContain("cardTextEmbedded={img?.textEmbedded === true}");
  });

  it("TEXTCARD-OVERLAY-01A 정상: 글자가 PNG에 포함된 카드는 같은 문구의 이동 막대와 textarea를 다시 겹치지 않는다", () => {
    const { container } = render(
      <EditPreview
        kind="card"
        lines={["상위권 공부법을 그대로 따라 하고 있었어요"]}
        activeLine={0}
        onActiveLine={() => {}}
        renderReady
        mediaUrl="/api/media/text-card-1.png"
        cardTextEmbedded
      />,
    );

    expect(container.querySelector('[data-edit-preview-media="image"]')).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "카드 글자 끌어 옮기기" })).not.toBeInTheDocument();
    expect(screen.queryByRole("textbox", { name: "카드 1 글자" })).not.toBeInTheDocument();
    expect(screen.queryByText("여기에 카드 화면이 놓입니다")).not.toBeInTheDocument();
  });

  it("TEXTCARD-OVERLAY-01B 경계: 글자 없는 일반 배경 이미지는 기존 편집 글자 레이어를 유지한다", () => {
    render(
      <EditPreview
        kind="card"
        lines={["사진 위에 올릴 문구"]}
        activeLine={0}
        onActiveLine={() => {}}
        renderReady
        mediaUrl="/api/media/background.png"
        cardTextEmbedded={false}
      />,
    );

    // 계약 갱신 근거: wiki/거버넌스/결정.md OD-2026-10-09-2.
    // 회장 원문: "그냥 텍스트 이동하면 되는거지". 별도 이동 버튼은 없애되 일반 배경의
    // 편집 가능한 글자 레이어와 직접 드래그 표면은 반드시 남아야 한다.
    expect(screen.getByRole("group", { name: "카드 글자 직접 끌어 옮기기" })).toBeInTheDocument();
    expect(screen.getByRole("textbox", { name: "카드 1 글자" })).toHaveValue("사진 위에 올릴 문구");
  });

  it("PR95-R1-LEGACY-01 정상: 구형 무료 글자 카드의 엄격한 저장 서명만 표식을 복구한다", () => {
    const legacy = {
      url: "/api/images/deliver/one",
      file: "/api/images/deliver/one",
      imageUrls: ["/api/images/deliver/one", "/api/images/deliver/two"],
      topicKey: "카드 주제",
    };
    const input = { editKind: "card", editLines: ["첫 문장", "둘째 문장"], cardDeck: null };

    expect(isLegacyEmbeddedTextCard({ img: legacy, ...input })).toBe(true);
    expect(recoverEmbeddedTextCard(legacy, input)).toEqual({ ...legacy, textEmbedded: true });
  });

  it("PR95-R1-LEGACY-02 경계: 일반 다중 배경·외부 덱·장수 불일치는 글자 내장 카드로 추측하지 않는다", () => {
    const multiBackground = {
      url: "/api/images/deliver/one",
      file: "/api/images/deliver/one",
      imageUrls: ["/api/images/deliver/one", "/api/images/deliver/two"],
    };
    expect(isLegacyEmbeddedTextCard({ img: multiBackground, editKind: "card", editLines: ["A", "B"], cardDeck: null })).toBe(false);
    expect(isLegacyEmbeddedTextCard({ img: { ...multiBackground, topicKey: "주제" }, editKind: "card", editLines: ["A", "B"], cardDeck: { template: "chat_bubble" } })).toBe(false);
    expect(isLegacyEmbeddedTextCard({ img: { ...multiBackground, topicKey: "주제", aspectRatio: "4:5" }, editKind: "card", editLines: ["A", "B"], cardDeck: null })).toBe(false);
    expect(isLegacyEmbeddedTextCard({ img: { ...multiBackground, topicKey: "주제" }, editKind: "card", editLines: ["A"], cardDeck: null })).toBe(false);
  });

  it("PR95-R1-LEGACY-03 정상: 서버 초안·브라우저 저장본과 plain 덱도 같은 복구 진입점에서 표식을 얻는다", () => {
    const legacyDraft = {
      img: {
        url: "/api/images/deliver/one",
        file: "/api/images/deliver/one",
        imageUrls: ["/api/images/deliver/one"],
        topicKey: "구형 저장본",
      },
      editKind: "card",
      editLines: ["이미 그림에 든 한 문장"],
      cardDeck: { template: "plain" },
    };
    expect(recoverDraftEmbeddedTextCard(legacyDraft)).toEqual(expect.objectContaining({ textEmbedded: true }));
    expect(recoverDraftEmbeddedTextCard({ ...legacyDraft, cardDeck: { template: "chat_bubble" } }))
      .toEqual(expect.not.objectContaining({ textEmbedded: true }));
  });

  it("PR95-R1-LIVE-01 정상: 문구와 위치가 바뀌면 저장 전 미리보기 data URL도 즉시 다시 그린다", () => {
    const renderCard = (input: TextCardInput) => `data:image/png,${input.text}|${input.position}`;
    const before = renderPlainCardDeck({ lines: ["바꾸기 전"], ratio: "4:5", positions: ["center"] }, renderCard);
    const afterText = renderPlainCardDeck({ lines: ["바꾼 문구"], ratio: "4:5", positions: ["center"] }, renderCard);
    const afterPosition = renderPlainCardDeck({ lines: ["바꾼 문구"], ratio: "4:5", positions: ["bottom-center"] }, renderCard);

    expect(before).not.toEqual(afterText);
    expect(afterText).not.toEqual(afterPosition);
    expect(afterPosition[0]).toContain("바꾼 문구|bottom");
  });

  it("PR95-R1-LIVE-02 성능: 한 장만 바뀌면 그 장만 다시 그리고 캐시는 현재 덱 길이로 제한한다", () => {
    const renderCard = vi.fn((input: TextCardInput) => `data:image/png,${input.text}|${input.position}`);
    const first = renderPlainCardDeckIncremental({ lines: ["A", "B", "C"], ratio: "4:5" }, [], renderCard);
    expect(renderCard).toHaveBeenCalledTimes(3);

    const second = renderPlainCardDeckIncremental({ lines: ["A", "바뀐 B", "C"], ratio: "4:5" }, first.cache, renderCard);
    expect(renderCard).toHaveBeenCalledTimes(4);
    expect(second.urls[0]).toBe(first.urls[0]);
    expect(second.urls[1]).not.toBe(first.urls[1]);
    expect(second.cache).toHaveLength(3);

    const unchanged = renderPlainCardDeckIncremental({ lines: ["A", "바뀐 B", "C"], ratio: "4:5" }, second.cache, renderCard);
    expect(renderCard).toHaveBeenCalledTimes(4);
    const shorter = renderPlainCardDeckIncremental({ lines: ["A", "바뀐 B"], ratio: "4:5" }, unchanged.cache, renderCard);
    expect(renderCard).toHaveBeenCalledTimes(6);
    expect(shorter.cache).toHaveLength(2);
  });

  it("PR95-R9-RECOMPOSE-SLOT-01 경계: 중간 빈 문구도 빈 카드로 그려 원본 인덱스 3칸을 보존한다", () => {
    const renderCard = vi.fn((input: TextCardInput) => `img:${input.index}:${input.text || "빈 카드"}:${input.total}`);

    const result = renderPlainCardDeckIncremental({ lines: ["A", "", "C"], ratio: "4:5" }, [], renderCard);

    expect(result.urls).toEqual([
      "img:0:A:3",
      "img:1:빈 카드:3",
      "img:2:C:3",
    ]);
    expect(result.cache).toHaveLength(3);
    expect(renderCard).toHaveBeenCalledTimes(3);
  });

  it("PR95-R1-MUTATION-01 표식 생성자를 제거하면 저장·재합성 생명주기 계약이 실패한다", () => {
    expect(embeddedTextCardImage({ url: "one", file: "one", imageUrls: ["one"] })).toEqual({
      url: "one",
      file: "one",
      imageUrls: ["one"],
      textEmbedded: true,
    });
  });

  it("PR95-R1-RECOMPOSE-01 정상: 발행 재합성 호출 자체가 업로드 결과에 표식을 붙인다", async () => {
    const img = await renderAndUploadEmbeddedTextCard(
      { lines: ["다시 그린 문장"], ratio: "4:5", positions: ["top-center"] },
      {
        render: () => "data:image/png,recomposed",
        upload: async (_dataUrl, index) => `/api/images/deliver/recomposed-${index}`,
      },
      "주제",
    );
    expect(img).toEqual(expect.objectContaining({
      imageUrls: ["/api/images/deliver/recomposed-0"],
      textEmbedded: true,
    }));
  });
});
