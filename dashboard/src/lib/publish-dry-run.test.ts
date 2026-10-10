import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it, vi } from "vitest";
import {
  isPublishDryRunEnabled,
  PUBLISH_DRY_RUN_TEXT_PLATFORMS,
  PUBLISH_DRY_RUN_VIDEO_PLATFORMS,
  recordTextPublishDryRun,
} from "./publish-dry-run";

afterEach(() => vi.unstubAllEnvs());

describe("PUBLISH_DRY_RUN 계약", () => {
  it("LOCAL-REAL-PATH-02 정상: 개발에서 명시적으로 켠 경우만 활성화한다", () => {
    expect(isPublishDryRunEnabled({ PUBLISH_DRY_RUN: "1", NODE_ENV: "development" } as NodeJS.ProcessEnv)).toBe(true);
    expect(isPublishDryRunEnabled({ PUBLISH_DRY_RUN: "0", NODE_ENV: "development" } as NodeJS.ProcessEnv)).toBe(false);
  });

  it("LOCAL-REAL-PATH-02 거절: 운영에서는 환경값이 있어도 비활성화한다", () => {
    expect(isPublishDryRunEnabled({ PUBLISH_DRY_RUN: "1", NODE_ENV: "production" } as NodeJS.ProcessEnv)).toBe(false);
  });

  it("LOCAL-REAL-PATH-02 정상: 모든 텍스트·영상 발행 어댑터와 카카오톡을 열거한다", () => {
    expect(PUBLISH_DRY_RUN_TEXT_PLATFORMS).toEqual(expect.arrayContaining([
      "threads", "x", "instagram", "facebook", "linkedin", "bluesky", "telegram", "discord", "slack", "kakao",
    ]));
    expect(PUBLISH_DRY_RUN_VIDEO_PLATFORMS).toEqual(expect.arrayContaining(["youtube", "tiktok", "reels"]));
  });

  it("LOCAL-REAL-PATH-02 정상: 자격증명 없이 엔드포인트·본문·미디어 URL만 JSONL로 기록한다", () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), "osmu-publish-dry-run-"));
    const log = path.join(dir, "requests.jsonl");
    vi.stubEnv("PUBLISH_DRY_RUN_LOG", log);
    const result = recordTextPublishDryRun({ tenantId: "tenant-a", platform: "kakao", text: "실제 경로", imageUrls: ["http://127.0.0.1/media.png"] });
    expect(result.ok).toBe(true);
    const row = JSON.parse(fs.readFileSync(log, "utf8")) as Record<string, unknown>;
    expect(row).toMatchObject({ platform: "kakao", endpoint: "https://kapi.kakao.com/v2/api/talk/memo/default/send", mediaUrls: ["http://127.0.0.1/media.png"] });
    expect(row.body).toMatchObject({
      template_object: {
        link: { web_url: "http://127.0.0.1/media.png", mobile_web_url: "http://127.0.0.1/media.png" },
        button_title: "이미지 보기",
      },
    });
    expect(JSON.stringify(row)).not.toMatch(/access[_-]?token|authorization|secret/i);
  });
});
