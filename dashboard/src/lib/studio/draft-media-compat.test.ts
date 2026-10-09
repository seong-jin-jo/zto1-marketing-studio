import { describe, expect, it } from "vitest";
import { draftImageSource, draftVideoSource, normalizeDraftImage, normalizeDraftVideo } from "./draft-media-compat";

describe("운영 초안 미디어 구형·신형 호환", () => {
  it("R7-MEDIA-01 정상: 현재 img/vid 객체를 보존한다", () => {
    expect(normalizeDraftImage({ img: { file: "/new.jpg", url: "/delivery.jpg", filename: "new.jpg" } })).toMatchObject({
      file: "/new.jpg", url: "/delivery.jpg", filename: "new.jpg", imageUrls: ["/new.jpg"],
    });
    expect(normalizeDraftVideo({ vid: { file: "/old.mp4", url: "/fresh.mp4", filename: "clip.mp4" } })).toMatchObject({
      file: "/old.mp4", url: "/fresh.mp4", filename: "clip.mp4",
    });
  });

  it("R7-MEDIA-02 경계: 운영 구형 최상위 필드도 카드·발행 미디어가 된다", () => {
    const legacy = {
      image_urls: ["/operational-960x1696.jpg"],
      imageUrl: "/fallback.jpg",
      videoUrl: "/api/exports/deliver/expired-token",
    };
    expect(draftImageSource(legacy)).toBe("/operational-960x1696.jpg");
    expect(draftVideoSource(legacy)).toBe("/api/exports/deliver/expired-token");
  });

  it("R7-MEDIA-03 거절: 미디어 문자열이 전혀 없으면 빈 객체를 만들지 않는다", () => {
    expect(normalizeDraftImage({ img: { imageUrls: [null, ""] } })).toBeNull();
    expect(normalizeDraftVideo({ vid: { file: "" } })).toBeNull();
  });
});
