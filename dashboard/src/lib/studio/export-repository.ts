import crypto from "node:crypto";
import { db, withTenant } from "@/lib/db";
import { CardDeckV3ValidationError, type CardDeckV3 } from "./card-element-contract";
import { VideoEditValidationError } from "./video-edit-contract";
import {
  ExportQueueError,
  type ClaimedExportItem,
  type CreateExportInput,
  type ExportItemRecord,
  type ExportJobRecord,
  type ExportKind,
  type RetryExportInput,
} from "./export-contract";
import { cardDeckExportSource, cardSlideSourceHash, firstEmptySlide, videoExportSource, VideoExportSourceError, type VideoExportSource } from "./export-source-hash";

type Sql = ReturnType<typeof db>;

interface CardDraftSource {
  deck: CardDeckV3;
  sourceHash: string;
  sourceRevision: number;
}
type DraftSource = CardDraftSource | VideoExportSource;

export interface PublishExportReceipt {
  exportId: string;
  sourceHash: string;
  kind: ExportKind;
  artifactKeys: string[];
}

interface PublishExportSnapshot {
  receipt: PublishExportReceipt;
  draftPayload: Record<string, unknown>;
}

function number(value: unknown): number {
  return Number(value ?? 0);
}

function isIdempotencyUniqueViolation(error: unknown): boolean {
  if (!error || typeof error !== "object") return false;
  const candidate = error as { code?: unknown; constraint_name?: unknown };
  return candidate.code === "23505"
    && candidate.constraint_name === "studio_export_jobs_tenant_id_member_id_kind_idempotency_key_key";
}

function mapItem(row: Record<string, unknown>): ExportItemRecord {
  return {
    item_key: String(row.item_key),
    ordinal: number(row.ordinal),
    status: row.status as ExportItemRecord["status"],
    attempt_count: number(row.attempt_count),
    artifact_key: row.artifact_key ? String(row.artifact_key) : null,
    error_code: row.error_code ? String(row.error_code) : null,
  };
}

function mapJob(row: Record<string, unknown>, items: ExportItemRecord[]): ExportJobRecord {
  return {
    id: String(row.id),
    draft_id: String(row.draft_id),
    kind: row.kind as ExportJobRecord["kind"],
    status: row.status as ExportJobRecord["status"],
    source_revision: number(row.source_revision),
    source_hash: String(row.source_hash),
    total_items: number(row.total_items),
    succeeded_items: number(row.succeeded_items),
    failed_items: number(row.failed_items),
    created_at: row.created_at as Date | string,
    updated_at: row.updated_at as Date | string,
    finished_at: row.finished_at as Date | string | null,
    items,
  };
}

function sourceFromDraft(row: { payload?: unknown } | undefined, kind: ExportKind, tenantId: string): DraftSource {
  if (!row) throw new ExportQueueError(404, "DRAFT_NOT_FOUND", "초안을 찾을 수 없습니다");
  const payload = row.payload && typeof row.payload === "object" ? row.payload as Record<string, unknown> : {};
  try {
    return kind === "video" ? videoExportSource(payload, tenantId) : cardDeckExportSource(payload.cardDeckV3);
  } catch (error) {
    if (error instanceof VideoExportSourceError) {
      throw new ExportQueueError(error.code === "SUBTITLE_INPUT_ALREADY_BAKED" ? 409 : 400, error.code, error.message);
    }
    if (error instanceof CardDeckV3ValidationError && error.code === "CARD_DECK_TOO_LARGE") {
      throw new ExportQueueError(413, error.code, error.message);
    }
    if (error instanceof VideoEditValidationError) {
      throw new ExportQueueError(400, "INVALID_VIDEO_EDIT", "영상 편집 데이터가 올바르지 않습니다");
    }
    throw new ExportQueueError(400, "INVALID_EXPORT_REQUEST", "내보낼 카드 덱이 올바르지 않습니다");
  }
}

async function loadJob(tx: Sql, tenantId: string, draftId: string, exportId: string): Promise<ExportJobRecord | null> {
  const [row] = await tx<Record<string, unknown>[]>`
    SELECT id,draft_id,kind,status,source_revision,source_hash,total_items,succeeded_items,failed_items,
           created_at,updated_at,finished_at
    FROM studio_export_jobs
    WHERE tenant_id=${tenantId} AND draft_id=${draftId} AND id=${exportId}`;
  if (!row) return null;
  const items = await tx<Record<string, unknown>[]>`
    SELECT item_key,ordinal,status,attempt_count,artifact_key,error_code
    FROM studio_export_items
    WHERE tenant_id=${tenantId} AND job_id=${exportId}
    ORDER BY ordinal`;
  return mapJob(row, items.map(mapItem));
}

async function aggregateJob(tx: Sql, tenantId: string, jobId: string): Promise<void> {
  await tx`
    WITH counts AS (
      SELECT
        count(*) FILTER (WHERE status='succeeded')::smallint AS succeeded,
        count(*) FILTER (WHERE status='failed')::smallint AS failed,
        count(*) FILTER (WHERE status='processing') AS processing,
        count(*) FILTER (WHERE status='queued') AS queued
      FROM studio_export_items
      WHERE tenant_id=${tenantId} AND job_id=${jobId}
    )
    UPDATE studio_export_jobs AS job
    SET succeeded_items=counts.succeeded,
        failed_items=counts.failed,
        status=CASE
          WHEN counts.succeeded=job.total_items THEN 'succeeded'
          WHEN counts.failed > 0 AND counts.succeeded + counts.failed=job.total_items
            THEN CASE WHEN counts.succeeded > 0 THEN 'partially_failed' ELSE 'failed' END
          WHEN counts.processing > 0 THEN 'processing'
          ELSE 'queued'
        END,
        started_at=CASE WHEN counts.processing > 0 THEN COALESCE(job.started_at,now()) ELSE job.started_at END,
        finished_at=CASE WHEN counts.succeeded + counts.failed=job.total_items THEN now() ELSE NULL END,
        updated_at=now()
    FROM counts
    WHERE job.tenant_id=${tenantId} AND job.id=${jobId}`;
}

export class PostgresExportRepository {
  async create(
    tenantId: string,
    draftId: string,
    memberId: string,
    idempotencyKey: string,
    requestHash: string,
    input: CreateExportInput,
  ): Promise<{ job: ExportJobRecord; reused: boolean }> {
    try {
      return await withTenant(tenantId, async (tx) => {
      const [draft] = await tx<{ payload: unknown }[]>`
        SELECT payload FROM drafts WHERE tenant_id=${tenantId} AND id=${draftId} FOR UPDATE`;
      const source = sourceFromDraft(draft, input.kind, tenantId);
      const [existing] = await tx<Record<string, unknown>[]>`
        SELECT id,request_hash FROM studio_export_jobs
        WHERE tenant_id=${tenantId} AND member_id=${memberId} AND kind=${input.kind}
          AND idempotency_key=${idempotencyKey}`;
      if (existing) {
        if (String(existing.request_hash) !== requestHash) {
          throw new ExportQueueError(409, "IDEMPOTENCY_KEY_REUSED", "같은 Idempotency-Key가 다른 요청에 사용됐습니다");
        }
        const reused = await loadJob(tx, tenantId, draftId, String(existing.id));
        if (!reused) throw new ExportQueueError(409, "IDEMPOTENCY_KEY_REUSED", "Idempotency-Key가 다른 초안에 사용됐습니다");
        return { job: reused, reused: true };
      }
      if (source.sourceRevision !== input.expected_source_revision) {
        throw new ExportQueueError(409, "REVISION_CONFLICT", "초안 revision이 변경됐습니다");
      }
      if (source.sourceHash !== input.expected_source_hash) {
        throw new ExportQueueError(409, "SOURCE_HASH_CONFLICT", "초안 내용 hash가 변경됐습니다");
      }
      const empty = "deck" in source ? firstEmptySlide(source.deck) : null;
      if (empty) throw new ExportQueueError(409, "EMPTY_SLIDE", "빈 장은 내보낼 수 없습니다", { first_empty_slide: empty });
      const [active] = await tx<{ id: string }[]>`
        SELECT id FROM studio_export_jobs
        WHERE tenant_id=${tenantId} AND draft_id=${draftId} AND kind=${input.kind}
          AND status IN ('queued','processing')
        ORDER BY created_at DESC LIMIT 1`;
      if (active) {
        throw new ExportQueueError(429, "EXPORT_ALREADY_ACTIVE", "이 초안의 내보내기가 이미 진행 중입니다", {
          export_id: active.id,
        });
      }
      const jobId = crypto.randomUUID();
      await tx`
        INSERT INTO studio_export_jobs
          (id,tenant_id,draft_id,member_id,kind,status,source_revision,source_hash,request_payload,
           idempotency_key,request_hash,total_items)
        VALUES
          (${jobId},${tenantId},${draftId},${memberId},${input.kind},'queued',${source.sourceRevision},
           ${source.sourceHash},${tx.json(("deck" in source ? { deck: source.deck } : { video: { sourceFilename: source.sourceFilename, edit: source.edit, lines: source.lines, subtitleSize: source.subtitleSize } }) as unknown as Parameters<typeof tx.json>[0])},${idempotencyKey},${requestHash},${"deck" in source ? source.deck.slides.length : 1})`;
      const exportItems = "deck" in source
        ? source.deck.slides.map((slide) => ({ key: slide.id, ordinal: slide.order, hash: cardSlideSourceHash(source.deck, slide) }))
        : [{ key: "video-main", ordinal: 0, hash: source.sourceHash }];
      for (const item of exportItems) {
        await tx`
          INSERT INTO studio_export_items
            (id,tenant_id,job_id,item_key,ordinal,status,source_hash)
          VALUES
            (${crypto.randomUUID()},${tenantId},${jobId},${item.key},${item.ordinal},'queued',${item.hash})`;
      }
      const job = await loadJob(tx, tenantId, draftId, jobId);
      if (!job) throw new Error("created export job disappeared");
      return { job, reused: false };
      });
    } catch (error) {
      if (isIdempotencyUniqueViolation(error)) {
        throw new ExportQueueError(409, "IDEMPOTENCY_KEY_REUSED", "Idempotency-Key가 다른 요청에 사용됐습니다");
      }
      throw error;
    }
  }

  async get(tenantId: string, draftId: string, exportId: string): Promise<ExportJobRecord> {
    return withTenant(tenantId, async (tx) => {
      const job = await loadJob(tx, tenantId, draftId, exportId);
      if (!job) throw new ExportQueueError(404, "EXPORT_NOT_FOUND", "내보내기를 찾을 수 없습니다");
      return job;
    });
  }

  async retry(tenantId: string, draftId: string, exportId: string, input: RetryExportInput): Promise<string[]> {
    return withTenant(tenantId, async (tx) => {
      const [draft] = await tx<{ payload: unknown }[]>`
        SELECT payload FROM drafts WHERE tenant_id=${tenantId} AND id=${draftId} FOR UPDATE`;
      const [job] = await tx<{ id: string; source_hash: string; kind: ExportKind }[]>`
        SELECT id,source_hash,kind FROM studio_export_jobs
        WHERE tenant_id=${tenantId} AND draft_id=${draftId} AND id=${exportId} FOR UPDATE`;
      if (!job) throw new ExportQueueError(404, "EXPORT_NOT_FOUND", "내보내기를 찾을 수 없습니다");
      const source = sourceFromDraft(draft, job.kind, tenantId);
      if (job.source_hash !== source.sourceHash) {
        throw new ExportQueueError(409, "EXPORT_SOURCE_STALE", "현재 초안과 다른 판의 내보내기입니다");
      }
      const rows = await tx<{ item_key: string; status: string; max_attempts: number }[]>`
        SELECT item_key,status,max_attempts FROM studio_export_items
        WHERE tenant_id=${tenantId} AND job_id=${exportId} AND item_key IN ${tx(input.item_keys)}
        FOR UPDATE`;
      if (rows.length !== input.item_keys.length || rows.some((item) => item.status !== "failed" || number(item.max_attempts) >= 5)) {
        throw new ExportQueueError(409, "ITEM_NOT_RETRYABLE", "실패했고 재시도 상한이 남은 장만 다시 시도할 수 있습니다");
      }
      await tx`
        UPDATE studio_export_items
        SET status='queued',available_at=now(),max_attempts=LEAST(max_attempts+1,5),
            lease_token=NULL,lease_owner=NULL,lease_expires_at=NULL,heartbeat_at=NULL,
            error_code=NULL,error_detail=NULL,finished_at=NULL,updated_at=now()
        WHERE tenant_id=${tenantId} AND job_id=${exportId} AND item_key IN ${tx(input.item_keys)}`;
      await aggregateJob(tx, tenantId, exportId);
      return input.item_keys;
    });
  }

  async latest(tenantId: string, draftId: string, kind: ExportKind = "card_deck"): Promise<Record<string, unknown>> {
    return withTenant(tenantId, async (tx) => {
      const [draft] = await tx<{ payload: unknown }[]>`
        SELECT payload FROM drafts WHERE tenant_id=${tenantId} AND id=${draftId}`;
      const source = sourceFromDraft(draft, kind, tenantId);
      const empty = "deck" in source ? firstEmptySlide(source.deck) : null;
      const rows = await tx<Record<string, unknown>[]>`
        SELECT id,status,source_revision,source_hash,finished_at,created_at
        FROM studio_export_jobs
        WHERE tenant_id=${tenantId} AND draft_id=${draftId} AND kind=${kind}
        ORDER BY created_at DESC`;
      const current = rows.find((row) => row.source_hash === source.sourceHash);
      const successful = rows.find((row) => row.status === "succeeded");
      const latest = current ?? successful ?? rows[0] ?? null;
      let blocker: string | null = null;
      if (empty) blocker = "EMPTY_SLIDE";
      else if (current?.status === "queued" || current?.status === "processing") blocker = "EXPORT_IN_PROGRESS";
      else if (current && ["failed", "partially_failed", "cancelled"].includes(String(current.status))) blocker = "EXPORT_FAILED";
      else if (current?.status === "succeeded") blocker = null;
      else if (successful) blocker = "EXPORT_SOURCE_STALE";
      else blocker = "NO_SUCCESSFUL_EXPORT";
      return {
        draft_id: draftId,
        kind,
        current_source_revision: source.sourceRevision,
        current_source_hash: source.sourceHash,
        latest_export: latest ? {
          export_id: latest.id,
          status: latest.status,
          source_revision: number(latest.source_revision),
          source_hash: latest.source_hash,
          finished_at: latest.finished_at,
        } : null,
        is_latest: blocker === null,
        blocker,
        ...(empty ? { first_empty_slide: empty } : {}),
      };
    });
  }

  async withLatestForPublish<T>(
    tenantId: string,
    draftId: string,
    kind: ExportKind,
    publish: (receipt: PublishExportReceipt, draftPayload: Record<string, unknown>) => Promise<T>,
    options: { holdDraftLockDuringCallback?: boolean } = {},
  ): Promise<T> {
    const inspect = async (tx: Sql): Promise<PublishExportSnapshot> => {
      const [draft] = await tx<{ payload: unknown }[]>`
        SELECT payload FROM drafts WHERE tenant_id=${tenantId} AND id=${draftId} FOR UPDATE`;
      const source = sourceFromDraft(draft, kind, tenantId);
      const empty = "deck" in source ? firstEmptySlide(source.deck) : null;
      if (empty) {
        throw new ExportQueueError(409, "EMPTY_SLIDE", "빈 장은 발행실로 보낼 수 없습니다", { first_empty_slide: empty });
      }
      const rows = await tx<Record<string, unknown>[]>`
        SELECT id,status,source_hash,total_items,created_at
        FROM studio_export_jobs
        WHERE tenant_id=${tenantId} AND draft_id=${draftId} AND kind=${kind}
        ORDER BY created_at DESC`;
      const current = rows.find((row) => row.source_hash === source.sourceHash);
      if (!current || current.status !== "succeeded") {
        const successful = rows.find((row) => row.status === "succeeded");
        const code = current?.status === "queued" || current?.status === "processing"
          ? "EXPORT_IN_PROGRESS"
          : current
            ? "EXPORT_FAILED"
            : successful
              ? "EXPORT_SOURCE_STALE"
              : "NO_SUCCESSFUL_EXPORT";
        const message = code === "EXPORT_SOURCE_STALE"
          ? "편집 뒤 최신 내용으로 다시 내보내야 합니다"
          : code === "EXPORT_IN_PROGRESS"
            ? "최신 내보내기가 아직 진행 중입니다"
            : code === "EXPORT_FAILED"
              ? "실패한 항목을 다시 내보낸 뒤 발행할 수 있습니다"
              : "최신 내보내기 결과가 있어야 발행할 수 있습니다";
        throw new ExportQueueError(409, code, message);
      }
      const items = await tx<{ artifact_key: string | null; artifact_sha256: string | null; status: string }[]>`
        SELECT artifact_key,artifact_sha256,status
        FROM studio_export_items
        WHERE tenant_id=${tenantId} AND job_id=${String(current.id)}
        ORDER BY ordinal
        FOR SHARE`;
      if (items.length !== number(current.total_items)
        || items.some((item) => item.status !== "succeeded" || !item.artifact_key || !item.artifact_sha256)) {
        throw new ExportQueueError(409, "EXPORT_FAILED", "내보내기 결과 파일이 완전하지 않습니다");
      }
      return {
        receipt: {
          exportId: String(current.id),
          sourceHash: source.sourceHash,
          kind,
          artifactKeys: items.map((item) => item.artifact_key!),
        },
        draftPayload: draft?.payload && typeof draft.payload === "object" && !Array.isArray(draft.payload)
          ? draft.payload as Record<string, unknown>
          : {},
      };
    };
    if (options.holdDraftLockDuringCallback) {
      // publish_room 고정은 queue.json 쓰기까지 같은 비관적 락(SELECT ... FOR UPDATE)
      // 안에서 끝낸다. 이 callback은 새 DB 연결을 얻으면 안 된다. DB mirror는 호출자가
      // transaction 종료 뒤 수행해야 풀 max=5에서 동시 6요청 교착이 나지 않는다.
      return withTenant(tenantId, async (tx) => {
        const snapshot = await inspect(tx);
        return publish(snapshot.receipt, snapshot.draftPayload);
      });
    }
    const snapshot = await withTenant(tenantId, inspect);
    // OpenClaw enqueue 같은 일반 callback은 새 DB 연결을 쓸 수 있으므로 비관적 락
    // 해제 뒤 실행한다. publish_room 경로만 위 옵션으로 파일 queue 기록을 잠금 안에 둔다.
    return publish(snapshot.receipt, snapshot.draftPayload);
  }

  async runnableTenants(): Promise<string[]> {
    const sql = db();
    const rows = await sql<{ tenant_id: string }[]>`
      SELECT tenant_id FROM studio_export_items
      WHERE (status='queued' AND available_at <= now())
         OR (status='processing' AND lease_expires_at < now())
      GROUP BY tenant_id ORDER BY min(created_at),tenant_id`;
    return rows.map((row) => row.tenant_id);
  }

  async claim(tenantId: string, workerId: string): Promise<ClaimedExportItem | null> {
    return withTenant(tenantId, async (tx) => {
      const [row] = await tx<Record<string, unknown>[]>`
        WITH candidate AS (
          SELECT id FROM studio_export_items
          WHERE tenant_id=${tenantId} AND status='queued' AND available_at <= now()
          ORDER BY available_at,created_at,id FOR UPDATE SKIP LOCKED LIMIT 1
        ), claimed AS (
          UPDATE studio_export_items AS item
          SET status='processing',attempt_count=item.attempt_count+1,lease_token=gen_random_uuid(),
              lease_owner=${workerId},lease_expires_at=now()+interval '5 minutes',heartbeat_at=now(),
              started_at=COALESCE(item.started_at,now()),updated_at=now()
          FROM candidate WHERE item.id=candidate.id
          RETURNING item.*
        )
        SELECT claimed.*,job.draft_id,job.request_payload,job.kind
        FROM claimed JOIN studio_export_jobs job
          ON job.tenant_id=claimed.tenant_id AND job.id=claimed.job_id`;
      if (!row) return null;
      await aggregateJob(tx, tenantId, String(row.job_id));
      return {
        id: String(row.id), tenant_id: String(row.tenant_id), job_id: String(row.job_id),
        draft_id: String(row.draft_id), item_key: String(row.item_key), ordinal: number(row.ordinal),
        source_hash: String(row.source_hash), attempt_count: number(row.attempt_count),
        max_attempts: number(row.max_attempts), lease_token: String(row.lease_token),
        kind: row.kind as ExportKind,
        request_payload: row.request_payload as ClaimedExportItem["request_payload"],
      };
    });
  }

  async heartbeat(item: ClaimedExportItem): Promise<boolean> {
    return withTenant(item.tenant_id, async (tx) => {
      const rows = await tx`
        UPDATE studio_export_items SET heartbeat_at=now(),lease_expires_at=now()+interval '5 minutes',updated_at=now()
        WHERE tenant_id=${item.tenant_id} AND id=${item.id} AND status='processing' AND lease_token=${item.lease_token}
        RETURNING id`;
      return rows.length === 1;
    });
  }

  async complete(item: ClaimedExportItem, artifact: {
    key: string; sha256: string; contentType: string; byteSize: number; width: number; height: number;
  }): Promise<boolean> {
    return withTenant(item.tenant_id, async (tx) => {
      const rows = await tx`
        UPDATE studio_export_items
        SET status='succeeded',artifact_key=${artifact.key},artifact_sha256=${artifact.sha256},
            content_type=${artifact.contentType},byte_size=${artifact.byteSize},width=${artifact.width},height=${artifact.height},
            lease_token=NULL,lease_owner=NULL,lease_expires_at=NULL,heartbeat_at=NULL,
            error_code=NULL,error_detail=NULL,finished_at=now(),updated_at=now()
        WHERE tenant_id=${item.tenant_id} AND id=${item.id} AND status='processing' AND lease_token=${item.lease_token}
        RETURNING id`;
      if (rows.length === 1) await aggregateJob(tx, item.tenant_id, item.job_id);
      return rows.length === 1;
    });
  }

  async fail(item: ClaimedExportItem, code: string, detail: string, retryable: boolean): Promise<boolean> {
    return withTenant(item.tenant_id, async (tx) => {
      const retry = retryable && item.attempt_count < item.max_attempts;
      const delay = item.attempt_count <= 1 ? 5 : item.attempt_count === 2 ? 30 : 120;
      const rows = await tx`
        UPDATE studio_export_items
        SET status=${retry ? "queued" : "failed"},available_at=CASE WHEN ${retry} THEN now()+(${delay}*interval '1 second') ELSE available_at END,
            lease_token=NULL,lease_owner=NULL,lease_expires_at=NULL,heartbeat_at=NULL,
            error_code=${code},error_detail=${detail.slice(0, 1000)},finished_at=CASE WHEN ${retry} THEN NULL ELSE now() END,updated_at=now()
        WHERE tenant_id=${item.tenant_id} AND id=${item.id} AND status='processing' AND lease_token=${item.lease_token}
        RETURNING id`;
      if (rows.length === 1) await aggregateJob(tx, item.tenant_id, item.job_id);
      return rows.length === 1;
    });
  }

  async reclaimExpired(tenantId: string): Promise<number> {
    return withTenant(tenantId, async (tx) => {
      const rows = await tx<{ job_id: string }[]>`
        UPDATE studio_export_items
        SET status=CASE WHEN attempt_count < max_attempts THEN 'queued' ELSE 'failed' END,
            available_at=CASE WHEN attempt_count < max_attempts THEN now() ELSE available_at END,
            lease_token=NULL,lease_owner=NULL,lease_expires_at=NULL,heartbeat_at=NULL,
            error_code='LEASE_EXPIRED',error_detail='작업자 임대가 만료됐습니다',
            finished_at=CASE WHEN attempt_count < max_attempts THEN NULL ELSE now() END,updated_at=now()
        WHERE tenant_id=${tenantId} AND status='processing' AND lease_expires_at < now()
        RETURNING job_id`;
      for (const jobId of new Set(rows.map((row) => row.job_id))) await aggregateJob(tx, tenantId, jobId);
      return rows.length;
    });
  }
}

let singleton: PostgresExportRepository | null = null;
export function exportRepository(): PostgresExportRepository {
  singleton ??= new PostgresExportRepository();
  return singleton;
}
