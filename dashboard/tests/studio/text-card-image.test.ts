import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import {
  CARD_PIXELS,
  DEFAULT_CARD_THEME,
  themeFromPalette,
  wrapLines,
  renderTextCard,
} from "@/lib/studio/text-card-image";

// 2026-09-10 회장 지적: "왜 영상 이미지 등은 하나도 없냐."
// 실측: 카드뉴스 대표 이미지도 숏폼 영상도 전부 바깥 그림 생성기 하나를 거치는데 그 생성기가
// 서버에서 로그아웃 상태였다(GENERATOR_UNAUTHENTICATED). 그래서 그림이 한 장도 없다.
//
// 진짜 문제는 로그아웃이 아니라 구조다. 볼 수 있는 결과물 전체가 바깥 기계 하나에 매달려
// 있었다. 카드뉴스를 파는 제품에서 그림 0장은 제품이 아니다.
describe("글자만으로 카드 그림 만들기", () => {
  it("올릴 곳이 요구하는 실제 픽셀로 그린다", () => {
    // 화면 크기로 그리면 올렸을 때 흐리다.
    expect(CARD_PIXELS["4:5"]).toEqual({ width: 1080, height: 1350 });
    expect(CARD_PIXELS["9:16"]).toEqual({ width: 1080, height: 1920 });
  });

  it("브랜드 색 칸의 사람 말에서 색을 읽는다", () => {
    const theme = themeFromPalette("오렌지·베이지. 예: 오렌지와 베이지를 중심으로 씁니다.");
    expect(theme.background).toBe("#E8843C");
    expect(theme.accent).toBe("#E8DCC8");
  });

  it("모르는 색 이름은 억지로 찍지 않고 기본값을 쓴다", () => {
    // 모르는 색을 추측해 찍으면 브랜드가 아닌 색이 나간다.
    expect(themeFromPalette("형광 라임빛 오로라")).toEqual(DEFAULT_CARD_THEME);
    expect(themeFromPalette("")).toEqual(DEFAULT_CARD_THEME);
    expect(themeFromPalette(null)).toEqual(DEFAULT_CARD_THEME);
  });

  it("밝은 배경에는 어두운 글자를 쓴다", () => {
    // 대비가 없으면 글자가 안 읽힌다. 노랑 배경에 흰 글자가 나오면 안 된다.
    expect(themeFromPalette("노랑").foreground).toBe("#12100E");
    expect(themeFromPalette("남색").foreground).toBe("#F7F3EE");
  });

  it("긴 한국어 줄을 칸 안으로 접는다", () => {
    // 한국어는 띄어쓰기가 드물어 낱말 단위로만 나누면 한 줄이 통째로 넘친다.
    const measure = (text: string) => text.length * 10;
    const lines = wrapLines(measure, "가나다라마바사아자차카타파하가나다라마바사", 100);
    expect(lines.length).toBeGreaterThan(1);
    for (const line of lines) expect(measure(line)).toBeLessThanOrEqual(100);
  });

  it("줄바꿈을 그대로 지킨다", () => {
    const measure = (text: string) => text.length * 1;
    expect(wrapLines(measure, "첫 줄\n둘째 줄", 1000)).toEqual(["첫 줄", "둘째 줄"]);
  });

  it("브라우저가 아니면 그리지 않고 비운다", () => {
    // 서버에서 부르면 조용히 이상한 값을 내는 대신 없다고 말한다.
    expect(renderTextCard({ text: "확인", ratio: "1:1" })).toBeNull();
  });
});

// 화면에 실제로 붙어 있어야 사용자가 쓴다. 라이브러리만 만들고 안 걸면 아무 일도 안 일어난다.
describe("글자 카드가 화면에 붙어 있다", () => {
  const src = readFileSync(
    resolve(process.cwd(), "src/components/studio/StudioRooms.tsx"),
    "utf8",
  );

  it("생성실에 글자 카드 단추가 있다", () => {
    expect(src).toContain('data-testid="create-text-card"');
    expect(src).toContain("글자 카드로 만들기 (바로·무료)");
  });

  it("돈이 안 든다는 것을 단추에서 바로 말한다", () => {
    // 옆의 대표 이미지 단추는 비용 승인을 받는다. 둘의 차이를 누르기 전에 알려야 한다.
    expect(src).toMatch(/글자 카드로 만들기 \(바로·무료\)/);
  });

  it("만든 카드를 화면에 보여 준다", () => {
    expect(src).toContain("data-text-card-result");
    expect(src).toContain("data-text-card-image");
  });

  it("브랜드 색을 카드에 쓴다", () => {
    expect(src).toContain("themeFromPalette(learning.palette)");
  });

  it("구조 초안이 없으면 이유를 말한다", () => {
    // 조용히 아무 일도 안 일어나면 사용자는 고장으로 읽는다.
    expect(src).toContain("먼저 구조 초안을 하나 골라 주세요");
    expect(src).toContain("data-text-card-error");
  });
});
