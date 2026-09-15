// @vitest-environment jsdom
// Regression: FLOW-UI-ACTIVE-V13, 상단 작업 단계와 사이드바의 현재 방이 달랐다.
// Found by /qa on 2026-09-15
// Report: docs/qa/qa-tracker.md
import "@testing-library/jest-dom/vitest";
import React from "react";
import { cleanup, render, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import StudioPage from "@/app/studio/page";

const mocks = vi.hoisted(() => ({
  swr: vi.fn(),
  apiPost: vi.fn(),
  showToast: vi.fn(),
  setStudioRoom: vi.fn(),
  room: "create",
  workspace: { id: "tenant-room-sync", name: "방 동기화 검증" },
}));

vi.mock("swr", () => ({ default: (...args: unknown[]) => mocks.swr(...args) }));
vi.mock("next/navigation", () => ({
  useSearchParams: () => new URLSearchParams(window.location.search),
  useRouter: () => ({ push: vi.fn(), replace: vi.fn(), back: vi.fn(), forward: vi.fn(), refresh: vi.fn(), prefetch: vi.fn() }),
}));
vi.mock("@/lib/api", () => ({
  fetcher: vi.fn(),
  apiPost: (...args: unknown[]) => mocks.apiPost(...args),
  isExternalPublishPersistenceError: () => false,
  ApiResponseError: class ApiResponseError extends Error { payload: unknown = null; },
}));
vi.mock("@/components/layout/Toast", () => ({ useToast: () => ({ showToast: mocks.showToast }) }));
vi.mock("@/store/ui-store", () => ({
  useUIStore: () => ({
    activeWorkspace: mocks.workspace,
    studioRoom: mocks.room,
    setStudioRoom: mocks.setStudioRoom,
  }),
}));
vi.mock("@/components/studio/PlatformPreview", () => ({
  PREVIEW_PLATFORMS: ["threads", "x", "facebook", "instagram", "shorts", "reels", "tiktok"].map((key) => ({ key, label: key })),
  PlatformPreview: ({ platform }: { platform: string }) => <div data-room-preview={platform}>{platform}</div>,
}));
vi.mock("@/components/shared/BrandSetupWizard", () => ({ BrandSetupWizard: () => null }));
vi.mock("@/components/studio/RepoConnect", () => ({ RepoConnect: () => null }));
vi.mock("@/components/studio/SchedulePanel", () => ({ SchedulePanel: () => null }));
vi.mock("@/lib/analytics/events", () => ({ trackEvent: vi.fn() }));
vi.mock("@/lib/auth", () => ({ authHeaders: () => ({}), getAuthToken: () => "customer-token" }));

beforeEach(() => {
  mocks.room = "create";
  mocks.setStudioRoom.mockReset();
  mocks.apiPost.mockReset();
  mocks.showToast.mockReset();
  mocks.swr.mockReset();
  mocks.swr.mockImplementation((key: string | null) => {
    if (key === "/api/me") return { data: { isOperator: false }, mutate: vi.fn() };
    if (key === "/api/studio/drafts?tenant_id=tenant-room-sync") return { data: { drafts: [] }, mutate: vi.fn() };
    if (key === "/api/studio/brand-setup?tenant_id=tenant-room-sync") return { data: { guide: null }, mutate: vi.fn() };
    if (key === "/api/publish/first-comment-capabilities") return { data: { capabilities: [] }, mutate: vi.fn() };
    return { data: undefined, mutate: vi.fn() };
  });
  vi.stubGlobal("fetch", vi.fn().mockResolvedValue(Response.json({ accounts: [] })));
});

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

describe("Studio URL과 사이드바 현재 방 동기화", () => {
  it("정상: 저장 상태가 생성실이어도 발행실 URL을 열면 발행실로 맞춘다", async () => {
    window.history.replaceState(null, "", "/studio?room=publish");

    render(<StudioPage />);

    await waitFor(() => expect(mocks.setStudioRoom).toHaveBeenCalledWith("publish"));
  });

  it("거절: 알 수 없는 방 이름은 저장 상태를 바꾸지 않는다", async () => {
    window.history.replaceState(null, "", "/studio?room=unknown-room");

    render(<StudioPage />);

    await waitFor(() => expect(mocks.showToast).toHaveBeenCalled());
    expect(mocks.setStudioRoom).not.toHaveBeenCalled();
  });
});
