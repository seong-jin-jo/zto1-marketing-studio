import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

// 2026-09-09 회장 지적: "텍스트면 텍스트 미리보기 화면 자체에서 본문 수정해야지 왜 별도로
// 수정을해. 해시태그나 첫댓글도 미리보기화면에서 직관적으로 수정할수있게 하는게 낫지않겠어?"
//
// 종전에는 미리보기가 본문을 읽기 전용으로 보여 주고, 그 아래 따로 붙은 칸에서 같은 본문을
// 고쳤다. 같은 글이 두 번 보이고, 고치는 자리와 결과를 보는 자리가 떨어져 있었다.
// 사업계획 §3.2 도 편집실 최우선 과제로 "미리보기와 최종 일치" 를 꼽았다. 고치는 자리가
// 곧 보는 자리면 어긋날 수가 없다.
// 계약: 글 형식 네 곳은 미리보기 안에서 본문을 고치고, 아래 같은 칸을 또 두지 않는다.
const src = readFileSync(resolve(__dirname, "../../src/components/studio/PlatformPreview.tsx"), "utf8");

describe("미리보기 안에서 본문을 고친다", () => {
  it("네 플랫폼 모두 미리보기 본문이 편집 자리다", () => {
    for (const platform of ["threads", "x", "facebook", "instagram"]) {
      expect(src, `${platform} 미리보기 본문이 편집 자리가 아니다`)
        .toContain(`testId="preview-body-${platform}"`);
    }
    expect(src).toContain("contentEditable");
    expect(src).toContain("editor?.onCaptionChange");
  });

  it("아래에 같은 본문 입력 칸을 또 두지 않는다", () => {
    // 2026-09-22 교차 코드리뷰 4라운드: 오른쪽 사이드바(클릭→사이드바로 여는 트리거)를
    // 이 브랜치에서 뺐다(세 라운드 연속 싱글턴이 깨져 별도 브랜치로 이관). 미리보기 본문
    // 편집이 아직 없는 형식(세로 영상)은 다시 카드 하단의 textarea 가 유일한 입구다.
    expect(src).toContain("BODY_EDITABLE_IN_PREVIEW");
    expect(src).toMatch(/data-pv-inline-edit=\{`\$\{platform\}:caption`\}/);
  });

  it("타이핑 중에 커서가 튀지 않게 값을 다시 넣지 않는다", () => {
    // 손이 올라가 있는 동안 React 가 내용을 다시 그리면 커서가 맨 앞으로 간다.
    expect(src).toContain("document.activeElement === node");
  });

  it("계정을 못 불러온 동안에는 편집을 막는다", () => {
    // 그때 고친 값은 어느 계정으로 갈지 알 수 없다.
    expect(src).toContain("locked");
    expect(src).toMatch(/locked=\{editor\?\.account\.status === "loading"\}/);
    expect(src).toMatch(/if \(!onChange \|\| locked\)/);
  });
});
