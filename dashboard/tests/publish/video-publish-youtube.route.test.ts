// 2026-09-17: /api/video/publish 의 youtube 분기 — TikTok/Reels와 같은 예약(reserve) + idempotency
// 계약을 검증한다. 2026-09-16 실측: 업로드는 성공하는데 published_posts에 예약 없이 INSERT만 해서
// "지금 발행"을 두 번 누르면 YouTube에 영상이 두 번 올라갔다. 이 테스트는 그 회귀를 막는다.
import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import fs from "fs";
import os from "os";
import path from "path";

const H = vi.hoisted(() => ({
  tenantId: "11111111-1111-1111-1111-111111111111" as string | null,
  cred: { token: "yt-token" } as { token: string } | null,
  getChannelCredCalls: [] as unknown[][],
  refreshResult: { ok: true, accessToken: "yt-token-refreshed" } as Record<string, unknown>,
  refreshCalls: [] as unknown[][],
  // published_posts 인메모리 대역 — uq_published_posts_idem(tenant+draft+platform+account
  // WHERE status IN ('published','in_progress'))을 그대로 흉내낸다.
  rows: [] as Array<{
    id: string;
    draft_id: string;
    platform: string;
    account_id: string | null;
    status: string;
    external_id: string | null;
    permalink: string | null;
    reserved_at: string | null;
    provider_meta: Record<string, unknown>;
  }>,
  inserts: [] as unknown[][],
  dbFail: false,
  publicationConfirmFail: false,
  usageRelayFail: false,
  staleReclaim: false,
  seq: 0,
  recordEvents: [] as unknown[][],
}));

vi.mock("@/lib/tenant-auth", () => ({ effectiveTenantId: vi.fn(async () => H.tenantId) }));

vi.mock("@/lib/db", () => ({
  withTenant: vi.fn(async (_t: string, cb: (sql: unknown) => unknown) => {
    const sql = (strings: TemplateStringsArray, ...vals: unknown[]) => {
      if (H.dbFail) return Promise.reject(new Error("db down"));
      const q = strings.join(" ");
      const live = (draft: unknown, platform: unknown, account: unknown) =>
        H.rows.find(
          (r) =>
            r.draft_id === draft &&
            r.platform === platform &&
            r.account_id === (account ?? null) &&
            (r.status === "published" || r.status === "in_progress"),
        );
      if (q.includes("INSERT INTO published_posts")) {
        H.inserts.push(vals);
        const [, draft, platform, , account] = vals as [unknown, string, string, unknown, string | null];
        if (live(draft, platform, account)) return Promise.resolve([]); // ON CONFLICT DO NOTHING
        const id = `res-${++H.seq}`;
        H.rows.push({
          id, draft_id: draft, platform, account_id: account ?? null,
          status: "in_progress", external_id: null, permalink: null,
          reserved_at: new Date().toISOString(), provider_meta: {},
        });
        return Promise.resolve([{ id }]);
      }
      if (q.includes("SELECT id::text, status, external_id, permalink")) {
        const [, draft, platform, account] = vals as [unknown, string, string, string | null];
        const row = live(draft, platform, account);
        return Promise.resolve(row ? [{ ...row, provider_meta: structuredClone(row.provider_meta) }] : []);
      }
      if (q.includes("stale") || q.includes("15 minutes")) {
        // 회수 UPDATE는 error를 파라미터로 바인딩하므로 vals[0]은 error 메시지, vals[1]이 tenantId다.
        const [, , draft, platform, account] = vals as [unknown, unknown, string, string, string | null];
        const row = live(draft, platform, account);
        if (H.staleReclaim && row && row.status === "in_progress") {
          row.status = "failed";
          return Promise.resolve([{ id: row.id }]);
        }
        return Promise.resolve([]);
      }
      if (q.includes("UPDATE published_posts")) {
        // 전체 확정 UPDATE는 [status, ext, permalink, error, id, tenant], 축약 실패 UPDATE는 [error, id, tenant].
        const id = vals.find((value) => H.rows.some((candidate) => candidate.id === value)) as string;
        const row = H.rows.find((r) => r.id === id);
        if (H.publicationConfirmFail && q.includes("external_id") && q.includes("RETURNING id::text")) {
          return Promise.reject(new Error("confirm failed"));
        }
        if (row) {
          if (q.includes("'{youtubeUpload}'")) {
            row.provider_meta.youtubeUpload = vals[0];
            row.reserved_at = new Date().toISOString();
            return Promise.resolve([{ id: row.id }]);
          }
          if (q.includes("youtubeUpload,nextByte")) {
            const expectedReservedAt = vals[3] as string | undefined;
            if (q.includes("reserved_at =") && row.reserved_at !== expectedReservedAt) {
              return Promise.resolve([]);
            }
            const youtubeUpload = row.provider_meta.youtubeUpload as Record<string, unknown> | undefined;
            row.provider_meta.youtubeUpload = { ...(youtubeUpload ?? {}), nextByte: Number(vals[0]) };
            row.reserved_at = new Date().toISOString();
            return Promise.resolve([{ id: row.id }]);
          }
          if (vals.length >= 6) {
            row.status = vals[0] as string;
            row.external_id = (vals[1] as string | null) ?? null;
            row.permalink = (vals[2] as string | null) ?? null;
            if (vals[4] && typeof vals[4] === "object") Object.assign(row.provider_meta, vals[4]);
          } else {
            row.status = "failed";
          }
        }
        return Promise.resolve(q.includes("RETURNING id::text") && row ? [{ id: row.id }] : []);
      }
      return Promise.resolve([]);
    };
    sql.json = (value: unknown) => value;
    return cb(sql);
  }),
}));

vi.mock("@/lib/publish", async (importActual) => {
  const actual = await importActual<typeof import("@/lib/publish")>();
  return {
    ...actual,
    getChannelCred: vi.fn(async (...args: unknown[]) => {
      H.getChannelCredCalls.push(args);
      return H.cred;
    }),
  };
});

vi.mock("@/lib/youtube-token", () => ({
  refreshYoutubeAccessToken: vi.fn(async (...args: unknown[]) => {
    H.refreshCalls.push(args);
    return H.refreshResult;
  }),
}));

vi.mock("@/lib/usage-events", () => ({
  publicationUsageOutbox: (platform: string) => ({ usageEvent: { status: "pending", platform } }),
  recordPublicationEvent: vi.fn(async (...args: unknown[]) => {
    H.recordEvents.push(args);
    if (H.usageRelayFail) throw new Error("usage ledger down");
    return { recorded: true, alreadyRecorded: false };
  }),
}));

let tmpRoot: string;
let fetchMock: ReturnType<typeof vi.fn>;

function mockFetchSuccess(videoId = "yt-video-1") {
  fetchMock = vi.fn(async (input: unknown) => {
    const url = String(input);
    if (url.includes("uploadType=resumable")) {
      return {
        ok: true,
        status: 200,
        headers: { get: (k: string) => (k === "Location" ? "https://upload.example.com/session-1" : null) },
      } as unknown as Response;
    }
    if (url.includes("upload.example.com")) {
      return {
        ok: true,
        status: 200,
        json: async () => ({ id: videoId }),
      } as unknown as Response;
    }
    throw new Error(`unexpected fetch: ${url}`);
  });
  vi.stubGlobal("fetch", fetchMock);
}

async function callPublish(body: Record<string, unknown>) {
  const { POST } = await import("@/app/api/video/publish/route");
  const res = await POST(
    new Request("http://internal.local/api/video/publish", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(body),
    }),
  );
  return { status: res.status, json: (await res.json()) as Record<string, unknown> };
}

describe("/api/video/publish — YouTube", () => {
  beforeEach(() => {
    tmpRoot = fs.mkdtempSync(path.join(os.tmpdir(), "osmu-youtube-"));
    process.env.DATA_DIR = tmpRoot;
    const dir = path.join(tmpRoot, "tenants", H.tenantId as string, "videos");
    fs.mkdirSync(dir, { recursive: true });
    fs.writeFileSync(path.join(dir, "clip.mp4"), Buffer.alloc(2048, 1));
    H.cred = { token: "yt-token" };
    H.getChannelCredCalls = [];
    H.refreshCalls = [];
    H.refreshResult = { ok: true, accessToken: "yt-token-refreshed" };
    H.inserts = [];
    H.rows = [];
    H.dbFail = false;
    H.publicationConfirmFail = false;
    H.usageRelayFail = false;
    H.staleReclaim = false;
    H.seq = 0;
    H.recordEvents = [];
    mockFetchSuccess();
    vi.resetModules();
  });

  afterEach(() => {
    fs.rmSync(tmpRoot, { recursive: true, force: true });
    vi.unstubAllGlobals();
  });

  it("happy path — 업로드하고 permalink를 돌려주며 published_posts에 기록한다", async () => {
    const { status, json } = await callPublish({ filename: "clip.mp4", platform: "youtube", description: "본문" });
    expect(status).toBe(200);
    expect(json).toMatchObject({ ok: true, platform: "youtube", videoId: "yt-video-1" });
    expect(json.url).toBe("https://youtube.com/shorts/yt-video-1");
    expect(fetchMock).toHaveBeenCalledTimes(2); // init + upload
    expect(H.rows[0].status).toBe("published");
    expect(H.rows[0].provider_meta.youtubeUpload).toMatchObject({
      url: "https://upload.example.com/session-1",
      totalBytes: 2048,
      nextByte: 0,
    });
    expect(H.recordEvents.length).toBe(1);
  }, 15000); // 첫 테스트는 모듈 최초 트랜스폼 비용이 커 5s 기본 타임아웃을 넘길 수 있다.

  it("두 번째 호출은 업로드 fetch를 부르지 않고 dedupe 응답을 준다 (draft_id 재사용)", async () => {
    const draftId = "44444444-4444-4444-4444-444444444444";
    await callPublish({ filename: "clip.mp4", platform: "youtube", draft_id: draftId });
    expect(fetchMock).toHaveBeenCalledTimes(2);

    const { status, json } = await callPublish({ filename: "clip.mp4", platform: "youtube", draft_id: draftId });
    expect(status).toBe(200);
    expect(json).toMatchObject({ ok: true, alreadyPublished: true, videoId: "yt-video-1" });
    expect(fetchMock).toHaveBeenCalledTimes(2); // 업로드 fetch 증가 없음
  });

  it("draft_id/idempotency_key 없이 같은 클릭 페이로드를 재전송해도 재업로드하지 않는다", async () => {
    await callPublish({ filename: "clip.mp4", platform: "youtube", title: "제목", description: "동일 본문" });
    expect(fetchMock).toHaveBeenCalledTimes(2);

    const { json } = await callPublish({ filename: "clip.mp4", platform: "youtube", title: "제목", description: "동일 본문" });
    expect(json.alreadyPublished).toBe(true);
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it("idempotency_key로도 같은 dedupe 계약을 쓴다", async () => {
    const key = "55555555-5555-5555-5555-555555555555";
    await callPublish({ filename: "clip.mp4", platform: "youtube", idempotency_key: key });
    expect(fetchMock).toHaveBeenCalledTimes(2);
    const { json } = await callPublish({ filename: "clip.mp4", platform: "youtube", idempotency_key: key });
    expect(json.alreadyPublished).toBe(true);
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it("업로드 초기화 실패는 사람이 읽을 실패 응답과 failed 행을 남기고 재시도를 허용한다", async () => {
    const draftId = "77777777-7777-7777-7777-777777777777";
    fetchMock = vi.fn(async () => ({ ok: false, status: 500, headers: { get: () => null } }) as unknown as Response);
    vi.stubGlobal("fetch", fetchMock);

    const { status, json } = await callPublish({ filename: "clip.mp4", platform: "youtube", draft_id: draftId });
    expect(status).toBe(200);
    expect(json).toMatchObject({ ok: false, error: "YouTube 업로드 초기화 실패 (오류 코드 500)." });
    expect(H.rows[0].status).toBe("failed");

    // 실패 후 재시도는 새 예약을 잡고 실제로 업로드한다(영구 409 방지). 실패 행(status='failed')은
    // unique index 대상 밖이라 새 예약 INSERT가 통과한다.
    mockFetchSuccess("yt-video-retry");
    const retry = await callPublish({ filename: "clip.mp4", platform: "youtube", draft_id: draftId });
    expect(retry.status).toBe(200);
    expect(H.rows.some((r) => r.status === "published" && r.external_id === "yt-video-retry")).toBe(true);
  });

  it("업로드 자체(PUT) 실패도 failed 행을 남긴다", async () => {
    const draftId = "88888888-8888-8888-8888-888888888888";
    fetchMock = vi.fn(async (input: unknown) => {
      const url = String(input);
      if (url.includes("uploadType=resumable")) {
        return { ok: true, status: 200, headers: { get: (k: string) => (k === "Location" ? "https://upload.example.com/s" : null) } } as unknown as Response;
      }
      return { ok: false, status: 500 } as unknown as Response;
    });
    vi.stubGlobal("fetch", fetchMock);

    const { status, json } = await callPublish({ filename: "clip.mp4", platform: "youtube", draft_id: draftId });
    expect(status).toBe(200);
    expect(json.ok).toBe(false);
    expect(H.rows[0].status).toBe("failed");
  });

  it("동시 요청 중 하나만 업로드하고, 진 요청은 409로 fail-closed", async () => {
    const draftId = "66666666-6666-6666-6666-666666666666";
    let release: (v: unknown) => void = () => {};
    const gate = new Promise((r) => { release = r; });
    fetchMock = vi.fn(async (input: unknown) => {
      const url = String(input);
      if (url.includes("uploadType=resumable")) {
        await gate;
        return { ok: true, status: 200, headers: { get: (k: string) => (k === "Location" ? "https://upload.example.com/s" : null) } } as unknown as Response;
      }
      if (url.includes("upload.example.com")) {
        return { ok: true, status: 200, json: async () => ({ id: "yt-concurrent" }) } as unknown as Response;
      }
      throw new Error(`unexpected: ${url}`);
    });
    vi.stubGlobal("fetch", fetchMock);

    const first = callPublish({ filename: "clip.mp4", platform: "youtube", draft_id: draftId });
    await new Promise((r) => setTimeout(r, 0));
    const second = await callPublish({ filename: "clip.mp4", platform: "youtube", draft_id: draftId });

    expect(second.status).toBe(409);
    expect(second.json.code).toBe("publish_in_progress");
    expect(fetchMock).toHaveBeenCalledTimes(1); // init만 정확히 1회 진행 중

    release(null);
    expect((await first).status).toBe(200);
  });

  it("15분 넘게 남은 좀비 예약은 회수해 재발행을 허용한다", async () => {
    const draftId = "99999999-9999-9999-9999-999999999999";
    H.rows.push({
      id: "zombie", draft_id: draftId, platform: "youtube", account_id: null,
      status: "in_progress", external_id: null, permalink: null,
      reserved_at: new Date().toISOString(), provider_meta: {},
    });

    H.staleReclaim = false;
    expect((await callPublish({ filename: "clip.mp4", platform: "youtube", draft_id: draftId })).status).toBe(409);
    expect(fetchMock).not.toHaveBeenCalled();

    H.staleReclaim = true;
    H.rows[0].reserved_at = new Date(Date.now() - 16 * 60 * 1000).toISOString();
    const { status } = await callPublish({ filename: "clip.mp4", platform: "youtube", draft_id: draftId });
    expect(status).toBe(200);
  });

  it("예약 INSERT가 DB 장애로 실패하면 업로드를 강행하지 않는다(fail closed)", async () => {
    H.dbFail = true;
    const { status } = await callPublish({ filename: "clip.mp4", platform: "youtube" });
    expect(status).toBe(503);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("캡션이 바뀌면(제목/설명) 다른 dedupe 키가 되어 재업로드를 허용한다", async () => {
    await callPublish({ filename: "clip.mp4", platform: "youtube", title: "A", description: "본문" });
    expect(fetchMock).toHaveBeenCalledTimes(2);
    mockFetchSuccess("yt-video-2");
    await callPublish({ filename: "clip.mp4", platform: "youtube", title: "B", description: "본문" });
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it("CODE-REVIEW-20260917-04 정상: 태그만 바뀌어도 새 발행 의도로 업로드한다", async () => {
    await callPublish({ filename: "clip.mp4", platform: "youtube", title: "제목", tags: ["one"] });
    mockFetchSuccess("yt-tags-2");
    const second = await callPublish({ filename: "clip.mp4", platform: "youtube", title: "제목", tags: ["two"] });

    expect(second.status).toBe(200);
    expect(second.json.videoId).toBe("yt-tags-2");
  });

  it("CODE-REVIEW-20260917-05 정상: 같은 파일명이어도 파일 내용이 바뀌면 새 발행 의도로 업로드한다", async () => {
    await callPublish({ filename: "clip.mp4", platform: "youtube", title: "제목" });
    const videoPath = path.join(tmpRoot, "tenants", H.tenantId as string, "videos", "clip.mp4");
    fs.writeFileSync(videoPath, Buffer.alloc(2048, 2));
    mockFetchSuccess("yt-bytes-2");
    const second = await callPublish({ filename: "clip.mp4", platform: "youtube", title: "제목" });

    expect(second.status).toBe(200);
    expect(second.json.videoId).toBe("yt-bytes-2");
  });

  it("CODE-REVIEW-20260917-06 복구: 저장된 세션 상태를 조회하고 받은 바이트 다음부터 이어 올린다", async () => {
    const draftId = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
    H.rows.push({
      id: "resume-1", draft_id: draftId, platform: "youtube", account_id: null,
      status: "in_progress", external_id: null, permalink: null,
      reserved_at: new Date(Date.now() - 16 * 60 * 1000).toISOString(),
      provider_meta: { youtubeUpload: { url: "https://upload.example.com/resume", totalBytes: 2048, nextByte: 0 } },
    });
    fetchMock = vi.fn(async (_input: unknown, init?: RequestInit) => {
      const range = (init?.headers as Record<string, string>)?.["Content-Range"];
      if (range === "bytes */2048") {
        return { ok: false, status: 308, headers: { get: (key: string) => key === "Range" ? "bytes=0-1023" : null } } as unknown as Response;
      }
      expect(range).toBe("bytes 1024-2047/2048");
      return { ok: true, status: 201, headers: { get: () => null }, json: async () => ({ id: "yt-resumed" }) } as unknown as Response;
    });
    vi.stubGlobal("fetch", fetchMock);

    const result = await callPublish({ filename: "clip.mp4", platform: "youtube", draft_id: draftId });

    expect(result.status).toBe(200);
    expect(result.json).toMatchObject({ ok: true, videoId: "yt-resumed" });
    expect(fetchMock.mock.calls.every(([url]) => !String(url).includes("uploadType=resumable"))).toBe(true);
  });

  it("CODE-REVIEW-20260917-09 경합: 만료된 같은 세션의 재개권은 한 요청만 가져간다", async () => {
    const draftId = "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb";
    H.rows.push({
      id: "resume-race-1", draft_id: draftId, platform: "youtube", account_id: null,
      status: "in_progress", external_id: null, permalink: null,
      reserved_at: new Date(Date.now() - 16 * 60 * 1000).toISOString(),
      provider_meta: { youtubeUpload: { url: "https://upload.example.com/race", totalBytes: 2048, nextByte: 0 } },
    });
    let statusCalls = 0;
    let uploadCalls = 0;
    let releaseStatus: () => void = () => {};
    const bothStatusRequests = new Promise<void>((resolve) => { releaseStatus = resolve; });
    fetchMock = vi.fn(async (_input: unknown, init?: RequestInit) => {
      const range = (init?.headers as Record<string, string>)?.["Content-Range"];
      if (range === "bytes */2048") {
        statusCalls += 1;
        if (statusCalls === 2) releaseStatus();
        await bothStatusRequests;
        return { ok: false, status: 308, headers: { get: (key: string) => key === "Range" ? "bytes=0-1023" : null } } as unknown as Response;
      }
      uploadCalls += 1;
      return { ok: true, status: 201, headers: { get: () => null }, json: async () => ({ id: "yt-race-winner" }) } as unknown as Response;
    });
    vi.stubGlobal("fetch", fetchMock);

    const results = await Promise.all([
      callPublish({ filename: "clip.mp4", platform: "youtube", draft_id: draftId }),
      callPublish({ filename: "clip.mp4", platform: "youtube", draft_id: draftId }),
    ]);

    expect(results.map((result) => result.status).sort()).toEqual([200, 409]);
    expect(uploadCalls).toBe(1);
  });

  it("CODE-REVIEW-20260917-07 거절: 외부 성공 뒤 발행 확정 실패를 전체 성공으로 반환하지 않는다", async () => {
    H.publicationConfirmFail = true;
    const result = await callPublish({ filename: "clip.mp4", platform: "youtube" });

    expect(result.status).toBe(500);
    expect(result.json).toMatchObject({
      ok: false,
      externalPublished: true,
      persistence: { stage: "publication_record", reconciliation: { retryPublish: false } },
    });
  });

  it("CODE-REVIEW-20260917-08 거절: 사용량 relay 실패를 성공으로 숨기지 않고 pending outbox를 남긴다", async () => {
    H.usageRelayFail = true;
    const result = await callPublish({ filename: "clip.mp4", platform: "youtube" });

    expect(result.status).toBe(500);
    expect(result.json).toMatchObject({
      ok: false,
      externalPublished: true,
      persistence: { stage: "usage_record", reconciliation: { retryPublish: false } },
    });
    expect(H.rows[0].provider_meta).toMatchObject({ usageEvent: { status: "pending", platform: "youtube" } });
  });

  it("401이면 정확히 1회 refresh 후 재시도한다", async () => {
    let initCalls = 0;
    fetchMock = vi.fn(async (input: unknown, init?: RequestInit) => {
      const url = String(input);
      if (url.includes("uploadType=resumable")) {
        initCalls += 1;
        const token = (init?.headers as Record<string, string>)?.Authorization;
        if (token === "Bearer yt-token") {
          return { ok: false, status: 401, headers: { get: () => null } } as unknown as Response;
        }
        return { ok: true, status: 200, headers: { get: (k: string) => (k === "Location" ? "https://upload.example.com/s" : null) } } as unknown as Response;
      }
      if (url.includes("upload.example.com")) {
        return { ok: true, status: 200, json: async () => ({ id: "yt-refreshed" }) } as unknown as Response;
      }
      throw new Error(`unexpected: ${url}`);
    });
    vi.stubGlobal("fetch", fetchMock);

    const { status, json } = await callPublish({ filename: "clip.mp4", platform: "youtube" });
    expect(status).toBe(200);
    expect(json.videoId).toBe("yt-refreshed");
    expect(initCalls).toBe(2);
    expect(H.refreshCalls.length).toBe(1);
  });
});
