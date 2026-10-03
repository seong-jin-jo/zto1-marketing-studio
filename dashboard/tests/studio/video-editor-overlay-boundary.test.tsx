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
});
