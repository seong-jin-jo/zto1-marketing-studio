// @vitest-environment jsdom
import "@testing-library/jest-dom/vitest";
import React from "react";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

const analytics = vi.hoisted(() => ({
  bootstrapConsent: vi.fn(),
  getStoredConsent: vi.fn(() => null),
  setConsent: vi.fn(),
}));

vi.mock("@/lib/analytics/ga", () => ({
  bootstrapConsent: analytics.bootstrapConsent,
  gaEnabled: true,
  getStoredConsent: analytics.getStoredConsent,
  setConsent: analytics.setConsent,
}));

import { ConsentBanner } from "@/components/shared/ConsentBanner";

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});

describe("V69-COPY-02 쿠키 동의 배너 배치 계약", () => {
  it("V69-COPY-02 정상: 동의 단추는 선택을 저장하고 배너를 닫는다", async () => {
    render(<ConsentBanner />);

    const banner = await screen.findByRole("region", { name: "분석 쿠키 동의" });
    fireEvent.click(screen.getByRole("button", { name: "동의" }));

    expect(analytics.setConsent).toHaveBeenCalledWith("granted");
    await waitFor(() => expect(banner).not.toBeInTheDocument());
  });

  it("V69-COPY-02 거절: 우측 담당 패널을 덮는 고정 배치를 사용하지 않는다", async () => {
    render(<ConsentBanner />);

    const banner = await screen.findByRole("region", { name: "분석 쿠키 동의" });
    expect(banner).toHaveClass("relative");
    expect(banner).not.toHaveClass("fixed", "bottom-4", "right-4");
  });
});
