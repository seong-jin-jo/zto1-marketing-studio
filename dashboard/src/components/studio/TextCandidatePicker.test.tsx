// @vitest-environment jsdom
import "@testing-library/jest-dom/vitest";
import React from "react";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { TextCandidate } from "@/lib/studio/text-candidate-contract";
import { TextCandidatePicker } from "./TextCandidatePicker";

afterEach(() => cleanup());

function candidates(): TextCandidate[] {
  return (["question", "number", "pain"] as const).map((id, index) => ({
    id,
    label: id === "question" ? "질문형" : id === "number" ? "숫자형" : "고통 인식형",
    recommended: index === 0,
    recommendation_reason: "추천 이유",
    content: { threads: `${id} 본문`, facebook: `${id} Facebook`, x: `${id} X`, instagram: { caption: `${id} IG`, hashtags: [], slides: [] } },
    warnings: id === "number" ? [{ code: "fact_mismatch", channel: "threads", message: "원문과 다른 사실: 90일", terms: ["90일"] }] : [],
  }));
}

describe("TextCandidatePicker", () => {
  it("S7-AC1 미리보기만으로 본문을 바꾸지 않고 이 후보로를 눌렀을 때만 선택한다", () => {
    const onSelect = vi.fn();
    render(<TextCandidatePicker candidates={candidates()} onSelect={onSelect} />);
    fireEvent.click(screen.getByRole("tab", { name: /숫자형/ }));
    expect(onSelect).not.toHaveBeenCalled();
    expect(screen.getByText("원문과 다른 사실: 90일")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "이 후보로" }));
    expect(onSelect).toHaveBeenCalledWith(expect.objectContaining({ id: "number" }));
  });

  it("글자 수와 추천 상태를 비교 화면에 유지한다", () => {
    render(<TextCandidatePicker candidates={candidates()} selectedId="question" onSelect={() => {}} />);
    expect(screen.getByText(/Threads 11 \/ 500자/)).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "본문에 적용됨" })).toHaveAttribute("aria-pressed", "true");
  });
});
