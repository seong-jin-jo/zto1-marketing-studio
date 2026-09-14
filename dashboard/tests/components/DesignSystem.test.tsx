// @vitest-environment jsdom
import "@testing-library/jest-dom/vitest";
import React from "react";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { StatusBadge } from "@/components/shared/Badge";
import { Button } from "@/components/shared/Button";
import { Card } from "@/components/shared/Card";
import { EmptyState } from "@/components/shared/EmptyState";
import { Field } from "@/components/shared/Field";
import { Section } from "@/components/shared/Section";
import { Stack } from "@/components/shared/Stack";
import { StateNotice } from "@/components/shared/StateNotice";

vi.mock("@/lib/constants", () => ({
  CH_STATUS_BADGE: { live: "bg-success text-white" },
  CH_STATUS_LABEL: { live: "Live" },
}));

afterEach(cleanup);

describe("shared design-system components", () => {
  it.each([
    ["primary", "bg-accent"],
    ["secondary", "bg-surface-2"],
    ["danger", "bg-danger"],
  ] as const)("renders the %s button with a 44px target and uncut label contract", (variant, variantClass) => {
    render(<Button variant={variant}>라벨 전체 표시</Button>);

    const button = screen.getByRole("button", { name: "라벨 전체 표시" });
    expect(button).toHaveAttribute("type", "button");
    expect(button).toHaveClass("min-h-control-touch", "ds-touch-target", "ds-label", variantClass);
    expect(button).not.toHaveClass("min-w-max");
    expect(button).not.toHaveClass("truncate", "overflow-hidden");
  });

  it("limits Stack gaps to the v23 scale and supports horizontal scrolling labels", () => {
    render(<Stack direction="horizontal" gap={24} scroll data-testid="stack" />);
    expect(screen.getByTestId("stack")).toHaveClass("flex-row", "gap-stack-section", "overflow-x-auto");
  });

  it("keeps section title, supporting information, and body hierarchy", () => {
    render(<Section title="성과" supplement="보조 정보">본문 설명</Section>);
    expect(screen.getByRole("heading", { level: 2, name: "성과" })).toHaveClass("text-heading");
    expect(screen.getByText("보조 정보")).toHaveClass("text-caption");
    expect(screen.getByText("본문 설명")).toHaveClass("text-body");
  });

  it("associates Field labels and exposes help and error without truncating copy", () => {
    render(
      <Field label="콘텐츠 주제" htmlFor="topic" help="도움말" error="오류 메시지">
        <input id="topic" />
      </Field>,
    );

    expect(screen.getByLabelText("콘텐츠 주제")).toBeInTheDocument();
    expect(screen.getByText("도움말")).toHaveClass("ds-copy");
    expect(screen.getByRole("alert")).toHaveTextContent("오류 메시지");
  });

  it("aligns existing Card, Badge, and EmptyState with the same tokens", () => {
    render(
      <>
        <Card>카드 본문</Card>
        <StatusBadge status="live" />
        <EmptyState message="비어 있음" />
      </>,
    );

    expect(screen.getByText("카드 본문")).toHaveClass("card", "ds-copy");
    expect(screen.getByText("Live")).toHaveClass("text-caption", "ds-label");
    expect(screen.getByText("비어 있음")).toHaveClass("text-body", "ds-copy");
    expect(screen.getByRole("status")).toHaveAttribute("data-state", "empty");
  });

  it("UI-STATE-01 정상 경로: 오류 상태의 공통 행동 단추가 실제 콜백을 호출한다", () => {
    const onRetry = vi.fn();
    render(
      <StateNotice
        tone="error"
        title="불러오지 못했습니다"
        description="잠시 뒤 다시 시도해 주세요"
        actionLabel="다시 시도"
        onAction={onRetry}
      />,
    );

    fireEvent.click(screen.getByRole("button", { name: "다시 시도" }));
    expect(onRetry).toHaveBeenCalledOnce();
    expect(screen.getByRole("alert")).toHaveAttribute("data-state", "error");
  });
});
