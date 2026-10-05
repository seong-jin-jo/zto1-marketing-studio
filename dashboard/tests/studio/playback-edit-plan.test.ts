import { describe, expect, it } from "vitest";
import {
  addComment,
  addOverlay,
  emptyVideoEdit,
  setSubtitles,
  setVoice,
  toggleSubtitleCut,
  type SubtitleLine,
} from "@/lib/studio/video-edit-contract";
import {
  alignPlaybackScript,
  keepRanges,
  normalizeSubtitleWindows,
  planPlaybackBurn,
  playbackFfmpegArgs,
  readPlaybackEdit,
} from "@/lib/studio/playback-edit-plan";

function lines(): SubtitleLine[] {
  return [
    { id: "s1", order: 0, text: "첫 줄", startSec: 0, endSec: 2, cut: false },
    { id: "s2", order: 1, text: "잘린 줄", startSec: 2, endSec: 4, cut: false },
    { id: "s3", order: 2, text: "끝 줄", startSec: 4, endSec: 6, cut: false },
  ];
}

function edited() {
  let edit = setSubtitles(emptyVideoEdit(), lines());
  edit = toggleSubtitleCut(edit, "s2");
  edit = addOverlay(edit, "hook", "훅 문구", 0, 2);
  edit = addComment(edit, { author: "회원", text: "댓글 문구", source: "manual", startSec: 4, endSec: 6 });
  edit = setVoice(edit, { voiceId: "v1", voiceName: "다른 목소리" });
  return edit;
}

describe("재생 편집이 나가는 영상 명령에 남는다", () => {
  it("VIDEO-SUBTITLE-NORMALIZE-01 겹친 자막은 다음 문장 시작에서 끊고 영상 끝을 넘지 않는다", () => {
    const normalized = normalizeSubtitleWindows([
      { id: "s1", order: 0, text: "프로필 링크에서 예약하세요", startSec: 0, endSec: 3, cut: false },
      { id: "s2", order: 1, text: "바로 적용할 방법", startSec: 1.5, endSec: 5, cut: false },
    ], 3.875);

    expect(normalized.windows).toEqual([
      { text: "프로필 링크에서 예약하세요", startSec: 0, endSec: 1.5, kind: "subtitle" },
      { text: "바로 적용할 방법", startSec: 1.5, endSec: 3.875, kind: "subtitle" },
    ]);
    expect(normalized.warnings).toEqual([]);
  });

  it("VIDEO-SUBTITLE-NORMALIZE-02 표시할 틈이 없는 문장은 이웃 문장에 합치고 경고한다", () => {
    const normalized = normalizeSubtitleWindows([
      { id: "s1", order: 0, text: "첫 문장", startSec: 0, endSec: 3, cut: false },
      { id: "s2", order: 1, text: "둘째 문장", startSec: 0, endSec: 3, cut: false },
    ], 0.04);

    expect(normalized.windows).toEqual([
      { text: "첫 문장 · 둘째 문장", startSec: 0, endSec: 0.04, kind: "subtitle" },
    ]);
    expect(normalized.warnings).toContain("subtitle_windows_merged_for_short_video");
  });

  it("VIDEO-SUBTITLE-NORMALIZE-03 문장 자체의 가운데점은 짧은 영상 경고로 오인하지 않는다", () => {
    const normalized = normalizeSubtitleWindows([
      { id: "s1", order: 0, text: "예약 · 상담 안내", startSec: 0, endSec: 2, cut: false },
    ], 2);

    expect(normalized.windows).toHaveLength(1);
    expect(normalized.warnings).toEqual([]);
  });

  it("컷으로 뺀 2초는 남는 구간에서 빠지고 출력 길이는 4초다", () => {
    expect(keepRanges(6, [{ startSec: 2, endSec: 4 }])).toEqual([
      { startSec: 0, endSec: 2 },
      { startSec: 4, endSec: 6 },
    ]);
    const plan = planPlaybackBurn({
      edit: edited(),
      durationSec: 6,
      width: 1080,
      height: 1920,
      size: "보통",
      hasAudio: false,
    });
    expect(plan.ok).toBe(true);
    if (!plan.ok) return;
    expect(plan.outputDurationSec).toBe(4);
    expect(plan.droppedTexts).toContain("잘린 줄");
    expect(plan.keptTexts).toEqual(expect.arrayContaining(["첫 줄", "끝 줄", "훅 문구", "회원 댓글 문구"]));
    expect(plan.filterComplex).toContain("trim=start=0:end=2");
    expect(plan.filterComplex).toContain("trim=start=4:end=6");
    expect(plan.filterComplex).toContain("enable='between(t,0,2)'");
    expect(plan.filterComplex).toContain("enable='between(t,2,4)'");
    expect(plan.filterComplex).not.toContain("잘린 줄");
    expect(plan.filterComplex).toContain("훅 문구");
    expect(plan.filterComplex).toContain("댓글 문구");
    expect(plan.filterComplex).not.toContain("다른 목소리");
    expect(plan.voiceApplied).toBe(false);
  });

  it("컷이 없으면 자막은 줄 수 균등이 아니라 타임라인 시간에 굽힌다", () => {
    const edit = setSubtitles(emptyVideoEdit(), [
      { id: "s1", order: 0, text: "가운데만", startSec: 1, endSec: 2, cut: false },
    ]);
    const plan = planPlaybackBurn({
      edit,
      durationSec: 6,
      width: 1080,
      height: 1920,
      size: "보통",
      hasAudio: true,
    });
    expect(plan.ok).toBe(true);
    if (!plan.ok) return;
    expect(plan.filterComplex).toBeNull();
    expect(plan.videoFilter).toContain("enable='between(t,1,2)'");
    expect(plan.videoFilter).not.toContain("between(t,0,6");
    const args = playbackFfmpegArgs(plan, { inputPath: "in.mp4", outputPath: "out.mp4" });
    expect(args).toContain("-vf");
    expect(args).toContain("-c:a");
    expect(args).toContain("copy");
  });

  it("컷이 있으면 소리도 같은 구간만 남긴다", () => {
    const plan = planPlaybackBurn({
      edit: edited(),
      durationSec: 6,
      width: 768,
      height: 768,
      size: "작게",
      hasAudio: true,
    });
    expect(plan.ok).toBe(true);
    if (!plan.ok) return;
    expect(plan.filterComplex).toContain("atrim=start=0:end=2");
    expect(plan.filterComplex).toContain("atrim=start=4:end=6");
    const args = playbackFfmpegArgs(plan, { inputPath: "in.mp4", outputPath: "out.mp4" });
    expect(args).toContain("-filter_complex");
    expect(args).toContain("[aout]");
    expect(args).toContain("aac");
    expect(args).not.toContain("copy");
  });

  it("전부 잘라 남는 영상이 없으면 명령을 만들지 않는다", () => {
    const edit = toggleSubtitleCut(setSubtitles(emptyVideoEdit(), [
      { id: "s1", order: 0, text: "전부", startSec: 0, endSec: 6, cut: false },
    ]), "s1");
    const plan = planPlaybackBurn({
      edit,
      durationSec: 6,
      width: 1080,
      height: 1920,
      size: "보통",
      hasAudio: false,
    });
    expect(plan).toEqual({ ok: false, reason: "nothing_left" });
    expect(playbackFfmpegArgs(plan, { inputPath: "in.mp4", outputPath: "out.mp4" })).toBeNull();
  });

  it("줄 수가 같으면 굽는 문구는 발행 본문을 따른다", () => {
    const aligned = alignPlaybackScript(edited(), ["고친 첫 줄", "잘린 줄", "고친 끝 줄"]);
    const plan = planPlaybackBurn({
      edit: aligned,
      durationSec: 6,
      width: 1080,
      height: 1920,
      size: "보통",
      hasAudio: false,
    });
    expect(plan.ok).toBe(true);
    if (!plan.ok) return;
    expect(plan.keptTexts).toContain("고친 첫 줄");
    expect(plan.keptTexts).not.toContain("첫 줄");
    expect(plan.droppedTexts).toContain("잘린 줄");
    expect(plan.filterComplex).toContain("고친 끝 줄");
  });

  it("깨진 편집 값은 조용히 무시하지 않는다", () => {
    expect(readPlaybackEdit(null)).toEqual({ ok: true, edit: null });
    const invalid = readPlaybackEdit({ overlays: [] });
    expect(invalid.ok).toBe(false);
  });
});
