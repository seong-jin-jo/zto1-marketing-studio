import { describe, expect, it } from "vitest";
import { emptyVideoEdit } from "./video-edit-contract";
import { shouldReuseVideoSource } from "./video-export-renderer";

describe("shouldReuseVideoSource", () => {
  it("S4-LOCAL-05 편집하지 않은 실제 생성 영상은 원본을 내보내기 산출물로 재사용한다", () => {
    expect(shouldReuseVideoSource(emptyVideoEdit())).toBe(true);
  });

  it("S4-LOCAL-06 자막 편집이 있으면 원본 재사용을 거절하고 렌더 경로를 탄다", () => {
    const edit = emptyVideoEdit();
    edit.subtitles.push({ id: "subtitle-1", order: 0, text: "실제 자막", startSec: 0, endSec: 1, cut: false });
    expect(shouldReuseVideoSource(edit)).toBe(false);
  });
});
