import { describe, expect, it } from "vitest";
import {
  resolveUnbakedVideoSource,
  resolveVideoPublishFilename,
  resolveVideoRenderSourceFilename,
} from "@/lib/studio/video-publish-filename";

// 2026-10-02 회장 반려: 인트로/아웃트로를 적용해도 발행 요청이 원본 파일명을 그대로
// 보내고 있었다("화면은 적용됐다고 하는데 실제로 올라가는 파일은 원본"). 이 테스트는
// 고치기 전에 돌리면 실패했다(resolveVideoPublishFilename이 존재하지 않아 import 자체가
// 깨졌다 — 회귀 1호). 지금은 production page.tsx가 이 함수로 발행 파일명을 고른다.
describe("resolveVideoPublishFilename", () => {
  it("인트로/아웃트로가 적용돼 있으면 합성 결과 파일명을 쓴다", () => {
    const original = "video-abc123.mp4";
    const applied = {
      introCompId: "intro-logo-reveal" as const,
      outroCompId: null,
      resultFilename: "video-concat-xyz.mp4",
      deliverUrl: "/api/media/signed-token",
      sourceFilename: original,
    };
    expect(resolveVideoPublishFilename(original, applied)).toBe("video-concat-xyz.mp4");
    expect(resolveVideoPublishFilename(original, applied)).not.toBe(original);
    expect(resolveVideoRenderSourceFilename(original, applied)).toBe("video-concat-xyz.mp4");
  });

  it("적용된 것이 없으면 원본 파일명을 그대로 쓴다", () => {
    expect(resolveVideoPublishFilename("video-abc123.mp4", null)).toBe("video-abc123.mp4");
  });

  // 2026-10-02 독립 리뷰 M-4: 합성 당시의 원본과 지금 원본이 다르면(생성실에서 영상을
  // 다시 만든 뒤) 낡은 합성을 발행에 쓰면 안 된다 — 전혀 다른 옛 영상이 올라간다.
  it("원본이 합성 당시와 달라졌으면(생성실 재생성) 낡은 합성을 버리고 지금 원본을 쓴다", () => {
    const stale = {
      introCompId: "intro-logo-reveal" as const,
      outroCompId: null,
      resultFilename: "video-concat-old.mp4",
      deliverUrl: "/api/media/signed-token-old",
      sourceFilename: "video-OLD.mp4",
    };
    expect(resolveVideoPublishFilename("video-NEW.mp4", stale)).toBe("video-NEW.mp4");
    expect(resolveVideoPublishFilename("video-NEW.mp4", stale)).not.toBe("video-concat-old.mp4");
  });
});

describe("resolveUnbakedVideoSource", () => {
  it("VIDEO-BAKED-LINEAGE-01 저장된 자막 없는 원본 계보를 재굽기 입력으로 쓴다", () => {
    expect(resolveUnbakedVideoSource({
      currentFilename: "baked.mp4",
      currentUrl: "/api/media/baked",
      lineage: {
        subtitlesBaked: true,
        editSource: { filename: "source.mp4", url: "/api/media/source" },
      },
      introOutro: null,
    })).toEqual({ ok: true, filename: "source.mp4", url: "/api/media/source" });
  });

  it("VIDEO-BAKED-LINEAGE-02 인트로 합성 원본 URL이 없는 기존 구운 결과에 구운 deliverUrl을 원본으로 붙이지 않는다", () => {
    expect(resolveUnbakedVideoSource({
      currentFilename: "baked.mp4",
      currentUrl: "/api/media/baked",
      lineage: {
        subtitlesBaked: true,
        // 교차리뷰에서 적발된 이전 구현의 오염 계보: 파일명은 글자 없는 합성본인데
        // URL은 첫 굽기 뒤 갱신된 구운 결과다. 값이 있다고 무조건 신뢰하면 안 된다.
        editSource: { filename: "composite.mp4", url: "/api/media/baked" },
      },
      introOutro: {
        introCompId: "intro-logo-reveal",
        outroCompId: null,
        compositeFilename: "composite.mp4",
        resultFilename: "baked.mp4",
        deliverUrl: "/api/media/baked",
        sourceFilename: "source.mp4",
      },
    })).toEqual({ ok: false, reason: "unbaked_source_missing" });
  });

  it("VIDEO-BAKED-LINEAGE-03 첫 굽기 전 기존 인트로 합성 결과는 deliverUrl을 안전한 원본으로 쓴다", () => {
    expect(resolveUnbakedVideoSource({
      currentFilename: "source.mp4",
      currentUrl: "/api/media/source",
      lineage: {},
      introOutro: {
        introCompId: "intro-logo-reveal",
        outroCompId: null,
        compositeFilename: "composite.mp4",
        resultFilename: "composite.mp4",
        deliverUrl: "/api/media/composite",
        sourceFilename: "source.mp4",
      },
    })).toEqual({ ok: true, filename: "composite.mp4", url: "/api/media/composite" });
  });

  it("VIDEO-BAKED-LINEAGE-04 인트로가 없어도 구운 표식만 있고 원본이 없으면 재굽기를 거절한다", () => {
    expect(resolveUnbakedVideoSource({
      currentFilename: "baked.mp4",
      currentUrl: "/api/media/baked",
      lineage: { subtitlesBaked: true },
      introOutro: null,
    })).toEqual({ ok: false, reason: "unbaked_source_missing" });
  });

  it("VIDEO-BAKED-LINEAGE-08 표시 없는 기존 파일을 서버가 미확인으로 판정하면 재굽지 않는다", () => {
    expect(resolveUnbakedVideoSource({
      currentFilename: "11111111-1111-4111-8111-111111111111.mp4",
      currentUrl: "/api/media/legacy",
      lineage: { state: "unknown" },
      introOutro: null,
    })).toEqual({ ok: false, reason: "unbaked_source_missing" });
  });

  it("VIDEO-BAKED-LINEAGE-09 서버 기록에서 되찾은 원본만 기존 작업물 재굽기에 쓴다", () => {
    expect(resolveUnbakedVideoSource({
      currentFilename: "subtitle-11111111-1111-4111-8111-111111111111.mp4",
      currentUrl: "/api/media/baked",
      lineage: {
        state: "baked",
        editSource: { filename: "source.mp4", url: "/api/media/source" },
      },
      introOutro: null,
    })).toEqual({ ok: true, filename: "source.mp4", url: "/api/media/source" });
  });
});
