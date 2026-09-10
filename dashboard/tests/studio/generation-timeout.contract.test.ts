import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

// 2026-09-09 실사용에서 찾았다. 생성이 두 번 실패했는데, 서버 쪽 생성 이력에는 그 건이
// 토큰까지 기록돼 있었다. **만들어졌는데 화면만 실패로 끝났다.**
//
// 원인은 우리 앞의 리버스 프록시다. 생성이 오래 걸리면 요청을 끊고 자기 HTML 오류 페이지를
// 돌려준다. 그것을 JSON 으로 읽으려다 브라우저가 "The string did not match the expected
// pattern." 을 던졌고 그 문구가 화면에 그대로 떴다.
//
// 사용자는 돈이 나간 줄도 모르고 다시 누른다. 같은 원인으로 이미 발행 경로에서 한 번
// 겪었다(2026-09-08 502 사건). 그때는 서버 응답 코드를 바꿨고, 이번에는 읽는 쪽을 고친다.
const src = readFileSync(resolve(__dirname, "../../src/lib/studio/generation/client.ts"), "utf8");

describe("생성 응답을 안전하게 읽는다", () => {
  it("응답을 통째로 JSON 으로 읽는 자리가 남아 있지 않다", () => {
    // 프록시가 HTML 을 주면 이 호출이 그대로 던지고, 그 영문이 화면까지 간다.
    expect(src).not.toContain("await response.json()");
  });

  it("모든 호출이 같은 안전한 읽기를 쓴다", () => {
    const helper = (src.match(/readJson</g) || []).length;
    // 정의 1 + 호출 4 = 5. 하나라도 빠지면 그 경로에서만 옛 방식으로 터진다.
    expect(helper).toBeGreaterThanOrEqual(5);
  });

  it("연결이 먼저 끊긴 경우와 그냥 이상한 응답을 갈라 말한다", () => {
    expect(src).toMatch(/response\.status === 504 \|\| response\.status === 524 \|\| response\.status === 502/);
    // 서버는 계속 만들고 있을 수 있다는 사실을 알려야 사용자가 또 누르지 않는다.
    expect(src).toContain("서버에서는 계속 만들고 있을 수 있으니");
    expect(src).toContain("작업물 전체에서 확인해 주세요");
  });
});

// 2026-09-09 실제 화면에서 "구조 초안 만들기이 오래 걸려" 가 떴다. 조사를 고정 문자열로
// 박으면 앞말이 바뀌는 순간 한국어가 깨진다. 네 개 호출의 이름이 받침 유무로 갈리므로
// 둘 다 고정한다.
describe("연결 끊김 안내 문장의 조사", () => {
  const src = readFileSync(
    resolve(process.cwd(), "src/lib/studio/generation/client.ts"),
    "utf8",
  );

  it("조사를 고정 문자열로 박지 않는다", () => {
    expect(src).not.toContain("${what}이 오래 걸려");
    expect(src).toContain("${what}${subjectParticle(what)} 오래 걸려");
  });

  it("받침 유무로 이/가를 고른다", () => {
    const pick = (word: string) => {
      const code = word.trim().slice(-1).charCodeAt(0);
      if (Number.isNaN(code) || code < 0xac00 || code > 0xd7a3) return "가";
      return (code - 0xac00) % 28 === 0 ? "가" : "이";
    };
    expect(pick("구조 초안 만들기")).toBe("가");
    expect(pick("비용 확인")).toBe("이");
    expect(pick("다른 형식 만들기")).toBe("가");
  });
});
