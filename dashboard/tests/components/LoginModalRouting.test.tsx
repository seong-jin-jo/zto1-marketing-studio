// @vitest-environment jsdom
import "@testing-library/jest-dom/vitest";
import React from "react";
import { act, cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { LoginModal } from "@/components/shared/LoginModal";

const mocks = vi.hoisted(() => ({ showToast: vi.fn() }));

vi.mock("@/components/layout/Toast", () => ({
  useToast: () => ({ showToast: mocks.showToast }),
}));

describe("운영자 401 복구 모달", () => {
  beforeEach(() => {
    localStorage.clear();
    mocks.showToast.mockReset();
  });

  afterEach(() => {
    cleanup();
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
  });

  function openModal() {
    render(<LoginModal />);
    act(() => window.dispatchEvent(new CustomEvent("auth:required")));
  }

  it("QA-AUTH-17 정상: 승인된 모달 표식, 영문 카피, 44px 조작 영역을 유지한다", async () => {
    openModal();

    expect(screen.getByText("로그인이 필요합니다")).toBeInTheDocument();
    expect(screen.getByPlaceholderText("운영자 토큰")).toBeInTheDocument();
    const dialog = screen.getByRole("dialog", { name: "로그인이 필요합니다" });
    expect(dialog).toHaveClass("v56-loginmodal");
    expect(dialog).toHaveAttribute("aria-modal", "true");
    expect(dialog.closest("[data-login-modal]")).not.toBeNull();
    expect(screen.getByRole("button", { name: "로그인" })).toHaveClass("min-h-control-touch");
    expect(screen.getByRole("button", { name: "취소" })).toHaveClass("min-h-control-touch");
    await waitFor(() => expect(screen.getByLabelText("운영자 토큰")).toHaveFocus());
  });

  it("QA-AUTH-18 정상: Escape로 닫고 Tab과 Shift+Tab 포커스를 모달 안에 가둔다", async () => {
    openModal();
    const input = screen.getByLabelText("운영자 토큰");
    const cancelButton = screen.getByRole("button", { name: "취소" });
    await waitFor(() => expect(input).toHaveFocus());

    cancelButton.focus();
    fireEvent.keyDown(cancelButton, { key: "Tab" });
    expect(input).toHaveFocus();
    fireEvent.keyDown(input, { key: "Tab", shiftKey: true });
    expect(cancelButton).toHaveFocus();
    fireEvent.keyDown(cancelButton, { key: "Escape" });
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
  });

  it.each([
    { label: "401", response: new Response(null, { status: 401 }) },
    { label: "고객 200", response: Response.json({ isOperator: false, tenant: { id: "customer-1" } }) },
  ])("QA-AUTH-19 거절: $label 응답은 토큰을 저장하거나 성공 표시하지 않는다", async ({ response }) => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(response));
    openModal();
    fireEvent.change(screen.getByPlaceholderText("운영자 토큰"), { target: { value: "untrusted-token" } });
    fireEvent.click(screen.getByRole("button", { name: "로그인" }));

    await waitFor(() => expect(screen.getByText("운영자 토큰이 유효하지 않습니다. 다시 확인해주세요.")).toBeInTheDocument());
    expect(localStorage.getItem("dashboard_auth_token")).toBeNull();
    expect(localStorage.getItem("dashboard_auth_identity_kind")).toBeNull();
    expect(mocks.showToast).not.toHaveBeenCalled();
    expect(screen.getByText("로그인이 필요합니다")).toBeInTheDocument();
  });

  it("QA-AUTH-20 정상: /api/me가 운영자를 확인한 뒤에만 operator 종류와 토큰을 저장한다", async () => {
    vi.stubGlobal("fetch", vi.fn().mockImplementation(() => Promise.resolve(Response.json({ isOperator: true, tenant: null }))));
    openModal();
    fireEvent.change(screen.getByPlaceholderText("운영자 토큰"), { target: { value: " verified-operator-token " } });
    fireEvent.click(screen.getByRole("button", { name: "로그인" }));

    await waitFor(() => expect(screen.queryByText("로그인이 필요합니다")).not.toBeInTheDocument());
    expect(fetch).toHaveBeenCalledWith("/api/me", expect.objectContaining({
      headers: { Authorization: "Bearer verified-operator-token" },
      signal: expect.any(AbortSignal),
    }));
    expect(localStorage.getItem("dashboard_auth_token")).toBe("verified-operator-token");
    expect(localStorage.getItem("dashboard_auth_identity_kind")).toBe("operator");
    expect(mocks.showToast).toHaveBeenCalledWith("로그인 완료", "success");
  });

  it("QA-AUTH-21 거절: 취소는 입력 토큰을 저장하지 않고 모달을 닫는다", () => {
    openModal();
    fireEvent.change(screen.getByPlaceholderText("운영자 토큰"), { target: { value: "not-submitted" } });
    fireEvent.click(screen.getByRole("button", { name: "취소" }));

    expect(screen.queryByText("로그인이 필요합니다")).not.toBeInTheDocument();
    expect(localStorage.getItem("dashboard_auth_token")).toBeNull();
  });

  it("QA-AUTH-22 경합 거절: 취소 뒤 늦게 끝난 운영자 성공은 토큰과 성공 알림을 남기지 않는다", async () => {
    let resolveValidation!: (response: Response) => void;
    vi.stubGlobal("fetch", vi.fn(() => new Promise<Response>((resolve) => {
      resolveValidation = resolve;
    })));
    openModal();
    fireEvent.change(screen.getByLabelText("운영자 토큰"), { target: { value: "late-operator-token" } });
    fireEvent.click(screen.getByRole("button", { name: "로그인" }));
    await waitFor(() => expect(fetch).toHaveBeenCalledTimes(1));

    fireEvent.click(screen.getByRole("button", { name: "취소" }));
    await act(async () => {
      resolveValidation(Response.json({ isOperator: true, tenant: null }));
      await Promise.resolve();
    });

    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
    expect(localStorage.getItem("dashboard_auth_token")).toBeNull();
    expect(localStorage.getItem("dashboard_auth_identity_kind")).toBeNull();
    expect(mocks.showToast).not.toHaveBeenCalled();
  });

  it("QA-AUTH-23 경합 거절: 새 검증은 이전 검증의 늦은 성공을 무효화한다", async () => {
    let resolveFirst!: (response: Response) => void;
    const fetchMock = vi.fn()
      .mockImplementationOnce(() => new Promise<Response>((resolve) => {
        resolveFirst = resolve;
      }))
      .mockResolvedValueOnce(Response.json({ isOperator: false, tenant: { id: "customer-1" } }));
    vi.stubGlobal("fetch", fetchMock);
    openModal();
    const input = screen.getByLabelText("운영자 토큰");
    fireEvent.change(input, { target: { value: "first-token" } });
    fireEvent.click(screen.getByRole("button", { name: "로그인" }));
    fireEvent.change(input, { target: { value: "second-token" } });
    fireEvent.click(screen.getByRole("button", { name: "로그인" }));
    await waitFor(() => expect(screen.getByText("운영자 토큰이 유효하지 않습니다. 다시 확인해주세요.")).toBeInTheDocument());

    await act(async () => {
      resolveFirst(Response.json({ isOperator: true, tenant: null }));
      await Promise.resolve();
    });

    expect(localStorage.getItem("dashboard_auth_token")).toBeNull();
    expect(mocks.showToast).not.toHaveBeenCalled();
    expect(screen.getByRole("dialog", { name: "로그인이 필요합니다" })).toBeInTheDocument();
  });

  it("QA-AUTH-25 경합 거절: unmount 뒤 늦은 운영자 성공은 토큰과 성공 알림을 남기지 않는다", async () => {
    let resolveValidation!: (response: Response) => void;
    vi.stubGlobal("fetch", vi.fn(() => new Promise<Response>((resolve) => {
      resolveValidation = resolve;
    })));
    const view = render(<LoginModal />);
    act(() => window.dispatchEvent(new CustomEvent("auth:required")));
    fireEvent.change(screen.getByLabelText("운영자 토큰"), { target: { value: "late-after-unmount" } });
    fireEvent.click(screen.getByRole("button", { name: "로그인" }));
    await waitFor(() => expect(fetch).toHaveBeenCalledTimes(1));

    view.unmount();
    await act(async () => {
      resolveValidation(Response.json({ isOperator: true, tenant: null }));
      await Promise.resolve();
    });

    expect(localStorage.getItem("dashboard_auth_token")).toBeNull();
    expect(mocks.showToast).not.toHaveBeenCalled();
  });
});
