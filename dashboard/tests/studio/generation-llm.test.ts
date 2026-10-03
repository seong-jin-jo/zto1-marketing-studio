import { afterEach, describe, expect, it } from "vitest";
import { parseGenerationRequest } from "@/lib/studio/generation/contracts";
import {
  buildCandidatePrompt,
  LlmStudioContentGenerator,
  StudioLlmExecutionError,
  type StudioContentGenerator,
  type StudioLlmRunner,
  type StudioLlmUsageRecorder,
} from "@/lib/studio/generation/llm";
import { GenerationService } from "@/lib/studio/generation/service";
import { FIXTURE_STUDIO_CONTENT_GENERATOR, generationRequestFixture } from "./generation-fixture";
import { MemoryGenerationRepository } from "./generation-memory-repository";

const MEMBER = "member-llm-contract";

class MemoryUsageRecorder implements StudioLlmUsageRecorder {
  readonly started: { model: string; operation: string }[] = [];
  readonly finished: { status: string; totalTokens: number | null }[] = [];
  async start(input: Parameters<StudioLlmUsageRecorder["start"]>[0]) {
    this.started.push({ model: input.model, operation: input.operation });
    return `event-${this.started.length}`;
  }
  async finish(input: Parameters<StudioLlmUsageRecorder["finish"]>[0]) {
    this.finished.push({ status: input.status, totalTokens: input.result?.usage.totalTokens ?? null });
  }
}

afterEach(() => {
  delete process.env.STUDIO_LLM_MODEL;
  delete process.env.STUDIO_LLM_FALLBACK_MODELS;
  delete process.env.STUDIO_LLM_MAX_ATTEMPTS;
});

describe("Studio 실제 LLM 생성 계약", () => {
  it("LLM-01 정상: 후보 프롬프트가 학습 정보의 값과 채널 규격을 모두 포함한다", () => {
    const request = parseGenerationRequest(generationRequestFixture());
    const prompt = buildCandidatePrompt(request);
    // 2026-09-09: 종전에는 칸 이름(S0·U3 같은 내부 코드)이 프롬프트에 그대로 실렸는지를
    // 검사했다. 그런데 모델에게 필요한 것은 칸 이름이 아니라 **그 안의 값**이다.
    // 내부 코드명을 프롬프트에 싣는 것은 오히려 모델에게 뜻 없는 토큰을 주는 일이다.
    // 이제 사람이 읽는 이름으로 적고 빈 칸은 아예 빼므로, 값이 살아 있는지로 검사한다.
    for (const label of [
      "무엇을 위해 만드는가", "누구에게 보여 주는가",
      "지켜야 할 안전 규칙", "따라야 할 구조 규칙", "지금까지 승인된 학습 규칙",
      "시장 맥락", "언어와 접근성", "이번에 요청한 것",
    ]) {
      expect(prompt, `"${label}" 이 프롬프트에서 사라졌다`).toContain(label);
    }
    expect(prompt).toContain("자동화가 실패했을 때 확인할 세 가지");
    expect(prompt).toContain("vertical-video-primary");
    expect(prompt).toContain("누구에게 보여 주는지와 무엇을 위해 만드는지");
    expect(prompt).toContain("학습정보를 어떻게 적용했는지");
    expect(prompt).toContain("성과 수치, 고객 사례, 사실을 지어내지 마세요");
    // 내부 코드명이 다시 새어 나오면 안 된다.
    expect(prompt).not.toMatch(/^S0 안전 규칙:/m);
  });

  it("LLM-02 정상: 서로 다른 후보 셋과 정확한 token 사용량을 기록한다", async () => {
    const ledger = new MemoryUsageRecorder();
    const runner: StudioLlmRunner = async ({ model }) => ({
      provider: "claude-cli",
      model,
      text: JSON.stringify({ candidates: [
        { label: "A", angle: "problem_first", title: "실패 신호 세 가지", rationale: "오류가 나타나는 순간의 신호를 먼저 분리해 원인을 좁히는 구성입니다.", outline: ["실패 시점을 기록합니다.", "권한 오류를 확인합니다.", "입력값을 다시 검증합니다."] },
        { label: "B", angle: "proof_first", title: "복구 전후 기록 비교", rationale: "실제 실행 기록의 전후 차이를 증거로 보여 주고 해결법을 설명하는 구성입니다.", outline: ["성공 기록을 먼저 보여 줍니다.", "달라진 설정을 비교합니다.", "같은 조건으로 재현합니다."] },
        { label: "C", angle: "process_first", title: "십 분 복구 순서", rationale: "보존, 격리, 재실행 순서로 독자가 그대로 따라 할 수 있게 만든 구성입니다.", outline: ["상태를 보존합니다.", "최소 입력으로 격리합니다.", "수정 뒤 다시 실행합니다."] },
      ] }),
      usage: { inputTokens: 100, cacheCreationInputTokens: 10, cacheReadInputTokens: 20, outputTokens: 30, totalTokens: 160, totalCostUsd: 0.01 },
    });
    const generator = new LlmStudioContentGenerator(runner, ledger);
    const result = await generator.generateCandidates({ memberId: MEMBER, request: parseGenerationRequest(generationRequestFixture()) });
    expect(new Set(result.map((candidate) => candidate.outline[0])).size).toBe(3);
    expect(ledger.finished).toEqual([{ status: "succeeded", totalTokens: 160 }]);
  });

  it("LLM-03 거절: 제공자 실패 시 템플릿 후보를 저장하지 않고 정확한 오류를 반환한다", async () => {
    const repository = new MemoryGenerationRepository();
    const failing: StudioContentGenerator = {
      ...FIXTURE_STUDIO_CONTENT_GENERATOR,
      async generateCandidates() { throw new StudioLlmExecutionError("provider_unavailable", true); },
    };
    const service = new GenerationService(repository, undefined, failing);
    await expect(service.create(MEMBER, "fail-closed", parseGenerationRequest(generationRequestFixture())))
      .rejects.toMatchObject({ code: "STUDIO_LLM_PROVIDER_UNAVAILABLE", retryable: true });
    expect(await repository.findCreation(MEMBER, generationRequestFixture().workspace_id, "generation.create", "fail-closed")).toBeNull();
  });

  it("LLM-04 경계: 모델 fallback과 재시도는 설정한 두 번에서 멈춘다", async () => {
    process.env.STUDIO_LLM_MODEL = "anthropic/primary";
    process.env.STUDIO_LLM_FALLBACK_MODELS = "anthropic/fallback";
    process.env.STUDIO_LLM_MAX_ATTEMPTS = "2";
    const attempts: string[] = [];
    const ledger = new MemoryUsageRecorder();
    const generator = new LlmStudioContentGenerator(async ({ model }) => {
      attempts.push(model);
      throw new Error("provider down");
    }, ledger);
    await expect(generator.generateCandidates({ memberId: MEMBER, request: parseGenerationRequest(generationRequestFixture()) }))
      .rejects.toMatchObject({ reason: "provider_unavailable" });
    expect(attempts).toEqual(["anthropic/primary", "anthropic/fallback"]);
  });
});

// ---------------------------------------------------------------------------
// F3: 카드 덱 계약 v2 프롬프트·파서·output-quality 반려(설계 §5 F3, §11 PR3).
// ---------------------------------------------------------------------------
import { parseDerivationOutput } from "@/lib/studio/generation/llm";
import { validateCardDeck } from "@/lib/studio/card-deck-contract";

const CARD_CANDIDATE = {
  candidateId: "cand-1",
  ordinal: 1 as const,
  label: "A" as const,
  angle: "problem_first" as const,
  title: "수능 D-100 공부법",
  rationale: "실패 신호를 먼저 분류하고 순서대로 확인하는 구성입니다.",
  format: {
    contentBranch: "text_image" as const,
    previewKind: "structured_storyboard" as const,
    quality: "draft" as const,
    outline: ["첫 문단", "둘째 문단", "셋째 문단"],
  },
  estimatedCost: { status: "unavailable" as const, currency: "KRW", minMinor: null, maxMinor: null, assumptions: [] },
  channels: [],
};

/** 모델이 낼 법한 카드 갈래 원문 JSON. hook 문구만 바꿔 재사용한다. */
function rawCardJson(headline: string, hookType: "question" | "number" | "pain", overrides: Record<string, unknown> = {}) {
  const chatSlide = () => ({
    role: "chat",
    bubbles: [
      { speaker: "reader", segments: [{ text: "진짜 그게 될까요?", bold: false }] },
      { speaker: "brand", segments: [{ text: "네, 순서만 지키면 됩니다.", bold: true }] },
    ],
  });
  return JSON.stringify({
    hook_type: hookType,
    cta: { keyword: "순서", comment_example: "순서 알려주세요", save_reason: "다음에 다시 보려고 저장해요" },
    slides: [
      { role: "cover", headline, sub: null },
      chatSlide(), chatSlide(), chatSlide(), chatSlide(), chatSlide(), chatSlide(),
      { role: "comment_prompt", bubbles: [{ speaker: "brand", segments: [{ text: "궁금한 순서를 댓글로 남겨보세요", bold: false }] }] },
      { role: "cta", bubbles: [{ speaker: "brand", segments: [{ text: "댓글에 '순서' 남겨주세요. 다음 글에서 이어 답할게요.", bold: false }] }] },
    ],
    ...overrides,
  });
}

describe("Studio 카드 덱 v2 생성 계약(F3)", () => {
  it("F3-01 정상: auto 훅으로 9장 덱이 계약을 통과한다", () => {
    const text = rawCardJson("안 오르는 건\n순서 때문입니다", "pain");
    const payload = parseDerivationOutput(text, "card", { hookType: "auto" });
    expect(payload.kind).toBe("card");
    if (payload.kind !== "card") throw new Error("unreachable");
    expect(payload.deck.slides).toHaveLength(9);
    expect(payload.deck.slides[0].role).toBe("cover");
    expect(payload.deck.slides[8].role).toBe("cta");
    expect(payload.deck.slides.filter((s) => s.role === "comment_prompt")).toHaveLength(1);
    expect(() => validateCardDeck(payload.deck)).not.toThrow();
  });

  it("F3-02 정상: question·number 훅도 각각 표식과 함께 통과한다", () => {
    const question = parseDerivationOutput(rawCardJson("정말\n순서가\n문제일까요?", "question"), "card", { hookType: "auto" });
    const number = parseDerivationOutput(rawCardJson("12년 300명\n공통점 1가지", "number"), "card", { hookType: "auto" });
    expect(question.kind === "card" && question.deck.hook_type).toBe("question");
    expect(number.kind === "card" && number.deck.hook_type).toBe("number");
  });

  it("F3-03 거절: 고정한 훅과 다른 값을 모델이 내면 invalid_output 으로 반려한다", () => {
    const text = rawCardJson("정말 순서가\n문제일까요?", "question");
    expect(() => parseDerivationOutput(text, "card", { hookType: "pain" }))
      .toThrow(StudioLlmExecutionError);
    try {
      parseDerivationOutput(text, "card", { hookType: "pain" });
    } catch (error) {
      expect(error).toBeInstanceOf(StudioLlmExecutionError);
      expect((error as StudioLlmExecutionError).reason).toBe("invalid_output");
      expect((error as StudioLlmExecutionError).detail).toContain("pain");
    }
  });

  it("F3-04 거절: CTA 장에 댓글 키워드 유도가 없으면 규칙명과 함께 반려한다", () => {
    const bad = JSON.parse(rawCardJson("안 되는 건\n순서 때문입니다", "pain"));
    bad.slides[8] = { role: "cta", bubbles: [{ speaker: "brand", segments: [{ text: "다음에 또 봐요", bold: false }] }] };
    expect(() => parseDerivationOutput(JSON.stringify(bad), "card"))
      .toThrow(/cta_keyword/);
  });

  it("F3-05 거절: 링크·프로필 표현이 CTA 에 있으면 반려한다", () => {
    const bad = JSON.parse(rawCardJson("안 되는 건\n순서 때문입니다", "pain"));
    bad.slides[8] = { role: "cta", bubbles: [{ speaker: "brand", segments: [{ text: "댓글에 '순서' 남기고 프로필 링크도 확인하세요", bold: false }] }] };
    expect(() => parseDerivationOutput(JSON.stringify(bad), "card"))
      .toThrow(/cta_link/);
  });

  it("F3-06 거절: 저장 명분이 6자 미만이면 반려한다", () => {
    const bad = JSON.parse(rawCardJson("안 되는 건\n순서 때문입니다", "pain"));
    bad.cta.save_reason = "짧음";
    expect(() => parseDerivationOutput(JSON.stringify(bad), "card"))
      .toThrow(/cta\.save_reason/);
  });

  it("F3-07 거절: 표지 줄이 상한(3줄·10자)을 넘으면 반려한다", () => {
    const bad = JSON.parse(rawCardJson("안 되는 건\n순서\n때문입니다\n정말로요", "pain"));
    expect(() => parseDerivationOutput(JSON.stringify(bad), "card"))
      .toThrow(/cover_lines/);
  });

  it("F3-08 거절: chat 장에 화자가 한 종류만 있으면 반려한다(계약 규칙 4)", () => {
    const bad = JSON.parse(rawCardJson("안 되는 건\n순서 때문입니다", "pain"));
    bad.slides[1].bubbles = [{ speaker: "brand", segments: [{ text: "혼자 말합니다", bold: false }] }];
    expect(() => parseDerivationOutput(JSON.stringify(bad), "card")).toThrow();
  });

  it("F3-09 거절: 장수가 9장이 아니면 반려한다(계약 범위 7~11, 9장 미만 예시)", () => {
    const bad = JSON.parse(rawCardJson("안 되는 건\n순서 때문입니다", "pain"));
    bad.slides = bad.slides.slice(0, 6);
    expect(() => parseDerivationOutput(JSON.stringify(bad), "card")).toThrow();
  });

  it("F3-10 재시도 체인: invalid_output 은 재시도 가능이고 다음 모델로 넘어간다", async () => {
    process.env.STUDIO_LLM_MODEL = "anthropic/primary";
    process.env.STUDIO_LLM_FALLBACK_MODELS = "anthropic/fallback";
    process.env.STUDIO_LLM_MAX_ATTEMPTS = "2";
    const attempts: string[] = [];
    const generator = new LlmStudioContentGenerator(async ({ model }) => {
      attempts.push(model);
      // 첫 모델은 장수가 모자란 불량 응답, 둘째 모델은 정상 응답.
      const text = attempts.length === 1
        ? JSON.stringify({ hook_type: "pain", cta: {}, slides: [] })
        : rawCardJson("안 되는 건\n순서 때문입니다", "pain");
      return { provider: "claude-cli", model, text, usage: { inputTokens: 10, cacheCreationInputTokens: 0, cacheReadInputTokens: 0, outputTokens: 10, totalTokens: 20, totalCostUsd: 0 } };
    }, new MemoryUsageRecorder());
    const payload = await generator.generateDerivation({
      memberId: MEMBER,
      workspaceId: generationRequestFixture().workspace_id,
      request: parseGenerationRequest(generationRequestFixture()),
      candidate: CARD_CANDIDATE,
      kind: "card",
      cardOptions: { hookType: "auto" },
    });
    expect(attempts).toEqual(["anthropic/primary", "anthropic/fallback"]);
    expect(payload.kind).toBe("card");
  });

  it("F3-11 프롬프트: auto 는 세 공식을 모두 제시하고, 고정하면 그 공식만 지시한다", () => {
    // buildDerivationPrompt 는 export 되지 않으므로 LlmStudioContentGenerator 를 통해
    // 실제로 만들어진 프롬프트를 러너에서 가로채 확인한다.
    const captured: string[] = [];
    const generator = new LlmStudioContentGenerator(async ({ prompt }) => {
      captured.push(prompt);
      return { provider: "claude-cli", model: "anthropic/primary", text: rawCardJson("안 되는 건\n순서 때문입니다", "pain"), usage: { inputTokens: 1, cacheCreationInputTokens: 0, cacheReadInputTokens: 0, outputTokens: 1, totalTokens: 2, totalCostUsd: 0 } };
    }, new MemoryUsageRecorder());
    return generator.generateDerivation({
      memberId: MEMBER,
      workspaceId: generationRequestFixture().workspace_id,
      request: parseGenerationRequest(generationRequestFixture()),
      candidate: CARD_CANDIDATE,
      kind: "card",
      cardOptions: { hookType: "pain" },
    }).then(() => {
      expect(captured[0]).toContain('"hook_type" 값은 정확히 "pain"');
      expect(captured[0]).toContain("cover 1장, chat 6장, comment_prompt 1장, cta 1장");
      expect(captured[0]).not.toContain("question(질문형)");
    });
  });
});

describe("F3 횡단: 글 파생도 같은 자리에서 자로 잰다(런타임 첫 배선)", () => {
  it("TC-F3-08 글 본문에 쓰지 않기로 한 표현이 있으면 invalid_output 으로 반려한다", () => {
    const body = "오늘은 이 방법 하나만 확인해 보세요. 업계 최저가로 모십니다. 나머지는 다음에 다뤄 볼게요. 충분히 길게 채운 문단입니다. 여든 자를 넘기기 위해 문장을 하나 더 보탭니다.";
    expect(() => parseDerivationOutput(JSON.stringify({ body }), "text", undefined, ["최저가"]))
      .toThrow(/forbidden/);
  });

  it("금지 표현이 없으면 그대로 통과한다", () => {
    const body = "오늘은 이 방법 하나만 확인해 보세요. 그리고 나머지는 다음에 다뤄 볼게요. 충분히 길게 채운 문단입니다. 여든 자를 넘기기 위해 문장을 하나 더 보탭니다.";
    const payload = parseDerivationOutput(JSON.stringify({ body }), "text", undefined, ["최저가"]);
    expect(payload.kind === "text" && payload.body).toContain("확인해 보세요");
  });
});
