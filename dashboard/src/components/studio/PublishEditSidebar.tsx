"use client";

/**
 * 발행실 오른쪽 사이드바 채팅형 편집 진입점.
 *
 * 2026-09-22 회장 직접 지시(R-23-5): "디스플레이판에는 실제 보이는 그대로를의 컨텐츠
 * 모습을 보여주고 클릭해서 오른쪽 사이드바 채팅 UI 영역에서 수정하는건 어때 이해됨?"
 * 미리보기 안에 있던 하단 별도 필드 묶음(제목·해시태그·주제 태그·첫 댓글)을 없애고,
 * 미리보기 안 해당 요소를 클릭하면 이 사이드바가 열려 그 필드를 고치게 한다.
 *
 * 2026-09-22 교차 코드리뷰(PR #77) N3. 세 번째로 다시 짠다. C1 에서 Context 를
 * 모듈 싱글턴으로 바꿨는데, 그 싱글턴도 렌더 단계에서 공유 변수를 뮤테이트하는
 * 방식이라 React 19 가 렌더를 버리고 다시 시작하면(예: 부모 상태 변화로 중간에
 * 재시도) 버려진 인스턴스가 소유권을 가진 채로 남을 수 있었다. 근본 해법은
 * "카드마다 하나씩" 이 아니라 "발행실에 하나만" 이다. `<PublishEditSidebarMount />`
 * 를 카드(Frame) 안이 아니라 앱 루트 레이아웃(app/layout.tsx, ImagePickerModal·
 * LoginModal·ConfirmHost 와 같은 자리)에 **한 번만** 둔다. 그러면 소유권 경쟁 자체가
 * 존재하지 않는다. 정의상 인스턴스가 하나뿐이라 "누가 담당인가" 를 계산할 필요가
 * 없다. 카드 수만큼 등록되던 keydown 리스너·포커스 트랩도 이제 하나다.
 *
 * 여러 플랫폼 카드가 한 화면에 나열되는데 사이드바는 화면에 하나만 있으면 되므로,
 * 모듈 단위 pub/sub 저장소로 "지금 무엇을 고치는 중인지"를 공유한다.
 */

import { useEffect, useRef, useState, type ReactNode } from "react";
import { usePathname } from "next/navigation";
import { createPortal } from "react-dom";
import { Button } from "@/components/shared/Button";
import { codePointLength, utf8ByteLength, utf16UnitLength, xWeightedLength } from "@/lib/studio/platform-publish-fields";

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
   * 2026-09-22 교차 코드리뷰 M2/J3: shorts 는 UTF-8 바이트, tiktok 은 UTF-16 단위,
   * X 는 트위터 공식 가중 문자로 재는데 사이드바가 전부 코드포인트로 재면서 라벨만
   * 바꿔 달았다. 그 채널의 진짜 계산기를 그대로 쓴다(플랫폼별 함수는 아래
   * UNIT_MEASURE).
   */
  counter?: { limit: number; unit: SidebarCounterUnit };
};

const UNIT_MEASURE: Record<SidebarCounterUnit, (value: string) => number> = {
  "자": codePointLength,
  "가중 문자": xWeightedLength,
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
    // 마운트되는 순간 이미 누군가 연 상태였을 수 있다(예: HMR, 늦은 마운트). 최신값으로 맞춘다.
    setValue(current);
    return () => {
      listeners.delete(listener);
    };
  }, []);
  return value;
}

/**
 * 앱 루트 레이아웃에 정확히 한 번 둔다(app/layout.tsx). 여러 번 두면 다시 C1 이
 * 재발하므로 개발 중 실수로 중복 마운트되는 것을 여기서 한 번 더 막는다: 마운트마다
 * 경고만 남기고(throw 하지 않는다. 화면을 죽이는 것보다 낫다), 실제로 그리는 것은
 * 최초 마운트뿐이다.
 */
let mountCount = 0;

export function PublishEditSidebarMount() {
  const [isPrimary] = useState(() => {
    mountCount += 1;
    if (mountCount > 1 && process.env.NODE_ENV !== "production") {
      // eslint-disable-next-line no-console
      console.error(
        "[PublishEditSidebarMount] 두 번째 이상 마운트됐다. 앱 루트 레이아웃에 정확히 한 번만 둬야 한다(N3, PR #77).",
      );
    }
    return mountCount === 1;
  });
  useEffect(() => () => { mountCount -= 1; }, []);

  const target = useSidebarTarget();
  const pathname = usePathname();
  const [draft, setDraft] = useState("");
  const inputRef = useRef<HTMLTextAreaElement | null>(null);
  const panelRef = useRef<HTMLDivElement | null>(null);
  const previouslyFocused = useRef<Element | null>(null);
  const openedPathname = useRef<string | null>(null);

  useEffect(() => {
    if (target) {
      setDraft(target.value);
      openedPathname.current = pathname;
    }
  }, [target]); // eslint-disable-line react-hooks/exhaustive-deps

  // 2026-09-22 교차 코드리뷰 J4: 발행실을 떠나도 열린 채였던 편집이 닫히지 않으면
  // 언마운트된 화면의 onChange 클로저를 물고 "저장" 이 아무 데도 반영 안 되는데
  // 사용자는 저장된 줄 안다(조용한 실패, ADR-007). 경로가 바뀌면 무조건 닫는다.
  useEffect(() => {
    if (openedPathname.current && openedPathname.current !== pathname) closeFieldEditor();
  }, [pathname]);

  useEffect(() => {
    if (target && inputRef.current) {
      previouslyFocused.current = document.activeElement;
      inputRef.current.focus();
    }
  }, [target]);

  // Escape 로 닫고, 열려 있는 동안 포커스를 패널 밖으로 나가지 않게 가둔다.
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

  if (!isPrimary) return null;
  return <SidebarPanel target={target} draft={draft} setDraft={setDraft} inputRef={inputRef} panelRef={panelRef} />;
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
    /*
      2026-09-22 교차 코드리뷰 MINOR: 전체화면 반투명 배경(backdrop)을 지운다. 회장
      지시는 "왼쪽 미리보기에 바로 반영되는 것을 보면서" 고치는 채팅 사이드바이지,
      배경을 가리는 모달이 아니다. 배경을 덮으면 그 지시와 모순된다. 바깥 클릭으로
      닫는 상호작용도 없앤다. role="dialog"/aria-modal 은 유지해 스크린 리더에게는
      여전히 "이 동안 이 패널이 활성"이라고 말하되, 시각적으로는 미리보기가 계속
      보여야 한다.
    */
    <div
      ref={panelRef}
      data-testid="publish-edit-sidebar"
      data-pv-sidebar-target={`${target.platform}:${target.field}`}
      className="fixed inset-y-0 right-0 z-50 flex w-full max-w-sm flex-col border-l border-border bg-surface shadow-floating sm:w-80"
      role="dialog"
      aria-modal="true"
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
