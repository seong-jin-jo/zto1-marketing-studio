// @vitest-environment jsdom
import "@testing-library/jest-dom/vitest";
import React from "react";
import { readFileSync, readdirSync, statSync } from "node:fs";
import { join, resolve } from "node:path";
import { cleanup, render } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";
import { PublishHeaderControls } from "@/components/studio/PublishHeaderControls";
import type { PreviewPlatform } from "@/components/studio/PlatformPreview";

/**
 * 2026-09-23 실수 원장 count:9 봉합 테스트.
 *
 * 사고: 발행실 화면과 정렬 측정 하네스가 헤더 마크업을 손으로 두 벌 유지해,
 * 한쪽만 고쳐도 "delta 0px 수렴" 측정이 통과했다. 이 파일은 두 가지를 못 박는다.
 *  (1) 헤더 마크업이 레포 안에 **한 군데**만 존재한다(복제본 부활 차단).
 *  (2) 7개 채널의 헤더가 높이를 결정하는 구조(행 수·슬롯 수·최소 높이 토큰)에서
 *      완전히 동일하다.
 *
 * ⚠️ jsdom 에는 레이아웃 엔진이 없어 getBoundingClientRect 가 0 을 돌려준다. 실제
 * 픽셀 증거는 `npm run qa:publish-room-alignment`(헤드리스 브라우저)가 유일하며,
 * 그 스크립트는 CI 에서 실제로 돈다. 이 파일은 그 앞단의 구조 계약이다.
 */

const CHANNELS: PreviewPlatform[] = ["threads", "x", "facebook", "instagram", "shorts", "reels", "tiktok"];
const LABEL: Record<PreviewPlatform, string> = {
  threads: "Threads", x: "X", facebook: "Facebook", instagram: "Instagram",
  shorts: "Shorts", reels: "Reels", tiktok: "TikTok",
};

function renderHeader(platform: PreviewPlatform, accountLabel: string) {
  return render(
    <PublishHeaderControls
      platform={platform}
      label={LABEL[platform]}
      publishSupported
      accountSelectable
      checked={false}
      checkboxDisabled={false}
      onCheckedChange={() => {}}
      coverSeconds={0}
      onCoverSecondsChange={() => {}}
      accountsLoading={false}
      accounts={[{ id: `${platform}-1`, label: accountLabel, isDefault: true }]}
      selectedAccountId=""
      channelHref={`/channels/${platform}`}
    />,
  );
}

afterEach(cleanup);

describe("발행실 계정 영역은 한 줄에 한 번만 나온다", () => {
  it("모든 채널이 [발행][계정 전체 이름][계정 관리] 한 줄을 쓴다", () => {
    for (const platform of CHANNELS) {
      const { container } = renderHeader(platform, "osmu_official_account");
      expect(container.querySelectorAll('[data-publish-header-row="primary"]')).toHaveLength(1);
      expect(container.querySelector(`[data-testid="publish-account-label-${platform}"]`)).toHaveTextContent("계정: osmu_official_account");
      expect(container.querySelector(`[data-testid="publish-account-manage-${platform}"]`)).toBeInTheDocument();
      expect(container.querySelector("select")).not.toBeInTheDocument();
      cleanup();
    }
  });

  it("긴 계정 이름은 화면 폭을 밀지 않고 title로 전체 값을 제공한다", () => {
    const { container } = renderHeader("threads", "osmu_factory_official_account_2026_very_long");
    const label = container.querySelector('[data-testid="publish-account-label-threads"]');
    expect(label?.className).toContain("truncate");
    expect(label).toHaveAttribute("title", "osmu_factory_official_account_2026_very_long");
  });

  it("미디어가 없으면 체크를 막고 생성실 복구 행동을 같은 자리에 준다", () => {
    const { container } = render(
      <PublishHeaderControls
        platform="shorts" label="Shorts" publishSupported accountSelectable checked={false}
        checkboxDisabled onCheckedChange={() => {}} coverSeconds={0} onCoverSecondsChange={() => {}}
        accountsLoading={false} accounts={[{ id: "1", label: "@shorts", isDefault: true }]}
        selectedAccountId="" channelHref="/channels/youtube"
        disabledReason="발행할 영상이 아직 없습니다."
        createHref="/studio?room=create&kind=video"
        createActionLabel="생성실에서 영상 만들기"
      />,
    );
    expect(container.querySelector('input[type="checkbox"]')).toBeDisabled();
    expect(container.querySelector('[data-testid="publish-create-media-shorts"]')).toHaveTextContent("생성실에서 영상 만들기");
  });

  it("계정 조회 실패는 미연결로 오인하지 않고 계정 관리 복구 행동을 준다", () => {
    const { container } = render(
      <PublishHeaderControls
        platform="threads" label="Threads" publishSupported accountSelectable checked={false}
        checkboxDisabled onCheckedChange={() => {}} coverSeconds={0} onCoverSecondsChange={() => {}}
        accountsLoading={false} accountLoadError accounts={[]} selectedAccountId=""
        channelHref="/channels/threads"
      />,
    );
    expect(container.querySelector('[data-testid="publish-account-error-threads"]')).toHaveTextContent("계정을 확인하지 못했습니다. 계정 관리");
    expect(container.querySelector('[data-testid="publish-connect-link-threads"]')).not.toBeInTheDocument();
  });
});

describe("헤더 마크업은 레포 안에 한 군데만 존재한다", () => {
  const srcRoot = resolve(__dirname, "../../src");

  function walk(dir: string, out: string[] = []) {
    for (const entry of readdirSync(dir)) {
      const full = join(dir, entry);
      if (statSync(full).isDirectory()) walk(full, out);
      else if (/\.tsx?$/.test(full)) out.push(full);
    }
    return out;
  }

  it("발행 체크박스 + 계정 제어를 직접 그리는 파일은 PublishHeaderControls 하나뿐이다", () => {
    const owners = walk(srcRoot).filter((file) => {
      const body = readFileSync(file, "utf8");
      return body.includes("data-testid={`publish-account-label-") || body.includes('data-testid={`publish-connect-link-');
    });
    expect(owners.map((f) => f.slice(srcRoot.length + 1))).toEqual(["components/studio/PublishHeaderControls.tsx"]);
  });

  it("단일 계정행 컨테이너도 한 군데에만 있다", () => {
    const owners = walk(srcRoot).filter((file) =>
      readFileSync(file, "utf8").includes('data-publish-header-row="primary"'),
    );
    expect(owners.map((f) => f.slice(srcRoot.length + 1))).toEqual(["components/studio/PublishHeaderControls.tsx"]);
  });
});
