import { describe, expect, it } from "vitest";
import { resolveVideoPublishFilename } from "@/lib/studio/video-publish-filename";

// 2026-10-02 회장 반려: 인트로/아웃트로를 적용해도 발행 요청이 원본 파일명을 그대로
// 보내고 있었다("화면은 적용됐다고 하는데 실제로 올라가는 파일은 원본"). 이 테스트는
// 고치기 전에 돌리면 실패했다(resolveVideoPublishFilename이 존재하지 않아 import 자체가
// 깨졌다 — 회귀 1호). 지금은 production page.tsx가 이 함수로 발행 파일명을 고른다.
describe("resolveVideoPublishFilename", () => {
  it("인트로/아웃트로가 적용돼 있으면 합성 결과 파일명을 쓴다", () => {
    const original = "video-abc123.mp4";
    const applied = { introCompId: "intro-logo-reveal" as const, outroCompId: null, resultFilename: "video-concat-xyz.mp4" };
    expect(resolveVideoPublishFilename(original, applied)).toBe("video-concat-xyz.mp4");
    expect(resolveVideoPublishFilename(original, applied)).not.toBe(original);
  });

  it("적용된 것이 없으면 원본 파일명을 그대로 쓴다", () => {
    expect(resolveVideoPublishFilename("video-abc123.mp4", null)).toBe("video-abc123.mp4");
  });
});
