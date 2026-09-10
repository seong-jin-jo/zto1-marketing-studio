// @vitest-environment jsdom
import "@testing-library/jest-dom/vitest";
import React from "react";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { Sidebar } from "@/components/layout/Sidebar";
import { useUIStore } from "@/store/ui-store";

const mocks = vi.hoisted(() => ({
  swr: vi.fn(),
  pathname: vi.fn(() => "/operator/customers"),
  signOut: vi.fn(),
}));

vi.mock("swr", () => ({
  default: (...args: unknown[]) => mocks.swr(...args),
}));

vi.mock("next/navigation", () => ({
  usePathname: () => mocks.pathname(),
}));

vi.mock("next/link", () => ({
  default: ({
    href,
    children,
    ...props
  }: React.AnchorHTMLAttributes<HTMLAnchorElement> & { href: string; children: React.ReactNode }) => (
    <a href={href} {...props}>{children}</a>
  ),
}));

vi.mock("@/hooks/useChannelConfig", () => ({
  useChannelConfig: () => ({ data: {} }),
}));

vi.mock("@/hooks/useOverview", () => ({
  useCronStatus: () => ({ data: { jobs: [] } }),
}));

vi.mock("@/components/layout/ThemeToggle", () => ({
  ThemeToggle: () => <button type="button">테마</button>,
}));

vi.mock("@/lib/supabase", () => ({
  createBrowserSupabase: () => ({
    auth: { signOut: mocks.signOut },
  }),
}));

describe("Sidebar operator/customer shell separation", () => {
  beforeEach(() => {
    localStorage.clear();
    localStorage.setItem(
      "active_workspace",
      JSON.stringify({ id: "persisted-customer", slug: "romeo", name: "Romeo-n-cupid" }),
    );
    useUIStore.setState({
      activeWorkspace: { id: "persisted-customer", slug: "romeo", name: "Romeo-n-cupid" },
      sidebarCollapsed: {},
      studioRoom: "publish",
    });
    mocks.pathname.mockReturnValue("/operator/customers");
    mocks.signOut.mockReset();
    mocks.signOut.mockResolvedValue({ error: null });
  });

  afterEach(() => {
    cleanup();
    mocks.swr.mockReset();
  });

  it("renders operator identity and operator navigation only, then clears persisted customer workspace", async () => {
    mocks.swr.mockImplementation((key: string | null) => {
      if (key === "/api/me") return { data: { isOperator: true, tenant: null } };
      return { data: undefined };
    });

    render(<Sidebar />);

    expect(screen.getAllByText("운영자").length).toBeGreaterThanOrEqual(1);
    expect(screen.getByRole("link", { name: "고객 관리" })).toHaveAttribute(
      "href",
      "/operator/customers",
    );
    expect(screen.queryByText("Marketing Hub")).not.toBeInTheDocument();
    expect(screen.queryByText("Romeo-n-cupid")).not.toBeInTheDocument();
    expect(screen.queryByText("OSMU Studio")).not.toBeInTheDocument();
    expect(screen.queryByText("Social")).not.toBeInTheDocument();
    expect(screen.queryByText("Keyword Research")).not.toBeInTheDocument();

    await waitFor(() => expect(useUIStore.getState().activeWorkspace).toBeNull());
    expect(localStorage.getItem("active_workspace")).toBeNull();
  });

  it("V75-SIDEBAR-01 한국어 라벨: 고객 사이드바의 일반 항목은 영어 이름을 노출하지 않는다", () => {
    mocks.pathname.mockReturnValue("/");
    mocks.swr.mockImplementation((key: string | null) => {
      if (key === "/api/me") return { data: { isOperator: false, tenant: { id: "customer-1", slug: "customer", name: "고객 작업 공간" } }, mutate: vi.fn() };
      if (key === "/api/images") return { data: [] };
      return { data: undefined };
    });

    render(<Sidebar />);

    ["데이터와 분석", "블로그 성과", "키워드 조사", "키워드 찾기", "네이버 트렌드", "구글 트렌드", "외부 연동", "자산과 도구", "이미지", "영상", "시스템", "설정"].forEach((label) => {
      expect(screen.getAllByText(label).length).toBeGreaterThan(0);
    });
    ["Custom Integration", "Data & Analytics", "Keyword Research", "Assets & Tools", "Images", "Videos", "Settings"].forEach((label) => {
      expect(screen.queryByText(label)).not.toBeInTheDocument();
    });
  });

  it("FE3-SIDEBAR-01 정상: 고객 셸 맨 위에 네 방 흐름과 그 아래 채널 링크를 노출한다", () => {
    mocks.pathname.mockReturnValue("/");
    mocks.swr.mockImplementation((key: string | null) => {
      if (key === "/api/me") {
        return {
          data: {
            isOperator: false,
            tenant: { id: "customer-1", slug: "customer", name: "고객 워크스페이스" },
          },
          mutate: vi.fn(),
        };
      }
      if (key === "/api/images") return { data: [] };
      return { data: undefined };
    });

    render(<Sidebar />);

    expect(screen.getByText("고객 워크스페이스")).toBeInTheDocument();
    expect(screen.getByText("한 편의 제작 순서")).toBeInTheDocument();
    expect(screen.getByRole("link", { name: /생성실/ })).toHaveAttribute("href", "/studio?room=create");
    expect(screen.getByRole("link", { name: /편집실/ })).toHaveAttribute("href", "/studio?room=edit");
    expect(screen.getByRole("link", { name: /발행실/ })).toHaveAttribute("href", "/studio?room=publish");
    expect(screen.getByRole("link", { name: /성과실/ })).toHaveAttribute("href", "/performance");
    expect(screen.getAllByText("영상").length).toBeGreaterThan(0);
    expect(screen.getByRole("link", { name: "YouTube" })).toHaveAttribute(
      "href",
      "/channels/youtube",
    );
    expect(screen.getByRole("link", { name: "TikTok" })).toHaveAttribute(
      "href",
      "/channels/tiktok",
    );
  });

  it("FE3-SIDEBAR-02 거절: 기존 Overview와 OSMU Studio 중복 진입로를 다시 노출하지 않는다", () => {
    mocks.pathname.mockReturnValue("/studio");
    mocks.swr.mockImplementation((key: string | null) => {
      if (key === "/api/me") return { data: { isOperator: false, tenant: { id: "customer-1", slug: "customer", name: "고객 워크스페이스" } }, mutate: vi.fn() };
      if (key === "/api/images") return { data: [] };
      return { data: undefined };
    });

    render(<Sidebar />);

    expect(screen.queryByText("Overview")).not.toBeInTheDocument();
    expect(screen.queryByText("OSMU Studio")).not.toBeInTheDocument();
  });

  it("V70-INBOX-05 정상: 네 방 밖 승인 인박스에서도 현재 위치를 표시하고 무의미한 분수를 숨긴다", () => {
    mocks.pathname.mockReturnValue("/inbox");
    mocks.swr.mockImplementation((key: string | null) => {
      if (key === "/api/me") return { data: { isOperator: false, tenant: { id: "customer-1", slug: "customer", name: "고객 워크스페이스" } }, mutate: vi.fn() };
      if (key === "/api/images") return { data: [] };
      return { data: undefined };
    });

    render(<Sidebar />);

    expect(screen.getByRole("link", { name: /현재 위치\s*승인 인박스/ })).toHaveAttribute("aria-current", "page");
    expect(screen.queryByText(/0\/\d+/)).not.toBeInTheDocument();
  });

  it("FE4-SIDEBAR-01 정상: 390 셸은 닫힌 서랍과 현재 방 이름으로 본문 폭을 보존한다", () => {
    mocks.pathname.mockReturnValue("/studio");
    mocks.swr.mockImplementation((key: string | null) => {
      if (key === "/api/me") return { data: { isOperator: false, tenant: { id: "customer-1", slug: "customer", name: "고객 워크스페이스" } }, mutate: vi.fn() };
      if (key === "/api/images") return { data: [] };
      return { data: undefined };
    });

    render(<Sidebar />);

    const sidebar = screen.getByRole("complementary", { name: "주요 사이드바" });
    const openButton = screen.getByRole("button", { name: "메뉴 열기" });
    expect(sidebar).toHaveClass("hidden", "md:flex", "md:w-24");
    expect(screen.getAllByText("편집실").length).toBeGreaterThanOrEqual(1);
    expect(screen.queryByText("지금 여기")).not.toBeInTheDocument();
    expect(openButton).toHaveAttribute("aria-expanded", "false");

    fireEvent.click(openButton);
    expect(sidebar).toHaveClass("fixed", "flex");
    expect(openButton).toHaveAttribute("aria-expanded", "true");
    fireEvent.click(screen.getByRole("button", { name: "메뉴 닫기" }));
    expect(sidebar).toHaveClass("hidden");
  });

  it("FE4-SIDEBAR-02 거절: 좁은 폭에서도 고정 96px 레일을 강제하는 옛 셸을 되살리지 않는다", () => {
    mocks.pathname.mockReturnValue("/");
    mocks.swr.mockImplementation((key: string | null) => {
      if (key === "/api/me") return { data: { isOperator: false, tenant: { id: "customer-1", slug: "customer", name: "고객 워크스페이스" } }, mutate: vi.fn() };
      if (key === "/api/images") return { data: [] };
      return { data: undefined };
    });

    render(<Sidebar />);

    const sidebar = screen.getByRole("complementary", { name: "주요 사이드바" });
    expect(sidebar.className).not.toContain("sticky top-0 flex h-screen w-24");
    expect(sidebar).toHaveClass("w-[min(20rem,86vw)]", "md:sticky", "md:h-screen");
  });

  it("clears the persisted active workspace when a customer logs out", async () => {
    mocks.pathname.mockReturnValue("/");
    localStorage.setItem("dashboard_auth_token", `${"a".repeat(24)}.${"b".repeat(24)}.${"c".repeat(24)}`);
    mocks.swr.mockImplementation((key: string | null) => {
      if (key === "/api/me") {
        return {
          data: {
            isOperator: false,
            tenant: { id: "customer-1", slug: "customer", name: "고객 워크스페이스" },
          },
          mutate: vi.fn(),
        };
      }
      if (key === "/api/images") return { data: [] };
      return { data: undefined };
    });

    render(<Sidebar />);
    screen.getByRole("button", { name: /로그아웃/ }).click();

    await waitFor(() => {
      expect(mocks.signOut).toHaveBeenCalledTimes(1);
      expect(localStorage.getItem("dashboard_auth_token")).toBeNull();
      expect(localStorage.getItem("active_workspace")).toBeNull();
      expect(useUIStore.getState().activeWorkspace).toBeNull();
    });
  });
});
