import { describe, expect, it } from "vitest";
import { partitionBlockedPublishTargets } from "@/lib/studio/publish-partial-block";
import { validatePlatformPublish, type PlatformPublishInput } from "@/lib/studio/platform-publish-fields";

// 2026-09-16 실측(j.the.great.investor): 발행실에서 X 본문이 280 가중 문자를 넘으면(316)
// "본문과 해시태그가 280가중 문자를 초과했습니다" 토스트만 뜨고 Threads·YouTube 등 다른
// 채널 발행까지 전부 시작되지 않았다. studio/page.tsx publish() 가 publishTargets 중
// "첫 번째로 걸리는 것"만 찾아 전체를 막았기 때문이다. 한도 넘는 채널만 빼고 나머지는
// 그대로 발행해야 한다.
describe("한도를 넘은 채널만 발행에서 뺀다", () => {
  const longX = "가".repeat(200); // X 가중 문자 한도(280) 초과
  const shortBody: PlatformPublishInput = { body: "짧은 본문" };
  const longBody: PlatformPublishInput = { body: longX };

  it("X만 한도를 넘으면 X만 blocked, 나머지는 allowed로 나뉜다", () => {
    const targets = ["x", "threads", "shorts"] as const;
    const inputByPlatform: Record<string, PlatformPublishInput> = {
      x: longBody,
      threads: shortBody,
      shorts: shortBody,
    };
    const { blocked, allowed } = partitionBlockedPublishTargets(
      targets,
      (p) => validatePlatformPublish(p, inputByPlatform[p]).blocking[0],
    );
    expect(blocked.map((entry) => entry.platform)).toEqual(["x"]);
    expect(blocked[0].issue.message).toContain("280가중 문자");
    expect(allowed).toEqual(["threads", "shorts"]);
  });

  it("아무도 한도를 안 넘으면 blocked가 비고 전부 allowed다", () => {
    const targets = ["x", "threads"] as const;
    const { blocked, allowed } = partitionBlockedPublishTargets(
      targets,
      (p) => validatePlatformPublish(p, shortBody).blocking[0],
    );
    expect(blocked).toEqual([]);
    expect(allowed).toEqual(["x", "threads"]);
  });

  it("전부 한도를 넘으면 allowed가 빈다(이때만 발행 자체를 멈춰야 한다)", () => {
    const targets = ["x"] as const;
    const { blocked, allowed } = partitionBlockedPublishTargets(
      targets,
      (p) => validatePlatformPublish(p, longBody).blocking[0],
    );
    expect(blocked.map((entry) => entry.platform)).toEqual(["x"]);
    expect(allowed).toEqual([]);
  });
});
