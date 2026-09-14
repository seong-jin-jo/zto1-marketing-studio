import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

// 2026-09-09 실사용에서 찾았다.
// 생성실에서 "글" 을 골라 구조를 고르고 편집실로 갔더니 편집할 줄이 0개였고 종류도
// 카드뉴스로 잡혔다. 카드뉴스는 같은 경로로 멀쩡히 넘어왔다.
//
// 원인 둘.
// ① content_branch 는 text_image 와 video 둘뿐이라 글과 카드뉴스를 못 가른다. 그래서
//    글도 카드로 떨어졌다. 사용자가 방금 고른 형식이 있으면 그것이 맞다.
// ② 글 본문을 한 덩어리로 넘겼다. 편집실에서 줄이 하나뿐이면 문단을 고르거나 순서를
//    바꿀 수가 없다. 카드뉴스와 영상은 이미 조각으로 오는데 글만 통짜였다.
const src = readFileSync(resolve(__dirname, "../../src/app/studio/page.tsx"), "utf8");

describe("글도 편집실로 제대로 넘어간다", () => {
  it("사용자가 고른 형식을 먼저 쓴다", () => {
    expect(src).toMatch(/const nextKind: EditContentKind = createPrimaryKind/);
    // 갈래로만 정하면 글이 카드로 떨어진다.
    expect(src).not.toMatch(/const nextKind = candidate\.format\.content_branch === "video" \? "video" : "card"/);
  });

  it("글 본문을 문단으로 나눠 넘긴다", () => {
    // 붙일 때도 빈 줄로 붙이므로 원문이 그대로 돌아온다.
    expect(src).toMatch(/\.split\(\/\\n\\s\*\\n\/\)/);
    expect(src).not.toMatch(/: \[result\.threads \|\| result\.facebook \|\| result\.x \|\| ""\]\.filter\(Boolean\)/);
  });
});
