"use client";

import { useState } from "react";
import { apiPost } from "@/lib/api";
import { useChannelGuide } from "@/hooks/useChannelConfig";
import { useToast } from "@/components/layout/Toast";
import { CH_LABELS } from "@/lib/constants";

interface ContentGuideProps {
  channel: string;
}

export function ContentGuide({ channel }: ContentGuideProps) {
  const { data, mutate } = useChannelGuide(channel);
  const { showToast } = useToast();
  const [saving, setSaving] = useState(false);
  const [suggesting, setSuggesting] = useState(false);
  const [suggestion, setSuggestion] = useState<string | null>(null);

  const label = CH_LABELS[channel] || channel;
  const guide = data?.guide || "";
  const isChannelGuide = data?.channelGuide ?? false;

  const [text, setText] = useState<string | null>(null);
  const displayText = text ?? guide;

  const handleSave = async () => {
    setSaving(true);
    try {
      await apiPost(`/api/guide/${channel}`, { guide: displayText });
      showToast(`가이드 저장됨 (${label})`, "success");
      mutate();
    } catch (e) { showToast(`저장 실패: ${(e as Error).message}`, "error"); }
    finally { setSaving(false); }
  };

  const handleCopyCommon = () => {
    if (data?.common) {
      setText(data.common);
      showToast("공통 가이드 복사됨", "info");
    }
  };

  const handleAiSuggest = async () => {
    setSuggesting(true);
    setSuggestion(null);
    try {
      const r = await apiPost<{ success: boolean; guide: string }>("/api/ai-suggest/guide", {
        channel: label,
        currentGuide: displayText,
      });
      if (r?.success && r.guide) {
        setSuggestion(r.guide);
        showToast("AI 제안 생성 완료", "success");
      } else {
        showToast("제안 생성 실패", "error");
      }
    } catch (e) { showToast(`실패: ${(e as Error).message}`, "error"); }
    finally { setSuggesting(false); }
  };

  const handleApplySuggestion = () => {
    if (suggestion) {
      setText(suggestion);
      setSuggestion(null);
      showToast("제안이 적용되었습니다. 저장을 눌러 반영하세요.", "info");
    }
  };

  return (
    <div className="card p-stack-section">
      <div className="flex items-center justify-between mb-stack">
        <h3 className="text-body-sm font-medium text-muted">
          콘텐츠 가이드 <span className="text-caption text-subtle">({label})</span>
        </h3>
        <div className="flex gap-stack-tight">
          <button
            onClick={handleAiSuggest}
            disabled={suggesting}
            className="px-stack-tight py-micro text-caption bg-accent text-accent-fg rounded-chip hover:bg-accent-hover disabled:opacity-50"
          >
            {suggesting ? "생성중..." : "AI 제안"}
          </button>
          <button onClick={handleCopyCommon} className="px-stack-tight py-micro text-caption bg-surface-2 text-subtle rounded-chip hover:bg-surface-2">
            공통에서 복사
          </button>
          <button onClick={handleSave} disabled={saving} className="px-stack py-micro text-caption bg-accent text-accent-fg rounded-chip hover:bg-accent-hover disabled:opacity-50">
            {saving ? "저장 중..." : "저장"}
          </button>
        </div>
      </div>
      <p className="text-caption text-subtle mb-stack-tight">
        {isChannelGuide ? `${label} 전용 가이드` : "공통 가이드 사용 중. 수정하면 채널 전용으로 저장"}
        {channel === "x" ? " (280자 제한 고려)" : ""}
      </p>
      <textarea
        value={displayText}
        onChange={(e) => setText(e.target.value)}
        className="w-full bg-surface border border-border rounded-chip px-stack py-stack-tight text-body-sm text-muted font-mono"
        rows={10}
      />

      {/* AI 제안 결과 */}
      {suggestion && (
        <div className="mt-stack border border-accent rounded-control bg-accent-soft p-pad-inset">
          <div className="flex items-center justify-between mb-stack-tight">
            <span className="text-caption text-accent font-medium">AI 제안</span>
            <div className="flex gap-stack-tight">
              <button onClick={handleApplySuggestion} className="px-stack-tight py-micro text-caption bg-accent text-accent-fg rounded-chip hover:bg-accent-hover">
                적용하기
              </button>
              <button
                onClick={() => { navigator.clipboard.writeText(suggestion); showToast("클립보드에 복사됨", "info"); }}
                className="px-stack-tight py-micro text-caption bg-surface-2 text-subtle rounded-chip hover:bg-surface-2"
              >
                복사
              </button>
              <button onClick={() => setSuggestion(null)} className="px-stack-tight py-micro text-caption text-subtle hover:text-muted">
                닫기
              </button>
            </div>
          </div>
          <pre className="text-caption text-muted whitespace-pre-wrap leading-relaxed max-h-60 overflow-y-auto">{suggestion}</pre>
        </div>
      )}
    </div>
  );
}
