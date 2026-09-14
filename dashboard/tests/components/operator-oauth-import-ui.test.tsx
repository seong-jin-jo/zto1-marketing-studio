// @vitest-environment jsdom
import "@testing-library/jest-dom/vitest";
import React from "react";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import OperatorCustomersPage from "@/app/operator/customers/page";

const mocks = vi.hoisted(() => ({
  swr: vi.fn(),
}));

vi.mock("swr", () => ({
  default: (...args: unknown[]) => mocks.swr(...args),
}));

interface TestOAuthProvider {
  provider: string;
  label: string;
  complete: boolean;
  credentialsConfigured: boolean;
  missing: string[];
  requiredSecrets: string[];
  fields: Array<{
    key: "clientId" | "clientSecret" | "configId";
    env: string;
    label: string;
    secret: boolean;
    configured: boolean;
    maskedValue: string | null;
  }>;
  source: "env" | "db";
  updatedAt: string | null;
  callbackUrl: string;
  consoleUrl: string;
  docsUrl: string;
  setupSteps: string[];
  setupSource: "official" | "generic";
  externalReview: "required" | "unknown";
}

const envProvider: TestOAuthProvider = {
  provider: "x",
  label: "X",
  complete: true,
  credentialsConfigured: true,
  missing: [],
  requiredSecrets: ["X_CLIENT_ID", "X_CLIENT_SECRET"],
  fields: [
    {
      key: "clientId",
      env: "X_CLIENT_ID",
      label: "Client ID",
      secret: false,
      configured: true,
      maskedValue: "••••••••",
    },
    {
      key: "clientSecret",
      env: "X_CLIENT_SECRET",
      label: "Client Secret",
      secret: true,
      configured: true,
      maskedValue: "••••••••",
    },
  ],
  source: "env",
  updatedAt: null,
  callbackUrl: "https://app.example/api/connect/x/callback",
  consoleUrl: "https://console.x.com/",
  docsUrl: "https://docs.x.com/fundamentals/authentication/oauth-2-0/authorization-code",
  setupSteps: ["OAuth 2.0 활성화"],
  setupSource: "official",
  externalReview: "unknown",
};

function swrResult(provider: TestOAuthProvider = envProvider) {
  return {
    data: {
      customers: [],
      authUsers: [],
      oauthProviders: [provider],
    },
    error: undefined,
    isLoading: false,
    mutate: vi.fn().mockResolvedValue(undefined),
  };
}

describe("operator OAuth credential UI lifecycle", () => {
  beforeEach(() => {
    localStorage.clear();
    localStorage.setItem("dashboard_auth_token", "operator-token");
    mocks.swr.mockReset();
  });

  afterEach(() => {
    cleanup();
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
  });

  it("reveals a complete env set with one button/request and refreshes DB-backed metadata", async () => {
    const initial = swrResult();
    mocks.swr.mockReturnValue(initial);
    const fetchMock = vi.fn().mockImplementation(() => Promise.resolve(Response.json({
      provider: "x",
      source: "db",
      values: { clientId: "raw-id", clientSecret: "raw-secret" },
      imported: true,
    })));
    vi.stubGlobal("fetch", fetchMock);

    const view = render(<OperatorCustomersPage />);
    // F4(fdd-r02): 카드는 기본 접힘이다. 본문 상호작용 전에 펼친다.
    fireEvent.click(screen.getByRole("button", { name: "X 자격증명 카드 펼치기" }));
    expect(screen.getByText(/환경변수로 보호/)).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "원문 확인" })).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "암호화 DB로 가져오기" })).not.toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "원문 확인" }));
    await waitFor(() => expect(initial.mutate).toHaveBeenCalledTimes(1));
    expect(fetchMock).toHaveBeenCalledWith("/api/operator/oauth-credentials", expect.objectContaining({
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: "Bearer operator-token",
      },
      body: JSON.stringify({ action: "reveal", provider: "x" }),
      cache: "no-store",
    }));
    expect(screen.getByText("raw-id")).toBeInTheDocument();
    expect(screen.getByText("raw-secret")).toBeInTheDocument();

    mocks.swr.mockReturnValue(swrResult({
      ...envProvider,
      source: "db",
      updatedAt: "2026-07-29T00:00:00.000Z",
    }));
    view.rerender(<OperatorCustomersPage />);
    expect(screen.getByText(/Admin DB에서 완전한 세트/)).toBeInTheDocument();
  });

  it("toggles each pasted field independently and keeps values hidden by default", () => {
    mocks.swr.mockReturnValue(swrResult({
      ...envProvider,
      complete: false,
      credentialsConfigured: false,
      missing: ["X_CLIENT_ID", "X_CLIENT_SECRET"],
      fields: envProvider.fields.map((field) => ({ ...field, configured: false, maskedValue: null })),
    }));
    vi.stubGlobal("fetch", vi.fn());

    render(<OperatorCustomersPage />);
    fireEvent.click(screen.getByRole("button", { name: "X 자격증명 카드 펼치기" }));
    const clientId = screen.getByLabelText("Client ID");
    const clientSecret = screen.getByLabelText("Client Secret");
    expect(clientId).toHaveAttribute("type", "password");
    expect(clientSecret).toHaveAttribute("type", "password");

    fireEvent.change(clientId, { target: { value: "pasted-id" } });
    fireEvent.change(clientSecret, { target: { value: "pasted-secret" } });
    fireEvent.click(screen.getByRole("button", { name: "Client ID 입력값 표시" }));
    expect(clientId).toHaveAttribute("type", "text");
    expect(clientSecret).toHaveAttribute("type", "password");
    expect(screen.getByRole("button", { name: "Client ID 입력값 숨김" })).toBeInTheDocument();
  });

  it("saves a complete unset provider set, refreshes metadata, and shows a Korean card error on failure", async () => {
    const unsetProvider = {
      ...envProvider,
      complete: false,
      credentialsConfigured: false,
      missing: ["X_CLIENT_ID", "X_CLIENT_SECRET"],
      fields: envProvider.fields.map((field) => ({ ...field, configured: false, maskedValue: null })),
    };
    const initial = swrResult(unsetProvider);
    mocks.swr.mockReturnValue(initial);
    const fetchMock = vi.fn()
      .mockResolvedValueOnce(Response.json({ error: "암호화 키 또는 데이터베이스 연결이 설정되지 않았습니다." }, { status: 503 }))
      .mockResolvedValueOnce(Response.json({ ok: true, provider: "x", updatedAt: "2026-07-30T00:00:00.000Z" }));
    vi.stubGlobal("fetch", fetchMock);

    const view = render(<OperatorCustomersPage />);
    fireEvent.click(screen.getByRole("button", { name: "X 자격증명 카드 펼치기" }));
    fireEvent.change(screen.getByLabelText("Client ID"), { target: { value: "new-id" } });
    fireEvent.change(screen.getByLabelText("Client Secret"), { target: { value: "new-secret" } });
    fireEvent.click(screen.getByRole("button", { name: "전체 세트 저장" }));
    expect(await screen.findByText("암호화 키 또는 데이터베이스 연결이 설정되지 않았습니다.")).toBeInTheDocument();
    expect(initial.mutate).not.toHaveBeenCalled();

    fireEvent.click(screen.getByRole("button", { name: "전체 세트 저장" }));
    await waitFor(() => expect(initial.mutate).toHaveBeenCalledTimes(1));
    expect(fetchMock).toHaveBeenLastCalledWith("/api/operator/oauth-credentials", expect.objectContaining({
      method: "PUT",
      body: JSON.stringify({ provider: "x", values: { clientId: "new-id", clientSecret: "new-secret" } }),
    }));

    mocks.swr.mockReturnValue(swrResult({
      ...envProvider,
      source: "db",
      updatedAt: "2026-07-30T00:00:00.000Z",
    }));
    view.rerender(<OperatorCustomersPage />);
    expect(screen.getByText(/Admin DB에서 완전한 세트/)).toBeInTheDocument();
  });
});
