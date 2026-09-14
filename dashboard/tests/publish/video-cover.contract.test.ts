import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { DEFAULT_COVER_SECONDS, coverTimestampMs, coverUnsupportedReason, supportsCoverTimestamp } from "@/lib/video-cover";

// 2026-09-09 회장 지적: "영상에서는 뭘 대문 썸네일로 지정할지도 세팅해야하지않나 API있지."
// 실제로 있었고 우리가 안 쓰고 있었다. 안 주면 플랫폼이 첫 프레임을 쓰는데, 숏폼에서 첫
// 프레임은 대개 아직 아무것도 안 보이는 순간이라 가장 나쁜 대문이 된다.
// 계약: 시점으로 정할 수 있는 채널에는 그 값을 실제로 보내고, 못 하는 채널은 그 사실을 적는다.
const src = (p: string) => readFileSync(resolve(__dirname, "../../src", p), "utf8");

describe("영상 대문 시점", () => {
  it("시점으로 정할 수 있는 채널만 지원한다고 말한다", () => {
    expect(supportsCoverTimestamp("tiktok")).toBe(true);
    expect(supportsCoverTimestamp("reels")).toBe(true);
    // YouTube 는 이미지를 따로 올려야 한다. 시점으로는 안 된다.
    for (const platform of ["shorts", "youtube", "threads", null, ""]) {
      expect(supportsCoverTimestamp(platform), `${platform} 를 지원한다고 말하면 안 된다`).toBe(false);
    }
  });

  it("못 하는 채널은 침묵하지 않고 이유를 적는다", () => {
    expect(coverUnsupportedReason("shorts")).toContain("YouTube");
    expect(coverUnsupportedReason("tiktok")).toBeNull();
  });

  it("잘못된 값은 기본값으로 접는다", () => {
    // 잘못된 값을 그대로 보내면 플랫폼이 발행 자체를 거절하는데, 그 이유가 대문 때문이라는
    // 것을 화면에서 알 길이 없다.
    for (const bad of [-1, NaN, 99999, "abc", null, undefined]) {
      expect(coverTimestampMs(bad), `${String(bad)} 가 그대로 나갔다`).toBe(DEFAULT_COVER_SECONDS * 1000);
    }
    expect(coverTimestampMs(2.5)).toBe(2500);
    expect(coverTimestampMs("3")).toBe(3000);
  });

  it("두 플랫폼 API 에 각자의 이름으로 실제로 실린다", () => {
    // 같은 뜻인데 이름과 단위가 다르다. 하나로 뭉뚱그리면 그 플랫폼에서는 안 먹는다.
    expect(src("lib/tiktok.ts")).toContain("video_cover_timestamp_ms");
    expect(src("lib/publish.ts")).toContain("thumb_offset");
    expect(src("app/api/video/publish/route.ts")).toContain("coverTimestampMs");
  });

  it("화면이 그 값을 고르게 하고 발행에 실어 보낸다", () => {
    const page = src("app/studio/page.tsx");
    expect(page).toContain("data-cover-seconds={platform}");
    expect(page).toMatch(/cover_seconds: supportsCoverTimestamp\(p\)/);
    // 못 하는 채널에는 칸을 주지 않되 이유는 보인다.
    expect(page).toContain("data-cover-note={platform}");
  });
});
