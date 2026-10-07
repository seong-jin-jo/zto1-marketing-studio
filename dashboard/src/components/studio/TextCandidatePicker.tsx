"use client";

import { useMemo, useState } from "react";
import { Button } from "@/components/shared/Button";
import { CHANNEL_TEXT_LIMITS, countTextCharacters } from "@/lib/channel-text-limits";
import type { TextCandidate } from "@/lib/studio/text-candidate-contract";

export interface TextCandidatePickerProps {
  candidates: readonly TextCandidate[];
  selectedId?: string | null;
  onSelect: (candidate: TextCandidate) => void;
}

export function TextCandidatePicker({ candidates, selectedId = null, onSelect }: TextCandidatePickerProps) {
  const defaultId = candidates.find((candidate) => candidate.recommended)?.id ?? candidates[0]?.id ?? null;
  const [previewId, setPreviewId] = useState<string | null>(selectedId ?? defaultId);
  const preview = useMemo(() => candidates.find((candidate) => candidate.id === previewId) ?? candidates[0], [candidates, previewId]);
  if (!preview) return null;

  return (
    <section className="space-y-stack rounded-surface border border-border bg-surface p-pad-inset" aria-labelledby="text-candidate-title" data-text-candidate-picker>
      <div>
        <h3 id="text-candidate-title" className="text-body font-bold text-text">글 후보 3개 비교</h3>
        <p className="text-caption text-subtle">미리보기만으로 본문은 바뀌지 않습니다. “이 후보로”를 눌러 적용하세요.</p>
      </div>
      <div className="flex min-w-0 gap-stack-tight overflow-x-auto pb-micro" role="tablist" aria-label="글 후보 각도">
        {candidates.map((candidate) => {
          const hasWarning = candidate.warnings.length > 0;
          return (
            <Button
              key={candidate.id}
              variant="secondary"
              size="sm"
              role="tab"
              aria-selected={candidate.id === preview.id}
              className="shrink-0 justify-start py-stack-tight text-left aria-selected:border-accent aria-selected:bg-accent-soft"
              onClick={() => setPreviewId(candidate.id)}
              data-text-candidate-tab={candidate.id}
            >
              <b>{candidate.label}</b>{candidate.recommended ? <span className="ml-micro text-accent">추천</span> : null}{hasWarning ? <span className="ml-micro text-warning">주의</span> : null}
            </Button>
          );
        })}
      </div>
      <article role="tabpanel" className="space-y-stack rounded-control border border-border bg-surface-2 p-stack" data-text-candidate-preview={preview.id}>
        <div className="flex flex-wrap items-center justify-between gap-stack-tight">
          <b className="text-body-sm text-text">{preview.label}</b>
          <span className="text-caption text-subtle">Threads {countTextCharacters(preview.content.threads)} / {CHANNEL_TEXT_LIMITS.threads}자</span>
        </div>
        <p className="whitespace-pre-wrap break-keep text-body text-text">{preview.content.threads}</p>
        <p className="text-caption text-muted">{preview.recommendation_reason}</p>
        {preview.warnings.length ? (
          <ul className="space-y-micro" aria-label={`${preview.label} 경고`}>
            {preview.warnings.map((warning, index) => <li key={`${warning.channel}-${warning.code}-${index}`} className="text-caption font-semibold text-warning">{warning.message}</li>)}
          </ul>
        ) : <p className="text-caption text-success">원문 사실과 채널 길이를 확인했습니다.</p>}
        <Button variant="primary" className="w-full" aria-pressed={selectedId === preview.id} onClick={() => onSelect(preview)}>
          {selectedId === preview.id ? "본문에 적용됨" : "이 후보로"}
        </Button>
      </article>
    </section>
  );
}
