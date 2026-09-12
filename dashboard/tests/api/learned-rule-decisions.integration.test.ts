import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const H = vi.hoisted(() => ({
  tenantId: "cd1d0a40-540d-4524-9b49-bf2445d82182" as string | null,
}));

vi.mock("@/lib/tenant-auth", () => ({
  effectiveTenantId: vi.fn(async () => H.tenantId),
}));

describe("BE-L5-HISTORY 학습 후보 판단 이력", () => {
  let dataDir: string;

  beforeEach(() => {
    dataDir = fs.mkdtempSync(path.join(os.tmpdir(), "osmu-learned-rule-decisions-"));
    process.env.DATA_DIR = dataDir;
    H.tenantId = "cd1d0a40-540d-4524-9b49-bf2445d82182";
    vi.resetModules();
  });

  afterEach(() => {
    fs.rmSync(dataDir, { recursive: true, force: true });
    delete process.env.DATA_DIR;
  });

  function decisionRequest(decision: "accepted" | "rejected", candidateId: string): Request {
    return new Request("http://localhost/api/performance/learned-rules", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        tenant_id: H.tenantId,
        candidateId,
        decision,
        text: "문제 상황을 먼저 보여주는 글이 평균보다 잘 갑니다.",
        sourcePostIds: ["post-1", "post-2", "post-3"],
        sourceLabel: "조회 6편을 비교해 상위 3편에서 뽑음",
        sampleCount: 6,
        observedFrom: "2026-08-01T00:00:00.000Z",
        observedTo: "2026-08-27T23:59:59.000Z",
      }),
    });
  }

  it("BE-L5-HISTORY-01 정상 경로: 수락 판단과 출처를 남기고 활성 규칙을 만든다", async () => {
    const { GET, POST } = await import("@/app/api/performance/learned-rules/route");
    const response = await POST(decisionRequest("accepted", "candidate-accept-1"));
    const body = await response.json();

    expect(response.status).toBe(201);
    expect(body.reused).toBe(false);
    expect(body.decision).toEqual(expect.objectContaining({
      candidateId: "candidate-accept-1",
      decision: "accepted",
      sampleCount: 6,
      scope: "workspace_generation",
      ruleId: body.rule.id,
    }));

    const historyResponse = await GET(new Request(`http://localhost/api/performance/learned-rules?tenant_id=${H.tenantId}`));
    const history = await historyResponse.json();
    expect(history.rules).toHaveLength(1);
    expect(history.decisions).toEqual([expect.objectContaining({ decision: "accepted", ruleId: body.rule.id })]);
  });

  it("BE-L5-HISTORY-02 거절 경로: 거절 판단은 남기되 생성 규칙으로 만들지 않는다", async () => {
    const { GET, POST } = await import("@/app/api/performance/learned-rules/route");
    const response = await POST(decisionRequest("rejected", "candidate-reject-1"));
    const body = await response.json();

    expect(response.status).toBe(201);
    expect(body.rule).toBeNull();
    expect(body.decision).toEqual(expect.objectContaining({
      candidateId: "candidate-reject-1",
      decision: "rejected",
      ruleId: null,
    }));

    const historyResponse = await GET(new Request(`http://localhost/api/performance/learned-rules?tenant_id=${H.tenantId}`));
    const history = await historyResponse.json();
    expect(history.rules).toEqual([]);
    expect(history.decisions).toHaveLength(1);
  });

  it("BE-L5-HISTORY-03 거절 조건: 알 수 없는 판단값은 이력 파일을 만들기 전에 400으로 막는다", async () => {
    const { POST } = await import("@/app/api/performance/learned-rules/route");
    const request = new Request("http://localhost/api/performance/learned-rules", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ tenant_id: H.tenantId, candidateId: "candidate-bad", decision: "maybe", text: "모호한 판단" }),
    });
    const response = await POST(request);

    expect(response.status).toBe(400);
    expect(await response.json()).toEqual(expect.objectContaining({ code: "INVALID_DECISION" }));
    expect(fs.existsSync(path.join(dataDir, "tenants", H.tenantId!, "performance-learned-rules.json"))).toBe(false);
  });

  it("BE-L5-HISTORY-04 경합 경로: 같은 후보를 동시에 수락해도 판단과 규칙은 한 건만 남는다", async () => {
    const { POST } = await import("@/app/api/performance/learned-rules/route");
    const responses = await Promise.all([
      POST(decisionRequest("accepted", "candidate-race-1")),
      POST(decisionRequest("accepted", "candidate-race-1")),
    ]);
    const bodies = await Promise.all(responses.map((response) => response.json()));
    const file = path.join(dataDir, "tenants", H.tenantId!, "performance-learned-rules.json");
    const stored = JSON.parse(fs.readFileSync(file, "utf8"));

    expect(responses.map((response) => response.status).sort()).toEqual([200, 201]);
    expect(bodies.filter((body) => body.reused === true)).toHaveLength(1);
    expect(stored.decisions).toHaveLength(1);
    expect(stored.rules).toHaveLength(1);
  });
});
