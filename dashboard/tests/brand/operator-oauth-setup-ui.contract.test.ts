// @vitest-environment jsdom
import "@testing-library/jest-dom/vitest";
import React from "react";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import fs from "node:fs";
import path from "node:path";
import OperatorCustomersPage from "@/app/operator/customers/page";

const mocks = vi.hoisted(() => ({
  swr: vi.fn(),
}));

vi.mock("swr", () => ({
  default: (...args: unknown[]) => mocks.swr(...args),
}));

const page = fs.readFileSync(
  path.resolve(process.cwd(), "src/app/operator/customers/page.tsx"),
  "utf8",
);

describe("operator central OAuth setup UI contract", () => {
  it("renders callback, required fields, setup steps, source/time and official external links", () => {
    expect(page).toContain("item.callbackUrl");
    expect(page).toContain("item.fields");
    expect(page).toContain("item.consoleUrl");
    expect(page).toContain("item.docsUrl");
    expect(page).toContain("item.setupSteps");
    expect(page).toContain("item.source");
    expect(page).toContain("item.updatedAt");
    expect(page).toContain("navigator.clipboard.writeText");
  });

  it("supports credential input/update plus one-button reveal/hide with automatic raw-value clearing", () => {
    const oauthSection = page.slice(
      page.indexOf("중앙 OAuth 개발자 앱"),
      page.indexOf("Auth 가입자"),
    );
    expect(oauthSection).toContain("<input");
    expect(oauthSection).toContain("숨기기");
    expect(page).toContain('action: "reveal"');
    expect(page).toContain("window.setTimeout");
    expect(page).toContain("setRevealedValues");
    expect(page).toContain("setCredentialInputs");
    expect(oauthSection).toContain("item.credentialsConfigured");
    expect(oauthSection).not.toContain('item.source === "db" && item.credentialsConfigured');
  });

  it("marks env values as protected and imports them only inside the single reveal request", () => {
    const oauthSection = page.slice(
      page.indexOf("중앙 OAuth 개발자 앱"),
      page.indexOf("Auth 가입자"),
    );
    expect(oauthSection).toContain("환경변수로 보호");
    expect(oauthSection).not.toContain("암호화 DB로 가져오기");
    expect(page).not.toContain('action: "import-env"');
    expect(page).not.toContain("importCredentialSet");
    expect(page).toContain("await mutate()");
    expect(page).toContain('action: "reveal"');
  });

  it("adds independent show/hide controls for pasted values while keeping every field hidden by default", () => {
    const oauthSection = page.slice(
      page.indexOf("중앙 OAuth 개발자 앱"),
      page.indexOf("Auth 가입자"),
    );
    expect(oauthSection).toContain('type={visibleCredentialInputs');
    expect(oauthSection).toContain("입력 중인 값 보기");
    expect(oauthSection).toContain("입력 중인 값 가리기");
    expect(oauthSection).toContain("toggleCredentialInputVisibility");
  });

  it("offers audited DB deletion and treats storage outages as recovery events rather than re-entry prompts", () => {
    const oauthSection = page.slice(
      page.indexOf("중앙 OAuth 개발자 앱"),
      page.indexOf("Auth 가입자"),
    );
    expect(page).toContain('method: "DELETE"');
    expect(oauthSection).toContain("DB 저장값 삭제");
    expect(oauthSection).toContain("item.unavailableReason");
    expect(oauthSection).toContain("기존 값을 다시 입력하지 마세요");
    expect(oauthSection).toContain("disabled={Boolean(item.unavailableReason)");
  });
});

const provider = (
  providerName: string,
  credentialsConfigured: boolean,
  unavailableReason?: "credential_store_unavailable",
) => ({
  provider: providerName,
  label: providerName,
  complete: credentialsConfigured,
  credentialsConfigured,
  missing: credentialsConfigured ? [] : [`${providerName.toUpperCase()}_CLIENT_ID`],
  requiredSecrets: [`${providerName.toUpperCase()}_CLIENT_ID`],
  fields: [],
  source: "env" as const,
  updatedAt: null,
  callbackUrl: `https://app.example/api/connect/${providerName}/callback`,
  consoleUrl: "https://console.example",
  docsUrl: "https://docs.example",
  setupSteps: [],
  setupSource: "official" as const,
  externalReview: "unknown" as const,
  unavailableReason,
});

function renderProviders(providers: ReturnType<typeof provider>[]) {
  mocks.swr.mockReturnValue({
    data: {
      customers: [],
      authUsers: [],
      oauthProviders: providers,
    },
    error: undefined,
    isLoading: false,
    mutate: vi.fn(),
  });
  const view = render(React.createElement(OperatorCustomersPage));
  // OAuth 자격증명은 "중앙 OAuth 앱" 탭 안에 있다(회장 2026-09-21 탭 분리).
  fireEvent.click(screen.getByRole("tab", { name: "중앙 OAuth 앱" }));
  return view;
}

describe("operator central OAuth provider ordering", () => {
  beforeEach(() => {
    mocks.swr.mockReset();
  });

  afterEach(() => {
    cleanup();
  });

  it("places storage outages before ready providers and missing providers", () => {
    const view = renderProviders([
      provider("missing-a", false),
      provider("ready-a", true),
      provider("outage-a", false, "credential_store_unavailable"),
    ]);

    expect([...view.container.querySelectorAll("[data-oauth-provider]")].map((element) => (
      element.getAttribute("data-oauth-provider")
    ))).toEqual([
      "outage-a",
      "ready-a",
      "missing-a",
    ]);
    expect(screen.getByRole("heading", { name: "저장소 장애 1개" })).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: "등록됨 1개" })).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: "미등록 1개" })).toBeInTheDocument();
  });

  it("keeps the original declaration order inside every status group", () => {
    const view = renderProviders([
      provider("missing-first", false),
      provider("ready-first", true),
      provider("outage-first", false, "credential_store_unavailable"),
      provider("ready-second", true),
      provider("missing-second", false),
      provider("outage-second", false, "credential_store_unavailable"),
    ]);

    const providersIn = (key: string) => [...view.container.querySelectorAll(
      `section[aria-labelledby="oauth-provider-group-${key}"] [data-oauth-provider]`,
    )].map((element) => element.getAttribute("data-oauth-provider"));

    expect(providersIn("unavailable")).toEqual(["outage-first", "outage-second"]);
    expect(providersIn("ready")).toEqual(["ready-first", "ready-second"]);
    expect(providersIn("missing")).toEqual(["missing-first", "missing-second"]);
  });

  it("preserves the total provider count without duplication or omission", () => {
    const input = [
      provider("missing-a", false),
      provider("ready-a", true),
      provider("outage-a", true, "credential_store_unavailable"),
      provider("ready-b", true),
    ];

    const view = renderProviders(input);
    const output = [...view.container.querySelectorAll("[data-oauth-provider]")].map((element) => (
      element.getAttribute("data-oauth-provider")
    ));

    expect(output).toHaveLength(input.length);
    expect(new Set(output).size).toBe(input.length);
  });
});

describe("operator console tab split", () => {
  beforeEach(() => {
    mocks.swr.mockReset();
    window.history.replaceState(null, "", "/operator/customers");
  });

  afterEach(() => {
    cleanup();
  });

  function renderPage(providers: ReturnType<typeof provider>[] = [provider("x", true)]) {
    mocks.swr.mockReturnValue({
      data: {
        customers: [],
        authUsers: [],
        summary: {
          authUsers: 1,
          workspaces: 1,
          activeWorkspaces: 1,
          connectedAccounts: 0,
          published: 0,
          failed: 0,
        },
        oauthProviders: providers,
      },
      error: undefined,
      isLoading: false,
      mutate: vi.fn(),
    });
    return render(React.createElement(OperatorCustomersPage));
  }

  it("defaults to the overview·incident tab and hides the OAuth panel", () => {
    const { container } = renderPage();
    expect(screen.getByRole("tab", { name: "개요·장애" })).toHaveAttribute("aria-selected", "true");
    expect(container.querySelector("#operator-tabpanel-overview")).not.toHaveAttribute("hidden");
    expect(container.querySelector("#operator-tabpanel-oauth")).toHaveAttribute("hidden");
  });

  it("switches to the OAuth tab on click and keeps the URL in sync via ?tab=", () => {
    const { container } = renderPage();
    fireEvent.click(screen.getByRole("tab", { name: "중앙 OAuth 앱" }));
    expect(screen.getByRole("tab", { name: "중앙 OAuth 앱" })).toHaveAttribute("aria-selected", "true");
    expect(container.querySelector("#operator-tabpanel-oauth")).not.toHaveAttribute("hidden");
    expect(window.location.search).toContain("tab=oauth");
  });

  it("restores the requested tab from the ?tab= query on initial render", () => {
    window.history.replaceState(null, "", "/operator/customers?tab=customers");
    const { container } = renderPage();
    expect(screen.getByRole("tab", { name: "가입자" })).toHaveAttribute("aria-selected", "true");
    expect(container.querySelector("#operator-tabpanel-customers")).not.toHaveAttribute("hidden");
  });
});

describe("operator OAuth batch save for unregistered channels", () => {
  beforeEach(() => {
    mocks.swr.mockReset();
    window.history.replaceState(null, "", "/operator/customers");
  });

  afterEach(() => {
    cleanup();
    vi.unstubAllGlobals();
  });

  it("saves every filled unregistered channel with one button and reports per-row results", async () => {
    const missingA = provider("missing-a", false);
    const missingB = provider("missing-b", false);
    const fieldFor = (name: string) => ([{
      key: "clientId" as const,
      env: `${name.toUpperCase()}_CLIENT_ID`,
      label: "Client ID",
      secret: false,
      configured: false,
      maskedValue: null,
    }]);
    const providers = [
      { ...missingA, fields: fieldFor("missing-a") },
      { ...missingB, fields: fieldFor("missing-b") },
    ];
    const mutate = vi.fn();
    mocks.swr.mockReturnValue({
      data: { customers: [], authUsers: [], oauthProviders: providers },
      error: undefined,
      isLoading: false,
      mutate,
    });
    const fetchMock = vi.fn()
      .mockResolvedValueOnce(Response.json({ ok: true, provider: "missing-a" }))
      .mockResolvedValueOnce(Response.json({ error: "저장 실패" }, { status: 500 }));
    vi.stubGlobal("fetch", fetchMock);

    render(React.createElement(OperatorCustomersPage));
    fireEvent.click(screen.getByRole("tab", { name: "중앙 OAuth 앱" }));
    const inputs = screen.getAllByLabelText("Client ID");
    fireEvent.change(inputs[0], { target: { value: "value-a" } });
    fireEvent.change(inputs[1], { target: { value: "value-b" } });

    fireEvent.click(screen.getByRole("button", { name: "입력한 채널 모두 저장" }));

    await screen.findByText(/missing-a: 저장됨/);
    expect(screen.getByText(/missing-b: 저장 실패/)).toBeInTheDocument();
    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect(mutate).toHaveBeenCalled();
  });
});
