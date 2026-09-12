import { beforeEach, describe, expect, it, vi } from "vitest";

const H = vi.hoisted(() => ({
  tenantId: "tenant-1" as string | null,
  result: { kind: "not_found" as const },
}));

vi.mock("@/lib/tenant-auth", () => ({
  effectiveTenantId: vi.fn(async () => H.tenantId),
}));

vi.mock("@/lib/db", () => ({
  withTenant: vi.fn(async () => H.result),
}));

import { DELETE } from "@/app/api/schedule/[id]/route";
import { POST } from "@/app/api/schedule/[id]/cancel/route";

const VALID_ID = "11111111-1111-4111-8111-111111111111";

function request(method: string, path: string): Request {
  return new Request(`http://localhost${path}`, { method });
}

beforeEach(() => {
  H.tenantId = "tenant-1";
  H.result = { kind: "not_found" };
});

describe("예약 발행 중지 라우트", () => {
  it("DELETE /api/schedule/[id]는 UUID가 아닌 id를 DB 오류가 아닌 400으로 거절한다", async () => {
    const response = await DELETE(
      request("DELETE", "/api/schedule/not-a-uuid?tenant_id=tenant-1"),
      { params: Promise.resolve({ id: "not-a-uuid" }) },
    );

    expect(response.status).toBe(400);
    expect(await response.json()).toEqual({ error: "id 형식 오류" });
  });

  it("DELETE /api/schedule/[id]는 존재하지 않는 UUID를 404로 닫는다", async () => {
    const response = await DELETE(
      request("DELETE", `/api/schedule/${VALID_ID}?tenant_id=tenant-1`),
      { params: Promise.resolve({ id: VALID_ID }) },
    );

    expect(response.status).toBe(404);
    expect(await response.json()).toEqual({ error: "예약을 찾을 수 없습니다" });
  });

  it("POST /api/schedule/[id]/cancel 별칭도 같은 정본 결과를 돌려준다", async () => {
    const response = await POST(
      request("POST", `/api/schedule/${VALID_ID}/cancel?tenant_id=tenant-1`),
      { params: Promise.resolve({ id: VALID_ID }) },
    );

    expect(response.status).toBe(404);
    expect(await response.json()).toEqual({ error: "예약을 찾을 수 없습니다" });
  });

  it("테넌트가 없으면 id 조회 전에 400으로 거절한다", async () => {
    H.tenantId = null;
    const response = await DELETE(
      request("DELETE", `/api/schedule/${VALID_ID}`),
      { params: Promise.resolve({ id: VALID_ID }) },
    );

    expect(response.status).toBe(400);
    expect(await response.json()).toEqual({ error: "tenant_id required" });
  });
});
