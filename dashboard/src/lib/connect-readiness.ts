import type { ChannelConnectionState } from "@/lib/channel-connection";

export type ConnectReadinessStatus =
  | "connected"
  | "not_connected"
  | "opening_soon"
  | "publish_pending"
  | "error";

export interface ConnectReadinessExternalLink {
  label: string;
  url: string;
}

export interface ConnectReadinessGuidance {
  title: string;
  steps: string[];
  externalLink: ConnectReadinessExternalLink;
}

export interface ConnectReadinessEntry {
  status: ConnectReadinessStatus;
  available: boolean;
  reason?: string;
  guidance?: ConnectReadinessGuidance;
}

interface ResolveConnectReadinessInput {
  credentialsComplete: boolean;
  credentialStoreError?: boolean;
  connectionState: ChannelConnectionState;
  connectionLookupError?: boolean;
  externalReviewPending?: boolean;
  reason?: string;
}

export const CONNECT_READINESS_LABELS: Record<ConnectReadinessStatus, string> = {
  connected: "연결됨",
  not_connected: "미연결",
  opening_soon: "오픈 준비중",
  publish_pending: "발행 준비중",
  error: "확인 필요",
};

// 심사 전 고객이 직접 해야 하는 provider별 초대 수락 안내의 단일 진실원이다.
// 서버는 심사 대기 중일 때만 이 값을 readiness에 싣고, 클라이언트는 받은 값만 그린다.
const META_PRE_REVIEW_GUIDANCE: Readonly<Partial<Record<string, ConnectReadinessGuidance>>> = {
  threads: {
    title: "심사 전 연결 안내",
    steps: [
      "현재는 앱 테스터로 등록된 계정만 연결할 수 있습니다.",
      "Threads 웹사이트 권한의 초대 탭에서 초대를 수락합니다.",
      "이 화면으로 돌아와 Threads OAuth 연결을 누릅니다.",
      "앱 심사 승인 뒤에는 이 과정 없이 연결할 수 있습니다.",
    ],
    externalLink: {
      label: "초대 수락하러 가기 (새 탭)",
      url: "https://www.threads.com/settings/website_permissions",
    },
  },
  instagram: {
    title: "심사 전 연결 안내",
    steps: [
      "현재는 앱 테스터로 등록된 계정만 연결할 수 있습니다.",
      "Instagram 프로필의 앱 및 웹사이트에서 초대를 수락합니다.",
      "이 화면으로 돌아와 Instagram OAuth 연결을 누릅니다.",
      "앱 심사 승인 뒤에는 이 과정 없이 연결할 수 있습니다.",
    ],
    externalLink: {
      label: "초대 수락하러 가기 (새 탭)",
      url: "https://www.instagram.com/accounts/manage_access/",
    },
  },
};

export function getMetaPreReviewGuidance(provider: string): ConnectReadinessGuidance | undefined {
  return META_PRE_REVIEW_GUIDANCE[provider];
}

export function resolveConnectReadiness({
  credentialsComplete,
  credentialStoreError = false,
  connectionState,
  connectionLookupError = false,
  externalReviewPending = false,
  reason,
}: ResolveConnectReadinessInput): ConnectReadinessEntry {
  if (credentialStoreError || connectionLookupError) {
    return { status: "error", available: false, reason };
  }

  // 우리 앱 credential이 실제로 없을 때만 "오픈 준비중"(연결 불가). 외부 심사(externalReview)는
  // 연결 자체를 막지 않는다 — 앱 소유자/개발자 모드 연결과 테스트는 심사 전에도 가능하고, 심사
  // 제약은 실제 "발행" 단계에서만 적용한다(회장 2026-08-13 라이브 회귀: 심사대상 채널이 연결까지
  // 막혀 마케팅 가동 불가. 계약 B 의도 = "연결은 되게, 발행만 심사 전 제한").
  if (!credentialsComplete) {
    return { status: "opening_soon", available: false, reason };
  }

  if (connectionState === "connected") {
    // 연결은 유효하다(available). 외부 심사가 남았으면 발행만 제한된다는 정보를 status로 표기.
    return externalReviewPending
      ? { status: "publish_pending", available: true, reason }
      : { status: "connected", available: true, reason };
  }

  // 미연결: credential이 갖춰졌으면 외부 심사 대기여도 연결 버튼은 활성(연결 가능).
  return { status: "not_connected", available: true, reason };
}
