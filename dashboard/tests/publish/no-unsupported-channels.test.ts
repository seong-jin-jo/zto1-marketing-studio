import { describe, it, expect } from "vitest";
import { PUBLISH_CHANNEL_GROUPS, SCHEDULABLE_PLATFORMS, CH_LABELS } from "@/lib/constants";

// P0 SNS QA remediation (2026-07-16): PUBLISH_CHANNEL_GROUPS previously exposed 15 channels in
// Sidebar/Settings>Channels/ChannelConnect while /api/publish only implements 8 (SCHEDULABLE_PLATFORMS).
// That gap let a user "connect" linkedin/pinterest/tumblr/tiktok/youtube/naver_blog/line and believe
// it was publish-ready when POST /api/publish would just reject with "{platform} 미지원".
// This test locks PUBLISH_CHANNEL_GROUPS to exactly the 8 directly-publishable channels.

// 2026-09-08: linkedin 은 텍스트 발행 구현으로 지원 채널이 됐다. 미지원 목록에서 뺀다.
const UNSUPPORTED = ["pinterest", "tumblr", "tiktok", "youtube", "naver_blog", "line"];

// 2026-09-08: 링크드인 텍스트 발행을 구현해 /api/publish 가 분기 처리한다. 여덟에서 아홉이 됐다.
describe("PUBLISH_CHANNEL_GROUPS — 직접 발행 가능 9채널만 노출", () => {
  it("그룹 내 채널 전체가 SCHEDULABLE_PLATFORMS(=/api/publish 실지원)와 정확히 일치한다", () => {
    const flat = PUBLISH_CHANNEL_GROUPS.flatMap((g) => [...g.channels]).sort();
    expect(flat).toEqual([...SCHEDULABLE_PLATFORMS].sort());
    expect(flat).toHaveLength(9);
  });

  it("미지원 6채널(OAuth 앱은 등록됐지만 실발행 분기 없음)은 어떤 그룹에도 없다", () => {
    const flat = PUBLISH_CHANNEL_GROUPS.flatMap((g) => [...g.channels]);
    for (const u of UNSUPPORTED) {
      expect(flat, `${u}는 노출되면 안 됨`).not.toContain(u);
    }
  });

  it("빈 video/blog 그룹은 삭제됐다", () => {
    const keys = PUBLISH_CHANNEL_GROUPS.map((g) => g.key);
    expect(keys).not.toContain("video");
    expect(keys).not.toContain("blog");
    expect(keys.sort()).toEqual(["messaging", "social"].sort());
  });

  it("social 그룹 = threads/x/instagram/facebook/linkedin/bluesky, messaging 그룹 = telegram/discord/slack", () => {
    const social = PUBLISH_CHANNEL_GROUPS.find((g) => g.key === "social");
    const messaging = PUBLISH_CHANNEL_GROUPS.find((g) => g.key === "messaging");
    expect([...(social?.channels ?? [])].sort()).toEqual(["bluesky", "facebook", "instagram", "linkedin", "threads", "x"].sort());
    expect([...(messaging?.channels ?? [])].sort()).toEqual(["discord", "slack", "telegram"].sort());
  });

  it("노출되는 모든 채널은 CH_LABELS에 라벨을 갖는다(기존 라벨/네이밍 보존)", () => {
    for (const g of PUBLISH_CHANNEL_GROUPS) {
      for (const c of g.channels) {
        expect(CH_LABELS[c], `${c} 라벨 누락`).toBeTruthy();
      }
    }
  });
});

describe("ChannelConnect 모달 — CHANNELS/OAUTH_LABELS가 PUBLISH_CHANNEL_GROUPS를 소비한다", () => {
  it("CHANNELS는 자체 하드코딩 목록이 아니라 PUBLISH_CHANNEL_GROUPS를 flatten한다", async () => {
    const fs = await import("fs");
    const path = await import("path");
    const src = fs.readFileSync(
      path.resolve(__dirname, "../../src/components/studio/ChannelConnect.tsx"),
      "utf8",
    );
    expect(src).toMatch(/PUBLISH_CHANNEL_GROUPS\.flatMap/);
    // 예전 15개 하드코딩 배열이 되살아나면 실패 — linkedin/youtube/naver_blog/pinterest/tumblr/tiktok/line
    // 중 하나라도 CHANNELS 상수 정의 라인에 하드코딩되면 드리프트.
    for (const u of UNSUPPORTED) {
      expect(src.includes(`"${u}"`), `${u}가 ChannelConnect.tsx에 하드코딩되면 안 됨`).toBe(false);
    }
  });

  it("OAUTH_LABELS는 실제 end-to-end OAuth 4채널(threads/instagram/x/facebook)만 갖는다", async () => {
    const fs = await import("fs");
    const path = await import("path");
    const src = fs.readFileSync(
      path.resolve(__dirname, "../../src/components/studio/ChannelConnect.tsx"),
      "utf8",
    );
    const match = src.match(/const OAUTH_LABELS[^}]+\{([^}]+)\}/);
    expect(match, "OAUTH_LABELS 정의를 찾을 수 없음").toBeTruthy();
    const body = match![1];
    expect(body).toMatch(/threads:/);
    expect(body).toMatch(/instagram:/);
    expect(body).toMatch(/x:/);
    expect(body).toMatch(/facebook:/);
    for (const u of UNSUPPORTED) {
      expect(body.includes(`${u}:`), `${u}가 OAUTH_LABELS에 있으면 안 됨(manual credential 채널)`).toBe(false);
    }
  });
});
