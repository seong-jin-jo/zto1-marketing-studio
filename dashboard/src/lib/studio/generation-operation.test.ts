import { describe, expect, it } from "vitest";
import { GenerationOperationGate } from "./generation-operation";

describe("CHAIRMAN-FIX-R3 생성 작업 직렬화", () => {
  it("CHAIRMAN-FIX-R3-07 정상 경로: 첫 작업이 끝날 때까지 두 번째 생성을 거절하고 완료 뒤 다시 연다", () => {
    const gate = new GenerationOperationGate();
    const first = gate.begin();
    expect(first).not.toBeNull();
    expect(gate.begin()).toBeNull();
    expect(gate.finish(first!)).toBe(true);
    expect(gate.begin()).not.toBeNull();
  });

  it("CHAIRMAN-FIX-R3-08 경합 거절: 버리기로 무효화한 늦은 결과는 현재 작업이 아니며 새 작업을 닫지 못한다", () => {
    const gate = new GenerationOperationGate();
    const stale = gate.begin()!;
    gate.invalidate();
    const current = gate.begin()!;
    expect(gate.isCurrent(stale)).toBe(false);
    expect(gate.finish(stale)).toBe(false);
    expect(gate.isCurrent(current)).toBe(true);
  });
});
