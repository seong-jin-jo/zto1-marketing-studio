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
 * 구조 계약(정렬 수정의 핵심 — 바꾸지 마라):
 * - 1행: 발행 토글 + 대문 시점 컨트롤. 대문 컨트롤이 없는 채널도 투명 placeholder
 *   슬롯을 렌더해 행 높이가 채널마다 갈리지 않게 한다.
 * - 2행: 계정 영역(연결하기 / select + 계정 관리 / 투명 placeholder).
 * 행 수와 각 행의 슬롯 수가 채널 내용과 무관하게 고정이라, 줄바꿈 위치가 갈리지
 * 않는다. 모든 슬롯은 min-h-control-touch 로 같은 최소 높이를 갖는다.
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
  onSelectedAccountChange: (next: string) => void;
  /** 이 채널의 연결/계정 관리 화면 주소. */
  channelHref: string;
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
  onSelectedAccountChange,
  channelHref,
}: PublishHeaderControlsProps) {
  const defaultAccount = accounts.find((account) => account.isDefault);
  const selectedAccount = accounts.find((account) => account.id === selectedAccountId);
  const needsConnect = !accountsLoading && publishSupported && accounts.length === 0;
  const canSelectAccount = accountSelectable && accounts.length > 0;

  return (
    <div className="flex flex-col items-end gap-micro" data-publish-header-controls={platform}>
      {/* 1행: 발행 토글 + 대문 시점. 두 슬롯이 항상 존재한다. */}
      <div className="flex items-center justify-end gap-stack-tight" data-publish-header-row="toggle">
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
            발행
          </label>
        ) : (
          <label className="ds-touch-target flex min-h-control-touch items-center gap-micro px-stack-tight text-caption text-warning">
            <input aria-label={`${label} 발행 미지원`} type="checkbox" className="h-5 w-5 shrink-0" checked={false} disabled readOnly />
            미지원
          </label>
        )}
        {supportsCoverTimestamp(platform) ? (
          <label className="flex items-center gap-micro text-caption text-muted" title="영상에서 이 시점 화면을 대문으로 씁니다">
            대문
            <input
              type="number"
              min={0}
              max={600}
              step={0.5}
              aria-label={`${label} 대문 시점(초)`}
              data-cover-seconds={platform}
              value={coverSeconds}
              onChange={(event) => onCoverSecondsChange(Number(event.target.value))}
              className="min-h-control-touch w-16 rounded-control border border-border bg-surface px-stack-tight text-caption text-text"
            />
            초
          </label>
        ) : coverUnsupportedReason(platform) ? (
          <span
            className="text-caption text-subtle"
            data-cover-note={platform}
            title={coverUnsupportedReason(platform) || undefined}
          >
            대문 자동
          </span>
        ) : (
          // 채널마다 이 슬롯 유무가 갈리면 1행 줄바꿈 위치가 갈린다. 빈 자리라도
          // 유지해 slot 을 고정한다.
          <span aria-hidden="true" className="text-caption text-transparent select-none">
            대문 자동
          </span>
        )}
      </div>
      {/* 2행: 계정 영역. 어느 분기든 min-h-control-touch 한 줄을 차지한다. */}
      <div className="flex items-center justify-end gap-stack-tight" data-publish-header-row="account">
        {needsConnect ? (
          <Link
            href={channelHref}
            data-testid={`publish-connect-link-${platform}`}
            title={`${label} 연결 화면으로 갑니다. 연결한 뒤 그 화면에서 기본 계정도 정할 수 있습니다`}
            className="inline-flex min-h-control-touch items-center rounded-control border border-accent/40 bg-accent-soft px-stack-tight text-caption font-semibold text-accent hover:bg-surface"
          >
            계정 연결하기
          </Link>
        ) : canSelectAccount ? (
          <>
            <select
              aria-label={`${label} 발행 계정`}
              data-testid={`publish-account-select-${platform}`}
              value={selectedAccountId}
              onChange={(event) => onSelectedAccountChange(event.target.value)}
              // 계정 이름이 길면 select 가 계속 자라 1행처럼 슬롯을 고정해도 다시
              // 줄바꿈을 만들었다(9444 실측 "기본 {계정명}" 이 128px 까지 자람).
              // 폭을 고정하고 넘치는 이름은 잘라 보여준다. 전체 이름은 title 로.
              // title 은 **실제로 선택된** 계정을 가리켜야 한다(기본 계정을 늘 가리키면
              // 다른 계정을 고른 사용자에게 거짓말을 한다).
              title={(selectedAccount || defaultAccount)?.label || undefined}
              className="min-h-control-touch w-28 truncate rounded-control border border-border bg-surface-2 px-stack-tight text-caption text-text"
            >
              {/* 어느 계정으로 올라가는지 이름으로 말한다. "기본계정"만 적으면 그게 누구인지 화면이 답을 못 한다. */}
              <option value="">기본 {defaultAccount?.label || "계정"}</option>
              {accounts.map((account) => (
                <option key={account.id} value={account.id}>
                  {account.label}
                </option>
              ))}
            </select>
            <Link
              href={channelHref}
              data-testid={`publish-account-manage-${platform}`}
              title={`${label} 계정을 더 연결하거나 기본 계정을 바꿉니다`}
              className="inline-flex min-h-control-touch items-center rounded-control border border-border bg-surface-2 px-stack-tight text-caption font-semibold text-muted hover:bg-surface"
            >
              계정 관리
            </Link>
          </>
        ) : (
          <span aria-hidden="true" className="min-h-control-touch text-caption text-transparent select-none">
            -
          </span>
        )}
      </div>
    </div>
  );
}

export { DEFAULT_COVER_SECONDS };
