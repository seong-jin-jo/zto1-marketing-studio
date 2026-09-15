import fs from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

describe("OSMU-CODE-REVIEW-20260916-14 영상 발행 결과 대기", () => {
  it("거절: 화면 제한시간이 서버의 120초 업로드 상한보다 먼저 끝나지 않는다", () => {
    const source = fs.readFileSync(path.resolve(process.cwd(), "src/app/studio/page.tsx"), "utf8");
    const match = source.match(/const VIDEO_PUBLISH_REQUEST_TIMEOUT_MS = ([\d_]+);/);
    expect(match).not.toBeNull();
    expect(Number(match![1].replace(/_/g, ""))).toBeGreaterThan(120_000);
    expect(source).toContain("AbortSignal.timeout(VIDEO_PUBLISH_REQUEST_TIMEOUT_MS)");
  });
});
