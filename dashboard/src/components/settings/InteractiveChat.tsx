"use client";

import { useState } from "react";
import { apiPost } from "@/lib/api";
import { useToast } from "@/components/layout/Toast";

interface InteractiveChatProps {
  chatChannels?: Record<string, { configured: boolean; botUsername?: string }>;
}

export function InteractiveChat({ chatChannels }: InteractiveChatProps) {
  const { showToast } = useToast();
  const [tgToken, setTgToken] = useState("");
  const [connecting, setConnecting] = useState(false);

  const handleSetupTelegram = async () => {
    if (!tgToken.trim()) { showToast("Bot Token을 입력하세요", "warning"); return; }
    setConnecting(true);
    try {
      const r = await apiPost<{ verified?: boolean; bot?: string; note?: string; error?: string }>("/api/chat-channels/telegram", { token: tgToken.trim() });
      if (r?.verified) {
        showToast(`Telegram 봇 연결: ${r.bot}. ${r.note || ""}`, "success");
        setTgToken("");
      } else {
        showToast(`연결 실패: ${r?.error || "unknown"}`, "error");
      }
    } catch (e) { showToast(`연결 실패: ${(e as Error).message}`, "error"); }
    finally { setConnecting(false); }
  };

  return (
    <div className="card p-stack-section">
      <h3 className="text-body-sm font-medium text-muted mb-stack">대화형 채팅</h3>
      <p className="text-caption text-subtle mb-stack">
        봇으로 Agent와 대화 &mdash; &quot;이번 주 성과 보여줘&quot;, &quot;다음 글 승인해&quot;, &quot;X에 글 올려&quot;
      </p>

      {chatChannels ? (
        <div className="space-y-stack">
          {/* Telegram */}
          <div className="p-stack rounded-chip bg-surface/50">
            <div className="flex items-center justify-between mb-stack-tight">
              <span className="text-caption text-muted">Telegram</span>
              <span className={`text-caption ${chatChannels.telegram?.configured ? "text-success" : "text-subtle"}`}>
                {chatChannels.telegram?.configured ? "Connected" : ""}
              </span>
            </div>
            {chatChannels.telegram?.configured ? (
              <p className="text-caption text-success/70">양방향 대화 활성. Gateway 재시작 후 봇에게 메시지를 보내면 Agent가 응답합니다.</p>
            ) : (
              <>
                <div className="flex gap-stack-tight">
                  <input
                    type="password"
                    value={tgToken}
                    onChange={(e) => setTgToken(e.target.value)}
                    placeholder="Bot Token (@BotFather)"
                    className="flex-1 bg-surface border border-border rounded-chip px-stack-tight py-micro text-caption text-muted font-mono"
                  />
                  <button
                    onClick={handleSetupTelegram}
                    disabled={connecting}
                    className="px-stack py-micro bg-accent text-accent-fg text-caption rounded-chip hover:bg-accent-hover disabled:opacity-50"
                  >
                    {connecting ? "Verifying..." : "Connect"}
                  </button>
                </div>
                <p className="text-caption text-subtle mt-micro">@BotFather &rarr; /newbot &rarr; 토큰 복사</p>
              </>
            )}
          </div>

          {/* Slack */}
          <div className="p-stack rounded-chip bg-surface/50">
            <div className="flex items-center justify-between mb-stack-tight">
              <span className="text-caption text-muted">
                Slack <span className="text-caption text-subtle">(양방향은 Bot+App Token 필요)</span>
              </span>
              <span className={`text-caption ${chatChannels.slack?.configured ? "text-success" : "text-subtle"}`}>
                {chatChannels.slack?.configured ? "Connected" : ""}
              </span>
            </div>
            {chatChannels.slack?.configured ? (
              <p className="text-caption text-success/70">양방향 대화 활성</p>
            ) : (
              <p className="text-caption text-subtle">
                Slack 양방향은 Bot Token(xoxb-) + App Token(xapp-) 필요. 일방향 알림은 Webhook으로 가능.
              </p>
            )}
          </div>

          {/* Discord */}
          <div className="p-stack rounded-chip bg-surface/50">
            <div className="flex items-center justify-between">
              <span className="text-caption text-muted">Discord</span>
              <span className={`text-caption ${chatChannels.discord?.configured ? "text-success" : "text-subtle"}`}>
                {chatChannels.discord?.configured ? "Connected" : ""}
              </span>
            </div>
          </div>
        </div>
      ) : (
        <p className="text-caption text-subtle">불러오는 중...</p>
      )}
    </div>
  );
}
