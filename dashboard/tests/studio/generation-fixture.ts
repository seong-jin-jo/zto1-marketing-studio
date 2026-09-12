import crypto from "node:crypto";
import generationRequest from "./generation-request.fixture.json";
import type { StudioContentGenerator } from "@/lib/studio/generation/llm";

export const STUDIO_TEST_WORKSPACE_ID = generationRequest.workspace_id;

export const FIXTURE_STUDIO_CONTENT_GENERATOR: StudioContentGenerator = {
  async generateCandidates({ request }) {
    const topic = request.learningContext.r6.topic;
    return [
      { label: "A", ordinal: 1, angle: "problem_first", title: `${topic}, 실패 신호부터 찾기`, rationale: "사용자가 겪는 오류의 징후를 먼저 특정하고 원인별 확인 순서를 제시합니다.", outline: ["반복 실패를 알리는 신호를 먼저 분류합니다.", "권한과 입력값, 실행 기록을 차례로 확인합니다.", "같은 실패를 막는 점검표로 마무리합니다."] },
      { label: "B", ordinal: 2, angle: "proof_first", title: `${topic}, 복구 기록으로 검증하기`, rationale: "실제 복구 전후의 차이를 증거로 보여 준 뒤 재현 가능한 점검법을 설명합니다.", outline: ["복구 전후 실행 기록의 차이를 먼저 보여 줍니다.", "차이를 만든 설정 한 가지를 분리해 설명합니다.", "독자가 자기 기록으로 검증할 방법을 안내합니다."] },
      { label: "C", ordinal: 3, angle: "process_first", title: `${topic}, 삼 단계 복구 절차`, rationale: "진단부터 재실행까지 시간 순서로 따라 할 수 있는 작업 절차를 제공합니다.", outline: ["현재 상태를 보존하고 실패 시점을 기록합니다.", "가장 작은 입력으로 원인을 격리합니다.", "수정 뒤 같은 조건에서 다시 실행해 확인합니다."] },
    ];
  },
  async generateDerivation({ candidate, kind }) {
    if (kind === "text") return { kind, body: `${candidate.title}\n\n${candidate.rationale}\n\n${candidate.format.outline.join("\n\n")}\n\n마지막으로 같은 조건에서 다시 실행해 결과를 기록합니다.` };
    if (kind === "card") return { kind, slides: [candidate.title, ...candidate.format.outline].map((text, order) => ({ id: crypto.randomUUID(), order, text, image_url: null })) };
    return { kind, asset_url: "pending:render", scenes: candidate.format.outline.map((text, order) => ({ id: crypto.randomUUID(), order, title: `${order + 1}번 장면`, lines: [{ id: crypto.randomUUID(), order: 0, text, visible: true, deleted_at: null }] })) };
  },
};

export function generationRequestFixture() {
  // 요청 본문의 정본은 generation-request.fixture.json 하나다.
  // 종전에는 이 파일의 객체 리터럴을 node 검증기가 정규식으로 오려내 eval 했다.
  // 리터럴 모양이 조금만 달라져도 검증기는 네트워크 요청 전에 SyntaxError 로 죽었고,
  // 그 상태에서 QA 문서에는 PASS 가 적혔다(2026-09-12 코드리뷰 MAJOR).
  // 두 쪽이 같은 JSON 을 읽으면 파싱이라는 단계 자체가 사라진다.
  return structuredClone(generationRequest) as typeof generationRequest;
}
