// @vitest-environment jsdom
import "@testing-library/jest-dom/vitest";
import React from "react";
import { act, cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { ExportPanel } from "@/components/studio/ExportPanel";

const DRAFT_ID = "11111111-1111-4111-8111-111111111111";
const EXPORT_ID = "22222222-2222-4222-8222-222222222222";
const HASH = "a".repeat(64);

const latest = (overrides: Record<string, unknown> = {}) => ({
  current_source_revision: 7,
  current_source_hash: HASH,
  latest_export: null,
  is_latest: false,
  blocker: "NO_SUCCESSFUL_EXPORT",
  ...overrides,
});

const job = (overrides: Record<string, unknown> = {}) => ({
  export_id: EXPORT_ID,
  status: "processing",
  source_revision: 7,
  source_hash: HASH,
  progress: { completed: 3, total: 9 },
  items: Array.from({ length: 9 }, (_, index) => ({
    item_key: `slide-${index + 1}`,
    ordinal: index,
    status: index < 3 ? "succeeded" : "processing",
    attempt_count: 1,
  })),
  updated_at: "2026-10-07T00:00:00.000Z",
  finished_at: null,
  ...overrides,
});

function response(body: unknown, status = 200): Promise<Response> {
  return Promise.resolve(Response.json(body, { status }));
}

const props = {
  tenantId: "33333333-3333-4333-8333-333333333333",
  draftId: DRAFT_ID,
  kind: "card_deck" as const,
  onClose: vi.fn(),
  onOpenPublish: vi.fn(),
  onOpenEmptySlide: vi.fn(),
};

beforeEach(() => {
  vi.useRealTimers();
  localStorage.clear();
  vi.clearAllMocks();
});

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
  vi.useRealTimers();
});

describe("S4 ExportPanel 계약", () => {
  it("S4-AC1 정상: 최초 내보내기는 최신 revision·hash로 접수하고 새 job을 표시한다", async () => {
    const fetchMock = vi.fn((url: string | URL | Request, init?: RequestInit) => {
      const target = String(url);
      if (target.includes("/latest")) return response(latest());
      if (target.endsWith("/exports") && init?.method === "POST") return response({ export_id: EXPORT_ID, status: "queued" }, 202);
      return response(job({ status: "queued", progress: { completed: 0, total: 9 } }));
    });
    vi.stubGlobal("fetch", fetchMock);

    render(<ExportPanel {...props} />);
    fireEvent.click(await screen.findByRole("button", { name: "내보내기" }));

    await waitFor(() => expect(fetchMock).toHaveBeenCalledWith(expect.stringMatching(/\/exports$/), expect.objectContaining({
      method: "POST",
      body: JSON.stringify({
        kind: "card_deck",
        expected_source_revision: 7,
        expected_source_hash: HASH,
        item_keys: null,
        tenant_id: props.tenantId,
      }),
    })));
    expect(await screen.findByText("0 / 9장")).toBeInTheDocument();
  });

  it("S4-AC1 경합: 다른 탭의 활성 내보내기는 반환된 export ID로 이어서 조회한다", async () => {
    const ACTIVE_EXPORT_ID = "44444444-4444-4444-8444-444444444444";
    const fetchMock = vi.fn((url: string | URL | Request, init?: RequestInit) => {
      const target = String(url);
      if (target.includes("/latest")) return response(latest());
      if (target.endsWith("/exports") && init?.method === "POST") {
        return response({ code: "EXPORT_ALREADY_ACTIVE", export_id: ACTIVE_EXPORT_ID }, 429);
      }
      if (target.includes(ACTIVE_EXPORT_ID)) return response(job({ export_id: ACTIVE_EXPORT_ID }));
      throw new Error(`unexpected request: ${target}`);
    });
    vi.stubGlobal("fetch", fetchMock);

    render(<ExportPanel {...props} />);
    fireEvent.click(await screen.findByRole("button", { name: "내보내기" }));

    expect(await screen.findByText("3 / 9장")).toBeInTheDocument();
    expect(fetchMock).toHaveBeenCalledWith(expect.stringContaining(`/exports/${ACTIVE_EXPORT_ID}`), expect.objectContaining({ cache: "no-store" }));
  });

  it("S4-AC1 정상: 실제 API 진행 응답의 3 / 9장과 장별 상태를 표시한다", async () => {
    vi.stubGlobal("fetch", vi.fn((url: string | URL | Request) => {
      const target = String(url);
      if (target.includes("/latest")) return response(latest({
        latest_export: { export_id: EXPORT_ID, status: "processing", source_revision: 7, source_hash: HASH, finished_at: null },
        blocker: "EXPORT_IN_PROGRESS",
      }));
      return response(job());
    }));

    render(<ExportPanel {...props} />);

    expect(await screen.findByText("3 / 9장")).toBeInTheDocument();
    expect(document.querySelectorAll('[data-export-item-status="succeeded"]')).toHaveLength(3);
    expect(screen.getByRole("progressbar", { name: "내보내기 진행률" })).toHaveValue(3);
  });

  it("S4-AC2 정상: 부분 실패에서 실패한 4번째 장만 retry 요청한다", async () => {
    const fetchMock = vi.fn((url: string | URL | Request, init?: RequestInit) => {
      const target = String(url);
      if (target.includes("/latest")) return response(latest({
        latest_export: { export_id: EXPORT_ID, status: "partially_failed", source_revision: 7, source_hash: HASH, finished_at: null },
        blocker: "EXPORT_FAILED",
      }));
      if (target.endsWith("/retry")) return response({ export_id: EXPORT_ID, status: "queued", requeued_item_keys: ["slide-4"] }, 202);
      return response(job({
        status: "partially_failed",
        progress: { completed: 9, total: 9 },
        items: [
          { item_key: "slide-1", ordinal: 0, status: "succeeded", attempt_count: 1 },
          { item_key: "slide-4", ordinal: 3, status: "failed", attempt_count: 1, error_code: "CARD_RENDER_FAILED" },
        ],
      }));
    });
    vi.stubGlobal("fetch", fetchMock);

    render(<ExportPanel {...props} />);
    fireEvent.click(await screen.findByRole("button", { name: "4장 다시 시도" }));

    await waitFor(() => expect(fetchMock).toHaveBeenCalledWith(expect.stringMatching(/\/retry$/), expect.objectContaining({
      method: "POST",
      body: JSON.stringify({ item_keys: ["slide-4"], tenant_id: props.tenantId }),
    })));
  });

  it("S4-AC3·AC4 거절: stale은 최신 재내보내기를 요구하고 빈 장은 해당 장 열기로 회수한다", async () => {
    const fetchMock = vi.fn(() => response(latest({ blocker: "EXPORT_SOURCE_STALE" })));
    vi.stubGlobal("fetch", fetchMock);
    const { rerender } = render(<ExportPanel {...props} />);

    expect(await screen.findByText(/캡션·발행 본문만 바꾼 경우/)).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "최신 내용 다시 내보내기" })).toBeInTheDocument();

    fetchMock.mockImplementation(() => response(latest({
      blocker: "EMPTY_SLIDE",
      first_empty_slide: { order: 5, number: 6, item_key: "slide-6" },
    })));
    rerender(<ExportPanel {...props} key="empty" />);
    fireEvent.click(await screen.findByRole("button", { name: "6장 열기" }));
    expect(props.onOpenEmptySlide).toHaveBeenCalledWith({ order: 5, number: 6, item_key: "slide-6" });
  });

  it("S4-POLL-01 거절: 언마운트하면 예약한 진행 조회를 정리한다", async () => {
    vi.useFakeTimers();
    const fetchMock = vi.fn((url: string | URL | Request) => String(url).includes("/latest")
      ? response(latest({
        latest_export: { export_id: EXPORT_ID, status: "processing", source_revision: 7, source_hash: HASH, finished_at: null },
        blocker: "EXPORT_IN_PROGRESS",
      }))
      : response(job()));
    vi.stubGlobal("fetch", fetchMock);

    const view = render(<ExportPanel {...props} />);
    await act(async () => {
      await vi.advanceTimersByTimeAsync(0);
      await vi.runAllTicks();
      for (let index = 0; index < 20; index += 1) await Promise.resolve();
    });
    expect(fetchMock).toHaveBeenCalledTimes(2);
    const callsBeforeUnmount = fetchMock.mock.calls.length;
    view.unmount();
    await act(async () => { await vi.advanceTimersByTimeAsync(5_000); });

    expect(fetchMock).toHaveBeenCalledTimes(callsBeforeUnmount);
  });

  it("S4-POLL-02 경계: 진행 조회가 한 번 실패해도 다음 주기에 자동 재시도한다", async () => {
    vi.useFakeTimers();
    let jobLoads = 0;
    const fetchMock = vi.fn((url: string | URL | Request) => {
      if (String(url).includes("/latest")) {
        return response(latest({
          latest_export: { export_id: EXPORT_ID, status: "processing", source_revision: 7, source_hash: HASH, finished_at: null },
          blocker: "EXPORT_IN_PROGRESS",
        }));
      }
      jobLoads += 1;
      if (jobLoads === 2) return response({ error: "temporary" }, 503);
      return response(job({ progress: { completed: jobLoads >= 3 ? 4 : 3, total: 9 } }));
    });
    vi.stubGlobal("fetch", fetchMock);

    render(<ExportPanel {...props} />);
    await act(async () => {
      await vi.advanceTimersByTimeAsync(0);
      await vi.runAllTicks();
      for (let index = 0; index < 30; index += 1) await Promise.resolve();
    });
    expect(screen.getByText("3 / 9장")).toBeInTheDocument();
    await act(async () => {
      await vi.advanceTimersByTimeAsync(1_000);
      await vi.runAllTicks();
      for (let index = 0; index < 30; index += 1) await Promise.resolve();
    });
    expect(screen.getByText(/자동으로 다시 확인합니다/)).toBeInTheDocument();
    await act(async () => {
      await vi.advanceTimersToNextTimerAsync();
      await vi.runAllTicks();
      for (let index = 0; index < 6; index += 1) await Promise.resolve();
    });
    expect(jobLoads).toBeGreaterThanOrEqual(3);
    expect(screen.getByText("4 / 9장")).toBeInTheDocument();
  });
});
