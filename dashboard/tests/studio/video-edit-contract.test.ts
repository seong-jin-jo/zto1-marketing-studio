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

  it("rejects an overlay whose endSec is not after startSec", () => {
    const edit = addOverlay(emptyVideoEdit(), "hook", "훅", 3, 3);
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

  it("validateVideoEdit rejects a payload missing contract_version", () => {
    expect(() => validateVideoEdit({ overlays: [], comments: [], subtitles: [], voice: null, revision: 0 })).toThrow(VideoEditValidationError);
  });
});
