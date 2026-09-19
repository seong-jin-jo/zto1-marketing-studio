import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

// 2026-09-07 회장 계정 실측 재발 방지.
// 영상 발행 경로가 제공자 실패를 502 로 돌려줬다. 우리 앞의 리버스 프록시가 502 를 보면
// 우리 JSON 본문을 자기 HTML 오류 페이지로 갈아치우기 때문에, 화면에 남는 것은
// "<!DOCTYPE html>" 뿐이고 사용자는 무엇이 잘못됐는지 영영 알 수 없었다. 그 때문에
// 코드가 죽은 것인지 제공자가 거절한 것인지조차 구분하지 못했다.
// 계약: 영상 발행 경로는 502 를 쓰지 않는다. 우리가 쓴 문구가 화면까지 살아서 가야 한다.
const src = readFileSync(
  resolve(__dirname, "../../src/app/api/video/publish/route.ts"),
  "utf8",
);

describe("영상 발행 경로의 실패 응답", () => {
  it("502 를 쓰지 않는다(프록시가 본문을 갈아치운다)", () => {
    expect(src).not.toMatch(/status:\s*502/);
  });

  it("제공자 실패는 ok:false 와 사람이 읽을 문구를 함께 돌려준다", () => {
    const lines = src.split("\n");
    // Reels 는 결과 불명확이면 409, 명확한 거절이면 PROVIDER_FAILED 를 반환한다.
    // 상태 표현이 조건식이어도 네 제공자 실패 응답 모두 검사한다.
    const failureResponses = lines
      .map((line, index) => ({ line, index }))
      .filter(({ line }) => /status:\s*.*\bPROVIDER_FAILED\b/.test(line));
    expect(failureResponses).toHaveLength(4);
    failureResponses.forEach(({ index }) => {
      // 상태만 바꾸고 ok 플래그나 오류 문구를 빠뜨리면 화면이 성공으로 읽는다.
      const window = lines.slice(Math.max(0, index - 7), index + 1).join("\n");
      expect(window).toContain("Response.json");
      expect(window).toContain("ok: false");
      expect(window).toMatch(/\berror:\s*/);
    });
    expect(src).toContain('status: result.failureKind === "indeterminate" ? 409 : PROVIDER_FAILED');
    expect(src).toContain('code: "publish_state_uncertain"');
  });
});
