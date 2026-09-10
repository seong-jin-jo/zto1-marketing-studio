"use client";

import { useEffect } from "react";
import { Button } from "@/components/shared/Button";

// 왜 이 컴포넌트가 생겼나 (회장 2026-09-07 실사용):
//   비용 승인 관문을 브라우저 기본 확인창(window.confirm)으로 만들었더니 두 가지가 깨졌다.
//   ① 확인창이 뜨는 동안 페이지 전체가 멈춘다. 무엇을 승인하는지 화면과 나란히 볼 수 없고,
//      비용 근거를 다시 확인하려면 창을 닫아야 한다. 돈이 나가는 결정에 맞는 화면이 아니다.
//   ② 브라우저 기본창은 우리 디자인 밖이라 글꼴·줄바꿈·강조가 전부 깨져 나온다.
//   사업계획 v0.4 7절이 요구하는 것은 "만들기 전에 비용을 보여 주고 승인받는다" 이지
//   "확인창을 띄운다" 가 아니다. 화면 안에서 승인받는다.

export interface CostApprovalRequest {
  /** 무엇을 만드는지. 예: "카드뉴스 대표 이미지" */
  title: string;
  /** 한 줄 설명. 무엇이 만들어지는지 사람 말로. */
  description: string;
  minMinor?: number;
  maxMinor?: number;
  secondsMin?: number;
  secondsMax?: number;
  assumptions?: string[];
}

interface Props {
  request: CostApprovalRequest | null;
  onApprove: () => void;
  onCancel: () => void;
}

const won = (v?: number) => (typeof v === "number" ? `${v.toLocaleString()}원` : "산정 중");

export function CostApprovalDialog({ request, onApprove, onCancel }: Props) {
  useEffect(() => {
    if (!request) return;
    // 돈이 나가는 결정이므로 승인 단추에 초점을 준다. Button 이 ref 를 받지 않아
    // testid 로 찾는다.
    const el = document.querySelector<HTMLButtonElement>('[data-testid="cost-approval-approve"]');
    el?.focus();
  }, [request]);

  if (!request) return null;

  return (
    <div
      data-testid="cost-approval"
      className="fixed inset-0 z-[60] flex items-center justify-center bg-player-surface/60 p-stack"
      onKeyDown={(e) => { if (e.key === "Escape") onCancel(); }}
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="cost-approval-title"
        className="card w-full max-w-md space-y-stack p-stack-section"
      >
        <h2 id="cost-approval-title" className="text-body font-semibold text-text">
          {request.title} 만들기
        </h2>
        <p className="text-caption text-subtle break-keep">{request.description}</p>

        <dl className="space-y-stack-tight rounded-control border border-border bg-surface-2 p-stack text-caption">
          <div className="flex justify-between gap-stack">
            <dt className="text-muted">예상 비용</dt>
            <dd className="font-medium text-text" data-testid="cost-approval-price">
              {won(request.minMinor)}에서 {won(request.maxMinor)}
            </dd>
          </div>
          <div className="flex justify-between gap-stack">
            <dt className="text-muted">예상 시간</dt>
            <dd className="font-medium text-text">
              {request.secondsMin}초에서 {request.secondsMax}초
            </dd>
          </div>
        </dl>

        {request.assumptions?.length ? (
          <ul className="space-y-micro text-caption text-muted">
            {request.assumptions.map((line) => (
              <li key={line} className="break-keep">· {line}</li>
            ))}
          </ul>
        ) : null}

        <div className="flex justify-end gap-stack-tight">
          <Button size="sm" variant="secondary" data-testid="cost-approval-cancel" onClick={onCancel}>
            그만두기
          </Button>
          <Button size="sm" data-testid="cost-approval-approve" onClick={onApprove}>
            이 범위 안에서 만들기
          </Button>
        </div>
      </div>
    </div>
  );
}
