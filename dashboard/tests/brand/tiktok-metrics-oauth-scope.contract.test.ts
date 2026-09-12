import { describe, expect, it } from "vitest";

import { PROVIDERS } from "@/lib/social-connect";

describe("TikTok 성과 조회 OAuth 범위 계약", () => {
  it("METRICS-TIKTOK-OAUTH-01 정상: 연결 동의에 발행과 영상 조회 범위를 함께 요청한다", () => {
    expect(PROVIDERS.tiktok.scopes).toEqual(expect.arrayContaining([
      "user.info.basic",
      "video.publish",
      "video.list",
    ]));
  });
});
