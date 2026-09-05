// @vitest-environment jsdom
import "@testing-library/jest-dom/vitest";
import React from "react";
import { act, cleanup, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { AuthGate } from "@/components/shared/AuthGate";
import { useUIStore } from "@/store/ui-store";

const mocks = vi.hoisted(() => ({
  pathname: vi.fn(() => "/"),
  replace: vi.fn(),
  signOut: vi.fn(),
  refreshSession: vi.fn(),
  getSession: vi.fn(),
  sessionToken: null as string | null,
  authStateCallback: null as null | ((event: string, session: { access_token?: string } | null) => void),
  authStateCallbacks: [] as Array<(event: string, session: { access_token?: string } | null) => void>,
  router: null as { replace: ReturnType<typeof vi.fn> } | null,
}));
mocks.router = { replace: mocks.replace };

vi.mock("next/navigation", () => ({
  usePathname: () => mocks.pathname(),
  useRouter: () => mocks.router,
}));

vi.mock("@/components/layout/Sidebar", () => ({
  Sidebar: () => <nav data-testid="sidebar">sidebar</nav>,
}));

vi.mock("@/components/shared/ErrorBoundary", () => ({
  ErrorBoundary: ({ children }: { children: React.ReactNode }) => <>{children}</>,
}));

vi.mock("@/lib/supabase", () => ({
  createBrowserSupabase: () => ({
    auth: {
      getSession: mocks.getSession,
      refreshSession: mocks.refreshSession,
      signOut: mocks.signOut,
      onAuthStateChange: vi.fn((callback) => {
        mocks.authStateCallback = callback;
        mocks.authStateCallbacks.push(callback);
        return {
        data: { subscription: { unsubscribe: vi.fn() } },
        };
      }),
    },
  }),
}));

describe("AuthGate operator route separation", () => {
  beforeEach(() => {
    localStorage.clear();
    localStorage.setItem("dashboard_auth_token", "operator-token");
    mocks.pathname.mockReturnValue("/");
    mocks.replace.mockReset();
    mocks.signOut.mockReset();
    mocks.signOut.mockResolvedValue({ error: null });
    // 기본은 "갱신 불가". 갱신이 되는 경우는 각 케이스에서 명시한다.
    mocks.refreshSession.mockReset();
    mocks.refreshSession.mockResolvedValue({ data: { session: null }, error: { message: "no session" } });
    mocks.getSession.mockReset();
    mocks.getSession.mockImplementation(async () => ({
      data: {
        session: mocks.sessionToken ? { access_token: mocks.sessionToken } : null,
      },
    }));
    mocks.sessionToken = null;
    mocks.authStateCallback = null;
    mocks.authStateCallbacks = [];
    useUIStore.setState({
      activeWorkspace: { id: "customer-1", slug: "customer", name: "Customer" },
    });
  });

  afterEach(() => {
    cleanup();
    vi.useRealTimers();
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
    window.history.replaceState(null, "", "/");
  });

  it.each(["/", "/videos", "/channels/youtube"])(
    "redirects an operator on protected customer path %s before children mount",
    async (pathname) => {
      mocks.pathname.mockReturnValue(pathname);
      vi.stubGlobal(
        "fetch",
        vi.fn().mockResolvedValue(Response.json({ isOperator: true, tenant: null })),
      );

      render(<AuthGate><div>customer child</div></AuthGate>);

      await waitFor(() => {
        expect(mocks.replace).toHaveBeenCalledWith("/operator/customers");
      });
      expect(screen.queryByText("customer child")).not.toBeInTheDocument();
      expect(screen.queryByTestId("sidebar")).not.toBeInTheDocument();
    },
  );

  it("keeps /operator/customers valid for the operator and mounts only after identity resolves", async () => {
    mocks.pathname.mockReturnValue("/operator/customers");
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(Response.json({ isOperator: true, tenant: null })),
    );

    render(<AuthGate><div>operator child</div></AuthGate>);

    expect(screen.queryByText("operator child")).not.toBeInTheDocument();
    await waitFor(() => {
      expect(screen.getByText("operator child")).toBeInTheDocument();
    });
    expect(mocks.replace).not.toHaveBeenCalled();
    expect(screen.getByTestId("sidebar")).toBeInTheDocument();
  });

  it("QA-AUTH-15 거절: 고객은 /operator/customers의 자식과 캐시를 마운트하지 않고 고객 홈으로 돌아간다", async () => {
    const customerJwt = `${"d".repeat(24)}.${"e".repeat(24)}.${"f".repeat(24)}`;
    localStorage.setItem("dashboard_auth_token", customerJwt);
    localStorage.setItem("dashboard_auth_identity_kind", "customer");
    mocks.pathname.mockReturnValue("/operator/customers");
    mocks.sessionToken = customerJwt;
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(Response.json({
      isOperator: false,
      tenant: { id: "customer-1", slug: "customer", name: "Customer" },
    })));

    render(<AuthGate><div>cached operator customer list</div></AuthGate>);

    await waitFor(() => expect(mocks.replace).toHaveBeenCalledWith("/"));
    expect(screen.queryByText("cached operator customer list")).not.toBeInTheDocument();
    expect(screen.queryByTestId("sidebar")).not.toBeInTheDocument();
  });

  it.each([
    { isOperator: false, tenant: null },
    { isOperator: false, tenant: null, tenantError: true },
  ])("QA-AUTH-16 거절: tenant 없는 고객 응답은 children 대신 계정 이용 불가로 닫는다", async (payload) => {
    const customerJwt = `${"d".repeat(24)}.${"e".repeat(24)}.${"f".repeat(24)}`;
    localStorage.setItem("dashboard_auth_token", customerJwt);
    localStorage.setItem("dashboard_auth_identity_kind", "customer");
    mocks.pathname.mockReturnValue("/studio");
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(Response.json(payload)));

    render(<AuthGate><div>customer child</div></AuthGate>);

    await waitFor(() => expect(screen.getByText("계정 상태를 확인할 수 없습니다")).toBeInTheDocument());
    expect(screen.queryByText("customer child")).not.toBeInTheDocument();
    expect(mocks.replace).not.toHaveBeenCalledWith("/operator/customers");
  });

  it("QA-AUTH-18 거절: /api/me 네트워크 예외는 무한 확인 중 대신 재시도 가능한 서비스 실패로 닫는다", async () => {
    const customerJwt = `${"d".repeat(24)}.${"e".repeat(24)}.${"f".repeat(24)}`;
    localStorage.setItem("dashboard_auth_token", customerJwt);
    localStorage.setItem("dashboard_auth_identity_kind", "customer");
    mocks.pathname.mockReturnValue("/studio");
    vi.stubGlobal("fetch", vi.fn().mockRejectedValue(new Error("network down")));

    render(<AuthGate><div>customer child</div></AuthGate>);

    await waitFor(() => expect(screen.getByText("서비스 확인 실패")).toBeInTheDocument());
    expect(screen.getByRole("button", { name: "새로고침" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "로그아웃" })).toBeInTheDocument();
    expect(screen.queryByText("확인 중...")).not.toBeInTheDocument();
    expect(screen.queryByText("customer child")).not.toBeInTheDocument();
    expect(screen.queryByTestId("sidebar")).not.toBeInTheDocument();
  });

  it("preserves an operator-only browser session through null Supabase initial and sign-out events", async () => {
    mocks.pathname.mockReturnValue("/operator/customers");
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(Response.json({ isOperator: true, tenant: null })),
    );

    render(<AuthGate><div>operator console</div></AuthGate>);

    await waitFor(() => {
      expect(screen.getByText("operator console")).toBeInTheDocument();
      expect(mocks.authStateCallback).not.toBeNull();
    });

    act(() => {
      mocks.authStateCallback?.("INITIAL_SESSION", null);
      mocks.authStateCallback?.("SIGNED_OUT", null);
    });

    expect(localStorage.getItem("dashboard_auth_token")).toBe("operator-token");
    expect(screen.getByText("operator console")).toBeInTheDocument();
    expect(screen.queryByText("베타 신청하기")).not.toBeInTheDocument();
  });

  it("keeps the operator token when pre-operator Supabase initialization resolves after navigation", async () => {
    const customerJwt = `${"d".repeat(24)}.${"e".repeat(24)}.${"f".repeat(24)}`;
    let resolvePreOperatorSession!: (value: {
      data: { session: { access_token: string } | null };
    }) => void;
    mocks.pathname.mockReturnValue("/privacy");
    mocks.getSession
      .mockImplementationOnce(() => new Promise((resolve) => {
        resolvePreOperatorSession = resolve;
      }))
      .mockResolvedValueOnce({ data: { session: null } });
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(Response.json({ isOperator: true, tenant: null })),
    );

    const view = render(<AuthGate><div>operator console</div></AuthGate>);
    await waitFor(() => expect(mocks.getSession).toHaveBeenCalledTimes(1));

    mocks.pathname.mockReturnValue("/operator/customers");
    view.rerender(<AuthGate><div>operator console</div></AuthGate>);
    await waitFor(() => expect(mocks.getSession).toHaveBeenCalledTimes(2));

    await act(async () => {
      resolvePreOperatorSession({ data: { session: { access_token: customerJwt } } });
      await Promise.resolve();
    });
    expect(mocks.authStateCallbacks).toHaveLength(1);

    act(() => {
      mocks.authStateCallbacks[0]?.("SIGNED_OUT", null);
    });

    expect(localStorage.getItem("dashboard_auth_token")).toBe("operator-token");
    expect(screen.getByText("operator console")).toBeInTheDocument();
    expect(screen.queryByText("베타 신청하기")).not.toBeInTheDocument();
  });

  it("preserves the customer Marketing Hub path for a customer identity", async () => {
    mocks.pathname.mockReturnValue("/videos");
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(
        Response.json({
          isOperator: false,
          tenant: { id: "customer-1", slug: "customer", name: "Customer" },
        }),
      ),
    );

    render(<AuthGate><div>customer child</div></AuthGate>);

    await waitFor(() => {
      expect(screen.getByText("customer child")).toBeInTheDocument();
    });
    expect(mocks.replace).not.toHaveBeenCalled();
    expect(screen.getByTestId("sidebar")).toBeInTheDocument();
  });

  it("promotes an established customer Supabase session over a residual operator token outside the operator console", async () => {
    const customerJwt = `${"d".repeat(24)}.${"e".repeat(24)}.${"f".repeat(24)}`;
    mocks.pathname.mockReturnValue("/videos");
    mocks.sessionToken = customerJwt;
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(Response.json({
        isOperator: false,
        tenant: { id: "customer-1", slug: "customer", name: "Customer" },
      })),
    );

    render(<AuthGate><div>customer child</div></AuthGate>);

    await waitFor(() => {
      expect(localStorage.getItem("dashboard_auth_token")).toBe(customerJwt);
    });
    expect(localStorage.getItem("active_workspace")).toBeNull();
    expect(useUIStore.getState().activeWorkspace).toBeNull();
  });

  it("preserves an intentional operator token while the operator console is active", async () => {
    const customerJwt = `${"d".repeat(24)}.${"e".repeat(24)}.${"f".repeat(24)}`;
    mocks.pathname.mockReturnValue("/operator");
    mocks.sessionToken = customerJwt;

    render(<AuthGate><div>operator login child</div></AuthGate>);

    await waitFor(() => expect(mocks.authStateCallback).not.toBeNull());
    expect(localStorage.getItem("dashboard_auth_token")).toBe("operator-token");
  });

  // 2026-09-05 실측 회귀: 스튜디오 작업 도중 접근 토큰 수명이 끝나자 그대로 로그인
  // 화면으로 튕겼다. 만료는 로그아웃 사유가 아니다. 갱신이 되면 있던 자리에 남아야 한다.
  it("QA-AUTH-08 정상: 접근 토큰이 만료돼도 갱신에 성공하면 로그아웃시키지 않는다", async () => {
    const jwt = `${"a".repeat(24)}.${"b".repeat(24)}.${"c".repeat(24)}`;
    const renewed = `${"d".repeat(24)}.${"e".repeat(24)}.${"f".repeat(24)}`;
    localStorage.setItem("dashboard_auth_token", jwt);
    mocks.pathname.mockReturnValue("/studio");
    window.history.replaceState(null, "", "/studio?room=edit");
    mocks.refreshSession.mockResolvedValue({ data: { session: { access_token: renewed } }, error: null });
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(new Response(null, { status: 401 })));

    render(<AuthGate><div>customer child</div></AuthGate>);

    await waitFor(() => expect(mocks.refreshSession).toHaveBeenCalled());
    await waitFor(() => expect(localStorage.getItem("dashboard_auth_token")).toBe(renewed));
    expect(mocks.signOut).not.toHaveBeenCalled();
    expect(mocks.replace).not.toHaveBeenCalledWith("/login?returnTo=%2Fstudio%3Froom%3Dedit");
  });

  it("QA-AUTH-06 정상: 만료 고객 JWT는 운영자 화면 대신 returnTo가 보존된 고객 로그인으로 보낸다", async () => {
    const jwt = `${"a".repeat(24)}.${"b".repeat(24)}.${"c".repeat(24)}`;
    localStorage.setItem("dashboard_auth_token", jwt);
    mocks.pathname.mockReturnValue("/studio");
    window.history.replaceState(null, "", "/studio?room=edit");
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(new Response(null, { status: 401 })));

    render(<AuthGate><div>customer child</div></AuthGate>);

    await waitFor(() => {
      expect(mocks.signOut).toHaveBeenCalledTimes(1);
      expect(mocks.replace).toHaveBeenCalledWith("/login?returnTo=%2Fstudio%3Froom%3Dedit");
    });
    expect(mocks.replace).not.toHaveBeenCalledWith("/operator");
    expect(localStorage.getItem("dashboard_auth_token")).toBeNull();
    expect(screen.queryByText("customer child")).not.toBeInTheDocument();
  });

  it("V71-AUTH-03 거절: 다른 화면의 조회 401도 로그아웃 처리를 기다리지 않고 즉시 화면 행동을 막는다", async () => {
    const jwt = `${"a".repeat(24)}.${"b".repeat(24)}.${"c".repeat(24)}`;
    localStorage.setItem("dashboard_auth_token", jwt);
    localStorage.setItem("dashboard_auth_identity_kind", "customer");
    mocks.pathname.mockReturnValue("/calendar");
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(Response.json({
      isOperator: false,
      tenant: { id: "customer-1", slug: "customer", name: "Customer" },
    })));

    render(<AuthGate><button type="button">예약 변경</button></AuthGate>);
    await waitFor(() => expect(screen.getByRole("button", { name: "예약 변경" })).toBeInTheDocument());

    mocks.signOut.mockReturnValue(new Promise(() => {}));
    act(() => window.dispatchEvent(new CustomEvent("auth:customer-reauth-required")));

    expect(screen.getByRole("alert")).toHaveTextContent("세션이 만료되었습니다");
    expect(screen.getByRole("button", { name: "로그인 화면으로 이동" })).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "예약 변경" })).not.toBeInTheDocument();
  });

  it("QA-AUTH-08 거절: 형식 불량 고객 잔존 토큰도 고객 로그인에 머물고 운영자 화면을 열지 않는다", async () => {
    localStorage.setItem("dashboard_auth_token", "stale-customer-token");
    mocks.pathname.mockReturnValue("/studio");
    window.history.replaceState(null, "", "/studio?room=edit");
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(new Response(null, { status: 401 })));

    render(<AuthGate><div>customer child</div></AuthGate>);

    await waitFor(() => {
      expect(mocks.replace).toHaveBeenCalledWith("/login?returnTo=%2Fstudio%3Froom%3Dedit");
    });
    expect(mocks.replace).not.toHaveBeenCalledWith("/operator");
    expect(screen.queryByText("베타 신청하기")).not.toBeInTheDocument();
    expect(screen.queryByText("customer child")).not.toBeInTheDocument();
    expect(screen.getByText("로그인 화면으로 이동 중...")).toBeInTheDocument();
  });

  it("QA-AUTH-09 거절: 보호 경로의 무토큰 상태는 공개 랜딩을 렌더하지 않고 고객 로그인으로 보낸다", async () => {
    localStorage.clear();
    mocks.pathname.mockReturnValue("/studio");
    window.history.replaceState(null, "", "/studio?room=edit");

    render(<AuthGate><div>customer child</div></AuthGate>);

    await waitFor(() => {
      expect(mocks.replace).toHaveBeenCalledWith("/login?returnTo=%2Fstudio%3Froom%3Dedit");
    });
    expect(screen.queryByText("베타 신청하기")).not.toBeInTheDocument();
    expect(screen.getByText("로그인 화면으로 이동 중...")).toBeInTheDocument();
  });

  it("ignores a stale /api/me 401 after the request token has been replaced", async () => {
    const oldJwt = `${"a".repeat(24)}.${"b".repeat(24)}.${"c".repeat(24)}`;
    const newJwt = `${"d".repeat(24)}.${"e".repeat(24)}.${"f".repeat(24)}`;
    localStorage.setItem("dashboard_auth_token", oldJwt);
    let resolvePoll!: (response: Response) => void;
    vi.stubGlobal(
      "fetch",
      vi.fn(() => new Promise<Response>((resolve) => {
        resolvePoll = resolve;
      })),
    );

    render(<AuthGate><div>customer child</div></AuthGate>);
    await waitFor(() => expect(fetch).toHaveBeenCalledWith(
      "/api/me",
      expect.objectContaining({
        headers: expect.objectContaining({ Authorization: `Bearer ${oldJwt}` }),
      }),
    ));

    localStorage.setItem("dashboard_auth_token", newJwt);
    resolvePoll(new Response(null, { status: 401 }));

    await waitFor(() => expect(localStorage.getItem("dashboard_auth_token")).toBe(newJwt));
    expect(mocks.signOut).not.toHaveBeenCalled();
    expect(mocks.replace).not.toHaveBeenCalled();
  });

  it("QA-AUTH-24 경합 거절: 늦은 과거 정상 응답이 최신 이용 중지 상태를 덮지 않는다", async () => {
    vi.useFakeTimers();
    let resolveFirst!: (response: Response) => void;
    const fetchMock = vi.fn()
      .mockImplementationOnce(() => new Promise<Response>((resolve) => {
        resolveFirst = resolve;
      }))
      .mockResolvedValueOnce(Response.json({
        isOperator: false,
        tenant: { id: "customer-1", slug: "customer", name: "Customer" },
        accessPaused: true,
      }));
    vi.stubGlobal("fetch", fetchMock);

    render(<AuthGate><div>customer child</div></AuthGate>);
    await act(async () => {
      await Promise.resolve();
    });
    expect(fetchMock).toHaveBeenCalledTimes(1);
    await act(async () => {
      await vi.advanceTimersByTimeAsync(15000);
    });
    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect(screen.getByText("계정 이용이 중지되었습니다")).toBeInTheDocument();

    await act(async () => {
      resolveFirst(Response.json({
        isOperator: false,
        tenant: { id: "customer-1", slug: "customer", name: "Customer" },
        accessPaused: false,
      }));
      await Promise.resolve();
    });

    expect(screen.getByText("계정 이용이 중지되었습니다")).toBeInTheDocument();
    expect(screen.queryByText("customer child")).not.toBeInTheDocument();
  });

  it("preserves a new session when an old 401 sign-out emits SIGNED_OUT after replacement", async () => {
    const oldJwt = `${"a".repeat(24)}.${"b".repeat(24)}.${"c".repeat(24)}`;
    const newJwt = `${"d".repeat(24)}.${"e".repeat(24)}.${"f".repeat(24)}`;
    localStorage.setItem("dashboard_auth_token", oldJwt);
    let resolveSignOut!: (value: { error: null }) => void;
    mocks.signOut.mockImplementationOnce(
      () => new Promise<{ error: null }>((resolve) => {
        resolveSignOut = resolve;
      }),
    );
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(new Response(null, { status: 401 })));

    render(<AuthGate><div>customer child</div></AuthGate>);
    await waitFor(() => {
      expect(mocks.signOut).toHaveBeenCalledTimes(1);
      expect(mocks.signOut).toHaveBeenCalledWith({ scope: "local" });
      expect(mocks.authStateCallback).not.toBeNull();
    });

    act(() => {
      mocks.authStateCallback?.("SIGNED_IN", { access_token: newJwt });
      mocks.authStateCallback?.("SIGNED_OUT", null);
    });
    await act(async () => {
      resolveSignOut({ error: null });
      await Promise.resolve();
    });

    expect(localStorage.getItem("dashboard_auth_token")).toBe(newJwt);
    expect(mocks.replace).not.toHaveBeenCalled();
    expect(screen.queryByText("베타 신청하기")).not.toBeInTheDocument();
  });

  it("still clears a legitimate Supabase SIGNED_OUT event with no reauth owner", async () => {
    const jwt = `${"a".repeat(24)}.${"b".repeat(24)}.${"c".repeat(24)}`;
    localStorage.setItem("dashboard_auth_token", jwt);
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(
        Response.json({
          isOperator: false,
          tenant: { id: "customer-1", slug: "customer", name: "Customer" },
        }),
      ),
    );

    render(<AuthGate><div>customer child</div></AuthGate>);
    await waitFor(() => expect(mocks.authStateCallback).not.toBeNull());
    act(() => {
      mocks.authStateCallback?.("SIGNED_OUT", null);
    });

    await waitFor(() => expect(screen.getAllByText("베타 신청하기").length).toBeGreaterThan(0));
    expect(localStorage.getItem("dashboard_auth_token")).toBeNull();
    expect(localStorage.getItem("active_workspace")).toBeNull();
    expect(useUIStore.getState().activeWorkspace).toBeNull();
  });

  // 2026-09-05 회장 계정 실측 회귀: 배포로 컨테이너가 잠깐 재시작하는 사이 상태 검사가 한 번
  // 실패해 작업 중이던 화면이 통째로 덮였다. 바로 뒤에 같은 토큰으로 부르니 정상이었다.
  it("QA-AUTH-09 정상: 상태 검사가 일시적으로 500이면 한 번 더 물어보고 화면을 지킨다", async () => {
    const jwt = `${"a".repeat(24)}.${"b".repeat(24)}.${"c".repeat(24)}`;
    localStorage.setItem("dashboard_auth_token", jwt);
    mocks.pathname.mockReturnValue("/studio");
    let calls = 0;
    vi.stubGlobal("fetch", vi.fn(async () => {
      calls += 1;
      if (calls === 1) return new Response(null, { status: 503 });
      return Response.json({ tenant: { id: "11111111-1111-4111-8111-111111111111" }, isOperator: false });
    }));

    render(<AuthGate><div>customer child</div></AuthGate>);

    await waitFor(() => expect(screen.getByText("customer child")).toBeInTheDocument(), { timeout: 4000 });
    expect(calls).toBeGreaterThanOrEqual(2);
    expect(screen.queryByText("서비스 확인 실패")).toBeNull();
  });
});
