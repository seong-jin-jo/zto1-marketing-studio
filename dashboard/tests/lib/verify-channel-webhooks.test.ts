import { describe, expect, it, vi } from "vitest";

vi.mock("@/lib/publish", () => ({ verifyXCredentials: vi.fn() }));

import { verifyChannel } from "@/lib/verify-channel";

describe("메시징 Webhook URL 검증 계약", () => {
  it.each([
    ["CHANNEL-26", "slack", "https://hooks.slack.com.evil.example/services/T/B/X"],
    ["CHANNEL-27", "discord", "https://discord.com.evil.example/api/webhooks/123/X"],
  ])("%s %s 유사 도메인은 외부 요청 전에 거절한다", async (_id, channel, webhookUrl) => {
    const fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);
    try {
      const result = await verifyChannel(channel, { webhookUrl });
      expect(result.verified).toBe(false);
      expect(fetchMock).not.toHaveBeenCalled();
    } finally { vi.unstubAllGlobals(); }
  });

  it("CHANNEL-28 Discord 정확한 Webhook 호스트와 경로는 조회 검증을 통과한다", async () => {
    const fetchMock = vi.fn(async () => new Response(JSON.stringify({ name: "fixture", type: 1, channel_id: "123" }), { status: 200 }));
    vi.stubGlobal("fetch", fetchMock);
    try {
      expect((await verifyChannel("discord", { webhookUrl: "https://discord.com/api/webhooks/123/token" })).verified).toBe(true);
      expect(fetchMock).toHaveBeenCalledOnce();
    } finally { vi.unstubAllGlobals(); }
  });

  it("CHANNEL-40 Discord 2xx 응답이어도 Incoming Webhook 유형·채널이 없으면 연결을 거절한다", async () => {
    const fetchMock = vi.fn(async () => new Response(JSON.stringify({ name: "fixture", type: 2, channel_id: null }), { status: 200 }));
    vi.stubGlobal("fetch", fetchMock);
    try {
      expect((await verifyChannel("discord", { webhookUrl: "https://discord.com/api/webhooks/123/token" })).verified).toBe(false);
    } finally { vi.unstubAllGlobals(); }
  });

  it("CHANNEL-34 Slack은 고정 테스트 메시지 1건의 HTTP 200 plain ok만 연결 성공으로 판정한다", async () => {
    const fetchMock = vi.fn(async () => new Response("ok", { status: 200 }));
    vi.stubGlobal("fetch", fetchMock);
    try {
      const result = await verifyChannel("slack", { webhookUrl: "https://hooks.slack.com/services/T/B/X" });
      expect(result.verified).toBe(true);
      expect(fetchMock).toHaveBeenCalledWith("https://hooks.slack.com/services/T/B/X",
        expect.objectContaining({ method: "POST", body: JSON.stringify({
          text: "OSMU Studio 연결 확인 메시지입니다. 사용자가 연결 버튼을 눌러 보냈습니다.",
        }) }));
      expect(fetchMock).toHaveBeenCalledOnce();
    } finally { vi.unstubAllGlobals(); }
  });

  it("CHANNEL-35 Slack의 다른 400 오류는 연결 성공으로 분류하지 않는다", async () => {
    const fetchMock = vi.fn(async () => new Response("user_not_found", { status: 400 }));
    vi.stubGlobal("fetch", fetchMock);
    try {
      const result = await verifyChannel("slack", { webhookUrl: "https://hooks.slack.com/services/T/B/X" });
      expect(result.verified).toBe(false);
    } finally { vi.unstubAllGlobals(); }
  });

  it.each([
    ["CHANNEL-42", 200, "not-ok"],
    ["CHANNEL-43", 400, "invalid_payload"],
  ])("%s Slack HTTP %s 응답 %s는 연결 성공이 아니다", async (_id, status, responseBody) => {
    const fetchMock = vi.fn(async () => new Response(responseBody, { status }));
    vi.stubGlobal("fetch", fetchMock);
    try {
      expect((await verifyChannel("slack", { webhookUrl: "https://hooks.slack.com/services/T/B/X" })).verified).toBe(false);
    } finally { vi.unstubAllGlobals(); }
  });

  it.each(["CHANNEL-44", "CHANNEL-45"])("%s Slack 결과 불명확이면 자동 재전송 없이 미검증으로 남긴다", async (id) => {
    const fetchMock = vi.fn(id === "CHANNEL-44"
      ? async () => new Response("server_error", { status: 503 })
      : async () => { throw new Error("timeout"); });
    vi.stubGlobal("fetch", fetchMock);
    try {
      const result = await verifyChannel("slack", { webhookUrl: "https://hooks.slack.com/services/T/B/X" });
      expect(result).toEqual(expect.objectContaining({ verified: false, unverified: true }));
      expect(fetchMock).toHaveBeenCalledOnce();
    } finally { vi.unstubAllGlobals(); }
  });
});
