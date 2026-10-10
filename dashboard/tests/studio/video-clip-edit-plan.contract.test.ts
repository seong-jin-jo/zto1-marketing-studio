import { describe, expect, it } from "vitest";
import {
  emptyVideoEdit,
  setSubtitles,
  type VideoEdit,
} from "@/lib/studio/video-edit-contract";
import {
  deleteVideoClips,
  materializeVideoClips,
  outputTimeToSourceTime,
  planPlaybackBurn,
  reorderVideoClips,
  splitVideoClip,
  trimVideoClip,
} from "@/lib/studio/playback-edit-plan";

function baseEdit(): VideoEdit {
  return setSubtitles(emptyVideoEdit(), [
    { id: "s1", order: 0, text: "첫 구간", startSec: 0, endSec: 2, cut: false },
    { id: "s2", order: 1, text: "삭제 구간", startSec: 2, endSec: 4, cut: false },
    { id: "s3", order: 2, text: "끝 구간", startSec: 4, endSec: 6, cut: false },
  ]);
}

describe("영상 클립 편집 계약", () => {
  it("VIDEO-CAPCUT-01 재생헤드에서 자르면 출력 순서를 보존한 두 클립이 된다", () => {
    const edit = splitVideoClip(baseEdit(), 6, 2.5);
    expect(materializeVideoClips(edit, 6)).toMatchObject([
      { order: 0, sourceStartSec: 0, sourceEndSec: 2.5 },
      { order: 1, sourceStartSec: 2.5, sourceEndSec: 6 },
    ]);
  });

  it("VIDEO-CAPCUT-02 선택 삭제와 양끝 트림은 마지막 클립 삭제를 거절한다", () => {
    let edit = splitVideoClip(baseEdit(), 6, 2);
    edit = splitVideoClip(edit, 6, 4);
    const middle = materializeVideoClips(edit, 6)[1];
    edit = deleteVideoClips(edit, [middle.id], 6);
    const tail = materializeVideoClips(edit, 6)[1];
    edit = trimVideoClip(edit, tail.id, "start", 4.5, 6);
    expect(materializeVideoClips(edit, 6)).toMatchObject([
      { sourceStartSec: 0, sourceEndSec: 2 },
      { sourceStartSec: 4.5, sourceEndSec: 6 },
    ]);
    expect(() => deleteVideoClips(edit, materializeVideoClips(edit, 6).map((clip) => clip.id), 6))
      .toThrow(/마지막/);
  });

  it("VIDEO-CAPCUT-03 클립 순서를 바꾸면 미리보기 시간 매핑과 ffmpeg concat 순서가 같다", () => {
    let edit = splitVideoClip(baseEdit(), 6, 2);
    edit = splitVideoClip(edit, 6, 4);
    const clips = materializeVideoClips(edit, 6);
    edit = reorderVideoClips(edit, clips[2].id, clips[0].id, 6);

    expect(outputTimeToSourceTime(edit, 6, 0.5)).toBeCloseTo(4.5, 3);
    const plan = planPlaybackBurn({
      edit,
      durationSec: 6,
      width: 1080,
      height: 1920,
      size: "보통",
      hasAudio: false,
    });
    expect(plan.ok).toBe(true);
    if (!plan.ok) return;
    expect(plan.outputDurationSec).toBe(6);
    expect(plan.filterComplex).toContain("trim=start=4:end=6");
    expect(plan.filterComplex?.indexOf("trim=start=4:end=6")).toBeLessThan(
      plan.filterComplex?.indexOf("trim=start=0:end=2") ?? -1,
    );
  });

  it("VIDEO-CAPCUT-04 문장 삭제 컷은 클립 트림 뒤에도 출력 길이와 자막 한 겹을 유지한다", () => {
    let edit = splitVideoClip(baseEdit(), 6, 3);
    const clips = materializeVideoClips(edit, 6);
    edit = trimVideoClip(edit, clips[1].id, "start", 3.5, 6);
    edit = {
      ...edit,
      subtitles: edit.subtitles.map((line) => line.id === "s1" ? { ...line, cut: true } : line),
      subtitleStyle: {
        ...edit.subtitleStyle,
        fontFamily: "serif",
        color: "#ffd600",
        xPercent: 42,
        yPercent: 68,
      },
    };
    const plan = planPlaybackBurn({ edit, durationSec: 6, width: 1080, height: 1920, size: "보통", hasAudio: false });
    expect(plan.ok).toBe(true);
    if (!plan.ok) return;
    expect(plan.outputDurationSec).toBe(3.5);
    expect(plan.droppedTexts).toContain("첫 구간");
    expect((plan.filterComplex?.match(/text='끝 구간'/g) ?? [])).toHaveLength(1);
    expect(plan.filterComplex).toContain("fontcolor=0xffd600");
    expect(plan.filterComplex).toContain("x=w\*0.42-text_w\/2");
  });
});
