// @vitest-environment jsdom
import "@testing-library/jest-dom/vitest";
import React from "react";
import { render, screen, fireEvent, act } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { PlatformPreview, type PreviewInlineEditor, type PreviewPlatform } from "@/components/studio/PlatformPreview";
import { PublishEditSidebarMount, closeFieldEditor } from "@/components/studio/PublishEditSidebar";
import { PLATFORM_FIELD_CONTRACT, validatePlatformPublish } from "@/lib/studio/platform-publish-fields";

// 2026-09-22 R-23(발행실 일관성·플랫폼 규격·메타 편집 UX·카드뉴스·영상 썸네일).
// 회장이 9444 를 폭 1792 로 직접 실측하고 지적한 네 가지를 이 파일이 지킨다.

afterEach(() => {
  // 모듈 스코프 current 는 테스트 사이에 안 비워진다(실제 앱에서도 J4 이전엔 같은
  // 문제였다). 테스트끼리 서로의 열린 상태를 물려받지 않게 매번 닫는다.
  act(() => { closeFieldEditor(); });
});

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
      <>
        <PlatformPreview
          platform="shorts"
          text={{}}
          media={{}}
          editor={editor({ title: "", onTitleChange })}
        />
        <PublishEditSidebarMount />
      </>,
    );
    fireEvent.click(screen.getByTestId("preview-overlay-shorts-title"));
    expect(screen.getByTestId("publish-edit-sidebar")).toHaveAttribute("data-pv-sidebar-target", "shorts:title");
    fireEvent.change(screen.getByTestId("publish-edit-sidebar-input"), { target: { value: "새 제목" } });
    fireEvent.click(screen.getByTestId("publish-edit-sidebar-save"));
    expect(onTitleChange).toHaveBeenCalledWith("새 제목");
    // 저장 후 사이드바는 닫힌다(반영은 미리보기 쪽 props 갱신이 책임진다).
    expect(screen.queryByTestId("publish-edit-sidebar")).not.toBeInTheDocument();
  });

  it("키보드로 트리거를 활성화하면 사이드바가 열린다(접근성)", () => {
    // 2026-09-22 교차 코드리뷰 M6: tagName === "BUTTON" 만 보는 건 "네이티브 button 이니
    // 브라우저가 Enter/Space 를 클릭으로 바꿔줄 것이다" 라는 가정만 확인할 뿐, 실제로
    // 열리는지는 안 본다. jsdom 은 그 브라우저 기본 동작(키보드→클릭 변환)을 구현하지
    // 않으므로, 네이티브 button 이 보장하는 결과(키 입력이 클릭으로 이어진다)를 직접
    // 재현해 "그 결과로 사이드바가 실제로 열리는지" 를 검증한다.
    render(
      <>
        <PlatformPreview platform="shorts" text={{}} media={{}} editor={editor()} />
        <PublishEditSidebarMount />
      </>,
    );
    const trigger = screen.getByTestId("preview-overlay-shorts-title");
    expect(trigger.tagName).toBe("BUTTON");
    expect(trigger).toHaveAttribute("type", "button");
    trigger.focus();
    expect(document.activeElement).toBe(trigger);
    fireEvent.keyDown(trigger, { key: "Enter", code: "Enter" });
    // 네이티브 button 이 브라우저에서 보장하는 Enter→click 변환을 재현한다. 여기서는
    // fireEvent.click 을 쓴다 — 원소의 네이티브 .click() 은 testing-library 의 act()
    // 래핑을 거치지 않아 React 18 자동 배치 아래에서 상태 갱신이 이 동기 단언 전에
    // 반영되지 않을 수 있다(리뷰 대응 중 실제로 재현: .click() 만으로는 이 테스트
    // 자체가 거짓 실패했다 — 앱 결함이 아니라 테스트 도구 사용 문제였다).
    fireEvent.click(trigger);
    expect(screen.getByTestId("publish-edit-sidebar")).toBeInTheDocument();
  });
});

describe("N3 사이드바는 카드가 몇 장이든 화면에 정확히 하나만 뜬다", () => {
  // 2026-09-22 교차 코드리뷰 N4: 1차에서 요구한 카드 2장 이상 렌더 테스트가 없었다.
  // 실제 발행실은 카드 7장이 한 화면에 있다 — 그중 3장으로 재현한다.
  const PLATFORMS: PreviewPlatform[] = ["threads", "facebook", "shorts"];

  function MultiCardRoom() {
    return (
      <>
        {PLATFORMS.map((platform) => (
          <PlatformPreview key={platform} platform={platform} text={{ threads: "본문", facebook: "본문" }} media={{}} editor={editor()} />
        ))}
        {/* 실제 앱에서는 app/layout.tsx 에 정확히 한 번 있다(N3 수정). */}
        <PublishEditSidebarMount />
      </>
    );
  }

  it("서로 다른 카드의 트리거를 눌러도 사이드바 패널은 항상 하나다", () => {
    render(<MultiCardRoom />);

    fireEvent.click(screen.getByTestId("preview-overlay-shorts-title"));
    expect(screen.getAllByTestId("publish-edit-sidebar")).toHaveLength(1);
    expect(screen.getByTestId("publish-edit-sidebar")).toHaveAttribute("data-pv-sidebar-target", "shorts:title");

    // 다른 카드의 트리거로 갈아타도 여전히 하나. 이전 타깃이 안 남는다.
    fireEvent.click(screen.getByTestId("preview-trigger-facebook-firstComment"));
    expect(screen.getAllByTestId("publish-edit-sidebar")).toHaveLength(1);
    expect(screen.getByTestId("publish-edit-sidebar")).toHaveAttribute("data-pv-sidebar-target", "facebook:firstComment");
  });

  it("열기 전에는 사이드바가 DOM에 없고, 열면 카드 수와 무관하게 정확히 하나만 나타난다", () => {
    render(<MultiCardRoom />);
    expect(screen.queryAllByTestId("publish-edit-sidebar")).toHaveLength(0);
    fireEvent.click(screen.getByTestId("preview-trigger-facebook-firstComment"));
    expect(screen.getAllByTestId("publish-edit-sidebar")).toHaveLength(1);
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
