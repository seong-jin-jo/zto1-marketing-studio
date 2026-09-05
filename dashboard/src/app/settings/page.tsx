"use client";

import { useState } from "react";
import useSWR from "swr";
import { fetcher } from "@/lib/api";
import { ChannelsSettings } from "@/components/settings/ChannelsSettings";
import { ChannelConnect } from "@/components/studio/ChannelConnect";
import { TenantTokensSettings } from "@/components/settings/TenantTokensSettings";
import { useUIStore } from "@/store/ui-store";
import { AIEngine } from "@/components/settings/AIEngine";
import { AiKeySettings } from "@/components/settings/AiKeySettings";
import { LlmModel } from "@/components/settings/LlmModel";
import { ClaudeToken } from "@/components/settings/ClaudeToken";
import { StorageSettings } from "@/components/settings/StorageSettings";
import { DesignToolsSettings } from "@/components/settings/DesignToolsSettings";
import { SystemSettings } from "@/components/settings/SystemSettings";
import { SlackSettings } from "@/components/settings/SlackSettings";
import { Notifications } from "@/components/settings/Notifications";
import { ElevenLabsSettings } from "@/components/settings/ElevenLabsSettings";
import { KeywordBankSettings } from "@/components/settings/KeywordBankSettings";
import { KwPlannerSettings } from "@/components/settings/KwPlannerSettings";

const SETTINGS_TABS = [
  { key: "channels", label: "채널", desc: "발행 채널 연결" },
  { key: "ai", label: "AI 엔진", desc: "LLM 모델 + 토큰" },
  { key: "storage", label: "저장소", desc: "이미지 저장소" },
  { key: "design", label: "디자인 도구", desc: "Canva / Figma" },
  { key: "notifications", label: "알림", desc: "발행/터짐/에러 알림 + Slack" },
  { key: "tokens", label: "Fork 연동", desc: "셀프호스트 포크용 토큰 (고급)" },
  { key: "keywords", label: "키워드", desc: "키워드 목록 + API" },
  // video/TTS 탭은 ElevenLabsSettings가 테넌트별 격리 없는 전역 단일 파일(/api/elevenlabs-config)을
  // 쓰는 운영자 전용 설정이라(proxy.ts TENANT_AWARE_PATHS 제외 사유 참고) 아래에서 isOperator일 때만 노출.
  { key: "video", label: "영상 / 음성", desc: "ElevenLabs 설정" },
  { key: "system", label: "시스템", desc: "크론 + 계정" },
];

export default function SettingsPage() {
  const [activeTab, setActiveTab] = useState("channels");
  const { activeWorkspace } = useUIStore();
  const [showConnect, setShowConnect] = useState(false);
  const { data: me } = useSWR<{ isOperator?: boolean }>("/api/me", fetcher);
  const isOperator = me?.isOperator === true;
  const visibleTabs = SETTINGS_TABS.filter((t) => t.key !== "video" || isOperator);

  return (
    <div className="px-region py-stack-section">
      <h2 className="text-subheading font-semibold text-text mb-micro">설정</h2>
      <p className="text-body-sm text-subtle mb-stack-section">서비스 설정 -- 각 항목이 어디에서 사용되는지 확인하세요</p>
      <div className="flex gap-micro mb-stack-section border-b border-border/50 pb-stack flex-wrap">
        {visibleTabs.map((t) => (
          <button
            key={t.key}
            onClick={() => setActiveTab(t.key)}
            className={`px-stack py-stack-tight text-body-sm rounded-chip ${activeTab === t.key ? "bg-accent text-accent-fg" : "text-subtle hover:bg-surface-2"}`}
          >
            {t.label}
          </button>
        ))}
      </div>

      {activeTab === "channels" && (
        <>
          {/* OSMU 테넌트 발행용 OAuth 연결(integrations) — 워크스페이스별 */}
          <div className="mb-stack-section p-pad-inset rounded-surface border border-accent bg-accent-soft flex items-center justify-between">
            <div>
              <h3 className="text-body-sm font-semibold text-accent">OSMU 채널 OAuth {activeWorkspace?.name ? `· ${activeWorkspace.name}` : ""}</h3>
              <p className="text-caption text-subtle mt-micro">활성 워크스페이스의 발행용 채널을 공식 로그인으로 연결합니다. 토큰 원문은 서버에 암호화 저장되고 화면에 표시하지 않습니다.</p>
            </div>
            <button onClick={() => setShowConnect(true)} disabled={!activeWorkspace}
              className="px-stack py-stack-tight text-caption bg-accent text-accent-fg rounded-control disabled:opacity-50 whitespace-nowrap">채널 OAuth 연결</button>
          </div>
          <ChannelsSettings />
        </>
      )}
      {showConnect && activeWorkspace && <ChannelConnect workspace={activeWorkspace} onClose={() => setShowConnect(false)} />}
      {activeTab === "ai" && (
        <>
          <p className="text-caption text-subtle mb-pad-inset">모든 채널의 콘텐츠 자동 생성 + 트렌드 분석에 사용됩니다.</p>
          {/* 고객 셀프서브: 내 Anthropic 키 등록 → 생성이 내 키·내 과금으로 */}
          <div className="mb-stack-section"><AiKeySettings /></div>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-stack-section mb-stack-section">
            <LlmModel />
            <ClaudeToken />
          </div>
          <AIEngine />
        </>
      )}
      {activeTab === "tokens" && <TenantTokensSettings />}
      {activeTab === "storage" && <StorageSettings />}
      {activeTab === "design" && <DesignToolsSettings />}
      {activeTab === "notifications" && (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-stack-section">
          <Notifications />
          <SlackSettings />
        </div>
      )}
      {activeTab === "keywords" && (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-stack-section">
          <KeywordBankSettings />
          <KwPlannerSettings />
        </div>
      )}
      {activeTab === "video" && isOperator && (
        <div className="max-w-lg">
          <ElevenLabsSettings />
        </div>
      )}
      {activeTab === "system" && <SystemSettings />}
    </div>
  );
}
