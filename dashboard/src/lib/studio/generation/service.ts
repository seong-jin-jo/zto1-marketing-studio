import crypto from "node:crypto";
import type { GenerationRequest, RequestedTarget } from "./contracts";
import { StudioApiError } from "./errors";
import { StudioLlmExecutionError, type StudioContentGenerator } from "./llm";
import {
  assertAcknowledgedCost,
  batchStatus,
  DerivationBuildError,
  derivationQuote,
  derivationSummary,
  derivationUnitMinor,
  type DerivationBatch,
  type DerivationItem,
  type DerivationKind,
  type DerivationPayload,
} from "./derivation";

export type CostEstimate = {
  status: "quoted" | "unavailable";
  currency: string;
  minMinor: number | null;
  maxMinor: number | null;
  assumptions: string[];
};

export type GenerationCandidate = {
  candidateId: string;
  ordinal: 1 | 2 | 3;
  label: "A" | "B" | "C";
  angle: "problem_first" | "proof_first" | "process_first";
  title: string;
  rationale: string;
  format: {
    contentBranch: "text_image" | "video";
    previewKind: "structured_storyboard";
    quality: "draft";
    outline: string[];
  };
  estimatedCost: CostEstimate;
  channels: RequestedTarget[];
};

export type GenerationJob = {
  jobId: string;
  memberId: string;
  workspaceId: string;
  status: "succeeded";
  candidates: GenerationCandidate[];
  layerRevisions: Record<"s0" | "s1" | "u2" | "u3" | "x4" | "l5", number>;
  platformSpecReceipt: null | { reference: string; version: string; digest: string };
  timeZone: string;
  request: GenerationRequest;
  createdAt: string;
};

export type GenerationResponse = Omit<GenerationJob, "memberId" | "request" | "timeZone"> & {
  regeneration: {
    freeRetriesPerDay: 1;
    scope: "member";
    timeZone: string;
  };
};

export type IdempotencyRecord = {
  requestHash: string;
  response: GenerationResponse;
};

export type PersistCreationInput = {
  job: GenerationJob;
  operation: "generation.create";
  idempotencyKey: string;
  requestHash: string;
  response: GenerationResponse;
};

export type PersistedCreation = IdempotencyRecord & { created: boolean };

// 무료 재생성이 나가지 않은 사유를 호출부가 구분할 수 있어야 한다.
// quota_exhausted 는 오늘 몫을 이미 쓴 것이고, candidates_not_rejected 는 후보 셋을
// 다 거절하지 않은 것이다(요구 대장 R27). 둘을 뭉뚱그리면 안내가 거짓말이 된다.
export type FreeRegenerationRefusal = "quota_exhausted" | "candidates_not_rejected";
export type PersistedFreeRegeneration =
  | { consumed: true; response: GenerationResponse; refusal?: undefined; pendingCandidateIds?: undefined }
  | { consumed: false; response: null; refusal: FreeRegenerationRefusal; pendingCandidateIds?: string[] };

export type PersistFreeRegenerationInput = {
  originalJobId: string;
  replacement: GenerationJob;
  localDate: string;
  operation: "generation.regenerate";
  idempotencyKey: string;
  requestHash: string;
  response: GenerationResponse;
  // 이 작업의 후보 전체. 저장소는 몫 차감과 같은 transaction 안에서
  // 이 후보들이 모두 거절 장부에 있는지 확인한다.
  requiredRejections: readonly string[];
};

export type RecordRejectionInput = {
  workspaceId: string;
  memberId: string;
  jobId: string;
  candidateId: string;
};

export type PersistDerivationInput = {
  batch: DerivationBatch;
  memberId: string;
  workspaceId: string;
  idempotencyKey: string;
  requestHash: string;
};

export type PersistedDerivation = {
  created: boolean;
  requestHash: string;
  batch: DerivationBatch;
};

// 파생물 하나를 편집실 작업물로 만든다. 갈래마다 따로 부르므로 한 갈래가 실패해도
// 나머지 갈래는 그대로 남는다. 뭉쳐서 만들면 하나 실패에 전부 날아간다.
export interface DerivationDraftSink {
  createDraft(input: {
    workspaceId: string;
    summary: string;
    jobId: string;
    candidateId: string;
    payload: DerivationPayload;
  }): Promise<{ draftId: string; handoffId: string }>;
  deleteDrafts(workspaceId: string, draftIds: readonly string[]): Promise<void>;
}

export interface GenerationRepository {
  findCreation(memberId: string, workspaceId: string, operation: "generation.create", idempotencyKey: string): Promise<IdempotencyRecord | null>;
  findDerivationByIdempotency(memberId: string, workspaceId: string, idempotencyKey: string): Promise<PersistedDerivation | null>;
  persistCreation(input: PersistCreationInput): Promise<PersistedCreation>;
  findJob(memberId: string, jobId: string, allowedWorkspaceIds: readonly string[]): Promise<GenerationJob | null>;
  recordCandidateRejection(input: RecordRejectionInput): Promise<{ rejectedCandidateIds: string[] }>;
  persistFreeRegeneration(input: PersistFreeRegenerationInput): Promise<PersistedFreeRegeneration>;
  persistDerivation(input: PersistDerivationInput): Promise<PersistedDerivation>;
  findDerivation(
    memberId: string,
    batchId: string,
    allowedWorkspaceIds: readonly string[],
  ): Promise<{ batch: DerivationBatch; workspaceId: string } | null>;
  markDerivationDiscarded(workspaceId: string, batchId: string, at: string): Promise<DerivationBatch | null>;
}

function stableJson(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(stableJson).join(",")}]`;
  if (value !== null && typeof value === "object") {
    return `{${Object.entries(value as Record<string, unknown>)
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([key, entry]) => `${JSON.stringify(key)}:${stableJson(entry)}`)
      .join(",")}}`;
  }
  return JSON.stringify(value);
}

function hashRequest(value: unknown): string {
  return crypto.createHash("sha256").update(stableJson(value)).digest("hex");
}

function dateInZone(now: Date, timeZone: string): string {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(now);
  const values = Object.fromEntries(parts.map((part) => [part.type, part.value]));
  return `${values.year}-${values.month}-${values.day}`;
}

function quotaDate(now: Date): string {
  return dateInZone(now, "UTC");
}

// 몫 키가 협정시 날짜이므로 복구 안내도 협정시 자정이어야 한다.
// 원본 작업의 시간대 자정을 알리면 서울 23:30 사용자에게 "00:00 복구"라고 말하고
// 실제로는 09:00 까지 잠기는 거짓 안내가 된다.
// 몫 키를 클라이언트 시간대로 만들지 않는 이유는 시간대를 바꿔가며 하루 몫을
// 두세 번 받는 우회를 막기 위해서다(scripts/verify-free-quota-timezone-attack.mjs).
function nextQuotaBoundary(now: Date): string {
  const next = Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate() + 1);
  return new Date(next).toISOString();
}

function envPositiveInt(name: string): number | null {
  const raw = process.env[name];
  if (!raw || !/^\d+$/.test(raw)) return null;
  const parsed = Number(raw);
  return Number.isSafeInteger(parsed) && parsed > 0 ? parsed : null;
}

function configuredCostEstimate(): CostEstimate {
  const minMinor = envPositiveInt("STUDIO_PREVIEW_COST_MIN_MINOR");
  const maxMinor = envPositiveInt("STUDIO_PREVIEW_COST_MAX_MINOR");
  if (minMinor === null || maxMinor === null || minMinor > maxMinor) {
    return {
      status: "unavailable",
      currency: process.env.STUDIO_COST_CURRENCY || "KRW",
      minMinor: null,
      maxMinor: null,
      assumptions: ["비용 견적 어댑터가 설정되지 않았습니다"],
    };
  }
  return {
    status: "quoted",
    currency: process.env.STUDIO_COST_CURRENCY || "KRW",
    minMinor,
    maxMinor,
    assumptions: ["후보 한 장의 draft 생성 기준", "외부 공급자 최종 응답 전 예상값"],
  };
}

function requestedTargets(request: GenerationRequest): RequestedTarget[] {
  return request.platformSpec?.targets ?? [{
    targetId: "studio_original",
    format: request.learningContext.u3.contentBranch === "video" ? "source_video" : "source_asset",
    aspectRatio: null,
    maxDurationSeconds: null,
  }];
}

async function buildCandidates(
  memberId: string,
  request: GenerationRequest,
  contentGenerator: StudioContentGenerator,
): Promise<GenerationCandidate[]> {
  const { contentBranch } = request.learningContext.u3;
  const cost = configuredCostEstimate();
  const channels = requestedTargets(request);
  const specs = await contentGenerator.generateCandidates({ memberId, request });
  return specs.map((spec) => ({
    candidateId: crypto.randomUUID(),
    ordinal: spec.ordinal,
    label: spec.label,
    angle: spec.angle,
    title: spec.title,
    rationale: spec.rationale,
    format: { contentBranch, previewKind: "structured_storyboard", quality: "draft", outline: spec.outline },
    estimatedCost: cost,
    channels,
  }));
}

function publicResponse(job: GenerationJob): GenerationResponse {
  const { memberId: _memberId, request: _request, timeZone, ...visible } = job;
  return {
    ...visible,
    regeneration: { freeRetriesPerDay: 1, scope: "member", timeZone },
  };
}

async function buildJob(
  memberId: string,
  request: GenerationRequest,
  now: Date,
  contentGenerator: StudioContentGenerator,
): Promise<GenerationJob> {
  const context = request.learningContext;
  return {
    jobId: crypto.randomUUID(),
    memberId,
    workspaceId: request.workspaceId,
    status: "succeeded",
    candidates: await buildCandidates(memberId, request, contentGenerator),
    layerRevisions: {
      s0: context.s0.revision,
      s1: context.s1.revision,
      u2: context.u2.revision,
      u3: context.u3.revision,
      x4: context.x4.revision,
      l5: context.l5.revision,
    },
    platformSpecReceipt: request.platformSpec ? {
      reference: request.platformSpec.reference,
      version: request.platformSpec.version,
      digest: request.platformSpec.digest,
    } : null,
    timeZone: context.u2.timeZone,
    request: {
      ...request,
      platformSpec: request.platformSpec ? { ...request.platformSpec, body: {} } : null,
    },
    createdAt: now.toISOString(),
  };
}

function llmFailure(error: StudioLlmExecutionError): StudioApiError {
  const messages: Record<StudioLlmExecutionError["reason"], string> = {
    configuration_missing: "콘텐츠 생성 모델 설정이 없어 생성을 시작하지 못했습니다",
    provider_unsupported: "현재 설정한 콘텐츠 생성 제공자는 이 실행 경로에서 지원하지 않습니다",
    approval_required: "공유 AI 사용 승인이 없어 생성을 시작하지 못했습니다",
    quota_exhausted: "이번 달 공유 AI 생성 한도를 모두 사용했습니다",
    timeout: "AI 생성 엔진의 응답 시간이 초과되었습니다",
    provider_unavailable: "AI 생성 엔진이 응답하지 않았습니다",
    invalid_output: "AI 생성 결과가 콘텐츠 계약에 맞지 않아 저장하지 않았습니다",
    usage_ledger_unavailable: "AI 사용량 기록을 남길 수 없어 생성을 시작하지 않았습니다",
    queue_busy: "지금 다른 생성이 밀려 있어 차례를 기다리다 멈췄습니다. 잠시 후 다시 시도해 주세요",
  };
  const statuses: Record<StudioLlmExecutionError["reason"], number> = {
    configuration_missing: 503,
    provider_unsupported: 503,
    approval_required: 403,
    quota_exhausted: 429,
    timeout: 504,
    provider_unavailable: 503,
    invalid_output: 502,
    usage_ledger_unavailable: 503,
    queue_busy: 503,
  };
  return new StudioApiError({
    status: statuses[error.reason],
    code: `STUDIO_LLM_${error.reason.toUpperCase()}`,
    message: messages[error.reason],
    retryable: error.retryable,
    details: { reason: error.reason },
  });
}

function derivationFailureReason(error: unknown): string {
  if (!(error instanceof StudioLlmExecutionError)) return "편집실 작업물을 저장하지 못했습니다";
  return llmFailure(error).message;
}

function candidatesNotRejected(pending: readonly string[]): StudioApiError {
  return new StudioApiError({
    status: 409,
    code: "CANDIDATES_NOT_REJECTED",
    message: "후보 세 장을 모두 거절해야 무료 재생성을 쓸 수 있습니다",
    details: { pending_candidate_ids: [...pending] },
  });
}

function paidRegenerationApprovalRequired(now: Date): StudioApiError {
  return new StudioApiError({
    status: 409,
    code: "PAID_REGENERATION_APPROVAL_REQUIRED",
    message: "오늘의 무료 재생성을 이미 사용했습니다",
    details: {
      free_retry_resets_at: nextQuotaBoundary(now),
      paid_retry_quote: envPositiveInt("STUDIO_PAID_REGENERATION_MINOR") === null ? null : {
        currency: process.env.STUDIO_COST_CURRENCY || "KRW",
        amount_minor: envPositiveInt("STUDIO_PAID_REGENERATION_MINOR"),
      },
    },
  });
}

export class GenerationService {
  constructor(
    private readonly repository: GenerationRepository,
    private readonly derivationSink?: DerivationDraftSink,
    private readonly contentGenerator?: StudioContentGenerator,
  ) {}

  private generator(): StudioContentGenerator {
    if (!this.contentGenerator) {
      throw llmFailure(new StudioLlmExecutionError("configuration_missing", false));
    }
    return this.contentGenerator;
  }

  private sink(): DerivationDraftSink {
    if (!this.derivationSink) {
      throw new StudioApiError({
        status: 500,
        code: "DERIVATION_SINK_MISSING",
        message: "파생물을 편집실에 넣을 통로가 설정되지 않았습니다",
      });
    }
    return this.derivationSink;
  }

  async create(memberId: string, idempotencyKey: string, request: GenerationRequest, now = new Date()): Promise<GenerationResponse> {
    if (!idempotencyKey || idempotencyKey.length > 255) {
      throw new StudioApiError({
        status: 400,
        code: "IDEMPOTENCY_KEY_REQUIRED",
        message: "Idempotency-Key 머리말이 필요합니다",
      });
    }
    const requestHash = hashRequest(request);
    const existing = await this.repository.findCreation(memberId, request.workspaceId, "generation.create", idempotencyKey);
    if (existing) {
      if (existing.requestHash !== requestHash) {
        throw new StudioApiError({ status: 409, code: "IDEMPOTENCY_CONFLICT", message: "같은 Idempotency-Key에 다른 요청 본문을 보낼 수 없습니다" });
      }
      return existing.response;
    }
    let job: GenerationJob;
    try {
      job = await buildJob(memberId, request, now, this.generator());
    } catch (error) {
      if (error instanceof StudioLlmExecutionError) throw llmFailure(error);
      throw error;
    }
    const response = publicResponse(job);
    const persisted = await this.repository.persistCreation({
      job,
      operation: "generation.create",
      idempotencyKey,
      requestHash,
      response,
    });
    if (persisted.requestHash !== requestHash) {
      throw new StudioApiError({
        status: 409,
        code: "IDEMPOTENCY_CONFLICT",
        message: "같은 Idempotency-Key에 다른 요청 본문을 보낼 수 없습니다",
      });
    }
    return persisted.response;
  }

  async get(memberId: string, jobId: string, allowedWorkspaceIds: readonly string[]): Promise<GenerationResponse> {
    const job = await this.repository.findJob(memberId, jobId, allowedWorkspaceIds);
    if (!job) {
      throw new StudioApiError({ status: 404, code: "RESOURCE_NOT_FOUND", message: "생성 작업을 찾을 수 없습니다" });
    }
    return publicResponse(job);
  }

  // 후보 한 장 거절을 서버 장부에 남긴다. 무료 재생성 판정의 유일한 근거다.
  async rejectCandidate(
    memberId: string,
    jobId: string,
    candidateId: string,
    allowedWorkspaceIds: readonly string[],
  ): Promise<{ jobId: string; rejectedCandidateIds: string[]; pendingCandidateIds: string[]; allRejected: boolean }> {
    const job = await this.repository.findJob(memberId, jobId, allowedWorkspaceIds);
    if (!job) {
      throw new StudioApiError({ status: 404, code: "RESOURCE_NOT_FOUND", message: "생성 작업을 찾을 수 없습니다" });
    }
    if (!job.candidates.some((candidate) => candidate.candidateId === candidateId)) {
      throw new StudioApiError({ status: 404, code: "RESOURCE_NOT_FOUND", message: "이 작업의 후보가 아닙니다" });
    }
    const { rejectedCandidateIds } = await this.repository.recordCandidateRejection({
      workspaceId: job.workspaceId,
      memberId,
      jobId,
      candidateId,
    });
    const rejected = new Set(rejectedCandidateIds);
    const pendingCandidateIds = job.candidates
      .map((candidate) => candidate.candidateId)
      .filter((id) => !rejected.has(id));
    return {
      jobId,
      rejectedCandidateIds,
      pendingCandidateIds,
      allRejected: pendingCandidateIds.length === 0,
    };
  }

  // 주 갈래를 확정하면서 같이 고른 갈래로 옮겨 만든다.
  // 돈에 대한 규율 셋을 여기서 지킨다.
  //   ① 무료 재생성 몫을 건드리지 않는다. 이 함수는 persistFreeRegeneration 을 부르지 않는다.
  //   ② 확정 화면에서 본 값과 서버 값이 다르면 시작하지 않는다(assertAcknowledgedCost).
  //   ③ 실패한 갈래는 값을 매기지 않는다. charged 는 성공한 갈래 단가의 합이다.
  async derive(
    memberId: string,
    jobId: string,
    candidateId: string,
    kinds: readonly DerivationKind[],
    acknowledgedCost: unknown,
    idempotencyKey: string,
    allowedWorkspaceIds: readonly string[],
    now = new Date(),
  ): Promise<DerivationBatch> {
    if (!idempotencyKey || idempotencyKey.length > 255) {
      throw new StudioApiError({
        status: 400,
        code: "IDEMPOTENCY_KEY_REQUIRED",
        message: "Idempotency-Key 머리말이 필요합니다",
      });
    }
    const job = await this.repository.findJob(memberId, jobId, allowedWorkspaceIds);
    if (!job) {
      throw new StudioApiError({ status: 404, code: "RESOURCE_NOT_FOUND", message: "생성 작업을 찾을 수 없습니다" });
    }
    const candidate = job.candidates.find((entry) => entry.candidateId === candidateId);
    if (!candidate) {
      throw new StudioApiError({ status: 404, code: "RESOURCE_NOT_FOUND", message: "이 작업의 후보가 아닙니다" });
    }
    const quote = derivationQuote(kinds);
    assertAcknowledgedCost(quote, acknowledgedCost);

    const requestHash = hashRequest({ jobId, candidateId, kinds: [...kinds].sort() });
    const existing = await this.repository.findDerivationByIdempotency(memberId, job.workspaceId, idempotencyKey);
    if (existing) {
      if (existing.requestHash !== requestHash) {
        throw new StudioApiError({ status: 409, code: "IDEMPOTENCY_CONFLICT", message: "같은 Idempotency-Key에 다른 요청 본문을 보낼 수 없습니다" });
      }
      return existing.batch;
    }
    const items: DerivationItem[] = [];
    for (const kind of kinds) {
      const summary = derivationSummary(candidate, kind);
      try {
        const payload = await this.generator().generateDerivation({
          memberId,
          workspaceId: job.workspaceId,
          request: job.request,
          candidate,
          kind,
        });
        const saved = await this.sink().createDraft({
          workspaceId: job.workspaceId,
          summary,
          jobId,
          candidateId,
          payload,
        });
        items.push({
          kind,
          status: "succeeded",
          draftId: saved.draftId,
          handoffId: saved.handoffId,
          summary,
          chargedMinor: derivationUnitMinor(kind),
          failureReason: null,
        });
      } catch (error) {
        // 한 갈래가 실패해도 나머지를 계속 만든다. 실패는 실패로 적는다.
        items.push({
          kind,
          status: "failed",
          draftId: null,
          handoffId: null,
          summary,
          chargedMinor: 0,
          failureReason: error instanceof DerivationBuildError ? error.message : derivationFailureReason(error),
        });
      }
    }

    const batch: DerivationBatch = {
      batchId: crypto.randomUUID(),
      jobId,
      candidateId,
      status: batchStatus(items),
      currency: quote.currency,
      quotedMinor: quote.totalMinor,
      chargedMinor: items.reduce((sum, item) => sum + item.chargedMinor, 0),
      items,
      createdAt: now.toISOString(),
      discardedAt: null,
    };

    const persisted = await this.repository.persistDerivation({
      batch,
      memberId,
      workspaceId: job.workspaceId,
      idempotencyKey,
      requestHash,
    });
    if (!persisted.created) {
      if (persisted.requestHash !== requestHash) {
        throw new StudioApiError({
          status: 409,
          code: "IDEMPOTENCY_CONFLICT",
          message: "같은 Idempotency-Key에 다른 요청 본문을 보낼 수 없습니다",
        });
      }
      // 이미 만든 것이 있으면 이번에 만든 작업물은 버린다. 두 번 청구하지 않는다.
      const orphans = batch.items.map((item) => item.draftId).filter((id): id is string => id !== null);
      if (orphans.length > 0) await this.sink().deleteDrafts(job.workspaceId, orphans);
    }
    return persisted.batch;
  }

  async getDerivation(memberId: string, batchId: string, allowedWorkspaceIds: readonly string[]): Promise<DerivationBatch> {
    const found = await this.repository.findDerivation(memberId, batchId, allowedWorkspaceIds);
    if (!found) {
      throw new StudioApiError({ status: 404, code: "RESOURCE_NOT_FOUND", message: "파생 작업을 찾을 수 없습니다" });
    }
    return found.batch;
  }

  // 파생을 안 쓰기로 하면 버린다. 주 갈래 결과(생성 작업과 후보)는 건드리지 않는다.
  async discardDerivation(
    memberId: string,
    batchId: string,
    allowedWorkspaceIds: readonly string[],
    now = new Date(),
  ): Promise<DerivationBatch> {
    const found = await this.repository.findDerivation(memberId, batchId, allowedWorkspaceIds);
    if (!found) {
      throw new StudioApiError({ status: 404, code: "RESOURCE_NOT_FOUND", message: "파생 작업을 찾을 수 없습니다" });
    }
    if (found.batch.discardedAt) return found.batch;
    const draftIds = found.batch.items.map((item) => item.draftId).filter((id): id is string => id !== null);
    if (draftIds.length > 0) await this.sink().deleteDrafts(found.workspaceId, draftIds);
    const updated = await this.repository.markDerivationDiscarded(found.workspaceId, batchId, now.toISOString());
    return updated ?? { ...found.batch, discardedAt: now.toISOString() };
  }

  async regenerate(memberId: string, jobId: string, allowedWorkspaceIds: readonly string[], now = new Date()): Promise<{
    freeRetryConsumed: true;
    replacement: GenerationResponse;
    freeRetryResetsAt: string;
  }> {
    const original = await this.repository.findJob(memberId, jobId, allowedWorkspaceIds);
    if (!original) {
      throw new StudioApiError({ status: 404, code: "RESOURCE_NOT_FOUND", message: "생성 작업을 찾을 수 없습니다" });
    }
    const requiredRejections = original.candidates.map((candidate) => candidate.candidateId);
    const localDate = quotaDate(now);
    const idempotencyKey = `free-regeneration:${jobId}:${localDate}`;
    let replacementJob: GenerationJob;
    try {
      replacementJob = await buildJob(memberId, original.request, now, this.generator());
    } catch (error) {
      if (error instanceof StudioLlmExecutionError) throw llmFailure(error);
      throw error;
    }
    const replacement = publicResponse(replacementJob);
    const persisted = await this.repository.persistFreeRegeneration({
      originalJobId: jobId,
      replacement: replacementJob,
      localDate,
      operation: "generation.regenerate",
      idempotencyKey,
      requestHash: hashRequest(original.request),
      response: replacement,
      requiredRejections,
    });
    if (!persisted.consumed) {
      if (persisted.refusal === "candidates_not_rejected") {
        throw candidatesNotRejected(persisted.pendingCandidateIds ?? requiredRejections);
      }
      throw paidRegenerationApprovalRequired(now);
    }
    return {
      freeRetryConsumed: true,
      replacement: persisted.response,
      freeRetryResetsAt: nextQuotaBoundary(now),
    };
  }
}
