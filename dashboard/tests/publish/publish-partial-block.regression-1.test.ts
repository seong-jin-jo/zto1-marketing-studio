import { describe, expect, it } from "vitest";
import { readFileSync } from "fs";
import { resolve } from "path";
import { blockedPublishFailures, partitionBlockedPublishTargets } from "@/lib/studio/publish-partial-block";
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

  it("CODE-REVIEW-20260917-01 정상: 제외 채널을 실패 결과와 사용자 메시지에 남긴다", () => {
    const issue = { field: "body", message: "X 본문은 최대 280자입니다.", severity: "blocking" as const };
    const result = blockedPublishFailures([{ platform: "x", issue }], (platform) => platform.toUpperCase());

    expect(result.status).toEqual({ x: "failed" });
    expect(result.errors).toEqual({ x: issue.message });
    expect(result.messages).toEqual([`X: ${issue.message}`]);
  });

  it("CODE-REVIEW-20260917-02 거절: 제외 채널이 없으면 거짓 실패 결과를 만들지 않는다", () => {
    expect(blockedPublishFailures([], (platform: string) => platform)).toEqual({
      status: {},
      errors: {},
      messages: [],
    });
  });

  it("CODE-REVIEW-20260917-03 문구: 제외 안내에 금지된 긴 대시를 쓰지 않는다", () => {
    const pageSource = readFileSync(resolve(process.cwd(), "src/app/studio/page.tsx"), "utf8");
    expect(pageSource).not.toContain("한도를 넘은 곳은 빼고 발행합니다 —");
    expect(pageSource).toContain("한도를 넘은 곳은 빼고 발행합니다. ");
  });
});
