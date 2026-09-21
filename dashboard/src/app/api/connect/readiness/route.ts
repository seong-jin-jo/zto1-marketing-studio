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

// 자격증명이 없을 때 화면에 뜨던 문구는 "서버에 x OAuth 앱 자격증명(X_CLIENT_ID/X_CLIENT_SECRET)이
// 아직 설정되지 않았습니다" 였다. 회장 2026-09-06 "앱 자격증명 등록을 하라는게 뭔말이냐".
// 설정 변수 이름은 우리 사정이고 화면을 보는 사람의 언어가 아니다. 어디에 가서 무엇을 만들고
// 무엇을 받아 와야 하는지를 평문으로 적는다(ADR-007 조용한 실패 금지의 연장).
const CONSOLE_GUIDE: Record<string, string> = {
  x: "X 개발자 사이트(developer.x.com)에서 앱을 만들고 열쇠 두 개를 받아 오면 연결이 열립니다.",
  tiktok: "TikTok 개발자 사이트(developers.tiktok.com)에서 앱을 만들고 열쇠 두 개를 받아 오면 연결이 열립니다.",
  linkedin: "LinkedIn 개발자 사이트(developer.linkedin.com)에서 앱을 만들고 열쇠 두 개를 받아 오면 연결이 열립니다.",
  youtube: "구글 클라우드 콘솔에서 앱을 만들고 열쇠 두 개를 받아 오면 연결이 열립니다.",
  instagram: "Meta 개발자 사이트에서 앱을 만들고 열쇠 두 개를 받아 오면 연결이 열립니다.",
  threads: "Meta 개발자 사이트에서 앱을 만들고 열쇠 두 개를 받아 오면 연결이 열립니다.",
  facebook: "Meta 개발자 사이트에서 앱을 만들고 열쇠 두 개를 받아 오면 연결이 열립니다.",
};

function missingCredentialReason(provider: string, label: string): string {
  const guide = CONSOLE_GUIDE[provider]
    || "해당 플랫폼 개발자 사이트에서 앱을 만들고 열쇠 두 개를 받아 오면 연결이 열립니다.";
  return `${label} 은 아직 열 준비가 되지 않았습니다. ${guide} 받은 값은 운영자 화면에서 등록합니다.`;
}

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
    // ADR-006: 테스터 등록은 심사 전 한시 절차이지 고객이 직접 콘솔에서 할 일이 아니다.
    // 운영자가 미리 테스터로 등록해두고, 고객은 초대를 수락하기만 하면 된다(회장 2026-09-17
    // "회원이 OAuth 로그인만 하면 자동으로 등록돼야지" — 정상 흐름은 App Review 통과로 성립).
    return connectionState === "connected"
      ? `${label} 채널은 아직 앱 심사 전입니다(심사 전 한시 절차). 운영자가 미리 등록해둔 테스터 계정은 사용할 수 있지만 외부 고객 계정은 연결할 수 없습니다. 심사 승인 후에는 테스터 등록 없이 OAuth로 연결됩니다.`
      : `${label} 채널은 아직 앱 심사 전입니다(심사 전 한시 절차). 운영자가 미리 테스터로 등록하고 초대를 수락한 계정만 연결할 수 있습니다. 심사 승인 후에는 테스터 등록 없이 OAuth로 연결됩니다.`;
  }
  // 2026-09-21 1차 수정: "심사 끝나야 발행된다"는 거짓 문구를 "발행은 됩니다"로 고쳤으나,
  // 교차 리뷰(PR #66)가 짚었다. publish_pending이 발행을 막지는 않지만 provider마다 실제로
  // 벌어지는 일이 다르다 — YouTube는 미심사 앱의 videos.insert가 강제로 비공개(private)로
  // 잠기고(`api/video/publish/route.ts`가 privacyStatus:"public"을 보내도 YouTube가 덮어씀),
  // TikTok은 미감사 시 본인만 보기(SELF_ONLY)로 게시된다(설계 계약
  // `docs/design-docs/channel-capability-and-readiness-contract-v1-opus.md` §B
  // "미심사 앱 private"). 이 둘은 사실을 아는 만큼 구체적으로 말하고, 나머지(naver_blog·
  // pinterest·x·linkedin·tumblr 등)는 확인된 사실이 없으니 과장하지 않고 "제한될 수 있다"로만
  // 둔다. 지난 일("경고가 뜰 수 있지만")이 아니라 지금 무슨 일이 벌어지는지만 말한다(ADR-007).
  if (provider === "youtube") {
    return connectionState === "connected"
      ? `${label} 계정이 연결됐습니다. 앱 심사 전에는 올린 영상이 자동으로 비공개로 게시됩니다. 공개하려면 YouTube 스튜디오에서 직접 공개로 바꾸거나, 심사 승인 후 다시 올리세요.`
      : `${label} 은 앱 심사 전에도 연결할 수 있습니다. 다만 심사 전에는 올린 영상이 자동으로 비공개로 게시됩니다.`;
  }
  if (provider === "tiktok") {
    return connectionState === "connected"
      ? `${label} 계정이 연결됐습니다. 앱 심사 전에는 올린 게시물이 본인만 보기로 게시됩니다. 공개 범위를 바꾸려면 TikTok 앱에서 직접 바꾸거나, 심사 승인 후 다시 올리세요.`
      : `${label} 은 앱 심사 전에도 연결할 수 있습니다. 다만 심사 전에는 올린 게시물이 본인만 보기로 게시됩니다.`;
  }
  return connectionState === "connected"
    ? `${label} 계정이 연결됐습니다. 앱 심사 전에는 발행 범위가 제한될 수 있습니다.`
    : `${label} 은 앱 심사 전에도 연결할 수 있습니다. 다만 심사 전에는 발행 범위가 제한될 수 있습니다.`;
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
      ? missingCredentialReason(name, CH_LABELS[name] || cfg.label)
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
