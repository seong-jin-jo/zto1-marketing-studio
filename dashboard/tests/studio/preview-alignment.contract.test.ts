import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

// 2026-09-09 회장 지적: "발행실에서는 스레드는 컴포넌트 위치가 왜 살짝 아래로 내려갔냐."
// 실측하니 편집 칸 시작점이 채널마다 달랐다. X 1417, Facebook 1448, Threads 1532 픽셀.
//
// 2026-09-22 교차 코드리뷰(PR #77) 세 라운드의 결론:
// 1라운드 진단("h-full 없음")은 틀렸다. 2라운드 진단·수정(카드 총 높이 고정 +
// 420px 상자)도 새 결함을 냈다(N1 편집 요소 클램프로 내용 소실, N2 420px 상자가
// 첫 댓글 편집 칸까지 잘라냄). 3라운드에서 회장이 9444 운영 화면(폭 1792)을 직접
// 재서 밝힌 진짜 기계적 원인은 카드 머리줄 자체의 높이가 채널마다 44/72/124px 로
// 갈리는 것 — headerRight(발행 체크박스·대문 시점·계정 연결/관리)가 아이콘/라벨과
// 같은 줄에서 폭 384px 안에 1~3줄로 감겼기 때문이다.
//
// ⚠️ 이 파일은 소스 문자열만 대조하는 정적 계약이다. jsdom 은 실제 CSS 레이아웃
// 엔진이 없어 getBoundingClientRect 가 항상 0을 반환한다 — 그래서 "정말로 같은
// y 에서 시작하는가" 는 이 파일로 증명할 수 없다(1·2라운드가 "동어반복"으로
// 지적받은 근본 이유). 실제 픽셀 증거는 헤드리스 브라우저로 재는
// `scripts/measure-publish-room-alignment.mjs`(package.json `qa:publish-room-alignment`)
// 산출값이 유일하다. PR #77 코멘트에 그 결과를 첨부한다. 이 파일의 역할은 그보다
// 작다: "그 수정이 다시 되돌려지지 않는다"를 지키는 회귀 가드일 뿐이다.
const src = (p: string) => readFileSync(resolve(__dirname, "../../src", p), "utf8");

describe("미리보기 카드가 한 줄에서 시작한다(회귀 가드 — 실측 증거는 qa:publish-room-alignment)", () => {
  it("그리드가 카드를 같은 높이로 늘리려 하지 않는다(카드 높이를 강제로 맞추지 않는다)", () => {
    const page = src("app/studio/page.tsx");
    expect(page).not.toContain('className="grid items-start gap-stack-section md:grid-cols-2 xl:grid-cols-3"');
    expect(page).toContain('className="grid gap-stack-section md:grid-cols-2 xl:grid-cols-3"');
    expect(page).toContain('className="flex min-w-0 flex-col rounded-surface');
  });

  it("Frame 은 h-full·self-stretch·420px 상자로 카드/미리보기 높이를 강제하지 않는다", () => {
    const preview = src("components/studio/PlatformPreview.tsx");
    // 이 문자열들이 다시 나타나면 1·2라운드가 밝힌 무효한 접근으로 되돌아간 것이다.
    expect(preview).not.toContain('className="flex h-full w-full max-w-sm flex-col self-stretch"');
    expect(preview).not.toContain("h-[420px] overflow-hidden");
    expect(preview).toContain('<div className="flex w-full max-w-sm flex-col" data-preview-card={p}>');
  });

  it("편집 칸은 mt-auto 로 바닥에 붙지 않고 자연스러운 흐름을 따른다", () => {
    const preview = src("components/studio/PlatformPreview.tsx");
    expect(preview).not.toMatch(/mt-auto border-t border-border pt-stack" data-testid=\{`inline-editor-/);
    expect(preview).toMatch(/mt-stack border-t border-border pt-stack" data-testid=\{`inline-editor-/);
  });

  it("headerRight 는 아이콘/라벨 줄과 분리된 고정 높이 줄이다(3라운드 진짜 원인 수정)", () => {
    const preview = src("components/studio/PlatformPreview.tsx");
    // 아이콘/라벨 줄은 이제 flex-nowrap 이고 headerRight 를 품지 않는다.
    expect(preview).toContain('<div className="flex flex-nowrap items-center gap-stack-tight px-micro">');
    expect(preview).not.toMatch(/flex flex-wrap items-center gap-stack-tight px-micro">\s*<Logo/);
    // headerRight 전용 줄: 고정 높이 예약 + overflow-y-auto(내용을 숨기지 않는다, N2 교훈).
    expect(preview).toMatch(/min-h-\[112px\] max-h-\[112px\] overflow-y-auto px-micro" data-preview-header-controls=\{p\}/);
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
      // line-clamp 는 -webkit-line-clamp+overflow:hidden 이라 5줄째부터 타이핑한 글자가
      // 화면에서 사라진다(N1, contentEditable 자체에 걸려 있었다). max-h+overflow-y-auto
      // 는 스크롤로 캡핑해 편집 중인 내용이 사라지지 않는다.
      expect(slice, `${testId} 가 아직 line-clamp 을 쓴다(N1 재발)`).not.toMatch(/line-clamp-\d/);
      expect(slice, `${testId} 에 max-h 캡핑이 없다`).toMatch(/max-h-\[\d+px\] overflow-y-auto/);
    }
  });

  it("세로 영상 3채널의 편집 칸 칩 구성이 균일하다(캡션 트리거 하나만, 제목·해시태그는 오버레이로 이동)", () => {
    const preview = src("components/studio/PlatformPreview.tsx");
    expect(preview).toContain("isVideoPlatform ? (");
    expect(preview).toContain('testId={`preview-trigger-${platform}-caption`}');
    // 제목 칩은 영상 채널에서 만들지 않는다(오버레이가 유일 입구, C2 수정).
    expect(preview).toMatch(/contract\.title && !isVideoPlatform \? \(/);
  });

  it("PublishEditSidebarMount 는 카드(Frame) 안이 아니라 앱 루트 레이아웃에 정확히 한 번만 있다(N3)", () => {
    const preview = src("components/studio/PlatformPreview.tsx");
    const layout = src("app/layout.tsx");
    expect(preview, "Frame 이 다시 PublishEditSidebarMount 를 그리면 카드 수만큼 마운트되는 N3/C1 이 재발한다")
      .not.toContain("PublishEditSidebarMount");
    expect(layout).toContain("<PublishEditSidebarMount />");
  });
});
