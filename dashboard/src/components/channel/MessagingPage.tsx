"use client";

import { useChannelConfig } from "@/hooks/useChannelConfig";
import { apiPost } from "@/lib/api";
import { useToast } from "@/components/layout/Toast";
import { CH_LABELS, CH_STATUS_LABEL } from "@/lib/constants";
import { setupGuides } from "@/lib/setup-guides";
import { CredentialForm } from "@/components/shared/CredentialForm";
import { SetupGuide } from "@/components/shared/SetupGuide";
import { BackButton } from "@/components/shared/BackButton";
import { ChannelTabs } from "@/components/channel/ChannelTabs";

interface MessagingPageProps {
  channel: string;
}

export function MessagingPage({ channel }: MessagingPageProps) {
  const label = CH_LABELS[channel] || channel;
  const { data: channelConfig, mutate: mutateConfig } = useChannelConfig();
  const { showToast } = useToast();

  const cfg = channelConfig?.[channel];
  const status = cfg?.status || "available";
  const connected = !!cfg?.connected;
  const keys = cfg?.keys || {};
  const sg = setupGuides[channel] || { fields: [], labels: [], quick: ["연결 안내 준비 중"], detail: "" };

  const handleCredSave = async (newKeys: Record<string, string>) => {
    const r = await apiPost<{ verified?: boolean; error?: string; account?: string }>(`/api/channel-config/${channel}`, newKeys);
    if (r?.verified) {
      showToast(`${label} 연결 완료${r.account ? ". " + r.account : ""}`, "success");
      mutateConfig();
    } else {
      showToast(`연결 실패: ${r?.error || "연결 정보를 확인해 주세요"}`, "error");
      throw new Error(r?.error || "연결 확인에 실패했습니다");
    }
  };

  return (
    <div className="px-region py-stack-section">
      <BackButton />
      <div className="flex items-center gap-stack mb-stack-section">
        <span className="w-8 h-8 rounded-control bg-surface-2 flex items-center justify-center text-body-sm font-bold text-text">
          {label[0]}
        </span>
        <div>
          <h2 className="text-subheading font-semibold text-text">{label}</h2>
          <p className="text-caption text-subtle">{CH_STATUS_LABEL[status] || status}</p>
        </div>
      </div>

      <ChannelTabs channel={channel} activeTab="settings" onTabChange={() => {}} />

      <div className="grid grid-cols-1 md:grid-cols-2 gap-stack-section">
        {/* Credentials */}
        <div className="card p-stack-section">
          <CredentialForm
            channelKey={channel}
            fields={sg.fields}
            labels={sg.labels}
            currentKeys={keys}
            onSave={handleCredSave}
            connected={connected}
          />
        </div>

        {/* 채널 정보와 연결 안내 */}
        <div className="space-y-pad-inset">
          <div className="card p-stack-section">
            <h3 className="text-body-sm font-medium text-muted mb-stack">채널 정보</h3>
            <div className="space-y-stack-tight text-body-sm">
              <div className="flex justify-between">
                <span className="text-subtle">상태</span>
                <span className={status === "live" ? "text-success" : (connected || status === "connected") ? "text-accent" : "text-subtle"}>
                  {status === "live" ? "사용 중" : (connected || status === "connected") ? "연결됨" : "연결 안 됨"}
                </span>
              </div>
            </div>
          </div>
          <div className="card p-stack-section">
            <SetupGuide quick={sg.quick} detail={sg.detail} />
          </div>
        </div>

      </div>
    </div>
  );
}
