import crypto from "node:crypto";
import { generateTextWithUsage, type GeneratedTextResult } from "@/lib/anthropic";
import { withTenant } from "@/lib/db";
import { configPath, readJson } from "@/lib/file-io";
import type { GenerationRequest } from "./contracts";
import type { DerivationKind, DerivationPayload } from "./derivation";
import type { GenerationCandidate } from "./service";
import defaults from "./studio-llm.defaults.json";

type ModelConfig = {
  primary?: unknown;
  fallbacks?: unknown;
};

type OpenClawConfig = {
  agents?: { defaults?: { model?: ModelConfig } };
};

export type StudioLlmFailureReason =
  | "configuration_missing"
  | "provider_unsupported"
  | "approval_required"
  | "quota_exhausted"
  | "timeout"
  | "provider_unavailable"
  | "invalid_output"
  | "usage_ledger_unavailable"
  // 생성기가 고장난 것이 아니라 앞에 줄이 길어 차례가 안 온 것이다. 둘을 같은 말로
  // 알리면 사용자는 고장인 줄 알고 포기하거나 계속 다시 누른다.
  | "queue_busy";

export class StudioLlmExecutionError extends Error {
  /**
   * detail 은 **어느 규칙에서 걸렸는지**다.
   *
   * 2026-09-09 영상 구조 초안이 계속 "콘텐츠 계약에 맞지 않아 저장하지 않았습니다" 로만
   * 끝났다. 이 문장으로는 나조차 무엇이 틀렸는지 알 수 없었다. 계약을 검사하는 자리는
   * 아홉 군데인데 실패는 한 가지 말로만 나왔기 때문이다. 실패가 원인을 안 데리고 나오면
   * 한 번 실패할 때마다 사람이 처음부터 추측해야 한다.
   */
  constructor(
    readonly reason: StudioLlmFailureReason,
    readonly retryable: boolean,
    readonly detail?: string,
  ) {
    super(detail ? `${reason}: ${detail}` : reason);
    this.name = "StudioLlmExecutionError";
  }
}

export type GeneratedCandidateContent = Pick<
  GenerationCandidate,
  "label" | "ordinal" | "angle" | "title" | "rationale"
> & { outline: string[] };

export interface StudioContentGenerator {
  generateCandidates(input: {
    memberId: string;
    request: GenerationRequest;
  }): Promise<GeneratedCandidateContent[]>;
  generateDerivation(input: {
    memberId: string;
    workspaceId: string;
    request: GenerationRequest;
    candidate: GenerationCandidate;
    kind: DerivationKind;
  }): Promise<DerivationPayload>;
}

export type StudioLlmRunner = (input: {
  prompt: string;
  tenantId: string;
  model: string;
  timeoutMs: number;
  maxOutputTokens: number;
}) => Promise<GeneratedTextResult>;

type ResolvedConfig = {
  models: string[];
  maxAttempts: number;
  timeoutMs: number;
  maxOutputTokens: number;
};

function configuredPositiveInt(name: string, fallback: number, min: number, max: number): number {
  const raw = process.env[name];
  if (!raw || !/^\d+$/.test(raw)) return fallback;
  const value = Number(raw);
  return Number.isSafeInteger(value) && value >= min && value <= max ? value : fallback;
}

function stringList(value: unknown): string[] {
  return Array.isArray(value)
    ? value.filter((entry): entry is string => typeof entry === "string" && entry.trim().length > 0).map((entry) => entry.trim())
    : [];
}

function supportedModel(model: string): boolean {
  return !model.includes("/") || model.startsWith("anthropic/") || model.startsWith("claude-cli/");
}

export function resolveStudioLlmConfig(): ResolvedConfig {
  const shared = readJson<OpenClawConfig>(configPath("openclaw.json"));
  const configured = shared?.agents?.defaults?.model;
  const envPrimary = process.env.STUDIO_LLM_MODEL?.trim();
  const envFallbacks = process.env.STUDIO_LLM_FALLBACK_MODELS === undefined
    ? null
    : process.env.STUDIO_LLM_FALLBACK_MODELS.split(",").map((entry) => entry.trim()).filter(Boolean);
  const primary = envPrimary
    || (typeof configured?.primary === "string" ? configured.primary.trim() : "")
    || defaults.primary;
  const sharedFallbacks = stringList(configured?.fallbacks).filter(supportedModel);
  const fallbacks = envFallbacks ?? (sharedFallbacks.length > 0 ? sharedFallbacks : defaults.fallbacks);
  if (!primary) throw new StudioLlmExecutionError("configuration_missing", false);
  if (!supportedModel(primary)) throw new StudioLlmExecutionError("provider_unsupported", false);
  const modelChain = [primary, ...fallbacks.filter(supportedModel)].filter(
    (model, index, all) => all.indexOf(model) === index,
  );
  const maxAttempts = configuredPositiveInt("STUDIO_LLM_MAX_ATTEMPTS", defaults.max_attempts, 1, 3);
  return {
    models: modelChain.slice(0, maxAttempts),
    maxAttempts,
    timeoutMs: configuredPositiveInt("STUDIO_LLM_TIMEOUT_MS", defaults.timeout_ms, 5_000, 120_000),
    maxOutputTokens: configuredPositiveInt("STUDIO_LLM_MAX_OUTPUT_TOKENS", defaults.max_output_tokens, 256, 8_000),
  };
}

function stableValue(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(stableValue);
  if (value !== null && typeof value === "object") {
    return Object.fromEntries(
      Object.entries(value as Record<string, unknown>)
        .sort(([left], [right]) => left.localeCompare(right))
        .map(([key, entry]) => [key, stableValue(entry)]),
    );
  }
  return value;
}

/**
 * 학습 정보를 모델이 읽을 말로 옮긴다. 빈 것은 아예 적지 않는다.
 *
 * 2026-09-09 회장 지시: "학습정보를 잘 받아서 프롬프팅이나 하네스엔지니어링 없이도
 * 최고의 퀄리티를 만들어나가는 것이 우리의 핵심 과제."
 *
 * 종전에는 일곱 칸을 통째로 JSON 으로 붙였다. 두 가지가 품질을 깎는다.
 * ①빈 값이 그대로 들어간다. `"forbiddenPhrases":[]` 는 모델에게 아무것도 안 알려 주면서
 *   자리만 차지한다. 사람이 "금지 표현: (없음)" 이라고 적힌 지시서를 받으면 그 줄을
 *   그냥 넘기지만, 모델에게는 채워진 줄과 똑같은 무게의 입력이다.
 * ②일곱 칸이 평평하게 나열된다. 실제로 결과를 가르는 것은 회원이 직접 채운 목적·대상·
 *   말투·금지 표현인데, 시장 맥락이나 시간대와 같은 줄에 놓이면 그 비중이 묻힌다.
 *
 * 그래서 채워진 것만, 사람이 읽는 순서로 적는다. 값 자체는 하나도 빼지 않는다.
 * 빼는 것은 "비어 있다는 사실" 뿐이다.
 */
function labelledLine(label: string, value: unknown): string | null {
  if (value === null || value === undefined) return null;
  if (typeof value === "string") {
    const trimmed = value.trim();
    return trimmed ? `${label}: ${trimmed}` : null;
  }
  if (Array.isArray(value)) {
    const items = value.map((v) => (typeof v === "string" ? v.trim() : v)).filter(Boolean);
    return items.length ? `${label}: ${items.join(", ")}` : null;
  }
  if (typeof value === "object") {
    const entries = Object.entries(value as Record<string, unknown>)
      .map(([k, v]) => labelledLine(k, v))
      .filter(Boolean);
    return entries.length ? `${label}:\n  - ${entries.join("\n  - ")}` : null;
  }
  return `${label}: ${String(value)}`;
}

export function describeLearningContext(layers: GenerationRequest["learningContext"]): string {
  const lines: (string | null)[] = [
    // 회원이 직접 채운 것을 맨 앞에 둔다. 결과를 가르는 것이 이것이다.
    labelledLine("무엇을 위해 만드는가", layers.u3.purpose),
    labelledLine("누구에게 보여 주는가", layers.u3.audience),
    labelledLine("말투", layers.u3.tone),
    labelledLine("쓰면 안 되는 표현", layers.u3.forbiddenPhrases),
    // 이름을 우선순위 안내와 똑같이 맞춘다.
    //
    // 2026-09-09 실측: 우선순위 안내를 넣었는데도 브랜드 문서 쪽 표현("회사를 손님으로
    // 모십니다")이 계속 나왔다. 안내는 "브랜드 문서" 라고 부르는데 항목 이름은 "이 작업
    // 공간이 사실이라고 확인한 것" 이었다. 모델이 둘을 같은 것으로 잇지 못했다.
    // 게다가 "사실이라고 확인한 것" 은 그 자체로 가장 센 말이라, 3순위로 내리라는 안내와
    // 정면으로 부딪혔다. 이름이 안내를 이긴다.
    labelledLine("이번에 요청한 것", layers.r6),
    // 그다음이 우리가 정한 규칙이다.
    labelledLine("지켜야 할 안전 규칙", layers.s0.safetyRules),
    labelledLine("따라야 할 구조 규칙", layers.x4.structureRules),
    labelledLine("지금까지 승인된 학습 규칙", layers.l5.acceptedRules),
    // 마지막이 배경이다.
    labelledLine("브랜드 문서 (예전에 써 둔 배경)", layers.u3.workspaceFacts),
    labelledLine("시장 맥락", layers.s1.marketContext),
    labelledLine("언어와 접근성", {
      언어: layers.u2.locale,
      시간대: layers.u2.timeZone,
      접근성: layers.u2.accessibilityRequirements,
    }),
  ];
  const body = lines.filter(Boolean).join("\n");
  // 어긋날 때 무엇을 따를지 적는다.
  //
  // 2026-09-09 실사용에서 찾았다. 업종 칸은 "동네 가게" 인데 브랜드 문서 첫 문장이
  // "이 브랜드는 '회사를 손님으로 모시는 곳'입니다" 였다. 만들어진 후보 셋이 모두 동네
  // 가게 이야기를 하면서 회사를 손님으로 모신다고 썼다.
  //
  // 둘 다 사용자가 준 것이지만 성격이 다르다. 여덟 칸은 지금 이 작업을 위해 방금 고른
  // 값이고, 브랜드 문서는 예전에 한 번 써 둔 긴 글이다. 어긋나면 방금 고른 쪽이 맞다.
  // 이 한 줄이 없으면 모델이 어느 쪽을 따를지 매번 달라진다. 사용자는 문서를 고치기
  // 전까지 그 이유를 알 수 없고, 프롬프트를 직접 쓸 줄 알아야 빠져나올 수 있게 된다.
  // 그것이 우리가 없애려는 상황이다.
  return [
    body,
    "",
    "위 항목들이 서로 어긋나면 이 순서로 따르세요.",
    "1. 무엇을 위해·누구에게·말투·쓰면 안 되는 표현 (이 작업을 위해 방금 고른 값)",
    "2. 지켜야 할 안전 규칙과 구조 규칙",
    "3. 브랜드 문서와 시장 맥락 (예전에 써 둔 배경)",
    "특히 업종이나 대상이 브랜드 문서의 서술과 다르면 위 1번을 따르고, 문서 쪽 표현은 그대로 옮겨 쓰지 마세요.",
    "예를 들어 대상이 동네 손님인데 문서에 회사 대상 표현이 있으면, 그 표현을 빼고 대상에 맞게 새로 쓰세요.",
  ].join("\n");
}

export function buildCandidatePrompt(request: GenerationRequest): string {
  const layers = request.learningContext;
  const specs = request.platformSpec?.targets ?? [];
  return [
    "당신은 한국어 콘텐츠 전략가입니다.",
    "아래 학습 정보를 모두 근거로 후보 A, B, C를 만드세요.",
    "세 후보는 제목만 바꾸지 말고 도입, 전개, 사례, 마무리의 뼈대가 서로 달라야 합니다.",
    "A는 problem_first, B는 proof_first, C는 process_first입니다.",
    "각 outline은 실제 내용이 담긴 3개에서 6개의 문장이어야 합니다.",
    "응답은 설명이나 코드 펜스 없이 JSON 객체 하나만 반환하세요.",
    '형식: {"candidates":[{"label":"A","angle":"problem_first","title":"...","rationale":"...","outline":["...","...","..."]},{"label":"B","angle":"proof_first","title":"...","rationale":"...","outline":["...","...","..."]},{"label":"C","angle":"process_first","title":"...","rationale":"...","outline":["...","...","..."]}]}',
    "",
    "## 학습 정보",
    describeLearningContext(layers),
    ...(specs.length ? ["", `요청 시점 채널 규격: ${JSON.stringify(stableValue(specs))}`] : []),
  ].join("\n");
}

function buildDerivationPrompt(
  request: GenerationRequest,
  candidate: GenerationCandidate,
  kind: DerivationKind,
): string {
  const common = [
    "고른 주 갈래 결과를 새 갈래에 맞게 실제 내용으로 개작하세요.",
    "원문의 제목을 반복해 칸만 채우지 말고, 각 문장에 구체적인 메시지를 넣으세요.",
    `주 갈래: ${JSON.stringify({ title: candidate.title, rationale: candidate.rationale, outline: candidate.format.outline })}`,
    "학습 정보:",
    describeLearningContext(request.learningContext),
    "응답은 설명이나 코드 펜스 없이 JSON 객체 하나만 반환하세요.",
  ];
  if (kind === "text") {
    return [...common, '형식: {"body":"완성된 한국어 글 본문"}'].join("\n");
  }
  if (kind === "card") {
    return [...common, '형식: {"slides":[{"text":"표지 문구"},{"text":"본문 문구"},{"text":"마무리 문구"}]}', "슬라이드는 4장 이상 10장 이하로 만드세요."].join("\n");
  }
  return [
    ...common,
    '형식: {"scenes":[{"title":"장면 제목","lines":["화면에 보일 대사","이어지는 대사"]}]}',
    "장면은 3개 이상 8개 이하로 만드세요.",
    "이 단계는 영상 렌더링이 아니라 대본과 장면 구성까지만 만듭니다. 영상 파일 URL을 만들지 마세요.",
  ].join("\n");
}

function jsonObject(text: string): Record<string, unknown> {
  const trimmed = text.trim().replace(/^```(?:json)?\s*/i, "").replace(/\s*```$/, "");
  const start = trimmed.indexOf("{");
  const end = trimmed.lastIndexOf("}");
  // 여는 괄호는 있는데 닫는 괄호가 없으면 대개 길이 상한에 걸려 잘린 것이다.
  if (start >= 0 && end <= start) throw new StudioLlmExecutionError("invalid_output", true, "결과가 중간에 잘렸습니다(길이 상한 의심)");
  if (start < 0 || end <= start) throw new StudioLlmExecutionError("invalid_output", true, "JSON 을 찾지 못했습니다");
  try {
    const value = JSON.parse(trimmed.slice(start, end + 1));
    if (value === null || typeof value !== "object" || Array.isArray(value)) throw new Error("object required");
    return value as Record<string, unknown>;
  } catch {
    throw new StudioLlmExecutionError("invalid_output", true);
  }
}

function requiredText(value: unknown, min: number, max: number, field = "값"): string {
  if (typeof value !== "string") throw new StudioLlmExecutionError("invalid_output", true, `${field}이 글이 아닙니다`);
  const normalized = value.trim();
  if (normalized.length < min || normalized.length > max) {
    throw new StudioLlmExecutionError("invalid_output", true, `${field} 길이가 ${min}~${max}자를 벗어났습니다(${normalized.length}자)`);
  }
  if (/[\u2014\u2013]/.test(normalized)) throw new StudioLlmExecutionError("invalid_output", true, `${field}에 금지한 줄표가 있습니다`);
  return normalized;
}

function requiredTextList(value: unknown, minItems: number, maxItems: number, field = "목록"): string[] {
  if (!Array.isArray(value) || value.length < minItems || value.length > maxItems) {
    const count = Array.isArray(value) ? `${value.length}개` : "목록이 아님";
    throw new StudioLlmExecutionError("invalid_output", true, `${field}이 ${minItems}~${maxItems}개여야 하는데 ${count}입니다`);
  }
  return value.map((entry, index) => requiredText(entry, 3, 300, `${field} ${index + 1}번`));
}

export function parseCandidateOutput(text: string, forbiddenPhrases: readonly string[]): GeneratedCandidateContent[] {
  const raw = jsonObject(text).candidates;
  if (!Array.isArray(raw) || raw.length !== 3) {
    const count = Array.isArray(raw) ? `${raw.length}개` : "후보 목록이 없음";
    throw new StudioLlmExecutionError("invalid_output", true, `후보가 3개여야 하는데 ${count}입니다`);
  }
  const expected = [
    { label: "A" as const, ordinal: 1 as const, angle: "problem_first" as const },
    { label: "B" as const, ordinal: 2 as const, angle: "proof_first" as const },
    { label: "C" as const, ordinal: 3 as const, angle: "process_first" as const },
  ];
  const candidates = expected.map((identity) => {
    const item = raw.find((entry) => entry !== null && typeof entry === "object" && (entry as Record<string, unknown>).label === identity.label);
    if (!item || typeof item !== "object") {
      throw new StudioLlmExecutionError("invalid_output", true, `${identity.label} 후보가 없습니다`);
    }
    const record = item as Record<string, unknown>;
    if (record.angle !== identity.angle) {
      throw new StudioLlmExecutionError("invalid_output", true, `${identity.label} 후보의 관점이 ${identity.angle} 여야 하는데 ${String(record.angle)} 입니다`);
    }
    return {
      ...identity,
      title: requiredText(record.title, 4, 120, `${identity.label} 제목`),
      rationale: requiredText(record.rationale, 20, 500, `${identity.label} 설명`),
      outline: requiredTextList(record.outline, 3, 6, `${identity.label} 이야기 순서`),
    };
  });
  const signatures = candidates.map((candidate) => `${candidate.title}\n${candidate.outline.join("\n")}`.toLocaleLowerCase("ko-KR"));
  if (new Set(signatures).size !== 3 || new Set(candidates.map((candidate) => candidate.outline[0])).size !== 3) {
    throw new StudioLlmExecutionError("invalid_output", true, "세 후보가 서로 충분히 다르지 않습니다");
  }
  const combined = signatures.join("\n");
  const hit = forbiddenPhrases.find((phrase) => phrase.trim() && combined.includes(phrase.trim().toLocaleLowerCase("ko-KR")));
  if (hit) {
    throw new StudioLlmExecutionError("invalid_output", true, `쓰면 안 되는 표현이 들어갔습니다: ${hit.trim()}`);
  }
  return candidates;
}

export function parseDerivationOutput(text: string, kind: DerivationKind): DerivationPayload {
  const value = jsonObject(text);
  if (kind === "text") return { kind, body: requiredText(value.body, 80, 20_000) };
  if (kind === "card") {
    const slides = requiredTextList(
      Array.isArray(value.slides) ? value.slides.map((entry) => (entry as Record<string, unknown>)?.text) : value.slides,
      4,
      10,
    ).map((entry, order) => ({ id: crypto.randomUUID(), order, text: entry, image_url: null as null }));
    return { kind, slides };
  }
  if (!Array.isArray(value.scenes) || value.scenes.length < 3 || value.scenes.length > 8) {
    throw new StudioLlmExecutionError("invalid_output", true);
  }
  const scenes = value.scenes.map((entry, order) => {
    if (entry === null || typeof entry !== "object" || Array.isArray(entry)) {
      throw new StudioLlmExecutionError("invalid_output", true);
    }
    const scene = entry as Record<string, unknown>;
    return {
      id: crypto.randomUUID(),
      order,
      title: requiredText(scene.title, 2, 100),
      lines: requiredTextList(scene.lines, 1, 4).map((line, lineOrder) => ({
        id: crypto.randomUUID(),
        order: lineOrder,
        text: line,
        visible: true as const,
        deleted_at: null,
      })),
    };
  });
  return { kind, asset_url: "pending:render", scenes };
}

function failureReason(error: unknown): StudioLlmFailureReason {
  if (error instanceof StudioLlmExecutionError) return error.reason;
  const name = error instanceof Error ? error.name : "";
  const message = error instanceof Error ? error.message : String(error);
  if (name === "SharedAiApprovalRequiredError") return "approval_required";
  if (name === "SharedGenerationQuotaError") return "quota_exhausted";
  if (name === "SharedCliQueueBusyError") return "queue_busy";
  if (/timeout|aborted/i.test(message)) return "timeout";
  if (/unsupported LLM provider/i.test(message)) return "provider_unsupported";
  return "provider_unavailable";
}

export interface StudioLlmUsageRecorder {
  start(input: { workspaceId: string; memberId: string; operation: string; model: string; attempt: number }): Promise<string>;
  finish(input: {
    workspaceId: string;
    eventId: string;
    status: "succeeded" | "failed";
    memberId: string;
    operation: string;
    model: string;
    attempt: number;
    reason?: StudioLlmFailureReason;
    result?: GeneratedTextResult;
  }): Promise<void>;
}

class StudioLlmUsageLedger implements StudioLlmUsageRecorder {
  async start(input: {
    workspaceId: string;
    memberId: string;
    operation: string;
    model: string;
    attempt: number;
  }): Promise<string> {
    try {
      const [row] = await withTenant(input.workspaceId, (sql) => sql<{ id: string }[]>`
        INSERT INTO usage_events (tenant_id, event_type, quantity, meta)
        VALUES (${input.workspaceId}, 'studioLlmAttempt', 1, ${sql.json({
          status: "started",
          member_id: input.memberId,
          operation: input.operation,
          model: input.model,
          attempt: input.attempt,
        })})
        RETURNING id`);
      if (!row?.id) throw new Error("usage row missing");
      return row.id;
    } catch {
      throw new StudioLlmExecutionError("usage_ledger_unavailable", false);
    }
  }

  async finish(input: {
    workspaceId: string;
    eventId: string;
    status: "succeeded" | "failed";
    memberId: string;
    operation: string;
    model: string;
    attempt: number;
    reason?: StudioLlmFailureReason;
    result?: GeneratedTextResult;
  }): Promise<void> {
    const usage = input.result?.usage;
    try {
      const rows = await withTenant(input.workspaceId, (sql) => sql<{ id: string }[]>`
        UPDATE usage_events
        SET meta = ${sql.json({
          status: input.status,
          member_id: input.memberId,
          operation: input.operation,
          provider: input.result?.provider ?? null,
          model: input.result?.model ?? input.model,
          attempt: input.attempt,
          failure_reason: input.reason ?? null,
          input_tokens: usage?.inputTokens ?? null,
          cache_creation_input_tokens: usage?.cacheCreationInputTokens ?? null,
          cache_read_input_tokens: usage?.cacheReadInputTokens ?? null,
          output_tokens: usage?.outputTokens ?? null,
          total_tokens: usage?.totalTokens ?? null,
          total_cost_usd: usage?.totalCostUsd ?? null,
        })}
        WHERE tenant_id = ${input.workspaceId} AND id = ${input.eventId}
        RETURNING id`);
      if (!rows[0]?.id) throw new Error("usage row missing");
    } catch {
      throw new StudioLlmExecutionError("usage_ledger_unavailable", false);
    }
  }
}

export class LlmStudioContentGenerator implements StudioContentGenerator {
  constructor(
    private readonly runner: StudioLlmRunner = generateTextWithUsage,
    private readonly ledger: StudioLlmUsageRecorder = new StudioLlmUsageLedger(),
  ) {}

  private async execute<T>(input: {
    workspaceId: string;
    memberId: string;
    operation: string;
    prompt: string;
    parse: (text: string) => T;
  }): Promise<T> {
    const config = resolveStudioLlmConfig();
    let lastReason: StudioLlmFailureReason = "provider_unavailable";
    for (const [index, model] of config.models.entries()) {
      const attempt = index + 1;
      const eventId = await this.ledger.start({ ...input, model, attempt });
      let generated: GeneratedTextResult;
      try {
        generated = await this.runner({
          prompt: input.prompt,
          tenantId: input.workspaceId,
          model,
          timeoutMs: config.timeoutMs,
          maxOutputTokens: config.maxOutputTokens,
        });
      } catch (error) {
        lastReason = failureReason(error);
        await this.ledger.finish({ ...input, eventId, model, attempt, status: "failed", reason: lastReason });
        // 줄이 밀린 것은 모델을 바꿔도 같은 줄이다. 보조 모델로 재시도하면 줄만 더 길어진다.
        if (lastReason === "approval_required" || lastReason === "quota_exhausted" || lastReason === "provider_unsupported" || lastReason === "queue_busy") break;
        continue;
      }
      try {
        const parsed = input.parse(generated.text);
        await this.ledger.finish({ ...input, eventId, model, attempt, status: "succeeded", result: generated });
        return parsed;
      } catch (error) {
        lastReason = failureReason(error);
        await this.ledger.finish({ ...input, eventId, model, attempt, status: "failed", reason: lastReason, result: generated });
        if (lastReason === "usage_ledger_unavailable") break;
      }
    }
    throw new StudioLlmExecutionError(lastReason, lastReason === "timeout" || lastReason === "provider_unavailable");
  }

  generateCandidates(input: { memberId: string; request: GenerationRequest }): Promise<GeneratedCandidateContent[]> {
    return this.execute({
      workspaceId: input.request.workspaceId,
      memberId: input.memberId,
      operation: "generation.candidates",
      prompt: buildCandidatePrompt(input.request),
      parse: (text) => parseCandidateOutput(text, input.request.learningContext.u3.forbiddenPhrases),
    });
  }

  generateDerivation(input: {
    memberId: string;
    workspaceId: string;
    request: GenerationRequest;
    candidate: GenerationCandidate;
    kind: DerivationKind;
  }): Promise<DerivationPayload> {
    return this.execute({
      workspaceId: input.workspaceId,
      memberId: input.memberId,
      operation: `generation.derivation.${input.kind}`,
      prompt: buildDerivationPrompt(input.request, input.candidate, input.kind),
      parse: (text) => parseDerivationOutput(text, input.kind),
    });
  }
}
