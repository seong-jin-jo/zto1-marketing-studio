import { describe, expect, it } from "vitest";
import { parseCandidateOutput, StudioLlmExecutionError } from "@/lib/studio/generation/llm";

// 2026-09-09 영상 구조 초안이 계속 "콘텐츠 계약에 맞지 않아 저장하지 않았습니다" 로만
// 끝났다. 이 문장으로는 나조차 무엇이 틀렸는지 알 수 없었다. 계약을 검사하는 자리는 아홉
// 군데인데 실패는 한 가지 말로만 나왔기 때문이다. 실패가 원인을 안 데리고 나오면 한 번
// 실패할 때마다 사람이 처음부터 추측해야 하고, 그 추측 시간이 곧 고장 시간이다.
const candidate = (label: string, angle: string, title: string) => ({
  label, angle, title,
  rationale: `${label} 후보를 이렇게 잡은 이유를 스무 자 이상 적어 둔 설명입니다.`,
  outline: [`${label} 첫 장면`, `${label} 둘째 장면`, `${label} 셋째 장면`],
});
const ok = () => ({
  candidates: [
    candidate("A", "problem_first", "가 제목"),
    candidate("B", "proof_first", "나 제목"),
    candidate("C", "process_first", "다 제목"),
  ],
});
const detailOf = (text: string, forbidden: string[] = []) => {
  try {
    parseCandidateOutput(text, forbidden);
    return null;
  } catch (error) {
    return error instanceof StudioLlmExecutionError ? error.detail : String(error);
  }
};

describe("계약 위반은 어느 규칙에서 걸렸는지 말한다", () => {
  it("정상 결과는 통과한다", () => {
    expect(parseCandidateOutput(JSON.stringify(ok()), [])).toHaveLength(3);
  });

  it("후보 수가 다르면 몇 개인지 말한다", () => {
    const body = ok(); body.candidates.pop();
    expect(detailOf(JSON.stringify(body))).toContain("후보가 3개여야");
  });

  it("금지 표현은 어느 표현인지 말한다", () => {
    expect(detailOf(JSON.stringify(ok()), ["가 제목"])).toContain("가 제목");
  });

  it("세 후보가 같으면 그렇게 말한다", () => {
    const body = { candidates: [
      candidate("A", "problem_first", "같은 제목"),
      candidate("B", "proof_first", "같은 제목"),
      candidate("C", "process_first", "같은 제목"),
    ] };
    body.candidates.forEach((c) => { c.outline = ["같은 첫 장면", "같은 둘째 장면", "같은 셋째 장면"]; });
    expect(detailOf(JSON.stringify(body))).toContain("서로 충분히 다르지");
  });

  it("잘린 결과는 길이 상한을 의심하라고 말한다", () => {
    expect(detailOf('{"candidates": [{"label": "A"')).toContain("잘렸");
  });

  it("길이를 벗어나면 몇 자인지 말한다", () => {
    const body = ok(); body.candidates[0].title = "가";
    expect(detailOf(JSON.stringify(body))).toContain("길이가");
  });
});
