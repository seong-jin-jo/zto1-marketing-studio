import crypto from "node:crypto";
import { ensureTenantForUser, getTenantStatus, resolveTenantToken } from "@/lib/tenant-auth";
import { verifySupabaseJwt } from "@/lib/supabase";
import { StudioApiError } from "./errors";

export type StudioPrincipal = {
  memberId: string;
  allowedWorkspaceIds: ReadonlySet<string>;
};

function safeEqual(left: string, right: string): boolean {
  const a = Buffer.from(left);
  const b = Buffer.from(right);
  return a.length === b.length && crypto.timingSafeEqual(a, b);
}

function isPlausibleCustomerJwt(value: string): boolean {
  const segments = value.split(".");
  return segments.length === 3 && segments.every(Boolean);
}

export function resolveDevelopmentPrincipal(request: Request): StudioPrincipal {
  // 개발용 우회가 운영에 켜진 채로 나가면 그 자체가 사고다. 운영에서는 설정이
  // 어떻게 되어 있든 이 경로를 쓰지 않는다(배포 준비 점검, 2026-08-28).
  if (process.env.NODE_ENV === "production") {
    throw new StudioApiError({
      status: 503,
      code: "IDENTITY_ADAPTER_NOT_CONFIGURED",
      message: "Studio 회원 인증 어댑터가 아직 연결되지 않았습니다",
      retryable: true,
    });
  }
  if (process.env.STUDIO_IDENTITY_MODE !== "development") {
    throw new StudioApiError({
      status: 503,
      code: "IDENTITY_ADAPTER_NOT_CONFIGURED",
      message: "Studio 회원 인증 어댑터가 아직 연결되지 않았습니다",
      retryable: true,
    });
  }
  const expectedToken = process.env.STUDIO_DEV_BEARER_TOKEN ?? "";
  const memberId = process.env.STUDIO_DEV_MEMBER_ID ?? "";
  const allowedWorkspaceIds = new Set(
    (process.env.STUDIO_DEV_WORKSPACE_IDS ?? "").split(",").map((value) => value.trim()).filter(Boolean),
  );
  if (!expectedToken || !memberId || allowedWorkspaceIds.size === 0) {
    throw new StudioApiError({
      status: 503,
      code: "IDENTITY_ADAPTER_NOT_CONFIGURED",
      message: "Studio 개발 인증 설정이 완결되지 않았습니다",
      retryable: true,
    });
  }
  const raw = request.headers.get("Authorization")?.replace(/^Bearer\s+/i, "") ?? "";
  if (!raw || !safeEqual(raw, expectedToken)) {
    throw new StudioApiError({ status: 401, code: "TOKEN_INVALID", message: "Studio 인증에 실패했습니다" });
  }
  return { memberId, allowedWorkspaceIds };
}

async function resolveCustomerPrincipal(request: Request): Promise<StudioPrincipal> {
  const raw = request.headers.get("Authorization")?.replace(/^Bearer\s+/i, "") ?? "";
  if (!raw) {
    throw new StudioApiError({ status: 401, code: "TOKEN_INVALID", message: "Studio 인증이 필요합니다" });
  }

  const verified = await verifySupabaseJwt(raw);
  if (verified.status === "unavailable") {
    throw new StudioApiError({
      status: 503,
      code: "IDENTITY_ADAPTER_UNAVAILABLE",
      message: "Studio 회원 인증을 확인하지 못했습니다",
      retryable: true,
    });
  }
  if (verified.status === "invalid") {
    throw new StudioApiError({ status: 401, code: "TOKEN_INVALID", message: "Studio 인증에 실패했습니다" });
  }

  let workspaceId: string;
  let status: string | null;
  try {
    workspaceId = await ensureTenantForUser(verified.user.id, verified.user.email ?? null);
    status = await getTenantStatus(workspaceId);
  } catch {
    throw new StudioApiError({
      status: 503,
      code: "IDENTITY_ADAPTER_UNAVAILABLE",
      message: "Studio 작업 공간을 확인하지 못했습니다",
      retryable: true,
    });
  }
  if (status !== "active") {
    throw new StudioApiError({
      status: 403,
      code: status === "paused" ? "ACCOUNT_PAUSED" : "ACCOUNT_UNAVAILABLE",
      message: status === "paused" ? "계정 이용이 중지되었습니다" : "작업 공간을 사용할 수 없습니다",
    });
  }

  return { memberId: verified.user.id, allowedWorkspaceIds: new Set([workspaceId]) };
}

async function resolveTenantTokenPrincipal(raw: string): Promise<StudioPrincipal> {
  let workspaceId: string | null;
  let status: string | null;
  try {
    workspaceId = await resolveTenantToken(raw);
    status = workspaceId ? await getTenantStatus(workspaceId) : null;
  } catch {
    throw new StudioApiError({
      status: 503,
      code: "IDENTITY_ADAPTER_UNAVAILABLE",
      message: "Studio 작업 공간을 확인하지 못했습니다",
      retryable: true,
    });
  }
  if (!workspaceId) {
    throw new StudioApiError({ status: 401, code: "TOKEN_INVALID", message: "Studio 인증에 실패했습니다" });
  }
  if (status !== "active") {
    throw new StudioApiError({
      status: 403,
      code: status === "paused" ? "ACCOUNT_PAUSED" : "ACCOUNT_UNAVAILABLE",
      message: status === "paused" ? "계정 이용이 중지되었습니다" : "작업 공간을 사용할 수 없습니다",
    });
  }
  // API 토큰은 회원 JWT가 아니므로 작업 공간 자체를 안정적인 실행 주체로 쓴다.
  // 토큰 원문은 DB 레코드와 로그에 남기지 않으며, 같은 작업 공간의 토큰을 교체해도
  // 멱등성·조회 경계가 끊기지 않는다.
  return { memberId: `tenant-token:${workspaceId}`, allowedWorkspaceIds: new Set([workspaceId]) };
}

export async function resolveStudioPrincipal(request: Request): Promise<StudioPrincipal> {
  const raw = request.headers.get("Authorization")?.replace(/^Bearer\s+/i, "") ?? "";
  if (raw.startsWith("osmu_")) return resolveTenantTokenPrincipal(raw);
  if (process.env.NODE_ENV !== "production" && process.env.STUDIO_IDENTITY_MODE === "development") {
    const developmentToken = process.env.STUDIO_DEV_BEARER_TOKEN ?? "";
    if (raw && developmentToken && safeEqual(raw, developmentToken)) {
      return resolveDevelopmentPrincipal(request);
    }
    if (!isPlausibleCustomerJwt(raw)) {
      return resolveDevelopmentPrincipal(request);
    }
  }
  return resolveCustomerPrincipal(request);
}

export function assertWorkspaceAccess(principal: StudioPrincipal, workspaceId: string): void {
  if (!principal.allowedWorkspaceIds.has(workspaceId)) {
    throw new StudioApiError({ status: 404, code: "RESOURCE_NOT_FOUND", message: "작업 공간을 찾을 수 없습니다" });
  }
}
