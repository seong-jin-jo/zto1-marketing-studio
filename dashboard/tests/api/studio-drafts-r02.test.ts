import { beforeEach, describe, expect, it, vi } from "vitest";
import { withTenant } from "@/lib/db";

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

describe("GET /api/studio/drafts R-02 본문 복원", () => {
  it("정규 payload.text를 그대로 반환한다", async () => {
    H.rows = [{
      id: "draft-1",
      idea: "정규 초안",
      payload: { text: { threads: "본문" }, includes: { text: true } },
      status: "draft",
      updated_at: "2026-08-12T00:00:00Z",
    }];
    const { GET } = await import("@/app/api/studio/drafts/route");
    const body = await (await GET(new Request("http://localhost/api/studio/drafts"))).json();

    expect(body.drafts[0]).toEqual(expect.objectContaining({ text: { threads: "본문" } }));
    expect(body.currentWork).toEqual(expect.objectContaining({
      draftId: "draft-1",
      stage: "edit",
      stageLabel: "편집실",
    }));
  });

  it("BE-CURRENT-05 통합: 실제 데이터베이스 Date 저장 시각도 현재 작업 응답에 포함한다", async () => {
    H.rows = [{
      id: "draft-db-date",
      idea: "데이터베이스 초안",
      payload: { text: { threads: "본문" } },
      status: "draft",
      updated_at: new Date("2026-08-29T08:22:00.000Z"),
    }];
    const { GET } = await import("@/app/api/studio/drafts/route");
    const body = await (await GET(new Request("http://localhost/api/studio/drafts"))).json();

    expect(body.currentWork).toEqual(expect.objectContaining({
      draftId: "draft-db-date",
      savedAt: "2026-08-29T08:22:00.000Z",
    }));
  });

  it("레거시 최상위 플랫폼 키를 text variants로 복원한다", async () => {
    H.rows = [{
      id: "draft-legacy",
      idea: "레거시 초안",
      payload: { threads: "Threads 본문", x: "X 본문", instagram: "Instagram 본문", ignored: "제외" },
      status: "draft",
      updated_at: "2026-08-12T00:00:00Z",
    }];
    const { GET } = await import("@/app/api/studio/drafts/route");
    const body = await (await GET(new Request("http://localhost/api/studio/drafts"))).json();

    expect(body.drafts[0].text).toEqual({
      threads: "Threads 본문",
      x: "X 본문",
      instagram: "Instagram 본문",
    });
  });

  it("실제 본문이 없으면 null로 반환해 UI 빈상태를 구분한다", async () => {
    H.rows = [{
      id: "draft-empty",
      idea: "빈 초안",
      payload: { img: null, includes: {} },
      status: "draft",
      updated_at: "2026-08-12T00:00:00Z",
    }];
    const { GET } = await import("@/app/api/studio/drafts/route");
    const body = await (await GET(new Request("http://localhost/api/studio/drafts"))).json();

    expect(body.drafts[0].text).toBeNull();
  });

  it("FMT-DRAFT-01 정상: 저장된 편집 형식값을 편집실 복원용으로 반환한다", async () => {
    H.rows = [{
      id: "draft-format",
      idea: "형식값 초안",
      payload: {
        text: { threads: "본문" },
        editFormat: { kind: "card", aspectRatio: "4:5", subtitleSize: "크게", background: "창밖 새벽" },
      },
      status: "draft",
      updated_at: "2026-08-29T00:00:00Z",
    }];
    const { GET } = await import("@/app/api/studio/drafts/route");
    const body = await (await GET(new Request("http://localhost/api/studio/drafts"))).json();

    expect(body.drafts[0].editFormat).toEqual({
      kind: "card",
      aspectRatio: "4:5",
      subtitleSize: "크게",
      background: "창밖 새벽",
    });
  });

  it("FMT-DRAFT-02 정상: 승인된 편집 형식값은 초안 payload 저장 단계까지 통과한다", async () => {
    H.rows = [{ id: "draft-format" }];
    const { POST } = await import("@/app/api/studio/drafts/route");
    const response = await POST(new Request("http://localhost/api/studio/drafts", {
      method: "POST",
      body: JSON.stringify({
        tenant_id: "tenant-1",
        idea: "영상 형식 저장",
        editFormat: { kind: "video", aspectRatio: "9:16", subtitleSize: "보통", playbackSpeed: 1, voice: "차분한 남성" },
      }),
    }));

    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ ok: true, id: "draft-format" });
  });

  it("FMT-DRAFT-04 정상: 글 편집 형식은 카드뉴스로 바꾸지 않고 저장한다", async () => {
    H.rows = [{ id: "draft-text" }];
    const { POST } = await import("@/app/api/studio/drafts/route");
    const response = await POST(new Request("http://localhost/api/studio/drafts", {
      method: "POST",
      body: JSON.stringify({ tenant_id: "tenant-1", idea: "글 형식 저장", editFormat: { kind: "text" } }),
    }));

    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ ok: true, id: "draft-text" });
  });

  it("FMT-DRAFT-03 거절: 허용하지 않은 카드 비율은 DB 접근 전에 422로 막는다", async () => {
    vi.mocked(withTenant).mockClear();
    const { POST } = await import("@/app/api/studio/drafts/route");
    const response = await POST(new Request("http://localhost/api/studio/drafts", {
      method: "POST",
      body: JSON.stringify({
        tenant_id: "tenant-1",
        idea: "잘못된 카드 형식",
        editFormat: { kind: "card", aspectRatio: "16:9", subtitleSize: "보통", background: "작업실 책상" },
      }),
    }));
    const body = await response.json();

    expect(response.status).toBe(422);
    expect(body.code).toBe("INVALID_EDIT_FORMAT");
    expect(withTenant).not.toHaveBeenCalled();
  });

  it("PUB-DRAFT-01 정상: 플랫폼별 발행 필드와 선택 계정을 저장하고 다시 반환한다", async () => {
    H.rows = [{ id: "draft-publish" }];
    const publishFields = {
      titles: { shorts: "제목" },
      captions: { instagram: "캡션" },
      hashtags: { instagram: "#태그" },
      topicTags: { threads: "주제" },
      firstComments: { instagram: "첫 댓글" },
      selectedAccounts: { instagram: "account-1" },
      editKind: "text",
      editLines: ["첫 문단", "둘째 문단"],
      cardTextPositions: [{ x: 10, y: 20 }],
      reviewQueueId: "review-1",
    };
    const { POST } = await import("@/app/api/studio/drafts/route");
    const response = await POST(new Request("http://localhost/api/studio/drafts", {
      method: "POST",
      body: JSON.stringify({ tenant_id: "tenant-1", idea: "발행 설정", ...publishFields }),
    }));

    expect(response.status).toBe(200);
    expect(H.jsonValues[0]).toEqual(expect.objectContaining(publishFields));

    H.rows = [{
      id: "draft-publish",
      idea: "발행 설정",
      payload: H.jsonValues[0],
      status: "draft",
      updated_at: "2026-09-02T00:00:00Z",
    }];
    const { GET } = await import("@/app/api/studio/drafts/route");
    const body = await (await GET(new Request("http://localhost/api/studio/drafts"))).json();
    expect(body.drafts[0]).toEqual(expect.objectContaining(publishFields));
  });

  it("PUB-DRAFT-02 거절: 선택 계정값이 객체가 아니면 DB 접근 전에 422로 막는다", async () => {
    vi.mocked(withTenant).mockClear();
    const { POST } = await import("@/app/api/studio/drafts/route");
    const response = await POST(new Request("http://localhost/api/studio/drafts", {
      method: "POST",
      body: JSON.stringify({ tenant_id: "tenant-1", selectedAccounts: ["account-1"] }),
    }));

    expect(response.status).toBe(422);
    expect((await response.json()).code).toBe("INVALID_PUBLISH_DRAFT_STATE");
    expect(withTenant).not.toHaveBeenCalled();
  });
});
