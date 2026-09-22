// @vitest-environment jsdom
/**
 * 세션맥락 2026-09-23 과업 A·B·C 회귀.
 *
 * 회장이 운영 9444에서 직접 확인: "편집실 글 카드뉴스 영상은 여전히 씹창".
 * 원인 ①영상 탭에서 표준 편집 작업대(장면 순서·본문·비율·자막)와 VideoEditor(후킹
 * CTA·댓글·음성)가 별도 카드 두 장으로 겹쳐 떴다 ②그 위 안내 문구가 바로 아래
 * VideoEditor 빈 상태 문구와 모순됐다 ③카드뉴스가 chat_bubble 덱이 아니면 말풍선
 * 편집 기능이 통째로 말없이 사라졌다(ADR-007 조용한 실패 금지 위반).
 *
 * 이 테스트는 StudioRooms.tsx 를 되돌리면(git stash) 반드시 fail 하는 것을
 * 돌연변이 검증으로 확인했다(보고 참조).
 */
import "@testing-library/jest-dom/vitest";
import { cleanup, render } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { EditRoom } from "@/components/studio/StudioRooms";
import type { CardDeck } from "@/lib/studio/card-deck-contract";
import deckD100 from "./fixtures/deck-d100.v2.json";

afterEach(() => cleanup());

function chatBubbleDeck(): CardDeck {
  return JSON.parse(JSON.stringify(deckD100)) as CardDeck;
}

describe("과업 A: 영상 탭 편집 작업대는 한 벌만 뜬다", () => {
  it("kind=video + onVideoEditChange 여도 편집 작업대 카드(data-edit-workspace)는 하나뿐이다", () => {
    render(
      <EditRoom
        lines={["첫 장면", "둘째 장면"]}
        onLinesChange={vi.fn()}
        kind="video"
        videoEdit={null}
        onVideoEditChange={vi.fn()}
        previewVideoUrl={null}
      />,
    );
    const workspaces = document.querySelectorAll("[data-edit-workspace]");
    expect(workspaces.length).toBe(1);
  });

  it("그 한 벌 안에 장면 목록(EditOutline)과 VideoEditor가 함께 있다 — 기능은 유지, 카드만 통합", () => {
    render(
      <EditRoom
        lines={["첫 장면", "둘째 장면"]}
        onLinesChange={vi.fn()}
        kind="video"
        videoEdit={null}
        onVideoEditChange={vi.fn()}
        previewVideoUrl={null}
      />,
    );
    const workspace = document.querySelector("[data-edit-workspace]")!;
    expect(workspace.querySelector("[data-edit-outline]")).toBeTruthy();
    // 순서 이동(▲▼)·장면 추가가 여전히 살아있다(회장이 쓰던 기능 회귀 0).
    expect(workspace.querySelector('[data-line-up="0"]')).toBeTruthy();
    expect(workspace.querySelector("[data-line-add]")).toBeTruthy();
    // VideoEditor(후킹 CTA·댓글·음성)가 같은 카드 안 구획으로 들어와 있다.
    expect(workspace.querySelector("[data-video-edit-workbench]")).toBeTruthy();
    expect(workspace.querySelector("[data-video-editor-empty]")).toBeTruthy();
  });

  it("영상이 아직 없을 때 상단 별도 안내 문구(data-video-edit-editor-note)는 더 없다 — VideoEditor 자체 문구와의 모순 제거", () => {
    render(
      <EditRoom
        lines={["첫 장면"]}
        onLinesChange={vi.fn()}
        kind="video"
        videoEdit={null}
        onVideoEditChange={vi.fn()}
        previewVideoUrl={null}
      />,
    );
    expect(document.querySelector("[data-video-edit-editor-note]")).toBeNull();
    // VideoEditor 자신의 정직한 빈 상태 문구만 남는다.
    expect(document.querySelector("[data-video-editor-empty]")).toBeTruthy();
  });
});

describe("과업 C: 말풍선 덱이 아닌 카드뉴스는 왜 안 보이는지 말한다", () => {
  it("cardDeck이 chat_bubble이 아니면(=undefined) 조용히 비지 않고 안내와 생성실 이동 경로를 보여준다", () => {
    const onOpenCreate = vi.fn();
    render(
      <EditRoom
        lines={["카드 한 장"]}
        onLinesChange={vi.fn()}
        kind="card"
        cardDeck={null}
        onOpenCreate={onOpenCreate}
      />,
    );
    const note = document.querySelector("[data-card-deck-missing-note]");
    expect(note).toBeTruthy();
    expect(note!.textContent).toContain("카톡 말풍선 카드뉴스 9장");
    // 생성이 지금 실패한다고 단정하지 않는다(로컬·운영 상태가 다를 수 있음).
    expect(note!.textContent).not.toMatch(/실패|에러|오류|500/);
  });

  it("chat_bubble 덱이 있으면 안내 대신 말풍선 편집(CardDeckPanel)이 뜨고 안내문은 없다", () => {
    render(
      <EditRoom
        lines={["카드 한 장"]}
        onLinesChange={vi.fn()}
        kind="card"
        cardDeck={chatBubbleDeck()}
        onCardDeckChange={vi.fn()}
      />,
    );
    expect(document.querySelector("[data-card-deck-workbench]")).toBeTruthy();
    expect(document.querySelector("[data-card-deck-missing-note]")).toBeNull();
    // chat_bubble 경로에서는 표준 편집 작업대(data-edit-workspace)도 CardDeckPanel 한 장뿐이다.
    expect(document.querySelectorAll("[data-edit-workspace]").length).toBe(1);
  });
});
