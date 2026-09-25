"use client";

import { createContext, useCallback, useContext, useState } from "react";
import { Button } from "@/components/shared/Button";

interface ToastAction {
  label: string;
  onClick: () => void;
}

interface Toast {
  id: number;
  message: string;
  type: "success" | "error" | "warning" | "info";
  action?: ToastAction;
}

interface ToastCtx {
  // MINOR(5차 재리뷰): 단건 GET 실패 토스트가 안내만 하고 끝이라 사용자가 재시도할
  // 방법이 없었다. action을 실어 토스트에서 바로 재시도할 수 있게 한다(선택 인자라
  // 기존 호출부는 그대로 컴파일된다).
  showToast: (message: string, type?: Toast["type"], action?: ToastAction) => void;
}

const ToastContext = createContext<ToastCtx>({ showToast: () => {} });

export function useToast() {
  return useContext(ToastContext);
}

let nextId = 0;

const COLORS: Record<string, string> = {
  success: "bg-success text-status-fg border-success",
  error: "bg-danger text-status-fg border-danger",
  warning: "bg-warning text-status-fg border-warning",
  info: "bg-accent text-accent-fg border-accent",
};

export function ToastProvider({ children }: { children: React.ReactNode }) {
  const [toasts, setToasts] = useState<Toast[]>([]);

  const showToast = useCallback((message: string, type: Toast["type"] = "info", action?: ToastAction) => {
    const id = ++nextId;
    setToasts((prev) => [...prev, { id, message, type, action }]);
    // 재시도 단추가 있는 토스트는 눌러볼 시간을 준다 — 3초 만에 사라지면 누를 새도
    // 없이 없어진다.
    setTimeout(() => setToasts((prev) => prev.filter((t) => t.id !== id)), action ? 8000 : 3000);
  }, []);

  return (
    <ToastContext.Provider value={{ showToast }}>
      {children}
      <div className="fixed top-4 right-4 z-50 flex flex-col gap-stack-tight" id="toast-container">
        {toasts.map((t) => (
          <div
            key={t.id}
            className={`flex items-center gap-stack-tight px-pad-inset py-stack-tight rounded-chip border text-body-sm shadow-lg transition-opacity duration-300 ${COLORS[t.type] || COLORS.info}`}
          >
            <span>{t.message}</span>
            {t.action ? (
              <Button
                size="sm"
                variant="secondary"
                data-toast-action
                className="shrink-0 !min-h-0 border-current bg-transparent text-current underline-offset-2 hover:underline"
                onClick={() => { t.action?.onClick(); setToasts((prev) => prev.filter((x) => x.id !== t.id)); }}
              >
                {t.action.label}
              </Button>
            ) : null}
          </div>
        ))}
      </div>
    </ToastContext.Provider>
  );
}

export function ToastContainer() {
  return null;
}
