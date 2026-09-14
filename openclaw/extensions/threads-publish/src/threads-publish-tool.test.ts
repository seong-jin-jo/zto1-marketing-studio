import { createTestPluginApi } from "openclaw/plugin-sdk/plugin-test-api";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const queue = vi.hoisted(() => ({
  begin: vi.fn(),
  record: vi.fn(),
}));

vi.mock("../../threads-queue/api.js", () => ({
  beginQueuePublishAttempt: queue.begin,
  recordQueueProviderResult: queue.record,
  resolvePublisherQueuePath: () => "/tmp/threads-queue.json",
}));

import { createThreadsPublishTool } from "./threads-publish-tool.js";

describe("CODE-REVIEW-20260915-07 Threads 고객 이미지 외부 복제 방지", () => {
  beforeEach(() => {
    vi.stubEnv("THREADS_ACCESS_TOKEN", "test-access-token");
    vi.stubEnv("THREADS_USER_ID", "test-user-id");
    queue.begin.mockResolvedValue({ idempotencyKey: "attempt-1" });
    queue.record.mockResolvedValue(undefined);
  });

  afterEach(() => {
    vi.unstubAllEnvs();
    vi.unstubAllGlobals();
    vi.clearAllMocks();
  });

  it("CODE-REVIEW-20260915-07 거절: 로컬 이미지를 공개 임시 호스트에 올리지 않고 확정 실패로 닫는다", async () => {
    const fetchSpy = vi.fn();
    vi.stubGlobal("fetch", fetchSpy);
    const api = createTestPluginApi({ id: "threads-publish", name: "threads-publish" });
    const tool = createThreadsPublishTool(api);

    await expect(
      tool.execute("call-1", {
        text: "검증 글",
        image_url: "/images/customer.png",
        queue_id: "post-1",
        claim_token: "claim-1",
      }),
    ).rejects.toThrow("보호된 이미지 배달 저장소가 준비되지 않아 발행하지 않았습니다");

    expect(fetchSpy).not.toHaveBeenCalled();
    expect(queue.record).toHaveBeenCalledWith(
      expect.objectContaining({
        state: "provider_failed",
        error: expect.stringContaining("보호된 이미지 배달 저장소"),
      }),
    );
  });
});
