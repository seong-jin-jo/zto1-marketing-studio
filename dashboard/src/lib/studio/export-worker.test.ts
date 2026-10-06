import fs from "node:fs";
import { describe, expect, it, vi } from "vitest";
import { createPlainCardDeckV3 } from "./card-element-commands";
import type { ClaimedExportItem } from "./export-contract";
import { ExportItemWorker, exportArtifactFilename, type ExportArtifact } from "./export-worker";
import { emptyVideoEdit } from "./video-edit-contract";

vi.mock("./video-export-renderer", async (importOriginal) => ({
  ...await importOriginal<typeof import("./video-export-renderer")>(),
  probeRenderedVideo: vi.fn(async () => ({ width: 1080, height: 1920, durationSec: 3 })),
}));

function claimed(token: string): ClaimedExportItem {
  const deck = createPlainCardDeckV3(["첫 장", "마지막 장"], "deck_worker_retry");
  return {
    id: "item-1", tenant_id: "tenant-1", job_id: "11111111-1111-4111-8111-111111111111",
    draft_id: "draft-1", item_key: deck.slides[0].id, ordinal: 0, source_hash: "a".repeat(64),
    attempt_count: token === "lease-1" ? 1 : 2, max_attempts: 3, lease_token: token,
    kind: "card_deck",
    request_payload: { deck },
  };
}

function claimedVideo(): ClaimedExportItem {
  return {
    id: "item-video-1", tenant_id: "tenant-1", job_id: "22222222-2222-4222-8222-222222222222",
    draft_id: "draft-video-1", item_key: "video-main", ordinal: 0, source_hash: "b".repeat(64),
    attempt_count: 1, max_attempts: 3, lease_token: "lease-video-1", kind: "video",
    request_payload: {
      video: {
        sourceFilename: "vid_1728000000000.mp4",
        edit: emptyVideoEdit(),
        lines: ["첫 자막"],
        subtitleSize: "보통",
      },
    },
  };
}

describe("S3 export worker crash 멱등 계약", () => {
  it("S3-WORKER-01 정상: upload 뒤 crash 재시도가 같은 key와 bytes를 쓰고 두 번째 lease만 완료한다", async () => {
    const objects = new Map<string, Buffer>();
    const complete = vi.fn(async (_item: ClaimedExportItem, _artifact: ExportArtifact) => true);
    const fail = vi.fn(async (_item: ClaimedExportItem, _code: string, _detail: string, _retryable: boolean) => true);
    let crash = true;
    const worker = new ExportItemWorker({
      repository: { heartbeat: vi.fn(async () => true), complete, fail },
      render: async (_item, outputPath) => fs.writeFileSync(outputPath, Buffer.from("deterministic-png")),
      put: async (_tenantId, filename, body) => { objects.set(filename, Buffer.from(body)); },
      afterUpload: async () => {
        if (crash) {
          crash = false;
          throw new Error("simulated crash after upload");
        }
      },
    });
    expect(await worker.process(claimed("lease-1"))).toBe(false);
    expect(await worker.process(claimed("lease-2"))).toBe(true);
    expect(objects.size).toBe(1);
    expect(objects.get(exportArtifactFilename(claimed("lease-2")))?.toString()).toBe("deterministic-png");
    expect(fail).toHaveBeenCalledTimes(1);
    expect(complete).toHaveBeenCalledTimes(1);
    expect(complete.mock.calls[0][0].lease_token).toBe("lease-2");
    expect(complete.mock.calls[0][1]).toMatchObject({ sha256: expect.stringMatching(/^[0-9a-f]{64}$/), byteSize: 17 });
  });

  it("S6-MAJOR3-03 정상: 영상 대기열 성공 산출물은 자막 굽기 계보를 영구 키로 기록한다", async () => {
    const item = claimedVideo();
    const recordVideoBake = vi.fn(async () => undefined);
    const complete = vi.fn(async () => true);
    const worker = new ExportItemWorker({
      repository: { heartbeat: vi.fn(async () => true), complete, fail: vi.fn(async () => true) },
      render: async (_item, outputPath) => fs.writeFileSync(outputPath, Buffer.from("deterministic-mp4")),
      put: vi.fn(async () => undefined),
      recordVideoBake,
    });
    expect(await worker.process(item)).toBe(true);
    expect(recordVideoBake).toHaveBeenCalledWith({
      tenantId: "tenant-1",
      outputFilename: exportArtifactFilename(item),
      sourceFilename: "vid_1728000000000.mp4",
    });
    expect(complete).toHaveBeenCalledTimes(1);
  });
});
