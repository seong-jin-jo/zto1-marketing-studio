import fs from "node:fs";
import path from "node:path";
import { afterEach, describe, expect, it, vi } from "vitest";
import { CHANNEL_TEXT_LIMITS, CHANNEL_TEXT_LIMIT_SOURCES } from "@/lib/channel-text-limits";
import { publishFacebook, publishThreads } from "@/lib/publish";

const readSource = (relativePath: string) =>
  fs.readFileSync(path.join(process.cwd(), relativePath), "utf8");

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("채널 글자수 SSOT", () => {
  it("공식 한도와 근거 URL을 단일 모듈에서 제공한다", () => {
    expect(CHANNEL_TEXT_LIMITS).toMatchObject({
      x: 280,
      threads: 500,
      instagram: 2_200,
      linkedin: 3_000,
      bluesky: 300,
    });
    expect(CHANNEL_TEXT_LIMIT_SOURCES.x).toMatch(/^https:\/\/docs\.x\.com\//);
    expect(CHANNEL_TEXT_LIMIT_SOURCES.threads).toMatch(/^https:\/\/developers\.facebook\.com\//);
    expect(CHANNEL_TEXT_LIMITS).not.toHaveProperty("facebook");
    expect(CHANNEL_TEXT_LIMIT_SOURCES.bluesky).toMatch(/^https:\/\/docs\.bsky\.app\//);
  });

  it("생성·검증·채널 화면·발행 4곳이 같은 SSOT를 참조한다", () => {
    const consumers = [
      "src/app/api/studio/text/route.ts",
      "src/app/api/content/validate/route.ts",
      "src/components/channel/ChannelPage.tsx",
      "src/lib/publish.ts",
    ];
    for (const consumer of consumers) {
      expect(readSource(consumer), consumer).toContain("@/lib/channel-text-limits");
    }
  });

  it("Studio와 미리보기가 Facebook 전용 본문을 사용하고 채널별 카운터를 노출한다", () => {
    const studio = readSource("src/app/studio/page.tsx");
    const preview = readSource("src/components/studio/PlatformPreview.tsx");
    expect(studio).toContain("@/lib/channel-text-limits");
    expect(studio).toContain('p === "facebook"');
    expect(studio).toContain("text.facebook");
    expect(preview).toContain("text.facebook");
    expect(preview).toContain("@/lib/studio/platform-publish-fields");
    expect(preview).toContain("data-testid={`character-count-${p}`}");
  });
});

describe("Threads 외부 발행 상한과 Facebook 미확정 상한", () => {
  it("Threads 500자 초과는 신원 조회나 container 생성 전에 거부한다", async () => {
    const fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);

    const result = await publishThreads({ token: "threads-token" }, "가".repeat(501));

    expect(result).toMatchObject({ ok: false });
    expect(result.error).toContain("500");
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("Facebook은 확인되지 않은 63,206자 상한으로 외부 발행을 막지 않는다", async () => {
    const fetchMock = vi.fn(async () => new Response(JSON.stringify({ id: "post-1" }), { status: 200 }));
    vi.stubGlobal("fetch", fetchMock);

    const result = await publishFacebook(
      { token: "facebook-token", userId: "page-1" },
      "a".repeat(63_207),
    );

    expect(result).toMatchObject({ ok: true, externalId: "post-1" });
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });
});
