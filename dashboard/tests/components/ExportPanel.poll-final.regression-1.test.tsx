// @vitest-environment jsdom
// Regression: EDITROOM-S4-POLL-01 — final job state update aborted latest-export refresh.
// Found by /qa on 2026-10-07.
// Report: docs/qa/qa-tracker.md
import "@testing-library/jest-dom/vitest";
import React from "react";
import { act, cleanup, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { ExportPanel } from "@/components/studio/ExportPanel";

const DRAFT_ID = "11111111-1111-4111-8111-111111111111";
const EXPORT_ID = "22222222-2222-4222-8222-222222222222";
const TENANT_ID = "33333333-3333-4333-8333-333333333333";
const HASH = "a".repeat(64);

function response(body: unknown): Promise<Response> {
  return Promise.resolve(Response.json(body));
}

describe("EDITROOM-S4-POLL-01 최종 상태 갱신", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    localStorage.clear();
  });

  afterEach(() => {
    cleanup();
    vi.unstubAllGlobals();
    vi.useRealTimers();
  });

  it("S4-AC2 정상: 재시도 성공 뒤 최신 내보내기를 다시 읽어 발행실 버튼을 연다", async () => {
    let latestCalls = 0;
    let jobCalls = 0;
    const fetchMock = vi.fn((url: string | URL | Request) => {
      const target = String(url);
      if (target.includes("/latest")) {
        latestCalls += 1;
        return response({
          current_source_revision: 7,
          current_source_hash: HASH,
          latest_export: {
            export_id: EXPORT_ID,
            status: latestCalls === 1 ? "processing" : "succeeded",
            source_revision: 7,
            source_hash: HASH,
            finished_at: latestCalls === 1 ? null : "2026-10-07T01:00:00.000Z",
          },
          is_latest: latestCalls > 1,
          blocker: latestCalls === 1 ? "EXPORT_IN_PROGRESS" : null,
        });
      }
      jobCalls += 1;
      const succeeded = jobCalls > 1;
      return response({
        export_id: EXPORT_ID,
        status: succeeded ? "succeeded" : "processing",
        source_revision: 7,
        source_hash: HASH,
        progress: { completed: succeeded ? 9 : 3, total: 9 },
        items: Array.from({ length: 9 }, (_, index) => ({
          item_key: `slide-${index + 1}`,
          ordinal: index,
          status: succeeded || index < 3 ? "succeeded" : "processing",
          attempt_count: 1,
        })),
        updated_at: "2026-10-07T01:00:00.000Z",
        finished_at: succeeded ? "2026-10-07T01:00:00.000Z" : null,
      });
    });
    vi.stubGlobal("fetch", fetchMock);

    render(<ExportPanel
      tenantId={TENANT_ID}
      draftId={DRAFT_ID}
      kind="card_deck"
      onClose={vi.fn()}
      onOpenPublish={vi.fn()}
      onOpenEmptySlide={vi.fn()}
    />);

    await act(async () => {
      for (let index = 0; index < 12; index += 1) await Promise.resolve();
    });
    expect(fetchMock).toHaveBeenCalledTimes(2);

    await act(async () => {
      await vi.advanceTimersByTimeAsync(1_000);
      for (let index = 0; index < 12; index += 1) await Promise.resolve();
    });

    expect(screen.getByRole("button", { name: "발행실로" })).toBeInTheDocument();
    expect(latestCalls).toBe(2);
  });

  it("S4-POLL-02 거절: 최종 job 뒤 latest 재조회 실패를 처리되지 않은 Promise로 남기지 않는다", async () => {
    let latestCalls = 0;
    let jobCalls = 0;
    vi.stubGlobal("fetch", vi.fn((url: string | URL | Request) => {
      const target = String(url);
      if (target.includes("/latest")) {
        latestCalls += 1;
        if (latestCalls > 1) return Promise.reject(new Error("latest refresh failed"));
        return response({
          current_source_revision: 7,
          current_source_hash: HASH,
          latest_export: { export_id: EXPORT_ID, status: "processing", source_revision: 7, source_hash: HASH, finished_at: null },
          is_latest: false,
          blocker: "EXPORT_IN_PROGRESS",
        });
      }
      jobCalls += 1;
      return response({
        export_id: EXPORT_ID,
        status: jobCalls > 1 ? "succeeded" : "processing",
        source_revision: 7,
        source_hash: HASH,
        progress: { completed: jobCalls > 1 ? 9 : 3, total: 9 },
        items: [],
        updated_at: "2026-10-07T01:00:00.000Z",
        finished_at: jobCalls > 1 ? "2026-10-07T01:00:00.000Z" : null,
      });
    }));

    render(<ExportPanel tenantId={TENANT_ID} draftId={DRAFT_ID} kind="card_deck" onClose={vi.fn()} onOpenPublish={vi.fn()} onOpenEmptySlide={vi.fn()} />);
    await act(async () => { for (let index = 0; index < 12; index += 1) await Promise.resolve(); });
    await act(async () => {
      await vi.advanceTimersByTimeAsync(1_000);
      for (let index = 0; index < 20; index += 1) await Promise.resolve();
    });

    expect(screen.getByRole("alert")).toHaveTextContent("latest refresh failed");
    expect(latestCalls).toBe(2);
  });
});
