"use client";

import {
  clearAuthToken,
  getAuthIdentityKind,
  getAuthToken,
  isCustomerAuthToken,
} from "./auth";

export class AuthRequiredError extends Error {
  constructor() {
    super("로그인이 필요합니다");
    this.name = "AuthRequiredError";
  }
}

export const AUTH_CACHE_INVALIDATION_EVENT = "auth:cache-invalidate";

export class ApiResponseError<T = unknown> extends Error {
  readonly status: number;
  readonly payload: T;

  constructor(status: number, payload: T, message: string) {
    super(message);
    this.name = "ApiResponseError";
    this.status = status;
    this.payload = payload;
  }
}

export interface ExternalPublishPersistenceFailure {
  ok: false;
  externalPublished: true;
  externalId?: string;
  permalink?: string;
  error: string;
  persistence: {
    ok: false;
    stage: "publication_record" | "queue_record" | "usage_record";
    publicationRecorded: boolean;
    queueRecorded: boolean;
    error: {
      code: "PUBLICATION_RECORD_FAILED" | "QUEUE_RECORD_FAILED" | "USAGE_RECORD_PENDING";
      message: string;
    };
    reconciliation: {
      required: true;
      action: "repair_persistence_only";
      retryPublish: false;
      draftId?: string | null;
      publicationId?: string | null;
      stage?: "publication_record" | "queue_record" | "usage_record";
      platform: string;
      accountId?: string | null;
      externalId: string | null;
      permalink: string | null;
    };
  };
}

// BLOCK-1(2026-10-02 독립 리뷰): 동기(즉시 응답) 경로는 이 신호를 ApiResponseError로
// 던져 isExternalPublishPersistenceError가 잡는다. 비동기 느린 경로(202 접수 뒤 job
// 폴링)는 같은 신호가 "던져진 에러"가 아니라 "폴링이 받아온 몸통(JSON)"으로 온다 —
// videoPersistenceFailure({externalPublished:true, retryPublish:false}), TikTok 503
// "식별자 저장 실패"(서버가 code: PUBLISH_STATE_UNCERTAIN을 얹도록 함께 고침),
// /api/publish·video/publish reels 좀비회수의 409 PUBLISH_STATE_UNCERTAIN이 전부 이
// 형태다. 폴링 쪽이 이 몸통을 `if (!data?.ok) 실패`로만 읽으면, 외부에는 이미 올라갔는데
// (혹은 올라갔는지 모르는데) "실패"로 보여주고 재발행을 허용해 중복 게시로 이어진다.
// 던져진 에러인지 받아온 몸통인지 상관없이 같은 기준으로 판정하도록 분리한다.
export function isUnresolvedPublishPayload(payload: unknown): boolean {
  if (!payload || typeof payload !== "object") return false;
  const p = payload as {
    externalPublished?: unknown;
    persistence?: { reconciliation?: { retryPublish?: unknown } };
    code?: unknown;
    reconciliation?: { retryPublish?: unknown };
  };
  // ① videoPersistenceFailure류: 외부 게시는 확인됐는데 우리 기록만 못 남겼다.
  if (p.externalPublished === true && p.persistence?.reconciliation?.retryPublish === false) return true;
  // ② uncertain 분기(409 PUBLISH_STATE_UNCERTAIN) — "외부 결과를 모른다".
  if (p.code === "PUBLISH_STATE_UNCERTAIN") return true;
  // ③ 그 외 reconciliation.retryPublish===false로 명시한 모든 응답(향후 확장 대비).
  if (p.reconciliation?.retryPublish === false) return true;
  return false;
}

export function isExternalPublishPersistenceError(
  error: unknown,
): error is ApiResponseError<ExternalPublishPersistenceFailure> {
  if (!(error instanceof ApiResponseError)) return false;
  return isUnresolvedPublishPayload(error.payload);
}

export function isAuthRequiredError(error: unknown): boolean {
  return error instanceof Error && error.name === "AuthRequiredError";
}

function requestAuth(): { token: string; headers: Record<string, string> } {
  const token = getAuthToken();
  return {
    token,
    headers: token ? { Authorization: `Bearer ${token}` } : {},
  };
}

function invalidateAuthCache(): void {
  window.dispatchEvent(new CustomEvent(AUTH_CACHE_INVALIDATION_EVENT));
}

export function handleUnauthorizedResponse(requestToken: string, clearToken: boolean): void {
  // A response belongs to the credential snapshot used when its request started.
  // If login refreshed/replaced that credential meanwhile, the old 401 must not
  // invalidate the newer identity or open the global login modal.
  if (getAuthToken() !== requestToken) return;
  const isCustomerCredential = getAuthIdentityKind() === "customer"
    || isCustomerAuthToken(requestToken)
    || !window.location.pathname.startsWith("/operator");
  if (isCustomerCredential) {
    // Customer auth is Google/Supabase-only. A rejected JWT must never fall back to
    // the legacy manual Auth Token modal; AuthGate signs out the stale Supabase
    // session and routes to /login. Keep the token until that handler can identify
    // the session type and sign out its refresh session.
    window.dispatchEvent(new CustomEvent("auth:customer-reauth-required"));
    return;
  }
  if (clearToken) clearAuthToken();
  window.dispatchEvent(new CustomEvent("auth:required"));
}

/** SWR fetcher */
export async function fetcher<T>(url: string): Promise<T> {
  const auth = requestAuth();
  const res = await fetch(url, { headers: auth.headers });
  if (res.status === 401) {
    invalidateAuthCache();
    handleUnauthorizedResponse(auth.token, true);
    throw new AuthRequiredError();
  }
  if (!res.ok) throw new Error(`API error: ${res.status}`);
  return res.json();
}

/** POST helper for mutations */
/**
 * 2026-09-06 회장 스모크: 생성이 시작되면 끝날 때까지 취소할 방법이 없었다.
 * 잘못 눌렀거나 다른 것을 하고 싶어도 기다리는 수밖에 없다. 호출부가 중단 신호를
 * 넘길 수 있게 열어 둔다. 안 넘기면 종전과 똑같이 동작한다.
 */
export async function apiPost<T = unknown>(url: string, body?: unknown, options?: { signal?: AbortSignal }): Promise<T | null> {
  try {
    const auth = requestAuth();
    const res = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json", ...auth.headers },
      body: body ? JSON.stringify(body) : undefined,
      signal: options?.signal,
    });
    if (res.status === 401) {
      invalidateAuthCache();
      handleUnauthorizedResponse(auth.token, false);
      throw new AuthRequiredError();
    }
    if (!res.ok) {
      const d = await res.json().catch(() => ({})) as { error?: string };
      throw new ApiResponseError(res.status, d, d.error || `Request failed: ${res.status}`);
    }
    return res.json();
  } catch (e) {
    throw e;
  }
}

/** DELETE helper */
export async function apiDelete<T = unknown>(url: string): Promise<T | null> {
  const auth = requestAuth();
  const res = await fetch(url, {
    method: "DELETE",
    headers: auth.headers,
  });
  if (res.status === 401) {
    invalidateAuthCache();
    handleUnauthorizedResponse(auth.token, false);
    throw new AuthRequiredError();
  }
  if (!res.ok) throw new Error(`Delete failed: ${res.status}`);
  return res.json();
}
