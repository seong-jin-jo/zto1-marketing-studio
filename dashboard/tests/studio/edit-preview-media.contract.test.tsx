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
      <EditPreview kind="video" lines={["한 줄"]} activeLine={0} onActiveLine={() => {}} renderReady mediaUrl="/api/media/vid" mediaType="video" />,
    );
    const video = container.querySelector('[data-edit-preview-media="video"]');
    expect(video).toBeInTheDocument();
    expect(video?.getAttribute("src")).toBe("/api/media/vid");
  });

  it("영상 편집 중이라도 파일이 이미지면 이미지로 그린다", () => {
    // 숏폼 영상은 대표 이미지를 움직여 만든다. 영상이 아직 없을 때 바탕 이미지를 영상
    // 태그에 넣으면 아무것도 안 보인다(2026-09-08 실측).
    const { container } = render(
      <EditPreview kind="video" lines={["한 줄"]} activeLine={0} onActiveLine={() => {}} renderReady mediaUrl="/api/media/img" mediaType="image" />,
    );
    expect(container.querySelector('[data-edit-preview-media="image"]')).toBeInTheDocument();
    expect(container.querySelector('[data-edit-preview-media="video"]')).toBeNull();
  });

  it("산출물이 없으면 종전대로 자리표시자를 그린다", () => {
    const { container } = render(
      <EditPreview kind="card" lines={["한 줄"]} activeLine={0} onActiveLine={() => {}} />,
    );
    expect(container.querySelector("[data-edit-preview-media]")).toBeNull();
  });

  // 2026-09-21 회장 지적: 영상 탭에서 "재생도 안 된다". 원인은 자리표시 레이어가 영상 유무와
  // 상관없이 항상 absolute inset-0 로 <video controls> 위를 덮어 클릭이 그 레이어로 먼저
  // 잡히던 것이었다. 영상 주소가 있을 때는 그 레이어가 아예 없어야 video 가 클릭을 받는다.
  it("영상 URL이 있으면 자리표시 레이어가 video 위를 덮지 않는다(컨트롤이 클릭 가능)", () => {
    const { container } = render(
      <EditPreview kind="video" lines={["한 줄"]} activeLine={0} onActiveLine={() => {}} renderReady mediaUrl="/api/media/vid" mediaType="video" />,
    );
    const video = container.querySelector('[data-edit-preview-media="video"]');
    expect(video).toBeInTheDocument();
    // 프레임 안에 video 형제로 absolute inset-0 자리표시 레이어가 남아있으면 안 된다.
    const frame = container.querySelector("[data-edit-preview-frame]");
    const overlays = frame ? Array.from(frame.querySelectorAll("div.absolute.inset-0")) : [];
    expect(overlays).toHaveLength(0);
    // 자막 등 video 뒤(DOM 순서상 다음)에 오는 위치지정(absolute/fixed) 형제는 전부
    // pointer-events-none 이어야 한다 — 안 그러면 그 형제가 클릭을 가로챈다(교차 리뷰 PR #66
    // MAJOR 3, 1:1·16:9처럼 하단 여백이 없는 규격에서 자막이 크롬 컨트롤 바를 덮는 사례).
    let node: Element | null = video;
    const blockingSiblings: Element[] = [];
    while (node && (node = node.nextElementSibling)) {
      const style = window.getComputedStyle(node);
      const positioned = style.position === "absolute" || style.position === "fixed" || node.className.includes("absolute");
      if (positioned && style.pointerEvents !== "none" && !node.className.includes("pointer-events-none")) {
        blockingSiblings.push(node);
      }
    }
    expect(blockingSiblings).toHaveLength(0);
  });

  it("영상이 아직 없으면 조용히 빈 화면 대신 명시 안내 문구를 보여준다", () => {
    render(
      <EditPreview kind="video" lines={["한 줄"]} activeLine={0} onActiveLine={() => {}} mediaType="video" />,
    );
    expect(document.body.textContent).toContain("아직 영상이 없습니다");
    expect(document.body.textContent).toContain("숏폼 영상 만들기");
  });
});
