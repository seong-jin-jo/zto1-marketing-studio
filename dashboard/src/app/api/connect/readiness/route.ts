import { effectiveTenantId } from "@/lib/tenant-auth";
import { PROVIDERS, FACEBOOK } from "@/lib/social-connect";
import { resolveOAuthCredentialSets } from "@/lib/oauth-app-credentials";
import { auditConnectTenantQueryMismatch } from "@/lib/connect-tenant-audit";
import { getChannelConnectionStates } from "@/lib/channel-connection";
import { CH_LABELS } from "@/lib/constants";
import {
  getMetaPreReviewGuidance,
  resolveConnectReadiness,
  type ConnectReadinessEntry,
} from "@/lib/connect-readiness";

const CREDENTIAL_STORE_UNAVAILABLE_REASON =
  "OAuth 자격증명 저장소에 일시적으로 연결할 수 없습니다. 관리자 복구 후 다시 시도해주세요.";

const META_REVIEW_PROVIDERS = new Set(["threads", "instagram", "facebook"]);

function isExternalReviewPending(provider: string, review: "required" | "unknown" | undefined): boolean {
  if (review !== "required") return false;
  const approvedProviders = new Set(
    String(process.env.OAUTH_APP_REVIEW_APPROVED_PROVIDERS || "")
      .split(",")
      .map((value) => value.trim().toLowerCase())
      .filter(Boolean),
  );
  return !approvedProviders.has(provider.toLowerCase());
}

function externalReviewReason(
  provider: string,
  label: string,
  connectionState: "connected" | "reconnect" | "disconnected",
): string {
  if (META_REVIEW_PROVIDERS.has(provider)) {
    return connectionState === "connected"
      ? `${label} 채널은 아직 앱 심사 전입니다. 현재 연결된 테스터 계정은 사용할 수 있지만 외부 고객 계정은 연결할 수 없습니다. 심사 승인 후에는 테스터 등록 없이 OAuth로 연결됩니다.`
      : `${label} 채널은 아직 앱 심사 전입니다. Meta 앱에서 테스터로 등록하고 초대를 수락한 계정만 연결할 수 있습니다. 심사 승인 후에는 테스터 등록 없이 OAuth로 연결됩니다.`;
  }
  return connectionState === "connected"
    ? `${label} 계정은 연결됐지만 외부 앱 심사가 완료되기 전에는 실제 발행이 제한됩니다.`
    : `${label} 외부 앱 심사가 완료되면 연결할 수 있습니다.`;
}

// GET /api/connect/readiness?tenant_id=... — 고객 UI가 "연결" 버튼을 그리기 전에 먼저 물어보는
// 서버 준비상태 계약(SNS-001/SNS-003/SNS-004). 서버 credential(OAuth 앱 ID/Secret)이 없는
// provider를 클릭 가능한 버튼으로 보여주면 고객이 누른 뒤에야 500/raw JSON을 보게 된다 —
// 그 전에 disabled + 조치 가능한 한국어 사유를 내려준다. 비밀값 자체는 절대 반환하지 않고
// env 존재 여부(boolean)만 판정한다.
//
// 이 라우트는 인증 컨텍스트(effectiveTenantId)를 거친다 — 로그인 세션/토큰 없이 tenant_id
// 쿼리만으로는 운영자 fallback 경로로만 동작(다른 라우트와 동일 패턴).
export async function GET(request: Request) {
  const requestedTenantId = new URL(request.url).searchParams.get("tenant_id");
  const tenantId = await effectiveTenantId(request, requestedTenantId);
  if (!tenantId) return Response.json({ error: "tenant_id required" }, { status: 400 });
  auditConnectTenantQueryMismatch(request, tenantId, requestedTenantId);

  const providers = [
    ...Object.keys(PROVIDERS),
    "facebook",
  ];
  const result: Record<string, ConnectReadinessEntry> = {};
  const credentialsByProvider = await resolveOAuthCredentialSets(providers);
  let connectionLookupError = false;
  let connectionStates: Record<string, "connected" | "reconnect" | "disconnected"> = {};
  try {
    connectionStates = await getChannelConnectionStates(tenantId, providers);
  } catch {
    connectionLookupError = true;
  }

  for (const [name, cfg] of Object.entries(PROVIDERS)) {
    const credentials = credentialsByProvider[name];
    const credentialStoreError = credentials?.reason === "credential_store_unavailable";
    const externalReviewPending = isExternalReviewPending(name, credentials?.externalReview);
    const connectionState = connectionStates[name] || "disconnected";
    const reason = credentialStoreError
      ? CREDENTIAL_STORE_UNAVAILABLE_REASON
      : connectionLookupError
      ? "연결 계정 상태를 확인할 수 없습니다. 잠시 후 다시 시도해주세요."
      // 자격증명이 없으면 심사 여부보다 그 사실을 먼저 알린다. 자격증명 미설정 상태에서
      // "심사가 끝나면 연결할 수 있습니다"라고 안내하면 고객이 기다리기만 하게 된다.
      : !credentials?.complete
      ? `서버에 ${name} OAuth 앱 자격증명(${cfg.appIdEnv}/${cfg.appSecretEnv})이 아직 설정되지 않았습니다.`
      : externalReviewPending
      ? externalReviewReason(name, CH_LABELS[name] || cfg.label, connectionState)
      : connectionState === "reconnect"
      ? `${CH_LABELS[name] || cfg.label} 계정을 다시 연결해주세요.`
      : undefined;
    const readiness = resolveConnectReadiness({
      credentialsComplete: Boolean(credentials?.complete),
      credentialStoreError,
      connectionState,
      connectionLookupError,
      externalReviewPending,
      reason,
    });
    const guidance = externalReviewPending && readiness.available
      ? getMetaPreReviewGuidance(name)
      : undefined;
    result[name] = guidance ? { ...readiness, guidance } : readiness;
  }

  // Facebook은 config_id 모델(비즈니스용 로그인) — FB_APP_ID/SECRET 외에 FB_CONFIG_ID도 필요.
  const facebook = credentialsByProvider.facebook;
  if (facebook?.reason === "credential_store_unavailable") {
    result.facebook = resolveConnectReadiness({
      credentialsComplete: false,
      credentialStoreError: true,
      connectionState: connectionStates.facebook || "disconnected",
      connectionLookupError,
      reason: CREDENTIAL_STORE_UNAVAILABLE_REASON,
    });
  } else if (!facebook?.complete) {
    result.facebook = resolveConnectReadiness({
      credentialsComplete: false,
      connectionState: connectionStates.facebook || "disconnected",
      connectionLookupError,
      reason: `서버에 Facebook OAuth 앱 자격증명(${FACEBOOK.appIdEnv}/${FACEBOOK.appSecretEnv}/${FACEBOOK.configIdEnv})이 아직 설정되지 않았거나 일부만 설정됐습니다.`,
    });
  } else {
    const connectionState = connectionStates.facebook || "disconnected";
    const externalReviewPending = isExternalReviewPending("facebook", facebook.externalReview);
    result.facebook = resolveConnectReadiness({
      credentialsComplete: true,
      connectionState,
      connectionLookupError,
      externalReviewPending,
      reason: externalReviewPending
        ? externalReviewReason("facebook", "Facebook", connectionState)
        : "Meta 앱 모드와 테스터 등록 상태는 연결 과정에서 최종 확인됩니다.",
    });
  }

  return Response.json({ providers: result });
}
