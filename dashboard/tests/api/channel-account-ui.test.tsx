// @vitest-environment jsdom
import "@testing-library/jest-dom/vitest";
import React from "react";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { AccountManager } from "@/components/channel/AccountManager";

const H = vi.hoisted(() => ({
  onAccountsChanged: vi.fn(),
  accounts: [
    {
      id: "acc-main",
      external_account_id: "external-main",
      display_name: "메인",
      username: "main",
      is_default: true,
      status: "active",
      token_expires_at: "2026-10-30T00:00:00.000Z",
      created_at: "2026-08-01T00:00:00.000Z",
      connection_state: "connected",
      can_be_default: true,
      default_blocked_reason: null,
    },
    {
      id: "acc-brand",
      external_account_id: "external-brand",
      display_name: "브랜드",
      username: "brand",
      is_default: false,
      status: "active",
      token_expires_at: "2026-11-30T00:00:00.000Z",
      created_at: "2026-08-02T00:00:00.000Z",
      connection_state: "connected",
      can_be_default: true,
      default_blocked_reason: null,
    },
    {
      id: "acc-expired",
      external_account_id: "external-expired",
      display_name: "예전 계정",
      username: "old",
      is_default: false,
      status: "expired",
      token_expires_at: "2026-08-01T00:00:00.000Z",
      created_at: "2026-07-01T00:00:00.000Z",
      connection_state: "reconnect",
      can_be_default: false,
      default_blocked_reason: "status_expired",
    },
  ],
}));

vi.mock("@/store/ui-store", () => ({
  useUIStore: () => ({ activeWorkspace: { id: "tenant-1", name: "테스트 작업 공간" } }),
}));

vi.mock("@/lib/auth", () => ({ authHeaders: () => ({ Authorization: "Bearer test-token" }) }));

function fetchResponse(body: unknown, status = 200): Promise<Response> {
  return Promise.resolve(Response.json(body, { status }));
}

describe("연결 계정 관리 화면", () => {
  beforeEach(() => {
    H.onAccountsChanged.mockReset();
    H.accounts[0].is_default = true;
    H.accounts[1].is_default = false;
    vi.stubGlobal("fetch", vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = String(input);
      if (init?.method === "POST" && url.includes("/acc-brand/default")) {
        H.accounts[0].is_default = false;
        H.accounts[1].is_default = true;
        return fetchResponse({ ok: true });
      }
      if (init?.method === "DELETE") return fetchResponse({ ok: true, promotedId: null });
      return fetchResponse({ accounts: H.accounts });
    }));
  });

  afterEach(() => {
    cleanup();
    vi.unstubAllGlobals();
  });

  it("계정-화면-01 정상: 목록, 상태, 만료 시각, 기본 의미를 보여주고 기본 전환 API를 호출한다", async () => {
    render(<AccountManager provider="threads" label="Threads" onAccountsChanged={H.onAccountsChanged} />);

    expect(await screen.findByText("연결된 Threads 계정 (3)")).toBeInTheDocument();
    expect(screen.getByText("기본 계정은 이 플랫폼에 올릴 때 사용하는 계정입니다.")).toBeInTheDocument();
    expect(screen.getAllByText("연결됨")).toHaveLength(2);
    expect(screen.getAllByText("토큰 만료")).toHaveLength(3);

    fireEvent.click(screen.getByTestId("account-set-default-threads-acc-brand"));

    await waitFor(() => expect(fetch).toHaveBeenCalledWith(
      "/api/channels/threads/accounts/acc-brand/default?tenant_id=tenant-1",
      expect.objectContaining({ method: "POST" }),
    ));
    await waitFor(() => expect(screen.getByTestId("account-default-badge-threads-acc-brand")).toBeInTheDocument());
    expect(H.onAccountsChanged).toHaveBeenCalledOnce();
  });

  it("계정-화면-02 거절: 만료 계정은 기본 지정 단추를 비활성화하고 이유를 적는다", async () => {
    render(<AccountManager provider="threads" label="Threads" />);

    const button = await screen.findByTestId("account-set-default-threads-acc-expired");
    expect(button).toBeDisabled();
    expect(button).toHaveAttribute("aria-describedby", "account-default-blocked-threads-acc-expired");
    expect(screen.getByText("토큰이 만료되어 기본으로 지정할 수 없습니다. 다시 연결해 주세요.")).toBeInTheDocument();
  });

  it("계정-화면-03 거절과 정상: 연결 해제는 확인 취소 시 요청하지 않고 승인 후 한 계정만 삭제한다", async () => {
    const confirmSpy = vi.spyOn(window, "confirm").mockReturnValueOnce(false).mockReturnValueOnce(true);
    render(<AccountManager provider="threads" label="Threads" />);
    const button = await screen.findByRole("button", { name: "브랜드 (@brand) 계정 연결 해제" });

    fireEvent.click(button);
    expect(fetch).not.toHaveBeenCalledWith(expect.stringContaining("/acc-brand"), expect.objectContaining({ method: "DELETE" }));

    fireEvent.click(button);
    await waitFor(() => expect(fetch).toHaveBeenCalledWith(
      "/api/channels/threads/accounts/acc-brand?tenant_id=tenant-1",
      expect.objectContaining({ method: "DELETE" }),
    ));
    expect(confirmSpy).toHaveBeenLastCalledWith(expect.stringContaining("되돌릴 수 없으며"));
  });
});
