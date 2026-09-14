import { db, withTenant } from "@/lib/db";
import type { DerivationBatch, DerivationItem } from "./derivation";
import type {
  PersistDerivationInput,
  PersistedDerivation,
} from "./service";
import type {
  GenerationJob,
  GenerationRepository,
  GenerationResponse,
  PersistCreationInput,
  PersistFreeRegenerationInput,
  PersistedCreation,
  PersistedFreeRegeneration,
  RecordRejectionInput,
} from "./service";
import { StudioApiError } from "./errors";

type Sql = ReturnType<typeof db>;

type GenerationJobRow = {
  id: string;
  tenant_id: string;
  member_id: string;
  status: "succeeded";
  candidates: GenerationJob["candidates"];
  layer_revisions: GenerationJob["layerRevisions"];
  platform_spec_receipt: GenerationJob["platformSpecReceipt"];
  time_zone: string;
  request_payload: GenerationJob["request"];
  created_at: Date | string;
};

type IdempotencyRow = {
  request_hash: string;
  response_payload: GenerationResponse;
};

type PostgresError = Error & { code?: string; constraint_name?: string };

function postgresCode(error: unknown): string | null {
  return error instanceof Error && typeof (error as PostgresError).code === "string"
    ? (error as PostgresError).code ?? null
    : null;
}

export function mapGenerationDatabaseError(error: unknown): StudioApiError {
  const code = postgresCode(error);
  if (
    code === "CONNECT_TIMEOUT"
    || code === "CONNECTION_CLOSED"
    || code === "CONNECTION_DESTROYED"
    || code === "CONNECTION_ENDED"
    || code === "ECONNRESET"
    || code === "ECONNREFUSED"
    || code === "ETIMEDOUT"
    || code === "EPIPE"
  ) {
    return new StudioApiError({
      status: 503,
      code: "GENERATION_DB_UNAVAILABLE",
      message: "생성 저장소 연결이 불안정해 잠시 후 다시 시도해야 합니다",
      retryable: true,
      details: { retry_after_ms: 1500 },
    });
  }
  if (code === "55P03" || code === "40001" || code === "40P01") {
    return new StudioApiError({
      status: 503,
      code: "GENERATION_DB_BUSY",
      message: "생성 요청이 몰려 잠시 후 다시 시도해야 합니다",
      retryable: true,
      details: { retry_after_ms: 1500 },
    });
  }
  if (code === "57014") {
    return new StudioApiError({
      status: 503,
      code: "GENERATION_DB_TIMEOUT",
      message: "생성 저장 시간이 초과되어 잠시 후 다시 시도해야 합니다",
      retryable: true,
      details: { retry_after_ms: 1500 },
    });
  }
  if (code === "42P10") {
    return new StudioApiError({
      status: 500,
      code: "GENERATION_DB_DEPLOYMENT_MISMATCH",
      message: "생성 저장소 배포 상태가 일치하지 않습니다",
    });
  }
  return new StudioApiError({
    status: 500,
    code: "GENERATION_DB_INVARIANT_VIOLATION",
    message: "생성 저장소의 무결성 조건을 확인하지 못했습니다",
  });
}

async function generationTransaction<T>(workspaceId: string, action: (sql: Sql) => Promise<T>): Promise<T> {
  for (let attempt = 1; attempt <= 2; attempt += 1) {
    try {
      return await withTenant(workspaceId, async (sql) => {
        await sql`SET LOCAL statement_timeout = '5000ms'`;
        await sql`SET LOCAL lock_timeout = '1500ms'`;
        return action(sql);
      });
    } catch (error) {
      const code = postgresCode(error);
      if ((code === "40001" || code === "40P01") && attempt < 2) {
        const jitter = 25 + Math.floor(Math.random() * 51);
        await new Promise((resolve) => setTimeout(resolve, jitter));
        continue;
      }
      throw error;
    }
  }
  throw new Error("generation transaction retry loop exhausted");
}

function rowToJob(row: GenerationJobRow): GenerationJob {
  return {
    jobId: row.id,
    memberId: row.member_id,
    workspaceId: row.tenant_id,
    status: row.status,
    candidates: row.candidates,
    layerRevisions: row.layer_revisions,
    platformSpecReceipt: row.platform_spec_receipt,
    timeZone: row.time_zone,
    request: row.request_payload,
    createdAt: row.created_at instanceof Date ? row.created_at.toISOString() : row.created_at,
  };
}

async function insertJob(sql: Sql, job: GenerationJob): Promise<void> {
  const json = (value: unknown) => sql.json(value as Parameters<typeof sql.json>[0]);
  await sql`
    INSERT INTO studio_generation_jobs
      (id, tenant_id, member_id, status, candidates, layer_revisions,
       platform_spec_receipt, time_zone, request_payload, created_at)
    VALUES
      (${job.jobId}, ${job.workspaceId}, ${job.memberId}, ${job.status},
       ${json(job.candidates)}, ${json(job.layerRevisions)},
       ${job.platformSpecReceipt ? json(job.platformSpecReceipt) : null},
       ${job.timeZone}, ${json(job.request)}, ${job.createdAt})`;
}

type DerivationRow = {
  id: string;
  tenant_id: string;
  job_id: string;
  candidate_id: string;
  status: DerivationBatch["status"];
  currency: string;
  quoted_minor: number;
  charged_minor: number;
  items: DerivationItem[];
  created_at: Date | string;
  discarded_at: Date | string | null;
};

function timestamp(value: Date | string | null): string | null {
  if (value === null) return null;
  return value instanceof Date ? value.toISOString() : value;
}

function rowToBatch(row: DerivationRow): DerivationBatch {
  return {
    batchId: row.id,
    jobId: row.job_id,
    candidateId: row.candidate_id,
    status: row.status,
    currency: row.currency,
    quotedMinor: Number(row.quoted_minor),
    chargedMinor: Number(row.charged_minor),
    items: row.items,
    createdAt: timestamp(row.created_at)!,
    discardedAt: timestamp(row.discarded_at),
  };
}

export class PostgresGenerationRepository implements GenerationRepository {
  async findCreation(memberId: string, workspaceId: string, operation: "generation.create", idempotencyKey: string) {
    const [row] = await generationTransaction(workspaceId, (sql) => sql<IdempotencyRow[]>`
      SELECT request_hash, response_payload FROM studio_generation_idempotency
      WHERE tenant_id = ${workspaceId} AND member_id = ${memberId}
        AND operation = ${operation} AND idempotency_key = ${idempotencyKey} LIMIT 1`);
    return row ? { requestHash: row.request_hash, response: row.response_payload } : null;
  }

  async findDerivationByIdempotency(memberId: string, workspaceId: string, idempotencyKey: string) {
    const [row] = await generationTransaction(workspaceId, (sql) => sql<(DerivationRow & { request_hash: string })[]>`
      SELECT id, tenant_id, job_id, candidate_id, status, currency, quoted_minor,
             charged_minor, items, created_at, discarded_at, request_hash
      FROM studio_derivation_batches
      WHERE tenant_id = ${workspaceId} AND member_id = ${memberId}
        AND idempotency_key = ${idempotencyKey} LIMIT 1`);
    return row ? { created: false, requestHash: row.request_hash, batch: rowToBatch(row) } : null;
  }

  async persistDerivation(input: PersistDerivationInput): Promise<PersistedDerivation> {
    const { batch } = input;
    const selectExisting = async (sql: Sql) => {
      const [row] = await sql<(DerivationRow & { request_hash: string })[]>`
        SELECT id, tenant_id, job_id, candidate_id, status, currency, quoted_minor,
               charged_minor, items, created_at, discarded_at, request_hash
        FROM studio_derivation_batches
        WHERE tenant_id = ${input.workspaceId}
          AND member_id = ${input.memberId}
          AND idempotency_key = ${input.idempotencyKey}
        LIMIT 1`;
      return row;
    };
    try {
      return await generationTransaction(input.workspaceId, async (sql) => {
        const existing = await selectExisting(sql);
        if (existing) {
          return { created: false, requestHash: existing.request_hash, batch: rowToBatch(existing) };
        }
        await sql`
          INSERT INTO studio_derivation_batches
            (id, tenant_id, member_id, job_id, candidate_id, idempotency_key, request_hash,
             status, currency, quoted_minor, charged_minor, items, response_payload, created_at)
          VALUES
            (${batch.batchId}, ${input.workspaceId}, ${input.memberId}, ${batch.jobId},
             ${batch.candidateId}, ${input.idempotencyKey}, ${input.requestHash},
             ${batch.status}, ${batch.currency}, ${batch.quotedMinor}, ${batch.chargedMinor},
             ${sql.json(batch.items as Parameters<typeof sql.json>[0])},
             ${sql.json(batch as unknown as Parameters<typeof sql.json>[0])}, ${batch.createdAt})`;
        return { created: true, requestHash: input.requestHash, batch };
      });
    } catch (error) {
      if (postgresCode(error) === "23505") {
        const existing = await generationTransaction(input.workspaceId, selectExisting);
        if (existing) return { created: false, requestHash: existing.request_hash, batch: rowToBatch(existing) };
      }
      throw mapGenerationDatabaseError(error);
    }
  }

  async findDerivation(
    memberId: string,
    batchId: string,
    allowedWorkspaceIds: readonly string[],
  ): Promise<{ batch: DerivationBatch; workspaceId: string } | null> {
    try {
      for (const workspaceId of allowedWorkspaceIds) {
        const [row] = await generationTransaction(workspaceId, (sql) => sql<DerivationRow[]>`
          SELECT id, tenant_id, job_id, candidate_id, status, currency, quoted_minor,
                 charged_minor, items, created_at, discarded_at
          FROM studio_derivation_batches
          WHERE tenant_id = ${workspaceId} AND member_id = ${memberId} AND id = ${batchId}
          LIMIT 1`);
        if (row) return { batch: rowToBatch(row), workspaceId };
      }
      return null;
    } catch (error) {
      throw mapGenerationDatabaseError(error);
    }
  }

  async markDerivationDiscarded(workspaceId: string, batchId: string, at: string): Promise<DerivationBatch | null> {
    try {
      const [row] = await generationTransaction(workspaceId, (sql) => sql<DerivationRow[]>`
        UPDATE studio_derivation_batches
        SET discarded_at = COALESCE(discarded_at, ${at}::timestamptz)
        WHERE tenant_id = ${workspaceId} AND id = ${batchId}
        RETURNING id, tenant_id, job_id, candidate_id, status, currency, quoted_minor,
                  charged_minor, items, created_at, discarded_at`);
      return row ? rowToBatch(row) : null;
    } catch (error) {
      throw mapGenerationDatabaseError(error);
    }
  }

  async persistCreation(input: PersistCreationInput): Promise<PersistedCreation> {
    const selectExisting = async (sql: Sql) => {
      const [existing] = await sql<IdempotencyRow[]>`
          SELECT request_hash, response_payload
          FROM studio_generation_idempotency
          WHERE tenant_id = ${input.job.workspaceId}
            AND member_id = ${input.job.memberId}
            AND operation = ${input.operation}
            AND idempotency_key = ${input.idempotencyKey}
          LIMIT 1`;
      return existing;
    };
    const readExisting = () => generationTransaction(input.job.workspaceId, selectExisting);

    try {
      return await generationTransaction(input.job.workspaceId, async (sql) => {
        const [reserved] = await sql<IdempotencyRow[]>`
          INSERT INTO studio_generation_idempotency
            (tenant_id, member_id, operation, idempotency_key, request_hash, job_id, response_payload)
          VALUES
            (${input.job.workspaceId}, ${input.job.memberId}, ${input.operation},
             ${input.idempotencyKey}, ${input.requestHash}, ${input.job.jobId},
             ${sql.json(input.response as Parameters<typeof sql.json>[0])})
          ON CONFLICT DO NOTHING
          RETURNING request_hash, response_payload`;

        if (!reserved) {
          const existing = await selectExisting(sql);
          if (!existing) {
            return { created: false, requestHash: "", response: input.response };
          }
          return { created: false, requestHash: existing.request_hash, response: existing.response_payload };
        }

        await insertJob(sql, input.job);
        return { created: true, requestHash: input.requestHash, response: input.response };
      });
    } catch (error) {
      if (postgresCode(error) === "23505") {
        const existing = await readExisting();
        if (existing) return { created: false, requestHash: existing.request_hash, response: existing.response_payload };
      }
      throw mapGenerationDatabaseError(error);
    }
  }

  async findJob(memberId: string, jobId: string, allowedWorkspaceIds: readonly string[]): Promise<GenerationJob | null> {
    try {
      for (const workspaceId of allowedWorkspaceIds) {
        const [row] = await generationTransaction(workspaceId, (sql) => sql<GenerationJobRow[]>`
          SELECT id, tenant_id, member_id, status, candidates, layer_revisions,
                 platform_spec_receipt, time_zone, request_payload, created_at
          FROM studio_generation_jobs
          WHERE tenant_id = ${workspaceId} AND member_id = ${memberId} AND id = ${jobId}
          LIMIT 1`);
        if (row) return rowToJob(row);
      }
      return null;
    } catch (error) {
      throw mapGenerationDatabaseError(error);
    }
  }

  async recordCandidateRejection(input: RecordRejectionInput): Promise<{ rejectedCandidateIds: string[] }> {
    try {
      return await generationTransaction(input.workspaceId, async (sql) => {
        await sql`
          INSERT INTO studio_generation_candidate_rejections
            (tenant_id, member_id, job_id, candidate_id)
          VALUES
            (${input.workspaceId}, ${input.memberId}, ${input.jobId}, ${input.candidateId})
          ON CONFLICT (tenant_id, job_id, candidate_id) DO NOTHING`;
        const rows = await sql<{ candidate_id: string }[]>`
          SELECT candidate_id
          FROM studio_generation_candidate_rejections
          WHERE tenant_id = ${input.workspaceId} AND job_id = ${input.jobId}`;
        return { rejectedCandidateIds: rows.map((row) => row.candidate_id) };
      });
    } catch (error) {
      throw mapGenerationDatabaseError(error);
    }
  }

  async persistFreeRegeneration(input: PersistFreeRegenerationInput): Promise<PersistedFreeRegeneration> {
    const selectExisting = async (sql: Sql) => {
      const [existing] = await sql<IdempotencyRow[]>`
          SELECT request_hash, response_payload
          FROM studio_generation_idempotency
          WHERE tenant_id = ${input.replacement.workspaceId}
            AND member_id = ${input.replacement.memberId}
            AND operation = ${input.operation}
            AND idempotency_key = ${input.idempotencyKey}
          LIMIT 1`;
      return existing;
    };
    const readExisting = () => generationTransaction(input.replacement.workspaceId, selectExisting);

    try {
      return await generationTransaction(input.replacement.workspaceId, async (sql) => {
        // 같은 요청의 재송신은 먼저 돌려준다. 아래 거절 검사와 몫 차감은 한 transaction
        // 안에서만 성립하므로, 검사 통과와 차감 사이에 다른 요청이 끼어들 수 없다.
        const replay = await selectExisting(sql);
        if (replay?.request_hash === input.requestHash) {
          return { consumed: true, response: replay.response_payload } as const;
        }

        const rejectedRows = await sql<{ candidate_id: string }[]>`
          SELECT candidate_id
          FROM studio_generation_candidate_rejections
          WHERE tenant_id = ${input.replacement.workspaceId}
            AND job_id = ${input.originalJobId}`;
        const rejected = new Set(rejectedRows.map((row) => row.candidate_id));
        const pendingCandidateIds = input.requiredRejections.filter((id) => !rejected.has(id));
        if (pendingCandidateIds.length > 0) {
          return { consumed: false, response: null, refusal: "candidates_not_rejected", pendingCandidateIds } as const;
        }

        const [reserved] = await sql<{ id: string }[]>`
          INSERT INTO studio_free_regeneration_uses
            (tenant_id, member_id, local_date, original_job_id, replacement_job_id)
          VALUES
            (${input.replacement.workspaceId}, ${input.replacement.memberId}, ${input.localDate},
             ${input.originalJobId}, ${input.replacement.jobId})
          ON CONFLICT DO NOTHING
          RETURNING id`;
        if (!reserved) {
          // 동시 요청이 방금 같은 키로 몫을 잡았을 수 있다. 그 요청이 커밋한 멱등 기록이
          // 보이면 새 몫을 태우지 않고 같은 교체 작업을 재생한다.
          const settled = await selectExisting(sql);
          if (settled?.request_hash === input.requestHash) {
            return { consumed: true, response: settled.response_payload } as const;
          }
          return { consumed: false, response: null, refusal: "quota_exhausted" } as const;
        }

        await sql`
          INSERT INTO studio_generation_idempotency
            (tenant_id, member_id, operation, idempotency_key, request_hash, job_id, response_payload)
          VALUES
            (${input.replacement.workspaceId}, ${input.replacement.memberId}, ${input.operation},
             ${input.idempotencyKey}, ${input.requestHash}, ${input.replacement.jobId},
             ${sql.json(input.response as Parameters<typeof sql.json>[0])})
          ON CONFLICT DO NOTHING`;
        await insertJob(sql, input.replacement);
        return { consumed: true, response: input.response };
      });
    } catch (error) {
      if (postgresCode(error) === "23505") {
        const existing = await readExisting();
        if (existing?.request_hash === input.requestHash) {
          return { consumed: true, response: existing.response_payload };
        }
        return { consumed: false, response: null, refusal: "quota_exhausted" };
      }
      throw mapGenerationDatabaseError(error);
    }
  }
}
