// 영상 발행(POST /api/video/publish) 비동기 작업 기록 — 파일 기반, 새 DB 테이블 없음.
//
// 왜(세션맥락 2026-10-02 운영 실측): Threads + Instagram Reels 동시 발행에서 POST가 125초
// 걸려 Cloudflare 터널 한도(100초)로 524(HTML)를 받았다. 화면은 "일부 발행 실패"를
// 띄웠지만, 서버는 끝까지 진행해 Reels가 실제로 게시됐다(링크·자막 확인됨). 중복 게시
// 방지는 이미 published_posts 예약(draft_id/idempotency_key + ON CONFLICT DO NOTHING)이
// 맡고 있으므로(이 파일은 그 로직을 건드리지 않는다), 이 기록은 오직 "클라이언트가 끊긴
// 뒤에도 실제 결과(게시됨+링크 / 실패 사유)를 다시 물어볼 수 있게" 하기 위한 것이다.
//
// 테넌트별 격리는 dataPath()의 AsyncLocalStorage 테넌트 컨텍스트(runWithTenant)가
// 맡는다 — genlogPath()·higgsfield-jobs.ts와 같은 관례. 반드시 runWithTenant(tenantId, …)
// 컨텍스트 "안"에서 이 모듈의 함수를 호출한다.
import fs from "fs";
import path from "path";
import { dataPath } from "@/lib/file-io";

export type VideoPublishJobStatus = "processing" | "completed" | "failed";

export interface VideoPublishJobRecord {
  jobId: string;
  createdAt: number;
  updatedAt: number;
  status: VideoPublishJobStatus;
  platform: string;
  filename: string;
  httpStatus?: number;
  result?: Record<string, unknown>;
}

function jobsDir(): string {
  return dataPath(path.join("video-publish-jobs"));
}

function jobPath(jobId: string): string | null {
  // jobId는 우리가 발급한 UUID만 허용 — 경로 조립 전에 형식을 걸러 traversal을 막는다.
  if (!/^[a-zA-Z0-9_-]{1,80}$/.test(jobId)) return null;
  return path.join(jobsDir(), `${jobId}.json`);
}

export function createVideoPublishJob(
  jobId: string,
  input: { platform: string; filename: string },
): VideoPublishJobRecord {
  const now = Date.now();
  const record: VideoPublishJobRecord = {
    jobId,
    createdAt: now,
    updatedAt: now,
    status: "processing",
    platform: input.platform,
    filename: input.filename,
  };
  writeVideoPublishJob(record);
  return record;
}

export function writeVideoPublishJob(record: VideoPublishJobRecord): void {
  const fp = jobPath(record.jobId);
  if (!fp) throw new Error("invalid job id");
  fs.mkdirSync(path.dirname(fp), { recursive: true });
  const tmp = `${fp}.${process.pid}.${Math.random().toString(36).slice(2)}.tmp`;
  fs.writeFileSync(tmp, JSON.stringify(record));
  fs.renameSync(tmp, fp);
}

export function readVideoPublishJob(jobId: string): VideoPublishJobRecord | null {
  const fp = jobPath(jobId);
  if (!fp) return null;
  try {
    return JSON.parse(fs.readFileSync(fp, "utf8")) as VideoPublishJobRecord;
  } catch {
    return null;
  }
}

export function updateVideoPublishJob(
  jobId: string,
  patch: Partial<Pick<VideoPublishJobRecord, "status" | "result" | "httpStatus">>,
): VideoPublishJobRecord | null {
  const current = readVideoPublishJob(jobId);
  if (!current) return null;
  const next: VideoPublishJobRecord = { ...current, ...patch, updatedAt: Date.now() };
  writeVideoPublishJob(next);
  return next;
}
