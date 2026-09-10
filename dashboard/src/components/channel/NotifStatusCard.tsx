"use client";

import { useNotifSettings } from "@/hooks/useChannelConfig";

interface NotifStatusCardProps {
  channel: string;
}

const EVENT_LABELS: Record<string, string> = {
  onPublish: "글 발행 시",
  onViral: "바이럴 감지 시",
  onError: "크론 에러 시",
  weeklyReport: "주간 리포트",
};

export function NotifStatusCard({ channel }: NotifStatusCardProps) {
  const { data: settings } = useNotifSettings();

  return (
    <div className="card p-stack-section">
      <h3 className="text-body-sm font-medium text-muted mb-stack">알림 발송</h3>
      <p className="text-caption text-subtle mb-stack">
        이 채널로 마케팅 알림을 자동 발송할 수 있습니다.
      </p>
      <div className="space-y-stack-tight">
        {Object.entries(EVENT_LABELS).map(([evt, label]) => {
          const enabled = settings?.[evt as keyof typeof settings]?.channels?.includes(channel);
          return (
            <div key={evt} className="flex items-center justify-between p-stack-tight rounded-chip bg-surface/50">
              <span className="text-caption text-subtle">{label}</span>
              <span className={`text-caption ${enabled ? "text-success" : "text-subtle"}`}>
                {enabled ? "ON" : "OFF"}
              </span>
            </div>
          );
        })}
      </div>
      <p className="text-caption text-subtle mt-stack-tight">설정 &gt; 알림에서 변경</p>
    </div>
  );
}
