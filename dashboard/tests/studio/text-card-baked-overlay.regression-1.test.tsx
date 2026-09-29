// @vitest-environment jsdom
import "@testing-library/jest-dom/vitest";
import React from "react";
import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";
import { EditPreview } from "@/components/studio/EditPreview";

afterEach(() => cleanup());

describe("TEXTCARD-OVERLAY-01 무료 글자 카드 편집 무대", () => {
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

    expect(screen.getByRole("button", { name: "카드 글자 끌어 옮기기" })).toBeInTheDocument();
    expect(screen.getByRole("textbox", { name: "카드 1 글자" })).toHaveValue("사진 위에 올릴 문구");
  });
});
