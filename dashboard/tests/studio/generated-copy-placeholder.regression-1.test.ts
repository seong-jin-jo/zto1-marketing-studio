import { beforeEach, describe, expect, it, vi } from "vitest";
import { containsInstructionPlaceholder } from "@/lib/studio/generated-copy";
import { parseCandidateOutput, StudioLlmExecutionError } from "@/lib/studio/generation/llm";

const H = vi.hoisted(() => ({ prompt: "", output: "" }));

vi.mock("@/lib/tenant-auth", () => ({ effectiveTenantId: vi.fn(async () => "tenant-placeholder") }));
vi.mock("@/lib/wiki-retrieve", () => ({ getWikiContext: vi.fn(async () => ({ text: "", mode: "none", docs: 0 })) }));
vi.mock("@/lib/studio/learned-rules-context", () => ({ getLearnedRulesContext: vi.fn(async () => "") }));
vi.mock("@/lib/github", () => ({ fetchRepoFile: vi.fn() }));
vi.mock("@/lib/anthropic", () => ({
  generateText: vi.fn(async (prompt: string) => { H.prompt = prompt; return H.output; }),
  sharedGenerationQuotaErrorResponse: vi.fn(() => null),
  sharedAiApprovalErrorResponse: vi.fn(() => null),
}));

const completeOutput = (slide: string) => JSON.stringify({
  threads: "오늘 바로 적용할 수 있는 세 가지 순서를 정리했습니다.",
  facebook: "작은 팀도 오늘부터 콘텐츠 순서를 정리할 수 있습니다.",
  x: "콘텐츠 순서를 오늘 정리해 보세요.",
  instagram: { caption: "오늘 할 일을 한 장씩 정리했습니다.", hashtags: ["콘텐츠"], slides: [slide, "한 번에 한 단계씩 시작하세요."] },
  shorts: { hook: "막막함부터 줄여보세요.", body: "할 일을 세 단계로 나눕니다.", cta: "첫 단계부터 적어보세요." },
  image_prompt: "A notebook beside a ceramic cup on a wooden desk, soft morning light.",
});

async function requestStudioText() {
  const { POST } = await import("@/app/api/studio/text/route");
  const response = await POST(new Request("http://localhost/api/studio/text", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ idea: "콘텐츠 운영 순서", tenant_id: "tenant-placeholder" }),
  }));
  return { status: response.status, body: await response.json() as { ok?: boolean; error?: string } };
}

beforeEach(() => {
  vi.resetModules();
  H.prompt = "";
  H.output = completeOutput("막막한 콘텐츠 운영, 순서부터 정리하세요.");
});

describe("GENERATED-PLACEHOLDER-01 생성 문구 자리표시 차단", () => {
  it("GENERATED-PLACEHOLDER-01A 정상: 괄호 속 작성 지시는 자리표시로 판정하고 일반 보충설명은 허용한다", () => {
    expect(containsInstructionPlaceholder("(브랜드가 실제로 제공하는 서비스 한 문장으로 대체)")).toBe(true);
    expect(containsInstructionPlaceholder("(서비스 이름을 직접 입력하세요)")).toBe(true);
    expect(containsInstructionPlaceholder("(담당자가 문구를 작성해 주세요)")).toBe(true);
    expect(containsInstructionPlaceholder("오늘은 온라인으로 진행합니다(서울 외 지역 포함).")).toBe(false);
    expect(containsInstructionPlaceholder("신청서(작성 기준은 홈페이지 참고)")).toBe(false);
    expect(containsInstructionPlaceholder("제품(입력 전압 220V)")).toBe(false);
    expect(containsInstructionPlaceholder("가격(부가세 포함)")).toBe(false);
  });

  it("GENERATED-PLACEHOLDER-01B 거절: 기존 텍스트 생성 응답에 자리표시가 남으면 카드·발행 상태로 승격하지 않는다", async () => {
    H.output = completeOutput("(브랜드가 실제로 제공하는 서비스 한 문장으로 대체)");

    const { status, body } = await requestStudioText();

    expect(status).toBe(200);
    expect(body.ok).toBe(false);
    expect(body.error).toContain("자리표시");
  });

  it("GENERATED-PLACEHOLDER-01C 정상·거절: 프롬프트는 빈 학습 정보 때 일반 문장을 요구하고 새 후보 생성도 같은 자리표시를 거절한다", async () => {
    const { body } = await requestStudioText();
    expect(body.ok).toBe(true);
    expect(H.prompt).toContain("학습 정보가 비어 있으면");
    expect(H.prompt).toContain("완성된 일반 문장");

    const payload = {
      candidates: [
        { label: "A", angle: "problem_first", title: "문제부터 정리하기", rationale: "문제를 먼저 짚고 실행 순서를 안내하는 구성입니다.", outline: ["막힌 지점을 적습니다.", "(서비스 한 문장으로 대체)", "첫 행동을 정합니다."] },
        { label: "B", angle: "proof_first", title: "기록으로 확인하기", rationale: "실행 기록을 먼저 보고 다음 행동을 고르는 구성입니다.", outline: ["기록을 확인합니다.", "차이를 비교합니다.", "다음 순서를 고릅니다."] },
        { label: "C", angle: "process_first", title: "순서대로 실행하기", rationale: "준비부터 확인까지 그대로 따라 하는 구성입니다.", outline: ["준비물을 모읍니다.", "한 단계씩 실행합니다.", "결과를 확인합니다."] },
      ],
    };
    expect(() => parseCandidateOutput(JSON.stringify(payload), [])).toThrowError(StudioLlmExecutionError);
    expect(() => parseCandidateOutput(JSON.stringify(payload), [])).toThrow(/자리표시/);
  });
});
