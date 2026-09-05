"use client";

import { useMemo, useState } from "react";
import { apiPost } from "@/lib/api";
import { Button } from "@/components/shared/Button";
import { workspaceDisplayName } from "@/lib/workspace-display-name";
import {
  AUDIENCE_CARDS, FORBIDDEN_CARDS, INDUSTRY_CARDS, PALETTE_CARDS, PURPOSE_CARDS,
  RIGHTS_CARDS, VOICE_CARDS, cardValue, isCardChosen, learningToBrandAnswers, readLearningInfo, writeLearningInfo,
  type LearningCard, type LearningInfo, type LearningSlotKey,
} from "./learning-info";

interface Step {
  key: LearningSlotKey;
  question: string;
  helper: string;
  cards: readonly LearningCard[];
  escapePrompt: string;
  allowRecommendation?: boolean;
}

const STEPS: readonly Step[] = [
  { key: "industry", question: "어떤 업종에서 일하시나요?", helper: "고객에게 소개할 사업 분야를 고르세요.", cards: INDUSTRY_CARDS, escapePrompt: "목록에 없다면 업종을 한 줄로 입력해 주세요.", allowRecommendation: true },
  { key: "audience", question: "주로 어떤 고객에게 콘텐츠를 보여주나요?", helper: "우리 서비스를 이용하거나 구매할 고객을 기준으로 고르세요.", cards: AUDIENCE_CARDS, escapePrompt: "주요 고객을 한 줄로 입력해 주세요.", allowRecommendation: true },
  { key: "voice", question: "콘텐츠에 어떤 말투를 쓸까요?", helper: "카드의 문장은 선택한 말투가 실제 콘텐츠에 적용된 예시입니다.", cards: VOICE_CARDS, escapePrompt: "원하는 말투와 예시 문장을 한 줄로 입력해 주세요.", allowRecommendation: true },
  { key: "purpose", question: "콘텐츠로 어떤 결과를 원하시나요?", helper: "가장 먼저 달성하고 싶은 목표를 고르세요.", cards: PURPOSE_CARDS, escapePrompt: "원하는 결과를 한 줄로 입력해 주세요.", allowRecommendation: true },
  { key: "forbidden", question: "콘텐츠에서 쓰지 않을 표현이 있나요?", helper: "브랜드에 맞지 않거나 고객에게 부담을 줄 표현을 고르세요.", cards: FORBIDDEN_CARDS, escapePrompt: "쓰지 않을 표현을 한 줄로 입력해 주세요.", allowRecommendation: true },
  { key: "palette", question: "콘텐츠에 주로 쓸 색을 고르세요.", helper: "대표 색이 따로 있다면 직접 입력할 수 있습니다.", cards: PALETTE_CARDS, escapePrompt: "브랜드 대표 색을 한 줄로 입력해 주세요.", allowRecommendation: true },
  { key: "rights", question: "사진과 글을 사용할 권리가 있나요?", helper: "직접 만든 자료인지, 저작권자에게 콘텐츠 제작과 게시 허가를 받았는지 확인해 주세요.", cards: RIGHTS_CARDS, escapePrompt: "사용할 자료의 출처와 허가 범위를 한 줄로 입력해 주세요." },
] as const;

function firstIncompleteStep(info: LearningInfo): number {
  const index = STEPS.findIndex((step) => !(info[step.key] || "").trim());
  return index < 0 ? STEPS.length : index;
}

export function LearningCardWizard({ workspaceId, workspaceName, onSaved, onClose }: {
  workspaceId: string;
  workspaceName?: string;
  onSaved: (info: LearningInfo, completed: boolean) => void;
  onClose: () => void;
}) {
  const initialInfo = useMemo(() => readLearningInfo(workspaceId), [workspaceId]);
  const [stepIndex, setStepIndex] = useState(() => firstIncompleteStep(initialInfo));
  const [info, setInfo] = useState<LearningInfo>(initialInfo);
  const [escapeOpen, setEscapeOpen] = useState(false);
  const [escapeDraft, setEscapeDraft] = useState("");
  const [distilling, setDistilling] = useState(false);

  const reviewing = stepIndex >= STEPS.length;
  const step = reviewing ? null : STEPS[stepIndex];
  const answered = useMemo(() => STEPS.filter((one) => (info[one.key] || "").trim()).length, [info]);

  const persist = (next: LearningInfo) => {
    setInfo(next);
    writeLearningInfo(workspaceId, next);
  };

  const finish = async () => {
    const completed = STEPS.every((one) => (info[one.key] || "").trim());
    if (!completed) return;
    setDistilling(true);
    try {
      await apiPost("/api/studio/brand-setup", { tenant_id: workspaceId, answers: learningToBrandAnswers(info) });
    } catch {
      // 선택한 학습 정보는 이미 저장했다. 가이드 증류 실패는 다음 생성 요청을 막지 않는다.
    } finally {
      setDistilling(false);
    }
    onSaved(info, true);
    onClose();
  };

  const advance = (value: string) => {
    if (!step) return;
    persist({ ...info, [step.key]: value });
    setEscapeOpen(false);
    setEscapeDraft("");
    setStepIndex(Math.min(stepIndex + 1, STEPS.length));
  };

  const pickForMe = () => {
    if (!step?.allowRecommendation) return;
    const industryIndex = INDUSTRY_CARDS.findIndex((card) => isCardChosen(card, info.industry));
    const seed = industryIndex >= 0 ? industryIndex : 0;
    advance(cardValue(step.cards[seed % step.cards.length]));
  };

  return (
    <div className="fixed inset-0 z-50 grid place-items-center bg-player-surface/70 p-pad-inset" role="dialog" aria-modal="true" aria-label="학습 정보 문답">
      <div className="max-h-[90vh] w-full max-w-2xl overflow-y-auto rounded-surface border border-border bg-surface p-stack-section shadow-floating" data-learning-wizard={reviewing ? "review" : step?.key}>
        <div className="flex flex-wrap items-center gap-stack border-b border-border pb-stack">
          <div className="mr-auto min-w-0">
            <b className="block text-lead text-text">{workspaceDisplayName(workspaceName)} 학습 정보</b>
            <span className="text-caption text-subtle">7개는 직접 고르고, 성과 학습 1개는 발행 결과가 쌓이면 자동으로 채워집니다.</span>
          </div>
          <span className="rounded-pill bg-accent-soft px-stack py-stack-tight text-caption font-semibold text-accent" data-learning-step={`${Math.min(stepIndex + 1, STEPS.length)}/${STEPS.length}`}>
            {reviewing ? "입력 확인" : `${stepIndex + 1} / ${STEPS.length}`} · {answered}개 입력
          </span>
        </div>

        {reviewing ? (
          <div className="mt-pad-inset" data-learning-review>
            <p className="text-subheading font-bold text-text">입력한 학습 정보를 확인해 주세요.</p>
            <p className="mt-stack-tight break-keep text-body-sm text-muted">저장하기 전 각 항목을 다시 확인할 수 있습니다. 바꾸려면 해당 항목을 선택하세요.</p>
            <div className="mt-stack grid gap-stack-tight sm:grid-cols-2">
              {STEPS.map((one, index) => (
                <button key={one.key} type="button" onClick={() => setStepIndex(index)} className="min-h-control-touch rounded-surface border border-border bg-surface-2 p-stack text-left hover:bg-surface">
                  <b className="block text-body-sm text-text">{one.question}</b>
                  <span className="mt-micro block break-keep text-caption text-muted">{info[one.key] || "아직 입력하지 않았습니다."}</span>
                </button>
              ))}
            </div>
          </div>
        ) : step ? (
          <>
            <p className="mt-pad-inset text-subheading font-bold text-text">{step.question}</p>
            <p className="mt-stack-tight break-keep text-body-sm text-muted">{step.helper}</p>
            <div className="mt-stack grid gap-stack-tight sm:grid-cols-2" aria-label={`${step.question} 선택 카드`}>
              {step.cards.map((card) => {
                const chosen = isCardChosen(card, info[step.key]);
                return (
                  <button key={card.id} type="button" data-learning-card={card.id} aria-pressed={chosen} onClick={() => advance(cardValue(card))} className={`min-h-control-touch rounded-surface border p-stack text-left ${chosen ? "border-accent bg-accent-soft" : "border-border bg-surface-2 hover:bg-surface"}`}>
                    <b className="block text-body-sm text-text">{card.title}</b>
                    <span className="mt-micro block break-keep text-caption text-muted">{card.sample}</span>
                  </button>
                );
              })}
            </div>
            {escapeOpen ? (
              <div className="mt-stack rounded-surface border border-border bg-surface-2 p-stack">
                <p className="break-keep text-body-sm text-text">{step.escapePrompt}</p>
                <div className="mt-stack flex flex-wrap gap-stack-tight">
                  <input aria-label="학습 정보 직접 입력" value={escapeDraft} onChange={(event) => setEscapeDraft(event.target.value)} className="min-h-control-touch min-w-0 flex-1 rounded-control border border-border bg-surface px-stack text-body-sm text-text" />
                  <Button variant="primary" onClick={() => escapeDraft.trim() && advance(escapeDraft.trim())}>입력하고 다음</Button>
                </div>
              </div>
            ) : null}
          </>
        ) : null}

        <div className="mt-pad-inset flex flex-wrap items-center gap-stack-tight border-t border-border pt-stack">
          {stepIndex > 0 ? <Button onClick={() => setStepIndex(stepIndex - 1)}>이전</Button> : null}
          {!reviewing && step?.allowRecommendation ? <Button onClick={pickForMe}>추천받기</Button> : null}
          {!reviewing ? <Button onClick={() => setEscapeOpen(true)} disabled={escapeOpen}>직접 입력</Button> : null}
          {reviewing ? <Button variant="primary" onClick={() => void finish()} disabled={distilling || answered < STEPS.length}>{distilling ? "저장 중" : "학습 정보 저장"}</Button> : null}
          <div className="ml-auto text-right">
            <button type="button" onClick={() => { onSaved(info, false); onClose(); }} className="min-h-control-touch rounded-control px-stack text-caption text-subtle hover:text-muted">나중에 하기</button>
            <span className="block text-caption text-subtle">언제든 헤더의 학습 정보에서 계속할 수 있습니다.</span>
          </div>
        </div>
      </div>
    </div>
  );
}
