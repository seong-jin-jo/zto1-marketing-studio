import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

let root = "";

beforeEach(() => {
  vi.resetModules();
  root = fs.mkdtempSync(path.join(os.tmpdir(), "video-bake-lineage-"));
  vi.stubEnv("DATA_DIR", root);
});

afterEach(() => {
  vi.unstubAllEnvs();
  fs.rmSync(root, { recursive: true, force: true });
});

describe("영상 자막 굽기 서버 계보", () => {
  it("VIDEO-BAKE-LINEAGE-08 굽기 결과와 글자 없는 입력 파일을 테넌트별 기록에서 되찾는다", async () => {
    const { readSubtitleBakeLineage, recordSubtitleBake } = await import("@/lib/studio/video-bake-lineage");
    await recordSubtitleBake({
      tenantId: "tenant-a",
      outputFilename: "subtitle-11111111-1111-4111-8111-111111111111.mp4",
      sourceFilename: "source.mp4",
    });

    expect(readSubtitleBakeLineage("tenant-a", "subtitle-11111111-1111-4111-8111-111111111111.mp4"))
      .toEqual(expect.objectContaining({ state: "baked", sourceFilename: "source.mp4" }));
    expect(readSubtitleBakeLineage("tenant-b", "subtitle-11111111-1111-4111-8111-111111111111.mp4"))
      .toEqual({ state: "baked" });
  });

  it("VIDEO-BAKE-LINEAGE-09 기록 파일이 없어도 새 굽기 파일명 규칙은 구운 결과로 판정한다", async () => {
    const { readSubtitleBakeLineage } = await import("@/lib/studio/video-bake-lineage");
    expect(readSubtitleBakeLineage("tenant-a", "subtitle-11111111-1111-4111-8111-111111111111.mp4"))
      .toEqual({ state: "baked" });
  });

  it("VIDEO-BAKE-LINEAGE-10 UUID 산출물은 자막·인트로 합성 결과일 수 있어 추측하지 않는다", async () => {
    const { readSubtitleBakeLineage } = await import("@/lib/studio/video-bake-lineage");
    expect(readSubtitleBakeLineage("tenant-a", "11111111-1111-4111-8111-111111111111.mp4"))
      .toEqual({ state: "unknown" });
  });

  it.each(["vid_1723456789012.mp4", "vidsilent_1723456789012.mp4"])(
    "VIDEO-BAKE-LINEAGE-11 생성기 원본 %s는 기록이 없어도 자막 없는 원본이다",
    async (filename) => {
      const { readSubtitleBakeLineage } = await import("@/lib/studio/video-bake-lineage");
      expect(readSubtitleBakeLineage("tenant-a", filename)).toEqual({ state: "unbaked" });
    },
  );

  it.each(["a1b2c3d4e5f6.mp4", "001122aabbcc.mov", "abcdef123456.m4v", "123456abcdef.webm"])(
    "VIDEO-BAKE-LINEAGE-12 업로드 원본 %s는 기록이 없어도 자막 없는 원본이다",
    async (filename) => {
      const { readSubtitleBakeLineage } = await import("@/lib/studio/video-bake-lineage");
      expect(readSubtitleBakeLineage("tenant-a", filename)).toEqual({ state: "unbaked" });
    },
  );
});
