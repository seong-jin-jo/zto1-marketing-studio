"use client";

/**
 * 발행실 오른쪽 사이드바 채팅형 편집 진입점.
 *
 * 2026-09-22 회장 직접 지시(R-23-5): "디스플레이판에는 실제 보이는 그대로를의 컨텐츠
 * 모습을 보여주고 클릭해서 오른쪽 사이드바 채팅 UI 영역에서 수정하는건 어때 이해됨?"
 * 미리보기 안에 있던 하단 별도 필드 묶음(제목·해시태그·주제 태그·첫 댓글)을 없애고,
 * 미리보기 안 해당 요소를 클릭하면 이 사이드바가 열려 그 필드를 고치게 한다.
 *
 * 여러 플랫폼 카드가 한 화면에 나열되는데 사이드바는 화면에 하나만 있으면 되므로,
 * 모듈 단위 pub/sub 저장소로 "지금 무엇을 고치는 중인지"를 공유한다. 이 컴포넌트를
 * 화면 트리 어디서든(오직 한 번) 마운트하면 클릭한 카드가 어디에 있든 같은 사이드바가
 * 반응한다 — 상위 레이아웃(app/studio/page.tsx)을 고치지 않고도 동작하도록 하는 설계다.
 */

import { createContext, useContext, useEffect, useRef, useState, type ReactNode } from "react";
import { createPortal } from "react-dom";
import { Button } from "@/components/shared/Button";

export type SidebarFieldKind = "text" | "textarea";

export type SidebarEditTarget = {
  platform: string;
  field: string;
  /** 사람이 읽는 필드 이름. 채팅 말풍선 안내에 쓴다. */
  fieldLabel: string;
  /** 채널 이름. "Threads 캡션을 고치는 중" 처럼 안내에 쓴다. */
  platformLabel: string;
  value: string;
  onChange: (next: string) => void;
  kind: SidebarFieldKind;
  placeholder?: string;
  counter?: { current: number; limit: number; unit: string };
};

type Listener = (target: SidebarEditTarget | null) => void;

const listeners = new Set<Listener>();
let current: SidebarEditTarget | null = null;

export function openFieldEditor(target: SidebarEditTarget) {
  current = target;
  listeners.forEach((listener) => listener(current));
}

export function closeFieldEditor() {
  current = null;
  listeners.forEach((listener) => listener(current));
}

function useSidebarTarget(): SidebarEditTarget | null {
  const [value, setValue] = useState<SidebarEditTarget | null>(current);
  useEffect(() => {
    const listener: Listener = (next) => setValue(next);
    listeners.add(listener);
    return () => {
      listeners.delete(listener);
    };
  }, []);
  return value;
}

// 마운트 중복 방지: 여러 PlatformPreview 카드가 저마다 마운트를 시도해도 실제로 보이는
// 패널은 하나여야 한다. React context 로 "이미 한 번 그려졌다" 를 표시한다.
const MountGuardContext = createContext(false);

export function PublishEditSidebarMount() {
  const alreadyMounted = useContext(MountGuardContext);
  const target = useSidebarTarget();
  const [draft, setDraft] = useState("");
  const inputRef = useRef<HTMLTextAreaElement | null>(null);

  useEffect(() => {
    if (target) setDraft(target.value);
  }, [target]);

  useEffect(() => {
    if (target && inputRef.current) inputRef.current.focus();
  }, [target]);

  if (alreadyMounted) return null;
  return (
    <MountGuardContext.Provider value={true}>
      <SidebarPanel target={target} draft={draft} setDraft={setDraft} inputRef={inputRef} />
    </MountGuardContext.Provider>
  );
}

function SidebarPanel({
  target,
  draft,
  setDraft,
  inputRef,
}: {
  target: SidebarEditTarget | null;
  draft: string;
  setDraft: (v: string) => void;
  inputRef: React.MutableRefObject<HTMLTextAreaElement | null>;
}) {
  const [mountNode, setMountNode] = useState<HTMLElement | null>(null);
  useEffect(() => {
    setMountNode(document.body);
  }, []);
  if (!mountNode || !target) return null;

  const save = () => {
    target.onChange(draft);
    closeFieldEditor();
  };
  const cancel = () => closeFieldEditor();
  const over = target.counter ? target.counter.current > target.counter.limit : false;
  const liveCurrent = target.counter ? [...draft].length : undefined;

  return createPortal(
    <div
      data-testid="publish-edit-sidebar"
      data-pv-sidebar-target={`${target.platform}:${target.field}`}
      className="fixed inset-y-0 right-0 z-50 flex w-full max-w-xs flex-col border-l border-border bg-surface shadow-lg sm:w-80"
      role="dialog"
      aria-label={`${target.platformLabel} ${target.fieldLabel} 편집`}
    >
      <div className="flex items-center justify-between border-b border-border p-stack">
        <b className="text-body-sm text-text">{target.platformLabel} · {target.fieldLabel} 편집</b>
        <Button
          data-testid="publish-edit-sidebar-close"
          aria-label="편집 닫기"
          onClick={cancel}
          size="sm"
          className="min-w-control-touch text-subtle"
        >
          ×
        </Button>
      </div>
      <div className="flex-1 overflow-y-auto p-stack">
        {/* 채팅형 안내 말풍선: 지금 무엇을 고치는 중인지 먼저 말한다. */}
        <div className="mb-stack rounded-surface bg-surface-2 px-stack py-stack-tight text-body-sm text-text">
          {target.platformLabel}의 {target.fieldLabel}을(를) 여기서 고칠 수 있어요. 저장하면 왼쪽 미리보기에 바로 반영됩니다.
        </div>
      </div>
      <div className="border-t border-border p-stack">
        {target.kind === "textarea" ? (
          <textarea
            ref={inputRef}
            data-testid="publish-edit-sidebar-input"
            aria-label={`${target.platformLabel} ${target.fieldLabel}`}
            value={draft}
            placeholder={target.placeholder}
            rows={4}
            onChange={(event) => setDraft(event.target.value)}
            className="w-full rounded-control border border-border bg-surface px-stack py-stack-tight text-body text-text focus:border-accent"
          />
        ) : (
          <input
            ref={inputRef as unknown as React.MutableRefObject<HTMLInputElement | null>}
            data-testid="publish-edit-sidebar-input"
            aria-label={`${target.platformLabel} ${target.fieldLabel}`}
            value={draft}
            placeholder={target.placeholder}
            onChange={(event) => setDraft(event.target.value)}
            className="w-full rounded-control border border-border bg-surface px-stack py-stack-tight text-body text-text focus:border-accent"
          />
        )}
        <div className="mt-stack-tight flex items-center justify-between">
          {target.counter ? (
            <span data-testid="publish-edit-sidebar-counter" className={`text-caption ${over ? "text-danger" : "text-subtle"}`}>
              {liveCurrent}/{target.counter.limit} {target.counter.unit}
            </span>
          ) : <span />}
          <div className="flex gap-stack-tight">
            <Button onClick={cancel} size="sm" variant="secondary">취소</Button>
            <Button data-testid="publish-edit-sidebar-save" onClick={save} size="sm" variant="primary">저장</Button>
          </div>
        </div>
      </div>
    </div>,
    mountNode,
  );
}

/**
 * 미리보기 안 편집 가능 요소를 감싸는 클릭 트리거. 실제 보이는 모습 그대로를 보여주되
 * 클릭(또는 Enter/Space)하면 사이드바를 연다. button role 로 키보드 접근을 보장한다.
 */
export function EditTrigger({
  target,
  className,
  children,
  testId,
  disabled,
}: {
  target: SidebarEditTarget;
  className: string;
  children: ReactNode;
  testId: string;
  disabled?: boolean;
}) {
  return (
    <button
      type="button"
      data-testid={testId}
      data-pv-target={`${target.platform}:${target.field}`}
      aria-label={`${target.platformLabel} ${target.fieldLabel} 편집 열기`}
      onClick={() => openFieldEditor(target)}
      disabled={disabled}
      className={`${className} text-left`}
    >
      {children}
    </button>
  );
}
