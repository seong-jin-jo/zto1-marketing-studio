import { beforeEach, describe, expect, it, vi } from "vitest";

// 2026-10-02 독립 리뷰 M-2(자원): 전역 렌더 슬롯(프로세스당 동시 렌더 1개). Remotion 렌더는
// Chrome 프로세스 하나를 통째로 띄운다 — 동시에 여러 개가 뜨면 운영 VM의 다른 작업(발행·
// 생성·자막 굽기)까지 끌고 내려간다. @remotion/bundler·@remotion/renderer를 모킹해
// renderMedia가 실제로 "순서대로만" 호출되는지 단언한다(시간 의존 없이 큐 상태로 확인).
vi.mock("@remotion/bundler", () => ({ bundle: vi.fn(async () => "bundle-url") }));

const started: number[] = [];
const finished: number[] = [];
let callCount = 0;
let release1: (() => void) | null = null;

vi.mock("@remotion/renderer", () => ({
  selectComposition: vi.fn(async () => ({})),
  renderMedia: vi.fn(async () => {
    callCount += 1;
    const id = callCount;
    started.push(id);
    if (id === 1) {
      // 1번 렌더는 release1()을 부를 때까지 안 끝난다 — 그동안 2번은 큐에서 기다려야 한다.
      await new Promise<void>((resolve) => { release1 = resolve; });
    }
    finished.push(id);
  }),
}));

beforeEach(() => {
  started.length = 0;
  finished.length = 0;
  callCount = 0;
  release1 = null;
});

describe("전역 렌더 슬롯 (intro-outro-render.ts)", () => {
  it("동시 2개가 들어오면 1개는 대기 큐로 밀리고, 끝나면 순서대로 풀린다", async () => {
    const { renderIntroOutroClip, _renderSlotDebugState } = await import("@/lib/intro-outro-render");

    const p1 = renderIntroOutroClip("intro-logo-reveal", {}, "/tmp/out1.mp4");
    // p1이 acquireRenderSlot을 통과해 renderMedia 안에서 멈춰 있을 시간을 준다.
    await new Promise((r) => setTimeout(r, 20));
    expect(_renderSlotDebugState().active).toBe(1);

    const p2 = renderIntroOutroClip("intro-logo-reveal", {}, "/tmp/out2.mp4");
    await new Promise((r) => setTimeout(r, 20));
    // 2번은 아직 renderMedia에 진입하지 못했다 — 큐에서 대기 중이어야 한다.
    expect(started).toEqual([1]);
    expect(_renderSlotDebugState().waiting).toBeGreaterThanOrEqual(1);

    release1?.();
    await Promise.all([p1, p2]);
    expect(started).toEqual([1, 2]);
    expect(finished).toEqual([1, 2]);
    expect(_renderSlotDebugState()).toEqual({ active: 0, waiting: 0 });
  });
});
