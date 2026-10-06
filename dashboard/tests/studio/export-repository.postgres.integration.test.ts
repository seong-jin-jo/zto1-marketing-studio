import crypto from "node:crypto";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import postgres from "postgres";
import { afterAll, afterEach, beforeAll, describe, expect, it } from "vitest";
import { createPlainCardDeckV3 } from "@/lib/studio/card-element-commands";
import { ExportQueueError } from "@/lib/studio/export-contract";
import { PostgresExportRepository } from "@/lib/studio/export-repository";
import { cardDeckExportSource } from "@/lib/studio/export-source-hash";
import { ExportItemWorker, realExportWorkerDependencies } from "@/lib/studio/export-worker";

const databaseUrl = process.env.S3_DATABASE_URL;
const integration = databaseUrl ? describe : describe.skip;
const tenantA = crypto.randomUUID();
const tenantB = crypto.randomUUID();
const admin = databaseUrl ? postgres(databaseUrl, { max: 4 }) : null;

async function seedDraft(lines: string[]) {
  const id = crypto.randomUUID();
  const deck = createPlainCardDeckV3(lines, `deck_${id.replaceAll("-", "")}`);
  deck.revision = 13;
  await admin!`
    INSERT INTO drafts(id,tenant_id,payload)
    VALUES (${id},${tenantA},${admin!.json({ cardDeckV3: deck } as never)})`;
  return { id, deck, source: cardDeckExportSource(deck) };
}

function input(source: ReturnType<typeof cardDeckExportSource>) {
  return {
    kind: "card_deck" as const,
    expected_source_revision: source.sourceRevision,
    expected_source_hash: source.sourceHash,
    item_keys: null,
  };
}

integration.sequential("S3 영속 내보내기 실제 PostgreSQL 통합", () => {
  beforeAll(async () => {
    process.env.DATABASE_URL = databaseUrl!;
    await admin!`
      INSERT INTO tenants(id,slug,name,status)
      VALUES (${tenantA},${`s3-${tenantA.slice(0, 8)}`},'S3 A','active'),
             (${tenantB},${`s3-${tenantB.slice(0, 8)}`},'S3 B','active')`;
  });

  afterEach(async () => {
    await admin!`DELETE FROM drafts WHERE tenant_id=${tenantA}`;
  });

  afterAll(async () => {
    if (admin) {
      await admin`DELETE FROM tenants WHERE id IN (${tenantA},${tenantB})`;
      await admin.end();
    }
  });

  it("S3-AC1 정상: 두 claim 경합 중 하나만 lease token을 받는다", async () => {
    const draft = await seedDraft(["첫 장", "마지막 장"]);
    const repository = new PostgresExportRepository();
    await repository.create(tenantA, draft.id, "member-ac1", "ac1", "a".repeat(64), input(draft.source));
    const claims = await Promise.all([repository.claim(tenantA, "worker-a"), repository.claim(tenantA, "worker-b")]);
    expect(claims.filter(Boolean)).toHaveLength(2);
    expect(new Set(claims.map((claim) => claim?.id)).size).toBe(2);
    expect(claims.every((claim) => claim?.lease_token)).toBe(true);
    const oneItem = await seedDraft(["A", "B"]);
    const created = await repository.create(tenantA, oneItem.id, "member-ac1b", "ac1b", "b".repeat(64), input(oneItem.source));
    const itemId = await admin!<{ id: string }[]>`
      SELECT id FROM studio_export_items WHERE job_id=${created.job.id} ORDER BY ordinal LIMIT 1`;
    await admin!`UPDATE studio_export_items SET available_at=now()+interval '1 hour' WHERE job_id=${created.job.id} AND id<>${itemId[0].id}`;
    const same = await Promise.all([repository.claim(tenantA, "worker-c"), repository.claim(tenantA, "worker-d")]);
    expect(same.filter(Boolean)).toHaveLength(1);
  });

  it("S3-AC2 거절: 다른 테넌트 export ID 조회는 존재 여부 없이 404다", async () => {
    const draft = await seedDraft(["첫 장", "마지막 장"]);
    const repository = new PostgresExportRepository();
    const created = await repository.create(tenantA, draft.id, "member-ac2", "ac2", "c".repeat(64), input(draft.source));
    await expect(repository.get(tenantB, draft.id, created.job.id)).rejects.toMatchObject({ status: 404, code: "EXPORT_NOT_FOUND" });
    await expect(repository.retry(tenantB, draft.id, created.job.id, { item_keys: [draft.deck.slides[0].id] }))
      .rejects.toMatchObject({ status: 404, code: "DRAFT_NOT_FOUND" });
  });

  it("S3-AC3 경계: 만료 lease는 재대기 후 상한에서 LEASE_EXPIRED로 실패한다", async () => {
    const draft = await seedDraft(["첫 장", "마지막 장"]);
    const repository = new PostgresExportRepository();
    const created = await repository.create(tenantA, draft.id, "member-ac3", "ac3", "d".repeat(64), input(draft.source));
    const claimed = await repository.claim(tenantA, "worker-crash");
    expect(claimed).not.toBeNull();
    await admin!`UPDATE studio_export_items SET lease_expires_at=now()-interval '1 second' WHERE id=${claimed!.id}`;
    expect(await repository.reclaimExpired(tenantA)).toBeGreaterThanOrEqual(1);
    let [row] = await admin!<{ status: string; error_code: string }[]>`SELECT status,error_code FROM studio_export_items WHERE id=${claimed!.id}`;
    expect(row.status).toBe("queued");
    await admin!`
      UPDATE studio_export_items
      SET status='processing',attempt_count=max_attempts,lease_token=gen_random_uuid(),lease_owner='worker-dead',
          lease_expires_at=now()-interval '1 second'
      WHERE id=${claimed!.id}`;
    await repository.reclaimExpired(tenantA);
    [row] = await admin!<{ status: string; error_code: string }[]>`SELECT status,error_code FROM studio_export_items WHERE id=${claimed!.id}`;
    expect(row).toEqual({ status: "failed", error_code: "LEASE_EXPIRED" });
  });

  it("S3-AC4 경계: 같은 key와 본문은 재사용하고 다른 request hash는 409다", async () => {
    const draft = await seedDraft(["첫 장", "마지막 장"]);
    const repository = new PostgresExportRepository();
    const first = await repository.create(tenantA, draft.id, "member-ac4", "same-key", "e".repeat(64), input(draft.source));
    const reused = await repository.create(tenantA, draft.id, "member-ac4", "same-key", "e".repeat(64), input(draft.source));
    expect(reused).toMatchObject({ reused: true, job: { id: first.job.id } });
    await expect(repository.create(tenantA, draft.id, "member-ac4", "same-key", "f".repeat(64), input(draft.source)))
      .rejects.toEqual(expect.objectContaining<Partial<ExportQueueError>>({ status: 409, code: "IDEMPOTENCY_KEY_REUSED" }));
  });

  it("S3-AC5 정상: 9장 중 실패한 한 장만 queued로 돌리고 성공 8장은 보존한다", async () => {
    const draft = await seedDraft(Array.from({ length: 9 }, (_, index) => `${index + 1}번 장`));
    const repository = new PostgresExportRepository();
    const created = await repository.create(tenantA, draft.id, "member-ac5", "ac5", "1".repeat(64), input(draft.source));
    await admin!`
      UPDATE studio_export_items
      SET status=CASE WHEN ordinal=8 THEN 'failed' ELSE 'succeeded' END,
          artifact_key=CASE WHEN ordinal=8 THEN NULL ELSE 'kept-'||ordinal||'.png' END,
          artifact_sha256=CASE WHEN ordinal=8 THEN NULL ELSE repeat('a',64) END,
          content_type=CASE WHEN ordinal=8 THEN NULL ELSE 'image/png' END,
          byte_size=CASE WHEN ordinal=8 THEN NULL ELSE 100 END,
          error_code=CASE WHEN ordinal=8 THEN 'CARD_RENDER_FAILED' ELSE NULL END
      WHERE job_id=${created.job.id}`;
    const failedKey = draft.deck.slides[8].id;
    expect(await repository.retry(tenantA, draft.id, created.job.id, { item_keys: [failedKey] })).toEqual([failedKey]);
    const rows = await admin!<{ status: string; count: number }[]>`
      SELECT status,count(*)::int AS count FROM studio_export_items WHERE job_id=${created.job.id} GROUP BY status ORDER BY status`;
    expect(rows).toEqual([{ status: "queued", count: 1 }, { status: "succeeded", count: 8 }]);
  });

  it("S3-AC6 정상: 두 session의 advisory lock은 active 1, standby 1이다", async () => {
    const first = await admin!.reserve();
    const second = await admin!.reserve();
    try {
      const [active] = await first<{ acquired: boolean }[]>`
        SELECT pg_try_advisory_lock(hashtextextended('studio-export-render-worker-v1',0)) AS acquired`;
      const [standby] = await second<{ acquired: boolean }[]>`
        SELECT pg_try_advisory_lock(hashtextextended('studio-export-render-worker-v1',0)) AS acquired`;
      expect([active.acquired, standby.acquired]).toEqual([true, false]);
      await first`SELECT pg_advisory_unlock(hashtextextended('studio-export-render-worker-v1',0))`;
      const [promoted] = await second<{ acquired: boolean }[]>`
        SELECT pg_try_advisory_lock(hashtextextended('studio-export-render-worker-v1',0)) AS acquired`;
      expect(promoted.acquired).toBe(true);
    } finally {
      first.release();
      second.release();
    }
  });

  it.runIf(process.env.S3_RENDER_REAL === "1")(
    "S3-RENDER-01 정상: 실제 PNG object bytes의 SHA-256과 DB artifact_sha256이 같다",
    async () => {
      const dataDir = fs.mkdtempSync(path.join(os.tmpdir(), "s3-export-object-"));
      process.env.DATA_DIR = dataDir;
      process.env.OSMU_PUBLIC_URL = "http://127.0.0.1:18789";
      try {
        const draft = await seedDraft(["실제 렌더 첫 장", "실제 렌더 마지막 장"]);
        const repository = new PostgresExportRepository();
        await repository.create(tenantA, draft.id, "member-render", "render-real", "2".repeat(64), input(draft.source));
        const claimed = await repository.claim(tenantA, "worker-real-render");
        expect(claimed).not.toBeNull();
        const worker = new ExportItemWorker(realExportWorkerDependencies(repository));
        expect(await worker.process(claimed!)).toBe(true);
        const [artifact] = await admin!<{ artifact_key: string; artifact_sha256: string; byte_size: number }[]>`
          SELECT artifact_key,artifact_sha256,byte_size FROM studio_export_items WHERE id=${claimed!.id}`;
        const bytes = fs.readFileSync(path.join(dataDir, "tenants", tenantA, "images", artifact.artifact_key));
        expect(crypto.createHash("sha256").update(bytes).digest("hex")).toBe(artifact.artifact_sha256);
        expect(bytes.byteLength).toBe(Number(artifact.byte_size));
        expect(bytes.subarray(1, 4).toString()).toBe("PNG");
      } finally {
        fs.rmSync(dataDir, { recursive: true, force: true });
      }
    },
    180_000,
  );
});
