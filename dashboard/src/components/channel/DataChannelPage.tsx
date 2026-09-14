"use client";

import { useChannelConfig } from "@/hooks/useChannelConfig";
import { apiPost } from "@/lib/api";
import { useToast } from "@/components/layout/Toast";
import { CH_LABELS, CH_STATUS_LABEL } from "@/lib/constants";
import { setupGuides } from "@/lib/setup-guides";
import { CredentialForm } from "@/components/shared/CredentialForm";
import { SetupGuide } from "@/components/shared/SetupGuide";
import { BackButton } from "@/components/shared/BackButton";

interface DataChannelPageProps {
  channel: string;
}

export function DataChannelPage({ channel }: DataChannelPageProps) {
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
          <h2 className="text-subheading font-semibold text-muted">{label}</h2>
          <p className="text-caption text-subtle">{CH_STATUS_LABEL[status] || status}</p>
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-stack-section">
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
        <div className="card p-stack-section">
          <SetupGuide quick={sg.quick} detail={sg.detail} />
        </div>
      </div>
    </div>
  );
}
