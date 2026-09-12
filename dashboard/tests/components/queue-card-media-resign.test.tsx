// @vitest-environment jsdom
//
// 2026-09-13. 발행실을 고친 다음 날 같은 증상이 큐에서 다시 나왔다.
//
// 발행실에서 "검토 요청" 을 누르면 그때 화면이 들고 있던 배달 주소가 그대로 큐에 저장된다
// (app/studio/page.tsx requestReview → /api/queue/add 의 `imageUrl: img?.url`). 그 주소는
// 12시간이면 죽는데 큐 카드는 날 <img> 로 걸고 있었다. 그래서 어제 검토 요청한 글을 오늘
// 큐에서 열면 그림이 빈 자리였고, 화면에는 이유도 안 떴다.
//
// 이 파일이 고정하는 것 둘.
//  1) 큐 카드에 들어온 만료된 배달 주소는 스스로 재서명을 불러 새 주소로 바뀐다.
//  2) 그 요청에는 작업 공간 식별자가 실린다. 없으면 운영자 경로에서 401 로 닫혀 증상이
//     그대로 남는다(tenant-auth.ts effectiveTenantId).
import "@testing-library/jest-dom/vitest";
import React from "react";
import { cleanup, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/lib/auth", () => ({ authHeaders: () => ({}) }));
vi.mock("@/lib/api", () => ({ apiPost: vi.fn(), apiDelete: vi.fn(), fetcher: vi.fn() }));
vi.mock("@/components/layout/Toast", () => ({ useToast: () => ({ showToast: vi.fn() }) }));
vi.mock("@/components/shared/ConfirmHost", () => ({ confirmAction: vi.fn(async () => false) }));
vi.mock("@/store/ui-store", () => ({
  useUIStore: () => ({
    editingPost: null,
    setEditingPost: vi.fn(),
    selectedIds: new Set<string>(),
    toggleSelect: vi.fn(),
    // 큐 화면이 이미 알고 있는 작업 공간. 재서명은 이것을 실어 보내야 한다.
    activeWorkspace: { id: "tenant-a", name: "테스트 작업 공간" },
  }),
}));

import { PostCard } from "@/components/queue/PostCard";
import { UnifiedPostCard } from "@/components/queue/UnifiedPostCard";

/** 실제 배달 주소와 같은 모양. payload 는 서명만 됐지 암호화가 아니라 만료가 평문이다. */
function deliveryUrl(filename: string, expiresAt: number): string {
  const body = Buffer.from(JSON.stringify({ v: 1, t: "tenant-a", f: filename, e: expiresAt }), "utf8")
    .toString("base64")
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=+$/, "");
  return `/api/media/${encodeURIComponent(`${body}.c2ln`)}`;
}

const EXPIRED = deliveryUrl("img_1789045561960.webp", Date.parse("2026-09-11T10:06:02Z"));
const RENEWED = deliveryUrl("img_1789045561960.webp", Date.now() + 60 * 60 * 1000);

const basePost = {
  id: "post-1",
  text: "어제 검토 요청한 글",
  topic: "테스트",
  status: "draft",
  channels: {},
  createdAt: new Date().toISOString(),
};

const fetchMock = vi.fn();

beforeEach(() => {
  fetchMock.mockReset();
  vi.stubGlobal("fetch", fetchMock);
});

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

function okResign(file: string) {
  fetchMock.mockResolvedValue({ ok: true, json: async () => ({ ok: true, file }) });
}

describe("QUEUE-MEDIA-01 큐 카드는 만료된 배달 주소를 스스로 갱신한다", () => {
  it("정상: 만료된 그림은 재서명을 불러 새 주소로 바뀐다 (PostCard)", async () => {
    okResign(RENEWED);

    render(
      <PostCard
        post={{ ...basePost, imageUrl: EXPIRED } as never}
        channelConfig={{} as never}
        onRefresh={vi.fn()}
      />,
    );

    await waitFor(() => {
      expect(fetchMock).toHaveBeenCalledWith("/api/media/resign", expect.objectContaining({ method: "POST" }));
    });
    const body = JSON.parse(String((fetchMock.mock.calls[0][1] as { body: string }).body));
    expect(body.filename).toBe("img_1789045561960.webp");
    // 작업 공간을 함께 보낸다. 빠지면 운영자 경로에서 401 이라 증상이 그대로 남는다.
    expect(body.tenant_id).toBe("tenant-a");

    await waitFor(() => {
      expect(screen.getByTestId("queue-post-image")).toHaveAttribute("src", RENEWED);
    });
  });

  it("정상: 만료된 그림은 재서명을 불러 새 주소로 바뀐다 (UnifiedPostCard)", async () => {
    okResign(RENEWED);

    render(
      <UnifiedPostCard
        post={{ ...basePost, imageUrl: EXPIRED } as never}
        channelConfig={{} as never}
        onRefresh={vi.fn()}
      />,
    );

    await waitFor(() => {
      expect(screen.getByTestId("queue-post-image")).toHaveAttribute("src", RENEWED);
    });
    const body = JSON.parse(String((fetchMock.mock.calls[0][1] as { body: string }).body));
    expect(body.tenant_id).toBe("tenant-a");
  });

  // 2026-09-13 Codex 교차리뷰가 잡은 자리. 그림만 고치고 영상은 그대로 뒀었다. 검사기가
  // 한 줄짜리 태그만 보던 탓에 여러 줄로 쓰인 이 <video> 가 조용히 빠져나갔다.
  it("정상: 만료된 영상도 같은 길로 되살린다 (UnifiedPostCard)", async () => {
    const renewedVideo = deliveryUrl("vid_1789045561960.mp4", Date.now() + 60 * 60 * 1000);
    okResign(renewedVideo);

    render(
      <UnifiedPostCard
        post={{ ...basePost, videoUrl: deliveryUrl("vid_1789045561960.mp4", Date.parse("2026-09-11T10:06:02Z")) } as never}
        channelConfig={{} as never}
        onRefresh={vi.fn()}
      />,
    );

    await waitFor(() => {
      expect(screen.getByTestId("queue-post-video")).toHaveAttribute("src", renewedVideo);
    });
    const body = JSON.parse(String((fetchMock.mock.calls[0][1] as { body: string }).body));
    expect(body.filename).toBe("vid_1789045561960.mp4");
    expect(body.tenant_id).toBe("tenant-a");
  });

  it("경계: 옛 글의 정적 영상 경로는 손대지 않는다", () => {
    render(
      <UnifiedPostCard
        post={{ ...basePost, videoFilename: "clip-1.mp4" } as never}
        channelConfig={{} as never}
        onRefresh={vi.fn()}
      />,
    );

    const player = screen.getByTestId("queue-post-video");
    expect(player).toHaveAttribute("src", "/videos/clip-1.mp4");
    // 날 <video preload="none"> 이던 성질을 옮기면서 잃지 않았는지 함께 붙들어 둔다.
    // 큐에는 영상이 여러 편 깔리므로 미리 내려받으면 그만큼 샌다.
    expect(player).toHaveAttribute("preload", "none");
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("경계: 아직 안 죽은 주소에는 재서명을 부르지 않는다", async () => {
    render(
      <PostCard
        post={{ ...basePost, imageUrl: RENEWED } as never}
        channelConfig={{} as never}
        onRefresh={vi.fn()}
      />,
    );

    expect(screen.getByTestId("queue-post-image")).toHaveAttribute("src", RENEWED);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("경계: 재서명이 실패하면 빈 자리가 아니라 사람 말로 적는다", async () => {
    fetchMock.mockResolvedValue({ ok: false, json: async () => ({ ok: false }) });

    render(
      <PostCard
        post={{ ...basePost, imageUrl: EXPIRED } as never}
        channelConfig={{} as never}
        onRefresh={vi.fn()}
      />,
    );

    await waitFor(() => {
      expect(screen.getByTestId("queue-post-image-failed")).toBeTruthy();
    });
    expect(screen.getByTestId("queue-post-image-failed").textContent).toContain("이미지를 불러오지 못했습니다");
  });

  it("경계: 배달 주소가 아닌 정적 경로는 손대지 않는다", async () => {
    render(
      <PostCard
        post={{ ...basePost, imageUrl: "/images/card-1.png" } as never}
        channelConfig={{} as never}
        onRefresh={vi.fn()}
      />,
    );

    expect(screen.getByTestId("queue-post-image")).toHaveAttribute("src", "/images/card-1.png");
    expect(fetchMock).not.toHaveBeenCalled();
  });
});
