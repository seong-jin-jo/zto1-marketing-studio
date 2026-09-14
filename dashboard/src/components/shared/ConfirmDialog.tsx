"use client";

import { useEffect } from "react";
import { Button } from "@/components/shared/Button";

/**
 * 화면 안에서 받는 확인창.
 *
 * 2026-09-07 회장 실사용: 생성실에서 "새로 시작"을 누르자 브라우저 기본 확인창이 떠서
 * 페이지 전체가 멈췄다. 그 상태에서는 무엇을 버리는지 화면과 나란히 볼 수 없고, 자동화도
 * 사람도 그 창을 닫기 전에는 아무것도 못 한다. 비용 승인에서 같은 이유로 이미 한 번
 * 걷어낸 방식인데(CostApprovalDialog) 되돌릴 수 없는 조작에는 그대로 남아 있었다.
 *
 * 되돌릴 수 없는 것일수록 무엇이 사라지는지 화면에 두고 물어야 한다.
 */
export interface ConfirmRequest {
  /** 무엇을 하려는지 한 줄. */
  title: string;
  /** 무엇이 사라지는지, 되돌릴 수 있는지. 사람 말로. */
  description: string;
  /** 실행 단추 문구. 무엇이 일어나는지 그대로 적는다. "확인" 같은 말은 쓰지 않는다. */
  confirmLabel: string;
  cancelLabel?: string;
  /** 되돌릴 수 없으면 실행 단추를 위험색으로. */
  destructive?: boolean;
}

interface Props {
  request: ConfirmRequest | null;
  onConfirm: () => void;
  onCancel: () => void;
}

export function ConfirmDialog({ request, onConfirm, onCancel }: Props) {
  useEffect(() => {
    if (!request) return;
    // 되돌릴 수 없는 조작은 취소에 초점을 준다. 엔터를 잘못 눌러 지워지는 일을 막는다.
    const target = request.destructive ? "confirm-dialog-cancel" : "confirm-dialog-accept";
    document.querySelector<HTMLButtonElement>(`[data-testid="${target}"]`)?.focus();
  }, [request]);

  if (!request) return null;

  return (
    <div
      data-testid="confirm-dialog"
      className="fixed inset-0 z-[60] flex items-center justify-center bg-player-surface/60 p-stack"
      onKeyDown={(e) => { if (e.key === "Escape") onCancel(); }}
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="confirm-dialog-title"
        className="card w-full max-w-md space-y-stack p-stack-section"
      >
        <h2 id="confirm-dialog-title" className="text-body font-semibold text-text">
          {request.title}
        </h2>
        <p className="text-caption text-subtle break-keep" data-testid="confirm-dialog-description">
          {request.description}
        </p>
        <div className="flex justify-end gap-stack-tight">
          <Button size="sm" variant="secondary" data-testid="confirm-dialog-cancel" onClick={onCancel}>
            {request.cancelLabel || "그만두기"}
          </Button>
          <Button
            size="sm"
            variant={request.destructive ? "danger" : "primary"}
            data-testid="confirm-dialog-accept"
            onClick={onConfirm}
          >
            {request.confirmLabel}
          </Button>
        </div>
      </div>
    </div>
  );
}
