// @vitest-environment jsdom
import "@testing-library/jest-dom/vitest";
import React from "react";
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen, fireEvent, waitFor, cleanup } from "@testing-library/react";
import { SocialConnectButton } from "@/components/channel/SocialConnectButton";
import { useUIStore } from "@/store/ui-store";
import type { ConnectReadinessGuidance } from "@/lib/connect-readiness";

// OAuth 팝업 회귀 테스트: OAuth 팝업이 fetch 완료를 기다리지 않고 클릭 즉시(동기적으로) 열려야
// production headless Chrome에서 user-activation이 살아있는 채로 window.open이 호출된다.

function fakePopup() {
  return {
    closed: false,
    close: vi.fn(function (this: { closed: boolean }) {
      this.closed = true;
    }),
    location: { href: "" },
  } as unknown as Window;
}

describe("SocialConnectButton — OAuth popup activation", () => {
  beforeEach(() => {
    useUIStore.setState({ activeWorkspace: { id: "ws1", slug: "ws1", name: "Workspace 1" } });
  });

  afterEach(() => {
    cleanup();
    vi.restoreAllMocks();
    vi.useRealTimers();
  });

  function mockReadiness(available = true) {
    return vi.fn().mockResolvedValueOnce({
      ok: true,
      json: async () => ({ providers: { threads: { available } } }),
    });
  }

  function mockReadinessStatus(
    status: string,
    available: boolean,
    reason?: string,
    guidance?: ConnectReadinessGuidance,
  ) {
    return vi.fn().mockResolvedValueOnce({
      ok: true,
      json: async () => ({ providers: { threads: { status, available, reason, guidance } } }),
    });
  }

  const threadsReviewGuidance: ConnectReadinessGuidance = {
    title: "심사 전 연결 안내",
    steps: [
      "현재는 앱 테스터로 등록된 계정만 연결할 수 있습니다.",
      "Threads 웹사이트 권한의 초대 탭에서 초대를 수락합니다.",
      "이 화면으로 돌아와 Threads OAuth 연결을 누릅니다.",
      "앱 심사 승인 뒤에는 이 과정 없이 연결할 수 있습니다.",
    ],
    externalLink: {
      label: "초대 수락하러 가기 (새 탭)",
      url: "https://www.threads.com/settings/website_permissions",
    },
  };

  it("shows not_connected as an active customer action", async () => {
    vi.stubGlobal("fetch", mockReadinessStatus("not_connected", true));

    render(<SocialConnectButton provider="threads" label="Threads" />);

    expect(await screen.findByTestId("readiness-status-threads")).toHaveTextContent("미연결");
    expect(screen.getByTestId("connect-threads")).not.toBeDisabled();
  });

  it("AR-UI-02: 연결 버튼을 누르기 전에 Meta 테스터 제한을 보여주고 연결은 허용한다", async () => {
    vi.stubGlobal("fetch", mockReadinessStatus(
      "not_connected",
      true,
      "Threads는 아직 앱 심사 전입니다. Meta 앱에서 테스터로 등록하고 초대를 수락한 계정만 연결할 수 있습니다.",
    ));

    render(<SocialConnectButton provider="threads" label="Threads" />);

    const warning = await screen.findByTestId("readiness-warning-threads");
    expect(warning).toHaveTextContent("테스터로 등록");
    expect(warning).toHaveTextContent("초대를 수락");
    expect(screen.getByTestId("connect-threads")).not.toBeDisabled();
    expect(warning.compareDocumentPosition(screen.getByTestId("connect-threads")) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
  });

  it("AR-GUIDE-003 정상: 심사 전 안내와 바깥 링크를 보여주면서 연결 단추 클릭을 허용한다", async () => {
    const fetchMock = mockReadinessStatus(
      "not_connected",
      true,
      "Threads는 아직 앱 심사 전입니다.",
      threadsReviewGuidance,
    );
    const popup = fakePopup();
    vi.stubGlobal("fetch", fetchMock);
    const openSpy = vi.spyOn(window, "open").mockReturnValue(popup);

    render(<SocialConnectButton provider="threads" label="Threads" />);

    expect(await screen.findByTestId("review-guidance-threads")).toHaveTextContent("심사 전 연결 안내");
    expect(screen.getByTestId("review-guidance-threads")).toHaveTextContent("초대 탭에서 초대를 수락");
    expect(screen.getByTestId("review-guidance-link-threads")).toHaveAttribute(
      "href",
      "https://www.threads.com/settings/website_permissions",
    );
    expect(screen.getByTestId("review-guidance-link-threads")).toHaveAttribute("target", "_blank");
    expect(screen.queryByTestId("readiness-warning-threads")).not.toBeInTheDocument();

    fetchMock.mockResolvedValueOnce({
      ok: true,
      json: async () => ({ authUrl: "https://provider.example/auth" }),
    });
    fireEvent.click(screen.getByTestId("connect-threads"));

    expect(openSpy).toHaveBeenCalledTimes(1);
    await waitFor(() => expect(popup.location.href).toBe("https://provider.example/auth"));
  });

  it("AR-GUIDE-004 거절: 서버가 안내를 내려주지 않으면 심사 전 안내를 표시하지 않는다", async () => {
    vi.stubGlobal("fetch", mockReadinessStatus("not_connected", true));

    render(<SocialConnectButton provider="threads" label="Threads" />);

    await waitFor(() => expect(screen.getByTestId("connect-threads")).not.toBeDisabled());
    expect(screen.queryByTestId("review-guidance-threads")).not.toBeInTheDocument();
    expect(screen.queryByTestId("review-guidance-link-threads")).not.toBeInTheDocument();
  });

  it("AR-GUIDE-005 거절: 초대 미수락 실패에는 사람 말 원인과 같은 초대 링크를 다시 보여준다", async () => {
    const fetchMock = mockReadinessStatus(
      "not_connected",
      true,
      "Threads는 아직 앱 심사 전입니다.",
      threadsReviewGuidance,
    );
    const popup = fakePopup();
    vi.stubGlobal("fetch", fetchMock);
    vi.spyOn(window, "open").mockReturnValue(popup);

    render(<SocialConnectButton provider="threads" label="Threads" />);
    await waitFor(() => expect(screen.getByTestId("connect-threads")).not.toBeDisabled());

    fetchMock.mockResolvedValueOnce({
      ok: true,
      json: async () => ({
        error: "Invalid Request: The user has not accepted the invite to test the app. error_code=1349245",
      }),
    });
    fireEvent.click(screen.getByTestId("connect-threads"));

    expect(await screen.findByText(/이 계정은 아직 테스트 사용자 초대를 수락하지 않았습니다/)).toBeInTheDocument();
    expect(screen.getByTestId("connect-failure-guidance-link-threads")).toHaveAttribute(
      "href",
      threadsReviewGuidance.externalLink.url,
    );
  });

  it("shows opening_soon as a neutral waiting state without an active connect CTA", async () => {
    vi.stubGlobal("fetch", mockReadinessStatus("opening_soon", false, "외부 앱 심사 대기"));

    render(<SocialConnectButton provider="threads" label="Threads" />);

    expect(await screen.findByTestId("readiness-status-threads")).toHaveTextContent("오픈 준비중");
    expect(screen.getByTestId("connect-threads")).toBeDisabled();
    expect(screen.getByTestId("readiness-reason-threads")).toHaveTextContent("외부 앱 심사 대기");
  });

  it("shows publish_pending separately from connection readiness", async () => {
    vi.stubGlobal("fetch", mockReadinessStatus("publish_pending", false, "외부 앱 심사 대기"));

    render(<SocialConnectButton provider="threads" label="Threads" />);

    expect(await screen.findByTestId("readiness-status-threads")).toHaveTextContent("발행 준비중");
    expect(screen.getByTestId("connect-threads")).toBeDisabled();
  });

  it("opens the popup synchronously before the connect fetch resolves", async () => {
    const openOrder: string[] = [];
    let resolveFetch!: (v: unknown) => void;
    const fetchMock = mockReadiness(true);
    const popup = fakePopup();
    const openSpy = vi.spyOn(window, "open").mockImplementation(() => {
      openOrder.push("open");
      return popup;
    });

    vi.stubGlobal("fetch", fetchMock);
    render(<SocialConnectButton provider="threads" label="Threads" />);
    await waitFor(() => expect(screen.getByTestId("connect-threads")).not.toBeDisabled());

    // connect() 호출의 두 번째 fetch(authUrl 요청)는 절대 resolve하지 않는 pending promise로
    // 대체해, "open이 fetch resolve 이전에 이미 호출됐는지"를 확정적으로 관찰한다.
    fetchMock.mockImplementationOnce(
      () =>
        new Promise((resolve) => {
          resolveFetch = resolve as (v: unknown) => void;
        })
    );

    fireEvent.click(screen.getByTestId("connect-threads"));

    // fetch가 resolve되기 전 시점에 이미 open이 호출되어 있어야 한다.
    expect(openSpy).toHaveBeenCalledTimes(1);
    expect(openSpy).toHaveBeenCalledWith("about:blank", "_blank", "width=620,height=760");
    openOrder.push("open-observed-before-resolve");

    resolveFetch({ ok: true, json: async () => ({ authUrl: "https://provider.example/auth" }) });
    await waitFor(() => expect(popup.location.href).toBe("https://provider.example/auth"));

    expect(openOrder).toEqual(["open", "open-observed-before-resolve"]);
  });

  it("shows the Korean blocked message and never calls fetch when the popup is blocked", async () => {
    const fetchMock = mockReadiness(true);
    vi.stubGlobal("fetch", fetchMock);
    vi.spyOn(window, "open").mockReturnValue(null);

    render(<SocialConnectButton provider="threads" label="Threads" />);
    await waitFor(() => expect(screen.getByTestId("connect-threads")).not.toBeDisabled());

    fetchMock.mockClear();
    fireEvent.click(screen.getByTestId("connect-threads"));

    expect(await screen.findByText(/팝업이 차단되었습니다/)).toBeInTheDocument();
    expect(fetchMock).not.toHaveBeenCalled();
    expect(screen.getByTestId("connect-threads")).not.toBeDisabled();
  });

  it("closes the reserved popup and shows an error when the connect API call fails", async () => {
    const readinessFetch = mockReadiness(true);
    vi.stubGlobal("fetch", readinessFetch);
    const popup = fakePopup();
    vi.spyOn(window, "open").mockReturnValue(popup);

    render(<SocialConnectButton provider="threads" label="Threads" />);
    await waitFor(() => expect(screen.getByTestId("connect-threads")).not.toBeDisabled());

    readinessFetch.mockRejectedValueOnce(new Error("network down"));
    fireEvent.click(screen.getByTestId("connect-threads"));

    await waitFor(() => expect(popup.close).toHaveBeenCalled());
    expect(screen.getByTestId("connect-threads")).not.toBeDisabled();
  });

  it("closes the reserved popup when the API responds without an authUrl", async () => {
    const readinessFetch = mockReadiness(true);
    vi.stubGlobal("fetch", readinessFetch);
    const popup = fakePopup();
    vi.spyOn(window, "open").mockReturnValue(popup);

    render(<SocialConnectButton provider="threads" label="Threads" />);
    await waitFor(() => expect(screen.getByTestId("connect-threads")).not.toBeDisabled());

    readinessFetch.mockResolvedValueOnce({
      ok: true,
      json: async () => ({ error: "credentials missing" }),
    });
    fireEvent.click(screen.getByTestId("connect-threads"));

    await waitFor(() => expect(popup.close).toHaveBeenCalled());
    expect(screen.getByTestId("connect-threads")).not.toBeDisabled();
  });

  it("navigates the reserved popup and reports success on a valid postMessage callback", async () => {
    const readinessFetch = mockReadiness(true);
    vi.stubGlobal("fetch", readinessFetch);
    const popup = fakePopup();
    vi.spyOn(window, "open").mockReturnValue(popup);
    const onConnected = vi.fn();

    render(<SocialConnectButton provider="threads" label="Threads" onConnected={onConnected} />);
    await waitFor(() => expect(screen.getByTestId("connect-threads")).not.toBeDisabled());

    readinessFetch.mockResolvedValueOnce({
      ok: true,
      json: async () => ({ authUrl: "https://provider.example/auth" }),
    });
    fireEvent.click(screen.getByTestId("connect-threads"));
    await waitFor(() => expect(popup.location.href).toBe("https://provider.example/auth"));

    fireEvent(
      window,
      Object.assign(new Event("message"), {
        origin: window.location.origin,
        data: { source: "osmu-oauth-connect", provider: "threads", ok: true },
      })
    );

    await waitFor(() => expect(onConnected).toHaveBeenCalled());
    expect(screen.getByText(/연결 완료/)).toBeInTheDocument();
    expect(screen.getByTestId("connect-threads")).not.toBeDisabled();
  });

  it("ignores postMessage from a foreign origin and still detects a closed-without-callback popup", async () => {
    const readinessFetch = mockReadiness(true);
    vi.stubGlobal("fetch", readinessFetch);
    const popup = fakePopup();
    vi.spyOn(window, "open").mockReturnValue(popup);

    render(<SocialConnectButton provider="threads" label="Threads" />);
    await waitFor(() => expect(screen.getByTestId("connect-threads")).not.toBeDisabled());

    readinessFetch.mockResolvedValueOnce({
      ok: true,
      json: async () => ({ authUrl: "https://provider.example/auth" }),
    });
    fireEvent.click(screen.getByTestId("connect-threads"));
    await waitFor(() => expect((popup as unknown as { location: { href: string } }).location.href).toBe("https://provider.example/auth"));

    // 다른 origin에서 온 메시지는 결과로 인정되지 않아야 한다.
    fireEvent(
      window,
      Object.assign(new Event("message"), {
        origin: "https://evil.example",
        data: { source: "osmu-oauth-connect", provider: "threads", ok: true },
      })
    );
    expect(screen.getByTestId("connect-threads")).toBeDisabled(); // 여전히 busy

    (popup as unknown as { closed: boolean }).closed = true;

    expect(await screen.findByText(/결과 없이 닫혔습니다/, {}, { timeout: 3000 })).toBeInTheDocument();
    expect(screen.getByTestId("connect-threads")).not.toBeDisabled();
  });

  it("clears the closed-popup watch interval on unmount instead of leaking it", async () => {
    const readinessFetch = mockReadiness(true);
    vi.stubGlobal("fetch", readinessFetch);
    const popup = fakePopup();
    vi.spyOn(window, "open").mockReturnValue(popup);
    const clearIntervalSpy = vi.spyOn(window, "clearInterval");

    const { unmount } = render(<SocialConnectButton provider="threads" label="Threads" />);
    await waitFor(() => expect(screen.getByTestId("connect-threads")).not.toBeDisabled());

    readinessFetch.mockResolvedValueOnce({
      ok: true,
      json: async () => ({ authUrl: "https://provider.example/auth" }),
    });
    fireEvent.click(screen.getByTestId("connect-threads"));
    await waitFor(() => expect(popup.location.href).toBe("https://provider.example/auth"));

    clearIntervalSpy.mockClear();
    unmount();

    expect(clearIntervalSpy).toHaveBeenCalled();
  });

  // OAuth 팝업 lifecycle 회귀 테스트: connect fetch가 pending인 상태에서 컴포넌트가
  // unmount되면, fetch가 나중에 resolve되어도 예약해둔 팝업을 navigate하거나
  // closed-폴링 interval을 새로 만들거나 상태를 건드리면 안 된다 — 언마운트된 컴포넌트에
  // 대한 좀비 부작용이다. 대신 예약해둔 팝업은 정리(close)해야 한다.
  it("does not navigate the popup, start polling, or touch state after unmount while the connect fetch is still pending", async () => {
    const readinessFetch = mockReadiness(true);
    vi.stubGlobal("fetch", readinessFetch);
    const popup = fakePopup();
    vi.spyOn(window, "open").mockReturnValue(popup);
    const setIntervalSpy = vi.spyOn(window, "setInterval");

    let resolveConnectFetch!: (v: unknown) => void;
    const { unmount } = render(<SocialConnectButton provider="threads" label="Threads" />);
    await waitFor(() => expect(screen.getByTestId("connect-threads")).not.toBeDisabled());

    readinessFetch.mockImplementationOnce(
      () =>
        new Promise((resolve) => {
          resolveConnectFetch = resolve as (v: unknown) => void;
        })
    );

    fireEvent.click(screen.getByTestId("connect-threads"));
    await waitFor(() => expect(popup.close).not.toHaveBeenCalled());

    setIntervalSpy.mockClear();
    unmount();

    resolveConnectFetch({
      ok: true,
      json: async () => ({ authUrl: "https://provider.example/auth" }),
    });
    await waitFor(() => expect(popup.close).toHaveBeenCalled());

    expect(popup.location.href).toBe("");
    expect(setIntervalSpy).not.toHaveBeenCalledWith(expect.any(Function), 700);
  });

  // OAuth 팝업 회귀 테스트: 유효한 postMessage 수신 시 closed-watch interval을 즉시 정리한다.
  // 만약 clearInterval 호출이 빠지면, popup이 열려있는 동안 계속 폴링이 발생한다.
  it("clears the closed-watch interval immediately on valid postMessage, not on wrong-origin/provider", async () => {
    const readinessFetch = mockReadiness(true);
    vi.stubGlobal("fetch", readinessFetch);
    const popup = fakePopup();
    vi.spyOn(window, "open").mockReturnValue(popup);
    const clearIntervalSpy = vi.spyOn(window, "clearInterval");

    render(<SocialConnectButton provider="threads" label="Threads" />);
    await waitFor(() => expect(screen.getByTestId("connect-threads")).not.toBeDisabled());

    readinessFetch.mockResolvedValueOnce({
      ok: true,
      json: async () => ({ authUrl: "https://provider.example/auth" }),
    });
    fireEvent.click(screen.getByTestId("connect-threads"));
    await waitFor(() => expect(popup.location.href).toBe("https://provider.example/auth"));

    clearIntervalSpy.mockClear();

    // 다른 origin의 메시지는 무시되므로 clearInterval이 호출되지 않아야 한다.
    fireEvent(
      window,
      Object.assign(new Event("message"), {
        origin: "https://evil.example",
        data: { source: "osmu-oauth-connect", provider: "threads", ok: true },
      })
    );
    expect(clearIntervalSpy).not.toHaveBeenCalled();
    expect(screen.getByTestId("connect-threads")).toBeDisabled(); // 여전히 busy

    // 다른 provider의 메시지도 무시되므로 clearInterval이 호출되지 않아야 한다.
    fireEvent(
      window,
      Object.assign(new Event("message"), {
        origin: window.location.origin,
        data: { source: "osmu-oauth-connect", provider: "instagram", ok: true },
      })
    );
    expect(clearIntervalSpy).not.toHaveBeenCalled();
    expect(screen.getByTestId("connect-threads")).toBeDisabled(); // 여전히 busy

    // 유효한(같은 origin + 같은 provider) postMessage는 즉시 clearInterval을 호출해야 한다.
    fireEvent(
      window,
      Object.assign(new Event("message"), {
        origin: window.location.origin,
        data: { source: "osmu-oauth-connect", provider: "threads", ok: true },
      })
    );

    // clearInterval이 즉시(setInterval 호출 후, 폴링이 감지되기 전) 호출되어야 한다.
    expect(clearIntervalSpy).toHaveBeenCalledTimes(1);
    expect(screen.getByText(/연결 완료/)).toBeInTheDocument();
    expect(screen.getByTestId("connect-threads")).not.toBeDisabled();
  });

  // StrictMode 회귀 테스트: React StrictMode에서 setup-cleanup-setup이 발생해도
  // mountedRef가 언마운트된 걸로 오인해 OAuth fetch 결과를 버리면 안 된다.
  // 이 테스트는 StrictMode 아래서 렌더링하고, click→fetch→authUrl 네비게이션이
  // 성공(popup.location.href 설정)하는지 확인한다.
  it("navigates the reserved popup inside React.StrictMode (setup-cleanup-setup lifecycle)", async () => {
    // StrictMode가 setup-cleanup-setup을 하므로 readiness fetch가 2번 호출된다.
    // 양쪽 모두 성공해야 한다.
    const fetchMock = vi.fn();
    fetchMock.mockResolvedValue({
      ok: true,
      json: async () => ({ providers: { threads: { available: true } } }),
    });
    vi.stubGlobal("fetch", fetchMock);
    const popup = fakePopup();
    vi.spyOn(window, "open").mockReturnValue(popup);

    render(
      <React.StrictMode>
        <SocialConnectButton provider="threads" label="Threads" />
      </React.StrictMode>
    );
    await waitFor(() => expect(screen.getByTestId("connect-threads")).not.toBeDisabled());

    // connect() 호출 시 authUrl fetch를 처리한다.
    fetchMock.mockResolvedValueOnce({
      ok: true,
      json: async () => ({ authUrl: "https://provider.example/auth" }),
    });
    fireEvent.click(screen.getByTestId("connect-threads"));

    // StrictMode의 cleanup이 mountedRef=false로 남겨도, 매 setup에서 =true로 reset되므로
    // fetch resolve 시 authUrl 네비게이션이 성공해야 한다.
    await waitFor(() => expect(popup.location.href).toBe("https://provider.example/auth"));
    expect(screen.getByText(/새 창에서 로그인/)).toBeInTheDocument();
  });

  it("explains the cross-origin cookie boundary and opens Meta account management in a safe new tab", async () => {
    const fetchMock = mockReadiness(true);
    vi.stubGlobal("fetch", fetchMock);

    render(<SocialConnectButton provider="threads" label="Threads" />);
    await waitFor(() => expect(screen.getByTestId("connect-threads")).not.toBeDisabled());

    fireEvent.click(screen.getByTestId("switch-account-threads"));

    expect(screen.getByTestId("switch-account-note-threads")).toHaveTextContent(
      /다른 Threads 계정으로 연결하려면 threads\.net에서 먼저 로그아웃하세요/,
    );
    expect(screen.getByTestId("manage-provider-account-threads")).toHaveAttribute(
      "href",
      "https://accountscenter.facebook.com/",
    );
    expect(screen.getByTestId("manage-provider-account-threads")).toHaveAttribute("target", "_blank");
    expect(screen.getByTestId("manage-provider-account-threads")).toHaveAttribute(
      "rel",
      expect.stringContaining("noopener"),
    );
  });

  it.each([
    ["instagram", "Instagram", /다른 Instagram 계정으로 연결하려면 instagram\.com에서 먼저 로그아웃하세요/],
    ["facebook", "Facebook", null],
  ] as const)("offers the same Meta account-center action for %s", async (provider, label, expectedNote) => {
    const fetchMock = vi.fn().mockResolvedValueOnce({
      ok: true,
      json: async () => ({ providers: { [provider]: { available: true } } }),
    });
    vi.stubGlobal("fetch", fetchMock);

    render(<SocialConnectButton provider={provider} label={label} />);
    await waitFor(() => expect(screen.getByTestId(`connect-${provider}`)).not.toBeDisabled());

    fireEvent.click(screen.getByTestId(`switch-account-${provider}`));
    if (expectedNote) {
      expect(screen.getByTestId(`switch-account-note-${provider}`)).toHaveTextContent(expectedNote);
    }
    expect(screen.getByTestId(`manage-provider-account-${provider}`)).toHaveAttribute(
      "href",
      "https://accountscenter.facebook.com/",
    );
  });

  it("keeps YouTube account selection guidance and offers Google connection management", async () => {
    const fetchMock = vi.fn().mockResolvedValueOnce({
      ok: true,
      json: async () => ({ providers: { youtube: { available: true } } }),
    });
    vi.stubGlobal("fetch", fetchMock);

    render(<SocialConnectButton provider="youtube" label="YouTube" />);
    await waitFor(() => expect(screen.getByTestId("connect-youtube")).not.toBeDisabled());

    fireEvent.click(screen.getByTestId("switch-account-youtube"));

    expect(screen.getByTestId("switch-account-note-youtube")).toHaveTextContent(
      /Google 계정 선택 화면/,
    );
    expect(screen.getByTestId("manage-provider-account-youtube")).toHaveAttribute(
      "href",
      "https://myaccount.google.com/permissions",
    );
  });
});
