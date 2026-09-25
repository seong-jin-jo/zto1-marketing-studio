/**
 * 3차 재리뷰(Claude Opus 5.5) BLOCKER(a) 회귀: videoEdit 저장의 compare-and-set.
 *
 * revision은 클라이언트의 "조작 횟수"이지 서버 판 번호가 아니다(withRevision이 조작마다
 * +1). 오래된 클라이언트도 몇 번 타이핑하면 조작 횟수가 서버 판 번호를 앞질러 예전
 * "client<server면 거절" 규칙을 통과해 버렸다. 지금은 클라이언트가 마지막으로 읽은 서버
 * 판 번호(videoEditBaseRevision)를 보내고, 서버는 그 값이 지금 저장된 값과 "정확히
 * 같을 때만" 저장을 허락한다.
 *
 * DB mock은 video-edit-drafts-route.integration.test.ts와 같은 패턴(호출마다 미리 채운
 * 행을 돌려주는 sql 태그 함수)을 쓴다 — 실제 SQL 문법이 아니라 라우트의 분기 동작
 * (CAS 성공·충돌·존재 확인)을 검증한다.
 */
import { beforeEach, describe, expect, it, vi } from "vitest";
import { emptyVideoEdit, addOverlay } from "@/lib/studio/video-edit-contract";

const H = vi.hoisted(() => ({
  queue: [] as Array<Array<Record<string, unknown>>>,
  jsonValues: [] as unknown[],
}));

vi.mock("@/lib/tenant-auth", () => ({
  effectiveTenantId: vi.fn(async () => "tenant-1"),
}));

vi.mock("@/lib/db", () => ({
  withTenant: vi.fn(async (_tenantId: string, callback: (sql: unknown) => unknown) => {
    const sql = Object.assign(() => Promise.resolve(H.queue.shift() ?? []), {
      json: (value: unknown) => { H.jsonValues.push(value); return value; },
    });
    return callback(sql);
  }),
}));

beforeEach(() => {
  vi.resetModules();
  H.queue = [];
  H.jsonValues = [];
});

describe("POST /api/studio/drafts videoEdit compare-and-set (3차 재리뷰 BLOCKER a)", () => {
  it("baseRevision이 저장된 판 번호와 같으면 저장되고, 서버가 판 번호를 +1해 응답으로 돌려준다", async () => {
    H.queue = [[{ id: "d1", server_revision: 6 }]]; // CAS UPDATE ... RETURNING
    const videoEdit = addOverlay(emptyVideoEdit(), "hook", "훅", 0, 3);
    const { POST } = await import("@/app/api/studio/drafts/route");
    const res = await POST(new Request("http://x", {
      method: "POST",
      body: JSON.stringify({ tenant_id: "tenant-1", id: "d1", idea: "i", videoEdit, videoEditBaseRevision: 5 }),
    }));
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ ok: true, id: "d1", videoEditServerRevision: 6 });
  });

  it("클라이언트 조작 횟수(videoEdit.revision)가 서버보다 훨씬 커도 baseRevision이 다르면 409로 거절한다", async () => {
    // CAS UPDATE가 0행(불일치) → 존재 확인이 지금 저장된 판 번호(9)를 돌려준다.
    H.queue = [[], [{ id: "d1", revision: 9 }]];
    let videoEdit = emptyVideoEdit();
    for (let i = 0; i < 20; i += 1) videoEdit = addOverlay(videoEdit, "hook", `훅 ${i}`, 0, 3);
    expect(videoEdit.revision).toBeGreaterThan(9); // 옛 규칙(client<server만 거절)이면 통과했을 조건
    const { POST } = await import("@/app/api/studio/drafts/route");
    const res = await POST(new Request("http://x", {
      method: "POST",
      body: JSON.stringify({ tenant_id: "tenant-1", id: "d1", idea: "i", videoEdit, videoEditBaseRevision: 3 }),
    }));
    expect(res.status).toBe(409);
    const body = await res.json();
    expect(body.code).toBe("VIDEO_EDIT_STALE_REVISION");
  });

  it("baseRevision을 안 보냈는데 서버에 이미 판 번호가 있으면 거절한다(GET으로 먼저 맞춰야 한다)", async () => {
    H.queue = [[], [{ id: "d1", revision: 2 }]];
    const videoEdit = addOverlay(emptyVideoEdit(), "hook", "훅", 0, 3);
    const { POST } = await import("@/app/api/studio/drafts/route");
    const res = await POST(new Request("http://x", {
      method: "POST",
      body: JSON.stringify({ tenant_id: "tenant-1", id: "d1", idea: "i", videoEdit }),
    }));
    expect(res.status).toBe(409);
  });

  it("두 탭이 같은 판 번호를 baseRevision으로 보내면 먼저 저장한 쪽만 성공하고 나중 쪽은 409다", async () => {
    // 탭 A: CAS 성공(0행이 아님).
    H.queue = [[{ id: "d1", server_revision: 4 }]];
    const editA = addOverlay(emptyVideoEdit(), "hook", "A", 0, 3);
    const { POST } = await import("@/app/api/studio/drafts/route");
    const resA = await POST(new Request("http://x", {
      method: "POST",
      body: JSON.stringify({ tenant_id: "tenant-1", id: "d1", idea: "i", videoEdit: editA, videoEditBaseRevision: 3 }),
    }));
    expect(resA.status).toBe(200);

    // 탭 B: 같은 baseRevision(3)으로 뒤늦게 도착 — A가 이미 4로 올려놔서 이번엔 CAS가
    // 0행을 돌려주고(불일치), 존재 확인이 4를 돌려준다.
    H.queue = [[], [{ id: "d1", revision: 4 }]];
    const editB = addOverlay(emptyVideoEdit(), "hook", "B", 0, 3);
    const resB = await POST(new Request("http://x", {
      method: "POST",
      body: JSON.stringify({ tenant_id: "tenant-1", id: "d1", idea: "i", videoEdit: editB, videoEditBaseRevision: 3 }),
    }));
    expect(resB.status).toBe(409);
  });
});
