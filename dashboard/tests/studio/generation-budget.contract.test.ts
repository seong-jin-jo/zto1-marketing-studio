import { describe, expect, it } from "vitest";
import defaults from "@/lib/studio/generation/studio-llm.defaults.json";

// 2026-09-09 실사용에서 글 구조 초안 생성이 약 75초 만에 끊겼다.
//
// 원인은 우리 서버가 스스로에게 준 시간이 **우리 앞의 프록시가 허용하는 시간보다 길다**는
// 것이었다. 한 번 시도에 90초를 주고 최대 두 번 시도하니 서버 예산은 최대 180초인데,
// 프록시는 100초쯤에서 연결을 끊는다. 그래서 첫 시도가 느리면 사용자는 **어떤 경우에도**
// 결과를 볼 수 없다. 만들어지긴 하는데 화면에는 영영 닿지 않는다. 비용만 나간다.
//
// 서버가 자기 예산을 프록시 창보다 크게 잡는 순간 그 초과분은 전부 사용자에게 실패로
// 보인다. 그래서 예산을 창 안에 가둔다. 첫 시도가 느리면 빨리 포기하고, 훨씬 빠른 보조
// 모델이 창 안에서 답을 낸다.
// 창 크기는 문서가 아니라 **실측**이다. 2026-09-09 두 번의 실패가 각각 72초와 75초에
// 끊겼다. 문서상 Cloudflare 기본값은 100초지만 이 터널 앞단은 그보다 짧다. 문서를 믿고
// 100초로 잡았더니 예산 70초가 창을 아슬아슬하게 넘어 영상 생성이 그대로 죽었다.
// 실측한 70초를 창으로 삼고, 그 아래에서 넉넉한 여유를 둔다.
const PROXY_WINDOW_MS = 70_000; // 실측(2026-09-09): 72초·75초에 끊김
const RESERVE_MS = 20_000; // 프롬프트 조립·DB·네트워크 몫

describe("생성 예산은 프록시 창 안에 있어야 한다", () => {
  it("최악의 경우 총 시간이 프록시 창을 넘지 않는다", () => {
    const worstCase = defaults.max_attempts * defaults.timeout_ms;
    expect(worstCase + RESERVE_MS).toBeLessThanOrEqual(PROXY_WINDOW_MS);
  });

  it("한 번 시도에 주는 시간이 창의 절반을 넘지 않는다", () => {
    expect(defaults.timeout_ms * 2).toBeLessThanOrEqual(PROXY_WINDOW_MS - RESERVE_MS);
  });
});
