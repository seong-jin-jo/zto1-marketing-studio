import { describe, it, expect, beforeEach, vi } from "vitest";

// /api/schedule/publish-due(크론 배치 발행 루프) — publish_failed 알림 경계.
// /api/publish/route.ts(수동 단건 발행)와 동일한 규칙: "채널 미연결"(설정 문제)은 알림 대상이
// 아니고, 실제 플랫폼 API 실발행 실패·미지원 플랫폼만 reportFailure(warning)로 보고한다.
// 두 라우트는 서로 다른 진입점(수동 vs 크론)이라 같은 실패가 두 번 보고되는 경로는 없다
// (schedule은 FOR UPDATE SKIP LOCKED로 1회만 claim되므로 중복 처리 자체가 불가능).
// 2026-07-14 재설계: platform/error 원문을 그대로 넘기지 않고 normalizePlatform/classifyPublishFailure
// 고정 코드만 넘기는지 검증한다.

const H = vi.hoisted(() => ({
  tenantId: "tenant-1" as string | null,
  rows: [] as Array<{
    id: string;
    draft_id: string | null;
    platforms: string[] | null;
    payload: Record<string, unknown> | null;
    draft_payload: Record<string, unknown> | null;
  }>,
  cred: { token: "tok", userId: "u-1" } as { token: string; userId?: string } | null,
  reportCalls: [] as unknown[],
}));

vi.mock("@/lib/tenant-auth", () => ({
  effectiveTenantId: vi.fn(async () => H.tenantId),
}));

vi.mock("@/lib/observability", async (importActual) => {
  const actual = await importActual<typeof import("@/lib/observability")>();
  return {
    ...actual,
    reportFailure: vi.fn(async (input: unknown) => {
      H.reportCalls.push(input);
    }),
  };
});

vi.mock("@/lib/db", () => ({
  db: vi.fn(() => () => Promise.resolve([])),
  withTenant: vi.fn(async (_tenantId: string, cb: (sql: unknown) => unknown) => {
    const sql = Object.assign(
      (strings: TemplateStringsArray) => {
        const text = strings.join("?");
        if (/WITH\s+due\s+AS/i.test(text)) return Promise.resolve(H.rows);
        if (/UPDATE\s+schedules/i.test(text) && /RETURNING\s+id/i.test(text)) {
          return Promise.resolve([{ id: "lease-owned" }]);
        }
        return Promise.resolve([]);
      },
      { json: (value: unknown) => value },
    );
    return cb(sql);
  }),
}));

vi.mock("@/lib/publish", () => ({
  getChannelCred: vi.fn(async () => H.cred),
  publishThreads: vi.fn(async () => ({ ok: false, error: "container 실패(500): boom - sk-ant-should-not-leak" })),
  publishX: vi.fn(async () => ({ ok: true, externalId: "tw-1" })),
  publishInstagram: vi.fn(async () => ({ ok: true, externalId: "ig-1" })),
  publishFacebook: vi.fn(async () => ({ ok: true, externalId: "fb-1" })),
  publishBluesky: vi.fn(async () => ({ ok: true, externalId: "bs-1" })),
  publishTelegram: vi.fn(async () => ({ ok: true, externalId: "tg-1" })),
  publishDiscord: vi.fn(async () => ({ ok: true, externalId: "dc-1" })),
  publishSlack: vi.fn(async () => ({ ok: true, externalId: "sl-1" })),
}));

async function publishDue(body: Record<string, unknown> = {}) {
  const { POST } = await import("@/app/api/schedule/publish-due/route");
  const res = await POST(
    new Request("http://localhost/api/schedule/publish-due", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    }),
  );
  return { status: res.status, body: await res.json() };
}

beforeEach(() => {
  vi.resetModules();
  delete process.env.DASHBOARD_AUTH_TOKEN;
  H.tenantId = "tenant-1";
  H.cred = { token: "tok", userId: "u-1" };
  H.reportCalls = [];
});

describe("/api/schedule/publish-due — publish_failed 알림 경계", () => {
  it("전 플랫폼 발행 성공 → reportFailure 호출 안 함", async () => {
    H.rows = [
      { id: "s-1", draft_id: "d-1", platforms: ["x"], payload: { text: "body" }, draft_payload: null },
    ];
    const { body } = await publishDue({ tenant_id: "tenant-1" });
    expect(body.schedules[0].status).toBe("published");
    expect(H.reportCalls).toHaveLength(0);
  });

  it("채널 미연결(설정 문제) → reportFailure 호출 안 함(알림 스팸 방지)", async () => {
    H.cred = null;
    H.rows = [
      { id: "s-2", draft_id: "d-2", platforms: ["threads"], payload: { text: "body" }, draft_payload: null },
    ];
    const { body } = await publishDue({ tenant_id: "tenant-1" });
    expect(body.schedules[0].results[0].error).toMatch(/채널 미연결/);
    expect(H.reportCalls).toHaveLength(0);
  });

  it("플랫폼 API 실발행 실패 → reportFailure(warning) 1회, 실패한 플랫폼만 보고", async () => {
    H.rows = [
      {
        id: "s-3",
        draft_id: "d-3",
        platforms: ["threads", "x"],
        payload: { text: "body" },
        draft_payload: null,
      },
    ];
    const { body } = await publishDue({ tenant_id: "tenant-1" });
    expect(body.schedules[0].status).toBe("partial");
    expect(H.reportCalls).toHaveLength(1);
    const call = H.reportCalls[0] as { event: string; severity: string; context: Record<string, unknown> };
    expect(call.event).toBe("publish_failed");
    expect(call.severity).toBe("warning");
    expect(call.context).toEqual({ platform: "threads", reason: "http_error", httpStatus: 500 });
    expect(JSON.stringify(call.context)).not.toMatch(/sk-ant|boom/);
  });

  it("미지원 플랫폼(임의 문자열) → platform은 unknown_platform으로 정규화되어 보고(수동 발행 /api/publish 경계와 동일 규칙)", async () => {
    H.rows = [
      { id: "s-4", draft_id: "d-4", platforms: ["myspace"], payload: { text: "body" }, draft_payload: null },
    ];
    const { body } = await publishDue({ tenant_id: "tenant-1" });
    expect(body.schedules[0].results[0].error).toMatch(/미지원/);
    expect(H.reportCalls).toHaveLength(1);
    expect((H.reportCalls[0] as { context: Record<string, unknown> }).context).toEqual({
      platform: "unknown_platform",
      reason: "unsupported_platform",
    });
  });

  it("여러 테넌트/스케줄에 걸쳐 실패마다 독립적으로 정확히 1회씩만 보고(중복 없음)", async () => {
    H.rows = [
      { id: "s-5", draft_id: "d-5", platforms: ["threads"], payload: { text: "a" }, draft_payload: null },
      { id: "s-6", draft_id: "d-6", platforms: ["threads"], payload: { text: "b" }, draft_payload: null },
    ];
    const { body } = await publishDue({ tenant_id: "tenant-1" });
    expect(body.processed).toBe(2);
    expect(H.reportCalls).toHaveLength(2);
  });
});
