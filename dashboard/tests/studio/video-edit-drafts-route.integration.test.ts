/**
 * /api/studio/drafts 의 videoEdit 저장·검증 경로(M6, 2026-09-22 코드리뷰). cardDeck 왕복
 * 테스트(card-deck-drafts-route.integration.test.ts)와 같은 패턴으로 정상 저장·400 거부·
 * 413 거부를 확인한다.
 */
import { beforeEach, describe, expect, it, vi } from "vitest";
import { withTenant } from "@/lib/db";
import { emptyVideoEdit, addOverlay } from "@/lib/studio/video-edit-contract";

const H = vi.hoisted(() => ({
  rows: [] as Array<Record<string, unknown>>,
  jsonValues: [] as unknown[],
}));

vi.mock("@/lib/tenant-auth", () => ({
  effectiveTenantId: vi.fn(async () => "tenant-1"),
}));

vi.mock("@/lib/db", () => ({
  withTenant: vi.fn(async (_tenantId: string, callback: (sql: unknown) => unknown) => {
    const sql = Object.assign(() => Promise.resolve(H.rows), {
      json: (value: unknown) => {
        H.jsonValues.push(value);
        return value;
      },
    });
    return callback(sql);
  }),
}));

beforeEach(() => {
  vi.resetModules();
  H.rows = [];
  H.jsonValues = [];
});

describe("POST /api/studio/drafts videoEdit 저장·검증 (M6)", () => {
  it("정상 videoEdit는 저장된다", async () => {
    H.rows = [{ id: "draft-video-1" }];
    const videoEdit = addOverlay(emptyVideoEdit(), "hook", "이거 순서가 틀렸다면?", 0, 3);
    const { POST } = await import("@/app/api/studio/drafts/route");
    const response = await POST(new Request("http://localhost/api/studio/drafts", {
      method: "POST",
      body: JSON.stringify({ tenant_id: "tenant-1", idea: "영상 편집 저장", videoEdit }),
    }));

    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ ok: true, id: "draft-video-1" });
    const savedPayload = H.jsonValues[0] as { videoEdit: unknown };
    expect(savedPayload.videoEdit).toEqual(videoEdit);
  });

  it("불변식 위반 videoEdit(시작==끝)는 400 INVALID_VIDEO_EDIT { rule } 으로 거부하고 DB 접근 전에 막는다", async () => {
    vi.mocked(withTenant).mockClear();
    const broken = { ...emptyVideoEdit(), overlays: [{ id: "ov-1", order: 0, kind: "hook", text: "훅", startSec: 3, endSec: 3 }] };

    const { POST } = await import("@/app/api/studio/drafts/route");
    const response = await POST(new Request("http://localhost/api/studio/drafts", {
      method: "POST",
      body: JSON.stringify({ tenant_id: "tenant-1", idea: "잘못된 영상 편집", videoEdit: broken }),
    }));
    const body = await response.json();

    expect(response.status).toBe(400);
    expect(body.code).toBe("INVALID_VIDEO_EDIT");
    expect(typeof body.rule).toBe("string");
    expect(withTenant).not.toHaveBeenCalled();
  });

  it("64KB를 넘는 videoEdit는 413 VIDEO_EDIT_TOO_LARGE로 거부한다", async () => {
    vi.mocked(withTenant).mockClear();
    let big = emptyVideoEdit();
    for (let i = 0; i < 2000; i += 1) {
      big = addOverlay(big, "hook", `훅 문구 ${i} ${"가".repeat(40)}`, i, i + 1);
    }

    const { POST } = await import("@/app/api/studio/drafts/route");
    const response = await POST(new Request("http://localhost/api/studio/drafts", {
      method: "POST",
      body: JSON.stringify({ tenant_id: "tenant-1", idea: "너무 큰 영상 편집", videoEdit: big }),
    }));
    const body = await response.json();

    expect(response.status).toBe(413);
    expect(body.code).toBe("VIDEO_EDIT_TOO_LARGE");
    expect(withTenant).not.toHaveBeenCalled();
  });

  it("videoEdit 키가 아예 없으면 저장 payload에서 빠져 기존 값을 보존한다(cardDeck과 동일 규칙)", async () => {
    H.rows = [{ id: "draft-video-2" }];
    const { POST } = await import("@/app/api/studio/drafts/route");
    const response = await POST(new Request("http://localhost/api/studio/drafts", {
      method: "POST",
      body: JSON.stringify({ tenant_id: "tenant-1", idea: "videoEdit 없이 저장" }),
    }));
    expect(response.status).toBe(200);
    const savedPayload = H.jsonValues[0] as Record<string, unknown>;
    expect(Object.prototype.hasOwnProperty.call(savedPayload, "videoEdit")).toBe(false);
  });

  it("videoEdit:null도 clear 플래그가 없으면 기존 편집값을 보존한다", async () => {
    H.rows = [{ id: "draft-null-video-edit" }];
    const { POST } = await import("@/app/api/studio/drafts/route");
    const response = await POST(new Request("http://localhost/api/studio/drafts", {
      method: "POST",
      body: JSON.stringify({ tenant_id: "tenant-1", idea: "반대 도메인 null", videoEdit: null }),
    }));
    expect(response.status).toBe(200);
    const savedPayload = H.jsonValues[0] as Record<string, unknown>;
    expect(Object.prototype.hasOwnProperty.call(savedPayload, "videoEdit")).toBe(false);
  });

  it("clearVideoEdit:true는 videoEdit를 명시적으로 null로 지운다", async () => {
    H.rows = [{ id: "draft-video-3" }];
    const { POST } = await import("@/app/api/studio/drafts/route");
    const response = await POST(new Request("http://localhost/api/studio/drafts", {
      method: "POST",
      body: JSON.stringify({ tenant_id: "tenant-1", idea: "videoEdit 지우기", clearVideoEdit: true }),
    }));
    expect(response.status).toBe(200);
    const savedPayload = H.jsonValues[0] as Record<string, unknown>;
    expect(savedPayload.videoEdit).toBeNull();
  });
});
