import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { readOwnedLocalImage as readThreadsImage } from "../../../openclaw/extensions/threads-publish/src/threads-publish-tool";
import { readOwnedLocalImage as readInstagramImage } from "../../../openclaw/extensions/instagram-publish/src/instagram-publish-tool";

// Regression: OSMU-20260914-01, 02. /images/ 경로 탈출로 다른 테넌트 파일이 외부 전송되던 문제
// Found by /qa on 2026-09-14
// Report: docs/_archive/legacy-20260912/audit/osmu-code-review-2026-09-14.md

describe("OSMU 감사 항목 1, 2 로컬 이미지 격리", () => {
  let dataDir: string;
  let outsideDir: string;

  beforeEach(() => {
    dataDir = fs.mkdtempSync(path.join(os.tmpdir(), "osmu-image-root-"));
    outsideDir = fs.mkdtempSync(path.join(os.tmpdir(), "osmu-image-outside-"));
    fs.mkdirSync(path.join(dataDir, "images"));
    fs.writeFileSync(
      path.join(dataDir, "images", "owned.png"),
      Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0x00]),
    );
    fs.writeFileSync(path.join(outsideDir, "secret.json"), '{"token":"tenant-b"}');
    fs.writeFileSync(path.join(outsideDir, "fake.png"), "tenant-b secret");
  });

  afterEach(() => {
    fs.rmSync(dataDir, { recursive: true, force: true });
    fs.rmSync(outsideDir, { recursive: true, force: true });
  });

  it("항목 1, 2 정상 경로: 이미지 루트 안의 실제 PNG만 읽는다", async () => {
    await expect(readThreadsImage("/images/owned.png", dataDir)).resolves.toMatchObject({ filename: "owned.png" });
    await expect(readInstagramImage("/images/owned.png", dataDir)).resolves.toMatchObject({
      filename: "owned.png",
      contentType: "image/png",
    });
  });

  it("항목 1, 2 거절 경로: ../로 이미지 루트 밖 파일을 읽지 못한다", async () => {
    const traversal = `/images/../../${path.basename(outsideDir)}/secret.json`;
    await expect(readThreadsImage(traversal, dataDir)).rejects.toThrow();
    await expect(readInstagramImage(traversal, dataDir)).rejects.toThrow();
  });

  it("항목 1, 2 거절 경로: 심볼릭 링크와 위조 확장자도 이미지 경계를 통과하지 못한다", async () => {
    fs.symlinkSync(path.join(outsideDir, "fake.png"), path.join(dataDir, "images", "linked.png"));
    await expect(readThreadsImage("/images/linked.png", dataDir)).rejects.toThrow(/이미지 저장소 밖/);
    await expect(readInstagramImage("/images/linked.png", dataDir)).rejects.toThrow(/이미지 저장소 밖/);

    fs.writeFileSync(path.join(dataDir, "images", "fake.png"), "not an image");
    await expect(readThreadsImage("/images/fake.png", dataDir)).rejects.toThrow(/파일 내용/);
    await expect(readInstagramImage("/images/fake.png", dataDir)).rejects.toThrow(/파일 내용/);
  });
});
