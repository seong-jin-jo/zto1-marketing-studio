import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { mediaStore, R2_ENV_KEYS } from "@/lib/media-store";
import { createPlainCardDeckV3 } from "@/lib/studio/card-element-commands";
import type { ClaimedExportItem } from "@/lib/studio/export-contract";
import { ExportItemWorker, exportArtifactFilename, realExportWorkerDependencies } from "@/lib/studio/export-worker";

let dataDir: string;
let originalDataDir: string | undefined;
const originalR2Environment = new Map<(typeof R2_ENV_KEYS)[number], string | undefined>();

async function readBody(body: ReadableStream<Uint8Array>): Promise<Buffer> {
  const reader = body.getReader();
  const chunks: Buffer[] = [];
  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) return Buffer.concat(chunks);
      chunks.push(Buffer.from(value));
    }
  } finally {
    reader.releaseLock();
  }
}

beforeEach(() => {
  dataDir = fs.mkdtempSync(path.join(os.tmpdir(), "studio-export-local-media-"));
  originalDataDir = process.env.DATA_DIR;
  originalR2Environment.clear();
  process.env.DATA_DIR = dataDir;
  for (const key of R2_ENV_KEYS) {
    originalR2Environment.set(key, process.env[key]);
    delete process.env[key];
  }
});

afterEach(() => {
  if (originalDataDir === undefined) delete process.env.DATA_DIR;
  else process.env.DATA_DIR = originalDataDir;
  for (const key of R2_ENV_KEYS) {
    const originalValue = originalR2Environment.get(key);
    if (originalValue === undefined) delete process.env[key];
    else process.env[key] = originalValue;
  }
  fs.rmSync(dataDir, { recursive: true, force: true });
});

describe("내보내기 작업자 local 저장소와 대시보드 읽기 경로 통합", () => {
  it("EXPORT-WORKER-LOCAL-01 정상: 작업자가 항목을 완료하면 대시보드 mediaStore가 같은 테넌트 경로에서 읽는다", async () => {
    const deck = createPlainCardDeckV3(["공유 볼륨 확인", "대시보드 읽기 확인"], "deck_export_worker_local");
    const item: ClaimedExportItem = {
      id: "item-local-1",
      tenant_id: "tenant-local",
      job_id: "job-local-1",
      draft_id: "draft-local-1",
      item_key: deck.slides[0].id,
      ordinal: 0,
      source_hash: "a".repeat(64),
      attempt_count: 1,
      max_attempts: 3,
      lease_token: "lease-local-1",
      kind: "card_deck",
      request_payload: { deck },
    };
    const complete = vi.fn(async () => true);
    const repository = {
      heartbeat: vi.fn(async () => true),
      complete,
      fail: vi.fn(async () => true),
    };
    const expectedBody = Buffer.from("worker-local-artifact");
    const dependencies = realExportWorkerDependencies(repository as never);
    dependencies.render = async (_claimed, outputPath) => {
      fs.writeFileSync(outputPath, expectedBody);
    };

    const processed = await new ExportItemWorker(dependencies).process(item);
    const filename = exportArtifactFilename(item);
    const stored = await mediaStore.get(item.tenant_id, filename);

    expect(processed).toBe(true);
    expect(complete).toHaveBeenCalledTimes(1);
    expect(stored).toMatchObject({ source: "local", contentLength: expectedBody.byteLength });
    expect(await readBody(stored!.body)).toEqual(expectedBody);
    expect(fs.readFileSync(path.join(dataDir, "tenants", item.tenant_id, "images", filename))).toEqual(expectedBody);
  });

  it("EXPORT-WORKER-LOCAL-02 거절: 최종 이름 교체가 실패하면 부분 파일과 임시 파일을 남기지 않는다", async () => {
    const tenantId = "tenant-local";
    const filename = "atomic-write.png";
    const targetDirectory = path.join(dataDir, "tenants", tenantId, "images");
    const targetPath = path.join(targetDirectory, filename);
    fs.mkdirSync(targetDirectory, { recursive: true });
    fs.writeFileSync(targetPath, "stable");
    const rename = vi.spyOn(fs, "renameSync").mockImplementation(() => {
      throw new Error("fixture rename failure");
    });

    try {
      await expect(mediaStore.put(tenantId, filename, Buffer.from("partial"), "image/png"))
        .rejects.toMatchObject({ code: "LOCAL_IO" });
      expect(fs.readFileSync(targetPath, "utf8")).toBe("stable");
      expect(fs.readdirSync(targetDirectory)).toEqual([filename]);
    } finally {
      rename.mockRestore();
    }
  });
});
