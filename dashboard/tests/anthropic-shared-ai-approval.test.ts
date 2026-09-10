import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { EventEmitter } from "events";

// 공유 AI(claude -p) 사용 승인이 "문" 이 아니라 "한도" 임을 고정한다(lib/anthropic.ts).
//
// 2026-09-08 정책 변경. 종전에는 tenants.shared_cli_approved_at 이 비어 있으면 생성 요청을 전부
// 거절했다. 가입은 되는데 첫 생성부터 막히고, 화면은 운영자 승인을 기다리거나 개발자용 API 키를
// 직접 발급해 오라고 안내했다. 우리 고객은 도구 학습 시간이 없는 1인 사업자다. 그 사람에게 API 키
// 발급을 요구하는 것은 제품을 안 쓰겠다는 말과 같다(회장 반복 지시: 회원은 OAuth 로그인만 하면
// 바로 쓸 수 있어야 한다).
// 비용은 열려 있지 않다. 승인 전에는 더 작은 체험 한도(OSMU_TRIAL_GENERATIONS, 기본 20)가 걸리고,
// 승인은 그 한도를 정규 한도(OSMU_SHARED_GENERATIONS_INCLUDED, 기본 100)로 올릴 뿐이다.
// BYO Anthropic 키 경로와 tenantId=null(운영자 내부 호출)은 여전히 한도 대상이 아니다.

const H = vi.hoisted(() => ({
  byoKey: null as string | null,
  sharedAiApprovedAt: null as string | null,
  dbThrows: false,
  quotaInsertCalls: 0,
  onQuotaLimit: null as ((limit: number) => void) | null,
  started: [] as { prompt: string; finish: (out: string) => void }[],
}));

vi.mock("child_process", () => ({
  spawn: (_bin: string, _args: string[], _opts: unknown) => {
    const child = new EventEmitter() as EventEmitter & {
      stdout: EventEmitter; stdin: { end: (d: string) => void; on: () => void }; kill: () => void;
    };
    child.stdout = new EventEmitter();
    child.kill = () => {};
    let stdinData = "";
    child.stdin = { end: (data: string) => { stdinData = data; }, on: () => {} };
    H.started.push({
      get prompt() { return stdinData; },
      finish: (out: string) => { child.stdout.emit("data", Buffer.from(out)); child.emit("close", 0); },
    });
    return child;
  },
}));

vi.mock("@/lib/db", () => ({
  withTenant: vi.fn(async (_tenantId: string, cb: (sql: unknown) => unknown) => {
    const sql = Object.assign(
      (strings: TemplateStringsArray, ...vals: unknown[]) => {
        const text = strings.join("?");
        if (text.includes("FROM integrations")) return Promise.resolve([{ token: H.byoKey }]);
        if (text.includes("INSERT INTO usage_quotas")) {
          H.quotaInsertCalls++;
          // reserve 문에 실린 한도 값(generations_included)을 그대로 관찰한다.
          const limit = vals.find((v) => typeof v === "number");
          if (typeof limit === "number") H.onQuotaLimit?.(limit);
          return Promise.resolve([{ generations_used: 1 }]);
        }
        if (text.includes("INSERT INTO usage_events")) return Promise.resolve([]);
        return Promise.resolve([]);
      },
      { json: (v: unknown) => v },
    );
    return cb(sql);
  }),
  db: vi.fn(() => (strings: TemplateStringsArray, ..._vals: unknown[]) => {
    if (H.dbThrows) return Promise.reject(new Error("DB down"));
    const text = strings.join("?");
    if (text.includes("SELECT shared_cli_approved_at")) {
      return Promise.resolve([{ shared_cli_approved_at: H.sharedAiApprovedAt }]);
    }
    return Promise.resolve([]);
  }),
}));

const settle = () => new Promise((r) => setImmediate(r));

async function importAnthropic() {
  return import("@/lib/anthropic");
}

beforeEach(() => {
  vi.resetModules();
  H.byoKey = null;
  H.sharedAiApprovedAt = null;
  H.dbThrows = false;
  H.quotaInsertCalls = 0;
  H.onQuotaLimit = null;
  H.started = [];
  process.env.OSMU_SECRET_KEY = "enc-key";
});

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("승인 전 회원(shared_cli_approved_at=null)", () => {
  it("거절하지 않는다 — 체험 한도를 잡고 생성까지 간다", async () => {
    const { generateText } = await importAnthropic();
    const p = generateText("hello", "tenant-unapproved");
    await settle();
    expect(H.started).toHaveLength(1);
    expect(H.quotaInsertCalls).toBe(1);
    H.started[0].finish("ok");
    await expect(p).resolves.toBe("ok");
  });

  it("승인 전에는 체험 한도, 승인 뒤에는 정규 한도를 쓴다", async () => {
    process.env.OSMU_TRIAL_GENERATIONS = "7";
    process.env.OSMU_SHARED_GENERATIONS_INCLUDED = "99";
    const limits: number[] = [];
    H.onQuotaLimit = (n) => limits.push(n);

    const { generateText } = await importAnthropic();
    const a = generateText("x", "tenant-unapproved");
    await settle();
    H.started[0].finish("ok");
    await a;

    H.sharedAiApprovedAt = "2026-07-01T00:00:00Z";
    const b = generateText("x", "tenant-approved");
    await settle();
    H.started[1].finish("ok");
    await b;

    expect(limits).toEqual([7, 99]);
    delete process.env.OSMU_TRIAL_GENERATIONS;
    delete process.env.OSMU_SHARED_GENERATIONS_INCLUDED;
  });
});

describe("공유 AI 사용 승인 게이트 — 승인된 테넌트(shared_cli_approved_at 존재)", () => {
  it("승인된 테넌트는 정상적으로 quota reserve 후 CLI까지 도달", async () => {
    H.sharedAiApprovedAt = "2026-07-01T00:00:00Z";
    const { generateText } = await importAnthropic();
    const p = generateText("hello", "tenant-approved");
    await settle();
    expect(H.started).toHaveLength(1);
    expect(H.quotaInsertCalls).toBe(1);
    H.started[0].finish("ok");
    await expect(p).resolves.toBe("ok");
  });
});

describe("공유 AI 사용 승인 게이트 — 우회 경로(BYO 키 / tenantId=null)", () => {
  it("BYO Anthropic 키가 있으면 미승인이어도 즉시 허용(게이트 무관)", async () => {
    H.byoKey = "sk-byo";
    H.sharedAiApprovedAt = null;
    vi.stubGlobal("fetch", vi.fn(async () => ({ ok: true, json: async () => ({ content: [{ text: "byo-out" }] }) })));
    const { generateText } = await importAnthropic();
    await expect(generateText("x", "tenant-byo-unapproved")).resolves.toBe("byo-out");
    expect(H.started).toHaveLength(0);
    expect(H.quotaInsertCalls).toBe(0);
  });

  it("tenantId=null(운영자 내부 호출)은 승인 게이트를 아예 타지 않는다 — db() shared_cli_approved_at 조회 없이 CLI 직행", async () => {
    const { generateText } = await importAnthropic();
    const p = generateText("internal", null);
    await settle();
    expect(H.started).toHaveLength(1);
    H.started[0].finish("internal-out");
    await expect(p).resolves.toBe("internal-out");
    expect(H.quotaInsertCalls).toBe(0); // tenantId=null은 quota도 미대상
  });
});

describe("승인 조회 DB 장애", () => {
  it("조회가 실패하면 승인됨으로 오해석하지 않고 체험 한도로 진행한다", async () => {
    process.env.OSMU_TRIAL_GENERATIONS = "5";
    const limits: number[] = [];
    H.onQuotaLimit = (n) => limits.push(n);
    H.dbThrows = true;
    const { generateText } = await importAnthropic();
    const p = generateText("x", "tenant-db-down");
    await settle();
    expect(H.started).toHaveLength(1);
    H.started[0].finish("ok");
    await expect(p).resolves.toBe("ok");
    // 장애를 이유로 정규 한도가 열리면 비용이 새어 나간다.
    expect(limits).toEqual([5]);
    delete process.env.OSMU_TRIAL_GENERATIONS;
  });
});

describe("sharedAiApprovalErrorResponse — 라우트 헬퍼 매핑 계약", () => {
  it("SharedAiApprovalRequiredError → 403 + code=shared_ai_approval_required", async () => {
    const { SharedAiApprovalRequiredError, sharedAiApprovalErrorResponse } = await importAnthropic();
    const res = sharedAiApprovalErrorResponse(new SharedAiApprovalRequiredError());
    expect(res).not.toBeNull();
    expect(res!.status).toBe(403);
    const body = await res!.json();
    expect(body.code).toBe("shared_ai_approval_required");
  });

  it("그 외 에러는 null을 반환(호출부가 기존 에러 처리를 그대로 쓰게)", async () => {
    const { sharedAiApprovalErrorResponse } = await importAnthropic();
    expect(sharedAiApprovalErrorResponse(new Error("아무 에러"))).toBeNull();
  });
});
