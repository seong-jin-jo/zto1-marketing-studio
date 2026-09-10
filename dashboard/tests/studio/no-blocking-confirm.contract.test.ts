import { describe, expect, it } from "vitest";
import { readdirSync, readFileSync, statSync } from "node:fs";
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

  // 2026-09-08 실사용 점검 확장.
  // 생성실만 걷어내고 끝냈더니 이미지·글·영상·대기열·채널 설정·운영 화면에 아홉 곳이 그대로
  // 남아 있었다. 거기서는 "삭제?" 나 "Delete this video?" 가 사용자에게 그대로 나갔고,
  // 브라우저에서 "이 사이트가 추가 대화상자를 만들지 못하게 하기" 를 한 번 누르면 그 뒤로
  // 모든 삭제·해제가 조용히 아무 일도 안 하게 된다. 한 화면이 아니라 앱 전체가 계약이다.
  it("앱 어디에도 브라우저 기본 확인창 호출이 없다", () => {
    const root = resolve(__dirname, "../../src");
    // 확인창 호스트 자신은 호스트가 안 붙은 화면을 위한 대체 경로로 이것을 쓴다.
    const allowed = new Set([resolve(root, "components/shared/ConfirmHost.tsx")]);
    const offenders: string[] = [];

    const walk = (dir: string) => {
      for (const name of readdirSync(dir)) {
        const full = resolve(dir, name);
        if (statSync(full).isDirectory()) { walk(full); continue; }
        if (!/\.tsx?$/.test(name)) continue;
        if (allowed.has(full)) continue;
        const hits = readFileSync(full, "utf8")
          .split("\n")
          .filter((line) => !line.trim().startsWith("//") && !line.trim().startsWith("*"))
          .filter((line) => /\bwindow\.confirm\s*\(|(?<![.\w])confirm\s*\(/.test(line));
        if (hits.length) offenders.push(`${full.slice(root.length + 1)}: ${hits[0].trim()}`);
      }
    };
    walk(root);
    expect(offenders).toEqual([]);
  });

  it("앱 전체 확인창 호스트가 뿌리에 한 대 붙어 있다", () => {
    const layout = src("app/layout.tsx");
    expect(layout).toContain("<ConfirmHost />");
  });
});
