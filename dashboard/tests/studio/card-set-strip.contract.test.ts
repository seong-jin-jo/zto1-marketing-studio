import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

// 2026-09-09 회장 지적: "대문 사진, 본문, 마지막 사진 등 사진 여러개 흐름이 한 세트가 되는
// 경우가 많을거같은데."
//
// 종전 편집실은 한 장씩만 보여 세트의 흐름이 안 보였다. 카드뉴스와 영상 장면은 장과 장
// 사이의 순서가 곧 내용인데, 지금 보는 한 장만으로는 그 흐름을 판단할 수 없다.
// 우리 팀이 이미 만든 카드 편집 도구(D-EDU 카드컨셉13 03c)도 슬라이드 전체를 늘어놓고 고른다.
// 계약: 두 장 이상이면 전체를 늘어놓고, 누르면 그 장으로 간다.
const src = readFileSync(resolve(__dirname, "../../src/components/studio/StudioRooms.tsx"), "utf8");

describe("여러 장이 한 세트로 보인다", () => {
  it("전체를 늘어놓는 띠가 있다", () => {
    expect(src).toContain("data-card-strip");
    expect(src).toContain("data-card-strip-item={index}");
  });

  it("두 장 이상일 때만 띠를 낸다", () => {
    // 한 장뿐이면 늘어놓을 것이 없고 자리만 차지한다.
    expect(src).toMatch(/safeLines\.length > 1 \? \(/);
  });

  it("누르면 그 장으로 간다", () => {
    expect(src).toMatch(/data-card-strip-item=\{index\}[\s\S]{0,200}onClick=\{\(\) => setActiveLine\(index\)\}/);
  });

  it("지금 몇 번째인지와 빠진 장을 함께 보여 준다", () => {
    expect(src).toMatch(/\{activeLine \+ 1\} \/ \{safeLines\.length\}/);
    // 빼기로 감춘 장은 띠에서도 그렇게 보여야 한다. 안 그러면 왜 결과에 없는지 모른다.
    expect(src).toMatch(/visibleLines\[index\] \? "" : "opacity-50 line-through"/);
  });
});
