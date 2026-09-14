// @vitest-environment jsdom
import "@testing-library/jest-dom/vitest";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { StudioCommandPanel } from "@/components/studio/StudioCommandPanel";
import { createEditorHandoff } from "@/lib/studio/editor-handoff";

const mocks = vi.hoisted(() => ({ apiPost: vi.fn() }));

vi.mock("@/lib/api", () => ({
  apiPost: (...args: unknown[]) => mocks.apiPost(...args),
}));

const videoHandoff = createEditorHandoff({
  kind: "video",
  summary: "제품 설명 영상",
  payload: {
    asset_url: "/media/video.mp4",
    scenes: [
      { id: "scene-1", order: 0, title: "시작", lines: [{ id: "line-1", order: 0, text: "첫 문장" }] },
      { id: "scene-2", order: 1, title: "마무리", lines: [{ id: "line-2", order: 0, text: "끝 문장" }] },
    ],
  },
});

beforeEach(() => mocks.apiPost.mockReset());
afterEach(cleanup);

describe("FE-V63-31 Studio 담당 대화 명령 연결", () => {
  it("R-S10-38 정상: 편집 저장과 발행실 이동을 같은 행동 구역에서 분리한다", async () => {
    mocks.apiPost.mockResolvedValue({ draft_id: "draft-1", handoff: videoHandoff });
    const onDraftId = vi.fn();
    const onHandoff = vi.fn();
    const onSaveEdit = vi.fn().mockResolvedValue(undefined);
    const onOpenPublish = vi.fn();
    render(<StudioCommandPanel
      workspaceId="tenant-1"
      draftId={null}
      idea="제품 설명"
      text={{ shorts: { hook: "첫 문장", body: "본문", cta: "끝 문장" } }}
      imageUrl={null}
      videoUrl="/media/video.mp4"
      editorLines={["고친 첫 문장", "고친 마지막 문장"]}
      source={{ generationId: "generation-1", candidateId: "candidate-a" }}
      initialHandoff={null}
      onDraftId={onDraftId}
      onHandoff={onHandoff}
      onQueueChanged={vi.fn()}
      onSaveEdit={onSaveEdit}
      onOpenPublish={onOpenPublish}
    />);

    expect(screen.getByRole("complementary", { name: "편집 담당 대화창" })).toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "편집 내용 저장" }));
    await waitFor(() => expect(onSaveEdit).toHaveBeenCalledTimes(1));
    fireEvent.click(screen.getByRole("button", { name: "발행실로 이동" }));
    expect(onOpenPublish).toHaveBeenCalledTimes(1);
    expect(screen.queryByText("편집 작업물로 저장")).not.toBeInTheDocument();
    expect(screen.queryByText("여기서만 한 번에 되는 일")).not.toBeInTheDocument();
  });

  it("FE-V63-31 정상 경로: 장면 순서 버튼은 revision과 전체 scene id를 보낸다", async () => {
    mocks.apiPost.mockResolvedValue({ handoff: { ...videoHandoff, revision: 1 } });
    render(<StudioCommandPanel
      workspaceId="tenant-1"
      draftId="draft-1"
      idea="제품 설명"
      text={{ shorts: { hook: "첫 문장", body: "본문", cta: "끝 문장" } }}
      imageUrl={null}
      videoUrl="/media/video.mp4"
      initialHandoff={videoHandoff}
      onDraftId={vi.fn()}
      onHandoff={vi.fn()}
      onQueueChanged={vi.fn()}
      onSaveEdit={vi.fn()}
      onOpenPublish={vi.fn()}
    />);

    fireEvent.click(screen.getByRole("button", { name: "장면 순서 뒤집기" }));
    await waitFor(() => expect(mocks.apiPost).toHaveBeenCalledWith(
      "/api/studio/commands",
      expect.objectContaining({
        action: "reorder_scenes",
        draft_id: "draft-1",
        expected_revision: 0,
        ordered_ids: ["scene-2", "scene-1"],
      }),
    ));
  });

  it("R-S10-38 거절 경로: 편집할 내용이 없으면 저장과 발행실 이동을 실행하지 않는다", () => {
    render(<StudioCommandPanel
      workspaceId="tenant-1"
      draftId={null}
      idea=""
      text={null}
      imageUrl={null}
      videoUrl={null}
      initialHandoff={null}
      onDraftId={vi.fn()}
      onHandoff={vi.fn()}
      onQueueChanged={vi.fn()}
      onSaveEdit={vi.fn()}
      onOpenPublish={vi.fn()}
    />);
    expect(screen.getByRole("button", { name: "편집 내용 저장" })).toBeDisabled();
    expect(screen.getByRole("button", { name: "발행실로 이동" })).toBeDisabled();
    fireEvent.click(screen.getByRole("button", { name: "편집 내용 저장" }));
    expect(mocks.apiPost).not.toHaveBeenCalled();
  });
});
