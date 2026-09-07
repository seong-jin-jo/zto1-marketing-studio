// @vitest-environment jsdom
import "@testing-library/jest-dom/vitest";
import React from "react";
import { cleanup, render } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";
import { EditPreview } from "@/components/studio/EditPreview";

// 2026-09-08 회장 실사용: "생성한 다음 편집실 가면 카드뉴스 영상 아무것도 안 나온다".
// 편집실은 준비 여부(참거짓)만 받고 산출물 주소를 아예 못 받아, 무엇을 만들었든
// "여기에 화면이 놓입니다" 라는 자리표시자만 그렸다. 만든 것을 보면서 고치는 방이
// 정작 만든 것을 안 보여 준 셈이다.
// 계약: 산출물 주소가 있으면 그것을 그린다.
afterEach(() => cleanup());

describe("편집실 미리보기", () => {
  it("카드뉴스는 만든 이미지를 그린다", () => {
    const { container } = render(
      <EditPreview kind="card" lines={["한 줄"]} activeLine={0} onActiveLine={() => {}} renderReady mediaUrl="/api/media/tok" />,
    );
    const img = container.querySelector('[data-edit-preview-media="image"]');
    expect(img).toBeInTheDocument();
    expect(img?.getAttribute("src")).toBe("/api/media/tok");
  });

  it("영상은 만든 영상을 그린다", () => {
    const { container } = render(
      <EditPreview kind="video" lines={["한 줄"]} activeLine={0} onActiveLine={() => {}} renderReady mediaUrl="/api/media/vid" />,
    );
    const video = container.querySelector('[data-edit-preview-media="video"]');
    expect(video).toBeInTheDocument();
    expect(video?.getAttribute("src")).toBe("/api/media/vid");
  });

  it("산출물이 없으면 종전대로 자리표시자를 그린다", () => {
    const { container } = render(
      <EditPreview kind="card" lines={["한 줄"]} activeLine={0} onActiveLine={() => {}} />,
    );
    expect(container.querySelector("[data-edit-preview-media]")).toBeNull();
  });
});
