// @vitest-environment jsdom
import "@testing-library/jest-dom/vitest";
import React from "react";
import { render, screen, cleanup } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { CreateRoom, CREATE_DRAFT_STORAGE_PREFIX } from "@/components/studio/StudioRooms";
import type { StudioGenerationCandidate } from "@/lib/studio/generation/client";

// 2026-10-01 리뷰 BLOCK 재발견(결함2 출처): 서버 생성 시점의 자리표시 차단(generated-copy.ts,
// generation/llm.ts)은 이미 그 문장을 잡지만, 브라우저에 저장됐다 새로고침으로 복원되는
// 구조 초안(candidates/quickStructure)은 그 검사를 거치지 않고 A/B/C 화면에 그대로
// 다시 그려졌다 — 실제 누출원. 복원 경로에도 같은 filterInstructionPlaceholderLines 를
// 걸어 화면에 안 보이게 했는지 실제로 마운트해서 확인한다.
const WORKSPACE = "ws-leak-test";
const LEAK_LINE = "저희는 (브랜드가 실제로 제공하는 서비스 한 문장으로 대체)을 도와드리는 곳입니다.";
const CLEAN_LINE = "저희는 동네 빵집 예약 주문을 도와드리는 곳입니다.";

function noop() {}

describe("복원된 구조 초안(candidates)에서도 자리표시 문장이 걸린다", () => {
  beforeEach(() => {
    localStorage.clear();
  });
  afterEach(() => {
    cleanup();
  });

  it("새로고침으로 복원된 A/B/C 화면에 자리표시 문장이 다시 보이지 않는다", () => {
    const leaked: StudioGenerationCandidate = {
      candidate_id: "A-leak",
      generation_id: "gen-1",
      label: "A",
      title: "빵집 소개",
      format: { outline: [LEAK_LINE, CLEAN_LINE] },
    } as unknown as StudioGenerationCandidate;
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
        candidates: [leaked],
        selected: null,
        quickStructure: null,
        topic: "동네 빵집",
      }),
    );

    render(
      React.createElement(CreateRoom, {
        workspaceId: WORKSPACE,
        guide: "",
        topic: "동네 빵집",
        onTopicChange: noop,
        onOpenLearning: noop,
        onCandidateSelect: noop,
      }),
    );

    expect(screen.queryByText(LEAK_LINE)).not.toBeInTheDocument();
    expect(screen.getByText(CLEAN_LINE)).toBeInTheDocument();
  });
});
