// @vitest-environment jsdom
import "@testing-library/jest-dom/vitest";
import React from "react";
import { cleanup, render } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { VideoEditor } from "@/components/studio/VideoEditor";
import { emptyVideoEdit, type VideoEdit } from "@/lib/studio/video-edit-contract";

afterEach(() => cleanup());
beforeEach(() => {
  vi.stubGlobal("fetch", vi.fn(async () => ({ ok: false, status: 503, json: async () => ({ code: "ELEVENLABS_NOT_CONFIGURED" }) })));
});

// 2026-10-02 독립 리뷰 M-3(미리보기 401): `<video src="/api/higgsfield/asset/...">`는
// proxy.ts TENANT_AWARE_PATHS에 걸려 Bearer 토큰을 요구하는데, <video> 태그는
// Authorization 헤더를 못 보낸다 — 그래서 미리보기가 조용히 401로 깨졌다("원본만 보인다"
// 반려의 실제 원인 중 하나). job GET이 돌려주는 서명 배달 URL(/api/media/<token>, 자체
// HMAC 검증이라 Bearer 불필요)을 videoEdit.introOutro.deliverUrl에 저장해 그걸 쓴다.
describe("VideoEditor — 인트로/아웃트로 적용 시 미리보기 URL", () => {
  it("deliverUrl(서명된 /api/media/<token>)을 쓴다 — Bearer가 필요한 /api/higgsfield/asset/ 가 아니다", () => {
    const edit: VideoEdit = {
      ...emptyVideoEdit(),
      introOutro: {
        introCompId: "intro-logo-reveal",
        outroCompId: null,
        resultFilename: "video-concat-xyz.mp4",
        deliverUrl: "/api/media/signed-token-abc",
        sourceFilename: "original-source.mp4",
      },
    };
    render(
      <VideoEditor
        videoEdit={edit}
        onVideoEditChange={() => {}}
        previewVideoUrl="/api/higgsfield/asset/video-original.mp4?tenant_id=t1"
        sourceFilename="original-source.mp4"
        tenantId="t1"
      />,
    );
    const video = document.querySelector("[data-video-el]") as HTMLVideoElement;
    expect(video.getAttribute("src")).toBe("/api/media/signed-token-abc");
    expect(video.getAttribute("src")).not.toMatch(/\/api\/higgsfield\/asset\//);
  });

  // 2026-10-02 독립 리뷰 M-4: 합성 당시 원본(sourceFilename)과 지금 원본이 다르면
  // (생성실에서 영상을 다시 만든 뒤) 낡은 합성이다 — 미리보기도 원본으로 되돌리고
  // 안내 문구를 보여준다.
  it("원본이 합성 당시와 달라졌으면(낡음) 미리보기를 원본으로 되돌리고 안내한다", () => {
    const edit: VideoEdit = {
      ...emptyVideoEdit(),
      introOutro: {
        introCompId: "intro-logo-reveal",
        outroCompId: null,
        resultFilename: "video-concat-OLD.mp4",
        deliverUrl: "/api/media/signed-token-old",
        sourceFilename: "video-OLD.mp4",
      },
    };
    render(
      <VideoEditor
        videoEdit={edit}
        onVideoEditChange={() => {}}
        previewVideoUrl="/api/media/current-source-token"
        sourceFilename="video-NEW.mp4"
        tenantId="t1"
      />,
    );
    const video = document.querySelector("[data-video-el]") as HTMLVideoElement;
    expect(video.getAttribute("src")).toBe("/api/media/current-source-token");
    expect(video.getAttribute("src")).not.toBe("/api/media/signed-token-old");
    expect(document.querySelector("[data-intro-outro-stale-notice]")).not.toBeNull();
  });
});
