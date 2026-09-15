import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

/**
 * 2026-09-15 사파리(배포본 1440 폭) 실측에서 44px 미만으로 잡힌 조작 대상 계약.
 *
 * `app-touch-target-contract.test.ts` 가 2026-09-14 실측(설정·캘린더·인박스·배너)을
 * 고정한 뒤, 다음 날 별도 실측에서 새 화면 묶음(홈·성과·블로그·블로그 성과·키워드
 * 플래너·네이버/구글 트렌드·검색 어드바이저·서치 콘솔·이미지·영상)에서 44px 미만이
 * 나왔다. 표식은 `ds-touch-target` 또는 `min-h-control-touch` 둘 중 하나면 된다
 * (DESIGN.md 부품표 `--control-touch: 44px`).
 *
 *   실측 위반 → 수정
 *     /, /performance          카드 안 텍스트 링크 459x18·342x18       → PerformanceRoom.tsx
 *     /blog                    탭 버튼 34px · "보기" 링크 70x18        → blog/page.tsx
 *     /blog-performance 외 5개 공유 뒤로가기 38x20                     → shared/BackButton.tsx
 *     /blog-performance         정렬 버튼 47x26 ×2                     → blog-performance/page.tsx
 *     /keyword-planner          입력 38 · 조회 버튼 38                 → keyword-planner/page.tsx
 *     /google-trends            "Google Trends 열기" 링크 146x36       → google-trends/page.tsx
 *     /images                   썸네일 오버레이 버튼 30x30 ×2 종류      → images/page.tsx
 *     /videos                   탭 버튼 34px ×2 · 채널 관리 링크 59x18 ×2 · URL 입력 36
 *                                                                       → videos/page.tsx
 *   /calendar 의 55x15 링크는 문장 안 글자 링크로 이미 등록된 inline 예외
 *   (`app-touch-target-contract.test.ts` 의 INLINE_TEXT_EXCEPTIONS)라 새로 손대지 않았다.
 */

const root = process.cwd();
const read = (relative: string) => readFileSync(resolve(root, relative), "utf8");

const TOUCH_MARKERS = ["ds-touch-target", "min-h-control-touch"];

/**
 * 파일에서 needle 을 찾아 앞뒤로 살을 붙인 창을 돌려준다. JSX 는 className 이 텍스트보다
 * 앞에 오므로 뒤로만 자르면 놓친다 — 앞쪽 before 만큼도 함께 본다.
 */
function windowAround(source: string, needle: string, before = 300, after = 200): string {
  const idx = source.indexOf(needle);
  expect(idx, `대상 문자열을 찾을 수 없다: ${needle}`).toBeGreaterThanOrEqual(0);
  return source.slice(Math.max(0, idx - before), idx + needle.length + after);
}

describe("2026-09-15 사파리 44px 스윕 계약", () => {
  it("QA-SAFARI44-01 정상: 성과 카드 링크(실제 게시물 보기 / 생성실에서 바로 확인하기)가 하한 표식을 갖는다", () => {
    const source = read("src/components/home/PerformanceRoom.tsx");
    expect(windowAround(source, "실제 게시물 보기")).toMatch(/min-h-control-touch/);
    expect(windowAround(source, "생성실에서 바로 확인하기")).toMatch(/min-h-control-touch/);
  });

  it("QA-SAFARI44-02 정상: 블로그 탭 버튼과 '보기' 링크가 하한 표식을 갖는다", () => {
    const source = read("src/app/blog/page.tsx");
    expect(windowAround(source, "text-caption rounded-chip ${tab === t")).toMatch(/min-h-control-touch/);
    expect(windowAround(source, "보기 →")).toMatch(/min-h-control-touch/);
  });

  it("QA-SAFARI44-03 정상: 공유 BackButton 이 하한 표식을 갖는다 (블로그 성과 외 5개 화면 공용)", () => {
    const source = read("src/components/shared/BackButton.tsx");
    expect(source).toMatch(/min-h-control-touch/);
  });

  it("QA-SAFARI44-04 정상: 블로그 성과 정렬 버튼(조회순/최신순) 둘 다 하한 표식을 갖는다", () => {
    const source = read("src/app/blog-performance/page.tsx");
    expect(windowAround(source, 'setSortBy("views")')).toMatch(/min-h-control-touch/);
    expect(windowAround(source, 'setSortBy("date")')).toMatch(/min-h-control-touch/);
  });

  it("QA-SAFARI44-05 정상: 키워드 플래너 입력과 조회 버튼이 하한 표식을 갖는다", () => {
    const source = read("src/app/keyword-planner/page.tsx");
    expect(windowAround(source, "키워드 입력 (쉼표")).toMatch(/min-h-control-touch/);
    expect(windowAround(source, "handleSearch}\n            disabled={searching}")).toMatch(/min-h-control-touch/);
  });

  it("QA-SAFARI44-06 정상: Google Trends 열기 링크가 하한 표식을 갖는다", () => {
    const source = read("src/app/google-trends/page.tsx");
    expect(windowAround(source, "Google Trends 열기")).toMatch(/min-h-control-touch/);
  });

  it("QA-SAFARI44-07 정상: 이미지 갤러리 오버레이 단추(URL 복사/삭제)가 44x44 ds-touch-target 을 갖는다", () => {
    const source = read("src/app/images/page.tsx");
    expect(windowAround(source, 'title="URL 복사"')).toMatch(/ds-touch-target/);
    expect(windowAround(source, 'title="삭제"')).toMatch(/ds-touch-target/);
  });

  it("QA-SAFARI44-08 정상: 영상 탭 버튼 둘, 채널 관리 링크 둘, 리퍼포즈 URL 입력이 하한 표식을 갖는다", () => {
    const source = read("src/app/videos/page.tsx");
    expect(windowAround(source, 'onClick={() => setTab("list")}')).toMatch(/min-h-control-touch/);
    expect(windowAround(source, 'onClick={() => setTab("generate")}')).toMatch(/min-h-control-touch/);
    const youtubeLink = windowAround(source, 'href="/channels/youtube"');
    expect(youtubeLink).toMatch(/min-h-control-touch/);
    const tiktokLink = windowAround(source, 'href="/channels/tiktok"');
    expect(tiktokLink).toMatch(/min-h-control-touch/);
    expect(windowAround(source, "YouTube 긴 영상 주소")).toMatch(/min-h-control-touch/);
  });

  it("QA-SAFARI44-09 경계: 하한 표식 상수는 둘 중 하나만 있으면 된다는 계약을 스스로 지킨다", () => {
    expect(TOUCH_MARKERS).toEqual(["ds-touch-target", "min-h-control-touch"]);
  });

  it("QA-SAFARI44-10 정상: 블로그 키워드 배너의 '키워드 찾기' 링크 둘 다 하한 표식을 갖는다 (2026-09-16 재측정)", () => {
    const source = read("src/app/blog/page.tsx");
    expect(windowAround(source, "더 많은 키워드 찾기 →")).toMatch(/min-h-control-touch/);
    expect(windowAround(source, ">키워드 찾기 →</a>")).toMatch(/min-h-control-touch/);
  });

  it("QA-SAFARI44-11 정상: 영상 리퍼포즈 Clip 버튼과 슬라이드 추가 버튼이 하한 표식을 갖는다 (2026-09-16 재측정)", () => {
    const source = read("src/app/videos/page.tsx");
    expect(windowAround(source, "onClick={handleRepurpose}")).toMatch(/min-h-control-touch/);
    expect(windowAround(source, "onClick={addSlide}")).toMatch(/min-h-control-touch/);
  });
});
