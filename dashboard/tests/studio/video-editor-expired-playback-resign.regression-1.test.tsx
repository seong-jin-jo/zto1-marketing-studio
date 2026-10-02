// @vitest-environment jsdom
//
// 2026-10-02 결함(회장 지적): 편집실 영상이 재생 안 된다.
// VideoPlayback(VideoEditor.tsx)은 previewVideoUrl(서명 배달 주소, 12시간 만료)을
// <video src>에 문자열 그대로 꽂았다. 토큰이 만료되면 파일은 서버에 그대로 있는데도
// 404로 "영상을 불러오지 못했습니다"만 떴다. DeliveredMedia(카드·발행실 미리보기)가
// 쓰는 /api/media/resign 재서명 경로를 이 플레이어에도 적용한다.
import "@testing-library/jest-dom/vitest";
import React from "react";
import { cleanup, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/lib/auth", () => ({ authHeaders: () => ({}) }));
import { VideoEditor } from "@/components/studio/VideoEditor";
import { emptyVideoEdit } from "@/lib/studio/video-edit-contract";

function deliveryUrl(filename: string, tenant: string, expiresAtMs: number): string {
  const body = Buffer.from(JSON.stringify({ v: 1, t: tenant, f: filename, e: expiresAtMs }), "utf8").toString("base64url");
  return `/api/media/${body}.c2ln`;
}

const fetchMock = vi.fn();

beforeEach(() => {
  fetchMock.mockReset();
  // VideoEditor도 마운트 시 VoiceSelector가 /api/elevenlabs-voices를 부른다. 이 테스트의
  // 관심사가 아니므로 기본값으로 빈 성공 응답을 깔아 두고, 각 테스트가 /api/media/resign
  // 호출만 필요한 대로 덮어쓴다.
  fetchMock.mockResolvedValue(new Response(JSON.stringify({ voices: [] }), { status: 200 }));
  vi.stubGlobal("fetch", fetchMock);
});

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

describe("편집실 영상 플레이어 — 만료된 배달 주소 재서명", () => {
  it("만료된 previewVideoUrl을 걸지 않고 재서명해 받은 새 주소로만 <video src>를 건다", async () => {
    const expired = deliveryUrl("clip.mp4", "tenant-a", 1); // epoch=1ms -> 이미 만료
    fetchMock.mockResolvedValue(
      new Response(JSON.stringify({ ok: true, file: "/api/media/renewed-token" }), { status: 200 }),
    );

    render(
      <VideoEditor
        videoEdit={emptyVideoEdit()}
        onVideoEditChange={() => {}}
        previewVideoUrl={expired}
        lines={[]}
        tenantId="tenant-a"
      />,
    );

    // 죽은 걸 알면서 걸지 않는다 — 재서명이 끝나면 새 주소만 <video src>에 실린다.
    await waitFor(() => {
      const video = document.querySelector("[data-video-el]") as HTMLVideoElement | null;
      expect(video).toBeTruthy();
      expect(video?.getAttribute("src")).toBe("/api/media/renewed-token");
    });

    const resignCall = fetchMock.mock.calls.find(([url]) => String(url).includes("/api/media/resign"));
    const body = JSON.parse(String(resignCall?.[1]?.body));
    expect(body).toEqual({ delivery_url: expired, purpose: "media", tenant_id: "tenant-a" });
  });

  it("재서명이 실패하면 빈 자리로 두지 않고 실패 문구를 보여준다", async () => {
    const expired = deliveryUrl("clip.mp4", "tenant-a", 1);
    fetchMock.mockResolvedValue(new Response(JSON.stringify({ ok: false, error: "not found" }), { status: 404 }));

    render(
      <VideoEditor
        videoEdit={emptyVideoEdit()}
        onVideoEditChange={() => {}}
        previewVideoUrl={expired}
        lines={[]}
        tenantId="tenant-a"
      />,
    );

    await waitFor(() => expect(screen.getByText(/영상을 불러오지 못했습니다/)).toBeInTheDocument());
  });

  it("만료되지 않은 주소는 재서명 호출 없이 그대로 건다", async () => {
    const fresh = deliveryUrl("clip.mp4", "tenant-a", Date.now() + 60 * 60 * 1000);

    render(
      <VideoEditor
        videoEdit={emptyVideoEdit()}
        onVideoEditChange={() => {}}
        previewVideoUrl={fresh}
        lines={[]}
        tenantId="tenant-a"
      />,
    );

    await waitFor(() => {
      const video = document.querySelector("[data-video-el]") as HTMLVideoElement | null;
      expect(video?.getAttribute("src")).toBe(fresh);
    });
    // VoiceSelector의 /api/elevenlabs-voices 호출은 이 테스트의 관심사가 아니다 — 만료
    // 판정이 멀쩡한 주소를 재서명 경로(/api/media/resign)로 보내지 않는다는 것만 본다.
    const resignCalls = fetchMock.mock.calls.filter(([url]) => String(url).includes("/api/media/resign"));
    expect(resignCalls).toHaveLength(0);
  });
});
