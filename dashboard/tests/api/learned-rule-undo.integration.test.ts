import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

// 2026-09-12 감사 MAJOR 두 건의 재현 절차를 테스트로 옮긴다.
//  - 되돌리기 없음: DELETE 가 활성 규칙만 끄고 decisions 를 남겨 반대 판단이 계속 409 가 됐다.
//  - 후보 식별자 경합: 무작위 candidateId 때문에 두 탭에서 같은 후보를 만들면 중복 방지가 우회됐다.

const H = vi.hoisted(() => ({
  tenantId: "cd1d0a40-540d-4524-9b49-bf2445d82182" as string | null,
}));

vi.mock("@/lib/tenant-auth", () => ({
  effectiveTenantId: vi.fn(async () => H.tenantId),
}));

const CANDIDATE = {
  text: "문제 상황을 먼저 보여주는 글이 평균보다 잘 갑니다.",
  sourcePostIds: ["post-1", "post-2", "post-3"],
  sourceLabel: "조회 6편을 비교해 상위 3편에서 뽑음",
  sampleCount: 6,
  observedFrom: "2026-08-01T00:00:00.000Z",
  observedTo: "2026-08-27T23:59:59.000Z",
};

describe("BE-L5-UNDO 학습 판단 되돌리기와 후보 지문", () => {
  let dataDir: string;

  beforeEach(() => {
    dataDir = fs.mkdtempSync(path.join(os.tmpdir(), "osmu-learned-rule-undo-"));
    process.env.DATA_DIR = dataDir;
    H.tenantId = "cd1d0a40-540d-4524-9b49-bf2445d82182";
    vi.resetModules();
  });

  afterEach(() => {
    fs.rmSync(dataDir, { recursive: true, force: true });
    delete process.env.DATA_DIR;
  });

  function decisionRequest(decision: "accepted" | "rejected", candidateId: string, overrides: Record<string, unknown> = {}): Request {
    return new Request("http://localhost/api/performance/learned-rules", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ tenant_id: H.tenantId, candidateId, decision, ...CANDIDATE, ...overrides }),
    });
  }

  function deleteRequest(query: string): Request {
    return new Request(`http://localhost/api/performance/learned-rules?tenant_id=${H.tenantId}&${query}`, { method: "DELETE" });
  }

  function storedFile(): { rules: Array<Record<string, unknown>>; decisions: Array<Record<string, unknown>> } {
    return JSON.parse(fs.readFileSync(path.join(dataDir, "tenants", H.tenantId!, "performance-learned-rules.json"), "utf8"));
  }

  it("BE-L5-UNDO-01 정상 경로: 되돌리면 판단 이력과 활성 규칙이 같이 사라진다", async () => {
    const { DELETE, GET, POST } = await import("@/app/api/performance/learned-rules/route");
    const created = await (await POST(decisionRequest("accepted", "candidate-undo-1"))).json();

    const response = await DELETE(deleteRequest(`decisionId=${created.decision.id}`));
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body.ok).toBe(true);
    expect(body.deactivatedRuleId).toBe(created.rule.id);

    const history = await (await GET(new Request(`http://localhost/api/performance/learned-rules?tenant_id=${H.tenantId}`))).json();
    expect(history.decisions).toEqual([]);
    expect(history.rules).toEqual([]);
    // 규칙은 지우지 않고 비활성으로 남긴다. 생성 컨텍스트가 읽는 것은 active 뿐이다.
    expect(storedFile().rules[0]).toEqual(expect.objectContaining({ id: created.rule.id, active: false }));
  });

  it("BE-L5-UNDO-02 경계: 되돌린 뒤에는 같은 후보의 반대 판단이 409 없이 다시 저장된다", async () => {
    const { DELETE, POST } = await import("@/app/api/performance/learned-rules/route");
    const created = await (await POST(decisionRequest("accepted", "candidate-undo-2"))).json();
    await DELETE(deleteRequest(`decisionId=${created.decision.id}`));

    const retry = await POST(decisionRequest("rejected", "candidate-undo-2-retry"));
    const body = await retry.json();

    expect(retry.status).toBe(201);
    expect(body.decision).toEqual(expect.objectContaining({ decision: "rejected" }));
    expect(storedFile().decisions).toHaveLength(1);
  });

  it("BE-L5-UNDO-03 거절 경로: 없는 판단을 되돌리면 404 이고 두 번 되돌려도 이력이 망가지지 않는다", async () => {
    const { DELETE, POST } = await import("@/app/api/performance/learned-rules/route");
    const created = await (await POST(decisionRequest("accepted", "candidate-undo-3"))).json();
    await DELETE(deleteRequest(`decisionId=${created.decision.id}`));

    const again = await DELETE(deleteRequest(`decisionId=${created.decision.id}`));
    expect(again.status).toBe(404);
    expect(await again.json()).toEqual(expect.objectContaining({ code: "NOT_FOUND" }));

    const missingParam = await DELETE(new Request(`http://localhost/api/performance/learned-rules?tenant_id=${H.tenantId}`, { method: "DELETE" }));
    expect(missingParam.status).toBe(400);
  });

  it("BE-L5-UNDO-04 규칙 id 로 되돌려도 그 판단 이력을 같이 지운다", async () => {
    const { DELETE, POST } = await import("@/app/api/performance/learned-rules/route");
    const created = await (await POST(decisionRequest("accepted", "candidate-undo-4"))).json();

    const response = await DELETE(deleteRequest(`id=${created.rule.id}`));
    expect(response.status).toBe(200);
    expect(storedFile().decisions).toEqual([]);
    expect(storedFile().rules[0]).toEqual(expect.objectContaining({ active: false }));
  });

  it("BE-L5-KEY-01 경합: 두 탭이 서로 다른 무작위 candidateId 로 같은 후보를 보내도 한 건만 남는다", async () => {
    const { POST } = await import("@/app/api/performance/learned-rules/route");
    const first = await POST(decisionRequest("accepted", "candidate_1757000000000_aaaaaa"));
    const second = await POST(decisionRequest("accepted", "candidate_1757000000999_bbbbbb"));

    expect(first.status).toBe(201);
    expect(second.status).toBe(200);
    expect(await second.json()).toEqual(expect.objectContaining({ reused: true }));
    expect(storedFile().decisions).toHaveLength(1);
    expect(storedFile().rules).toHaveLength(1);
  });

  it("BE-L5-KEY-02 경합: 두 탭이 같은 후보를 반대로 판단하면 뒤의 것이 409 로 막힌다", async () => {
    const { POST } = await import("@/app/api/performance/learned-rules/route");
    await POST(decisionRequest("accepted", "candidate_1757000000000_cccccc"));
    const opposite = await POST(decisionRequest("rejected", "candidate_1757000000999_dddddd"));

    expect(opposite.status).toBe(409);
    expect(await opposite.json()).toEqual(expect.objectContaining({ code: "DECISION_ALREADY_RECORDED" }));
    expect(storedFile().decisions).toHaveLength(1);
  });

  it("BE-L5-KEY-04 옛 기록: 지문 없는 이력도 다시 계산한 지문으로 막는다", async () => {
    // Codex 교차 리뷰 MAJOR 1. candidateKey 가 없던 시절 기록이 남은 작업 공간에서
    // 무작위 candidateId 우회가 되살아나면 안 된다.
    const file = path.join(dataDir, "tenants", H.tenantId!, "performance-learned-rules.json");
    fs.mkdirSync(path.dirname(file), { recursive: true });
    fs.writeFileSync(file, JSON.stringify({
      rules: [{ id: "rule_legacy", text: CANDIDATE.text, sourcePostIds: CANDIDATE.sourcePostIds, sourceLabel: CANDIDATE.sourceLabel, createdAt: "2026-09-01T00:00:00.000Z", active: true }],
      decisions: [{
        id: "decision_legacy",
        candidateId: "candidate_legacy_random",
        decision: "accepted",
        ...CANDIDATE,
        scope: "workspace_generation",
        decidedAt: "2026-09-01T00:00:00.000Z",
        ruleId: "rule_legacy",
      }],
    }, null, 2));

    const { POST } = await import("@/app/api/performance/learned-rules/route");
    const opposite = await POST(decisionRequest("rejected", "candidate_other_tab_random"));
    expect(opposite.status).toBe(409);
    expect(storedFile().decisions).toHaveLength(1);
  });

  it("BE-L5-KEY-05 정규화: 공백과 다른 시각 표기를 써도 같은 후보로 본다", async () => {
    // Codex 교차 리뷰 MAJOR 2.
    const { POST } = await import("@/app/api/performance/learned-rules/route");
    await POST(decisionRequest("accepted", "candidate_norm_a"));
    const same = await POST(decisionRequest("accepted", "candidate_norm_b", {
      text: `  ${CANDIDATE.text.replace(" ", "  ")}  `,
      sourcePostIds: [" post-3 ", "post-1", " post-2"],
      observedFrom: "2026-08-01T00:00:00Z",
      observedTo: "2026-08-27T23:59:59Z",
    }));

    expect(same.status).toBe(200);
    expect(await same.json()).toEqual(expect.objectContaining({ reused: true }));
    expect(storedFile().decisions).toHaveLength(1);
  });

  it("BE-L5-UNDO-05 거절 조건: id 와 decisionId 를 함께 보내면 400 으로 막는다", async () => {
    // Codex 교차 리뷰 MINOR 5.
    const { DELETE, POST } = await import("@/app/api/performance/learned-rules/route");
    const created = await (await POST(decisionRequest("accepted", "candidate-undo-5"))).json();
    const response = await DELETE(deleteRequest(`id=${created.rule.id}&decisionId=${created.decision.id}`));

    expect(response.status).toBe(400);
    expect(storedFile().decisions).toHaveLength(1);
  });

  it("BE-L5-KEY-03 다른 후보는 지문이 달라 각각 남는다", async () => {
    const { POST } = await import("@/app/api/performance/learned-rules/route");
    await POST(decisionRequest("accepted", "candidate_a"));
    const other = await POST(decisionRequest("accepted", "candidate_b", { text: "짧은 글이 긴 글보다 잘 갑니다." }));

    expect(other.status).toBe(201);
    expect(storedFile().decisions).toHaveLength(2);
  });
});
