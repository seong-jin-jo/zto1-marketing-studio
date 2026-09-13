import fs from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

const read = (name: string) => fs.readFileSync(path.resolve(__dirname, `../../scripts/${name}`), "utf8");

describe("OSMU-019 QA 전체 실행시간 계약", () => {
  it("OSMU-019 정상 경로: API 전수 검사는 제한된 병렬성과 남은 전체 예산을 요청에 전달한다", () => {
    const source = read("verify-api-read-sweep.mjs");
    expect(source).toContain("API_SWEEP_TOTAL_TIMEOUT_MS");
    expect(source).toContain("API_SWEEP_CONCURRENCY");
    expect(source).toContain("Math.min(requestTimeoutMs, remainingMs)");
    expect(source).toContain("전체 실행시간 예산이 끝나 요청하지 않았습니다");
  });

  it("OSMU-019 거절 경로: 네 방 시각 검증은 전체 시간이 끝나면 브라우저를 닫는다", () => {
    const source = read("verify-four-room-ui-e2e.mjs");
    expect(source).toContain("FOUR_ROOM_TOTAL_TIMEOUT_MS");
    expect(source).toContain("remainingTimeout(");
    expect(source).toContain("void closeBrowserWithin(1000)");
  });

  it("OSMU-019 경계값: 간이 네 방 탐침도 같은 전체 예산과 5초 종료 상한을 가진다", () => {
    const source = read("probe-four-room-flow.mjs");
    expect(source).toContain("FOUR_ROOM_TOTAL_TIMEOUT_MS");
    expect(source).toContain("전체 실행시간 초과");
    expect(source).toContain("Promise.race([b.close()");
  });
});
