"use client";

import { useState } from "react";
import { apiPost } from "@/lib/api";
import { useChannelKeywords } from "@/hooks/useChannelConfig";
import { useToast } from "@/components/layout/Toast";
import { CH_LABELS } from "@/lib/constants";

interface KeywordsEditorProps {
  channel: string;
}

export function KeywordsEditor({ channel }: KeywordsEditorProps) {
  const { data, mutate } = useChannelKeywords(channel);
  const { showToast } = useToast();
  const [saving, setSaving] = useState(false);
  const [suggesting, setSuggesting] = useState(false);
  const [suggestedKeywords, setSuggestedKeywords] = useState<string[] | null>(null);

  const label = CH_LABELS[channel] || channel;
  const keywords = data?.keywords || [];

  const [text, setText] = useState<string | null>(null);
  const displayText = text ?? keywords.join("\n");

  const handleSave = async () => {
    setSaving(true);
    try {
      const kw = displayText.split("\n").map((l) => l.trim()).filter((l) => l && !l.startsWith("#"));
      await apiPost(`/api/keywords/${channel}`, { keywords: kw });
      showToast(`키워드 저장됨 (${label})`, "success");
      mutate();
    } catch (e) { showToast(`저장 실패: ${(e as Error).message}`, "error"); }
    finally { setSaving(false); }
  };

  const handleCopyCommon = () => {
    if (data?.common) {
      setText(data.common.join("\n"));
      showToast("공통 키워드 복사됨", "info");
    }
  };

  const handleAiSuggest = async () => {
    setSuggesting(true);
    setSuggestedKeywords(null);
    try {
      const currentKw = displayText.split("\n").map((l) => l.trim()).filter((l) => l && !l.startsWith("#"));
      const r = await apiPost<{ success: boolean; keywords: string[] }>("/api/ai-suggest/keywords", {
        channel: label,
        currentKeywords: currentKw,
      });
      if (r?.success && r.keywords) {
        setSuggestedKeywords(r.keywords);
        showToast(`${r.keywords.length}개 키워드 제안됨`, "success");
      } else {
        showToast("제안 생성 실패", "error");
      }
    } catch (e) { showToast(`실패: ${(e as Error).message}`, "error"); }
    finally { setSuggesting(false); }
  };

  const handleApplyAll = () => {
    if (suggestedKeywords) {
      const current = displayText.split("\n").map((l) => l.trim()).filter((l) => l);
      const merged = [...new Set([...current, ...suggestedKeywords])];
      setText(merged.join("\n"));
      setSuggestedKeywords(null);
      showToast("전체 제안이 적용되었습니다. 저장을 눌러 반영하세요.", "info");
    }
  };

  const handleApplyOne = (kw: string) => {
    const current = displayText.split("\n").map((l) => l.trim()).filter((l) => l);
    if (!current.includes(kw)) {
      setText([...current, kw].join("\n"));
      showToast(`"${kw}" 추가됨`, "info");
    } else {
      showToast("이미 포함된 키워드", "warning");
    }
  };

  return (
    <div className="card p-stack-section">
      <div className="flex items-center justify-between mb-stack">
        <h3 className="text-body-sm font-medium text-muted">
          {channel === "x" ? "검색 키워드" : "키워드"} <span className="text-caption text-subtle">({label})</span>
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
      <textarea
        value={displayText}
        onChange={(e) => setText(e.target.value)}
        className="w-full bg-surface border border-border rounded-chip px-stack py-stack-tight text-body-sm text-muted"
        rows={6}
      />

      {/* AI 제안 결과 */}
      {suggestedKeywords && (
        <div className="mt-stack border border-accent rounded-control bg-accent-soft p-pad-inset">
          <div className="flex items-center justify-between mb-stack-tight">
            <span className="text-caption text-accent font-medium">AI 제안 ({suggestedKeywords.length}개)</span>
            <div className="flex gap-stack-tight">
              <button onClick={handleApplyAll} className="px-stack-tight py-micro text-caption bg-accent text-accent-fg rounded-chip hover:bg-accent-hover">
                전체 추가
              </button>
              <button
                onClick={() => { navigator.clipboard.writeText(suggestedKeywords.join("\n")); showToast("클립보드에 복사됨", "info"); }}
                className="px-stack-tight py-micro text-caption bg-surface-2 text-subtle rounded-chip hover:bg-surface-2"
              >
                복사
              </button>
              <button onClick={() => setSuggestedKeywords(null)} className="px-stack-tight py-micro text-caption text-subtle hover:text-muted">
                닫기
              </button>
            </div>
          </div>
          <div className="flex flex-wrap gap-stack-tight">
            {suggestedKeywords.map((kw, i) => (
              <button
                key={i}
                onClick={() => handleApplyOne(kw)}
                className="px-stack-tight py-micro text-caption bg-surface-2 text-muted rounded-chip hover:bg-accent-hover hover:text-accent transition-colors"
                title="클릭하면 추가"
              >
                {kw}
              </button>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
