// @vitest-environment jsdom
import "@testing-library/jest-dom/vitest";
import React from "react";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { OnboardingWizard } from "@/components/shared/OnboardingWizard";

// Regression: OSMU-BLOCK-D2. 새로고침 입력 복원이 첫 콘텐츠 동선 정리 중
// 삭제된 결함. 자동저장과 손상 값 거절을 고정한다.
// Found by 교차 모델 검수 on 2026-08-28.
// Report: docs/_archive/legacy-20260912/audit/osmu-cross-review-2026-08-28-opus.md

const H = vi.hoisted(() => ({ apiPost: vi.fn() }));

vi.mock("next/navigation", () => ({ useRouter: () => ({ push: vi.fn() }) }));
vi.mock("@/lib/api", () => ({ apiPost: (...args: unknown[]) => H.apiPost(...args) }));

beforeEach(() => {
  H.apiPost.mockReset().mockResolvedValue({ ok: true });
  localStorage.clear();
});

afterEach(cleanup);

describe("온보딩 입력 복원 회귀", () => {
  it("OSMU-BLOCK-D2 정상: 새로고침 뒤 업종과 콘텐츠 갈래 선택을 복원한다", async () => {
    const first = render(<OnboardingWizard onComplete={vi.fn()} onDismiss={vi.fn()} />);
    fireEvent.click(screen.getByRole("button", { name: /테크/ }));
    fireEvent.click(screen.getByRole("button", { name: "다음" }));
    fireEvent.click(screen.getByRole("button", { name: /영상/ }));
    await waitFor(() => expect(localStorage.getItem("osmu_onboarding_draft")).toContain('"contentBranch":"video"'));
    first.unmount();

    render(<OnboardingWizard onComplete={vi.fn()} onDismiss={vi.fn()} />);
    await waitFor(() => expect(screen.getByRole("button", { name: /테크/ })).toHaveAttribute("aria-pressed", "true"));
    fireEvent.click(screen.getByRole("button", { name: "다음" }));
    expect(screen.getByRole("button", { name: /영상/ })).toHaveAttribute("aria-pressed", "true");
  });

  it("OSMU-BLOCK-D2 거절: 깨진 자동저장 값은 선택으로 오인하지 않고 제거한다", async () => {
    localStorage.setItem("osmu_onboarding_draft", "{broken-json");
    render(<OnboardingWizard onComplete={vi.fn()} onDismiss={vi.fn()} />);

    await waitFor(() => expect(localStorage.getItem("osmu_onboarding_draft")).not.toBe("{broken-json"));
    expect(screen.getByRole("button", { name: "다음" })).toBeDisabled();
    expect(screen.getByRole("button", { name: /테크/ })).toHaveAttribute("aria-pressed", "false");
  });
});
