// @vitest-environment jsdom
import { afterEach, describe, expect, it } from "vitest";
import {
  savePendingVideoPublishJob, readPendingVideoPublishJob, clearPendingVideoPublishJob,
  listAllPendingVideoPublishJobs,
  savePendingSocialPublishJob, readPendingSocialPublishJob, clearPendingSocialPublishJob,
} from "@/lib/publish-job-store";

afterEach(() => { localStorage.clear(); });

describe("publish-job-store — 비디오 발행 보류 작업", () => {
  it("저장한 것을 그대로 읽는다", () => {
    savePendingVideoPublishJob("ws-1", "clip.mp4", "reels", "job-1");
    const job = readPendingVideoPublishJob("ws-1", "clip.mp4", "reels");
    expect(job).toMatchObject({ kind: "video", jobId: "job-1", filename: "clip.mp4", platform: "reels" });
  });

  it("지우면 더는 읽히지 않고 색인에서도 빠진다", () => {
    savePendingVideoPublishJob("ws-1", "clip.mp4", "reels", "job-1");
    clearPendingVideoPublishJob("ws-1", "clip.mp4", "reels");
    expect(readPendingVideoPublishJob("ws-1", "clip.mp4", "reels")).toBeNull();
    expect(listAllPendingVideoPublishJobs("ws-1")).toEqual([]);
  });

  it("색인으로 어떤 (파일, 플랫폼)이 보류 중인지 사전 지식 없이 전부 찾는다", () => {
    savePendingVideoPublishJob("ws-1", "a.mp4", "reels", "job-a");
    savePendingVideoPublishJob("ws-1", "b.mp4", "youtube", "job-b");
    const all = listAllPendingVideoPublishJobs("ws-1").map((j) => j.jobId).sort();
    expect(all).toEqual(["job-a", "job-b"]);
  });

  it("다른 작업공간의 보류 작업은 섞이지 않는다", () => {
    savePendingVideoPublishJob("ws-1", "clip.mp4", "reels", "job-1");
    savePendingVideoPublishJob("ws-2", "clip.mp4", "reels", "job-2");
    expect(readPendingVideoPublishJob("ws-1", "clip.mp4", "reels")?.jobId).toBe("job-1");
    expect(readPendingVideoPublishJob("ws-2", "clip.mp4", "reels")?.jobId).toBe("job-2");
    expect(listAllPendingVideoPublishJobs("ws-1").map((j) => j.jobId)).toEqual(["job-1"]);
  });
});

describe("publish-job-store — 소셜 발행(draft_id 기반) 보류 작업", () => {
  it("저장·조회·삭제가 일관된다", () => {
    savePendingSocialPublishJob("ws-1", "draft-1", "threads");
    expect(readPendingSocialPublishJob("ws-1", "draft-1", "threads")).toMatchObject({
      kind: "social", draftId: "draft-1", platform: "threads",
    });
    clearPendingSocialPublishJob("ws-1", "draft-1", "threads");
    expect(readPendingSocialPublishJob("ws-1", "draft-1", "threads")).toBeNull();
  });

  it("같은 draftId라도 플랫폼이 다르면 독립적으로 저장된다", () => {
    savePendingSocialPublishJob("ws-1", "draft-1", "threads");
    savePendingSocialPublishJob("ws-1", "draft-1", "x");
    expect(readPendingSocialPublishJob("ws-1", "draft-1", "threads")?.platform).toBe("threads");
    expect(readPendingSocialPublishJob("ws-1", "draft-1", "x")?.platform).toBe("x");
    clearPendingSocialPublishJob("ws-1", "draft-1", "threads");
    expect(readPendingSocialPublishJob("ws-1", "draft-1", "threads")).toBeNull();
    expect(readPendingSocialPublishJob("ws-1", "draft-1", "x")).not.toBeNull();
  });
});
