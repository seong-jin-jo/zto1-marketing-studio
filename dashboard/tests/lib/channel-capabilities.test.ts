import { describe, expect, it } from "vitest";
import {
  BASE_CHANNEL_TABS,
  CHANNEL_GROUPS,
  PUBLISH_CHANNEL_GROUPS,
  getChannelCapability,
  getChannelTabs,
  getEngagementCapability,
} from "@/lib/channel-capabilities";

describe("R-09 channel capability SSOT", () => {
  it("keeps the five base tabs in the approved order", () => {
    expect(BASE_CHANNEL_TABS).toEqual(["queue", "analytics", "growth", "popular", "settings"]);
  });

  it("keeps Threads Growth and Popular enabled", () => {
    expect(getChannelTabs("threads").map(({ id, disabled }) => [id, disabled])).toEqual([
      ["queue", false],
      ["analytics", false],
      ["growth", false],
      ["popular", false],
      ["settings", false],
    ]);
  });

  it("adds Instagram Editor and keeps unimplemented Growth and Popular discoverable", () => {
    expect(getChannelTabs("instagram").map(({ id, disabled }) => [id, disabled])).toEqual([
      ["queue", false],
      ["editor", false],
      ["analytics", false],
      ["growth", true],
      ["popular", true],
      ["settings", false],
    ]);
  });

  it("removes only structurally impossible messaging tabs", () => {
    expect(getChannelCapability("telegram").removedTabs).toEqual([
      "queue",
      "analytics",
      "growth",
      "popular",
    ]);
    expect(getChannelTabs("telegram").map((tab) => tab.id)).toEqual(["settings"]);
  });

  it("shows video channels consistently without adding them to the existing nine-channel Studio publish set", () => {
    expect(CHANNEL_GROUPS.flatMap((group) => [...group.channels])).toContain("youtube");
    expect(CHANNEL_GROUPS.flatMap((group) => [...group.channels])).toContain("tiktok");
    expect(PUBLISH_CHANNEL_GROUPS.flatMap((group) => [...group.channels])).toHaveLength(9);
    expect(PUBLISH_CHANNEL_GROUPS.flatMap((group) => [...group.channels])).not.toContain("youtube");
    expect(PUBLISH_CHANNEL_GROUPS.flatMap((group) => [...group.channels])).not.toContain("tiktok");
  });

  it("BE-V63-07 정상 경로: Threads 댓글 읽기와 답글과 좋아요를 지원한다", () => {
    const capability = getEngagementCapability("threads");
    expect(capability.read.supported).toBe(true);
    expect(capability.reply.supported).toBe(true);
    expect(capability.like.supported).toBe(true);
  });

  it("BE-V63-07 거절 경로: TikTok 댓글 계약 부재 이유를 숨기지 않는다", () => {
    const capability = getEngagementCapability("tiktok");
    expect(capability.read.supported).toBe(false);
    expect(capability.read.reason).toContain("Content Posting API");
    expect(capability.read.reason).toContain("Research API");
  });
});
