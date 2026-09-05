// @vitest-environment jsdom
import "@testing-library/jest-dom/vitest";
import React from "react";
import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import OperatorCustomersPage from "@/app/operator/customers/page";

const mocks = vi.hoisted(() => ({
  swr: vi.fn(),
}));

vi.mock("swr", () => ({
  default: (...args: unknown[]) => mocks.swr(...args),
}));

function customer(overrides: Record<string, unknown> = {}) {
  return {
    id: "tenant-1",
    slug: "customer-one",
    name: "고객 작업 공간",
    status: "active",
    tier: "team",
    owner_auth_id: "auth-1",
    created_at: "2026-08-01T00:00:00.000Z",
    last_accessed_at: null,
    recent_access_days_30: null,
    shared_cli_approved_at: null,
    integrations: [],
    channel_accounts: [],
    drafts_count: 0,
    published_count: 0,
    failed_count: 0,
    usage_events_count: 0,
    last_usage_at: null,
    shorts_used: null,
    generations_used: null,
    ...overrides,
  };
}

function renderPage(workspace: ReturnType<typeof customer>) {
  mocks.swr.mockReturnValue({
    data: {
      customers: [workspace],
      authUsers: [],
      oauthProviders: [],
    },
    error: undefined,
    isLoading: false,
    mutate: vi.fn(),
  });
  return render(<OperatorCustomersPage />);
}

describe("운영자 고객 접속 기록 표시", () => {
  afterEach(() => {
    cleanup();
    mocks.swr.mockReset();
  });

  it("TENANT-ACCESS-03 거절: 접속 기록이 없으면 0일 대신 접속 기록 없음을 표시한다", () => {
    renderPage(customer());

    expect(screen.getByText("접속 기록 없음")).toBeInTheDocument();
    expect(screen.queryByText(/최근 30일 접속 0일/)).not.toBeInTheDocument();
  });

  it("TENANT-ACCESS-04 정상: 접속 기록이 있으면 마지막 시각과 최근 30일 접속 일수를 표시한다", () => {
    renderPage(customer({
      last_accessed_at: "2026-09-01T01:30:00.000Z",
      recent_access_days_30: 4,
    }));

    expect(screen.getByText(/최근 접속/)).toBeInTheDocument();
    expect(screen.getByText("최근 30일 접속 4일")).toBeInTheDocument();
    expect(screen.queryByText("접속 기록 없음")).not.toBeInTheDocument();
  });
});
