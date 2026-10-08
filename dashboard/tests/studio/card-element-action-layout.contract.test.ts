import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const read = (relative: string) => readFileSync(resolve(process.cwd(), relative), "utf8");
const css = read("src/components/studio/card/CardCanvasEditor.module.css");
const elementList = read("src/components/studio/card/CardElementList.tsx");

describe("카드 요소 조작 버튼의 글꼴 폭 회귀 계약", () => {
  it("R6-01 정상: 요소 행 버튼은 내용 폭을 유지하면서 44px 누름 영역을 지킨다", () => {
    const rule = css.match(/\.listActions\s*>\s*:global\(button\)\s*\{([^}]*)\}/)?.[1] ?? "";

    expect(rule).toMatch(/flex:\s*0\s+0\s+auto/);
    expect(rule).toMatch(/min-width:\s*var\(--control-touch\)/);
    expect(rule).toMatch(/white-space:\s*nowrap/);
  });

  it("R6-02 경계: 같은 행의 이동·레이어·표시·잠금·복제·삭제 버튼을 다시 줄이지 않는다", () => {
    const actionBlock = elementList.match(/<div className=\{styles\.listActions\}[\s\S]*?<\/div>/)?.[0] ?? "";

    expect(actionBlock.match(/<Button\b/g)).toHaveLength(10);
    expect(actionBlock).not.toMatch(/\bmin-w-0\b|\bw-\d+\b/);
    expect(css).not.toMatch(/\.listActions\s*>\s*:global\(button\)\s*\{[^}]*flex:\s*[^;}]*\s1(?:\s|;)/);
  });
});
