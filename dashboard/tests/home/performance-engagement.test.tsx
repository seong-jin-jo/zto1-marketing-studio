// @vitest-environment jsdom
import "@testing-library/jest-dom/vitest";
import React from "react";
import { cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { PerformanceRoom } from "@/components/home/PerformanceRoom";

const H = vi.hoisted(() => ({ fetcher: vi.fn(), apiPost: vi.fn() }));
vi.mock("@/lib/api", () => ({
  fetcher: H.fetcher,
  apiPost: H.apiPost,
  ApiResponseError: class ApiResponseError extends Error {},
}));

const post = {
  id: "22222222-2222-4222-8222-222222222222",
  platform: "threads",
  text: "올린 글 본문",
  status: "published",
  published_at: "2026-08-28T01:00:00Z",
  views: 100,
  likes: 10,
  replies: 1,
};

const supported = {
  read: { supported: true, reason: null }, reply: { supported: true, reason: null },
  like: { supported: true, reason: null }, defer: { supported: true, reason: null },
  editorHandoff: { supported: true, reason: null },
};

function room(posts = [post]) {
  return <PerformanceRoom workspaceId="11111111-1111-4111-8111-111111111111" workspaceName="공용 작업 공간" metricsLoaded posts={posts} publishedCount={1} followers="10" engagementRate={2} queuedCount={0} viralCount={0} collecting={false} onCollectMetrics={vi.fn(async () => {})} />;
}

describe("FE-V63-07 성과실 댓글 행동", () => {
  beforeEach(() => {
    H.fetcher.mockReset();
    H.apiPost.mockReset();
  });

  afterEach(() => cleanup());

  it("V68-PERF-03 정상: 성과실 담당 패널은 이름 있는 보조 랜드마크다", () => {
    H.fetcher.mockImplementation(() => new Promise(() => {}));
    render(room());

    expect(screen.getByRole("complementary", { name: "성과실 담당 대화창" })).toBeInTheDocument();
  });

  it("V69-COPY-01 거절: 성과 요약에 이메일 형태의 작업 공간 이름을 노출하지 않는다", () => {
    H.fetcher.mockImplementation(() => new Promise(() => {}));
    render(<PerformanceRoom workspaceId="11111111-1111-4111-8111-111111111111" workspaceName="owner@example.test" metricsLoaded posts={[post]} publishedCount={1} followers="10" engagementRate={2} queuedCount={0} viralCount={0} collecting={false} onCollectMetrics={vi.fn(async () => {})} />);

    expect(screen.getByText("성과 요약 · 기본 작업 공간 · 최근 30일")).toBeInTheDocument();
    expect(screen.queryByText(/owner@example\.test/)).not.toBeInTheDocument();
  });

  it("FE-V63-07 정상 경로: 본문을 읽고 다섯 후속 행동 단추가 실제 API를 호출한다", async () => {
    H.fetcher.mockResolvedValue({
      postId: post.id, platform: "threads", capability: supported,
      items: [{
        id: "comment-1", parentId: post.id, author: "@maker", body: "댓글 본문", createdAt: "2026-08-28T02:00:00Z",
        likeCount: 2, permalink: null, state: "unread", repliedAt: null, replyText: null, likedAt: null,
        deferredAt: null, editorHandoffAt: null, editorDraftId: null,
      }],
    });
    H.apiPost.mockImplementation(async (_url: string, body: { action: string }) => body.action === "draft_reply" ? { draft: "브랜드 근거 답글" } : { ok: true });
    render(room());

    const body = await screen.findByText("댓글 본문");
    const article = body.closest('[data-engagement-comment="comment-1"]') as HTMLElement;
    expect(article).toBeInTheDocument();
    fireEvent.click(within(article).getByRole("button", { name: "답글 초안 만들기" }));
    await waitFor(() => expect(within(article).getByRole("textbox", { name: "@maker 답글" })).toHaveValue("브랜드 근거 답글"));
    fireEvent.click(within(article).getByRole("button", { name: "이 답글 보내기" }));
    await waitFor(() => expect(H.apiPost).toHaveBeenCalledTimes(2));
    await waitFor(() => expect(within(article).getByRole("button", { name: "좋아요" })).toBeEnabled());
    fireEvent.click(within(article).getByRole("button", { name: "좋아요" }));
    await waitFor(() => expect(H.apiPost).toHaveBeenCalledTimes(3));
    await waitFor(() => expect(within(article).getByRole("button", { name: "나중 처리" })).toBeEnabled());
    fireEvent.click(within(article).getByRole("button", { name: "나중 처리" }));
    await waitFor(() => expect(H.apiPost).toHaveBeenCalledTimes(4));
    await waitFor(() => expect(within(article).getByRole("button", { name: "편집실에서 고치기" })).toBeEnabled());
    fireEvent.click(within(article).getByRole("button", { name: "편집실에서 고치기" }));

    await waitFor(() => expect(H.apiPost).toHaveBeenCalledTimes(5));
    expect(H.apiPost.mock.calls.map(([, body]) => body.action)).toEqual(["draft_reply", "send_reply", "like", "defer", "editor_handoff"]);
  }, 20_000);

  it("FE-V63-07 거절 경로: TikTok은 되는 척하지 않고 댓글 계약 부재 이유를 표시한다", async () => {
    const tiktokPost = { ...post, platform: "tiktok" };
    H.fetcher.mockResolvedValue({
      postId: post.id, platform: "tiktok", items: [],
      capability: Object.fromEntries(Object.keys(supported).map((key) => [key, { supported: false, reason: "TikTok Content Posting API는 댓글 관리 계약을 제공하지 않습니다." }])),
      unavailableReason: "TikTok Content Posting API는 댓글 관리 계약을 제공하지 않습니다.",
    });
    render(room([tiktokPost]));

    expect(await screen.findByText(/TikTok Content Posting API는 댓글 관리 계약을 제공하지 않습니다/)).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "이 답글 보내기" })).not.toBeInTheDocument();
    expect(H.apiPost).not.toHaveBeenCalled();
  });

  // 2026-09-05 회장 계정 실측 회귀: 글이 이미 나갔는데도 빈 화면이 "첫 편이 나가면
  // 모입니다" 라고 말했다. 실제 이유는 수집이 막힌 것이라 사용자는 기다리기만 한다.
  it("FE-V63-08 거절: 나간 글이 있는데 반응이 비면 기다리라고 하지 않고 조치를 안내한다", () => {
    render(<PerformanceRoom workspaceId="11111111-1111-4111-8111-111111111111" workspaceName="공용 작업 공간" metricsLoaded posts={[]} publishedCount={1} followers="10" engagementRate={2} queuedCount={0} viralCount={0} collecting={false} onCollectMetrics={vi.fn(async () => {})} />);

    expect(screen.getByText(/성과 다시 수집하기를 눌러/)).toBeInTheDocument();
    expect(screen.queryByText(/첫 편이 나가면 댓글과 반응이/)).toBeNull();
  });

  // 2026-09-05 실측 회귀: 계정이 바뀌기 전까지 영원히 안 채워지는 글을 "미수집"으로 적으면
  // 사용자는 무한정 기다린다. 못 재는 글은 못 잰다고 적는다.
  it("FE-V63-09 정상: 측정이 막힌 글은 미수집이 아니라 측정 불가로 적는다", () => {
    const blocked = {
      id: "blocked-1",
      platform: "threads",
      text: "측정 막힌 글",
      status: "published",
      published_at: "2026-09-04T20:41:14.000Z",
      metrics_blocked: { code: "post_not_in_account", at: "2026-09-05T12:00:00.000Z" },
    };
    render(<PerformanceRoom workspaceId="11111111-1111-4111-8111-111111111111" workspaceName="공용 작업 공간" metricsLoaded posts={[blocked]} publishedCount={1} followers="10" engagementRate={2} queuedCount={0} viralCount={0} collecting={false} onCollectMetrics={vi.fn(async () => {})} />);

    expect(screen.getAllByText("측정 불가").length).toBeGreaterThan(0);
  });
});
