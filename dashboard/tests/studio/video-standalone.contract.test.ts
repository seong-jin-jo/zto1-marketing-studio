import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

// 2026-09-08 회장: "왜 카드뉴스 대표이미지를 만들어야 숏폼 영상만들기가 되는거냐".
// 영상은 그림을 움직여 만드는 것이라 바탕 그림이 필요한 것은 맞다. 그러나 그것은 우리
// 사정이지 고객 사정이 아니다. 고객은 영상 만들기를 눌렀을 뿐인데 거절당하고 다른 단추를
// 먼저 누르라는 말을 들었다. 계약: 필요한 것이면 우리가 만들고 이어서 간다.
const src = readFileSync(resolve(__dirname, "../../src/app/studio/page.tsx"), "utf8");

describe("숏폼 영상 단독 실행", () => {
  it("바탕 그림이 없어도 거절하지 않는다", () => {
    expect(src).not.toContain("먼저 카드뉴스 대표 이미지를 만들어 주세요");
    expect(src).toContain("needsBaseImage");
  });

  it("바탕 그림이 필요하면 비용 안내 문구가 그 사실을 말한다", () => {
    expect(src).toContain("바탕이 될 그림을 먼저 만들고");
  });

  it("바탕 그림을 만든 뒤 이어서 영상을 만든다", () => {
    const at = src.indexOf("needsBaseImage");
    const body = src.slice(at, at + 3000);
    expect(body.indexOf("영상 바탕 그림 만드는 중")).toBeGreaterThan(0);
    expect(body.indexOf("genVideo({ localPath: source?.localPath, filename: baseFilename })")).toBeGreaterThan(body.indexOf("영상 바탕 그림 만드는 중"));
  });
});
