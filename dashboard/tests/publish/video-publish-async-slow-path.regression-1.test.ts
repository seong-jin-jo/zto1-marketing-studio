// 2026-10-02 운영 실측(세션맥락): 회원 계정 발행실에서 Threads + Instagram Reels 동시
// 발행. POST /api/video/publish가 125초 뒤 Cloudflare 터널 한도로 524(HTML 응답)를
// 받았고 화면은 "일부 발행 실패"를 띄웠다. 그러나 서버는 끝까지 진행해 Reels가 실제로
// 게시됐다(링크 확인됨). 고객이 "실패한 곳만 다시 발행"을 누르면 중복 게시 위험이 있다.
//
// 고친 것: POST가 FAST_PATH_BUDGET_MS(8초) 안에 못 끝내면 202 + jobId로 접수만 알리고
// 같은 실행(완전히 동일한 발행 로직, 한 글자도 안 바꿈)을 백그라운드로 계속 잇는다.
// GET /api/video/publish/job/[id]가 그 결과(게시됨+링크 / 실패 사유)를 다시 받아오는 창구.
// 중복 게시 자체는 기존 published_posts 예약(draft_id 해시 + ON CONFLICT DO NOTHING)이
// 막는다 — 이 테스트는 그 예약이 느린 경로에서도 그대로 작동하는지, 그리고 접수 뒤
// 클라이언트가 기다리지 않아도 백그라운드 완료 처리가 실제로 이뤄지는지를 함께 본다.
import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import fs from "fs";
import os from "os";
import path from "path";

const H = vi.hoisted(() => ({
  tenantId: "11111111-1111-1111-1111-111111111111" as string | null,
  cred: null as { token: string; userId?: string; accountId?: string } | null,
  reelsCalls: [] as unknown[][],
  reelsResult: { ok: true, externalId: "media-1", permalink: "https://www.instagram.com/reel/x/" } as Record<string, unknown>,
  reelsDelayMs: 0,
  rows: [] as Array<{
    id: string; draft_id: string; platform: string; account_id: string | null;
    status: string; external_id: string | null; permalink: string | null;
  }>,
  seq: 0,
}));

vi.mock("@/lib/tenant-auth", () => ({ effectiveTenantId: vi.fn(async () => H.tenantId) }));

vi.mock("@/lib/db", () => ({
  withTenant: vi.fn(async (_t: string, cb: (sql: unknown) => unknown) => {
    const sql = (strings: TemplateStringsArray, ...vals: unknown[]) => {
      const q = strings.join(" ");
      const live = (draft: unknown, platform: unknown, account: unknown) =>
        H.rows.find((r) =>
          r.draft_id === draft && r.platform === platform && r.account_id === (account ?? null)
          && (r.status === "published" || r.status === "in_progress"));
      if (q.includes("INSERT INTO published_posts")) {
        const [, draft, platform, , account] = vals as [unknown, string, string, unknown, string | null];
        if (live(draft, platform, account)) return Promise.resolve([]);
        const id = `res-${++H.seq}`;
        H.rows.push({ id, draft_id: draft, platform, account_id: account ?? null, status: "in_progress", external_id: null, permalink: null });
        return Promise.resolve([{ id }]);
      }
      if (q.includes("SELECT status, external_id, permalink") || q.includes("SELECT id::text, status, external_id, permalink")) {
        const [, draft, platform, account] = vals as [unknown, string, string, string | null];
        const row = live(draft, platform, account);
        return Promise.resolve(row ? [row] : []);
      }
      if (q.includes("UPDATE published_posts")) {
        const id = vals.find((value) => H.rows.some((candidate) => candidate.id === value)) as string;
        const row = H.rows.find((r) => r.id === id);
        if (row) {
          if (vals.length >= 6) {
            row.status = vals[0] as string;
            row.external_id = (vals[1] as string | null) ?? null;
            row.permalink = (vals[2] as string | null) ?? null;
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

vi.mock("@/lib/usage-events", () => ({
  publicationUsageOutbox: (platform: string) => ({ usageEvent: { status: "pending", platform } }),
  recordPublicationEvent: vi.fn(async () => ({ recorded: true, alreadyRecorded: false })),
}));

vi.mock("@/lib/publish", async (importActual) => {
  const actual = await importActual<typeof import("@/lib/publish")>();
  return {
    ...actual,
    getChannelCred: vi.fn(async () => H.cred),
    publishInstagramReels: vi.fn(async (...args: unknown[]) => {
      H.reelsCalls.push(args);
      if (H.reelsDelayMs > 0) await new Promise((r) => setTimeout(r, H.reelsDelayMs));
      return H.reelsResult;
    }),
  };
});

let tmpRoot: string;

async function callPublish(body: Record<string, unknown>) {
  const { POST } = await import("@/app/api/video/publish/route");
  const res = await POST(new Request("http://internal.local/api/video/publish", {
    method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(body),
  }));
  return { status: res.status, json: (await res.json()) as Record<string, unknown> };
}

async function callJob(jobId: string) {
  const { GET } = await import("@/app/api/video/publish/job/[id]/route");
  const res = await GET(
    new Request(`http://internal.local/api/video/publish/job/${jobId}?tenant_id=${H.tenantId}`),
    { params: Promise.resolve({ id: jobId }) },
  );
  return { status: res.status, json: (await res.json()) as Record<string, unknown> };
}

describe("/api/video/publish — 느린 발행은 202 + jobId로 접수하고 백그라운드로 잇는다", () => {
  beforeEach(() => {
    tmpRoot = fs.mkdtempSync(path.join(os.tmpdir(), "osmu-vpub-async-"));
    process.env.DATA_DIR = tmpRoot;
    process.env.OSMU_PUBLIC_URL = "https://public.example.com";
    process.env.MEDIA_SIGNING_SECRET = "test-media-signing-secret-0123456789";
    const dir = path.join(tmpRoot, "tenants", H.tenantId as string, "videos");
    fs.mkdirSync(dir, { recursive: true });
    fs.writeFileSync(path.join(dir, "clip.mp4"), Buffer.alloc(2048, 1));
    H.cred = { token: "tok", userId: "ig-user", accountId: "22222222-2222-2222-2222-222222222222" };
    H.reelsCalls = [];
    H.reelsDelayMs = 0;
    H.rows = [];
    H.seq = 0;
    H.reelsResult = { ok: true, externalId: "media-1", permalink: "https://www.instagram.com/reel/x/" };
    vi.resetModules();
  });

  afterEach(() => {
    fs.rmSync(tmpRoot, { recursive: true, force: true });
    delete process.env.OSMU_PUBLIC_URL;
    delete process.env.MEDIA_SIGNING_SECRET;
    delete process.env.VIDEO_PUBLISH_FAST_PATH_BUDGET_MS;
  });

  it("빠르게 끝나면(예산 안쪽) 기존과 똑같이 200으로 그 자리에서 바로 응답한다", async () => {
    // 예산(라우트 기본 8초, 여기선 실시간 테스트를 위해 200ms로 좁힘)보다 훨씬 짧은 지연.
    process.env.VIDEO_PUBLISH_FAST_PATH_BUDGET_MS = "200";
    H.reelsDelayMs = 5;
    const { status, json } = await callPublish({ filename: "clip.mp4", platform: "reels", description: "본문" });
    expect(status).toBe(200);
    expect(json.ok).toBe(true);
    expect(json.jobId).toBeUndefined();
  });

  it("예산을 넘기면 202 + jobId를 돌려주고, 그 뒤 GET job이 완료 결과를 돌려준다", async () => {
    process.env.VIDEO_PUBLISH_FAST_PATH_BUDGET_MS = "30"; // 예산을 짧게 좁혀 실시간으로 재현.
    H.reelsDelayMs = 300; // 예산보다 길다.
    const { status, json } = await callPublish({ filename: "clip.mp4", platform: "reels", description: "본문" });
    expect(status).toBe(202);
    expect(json.ok).toBe(true);
    expect(typeof json.jobId).toBe("string");

    // 백그라운드 작업이 끝날 때까지 실제로 기다린다(제공자 호출 지연 300ms + 여유).
    await new Promise((r) => setTimeout(r, 400));

    const job = await callJob(json.jobId as string);
    expect(job.status).toBe(200);
    expect(job.json).toMatchObject({ ok: true, platform: "instagram_reels", videoId: "media-1" });
    expect(H.reelsCalls.length).toBe(1);
  });

  it("처리 중에 GET job을 부르면 processing을 돌려준다(완료 전 조기 조회)", async () => {
    process.env.VIDEO_PUBLISH_FAST_PATH_BUDGET_MS = "30";
    H.reelsDelayMs = 300;
    const { json } = await callPublish({ filename: "clip.mp4", platform: "reels" });

    const job = await callJob(json.jobId as string);
    expect(job.status).toBe(200);
    expect(job.json).toMatchObject({ ok: true, status: "processing" });

    await new Promise((r) => setTimeout(r, 400)); // 뒷정리 — 백그라운드가 끝나고 테스트가 종료되게.
  });

  it("존재하지 않는 jobId는 404다", async () => {
    const job = await callJob("00000000-0000-0000-0000-000000000000");
    expect(job.status).toBe(404);
  });
});

describe("/api/video/publish — 느린 경로에서도 재발행(같은 draft_id)은 중복 게시하지 않는다", () => {
  beforeEach(() => {
    tmpRoot = fs.mkdtempSync(path.join(os.tmpdir(), "osmu-vpub-async-dup-"));
    process.env.DATA_DIR = tmpRoot;
    process.env.OSMU_PUBLIC_URL = "https://public.example.com";
    process.env.MEDIA_SIGNING_SECRET = "test-media-signing-secret-0123456789";
    const dir = path.join(tmpRoot, "tenants", H.tenantId as string, "videos");
    fs.mkdirSync(dir, { recursive: true });
    fs.writeFileSync(path.join(dir, "clip.mp4"), Buffer.alloc(2048, 1));
    H.cred = { token: "tok", userId: "ig-user", accountId: "22222222-2222-2222-2222-222222222222" };
    H.reelsCalls = [];
    H.reelsDelayMs = 0;
    H.rows = [];
    H.seq = 0;
    H.reelsResult = { ok: true, externalId: "media-1", permalink: "https://www.instagram.com/reel/x/" };
    vi.resetModules();
  });

  afterEach(() => {
    fs.rmSync(tmpRoot, { recursive: true, force: true });
    delete process.env.OSMU_PUBLIC_URL;
    delete process.env.MEDIA_SIGNING_SECRET;
    delete process.env.VIDEO_PUBLISH_FAST_PATH_BUDGET_MS;
  });

  it("느린 1차 발행이 아직 끝나기 전에(202 받은 뒤) 같은 draft_id로 재발행을 눌러도 두 번째 media_publish는 안 나간다", async () => {
    process.env.VIDEO_PUBLISH_FAST_PATH_BUDGET_MS = "30";
    const draftId = "99999999-9999-9999-9999-999999999999";
    H.reelsDelayMs = 300;
    const firstAck = await callPublish({ filename: "clip.mp4", platform: "reels", draft_id: draftId });
    expect(firstAck.status).toBe(202);

    // 화면이 524로 오판해 "실패한 곳만 다시 발행"을 누른 상황을 흉내 — 같은 draft_id로
    // 즉시 재호출한다. 예약이 아직 in_progress이므로 409로 fail-closed여야 한다(기존 계약
    // 그대로, 느린 경로에서도 깨지지 않는다).
    const second = await callPublish({ filename: "clip.mp4", platform: "reels", draft_id: draftId });
    expect(second.status).toBe(409);
    expect(H.reelsCalls.length).toBe(1); // 외부 발행은 정확히 1회

    await new Promise((r) => setTimeout(r, 400)); // 1차 백그라운드 작업이 끝나게 둔다.
  });
});
