import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { EventEmitter } from "events";

// lib/anthropic.ts — 공유 claude -p 실행 실패(shared AI generation execution failure)에서만
// reportFailure가 호출되는지 검증. quota 초과(SharedGenerationQuotaError)는 정상 사용량 게이트일
// 뿐이라 알림 대상이 아니어야 한다(스팸 방지
// 회귀). 2026-07-14 재설계: e.message(임의 텍스트, prompt는 안 실리지만 그래도 원문)를 그대로
// context에 넘기지 않고 classifySharedAiFailure()로 고정 reason 코드(exit_nonzero 등)로만 변환해
// 넘기는지 검증한다 — reportFailure는 목이라 anthropic.ts가 넘긴 값을 그대로 관찰할 수 있다.

interface FakeStdin extends EventEmitter {
  end: (d: string) => void;
}
interface FakeChild extends EventEmitter {
  stdout: EventEmitter;
  stdin: FakeStdin;
  kill: ReturnType<typeof vi.fn>;
}

const H = vi.hoisted(() => ({
  reportCalls: [] as unknown[],
  lastChild: null as FakeChild | null,
  dbRows: { anthropicKey: null as string | null, sharedCliApprovedAt: null as string | null, quota: { generations_used: 0 } as { generations_used: number } | null },
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

vi.mock("child_process", () => ({
  spawn: vi.fn(() => {
    const child = new EventEmitter() as FakeChild;
    child.stdout = new EventEmitter();
    child.kill = vi.fn();
    const stdin = new EventEmitter() as FakeStdin;
    stdin.end = () => {};
    child.stdin = stdin;
    H.lastChild = child;
    return child;
  }),
}));

vi.mock("@/lib/db", () => ({
  db: vi.fn(() => (strings: TemplateStringsArray) => {
    const text = strings.join("?");
    if (text.includes("shared_cli_approved_at")) {
      return Promise.resolve([{ shared_cli_approved_at: H.dbRows.sharedCliApprovedAt }]);
    }
    return Promise.resolve([]);
  }),
  withTenant: vi.fn(async (_tid: string, cb: (sql: unknown) => unknown) => {
    const sql = (strings: TemplateStringsArray) => {
      const text = strings.join("?");
      if (text.includes("anthropic")) return Promise.resolve([{ token: H.dbRows.anthropicKey }]);
      if (text.includes("usage_quotas")) return Promise.resolve([{ generations_used: 1 }]);
      if (text.includes("usage_events")) return Promise.resolve([]);
      return Promise.resolve([]);
    };
    return cb(sql);
  }),
}));

async function importGenerateText() {
  const mod = await import("@/lib/anthropic");
  return mod.generateText;
}

beforeEach(() => {
  vi.resetModules();
  H.reportCalls = [];
  H.lastChild = null;
  H.dbRows = { anthropicKey: null, sharedCliApprovedAt: null, quota: { generations_used: 0 } };
});

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("anthropic.ts — shared_ai_generation_execution_failed 알림 경계", () => {
  it("공유 CLI 실행 실패(non-zero exit) → reportFailure(error) 호출, context.reason은 고정 코드 'exit_nonzero'뿐(원문 미포함)", async () => {
    const generateText = await importGenerateText();
    const p = generateText("this is the user's secret prompt content", null);
    // spawn 직후 이벤트 루프 한 틱 대기 후 child close(code=1) 시뮬레이션
    await new Promise((r) => setImmediate(r));
    H.lastChild!.emit("close", 1);
    await expect(p).rejects.toThrow(/exited with code 1/);
    expect(H.reportCalls).toHaveLength(1);
    const call = H.reportCalls[0] as { event: string; severity: string; context: Record<string, unknown> };
    expect(call.event).toBe("shared_ai_generation_execution_failed");
    expect(call.severity).toBe("error");
    expect(call.context).toEqual({ reason: "exit_nonzero" });
    expect(JSON.stringify(call.context)).not.toMatch(/secret prompt content|exited with code/);
  });

  it("spawn 자체 실패 → reportFailure 호출, context.reason은 고정 코드 'spawn_failed'뿐", async () => {
    const generateText = await importGenerateText();
    const p = generateText("prompt", null);
    await new Promise((r) => setImmediate(r));
    H.lastChild!.emit("error", new Error("ENOENT"));
    await expect(p).rejects.toThrow(/spawn 실패/);
    expect(H.reportCalls).toHaveLength(1);
    const call = H.reportCalls[0] as { event: string; context: Record<string, unknown> };
    expect(call.event).toBe("shared_ai_generation_execution_failed");
    expect(call.context).toEqual({ reason: "spawn_failed" });
  });

  // 2026-09-08: 승인은 문이 아니라 한도가 됐다. 승인 전 회원은 거절되지 않고 체험 한도로
  // 그대로 생성까지 간다. 따라서 여기서 알림이 뜰 일도 없다.
  it("승인 전 회원의 정상 생성은 알림 대상이 아니다", async () => {
    H.dbRows.sharedCliApprovedAt = null;
    const generateText = await importGenerateText();
    const p = generateText("prompt", "tenant-1");
    await new Promise((r) => setImmediate(r));
    H.lastChild!.stdout.emit("data", Buffer.from("ok"));
    H.lastChild!.emit("close", 0);
    await expect(p).resolves.toContain("ok");
    expect(H.reportCalls).toHaveLength(0);
  });

  it("공유 생성 quota 초과(SharedGenerationQuotaError) → reportFailure 호출 안 함(정상 게이트)", async () => {
    H.dbRows.sharedCliApprovedAt = new Date().toISOString();
    vi.doMock("@/lib/db", () => ({
      db: vi.fn(() => (strings: TemplateStringsArray) => {
        const text = strings.join("?");
        if (text.includes("shared_cli_approved_at")) return Promise.resolve([{ shared_cli_approved_at: H.dbRows.sharedCliApprovedAt }]);
        return Promise.resolve([]);
      }),
      withTenant: vi.fn(async (_tid: string, cb: (sql: unknown) => unknown) => {
        const sql = (strings: TemplateStringsArray) => {
          const text = strings.join("?");
          if (text.includes("anthropic")) return Promise.resolve([{ token: null }]);
          // ON CONFLICT ... WHERE ... RETURNING 이 0행 = 이미 한도 도달(reserveSharedGeneration 계약)
          if (text.includes("INSERT INTO usage_quotas")) return Promise.resolve([]);
          if (text.includes("SELECT generations_used")) return Promise.resolve([{ generations_used: 100, period: "2026-07" }]);
          return Promise.resolve([]);
        };
        return cb(sql);
      }),
    }));
    const generateText = await importGenerateText();
    await expect(generateText("prompt", "tenant-1")).rejects.toThrow(/생성 한도를 다 쓰셨습니다/);
    expect(H.reportCalls).toHaveLength(0);
  });
});
