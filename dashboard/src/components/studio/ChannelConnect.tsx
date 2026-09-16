"use client";

import { useState } from "react";
import { setupGuides } from "@/lib/setup-guides";
import { useChannelConfig } from "@/hooks/useChannelConfig";
import { authHeaders } from "@/lib/auth";
import { CredentialForm } from "@/components/shared/CredentialForm";
import { SetupGuide } from "@/components/shared/SetupGuide";
import { SocialConnectButton } from "@/components/channel/SocialConnectButton";
import { CH_LABELS } from "@/lib/constants";
import { PUBLISH_CHANNEL_GROUPS } from "@/lib/channel-capabilities";
import type { Workspace } from "@/store/ui-store";

// 채널 연결 모달 — 검증 경로(/api/channel-config/{channel})로 통일.
// 저장 시 실제 API로 credential을 verify하고 계정(@username)을 echo. OnboardingWizard와 동일 경로.
// "연결 테스트"는 빈 body POST → 저장된 creds로 verify만 재실행(부작용 없음).
// CHANNELS는 더 이상 이 파일이 소유한 15개 독립 목록이 아니라 PUBLISH_CHANNEL_GROUPS(사이드바·
// Settings>Channels와 동일 SSOT)를 flatten — 실제 /api/publish가 지원하는 8채널만 노출한다
// (2026-07-16 P0 QA 정정: linkedin/youtube/naver_blog/pinterest/tumblr/tiktok/line은 OAuth 등록은
// 있어도 실발행 분기가 없어 여기서 뺐다 — 있어도 발행 안 되는 채널을 "연결가능"으로 보여주면 안 됨).
const CHANNELS: string[] = PUBLISH_CHANNEL_GROUPS.flatMap((g) => [...g.channels]);
const LABELS: Record<string, string> = CH_LABELS;
// OAUTH_LABELS는 실제 end-to-end OAuth 연동이 붙어있는 4채널만(threads/instagram/x/facebook —
// src/app/api/connect/[provider]/route.ts). bluesky/telegram/discord/slack은 OAuth 앱이 아니라
// credential(app password/bot token/webhook URL) 직접 입력 방식이라 CredentialForm이 기본으로 뜬다.
const OAUTH_LABELS: Record<string, string> = {
  threads: "Threads",
  instagram: "Instagram",
  x: "X (Twitter)",
  facebook: "Facebook",
};

interface VerifyResult { verified?: boolean; unverified?: boolean; reason?: string; account?: string; error?: string }

export function ChannelConnect({ workspace, onClose }: { workspace: Workspace; onClose: () => void }) {
  const { data: cfg, mutate } = useChannelConfig();
  const [platform, setPlatform] = useState("threads");
  const [result, setResult] = useState<VerifyResult | null>(null);
  const [testing, setTesting] = useState(false);
  const [showManualCreds, setShowManualCreds] = useState(false);

  const guide = setupGuides[platform];
  const chCfg = (cfg?.[platform] as { connected?: boolean; keys?: Record<string, string> }) || {};
  const currentKeys = chCfg.keys || {};

  const post = async (body: Record<string, string>): Promise<VerifyResult> => {
    const res = await fetch(`/api/channel-config/${platform}`, {
      method: "POST",
      headers: { "Content-Type": "application/json", ...authHeaders() },
      body: JSON.stringify(body),
    });
    const d = await res.json().catch(() => ({}));
    if (!res.ok) throw new Error((d as { error?: string }).error || "저장 실패");
    return d as VerifyResult;
  };

  const handleSave = async (keys: Record<string, string>) => {
    setResult(null);
    const r = await post(keys);
    setResult(r);
    await mutate();
  };

  const testConnection = async () => {
    if (testing) return;
    setTesting(true); setResult(null);
    try {
      const r = await post({}); // 빈 body → 저장된 creds로 verify만 재실행
      setResult(r);
    } catch (e) {
      setResult({ error: (e as Error).message });
    } finally { setTesting(false); }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-player-surface/70 p-pad-inset">
      <div className="w-full max-w-2xl rounded-surface border border-accent bg-surface/95 backdrop-blur-xl p-stack-section shadow-floating max-h-[88vh] overflow-y-auto">
        <div className="flex justify-between items-center mb-micro">
          <h2 className="text-lead font-bold bg-gradient-to-r from-accent to-accent-hover bg-clip-text text-transparent">채널 연결</h2>
          <button onClick={onClose} className="ds-touch-target inline-flex items-center justify-center text-subtle text-body-sm">✕</button>
        </div>
        <p className="text-caption text-subtle mb-pad-inset">{workspace.name} · 입력 후 저장하면 실제 API로 검증되고 계정이 확인됩니다</p>

        <div className="flex gap-stack-tight mb-pad-inset flex-wrap">
          {CHANNELS.map((c) => {
            const connected = Boolean((cfg?.[c] as { connected?: boolean })?.connected);
            return (
              <button key={c} onClick={() => { setPlatform(c); setResult(null); setShowManualCreds(false); }}
                className={`min-h-control-touch px-stack py-stack-tight rounded-control text-caption flex items-center gap-micro ${platform === c ? "bg-accent text-accent-fg" : "bg-surface-2 text-subtle"}`}>
                {LABELS[c] || c}{connected && <span className="text-success">✓</span>}
              </button>
            );
          })}
        </div>

        {guide ? (
          <div className="grid md:grid-cols-2 gap-pad-inset">
            {/* 연결 중 인라인 가이드 — 따라만 하면 되도록 */}
            <div className="card p-pad-inset">
              <p className="text-caption font-medium text-muted mb-stack-tight">{LABELS[platform]} 연결 방법</p>
              <SetupGuide quick={guide.quick} detail={guide.detail} images={guide.images} />
            </div>
            <div className="card p-pad-inset">
              {OAUTH_LABELS[platform] && (
                <div className="mb-stack">
                  <SocialConnectButton provider={platform} label={OAUTH_LABELS[platform]} />
                  <button
                    type="button"
                    onClick={() => setShowManualCreds((v) => !v)}
                    className="mt-stack-tight inline-flex items-center min-h-control-touch text-caption text-accent"
                  >
                    {showManualCreds ? "수동 입력 닫기" : "고급: 토큰 직접 입력"}
                  </button>
                </div>
              )}
              {(!OAUTH_LABELS[platform] || showManualCreds) && (
                <>
                  <CredentialForm
                    channelKey={platform}
                    fields={guide.fields}
                    labels={guide.labels}
                    currentKeys={currentKeys}
                    onSave={handleSave}
                    connectLabel="수동 연결 + 검증"
                  />
                  <button onClick={testConnection} disabled={testing}
                    className="mt-stack min-h-control-touch w-full py-stack-tight text-caption bg-surface-2 hover:bg-surface-2 text-muted rounded-chip disabled:opacity-50">
                    {testing ? "테스트 중…" : "연결 테스트 (저장된 키 재검증)"}
                  </button>
                </>
              )}
              {OAUTH_LABELS[platform] && !showManualCreds && chCfg.connected && (
                <p className="mt-stack text-caption text-success">✓ OAuth 연결됨. access token 원문은 화면에 표시하지 않습니다.</p>
              )}
              {result && (
                <div className="mt-stack text-caption">
                  {result.verified ? (
                    <p className="text-success">✓ 연결 완료{result.account ? `. ${result.account}` : ""}</p>
                  ) : result.unverified ? (
                    <p className="text-warning">저장됨. 미검증{result.reason ? `. ${result.reason}` : ""} (네트워크 복구 후 “연결 테스트”로 재확인)</p>
                  ) : (
                    <p className="text-danger">✗ 검증 실패{result.error ? `: ${result.error}` : ". 키를 확인하세요"}</p>
                  )}
                </div>
              )}
            </div>
          </div>
        ) : (
          <p className="text-caption text-subtle">이 채널은 아직 가이드가 준비되지 않았습니다.</p>
        )}
      </div>
    </div>
  );
}
