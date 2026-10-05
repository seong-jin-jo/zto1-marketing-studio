import { describe, expect, it, vi } from "vitest";

describe("Remotion 공용 렌더 대기열 상한", () => {
  it("S2-R3-m2 실행 1개와 대기 2개를 넘으면 CARD_RENDER_BUSY로 즉시 거절한다", async () => {
    vi.resetModules();
    const runtime = await import("./remotion-runtime");
    let release!: () => void;
    const active = runtime.withRemotionRenderSlot(() => new Promise<void>((resolve) => { release = resolve; }));
    await vi.waitFor(() => expect(runtime.remotionRenderSlotDebugState()).toEqual({ active: 1, waiting: 0 }));

    const waitingOne = runtime.withRemotionRenderSlot(async () => undefined);
    const waitingTwo = runtime.withRemotionRenderSlot(async () => undefined);
    await vi.waitFor(() => expect(runtime.remotionRenderSlotDebugState()).toEqual({ active: 1, waiting: 2 }));

    await expect(runtime.withRemotionRenderSlot(async () => undefined)).rejects.toMatchObject({ code: "CARD_RENDER_BUSY", status: 503 });
    release();
    await Promise.all([active, waitingOne, waitingTwo]);
    expect(runtime.remotionRenderSlotDebugState()).toEqual({ active: 0, waiting: 0 });
  });
});
