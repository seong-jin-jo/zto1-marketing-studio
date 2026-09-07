import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

// 2026-09-07 회장 실사용 재발 방지.
// 생성실에서 "새로 시작"을 누르자 브라우저 기본 확인창이 떠서 페이지가 통째로 멈췄다.
// 그 상태에서는 무엇을 버리는지 화면과 나란히 볼 수 없고, 창을 닫기 전에는 아무것도 못 한다.
// 비용 승인에서 같은 이유로 이미 걷어낸 방식인데 되돌릴 수 없는 조작에는 남아 있었다.
// 계약: 네 방(생성·편집·발행·성과)의 본 화면은 브라우저 기본 확인창을 쓰지 않는다.
const src = (path: string) => readFileSync(resolve(__dirname, "../../src", path), "utf8");

describe("고객 본 화면은 브라우저 기본 확인창을 쓰지 않는다", () => {
  it("스튜디오 화면에 window.confirm 호출이 없다", () => {
    const text = src("app/studio/page.tsx");
    // 주석에 적힌 설명은 허용하고 실제 호출만 잡는다.
    const calls = text
      .split("\n")
      .filter((line) => !line.trim().startsWith("//"))
      .filter((line) => /\bwindow\.confirm\s*\(|(?<![.\w])confirm\s*\(/.test(line));
    expect(calls).toEqual([]);
  });

  it("작업물 폐기는 화면 안 확인창을 쓴다", () => {
    const text = src("app/studio/page.tsx");
    expect(text).toContain("askConfirm(");
    expect(text).toContain("ConfirmDialog");
    // 되돌릴 수 없는 조작임을 화면이 알려야 한다.
    expect(text).toContain("destructive: true");
  });
});
