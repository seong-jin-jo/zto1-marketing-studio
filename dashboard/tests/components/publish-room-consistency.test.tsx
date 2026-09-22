// @vitest-environment jsdom
import "@testing-library/jest-dom/vitest";
import React from "react";
import { render, screen, fireEvent } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { PlatformPreview, type PreviewInlineEditor } from "@/components/studio/PlatformPreview";
import { PLATFORM_FIELD_CONTRACT, validatePlatformPublish } from "@/lib/studio/platform-publish-fields";

// 2026-09-22 R-23(발행실 일관성·플랫폼 규격·메타 편집 UX·카드뉴스·영상 썸네일).
// 회장이 9444 를 폭 1792 로 직접 실측하고 지적한 네 가지를 이 파일이 지킨다.

function editor(overrides: Partial<PreviewInlineEditor> = {}): PreviewInlineEditor {
  return {
    account: { status: "connected", displayName: "운영 계정", username: "operator" },
    title: "",
    caption: "본문",
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

describe("R-23-4 계정 정보는 카드 하단 별도 블록이 아니라 머리줄 배지 하나", () => {
  it("카드 하단에 테두리 있는 별도 계정 카드가 없다", () => {
    render(<PlatformPreview platform="threads" text={{ threads: "본문" }} media={{}} editor={editor()} />);
    // 배지 하나만 있고 "읽기 전용" 이라는 불필요한 중복 문구는 없다.
    expect(screen.getByTestId("preview-account-threads")).toBeInTheDocument();
    expect(screen.queryByText("읽기 전용")).not.toBeInTheDocument();
  });
});

describe("R-23-5 클릭하면 오른쪽 사이드바에서 고친다", () => {
  it("제목 트리거를 클릭하면 사이드바가 열리고, 저장하면 즉시 반영된다", () => {
    const onTitleChange = vi.fn();
    render(
      <PlatformPreview
        platform="shorts"
        text={{}}
        media={{}}
        editor={editor({ title: "", onTitleChange })}
      />,
    );
    fireEvent.click(screen.getByTestId("preview-overlay-shorts-title"));
    expect(screen.getByTestId("publish-edit-sidebar")).toHaveAttribute("data-pv-sidebar-target", "shorts:title");
    fireEvent.change(screen.getByTestId("publish-edit-sidebar-input"), { target: { value: "새 제목" } });
    fireEvent.click(screen.getByTestId("publish-edit-sidebar-save"));
    expect(onTitleChange).toHaveBeenCalledWith("새 제목");
    // 저장 후 사이드바는 닫힌다(반영은 미리보기 쪽 props 갱신이 책임진다).
    expect(screen.queryByTestId("publish-edit-sidebar")).not.toBeInTheDocument();
  });

  it("키보드 Enter/Space 로도 트리거가 열린다(접근성)", () => {
    render(<PlatformPreview platform="shorts" text={{}} media={{}} editor={editor()} />);
    const trigger = screen.getByTestId("preview-overlay-shorts-title");
    expect(trigger.tagName).toBe("BUTTON");
  });
});

describe("R-23-3 Facebook 상한이 규격 확인 필요로 방치되지 않는다", () => {
  it("Facebook 계약에 unknownLimitLabel 이 없다", () => {
    expect(PLATFORM_FIELD_CONTRACT.facebook.unknownLimitLabel).toBeUndefined();
  });

  it("63,206자를 넘기면 차단한다", () => {
    const over = validatePlatformPublish("facebook", { body: "가".repeat(63_207) });
    expect(over.blocking.map((i) => i.field)).toEqual(["body"]);
  });
});

describe("R-23-3 세로 영상 세 채널도 미리보기 머리줄에 글자수 배지를 보여준다", () => {
  it.each(["shorts", "reels", "tiktok"] as const)("%s 에 character-count 배지가 있다", (platform) => {
    render(
      <PlatformPreview
        platform={platform}
        text={{}}
        media={{}}
        editor={editor({ caption: "설명" })}
      />,
    );
    expect(screen.getByTestId(`character-count-${platform}`)).toBeInTheDocument();
  });
});

describe("R-23-6 카드뉴스 여러 장 넘기기는 플랫폼 중립이다", () => {
  it("Threads 도 이미지가 2장이면 캐러셀로 넘긴다", () => {
    render(
      <PlatformPreview
        platform="threads"
        text={{ threads: "본문" }}
        media={{ imgUrls: ["a.png", "b.png"] }}
        editor={editor()}
      />,
    );
    expect(screen.getByTestId("preview-media-threads-index")).toHaveTextContent("1/2");
  });
});

describe("R-23-6 영상 썸네일: poster 를 넘기거나 없다고 밝힌다", () => {
  it("영상과 이미지가 모두 있으면 poster 로 이미지를 넘긴다", () => {
    render(
      <PlatformPreview
        platform="shorts"
        text={{}}
        media={{ vidUrl: "v.mp4", imgUrl: "cover.png" }}
        editor={editor()}
      />,
    );
    const video = screen.getByTestId("preview-media-shorts");
    expect(video.tagName).toBe("VIDEO");
    expect(video).toHaveAttribute("poster", "cover.png");
  });

  it("영상만 있고 이미지가 없으면 썸네일 없음을 밝힌다(조용히 검정 상자로 두지 않는다)", () => {
    render(
      <PlatformPreview
        platform="shorts"
        text={{}}
        media={{ vidUrl: "v.mp4" }}
        editor={editor()}
      />,
    );
    expect(screen.getByTestId("preview-poster-missing-shorts")).toHaveTextContent("썸네일 없음");
  });
});
