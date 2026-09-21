import crypto from "node:crypto";
import { STUDIO_GENERATION_CONTRACT_VERSION } from "./contracts";
import { isStudioApiError, StudioApiError } from "./errors";

function apiKey(key: string): string {
  return key.replace(/[A-Z]/g, (letter) => `_${letter.toLowerCase()}`);
}

function apiShape(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(apiShape);
  if (value !== null && typeof value === "object") {
    return Object.fromEntries(
      Object.entries(value as Record<string, unknown>).map(([key, entry]) => [apiKey(key), apiShape(entry)]),
    );
  }
  return value;
}

export function studioSuccess(data: unknown, status = 200): Response {
  const requestId = crypto.randomUUID();
  return Response.json({
    data: apiShape(data),
    meta: {
      request_id: requestId,
      contract_version: STUDIO_GENERATION_CONTRACT_VERSION,
      served_at: new Date().toISOString(),
    },
  }, {
    status,
    headers: {
      "Cache-Control": "no-store",
      "X-Request-Id": requestId,
      "X-Contract-Version": STUDIO_GENERATION_CONTRACT_VERSION,
    },
  });
}

/**
 * 우리 앞의 프록시는 5xx 응답의 본문을 자기 HTML 오류 페이지로 갈아치운다.
 *
 * 이미 두 번 당했다. 2026-09-08 이미지 생성 경로에서 502 를 썼다가 진짜 이유(막힌 주제·
 * 잔액 부족)가 한 번도 사용자에게 닿지 못했고, 2026-09-09 영상 구조 초안에서는 생성기
 * 시간 초과로 우리가 정확히 504 와 "응답 시간이 초과되었습니다" 를 돌려줬는데 화면에는
 * 엉뚱하게 "연결이 먼저 끊겼습니다" 가 떴다. **우리가 쓴 이유가 지워진 것이다.**
 *
 * 5xx 는 "게이트웨이가 상류에서 잘못된 응답을 받았다" 는 뜻이라 프록시가 개입할 여지를
 * 준다. 그런데 우리가 하려는 말은 대개 "요청은 정상 처리했고 생성기 쪽 사정으로 못 만들었다"
 * 이다. 그 뜻에 맞게 200 으로 답하고 이유는 본문에 담는다. 화면은 어차피 본문의 error 를
 * 읽으므로 사용자가 보는 것은 달라지지 않는다. **달라지는 것은 이유가 지워지지 않는다는 것뿐이다.**
 *
 * 우리 잘못인 진짜 서버 오류(500)는 5xx 로 남긴다. 그것은 감시가 잡아야 한다.
 */
const PROXY_REWRITES = new Set([502, 503, 504]);

/** studioFailure 로그에 곁들일 요청 맥락. 자격증명·토큰 등 비밀값은 절대 넣지 않는다. */
export type StudioFailureContext = Record<string, string | number | boolean | undefined>;

/** 잦은 4xx(만료 토큰·요청 폭주)는 요청마다 warn 을 남기면 로그가 그 소음으로 덮인다.
 * 알려진 오남용 패턴은 debug 로 내려 기본 로그레벨에서는 안 보이게 한다(PR#75 리뷰 MINOR). */
const SAMPLED_CLIENT_STATUS = new Set([401, 429]);

/** 원인 문자열은 1KB 를 넘기지 않는다. postgres.js 오류는 message 에 SQL 파라미터가
 * 섞이지 않지만(안전 검증됨), 임의 non-Error 객체를 그대로 로그에 흘리면 통제가 어렵다. */
function safeString(value: unknown): string {
  if (value instanceof Error) return value.message.slice(0, 1024);
  if (typeof value === "string") return value.slice(0, 1024);
  try {
    return JSON.stringify(value)?.slice(0, 1024) ?? String(value).slice(0, 1024);
  } catch {
    return String(value).slice(0, 1024);
  }
}

/** error.cause(주로 mapGenerationDatabaseError 가 실어 보낸 postgres 원본)를 얕게 요약한다.
 * cause 자체를 통째로 로그에 펼치지 않고, 상관관계에 필요한 필드만 뽑는다. */
function causeSummary(error: unknown): Record<string, unknown> | undefined {
  const cause = error instanceof Error ? (error as Error & { cause?: unknown }).cause : undefined;
  if (cause === undefined) return undefined;
  if (cause instanceof Error) {
    const pg = cause as Error & { code?: string; constraint_name?: string };
    return {
      cause_name: cause.name,
      cause_message: safeString(cause.message),
      postgres_code: typeof pg.code === "string" ? pg.code : undefined,
      constraint: typeof pg.constraint_name === "string" ? pg.constraint_name : undefined,
    };
  }
  return { cause_message: safeString(cause) };
}

export function studioFailure(error: unknown, context?: StudioFailureContext): Response {
  const requestId = crypto.randomUUID();
  const known = isStudioApiError(error)
    ? error
    : new StudioApiError({
      status: 500,
      code: "INTERNAL_ERROR",
      message: "Studio 요청을 처리하지 못했습니다",
      retryable: false,
    });
  // ADR-007: 예외를 삼키지 않는다. 알 수 없는(대개 500) error 는 request_id 로 나중에 찾을
  // 수 있게 원인 전체를 남기고, 알려진 StudioApiError 는 5xx 만 error, 4xx 는 warn 한 줄.
  // context 를 먼저 펼치고 request_id 를 뒤에 둔다 — 호출자가 실수로 request_id 키를
  // context 에 넣어도 여기서 만든 진짜 request_id 가 항상 이긴다(PR#75 리뷰 MINOR).
  if (!isStudioApiError(error)) {
    console.error("[studio] 처리되지 않은 오류", {
      ...context,
      request_id: requestId,
      error_name: error instanceof Error ? error.name : typeof error,
      error_message: safeString(error instanceof Error ? error.message : error),
      error_stack: error instanceof Error ? error.stack : undefined,
      ...causeSummary(error),
    });
  } else if (known.status >= 500) {
    // M1(PR#75): postgres 원인은 mapGenerationDatabaseError 가 이 자리로 cause 에 실어
    // 보낸다. request_id 와 원인을 한 줄에 같이 찍어야 동시 요청에서도 상관관계가 선다.
    console.error("[studio] StudioApiError 5xx", {
      ...context,
      request_id: requestId,
      code: known.code,
      message: known.message,
      ...causeSummary(known),
    });
  } else if (!SAMPLED_CLIENT_STATUS.has(known.status)) {
    console.warn("[studio] StudioApiError", {
      ...context,
      request_id: requestId,
      status: known.status,
      code: known.code,
    });
  } else {
    console.debug("[studio] StudioApiError(샘플링됨)", {
      ...context,
      request_id: requestId,
      status: known.status,
      code: known.code,
    });
  }
  return Response.json({
    error: {
      code: known.code,
      message: known.message,
      retryable: known.retryable,
      field_errors: known.fieldErrors,
      details: apiShape(known.details),
    },
    meta: { request_id: requestId, contract_version: STUDIO_GENERATION_CONTRACT_VERSION },
  }, {
    status: PROXY_REWRITES.has(known.status) ? 200 : known.status,
    headers: {
      "Cache-Control": "no-store",
      "X-Request-Id": requestId,
      "X-Contract-Version": STUDIO_GENERATION_CONTRACT_VERSION,
      // 원래 뜻은 헤더로 남긴다. 로그와 감시는 이것을 본다.
      "X-Studio-Status": String(known.status),
    },
  });
}

export async function readJson(request: Request): Promise<unknown> {
  try {
    return await request.json();
  } catch {
    throw new StudioApiError({ status: 400, code: "INVALID_JSON_BODY", message: "올바른 JSON 본문이 필요합니다" });
  }
}
