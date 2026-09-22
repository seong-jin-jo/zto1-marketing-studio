import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

// 2026-09-09 회장 지적: "발행실에서는 스레드는 컴포넌트 위치가 왜 살짝 아래로 내려갔냐."
// 실측하니 편집 칸 시작점이 채널마다 달랐다. X 1417, Facebook 1448, Threads 1532 픽셀.
//
// 2026-09-22~23 교차 코드리뷰(PR #77) 다섯 라운드의 결론:
// 1라운드 진단("h-full 없음")은 틀렸다. 2라운드(카드 총 높이 고정 + 420px 상자)는
// N1·N2 결함을 냈다. 3라운드는 headerRight 줄바꿈을 진짜 원인으로 밝혔지만 그
// 수정(max-h 112px)이 실측 최대치보다 낮아 조작면을 숨겼다. 4라운드는 상한을
// 버리고 min-height 만 뒀지만, 하네스가 계정 이름을 짧은 플레이스홀더로 재서
// "줄바꿈 자체가 안 일어난 상태"를 재는 착시였다(실제 계정명 조건에서는 여전히
// reels·tiktok 96px, delta 52px). 5라운드에서 headerRight 를 채널 무관 고정
// 2행(발행/대문 · 계정) 구조로 바꿨다 — 슬롯 수가 채널마다 갈리지 않으므로 줄
// 수가 내용과 무관하게 고정된다.
//
// ⚠️ 이 파일은 소스 문자열만 대조하는 정적 계약이다. jsdom 은 실제 CSS 레이아웃
// 엔진이 없어 getBoundingClientRect 가 항상 0을 반환한다. 실제 픽셀 증거는
// 헤드리스 브라우저로 재는 `scripts/measure-publish-room-alignment.mjs`
// (`npm run qa:publish-room-alignment`) 산출값이 유일하다. PR #77 코멘트에 그
// 결과를 첨부한다. 이 파일의 역할은 "이미 밝혀진 무효한 접근으로 되돌아가지
// 않는다"를 지키는 회귀 가드일 뿐이다.
const src = (p: string) => readFileSync(resolve(__dirname, "../../src", p), "utf8");

describe("미리보기 카드가 한 줄에서 시작한다(회귀 가드. 실측 증거는 qa:publish-room-alignment)", () => {
  it("그리드가 카드를 같은 높이로 늘리려 하지 않는다(카드 높이를 강제로 맞추지 않는다)", () => {
    const page = src("app/studio/page.tsx");
    expect(page).not.toContain('className="grid items-start gap-stack-section md:grid-cols-2 xl:grid-cols-3"');
    expect(page).toContain('className="grid gap-stack-section md:grid-cols-2 xl:grid-cols-3"');
    expect(page).toContain('className="flex min-w-0 flex-col rounded-surface');
  });

  it("Frame 은 h-full·self-stretch·420px 상자로 카드/미리보기 높이를 강제하지 않는다(1·2라운드 무효 접근)", () => {
    const preview = src("components/studio/PlatformPreview.tsx");
    expect(preview).not.toContain('className="flex h-full w-full max-w-sm flex-col self-stretch"');
    expect(preview).not.toContain("h-[420px] overflow-hidden");
    expect(preview).toContain('<div className="flex w-full max-w-sm flex-col" data-preview-card={p}>');
  });

  it("편집 칸은 mt-auto 로 바닥에 붙지 않고 자연스러운 흐름을 따른다", () => {
    const preview = src("components/studio/PlatformPreview.tsx");
    expect(preview).not.toMatch(/mt-auto border-t border-border pt-stack" data-testid=\{`inline-editor-/);
    expect(preview).toMatch(/mt-stack border-t border-border pt-stack" data-testid=\{`inline-editor-/);
  });

  it("headerRight 컨테이너는 상한으로 자르지 않는다(3라운드 112px 상한이 조작면을 숨겼다)", () => {
    const preview = src("components/studio/PlatformPreview.tsx");
    expect(preview).not.toMatch(/min-h-\[\d+px\] max-h-\[\d+px\] overflow-y-auto px-micro" data-preview-header-controls=\{p\}/);
    expect(preview).toMatch(/min-h-control-touch px-micro" data-preview-header-controls=\{p\}/);
  });

  it("headerRight 는 공용 PublishHeaderControls 하나로만 정의된다 — 고정 2행 구조(5라운드 + 6라운드 복제본 제거)", () => {
    // 2026-09-23 count:9: page.tsx 와 qa-alignment-harness 가 이 마크업을 손으로 두 벌
    // 유지해 측정이 실제 화면과 무관해졌다. 이제 양쪽이 같은 컴포넌트를 렌더한다.
    const shared = src("components/studio/PublishHeaderControls.tsx");
    const page = src("app/studio/page.tsx");
    const harness = src("app/qa-alignment-harness/AlignmentHarnessGrid.tsx");
    // 1행(발행/대문)과 2행(계정) 컨테이너가 항상 렌더된다. 조건부로 통째로 없어지지 않는다.
    expect(shared).toMatch(/flex flex-col items-end gap-micro/);
    // 대문 슬롯이 없는 채널도 투명 spacer 로 자리를 유지한다.
    expect(shared).toMatch(/text-caption text-transparent select-none">\s*대문 자동\s*<\/span>/);
    // 계정 select 는 폭을 고정하고 truncate 한다(무제한으로 늘어나 줄바꿈을 만들지 않는다).
    expect(shared).toMatch(/min-h-control-touch w-28 truncate rounded-control/);
    // 화면과 측정 하네스는 그 컴포넌트를 부르기만 한다(복제본 부활 차단).
    for (const [name, body] of [["page.tsx", page], ["AlignmentHarnessGrid.tsx", harness]] as const) {
      expect(body, `${name} 가 PublishHeaderControls 를 안 쓴다`).toContain("<PublishHeaderControls");
      expect(body, `${name} 에 헤더 마크업 복제본이 남아 있다`).not.toMatch(/min-h-control-touch w-28 truncate rounded-control/);
    }
  });

  it("헤더 계정 배지는 고정 높이 별도 줄이라 헤더 줄 수가 채널마다 갈리지 않는다(M1)", () => {
    const preview = src("components/studio/PlatformPreview.tsx");
    expect(preview).toMatch(/account \? \(\s*<div className="mb-stack-tight min-h-control-touch px-micro">/);
  });

  it("텍스트 채널 본문 편집 요소는 line-clamp 로 내용을 숨기지 않고 스크롤 가능한 최대 높이로 캡핑한다(N1)", () => {
    const preview = src("components/studio/PlatformPreview.tsx");
    for (const testId of ["preview-body-threads", "preview-body-x", "preview-body-facebook"]) {
      const idx = preview.indexOf(`testId="${testId}"`);
      expect(idx, `${testId} 를 찾지 못함`).toBeGreaterThan(-1);
      const slice = preview.slice(idx, idx + 400);
      expect(slice, `${testId} 가 아직 line-clamp 을 쓴다(N1 재발)`).not.toMatch(/line-clamp-\d/);
      // 5라운드: 리터럴 px 대신 globals.css 토큰(var(--preview-body-caption-max-h))을 쓴다.
      expect(slice, `${testId} 에 max-h 캡핑이 없다`).toMatch(/max-h-\[var\(--preview-body-caption-max-h\)\] overflow-y-auto/);
    }
  });

  it("세로 영상 3채널의 편집 칸 구성이 균일하다(캡션 인라인 칸 하나만, 제목·해시태그는 오버레이로 이동)", () => {
    const preview = src("components/studio/PlatformPreview.tsx");
    expect(preview).toContain("isVideoPlatform ? (");
    expect(preview).toContain('testId={`preview-title-${platform}`}');
    expect(preview).toContain('testId={`preview-tags-${platform}`}');
    expect(preview).toMatch(/contract\.title && !isVideoPlatform \? \(/);
  });

  it("영상 고지 배지는 상단 오버레이가 쓰는 자리를 정말로 피한다. 같은 top-* 자리로 옮기는 재발을 막는다(5라운드 재반려)", () => {
    // 2026-09-23 1차 수정("top-3 right-3 로 옮긴다")은 이 문자열 존재만 확인했는데,
    // vid 일 때 오버레이 컨테이너 자체가 absolute left-3 right-3 top-3(전체 폭)라
    // 오른쪽으로 옮겨도 여전히 같은 사각형 안이었다. jsdom 은 실제 레이아웃 엔진이
    // 없어 진짜 교집합은 이 파일로 증명 못 한다(파일 머리 주석 참고) — 대신 두
    // 요소가 서로 다른 축(오버레이=top, 배지=bottom)에 고정돼 있음을 확인해, 같은
    // top-* 계열 자리로 되돌아가는 재발만은 막는다. 실제 시각 겹침은 폭 1792
    // 스크린샷으로 사람이 확인해야 한다(이 테스트의 한계로 남긴다).
    const preview = src("components/studio/PlatformPreview.tsx");
    const delivered = src("components/studio/DeliveredMedia.tsx");
    expect(preview, "poster-missing 배지가 다시 top-* 자리를 쓴다")
      .toMatch(/preview-poster-missing-\$\{k\}[\s\S]{0,80}bottom-16 right-3/);
    expect(delivered, "poster-expired 배지가 다시 top-* 자리를 쓴다")
      .toMatch(/poster-expired[\s\S]{0,120}bottom-16 right-3/);
  });

  it("발행실 카드에는 오른쪽 사이드바 채팅형 편집이 없다(4라운드: 세 번 깨진 싱글턴을 별도 브랜치로 이관)", () => {
    const preview = src("components/studio/PlatformPreview.tsx");
    const layout = src("app/layout.tsx");
    expect(preview, "PublishEditSidebar 로 되돌아가면 세 라운드 연속 깨진 싱글턴이 재발한다")
      .not.toMatch(/EditTrigger|PublishEditSidebarMount/);
    expect(layout).not.toContain("PublishEditSidebarMount");
  });
});
