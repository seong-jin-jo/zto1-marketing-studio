import { describe, expect, it } from "vitest";
import {
  PLATFORM_FIELD_CONTRACT,
  buildPlatformPublishText,
  validatePlatformPublish,
} from "@/lib/studio/platform-publish-fields";

describe("PUB-FIELD-01 플랫폼별 실제 입력 필드", () => {
  it("정상: Threads 주제 태그와 Shorts 제목만 해당 플랫폼에 노출한다", () => {
    expect(PLATFORM_FIELD_CONTRACT.threads).toMatchObject({ topicTag: true, hashtags: false, title: false });
    expect(PLATFORM_FIELD_CONTRACT.shorts).toMatchObject({ topicTag: false, hashtags: true, title: true });
    expect(PLATFORM_FIELD_CONTRACT.facebook.unknownLimitLabel).toBe("본문 상한은 규격 확인 필요");
  });

  it("거절: Threads 주제 태그의 금지 문자와 길이를 차단한다", () => {
    const invalid = validatePlatformPublish("threads", { body: "정상 본문", topicTag: `${"가".repeat(50)}.` });
    expect(invalid.blocking.map((issue) => issue.field)).toEqual(["topicTag", "topicTag"]);
  });
});

describe("PUB-LIMIT-01 플랫폼별 하드 한도", () => {
  it("정상: X 공식 가중 문자 계산은 한글 140자를 280으로 계산한다", () => {
    const result = validatePlatformPublish("x", { body: "가".repeat(140) });
    expect(result.blocking).toEqual([]);
    expect(result.counters.body).toEqual({ current: 280, limit: 280, unit: "가중 문자" });
  });

  it("거절: X 한글 141자는 외부 발행 전에 차단한다", () => {
    const result = validatePlatformPublish("x", { body: "가".repeat(141) });
    expect(result.blocking[0]).toMatchObject({ field: "body" });
    expect(result.counters.body?.current).toBe(282);
  });

  it("거절: Instagram 캡션과 해시태그 합계 및 30개 태그를 함께 검사한다", () => {
    const hashtags = Array.from({ length: 31 }, (_, index) => `#태그${index}`).join(" ");
    const result = validatePlatformPublish("instagram", { body: "가".repeat(2_200), hashtags });
    expect(result.blocking.map((issue) => issue.field)).toEqual(["body", "hashtags"]);
  });

  it("정상: Facebook은 확인되지 않은 숫자 상한을 만들지 않는다", () => {
    const result = validatePlatformPublish("facebook", { body: "가".repeat(70_000), hashtags: "#소식" });
    expect(result.blocking).toEqual([]);
    expect(result.counters).toEqual({});
  });

  it("거절: Shorts 설명은 UTF-8 바이트, TikTok 캡션은 UTF-16 단위로 검사한다", () => {
    expect(validatePlatformPublish("shorts", { title: "정상", body: "가".repeat(1_667) }).blocking[0])
      .toMatchObject({ field: "body" });
    expect(validatePlatformPublish("tiktok", { body: "😀".repeat(1_101) }).blocking[0])
      .toMatchObject({ field: "body" });
  });

  it("정상: 플랫폼별 최종 발행 문자열에 제목과 해시태그를 빠뜨리지 않는다", () => {
    expect(buildPlatformPublishText("shorts", { title: "제목", body: "설명", hashtags: "#태그" }))
      .toBe("제목\n\n설명\n\n#태그");
    expect(buildPlatformPublishText("instagram", { body: "캡션", hashtags: "#태그" }))
      .toBe("캡션\n\n#태그");
  });
});
