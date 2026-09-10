// 서버 전용 관측/알림 헬퍼 — OSMU v1.0.0 모니터링.
//
// ⚠️ 고객 Slack 연동(send-notification.ts, integrations.kind='channel'/openclaw.json 플러그인 설정)과
// 완전히 분리된 "운영자 전용" 채널만 쓴다. 새 시크릿 OSMU_ALERT_SLACK_WEBHOOK_URL 하나만 참조하고,
// 고객이 등록한 webhookUrl/토큰은 이 파일 어디서도 읽지 않는다.
//
// 보안 재설계(2026-07-14 Codex 2nd-pass 반려 반영 — "blacklist 기반 임의 context"는 깨지기 쉽다):
// 블랙리스트로 금지 키/패턴을 걸러내는 대신, **닫힌 세계(closed-world) allowlist**로 뒤집었다.
//   - 이벤트명은 고정 4개(ALLOWED_EVENTS)만 통과. 그 외는 전부 "unknown_event"로 치환하고
//     context는 통째로 버린다(임의 이벤트명 자체가 인젝션 표면이 되지 않게).
//   - severity는 critical/error/warning 3개만. 그 외는 "error"로 강제.
//   - context는 이벤트별 고정 스키마(EVENT_SCHEMAS)에 선언된 키만 통과하고, 값도 고정 enum
//     (또는 100~599 정수 httpStatus) 안에서만 허용한다. 스키마에 없는 키, enum 밖 값은 전부
//     드롭되거나 "unknown"류 안정 코드로 치환된다 — **원본 문자열(플랫폼 API 에러 본문, 예외
//     메시지, 사용자 입력 platform/action 등)은 이 경계를 절대 통과하지 못한다.**
//   - 따라서 prompt, Authorization/Bearer, email, sk-ant-*/ghp_* 류 API 키, 임의 URL, 전화번호/주소,
//     유니코드 프롬프트 원문, 공격자가 조작한 이벤트명/reason 값 등은 애초에 "허용되지 않은 값"이라
//     스키마 검증에서 걸러진다(값 패턴 매칭에 의존하지 않는 구조적 방어).
//   - 호출부는 반드시 각 lib의 classify*/normalize* 헬퍼로 원본 에러/사용자 입력을 먼저 고정 코드로
//     변환한 뒤 context에 담아야 한다(설계 계약) — 단, 호출부가 실수로 원문을 그대로 넘겨도 아래
//     스키마 검증이 마지막 방어선으로 걸러낸다(defense-in-depth, 값 매칭에 기대지 않음).
//
// 계약(호출부가 지켜야 할 것):
//  - reportFailure()는 절대 throw하지 않는다(내부에서 전부 catch). 응답 경로를 지연시키지 않으려면
//    `void reportFailure(...)`로 fire-and-forget 한다.
//  - stderr 구조적 JSON 로그(console.error)는 네트워크와 무관하게 항상 동기적으로 남는다.
//  - Slack 발송은 best-effort: OSMU_ALERT_SLACK_WEBHOOK_URL 미설정이면 조용히 skip, 설정돼도
//    타임아웃(SLACK_TIMEOUT_MS) 내에 끝나고, non-2xx 응답도 실패로 취급하되 응답 본문/상태/URL을
//    로그하지 않는다(best-effort 실패는 원 API 응답에 어떤 영향도 주지 않는다).

const SLACK_TIMEOUT_MS = 4000;
const SLACK_TEXT_MAX = 3000;

export type Severity = "critical" | "error" | "warning";
const ALLOWED_SEVERITIES: readonly Severity[] = ["critical", "error", "warning"];

// ── 고정 이벤트명 (닫힌 세계) ────────────────────────────────────────────────
import {
  recoverOperationalIncidents,
  recordOperationalIncident,
  type IncidentCategory,
  type IncidentIntervention,
  type IncidentReason,
  type IncidentSource,
} from "@/lib/observability/incidents";

const ALLOWED_EVENTS = [
  "auth_service_unavailable",
  "shared_ai_generation_execution_failed",
  "studio_generation_failed",
  "publish_failed",
  "token_expired",
  "external_service_error",
  "operator_mutation_failed",
] as const;
type AllowedEvent = (typeof ALLOWED_EVENTS)[number];
const UNKNOWN_EVENT = "unknown_event";

// ── 이벤트별 고정 reason/코드 enum ──────────────────────────────────────────
export const AUTH_REASONS = [
  "osmu_token_db_unreachable",
  "tenant_status_db_unreachable",
  "tenant_access_record_failed",
  "supabase_jwt_verify_unreachable",
] as const;
export const AI_FAILURE_REASONS = ["timeout", "provider_unavailable", "output_limit", "spawn_failed", "exit_nonzero", "stdin_failed", "unknown"] as const;
export const PUBLISH_FAILURE_REASONS = ["http_error", "network_error", "unsupported_platform", "auth_invalid", "decrypt_failed", "unknown"] as const;
export const OPERATOR_ACTIONS = [
  "pause_user",
  "resume_user",
  "approve_shared_ai",
  "revoke_shared_ai",
  "unknown",
] as const;
export const PUBLISH_PLATFORMS = [
  "threads",
  "instagram",
  "x",
  "facebook",
  "bluesky",
  "telegram",
  "discord",
  "slack",
  "youtube",
  "linkedin",
  "pinterest",
  "tumblr",
  "tiktok",
  "line",
  "naver_blog",
  "unknown_platform",
] as const;
export const TOKEN_REASONS = ["token_expired", "token_revoked"] as const;
export const EXTERNAL_SERVICE_REASONS = ["provider_unreachable", "network_error", "http_429", "http_5xx"] as const;

type FieldSchema = { kind: "enum"; values: readonly string[] } | { kind: "httpStatus" };
type EventSchema = Record<string, FieldSchema>;

const EVENT_SCHEMAS: Record<AllowedEvent, EventSchema> = {
  auth_service_unavailable: { reason: { kind: "enum", values: AUTH_REASONS } },
  shared_ai_generation_execution_failed: { reason: { kind: "enum", values: AI_FAILURE_REASONS } },
  studio_generation_failed: { reason: { kind: "enum", values: AI_FAILURE_REASONS } },
  publish_failed: {
    platform: { kind: "enum", values: PUBLISH_PLATFORMS },
    reason: { kind: "enum", values: PUBLISH_FAILURE_REASONS },
    httpStatus: { kind: "httpStatus" },
  },
  token_expired: {
    provider: { kind: "enum", values: PUBLISH_PLATFORMS },
    reason: { kind: "enum", values: TOKEN_REASONS },
  },
  external_service_error: {
    provider: { kind: "enum", values: PUBLISH_PLATFORMS },
    reason: { kind: "enum", values: EXTERNAL_SERVICE_REASONS },
    httpStatus: { kind: "httpStatus" },
  },
  operator_mutation_failed: { action: { kind: "enum", values: OPERATOR_ACTIONS } },
};

export type FailureContext = Record<string, unknown>;

export interface FailureEvent {
  event: string;
  severity: Severity;
  workspaceId?: string;
  resourceKey?: string;
  context?: FailureContext;
}

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

function isAllowedEvent(event: string): event is AllowedEvent {
  return (ALLOWED_EVENTS as readonly string[]).includes(event);
}

// 스키마에 선언된 키만, 선언된 enum/httpStatus 형태로만 통과시킨다. 스키마 밖 키는 완전히 버려진다
// (호출부가 임의 키를 추가로 넘겨도 여기서 사라짐 — 원본 예외 메시지·플랫폼 응답 본문 등의
// "우발적 유입" 경로 자체를 차단).
function sanitizeContext(event: AllowedEvent, context?: FailureContext): Record<string, string | number> {
  const schema = EVENT_SCHEMAS[event];
  const out: Record<string, string | number> = {};
  if (!context) return out;
  for (const [key, field] of Object.entries(schema)) {
    const raw = context[key];
    if (field.kind === "enum") {
      if (typeof raw === "string" && (field.values as readonly string[]).includes(raw)) {
        out[key] = raw;
      }
      // enum 밖 값은 드롭(호출부가 이미 classify*/normalize* 헬퍼를 거쳤다면 항상 유효값이어야
      // 정상이므로, 여기서 드롭된다는 건 호출부 회귀 신호 — 그래도 안전하게 조용히 드롭한다).
    } else if (field.kind === "httpStatus") {
      if (typeof raw === "number" && Number.isInteger(raw) && raw >= 100 && raw <= 599) {
        out[key] = raw;
      }
    }
  }
  return out;
}

interface AlertPayload {
  ts: string;
  kind: "osmu_alert";
  event: string;
  severity: Severity;
  workspaceId?: string;
  resourceKey?: string;
  context: Record<string, string | number>;
}

function buildPayload(input: FailureEvent): AlertPayload {
  const severity = ALLOWED_SEVERITIES.includes(input.severity) ? input.severity : "error";
  if (!isAllowedEvent(input.event)) {
    // 이벤트명 자체가 닫힌 세계 밖이면 원본 이벤트명도 로그하지 않는다(임의 문자열이 event 필드로
    // 그대로 새는 것 자체가 표면) — context도 통째로 버린다.
    return { ts: new Date().toISOString(), kind: "osmu_alert", event: UNKNOWN_EVENT, severity, context: {} };
  }
  return {
    ts: new Date().toISOString(),
    kind: "osmu_alert",
    event: input.event,
    severity,
    workspaceId: typeof input.workspaceId === "string" && UUID_RE.test(input.workspaceId) ? input.workspaceId : undefined,
    resourceKey: typeof input.resourceKey === "string" && /^account:(?:default|[0-9a-f-]{36})$/i.test(input.resourceKey)
      ? input.resourceKey
      : undefined,
    context: sanitizeContext(input.event, input.context),
  };
}

function formatSlackText(payload: AlertPayload): string {
  const lines = [
    ...(payload.workspaceId ? [`• workspace: ${payload.workspaceId}`] : []),
    ...Object.entries(payload.context).map(([k, v]) => `• ${k}: ${String(v)}`),
  ];
  const text = [`:rotating_light: *${payload.severity.toUpperCase()}* \`${payload.event}\``, ...lines].join("\n");
  return text.slice(0, SLACK_TEXT_MAX);
}

interface IncidentMapping {
  category: IncidentCategory;
  source: IncidentSource;
  reasonCode: IncidentReason;
  intervention: IncidentIntervention;
}

function mapIncident(payload: AlertPayload): IncidentMapping | null {
  const source = (payload.context.platform || payload.context.provider || "studio") as IncidentSource;
  const reason = payload.context.reason;

  if (payload.event === "publish_failed") {
    if (reason === "unsupported_platform") return null;
    const status = typeof payload.context.httpStatus === "number" ? payload.context.httpStatus : undefined;
    const reasonCode: IncidentReason = status === 429
      ? "http_429"
      : status && status >= 500
        ? "http_5xx"
        : reason === "network_error"
          ? "network_error"
          : status && status >= 400
            ? "http_4xx"
            : "unknown";
    const intervention: IncidentIntervention = reasonCode === "http_429" || reasonCode === "http_5xx" || reasonCode === "network_error"
      ? "automatic"
      : "human";
    return { category: "publish_failed", source, reasonCode, intervention };
  }

  if (payload.event === "token_expired") {
    return {
      category: "token_expired",
      source,
      reasonCode: reason === "token_revoked" ? "token_revoked" : "token_expired",
      intervention: "human",
    };
  }

  if (payload.event === "external_service_error") {
    const reasonCode = EXTERNAL_SERVICE_REASONS.includes(reason as never) ? reason as IncidentReason : "provider_unreachable";
    return { category: "external_service_error", source, reasonCode, intervention: "automatic" };
  }

  if (payload.event === "studio_generation_failed" || payload.event === "shared_ai_generation_execution_failed") {
    const reasonCode = AI_FAILURE_REASONS.includes(reason as never) ? reason as IncidentReason : "unknown";
    return {
      category: "generation_failed",
      source: payload.event === "shared_ai_generation_execution_failed" ? "shared_ai" : "studio",
      reasonCode,
      intervention: reasonCode === "timeout" || reasonCode === "provider_unavailable" ? "automatic" : "human",
    };
  }

  return null;
}

// best-effort Slack 발송 — 절대 throw하지 않는다. non-2xx 응답도 실패로 취급하되(fetch는 HTTP
// 에러 상태에서 reject하지 않으므로 res.ok를 직접 검사) 응답 상태/본문/webhook URL을 로그하지 않는다.
async function deliverToSlack(payload: AlertPayload): Promise<void> {
  const url = process.env.OSMU_ALERT_SLACK_WEBHOOK_URL;
  if (!url) return; // 미설정 = 조용히 skip(스펙 요구사항: webhook 없어도 정상 동작)
  try {
    const res = await fetch(url, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ text: formatSlackText(payload) }),
      signal: AbortSignal.timeout(SLACK_TIMEOUT_MS),
    });
    if (!res.ok) throw new Error("slack_non_2xx");
  } catch {
    console.error(JSON.stringify({ ts: new Date().toISOString(), kind: "osmu_alert_delivery_failed", event: payload.event }));
  }
}

// 유일한 공개 API. 호출부는 `void reportFailure({...})`로 fire-and-forget 호출해 응답 경로를
// 절대 지연/변경하지 않는다. 반환 promise는 절대 reject하지 않는다.
export async function reportFailure(input: FailureEvent): Promise<void> {
  try {
    const payload = buildPayload(input);
    console.error(JSON.stringify(payload));
    if (payload.workspaceId) {
      const incident = mapIncident(payload);
      if (!incident) return;
      await recordOperationalIncident({
        workspaceId: payload.workspaceId,
        severity: payload.severity,
        resourceKey: payload.resourceKey,
        ...incident,
      });
      if (incident.intervention === "automatic") return;
    }
    await deliverToSlack(payload);
  } catch {
    // buildPayload/console.error가 예기치 않게 던져도 절대 전파하지 않는다.
  }
}

export async function reportRecovery(input: {
  workspaceId: string;
  category: IncidentCategory;
  source: IncidentSource;
  resourceKey?: string;
}): Promise<void> {
  await recoverOperationalIncidents(input.workspaceId, input);
}

// ── 호출부 공용 정규화 헬퍼 (원본 문자열 → 고정 코드) ───────────────────────
// 이 함수들을 거치지 않고 원본 에러 메시지/사용자 입력을 context에 직접 넣으면 안 된다는 게
// 설계 계약이다 — 위 sanitizeContext가 그래도 마지막 방어선으로 걸러낸다(defense-in-depth).

const KNOWN_PUBLISH_PLATFORMS = new Set<string>(PUBLISH_PLATFORMS.filter((p) => p !== "unknown_platform"));

// 요청 바디에서 그대로 온 platform(공격자 통제 가능한 임의 문자열)을 고정 enum으로 정규화.
export function normalizePlatform(platform: unknown): string {
  return typeof platform === "string" && KNOWN_PUBLISH_PLATFORMS.has(platform) ? platform : "unknown_platform";
}

// publish.ts가 돌려주는 사람이 읽는 에러 문자열(플랫폼 API 응답 본문 최대 200자 포함 가능 — 임의
// 외부 텍스트)을 절대 그대로 넘기지 않고, 안정된 reason 코드 + (있으면) HTTP status 숫자만 추출한다.
export function classifyPublishFailure(error: unknown): { reason: string; httpStatus?: number } {
  const msg = typeof error === "string" ? error : "";
  if (/미지원/.test(msg)) return { reason: "unsupported_platform" };
  const m = msg.match(/\((\d{3})\)/);
  if (m) {
    const code = Number(m[1]);
    if (Number.isInteger(code) && code >= 100 && code <= 599) return { reason: "http_error", httpStatus: code };
  }
  if (/fetch failed|ENOTFOUND|network|econnrefused|econnreset|aborted/i.test(msg)) return { reason: "network_error" };
  // 토큰이 무효/폐기된 경우가 실패의 대부분인데 이전 버전은 전부 "unknown"으로 뭉갰다.
  // 그러면 운영 로그만 보고는 "재연결하면 되는 문제"인지조차 알 수 없다(2026-08-30).
  if (/access token|oauth|token_invalid|token has expired|재연결|세션이 만료|권한/i.test(msg)) return { reason: "auth_invalid" };
  if (/복호화|decrypt|OSMU_SECRET_KEY/i.test(msg)) return { reason: "decrypt_failed" };
  return { reason: "unknown" };
}

// 공유 claude -p 실행 실패 예외(e.message)를 안정된 reason 코드로 분류. runClaudeCli 계약상
// e.message엔 prompt/child stderr 원문이 절대 실리지 않지만, 그래도 원문을 context에 넣지 않고
// 고정 코드로만 변환한다(이중 방어 — 메시지 포맷이 바뀌어도 유출 표면이 늘지 않는다).
export function classifySharedAiFailure(e: unknown): string {
  const msg = e instanceof Error ? e.message : String(e);
  if (/timeout/i.test(msg)) return "timeout";
  if (/exceeded \d+ bytes/i.test(msg)) return "output_limit";
  if (/spawn 실패|ENOENT/i.test(msg)) return "spawn_failed";
  if (/exited with code/i.test(msg)) return "exit_nonzero";
  if (/stdin/i.test(msg)) return "stdin_failed";
  return "unknown";
}

const KNOWN_OPERATOR_ACTIONS = new Set<string>(OPERATOR_ACTIONS.filter((a) => a !== "unknown"));

// 요청 바디 action(공격자 통제 가능한 임의 문자열)을 고정 enum으로 정규화.
export function normalizeOperatorAction(action: unknown): string {
  return typeof action === "string" && KNOWN_OPERATOR_ACTIONS.has(action) ? action : "unknown";
}
