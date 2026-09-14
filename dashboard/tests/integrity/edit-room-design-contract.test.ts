import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

/**
 * 2026-09-14 디자인 QA 가 승인 시안(`docs/design-docs/osmu-edit-room-cardnews-v1.0-opus-20260913.html`)과
 * 실화면을 대조해 세 가지를 잡았다. 세 가지 다 여기서 고정한다.
 *
 *  1. 44px 미만 조작 영역 — 편집실 1440 실측 26개. 세로는 44 인데 가로가 27~42 였다.
 *  2. 편집실 3열 격자 — DESIGN.md §4 「편집실 3영역 골격(v65)」의 `176px | minmax(0,1fr) | 248px`.
 *  3. 서체 1종 — DESIGN.md §3. 실화면 첫 패밀리가 `ui-sans-serif` 였다.
 *
 * 실렌더 측정값(고친 뒤, Chromium, 라이트, 편집실 카드뉴스 4장):
 *   1440 → workbench `176px 870px` · room `1064px 248px` · 44px 미만 0개 · 가로 넘침 0
 *   1024 → workbench `176px 454px` · room `648px 248px`  · 44px 미만 0개 · 가로 넘침 0
 *    390 → 1열(`340px`)                                   · 44px 미만 0개 · 가로 넘침 0
 * 브라우저 없이 도는 회귀 방어라서 여기서는 그 값을 만드는 소스 계약을 검사한다.
 */

const read = (relative: string) => readFileSync(resolve(process.cwd(), relative), "utf8");

const globals = read("src/app/globals.css");
const button = read("src/components/shared/Button.tsx");
const studioRoomsCss = read("src/components/studio/StudioRooms.module.css");
const sidebar = read("src/components/layout/Sidebar.tsx");
const themeToggle = read("src/components/layout/ThemeToggle.tsx");

describe("편집실 조작 영역 하한 계약", () => {
  it("QA-EDIT-TOUCH-01 정상: `.ds-touch-target` 이 가로·세로 모두 `--control-touch` 를 건다", () => {
    const rule = globals.match(/\.ds-touch-target\s*\{([^}]*)\}/);
    expect(rule, "globals.css 에 .ds-touch-target 규칙이 있어야 한다").toBeTruthy();
    expect(rule?.[1]).toMatch(/min-width:\s*var\(--control-touch\)/);
    expect(rule?.[1]).toMatch(/min-height:\s*var\(--control-touch\)/);
  });

  it("QA-EDIT-TOUCH-02 경계: 수학 함수 안에 내재 크기 키워드를 넣지 않는다", () => {
    // `min-width: max(44px, max-content)` 는 문법상 무효라 선언 전체가 조용히 버려진다.
    // 실제로 그렇게 적어 두고 고쳤다고 착각한 적이 있어(2026-09-14) 경계로 남긴다.
    const rule = globals.match(/\.ds-touch-target\s*\{([^}]*)\}/)?.[1] ?? "";
    expect(rule).not.toMatch(/(min|max|clamp)\([^)]*(max-content|min-content|fit-content|auto)/);
  });

  it("QA-EDIT-TOUCH-03 정상: `.ds-touch-target` 이 `.ds-label` 보다 뒤에 있어 min-width 싸움에서 이긴다", () => {
    expect(globals.indexOf(".ds-touch-target")).toBeGreaterThan(globals.indexOf(".ds-label {"));
  });

  it("QA-EDIT-TOUCH-04 정상: 공용 Button 의 기본 최소 폭이 `min-w-max` 가 아니라 44px 하한이다", () => {
    expect(button).toContain('"ds-touch-target"');
    expect(button).not.toContain('"min-w-max"');
  });

  it("QA-EDIT-TOUCH-05 경계: 호출부가 min-w- 를 직접 주면 그 값을 존중한다(좁은 칸 보호)", () => {
    // 목차·카드처럼 폭이 못 박힌 칸에서는 44px 하한이 칸을 밀어낸다. 탈출구를 지운 적이
    // 있는지 검사한다.
    expect(button).toMatch(/\/\(\^\|\\s\)min-w-\/\.test\(className\)/);
  });

  it("QA-EDIT-TOUCH-06 정상: 사이드바 묶음 접기·테마·로그아웃 단추가 44px 세로를 갖는다", () => {
    // 이 셋은 Button 컴포넌트를 안 쓰는 맨 <button> 이라 공용 수정이 안 닿는다.
    // 실측 높이는 각각 12px · 24px · 26px 이었다.
    expect(sidebar).toMatch(/min-h-control-touch px-stack mb-micro w-full flex items-center justify-between/);
    expect(sidebar).toMatch(/min-h-control-touch w-full flex items-center gap-stack-tight[^"]*hover:text-danger/);
    expect(themeToggle).toMatch(/min-h-control-touch w-full flex items-center gap-stack-tight/);
  });
});

describe("편집실 3영역 골격 계약 (DESIGN.md §4 v65)", () => {
  it("QA-EDIT-GRID-01 정상: 목차 칸이 176px(11rem)이고 본문이 남는 폭을 다 쓴다", () => {
    // 격자는 한 겹이 아니라 두 겹이다. 작업대가 `176px | 1fr`, 방이 `1fr | 248px` 이라
    // 합쳐서 계약값 `176px | minmax(0,1fr) | 248px` 이 나온다.
    expect(studioRoomsCss).toMatch(/\.editWorkbench\s*\{[\s\S]*?grid-template-columns:\s*11rem minmax\(0, 1fr\)/);
  });

  it("QA-EDIT-GRID-02 정상: 편집 담당 칸이 248px(15.5rem)이다", () => {
    expect(studioRoomsCss).toMatch(/\.editRoomGrid\s*\{[\s\S]*?grid-template-columns:\s*minmax\(0, 1fr\) 15\.5rem/);
  });

  it("QA-EDIT-GRID-03 경계: 390 에서 목차 최대 높이가 144px(9rem)이다", () => {
    expect(studioRoomsCss).toMatch(/max-width:\s*24\.4375rem[\s\S]*?max-height:\s*9rem/);
  });
});

describe("서체 1종 계약 (DESIGN.md §3)", () => {
  it("QA-EDIT-FONT-01 정상: html·body 서체 첫 패밀리가 Pretendard 다", () => {
    const stack = globals.match(/--font-sans-stack:\s*([^;]+);/)?.[1]?.trim();
    expect(stack, "globals.css 에 --font-sans-stack 이 있어야 한다").toBeTruthy();
    expect(stack?.split(",")[0].trim()).toBe("Pretendard");
  });

  it("QA-EDIT-FONT-02 정상: 그 스택이 html·body 에 실제로 걸려 Tailwind preflight 를 이긴다", () => {
    // preflight 가 `@layer base` 에서 ui-sans-serif 를 깔기 때문에, 토큰만 정의하고
    // 적용을 안 하면 실화면 첫 패밀리는 그대로 `ui-sans-serif` 다(2026-09-14 실측).
    expect(globals).toMatch(/html,\s*body\s*\{[^}]*font-family:\s*var\(--font-sans-stack\)/);
  });

  it("QA-EDIT-FONT-03 경계: 한글 폴백이 사슬에 남아 있다", () => {
    const stack = globals.match(/--font-sans-stack:\s*([^;]+);/)?.[1] ?? "";
    expect(stack).toMatch(/Apple SD Gothic Neo/);
  });
});
