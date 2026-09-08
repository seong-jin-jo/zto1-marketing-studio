import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

// 2026-09-09 실사용에서 찾았다.
// 머리줄의 "새로 시작" 을 누르고 확인창까지 수락했는데, 생성실에는 앞서 만든 구조 초안
// 세 개가 그대로 남아 "3 / 3 선택한 구조 확인" 이었다. 부모는 본문·이미지·영상을 지웠지만
// 후보와 답한 질문은 생성실 컴포넌트 안에 있어서 손이 닿지 않았다.
// 버렸다고 말하고 안 버리는 것이 가장 나쁘다. 사용자는 무엇이 남았는지 알 수 없다.
// 계약: "새로 시작" 은 생성실 안쪽까지 닿는다.
const src = (p: string) => readFileSync(resolve(__dirname, "../../src", p), "utf8");

describe("새로 시작은 생성실 안까지 비운다", () => {
  it("부모가 생성실에 초기화 신호를 보낸다", () => {
    const page = src("app/studio/page.tsx");
    expect(page).toContain("createResetToken");
    expect(page).toContain("resetToken={createResetToken}");
    // 신호만 보내고 형식 선택을 안 지우면 "지금 만드는 것" 이 옛 값으로 남는다.
    expect(page).toMatch(/setCreateResetToken\(\(value\) => value \+ 1\)/);
    expect(page).toMatch(/setCreatePrimaryKind\(null\);\s*setAlsoKinds\(\[\]\)/);
  });

  it("생성실이 그 신호를 받아 후보와 답한 질문을 비운다", () => {
    const rooms = src("components/studio/StudioRooms.tsx");
    expect(rooms).toContain("resetToken?: number;");
    expect(rooms).toMatch(/\}, \[resetToken, workspaceId\]\)/);
    for (const cleared of ["setCandidates([])", "setSelected(null)", "setQuestionIndex(0)"]) {
      expect(rooms, `${cleared} 가 빠졌다`).toContain(cleared);
    }
  });

  it("브라우저 자동저장도 함께 비운다", () => {
    const rooms = src("components/studio/StudioRooms.tsx");
    // 화면만 비우고 저장을 두면 새로고침 때 버린 것이 되살아난다.
    expect(rooms).toMatch(/removeItem\(`\$\{CREATE_DRAFT_STORAGE_PREFIX\}:\$\{workspaceId\}`\)/);
  });

  it("첫 렌더에서는 비우지 않는다", () => {
    const rooms = src("components/studio/StudioRooms.tsx");
    // 마운트 때 비우면 이어서 하기로 복원한 작업이 즉시 지워진다.
    expect(rooms).toContain("firstReset");
  });
});
