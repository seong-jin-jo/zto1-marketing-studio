import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

// 2026-09-08 회장 계정 실측 재발 방지.
// 생성기가 거절한 요청에 502 로 답했더니 우리 앞의 리버스 프록시가 JSON 본문을 자기 HTML
// 오류 페이지로 갈아치웠다. 화면에는 "Request failed: 502" 나 "Load failed" 만 뜨고 진짜
// 이유(막힌 주제·잔액 부족)는 한 번도 사용자에게 닿지 못했다. 재생성이 계속 실패하는데
// 왜인지 알 방법이 없었고, 기능 자체가 고장 난 줄 알고 한참을 팠다.
// 계약: 생성 경로는 502 를 쓰지 않는다. 우리가 쓴 문구가 화면까지 살아서 가야 한다.
const routes = [
  "app/api/higgsfield/image/route.ts",
  "app/api/higgsfield/video/route.ts",
];

describe("생성 경로의 거절 응답", () => {
  for (const rel of routes) {
    const src = readFileSync(resolve(__dirname, "../../src", rel), "utf8");

    it(`${rel} 는 502 를 쓰지 않는다`, () => {
      expect(src).not.toMatch(/status:\s*502/);
    });

    it(`${rel} 의 거절 응답은 ok:false 를 함께 싣는다`, () => {
      const lines = src.split("\n");
      lines.forEach((line, index) => {
        if (!line.includes("GENERATOR_REFUSED")) return;
        if (line.includes("const GENERATOR_REFUSED")) return;
        const window = lines.slice(Math.max(0, index - 4), index + 1).join("\n");
        expect(window).toContain("ok: false");
      });
    });
  }
});
