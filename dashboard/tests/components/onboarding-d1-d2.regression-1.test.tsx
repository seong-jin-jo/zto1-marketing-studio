// @vitest-environment jsdom
import "@testing-library/jest-dom/vitest";
import React from "react";
import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { OnboardingChecklist } from "@/components/shared/OnboardingChecklist";

// Regression: OSMU-BLOCK-D1. 브랜드 문서 안내가 첫 콘텐츠 동선 정리 중
// 삭제된 결함.
// Found by 교차 모델 검수 on 2026-08-28.
// Report: docs/_archive/legacy-20260912/audit/osmu-cross-review-2026-08-28-opus.md

const H = vi.hoisted(() => ({
  checklist: { created: false, wiki: false, channel: false, published: false, analytics: false },
}));

vi.mock("next/navigation", () => ({ useRouter: () => ({ push: vi.fn() }) }));
vi.mock("@/hooks/useOnboarding", () => ({ useOnboardingStatus: () => ({ data: { checklist: H.checklist } }) }));

beforeEach(() => {
  H.checklist = { created: false, wiki: false, channel: false, published: false, analytics: false };
});

afterEach(cleanup);

describe("온보딩 브랜드 문서 회귀", () => {
  it("OSMU-BLOCK-D1 정상: 첫 콘텐츠 다음에 브랜드 문서 연결 항목을 보여 주되 생성을 막지 않는다", () => {
    render(<OnboardingChecklist />);

    const links = screen.getAllByRole("link");
    expect(links[0]).toHaveTextContent("첫 콘텐츠 만들기");
    expect(links[1]).toHaveTextContent("브랜드 문서 연결");
    expect(links[1]).toHaveAttribute("href", "/studio?setup=brand");
  });

});
