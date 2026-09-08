// 2026-09-07 정정: 제공자 실패를 502 로 돌려주던 계약을 바꿨다. 우리 앞의 리버스 프록시가
// 502 를 보면 우리 JSON 본문을 자기 HTML 오류 페이지로 갈아치워, 화면에 남는 것이
// "<!DOCTYPE html>" 뿐이었다. 실제로 릴스 발행을 시험했을 때 코드가 죽은 것인지 제공자가
// 거절한 것인지조차 구분할 수 없었다. 이제 200 + ok:false 로 답한다(/api/publish 와 같은 계약).
import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import fs from "fs";
import os from "os";
import path from "path";
import { verifyMediaToken } from "@/lib/media-token";

// SNS-015: /api/video/publish 의 reels 분기 — 계정 선택, 서명 URL 발급, dedupe, 비노출 계약.
const H = vi.hoisted(() => ({
  tenantId: "11111111-1111-1111-1111-111111111111" as string | null,
  cred: null as { token: string; userId?: string; accountId?: string } | null,
  getChannelCredCalls: [] as unknown[][],
  reelsCalls: [] as unknown[][],
  reelsResult: { ok: true, externalId: "media-1", permalink: "https://www.instagram.com/reel/x/" } as Record<string, unknown>,
  // published_posts 인메모리 대역. uq_published_posts_idem(partial unique on
  // tenant+draft+platform+account WHERE status IN ('published','in_progress'))의 의미를
  // 그대로 흉내낸다 — 그래야 예약 INSERT ... ON CONFLICT DO NOTHING의 동시성 계약을 테스트할 수 있다.
  rows: [] as Array<{
    id: string;
    draft_id: string;
    platform: string;
    account_id: string | null;
    status: string;
    external_id: string | null;
    permalink: string | null;
  }>,
  inserts: [] as unknown[][],
  dbFail: false,
  staleReclaim: false,
  seq: 0,
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
        H.rows.push({ id, draft_id: draft, platform, account_id: account ?? null, status: "in_progress", external_id: null, permalink: null });
        return Promise.resolve([{ id }]);
      }
      if (q.includes("SELECT status, external_id, permalink")) {
        const [, draft, platform, account] = vals as [unknown, string, string, string | null];
        const row = live(draft, platform, account);
        return Promise.resolve(row ? [row] : []);
      }
      if (q.includes("stale") || q.includes("15 minutes")) {
        // 좀비 예약 회수 UPDATE — H.staleReclaim이 켜져 있을 때만 회수된 것으로 취급한다.
        const [, draft, platform, account] = vals as [unknown, string, string, string | null];
        const row = live(draft, platform, account);
        if (H.staleReclaim && row && row.status === "in_progress") {
          row.status = "failed";
          return Promise.resolve([{ id: row.id }]);
        }
        return Promise.resolve([]);
      }
      if (q.includes("UPDATE published_posts")) {
        // 전체 UPDATE(성공/실패 확정)는 값이 [status, ext, permalink, error, id, tenant],
        // catch 경로의 축약 UPDATE는 [error, id, tenant].
        const id = vals[vals.length - 2] as string;
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
        return Promise.resolve([]);
      }
      return Promise.resolve([]);
    };
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
    publishInstagramReels: vi.fn(async (...args: unknown[]) => {
      H.reelsCalls.push(args);
      return H.reelsResult;
    }),
  };
});

let tmpRoot: string;

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

describe("/api/video/publish — Instagram Reels", () => {
  beforeEach(() => {
    tmpRoot = fs.mkdtempSync(path.join(os.tmpdir(), "osmu-reels-"));
    process.env.DATA_DIR = tmpRoot;
    process.env.OSMU_PUBLIC_URL = "https://public.example.com";
    process.env.MEDIA_SIGNING_SECRET = "test-media-signing-secret-0123456789";
    const dir = path.join(tmpRoot, "tenants", H.tenantId as string, "videos");
    fs.mkdirSync(dir, { recursive: true });
    fs.writeFileSync(path.join(dir, "clip.mp4"), Buffer.alloc(2048, 1));
    fs.writeFileSync(path.join(dir, "notes.txt"), "x");
    H.cred = { token: "tok", userId: "ig-user", accountId: "22222222-2222-2222-2222-222222222222" };
    H.getChannelCredCalls = [];
    H.reelsCalls = [];
    H.inserts = [];
    H.rows = [];
    H.dbFail = false;
    H.staleReclaim = false;
    H.seq = 0;
    H.reelsResult = { ok: true, externalId: "media-1", permalink: "https://www.instagram.com/reel/x/" };
    vi.resetModules();
  });

  afterEach(() => {
    fs.rmSync(tmpRoot, { recursive: true, force: true });
    delete process.env.OSMU_PUBLIC_URL;
    delete process.env.MEDIA_SIGNING_SECRET;
  });

  it("happy path — 501이 아니라 실제로 발행하고 permalink를 돌려준다", async () => {
    const { status, json } = await callPublish({ filename: "clip.mp4", platform: "reels", description: "본문" });
    expect(status).toBe(200);
    expect(json).toMatchObject({ ok: true, platform: "instagram_reels", videoId: "media-1" });
    expect(json.url).toBe("https://www.instagram.com/reel/x/");
    expect(H.reelsCalls.length).toBe(1);
  });

  it("video_url은 공개 HTTPS + 서명 토큰 — 경로/쿼리에 원문 파일명·인증토큰이 없고, payload는 서명·만료로만 보호된다", async () => {
    await callPublish({ filename: "clip.mp4", platform: "instagram_reels" });
    const url = String(H.reelsCalls[0][2]);
    expect(url.startsWith("https://public.example.com/api/media/")).toBe(true);
    // 보장 ①: URL의 경로/쿼리에 원문 파일명·테넌트·채널 액세스 토큰이 평문으로 실리지 않는다
    // (프록시·리퍼러 로그 노출면 축소). 비밀 유지가 아니라 노출면 축소가 목적이다.
    expect(url).not.toContain("clip.mp4");
    expect(url).not.toContain(H.tenantId as string);
    expect(url).not.toContain("tok");
    expect(new URL(url).search).toBe("");
    // 보장 ②: 그러나 payload는 base64url JSON이라 **토큰 소지자는 그대로 읽을 수 있다**.
    // 불투명(opaque)하지 않다 — 실제 방어는 HMAC 위조 불가 + 짧은 만료뿐임을 명시적으로 못박는다.
    const raw = url.split("/api/media/")[1];
    const decoded = JSON.parse(Buffer.from(raw.split(".")[0], "base64url").toString());
    expect(decoded.t).toBe(H.tenantId);
    expect(decoded.f).toBe("clip.mp4");
    expect(typeof decoded.e).toBe("number");
    const claim = verifyMediaToken(raw);
    expect(claim).toMatchObject({ tenantId: H.tenantId, filename: "clip.mp4" });
  });

  it("account_id는 getChannelCred에 그대로 전달되고, 없으면 다른 계정으로 폴백하지 않는다", async () => {
    await callPublish({ filename: "clip.mp4", platform: "reels", account_id: "33333333-3333-3333-3333-333333333333" });
    expect(H.getChannelCredCalls[0]).toEqual([H.tenantId, "instagram", "33333333-3333-3333-3333-333333333333"]);

    H.cred = null;
    const { status, json } = await callPublish({
      filename: "clip.mp4",
      platform: "reels",
      account_id: "33333333-3333-3333-3333-333333333333",
    });
    expect(status).toBe(400);
    expect(String(json.error)).toContain("선택한 Instagram 계정");
    expect(H.reelsCalls.length).toBe(1); // 첫 호출분만 — 미연결 분기는 외부 발행 없음
  });

  it("이미 발행된 draft는 재시도해도 두 번째 media_publish를 하지 않는다", async () => {
    const draftId = "44444444-4444-4444-4444-444444444444";
    await callPublish({ filename: "clip.mp4", platform: "reels", draft_id: draftId });
    expect(H.reelsCalls.length).toBe(1);

    const { status, json } = await callPublish({ filename: "clip.mp4", platform: "reels", draft_id: draftId });
    expect(status).toBe(200);
    expect(json).toMatchObject({ ok: true, alreadyPublished: true, videoId: "media-1" });
    expect(H.reelsCalls.length).toBe(1); // 외부 호출 증가 없음
  });

  it("draft_id가 없으면 idempotency_key로 같은 dedupe 계약을 쓴다", async () => {
    const key = "55555555-5555-5555-5555-555555555555";
    H.reelsResult = { ok: true, externalId: "media-7", permalink: null };
    await callPublish({ filename: "clip.mp4", platform: "reels", idempotency_key: key });
    expect(H.reelsCalls.length).toBe(1);
    const { json } = await callPublish({ filename: "clip.mp4", platform: "reels", idempotency_key: key });
    expect(json.alreadyPublished).toBe(true);
    expect(H.reelsCalls.length).toBe(1);
  });

  it("draft_id/idempotency_key 없이(실 UI 클릭) 같은 페이로드를 재전송하면 재발행하지 않는다", async () => {
    // 1차 호출 — 아직 기록 없음 → 실제 발행.
    await callPublish({ filename: "clip.mp4", platform: "reels", description: "동일 캡션" });
    expect(H.reelsCalls.length).toBe(1);
    const firstInsertDraftId = H.inserts[0]?.[1];
    expect(typeof firstInsertDraftId).toBe("string");
    expect(firstInsertDraftId).toMatch(/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i);

    // 2차 호출 — 완전히 동일한 클릭 페이로드(파일/캡션/계정 동일) → 같은 키라 재발행 없음.
    const { json } = await callPublish({ filename: "clip.mp4", platform: "reels", description: "동일 캡션" });
    expect(json.alreadyPublished).toBe(true);
    expect(H.reelsCalls.length).toBe(1); // 외부 재발행 없음
  });

  it("캡션이 바뀌면 다른 dedupe 키가 되어 재발행을 허용한다", async () => {
    await callPublish({ filename: "clip.mp4", platform: "reels", description: "캡션 A" });
    expect(H.reelsCalls.length).toBe(1);
    // 캡션이 다르므로 이전 "이미 발행됨" 레코드가 있어도 dedupe 키가 달라 재발행돼야 한다.
    await callPublish({ filename: "clip.mp4", platform: "reels", description: "캡션 B" });
    expect(H.reelsCalls.length).toBe(2);
  });

  it("제목만 바뀌어도 캡션이 달라지므로 재발행을 허용한다(해시는 최종 캡션 기준)", async () => {
    await callPublish({ filename: "clip.mp4", platform: "reels", title: "제목 A", description: "같은 본문" });
    expect(H.reelsCalls.length).toBe(1);
    // description은 동일하고 title만 변경 — 프로바이더로 나가는 캡션이 실제로 달라지므로
    // dedupe 키도 달라야 한다(구 버전은 description만 해싱해 영구 차단됐다).
    const { status, json } = await callPublish({ filename: "clip.mp4", platform: "reels", title: "제목 B", description: "같은 본문" });
    expect(status).toBe(200);
    expect(json.alreadyPublished).toBeUndefined();
    expect(H.reelsCalls.length).toBe(2);
    expect(String(H.reelsCalls[0][1])).not.toBe(String(H.reelsCalls[1][1]));
  });

  it("발행 실패는 200 + ok:false + 고정 문구 — 프로바이더 원문/스택을 반환하지 않는다", async () => {
    H.reelsResult = { ok: false, error: "IG Reels container 실패(400)" };
    const { status, json } = await callPublish({ filename: "clip.mp4", platform: "reels" });
    expect(status).toBe(200);
    expect(json.error).toBe("IG Reels container 실패(400)");
    expect(JSON.stringify(json)).not.toContain("access_token");
  });

  it("영상이 아닌 파일/경로 traversal은 외부 호출 전에 거부한다", async () => {
    expect((await callPublish({ filename: "notes.txt", platform: "reels" })).status).toBe(400);
    expect((await callPublish({ filename: "../../etc/passwd", platform: "reels" })).status).toBe(400);
    expect(H.reelsCalls.length).toBe(0);
  });

  it("공개 HTTPS origin이 없으면 서명 URL을 만들지 않고 정직하게 거부한다", async () => {
    delete process.env.OSMU_PUBLIC_URL;
    const { status, json } = await callPublish({ filename: "clip.mp4", platform: "reels" });
    expect(status).toBe(400);
    expect(String(json.error)).toContain("HTTPS");
    expect(H.reelsCalls.length).toBe(0);
  });

  // ── 동시성(SNS-015 finding 4) ────────────────────────────────────────────
  it("같은 키의 동시 요청 중 하나만 외부 발행하고, 진 요청은 409로 fail-closed", async () => {
    const draftId = "66666666-6666-6666-6666-666666666666";
    // 첫 요청이 예약을 잡은 채 아직 끝나지 않은 상태(= in_progress)를 만든다.
    let release: (v: unknown) => void = () => {};
    const gate = new Promise((r) => { release = r; });
    H.reelsResult = { ok: true, externalId: "media-1", permalink: "https://www.instagram.com/reel/x/" };
    const { publishInstagramReels } = await import("@/lib/publish");
    (publishInstagramReels as unknown as { mockImplementation: (f: unknown) => void }).mockImplementation(
      async (...args: unknown[]) => { H.reelsCalls.push(args); await gate; return H.reelsResult; },
    );

    const first = callPublish({ filename: "clip.mp4", platform: "reels", draft_id: draftId });
    await new Promise((r) => setTimeout(r, 0));
    const second = await callPublish({ filename: "clip.mp4", platform: "reels", draft_id: draftId });

    expect(second.status).toBe(409);
    expect(second.json.code).toBe("publish_in_progress");
    expect(second.json.ok).toBe(false);
    expect(H.reelsCalls.length).toBe(1); // 외부 media_publish는 정확히 1회

    release(null);
    expect((await first).status).toBe(200);
  });

  it("실패한 발행은 in_progress를 남기지 않아 재시도가 가능하다(영구 409 방지)", async () => {
    const draftId = "77777777-7777-7777-7777-777777777777";
    H.reelsResult = { ok: false, error: "IG Reels container 실패(400)" };
    expect((await callPublish({ filename: "clip.mp4", platform: "reels", draft_id: draftId })).status).toBe(200);
    expect(H.rows[0].status).toBe("failed");

    H.reelsResult = { ok: true, externalId: "media-9", permalink: null };
    const retry = await callPublish({ filename: "clip.mp4", platform: "reels", draft_id: draftId });
    expect(retry.status).toBe(200);
    expect(H.reelsCalls.length).toBe(2);
  });

  it("15분 넘게 남은 좀비 예약은 회수해 재발행을 허용한다(영구 409 방지)", async () => {
    const draftId = "88888888-8888-8888-8888-888888888888";
    // 프로세스가 발행 도중 죽어 in_progress가 남은 상태를 직접 만든다.
    H.rows.push({
      id: "zombie", draft_id: draftId, platform: "instagram_reels",
      account_id: "22222222-2222-2222-2222-222222222222",
      status: "in_progress", external_id: null, permalink: null,
    });

    // 아직 15분이 안 지났으면 회수하지 않고 409 — 정상 진행 중인 요청을 가로채지 않는다.
    H.staleReclaim = false;
    expect((await callPublish({ filename: "clip.mp4", platform: "reels", draft_id: draftId })).status).toBe(409);
    expect(H.reelsCalls.length).toBe(0);

    // 15분 경과 → 회수 후 재예약 성공 → 실제 발행.
    H.staleReclaim = true;
    const { status } = await callPublish({ filename: "clip.mp4", platform: "reels", draft_id: draftId });
    expect(status).toBe(200);
    expect(H.reelsCalls.length).toBe(1);
  });

  it("예약 INSERT가 DB 장애로 실패하면 외부 발행을 강행하지 않는다(fail closed)", async () => {
    H.dbFail = true;
    const { status } = await callPublish({ filename: "clip.mp4", platform: "reels" });
    expect(status).toBe(503);
    expect(H.reelsCalls.length).toBe(0);
  });

  // ── 입력 경계 ─────────────────────────────────────────────────────────────
  it("캡션 2200자 경계 — 2200자는 통과, 2201자는 외부 호출 전에 400", async () => {
    const ok = await callPublish({ filename: "clip.mp4", platform: "reels", description: "가".repeat(2200) });
    expect(ok.status).toBe(200);
    expect(H.reelsCalls.length).toBe(1);

    const over = await callPublish({ filename: "clip.mp4", platform: "reels", description: "가".repeat(2201) });
    expect(over.status).toBe(400);
    expect(String(over.json.error)).toContain("2200");
    expect(H.reelsCalls.length).toBe(1); // 외부 호출 증가 없음
  });

  it("YouTube의 100자 제목 상한을 Reels에 적용하지 않는다 — 캡션 2200자 안이면 통과", async () => {
    // 회귀 방지: 전역 YT_MAX_TITLE 적용은 Meta 캡션(2200자)을 잘못 거부했다.
    const ok = await callPublish({ filename: "clip.mp4", platform: "reels", title: "t".repeat(300), description: "본문" });
    expect(ok.status).toBe(200);
    // 단, 제목+설명 합계는 여전히 2200자에서 잘린다(캡션 기준 하나만 적용).
    const over = await callPublish({
      filename: "clip.mp4", platform: "reels", title: "t".repeat(1200), description: "가".repeat(1100),
    });
    expect(over.status).toBe(400);
    expect(String(over.json.error)).toContain("2200");
    expect(H.reelsCalls.length).toBe(1);
  });

  it("잘못된 account_id 형식은 외부 호출 전에 거부", async () => {
    const badAcct = await callPublish({ filename: "clip.mp4", platform: "reels", account_id: "not-a-uuid" });
    expect(badAcct.status).toBe(400);
    expect(H.reelsCalls.length).toBe(0);
  });

  it("스칼라가 아닌 filename/제목은 400 — 배열·객체가 검사를 우회하지 못한다", async () => {
    expect((await callPublish({ filename: ["clip.mp4"], platform: "reels" })).status).toBe(400);
    expect((await callPublish({ filename: "clip.mp4", platform: "reels", title: { a: 1 } })).status).toBe(400);
    expect((await callPublish({ filename: "clip.mp4", platform: ["reels"] })).status).toBe(400);
    expect(H.reelsCalls.length).toBe(0);
  });

  it("깨진 JSON/비객체 본문은 500이 아니라 안정적인 400", async () => {
    const { POST } = await import("@/app/api/video/publish/route");
    const call = async (body: string) => {
      const res = await POST(new Request("http://internal.local/api/video/publish", {
        method: "POST", headers: { "content-type": "application/json" }, body,
      }));
      return { status: res.status, json: (await res.json()) as Record<string, unknown> };
    };
    const broken = await call("{not json");
    expect(broken.status).toBe(400);
    expect(String(broken.json.error)).toContain("JSON");
    expect((await call("[1,2]")).status).toBe(400);
    expect((await call('"hello"')).status).toBe(400);
    expect((await call("null")).status).toBe(400);
    expect(H.reelsCalls.length).toBe(0);
  });

  it("Reels 용량 상한은 업로드 상한(100MiB)과 같은 값이며 초과 시 외부 호출 전에 400", async () => {
    const big = path.join(tmpRoot, "tenants", H.tenantId as string, "videos", "big.mp4");
    fs.writeFileSync(big, Buffer.alloc(1024));
    const { MAX_VIDEO_BYTES } = await import("@/lib/video-limits");
    expect(MAX_VIDEO_BYTES).toBe(100 * 1024 * 1024);
    // 2026-09-08: 파일 찾기가 디렉터리를 파일로 오인하지 않도록 isFile() 을 본다.
    // 흉내에도 그 모양을 갖춰야 실제 경로와 같은 길을 탄다.
    vi.spyOn(fs, "statSync").mockReturnValue({ size: MAX_VIDEO_BYTES + 1, isFile: () => true } as unknown as fs.Stats);
    const { status, json } = await callPublish({ filename: "big.mp4", platform: "reels" });
    vi.restoreAllMocks();
    expect(status).toBe(400);
    expect(String(json.error)).toContain("100MiB");
    expect(H.reelsCalls.length).toBe(0);
  });

  it("TikTok은 미연결이면 501 대신 연결 조치를 반환한다", async () => {
    H.cred = null;
    const { status, json } = await callPublish({ filename: "clip.mp4", platform: "tiktok" });
    expect(status).toBe(400);
    expect(String(json.error)).toContain("TikTok 계정을 먼저 연결");
    expect(json.reason).not.toBe("not_implemented");
  });
});
