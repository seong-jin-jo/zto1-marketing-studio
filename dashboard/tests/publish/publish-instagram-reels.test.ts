import { describe, it, expect, afterEach, vi } from "vitest";
import { installFetch } from "./helpers/mock-fetch";
import { publishInstagramReels } from "@/lib/publish";

// SNS-015: Reels 컨테이너(REELS) → status_code 폴링 → FINISHED에서만 media_publish → permalink.
const CRED = { token: "tok-abc", userId: "17841400000000000", meta: { api: "instagram_login" } };
const VIDEO = "https://public.example.com/api/media/signed-token";
const FAST = { attempts: 3, intervalMs: 0 };

afterEach(() => vi.restoreAllMocks());

describe("publishInstagramReels", () => {
  it("happy path — REELS 컨테이너 생성 후 FINISHED에서 발행하고 permalink를 돌려준다", async () => {
    const { calls } = installFetch([
      { match: /\/media$/, json: { id: "creation-1" } },
      { match: "creation-1?fields=status_code", json: { status_code: "FINISHED" } },
      { match: "media_publish", json: { id: "media-9" } },
      { match: "media-9?fields=permalink", json: { permalink: "https://www.instagram.com/reel/abc/" } },
    ]);
    const r = await publishInstagramReels(CRED, "캡션", VIDEO, FAST);
    expect(r).toMatchObject({ ok: true, externalId: "media-9", permalink: "https://www.instagram.com/reel/abc/" });

    const create = calls.find((c) => c.method === "POST" && c.url.endsWith("/media"))!;
    expect(create.url).toContain("graph.instagram.com"); // Instagram Login API base
    expect(create.body).toContain("media_type=REELS");
    expect(create.body).toContain(encodeURIComponent(VIDEO));
    expect(create.hasSignal).toBe(true); // 네트워크 타임아웃 바운드
  });

  it("레거시 env 자격증명은 Facebook Graph base를 쓴다", async () => {
    const { calls } = installFetch([
      { match: /\/media$/, json: { id: "c" } },
      { match: "fields=status_code", json: { status_code: "FINISHED" } },
      { match: "media_publish", json: { id: "m" } },
      { match: "fields=permalink", json: { permalink: "p" } },
    ]);
    await publishInstagramReels({ token: "t", userId: "u" }, "c", VIDEO, FAST);
    expect(calls[0].url).toContain("graph.facebook.com");
  });

  it("status ERROR면 fail-closed — media_publish를 호출하지 않는다", async () => {
    const { calls } = installFetch([
      { match: /\/media$/, json: { id: "creation-1" } },
      { match: "fields=status_code", json: { status_code: "ERROR" } },
    ]);
    const r = await publishInstagramReels(CRED, "캡션", VIDEO, FAST);
    expect(r.ok).toBe(false);
    expect(calls.some((c) => c.url.includes("media_publish"))).toBe(false);
  });

  it("REVIEW-20260918-18 거절: media_publish 응답 ID 누락은 외부 성공 가능성을 보존한다", async () => {
    installFetch([
      { match: /\/media$/, json: { id: "creation-1" } },
      { match: "creation-1?fields=status_code", json: { status_code: "FINISHED" } },
      { match: "media_publish", json: {} },
    ]);
    const result = await publishInstagramReels(CRED, "캡션", VIDEO, FAST);
    expect(result).toMatchObject({ ok: false, failureKind: "indeterminate" });
    expect(result.error).toContain("자동 재발행하지 않습니다");
  });

  it("status EXPIRED면 fail-closed — media_publish를 호출하지 않는다(24h 미발행 만료, 공식 문서)", async () => {
    const { calls } = installFetch([
      { match: /\/media$/, json: { id: "creation-1" } },
      { match: "fields=status_code", json: { status_code: "EXPIRED" } },
    ]);
    const r = await publishInstagramReels(CRED, "캡션", VIDEO, FAST);
    expect(r.ok).toBe(false);
    expect(r.error).toContain("EXPIRED");
    expect(calls.some((c) => c.url.includes("media_publish"))).toBe(false);
  });

  it("기본 폴링 예산은 Meta 공식 가이드(1분×5회=5분)를 따른다", async () => {
    const { publishInstagramReels: fn } = await import("@/lib/publish");
    void fn; // opts 기본값은 소스에서 attempts=5,intervalMs=60000로 고정 확인(아래는 명시적 회귀 가드)
    const src = await import("node:fs/promises").then((m) =>
      m.readFile(new URL("../../src/lib/publish.ts", import.meta.url), "utf-8"),
    );
    expect(src).toMatch(/attempts\s*\?\?\s*5\b/);
    expect(src).toMatch(/intervalMs\s*\?\?\s*60_000\b/);
  });

  it("폴링 타임아웃(FINISHED 미도달)도 fail-closed", async () => {
    const { calls } = installFetch([
      { match: /\/media$/, json: { id: "creation-1" } },
      { match: "fields=status_code", json: { status_code: "IN_PROGRESS" } },
    ]);
    const r = await publishInstagramReels(CRED, "캡션", VIDEO, FAST);
    expect(r.ok).toBe(false);
    expect(r.error).toContain("시간 초과");
    expect(calls.filter((c) => c.url.includes("fields=status_code")).length).toBe(3);
    expect(calls.some((c) => c.url.includes("media_publish"))).toBe(false);
  });

  it("프로바이더 raw 응답 본문/토큰을 에러에 노출하지 않는다", async () => {
    installFetch([
      {
        match: /\/media$/,
        status: 400,
        json: { error: { message: "Invalid OAuth access token tok-abc", fbtrace_id: "XYZ" } },
      },
    ]);
    const r = await publishInstagramReels(CRED, "캡션", VIDEO, FAST);
    expect(r.ok).toBe(false);
    expect(r.error).toBe("IG Reels container 실패(400)");
    expect(r.error).not.toContain("tok-abc");
    expect(r.error).not.toContain("fbtrace");
  });

  it("공개 HTTPS가 아닌 video URL은 프로바이더 호출 전에 거부한다", async () => {
    const { calls } = installFetch([{ match: "graph", json: {} }]);
    expect((await publishInstagramReels(CRED, "c", "http://127.0.0.1/v.mp4", FAST)).ok).toBe(false);
    expect((await publishInstagramReels(CRED, "c", "http://public.example.com/v.mp4", FAST)).ok).toBe(false);
    expect(calls.length).toBe(0);
  });
});
