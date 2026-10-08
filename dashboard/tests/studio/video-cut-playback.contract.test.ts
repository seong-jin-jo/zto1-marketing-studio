import { describe, expect, it } from "vitest";
import { nextPlayableBodyTime } from "@/components/studio/VideoEditor";
import type { SubtitleLine } from "@/lib/studio/video-edit-contract";

const subtitles: SubtitleLine[] = [
  { id: "s1", order: 0, text: "유지", startSec: 0, endSec: 2, cut: false },
  { id: "s2", order: 1, text: "삭제", startSec: 2, endSec: 5, cut: true },
  { id: "s3", order: 2, text: "유지", startSec: 5, endSec: 8, cut: false },
];

describe("영상 컷 미리보기 재생 계약", () => {
  it("VIDEO-CUT-PLAYBACK-01 컷 구간에 들어오면 끝으로 건너뛴다", () => {
    expect(nextPlayableBodyTime(2.4, subtitles)).toBe(5);
  });

  it("VIDEO-CUT-PLAYBACK-02 컷 끝과 원본 보기에서는 재생 시간을 바꾸지 않는다", () => {
    expect(nextPlayableBodyTime(5, subtitles)).toBe(5);
    expect(nextPlayableBodyTime(2.4, subtitles, true)).toBe(2.4);
  });
});
