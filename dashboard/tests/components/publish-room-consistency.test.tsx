// @vitest-environment jsdom
import "@testing-library/jest-dom/vitest";
import React from "react";
import { render, screen, fireEvent } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { PlatformPreview, type PreviewInlineEditor } from "@/components/studio/PlatformPreview";
import { PLATFORM_FIELD_CONTRACT, validatePlatformPublish } from "@/lib/studio/platform-publish-fields";

// 2026-09-22 R-23(발행실 일관성·플랫폼 규격·메타 편집 UX·카드뉴스·영상 썸네일).
// 회장이 9444 를 폭 1792 로 직접 실측하고 지적한 네 가지를 이 파일이 지킨다.
//
// 2026-09-22 교차 코드리뷰(PR #77) 4라운드: 오른쪽 사이드바 채팅형 편집(PublishEditSidebar)
// 을 이 브랜치에서 뺐다. 세 라운드 연속 싱글턴이 깨졌기 때문이다(별도 브랜치
// feat/publish-edit-sidebar 로 이관). 이 파일도 사이드바 의존 테스트를 지우고 되살린
// 인라인 입력 칸을 검증하도록 되돌린다.

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

describe("R-23-5 인라인 입력 칸(사이드바를 뺀 뒤 되살린 형태)", () => {
  it("세로 영상 제목은 미리보기 오버레이 안에서 직접 고친다", () => {
    const onTitleChange = vi.fn();
    render(<PlatformPreview platform="shorts" text={{}} media={{}} editor={editor({ title: "", onTitleChange })} />);
    const field = screen.getByTestId("preview-title-shorts");
    fireEvent.input(field, { target: { textContent: "새 제목" } });
    expect(onTitleChange).toHaveBeenCalledWith("새 제목");
  });

  it("Facebook 첫 댓글은 카드 하단 인라인 칸에서 고친다(미리보기 안에 자리가 없는 필드)", () => {
    const onFirstCommentChange = vi.fn();
    render(<PlatformPreview platform="facebook" text={{ facebook: "본문" }} media={{}} editor={editor({ onFirstCommentChange })} />);
    const field = screen.getByLabelText("facebook 첫 댓글");
    fireEvent.change(field, { target: { value: "댓글 내용" } });
    expect(onFirstCommentChange).toHaveBeenCalledWith("댓글 내용");
  });
});

describe("R-23-3 Facebook 상한이 규격 확인 필요로 방치되지 않는다", () => {
  it("Facebook 계약에 unknownLimitLabel 이 없다", () => {
    expect("unknownLimitLabel" in PLATFORM_FIELD_CONTRACT.facebook).toBe(false);
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
