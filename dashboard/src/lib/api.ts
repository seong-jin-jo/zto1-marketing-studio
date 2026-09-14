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
    stage: "publication_record" | "queue_record";
    publicationRecorded: boolean;
    queueRecorded: false;
    error: {
      code: "PUBLICATION_RECORD_FAILED" | "QUEUE_RECORD_FAILED";
      message: string;
    };
    reconciliation: {
      required: true;
      action: "repair_persistence_only";
      retryPublish: false;
      draftId: string | null;
      platform: string;
      accountId: string | null;
      externalId: string | null;
      permalink: string | null;
    };
  };
}

export function isExternalPublishPersistenceError(
  error: unknown,
): error is ApiResponseError<ExternalPublishPersistenceFailure> {
  if (!(error instanceof ApiResponseError)) return false;
  const payload = error.payload as Partial<ExternalPublishPersistenceFailure> | null;
  return payload?.externalPublished === true
    && payload?.persistence?.reconciliation?.retryPublish === false;
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
