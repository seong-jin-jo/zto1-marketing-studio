// @vitest-environment jsdom
import "@testing-library/jest-dom/vitest";
import React from "react";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { VideoEditor } from "@/components/studio/VideoEditor";
import { emptyVideoEdit, type VideoEdit } from "@/lib/studio/video-edit-contract";

afterEach(() => cleanup());

/**
 * M2 경계 회귀 테스트(2026-09-22 코드리뷰). 재생 위치가 영상 끝(duration)에 닿은 채
 * 오버레이를 추가하면 옛 코드는 `min(clipEnd, playhead+3)`이 playhead와 같아져
 * startSec===endSec인 오버레이를 만들었고, addOverlay가 그 값을 검증 없이 그대로
 * 받아들여 800ms 뒤 자동저장이 400으로 실패했다. VideoEditor.tsx의 overlayStart/overlayEnd
 * 클램프가 영상 끝에서도 항상 양의 구간을 만드는지 확인한다.
 */
describe("VideoEditor 오버레이 경계", () => {
  beforeEach(() => {
    vi.stubGlobal("fetch", vi.fn(async () => ({ ok: false, status: 503, json: async () => ({ code: "ELEVENLABS_NOT_CONFIGURED" }) })));
  });

  it("재생 위치가 영상 끝이어도 추가한 오버레이는 항상 startSec < endSec다", () => {
    let edit: VideoEdit = emptyVideoEdit();
    const handleChange = (next: VideoEdit) => { edit = next; };
    const { rerender } = render(
      <VideoEditor videoEdit={edit} onVideoEditChange={handleChange} previewVideoUrl="/api/media/test-video-token" />,
    );

    const video = document.querySelector("[data-video-el]") as HTMLVideoElement;
    Object.defineProperty(video, "duration", { value: 3, configurable: true });
    fireEvent.loadedMetadata(video);
    Object.defineProperty(video, "currentTime", { value: 3, configurable: true, writable: true });
    fireEvent.timeUpdate(video);

    const overlayInput = screen.getByLabelText("오버레이 문구");
    fireEvent.change(overlayInput, { target: { value: "마지막 순간 훅" } });
    const addButton = screen.getAllByText(/구간에 추가/)[0];
    fireEvent.click(addButton);

    expect(edit.overlays).toHaveLength(1);
    expect(edit.overlays[0].endSec).toBeGreaterThan(edit.overlays[0].startSec);
    rerender(<VideoEditor videoEdit={edit} onVideoEditChange={handleChange} previewVideoUrl="/api/media/test-video-token" />);
    expect(document.querySelector("[data-video-editor-error]")).toBeNull();
  });

  it("PREVIEW-OUTSIDE-BODY 정상: 인트로·아웃트로를 재생할 때 본문 자막·훅·CTA·댓글을 숨긴다", () => {
    const edit: VideoEdit = {
      ...emptyVideoEdit(),
      overlays: [
        { id: "hook-1", order: 0, kind: "hook", text: "본문 훅", startSec: 0, endSec: 3 },
        { id: "cta-1", order: 1, kind: "cta", text: "본문 CTA", startSec: 0, endSec: 3 },
      ],
      comments: [
        { id: "comment-1", order: 0, author: "실사용자", text: "본문 댓글", source: "collected", startSec: 0, endSec: 3 },
      ],
      subtitles: [
        { id: "subtitle-1", order: 0, text: "본문 첫 자막", startSec: 0, endSec: 3, cut: false },
      ],
      introOutro: {
        introCompId: "intro-logo-reveal",
        outroCompId: "outro-logo-reveal",
        resultFilename: "video-concat-boundary.mp4",
        deliverUrl: "/api/media/signed-boundary",
        sourceFilename: "body.mp4",
      },
    };
    render(
      <VideoEditor
        videoEdit={edit}
        onVideoEditChange={() => {}}
        previewVideoUrl="/api/media/body"
        sourceFilename="body.mp4"
        lines={["본문 첫 자막"]}
      />,
    );

    const video = document.querySelector("[data-video-el]") as HTMLVideoElement;
    Object.defineProperty(video, "duration", { value: 6.5, configurable: true });
    fireEvent.loadedMetadata(video);

    Object.defineProperty(video, "currentTime", { value: 0.5, configurable: true, writable: true });
    fireEvent.timeUpdate(video);
    expect(document.querySelector("[data-video-overlay-active]")).toBeNull();
    expect(document.querySelector("[data-video-comment-active]")).toBeNull();
    expect(document.querySelector("[data-video-subtitle-active]")).toBeNull();

    video.currentTime = 2.5;
    fireEvent.timeUpdate(video);
    expect(document.querySelectorAll("[data-video-overlay-active]")).toHaveLength(2);
    expect(document.querySelector("[data-video-comment-active]")).not.toBeNull();
    expect(document.querySelector("[data-video-subtitle-active]")).not.toBeNull();

    video.currentTime = 5.5;
    fireEvent.timeUpdate(video);
    expect(document.querySelector("[data-video-overlay-active]")).toBeNull();
    expect(document.querySelector("[data-video-comment-active]")).toBeNull();
    expect(document.querySelector("[data-video-subtitle-active]")).toBeNull();
  });

  it("VIDEO-PREVIEW-SINGLE-LAYER-01 구운 파일을 재생하면 인트로·아웃트로가 없어도 DOM 자막을 그리지 않는다", () => {
    const edit: VideoEdit = {
      ...emptyVideoEdit(),
      subtitles: [
        { id: "subtitle-1", order: 0, text: "이미 구운 자막", startSec: 0, endSec: 3, cut: false },
      ],
    };
    render(
      <VideoEditor
        videoEdit={edit}
        onVideoEditChange={() => {}}
        previewVideoUrl="/api/media/baked-with-text"
        sourceFilename="baked-with-text.mp4"
        previewContainsBakedText
        lines={["이미 구운 자막"]}
      />,
    );

    const video = document.querySelector("[data-video-el]") as HTMLVideoElement;
    Object.defineProperty(video, "duration", { value: 3, configurable: true });
    fireEvent.loadedMetadata(video);
    Object.defineProperty(video, "currentTime", { value: 1, configurable: true, writable: true });
    fireEvent.timeUpdate(video);
    expect(document.querySelectorAll("[data-video-subtitle-active]")).toHaveLength(0);
  });

  it("VIDEO-PREVIEW-SINGLE-LAYER-01B 원본 합성본이 있으면 그것을 재생하고 DOM 자막을 한 층만 그린다", () => {
    const edit: VideoEdit = {
      ...emptyVideoEdit(),
      subtitles: [
        { id: "subtitle-1", order: 0, text: "고친 자막", startSec: 0, endSec: 3, cut: false },
      ],
      introOutro: {
        introCompId: null,
        outroCompId: null,
        compositeFilename: "composite-without-text.mp4",
        compositeDeliverUrl: "/api/media/composite-without-text",
        resultFilename: "baked-with-text.mp4",
        deliverUrl: "/api/media/baked-with-text",
        sourceFilename: "body.mp4",
      },
    };
    render(
      <VideoEditor
        videoEdit={edit}
        onVideoEditChange={() => {}}
        previewVideoUrl="/api/media/body"
        sourceFilename="body.mp4"
        lines={["고친 자막"]}
      />,
    );

    const video = document.querySelector("[data-video-el]") as HTMLVideoElement;
    expect(video.getAttribute("src")).toBe("/api/media/composite-without-text");
    Object.defineProperty(video, "duration", { value: 5, configurable: true });
    fireEvent.loadedMetadata(video);
    Object.defineProperty(video, "currentTime", { value: 2.5, configurable: true, writable: true });
    fireEvent.timeUpdate(video);
    expect(document.querySelectorAll("[data-video-subtitle-active]")).toHaveLength(1);
  });

  it("VIDEO-PREVIEW-SINGLE-LAYER-01C 기존 합성 데이터도 원본 파일명에 구운 URL을 짝짓지 않는다", () => {
    const edit: VideoEdit = {
      ...emptyVideoEdit(),
      subtitles: [
        { id: "subtitle-1", order: 0, text: "고친 자막", startSec: 0, endSec: 3, cut: false },
      ],
      introOutro: {
        introCompId: "intro-logo-reveal",
        outroCompId: null,
        compositeFilename: "composite-without-text.mp4",
        resultFilename: "baked-with-text.mp4",
        deliverUrl: "/api/media/baked-with-text",
        sourceFilename: "body.mp4",
      },
    };
    render(
      <VideoEditor
        videoEdit={edit}
        onVideoEditChange={() => {}}
        previewVideoUrl="/api/media/composite-without-text"
        sourceFilename="composite-without-text.mp4"
        lines={["고친 자막"]}
      />,
    );

    const video = document.querySelector("[data-video-el]") as HTMLVideoElement;
    expect(video.getAttribute("src")).toBe("/api/media/composite-without-text");
    Object.defineProperty(video, "duration", { value: 5, configurable: true });
    fireEvent.loadedMetadata(video);
    Object.defineProperty(video, "currentTime", { value: 2.5, configurable: true, writable: true });
    fireEvent.timeUpdate(video);
    expect(document.querySelectorAll("[data-video-subtitle-active]")).toHaveLength(1);
  });

  it("VIDEO-PREVIEW-NORMALIZE-01 겹친 원본 자막 대신 내보내기와 같은 정규화 구간을 보여준다", () => {
    const edit: VideoEdit = {
      ...emptyVideoEdit(),
      subtitles: [
        { id: "subtitle-1", order: 0, text: "첫 문장", startSec: 0, endSec: 3, cut: false },
        { id: "subtitle-2", order: 1, text: "둘째 문장", startSec: 1.5, endSec: 4, cut: false },
      ],
    };
    render(
      <VideoEditor
        videoEdit={edit}
        onVideoEditChange={() => {}}
        previewVideoUrl="/api/media/source"
        sourceFilename="source.mp4"
        lines={["첫 문장", "둘째 문장"]}
      />,
    );

    const video = document.querySelector("[data-video-el]") as HTMLVideoElement;
    Object.defineProperty(video, "duration", { value: 3.875, configurable: true });
    fireEvent.loadedMetadata(video);
    Object.defineProperty(video, "currentTime", { value: 2, configurable: true, writable: true });
    fireEvent.timeUpdate(video);
    expect(document.querySelector("[data-video-subtitle-active]")).toHaveTextContent("둘째 문장");
    expect(document.querySelector("[data-video-subtitle-active]")).not.toHaveTextContent("첫 문장");
  });

  it("VIDEO-PREVIEW-SINGLE-LAYER-02 원본을 못 찾은 기존 구운 파일은 DOM 글자층을 숨긴다", () => {
    const edit: VideoEdit = {
      ...emptyVideoEdit(),
      overlays: [{ id: "hook-1", order: 0, kind: "hook", text: "구운 훅", startSec: 0, endSec: 3 }],
      subtitles: [{ id: "subtitle-1", order: 0, text: "구운 자막", startSec: 0, endSec: 3, cut: false }],
      introOutro: {
        introCompId: null,
        outroCompId: null,
        compositeFilename: "composite-without-text.mp4",
        resultFilename: "baked-with-text.mp4",
        deliverUrl: "/api/media/baked-with-text",
        sourceFilename: "body.mp4",
      },
    };
    render(
      <VideoEditor
        videoEdit={edit}
        onVideoEditChange={() => {}}
        previewVideoUrl="/api/media/baked-with-text"
        sourceFilename="baked-with-text.mp4"
        lines={["구운 자막"]}
      />,
    );

    const video = document.querySelector("[data-video-el]") as HTMLVideoElement;
    Object.defineProperty(video, "duration", { value: 3, configurable: true });
    fireEvent.loadedMetadata(video);
    Object.defineProperty(video, "currentTime", { value: 1, configurable: true, writable: true });
    fireEvent.timeUpdate(video);
    expect(document.querySelector("[data-video-overlay-active]")).toBeNull();
    expect(document.querySelector("[data-video-subtitle-active]")).toBeNull();
  });
});
