import { describe, expect, it, vi } from "vitest";

vi.mock("@/lib/publish", () => ({ verifyXCredentials: vi.fn() }));

import { verifyChannel } from "@/lib/verify-channel";

describe("Telegram 발행 연결 계약", () => {
  it("CHANNEL-11 Bot Token과 대상 Chat ID가 있으면 계정 조회 성공을 연결로 판정한다", async () => {
    const fetchMock = vi.fn(async () => new Response(JSON.stringify({ ok: true, result: { username: "fixture" } }), { status: 200 }));
    vi.stubGlobal("fetch", fetchMock);
    try {
      const result = await verifyChannel("telegram", { botToken: "fixture-token", chatId: "123" });
      expect(result.verified).toBe(true);
      expect(fetchMock).toHaveBeenCalledTimes(2);
    } finally {
      vi.unstubAllGlobals();
    }
  });

  it("CHANNEL-14 Chat ID가 대상 채팅에서 확인되지 않으면 연결을 거부한다", async () => {
    const fetchMock = vi.fn()
      .mockResolvedValueOnce(new Response(JSON.stringify({ ok: true, result: { username: "fixture" } }), { status: 200 }))
      .mockResolvedValueOnce(new Response(JSON.stringify({ ok: false }), { status: 400 }));
    vi.stubGlobal("fetch", fetchMock);
    try {
      const result = await verifyChannel("telegram", { botToken: "fixture-token", chatId: "invalid" });
      expect(result.verified).toBe(false);
      expect(result.error).toContain("Chat ID");
    } finally {
      vi.unstubAllGlobals();
    }
  });

  it("CHANNEL-12 Chat ID가 없으면 API 조회 전에 발행 연결을 거부한다", async () => {
    const fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);
    try {
      const result = await verifyChannel("telegram", { botToken: "fixture-token" });
      expect(result.verified).toBe(false);
      expect(result.error).toContain("Chat ID");
      expect(fetchMock).not.toHaveBeenCalled();
    } finally {
      vi.unstubAllGlobals();
    }
  });
});
