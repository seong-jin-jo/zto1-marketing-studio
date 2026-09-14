import { beforeEach, describe, expect, it, vi } from "vitest";

const { hfRunMock } = vi.hoisted(() => ({ hfRunMock: vi.fn() }));

vi.mock("@/lib/higgsfield", () => ({
  hfRun: hfRunMock,
  readGenLog: () => [],
}));

import { GET } from "@/app/api/higgsfield/transactions/route";

describe("Higgsfield 거래 응답 계약", () => {
  beforeEach(() => hfRunMock.mockReset());

  it("시험 12: 페이지 객체의 items를 정상 응답한다", async () => {
    hfRunMock.mockResolvedValue({ stdout: '{"cursor":"5","items":[{"credits":-6}]}' });
    const response = await GET(new Request("http://localhost/api/higgsfield/transactions?size=25"));

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toMatchObject({ ok: true, items: [{ credits: -6 }] });
  });

  it("시험 12: 해석 불가능한 출력은 성공으로 위장하지 않고 502로 거절한다", async () => {
    hfRunMock.mockResolvedValue({ stdout: "progress only" });
    const response = await GET(new Request("http://localhost/api/higgsfield/transactions?size=25"));

    expect(response.status).toBe(502);
    expect(response.headers.get("cache-control")).toBe("no-store");
    await expect(response.json()).resolves.toMatchObject({ ok: false });
  });
});
