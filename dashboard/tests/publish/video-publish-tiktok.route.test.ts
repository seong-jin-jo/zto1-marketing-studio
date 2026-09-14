// 2026-09-07 정정: 제공자 실패를 502 로 돌려주던 계약을 바꿨다. 리버스 프록시가 502 를 보면
// 우리 JSON 본문을 자기 HTML 오류 페이지로 갈아치워 사용자가 이유를 못 본다. 200 + ok:false 로 답한다.
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import fs from "fs";
import os from "os";
import path from "path";

const TENANT = "11111111-1111-1111-1111-111111111111";
const ACCOUNT = "22222222-2222-2222-2222-222222222222";
const H = vi.hoisted(() => ({
  tenantId: "11111111-1111-1111-1111-111111111111" as string | null,
  cred: { token: "tik-token", accountId: "22222222-2222-2222-2222-222222222222" } as { token: string; accountId: string } | null,
  creator: {
    username: "creator", nickname: "Creator", avatarUrl: "",
    privacyLevels: ["SELF_ONLY", "PUBLIC_TO_EVERYONE"],
    commentDisabled: false, duetDisabled: true, stitchDisabled: false, maxVideoDurationSec: 180,
  } as Record<string, unknown> | null,
  started: { ok: true, publishId: "pub-1" } as Record<string, unknown>,
  getCredCalls: [] as unknown[][],
  startCalls: [] as unknown[],
  rows: [] as Array<{ id: string; draftId: string; accountId: string | null; status: string; externalId: string | null }>,
  seq: 0,
}));

vi.mock("@/lib/tenant-auth", () => ({ effectiveTenantId: vi.fn(async () => H.tenantId) }));
vi.mock("@/lib/db", () => ({
  withTenant: vi.fn(async (_tenant: string, callback: (sql: unknown) => unknown) => {
    const sql = (strings: TemplateStringsArray, ...values: unknown[]) => {
      const query = strings.join(" ");
      if (query.includes("INSERT INTO published_posts")) {
        const [, draftId, , , accountId] = values as [string, string, string, string | null, string | null];
        const existing = H.rows.find((row) => row.draftId === draftId && row.accountId === (accountId ?? null) && ["in_progress", "published"].includes(row.status));
        if (existing) return Promise.resolve([]);
        const row = { id: `reservation-${++H.seq}`, draftId, accountId: accountId ?? null, status: "in_progress", externalId: null };
        H.rows.push(row);
        return Promise.resolve([{ id: row.id }]);
      }
      if (query.includes("external_id IS NULL") && query.includes("15 minutes")) {
        const [, , draftId, , accountId] = values as [string, string, string, string, string | null];
        const row = H.rows.find((candidate) => candidate.draftId === draftId && candidate.accountId === (accountId ?? null) && candidate.status === "in_progress" && candidate.externalId === null);
        if (!row) return Promise.resolve([]);
        row.status = "failed";
        return Promise.resolve([{ id: row.id }]);
      }
      if (query.includes("SELECT status, external_id, provider_post_id")) {
        const [, draftId, , accountId] = values as [string, string, string, string | null];
        const row = H.rows.find((candidate) => candidate.draftId === draftId && candidate.accountId === (accountId ?? null) && ["in_progress", "published"].includes(candidate.status));
        return Promise.resolve(row ? [{ status: row.status, external_id: row.externalId, provider_post_id: null, permalink: null }] : []);
      }
      if (query.includes("SET external_id")) {
        const [publishId, reservationId] = values as [string, string];
        const row = H.rows.find((candidate) => candidate.id === reservationId);
        if (row) row.externalId = publishId;
        return Promise.resolve([]);
      }
      if (query.includes("UPDATE published_posts")) {
        const reservationId = values[values.length - 2] as string;
        const row = H.rows.find((candidate) => candidate.id === reservationId);
        if (row) row.status = "failed";
        return Promise.resolve([]);
      }
      return Promise.resolve([]);
    };
    return callback(sql);
  }),
}));
vi.mock("@/lib/publish", () => ({
  getChannelCred: vi.fn(async (...args: unknown[]) => { H.getCredCalls.push(args); return H.cred; }),
  publishInstagramReels: vi.fn(),
}));
vi.mock("@/lib/tiktok", async (importActual) => ({
  ...await importActual<typeof import("@/lib/tiktok")>(),
  queryTikTokCreatorInfo: vi.fn(async () => H.creator),
  startTikTokVideoPost: vi.fn(async (input: unknown) => { H.startCalls.push(input); return H.started; }),
}));

let root: string;

async function publish(body: Record<string, unknown>) {
  const { POST } = await import("@/app/api/video/publish/route");
  const response = await POST(new Request("http://localhost/api/video/publish", { method: "POST", body: JSON.stringify(body) }));
  return { response, body: await response.json() as Record<string, unknown> };
}

function request(overrides: Record<string, unknown> = {}) {
  return {
    filename: "clip.mp4", platform: "tiktok", title: "제목", description: "본문", privacy_level: "SELF_ONLY",
    disable_comment: false, disable_duet: false, disable_stitch: false, is_ai_generated: true,
    ...overrides,
  };
}

describe("/api/video/publish — TikTok reservation", () => {
  beforeEach(() => {
    root = fs.mkdtempSync(path.join(os.tmpdir(), "osmu-tiktok-"));
    process.env.DATA_DIR = root;
    process.env.OSMU_PUBLIC_URL = "https://public.example.com";
    process.env.MEDIA_SIGNING_SECRET = "test-media-signing-secret-0123456789";
    fs.mkdirSync(path.join(root, "tenants", TENANT, "videos"), { recursive: true });
    fs.writeFileSync(path.join(root, "tenants", TENANT, "videos", "clip.mp4"), Buffer.alloc(2048));
    H.tenantId = TENANT;
    H.cred = { token: "tik-token", accountId: ACCOUNT };
    H.creator = { username: "creator", nickname: "Creator", avatarUrl: "", privacyLevels: ["SELF_ONLY"], commentDisabled: false, duetDisabled: true, stitchDisabled: false, maxVideoDurationSec: 180 };
    H.started = { ok: true, publishId: "pub-1" };
    H.getCredCalls = [];
    H.startCalls = [];
    H.rows = [];
    H.seq = 0;
    vi.resetModules();
  });

  afterEach(() => {
    fs.rmSync(root, { recursive: true, force: true });
    delete process.env.DATA_DIR;
    delete process.env.OSMU_PUBLIC_URL;
    delete process.env.MEDIA_SIGNING_SECRET;
  });

  it("selected tenant account options are reserved and the publish_id is persisted before 202", async () => {
    const { response, body } = await publish(request({ account_id: "33333333-3333-3333-3333-333333333333" }));
    expect(response.status).toBe(202);
    expect(body).toMatchObject({ ok: true, processing: true, platform: "tiktok", publishId: "pub-1" });
    expect(H.getCredCalls[0]).toEqual([TENANT, "tiktok", "33333333-3333-3333-3333-333333333333"]);
    expect(H.startCalls).toHaveLength(1);
    expect(H.rows).toMatchObject([{ status: "in_progress", externalId: "pub-1" }]);
    expect(String((H.startCalls[0] as { videoUrl: string }).videoUrl)).not.toContain("tik-token");
  });

  it("concurrent/sequential duplicate requests reuse the reservation and never initialize a second post", async () => {
    const first = await publish(request());
    const second = await publish(request());
    expect(first.response.status).toBe(202);
    expect(second.response.status).toBe(202);
    expect(second.body).toMatchObject({ processing: true, publishId: "pub-1" });
    expect(H.startCalls).toHaveLength(1);
  });

  it("reclaims only an abandoned publish_id-less reservation, then permits one safe retry", async () => {
    const staleDraft = "44444444-4444-4444-4444-444444444444";
    H.rows.push({ id: "stale", draftId: staleDraft, accountId: ACCOUNT, status: "in_progress", externalId: null });
    const { response } = await publish(request({ draft_id: staleDraft }));
    expect(response.status).toBe(202);
    expect(H.rows.find((row) => row.id === "stale")?.status).toBe("failed");
    expect(H.startCalls).toHaveLength(1);
  });

  it("marks an init rejection failed and never exposes the provider reason", async () => {
    H.started = { ok: false, reason: "access_token=provider-secret" };
    const { response, body } = await publish(request());
    expect(response.status).toBe(200);
    expect(JSON.stringify(body)).not.toContain("provider-secret");
    expect(H.rows[0]?.status).toBe("failed");
  });
});
