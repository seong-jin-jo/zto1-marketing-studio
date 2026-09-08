import { withTenant, db } from "@/lib/db";
import { spawn, type ChildProcess } from "child_process";
import os from "os";
import { reportFailure, reportRecovery, classifySharedAiFailure } from "@/lib/observability";

// 공유 claude -p 실행 실패(spawn/timeout/output-overflow/non-zero exit) 전용 알림 — quota 초과
// (SharedGenerationQuotaError)·미승인(SharedAiApprovalRequiredError)은 정상적인 사용량 게이트일 뿐
// 인프라 장애가 아니므로 여기 대상이 아니다(호출부에서 그 두 에러가 나기 전에 이미 gate돼 이
// 헬퍼에 도달하지 않음). e.message는 runClaudeCli 계약상 prompt/stderr를 절대 포함하지 않는
// 안정된 문구만 담기지만, 그래도 원문을 context에 넣지 않고 classifySharedAiFailure로 고정
// reason 코드(timeout/output_limit/spawn_failed/exit_nonzero/stdin_failed/unknown)로만 변환한다
// (이중 방어 — 메시지 포맷이 향후 바뀌어도 유출 표면이 늘지 않는다).
function reportSharedAiExecutionFailure(e: unknown, workspaceId?: string): void {
  void reportFailure({
    event: "shared_ai_generation_execution_failed",
    severity: "error",
    workspaceId,
    context: { reason: classifySharedAiFailure(e) },
  });
}

const CLAUDE_BIN = process.env.CLAUDE_BIN || "claude";
const ANTHROPIC_API = "https://api.anthropic.com/v1/messages";
const MODEL = process.env.OSMU_GEN_MODEL || "claude-sonnet-4-6";
const CLAUDE_CLI_TIMEOUT_MS = 120_000;
const CLAUDE_CLI_MAX_OUTPUT_BYTES = 8 * 1024 * 1024;
// stdin 전환(argv 미사용)으로 OS 수준 argv 길이 상한이 사라졌으므로 애플리케이션 레벨에서 별도로
// 상한을 건다 — UTF-8 바이트 기준(문자 수 아님, multibyte 프롬프트가 실제 페이로드 크기를 과소평가하지
// 않게). 공유 CLI(spawn/큐/quota reserve) 경로에만 적용 — BYO Anthropic HTTP API 경로는 미적용.
const CLAUDE_CLI_MAX_PROMPT_BYTES = 1_000_000;

export type GeneratedTextUsage = {
  inputTokens: number;
  cacheCreationInputTokens: number;
  cacheReadInputTokens: number;
  outputTokens: number;
  totalTokens: number;
  totalCostUsd: number | null;
};

export type GeneratedTextResult = {
  text: string;
  provider: "anthropic-api" | "claude-cli";
  model: string;
  usage: GeneratedTextUsage;
};

// 테넌트가 등록한 자기 Anthropic 키(integrations kind='anthropic') 복호화. 없으면 null.
// withTenant(RLS) 안에서 복호화 — 키는 메모리에만.
export async function getAnthropicKey(tenantId: string): Promise<string | null> {
  const key = process.env.OSMU_SECRET_KEY;
  if (!key) return null;
  const [row] = await withTenant(tenantId, (sql) => sql<{ token: string | null }[]>`
    SELECT CASE WHEN secret_enc <> '' THEN pgp_sym_decrypt(dearmor(secret_enc), ${key}) ELSE NULL END AS token
    FROM integrations WHERE tenant_id = ${tenantId} AND kind = 'anthropic' LIMIT 1`);
  return row?.token || null;
}

// SIGTERM을 무시하는 극단 케이스 방지용 유예 강제종료(close 전에 프로세스가 죽으면 clearTimeout됨).
function killClaudeChild(child: ChildProcess): void {
  try {
    child.kill("SIGTERM");
  } catch {
    // 이미 종료된 프로세스 — 무시.
  }
  const forceKill = setTimeout(() => {
    try {
      child.kill("SIGKILL");
    } catch {
      // 이미 종료된 프로세스 — 무시.
    }
  }, 3000);
  child.once("close", () => clearTimeout(forceKill));
}

// 공유 claude -p CLI를 실행하는 유일한 경계 — 모든 호출부(테넌트/운영자 내부)가 이 함수 하나만 거친다.
// 보안 경계(Critical 위험 대응):
//   - prompt는 절대 argv에 싣지 않는다(child_process argv는 `ps`로 다른 로컬 사용자에게도 보임) —
//     stdin으로만 전달한다.
//   - --tools ""(빌트인 도구 전부 비활성화) + --safe-mode(CLAUDE.md/skills/plugins/hooks/MCP/커스텀
//     테마 등 전부 비활성화) + --disable-slash-commands + --no-session-persistence(세션을 디스크에
//     남기지 않음) + --no-chrome(Chrome 연동 비활성화)를 항상 고정한다 — 원격 사용자 프롬프트가
//     이 레포/호스트의 도구·세션·설정을 여는 표면이 되지 않도록.
//   - cwd는 repo가 아니라 os.tmpdir() — CLAUDE.md 자동탐색/프로젝트 설정이 이 경로 기준으로 로드되지
//     않게 격리.
//   - stdout 8MiB 상한(초과 시 즉시 kill) + timeout 120s(초과 시 kill) — 자식 프로세스가 무한정
//     남거나(zombie) 메모리를 무한히 먹지 않게.
//   - promise는 정확히 1회만 settle(settled 플래그로 timeout/overflow/error/close/stdin-오류 경합 방어).
//   - stderr는 아예 pipe하지 않는다(stdio: ignore) — child의 stderr(내부 경로·인증 진단·프롬프트가
//     반향된 내용 등)를 어떤 형태로도 캡처·저장·반환·로그하지 않기 위함. 에러 메시지는 exit code만
//     담는다 — prompt 원문/시크릿/child 진단 출력은 어떤 에러 경로로도 메시지에 넣지 않는다.
function runClaudeCli(prompt: string): Promise<string> {
  return new Promise<string>((resolve, reject) => {
    let settled = false;
    const settle = (fn: () => void) => {
      if (settled) return;
      settled = true;
      fn();
    };

    let child: ChildProcess;
    try {
      child = spawn(
        CLAUDE_BIN,
        [
          "-p",
          "--tools", "",
          "--safe-mode",
          "--disable-slash-commands",
          "--no-session-persistence",
          "--no-chrome",
          "--model", MODEL,
        ],
        // stderr: "ignore" — child 진단 출력을 프로세스로 아예 들이지 않는다(캡처 자체가 없으므로
        // 로그/반환 경로로 새어나갈 여지가 없다).
        { cwd: os.tmpdir(), stdio: ["pipe", "pipe", "ignore"] },
      );
    } catch (err) {
      reject(err instanceof Error ? err : new Error(String(err)));
      return;
    }

    const stdoutChunks: Buffer[] = [];
    let stdoutBytes = 0;
    let overflowed = false;

    const timer = setTimeout(() => {
      killClaudeChild(child);
      settle(() => reject(new Error(`claude CLI timeout(${CLAUDE_CLI_TIMEOUT_MS}ms)`)));
    }, CLAUDE_CLI_TIMEOUT_MS);
    const cleanup = () => clearTimeout(timer);

    child.stdout?.on("data", (chunk: Buffer) => {
      if (overflowed) return;
      stdoutBytes += chunk.length;
      if (stdoutBytes > CLAUDE_CLI_MAX_OUTPUT_BYTES) {
        overflowed = true;
        killClaudeChild(child);
        cleanup();
        settle(() => reject(new Error(`claude CLI output exceeded ${CLAUDE_CLI_MAX_OUTPUT_BYTES} bytes`)));
        return;
      }
      stdoutChunks.push(chunk);
    });

    // stdin 쓰기 실패(EPIPE 등, 예: child가 stdin을 채 열기도 전에 죽은 경우) — 진행 중인 child를
    // 종료하고 안정된(프롬프트 미포함) 에러로 정확히 1회 reject한다. 큐(runSerializedCli)는 이 reject로
    // tail이 그대로 정착돼 다음 대기자로 진행한다.
    child.stdin?.on("error", () => {
      cleanup();
      killClaudeChild(child);
      settle(() => reject(new Error("claude CLI stdin 오류")));
    });

    child.on("error", (err) => {
      cleanup();
      settle(() => reject(new Error(`claude CLI spawn 실패: ${err.message}`)));
    });

    child.on("close", (code) => {
      cleanup();
      if (overflowed) return; // 이미 reject됨 — 여기서 재처리하지 않음.
      if (code === 0) {
        settle(() => resolve(Buffer.concat(stdoutChunks).toString("utf8")));
      } else {
        settle(() => reject(new Error(`claude CLI exited with code ${code}`)));
      }
    });

    // end()가 동기적으로 throw할 수도 있다(예: 스트림이 이미 파괴된 극단 케이스) — try/catch로 잡아
    // 위 error 이벤트 경로와 동일하게 child를 종료하고 안정된 에러로 1회만 reject한다.
    try {
      child.stdin?.end(prompt, "utf8");
    } catch {
      cleanup();
      killClaudeChild(child);
      settle(() => reject(new Error("claude CLI stdin 쓰기 실패")));
    }
  });
}

function finiteNonNegative(value: unknown): number {
  return typeof value === "number" && Number.isFinite(value) && value >= 0 ? value : 0;
}

function runClaudeCliWithUsage(
  prompt: string,
  model: string,
  timeoutMs: number,
): Promise<GeneratedTextResult> {
  return new Promise<GeneratedTextResult>((resolve, reject) => {
    let settled = false;
    const settle = (fn: () => void) => {
      if (settled) return;
      settled = true;
      fn();
    };

    let child: ChildProcess;
    try {
      child = spawn(
        CLAUDE_BIN,
        [
          "-p",
          "--tools", "",
          "--safe-mode",
          "--disable-slash-commands",
          "--no-session-persistence",
          "--no-chrome",
          "--max-turns", "1",
          "--model", model,
          "--output-format", "json",
        ],
        { cwd: os.tmpdir(), stdio: ["pipe", "pipe", "ignore"] },
      );
    } catch (error) {
      reject(error instanceof Error ? error : new Error(String(error)));
      return;
    }

    const stdoutChunks: Buffer[] = [];
    let stdoutBytes = 0;
    let overflowed = false;
    const timer = setTimeout(() => {
      killClaudeChild(child);
      settle(() => reject(new Error(`claude CLI timeout(${timeoutMs}ms)`)));
    }, timeoutMs);
    const cleanup = () => clearTimeout(timer);

    child.stdout?.on("data", (chunk: Buffer) => {
      if (overflowed) return;
      stdoutBytes += chunk.length;
      if (stdoutBytes > CLAUDE_CLI_MAX_OUTPUT_BYTES) {
        overflowed = true;
        killClaudeChild(child);
        cleanup();
        settle(() => reject(new Error(`claude CLI output exceeded ${CLAUDE_CLI_MAX_OUTPUT_BYTES} bytes`)));
        return;
      }
      stdoutChunks.push(chunk);
    });
    child.stdin?.on("error", () => {
      cleanup();
      killClaudeChild(child);
      settle(() => reject(new Error("claude CLI stdin 오류")));
    });
    child.on("error", (error) => {
      cleanup();
      settle(() => reject(new Error(`claude CLI spawn 실패: ${error.message}`)));
    });
    child.on("close", (code) => {
      cleanup();
      if (overflowed) return;
      if (code !== 0) {
        settle(() => reject(new Error(`claude CLI exited with code ${code}`)));
        return;
      }
      try {
        const envelope = JSON.parse(Buffer.concat(stdoutChunks).toString("utf8")) as {
          is_error?: boolean;
          result?: unknown;
          total_cost_usd?: unknown;
          usage?: {
            input_tokens?: unknown;
            cache_creation_input_tokens?: unknown;
            cache_read_input_tokens?: unknown;
            output_tokens?: unknown;
          };
        };
        if (envelope.is_error || typeof envelope.result !== "string" || !envelope.result.trim()) {
          throw new Error("claude CLI가 사용할 수 있는 결과를 반환하지 않았습니다");
        }
        const inputTokens = finiteNonNegative(envelope.usage?.input_tokens);
        const cacheCreationInputTokens = finiteNonNegative(envelope.usage?.cache_creation_input_tokens);
        const cacheReadInputTokens = finiteNonNegative(envelope.usage?.cache_read_input_tokens);
        const outputTokens = finiteNonNegative(envelope.usage?.output_tokens);
        const totalCostUsd = typeof envelope.total_cost_usd === "number" && Number.isFinite(envelope.total_cost_usd)
          ? Math.max(0, envelope.total_cost_usd)
          : null;
        settle(() => resolve({
          text: envelope.result as string,
          provider: "claude-cli",
          model,
          usage: {
            inputTokens,
            cacheCreationInputTokens,
            cacheReadInputTokens,
            outputTokens,
            totalTokens: inputTokens + cacheCreationInputTokens + cacheReadInputTokens + outputTokens,
            totalCostUsd,
          },
        }));
      } catch {
        settle(() => reject(new Error("claude CLI JSON 결과를 해석하지 못했습니다")));
      }
    });
    try {
      child.stdin?.end(prompt, "utf8");
    } catch {
      cleanup();
      killClaudeChild(child);
      settle(() => reject(new Error("claude CLI stdin 쓰기 실패")));
    }
  });
}

// 공유 claude -p 직렬화 큐 — CLI는 프로세스에 1개뿐인 공유 프로필(운영자 OAuth 세션)을 쓰므로
// 여러 테넌트 요청이 동시에 들어오면 같은 자격증명/세션 상태를 놓고 경합한다.
// 프로세스-로컬 FIFO(promise 체인)로 CLI 폴백만 한 번에 하나씩 실행한다.
// 테넌트 BYO 키(HTTP API) 경로는 테넌트별 격리라 이 큐를 타지 않는다(동시 실행 유지).
// 실패/타임아웃(runClaudeCli의 timeout이 자식 kill 후 reject)해도 tail은 항상 정착 → 다음 대기자 진행.
let cliQueueTail: Promise<void> = Promise.resolve();

function runSerializedCli<T>(task: () => Promise<T>): Promise<T> {
  const run = cliQueueTail.then(task);
  cliQueueTail = run.then(() => undefined, () => undefined);
  return run;
}

// ─── 공유 claude -p 월별 사용량 quota ──────────────────────────────────────
// BYO Anthropic 키 경로와 tenantId=null(운영자 내부 호출)은 이 quota 대상이 아니다
// (generateText 상단에서 이미 분기됨 — 여기 도달하는 건 "테넌트 + 공유 CLI"뿐).

export class SharedGenerationQuotaError extends Error {
  readonly period: string;
  readonly limit: number;
  readonly used: number;
  constructor(period: string, limit: number, used: number) {
    super(`이번 달 생성 한도를 다 쓰셨습니다 (${used}/${limit}, ${period}). 다음 달에 다시 채워지고, 설정에서 자체 Anthropic 키를 등록하면 한도 없이 쓸 수 있습니다.`);
    this.name = "SharedGenerationQuotaError";
    this.period = period;
    this.limit = limit;
    this.used = used;
  }
}

// machine code — 라우트가 429 응답 body에 그대로 싣는다(클라 분기용 안정 식별자).
export const SHARED_GENERATION_QUOTA_EXCEEDED_CODE = "shared_generation_quota_exceeded";

// generateText 호출부(6개 라우트) 공용 헬퍼. SharedGenerationQuotaError면 429 Response를,
// 그 외 에러면 null을 반환 — 호출부는 null일 때만 기존 에러 처리(502/500 등)를 그대로 쓴다.
export function sharedGenerationQuotaErrorResponse(e: unknown): Response | null {
  if (!(e instanceof SharedGenerationQuotaError)) return null;
  return Response.json(
    { error: e.message, code: SHARED_GENERATION_QUOTA_EXCEEDED_CODE, period: e.period, limit: e.limit, used: e.used },
    { status: 429 },
  );
}

// OSMU_SHARED_GENERATIONS_INCLUDED — 양의 정수만 인정, 그 외(미설정·0·음수·비숫자)는 기본 100.
// OSMU_TRIAL_GENERATIONS — 운영자 승인 전 회원의 체험 한도. 기본 20.
//
// 2026-09-08 회장 지시("회원들은 OAuth2 로그인만 하면 바로 발행"). 종전에는 승인 전 회원의
// 생성 요청을 전부 거절했다. 가입은 되는데 첫 생성부터 막히고, 화면은 운영자 승인을 기다리거나
// 개발자용 API 키를 직접 발급해 오라고 안내했다. 우리 고객은 도구 학습 시간이 없는 1인 사업자다.
// 그 사람에게 API 키를 발급해 오라는 것은 제품을 안 쓰겠다는 말과 같다.
// 그래서 승인은 "문" 이 아니라 "한도를 올리는 것" 으로 바꾼다. 비용은 무한히 열리지 않는다.
// 이미 있는 월별 사용량 한도가 그대로 걸리고, 승인 전에는 더 작은 체험 한도가 걸린다.
function sharedGenerationsIncluded(approved: boolean): number {
  const raw = approved
    ? process.env.OSMU_SHARED_GENERATIONS_INCLUDED
    : process.env.OSMU_TRIAL_GENERATIONS;
  const n = raw != null && raw !== "" ? Number(raw) : NaN;
  if (Number.isInteger(n) && n > 0) return n;
  return approved ? 100 : 20;
}

function currentPeriodUTC(): string {
  const d = new Date();
  return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, "0")}`;
}

// 원자적 reserve — 단일 INSERT..ON CONFLICT..DO UPDATE..WHERE..RETURNING로 "같은 월이면 미만일
// 때만 +1, 월이 바뀌면 1로 reset"을 한 스테이트먼트에서 처리한다. ON CONFLICT는 충돌 행에 대해
// 먼저 행 잠금을 잡은 뒤 DO UPDATE의 WHERE를 잠금된 최신 값으로 재평가하므로, 동시 요청이 같은
// tenant_id로 몰려도(FIFO 큐 덕에 실제로는 순차지만, 방어적으로) 한도를 넘겨 카운트되지 않는다.
// RETURNING 행이 0개 = WHERE가 false = 이미 한도 도달 → SharedGenerationQuotaError throw(카운트 불변).
async function reserveSharedGeneration(tenantId: string, approved: boolean): Promise<{ period: string; limit: number }> {
  const limit = sharedGenerationsIncluded(approved);
  const period = currentPeriodUTC();

  const rows = await withTenant(tenantId, (sql) => sql<{ generations_used: number }[]>`
    INSERT INTO usage_quotas (tenant_id, period, generations_included, generations_used, updated_at)
    VALUES (${tenantId}, ${period}, ${limit}, 1, now())
    ON CONFLICT (tenant_id) DO UPDATE SET
      period = ${period},
      generations_included = ${limit},
      generations_used = CASE
        WHEN usage_quotas.period <> ${period} THEN 1
        ELSE usage_quotas.generations_used + 1
      END,
      updated_at = now()
    WHERE usage_quotas.period <> ${period} OR usage_quotas.generations_used < ${limit}
    RETURNING generations_used`);

  if (rows.length > 0) return { period, limit };

  const [existing] = await withTenant(tenantId, (sql) => sql<{ generations_used: number; period: string }[]>`
    SELECT generations_used, period FROM usage_quotas WHERE tenant_id = ${tenantId} LIMIT 1`);
  throw new SharedGenerationQuotaError(period, limit, existing?.generations_used ?? limit);
}

// claude -p 실행이 실패/timeout이면 방금 reserve한 해당 월 카운트를 보상(GREATEST(0, used-1)).
// period를 조건에 걸어, 보상 시점에 이미 월이 넘어갔다면(자정 경계) 새 달 카운트를 잘못 깎지 않는다.
// 보상 자체가 실패해도(DB 장애 등) throw하지 않는다 — 이미 실패한 generateText 호출의 원래 에러를
// 가리지 않기 위함(요구사항: 응답 실패 원인은 원래 에러여야 함). 과소보상은 최악의 경우
// 월 카운트가 실제 성공 생성 수보다 최대 1 많게 남는 정도로 유계.
async function releaseSharedGeneration(tenantId: string, period: string): Promise<void> {
  try {
    await withTenant(tenantId, (sql) => sql`
      UPDATE usage_quotas SET generations_used = GREATEST(0, generations_used - 1), updated_at = now()
      WHERE tenant_id = ${tenantId} AND period = ${period}`);
  } catch (e) {
    if (process.env.OSMU_DEBUG) console.error("[anthropic] quota 보상 실패(무시 — 원 에러 유지):", e);
  }
}

// 성공 시 usage_events에 aiGeneration 1건 기록(best-effort). 실패해도 이미 성공한 stdout 응답을
// 실패시키지 않는다 — 단, quota count(reserve에서 이미 +1됨)는 그대로 유지(요구사항 4).
async function recordSharedGenerationEvent(
  tenantId: string,
  details: Partial<GeneratedTextUsage> & { model?: string; source?: string } = {},
): Promise<void> {
  try {
    await withTenant(tenantId, (sql) => sql`
      INSERT INTO usage_events (tenant_id, event_type, quantity, meta)
      VALUES (${tenantId}, 'aiGeneration', 1, ${sql.json({
        source: details.source ?? "shared-claude-cli",
        model: details.model ?? MODEL,
        input_tokens: details.inputTokens ?? null,
        cache_creation_input_tokens: details.cacheCreationInputTokens ?? null,
        cache_read_input_tokens: details.cacheReadInputTokens ?? null,
        output_tokens: details.outputTokens ?? null,
        total_tokens: details.totalTokens ?? null,
        total_cost_usd: details.totalCostUsd ?? null,
      })})`);
  } catch (e) {
    if (process.env.OSMU_DEBUG) console.error("[anthropic] usage_events 기록 실패(무시):", e);
  }
}

// BYO Anthropic HTTP API는 고객 자신의 키/과금 경로라 usage_quotas reserve 대상은 아니지만,
// Anthropic 응답이 제공하는 실제 input/output token을 usage_events 정본에 남긴다.
// 생성은 이미 provider에서 성공·과금된 뒤이므로 원장 장애가 응답을 실패시켜 재시도/이중과금을
// 유발하지 않게 shared CLI 이벤트와 동일한 best-effort 정책을 쓴다.
async function recordByokGenerationEvent(
  tenantId: string,
  usage: { input_tokens?: number; output_tokens?: number } | undefined,
): Promise<void> {
  const inputTokens = Number.isFinite(usage?.input_tokens) ? Math.max(0, Number(usage?.input_tokens)) : 0;
  const outputTokens = Number.isFinite(usage?.output_tokens) ? Math.max(0, Number(usage?.output_tokens)) : 0;
  try {
    await withTenant(tenantId, (sql) => sql`
      INSERT INTO usage_events (tenant_id, event_type, quantity, meta)
      VALUES (${tenantId}, 'aiGeneration', 1, ${sql.json({
        source: "byo-anthropic-api",
        model: MODEL,
        input_tokens: inputTokens,
        output_tokens: outputTokens,
        total_tokens: inputTokens + outputTokens,
      })})`);
  } catch (e) {
    if (process.env.OSMU_DEBUG) console.error("[anthropic] BYOK usage_events 기록 실패(무시):", e);
  }
}

// 테넌트 + 공유 CLI 경로 전용: 큐 실행 "직전"이 아니라 "그 작업이 실제로 시작될 때" reserve한다
// (runSerializedCli에 넘기는 task 내부에서 reserve) — 대기 중인 여러 요청이 한꺼번에 quota를
// 선점해 쌓이지 않고, 실제로 실행 순서가 돌아온 요청만 그 시점의 최신 사용량으로 reserve된다.
function runSharedCliWithQuota(tenantId: string, prompt: string, approved: boolean): Promise<string> {
  return runSerializedCli(async () => {
    const { period } = await reserveSharedGeneration(tenantId, approved);
    let stdout: string;
    try {
      stdout = await runClaudeCli(prompt);
    } catch (e) {
      await releaseSharedGeneration(tenantId, period);
      throw e;
    }
    // 이벤트 기록은 응답을 막지 않는 best-effort — await는 하되 실패를 삼킨다(위 함수 내부에서 처리).
    await recordSharedGenerationEvent(tenantId);
    return stdout;
  });
}

// 공유 CLI(spawn/큐/quota reserve) 진입 전 상한 검사 — 초과 시 prompt 원문 없는 안정된 Error를
// 던진다(spawn·runSerializedCli enqueue·reserveSharedGeneration 전부 미실행 상태로 즉시 실패).
function assertPromptWithinCliLimit(prompt: string): void {
  const bytes = Buffer.byteLength(prompt, "utf8");
  if (bytes > CLAUDE_CLI_MAX_PROMPT_BYTES) {
    throw new Error(`prompt too large for shared claude CLI (max ${CLAUDE_CLI_MAX_PROMPT_BYTES} bytes)`);
  }
}

// ─── 공유 claude -p 사용 승인(entitlement) — 계정 접근(active/paused)과 분리 ──────────────────
// OSMU v1.0.0 공개 대시보드: 가입 즉시 계정은 active라 대시보드에는 들어오지만, 공유 CLI(운영자
// 자격증명·비용)를 쓰려면 운영자가 개별 승인(tenants.shared_cli_approved_at)해야 한다.
// BYO Anthropic 키 경로는 이 게이트와 무관(자기 키·자기 과금이라 즉시 허용, generateText 상단에서 이미 분기).

// 2026-09-08 이후 이 오류는 더 이상 발생하지 않는다. 승인은 문이 아니라 한도가 됐다
// (sharedGenerationsIncluded 주석 참조). 라우트 6곳이 아직 이 헬퍼를 catch 에서 부르고 있어
// 형태만 남겨 둔다. 새 코드에서 이걸 던지지 마라 — 회원을 첫 생성에서 막는 문을 되살리는 것이다.
export class SharedAiApprovalRequiredError extends Error {
  constructor() {
    super("공유 AI 생성은 아직 승인되지 않았습니다. 운영자 승인을 기다리거나 Settings에서 자체 Anthropic 키를 등록하면 즉시 이용할 수 있습니다.");
    this.name = "SharedAiApprovalRequiredError";
  }
}

// machine code — 라우트가 403 응답 body에 그대로 싣는다(클라 분기용 안정 식별자).
export const SHARED_AI_APPROVAL_REQUIRED_CODE = "shared_ai_approval_required";

// generateText 호출부(6개 라우트) 공용 헬퍼. SharedAiApprovalRequiredError면 403 Response를,
// 그 외 에러면 null을 반환 — 호출부는 null일 때만 기존 에러 처리(429/502 등)를 그대로 쓴다.
export function sharedAiApprovalErrorResponse(e: unknown): Response | null {
  if (!(e instanceof SharedAiApprovalRequiredError)) return null;
  return Response.json(
    { error: e.message, code: SHARED_AI_APPROVAL_REQUIRED_CODE },
    { status: 403 },
  );
}

// tenants는 RLS 제외라 bare db()로 조회(다른 tenants 조회 — getTenantStatus 등과 동일 패턴).
// null/미존재면 미승인으로 fail-closed(계정 조회 실패를 "승인됨"으로 해석하지 않는다).
// 조회 실패·미존재는 미승인으로 본다(fail-closed). 미승인은 거절이 아니라 체험 한도다.
async function isSharedAiApproved(tenantId: string): Promise<boolean> {
  try {
    const sql = db();
    const [row] = await sql<{ shared_cli_approved_at: string | null }[]>`
      SELECT shared_cli_approved_at FROM tenants WHERE id = ${tenantId} LIMIT 1`;
    return Boolean(row?.shared_cli_approved_at);
  } catch {
    return false;
  }
}

// 텍스트 생성. 고객이 자기 Anthropic 키를 등록했으면 그 키로 API 호출(고객 과금·격리, quota 대상 아님,
// 프롬프트 크기 상한도 미적용 — HTTP API 자체 한도를 따른다, 승인 게이트도 무관하게 즉시 허용),
// tenantId=null(운영자 내부 호출)이면 quota·승인 게이트 없이 공유 claude -p, 그 외(테넌트 + BYO 키 없음)는
// 먼저 공유 AI 사용 승인(tenants.shared_cli_approved_at)을 확인한 뒤에만 월별 usage_quotas 한도를
// 원자적으로 reserve해 실행한다(quota reserve/큐 진입/spawn 전부 승인 확인 이후). 공유 CLI 두 경로 모두
// spawn/큐잉/quota reserve 전에 assertPromptWithinCliLimit로 프롬프트 크기(UTF-8 바이트)를 먼저 검사한다.
// 반환=raw 텍스트(호출부가 JSON 추출). 미승인이면 SharedAiApprovalRequiredError, 한도 초과면
// SharedGenerationQuotaError throw.
export async function generateText(prompt: string, tenantId: string | null): Promise<string> {
  const apiKey = tenantId ? await getAnthropicKey(tenantId) : null;
  if (apiKey && tenantId) {
    const res = await fetch(ANTHROPIC_API, {
      method: "POST",
      headers: { "content-type": "application/json", "x-api-key": apiKey, "anthropic-version": "2023-06-01" },
      body: JSON.stringify({ model: MODEL, max_tokens: 2000, messages: [{ role: "user", content: prompt }] }),
      // CLI 폴백(runClaudeCli timeout=120s)과 동률 — BYO HTTP가 무한 대기로 요청을 잡아두지 않게.
      signal: AbortSignal.timeout(120000),
    });
    if (!res.ok) throw new Error(`Anthropic API ${res.status}: ${(await res.text()).slice(0, 200)}`);
    const data = (await res.json()) as {
      content?: { text?: string }[];
      usage?: { input_tokens?: number; output_tokens?: number };
    };
    await recordByokGenerationEvent(tenantId, data.usage);
    return data?.content?.[0]?.text || "";
  }
  assertPromptWithinCliLimit(prompt);
  if (!tenantId) {
    // 운영자/내부 호출 — quota·승인 게이트 대상 아님. 큐는 그대로 태워 공유 CLI 프로필 경합만 직렬화.
    try {
      return await runSerializedCli(() => runClaudeCli(prompt));
    } catch (e) {
      reportSharedAiExecutionFailure(e);
      throw e;
    }
  }
  // 승인은 문이 아니라 한도다. 승인 전이면 더 작은 체험 한도로 그대로 진행한다.
  const approved = await isSharedAiApproved(tenantId);
  try {
    const output = await runSharedCliWithQuota(tenantId, prompt, approved);
    void reportRecovery?.({ workspaceId: tenantId, category: "generation_failed", source: "shared_ai" });
    return output;
  } catch (e) {
    // quota reserve(SharedGenerationQuotaError)는 runSharedCliWithQuota 내부에서 일어나 이 try에
    // 걸리지만 정상적인 사용량 게이트일 뿐 실행 장애가 아니므로 알림 대상에서 제외한다.
    if (!(e instanceof SharedGenerationQuotaError)) {
      reportSharedAiExecutionFailure(e, tenantId);
    }
    throw e;
  }
}

function anthropicModelId(modelRef: string): string {
  const normalized = modelRef.trim();
  if (!normalized) throw new Error("LLM model is not configured");
  if (normalized.startsWith("anthropic/")) return normalized.slice("anthropic/".length);
  if (normalized.startsWith("claude-cli/")) return normalized.slice("claude-cli/".length);
  if (normalized.includes("/")) throw new Error("unsupported LLM provider");
  return normalized;
}

export async function generateTextWithUsage(input: {
  prompt: string;
  tenantId: string;
  model: string;
  timeoutMs: number;
  maxOutputTokens: number;
}): Promise<GeneratedTextResult> {
  assertPromptWithinCliLimit(input.prompt);
  const model = anthropicModelId(input.model);
  const apiKey = await getAnthropicKey(input.tenantId);
  if (apiKey) {
    const response = await fetch(ANTHROPIC_API, {
      method: "POST",
      headers: { "content-type": "application/json", "x-api-key": apiKey, "anthropic-version": "2023-06-01" },
      body: JSON.stringify({
        model,
        max_tokens: input.maxOutputTokens,
        messages: [{ role: "user", content: input.prompt }],
      }),
      signal: AbortSignal.timeout(input.timeoutMs),
    });
    if (!response.ok) throw new Error(`Anthropic API exited with status ${response.status}`);
    const data = await response.json() as {
      content?: { text?: string }[];
      usage?: {
        input_tokens?: unknown;
        cache_creation_input_tokens?: unknown;
        cache_read_input_tokens?: unknown;
        output_tokens?: unknown;
      };
    };
    const text = data.content?.find((entry) => typeof entry.text === "string")?.text?.trim() ?? "";
    if (!text) throw new Error("Anthropic API가 사용할 수 있는 결과를 반환하지 않았습니다");
    const inputTokens = finiteNonNegative(data.usage?.input_tokens);
    const cacheCreationInputTokens = finiteNonNegative(data.usage?.cache_creation_input_tokens);
    const cacheReadInputTokens = finiteNonNegative(data.usage?.cache_read_input_tokens);
    const outputTokens = finiteNonNegative(data.usage?.output_tokens);
    const result: GeneratedTextResult = {
      text,
      provider: "anthropic-api",
      model,
      usage: {
        inputTokens,
        cacheCreationInputTokens,
        cacheReadInputTokens,
        outputTokens,
        totalTokens: inputTokens + cacheCreationInputTokens + cacheReadInputTokens + outputTokens,
        totalCostUsd: null,
      },
    };
    await recordSharedGenerationEvent(input.tenantId, { ...result.usage, model, source: "byo-anthropic-api" });
    return result;
  }

  // 승인은 문이 아니라 한도다(sharedGenerationsIncluded 주석 참조).
  const approved = await isSharedAiApproved(input.tenantId);
  return runSerializedCli(async () => {
    const { period } = await reserveSharedGeneration(input.tenantId, approved);
    try {
      const result = await runClaudeCliWithUsage(input.prompt, model, input.timeoutMs);
      await recordSharedGenerationEvent(input.tenantId, { ...result.usage, model, source: "shared-claude-cli" });
      return result;
    } catch (error) {
      await releaseSharedGeneration(input.tenantId, period);
      reportSharedAiExecutionFailure(error, input.tenantId);
      throw error;
    }
  });
}
