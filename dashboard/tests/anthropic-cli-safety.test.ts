import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { EventEmitter } from "events";
import os from "os";

// 공유 claude -p 실행 경계(lib/anthropic.ts runClaudeCli) 보안 하드닝 검증.
// 배경: 과거엔 execFile(CLAUDE_BIN, ["-p", prompt])로 원격 사용자 프롬프트가 그대로 자식 프로세스
// argv에 실려 `ps`로 다른 로컬 사용자에게 노출될 수 있었고(Critical), CLAUDE.md/skills/plugins/
// hooks/MCP/세션 저장 등 Claude Code의 풀 기능이 열린 채로 공유 CLI가 돌았다. 이 테스트는 그
// 회귀를 막는다:
//   1) prompt는 spawn argv에 절대 실리지 않고 stdin으로만 전달된다.
//   2) 도구/세션/훅을 전부 닫는 필수 플래그가 항상 실린다.
//   3) cwd는 repo가 아니라 os.tmpdir().
//   4) stdout 8MiB 초과·120s timeout·spawn error·비정상 exit·stdin 오류 각각에서 자식이 종료되고
//      promise가 정확히 1회만 settle되며, 에러 메시지에 prompt 원문도 child stderr 원문도 노출되지 않는다.
//   5) stdin 전환으로 사라진 argv 길이 상한을 대체하는 애플리케이션 레벨 1,000,000바이트(UTF-8) 상한이
//      spawn/큐잉/quota reserve보다 먼저 걸린다.

// lib/anthropic.ts의 CLAUDE_CLI_MAX_PROMPT_BYTES와 동일한 값(export되지 않은 내부 상수라 테스트에서
// 중복 정의 — 값이 바뀌면 이 테스트도 함께 갱신 필요).
const MAX_PROMPT_BYTES = 1_000_000;

interface FakeStdin extends EventEmitter {
  end: (d: string) => void;
}

interface FakeChild extends EventEmitter {
  stdout: EventEmitter;
  stdin: FakeStdin;
  kill: ReturnType<typeof vi.fn>;
}

const H = vi.hoisted(() => ({
  calls: [] as { bin: string; args: string[]; opts: { cwd?: string; stdio?: unknown }; child: FakeChild; stdinData: string }[],
  throwOnStdinEnd: false,
}));

vi.mock("child_process", () => ({
  spawn: vi.fn((bin: string, args: string[], opts: { cwd?: string; stdio?: unknown }) => {
    const child = new EventEmitter() as FakeChild;
    child.stdout = new EventEmitter();
    child.kill = vi.fn();
    const rec = { bin, args, opts, child, stdinData: "" };

    const stdin = new EventEmitter() as FakeStdin;
    stdin.end = (data: string) => {
      if (H.throwOnStdinEnd) throw new Error("write after end");
      rec.stdinData = data;
    };
    child.stdin = stdin;

    H.calls.push(rec);
    return child;
  }),
}));

vi.mock("@/lib/db", () => ({
  withTenant: vi.fn(async () => [{ token: null }]),
}));

const microtask = () => new Promise((r) => setImmediate(r));

async function importGenerateText() {
  const mod = await import("@/lib/anthropic");
  return mod.generateText;
}

async function rejectionOf(p: Promise<unknown>): Promise<Error> {
  try {
    await p;
    throw new Error("expected rejection but promise resolved");
  } catch (e) {
    return e as Error;
  }
}

beforeEach(() => {
  vi.resetModules();
  // vi.mock 팩토리가 만든 vi.fn()(spawn/withTenant)는 resetModules만으로는 호출 기록이 비워지지
  // 않고 파일 전체에 걸쳐 유지된다 — withTenant.mock.calls를 테스트별로 독립 관찰하려면
  // clearAllMocks로 호출 기록(구현은 유지)을 매 테스트 리셋해야 한다.
  vi.clearAllMocks();
  H.calls = [];
  H.throwOnStdinEnd = false;
  process.env.OSMU_SECRET_KEY = "enc-key";
  process.env.CLAUDE_BIN = "claude";
  process.env.OSMU_GEN_MODEL = "claude-safety-test-model";
});

afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllGlobals();
});

describe("claude CLI 실행 경계 — argv에 prompt 없음 + stdin 전달", () => {
  it("민감한 prompt 문자열이 argv 어디에도 나타나지 않고 stdin으로만 전달된다", async () => {
    const generateText = await importGenerateText();
    const secretPrompt = "고객 이메일: vip@example.com, 내부 지시사항 유출 테스트";
    const p = generateText(secretPrompt, null);
    await microtask();

    const call = H.calls[0];
    expect(call).toBeDefined();
    expect(call.args).not.toContain(secretPrompt);
    expect(call.args.join(" ")).not.toContain(secretPrompt);
    expect(call.stdinData).toBe(secretPrompt);

    call.child.stdout.emit("data", Buffer.from("ok"));
    call.child.emit("close", 0);
    await expect(p).resolves.toBe("ok");
  });
});

describe("claude CLI 실행 경계 — 필수 플래그·cwd·model", () => {
  it("-p, --tools(빈값), --safe-mode, --disable-slash-commands, --no-session-persistence, --no-chrome, --model이 모두 실린다", async () => {
    const generateText = await importGenerateText();
    const p = generateText("hello", null);
    await microtask();

    const { args, bin } = H.calls[0];
    expect(bin).toBe("claude");
    expect(args).toContain("-p");
    expect(args).toContain("--safe-mode");
    expect(args).toContain("--disable-slash-commands");
    expect(args).toContain("--no-session-persistence");
    expect(args).toContain("--no-chrome");

    const toolsIdx = args.indexOf("--tools");
    expect(toolsIdx).toBeGreaterThanOrEqual(0);
    expect(args[toolsIdx + 1]).toBe(""); // 빈 값 = 빌트인 도구 전부 비활성화

    const modelIdx = args.indexOf("--model");
    expect(modelIdx).toBeGreaterThanOrEqual(0);
    expect(args[modelIdx + 1]).toBe("claude-safety-test-model");

    H.calls[0].child.stdout.emit("data", Buffer.from("done"));
    H.calls[0].child.emit("close", 0);
    await expect(p).resolves.toBe("done");
  });

  it("cwd는 레포가 아니라 os.tmpdir(), stderr는 pipe하지 않고 ignore한다", async () => {
    const generateText = await importGenerateText();
    const p = generateText("hello", null);
    await microtask();

    expect(H.calls[0].opts.cwd).toBe(os.tmpdir());
    expect(H.calls[0].opts.cwd).not.toBe(process.cwd());
    expect(H.calls[0].opts.stdio).toEqual(["pipe", "pipe", "ignore"]);

    H.calls[0].child.stdout.emit("data", Buffer.from("x"));
    H.calls[0].child.emit("close", 0);
    await p;
  });
});

describe("claude CLI 실행 경계 — timeout / 출력상한 / spawn 에러 / 비정상 종료", () => {
  it("120초 안에 종료되지 않으면 SIGTERM으로 kill하고 정확히 1회 timeout reject한다", async () => {
    vi.useFakeTimers();
    const generateText = await importGenerateText();
    const p = generateText("slow", null);
    await vi.advanceTimersByTimeAsync(0);
    const call = H.calls[0];
    expect(call).toBeDefined();

    const assertion = expect(p).rejects.toThrow(/timeout/i);
    await vi.advanceTimersByTimeAsync(120_000);
    await assertion;

    expect(call.child.kill).toHaveBeenCalledWith("SIGTERM");

    // 늦게 도착한 close(성공)가 와도 이미 정착된 reject를 뒤집지 않는다(중복 settle 방지 확인).
    call.child.emit("close", 0);
    await expect(p).rejects.toThrow(/timeout/i);
  });

  it("SIGTERM으로도 자식이 안 죽으면(close 미도달) 3초 뒤 SIGKILL로 강제종료해 좀비를 막는다", async () => {
    vi.useFakeTimers();
    const generateText = await importGenerateText();
    const p = generateText("stuck", null);
    await vi.advanceTimersByTimeAsync(0);
    const call = H.calls[0];

    const assertion = expect(p).rejects.toThrow(/timeout/i);
    await vi.advanceTimersByTimeAsync(120_000); // timeout → SIGTERM
    await assertion;
    expect(call.child.kill).toHaveBeenCalledWith("SIGTERM");
    expect(call.child.kill).not.toHaveBeenCalledWith("SIGKILL");

    // close 이벤트가 끝내 안 온다 = SIGTERM을 무시하는 좀비 시나리오 — 유예 3초 후 SIGKILL이 걸려야 한다.
    await vi.advanceTimersByTimeAsync(3000);
    expect(call.child.kill).toHaveBeenCalledWith("SIGKILL");
  });

  it("kill 이후 close가 정상 도달하면 SIGKILL 유예 타이머가 취소된다(불필요한 강제종료 없음)", async () => {
    vi.useFakeTimers();
    const generateText = await importGenerateText();
    const p = generateText("slow-but-terminates", null);
    await vi.advanceTimersByTimeAsync(0);
    const call = H.calls[0];

    const assertion = expect(p).rejects.toThrow(/timeout/i);
    await vi.advanceTimersByTimeAsync(120_000); // timeout → SIGTERM
    await assertion;

    // SIGTERM에 응해 자식이 실제로 종료됨 → 유예 타이머는 clearTimeout으로 취소돼야 한다.
    call.child.emit("close", null);
    await vi.advanceTimersByTimeAsync(3000);
    expect(call.child.kill).not.toHaveBeenCalledWith("SIGKILL");
  });

  it("stdout이 8MiB를 넘기면 즉시 kill하고 reject — 에러 메시지에 데이터 본문을 담지 않는다", async () => {
    const generateText = await importGenerateText();
    const p = generateText("big-output-job", null);
    await microtask();
    const call = H.calls[0];

    const oversized = Buffer.alloc(8 * 1024 * 1024 + 1, 65); // 'A' * (8MiB+1)
    call.child.stdout.emit("data", oversized);

    const err = await rejectionOf(p);
    expect(err.message).toMatch(/exceeded/i);
    expect(err.message).not.toContain("AAAA");
    expect(call.child.kill).toHaveBeenCalledWith("SIGTERM");
  });

  it("spawn 자체가 error 이벤트를 내면 reject하고, 에러 메시지에 prompt 원문을 담지 않는다", async () => {
    const generateText = await importGenerateText();
    const secretPrompt = "spawn-error-should-not-leak-this-prompt";
    const p = generateText(secretPrompt, null);
    await microtask();
    const call = H.calls[0];
    call.child.emit("error", new Error("ENOENT: claude 바이너리 없음"));

    const err = await rejectionOf(p);
    expect(err.message).toMatch(/spawn/i);
    expect(err.message).not.toContain(secretPrompt);
  });

  it("OSMU-CODE-REVIEW-20260916-17 거절: 첫 실행 파일이 EACCES면 다음 실행 가능 후보로 한 번 폴백한다", async () => {
    process.env.CLAUDE_BIN = "/실행권한없는/claude";
    const generateText = await importGenerateText();
    const p = generateText("fallback", null);
    await microtask();
    const first = H.calls[0];
    const lookupError = Object.assign(new Error("permission denied"), { code: "EACCES" });
    first.child.emit("error", lookupError);
    await microtask();

    expect(H.calls).toHaveLength(2);
    expect(H.calls[1].bin).not.toBe(first.bin);
    H.calls[1].child.stdout.emit("data", Buffer.from("fallback-ok"));
    H.calls[1].child.emit("close", 0);
    await expect(p).resolves.toBe("fallback-ok");
  });

  it("비정상 exit code는 exit code만 담아 reject한다 — child stderr 원문은 어떤 형태로도 캡처·노출되지 않는다", async () => {
    const generateText = await importGenerateText();
    const secretPrompt = "auth-secret-in-stdin-only";
    const p = generateText(secretPrompt, null);
    await microtask();
    const call = H.calls[0];
    // 프로덕션은 stdio: ["pipe","pipe","ignore"]라 child.stderr 자체가 없다(null) — 이 mock에도
    // stderr 스트림을 만들지 않는다(생성 시도해도 프로덕션 코드가 구독하지 않음을 별도 확인).
    expect((call.child as unknown as { stderr?: unknown }).stderr).toBeUndefined();
    call.child.emit("close", 1);

    const err = await rejectionOf(p);
    expect(err.message).toBe("claude CLI exited with code 1");
    expect(err.message).not.toContain(secretPrompt);
    expect(err.message).not.toMatch(/auth|password|token|secret/i);
  });

  it("close 성공 후 뒤늦게 error 이벤트가 와도 이미 정착된 resolve 값이 유지된다(정확히 1회 settle)", async () => {
    const generateText = await importGenerateText();
    const p = generateText("ok-job", null);
    await microtask();
    const call = H.calls[0];
    call.child.stdout.emit("data", Buffer.from("resolved-value"));
    call.child.emit("close", 0);
    call.child.emit("error", new Error("late spurious error"));

    await expect(p).resolves.toBe("resolved-value");
  });
});

describe("claude CLI 실행 경계 — stdin 쓰기 실패(EPIPE/동기 throw)", () => {
  it("child.stdin이 'error' 이벤트(EPIPE 등)를 내면 child를 kill하고 안정된(prompt 미포함) 에러로 reject한다", async () => {
    const generateText = await importGenerateText();
    const secretPrompt = "epipe-should-not-leak-this-prompt";
    const p = generateText(secretPrompt, null);
    await microtask();
    const call = H.calls[0];
    call.child.stdin.emit("error", new Error("write EPIPE"));

    const err = await rejectionOf(p);
    expect(err.message).toMatch(/stdin/i);
    expect(err.message).not.toContain(secretPrompt);
    expect(call.child.kill).toHaveBeenCalledWith("SIGTERM");
  });

  it("child.stdin.end()가 동기적으로 throw해도 child를 kill하고 안정된 에러로 reject하며, 큐는 다음 요청으로 계속 진행된다(FIFO 미차단)", async () => {
    H.throwOnStdinEnd = true;
    const generateText = await importGenerateText();
    const p1 = generateText("throws-on-end-should-not-leak", null);
    // 이 케이스는 test 코드의 명시적 트리거(emit 등) 없이 큐 처리 도중 자동으로 reject되므로,
    // rejectionOf(p1)로 핸들러를 붙이기 전인 microtask() 대기 구간에 Node가 "unhandled rejection"으로
    // 오탐할 수 있다 — 즉시 빈 catch를 붙여 그 창을 없앤다(아래 rejectionOf 호출과 무관하게 동작).
    p1.catch(() => {});
    await microtask();
    const call1 = H.calls[0];

    const err = await rejectionOf(p1);
    expect(err.message).toMatch(/stdin/i);
    expect(err.message).not.toContain("throws-on-end-should-not-leak");
    expect(call1.child.kill).toHaveBeenCalledWith("SIGTERM");

    // 다음 요청은 stdin이 정상 동작 — 큐가 앞선 stdin 실패로 멈추지 않았음을 증명.
    H.throwOnStdinEnd = false;
    const p2 = generateText("next-request-after-stdin-failure", null);
    await microtask();
    expect(H.calls).toHaveLength(2);
    const call2 = H.calls[1];
    call2.child.stdout.emit("data", Buffer.from("ok2"));
    call2.child.emit("close", 0);
    await expect(p2).resolves.toBe("ok2");
  });
});

describe("claude CLI 실행 경계 — 공유 CLI 진입 전 prompt 크기 상한(1,000,000 UTF-8 바이트)", () => {
  it("정확히 1,000,000 바이트는 허용 — 거부되지 않고 spawn까지 정상 진행한다", async () => {
    const generateText = await importGenerateText();
    const exact = "a".repeat(MAX_PROMPT_BYTES); // ASCII 1바이트/문자 — 정확히 상한과 같은 바이트 수
    expect(Buffer.byteLength(exact, "utf8")).toBe(MAX_PROMPT_BYTES);

    const p = generateText(exact, null);
    await microtask();
    expect(H.calls).toHaveLength(1);

    H.calls[0].child.stdout.emit("data", Buffer.from("ok"));
    H.calls[0].child.emit("close", 0);
    await expect(p).resolves.toBe("ok");
  });

  it("1,000,001 바이트(ASCII)는 spawn·큐 진입 없이 즉시 거부(prompt 원문 미노출)", async () => {
    const generateText = await importGenerateText();
    const oversized = "a".repeat(MAX_PROMPT_BYTES + 1);

    const err = await rejectionOf(generateText(oversized, null));
    expect(err.message).toMatch(/too large/i);
    expect(err.message).not.toContain("a".repeat(50)); // prompt 원문 조각이 에러에 없음
    expect(H.calls).toHaveLength(0); // spawn 0회
  });

  it("tenant + 공유 CLI 경로도 동일 상한 — 초과 시 spawn 0회 + quota reserve(usage_quotas INSERT) 없이 즉시 거부", async () => {
    const generateText = await importGenerateText();
    const { withTenant } = await import("@/lib/db");
    const oversized = "b".repeat(MAX_PROMPT_BYTES + 1);

    await expect(generateText(oversized, "tenant-1")).rejects.toThrow(/too large/i);
    expect(H.calls).toHaveLength(0); // spawn 0회

    // withTenant 호출은 getAnthropicKey(BYO 키 조회) 1회뿐 — reserveSharedGeneration(usage_quotas
    // INSERT)까지는 도달하지 않았어야 한다. mock이 쿼리 내용을 구분하지 않으므로 "얼마나 호출됐나"로
    // reserve 미도달을 확인한다(1회=키조회만, 2회 이상이면 reserve까지 간 것).
    expect((withTenant as ReturnType<typeof vi.fn>).mock.calls.length).toBe(1);
  });

  it("tenantId=null 경로는 getAnthropicKey 자체를 안 타므로, 초과 시 withTenant 호출도 0회", async () => {
    const generateText = await importGenerateText();
    const { withTenant } = await import("@/lib/db");
    const oversized = "c".repeat(MAX_PROMPT_BYTES + 1);

    await expect(generateText(oversized, null)).rejects.toThrow(/too large/i);
    expect(H.calls).toHaveLength(0);
    expect(withTenant).not.toHaveBeenCalled();
  });

  it("멀티바이트 문자 — 문자 수는 상한 이하지만 UTF-8 바이트 수가 상한을 넘으면 여전히 거부된다(문자 수 기준 아님을 증명)", async () => {
    const generateText = await importGenerateText();
    // '가'는 UTF-8로 3바이트 — 400,000자 x 3바이트 = 1,200,000바이트(문자 수는 상한의 40%뿐).
    const multibyte = "가".repeat(400_000);
    expect(multibyte.length).toBeLessThan(MAX_PROMPT_BYTES);
    expect(Buffer.byteLength(multibyte, "utf8")).toBeGreaterThan(MAX_PROMPT_BYTES);

    await expect(generateText(multibyte, null)).rejects.toThrow(/too large/i);
    expect(H.calls).toHaveLength(0);
  });
});
