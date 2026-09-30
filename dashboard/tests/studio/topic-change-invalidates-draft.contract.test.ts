// @vitest-environment jsdom
import "@testing-library/jest-dom/vitest";
import React from "react";
import { render, screen, cleanup } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { CreateRoom, CREATE_DRAFT_STORAGE_PREFIX } from "@/components/studio/StudioRooms";
import type { StudioGenerationCandidate } from "@/lib/studio/generation/client";

// 2026-10-01 실측(회장 지적) + 2026-10-01 리뷰 BLOCK 재발견.
//
// 결함1: 생성실 "주제로 바로 초안 만들기" 에 새 주제를 입력하고 "초안 만들기" 를 눌러도
// 구조 초안 A/B/C(candidates) 가 이전 주제 그대로 남았다.
//
// 1차 수정은 소스 문자열만 비교하는 계약이라 실제 동작(렌더)을 증명하지 못했고, 실제
// 진짜 버그(부모의 주제 복원이 이 컴포넌트의 자체 복원보다 늦게 끝나면 막 복원한
// candidates 를 지워버리는 회귀)를 못 잡았다. 여기서는 실제로 마운트해서 확인한다.
const WORKSPACE = "ws-topic-test";

function makeCandidate(label: "A" | "B" | "C", title: string): StudioGenerationCandidate {
  return {
    candidate_id: `${label}-${title}`,
    generation_id: "gen-1",
    label,
    title,
    format: { outline: [`${title} 첫 줄`, `${title} 둘째 줄`] },
  } as unknown as StudioGenerationCandidate;
}

function seedDraft(topic: string) {
  localStorage.setItem(
    `${CREATE_DRAFT_STORAGE_PREFIX}:${WORKSPACE}`,
    JSON.stringify({
      primaryKind: "text",
      alsoKinds: [],
      questionIndex: 0,
      purpose: "",
      audience: "",
      rightsConfirmed: false,
      topicOpen: false,
      candidates: [makeCandidate("A", "우리 동네 빵집 소개")],
      selected: null,
      quickStructure: null,
      topic,
    }),
  );
}

function noop() {}

function renderRoom(topic: string) {
  return render(
    React.createElement(CreateRoom, {
      workspaceId: WORKSPACE,
      guide: "",
      topic,
      onTopicChange: noop,
      onOpenLearning: noop,
      onCandidateSelect: noop,
    }),
  );
}

function candidateCountText() {
  const label = screen.getByText("구조 초안(A/B/C)");
  return label.parentElement?.querySelector("b")?.textContent ?? "";
}

describe("주제를 바꾸면 옛 구조 초안을 버리되, 복원된 후보를 오판으로 지우지 않는다", () => {
  beforeEach(() => {
    localStorage.clear();
  });
  afterEach(() => {
    cleanup();
  });

  it("주제가 바뀌면 복원된 구조 초안(candidates)이 실제로 비워진다", () => {
    seedDraft("우리 동네 빵집 소개");
    const { rerender } = renderRoom("우리 동네 빵집 소개");
    expect(candidateCountText()).toBe("1개");

    rerender(
      React.createElement(CreateRoom, {
        workspaceId: WORKSPACE,
        guide: "",
        topic: "완전히 다른 새 주제",
        onTopicChange: noop,
        onOpenLearning: noop,
        onCandidateSelect: noop,
      }),
    );
    expect(candidateCountText()).toBe("0개");
  });

  it("2026-10-01 리뷰 BLOCK 재발견 회귀 방지: 부모 주제 복원이 늦게(빈 문자열 뒤에) 도착해도 막 복원한 후보를 지우지 않는다", () => {
    seedDraft("우리 동네 빵집 소개");
    // 부모(page.tsx)가 아직 주제를 복원하지 못한 첫 렌더를 흉내낸다.
    const { rerender } = renderRoom("");
    expect(candidateCountText()).toBe("1개");

    // 부모의 늦은 주제 복원이 도착한다 — 저장된 주제와 같은 값이다.
    rerender(
      React.createElement(CreateRoom, {
        workspaceId: WORKSPACE,
        guide: "",
        topic: "우리 동네 빵집 소개",
        onTopicChange: noop,
        onOpenLearning: noop,
        onCandidateSelect: noop,
      }),
    );
    expect(candidateCountText()).toBe("1개");
  });

  it("공백만 다른 주제(trim 동치)는 무효화를 일으키지 않는다", () => {
    seedDraft("우리 동네 빵집 소개");
    const { rerender } = renderRoom("우리 동네 빵집 소개");
    expect(candidateCountText()).toBe("1개");

    rerender(
      React.createElement(CreateRoom, {
        workspaceId: WORKSPACE,
        guide: "",
        topic: "  우리 동네 빵집 소개  ",
        onTopicChange: noop,
        onOpenLearning: noop,
        onCandidateSelect: noop,
      }),
    );
    expect(candidateCountText()).toBe("1개");
  });
});
