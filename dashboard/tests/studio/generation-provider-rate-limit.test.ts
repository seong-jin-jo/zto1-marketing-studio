import { EventEmitter } from "node:events";
import { afterEach, describe, expect, it, vi } from "vitest";

interface FakeStdin extends EventEmitter {
  end: (data: string) => void;
}

interface FakeChild extends EventEmitter {
  stdout: EventEmitter;
  stdin: FakeStdin;
}

const H = vi.hoisted(() => ({
  child: null as FakeChild | null,
}));

vi.mock("child_process", () => ({
  spawn: vi.fn(() => {
    const child = new EventEmitter() as FakeChild;
    child.stdout = new EventEmitter();
    const stdin = new EventEmitter() as FakeStdin;
    stdin.end = () => {};
    child.stdin = stdin;
    H.child = child;
    return child;
  }),
}));

function sqlResult(strings: TemplateStringsArray): unknown[] {
  const query = strings.join("?");
  if (query.includes("INSERT INTO usage_quotas")) return [{ generations_used: 1 }];
  if (query.includes("INSERT INTO usage_events")) return [{ id: "event-1" }];
  return [];
}

vi.mock("@/lib/db", () => ({
  db: vi.fn(() => Object.assign((strings: TemplateStringsArray) => Promise.resolve(sqlResult(strings)), {
    json: (value: unknown) => value,
  })),
  withTenant: vi.fn(async (_tenantId: string, callback: (sql: unknown) => unknown) => callback(
    Object.assign((strings: TemplateStringsArray) => Promise.resolve(sqlResult(strings)), {
      json: (value: unknown) => value,
    }),
  )),
}));

afterEach(() => {
  vi.resetModules();
  H.child = null;
  vi.unstubAllEnvs();
});

describe("공유 Claude CLI 제공자 한도 오류", () => {
  it("CLI가 주간 한도 오류 envelope를 반환하면 provider_rate_limited로 분류한다", async () => {
    vi.stubEnv("OSMU_SECRET_KEY", "test-secret");
    const { generateTextWithUsage } = await import("@/lib/anthropic");
    const pending = generateTextWithUsage({
      prompt: "짧은 테스트 입력",
      tenantId: "tenant-1",
      model: "anthropic/claude-sonnet-4-6",
      timeoutMs: 10_000,
      maxOutputTokens: 256,
    });

    await new Promise((resolve) => setImmediate(resolve));
    expect(H.child).not.toBeNull();
    H.child!.stdout.emit("data", Buffer.from(JSON.stringify({
      is_error: true,
      result: "You've hit your weekly limit · resets later",
    })));
    // 실제 Claude CLI도 한도 envelope를 내보내면서 exit code 1로 끝날 수 있다.
    H.child!.emit("close", 1);

    await expect(pending).rejects.toMatchObject({
      name: "SharedAiProviderRateLimitError",
    });
  });
});
