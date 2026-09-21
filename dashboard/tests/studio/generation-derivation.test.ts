import { beforeEach, describe, expect, it } from "vitest";
import { parseGenerationRequest } from "@/lib/studio/generation/contracts";
import { GenerationService } from "@/lib/studio/generation/service";
import { isStudioApiError } from "@/lib/studio/generation/errors";
import {
  buildDerivationPayload,
  derivationQuote,
  parseDerivationKinds,
  publicBatch,
} from "@/lib/studio/generation/derivation";
import { FIXTURE_STUDIO_CONTENT_GENERATOR, generationRequestFixture } from "./generation-fixture";
import { MemoryDerivationSink, MemoryGenerationRepository } from "./generation-memory-repository";

const WORKSPACES = ["11111111-1111-4111-8111-111111111111"];
const MEMBER = "member-derivation";

function setup(failKinds: string[] = []) {
  const repository = new MemoryGenerationRepository();
  const sink = new MemoryDerivationSink(failKinds);
  return { repository, sink, service: new GenerationService(repository, sink, FIXTURE_STUDIO_CONTENT_GENERATOR) };
}

async function primaryJob(service: GenerationService) {
  const request = parseGenerationRequest(generationRequestFixture());
  return service.create(MEMBER, `create-${crypto.randomUUID()}`, request);
}

function acknowledged(kinds: Parameters<typeof derivationQuote>[0]) {
  const quote = derivationQuote(kinds);
  return { currency: quote.currency, total_minor: quote.totalMinor };
}

beforeEach(() => {
  process.env.STUDIO_COST_CURRENCY = "KRW";
  delete process.env.STUDIO_DERIVATION_COST_TEXT_MINOR;
  delete process.env.STUDIO_DERIVATION_COST_CARD_MINOR;
  delete process.env.STUDIO_DERIVATION_COST_VIDEO_MINOR;
});

describe("파생 생성 도메인 계약", () => {
  it("DRV-01 주 갈래를 확정하면 같이 고른 갈래가 갈래별 작업물로 생긴다", async () => {
    const { service, sink } = setup();
    const job = await primaryJob(service);

    const batch = await service.derive(
      MEMBER,
      job.jobId,
      job.candidates[0].candidateId,
      ["card", "video"],
      acknowledged(["card", "video"]),
      "derive-1",
      WORKSPACES,
    );

    expect(batch.status).toBe("succeeded");
    expect(batch.items.map((item) => item.kind)).toEqual(["card", "video"]);
    // 한 덩어리가 아니라 갈래마다 하나씩 편집실에 들어간다.
    expect(new Set(batch.items.map((item) => item.draftId)).size).toBe(2);
    expect(sink.drafts.size).toBe(2);
  });

  it("DRV-02 파생물은 주 갈래 결과를 재료로 삼되 갈래마다 결과 모양이 다르다", async () => {
    const { service } = setup();
    const job = await primaryJob(service);
    const candidate = { ...job.candidates[0] };

    const text = buildDerivationPayload(candidate, "text");
    const card = buildDerivationPayload(candidate, "card");
    const video = buildDerivationPayload(candidate, "video");

    expect(text.kind === "text" && text.body).toContain(candidate.title);
    expect(card.kind === "card" && card.deck.slides.length).toBe(candidate.format.outline.length + 2);
    expect(card.kind === "card" && card.deck.template).toBe("plain");
    expect(video.kind === "video" && video.scenes.length).toBe(candidate.format.outline.length);
    expect(video.kind === "video" && video.scenes[0].lines.length).toBe(2);
    // 아직 렌더한 파일이 없으므로 없는 주소를 지어내지 않는다.
    expect(video.kind === "video" && video.asset_url).toBe("pending:render");
  });

  it("DRV-03 파생은 무료 재생성 몫을 건드리지 않는다", async () => {
    const { service, repository } = setup();
    const job = await primaryJob(service);

    await service.derive(MEMBER, job.jobId, job.candidates[0].candidateId, ["card", "video"], acknowledged(["card", "video"]), "derive-2", WORKSPACES);

    expect(repository.freeRetryUseCount()).toBe(0);

    // 파생을 쓴 뒤에도 오늘의 무료 재생성은 그대로 남아 있어야 한다.
    for (const candidate of job.candidates) {
      await service.rejectCandidate(MEMBER, job.jobId, candidate.candidateId, WORKSPACES);
    }
    const regenerated = await service.regenerate(MEMBER, job.jobId, WORKSPACES);
    expect(regenerated.freeRetryConsumed).toBe(true);
  });

  it("DRV-04 확정 전에 본 값과 서버 값이 다르면 시작하지 않는다", async () => {
    const { service, sink } = setup();
    const job = await primaryJob(service);

    const attempt = service.derive(
      MEMBER,
      job.jobId,
      job.candidates[0].candidateId,
      ["card", "video"],
      { currency: "KRW", total_minor: 0 },
      "derive-3",
      WORKSPACES,
    );

    await expect(attempt).rejects.toMatchObject({ code: "DERIVATION_QUOTE_CHANGED" });
    expect(sink.drafts.size).toBe(0);
  });

  it("DRV-05 값을 아예 안 보내면 견적과 함께 막는다", async () => {
    const { service } = setup();
    const job = await primaryJob(service);

    await service.derive(MEMBER, job.jobId, job.candidates[0].candidateId, ["card"], undefined, "derive-4", WORKSPACES)
      .then(() => { throw new Error("막지 못했다"); })
      .catch((error: unknown) => {
        expect(isStudioApiError(error) && error.code).toBe("DERIVATION_COST_ACKNOWLEDGEMENT_REQUIRED");
        expect(isStudioApiError(error) && error.details.quote).toBeTruthy();
      });
  });

  it("DRV-06 한 갈래만 실패하면 부분 성공으로 적고 실패한 갈래는 값을 매기지 않는다", async () => {
    const { service, sink } = setup(["card"]);
    const job = await primaryJob(service);

    const batch = await service.derive(
      MEMBER,
      job.jobId,
      job.candidates[0].candidateId,
      ["card", "video"],
      acknowledged(["card", "video"]),
      "derive-5",
      WORKSPACES,
    );

    expect(batch.status).toBe("partially_succeeded");
    const card = batch.items.find((item) => item.kind === "card")!;
    const video = batch.items.find((item) => item.kind === "video")!;
    expect(card.status).toBe("failed");
    expect(card.chargedMinor).toBe(0);
    expect(card.failureReason).toBeTruthy();
    expect(video.status).toBe("succeeded");
    // 실패한 갈래를 성공으로 세지 않는다. 나간 값은 성공한 갈래 몫뿐이다.
    expect(batch.chargedMinor).toBe(video.chargedMinor);
    expect(batch.chargedMinor).toBeLessThan(batch.quotedMinor);
    expect(sink.drafts.size).toBe(1);
  });

  it("DRV-07 전부 실패하면 실패로 적고 값을 매기지 않는다", async () => {
    const { service } = setup(["card", "video"]);
    const job = await primaryJob(service);

    const batch = await service.derive(
      MEMBER,
      job.jobId,
      job.candidates[0].candidateId,
      ["card", "video"],
      acknowledged(["card", "video"]),
      "derive-6",
      WORKSPACES,
    );

    expect(batch.status).toBe("failed");
    expect(batch.chargedMinor).toBe(0);
    expect(publicBatch(batch).cost.free_regeneration_consumed).toBe(false);
  });

  it("DRV-08 같은 Idempotency-Key 로 두 번 눌러도 두 번 청구하지 않는다", async () => {
    const { service, sink } = setup();
    const job = await primaryJob(service);
    const args = [MEMBER, job.jobId, job.candidates[0].candidateId, ["card", "video"] as const, acknowledged(["card", "video"]), "derive-7", WORKSPACES] as const;

    const first = await service.derive(...args);
    const second = await service.derive(...args);

    expect(second.batchId).toBe(first.batchId);
    expect(second.chargedMinor).toBe(first.chargedMinor);
    // 두 번째 호출이 만든 여분 작업물은 남기지 않는다.
    expect(sink.drafts.size).toBe(2);
  });

  it("DRV-09 파생을 버려도 주 갈래 결과는 남는다", async () => {
    const { service, sink } = setup();
    const job = await primaryJob(service);
    const batch = await service.derive(MEMBER, job.jobId, job.candidates[0].candidateId, ["card"], acknowledged(["card"]), "derive-8", WORKSPACES);

    const discarded = await service.discardDerivation(MEMBER, batch.batchId, WORKSPACES);

    expect(discarded.discardedAt).toBeTruthy();
    expect(sink.drafts.size).toBe(0);
    const primary = await service.get(MEMBER, job.jobId, WORKSPACES);
    expect(primary.candidates).toHaveLength(3);
  });

  it("DRV-10 두 번 버려도 같은 결과이고 남의 파생은 못 본다", async () => {
    const { service } = setup();
    const job = await primaryJob(service);
    const batch = await service.derive(MEMBER, job.jobId, job.candidates[0].candidateId, ["card"], acknowledged(["card"]), "derive-9", WORKSPACES);

    const once = await service.discardDerivation(MEMBER, batch.batchId, WORKSPACES);
    const twice = await service.discardDerivation(MEMBER, batch.batchId, WORKSPACES);
    expect(twice.discardedAt).toBe(once.discardedAt);

    await expect(service.getDerivation("다른회원", batch.batchId, WORKSPACES)).rejects.toMatchObject({ code: "RESOURCE_NOT_FOUND" });
  });

  it("DRV-11 만들 수 없는 갈래와 빈 목록을 거른다", () => {
    expect(() => parseDerivationKinds([])).toThrow();
    expect(() => parseDerivationKinds(["음악"])).toThrow();
    expect(parseDerivationKinds(["card", "card", "video"])).toEqual(["card", "video"]);
  });

  it("DRV-12 견적은 갈래 단가의 합이고 환경 설정으로 덮어쓸 수 있다", () => {
    expect(derivationQuote(["card", "video"]).totalMinor).toBe(1500);
    process.env.STUDIO_DERIVATION_COST_CARD_MINOR = "500";
    expect(derivationQuote(["card"]).totalMinor).toBe(500);
  });
});
