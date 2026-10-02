// 인트로/아웃트로 합성 비동기 작업 기록 — higgsfield-jobs.ts와 같은 패턴(파일 기반,
// 새 DB 테이블 없음, tenantMediaDir 격리). Cloudflare 터널이 약 72~100s에서 끊기므로
// Remotion 렌더 + ffmpeg concat은 항상 비동기: POST가 202+jobId, GET이 상태 조회.
import fs from "fs";
import path from "path";
import crypto from "crypto";
import { safeTenantId, tenantMediaDir } from "@/lib/storage";
import type { IntroOutroCompId } from "../../remotion/IntroOutroComps";

export type IntroOutroJobStatus = "queued" | "processing" | "completed" | "failed";

export interface IntroOutroJobInput {
  sourceFilename: string; // 편집실의 기존(자막 포함) 영상 파일명
  introCompId: IntroOutroCompId | null;
  outroCompId: IntroOutroCompId | null;
  brandName: string;
  logoUrl?: string;
  primaryColor?: string;
  secondaryColor?: string;
  fontFamily?: string;
  introTitleText?: string;
  outroTitleText?: string;
}

export interface IntroOutroJobRecord {
  jobId: string;
  tenantId: string;
  createdAt: number;
  updatedAt: number;
  status: IntroOutroJobStatus;
  input: IntroOutroJobInput;
  resultFilename?: string;
  error?: string;
}

function jobsDir(tenantId: string): string {
  return path.join(tenantMediaDir(tenantId), ".intro-outro-jobs");
}

function jobPath(tenantId: string, jobId: string): string | null {
  if (!/^[a-zA-Z0-9_-]{1,80}$/.test(jobId)) return null;
  return path.join(jobsDir(tenantId), `${jobId}.json`);
}

export function createIntroOutroJob(tenantId: string, input: IntroOutroJobInput): IntroOutroJobRecord {
  const t = safeTenantId(tenantId);
  if (!t) throw new Error("invalid tenant id");
  const now = Date.now();
  const record: IntroOutroJobRecord = {
    jobId: crypto.randomUUID(),
    tenantId: t,
    createdAt: now,
    updatedAt: now,
    status: "queued",
    input,
  };
  writeIntroOutroJob(record);
  return record;
}

export function writeIntroOutroJob(record: IntroOutroJobRecord): void {
  const dir = jobsDir(record.tenantId);
  fs.mkdirSync(dir, { recursive: true });
  const p = jobPath(record.tenantId, record.jobId);
  if (!p) throw new Error("invalid job id");
  fs.writeFileSync(p, JSON.stringify(record, null, 2));
}

export function readIntroOutroJob(tenantId: string, jobId: string): IntroOutroJobRecord | null {
  const t = safeTenantId(tenantId);
  if (!t) return null;
  const p = jobPath(t, jobId);
  if (!p || !fs.existsSync(p)) return null;
  try {
    return JSON.parse(fs.readFileSync(p, "utf8")) as IntroOutroJobRecord;
  } catch {
    return null;
  }
}

export function updateIntroOutroJob(
  tenantId: string,
  jobId: string,
  patch: Partial<IntroOutroJobRecord>,
): IntroOutroJobRecord | null {
  const existing = readIntroOutroJob(tenantId, jobId);
  if (!existing) return null;
  const next = { ...existing, ...patch, updatedAt: Date.now() };
  writeIntroOutroJob(next);
  return next;
}
