import crypto from "node:crypto";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import postgres from "postgres";
import { parseShortsFactoryRequest } from "@/lib/studio/shorts-factory/contracts";
import { PostgresShortsFactoryRepository } from "@/lib/studio/shorts-factory/repository";
import { ShortsFactoryService } from "@/lib/studio/shorts-factory/service";
import { GenerationService } from "@/lib/studio/generation/service";
import { PostgresGenerationRepository } from "@/lib/studio/generation/repository";
import { getDatabaseUrl } from "../isolation/_env";
import { FIXTURE_STUDIO_CONTENT_GENERATOR, generationRequestFixture } from "./generation-fixture";

type Sql = ReturnType<typeof postgres>;

let admin: Sql | null = null;
let firstTenantId = "";
let secondTenantId = "";
const members: string[] = [];

function factoryBody(workspaceId: string, invalidIndex?: number) {
  const source = generationRequestFixture();
  return {
    workspace_id: workspaceId,
    concurrency_limit: 4,
    concepts: Array.from({ length: 8 }, (_, index) => {
      const config = structuredClone(source) as unknown as Record<string, unknown>;
      delete config.workspace_id;
      const layers = config.learning_context as Record<string, Record<string, unknown>>;
      layers.r6.topic = `DB 컨셉 ${index + 1}`;
      if (invalidIndex === index) layers.u3.purpose = "";
      return { concept_id: `db_concept_${index + 1}`, name: `DB 컨셉 ${index + 1}`, config };
    }),
  };
}

async function liveDatabase(ctx: { skip: () => void }): Promise<boolean> {
  if (admin) return true;
  const url = getDatabaseUrl();
  if (!url) {
    if (process.env.CI) throw new Error("CI requires DATABASE_URL for shorts factory DB integration");
    ctx.skip();
    return false;
  }
  process.env.DATABASE_URL = url;
  admin = postgres(url, { max: 5, idle_timeout: 5, connect_timeout: 8, onnotice: () => {} });
  firstTenantId = crypto.randomUUID();
  secondTenantId = crypto.randomUUID();
  await admin`
    INSERT INTO tenants (id, slug, name, status)
    VALUES
      (${firstTenantId}, ${`factory-db-${firstTenantId}`}, 'Factory DB tenant A', 'active'),
      (${secondTenantId}, ${`factory-db-${secondTenantId}`}, 'Factory DB tenant B', 'active')`;
  return true;
}

beforeAll(() => {
  admin = null;
  firstTenantId = "";
  secondTenantId = "";
});

afterAll(async () => {
  if (!admin) return;
  if (members.length > 0) {
    await admin`DELETE FROM shorts_factory_runs WHERE member_id = ANY(${members}::text[])`;
    await admin`DELETE FROM studio_generation_jobs WHERE member_id = ANY(${members}::text[])`;
  }
  if (firstTenantId && secondTenantId) {
    await admin`DELETE FROM tenants WHERE id IN (${firstTenantId}, ${secondTenantId})`;
  }
  await admin.end({ timeout: 5 });
});

describe("숏폼 공장 Postgres 격리와 경합 계약", () => {
  it("FACTORY-DB-01 한국어 설명: 한 컨셉 실패는 실제 DB에서 일곱 성공과 분리되고 다른 작업 공간에는 보이지 않는다", async (ctx) => {
    if (!await liveDatabase(ctx)) return;
    const memberId = `factory-db-${crypto.randomUUID()}`;
    members.push(memberId);
    const factoryRepository = new PostgresShortsFactoryRepository();
    const generation = new GenerationService(new PostgresGenerationRepository(), undefined, FIXTURE_STUDIO_CONTENT_GENERATOR);
    const service = new ShortsFactoryService(
      factoryRepository,
      async ({ memberId: owner, idempotencyKey, request }) => generation.create(owner, idempotencyKey, request),
    );

    const result = await service.start(
      memberId,
      "factory-db-failure-isolation",
      parseShortsFactoryRequest(factoryBody(firstTenantId, 2)),
    );

    expect(result.run.status).toBe("partial");
    expect(result.run.succeededConcepts).toBe(7);
    expect(result.run.failedConcepts).toBe(1);
    expect(result.run.concepts[2]).toEqual(expect.objectContaining({
      status: "failed",
      errorCode: "LEARNING_CONTEXT_INCOMPLETE",
      studioJobId: null,
    }));
    expect(await factoryRepository.findRun(memberId, result.run.runId, [secondTenantId])).toBeNull();

    const [counts] = await admin!<{ concepts: number; jobs: number }[]>`
      SELECT
        (SELECT count(*)::int FROM shorts_factory_concept_runs WHERE tenant_id = ${firstTenantId}) AS concepts,
        (SELECT count(*)::int FROM studio_generation_jobs WHERE tenant_id = ${firstTenantId} AND member_id = ${memberId}) AS jobs`;
    expect(counts).toEqual({ concepts: 8, jobs: 7 });
  // 실제 PostgreSQL에 8개 컨셉과 7개 생성 작업을 기록하므로 전체 스위트 병렬 부하에서도
  // 기본 5초 제한이 다음 테스트의 활성 실행 정리까지 끊지 않도록 DB 예산을 둔다.
  }, 30_000);

  it("FACTORY-DB-02 한국어 설명: 같은 작업 공간의 실행 중 공장 둘째는 거절하고 다른 작업 공간은 독립 실행한다", async (ctx) => {
    if (!await liveDatabase(ctx)) return;
    const memberId = `factory-active-${crypto.randomUUID()}`;
    members.push(memberId);
    const repository = new PostgresShortsFactoryRepository();
    const first = parseShortsFactoryRequest(factoryBody(firstTenantId));
    const second = parseShortsFactoryRequest(factoryBody(secondTenantId));

    await repository.createRun({
      workspaceId: first.workspaceId, memberId, idempotencyKey: "active-a", requestHash: "a".repeat(64),
      concurrencyLimit: first.concurrencyLimit, staleAfterMs: 15 * 60 * 1000, concepts: first.concepts,
    });
    await expect(repository.createRun({
      workspaceId: first.workspaceId, memberId, idempotencyKey: "active-b", requestHash: "b".repeat(64),
      concurrencyLimit: first.concurrencyLimit, staleAfterMs: 15 * 60 * 1000, concepts: first.concepts,
    })).rejects.toEqual(expect.objectContaining({ code: "FACTORY_RUN_ALREADY_ACTIVE", status: 409 }));

    const other = await repository.createRun({
      workspaceId: second.workspaceId, memberId, idempotencyKey: "active-other-workspace", requestHash: "c".repeat(64),
      concurrencyLimit: second.concurrencyLimit, staleAfterMs: 15 * 60 * 1000, concepts: second.concepts,
    });
    expect(other.run.workspaceId).toBe(secondTenantId);
    await repository.forceFailRun(firstTenantId, (await repository.listRuns(memberId, firstTenantId))[0].runId);
    await repository.forceFailRun(secondTenantId, other.run.runId);
  });

  it("C1-FACTORY-DB-03 한국어 설명: 마지막 진행 신호가 만료된 실행을 회수한 뒤 새 실행을 허용한다", async (ctx) => {
    if (!await liveDatabase(ctx)) return;
    const memberId = `factory-stale-${crypto.randomUUID()}`;
    members.push(memberId);
    const repository = new PostgresShortsFactoryRepository();
    const request = parseShortsFactoryRequest(factoryBody(firstTenantId));
    const dead = await repository.createRun({
      workspaceId: firstTenantId,
      memberId,
      idempotencyKey: "stale-run",
      requestHash: "d".repeat(64),
      concurrencyLimit: request.concurrencyLimit,
      staleAfterMs: 1000,
      concepts: request.concepts,
    });
    await repository.markRunRunning(firstTenantId, dead.run.runId, crypto.randomUUID());
    await admin!`
      UPDATE shorts_factory_runs
      SET updated_at = now() - interval '2 seconds'
      WHERE tenant_id = ${firstTenantId} AND id = ${dead.run.runId}`;

    const replacement = await repository.createRun({
      workspaceId: firstTenantId,
      memberId,
      idempotencyKey: "replacement-run",
      requestHash: "e".repeat(64),
      concurrencyLimit: request.concurrencyLimit,
      staleAfterMs: 1000,
      concepts: request.concepts,
    });

    expect(replacement.created).toBe(true);
    const [oldRun] = await admin!<{ status: string; failed: number }[]>`
      SELECT status, failed_concepts::int AS failed
      FROM shorts_factory_runs
      WHERE tenant_id = ${firstTenantId} AND id = ${dead.run.runId}`;
    expect(oldRun).toEqual({ status: "failed", failed: 8 });
    await repository.forceFailRun(firstTenantId, replacement.run.runId);
  });

  it("C1-FACTORY-DB-05 보존: 강제 종료된 실행은 옛 표를 든 worker 의 마감으로 되살아나지 않는다", async (ctx) => {
    if (!await liveDatabase(ctx)) return;
    const memberId = `factory-fence-${crypto.randomUUID()}`;
    members.push(memberId);
    const repository = new PostgresShortsFactoryRepository();
    const request = parseShortsFactoryRequest(factoryBody(firstTenantId));
    const run = await repository.createRun({
      workspaceId: firstTenantId,
      memberId,
      idempotencyKey: "fence-run",
      requestHash: "9".repeat(64),
      concurrencyLimit: request.concurrencyLimit,
      staleAfterMs: 15 * 60 * 1000,
      concepts: request.concepts,
    });
    const staleToken = crypto.randomUUID();
    expect(await repository.markRunRunning(firstTenantId, run.run.runId, staleToken)).toBe(true);

    await repository.forceFailRun(firstTenantId, run.run.runId);

    // 강제 종료 뒤에는 옛 표의 진행 신호도, 컨셉 기록도, 마감도 통하지 않아야 한다.
    expect(await repository.touchRun(firstTenantId, run.run.runId, staleToken)).toBe(false);
    expect(await repository.markConceptSucceeded(
      firstTenantId, run.run.runId, request.concepts[0].conceptId, crypto.randomUUID(), staleToken,
    )).toBe(false);
    const afterFinalize = await repository.finalizeRun(firstTenantId, run.run.runId, staleToken);
    expect(afterFinalize.status).toBe("failed");
    const [row] = await admin!<{ status: string }[]>`
      SELECT status FROM shorts_factory_runs
      WHERE tenant_id = ${firstTenantId} AND id = ${run.run.runId}`;
    expect(row.status).toBe("failed");
  });

  it("C1-FACTORY-DB-04 한국어 설명: 운영자 강제 종료는 활성 실행과 남은 컨셉을 실패로 닫는다", async (ctx) => {
    if (!await liveDatabase(ctx)) return;
    const memberId = `factory-force-${crypto.randomUUID()}`;
    members.push(memberId);
    const repository = new PostgresShortsFactoryRepository();
    const request = parseShortsFactoryRequest(factoryBody(firstTenantId));
    const active = await repository.createRun({
      workspaceId: firstTenantId,
      memberId,
      idempotencyKey: "force-run",
      requestHash: "f".repeat(64),
      concurrencyLimit: request.concurrencyLimit,
      staleAfterMs: 15 * 60 * 1000,
      concepts: request.concepts,
    });
    await repository.markRunRunning(firstTenantId, active.run.runId, crypto.randomUUID());

    const stopped = await repository.forceFailRun(firstTenantId, active.run.runId);

    expect(stopped.status).toBe("failed");
    expect(stopped.failedConcepts).toBe(8);
    expect(stopped.concepts.every((concept) => concept.status === "failed" && concept.errorCode === "FACTORY_RUN_FORCE_STOPPED")).toBe(true);
  });
});
