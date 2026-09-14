// @vitest-environment jsdom
import "@testing-library/jest-dom/vitest";
import React from "react";
import fs from "fs";
import path from "path";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { EditRoom } from "@/components/studio/StudioRooms";
import { cardDeckRenderInputs, renderAndUploadCardDeck } from "@/lib/studio/card-deck";
import { channelImageCapacity, limitedChannelNotice, planChannelImages } from "@/lib/studio/channel-image-capacity";
import { cardTextTop } from "@/lib/studio/text-card-image";

/**
 * 2026-09-14 실측 사고 계약. 컨트롤러가 배포된 화면에서 카드뉴스를 끝까지 몰아 본 결과다.
 *
 * ① 생성실에서 글자 카드 3장을 만들었는데 편집실은 `1 / 1` 이었다. 3장이 통째로 사라졌다.
 * ② 편집실에서 글자를 고치고 비율을 1:1 로 바꿨는데 발행실에는 옛 본문과 옛 그림이 있었다.
 * ③ 발행 요청은 이미지를 한 장만 실었다.
 * ④ 생성실이 비율을 "4:5" 로 코드에 박아 두어 무엇을 고르든 픽셀이 1080×1350 하나였다.
 *
 * 설계 근거: docs/design-docs/osmu-four-room-ux-uplift-v1.0-opus-20260913.md §2.2 · §3.3 · §4.1 · §4.3
 */
const pageSrc = fs.readFileSync(path.resolve(__dirname, "../../src/app/studio/page.tsx"), "utf8");
const roomsSrc = fs.readFileSync(path.resolve(__dirname, "../../src/components/studio/StudioRooms.tsx"), "utf8");

afterEach(() => cleanup());

describe("카드뉴스 이음매 계약", () => {
  it("CARD-LINK-01 생성실이 만든 카드는 장수와 그림이 함께 편집실로 간다", () => {
    // 컴포넌트에 자리가 있어도 페이지가 안 이으면 고객은 못 본다. 배선까지 계약이다.
    expect(roomsSrc).toContain("onTextCardsCreated?.(persisted, lines)");
    expect(pageSrc).toContain("onTextCardsCreated={(urls, cardLines) => {");
    expect(pageSrc, "카드 글자가 편집실 목록으로 안 넘어간다").toContain("if (cardLines.length) setEditLines(cardLines)");
    expect(pageSrc, "카드 한 벌이 편집실로 안 넘어간다").toContain("previewImageUrls={img?.imageUrls ?? null}");
  });

  it("CARD-LINK-02 편집실은 카드 3장을 3장으로 그리고 고른 장의 그림을 보여 준다", () => {
    const deck = ["/api/media/card-1", "/api/media/card-2", "/api/media/card-3"];
    const { container } = render(
      <EditRoom
        kind="card"
        lines={["첫 장", "둘째 장", "셋째 장"]}
        onLinesChange={vi.fn()}
        previewReady
        previewImageUrl={deck[0]}
        previewImageUrls={deck}
      />,
    );
    // 장 목록이 3개다. 한 장으로 접히지 않는다.
    expect(container.querySelectorAll("[data-card-strip-item]")).toHaveLength(3);
    expect(screen.getByLabelText("장 전체 3개")).toBeInTheDocument();
    // 첫 장을 보고 있으면 첫 장의 그림이 걸린다.
    expect(container.querySelector('[data-edit-preview-media="image"]')?.getAttribute("src")).toBe(deck[0]);
    // 둘째 장을 누르면 둘째 장의 그림으로 바뀐다. 종전에는 어느 장을 눌러도 대표 한 장이었다.
    fireEvent.click(container.querySelector('[data-card-strip-item="1"]') as HTMLElement);
    expect(container.querySelector('[data-edit-preview-media="image"]')?.getAttribute("src")).toBe(deck[1]);
  });

  it("CARD-LINK-03 고친 글자와 옮긴 자리와 고른 비율이 그리는 입력에 실제로 들어간다", () => {
    const inputs = cardDeckRenderInputs({
      lines: ["계약서 조건, 딱 세 가지만 보세요", "", "둘째 장"],
      ratio: "1:1",
      positions: ["top-center", undefined, "bottom-center"],
    });
    // 빈 장은 빠지고 장 번호가 다시 매겨진다.
    expect(inputs).toHaveLength(2);
    expect(inputs[0].text).toBe("계약서 조건, 딱 세 가지만 보세요");
    expect(inputs[0].ratio).toBe("1:1");
    expect(inputs[0].position).toBe("top");
    expect(inputs[1].position).toBe("bottom");
    expect(inputs.map((one) => one.index)).toEqual([0, 1]);
    expect(inputs[1].total).toBe(2);
  });

  it("CARD-LINK-04 글자 자리는 실제 픽셀 좌표를 바꾼다", () => {
    // 상단은 여백 안쪽, 하단은 아래 여백 안쪽, 중앙은 한가운데.
    expect(cardTextTop("top", 1350, 400, 108)).toBe(108);
    expect(cardTextTop("center", 1350, 400, 108)).toBe(475);
    expect(cardTextTop("bottom", 1350, 400, 108)).toBe(842);
  });

  it("CARD-LINK-05 편집실을 떠날 때 고친 내용으로 카드를 다시 그려 저장한다", async () => {
    const drawn: string[] = [];
    const urls = await renderAndUploadCardDeck(
      { lines: ["고친 문장"], ratio: "1:1", positions: ["top-center"] },
      {
        render: (input) => { drawn.push(`${input.text}|${input.ratio}|${input.position}`); return "data:image/png;base64,AA"; },
        upload: async (_dataUrl, index) => `/api/media/redrawn-${index + 1}`,
      },
    );
    expect(drawn).toEqual(["고친 문장|1:1|top"]);
    expect(urls).toEqual(["/api/media/redrawn-1"]);
    // 페이지가 실제로 그 다시 그리기를 발행실로 가는 길에 건다.
    const move = pageSrc.slice(pageSrc.indexOf("async function moveToPublish()"));
    const upToSave = move.slice(0, move.indexOf("const savedDraftId"));
    expect(upToSave, "발행실로 갈 때 카드를 다시 그리지 않는다").toContain("await recompositeCards(linesToPersist)");
    expect(move, "다시 그린 그림이 저장에 안 실린다").toContain("redrawn ?? img");
  });

  it("CARD-LINK-06 발행은 채널 규격대로 여러 장을 싣는다", () => {
    const deck = ["a", "b", "c"];
    expect(planChannelImages("instagram", deck).images).toEqual(deck);
    expect(planChannelImages("threads", deck)).toEqual({ images: ["a"], dropped: 2 });
    expect(channelImageCapacity("instagram")).toBe(10);
    expect(planChannelImages("instagram", new Array(12).fill("x")).images).toHaveLength(10);
    // 발행 본문이 그 규격표를 실제로 쓴다. 인스타그램만 특별대우하던 분기는 없다.
    expect(pageSrc).toContain("image_urls: planChannelImages(p, publishDeck).images.length > 1");
    expect(pageSrc, "인스타그램만 여러 장이라는 하드코딩이 남아 있다").not.toContain('image_urls: p === "instagram"');
  });

  it("CARD-LINK-07 못 받는 채널은 화면에 그 사실을 밝힌다", () => {
    const label = (platform: string) => ({ threads: "스레드", instagram: "인스타그램" }[platform] ?? platform);
    expect(limitedChannelNotice(["threads", "instagram"], 3, label))
      .toContain("스레드");
    expect(limitedChannelNotice(["instagram"], 3, label)).toBeNull();
    expect(limitedChannelNotice(["threads"], 1, label)).toBeNull();
    expect(pageSrc, "발행실에 그 고지가 없다").toContain('data-testid="publish-image-capacity"');
  });

  it("CARD-LINK-09 빈 장이 섞여도 글자 자리가 밀리지 않는다", () => {
    // 2026-09-14 교차리뷰(Codex) 지적. 빈 줄을 먼저 걷어낸 뒤 원래 자리 목록을 그대로
    // 넘기면 셋째 장의 자리를 둘째 장 자리로 읽는다.
    const inputs = cardDeckRenderInputs({
      lines: ["A", "", "C"],
      ratio: "4:5",
      positions: ["top-center", "center", "bottom-center"],
    });
    expect(inputs.map((one) => one.position)).toEqual(["top", "bottom"]);
    // 페이지도 빈 줄을 미리 걷어내지 않는다.
    const recomposite = pageSrc.slice(pageSrc.indexOf("async function recompositeCards("));
    expect(recomposite.slice(0, recomposite.indexOf("renderAndUploadCardDeck")))
      .not.toContain("lines.filter((line) => line.trim())");
  });

  it("CARD-LINK-10 아주 긴 글도 카드 위로 잘려 나가지 않는다", () => {
    // 덩어리가 카드보다 크면 가운데 값이 음수가 되어 첫 줄이 화면 밖으로 나간다.
    expect(cardTextTop("center", 1080, 2000, 108)).toBe(0);
  });

  it("CARD-LINK-08 카드 비율을 코드에 박지 않는다", () => {
    expect(roomsSrc, "생성실이 비율을 4:5 로 박아 두었다").not.toContain('const ratio: CardRatio = "4:5"');
    expect(roomsSrc).toContain("ratio: cardRatio");
    expect(pageSrc, "고른 비율이 생성실로 안 간다").toContain("cardRatio={cardAspectRatio}");
    expect(pageSrc).toContain('const cardAspectRatio = editFormat.kind === "card" ? editFormat.aspectRatio : "4:5"');
  });
});
