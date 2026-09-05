// @vitest-environment jsdom
import "@testing-library/jest-dom/vitest";
import React from "react";
import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import OperatorCustomersPage from "@/app/operator/customers/page";
import { apiDelete, apiPost, fetcher } from "@/lib/api";
import { setAuthToken } from "@/lib/auth";

const mocks = vi.hoisted(() => ({
  swr: vi.fn(),
}));

vi.mock("swr", () => ({
  default: (...args: unknown[]) => mocks.swr(...args),
}));

describe("operator GET authentication handling", () => {
  beforeEach(() => {
    localStorage.clear();
    mocks.swr.mockReset();
    window.history.replaceState(null, "", "/operator/customers");
  });

  afterEach(() => {
    cleanup();
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
  });

  it("GET 401 clears the stale token, dispatches auth:required, and throws a typed auth error", async () => {
    localStorage.setItem("dashboard_auth_token", "expired-operator-token");
    const onAuthRequired = vi.fn();
    window.addEventListener("auth:required", onAuthRequired);
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(new Response(null, { status: 401 })));

    await expect(fetcher("/api/operator/customers")).rejects.toMatchObject({
      name: "AuthRequiredError",
    });
    expect(localStorage.getItem("dashboard_auth_token")).toBeNull();
    expect(onAuthRequired).toHaveBeenCalledTimes(1);

    window.removeEventListener("auth:required", onAuthRequired);
  });

  it("customer JWT 401 requests Google/Supabase reauthentication instead of the Auth Token modal", async () => {
    window.history.replaceState(null, "", "/studio");
    const jwt = `${"a".repeat(24)}.${"b".repeat(24)}.${"c".repeat(24)}`;
    localStorage.setItem("dashboard_auth_token", jwt);
    const onCustomerReauth = vi.fn();
    const onManualToken = vi.fn();
    window.addEventListener("auth:customer-reauth-required", onCustomerReauth);
    window.addEventListener("auth:required", onManualToken);
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(new Response(null, { status: 401 })));

    await expect(fetcher("/api/images")).rejects.toMatchObject({ name: "AuthRequiredError" });
    expect(onCustomerReauth).toHaveBeenCalledTimes(1);
    expect(onManualToken).not.toHaveBeenCalled();

    window.removeEventListener("auth:customer-reauth-required", onCustomerReauth);
    window.removeEventListener("auth:required", onManualToken);
  });

  it.each([
    ["승인 요청", () => apiPost("/api/queue/draft-1/approve", { hours: 0 })],
    ["삭제 요청", () => apiDelete("/api/images/image-1")],
  ])("V71-AUTH-04 거절: %s의 401도 성공값으로 삼키지 않고 인증 오류를 올린다", async (_label, request) => {
    window.history.replaceState(null, "", "/inbox");
    const jwt = `${"a".repeat(24)}.${"b".repeat(24)}.${"c".repeat(24)}`;
    localStorage.setItem("dashboard_auth_token", jwt);
    const onCustomerReauth = vi.fn();
    window.addEventListener("auth:customer-reauth-required", onCustomerReauth);
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(new Response(null, { status: 401 })));

    await expect(request()).rejects.toMatchObject({ name: "AuthRequiredError" });
    expect(onCustomerReauth).toHaveBeenCalledTimes(1);

    window.removeEventListener("auth:customer-reauth-required", onCustomerReauth);
  });

  it("V71-AUTH-05 정상: 승인 요청 성공 응답은 기존 결과를 그대로 반환한다", async () => {
    window.history.replaceState(null, "", "/inbox");
    localStorage.setItem("dashboard_auth_token", "valid-operator-token");
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(Response.json({ ok: true })));

    await expect(apiPost("/api/queue/draft-1/approve", { hours: 0 })).resolves.toEqual({ ok: true });
  });

  it("stale customer JWT 401 cannot reauthenticate or clear a newer customer session", async () => {
    window.history.replaceState(null, "", "/studio");
    const oldJwt = `${"a".repeat(24)}.${"b".repeat(24)}.${"c".repeat(24)}`;
    const newJwt = `${"d".repeat(24)}.${"e".repeat(24)}.${"f".repeat(24)}`;
    localStorage.setItem("dashboard_auth_token", oldJwt);
    const onCustomerReauth = vi.fn();
    window.addEventListener("auth:customer-reauth-required", onCustomerReauth);
    let resolveRequest!: (response: Response) => void;
    vi.stubGlobal("fetch", vi.fn().mockReturnValue(new Promise<Response>((resolve) => {
      resolveRequest = resolve;
    })));

    const request = fetcher("/api/images");
    setAuthToken(newJwt);
    resolveRequest(new Response(null, { status: 401 }));

    await expect(request).rejects.toMatchObject({ name: "AuthRequiredError" });
    expect(localStorage.getItem("dashboard_auth_token")).toBe(newJwt);
    expect(onCustomerReauth).not.toHaveBeenCalled();

    window.removeEventListener("auth:customer-reauth-required", onCustomerReauth);
  });

  it("형식 불량 고객 토큰 401도 고객 경로에서는 운영자 Auth Token 모달을 열지 않는다", async () => {
    window.history.replaceState(null, "", "/studio?room=edit");
    localStorage.setItem("dashboard_auth_token", "malformed-stale-customer-token");
    const onCustomerReauth = vi.fn();
    const onManualToken = vi.fn();
    window.addEventListener("auth:customer-reauth-required", onCustomerReauth);
    window.addEventListener("auth:required", onManualToken);
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(new Response(null, { status: 401 })));

    await expect(fetcher("/api/images")).rejects.toMatchObject({ name: "AuthRequiredError" });
    expect(onCustomerReauth).toHaveBeenCalledTimes(1);
    expect(onManualToken).not.toHaveBeenCalled();

    window.removeEventListener("auth:customer-reauth-required", onCustomerReauth);
    window.removeEventListener("auth:required", onManualToken);
  });

  it("a fresh login clears an orphaned workspace even when no previous auth token remains", () => {
    localStorage.setItem(
      "active_workspace",
      JSON.stringify({ id: "stale-tenant", slug: "stale", name: "Stale" }),
    );

    setAuthToken(`${"d".repeat(24)}.${"e".repeat(24)}.${"f".repeat(24)}`);

    expect(localStorage.getItem("active_workspace")).toBeNull();
  });

  it.each([
    { label: "an unauthenticated pre-login request", requestToken: "", expectedHeaders: {} },
    {
      label: "a request made with an older token",
      requestToken: "pre-login-token",
      expectedHeaders: { Authorization: "Bearer pre-login-token" },
    },
  ])("does not let $label clear or invalidate a newer login token", async ({
    requestToken,
    expectedHeaders,
  }) => {
    if (requestToken) localStorage.setItem("dashboard_auth_token", requestToken);
    const onAuthRequired = vi.fn();
    window.addEventListener("auth:required", onAuthRequired);
    let resolveRequest!: (response: Response) => void;
    const pendingResponse = new Promise<Response>((resolve) => {
      resolveRequest = resolve;
    });
    const fetchMock = vi.fn().mockReturnValue(pendingResponse);
    vi.stubGlobal("fetch", fetchMock);

    const request = fetcher("/api/images");
    expect(fetchMock).toHaveBeenCalledWith("/api/images", {
      headers: expectedHeaders,
    });

    setAuthToken("new-operator-token");
    resolveRequest(new Response(null, { status: 401 }));

    await expect(request).rejects.toMatchObject({ name: "AuthRequiredError" });
    expect(localStorage.getItem("dashboard_auth_token")).toBe("new-operator-token");
    expect(onAuthRequired).not.toHaveBeenCalled();

    window.removeEventListener("auth:required", onAuthRequired);
  });

  it("does not render raw Unauthorized when SWR receives an authentication-required error", () => {
    const authError = Object.assign(new Error("Unauthorized"), { name: "AuthRequiredError" });
    mocks.swr.mockReturnValue({
      data: undefined,
      error: authError,
      isLoading: false,
      mutate: vi.fn(),
    });

    render(<OperatorCustomersPage />);

    expect(screen.queryByText("Unauthorized")).not.toBeInTheDocument();
    expect(screen.queryByText("조회 실패")).not.toBeInTheDocument();
  });
});
