// @vitest-environment jsdom
/**
 * 세션맥락 2026-09-23 과업 A·B·C 회귀 + v70 2단계(2026-09-25) 갱신.
 *
 * 회장이 운영 9444에서 직접 확인: "편집실 글 카드뉴스 영상은 여전히 씹창".
 * 원인 ①영상 탭에서 표준 편집 작업대(장면 순서·본문·비율·자막)와 VideoEditor(후킹
 * CTA·댓글·음성)가 별도 카드 두 장으로 겹쳐 떴다 ②그 위 안내 문구가 바로 아래
 * VideoEditor 빈 상태 문구와 모순됐다 ③카드뉴스가 chat_bubble 덱이 아니면 말풍선
 * 편집 기능이 통째로 말없이 사라졌다(ADR-007 조용한 실패 금지 위반).
 *
 * v70 2단계(design-spec-editroom-v70.md §4)는 과업 A의 해법을 한 단계 더 밀었다.
 * "같은 카드 안 구획으로 합친다"가 아니라 "영상은 형식 전용 편집기 한 벌만 그린다" —
 * 옛 장면 목록(EditOutline)·▲▼ 순서 이동은 영상에서 완전히 걷어내고 VideoEditor 안의
 * 자막 대본(한 줄 = 한 컷)이 그 역할을 대신한다. 그래서 이 파일의 "장면 목록이 함께
 * 있다" 단언은 새 규격과 반대라 갱신한다(카드는 그대로 유지된다는 것은 별도 테스트로
 * 남긴다).
 *
 * 이 테스트는 StudioRooms.tsx 를 되돌리면(git stash) 반드시 fail 하는 것을
 * 돌연변이 검증으로 확인했다(보고 참조).
 */
import "@testing-library/jest-dom/vitest";
import React from "react";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { EditRoom } from "@/components/studio/StudioRooms";
import type { CardDeck } from "@/lib/studio/card-deck-contract";
import { emptyVideoEdit, type VideoEdit } from "@/lib/studio/video-edit-contract";
import deckD100 from "./fixtures/deck-d100.v2.json";

afterEach(() => { cleanup(); vi.unstubAllGlobals(); });

// VideoEditor가 마운트되면 VoiceSelector가 곧장 /api/elevenlabs-voices를 부른다(§4.2
// "목소리 표시"). 이 파일의 테스트는 배치·자막 대본만 확인하므로 연결 안 됨으로 고정한다.
function stubVoicesUnconfigured() {
  vi.stubGlobal("fetch", vi.fn(async () => ({ ok: false, status: 503, json: async () => ({ code: "ELEVENLABS_NOT_CONFIGURED" }) })));
}

function chatBubbleDeck(): CardDeck {
  return JSON.parse(JSON.stringify(deckD100)) as CardDeck;
}

describe("과업 A: 영상 탭 편집 작업대는 한 벌만 뜬다", () => {
  it("목록 본문이 비어도 복원된 영상이 있으면 빈 화면으로 바꾸지 않는다", () => {
    stubVoicesUnconfigured();
    render(
      <EditRoom
        lines={[]}
        onLinesChange={vi.fn()}
        kind="video"
        videoEdit={emptyVideoEdit()}
        onVideoEditChange={vi.fn()}
        previewReady
        previewVideoUrl="/api/media/restored-video"
      />,
    );
    expect(document.querySelector("[data-video-editor]")).toBeInTheDocument();
    expect(document.querySelector('[data-edit-state="empty"]')).not.toBeInTheDocument();
  });

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

  it("v70: 영상 작업대 안에는 VideoEditor만 있고 옛 장면 목록(EditOutline)·▲▼ 순서 이동은 없다", () => {
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
    // v70 §4: 영상은 플레이어+자막 대본+타임라인 한 벌뿐이다. 목차 나브가 남아 있으면
    // 같은 장면 목록이 두 곳에서 따로 논다.
    expect(workspace.querySelector("[data-edit-outline]")).toBeNull();
    expect(workspace.querySelector('[data-line-up="0"]')).toBeNull();
    // VideoEditor(자막 대본·후킹 CTA·댓글·음성)가 그 자리를 대신한다.
    expect(workspace.querySelector("[data-video-editor]") || workspace.querySelector("[data-video-editor-empty]")).toBeTruthy();
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

describe("과업 C: 일반 카드 작업물도 v70 카드 편집 셸에서 연다", () => {
  it("cardDeck이 chat_bubble이 아니면 일반 카드 스트립·무대·문구 입력을 보여준다", () => {
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
    expect(document.querySelector("[data-plain-card-shell]")).toBeTruthy();
    expect(document.querySelectorAll("[data-card-thumbnail]")).toHaveLength(1);
    expect(screen.getByRole("textbox", { name: "문구 1" })).toHaveValue("카드 한 장");
    expect(document.querySelector("[data-card-deck-missing-note]")).toBeNull();
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

/**
 * VideoEditor는 controlled 컴포넌트라 상위가 onVideoEditChange를 받아 state로 되먹여야
 * 자막 시딩·컷 반영이 실제로 화면에 나타난다(진짜 page.tsx 구조와 같다 — 위
 * edit-autosave-merge.regression-1.test.tsx의 Harness와 같은 이유).
 */
function VideoRoomHarness({ initialLines, onLinesChangeSpy }: { initialLines: string[]; onLinesChangeSpy?: (lines: string[]) => void }) {
  const [lines, setLines] = React.useState(initialLines);
  const [videoEdit, setVideoEdit] = React.useState<VideoEdit | null>(null);
  return (
    <EditRoom
      lines={lines}
      onLinesChange={(next) => { setLines(next); onLinesChangeSpy?.(next); }}
      kind="video"
      videoEdit={videoEdit}
      onVideoEditChange={setVideoEdit}
      previewVideoUrl="/api/media/test-video-token"
    />
  );
}

describe("v70 §4: 영상 편집 워크벤치(플레이어+자막 대본+타임라인)", () => {
  it("영상이 있으면 배치(위 플레이어+대본, 아래 3레인 타임라인)가 전부 뜬다", () => {
    stubVoicesUnconfigured();
    render(<VideoRoomHarness initialLines={["첫 장면 대사", "둘째 장면 대사"]} />);
    expect(document.querySelector("[data-video-workbench]")).toBeTruthy();
    expect(document.querySelector("[data-video-top]")).toBeTruthy();
    expect(document.querySelector("[data-video-screen]")).toBeTruthy();
    expect(document.querySelector("[data-video-subtitle-script]")).toBeTruthy();
    expect(document.querySelector("[data-video-timeline]")).toBeTruthy();
    const lanes = document.querySelectorAll("[data-video-timeline-lane]");
    expect(lanes.length).toBe(3);
    const laneLabels = Array.from(lanes).map((lane) => lane.getAttribute("data-video-timeline-lane"));
    expect(laneLabels).toEqual(["자막", "훅·CTA", "댓글"]);
    // §4.4 "초 숫자 입력칸 0개".
    expect(document.querySelectorAll('[data-video-timeline] input[type="number"]').length).toBe(0);
  });

  it("PR94-R3-VIDEO-01 정상: 390 플레이어는 180px이고 대본과 108px 타임라인이 뒤따른다", () => {
    stubVoicesUnconfigured();
    render(<VideoRoomHarness initialLines={["첫 장면 대사"]} />);
    const playback = document.querySelector("[data-video-playback]");
    const screen = document.querySelector("[data-video-screen]");
    expect(playback?.className).toContain("max-[26rem]:h-[11.25rem]");
    expect(playback?.className).toContain("max-[26rem]:space-y-none");
    expect(screen?.className).toContain("max-[26rem]:min-h-0");
    expect(screen?.className).toContain("max-[26rem]:aspect-auto");
    expect(document.querySelector("[data-video-workbench]")?.className).toContain("max-[26rem]:[grid-template-rows:auto_6.75rem]");
    expect(document.querySelector("[data-video-script-column]")).toBeInTheDocument();
  });

  it("자막 대본이 lines에서 시딩되고, 한 줄 = 한 컷이다", () => {
    stubVoicesUnconfigured();
    render(<VideoRoomHarness initialLines={["첫 장면 대사", "둘째 장면 대사"]} />);
    const rows = document.querySelectorAll("[data-video-subtitle-id]");
    expect(rows.length).toBe(2);
    const texts = Array.from(document.querySelectorAll("[data-video-subtitle-text]")).map((el) => (el as HTMLInputElement).value);
    expect(texts).toEqual(["첫 장면 대사", "둘째 장면 대사"]);
  });

  it("자막 줄에서 컷하면 취소선으로 남지만 lines(발행 원문)는 그대로다(M2/M4 갱신)", () => {
    // 컷이 lines를 줄이면 전부 컷했을 때 편집실이 빈 작업물로 튕긴다.
    // lines는 발행 본문이라 컷과 무관하게 그대로 둔다.
    // 영상 파일에서 그 구간을 빼는 일은 발행실로 이동할 때 videoEdit 굽기가 한다.
    stubVoicesUnconfigured();
    const onLinesChangeSpy = vi.fn();
    render(<VideoRoomHarness initialLines={["첫 장면 대사", "둘째 장면 대사"]} onLinesChangeSpy={onLinesChangeSpy} />);
    const cutButtons = document.querySelectorAll("[data-video-subtitle-cut-toggle]");
    fireEvent.click(cutButtons[0]);
    expect(onLinesChangeSpy).not.toHaveBeenCalled();
    const row = document.querySelectorAll("[data-video-subtitle-id]")[0];
    expect(row.getAttribute("data-video-subtitle-cut")).toBe("true");
    const undoButton = row.querySelector("[data-video-subtitle-cut-toggle]")!;
    fireEvent.click(undoButton);
    expect(onLinesChangeSpy).not.toHaveBeenCalled();
    expect(row.getAttribute("data-video-subtitle-cut")).toBe("false");
  });

  it("Backspace로 빈 자막 줄을 지우면 그 구간이 컷된다(§4.3)", () => {
    stubVoicesUnconfigured();
    // 둘째 줄을 지워 컷한다 — 첫째 줄은 그대로 둬서 방이 "빈 작업물" 상태로
    // 튕기지 않게 한다(그 판정은 EditRoom의 별개 로직이라 이 테스트 범위가 아니다).
    render(<VideoRoomHarness initialLines={["첫 장면 대사", "둘째 장면 대사"]} />);
    const inputs = document.querySelectorAll("[data-video-subtitle-text]");
    const secondInput = inputs[1] as HTMLInputElement;
    fireEvent.change(secondInput, { target: { value: "" } });
    fireEvent.keyDown(secondInput, { key: "Backspace" });
    const row = document.querySelectorAll("[data-video-subtitle-id]")[1]!;
    expect(row.getAttribute("data-video-subtitle-cut")).toBe("true");
  });
});
