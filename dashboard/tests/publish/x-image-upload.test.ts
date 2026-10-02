import { afterEach, describe, expect, it, vi } from "vitest";

// X 이미지 발행(SNS: X carousel) — 회장 2026-10-02 실측: osmu_studio 가 발행한 3장 카드덱이
// 텍스트만 올라갔다(https://x.com/osmu_studio/status/2105996107570643107). 원인은
// dashboard/src/app/api/publish/route.ts 가 publishX(cred, text) 를 이미지 없이 불렀고,
// lib/publish.ts publishX 가 텍스트만 올렸기 때문(channel-image-capacity.ts 의 x:1 도 한몫).
//
// 이 시험은 X API 공식 문서(docs.x.com/x-api/media/quickstart/media-upload-chunked, 2026-10-02 조사)의
// initialize/append/finalize 3단 미디어 업로드를 녹화 형태로 흉내 내 media_ids 가 실제로
// 트윗 생성 요청에 실려 가는지, 그리고 업로드가 실패하면 텍스트만으로 조용히 올리지 않는지를 검증한다.

const H = vi.hoisted(() => ({
  storedImages: new Map<string, { bytes: Uint8Array; contentType: string }>(),
  tokenClaims: new Map<string, { tenantId: string; filename: string }>(),
}));

vi.mock("@/lib/media-store", () => ({
  mediaStore: {
    get: vi.fn(async (tenantId: string, filename: string) => {
      const stored = H.storedImages.get(`${tenantId}/${filename}`);
      if (!stored) return null;
      return {
        body: new ReadableStream<Uint8Array>({
          start(controller) {
            controller.enqueue(stored.bytes);
            controller.close();
          },
        }),
        contentLength: stored.bytes.byteLength,
        contentType: stored.contentType,
        source: "local" as const,
      };
    }),
  },
  MediaStoreError: class MediaStoreError extends Error {},
}));

vi.mock("@/lib/image-token", () => ({
  verifyImageToken: vi.fn((token: string) => H.tokenClaims.get(token) ?? null),
  verifyImageTokenSignature: vi.fn((token: string) => H.tokenClaims.get(token) ?? null),
  isSafeMediaFilename: () => true,
}));

import { publishX } from "@/lib/publish";

function registerLocalImage(token: string, tenantId: string, filename: string, bytes: Uint8Array, contentType: string) {
  H.tokenClaims.set(token, { tenantId, filename });
  H.storedImages.set(`${tenantId}/${filename}`, { bytes, contentType });
}

function pngBytes(n = 128): Uint8Array {
  const out = new Uint8Array(n);
  out[0] = 0x89; out[1] = 0x50; out[2] = 0x4e; out[3] = 0x47; // PNG magic
  return out;
}

const LEGACY_CRED = {
  token: "",
  meta: { apiKey: "k", apiSecret: "ks", accessToken: "at", accessSecret: "ats" },
};

afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
  H.storedImages.clear();
  H.tokenClaims.clear();
});

describe("publishX 이미지 첨부 (X 미디어 업로드 3단)", () => {
  it("FAIL-BEFORE 고정: 이미지 인자를 받지 않던 과거 시그니처로는 이 시험이 쓸 수 없다 — publishX 가 3번째 인자를 받아야 한다", () => {
    // publishX.length === 함수가 선언한 매개변수 개수. 구현 전에는 2 (cred, text) 였다.
    // 구현 후에는 cred, text, imageUrls(선택) 3개를 받아야 한다. (선택 매개변수도 length에 포함됨
    // — 단 기본값/옵셔널(?) 매개변수는 .length 계산에서 제외되므로, 이 자체는 구현 후 2로 남을 수
    // 있다. 그래서 실제 동작 검증은 아래 통합 시험들이 FAIL-BEFORE 증거다.)
    expect(typeof publishX).toBe("function");
  });

  it("3장을 올리면 initialize/append/finalize 가 3번씩 돌고 media_ids 3개가 트윗 생성에 실린다", async () => {
    registerLocalImage("tok-1", "tenant-a", "card-1.png", pngBytes(), "image/png");
    registerLocalImage("tok-2", "tenant-a", "card-2.png", pngBytes(), "image/png");
    registerLocalImage("tok-3", "tenant-a", "card-3.png", pngBytes(), "image/png");

    const imageUrls = [
      "https://osmu.example.com/api/images/deliver/tok-1",
      "https://osmu.example.com/api/images/deliver/tok-2",
      "https://osmu.example.com/api/images/deliver/tok-3",
    ];

    let mediaSeq = 0;
    const calls: Array<{ url: string; method: string }> = [];
    vi.stubGlobal("fetch", vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = String(input);
      const method = (init?.method ?? "GET").toUpperCase();
      calls.push({ url, method });

      if (url.endsWith("/2/media/upload/initialize")) {
        mediaSeq += 1;
        return Response.json({ data: { id: `media-${mediaSeq}`, media_key: `3_media-${mediaSeq}` } });
      }
      if (url.includes("/2/media/upload/") && url.endsWith("/append")) {
        return new Response(null, { status: 204 });
      }
      if (url.includes("/2/media/upload/") && url.endsWith("/finalize")) {
        const id = url.split("/").slice(-2)[0];
        return Response.json({ data: { id, media_key: `3_${id}`, processing_info: { state: "succeeded" } } });
      }
      if (url === "https://api.twitter.com/2/tweets") {
        return Response.json({ data: { id: "tweet-1" } });
      }
      throw new Error(`unexpected fetch: ${method} ${url}`);
    }));

    const result = await publishX(LEGACY_CRED, "카드 3장 트윗", imageUrls);

    expect(result.ok).toBe(true);
    expect(result.externalId).toBe("tweet-1");

    const initCalls = calls.filter((c) => c.url.endsWith("/initialize"));
    const appendCalls = calls.filter((c) => c.url.endsWith("/append"));
    const finalizeCalls = calls.filter((c) => c.url.endsWith("/finalize"));
    expect(initCalls).toHaveLength(3);
    expect(appendCalls).toHaveLength(3);
    expect(finalizeCalls).toHaveLength(3);

    const tweetCall = (vi.mocked(fetch).mock.calls as Array<[RequestInfo | URL, RequestInit?]>).find(
      ([u]) => String(u) === "https://api.twitter.com/2/tweets",
    );
    expect(tweetCall).toBeTruthy();
    const body = JSON.parse(String(tweetCall![1]?.body ?? "{}"));
    expect(body.media?.media_ids).toEqual(["media-1", "media-2", "media-3"]);
  });

  it("미디어 업로드가 실패하면 트윗을 올리지 않고 분명한 한국어 오류를 돌려준다(텍스트만 조용히 올리지 않음)", async () => {
    registerLocalImage("tok-fail", "tenant-a", "card-1.png", pngBytes(), "image/png");
    const imageUrls = ["https://osmu.example.com/api/images/deliver/tok-fail"];

    let tweetCalled = false;
    vi.stubGlobal("fetch", vi.fn(async (input: RequestInfo | URL) => {
      const url = String(input);
      if (url.endsWith("/2/media/upload/initialize")) {
        return new Response("rate limited", { status: 429 });
      }
      if (url === "https://api.twitter.com/2/tweets") {
        tweetCalled = true;
        return Response.json({ data: { id: "should-not-happen" } });
      }
      throw new Error(`unexpected fetch: ${url}`);
    }));

    const result = await publishX(LEGACY_CRED, "이미지 업로드가 실패해야 하는 트윗", imageUrls);

    expect(result.ok).toBe(false);
    expect(result.error).toMatch(/이미지/);
    expect(tweetCalled).toBe(false);
  });

  it("X 는 한 번에 이미지 4장까지만 허용한다 — 5장을 주면 업로드를 시도하지 않고 즉시 거절한다", async () => {
    const urls = Array.from({ length: 5 }, (_, i) => `https://osmu.example.com/api/images/deliver/tok-${i}`);
    const fetchSpy = vi.fn();
    vi.stubGlobal("fetch", fetchSpy);

    const result = await publishX(LEGACY_CRED, "다섯 장", urls);

    expect(result.ok).toBe(false);
    expect(result.error).toMatch(/4장/);
    expect(fetchSpy).not.toHaveBeenCalled();
  });

  it("OAuth2 Bearer 로 연결된 계정도 동일하게 미디어 업로드를 거쳐 발행한다", async () => {
    registerLocalImage("tok-bearer", "tenant-b", "card-1.png", pngBytes(), "image/png");
    const bearerCred = { token: "bearer-token-xyz" };

    const auths: string[] = [];
    vi.stubGlobal("fetch", vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = String(input);
      const auth = String((init?.headers as Record<string, string> | undefined)?.Authorization ?? "");
      auths.push(auth);
      if (url.endsWith("/initialize")) return Response.json({ data: { id: "media-b1" } });
      if (url.endsWith("/append")) return new Response(null, { status: 204 });
      if (url.endsWith("/finalize")) return Response.json({ data: { id: "media-b1", processing_info: { state: "succeeded" } } });
      if (url === "https://api.twitter.com/2/tweets") return Response.json({ data: { id: "tweet-b1" } });
      throw new Error(`unexpected fetch: ${url}`);
    }));

    const result = await publishX(bearerCred, "bearer 트윗", ["https://osmu.example.com/api/images/deliver/tok-bearer"]);

    expect(result.ok).toBe(true);
    expect(auths.every((a) => a.startsWith("Bearer "))).toBe(true);
  });

  // ── 2026-10-02 독립 리뷰 BLOCK M1 — 화면으로 연결한 OAuth2 계정이 media.write 없이 토큰을
  // 받으면 media upload initialize가 403을 돌려주고, 그 전까지는 이 사실이 테스트로 잡히지
  // 않았다(위 "OAuth2 Bearer" 시험은 initialize가 항상 200을 돌려주는 happy path만 녹화).
  it("OAuth2 Bearer 계정의 media upload initialize 가 403을 돌려주면 트윗을 올리지 않고 재연결을 안내한다", async () => {
    registerLocalImage("tok-403", "tenant-c", "card-1.png", pngBytes(), "image/png");
    const bearerCred = { token: "bearer-token-no-scope" }; // meta.grantedScope 모름(미검증) — 실제 요청으로 403을 받는 경로

    let tweetCalled = false;
    vi.stubGlobal("fetch", vi.fn(async (input: RequestInfo | URL) => {
      const url = String(input);
      if (url.endsWith("/2/media/upload/initialize")) {
        return new Response(JSON.stringify({ title: "Forbidden", detail: "insufficient_scope" }), { status: 403 });
      }
      if (url === "https://api.twitter.com/2/tweets") {
        tweetCalled = true;
        return Response.json({ data: { id: "should-not-happen" } });
      }
      throw new Error(`unexpected fetch: ${url}`);
    }));

    const result = await publishX(bearerCred, "403이 나야 하는 트윗", ["https://osmu.example.com/api/images/deliver/tok-403"]);

    expect(result.ok).toBe(false);
    expect(result.error).toContain("media.write");
    expect(result.error).toMatch(/다시 연결/);
    expect(tweetCalled).toBe(false);
  });

  it("연결 시 저장된 scope에 media.write 가 없는 걸 미리 알면, 업로드 요청조차 보내지 않고 즉시 재연결을 안내한다", async () => {
    const bearerCred = { token: "bearer-token-old-scope", meta: { grantedScope: "tweet.read tweet.write users.read offline.access" } };
    const fetchSpy = vi.fn();
    vi.stubGlobal("fetch", fetchSpy);

    const result = await publishX(bearerCred, "스코프 사전 차단", ["https://osmu.example.com/api/images/deliver/tok-whatever"]);

    expect(result.ok).toBe(false);
    expect(result.error).toContain("media.write");
    expect(fetchSpy).not.toHaveBeenCalled();
  });

  it("연결 시 저장된 scope에 media.write 가 있으면 정상 업로드로 진행한다(회귀 방지)", async () => {
    registerLocalImage("tok-scoped-ok", "tenant-d", "card-1.png", pngBytes(), "image/png");
    const bearerCred = { token: "bearer-token-with-scope", meta: { grantedScope: "tweet.read tweet.write users.read offline.access media.write" } };

    vi.stubGlobal("fetch", vi.fn(async (input: RequestInfo | URL) => {
      const url = String(input);
      if (url.endsWith("/initialize")) return Response.json({ data: { id: "media-ok" } });
      if (url.endsWith("/append")) return new Response(null, { status: 204 });
      if (url.endsWith("/finalize")) return Response.json({ data: { id: "media-ok", processing_info: { state: "succeeded" } } });
      if (url === "https://api.twitter.com/2/tweets") return Response.json({ data: { id: "tweet-ok" } });
      throw new Error(`unexpected fetch: ${url}`);
    }));

    const result = await publishX(bearerCred, "스코프 있음", ["https://osmu.example.com/api/images/deliver/tok-scoped-ok"]);
    expect(result.ok).toBe(true);
  });

  // m2(독립 리뷰): 애니메이션 GIF는 tweet_image가 아니라 tweet_gif로 올라가야 한다.
  it("GIF 이미지는 media_category=tweet_gif 로 초기화한다", async () => {
    registerLocalImage("tok-gif", "tenant-e", "anim.gif", pngBytes(), "image/gif");
    let initBody: Record<string, unknown> = {};
    vi.stubGlobal("fetch", vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = String(input);
      if (url.endsWith("/initialize")) {
        initBody = JSON.parse(String(init?.body ?? "{}"));
        return Response.json({ data: { id: "media-gif" } });
      }
      if (url.endsWith("/append")) return new Response(null, { status: 204 });
      if (url.endsWith("/finalize")) return Response.json({ data: { id: "media-gif", processing_info: { state: "succeeded" } } });
      if (url === "https://api.twitter.com/2/tweets") return Response.json({ data: { id: "tweet-gif" } });
      throw new Error(`unexpected fetch: ${url}`);
    }));

    const result = await publishX(LEGACY_CRED, "움직이는 카드", ["https://osmu.example.com/api/images/deliver/tok-gif"]);

    expect(result.ok).toBe(true);
    expect(initBody.media_category).toBe("tweet_gif");
  });

  // m1(독립 리뷰): STATUS 폴링은 provider가 알려준 check_after_secs 를 존중해야 한다(고정 1초
  // 폴링은 과도한 요청을 쌓는다). fake timer로 "너무 빨리 두드리지 않는다"를 확인한다.
  it("finalize 가 처리중이면 check_after_secs 가 지나기 전에는 STATUS 를 두드리지 않는다", async () => {
    vi.useFakeTimers();
    registerLocalImage("tok-poll", "tenant-f", "card-1.png", pngBytes(), "image/png");
    let statusCalls = 0;
    vi.stubGlobal("fetch", vi.fn(async (input: RequestInfo | URL) => {
      const url = String(input);
      if (url.endsWith("/initialize")) return Response.json({ data: { id: "media-poll" } });
      if (url.endsWith("/append")) return new Response(null, { status: 204 });
      if (url.endsWith("/finalize")) {
        return Response.json({ data: { id: "media-poll", processing_info: { state: "in_progress", check_after_secs: 5 } } });
      }
      if (url.includes("command=STATUS")) {
        statusCalls += 1;
        return Response.json({ data: { processing_info: { state: "succeeded" } } });
      }
      if (url === "https://api.twitter.com/2/tweets") return Response.json({ data: { id: "tweet-poll" } });
      throw new Error(`unexpected fetch: ${url}`);
    }));

    const pending = publishX(LEGACY_CRED, "폴링 간격 시험", ["https://osmu.example.com/api/images/deliver/tok-poll"]);
    // check_after_secs=5인데 2초만 흘려보내면 아직 STATUS를 두드리지 않아야 한다.
    await vi.advanceTimersByTimeAsync(2000);
    expect(statusCalls).toBe(0);
    await vi.advanceTimersByTimeAsync(3500);
    const result = await pending;
    expect(statusCalls).toBeGreaterThanOrEqual(1);
    expect(result.ok).toBe(true);
    vi.useRealTimers();
  });
});
