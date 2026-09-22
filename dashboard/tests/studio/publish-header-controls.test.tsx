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
      onSelectedAccountChange={() => {}}
      channelHref={`/channels/${platform}`}
    />,
  );
}

/** 높이를 결정하는 것만 추린 서명. 내용(문구·컨트롤 종류)은 채널마다 달라도 된다. */
function heightSignature(root: HTMLElement) {
  const header = root.querySelector("[data-publish-header-controls]");
  if (!header) throw new Error("헤더 컨테이너가 없다");
  const rows = Array.from(header.children) as HTMLElement[];
  return {
    rowCount: rows.length,
    rows: rows.map((row) => ({
      name: row.getAttribute("data-publish-header-row"),
      slotCount: row.children.length,
      // 각 행은 44px 조작면(min-h-control-touch) 슬롯을 최소 하나 갖는다. 이것이
      // 행 높이를 채널과 무관하게 고정하는 장치다.
      hasTouchTarget: Array.from(row.querySelectorAll("*")).some((el) =>
        el.className.toString().split(/\s+/).includes("min-h-control-touch"),
      ),
    })),
  };
}

afterEach(cleanup);

describe("발행실 헤더는 7개 채널에서 같은 높이 구조를 갖는다", () => {
  it("모든 채널이 고정 2행(발행/대문 · 계정)이고 각 행이 44px 조작면을 갖는다", () => {
    for (const platform of CHANNELS) {
      const { container } = renderHeader(platform, "osmu_official_account");
      const signature = heightSignature(container);
      expect(signature.rowCount, `${platform} 행 수가 2가 아니다`).toBe(2);
      expect(signature.rows.map((r) => r.name)).toEqual(["toggle", "account"]);
      for (const row of signature.rows) {
        expect(row.hasTouchTarget, `${platform} ${row.name} 행에 min-h-control-touch 슬롯이 없다`).toBe(true);
      }
      cleanup();
    }
  });

  it("7개 채널의 높이 서명이 서로 완전히 같다(한 채널만 달라지면 실패한다)", () => {
    const signatures = CHANNELS.map((platform) => {
      const { container } = renderHeader(platform, "osmu_official_account");
      const signature = heightSignature(container);
      cleanup();
      return [platform, signature] as const;
    });
    const [, baseline] = signatures[0];
    for (const [platform, signature] of signatures) {
      expect(signature, `${platform} 헤더의 높이 구조가 다른 채널과 다르다`).toEqual(baseline);
    }
  });

  it("계정 이름이 아무리 길어도 select 는 폭을 고정하고 잘라, 줄 수를 늘리지 않는다", () => {
    // 4라운드 실패의 진짜 변수. 짧은 플레이스홀더로 재면 이 조건이 사라진다.
    const { container } = renderHeader("threads", "osmu_factory_official_account_2026_very_long");
    const select = container.querySelector("select");
    expect(select?.className).toContain("w-28");
    expect(select?.className).toContain("truncate");
  });

  it("대문 컨트롤이 없는 채널도 1행 슬롯 수를 유지한다(투명 placeholder)", () => {
    const { container: withCover } = renderHeader("reels", "osmu_reels_studio_2026");
    const coverSlots = withCover.querySelector('[data-publish-header-row="toggle"]')!.children.length;
    cleanup();
    const { container: withoutCover } = renderHeader("threads", "오스무팩토리");
    const plainSlots = withoutCover.querySelector('[data-publish-header-row="toggle"]')!.children.length;
    expect(plainSlots).toBe(coverSlots);
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

  it("발행 체크박스 + 계정 select 를 직접 그리는 파일은 PublishHeaderControls 하나뿐이다", () => {
    const owners = walk(srcRoot).filter((file) => {
      const body = readFileSync(file, "utf8");
      return body.includes("data-testid={`publish-account-select-") || body.includes('data-testid={`publish-connect-link-');
    });
    expect(owners.map((f) => f.slice(srcRoot.length + 1))).toEqual(["components/studio/PublishHeaderControls.tsx"]);
  });

  it("고정 2행 컨테이너 클래스도 한 군데에만 있다", () => {
    const owners = walk(srcRoot).filter((file) =>
      readFileSync(file, "utf8").includes('data-publish-header-row="toggle"'),
    );
    expect(owners.map((f) => f.slice(srcRoot.length + 1))).toEqual(["components/studio/PublishHeaderControls.tsx"]);
  });
});
