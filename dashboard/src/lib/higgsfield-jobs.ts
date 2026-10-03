// Higgsfield 비동기 생성 작업 기록 — 파일 기반, 새 DB 테이블 없음.
//
// 왜: 이미지/영상 생성은 Higgsfield 쪽 대기열이 몇 분~10분대로 늘어질 수 있는데, 운영은
// Cloudflare 터널 뒤라 100초 넘는 동기 HTTP 요청은 524로 끊긴다(세션맥락 2026-10-01 23:28
// 실측). ADR 결정.md "구조 초안 생성이 프록시 제한 시간을 넘는다" 옵션2(비동기 전환)를
// 이 기능에 적용한다 — POST는 작업만 접수하고 jobId를 즉시 반환, 화면이 GET으로 상태를
// 물어본다.
//
// 저장 위치: storage.ts의 테넌트 격리 패턴(safeTenantId/tenantMediaDir)을 그대로 써서
// data/studio/{tenantId}/.jobs/{jobId}.json 에 테넌트별로 격리한다. 다른 테넌트 폴더로는
// 넘어갈 수 없다(safeTenantId가 경로 구분자·상위참조를 전부 거부).
import fs from "fs";
import path from "path";
import crypto from "crypto";
import { safeTenantId, tenantMediaDir } from "@/lib/storage";

export type HiggsfieldJobKind = "image" | "video";
export type HiggsfieldJobStatus = "queued" | "processing" | "completed" | "failed";

export interface HiggsfieldImageJobInput {
  prompt: string;
  aspectRatio: string;
  quality: string;
  label: string;
}

export interface HiggsfieldVideoJobInput {
  localPath: string;
  filename: string;
  model: string;
  motion: string;
  narration: string;
  label: string;
}

export interface HiggsfieldJobRecord {
  jobId: string;
  tenantId: string;
  kind: HiggsfieldJobKind;
  createdAt: number;
  updatedAt: number;
  status: HiggsfieldJobStatus;
  // 생성기에 접수할 때 받은 외부 작업 id. 상태 조회(`generate get <id>`)에 쓴다.
  providerJobId: string;
  input: HiggsfieldImageJobInput | HiggsfieldVideoJobInput;
  // 완료 시 결과(route 응답 그대로 재사용할 수 있게 느슨한 any 허용 — route가 형을 안다).
  result?: Record<string, unknown>;
  error?: string;
}

function jobsDir(tenantId: string): string {
  return path.join(tenantMediaDir(tenantId), ".jobs");
}

function jobPath(tenantId: string, jobId: string): string | null {
  // jobId는 우리가 발급한 UUID만 허용 — 경로 조립 전에 형식을 걸러 traversal을 막는다.
  if (!/^[a-zA-Z0-9_-]{1,80}$/.test(jobId)) return null;
  return path.join(jobsDir(tenantId), `${jobId}.json`);
}

export function createHiggsfieldJob(
  tenantId: string,
  kind: HiggsfieldJobKind,
  providerJobId: string,
  input: HiggsfieldImageJobInput | HiggsfieldVideoJobInput,
): HiggsfieldJobRecord {
  const t = safeTenantId(tenantId);
  if (!t) throw new Error("invalid tenant id");
  const now = Date.now();
  const record: HiggsfieldJobRecord = {
    jobId: crypto.randomUUID(),
    tenantId: t,
    kind,
    createdAt: now,
    updatedAt: now,
    status: "queued",
    providerJobId,
    input,
  };
  writeHiggsfieldJob(record);
  return record;
}

export function writeHiggsfieldJob(record: HiggsfieldJobRecord): void {
  const fp = jobPath(record.tenantId, record.jobId);
  if (!fp) throw new Error("invalid job id");
  fs.mkdirSync(path.dirname(fp), { recursive: true });
  // 임시파일 후 rename — 동시 읽기가 반쯤 쓰인 JSON을 보지 않게.
  const tmp = `${fp}.${crypto.randomUUID()}.tmp`;
  fs.writeFileSync(tmp, JSON.stringify(record));
  fs.renameSync(tmp, fp);
}

/**
 * 테넌트가 일치할 때만 조회 결과를 돌려준다. 다른 테넌트의 jobId를 넣으면(혹은 jobId가
 * 틀리면) 존재 자체를 알리지 않고 null — 호출부가 이를 404로 번역한다.
 */
export function readHiggsfieldJob(tenantId: string, jobId: string): HiggsfieldJobRecord | null {
  const t = safeTenantId(tenantId);
  if (!t) return null;
  const fp = jobPath(t, jobId);
  if (!fp) return null;
  try {
    const raw = fs.readFileSync(fp, "utf8");
    const record = JSON.parse(raw) as HiggsfieldJobRecord;
    if (record.tenantId !== t) return null; // 다른 테넌트 폴더에 떨어진 적은 구조상 없지만 방어적으로.
    return record;
  } catch {
    return null;
  }
}

export function updateHiggsfieldJob(
  tenantId: string,
  jobId: string,
  patch: Partial<Pick<HiggsfieldJobRecord, "status" | "result" | "error">>,
): HiggsfieldJobRecord | null {
  const current = readHiggsfieldJob(tenantId, jobId);
  if (!current) return null;
  const next: HiggsfieldJobRecord = { ...current, ...patch, updatedAt: Date.now() };
  writeHiggsfieldJob(next);
  return next;
}
