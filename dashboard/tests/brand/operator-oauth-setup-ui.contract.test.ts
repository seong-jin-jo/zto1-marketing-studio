// @vitest-environment jsdom
import "@testing-library/jest-dom/vitest";
import React from "react";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
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

// page.tsx는 ?tab= 을 next/navigation의 useSearchParams/useRouter로 읽고 쓴다(하우스 패턴,
// studio/page.tsx·calendar/page.tsx와 동일). 실제 next/navigation은 앱 라우터 컨텍스트 밖에서
// 던지므로 여기서는 window.location을 진실원으로 삼는 반응형 mock을 둔다.
vi.mock("next/navigation", () => {
  const listeners = new Set<() => void>();
  function applyUrl(url: string) {
    const [path, query] = url.split("?");
    window.history.replaceState(null, "", query ? `${path}?${query}` : path);
    listeners.forEach((cb) => cb());
  }
  return {
    useSearchParams: () => {
      const [, force] = React.useState(0);
      React.useEffect(() => {
        const cb = () => force((x) => x + 1);
        listeners.add(cb);
        return () => { listeners.delete(cb); };
      }, []);
      return new URLSearchParams(window.location.search);
    },
    useRouter: () => ({
      replace: applyUrl,
      push: applyUrl,
    }),
  };
});

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

    // 성공한 채널(missing-a)은 mutate 후 등록됨으로 옮겨가는 것을 전제로 미등록 결과 줄에서 사라지고,
    // 실패한 채널(missing-b)만 사유와 함께 남는다.
    await screen.findByText(/missing-b: 저장 실패/);
    expect(screen.queryByText(/missing-a:/)).not.toBeInTheDocument();
    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect(mutate).toHaveBeenCalled();
  });

  it("경고 없이 그냥 return 하지 않고, 채워진 입력이 하나도 없으면 이유를 안내한다", () => {
    const missingA = provider("missing-a", false);
    mocks.swr.mockReturnValue({
      data: { customers: [], authUsers: [], oauthProviders: [{ ...missingA, fields: [{
        key: "clientId" as const,
        env: "MISSING_A_CLIENT_ID",
        label: "Client ID",
        secret: false,
        configured: false,
        maskedValue: null,
      }] }] },
      error: undefined,
      isLoading: false,
      mutate: vi.fn(),
    });
    vi.stubGlobal("fetch", vi.fn());

    render(React.createElement(OperatorCustomersPage));
    fireEvent.click(screen.getByRole("tab", { name: "중앙 OAuth 앱" }));
    fireEvent.click(screen.getByRole("button", { name: "입력한 채널 모두 저장" }));

    expect(screen.getByText("저장할 입력이 없습니다. 미등록 채널의 칸을 채운 뒤 누르세요.")).toBeInTheDocument();
  });

  it("일부 필드만 채운 채널은 PUT 하지 않고 미입력 필드를 그 줄에 남긴다", () => {
    const missingA = provider("missing-a", false);
    mocks.swr.mockReturnValue({
      data: { customers: [], authUsers: [], oauthProviders: [{ ...missingA, fields: [
        {
          key: "clientId" as const,
          env: "MISSING_A_CLIENT_ID",
          label: "Client ID",
          secret: false,
          configured: false,
          maskedValue: null,
        },
        {
          key: "clientSecret" as const,
          env: "MISSING_A_CLIENT_SECRET",
          label: "Client Secret",
          secret: true,
          configured: false,
          maskedValue: null,
        },
      ] }] },
      error: undefined,
      isLoading: false,
      mutate: vi.fn(),
    });
    const fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);

    render(React.createElement(OperatorCustomersPage));
    fireEvent.click(screen.getByRole("tab", { name: "중앙 OAuth 앱" }));
    fireEvent.change(screen.getByLabelText("Client ID"), { target: { value: "only-id" } });
    fireEvent.click(screen.getByRole("button", { name: "입력한 채널 모두 저장" }));

    expect(screen.getByText(/missing-a: 미입력: Client Secret/)).toBeInTheDocument();
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("미등록 카드는 기본 펼침이지만 접기 단추가 실제로 접는다", () => {
    mocks.swr.mockReturnValue({
      data: { customers: [], authUsers: [], oauthProviders: [provider("missing-a", false)] },
      error: undefined,
      isLoading: false,
      mutate: vi.fn(),
    });
    vi.stubGlobal("fetch", vi.fn());

    render(React.createElement(OperatorCustomersPage));
    fireEvent.click(screen.getByRole("tab", { name: "중앙 OAuth 앱" }));

    const toggle = screen.getByRole("button", { name: "missing-a 자격증명 카드 접기" });
    expect(toggle).toHaveAttribute("aria-expanded", "true");
    fireEvent.click(toggle);
    expect(screen.getByRole("button", { name: "missing-a 자격증명 카드 펼치기" })).toHaveAttribute("aria-expanded", "false");
  });

  it("일괄 저장 진행 중에는 단건 저장/업데이트 단추도 잠긴다", async () => {
    const missingA = provider("missing-a", false);
    const fieldsA = [{
      key: "clientId" as const,
      env: "MISSING_A_CLIENT_ID",
      label: "Client ID",
      secret: false,
      configured: false,
      maskedValue: null,
    }];
    mocks.swr.mockReturnValue({
      data: { customers: [], authUsers: [], oauthProviders: [{ ...missingA, fields: fieldsA }] },
      error: undefined,
      isLoading: false,
      mutate: vi.fn(),
    });
    let resolvePut: (() => void) | undefined;
    const fetchMock = vi.fn().mockImplementation(() => new Promise((resolve) => {
      resolvePut = () => resolve(Response.json({ ok: true }));
    }));
    vi.stubGlobal("fetch", fetchMock);

    render(React.createElement(OperatorCustomersPage));
    fireEvent.click(screen.getByRole("tab", { name: "중앙 OAuth 앱" }));
    fireEvent.change(screen.getByLabelText("Client ID"), { target: { value: "value-a" } });
    fireEvent.click(screen.getByRole("button", { name: "입력한 채널 모두 저장" }));

    expect(screen.getByRole("button", { name: "전체 세트 저장" })).toBeDisabled();
    resolvePut?.();
    await waitFor(() => expect(screen.getByRole("button", { name: "입력한 채널 모두 저장" })).not.toBeDisabled());
  });
});
