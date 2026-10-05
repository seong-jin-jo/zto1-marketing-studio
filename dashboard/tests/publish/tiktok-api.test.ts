import { describe, expect, it, vi } from "vitest";
import {
  fetchTikTokPostStatus,
  queryTikTokCreatorInfo,
  startTikTokVideoPost,
} from "@/lib/tiktok";

function response(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json" } });
}

describe("TikTok Content Posting API", () => {
  it("maps creator info and only keeps documented privacy levels", async () => {
    const f = vi.fn(async () => response({
      data: {
        creator_username: "brand",
        creator_nickname: "Brand",
        privacy_level_options: ["PUBLIC_TO_EVERYONE", "SELF_ONLY", "INVALID"],
        comment_disabled: false,
        duet_disabled: true,
        stitch_disabled: false,
        max_video_post_duration_sec: 300,
      },
      error: { code: "ok" },
    }));
    await expect(queryTikTokCreatorInfo("token", f as typeof fetch)).resolves.toMatchObject({
      username: "brand",
      privacyLevels: ["PUBLIC_TO_EVERYONE", "SELF_ONLY"],
      duetDisabled: true,
      maxVideoDurationSec: 300,
    });
  });

  it("initializes a real video PULL_FROM_URL request and never sends the token in the body", async () => {
    const f = vi.fn(async () => response({ data: { publish_id: "pub-1" }, error: { code: "ok" } }));
    const result = await startTikTokVideoPost({
      accessToken: "secret-token",
      videoUrl: "https://media.example/video.mp4",
      title: "caption #tag",
      privacyLevel: "SELF_ONLY",
      disableComment: true,
      disableDuet: true,
      disableStitch: true,
      isAiGenerated: true,
    }, f as typeof fetch);
    expect(result).toEqual({ ok: true, publishId: "pub-1" });
    const calls = f.mock.calls as unknown as Array<[string, RequestInit]>;
    const init = calls[0][1];
    expect((init.headers as Record<string, string>).Authorization).toBe("Bearer secret-token");
    expect(String(init.body)).not.toContain("secret-token");
    expect(JSON.parse(String(init.body))).toMatchObject({
      post_info: { privacy_level: "SELF_ONLY", is_aigc: true },
      source_info: { source: "PULL_FROM_URL", video_url: "https://media.example/video.mp4" },
    });
  });

  it("normalizes provider failure without returning the provider message", async () => {
    const f = vi.fn(async () => response({
      data: {},
      error: { code: "url_ownership_unverified", message: "raw provider detail", log_id: "log-init-1" },
    }, 403));
    await expect(startTikTokVideoPost({
      accessToken: "token",
      videoUrl: "https://media.example/video.mp4",
      title: "caption",
      privacyLevel: "SELF_ONLY",
      disableComment: true,
      disableDuet: true,
      disableStitch: true,
      isAiGenerated: false,
    }, f as typeof fetch)).resolves.toEqual({
      ok: false,
      reason: "url_ownership_unverified",
      providerError: { code: "url_ownership_unverified", message: "raw provider detail", logId: "log-init-1" },
    });
  });

  // 2026-10-02 Codex 교차검수(PR #104) MAJOR: 허용 목록 밖의 reason을 검증 없이 돌려주면
  // 로그·DB에 임의 문자열(예: 비밀값 형태)이 그대로 남을 수 있다. 문서에 없는 코드나
  // 손상된 응답은 전부 고정 코드로 접어야 한다.
  it("collapses an undocumented reject code to a fixed code instead of passing it through raw", async () => {
    const f = vi.fn(async () => response({
      data: {},
      error: { code: "access_token=provider-secret", message: "raw provider detail" },
    }, 403));
    await expect(startTikTokVideoPost({
      accessToken: "token",
      videoUrl: "https://media.example/video.mp4",
      title: "caption",
      privacyLevel: "SELF_ONLY",
      disableComment: true,
      disableDuet: true,
      disableStitch: true,
      isAiGenerated: false,
    }, f as typeof fetch)).resolves.toEqual({
      ok: false,
      reason: "provider_rejected",
      providerError: { code: "provider_rejected", message: "", logId: null },
    });
  });

  it.each([
    [429, "rate_limit_exceeded"],
    [503, "provider_unavailable"],
  ])("TIKTOK-ERROR-04 거절: 상태 조회 HTTP %s 빈 응답은 %s 재시도 오류다", async (status, code) => {
    const f = vi.fn(async () => response({}, status));

    await expect(fetchTikTokPostStatus("token", "pub-1", f as typeof fetch)).resolves.toEqual({
      ok: false,
      providerError: { code, message: "", logId: null },
    });
  });

  it("TIKTOK-ERROR-04 경계: HTTP 200이어도 status가 비었으면 조회 오류로 반환한다", async () => {
    const f = vi.fn(async () => response({ data: {}, error: { code: "ok", log_id: "log-empty-status-1" } }));

    await expect(fetchTikTokPostStatus("token", "pub-1", f as typeof fetch)).resolves.toEqual({
      ok: false,
      providerError: { code: "provider_unavailable", message: "", logId: "log-empty-status-1" },
    });
  });

  it.each([
    [429, "rate_limit_exceeded"],
    [503, "provider_unavailable"],
  ])("TIKTOK-ERROR-05 거절: 발행 초기화 HTTP %s 빈 응답도 %s로 분류한다", async (status, code) => {
    const f = vi.fn(async () => response({}, status));
    await expect(startTikTokVideoPost({
      accessToken: "token",
      videoUrl: "https://media.example/video.mp4",
      title: "caption",
      privacyLevel: "SELF_ONLY",
      disableComment: true,
      disableDuet: true,
      disableStitch: true,
      isAiGenerated: false,
    }, f as typeof fetch)).resolves.toEqual({
      ok: false,
      reason: code,
      providerError: { code, message: "", logId: null },
    });
  });

  it("reads TikTok's documented publicaly_available_post_id field", async () => {
    const f = vi.fn(async () => response({
      data: { status: "PUBLISH_COMPLETE", publicaly_available_post_id: [12345] },
      error: { code: "ok" },
    }));
    await expect(fetchTikTokPostStatus("token", "pub-1", f as typeof fetch)).resolves.toEqual({
      ok: true,
      status: "PUBLISH_COMPLETE",
      postId: "12345",
      providerError: { code: "ok", message: "", logId: null },
    });
  });

  it("TIKTOK-ERROR-01 정상: 상태 조회 API 오류의 code·message·log_id를 구조화해 반환한다", async () => {
    const f = vi.fn(async () => response({
      data: {},
      error: { code: "access_token_invalid", message: "token expired", log_id: "log-status-1" },
    }, 401));

    await expect(fetchTikTokPostStatus("token", "pub-1", f as typeof fetch)).resolves.toEqual({
      ok: false,
      providerError: { code: "access_token_invalid", message: "token expired", logId: "log-status-1" },
    });
  });

  it("TIKTOK-ERROR-07 정상: 형식이 정상인 미정의 FAILED fail_reason은 원문 code를 별도 보존한다", async () => {
    const f = vi.fn(async () => response({
      data: { status: "FAILED", fail_reason: "video_under_review_timeout" },
      error: { code: "ok", log_id: "log-failed-raw-1" },
    }));

    await expect(fetchTikTokPostStatus("token", "pub-1", f as typeof fetch)).resolves.toEqual({
      ok: true,
      status: "FAILED",
      postId: undefined,
      failReason: "provider_rejected",
      rawFailReason: "video_under_review_timeout",
      providerError: { code: "ok", message: "", logId: "log-failed-raw-1" },
    });
  });

  it.each([
    "access_token=raw-provider-secret",
    "sk_abcdefghijklmnopqrstuvwxyz0123456789",
    `reason_${"x".repeat(65)}`,
  ])("TIKTOK-ERROR-07 거절: 손상되거나 토큰 형태인 FAILED fail_reason %s는 원문 code로 저장하지 않는다", async (failReason) => {
    const f = vi.fn(async () => response({
      data: { status: "FAILED", fail_reason: failReason },
      error: { code: "ok", log_id: "log-failed-unsafe-1" },
    }));

    await expect(fetchTikTokPostStatus("token", "pub-1", f as typeof fetch)).resolves.toEqual({
      ok: true,
      status: "FAILED",
      postId: undefined,
      failReason: "provider_rejected",
      providerError: { code: "ok", message: "", logId: "log-failed-unsafe-1" },
    });
  });

  it.each([
    ["access_token=raw-provider-secret expired", "access_token=[redacted] expired"],
    ["token=provider-secret", "token=[redacted]"],
    ["api_key=provider-secret", "api_key=[redacted]"],
    ["client_secret=provider-secret", "client_secret=[redacted]"],
    ["refresh_token=provider-secret", "refresh_token=[redacted]"],
    ["Authorization: Bearer provider-secret", "Authorization=[redacted]"],
    ["cookie=session-cookie-value", "cookie=[redacted]"],
    ["session=session-secret-value", "session=[redacted]"],
    ["API key abcdefghijklmnopqrstuvwxyz", "API key=[redacted]"],
    ["Bearer abcdefghijklmnopqrstuvwxyz0123456789._-", "Bearer [redacted]"],
    ["trace abcdefghijklmnopqrstuvwxyz0123456789._- rejected", "trace [redacted] rejected"],
  ])("TIKTOK-ERROR-06 거절: 알려진 오류 메시지의 민감값 %s는 저장 전 가린다", async (message, redacted) => {
    const f = vi.fn(async () => response({
      data: {},
      error: { code: "access_token_invalid", message, log_id: "log-status-2" },
    }, 401));

    await expect(fetchTikTokPostStatus("token", "pub-1", f as typeof fetch)).resolves.toEqual({
      ok: false,
      providerError: { code: "access_token_invalid", message: redacted, logId: "log-status-2" },
    });
  });

  it.each([
    ["unaudited_client_can_only_post_to_private_accounts", "심사 전이라 공개 게시가 막혀"],
    ["privacy_level_option_mismatch", "공개 범위"],
    ["spam_risk_too_many_posts", "하루 게시 한도"],
    ["access_token_invalid", "다시 연결"],
    ["scope_not_authorized", "권한"],
  ])("TIKTOK-ERROR-02 정상: %s를 사람이 읽을 사유로 번역한다", async (code, message) => {
    const { tiktokRejectReasonMessage } = await import("@/lib/tiktok");
    expect(tiktokRejectReasonMessage(code)).toContain(message);
  });
});
