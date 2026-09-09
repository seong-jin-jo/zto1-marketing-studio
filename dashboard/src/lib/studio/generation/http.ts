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

export function studioFailure(error: unknown): Response {
  const requestId = crypto.randomUUID();
  const known = isStudioApiError(error)
    ? error
    : new StudioApiError({
      status: 500,
      code: "INTERNAL_ERROR",
      message: "Studio 요청을 처리하지 못했습니다",
      retryable: false,
    });
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
