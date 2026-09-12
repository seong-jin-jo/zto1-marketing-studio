// @vitest-environment jsdom
//
// 2026-09-13 회장 실사용 회귀. 발행실 미리보기 일곱 장이 전부 `naturalWidth === 0` 이었다.
// 배달 토큰 payload 의 만료가 이틀 전이었고, 그 주소를 fetch 하면 404 가 났다. 편집실·생성실은
// `DeliveredMedia` 로 `/api/media/resign` 을 불러 되살리는데 발행실 `PlatformPreview` 만 날
// `<img src>` 였다. 돈 내고 만든 그림이 하루가 지나면 발행 직전 화면에서 사라졌다.
//
// 이 파일이 고정하는 것 둘.
//  1) 만료된 배달 주소가 들어오면 발행실이 스스로 재서명을 부르고 새 주소로 바꿔 건다.
//  2) 재서명이 실패하면(파일이 정말 없거나 인증이 끊겼을 때) 빈 자리로 두지 않고 이유와
//     다음 행동을 글로 적는다. ADR-007 조용한 실패 금지.
import "@testing-library/jest-dom/vitest";
import React from "react";
import { cleanup, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { PlatformPreview, type PreviewInlineEditor } from "@/components/studio/PlatformPreview";
import { isDeliveryUrlExpired } from "@/components/studio/DeliveredMedia";

/** 실제 배달 주소와 같은 모양으로 토큰을 만든다. payload 는 서명만 됐지 암호화가 아니다. */
function deliveryUrl(filename: string, expiresAt: number): string {
  const body = Buffer.from(JSON.stringify({ v: 1, t: "tenant-a", f: filename, e: expiresAt }), "utf8")
    .toString("base64")
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=+$/, "");
  return `/api/media/${encodeURIComponent(`${body}.c2ln`)}`;
}

const EXPIRED = deliveryUrl("img_1789045561960.webp", Date.parse("2026-09-11T10:06:02Z"));
const FRESH = deliveryUrl("img_1789045561960.webp", Date.now() + 60 * 60 * 1000);

function editor(overrides: Partial<PreviewInlineEditor> = {}): PreviewInlineEditor {
  return {
    account: { status: "connected", displayName: "운영 계정", username: "operator" },
    title: "",
    caption: "정상 본문",
    hashtags: "",
    topicTag: "",
    firstComment: "",
    firstCommentSupported: true,
    onTitleChange: vi.fn(),
    onCaptionChange: vi.fn(),
    onHashtagsChange: vi.fn(),
    onTopicTagChange: vi.fn(),
    onFirstCommentChange: vi.fn(),
    ...overrides,
  };
}

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

describe("PUB-MEDIA-01 발행실 미리보기는 만료된 배달 주소를 스스로 갱신한다", () => {
  it("경계: 만료 시각이 지난 주소는 걸어 보기 전에 판정한다", () => {
    expect(isDeliveryUrlExpired(EXPIRED)).toBe(true);
    expect(isDeliveryUrlExpired(FRESH)).toBe(false);
    // 배달 주소가 아닌 값은 손대지 않는다. 외부 주소를 만료로 오판하면 멀쩡한 그림이 사라진다.
    expect(isDeliveryUrlExpired("https://cdn.example.com/a.png")).toBe(false);
  });

  it.each(["threads", "x", "facebook"] as const)(
    "정상: %s 칸의 만료된 그림은 재서명을 불러 새 주소로 바뀐다",
    async (platform) => {
      const renewed = deliveryUrl("img_1789045561960.webp", Date.now() + 3600_000);
      okResign(renewed);

      render(
        <PlatformPreview
          platform={platform}
          text={{ threads: "본문", x: "본문", facebook: "본문" }}
          media={{ imgUrl: EXPIRED }}
          editor={editor()}
          tenantId="tenant-a"
        />,
      );

      await waitFor(() => {
        expect(fetchMock).toHaveBeenCalledWith("/api/media/resign", expect.objectContaining({ method: "POST" }));
      });
      const body = JSON.parse(String((fetchMock.mock.calls[0][1] as { body: string }).body));
      expect(body.filename).toBe("img_1789045561960.webp");
      // 어느 작업 공간으로 다시 서명할지 함께 보낸다. 운영자 토큰 경로에서는 이것이 없으면
      // 401 로 닫혀 만료 그림이 계속 안 뜬다(2026-09-13 Codex 교차리뷰 지적).
      expect(body.tenant_id).toBe("tenant-a");

      await waitFor(() => {
        expect(screen.getByTestId(`preview-media-${platform}`)).toHaveAttribute("src", renewed);
      });
    },
  );

  it("정상: 아직 안 죽은 주소에는 재서명을 부르지 않는다", async () => {
    render(<PlatformPreview platform="threads" text={{ threads: "본문" }} media={{ imgUrl: FRESH }} editor={editor()} />);

    expect(screen.getByTestId("preview-media-threads")).toHaveAttribute("src", FRESH);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("정상: 인스타그램 캐러셀의 첫 장도 같은 길로 되살린다", async () => {
    const renewed = deliveryUrl("img_1789045561960.webp", Date.now() + 3600_000);
    okResign(renewed);

    render(
      <PlatformPreview
        platform="instagram"
        text={{ instagram: { caption: "본문" } }}
        media={{ imgUrl: EXPIRED }}
        editor={editor()}
        tenantId="tenant-a"
      />,
    );

    await waitFor(() => {
      expect(screen.getByTestId("preview-media-instagram")).toHaveAttribute("src", renewed);
    });
  });

  it("정상: 세로 영상 칸의 만료된 영상도 같은 길로 되살린다", async () => {
    const renewed = deliveryUrl("vid_1789045561960.mp4", Date.now() + 3600_000);
    okResign(renewed);

    render(<PlatformPreview platform="reels" text={{}} media={{ vidUrl: EXPIRED }} editor={editor()} />);

    await waitFor(() => {
      expect(screen.getByTestId("preview-media-reels")).toHaveAttribute("src", renewed);
    });
  });

  it("경계: 작업 공간이 늦게 들어오면 그 값으로 한 번 더 시도한다", async () => {
    // activeWorkspace 는 화면이 뜬 뒤 SWR 로 따라 들어온다. 그 전에 보낸 첫 요청은 운영자
    // 경로에서 401 로 닫힌다. 그 한 번을 "해 봤다" 로 세면 제대로 된 요청을 영영 못 보낸다.
    fetchMock.mockResolvedValueOnce({ ok: false, json: async () => ({ ok: false, error: "작업 공간을 확인할 수 없습니다." }) });
    const renewed = deliveryUrl("img_1789045561960.webp", Date.now() + 3600_000);
    fetchMock.mockResolvedValue({ ok: true, json: async () => ({ ok: true, file: renewed }) });

    const { rerender } = render(
      <PlatformPreview platform="threads" text={{ threads: "본문" }} media={{ imgUrl: EXPIRED }} editor={editor()} />,
    );
    await waitFor(() => expect(screen.getByTestId("preview-media-threads-failed")).toBeInTheDocument());

    rerender(
      <PlatformPreview platform="threads" text={{ threads: "본문" }} media={{ imgUrl: EXPIRED }} editor={editor()} tenantId="tenant-a" />,
    );

    await waitFor(() => {
      expect(screen.getByTestId("preview-media-threads")).toHaveAttribute("src", renewed);
    });
    const second = JSON.parse(String((fetchMock.mock.calls[1][1] as { body: string }).body));
    expect(second.tenant_id).toBe("tenant-a");
  });

  it("거절: 재서명이 실패하면 빈 자리로 두지 않고 이유와 다음 행동을 적는다", async () => {
    fetchMock.mockResolvedValue({ ok: false, json: async () => ({ ok: false, error: "not found" }) });

    render(<PlatformPreview platform="threads" text={{ threads: "본문" }} media={{ imgUrl: EXPIRED }} editor={editor()} />);

    await waitFor(() => {
      expect(screen.getByTestId("preview-media-threads-failed")).toBeInTheDocument();
    });
    expect(screen.getByTestId("preview-media-threads-failed")).toHaveAttribute("data-media-state", "error");
    expect(screen.getByText(/불러오지 못했습니다/)).toBeInTheDocument();
    // 깨진 그림 자리를 남기지 않는다.
    expect(screen.queryByTestId("preview-media-threads")).not.toBeInTheDocument();
  });

  it("거절: 재서명 요청 자체가 끊겨도 화면은 조용히 비지 않는다", async () => {
    fetchMock.mockRejectedValue(new Error("network down"));

    render(<PlatformPreview platform="threads" text={{ threads: "본문" }} media={{ imgUrl: EXPIRED }} editor={editor()} />);

    await waitFor(() => {
      expect(screen.getByTestId("preview-media-threads-failed")).toBeInTheDocument();
    });
  });
});
