// M-B(2026-10-02 재재검토): findRecentProviderPost의 정확 일치 비교가 실제 공급자
// 응답의 두 가지 현실을 못 견뎠다 — ①Meta가 캡션 공백을 다듬는 경우(정규화 불일치)
// ②그 시간대에 뭔가 올라갔는데 캡션이 안 맞는 모호한 경우(여전히 absent로 단정하면
// 재발행이 실제로 두 번째 게시물을 만든다). 이 테스트는 lib/publish.ts의 실제 구현을
// 직접 호출해(mock으로 흉내내지 않고) 두 경우가 found/unknown으로 올바르게 갈리는지
// 확인한다.
import { afterEach, describe, expect, it, vi } from "vitest";
import { findRecentProviderPost } from "@/lib/publish";

const NOW = new Date("2026-10-02T12:00:00.000Z");

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("findRecentProviderPost — instagram(릴스가 쓰는 readback 경로)", () => {
  it("정확히 같은 캡션이면 found", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => Response.json({
      data: [{ id: "media-1", caption: "안녕하세요", timestamp: NOW.toISOString(), permalink: "https://ig/1" }],
    })));
    const result = await findRecentProviderPost("instagram", { token: "tok" }, "안녕하세요", NOW);
    expect(result).toEqual({ state: "found", hit: { externalId: "media-1", permalink: "https://ig/1" } });
  });

  it("공급자가 공백을 다듬어 돌려줘도(정규화 일치) found — 정확 일치만 보면 '없다'로 오판한다", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => Response.json({
      // 우리가 보낸 "안녕하세요\n\n오늘의 글"에서 Meta가 중복 공백/개행을 한 칸으로 다듬어
      // 돌려줬다고 가정.
      data: [{ id: "media-2", caption: "안녕하세요 오늘의 글", timestamp: NOW.toISOString(), permalink: "https://ig/2" }],
    })));
    const result = await findRecentProviderPost("instagram", { token: "tok" }, "안녕하세요\n\n  오늘의  글", NOW);
    expect(result).toEqual({ state: "found", hit: { externalId: "media-2", permalink: "https://ig/2" } });
  });

  it("그 시간대에 미디어가 있는데 캡션이 전혀 안 맞으면 absent가 아니라 unknown — 재발행을 막는다", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => Response.json({
      data: [{ id: "media-3", caption: "완전히 다른 캡션", timestamp: NOW.toISOString(), permalink: "https://ig/3" }],
    })));
    const result = await findRecentProviderPost("instagram", { token: "tok" }, "우리가 찾는 캡션", NOW);
    expect(result).toEqual({ state: "unknown" });
  });

  it("그 시간대에 아무 미디어도 없으면 absent — 안전하게 회수할 수 있다", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => Response.json({ data: [] })));
    const result = await findRecentProviderPost("instagram", { token: "tok" }, "우리가 찾는 캡션", NOW);
    expect(result).toEqual({ state: "absent" });
  });

  it("시간 창 밖의 미디어는 모호 판정에도 안 들어간다(absent 그대로)", async () => {
    const old = new Date(NOW.getTime() - 60 * 60 * 1000); // 1시간 전 — 창(since-60s) 밖.
    vi.stubGlobal("fetch", vi.fn(async () => Response.json({
      data: [{ id: "media-old", caption: "상관없는 옛 글", timestamp: old.toISOString(), permalink: "https://ig/old" }],
    })));
    const result = await findRecentProviderPost("instagram", { token: "tok" }, "우리가 찾는 캡션", NOW);
    expect(result).toEqual({ state: "absent" });
  });
});

describe("findRecentProviderPost — threads", () => {
  it("정규화 불일치(공백만 다름)도 found로 잡는다", async () => {
    vi.stubGlobal("fetch", vi.fn(async (input: string | URL | Request) => {
      const url = String(input);
      if (url.includes("resolve") || url.includes("me?fields=id")) return Response.json({ id: "user-1" });
      return Response.json({
        data: [{ id: "post-1", text: "본문  내용", timestamp: NOW.toISOString(), permalink: "https://threads/1" }],
      });
    }));
    const result = await findRecentProviderPost("threads", { token: "tok" }, "본문 내용", NOW);
    expect(result).toEqual({ state: "found", hit: { externalId: "post-1", permalink: "https://threads/1" } });
  });
});
