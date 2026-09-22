"use client";

import { useEffect, useRef, useState } from "react";
import { DeliveredMedia } from "@/components/studio/DeliveredMedia";
import {
  PLATFORM_FIELD_CONTRACT,
  validatePlatformPublish,
  type PlatformPublishValidation,
} from "@/lib/studio/platform-publish-fields";

export interface PreviewText {
  threads?: string; facebook?: string; x?: string;
  instagram?: { caption?: string; hashtags?: string[]; slides?: string[] };
  shorts?: { hook?: string; body?: string; cta?: string };
}
export interface PreviewMedia { imgUrl?: string; imgUrls?: string[]; vidUrl?: string }
export type PreviewPlatform = "threads" | "x" | "instagram" | "facebook" | "shorts" | "reels" | "tiktok";

export type PreviewAccount = {
  status: "loading" | "connected" | "missing" | "error" | "unsupported";
  displayName?: string;
  username?: string;
};

export interface PreviewInlineEditor {
  account: PreviewAccount;
  title: string;
  caption: string;
  hashtags: string;
  topicTag: string;
  firstComment: string;
  firstCommentSupported: boolean;
  firstCommentReason?: string;
  onTitleChange: (value: string) => void;
  onCaptionChange: (value: string) => void;
  onHashtagsChange: (value: string) => void;
  onTopicTagChange: (value: string) => void;
  onFirstCommentChange: (value: string) => void;
}

export const PREVIEW_PLATFORMS: { key: PreviewPlatform; label: string }[] = [
  { key: "threads", label: "Threads" }, { key: "x", label: "X" },
  { key: "instagram", label: "Instagram" }, { key: "facebook", label: "Facebook" },
  { key: "shorts", label: "Shorts" }, { key: "reels", label: "Reels" }, { key: "tiktok", label: "TikTok" },
];

// 모든 플랫폼 미리보기 가로폭 통일. 높이는 콘텐츠와 비율대로 두어 잘림을 막는다.
export function Logo({ p }: { p: PreviewPlatform }) {
  const c = "w-5 h-5 text-accent";
  if (p === "threads") return <svg className={c} viewBox="0 0 192 192" fill="currentColor"><path d="M141.5 89a66 66 0 00-2.5-1.1c-1.5-27.3-16.4-42.9-41.5-43.1h-.4c-15 0-27.7 6.5-35.2 18l12.6 8.7c5.6-8.4 14.4-11.2 22.6-11.2h.3c8.7.1 15.3 2.6 19.6 7.5 3.1 3.6 5.2 8.6 6.2 14.9a84 84 0 00-24.5-2.3c-28 1.6-46 17.2-44.8 38.8.6 11.1 6.3 20.6 16.1 26.8 8.2 5.3 18.9 7.9 29.9 7.3 14.6-.8 26-6.4 34-16.7 6-7.8 9.9-17.8 11.7-30.2 7.1 4.3 12.3 9.9 15.3 16.7 5 11.6 5.3 30.7-10.4 46.5-13.8 13.8-30.5 19.8-52.5 20-24.4-.2-42.9-8-54.8-23.2C39.3 152.6 32.9 132.4 32.7 108c.2-24.4 6.6-44.6 19.2-60.1C63.8 32.6 82.2 24.8 106.7 24.6c24.6.2 43.3 8 55.6 23.3 6 7.5 10.6 16.6 13.6 27.3l14.9-3.9c-3.5-12.5-9-23.4-16.2-32.4C159.4 20.3 137.1 10.8 106.7 10.6h-.1C76.3 10.8 54.3 20.3 39.5 39.1 23.5 59.5 15.4 86.8 15.1 108v.3c.2 21.2 8.3 48.5 24.4 68.9 14.8 18.8 36.8 28.3 67.1 28.5h.1c26-.2 46.6-8.1 63.3-24.2 22.1-21.4 21.5-47.6 14.6-63.4-5-11.4-14.5-20.5-27.1-26.1z"/></svg>;
  if (p === "x") return <svg className={c} viewBox="0 0 24 24" fill="currentColor"><path d="M18.9 1.2h3.7l-8 9.1L24 22.8h-7.4l-5.8-7.6-6.6 7.6H.5l8.6-9.8L0 1.2h7.6l5.2 6.9zM17.6 20.6h2L6.5 3.3H4.3z"/></svg>;
  if (p === "facebook") return <svg className={c} viewBox="0 0 24 24" fill="currentColor"><path d="M24 12a12 12 0 10-13.9 11.9v-8.4H7v-3.5h3.1V9.4c0-3 1.8-4.7 4.5-4.7 1.3 0 2.7.2 2.7.2v3h-1.5c-1.5 0-2 .9-2 1.9v2.2h3.4l-.5 3.5h-2.9v8.4A12 12 0 0024 12z"/></svg>;
  if (p === "instagram") return <svg className={c} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><rect x="2" y="2" width="20" height="20" rx="6"/><circle cx="12" cy="12" r="4.5"/><circle cx="17.5" cy="6.5" r="1.3" fill="currentColor" stroke="none"/></svg>;
  if (p === "shorts") return <svg className={c} viewBox="0 0 24 24"><rect x="6" y="2" width="12" height="20" rx="5" fill="currentColor"/><path d="M10 8.5l5 3.5-5 3.5z" fill="var(--accent-fg)"/></svg>;
  if (p === "reels") return <svg className={c} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><rect x="3" y="3" width="18" height="18" rx="5"/><path d="M3 8h18M8 3l2 5M13 3l2 5"/><path d="M10 11.5l4 2.5-4 2.5z" fill="currentColor" stroke="none"/></svg>;
  return <svg className={c} viewBox="0 0 24 24" fill="currentColor"><path d="M16 3c.3 2.3 1.8 4.1 4 4.4v3c-1.5 0-2.9-.4-4.1-1.2v6.1a5.7 5.7 0 11-5.7-5.7c.3 0 .6 0 .9.1v3.1a2.7 2.7 0 102 2.6V3z"/></svg>;
}

/**
 * 계정 배지: 미리보기 머리줄 안에 붙는다.
 *
 * 2026-09-22 회장 질문(R-23-4): "컨텐츠 밑에 '읽기 전용' 으로 되어있는 계정정보는 왜
 * 필요한거?" 전에는 이 정보가 카드 아래쪽에 테두리 있는 카드로 따로 떠 있었다. 미리보기
 * 머리줄에 이미 핸들이 나오는데 같은 정보가 두 번 보이면서 세로 공간만 먹고, 같은 줄
 * 카드끼리 높이를 어긋나게 만드는 원인 중 하나였다(§ Frame 주석). 실측(2026-09-22, 폭
 * 1792)에서 같은 줄 카드 편집 칸 시작점이 최대 80px 차이 났다. 중복 블록을 없애고 머리줄에
 * 한 줄로 합친다. 미연결·오류는 조용히 사라지지 않고 경고 배지로 남는다(ADR-007).
 */
function AccountBadge({ platform, account }: { platform: PreviewPlatform; account: PreviewAccount }) {
  if (account.status === "connected") {
    const username = account.username?.replace(/^@/, "");
    return (
      <span
        data-testid={`preview-account-${platform}`}
        data-account-state="connected"
        className="inline-flex min-w-0 max-w-full items-center gap-micro rounded-pill bg-surface-2 px-stack-tight py-micro text-caption text-subtle"
        title={account.displayName || username}
      >
        <span className="truncate">@{username || account.displayName || "연결 계정"}</span>
      </span>
    );
  }
  const statusLabel = account.status === "loading"
    ? "연결 계정 확인 중"
    : account.status === "error"
      ? "연결 계정을 확인하지 못했습니다"
      : account.status === "unsupported"
        ? "이 플랫폼 발행은 아직 지원하지 않습니다"
        : "연결된 계정이 없습니다";
  const isWarning = account.status !== "loading";
  return (
    <span
      data-testid={`preview-account-${platform}`}
      data-account-state={account.status}
      className={`inline-flex min-w-0 max-w-full items-center gap-micro rounded-pill px-stack-tight py-micro text-caption ${isWarning ? "bg-warning-soft text-warning" : "bg-surface-2 text-subtle"}`}
    >
      <span className="truncate">{statusLabel}</span>
    </span>
  );
}

function Frame({ p, label, children, headerRight, characterCount, account }: {
  p: PreviewPlatform;
  label: string;
  children: React.ReactNode;
  headerRight?: React.ReactNode;
  characterCount?: { current: number; limit: number };
  account?: PreviewAccount;
}) {
  return (
    /*
      2026-09-09 회장 지적: "발행실에서는 스레드는 컴포넌트 위치가 왜 살짝 아래로 내려갔냐."
      실측하니 편집 칸 시작점이 채널마다 달랐다.

      2026-09-22 교차 코드리뷰 C3(PR #77). 두 번째 진단이 틀렸던 이유와 진짜 원인.
      처음엔 "부모 그리드 셀에 h-full 이 없다" 로 짚었는데 틀렸다: 그 래퍼는 이미 CSS
      그리드 항목이고 grid 의 기본값 align-items:stretch 가 행 높이만큼 늘려준다. h-full
      한 줄이 없어도 이미 늘어나 있었다. 게다가 그때 여기 붙인 self-stretch 는 **세로로
      쌓는 flex-col 의 교차축(가로)에만 영향**을 주는 속성이라 세로 정렬에는 애초에
      아무 효과가 없는 무의미한 코드였다(둘 다 반성하고 지운다).

      진짜 원인은 다른 데 있었다: Frame 을 h-full 로 고정하고 그 안 미리보기 영역을
      flex-1 로 "남는 높이를 채우게" 만들면, 카드 총 높이가 고정값이 되고 편집 칸
      (PublishMetaTriggers)은 자연스러운 자기 높이만큼만 차지한다. 그러면 편집 칸의
      top 좌표는 정확히 "고정된 카드 높이 − 편집 칸 자신의 높이" 가 된다. **미리보기
      내용 길이는 이 계산에서 아예 빠진다.** 채널마다 편집 칸에 뜨는 칩 개수가 달라
      (threads·x 는 0개, facebook 은 첫 댓글 칩 1개, shorts 는 예전엔 제목까지 포함)
      편집 칸 자신의 높이가 서로 달랐고, 그래서 top 좌표가 어긋났다. 카드 총 높이를
      맞추는 접근 자체가 잘못이었다.

      고친 방식: 카드 높이를 강제로 맞추지 않는다(h-full 제거). 대신
      ①미리보기 영역 자체를 채널 형태별로 고정 비율/높이로 만들고(사진·영상은 이미
      aspect-*, 글 채널은 본문을 line-clamp 로 캡핑, ②헤더를 한 줄 고정(M1)
      ③편집 칸이 항상 같은 칩 구성을 갖게 한다(C2 수정 + 첫 댓글 미지원도 자리 유지).
      그러면 편집 칸의 top = 헤더 높이 + 미리보기 높이가 되고, 이 둘이 채널군 안에서
      균일하므로 top 도 균일해진다. 총 카드 높이가 채널마다 달라도 상관없다. 회장이
      요구한 건 "편집 칸이 같은 줄에서 시작"이지 카드 전체 높이 일치가 아니다.

      2026-09-22 교차 코드리뷰(PR #77) 재반려. 회장이 9444 운영 main(폭 1792)에서 직접
      잰 진짜 기계적 원인: 카드 머리줄 자체의 높이가 채널마다 44/72/124px 로 갈렸다.
      원인은 headerRight(발행 체크박스·"대문 N초"·계정 연결/관리 링크. 채널마다 있고
      없고가 갈린다)가 아이콘+라벨과 **같은 줄**에 flex-wrap 으로 들어가 폭 384px 안에서
      1~3줄로 감겼기 때문이다. 위 ①②③(line-clamp·420px 상자)으로 잡으려던 건 이 원인
      옆의 부차적 변수(본문 길이)였을 뿐, 진짜 지배 변수(헤더 줄바꿈)를 안 건드렸다.
      headerRight 를 아이콘/라벨 줄에서 완전히 분리해 별도 줄로 둔다.

      2026-09-22 교차 코드리뷰 4라운드: 3라운드에서 그 줄에 max-h+overflow-y-auto 로
      상한을 씌웠는데, 실측 최대치(124px)보다 낮은 112px 로 잘못 잡아 reels·tiktok 의
      "계정 관리"·"계정 연결하기" 같은 주 조작면이 스크롤 뒤로 숨었다. 420px 상자(N2)에
      이어 두 번째로 조작면을 가린 것이다. 상한으로 자르는 접근 자체를 버린다. 이제는
      **하한만** 준다(overflow 제한 없음). 짧은 카드는 하한까지 채워 키를 맞추고, 긴
      카드는 잘리지 않고 자연스럽게 더 자란다. 완벽한 픽셀 일치가 아니라 "조작면이
      절대 숨지 않는다"를 우선한다. headerRight 의 실제 구성(대문 시점 컨트롤·계정
      연결/관리 형태)을 채널마다 갖게 만드는 근본 해법은 그 JSX 를 만드는
      app/studio/page.tsx 의 몫이라 이번 위임 범위(그 파일 편집 금지) 밖임을 PR 에
      회수로 남긴다.
    */
    <div className="flex w-full max-w-sm flex-col" data-preview-card={p}>
      {/*
        2026-09-05 회장 계정 실측(폭 430): 이 머리줄이 담긴 칸보다 18픽셀 넓어져 오른쪽
        끝의 발행 토글과 계정 관리가 잘렸다. 문서 가로 스크롤은 0이라 겉으로는 멀쩡해
        보이지만 조작할 수 없는 단추가 생긴다. 좁으면 줄을 바꾸게 한다.
      */}
      <div className="flex flex-wrap items-center gap-stack-tight px-micro">
        <Logo p={p} />
        <span className="shrink-0 whitespace-nowrap text-caption font-bold text-muted">{label}</span>
        {characterCount && (
          <span
            data-testid={`character-count-${p}`}
            className={`ml-auto shrink-0 text-caption ${characterCount.current > characterCount.limit ? "text-danger" : "text-subtle"}`}
          >
            {characterCount.current}/{characterCount.limit}
          </span>
        )}
      </div>
      {/*
        2026-09-22 교차 코드리뷰 M1(1차): 배지를 위 줄(icon+label)에 같이 넣으면 핸들
        길이·미지원 문구 길이가 채널마다 달라 그 줄이 2줄로 감기는 카드와 1줄인 카드가
        섞였다. 배지를 별도의 고정 한 줄로 뺀다.
      */}
      {account ? (
        <div className="mb-stack-tight min-h-control-touch px-micro">
          <AccountBadge platform={p} account={account} />
        </div>
      ) : null}
      {/*
        2026-09-22 교차 코드리뷰 4라운드: headerRight(발행 체크박스·대문 시점·계정
        연결/관리)를 독립된 줄로 뺀다. min-height 만 주고 max-height·overflow 제한은
        두지 않는다. 어떤 채널의 내용도 절대 숨지 않는다.
      */}
      {headerRight ? (
        <div className="mb-stack-tight min-h-control-touch px-micro" data-preview-header-controls={p}>
          <div className="flex flex-wrap items-center gap-stack-tight">{headerRight}</div>
        </div>
      ) : null}
      <div className="flex flex-1 flex-col">{children}</div>
    </div>
  );
}

function Counter({ validation, field }: { validation: PlatformPublishValidation; field: "title" | "body" | "topicTag" }) {
  const counter = validation.counters[field];
  if (!counter) return null;
  const invalid = counter.current > counter.limit;
  return <span className={invalid ? "text-caption text-danger" : "text-caption text-subtle"}>{counter.current}/{counter.limit} {counter.unit}</span>;
}

/**
 * 미리보기 안의 본문을 그 자리에서 고친다.
 *
 * 2026-09-09 회장 지적: "텍스트면 텍스트 미리보기 화면 자체에서 본문 수정해야지 왜 별도로
 * 수정을해." 종전에는 미리보기가 본문을 읽기 전용으로 보여 주고, 그 아래 따로 붙은 칸에서
 * 같은 본문을 고쳤다. 같은 글이 두 번 보이고, 고치는 곳과 결과를 보는 곳이 떨어져 있었다.
 * 사업계획 §3.2 도 편집실 최우선 과제로 "미리보기와 최종 일치" 를 꼽았다. 고치는 자리가
 * 곧 보는 자리면 어긋날 수가 없다.
 *
 * contentEditable 을 쓰되 값은 처음 한 번만 넣는다. 타이핑할 때마다 React 가 내용을 다시
 * 그리면 커서가 맨 앞으로 튄다. 밖에서 값이 바뀐 경우(다른 곳에서 고쳤거나 초안을 불러온
 * 경우)에만 화면을 맞춘다.
 */
// 미리보기 안에서 본문을 직접 고치는 형식. 이 목록에 있으면 아래 캡션 칸을 두지 않는다.
const BODY_EDITABLE_IN_PREVIEW = new Set<PreviewPlatform>(["threads", "x", "facebook", "instagram"]);
// 첫 댓글을 미리보기 답글 자리에서 고치는 형식. 나머지는 아래 칸이 유일한 입구다.
const FIRST_COMMENT_IN_PREVIEW = new Set<PreviewPlatform>(["threads"]);

function EditablePreviewBody({
  value, onChange, className, placeholder, testId, label, locked = false,
}: {
  value: string;
  onChange?: (next: string) => void;
  className: string;
  placeholder: string;
  testId: string;
  /** 스크린 리더와 테스트가 이 자리를 부르는 이름. 플랫폼별 캡션이다. */
  label: string;
  /** 계정을 아직 못 불러온 동안에는 잠근다. 그때 고친 값은 어느 계정으로 갈지 알 수 없다. */
  locked?: boolean;
}) {
  const ref = useRef<HTMLParagraphElement | null>(null);
  useEffect(() => {
    const node = ref.current;
    if (!node) return;
    // 지금 손이 올라가 있는 동안에는 건드리지 않는다. 커서가 튄다.
    if (document.activeElement === node) return;
    if (node.textContent !== value) node.textContent = value;
  }, [value]);

  if (!onChange || locked) {
    return (
      <p className={className} aria-label={label} data-testid={testId} aria-disabled={locked || undefined}>
        {value || <span className="text-subtle">{placeholder}</span>}
      </p>
    );
  }
  return (
    <p
      ref={ref}
      data-testid={testId}
      data-preview-body-editable
      contentEditable
      suppressContentEditableWarning
      role="textbox"
      aria-multiline="true"
      aria-label={label}
      spellCheck={false}
      onInput={(event) => onChange(event.currentTarget.textContent ?? "")}
      className={`${className} rounded-control outline-none focus:bg-accent-soft/20 hover:bg-surface-2 ${value ? "" : "text-subtle"}`}
    >
      {value || placeholder}
    </p>
  );
}

/**
 * 발행실 카드 하단의 메타 편집 입력 칸.
 *
 * 2026-09-22 교차 코드리뷰(PR #77) 4라운드. 오른쪽 사이드바 채팅형 편집(PublishEditSidebar)
 * 을 이 브랜치에서 뺀다. 세 라운드 연속으로 "카드마다 하나씩 뜨는 전역 패널" 의 싱글턴이
 * 깨졌다(C1: Context 서브트리 오판, N3: 렌더 단계 뮤테이션이 React 19/StrictMode/SSR 에서
 * 또 깨짐). 사이드바는 별도 브랜치(feat/publish-edit-sidebar)에서 다시 설계하고, 이
 * 브랜치는 검증된 인라인 입력 칸으로 되돌려 확실한 것부터 내보낸다. 미리보기 안에서 이미
 * 직접 고칠 수 있는 것(BODY_EDITABLE_IN_PREVIEW·threads 주제 태그·threads 첫 댓글)은 그
 * 자리가 유일한 입구이므로 여기서 다시 만들지 않는다.
 */
function PublishMetaFields({ platform, editor }: { platform: PreviewPlatform; editor: PreviewInlineEditor }) {
  const contract = PLATFORM_FIELD_CONTRACT[platform];
  const validation = validatePlatformPublish(platform, {
    title: editor.title,
    body: editor.caption,
    hashtags: editor.hashtags,
    topicTag: editor.topicTag,
  });
  const loading = editor.account.status === "loading";
  const inlineClass = "mt-micro min-h-control-touch w-full rounded-control border border-transparent bg-transparent px-stack text-body text-text underline decoration-accent/40 underline-offset-4 focus:border-accent focus:bg-surface focus:no-underline";
  // 세로 영상 세 채널은 제목·해시태그를 미리보기 오버레이 안 클릭 가능 요소로 이미 연다
  // (PlatformPreview 영상 분기). 여기 또 두면 같은 값을 고치는 입구가 두 개가 된다.
  const isVideoPlatform = platform === "shorts" || platform === "reels" || platform === "tiktok";
  const needsHashtagField = contract.hashtags && !BODY_EDITABLE_IN_PREVIEW.has(platform) && !isVideoPlatform;
  const firstCommentInline = FIRST_COMMENT_IN_PREVIEW.has(platform);
  // 2026-09-22 교차 코드리뷰 C3 정리 중 발견한 별개 결함: 예전 식은 threads 처럼 미리보기
  // 안에서 이미 첫 댓글을 고치는 채널까지 "미지원" 문구를 냈다. "미지원"은 그 채널
  // 어댑터가 실제로 첫 댓글을 못 붙일 때만 써야 한다(editor.firstCommentSupported === false).
  const needsFirstCommentField = contract.firstComment && !firstCommentInline && editor.firstCommentSupported;
  const firstCommentUnsupported = contract.firstComment && !firstCommentInline && !editor.firstCommentSupported;

  return (
    <div className="mt-stack border-t border-border pt-stack" data-testid={`inline-editor-${platform}`} data-pub-fields={platform}>
      {/*
        세로 영상 세 채널은 미리보기 안에 본문(설명/캡션)을 고칠 자리가 없다(오버레이에는
        읽기 전용 요약만 뜬다). 여기가 유일한 입구다.
      */}
      {isVideoPlatform ? (
        <label className="mt-stack block text-caption text-muted">
          <span className="flex items-center justify-between gap-stack-tight">{contract.bodyLabel} <Counter validation={validation} field="body" /></span>
          <textarea
            aria-label={`${platform} ${contract.bodyLabel}`}
            data-pv-inline-edit={`${platform}:caption`}
            value={editor.caption}
            onChange={(event) => editor.onCaptionChange(event.target.value)}
            disabled={loading}
            rows={3}
            className={`${inlineClass} p-stack`}
          />
        </label>
      ) : null}
      {contract.title && !isVideoPlatform ? (
        <label className="mt-stack block text-caption text-muted">
          <span className="flex items-center justify-between gap-stack-tight">제목 <Counter validation={validation} field="title" /></span>
          <input
            aria-label={`${platform} 제목`}
            data-pv-inline-edit={`${platform}:title`}
            value={editor.title}
            onChange={(event) => editor.onTitleChange(event.target.value)}
            disabled={loading}
            className={inlineClass}
          />
        </label>
      ) : null}
      {needsHashtagField ? (
        <label className="mt-stack block text-caption text-muted">
          해시태그
          <input
            aria-label={`${platform} 해시태그`}
            data-pv-inline-edit={`${platform}:hashtags`}
            value={editor.hashtags}
            onChange={(event) => editor.onHashtagsChange(event.target.value)}
            disabled={loading}
            placeholder="#해시태그"
            className={inlineClass}
          />
        </label>
      ) : null}
      {needsFirstCommentField ? (
        <label className="mt-stack block text-caption text-muted">
          첫 댓글
          <textarea
            aria-label={`${platform} 첫 댓글`}
            data-pv-inline-edit={`${platform}:firstComment`}
            value={editor.firstComment}
            onChange={(event) => editor.onFirstCommentChange(event.target.value)}
            disabled={loading}
            rows={2}
            placeholder="본문 아래 첫 댓글로 올릴 말"
            className={`${inlineClass} p-stack`}
          />
        </label>
      ) : firstCommentUnsupported ? (
        <div className="mt-stack rounded-control border border-border bg-surface-2 p-stack text-caption text-subtle">
          첫 댓글 미지원: {editor.firstCommentReason || "현재 채널 어댑터가 지원하지 않습니다"}
        </div>
      ) : null}
      {loading ? <p className="mt-stack text-caption text-subtle">연결 계정을 확인하는 동안에는 편집을 잠급니다.</p> : null}
      {validation.blocking.map((issue) => <p key={`${issue.field}-${issue.message}`} className="mt-stack text-caption text-danger" role="alert">{issue.message}</p>)}
      {validation.warnings.map((issue) => <p key={`${issue.field}-${issue.message}`} className="mt-stack text-caption text-warning">{issue.message}</p>)}
    </div>
  );
}

function Av({ s = 40 }: { s?: 32 | 36 | 40 }) {
  const size = s === 32 ? "h-8 w-8" : s === 36 ? "h-9 w-9" : "h-10 w-10";
  return <div className={`${size} rounded-pill shrink-0 bg-accent`} />;
}
const P = (d: string, f = false) => <svg className="w-[18px] h-[18px]" fill={f ? "currentColor" : "none"} stroke="currentColor" strokeWidth={1.7} viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" d={d} /></svg>;
const I = {
  heart: "M4.318 6.318a4.5 4.5 0 000 6.364L12 20.364l7.682-7.682a4.5 4.5 0 00-6.364-6.364L12 7.636l-1.318-1.318a4.5 4.5 0 00-6.364 0z",
  chat: "M7.5 8.25h9m-9 3H12m8.25 1.5a8.25 8.25 0 11-3.31-6.6L21 4.5v6.75h-6.75",
  repost: "M7.5 21L3 16.5m0 0L7.5 12M3 16.5h13.5M16.5 3L21 7.5m0 0L16.5 12M21 7.5H7.5",
  send: "M6 12L3.27 3.27a.5.5 0 01.7-.6l16.5 8.25a.5.5 0 010 .9L3.97 20.07a.5.5 0 01-.7-.6L6 12zm0 0h6",
  share: "M7.217 10.907a2.25 2.25 0 100 2.186m0-2.186c.18.324.283.696.283 1.093s-.103.77-.283 1.093m0-2.186l9.566-5.314m-9.566 7.5l9.566 5.314",
  bookmark: "M17.593 3.322c1.1.128 1.907 1.077 1.907 2.185V21L12 17.25 4.5 21V5.507c0-1.108.806-2.057 1.907-2.185a48.507 48.507 0 0111.186 0z",
  more: "M6.75 12a.75.75 0 11-1.5 0 .75.75 0 011.5 0zM12.75 12a.75.75 0 11-1.5 0 .75.75 0 011.5 0zM18.75 12a.75.75 0 11-1.5 0 .75.75 0 011.5 0z",
};

/**
 * 여러 장 이미지를 좌우로 넘겨 보는 캐러셀. 원래 Instagram 전용(IgCarousel)이었는데
 * R-23-6("카드뉴스는 여러장 넘기는것도 고려된거지?")에 따라 여러 장을 가질 수 있는
 * 어떤 채널(Threads·Facebook·X)에서도 쓰도록 플랫폼 중립으로 승격했다.
 */
function MediaCarousel({ cards, tenantId, testId, aspect = "aspect-square" }: {
  cards: { type: "img" | "text"; v: string }[];
  tenantId?: string;
  testId: string;
  /** 세로 영상은 9:16, 카드뉴스는 정사각이 실제 발행 비율에 가깝다. */
  aspect?: string;
}) {
  const [i, setI] = useState(0);
  const n = cards.length; const cur = cards[i];
  return (
    <div className={`relative bg-surface ${aspect}`} data-media-carousel={testId}>
      {n === 0 ? <div className="w-full h-full grid place-items-center text-subtle text-body-sm">카드 생성 대기</div>
        : cur.type === "img" ? <DeliveredMedia type="image" src={cur.v} tenantId={tenantId} testId={testId} className="w-full h-full object-cover" />
        : <div className="w-full h-full grid place-items-center p-region bg-accent-soft"><p className="text-accent text-subheading font-bold text-center leading-snug">{cur.v}</p></div>}
      {n > 1 && <>
        <button type="button" aria-label="이전 카드" onClick={(e) => { e.stopPropagation(); setI((x) => (x - 1 + n) % n); }} className="absolute left-stack-tight top-1/2 min-h-control-touch min-w-control-touch -translate-y-1/2 rounded-pill bg-text text-bg">‹</button>
        <button type="button" aria-label="다음 카드" onClick={(e) => { e.stopPropagation(); setI((x) => (x + 1) % n); }} className="absolute right-stack-tight top-1/2 min-h-control-touch min-w-control-touch -translate-y-1/2 rounded-pill bg-text text-bg">›</button>
        <span data-testid={`${testId}-index`} aria-live="polite" className="absolute top-3 right-3 text-caption text-text bg-player-surface/50 px-stack-tight py-micro rounded-pill">{i + 1}/{n}</span>
        {/*
          2026-09-22 교차 코드리뷰 MINOR: role="tab" 을 쓰면서 대응하는 tabpanel·
          aria-controls 가 없어 부정확한 ARIA 였다(진짜 탭 위젯이 아니라 캐러셀 위치
          표시다). role="group" + aria-current 로 바꾼다. 점 자체(h-1.5 w-1.5)는
          시각 크기만 유지하고, 조작면은 min-h/min-w-control-touch 인 투명 버튼으로
          감싸 44px 히트 영역을 확보한다(DESIGN.md 「보이는 표식과 조작면 분리」).
        */}
        <div role="group" aria-label="카드 선택" className="absolute bottom-3 left-0 right-0 flex justify-center gap-stack-tight">
          {cards.map((_, k) => (
            <button
              key={k}
              type="button"
              aria-current={k === i}
              aria-label={`${k + 1}번째 카드로 이동`}
              onClick={(e) => { e.stopPropagation(); setI(k); }}
              className="flex min-h-control-touch min-w-control-touch items-center justify-center"
            >
              <span aria-hidden="true" className={`h-1.5 w-1.5 rounded-pill ${k === i ? "bg-accent" : "bg-surface/50"}`} />
            </button>
          ))}
        </div>
      </>}
    </div>
  );
}

function VideoRail({ kind }: { kind: "shorts" | "reels" | "tiktok" }) {
  return (
    <div className="absolute right-2 bottom-24 flex flex-col items-center gap-pad-inset text-text drop-shadow z-10">
      {kind === "tiktok" && <div className="relative mb-micro"><Av s={36} /><span className="absolute -bottom-1.5 left-1/2 -translate-x-1/2 w-4 h-4 rounded-pill bg-danger text-bg grid place-items-center text-caption">+</span></div>}
      <div className="flex flex-col items-center">{P(I.heart, true)}<span className="text-caption mt-micro">12.4K</span></div>
      <div className="flex flex-col items-center">{P(I.chat)}<span className="text-caption mt-micro">318</span></div>
      {kind === "tiktok" ? <div className="flex flex-col items-center">{P(I.bookmark)}<span className="text-caption mt-micro">1.2K</span></div>
        : <div className="flex flex-col items-center">{P(I.send)}<span className="text-caption mt-micro">공유</span></div>}
    </div>
  );
}

// tenantId: 만료된 배달 주소를 되살릴 때 어느 작업 공간으로 다시 서명할지 알려 준다. 운영자
// 토큰으로 들어온 요청은 본문의 tenant_id 가 유일한 단서라 이것이 없으면 401 로 닫힌다
// (tenant-auth.ts effectiveTenantId). 2026-09-13 Codex 교차리뷰 지적.
export function PlatformPreview({ platform, text, media, headerRight, editor, tenantId }: { platform: PreviewPlatform; text: PreviewText; media: PreviewMedia; headerRight?: React.ReactNode; editor?: PreviewInlineEditor; tenantId?: string }) {
  const handle = (editor?.account.username || editor?.account.displayName || "연결 계정 없음").replace(/^@/, "");
  const images = media.imgUrls?.filter(Boolean).length ? media.imgUrls.filter(Boolean) : media.imgUrl ? [media.imgUrl] : [];
  const img = images[0]; const vid = media.vidUrl;
  const label = PREVIEW_PLATFORMS.find((x) => x.key === platform)?.label || platform;
  const previewBody = platform === "threads"
    ? text.threads || ""
    : platform === "facebook"
      ? text.facebook || ""
      : platform === "x"
        ? text.x || ""
        : platform === "instagram"
          ? text.instagram?.caption || ""
          : "";
  const validation = editor ? validatePlatformPublish(platform, { title: editor.title, body: editor.caption, hashtags: editor.hashtags, topicTag: editor.topicTag }) : null;
  const bodyCounter = validation?.counters.body;
  /*
    2026-09-22 교차 코드리뷰 M4: Facebook 상한(63,206자)은 실사용에서 거의 닿지 않는다.
    상시 뜨는 "12/63206" 배지는 정보 가치가 없고 헤더 한 줄 폭을 갉아먹어 M1 을
    악화시킨다. 상한 자체(초과 차단)는 validatePlatformPublish 가 여전히 지키되, 머리줄
    배지는 실제로 좁고 자주 닿는 채널에서만 보여준다.
  */
  const characterCount = bodyCounter && platform !== "facebook" ? { current: bodyCounter.current, limit: bodyCounter.limit } : undefined;

  if (platform === "threads") return (
    <Frame p="threads" label="Threads" headerRight={headerRight} characterCount={characterCount} account={editor?.account}>
      {/*
        2026-09-22 교차 코드리뷰 C3 실측(scripts/measure-publish-room-alignment.mjs, 폭
        1792): line-clamp 로 캡션 길이 변동은 없앴는데도 threads·x·facebook 이 서로
        다른 요소 구성(threads 는 주제 태그+첫 댓글 칸, facebook 은 좋아요/댓글/공유
        3버튼 footer 를 추가로 가진다)이라 같은 캡션 길이라도 미리보기 내용 총 높이가
        39~53px 어긋났다. 2차 리뷰에서 이걸 420px 고정 높이 상자(overflow-hidden)로
        감쌌는데, 카드 폭 384px 에서 캐러셀(aspect-square)이 이미지 1장만 있어도
        300~384px 를 먹어 첫 댓글 편집 칸·반응 줄까지 상자 밖으로 잘려 나갔다(같은
        "편집 입구 소실" 결함이 이미지가 붙는 순간 재발). 그 overflow-hidden 상자를
        없앤다. 헤더 줄바꿈(Frame 주석)을 고친 뒤에도 threads(주제 태그+첫 댓글)·
        x(간결)·facebook(해시태그+3버튼 footer)이 서로 다른 구조라 자연 높이가 갈려
        남아 있었다. min-h-[var(--preview-text-body-min-h)](overflow-hidden 없음, 절대 안 잘린다. N2 교훈)로
        가장 키가 큰 경우(실측: 실제 이미지 1장 포함 facebook)에 짧은 카드를 맞춘다.
        내용이 660px 를 넘는 카드는 자연스럽게 더 자라날 뿐 잘리지 않는다. 값은
        scripts/measure-publish-room-alignment.mjs 로 media 를 포함해 실측하며 다시
        구했다(2026-09-22 4라운드. 3라운드 260px 는 media={{}} 로 이미지 없이 잰
        수치라 실제 이미지가 붙는 순간 다시 어긋났다).
      */}
      <div className="bg-surface text-text rounded-surface border border-border px-pad-inset py-stack min-h-[var(--preview-text-body-min-h)]">
        <div className="flex gap-stack"><Av />
          <div className="flex-1 min-w-0">
            <div className="flex min-w-0 items-center gap-micro text-body"><b className="min-w-0 truncate">{handle}</b><span className="shrink-0 text-subtle text-body-sm ml-micro">지금</span><div className="ml-auto text-subtle">{P(I.more)}</div></div>
            <EditablePreviewBody value={previewBody} onChange={editor?.onCaptionChange} testId="preview-body-threads" label="threads 캡션" locked={editor?.account.status === "loading"} placeholder="여기에 본문을 적으세요" className="text-body whitespace-pre-wrap leading-[1.45] mt-micro max-h-[var(--preview-body-caption-max-h)] overflow-y-auto" />
            {/*
              2026-09-09 회장 지적: "해시태그나 첫댓글도 미리보기화면에서 직관적으로
              수정할수있게 하는게 낫지않겠어?" 실제 게시물에서 해시태그는 본문 바로 아래
              같은 흐름에 붙는다. 그 자리에서 고치는 것이 가장 직관적이다.
            */}
            {/*
              Threads 는 해시태그가 아니라 주제 태그 하나를 쓴다(PLATFORM_FIELD_CONTRACT).
              채널 계약을 안 보고 해시태그 칸을 놓으면 화면이 그 채널에 없는 것을 있는 것처럼
              말하게 된다. 계약대로 주제 태그를 놓는다.
            */}
            <EditablePreviewBody value={editor?.topicTag ?? ""} onChange={editor?.onTopicTagChange} testId="preview-topictag-threads" label="threads 주제 태그" locked={editor?.account.status === "loading"} placeholder="주제 태그" className="text-body-sm text-accent whitespace-pre-wrap mt-stack-tight" />
            {/* 2026-09-22 교차 코드리뷰 MINOR: 1장일 때(max-h-80 object-cover)와 2장 이상일
               때(aspect-square)가 서로 다른 비율이라 같은 채널인데도 이미지 개수에 따라
               미리보기 높이가 달랐다. 개수와 무관하게 항상 같은 캐러셀(같은 비율)을 쓴다. */}
            {images.length > 0 ? (
              <div className="mt-stack-tight overflow-hidden rounded-surface border border-border">
                <MediaCarousel cards={images.map((url) => ({ type: "img" as const, v: url }))} tenantId={tenantId} testId="preview-media-threads" />
              </div>
            ) : null}
            <div className="flex gap-stack-section mt-stack">{P(I.heart)}{P(I.chat)}{P(I.repost)}{P(I.send)}</div>
{/*
              2026-09-09 회장 지적("실제 플랫폼별 미리보기 화면 그대로인건 맞아?") 후속.
              모양은 실제와 비슷했는데 **숫자가 가짜였다.** 아직 아무 데도 안 올린 글에
              "좋아요 124개" 가 붙어 있었다. 성과실에서는 못 잰 것을 "미수집" 이라고
              정직하게 적으면서 발행실에서는 없는 숫자를 지어 보이면 앞뒤가 안 맞는다.
              레이아웃은 실제 그대로 두되 숫자 자리는 아직 없다고 적는다.
            */}
            <div className="text-subtle text-body-sm mt-stack-tight" data-preview-engagement="threads">올리면 여기에 답글과 좋아요가 쌓입니다</div>
            {/*
              2026-09-09 회장 지적: "해시태그나 첫댓글도 미리보기화면에서 직관적으로
              수정할수있게." 첫 댓글은 실제로 본문 아래 답글 자리에 붙는다. 그 자리에서
              고치면 올라간 모습 그대로를 보며 쓰게 된다.
            */}
            {editor?.firstCommentSupported ? (
              <div className="mt-stack-tight border-t border-border pt-stack-tight">
                <span className="text-caption text-subtle">첫 댓글</span>
                <EditablePreviewBody value={editor.firstComment} onChange={editor.onFirstCommentChange} testId="preview-firstcomment-threads" label="threads 첫 댓글" locked={editor.account.status === "loading"} placeholder="본문 아래 첫 댓글로 올릴 말" className="text-body-sm whitespace-pre-wrap" />
              </div>
            ) : null}
          </div></div>
      </div>
      {editor ? <PublishMetaFields platform="threads" editor={editor} /> : null}
    </Frame>
  );
  if (platform === "x") return (
    <Frame p="x" label="X" headerRight={headerRight} characterCount={characterCount} account={editor?.account}>
      <div className="bg-surface text-text rounded-surface border border-border px-pad-inset py-stack min-h-[var(--preview-text-body-min-h)]">
        <div className="flex gap-stack"><Av />
          <div className="flex-1 min-w-0">
            <div className="flex min-w-0 items-center gap-micro text-body"><b className="min-w-0 truncate">{handle}</b><span className="min-w-0 truncate text-subtle ml-micro">@{handle} · 지금</span><div className="ml-auto text-subtle">{P(I.more)}</div></div>
            <EditablePreviewBody value={previewBody} onChange={editor?.onCaptionChange} testId="preview-body-x" label="x 캡션" locked={editor?.account.status === "loading"} placeholder="여기에 본문을 적으세요" className="text-body whitespace-pre-wrap leading-[1.4] mt-micro max-h-[var(--preview-body-caption-max-h)] overflow-y-auto" />
        <EditablePreviewBody value={editor?.hashtags ?? ""} onChange={editor?.onHashtagsChange} testId="preview-tags-x" label="x 해시태그" locked={editor?.account.status === "loading"} placeholder="#해시태그" className="text-body-sm text-accent whitespace-pre-wrap mt-stack-tight" />
            {images.length > 0 ? (
              <div className="mt-stack-tight overflow-hidden rounded-surface border border-border">
                <MediaCarousel cards={images.map((url) => ({ type: "img" as const, v: url }))} tenantId={tenantId} testId="preview-media-x" />
              </div>
            ) : null}
            {/* 숫자는 아직 없다. 안 올린 글에 답글 24개를 적으면 그것은 거짓이다. */}
            <div className="flex justify-between mt-stack text-subtle text-body-sm" data-preview-engagement="x">
              <span className="flex items-center gap-stack-tight">{P(I.chat)}</span><span className="flex items-center gap-stack-tight">{P(I.repost)}</span>
              <span className="flex items-center gap-stack-tight">{P(I.heart)}</span><span className="flex items-center gap-stack-tight">{P(I.bookmark)}</span><span className="flex items-center gap-stack-tight">{P(I.share)}</span>
            </div>
            <div className="mt-stack-tight text-caption text-subtle">올리면 여기에 반응이 쌓입니다</div></div></div>
      </div>
      {editor ? <PublishMetaFields platform="x" editor={editor} /> : null}
    </Frame>
  );
  if (platform === "facebook") return (
    <Frame p="facebook" label="Facebook" headerRight={headerRight} characterCount={characterCount} account={editor?.account}>
      <div className="bg-surface text-text rounded-control border border-border overflow-hidden min-h-[var(--preview-text-body-min-h)]">
        <div className="flex items-center gap-stack-tight px-stack pt-stack"><Av /><div className="min-w-0"><div className="truncate font-semibold text-body leading-tight">{handle}</div><div className="text-subtle text-caption">방금 · 전체 공개</div></div><div className="ml-auto text-subtle">{P(I.more)}</div></div>
        <EditablePreviewBody value={previewBody} onChange={editor?.onCaptionChange} testId="preview-body-facebook" label="facebook 캡션" locked={editor?.account.status === "loading"} placeholder="여기에 본문을 적으세요" className="px-stack py-stack-tight text-body whitespace-pre-wrap leading-snug max-h-[var(--preview-body-caption-max-h)] overflow-y-auto" />
        <EditablePreviewBody value={editor?.hashtags ?? ""} onChange={editor?.onHashtagsChange} testId="preview-tags-facebook" label="facebook 해시태그" locked={editor?.account.status === "loading"} placeholder="#해시태그" className="px-stack pb-stack-tight text-body-sm text-accent whitespace-pre-wrap" />
        {images.length > 0 ? (
          <MediaCarousel cards={images.map((url) => ({ type: "img" as const, v: url }))} tenantId={tenantId} testId="preview-media-facebook" />
        ) : null}
        <div className="flex items-center justify-between px-stack py-stack-tight text-subtle text-body-sm border-b border-border" data-preview-engagement="facebook"><span>올리면 여기에 반응이 쌓입니다</span></div>
        <div className="flex text-subtle text-body-sm font-medium">{["좋아요", "댓글", "공유"].map((l) => <div key={l} className="flex-1 text-center py-stack-tight hover:bg-surface-2">{l}</div>)}</div>
      </div>
      {editor ? <PublishMetaFields platform="facebook" editor={editor} /> : null}
    </Frame>
  );
  if (platform === "instagram") {
    const cards = images.map((url) => ({ type: "img" as const, v: url }));
    return (
      <Frame p="instagram" label="Instagram" headerRight={headerRight} characterCount={characterCount} account={editor?.account}>
        <div className="bg-surface text-text rounded-control border border-border overflow-hidden">
          <div className="flex items-center gap-stack px-stack py-stack"><Av s={32} /><b className="min-w-0 truncate text-body-sm">{handle}</b><span className="shrink-0 text-subtle text-caption">· 팔로우</span><div className="ml-auto text-subtle">{P(I.more)}</div></div>
          <MediaCarousel cards={cards} tenantId={tenantId} testId="preview-media-instagram" />
          <div className="flex items-center gap-pad-inset px-stack pt-stack">{P(I.heart)}{P(I.chat)}{P(I.send)}<div className="ml-auto">{P(I.bookmark)}</div></div>
          <div className="px-stack pt-stack-tight text-body-sm text-subtle" data-preview-engagement="instagram">올리면 여기에 좋아요가 쌓입니다</div>
          <div className="px-stack pt-micro pb-stack text-body-sm"><b className="break-all">{handle}</b> <EditablePreviewBody value={previewBody} onChange={editor?.onCaptionChange} testId="preview-body-instagram" label="instagram 캡션" locked={editor?.account.status === "loading"} placeholder="여기에 본문을 적으세요" className="text-muted inline-block align-top max-h-[var(--preview-instagram-caption-max-h)] overflow-y-auto" />
            {/*
              2026-09-22: instagram 해시태그는 전에 어디서도 고칠 수 없었다(static 표시만
              있었다). 캡션 바로 아래, 실제 게시물에서 해시태그가 붙는 그 자리에서 바로
              고친다(다른 텍스트 채널과 같은 contentEditable 패턴, 4라운드에서 사이드바를
              뺀 뒤로 이 방식으로 통일했다).

              Instagram 상한(2,200자)은 캡션+해시태그 합계다. 이 자리는 별도 카운터를
              보여주지 않는다 — 해시태그 칸 하나만 떼어 숫자를 보이면 거짓이 된다(캡션이
              이미 1,900자를 썼으면 해시태그는 300자밖에 못 쓰는데 이 필드만 보면 2,200자가
              남은 것처럼 보인다). 상한 판정 자체는 저장 시 validatePlatformPublish 가
              합계로 정확히 한다.
            */}
            <EditablePreviewBody
              value={editor?.hashtags ?? (text.instagram?.hashtags || []).map((h) => `#${h.replace(/^#/, "")}`).join(" ")}
              onChange={editor?.onHashtagsChange}
              testId="preview-tags-instagram"
              label="instagram 해시태그"
              locked={editor?.account.status === "loading"}
              placeholder="#해시태그"
              className="text-accent mt-micro whitespace-pre-wrap"
            /></div>
        </div>
        {editor ? <PublishMetaFields platform="instagram" editor={editor} /> : null}
      </Frame>
    );
  }
  // 세로영상
  const k = platform as "shorts" | "reels" | "tiktok";
  const cap = editor?.caption || text.shorts?.hook || text.instagram?.caption || "";
  return (
    <Frame p={platform} label={label} headerRight={headerRight} characterCount={characterCount} account={editor?.account}>
      <div className="relative rounded-surface overflow-hidden bg-surface-2 aspect-[9/16] border border-border">
        {/*
          2026-09-22 R-23-6("영상쪽은 썸네일도 확인되고?"): 대문 그림(poster)을 안 넘기면
          재생 전까지 검정 상자만 보였다. 덱 커버나 첫 이미지를 대문으로 넘기고, 그마저
          없으면 "썸네일 없음" 을 글로 밝힌다(ADR-007, 조용히 빈 상자로 두지 않는다).
        */}
        {vid ? <DeliveredMedia key={vid} type="video" src={vid} tenantId={tenantId} preload="metadata" poster={img} testId={`preview-media-${k}`} className="w-full h-full object-cover" />
          : img ? <DeliveredMedia type="image" src={img} tenantId={tenantId} testId={`preview-media-${k}`} className="w-full h-full object-cover" />
          : <div className="w-full h-full grid place-items-center text-subtle text-caption" data-testid={`preview-media-${k}-empty`}>영상 생성 대기 · 썸네일 없음</div>}
        {/*
          2026-09-23 교차 코드리뷰 5라운드(재반려): top-3 right-3 로 옮겼던 1차 수정은
          틀렸다. vid 일 때 title/hashtags 오버레이 컨테이너 자체가 absolute left-3
          right-3 top-3 로 전체 폭을 덮으므로, 오른쪽으로 옮겨도 여전히 같은 사각형
          안이었다(그 순간 안 겹쳐 보인 건 오버레이가 배경 없는 좌측 정렬 텍스트라서일
          뿐, 핸들·제목이 길어지면 다시 덮는다). 오버레이가 아예 안 쓰는 위치(하단,
          네이티브 컨트롤 바 위 여유 공간)로 옮겨 두 사각형이 실제로 겹치지 않게 한다.
        */}
        {vid && !img ? <span data-testid={`preview-poster-missing-${k}`} className="absolute bottom-16 right-3 rounded-pill bg-player-surface/70 px-stack-tight py-micro text-caption text-text">썸네일 없음</span> : null}
        {/*
          2026-09-22 교차 코드리뷰 C2(회귀): 이 블록이 `{!vid && ...}` 안에만 있어서,
          영상이 실제로 있으면(vid 존재) 제목·해시태그를 여는 입구가 통째로 사라졌다.
          PublishMetaTriggers 도 isVideoPlatform 이면 이 둘을 안 만들어서 진짜로 입구가
          0개였다(계약상 shorts.title=true, 세 채널 hashtags=true 인데도). 편집 트리거는
          영상 유무와 무관하게 항상 그린다. 영상이 있으면 네이티브 컨트롤(하단)과 안
          겹치도록 위쪽에, 없으면 기존처럼 아래쪽에 둔다.
        */}
        {!vid && <>
          {k === "shorts" && <div className="absolute top-3 left-3 flex items-center gap-micro text-text font-bold text-body-sm">▶ Shorts</div>}
          {k === "reels" && <div className="absolute top-3 left-3 right-3 flex justify-between text-text text-body-sm"><span>이전</span><b>릴스</b><span>카메라</span></div>}
          {k === "tiktok" && <div className="absolute top-3 left-0 right-0 flex justify-center gap-pad-inset text-text/80 text-body-sm"><span>팔로잉</span><b className="text-text border-b-2 border-player-text pb-micro">추천</b></div>}
          <VideoRail kind={k} />
        </>}
        <div className={vid ? "absolute left-3 right-3 top-3 text-text" : "absolute left-3 right-12 bottom-3 text-text"}>
          <div className="truncate text-body-sm font-bold">@{handle}</div>
          {editor && PLATFORM_FIELD_CONTRACT[platform].title ? (
            <EditablePreviewBody
              value={editor.title}
              onChange={editor.onTitleChange}
              testId={`preview-title-${platform}`}
              label={`${platform} 제목`}
              locked={editor.account.status === "loading"}
              placeholder="제목 없음 · 눌러서 추가"
              className="mt-micro block w-full text-body-sm font-semibold"
            />
          ) : null}
          <div className="text-caption leading-snug line-clamp-2 opacity-95">{cap}</div>
          {/*
            2026-09-22 교차 코드리뷰 MINOR: PLATFORM_FIELD_CONTRACT 확인 없이 무조건
            렌더했다. 세 영상 채널 모두 hashtags:true 라 지금은 우연히 안전하지만,
            계약을 안 보고 만들면 다음에 hashtags:false 채널이 추가될 때 또 없는 것을
            있는 것처럼 보여주게 된다.
          */}
          {editor && PLATFORM_FIELD_CONTRACT[platform].hashtags ? (
            <EditablePreviewBody
              value={editor.hashtags}
              onChange={editor.onHashtagsChange}
              testId={`preview-tags-${platform}`}
              label={`${platform} 해시태그`}
              locked={editor.account.status === "loading"}
              placeholder="#해시태그"
              className="mt-micro block w-full line-clamp-1 text-caption opacity-90"
            />
          ) : null}
          {!vid && k === "tiktok" && <div className="text-caption mt-micro opacity-90">원본 사운드 · {handle}</div>}
        </div>
      </div>
      {editor ? <PublishMetaFields platform={platform} editor={editor} /> : null}
    </Frame>
  );
}
