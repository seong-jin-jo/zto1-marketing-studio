import { describe, expect, it } from "vitest";
import fs from "fs";
import path from "path";
import { channelImageCapacity, PUBLISH_IMAGE_LIMIT } from "@/lib/studio/channel-image-capacity";

/**
 * 2026-09-14 교차리뷰(Codex) 지적: 서버는 이미지 열 장까지 다 받아 주는데 여러 장을 실제로
 * 올리는 발행 함수는 인스타그램 하나뿐이었다. 나머지 채널로 여러 장을 보내면 첫 장만
 * 올라가고 나머지는 조용히 사라진다. 외부 게시는 되돌릴 수 없으므로 조용히 버리지 않고
 * 시작 전에 막는다.
 */
const routeSrc = fs.readFileSync(path.resolve(__dirname, "../../src/app/api/publish/route.ts"), "utf8");

describe("발행 API 채널별 이미지 장수 계약", () => {
  it("여러 장을 못 올리는 채널에는 여러 장 요청을 거절한다", () => {
    expect(routeSrc).toContain("channelImageCapacity(String(platform))");
    expect(routeSrc).toContain("CHANNEL_IMAGE_CAPACITY_EXCEEDED");
    // 거절은 외부 게시를 시작하기 전에 일어나야 한다.
    expect(routeSrc.indexOf("CHANNEL_IMAGE_CAPACITY_EXCEEDED")).toBeLessThan(routeSrc.indexOf("getChannelCred("));
  });

  it("상한값은 규격표 한 자리에서만 온다", () => {
    expect(routeSrc).toContain("image_urls.length > PUBLISH_IMAGE_LIMIT");
    expect(PUBLISH_IMAGE_LIMIT).toBe(10);
    expect(channelImageCapacity("threads")).toBe(1);
    expect(channelImageCapacity("instagram")).toBe(PUBLISH_IMAGE_LIMIT);
  });
});
