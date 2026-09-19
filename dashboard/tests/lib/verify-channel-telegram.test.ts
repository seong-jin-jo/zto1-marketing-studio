import { describe, expect, it, vi } from "vitest";

vi.mock("@/lib/publish", () => ({ verifyXCredentials: vi.fn() }));

import { verifyChannel } from "@/lib/verify-channel";

describe("Telegram 발행 연결 계약", () => {
  it("CHANNEL-11 Bot Token과 대상 Chat ID가 있으면 계정 조회 성공을 연결로 판정한다", async () => {
    const fetchMock = vi.fn()
      .mockResolvedValueOnce(new Response(JSON.stringify({ ok: true, result: { id: 42, username: "fixture" } }), { status: 200 }))
      .mockResolvedValueOnce(new Response(JSON.stringify({ ok: true, result: { type: "private" } }), { status: 200 }));
    vi.stubGlobal("fetch", fetchMock);
    try {
      const result = await verifyChannel("telegram", { botToken: "fixture-token", chatId: "123" });
      expect(result.verified).toBe(true);
      expect(fetchMock).toHaveBeenCalledTimes(2);
    } finally {
      vi.unstubAllGlobals();
    }
  });

  it("CHANNEL-21 채널 게시 권한이 있는 봇 관리자만 연결로 판정한다", async () => {
    const fetchMock = vi.fn()
      .mockResolvedValueOnce(new Response(JSON.stringify({ ok: true, result: { id: 42, username: "fixture" } }), { status: 200 }))
      .mockResolvedValueOnce(new Response(JSON.stringify({ ok: true, result: { type: "channel" } }), { status: 200 }))
      .mockResolvedValueOnce(new Response(JSON.stringify({ ok: true, result: { status: "administrator", can_post_messages: true } }), { status: 200 }));
    vi.stubGlobal("fetch", fetchMock);
    try {
      expect((await verifyChannel("telegram", { botToken: "fixture-token", chatId: "-10042" })).verified).toBe(true);
      expect(fetchMock).toHaveBeenCalledTimes(3);
    } finally { vi.unstubAllGlobals(); }
  });

  it("CHANNEL-22 채널 게시 권한이 없거나 채팅 유형이 불명확하면 연결을 거절한다", async () => {
    const fetchMock = vi.fn()
      .mockResolvedValueOnce(new Response(JSON.stringify({ ok: true, result: { id: 42 } }), { status: 200 }))
      .mockResolvedValueOnce(new Response(JSON.stringify({ ok: true, result: { type: "channel" } }), { status: 200 }))
      .mockResolvedValueOnce(new Response(JSON.stringify({ ok: true, result: { status: "administrator", can_post_messages: false } }), { status: 200 }));
    vi.stubGlobal("fetch", fetchMock);
    try {
      const denied = await verifyChannel("telegram", { botToken: "fixture-token", chatId: "-10042" });
      expect(denied.verified).toBe(false);
      expect(denied.error).toContain("게시 권한");
    } finally { vi.unstubAllGlobals(); }
    const unknown = vi.fn()
      .mockResolvedValueOnce(new Response(JSON.stringify({ ok: true, result: { id: 42 } }), { status: 200 }))
      .mockResolvedValueOnce(new Response(JSON.stringify({ ok: true, result: {} }), { status: 200 }));
    vi.stubGlobal("fetch", unknown);
    try {
      expect((await verifyChannel("telegram", { botToken: "fixture-token", chatId: "-10042" })).verified).toBe(false);
      expect(unknown).toHaveBeenCalledTimes(2);
    } finally { vi.unstubAllGlobals(); }
  });

  it.each([
    ["CHANNEL-29", true, true],
    ["CHANNEL-30", false, false],
    ["CHANNEL-31", undefined, false],
  ])("%s 그룹 기본 전송 권한 %s이면 연결 판정은 %s", async (_id, permission, accepted) => {
    const fetchMock = vi.fn()
      .mockResolvedValueOnce(new Response(JSON.stringify({ ok: true, result: { id: 42 } }), { status: 200 }))
      .mockResolvedValueOnce(new Response(JSON.stringify({ ok: true, result: {
        type: "supergroup", permissions: permission === undefined ? undefined : { can_send_messages: permission },
      } }), { status: 200 }))
      .mockResolvedValueOnce(new Response(JSON.stringify({ ok: true, result: { status: "member" } }), { status: 200 }));
    vi.stubGlobal("fetch", fetchMock);
    try {
      expect((await verifyChannel("telegram", { botToken: "fixture-token", chatId: "-10042" })).verified).toBe(accepted);
    } finally { vi.unstubAllGlobals(); }
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
