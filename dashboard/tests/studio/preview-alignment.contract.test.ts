import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

// 2026-09-09 회장 지적: "발행실에서는 스레드는 컴포넌트 위치가 왜 살짝 아래로 내려갔냐."
// 실측하니 편집 칸 시작점이 채널마다 달랐다. X 1417, Facebook 1448, Threads 1532 픽셀.
//
// 2026-09-22 교차 코드리뷰(PR #77) 네 라운드의 결론:
// 1라운드 진단("h-full 없음")은 틀렸다. 2라운드 진단·수정(카드 총 높이 고정 +
// 420px 상자)도 새 결함을 냈다(N1 편집 요소 클램프로 내용 소실, N2 420px 상자가
// 첫 댓글 편집 칸까지 잘라냄). 3라운드에서 회장이 9444 운영 화면(폭 1792)을 직접
// 재서 밝힌 진짜 기계적 원인은 카드 머리줄 자체의 높이가 채널마다 44/72/124px 로
// 갈리는 것(headerRight 줄바꿈)이었지만, 그 수정(max-h+overflow-y-auto 112px)도
// 실측 최대치(124px)보다 낮게 잡아 "계정 관리" 같은 주 조작면을 스크롤 뒤로 숨겼다.
// 4라운드에서 상한으로 자르는 접근 자체를 버리고 min-height 만 준다(overflow 제한
// 없음). 짧은 카드는 채워서 맞추고, 긴 카드는 잘리지 않고 자연스럽게 자란다.
//
// ⚠️ 이 파일은 소스 문자열만 대조하는 정적 계약이다. jsdom 은 실제 CSS 레이아웃
// 엔진이 없어 getBoundingClientRect 가 항상 0을 반환한다. 그래서 "정말로 같은
// y 에서 시작하는가" 는 이 파일로 증명할 수 없다. 실제 픽셀 증거는 헤드리스
// 브라우저로 재는 `scripts/measure-publish-room-alignment.mjs`
// (`npm run qa:publish-room-alignment`) 산출값이 유일하다. PR #77 코멘트에 그
// 결과를 첨부한다. 이 파일의 역할은 그보다 작다: "이미 밝혀진 무효한 접근으로
// 되돌아가지 않는다"를 지키는 회귀 가드일 뿐이다.
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

  it("headerRight 는 아이콘/라벨 줄과 분리된 별도 줄이고, 상한으로 자르지 않는다(4라운드: 3라운드 112px 상한이 조작면을 숨겼다)", () => {
    const preview = src("components/studio/PlatformPreview.tsx");
    // 아이콘/라벨 줄은 다시 flex-wrap 이다(3라운드에서 nowrap 으로 바꿨던 게 좁은
    // 화면 안전장치와 모순이라는 지적을 받아 되돌렸다).
    expect(preview).toContain('<div className="flex flex-wrap items-center gap-stack-tight px-micro">');
    // headerRight 전용 줄: min-height 만 있고 max-height·overflow 제한은 없다. 이
    // 문자열이 다시 나타나면 조작면을 숨기던 3라운드 결함이 재발한 것이다.
    expect(preview).not.toMatch(/min-h-\[\d+px\] max-h-\[\d+px\] overflow-y-auto px-micro" data-preview-header-controls=\{p\}/);
    expect(preview).toMatch(/min-h-control-touch px-micro" data-preview-header-controls=\{p\}/);
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
      expect(slice, `${testId} 에 max-h 캡핑이 없다`).toMatch(/max-h-\[\d+px\] overflow-y-auto/);
    }
  });

  it("세로 영상 3채널의 편집 칸 구성이 균일하다(캡션 인라인 칸 하나만, 제목·해시태그는 오버레이로 이동)", () => {
    const preview = src("components/studio/PlatformPreview.tsx");
    expect(preview).toContain("isVideoPlatform ? (");
    expect(preview).toContain('testId={`preview-title-${platform}`}');
    expect(preview).toContain('testId={`preview-tags-${platform}`}');
    // 제목·해시태그 칸은 영상 채널의 하단 메타 폼에서 만들지 않는다(오버레이가 유일 입구, C2 수정).
    expect(preview).toMatch(/contract\.title && !isVideoPlatform \? \(/);
  });

  it("발행실 카드에는 오른쪽 사이드바 채팅형 편집이 없다(4라운드: 세 번 깨진 싱글턴을 별도 브랜치로 이관)", () => {
    const preview = src("components/studio/PlatformPreview.tsx");
    const layout = src("app/layout.tsx");
    expect(preview, "PublishEditSidebar 로 되돌아가면 세 라운드 연속 깨진 싱글턴이 재발한다")
      .not.toMatch(/EditTrigger|PublishEditSidebarMount/);
    expect(layout).not.toContain("PublishEditSidebarMount");
  });
});
