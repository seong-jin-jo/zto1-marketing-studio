import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

// 2026-09-09 실측: 영상 구조 초안 생성이 세 번 모두 71~75초에 죽었다. 생성 자체의 제한
// 시간을 90초에서 25초로 줄여도 걸린 시간은 그대로였다. **생성이 느린 것이 아니라 줄이
// 길었다.** 공유 CLI 는 프로필이 하나라 모든 요청을 한 줄로 세우는데 그 줄에 마감이 없었다.
//
// 연결이 끊겨도 줄은 남는다. 그래서 한 번 밀리면 아무도 결과를 못 받는 상태로 굳는다.
// 쓰는 사람이 늘수록 나빠지는 종류의 고장이라 반드시 마감이 있어야 한다.
const src = readFileSync(resolve(process.cwd(), "src/lib/anthropic.ts"), "utf8");

describe("공유 CLI 줄에는 마감이 있어야 한다", () => {
  it("기다리는 시간에 상한이 있다", () => {
    expect(src).toContain("CLI_QUEUE_WAIT_MS");
    const [, value] = src.match(/const CLI_QUEUE_WAIT_MS = ([\d_]+)/) ?? [];
    const ms = Number(String(value).replace(/_/g, ""));
    // 2026-09-11 실측: 글 한 편 생성이 40~75초다. 20초로 두었더니 두 번째 사람이 거의
    // 항상 거절당했다. 앞사람 한 편이 끝날 시간은 줘야 줄이 줄의 노릇을 한다.
    expect(ms).toBeGreaterThanOrEqual(45_000);
    // 그렇다고 무한정은 아니다. 사용자가 화면 앞에서 버틸 수 있는 길이까지만.
    expect(ms).toBeLessThanOrEqual(90_000);
  });

  it("마감이 지난 뒤 차례가 와도 실행하지 않는다", () => {
    // 아무도 기다리지 않는 생성을 돌리면 비용이 그대로 낭비되고 뒷사람 줄만 길어진다.
    expect(src).toContain("if (gaveUp) throw new SharedCliQueueBusyError()");
  });

  it("줄이 밀린 것과 생성기 고장을 다른 말로 알린다", () => {
    expect(src).toContain("지금 다른 생성이 진행 중이라");
    // 언제 다시 누르면 되는지 말해 준다. "잠시 후" 만 있으면 바로 다시 눌러 또 밀린다.
    expect(src).toContain("1분쯤 뒤에 다시 눌러 주세요");
    const llm = readFileSync(
      resolve(process.cwd(), "src/lib/studio/generation/llm.ts"),
      "utf8",
    );
    expect(llm).toContain('if (name === "SharedCliQueueBusyError") return "queue_busy"');
  });

  it("줄이 밀렸을 때 보조 모델로 재시도하지 않는다", () => {
    const llm = readFileSync(
      resolve(process.cwd(), "src/lib/studio/generation/llm.ts"),
      "utf8",
    );
    const guard = llm.match(/if \(lastReason === "approval_required".*\) break;/)?.[0] ?? "";
    expect(guard).toContain('lastReason === "queue_busy"');
  });
});
