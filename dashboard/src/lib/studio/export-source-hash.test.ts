import { describe, expect, it } from "vitest";
import { createPlainCardDeckV3 } from "./card-element-commands";
import { canonicalJson, cardDeckExportSource, firstEmptySlide, videoExportSource, VideoExportSourceError } from "./export-source-hash";
import { emptyVideoEdit } from "./video-edit-contract";

describe("S3 내보내기 source hash 계약", () => {
  it("S3-HASH-01 정상: 객체 key 순서와 무관하게 같은 canonical JSON을 만든다", () => {
    expect(canonicalJson({ b: 2, a: { d: 4, c: 3 } })).toBe(canonicalJson({ a: { c: 3, d: 4 }, b: 2 }));
  });

  it("S3-HASH-02 정상: 덱 revision과 64자리 hash를 반환한다", () => {
    const deck = createPlainCardDeckV3(["첫 장", "마지막 장"], "deck_export_hash");
    deck.revision = 13;
    const source = cardDeckExportSource(deck);
    expect(source.sourceRevision).toBe(13);
    expect(source.sourceHash).toMatch(/^[0-9a-f]{64}$/);
  });

  it("S3-HASH-03 거절: content_state empty의 첫 순서를 반환한다", () => {
    const deck = createPlainCardDeckV3(["첫 장", "마지막 장"], "deck_export_empty");
    deck.slides[1].content_state = "empty";
    expect(firstEmptySlide(deck)).toEqual({ order: 1, number: 2, item_key: deck.slides[1].id });
  });

  it("S6-MAJOR2-01 정상: 인트로 합성본을 렌더 원본으로 쓰면 모든 본문 시간층을 인트로 길이만큼 옮긴다", () => {
    const edit = {
      ...emptyVideoEdit(),
      subtitles: [{ id: "s1", order: 0, text: "첫 자막", startSec: 0, endSec: 1.5, cut: false }],
      overlays: [{ id: "o1", order: 0, kind: "hook" as const, text: "첫 훅", startSec: 0.2, endSec: 1.2 }],
      comments: [{ id: "c1", order: 0, author: "실사용자", text: "첫 댓글", source: "collected" as const, startSec: 0.4, endSec: 1.4 }],
      introOutro: {
        introCompId: "intro-logo-reveal", outroCompId: null, sourceFilename: "original.mp4",
        compositeFilename: "composite.mp4", resultFilename: "composite.mp4", introDurationSec: 2,
        renderedCutRanges: [], deliverUrl: "/api/media/composite",
      },
    };
    const source = videoExportSource({
      videoEdit: edit,
      vid: { editSource: { filename: "original.mp4", url: "/api/media/original" } },
      editLines: ["첫 자막"],
      editFormat: { subtitleSize: "보통" },
    }, "tenant-s6");
    expect(source.sourceFilename).toBe("composite.mp4");
    expect(source.edit.subtitles[0]).toMatchObject({ startSec: 2, endSec: 3.5 });
    expect(source.edit.overlays[0]).toMatchObject({ startSec: 2.2, endSec: 3.2 });
    expect(source.edit.comments[0]).toMatchObject({ startSec: 2.4, endSec: 3.4 });
  });

  it("S4-LOCAL-01 정상: 편집 조작이 없는 생성 영상도 빈 편집 계약과 실제 대본으로 내보낸다", () => {
    const source = videoExportSource({
      videoEdit: emptyVideoEdit(),
      vid: { filename: "vid_1791634673480.mp4", subtitlesBaked: false, subtitleLineageState: "unbaked" },
      editLines: ["첫 장면", "두 번째 장면"],
      editFormat: { subtitleSize: "보통" },
    }, "tenant-local");
    expect(source.sourceFilename).toBe("vid_1791634673480.mp4");
    expect(source.lines).toEqual(["첫 장면", "두 번째 장면"]);
    expect(source.sourceRevision).toBe(0);
  });

  it("S6-MAJOR3-01 거절: 자막이 이미 구운 영상인데 글자 없는 원본 계보가 없으면 다시 굽지 않는다", () => {
    expect(() => videoExportSource({
      videoEdit: emptyVideoEdit(),
      vid: {
        filename: "subtitle-11111111-1111-4111-8111-111111111111.mp4",
        subtitlesBaked: true,
      },
    }, "tenant-s6")).toThrow(expect.objectContaining<Partial<VideoExportSourceError>>({
      code: "SUBTITLE_INPUT_ALREADY_BAKED",
    }));
  });

  it("S6-MAJOR3-02 정상: 구운 현재 영상은 저장된 글자 없는 원본으로만 다시 굽는다", () => {
    const source = videoExportSource({
      videoEdit: emptyVideoEdit(),
      vid: {
        filename: "subtitle-11111111-1111-4111-8111-111111111111.mp4",
        subtitlesBaked: true,
        editSource: { filename: "vid_1728000000000.mp4", url: "/api/media/original" },
      },
    }, "tenant-s6");
    expect(source.sourceFilename).toBe("vid_1728000000000.mp4");
  });
});
