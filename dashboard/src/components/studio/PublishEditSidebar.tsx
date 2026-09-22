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
 * 모듈 단위 pub/sub 저장소로 "지금 무엇을 고치는 중인지"를 공유한다.
 *
 * 2026-09-22 교차 코드리뷰(PR #77) C1: 처음에는 "이미 한 번 그려졌다" 표시를 React
 * Context 로 했는데, Context 는 Provider 를 감싼 자기 자신의 서브트리에만 보인다.
 * 발행실 카드 7장은 그리드의 **형제** 서브트리라 각 카드가 스스로 Provider 이자 유일한
 * 소비자였다. alreadyMounted 가 항상 false 라 패널이 카드 수만큼(7개) body 에 겹쳐
 * portal 되고, 클릭마다 포커스를 다퉜다. Context 대신 모듈 스코프 싱글턴("누가 패널을
 * 그리는 담당인가")으로 바꾼다. 처음 마운트되는 인스턴스가 담당을 자임하고, 언마운트되면
 * 다음 인스턴스가 넘겨받는다.
 */

import { useEffect, useRef, useState, type ReactNode } from "react";
import { createPortal } from "react-dom";
import { Button } from "@/components/shared/Button";
import { codePointLength, utf8ByteLength, utf16UnitLength } from "@/lib/studio/platform-publish-fields";

export type SidebarFieldKind = "text" | "textarea";
export type SidebarCounterUnit = "자" | "바이트" | "UTF-16 단위" | "가중 문자";

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
  /**
   * 2026-09-22 교차 코드리뷰 M2: shorts 는 UTF-8 바이트, tiktok 은 UTF-16 단위로 재는데
   * 사이드바가 무조건 코드포인트(`[...draft].length`)로 세면서 라벨만 "바이트"를 썼다.
   * 한글 2,000자면 실제 6,000바이트라 사이드바는 2000/5000 으로 안심시키고 발행은
   * 막히는 모순이 났다. 세는 방식을 그 채널의 진짜 잣대로 넘겨받는다.
   */
  counter?: { limit: number; unit: SidebarCounterUnit };
};

const UNIT_MEASURE: Record<SidebarCounterUnit, (value: string) => number> = {
  "자": codePointLength,
  "가중 문자": codePointLength, // X 는 사이드바 실시간 표시에선 근사치(정확한 가중치 계산은 저장 시 validatePlatformPublish 가 최종 판정한다).
  "바이트": utf8ByteLength,
  "UTF-16 단위": utf16UnitLength,
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

// 담당 인스턴스 하나만 실제로 그린다. id 는 마운트마다 새로 받아 두 인스턴스가 동시에
// "내가 담당" 이라고 우기지 않게 한다.
let ownerInstanceId: number | null = null;
let nextInstanceId = 1;

function useSingletonOwnership(): boolean {
  const idRef = useRef<number | null>(null);
  if (idRef.current === null) idRef.current = nextInstanceId++;
  // 2026-09-22 교차 코드리뷰 C1 재수정: useEffect 로 담당을 정하면 형제 카드 7개가 전부
  // "렌더 → 아직 아무도 담당 아님" 상태로 커밋된 뒤에야 effect 가 순서대로 돈다. 그런데
  // useState 초기값은 effect 이전, 렌더 단계에서 한 번에 계산되므로 7개 전부
  // `ownerInstanceId === null` 을 보고 전부 true 를 골라버렸다(문제가 그대로 재발).
  // React 는 같은 커밋 안에서 형제 컴포넌트를 순서대로, 겹치지 않게 렌더한다. 그
  // 성질을 이용해 렌더 도중(effect 이전) 동기적으로 담당을 정한다. ownRef 로 "내가 이미
  // 담당을 시도했는지"를 기억해 재렌더마다 다시 뺏거나 내주지 않는다.
  const ownRef = useRef(false);
  if (!ownRef.current && ownerInstanceId === null) {
    ownerInstanceId = idRef.current;
    ownRef.current = true;
  }

  useEffect(() => {
    const id = idRef.current!;
    return () => {
      if (ownerInstanceId === id) ownerInstanceId = null;
    };
  }, []);

  return ownRef.current;
}

export function PublishEditSidebarMount() {
  const isOwner = useSingletonOwnership();
  const target = useSidebarTarget();
  const [draft, setDraft] = useState("");
  const inputRef = useRef<HTMLTextAreaElement | null>(null);
  const panelRef = useRef<HTMLDivElement | null>(null);
  const previouslyFocused = useRef<Element | null>(null);

  useEffect(() => {
    if (target) setDraft(target.value);
  }, [target]);

  useEffect(() => {
    if (target && inputRef.current) {
      previouslyFocused.current = document.activeElement;
      inputRef.current.focus();
    }
  }, [target]);

  // 미니어처: Escape 로 닫고, 열려 있는 동안 포커스를 패널 밖으로 나가지 않게 가둔다.
  useEffect(() => {
    if (!target) return;
    function onKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape") {
        closeFieldEditor();
        return;
      }
      if (event.key !== "Tab" || !panelRef.current) return;
      const focusable = panelRef.current.querySelectorAll<HTMLElement>(
        'button, [href], input, select, textarea, [tabindex]:not([tabindex="-1"])',
      );
      if (focusable.length === 0) return;
      const first = focusable[0];
      const last = focusable[focusable.length - 1];
      if (event.shiftKey && document.activeElement === first) {
        event.preventDefault();
        last.focus();
      } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault();
        first.focus();
      }
    }
    document.addEventListener("keydown", onKeyDown);
    return () => {
      document.removeEventListener("keydown", onKeyDown);
      if (previouslyFocused.current instanceof HTMLElement) previouslyFocused.current.focus();
    };
  }, [target]);

  if (!isOwner) return null;
  return (
    <SidebarPanel target={target} draft={draft} setDraft={setDraft} inputRef={inputRef} panelRef={panelRef} />
  );
}

function SidebarPanel({
  target,
  draft,
  setDraft,
  inputRef,
  panelRef,
}: {
  target: SidebarEditTarget | null;
  draft: string;
  setDraft: (v: string) => void;
  inputRef: React.MutableRefObject<HTMLTextAreaElement | null>;
  panelRef: React.MutableRefObject<HTMLDivElement | null>;
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
  const measure = target.counter ? UNIT_MEASURE[target.counter.unit] : null;
  const liveCurrent = measure ? measure(draft) : undefined;
  const over = target.counter && liveCurrent !== undefined ? liveCurrent > target.counter.limit : false;

  return createPortal(
    <>
      {/* 바깥 클릭으로 닫는 반투명 배경. 패널 자체 클릭은 버블링을 막아 안 닫는다. */}
      <div
        data-testid="publish-edit-sidebar-backdrop"
        aria-hidden="true"
        onClick={cancel}
        className="fixed inset-0 z-40 bg-player-surface/60"
      />
      <div
        ref={panelRef}
        data-testid="publish-edit-sidebar"
        data-pv-sidebar-target={`${target.platform}:${target.field}`}
        className="fixed inset-y-0 right-0 z-50 flex w-full max-w-sm flex-col border-l border-border bg-surface shadow-floating sm:w-80"
        role="dialog"
        aria-modal="true"
        aria-label={`${target.platformLabel} ${target.fieldLabel} 편집`}
        onClick={(event) => event.stopPropagation()}
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
      </div>
    </>,
    mountNode,
  );
}

/**
 * 미리보기 안 편집 가능 요소를 감싸는 클릭 트리거. 실제 보이는 모습 그대로를 보여주되
 * 클릭(또는 Enter/Space, button 기본 동작)하면 사이드바를 연다.
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
      className={`${className} min-h-control-touch text-left`}
    >
      {children}
    </button>
  );
}
