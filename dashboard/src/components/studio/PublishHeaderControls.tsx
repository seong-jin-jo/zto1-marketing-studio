"use client";

import Link from "next/link";
import type { PreviewPlatform } from "@/components/studio/PlatformPreview";
import { DEFAULT_COVER_SECONDS, coverUnsupportedReason, supportsCoverTimestamp } from "@/lib/video-cover";

/**
 * 발행실 카드 헤더(발행 체크 · 대문 시점 · 계정)의 **유일한** 정의다.
 *
 * 왜 컴포넌트로 뽑았나 — 2026-09-23 실수 원장 count:9 의 근본 원인:
 * 발행실 화면(app/studio/page.tsx)과 정렬 측정 하네스
 * (app/qa-alignment-harness/AlignmentHarnessGrid.tsx)가 이 마크업을 **손으로 두 번
 * 베껴** 유지했다. 한쪽을 고치면 다른 쪽이 조용히 낡고, 그러면 "실측 delta 0px 수렴"
 * 이라는 측정 결과가 실제 화면과 무관한 숫자가 된다. 실제로 다섯 라운드에 걸쳐 그런
 * 거짓 안심이 반복됐다. 복제본이 존재하는 한 드리프트는 구조적으로 막을 수 없으므로,
 * 두 자리가 같은 컴포넌트를 렌더하게 만든다.
 *
 * ⚠️ 이 파일을 복사해 다른 곳에 두지 마라. 화면과 측정 하네스가 같은 것을 그리는
 * 것이 이 파일의 존재 이유 전부다.
 *
 * v70 운영 실측에서 계정 배지·select·미리보기 머리에 같은 값이 세 번 나왔다.
 * 계정 제어는 이 한 줄만 소유한다: [발행] [계정 전체 이름] [계정 관리].
 */

/** 화면이 쓰는 계정 한 줄. 목록 원본에서 필요한 것만 추린다. */
export interface PublishHeaderAccount {
  id: string;
  label: string;
  isDefault: boolean;
}

export interface PublishHeaderControlsProps {
  platform: PreviewPlatform;
  /** 채널 표시 이름(Threads·X·…). aria-label 문구에 쓴다. */
  label: string;
  /** 이 채널로 발행할 수 있나. 아니면 "미지원" 비활성 체크로 바뀐다. */
  publishSupported: boolean;
  /** 계정을 고를 수 있는 채널인가. */
  accountSelectable: boolean;
  checked: boolean;
  /** 계정을 아직 못 불러왔거나 연결된 계정이 없으면 체크를 못 한다. */
  checkboxDisabled: boolean;
  onCheckedChange: (next: boolean) => void;
  coverSeconds: number;
  onCoverSecondsChange: (next: number) => void;
  /** 계정 목록을 아직 불러오는 중이면 "계정 연결하기" 를 성급히 띄우지 않는다. */
  accountsLoading: boolean;
  accounts: PublishHeaderAccount[];
  selectedAccountId: string;
  /** 이 채널의 연결/계정 관리 화면 주소. */
  channelHref: string;
  /** 미디어 누락·글자 수 초과처럼 발행을 막는 이유. */
  disabledReason?: string;
  /** 미디어 누락일 때 같은 자리에서 복구할 생성실 주소와 행동. */
  createHref?: string;
  createActionLabel?: string;
}

export function PublishHeaderControls({
  platform,
  label,
  publishSupported,
  accountSelectable,
  checked,
  checkboxDisabled,
  onCheckedChange,
  coverSeconds,
  onCoverSecondsChange,
  accountsLoading,
  accounts,
  selectedAccountId,
  channelHref,
  disabledReason,
  createHref,
  createActionLabel,
}: PublishHeaderControlsProps) {
  const defaultAccount = accounts.find((account) => account.isDefault);
  const selectedAccount = accounts.find((account) => account.id === selectedAccountId);
  const needsConnect = !accountsLoading && publishSupported && accounts.length === 0;
  const hasAccount = accountSelectable && accounts.length > 0;

  return (
    <div className="flex min-w-0 flex-col gap-micro" data-publish-header-controls={platform}>
      <div className="flex min-w-0 flex-wrap items-center gap-stack-tight" data-publish-header-row="primary">
        {publishSupported ? (
          /* DESIGN.md 발행실 절: 「선택 체크의 보이는 표식은 20px, 실제 조작면은 44px이다」.
             표식은 그대로 두고 label 을 44px 조작면으로 쓴다. */
          <label className="ds-touch-target flex min-h-control-touch items-center gap-micro px-stack-tight text-caption text-muted">
            <input
              aria-label={`${label} 발행`}
              type="checkbox"
              className="h-5 w-5 shrink-0"
              checked={checked}
              disabled={checkboxDisabled}
              onChange={(event) => onCheckedChange(event.target.checked)}
            />
            <span>발행</span>
          </label>
        ) : (
          <label className="ds-touch-target flex min-h-control-touch items-center gap-micro px-stack-tight text-caption text-warning">
            <input aria-label={`${label} 발행 미지원`} type="checkbox" className="h-5 w-5 shrink-0" checked={false} disabled readOnly />
            미지원
          </label>
        )}
        {needsConnect ? (
          <Link
            href={channelHref}
            data-testid={`publish-connect-link-${platform}`}
            title={`${label} 연결 화면으로 갑니다. 연결한 뒤 그 화면에서 기본 계정도 정할 수 있습니다`}
            className="inline-flex min-h-control-touch items-center rounded-control border border-accent/40 bg-accent-soft px-stack-tight text-caption font-semibold text-accent hover:bg-surface"
          >
            계정 연결하기
          </Link>
        ) : hasAccount ? (
          <span
            data-testid={`publish-account-label-${platform}`}
            className="inline-flex min-h-control-touch min-w-0 max-w-40 items-center truncate rounded-control border border-border bg-surface-2 px-stack-tight text-caption text-text"
            title={(selectedAccount || defaultAccount)?.label || undefined}
          >
            계정: {(selectedAccount || defaultAccount)?.label}
          </span>
        ) : accountsLoading ? (
          <span className="inline-flex min-h-control-touch items-center text-caption text-subtle">계정 확인 중</span>
        ) : null}
        {hasAccount ? (
          <Link
            href={channelHref}
            data-testid={`publish-account-manage-${platform}`}
            title={`${label} 계정을 더 연결하거나 기본 계정을 바꿉니다`}
            className="inline-flex min-h-control-touch shrink-0 items-center rounded-control border border-border bg-surface-2 px-stack-tight text-caption font-semibold text-muted hover:bg-surface"
          >
            계정 관리
          </Link>
        ) : null}
        {supportsCoverTimestamp(platform) ? (
          <label className="flex min-h-control-touch items-center gap-micro text-caption text-muted" title="영상에서 이 시점 화면을 표지로 씁니다">
            표지로 쓸 장면(초)
            <input
              type="number"
              min={0}
              max={600}
              step={0.5}
              aria-label={`${label} 표지로 쓸 장면(초)`}
              data-cover-seconds={platform}
              value={coverSeconds}
              onChange={(event) => onCoverSecondsChange(Number(event.target.value))}
              className="min-h-control-touch w-16 rounded-control border border-border bg-surface px-stack-tight text-caption text-text"
            />
          </label>
        ) : coverUnsupportedReason(platform) ? (
          <span
            className="text-caption text-subtle"
            data-cover-note={platform}
            title={coverUnsupportedReason(platform) || undefined}
          >
            표지 자동
          </span>
        ) : null}
      </div>
      {disabledReason ? (
        <div className="flex min-w-0 flex-wrap items-center gap-stack-tight text-caption text-warning" data-publish-disabled-reason={platform}>
          <span>{disabledReason}</span>
          {createHref && createActionLabel ? (
          <Link
            href={createHref}
            data-testid={`publish-create-media-${platform}`}
            className="inline-flex min-h-control-touch items-center rounded-control border border-accent/40 bg-accent-soft px-stack-tight text-caption font-semibold text-accent hover:bg-surface"
          >
            {createActionLabel}
          </Link>
          ) : null}
        </div>
      ) : null}
    </div>
  );
}

export { DEFAULT_COVER_SECONDS };
