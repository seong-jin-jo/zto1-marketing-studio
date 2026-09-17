import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { installFetch } from "../publish/helpers/mock-fetch";
import { withTenant } from "@/lib/db";

// /api/publish — publish_failed 알림 경계. 성공/설정오류(채널 미연결)에는 알림이 안 뜨고, 실제
// 플랫폼 API 실발행 실패에서만 reportFailure가 호출되며, 응답 status/body는 알림 유무와 무관하게
// 기존과 동일해야 한다(fire-and-forget이 원 응답을 절대 바꾸지 않는다는 계약).
// 2026-07-14 재설계: platform(요청 바디 원문)과 result.error(플랫폼 API 응답 본문 포함 가능한 임의
// 외부 텍스트)를 그대로 넘기지 않고 normalizePlatform/classifyPublishFailure로 고정 코드만 넘긴다 —
// reportFailure는 목이라 route.ts가 실제로 넘긴 값을 그대로 관찰해 원문 미유출을 검증할 수 있다.

const H = vi.hoisted(() => ({
  tenantId: "tenant-1" as string | null,
  cred: { token: "tok", userId: "u-1" } as { token: string; userId?: string; meta?: Record<string, unknown> } | null,
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
  withTenant: vi.fn(async (_tid: string, cb: (sql: unknown) => unknown) => {
    // 모든 실발행이 먼저 중복 방지 예약을 잡는다. 예약이 성사돼야 외부 게시로 넘어간다.
    const sql = (strings: TemplateStringsArray) => {
      const query = strings.join(" ");
      if (query.includes("INSERT INTO published_posts") && query.includes("'in_progress'")) {
        return Promise.resolve([{ id: "55555555-5555-4555-8555-555555555555" }]);
      }
      return Promise.resolve([]);
    };
    sql.json = (value: unknown) => value;
    return cb(sql);
  }),
}));

vi.mock("@/lib/publish", async (importActual) => {
  const actual = await importActual<typeof import("@/lib/publish")>();
  return { ...actual, getChannelCred: vi.fn(async () => H.cred) };
});

vi.mock("@/lib/usage-events", () => ({
  publicationUsageOutbox: (platform: string) => ({ usageEvent: { status: "pending", platform } }),
  recordPublicationEvent: vi.fn(async () => ({ recorded: true, alreadyRecorded: false })),
}));

async function callPublish(body: Record<string, unknown>) {
  const { POST } = await import("@/app/api/publish/route");
  const res = await POST(
    new Request("http://localhost/api/publish", {
      method: "POST",
      // 초안 없는 실발행은 멱등 키가 필요하다(중복 외부 게시 차단).
      headers: { "Content-Type": "application/json", "Idempotency-Key": "alert-boundary-intent" },
      body: JSON.stringify(body),
    }),
  );
  return { status: res.status, body: await res.json() };
}

beforeEach(() => {
  H.tenantId = "tenant-1";
  H.cred = { token: "tok", userId: "u-1" };
  H.reportCalls = [];
  vi.mocked(withTenant).mockClear();
});

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("/api/publish — publish_failed 알림 경계", () => {
  it("발행 성공 → reportFailure 호출 안 함", async () => {
    installFetch([
      { match: "me?fields=id", json: { id: "live-id" } },
      { match: "fields=status", json: { status: "FINISHED" } },
      { match: "/threads_publish", json: { id: "media-1" } },
      { match: "/threads", json: { id: "container-1" } },
      { match: "fields=permalink", json: { permalink: "https://www.threads.net/@u/post/1" } },
    ]);
    const { status, body } = await callPublish({ platform: "threads", text: "hi" });
    expect(status).toBe(200);
    expect(body.ok).toBe(true);
    expect(H.reportCalls).toHaveLength(0);
  });

  it("채널 미연결(설정 문제, 400) → reportFailure 호출 안 함(알림 스팸 방지, 실제 인프라 장애 아님)", async () => {
    H.cred = null;
    const { status, body } = await callPublish({ platform: "threads", text: "hi" });
    expect(status).toBe(400);
    expect(body.error).toMatch(/미연결/);
    expect(H.reportCalls).toHaveLength(0);
  });

  it("플랫폼 API 실발행 실패 → reportFailure(warning) 고정코드만 호출, 응답 status/body는 그대로(200 + ok:false), 원문(응답 본문 텍스트)은 알림에 없다", async () => {
    installFetch([
      { match: "me?fields=id", json: { id: "live-id" } },
      { match: "/threads", status: 500, json: { error: "boom" }, text: "container 500 boom - sk-ant-should-not-leak" },
    ]);
    const { status, body } = await callPublish({ platform: "threads", text: "hi", draft_id: "d-1" });
    // 응답 계약 불변 확인: publish.ts는 실패해도 200 + { ok:false, error } 를 반환(라우트가 status를 바꾸지 않음)
    expect(status).toBe(200);
    expect(body.ok).toBe(false);
    expect(typeof body.error).toBe("string");
    expect(H.reportCalls).toHaveLength(1);
    const call = H.reportCalls[0] as { event: string; severity: string; context: Record<string, unknown> };
    expect(call.event).toBe("publish_failed");
    expect(call.severity).toBe("warning");
    expect(call.context).toEqual({ platform: "threads", reason: "http_error", httpStatus: 500 });
    expect(JSON.stringify(call.context)).not.toMatch(/sk-ant|container 500 boom/);
  });

  it("미지원 플랫폼(임의 문자열, 공격자 통제 가능) → platform은 unknown_platform으로 정규화되어 보고, 응답은 기존과 동일", async () => {
    const { status, body } = await callPublish({ platform: "carrier-pigeon<script>", text: "hi" });
    expect(status).toBe(200);
    expect(body.ok).toBe(false);
    expect(body.error).toMatch(/미지원/);
    expect(H.reportCalls).toHaveLength(1);
    const call = H.reportCalls[0] as { context: Record<string, unknown> };
    expect(call.context).toEqual({ platform: "unknown_platform", reason: "unsupported_platform" });
  });
});
