// @vitest-environment jsdom
import "@testing-library/jest-dom/vitest";
import React from "react";
import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { CreateRoom, type QuickDraftResult } from "@/components/studio/StudioRooms";

// 2026-09-22 실측(j.the.great.creator): "초안 만들기" 를 누르고 약 40초 뒤
// `/api/studio/text` 가 200 으로 후보를 냈는데, 상단 카운터는 "구조 초안 0개" 로 남고
// 결과는 "고른 형식의 생성 후보" 섹션에만 조용히 붙어 회장이 "안 되는 것 같다" 고
// 판단했다. 결과가 생겼음을 화면이 스스로 알려야 한다: ①카운터가 실제 생성 후보 수를
// 반영하고 ②결과 섹션으로 스크롤·잠시 하이라이트하고 ③완료 문구 한 줄을 보여준다.
afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});

const QUICK_DRAFT: QuickDraftResult = {
  threads: "작은 팀도 오늘부터 30분이면 콘텐츠 하나를 끝낼 수 있습니다.",
  facebook: "",
  x: "",
  instagram: { caption: "", hashtags: [], slides: [] },
  shorts: { hook: "", body: "", cta: "" },
};

function baseProps() {
  return {
    workspaceId: "11111111-1111-4111-8111-111111111111",
    workspaceName: "테스트 작업실",
    guide: "",
    topic: "1인 사업자가 콘텐츠 만드는 법",
    onTopicChange: vi.fn(),
    onOpenLearning: vi.fn(),
    onCandidateSelect: vi.fn(),
  } as const;
}

describe("생성 후보 완료 노출", () => {
  it("상단 카운터는 A/B/C 구조 예시와 실제 생성한 후보를 구분해서 보여준다", () => {
    render(<CreateRoom {...baseProps()} quickDraft={QUICK_DRAFT} />);
    expect(screen.getByText("구조 예시(A/B/C)")).toBeInTheDocument();
    expect(screen.getByText("생성한 후보")).toBeInTheDocument();
    const countCard = document.querySelector('[data-quick-draft-count="1"]');
    expect(countCard).not.toBeNull();
    expect(countCard).toHaveTextContent("1개");
  });

  it("만드는 중에는 후보 칸이 만드는 중이라고 말한다", () => {
    render(<CreateRoom {...baseProps()} quickDraft={null} quickDraftLoading />);
    expect(screen.getByText("만드는 중")).toBeInTheDocument();
  });

  it("만들기가 끝나면 결과로 스크롤하고 완료 문구를 잠시 보여준다", () => {
    const scrollSpy = vi.fn();
    Element.prototype.scrollIntoView = scrollSpy;

    const { rerender } = render(
      <CreateRoom {...baseProps()} quickDraft={null} quickDraftLoading />,
    );
    expect(document.querySelector("[data-quick-draft-result]")).toBeNull();

    // 로딩이 끝나고 결과가 도착한 다음 렌더(실제 화면과 같은 시퀀스).
    rerender(<CreateRoom {...baseProps()} quickDraft={QUICK_DRAFT} quickDraftLoading={false} />);

    expect(scrollSpy).toHaveBeenCalled();
    const result = document.querySelector("[data-quick-draft-result]");
    expect(result).not.toBeNull();
    expect(result).toHaveAttribute("data-quick-draft-just-completed", "true");
    expect(screen.getByText(/후보 1개가 만들어졌습니다/)).toBeInTheDocument();
  });

  it("완료 상태가 아니면(처음부터 결과가 있는 경우) 스크롤을 부르지 않는다", () => {
    const scrollSpy = vi.fn();
    Element.prototype.scrollIntoView = scrollSpy;
    render(<CreateRoom {...baseProps()} quickDraft={QUICK_DRAFT} quickDraftLoading={false} />);
    expect(scrollSpy).not.toHaveBeenCalled();
  });
});
