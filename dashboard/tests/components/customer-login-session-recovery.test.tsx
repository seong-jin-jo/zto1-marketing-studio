// @vitest-environment jsdom
import "@testing-library/jest-dom/vitest";
import React from "react";
import { act, cleanup, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import LoginPage from "@/app/login/page";

const mocks = vi.hoisted(() => ({
  replace: vi.fn(),
  router: null as { replace: ReturnType<typeof vi.fn> } | null,
  getSession: vi.fn(),
  signOut: vi.fn(),
  authCallback: null as null | ((event: string, session: { access_token?: string } | null) => void),
}));
mocks.router = { replace: mocks.replace };

vi.mock("next/navigation", () => ({
  useRouter: () => mocks.router,
}));

vi.mock("@/lib/supabase", () => ({
  createBrowserSupabase: () => ({
    auth: {
      getSession: mocks.getSession,
      signOut: mocks.signOut,
      onAuthStateChange: vi.fn((callback) => {
        mocks.authCallback = callback;
        return { data: { subscription: { unsubscribe: vi.fn() } } };
      }),
    },
  }),
}));

vi.mock("@/lib/analytics/events", () => ({ trackEvent: vi.fn() }));

describe("고객 로그인 Supabase 세션 복구 경계", () => {
  beforeEach(() => {
    localStorage.clear();
    sessionStorage.clear();
    mocks.replace.mockReset();
    mocks.getSession.mockReset();
    mocks.signOut.mockReset();
    mocks.signOut.mockResolvedValue({ error: null });
    mocks.authCallback = null;
    window.history.replaceState(null, "", "/login?returnTo=%2Fstudio%3Froom%3Dedit");
  });

  afterEach(() => {
    cleanup();
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
  });

  it("QA-AUTH-10 거절: 저장소의 만료 세션을 getSession과 인증 이벤트가 중복 반환해도 로그인에 안정적으로 머문다", async () => {
    const expiredJwt = `${"a".repeat(24)}.${"b".repeat(24)}.${"c".repeat(24)}`;
    localStorage.setItem("dashboard_auth_token", expiredJwt);
    localStorage.setItem("dashboard_auth_identity_kind", "customer");
    mocks.getSession.mockResolvedValue({ data: { session: { access_token: expiredJwt } } });
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(new Response(null, { status: 401 })));

    render(<LoginPage />);
    await waitFor(() => expect(mocks.authCallback).not.toBeNull());
    act(() => mocks.authCallback?.("SIGNED_IN", { access_token: expiredJwt }));

    await waitFor(() => {
      expect(screen.getByText("세션이 만료되었습니다. Google로 다시 로그인해주세요.")).toBeInTheDocument();
    });
    expect(fetch).toHaveBeenCalledTimes(1);
    expect(mocks.signOut).toHaveBeenCalledTimes(1);
    expect(mocks.signOut).toHaveBeenCalledWith({ scope: "local" });
    expect(mocks.replace).not.toHaveBeenCalled();
    expect(localStorage.getItem("dashboard_auth_token")).toBeNull();
    expect(screen.getByText("Google로 계속")).toBeInTheDocument();
    expect(screen.queryByText(/DASHBOARD_AUTH_TOKEN/)).not.toBeInTheDocument();
  });

  it("QA-AUTH-11 정상: 서버가 확인한 고객 세션만 안전한 returnTo로 복귀한다", async () => {
    const validJwt = `${"d".repeat(24)}.${"e".repeat(24)}.${"f".repeat(24)}`;
    mocks.getSession.mockResolvedValue({ data: { session: { access_token: validJwt } } });
    vi.stubGlobal("fetch", vi.fn().mockImplementation(() => Promise.resolve(Response.json({
      isOperator: false,
      tenant: { id: "customer-1" },
    }))));

    render(<LoginPage />);

    await waitFor(() => {
      expect(mocks.replace).toHaveBeenCalledWith("/studio?room=edit");
    });
    expect(localStorage.getItem("dashboard_auth_token")).toBe(validJwt);
    expect(localStorage.getItem("dashboard_auth_identity_kind")).toBe("customer");
    expect(mocks.signOut).not.toHaveBeenCalled();
  });

  it.each([
    { label: "tenant null", payload: { isOperator: false, tenant: null } },
    { label: "tenantError", payload: { isOperator: false, tenant: null, tenantError: true } },
    { label: "operator", payload: { isOperator: true, tenant: null } },
  ])("QA-AUTH-13 거절: /api/me 200 $label 응답은 고객 로그인 성공으로 승인하지 않는다", async ({ payload }) => {
    const token = `${"d".repeat(24)}.${"e".repeat(24)}.${"f".repeat(24)}`;
    mocks.getSession.mockResolvedValue({ data: { session: { access_token: token } } });
    vi.stubGlobal("fetch", vi.fn().mockImplementation(() => Promise.resolve(Response.json(payload))));

    render(<LoginPage />);

    await waitFor(() => {
      expect(screen.getByText("로그인 상태를 확인하지 못했습니다. 잠시 후 다시 시도해주세요.")).toBeInTheDocument();
    });
    expect(mocks.replace).not.toHaveBeenCalled();
    expect(localStorage.getItem("dashboard_auth_token")).toBeNull();
  });

  it("QA-AUTH-14 정상: hash OAuth callback 정리 뒤에도 returnTo query를 보존한다", async () => {
    const token = `${"d".repeat(24)}.${"e".repeat(24)}.${"f".repeat(24)}`;
    window.history.replaceState(null, "", "/login?returnTo=%2Fstudio%3Froom%3Dedit#access_token=callback");
    mocks.getSession.mockResolvedValue({ data: { session: { access_token: token } } });
    vi.stubGlobal("fetch", vi.fn().mockImplementation(() => Promise.resolve(Response.json({
      isOperator: false,
      tenant: { id: "customer-1" },
    }))));

    render(<LoginPage />);

    await waitFor(() => expect(mocks.replace).toHaveBeenCalledWith("/studio?room=edit"));
    expect(window.location.hash).toBe("");
    expect(window.location.search).toBe("?returnTo=%2Fstudio%3Froom%3Dedit");
  });

  it("QA-AUTH-12 경합: 이전 만료 응답은 더 최신 고객 세션을 지우거나 sign-out하지 않는다", async () => {
    const oldJwt = `${"a".repeat(24)}.${"b".repeat(24)}.${"c".repeat(24)}`;
    const newJwt = `${"d".repeat(24)}.${"e".repeat(24)}.${"f".repeat(24)}`;
    let resolveOld!: (response: Response) => void;
    let resolveNew!: (response: Response) => void;
    mocks.getSession.mockResolvedValue({ data: { session: { access_token: oldJwt } } });
    vi.stubGlobal("fetch", vi.fn((_url: string, init?: RequestInit) => {
      const authorization = (init?.headers as Record<string, string>)?.Authorization;
      return new Promise<Response>((resolve) => {
        if (authorization === `Bearer ${oldJwt}`) resolveOld = resolve;
        else resolveNew = resolve;
      });
    }));

    render(<LoginPage />);
    await waitFor(() => expect(mocks.authCallback).not.toBeNull());
    act(() => mocks.authCallback?.("TOKEN_REFRESHED", { access_token: newJwt }));

    await act(async () => {
      resolveNew(Response.json({ isOperator: false, tenant: { id: "customer-1" } }));
      await Promise.resolve();
    });
    await waitFor(() => expect(localStorage.getItem("dashboard_auth_token")).toBe(newJwt));

    await act(async () => {
      resolveOld(new Response(null, { status: 401 }));
      await Promise.resolve();
    });

    expect(localStorage.getItem("dashboard_auth_token")).toBe(newJwt);
    expect(mocks.signOut).not.toHaveBeenCalled();
    expect(mocks.replace).toHaveBeenCalledWith("/studio?room=edit");
  });
});
