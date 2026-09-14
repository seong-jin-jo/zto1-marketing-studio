import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

// 2026-09-09 실사용에서 찾았다.
// 만들어진 세 후보가 모두 "저희는 회사를 손님으로 모시는 곳" 이라고 썼는데 업종 칸은
// "동네 가게" 였다. 어디서 온 문장인지 화면에서 찾을 수 없었다.
// 브랜드 문서 전문이 workspaceFacts 로 생성 입력에 통째로 들어가는데, 학습 정보 자리는
// 여덟 칸만 보여 주고 그 문서는 감췄기 때문이다.
//
// 화면에 없는 입력이 결과를 좌우하면 사용자는 결과를 고칠 수가 없다. 무엇을 바꿔야 그
// 문장이 사라지는지 알 방법이 없다. 회장이 말한 "학습정보를 잘 받아서 프롬프팅 없이도
// 최고의 퀄리티" 는 받은 것이 무엇인지 보이는 데서 시작한다.
// 계약: 생성에 들어가는 것은 다 보여 준다.
const src = readFileSync(resolve(__dirname, "../../src/components/studio/StudioRooms.tsx"), "utf8");

describe("생성에 들어가는 입력은 화면에 다 보인다", () => {
  it("브랜드 문서가 생성 입력으로 들어간다", () => {
    // facts 가 곧 workspaceFacts 다. 이것이 바뀌면 이 계약의 전제가 달라진다.
    expect(src).toMatch(/const facts = useMemo\(\(\) => guide\.trim\(\) \? \[guide\.trim\(\)\] : \[\]/);
    expect(src).toContain("workspaceFacts: facts");
  });

  it("그 브랜드 문서를 학습 정보 자리에서 볼 수 있다", () => {
    expect(src).toContain("data-brand-guide-used");
    expect(src).toContain("브랜드 문서도 그대로 반영합니다");
    // 글자 수만 적고 본문을 감추면 어느 문장이 원인인지 여전히 못 찾는다.
    expect(src).toMatch(/whitespace-pre-wrap[^>]*>\{guide\.trim\(\)\}/);
  });

  it("원치 않는 표현이 나왔을 때 어디를 고치면 되는지 적는다", () => {
    expect(src).toContain("결과에 원치 않는 표현이 나오면");
  });
});
