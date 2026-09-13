import { afterEach, describe, expect, it, vi } from "vitest";
import { publishInstagram } from "@/lib/publish";

afterEach(() => {
  vi.useRealTimers();
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

describe("publishInstagram lifecycle", () => {
  it("waits for FINISHED, publishes, and returns the public permalink", async () => {
    const calls: string[] = [];
    vi.stubGlobal("fetch", vi.fn(async (url: string) => {
      calls.push(String(url));
      if (String(url).endsWith("/media")) return { ok: true, json: async () => ({ id: "creation-1" }) } as Response;
      if (String(url).includes("status_code")) return { ok: true, json: async () => ({ status_code: "FINISHED" }) } as Response;
      if (String(url).endsWith("/media_publish")) return { ok: true, json: async () => ({ id: "media-1" }) } as Response;
      return { ok: true, json: async () => ({ permalink: "https://instagram.com/p/one/" }) } as Response;
    }));

    const result = await publishInstagram(
      { token: "token", userId: "ig-user", meta: { api: "instagram_login" } },
      "caption",
      "https://cdn.example/image.png",
    );

    expect(result).toEqual({ ok: true, externalId: "media-1", permalink: "https://instagram.com/p/one/" });
    expect(calls.some((url) => url.includes("/media-1?fields=permalink"))).toBe(true);
  });

  it("fails closed after 20 non-FINISHED states and never calls media_publish", async () => {
    vi.useFakeTimers();
    const calls: string[] = [];
    vi.stubGlobal("fetch", vi.fn(async (url: string) => {
      calls.push(String(url));
      if (String(url).endsWith("/media")) return { ok: true, json: async () => ({ id: "creation-2" }) } as Response;
      return { ok: true, json: async () => ({ status_code: "IN_PROGRESS" }) } as Response;
    }));

    const pending = publishInstagram(
      { token: "token", userId: "ig-user", meta: { api: "instagram_login" } },
      "caption",
      "https://cdn.example/image.png",
    );
    await vi.runAllTimersAsync();
    const result = await pending;

    expect(result.ok).toBe(false);
    expect(result.error).toContain("시간 초과");
    expect(calls.some((url) => url.endsWith("/media_publish"))).toBe(false);
  });

  it("does not expose provider response text on container failure", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => ({
      ok: false,
      status: 400,
      text: async () => "secret provider details",
    }) as Response));

    const result = await publishInstagram(
      { token: "token", userId: "ig-user" },
      "caption",
      "https://cdn.example/image.png",
    );

    expect(result.error).toBe("IG container 실패(400)");
    expect(result.error).not.toContain("secret provider details");
  });

  it("시험 18 정상: 여러 글자 카드는 자식 컨테이너를 만든 뒤 하나의 카드뉴스로 발행한다", async () => {
    const requests: Array<{ url: string; body: string }> = [];
    let child = 0;
    vi.stubGlobal("fetch", vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = String(input);
      requests.push({ url, body: String(init?.body || "") });
      if (url.endsWith("/media") && String(init?.body).includes("is_carousel_item=true")) {
        child += 1;
        return Response.json({ id: `child-${child}` });
      }
      if (url.endsWith("/media")) return Response.json({ id: "carousel-1" });
      if (url.includes("status_code")) return Response.json({ status_code: "FINISHED" });
      if (url.endsWith("/media_publish")) return Response.json({ id: "media-carousel" });
      return Response.json({ permalink: "https://instagram.com/p/carousel/" });
    }));

    const result = await publishInstagram(
      { token: "token", userId: "ig-user", meta: { api: "instagram_login" } },
      "설명",
      ["https://cdn.example/1.png", "https://cdn.example/2.png"],
    );

    expect(result).toEqual({ ok: true, externalId: "media-carousel", permalink: "https://instagram.com/p/carousel/" });
    expect(requests.filter((request) => request.body.includes("is_carousel_item=true"))).toHaveLength(2);
    expect(requests).toContainEqual(expect.objectContaining({ body: expect.stringContaining("media_type=CAROUSEL") }));
    expect(requests).toContainEqual(expect.objectContaining({ body: expect.stringContaining("children=child-1%2Cchild-2") }));
  });

  it("시험 18 거절: 카드뉴스 11장은 공급자 호출 전에 막는다", async () => {
    const fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);

    const result = await publishInstagram(
      { token: "token", userId: "ig-user" },
      "설명",
      Array.from({ length: 11 }, (_, index) => `https://cdn.example/${index}.png`),
    );

    expect(result).toEqual({ ok: false, error: "Instagram 카드뉴스는 최대 10장" });
    expect(fetchMock).not.toHaveBeenCalled();
  });
});
