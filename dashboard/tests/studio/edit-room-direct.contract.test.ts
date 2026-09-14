import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

// 2026-09-09 회장 지적과 경쟁사 조사 반영.
// "목차의 의미 몰라? vrew 처럼 장면 대사보고 자막이나 음성 바로 편집가능하게하는건데."
// "대문 사진, 본문, 마지막 사진 등 사진 여러개 흐름이 한 세트가 되는 경우가 많을거같은데."
//
// 종전 편집실은 한 줄을 눌러 고른 뒤 그 줄만 입력칸이 됐다. 나머지는 읽기만 되는 목록이라
// 이 자리가 편집기가 아니라 목차로 읽혔다. 고칠 곳을 고르는 동작이 고치는 동작 앞에 하나
// 더 있으면 그만큼 손이 는다. Vrew 가 하는 것은 대본을 그대로 고치게 두는 것이다.
//
// 계약: 모든 줄이 언제나 입력칸이다. 순서를 바꿀 수 있다. 줄을 더할 수 있다.
const src = readFileSync(resolve(__dirname, "../../src/components/studio/StudioRooms.tsx"), "utf8");

describe("편집실은 목차가 아니라 편집기다", () => {
  it("모든 줄이 언제나 입력칸이다", () => {
    // 고른 줄만 입력칸이 되던 옛 분기가 남아 있으면 안 된다.
    expect(src).not.toMatch(/activeLine === index \? <input/);
    expect(src).toContain("data-line-input={index}");
  });

  it("고르는 단계 없이 바로 값이 바뀐다", () => {
    // 입력 자체가 곧 변경이어야 한다. 고른 줄을 참조해 바꾸면 고르기가 앞에 남는다.
    expect(src).toMatch(/data-line-input=\{index\}[\s\S]{0,400}lineIndex === index \? event\.target\.value/);
  });

  it("여러 장이 한 세트이므로 순서를 바꿀 수 있다", () => {
    expect(src).toContain("data-line-up={index}");
    expect(src).toContain("data-line-down={index}");
    expect(src).toContain("const moveLine =");
    // 줄과 보임 여부가 따로 놀면 엉뚱한 줄이 지워진 것처럼 보인다.
    expect(src).toMatch(/moveLine[\s\S]{0,600}setVisibleLines/);
  });

  it("줄을 더할 수 있다", () => {
    expect(src).toContain("data-line-add");
    expect(src).toMatch(/onLinesChange\(\[\.\.\.safeLines, ""\]\)/);
  });

  it("고르는 개념이 사라졌으므로 제목도 그렇게 적는다", () => {
    expect(src).not.toContain("선택한 장면 대사");
    expect(src).toContain("장면 대사");
  });
});
