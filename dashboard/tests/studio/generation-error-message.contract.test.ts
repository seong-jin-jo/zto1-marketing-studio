import { describe, expect, it } from "vitest";
import { generationErrorMessage } from "@/components/studio/StudioRooms";

// 2026-09-09 실사용에서 찾았다. 생성이 실패하자 화면에 "The string did not match the
// expected pattern." 이 그대로 떴다. 브라우저가 던진 개발자 문구다. 사용자는 무엇이
// 잘못됐는지도, 무엇을 하면 되는지도 알 수 없다.
// 회장이 앞서 "인라인에러좀 잘해라" 라고 지적한 것과 같은 종류다.
//
// 원인은 마지막 줄이었다. 아는 오류는 옮겨 적고 모르는 오류는 원문을 그대로 내보냈다.
// 계약: 우리가 쓴 한국어 문구만 사용자에게 보인다. 영문 개발자 문구는 절대 새지 않는다.

describe("생성 실패를 사람 말로 옮긴다", () => {
  it("브라우저·라이브러리가 던진 영문 문구는 새지 않는다", () => {
    for (const raw of [
      "The string did not match the expected pattern.",
      "Unexpected token < in JSON at position 0",
      "Cannot read properties of undefined (reading 'x')",
      "ECONNRESET",
    ]) {
      const out = generationErrorMessage(new Error(raw));
      expect(out, `"${raw}" 가 그대로 나갔다`).not.toContain(raw);
      expect(out).toMatch(/[가-힣]/);
    }
  });

  it("우리가 쓴 한국어 문구는 그대로 보여 준다", () => {
    const mine = "이 주제는 생성기가 만들 수 없다고 했습니다.";
    expect(generationErrorMessage(new Error(mine))).toBe(mine);
  });

  it("아는 원인은 다음 행동까지 적는다", () => {
    expect(generationErrorMessage(new Error("unauthorized"))).toContain("다시 로그인");
    expect(generationErrorMessage(new Error("quota exceeded"))).toContain("한도");
    expect(generationErrorMessage(new Error("Load failed"))).toContain("연결이 끊겨");
    expect(generationErrorMessage(new Error("database constraint"))).toContain("저장하지 못했습니다");
  });

  it("오류가 아예 없어도 빈 화면을 두지 않는다", () => {
    expect(generationErrorMessage(null)).toMatch(/[가-힣]/);
    expect(generationErrorMessage(undefined)).toMatch(/[가-힣]/);
  });
});
