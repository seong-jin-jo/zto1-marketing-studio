import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { toGeneratorRatio, GENERATOR_RATIOS } from "@/lib/generator-aspect-ratio";

// 2026-09-10 실측: 생성기 로그인을 되살리고 나서야 진짜 오류가 보였다.
// `Invalid values: aspect_ratio=4:5 (allowed: 1:1,16:9,9:16,4:3,3:4,3:2,2:3)`
// 카드뉴스 기본 화면비 4:5 를 생성기가 모른다. 그래서 로그인이 살아 있어도 카드뉴스 대표
// 이미지는 언제나 실패했다. 앞의 벽이 막고 있으면 뒤의 벽은 보이지 않는다.
describe("생성기 화면비 옮기기", () => {
  it("카드뉴스 4:5 를 가장 가까운 세로 비로 옮긴다", () => {
    // 4:5 = 0.80. 3:4 = 0.75 가 가장 가깝다. 1:1 로 보내면 위아래가 남고
    // 9:16(0.5625)으로 보내면 너무 길어 잘린다.
    expect(toGeneratorRatio("4:5")).toBe("3:4");
  });

  it("생성기가 아는 값은 그대로 둔다", () => {
    for (const ratio of GENERATOR_RATIOS) {
      expect(toGeneratorRatio(ratio)).toBe(ratio);
    }
  });

  it("가로 광고 규격 1.91:1 을 가로 비로 옮긴다", () => {
    expect(toGeneratorRatio("1.91:1")).toBe("16:9");
  });

  it("공백이 섞여도 알아본다", () => {
    expect(toGeneratorRatio(" 9 : 16 ")).toBe("9:16");
  });

  it("알아볼 수 없으면 세로 기본값으로 둔다", () => {
    // 우리 결과물 대부분이 세로다. 모를 때 가로로 보내면 더 크게 어긋난다.
    expect(toGeneratorRatio("이상한값")).toBe("9:16");
    expect(toGeneratorRatio("")).toBe("9:16");
    expect(toGeneratorRatio(null)).toBe("9:16");
    expect(toGeneratorRatio("5:0")).toBe("9:16");
  });

  it("이미지 경로가 이 변환을 실제로 쓴다", () => {
    // 만들어 놓고 안 걸면 아무 일도 안 일어난다.
    const src = readFileSync(
      resolve(process.cwd(), "src/app/api/higgsfield/image/route.ts"),
      "utf8",
    );
    expect(src).toContain("toGeneratorRatio(aspectRatio)");
  });
});
