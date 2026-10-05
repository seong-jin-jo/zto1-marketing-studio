import { describe, expect, it } from "vitest";

import { channelPageHref, resolveChannelPage } from "@/lib/channel-route";

describe("채널 화면 별칭 계약", () => {
  it("CHANNEL-ALIAS-01 정상: Shorts·Reels 별칭을 실제 채널 화면으로 보낸다", () => {
    expect(channelPageHref("shorts")).toBe("/channels/youtube");
    expect(channelPageHref("reels")).toBe("/channels/instagram");
    expect(resolveChannelPage("shorts")).toEqual({ channel: "youtube", redirectTo: "/channels/youtube" });
    expect(resolveChannelPage("reels")).toEqual({ channel: "instagram", redirectTo: "/channels/instagram" });
  });

  it("CHANNEL-ALIAS-02 거절: 대응 채널 페이지가 없는 플랫폼은 링크를 만들지 않는다", () => {
    expect(channelPageHref("unknown-video-provider")).toBeNull();
    expect(resolveChannelPage("unknown-video-provider")).toBeNull();
  });
});
