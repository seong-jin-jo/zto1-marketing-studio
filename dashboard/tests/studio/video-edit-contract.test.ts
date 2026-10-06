/**
 * 영상 편집 계약 테스트(세션맥락 과업 B). 오버레이 추가/삭제, 댓글 추가/삭제, 자막 컷 표시,
 * 음성 선택이 videoEdit payload에 실제로 반영되는지 확인한다(회장 종료 조건: "영상 오버레이
 * 추가·삭제가 스키마에 저장되는지").
 */
import { describe, expect, it } from "vitest";
import {
  emptyVideoEdit,
  validateVideoEdit,
  addOverlay,
  updateOverlay,
  removeOverlay,
  addComment,
  removeComment,
  setSubtitles,
  toggleSubtitleCut,
  setVoice,
  setIntroOutroApplied,
  addTextSticker,
  setSubtitleStyle,
  setVideoMusic,
  setVideoTransition,
  cutRanges,
  VideoEditValidationError,
  type SubtitleLine,
} from "@/lib/studio/video-edit-contract";

describe("video-edit-contract", () => {
  it("emptyVideoEdit validates cleanly", () => {
    const edit = emptyVideoEdit();
    expect(() => validateVideoEdit(edit)).not.toThrow();
  });

  it("addOverlay appends a hook overlay and bumps revision", () => {
    const edit = addOverlay(emptyVideoEdit(), "hook", "이거 순서가 틀렸다면?", 0, 3);
    expect(edit.overlays).toHaveLength(1);
    expect(edit.overlays[0]).toMatchObject({ kind: "hook", text: "이거 순서가 틀렸다면?", startSec: 0, endSec: 3 });
    expect(edit.revision).toBe(1);
    expect(() => validateVideoEdit(edit)).not.toThrow();
  });

  it("addOverlay then removeOverlay leaves overlays empty", () => {
    let edit = addOverlay(emptyVideoEdit(), "cta", "댓글에 '순서' 남겨줘", 1, 4);
    const id = edit.overlays[0].id;
    edit = removeOverlay(edit, id);
    expect(edit.overlays).toHaveLength(0);
    expect(edit.revision).toBe(2);
  });

  it("updateOverlay changes range without touching id/order", () => {
    let edit = addOverlay(emptyVideoEdit(), "hook", "훅", 0, 2);
    const id = edit.overlays[0].id;
    edit = updateOverlay(edit, id, { endSec: 5 });
    expect(edit.overlays[0].endSec).toBe(5);
    expect(edit.overlays[0].id).toBe(id);
  });

  it("addOverlay rejects an overlay whose endSec is not after startSec (M2: 즉시 던진다, 800ms 뒤 자동저장 400으로 미루지 않는다)", () => {
    expect(() => addOverlay(emptyVideoEdit(), "hook", "훅", 3, 3)).toThrow(VideoEditValidationError);
  });

  it("validateVideoEdit also rejects a persisted payload whose overlay range is invalid (belt-and-suspenders)", () => {
    const edit = { ...emptyVideoEdit(), overlays: [{ id: "ov-x", order: 0, kind: "hook" as const, text: "훅", startSec: 3, endSec: 3 }] };
    expect(() => validateVideoEdit(edit)).toThrow(VideoEditValidationError);
  });

  it("addComment records source=manual for hand-typed social proof and removeComment clears it", () => {
    let edit = addComment(emptyVideoEdit(), { author: "user123", text: "저도 효과봤어요", source: "manual", startSec: 0, endSec: 3 });
    expect(edit.comments).toHaveLength(1);
    expect(edit.comments[0].source).toBe("manual");
    const id = edit.comments[0].id;
    edit = removeComment(edit, id);
    expect(edit.comments).toHaveLength(0);
  });

  it("setSubtitles stores lines and toggleSubtitleCut marks a line for cut, cutRanges reflects it", () => {
    const lines: SubtitleLine[] = [
      { id: "s1", order: 0, text: "첫 줄", startSec: 0, endSec: 2, cut: false },
      { id: "s2", order: 1, text: "둘째 줄", startSec: 2, endSec: 4, cut: false },
    ];
    let edit = setSubtitles(emptyVideoEdit(), lines);
    expect(edit.subtitles).toHaveLength(2);
    edit = toggleSubtitleCut(edit, "s2");
    expect(edit.subtitles.find((s) => s.id === "s2")?.cut).toBe(true);
    expect(cutRanges(edit)).toEqual([{ startSec: 2, endSec: 4 }]);
  });

  it("setVoice records the selected voice and can be cleared back to null", () => {
    let edit = setVoice(emptyVideoEdit(), { voiceId: "v1", voiceName: "차분한 남성" });
    expect(edit.voice).toEqual({ voiceId: "v1", voiceName: "차분한 남성" });
    edit = setVoice(edit, null);
    expect(edit.voice).toBeNull();
  });

  it("S6-CONTRACT-01 정상: 5레인 글 블록·전환·자막 스타일·음악을 한 판에 저장한다", () => {
    let edit = addTextSticker(emptyVideoEdit(), {
      kind: "text", text: "핵심 제목", startSec: 1, endSec: 4, animation: "rise",
    });
    edit = setVideoTransition(edit, "introToMain", "fade");
    edit = setSubtitleStyle(edit, { preset: "box", position: "middle", sizePercent: 120 });
    edit = setVideoMusic(edit, {
      source: "upload", assetId: "music.m4a", label: "내 음악", volume: 35,
      offsetSec: 2, fadeOut: true, duckUnderVoice: true, rightsConfirmed: true,
    });

    expect(() => validateVideoEdit(edit)).not.toThrow();
    expect(edit.textStickers[0]).toMatchObject({ text: "핵심 제목", startSec: 1, endSec: 4 });
    expect(edit.transitions.introToMain).toBe("fade");
    expect(edit.subtitleStyle).toMatchObject({ preset: "box", position: "middle", sizePercent: 120 });
    expect(edit.music?.assetId).toBe("music.m4a");
  });

  it("S6-CONTRACT-02 거절: 사용권 확인 없는 업로드 음악은 저장하지 않는다", () => {
    const edit = {
      ...emptyVideoEdit(),
      music: {
        source: "upload" as const, assetId: "music.m4a", label: "내 음악", volume: 35,
        offsetSec: 0, fadeOut: false, duckUnderVoice: false, rightsConfirmed: false,
      },
    };
    expect(() => validateVideoEdit(edit)).toThrow(VideoEditValidationError);
  });

  it("VIDEO-PREVIEW-LINEAGE-01 글자 없는 합성본 URL을 저장하고 빈 URL은 거절한다", () => {
    const applied = setIntroOutroApplied(emptyVideoEdit(), {
      introCompId: "intro-1",
      outroCompId: null,
      compositeFilename: "composite.mp4",
      compositeDeliverUrl: "/api/media/composite",
      resultFilename: "baked.mp4",
      deliverUrl: "/api/media/baked",
      sourceFilename: "source.mp4",
    });

    expect(() => validateVideoEdit(applied)).not.toThrow();
    expect(applied.introOutro?.compositeDeliverUrl).toBe("/api/media/composite");
    expect(() => validateVideoEdit({
      ...applied,
      introOutro: { ...applied.introOutro, compositeDeliverUrl: "" },
    })).toThrow(VideoEditValidationError);
  });

  it("validateVideoEdit rejects a payload missing contract_version", () => {
    expect(() => validateVideoEdit({ overlays: [], comments: [], subtitles: [], voice: null, revision: 0 })).toThrow(VideoEditValidationError);
  });
});
