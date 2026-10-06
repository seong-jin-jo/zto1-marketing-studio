// 인트로/아웃트로 합성 비동기 작업 기록 — higgsfield-jobs.ts와 같은 패턴(파일 기반,
// 새 DB 테이블 없음, tenantMediaDir 격리). Cloudflare 터널이 약 72~100s에서 끊기므로
// Remotion 렌더 + ffmpeg concat은 항상 비동기: POST가 202+jobId, GET이 상태 조회.
import fs from "fs";
import path from "path";
import crypto from "crypto";
import { safeTenantId, tenantMediaDir } from "@/lib/storage";
import { assetUrl } from "@/lib/higgsfield";
import { signMediaToken } from "@/lib/media-token";
import type { IntroOutroCompId } from "../../remotion/IntroOutroComps";
import type { VideoTransition } from "@/lib/studio/video-edit-contract";

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
  introDurationSec?: number;
  outroDurationSec?: number;
  transitions?: { introToMain: VideoTransition; mainToOutro: VideoTransition };
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

/**
 * 독립 리뷰(minor): POST route.ts와 GET job/[id]/route.ts가 각자 같은 함수를 복사해
 * 들고 있었다 — 한 곳으로 모은다. 서명된 `/api/media/<token>` 배달 URL을 우선한다
 * (M-3: `<video src>`가 Authorization 헤더를 못 보내므로 Bearer를 요구하는
 * `/api/higgsfield/asset/...` 대신 자체 검증되는 이 URL을 쓴다).
 */
export function deliverUrl(tenantId: string, filename: string): string {
  const token = signMediaToken(tenantId, filename);
  return token ? `/api/media/${encodeURIComponent(token)}` : assetUrl(tenantId, filename);
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

/**
 * 독립 리뷰 M-2(자원): 테넌트 하나가 여러 개를 동시에 접수하면 전역 렌더 슬롯(1개)을
 * 혼자 독점해 다른 테넌트가 무기한 대기한다. 테넌트당 진행 중(queued|processing) 작업을
 * 1개로 막아 접수 단계에서 거절한다(409) — 큐에서 썩는 대신 "끝나면 다시 시도"를
 * 바로 알려준다.
 */
export function hasInProgressIntroOutroJob(tenantId: string): boolean {
  const t = safeTenantId(tenantId);
  if (!t) return false;
  const dir = jobsDir(t);
  if (!fs.existsSync(dir)) return false;
  for (const file of fs.readdirSync(dir)) {
    if (!file.endsWith(".json")) continue;
    try {
      const record = JSON.parse(fs.readFileSync(path.join(dir, file), "utf8")) as IntroOutroJobRecord;
      if (record.status === "queued" || record.status === "processing") return true;
    } catch {
      // 손상된 기록 — 다른 테넌트 안전을 위해 건너뛰고 계속 스캔(사고 차단이지 유일한
      // 진실원은 아니므로 조용히 넘어가도 된다).
    }
  }
  return false;
}
