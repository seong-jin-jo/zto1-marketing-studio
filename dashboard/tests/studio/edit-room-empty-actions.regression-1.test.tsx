// @vitest-environment jsdom
import "@testing-library/jest-dom/vitest";
import React from "react";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { EditRoom } from "@/components/studio/StudioRooms";

afterEach(() => cleanup());

describe("편집실 빈 상태의 다음 행동", () => {
  it("생성실로 돌아가는 안내 단추를 보여 주고 클릭을 전달한다", () => {
    // Regression: ISSUE-002 — 빈 편집실에서 QA 검증기가 다음 행동을 찾지 못함
    // Found by /qa on 2026-09-12
    // Report: .gstack/qa-reports/qa-report-localhost-2026-09-12.md
    const onOpenCreate = vi.fn();

    render(<EditRoom lines={[]} onLinesChange={vi.fn()} onOpenCreate={onOpenCreate} />);

    expect(screen.getByRole("status")).toHaveTextContent("아직 편집할 작업물이 없습니다");
    const action = screen.getByRole("button", { name: "생성실에서 작업물 고르기" });
    expect(action).toBeVisible();

    fireEvent.click(action);
    expect(onOpenCreate).toHaveBeenCalledTimes(1);
  });
});
