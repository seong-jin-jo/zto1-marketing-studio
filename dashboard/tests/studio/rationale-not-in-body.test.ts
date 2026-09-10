import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

// 2026-09-11 품질 측정에서 찾았다. 저장된 글 15편 중 9편의 본문이 제목과 **내부 메모**로
// 시작하고 있었다. 예: "결과(사례)를 먼저 보여줘서 신뢰를 쌓고, 그 사례가 가능했던 조건을
// 역순으로 설명해 상담 동기를 만듭니다."
//
// rationale 은 "이 구조를 왜 골랐는가" 를 우리가 우리에게 설명하는 메모다. 고객에게 보여 줄
// 글이 아니다. **그대로 발행하면 고객의 독자가 우리 내부 메모를 읽는다.**
// 발행실 미리보기에도 그 줄이 떠 있었는데 눈으로 보고도 못 알아봤다. 재기 시작해서 찾았다.
const src = readFileSync(resolve(process.cwd(), "src/app/studio/page.tsx"), "utf8");

describe("내부 메모는 본문에 들어가지 않는다", () => {
  it("본문은 제목과 이야기 순서로만 만든다", () => {
    expect(src).toContain('const body = [candidate.title, ...candidate.format.outline].join("\\n")');
    expect(src).not.toContain("[candidate.title, candidate.rationale, ...candidate.format.outline]");
  });

  it("편집실 줄 목록에도 메모를 넣지 않는다", () => {
    expect(src).toContain("setEditLines([candidate.title, ...candidate.format.outline])");
    expect(src).not.toContain("...candidate.format.outline, candidate.rationale]");
  });

  it("인스타그램 캡션에도 메모를 쓰지 않는다", () => {
    // 캡션도 독자가 읽는 본문이다. 여기로 새면 같은 사고가 인스타그램에서 난다.
    expect(src).not.toContain("caption: candidate.rationale");
  });

  it("숏폼 마무리 문구에도 메모를 쓰지 않는다", () => {
    expect(src).not.toContain("cta: candidate.rationale");
  });
});
