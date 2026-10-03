// @vitest-environment jsdom
//
// 2026-10-02 결함(회장 지적): 편집실 영상이 재생 안 된다.
// VideoPlayback(VideoEditor.tsx)은 previewVideoUrl(서명 배달 주소, 12시간 만료)을
// video 요소의 src에 문자열 그대로 꽂았다. 토큰이 만료되면 파일은 서버에 그대로 있는데도
// 404로 "영상을 불러오지 못했습니다"만 떴다. DeliveredMedia(카드·발행실 미리보기)가
// 쓰는 /api/media/resign 재서명 경로를 이 플레이어에도 적용한다.
import "@testing-library/jest-dom/vitest";
import React from "react";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
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
  it("P1-01-RESIGN-01 만료된 previewVideoUrl을 걸지 않고 재서명해 받은 새 주소로만 video 요소를 연결한다", async () => {
    const expired = deliveryUrl("clip.mp4", "tenant-a", 1); // epoch=1ms -> 이미 만료
    fetchMock.mockResolvedValue(
      new Response(JSON.stringify({ ok: true, file: "/api/media/renewed-token" }), { status: 200 }),
    );

    render(
      <React.StrictMode>
        <VideoEditor
          videoEdit={emptyVideoEdit()}
          onVideoEditChange={() => {}}
          previewVideoUrl={expired}
          lines={[]}
          tenantId="tenant-a"
        />
      </React.StrictMode>,
    );

    // 죽은 걸 알면서 걸지 않는다. 재서명이 끝나면 새 주소만 video 요소에 실린다.
    await waitFor(() => {
      const video = document.querySelector("[data-video-el]") as HTMLVideoElement | null;
      expect(video).toBeTruthy();
      expect(video?.getAttribute("src")).toBe("/api/media/renewed-token");
    });

    const resignCall = fetchMock.mock.calls.find(([url]) => String(url).includes("/api/media/resign"));
    const body = JSON.parse(String(resignCall?.[1]?.body));
    expect(body).toEqual({ delivery_url: expired, purpose: "media", tenant_id: "tenant-a" });
    expect(fetchMock.mock.calls.filter(([url]) => String(url).includes("/api/media/resign"))).toHaveLength(1);
  });

  it("P1-01-RESIGN-02 재서명이 실패하면 원인을 보여주고 사용자가 다시 주소를 받을 수 있다", async () => {
    const expired = deliveryUrl("clip.mp4", "tenant-a", 1);
    let resignCount = 0;
    fetchMock.mockImplementation((url: unknown) => {
      if (String(url).includes("/api/media/resign")) {
        resignCount += 1;
        if (resignCount === 1) {
          return Promise.resolve(new Response(JSON.stringify({ ok: false, error: "not found" }), { status: 404 }));
        }
        return Promise.resolve(new Response(JSON.stringify({ ok: true, file: "/api/media/renewed-after-retry" }), { status: 200 }));
      }
      return Promise.resolve(new Response(JSON.stringify({ voices: [] }), { status: 200 }));
    });

    render(
      <VideoEditor
        videoEdit={emptyVideoEdit()}
        onVideoEditChange={() => {}}
        previewVideoUrl={expired}
        lines={[]}
        tenantId="tenant-a"
      />,
    );

    await waitFor(() => expect(screen.getByText(/영상 주소가 만료됐거나 원본 파일을 찾지 못해/)).toBeInTheDocument());
    fireEvent.click(screen.getByRole("button", { name: "영상 주소 다시 받기" }));
    await waitFor(() => {
      const video = document.querySelector("[data-video-el]") as HTMLVideoElement | null;
      expect(video?.getAttribute("src")).toBe("/api/media/renewed-after-retry");
    });
    expect(resignCount).toBe(2);
  });

  it("P1-01-RESIGN-03 만료되지 않은 주소는 재서명 호출 없이 그대로 건다", async () => {
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

  // 2026-10-02 독립 리뷰어 BLOCK-M-D: handleError 가드가 `!resolvedSrc` 를 같이 보던
  // 이전 판은 재서명이 한 번 성공하면 resolvedSrc가 채워져 가드가 다시는 true가 안
  // 됐다. 그래서 재서명 받은 새 주소도 재생이 안 되면(코덱·손상 등) onError→재서명→
  // src 교체→onError가 무한히 돈다. 같은 attemptKey당 딱 한 번만 재시도하고, 그 한
  // 번이 또 실패하면 즉시 실패 문구로 닫혀야 한다(재서명 호출이 2회를 넘지 않는다).
  it("P1-01-RESIGN-04 재서명으로 받은 새 주소도 재생에 실패하면 자동 재시도를 한 번으로 제한한다", async () => {
    const fresh = deliveryUrl("clip.mp4", "tenant-a", Date.now() + 60 * 60 * 1000);
    fetchMock.mockImplementation((url: unknown) => {
      if (String(url).includes("/api/media/resign")) {
        return Promise.resolve(new Response(JSON.stringify({ ok: true, file: "/api/media/renewed-but-broken" }), { status: 200 }));
      }
      return Promise.resolve(new Response(JSON.stringify({ voices: [] }), { status: 200 }));
    });

    render(
      <VideoEditor
        videoEdit={emptyVideoEdit()}
        onVideoEditChange={() => {}}
        previewVideoUrl={fresh}
        lines={[]}
        tenantId="tenant-a"
      />,
    );

    const video = await waitFor(() => {
      const el = document.querySelector("[data-video-el]") as HTMLVideoElement | null;
      expect(el).toBeTruthy();
      return el!;
    });

    // 첫 재생 실패(코덱 등) — 재서명 1회를 유발한다.
    fireEvent.error(video);
    await waitFor(() => expect(video.getAttribute("src")).toBe("/api/media/renewed-but-broken"));

    // 재서명으로 받은 새 주소도 재생이 또 실패한다. 다시 재서명을 걸지 않고 실패로 닫혀야 한다.
    fireEvent.error(video);
    await waitFor(() => expect(screen.getByText(/영상 주소가 만료됐거나 원본 파일을 찾지 못해/)).toBeInTheDocument());

    const resignCalls = fetchMock.mock.calls.filter(([url]) => String(url).includes("/api/media/resign"));
    expect(resignCalls).toHaveLength(1);
  });

  it("P1-01-TRUTH-01 화면이 파일 반영 범위와 목소리 선택 한계를 사실대로 알린다", () => {
    render(
      <VideoEditor
        videoEdit={emptyVideoEdit()}
        onVideoEditChange={() => {}}
        previewVideoUrl="/api/media/fresh"
        lines={[]}
        tenantId="tenant-a"
      />,
    );

    const note = screen.getByText(/적용을 마친 인트로·아웃트로 합성 결과/);
    expect(note).toHaveTextContent("미리보기와 발행 파일에 쓰입니다");
    expect(note).toHaveTextContent("목소리는 선택만 저장");
    expect(note).not.toHaveTextContent("인트로, 아웃트로, 움직이는 제목은 아직 파일에 들어가지 않습니다");
  });
});
