"use client";

import { useChannelConfig } from "@/hooks/useChannelConfig";
import { apiPost, ApiResponseError } from "@/lib/api";
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
  const connectionError = cfg?.connectionError;
  const keys = cfg?.keys || {};
  const sg = setupGuides[channel] || { fields: [], labels: [], quick: ["연결 안내 준비 중"], detail: "" };

  const handleCredSave = async (newKeys: Record<string, string>) => {
    let r: { verified?: boolean; error?: string; reason?: string; account?: string } | null;
    try {
      r = await apiPost<{ verified?: boolean; error?: string; reason?: string; account?: string }>(`/api/channel-config/${channel}`, newKeys);
    } catch (error) {
      const message = error instanceof ApiResponseError
        ? error.message
        : "연결 저장이 완료되지 않았습니다. 새로고침한 상태를 확인하고 다시 시도해 주세요.";
      showToast(message, "error");
      mutateConfig();
      throw new Error("연결 저장 미완료");
    }
    if (r?.verified) {
      showToast(`${label} 연결 완료${r.account ? ". " + r.account : ""}`, "success");
      mutateConfig();
    } else {
      showToast(`연결 실패: ${r?.error || r?.reason || "연결 정보를 확인해 주세요"}`, "error");
      mutateConfig();
      throw new Error("연결 확인에 실패했습니다");
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

      {connectionError === "slack_webhook_required" && (
        <p className="mb-stack-section rounded-control border border-warning/40 bg-warning/10 p-stack text-caption text-warning">
          기존 Slack 연결은 발행에 사용할 수 없습니다. 아래에서 Incoming Webhook URL을 입력해 주세요.
        </p>
      )}
      {connectionError === "discord_webhook_required" && (
        <p className="mb-stack-section rounded-control border border-warning/40 bg-warning/10 p-stack text-caption text-warning" role="alert">
          기존 Discord 연결은 발행에 사용할 수 없습니다. Discord Incoming Webhook URL을 연결해 주세요.
        </p>
      )}
      {connectionError === "telegram_chat_required" && (
        <p className="mb-stack-section rounded-control border border-warning/40 bg-warning/10 p-stack text-caption text-warning">
          Telegram 발행 대상 Chat ID가 없습니다. 아래에서 Bot Token과 Chat ID를 함께 입력해 주세요.
        </p>
      )}
      {(connectionError === "server_key_missing" || connectionError === "no_token") && (
        <p className="mb-stack-section rounded-control border border-warning/40 bg-warning/10 p-stack text-caption text-warning">
          저장된 연결 정보를 확인할 수 없습니다. 잠시 후 다시 시도하고 계속되면 관리자에게 문의해 주세요.
        </p>
      )}
      {channel === "slack" && (
        <p className="mb-stack-section rounded-control border border-warning/40 bg-warning/10 p-stack text-caption text-warning">
          연결 버튼을 누를 때마다 입력한 Slack 채널에 테스트 메시지 1건이 게시됩니다. 이 앱에서 Webhook 메시지를 삭제할 수 없습니다.
        </p>
      )}

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
            title={channel === "slack" ? "Incoming Webhook 연결" : "발행 채널 연결"}
            submitLabel={channel === "slack" ? "테스트 메시지 보내고 연결" : undefined}
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
