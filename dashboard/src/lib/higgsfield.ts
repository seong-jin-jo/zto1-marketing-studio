// Higgsfield CLI 래퍼 — 서버측 API route에서 사용.
// CLI(@higgsfield/cli)는 device-flow 토큰으로 인증된 main 계정의 크레딧을 사용한다.
// (cloud.higgsfield.ai API키 워크스페이스가 아니라) — `higgsfield auth login` 로 한 번 로그인 필요.
// 바이너리 경로는 환경마다 다르므로 HIGGSFIELD_BIN env로 주입(미설정 시 PATH의 `higgsfield`).
import { execFile } from "child_process";
import { promisify } from "util";
import fs from "fs";
import path from "path";
import crypto from "crypto";
import { dataPath } from "@/lib/file-io";
import { MEDIA_ROOT, tenantMediaDir, assetUrl } from "@/lib/storage";

const execFileP = promisify(execFile);
export const HF_BIN = process.env.HIGGSFIELD_BIN || "higgsfield";
// 미디어 루트(data/studio) — 테넌트별 격리는 studioDir(tenantId)로. STUDIO_DIR 자체는 루트(genlog 등 비격리 메타용).
export const STUDIO_DIR = MEDIA_ROOT;

type HiggsfieldInvocation = { file: string; args: string[] };

/**
 * 운영의 모든 Higgsfield CLI 호출을 같은 파일 잠금으로 직렬화한다.
 *
 * CLI는 access token 만료 시 credentials.json의 refresh token을 회전시켜 다시 쓴다.
 * API 요청, 상태 화면, 30분 monitor가 동시에 CLI를 실행하면 둘이 같은 이전 refresh
 * token을 쓸 수 있으므로 프로세스 내부 mutex만으로는 부족하다. Compose가 공유 bind
 * mount 안의 HIGGSFIELD_LOCK_DIR을 지정한 운영에서는 커널 flock wrapper 한 개가 refresh
 * 구간만 직렬화한다. access token 만료가 5분 넘게 남은 생성·조회는 잠금을 잡지 않아 제품의
 * 동시 실행 상한을 보존한다. 로컬 개발은 해당 환경변수가 없을 때 기존 직접 실행을 유지한다.
 */
export function buildHiggsfieldInvocation(
  args: string[],
  env: Record<string, string | undefined> = process.env,
  useCredentialLock = true,
): HiggsfieldInvocation {
  const bin = env.HIGGSFIELD_BIN?.trim() || "higgsfield";
  const lockDir = env.HIGGSFIELD_LOCK_DIR?.trim();
  if (!lockDir || !useCredentialLock) return { file: bin, args };
  return {
    file: env.HIGGSFIELD_LOCK_WRAPPER?.trim() || "/usr/local/bin/run-higgsfield-locked",
    args: [bin, ...args],
  };
}

export function higgsfieldExecutionTimeout(
  commandTimeoutMs: number,
  env: Record<string, string | undefined> = process.env,
  useCredentialLock = true,
): number {
  if (!env.HIGGSFIELD_LOCK_DIR?.trim() || !useCredentialLock) return commandTimeoutMs;
  const configuredWait = Number(env.HIGGSFIELD_LOCK_WAIT_SECONDS);
  const waitSeconds = Number.isInteger(configuredWait) && configuredWait >= 1 && configuredWait <= 300
    ? configuredWait
    : 45;
  return commandTimeoutMs + waitSeconds * 1000;
}

const HIGGSFIELD_REFRESH_WINDOW_MS = 5 * 60 * 1000;

function parseExpiryMilliseconds(raw: unknown): number | null {
  let milliseconds = typeof raw === "number" ? raw : Number(raw);
  if (Number.isFinite(milliseconds) && milliseconds < 1_000_000_000_000) milliseconds *= 1000;
  if (!Number.isFinite(milliseconds)) milliseconds = Date.parse(String(raw || ""));
  return Number.isFinite(milliseconds) ? milliseconds : null;
}

export function higgsfieldCredentialsNeedRefresh(
  env: Record<string, string | undefined> = process.env,
  nowMs = Date.now(),
): boolean {
  if (!env.HIGGSFIELD_LOCK_DIR?.trim()) return false;
  const credentialFile = env.HIGGSFIELD_CREDENTIAL_FILE?.trim()
    || "/root/.config/higgsfield/credentials.json";
  try {
    const data = JSON.parse(fs.readFileSync(credentialFile, "utf8")) as Record<string, unknown>;
    const validToken = (value: unknown) => typeof value === "string" && value.trim().length > 0;
    const expiresAt = parseExpiryMilliseconds(data.expires_at);
    return !validToken(data.access_token)
      || !validToken(data.refresh_token)
      || expiresAt === null
      || expiresAt <= nowMs + HIGGSFIELD_REFRESH_WINDOW_MS;
  } catch {
    return true;
  }
}

async function execHiggsfieldRaw(
  args: string[],
  timeout: number,
  maxBuffer: number,
  useCredentialLock: boolean,
): Promise<{ stdout: string; stderr: string }> {
  const invocation = buildHiggsfieldInvocation(args, process.env, useCredentialLock);
  return execFileP(invocation.file, invocation.args, {
    timeout: higgsfieldExecutionTimeout(timeout, process.env, useCredentialLock),
    maxBuffer,
  });
}

export async function refreshHiggsfieldCredentialsIfNeeded(
  env: Record<string, string | undefined> = process.env,
  refreshUnderLock: () => Promise<unknown> = () => execHiggsfieldRaw(
    ["auth", "token"],
    8_000,
    1024 * 1024,
    true,
  ),
  nowMs: () => number = Date.now,
): Promise<boolean> {
  if (!env.HIGGSFIELD_LOCK_DIR?.trim() || !higgsfieldCredentialsNeedRefresh(env, nowMs())) {
    return false;
  }
  await refreshUnderLock();
  // CLI 1.1.26은 access token이 약 60~90초 남을 때까지 auth token 호출만으로
  // 갱신하지 않을 수 있다. 5분 보호 구간에 계속 남아 있으면 뒤 실제 명령도 같은
  // 커널 잠금을 사용해야 두 프로세스가 같은 refresh token을 동시에 쓰지 않는다.
  return higgsfieldCredentialsNeedRefresh(env, nowMs());
}

async function execHiggsfield(
  args: string[],
  timeout: number,
  maxBuffer: number,
): Promise<{ stdout: string; stderr: string }> {
  if (!process.env.HIGGSFIELD_LOCK_DIR?.trim()) {
    return execHiggsfieldRaw(args, timeout, maxBuffer, false);
  }
  if (args[0] === "auth" && args[1] === "token") {
    return execHiggsfieldRaw(args, timeout, maxBuffer, true);
  }
  const commandNeedsCredentialLock = await refreshHiggsfieldCredentialsIfNeeded();
  return execHiggsfieldRaw(args, timeout, maxBuffer, commandNeedsCredentialLock);
}

// 테넌트별 스튜디오 디렉토리(data/studio/{tenantId}/). 생성물은 이 경로에 저장해 테넌트 격리.
export function studioDir(tenantId: string): string {
  return tenantMediaDir(tenantId);
}

// 미디어 파일명 — 타임스탬프(Date.now) 대신 crypto.randomUUID로 열거 불가능하게.
export function mediaFilename(ext: string): string {
  const clean = String(ext || "").replace(/[^a-zA-Z0-9]/g, "").toLowerCase() || "bin";
  return `${crypto.randomUUID()}.${clean}`;
}

// asset 라우트용 테넌트 에셋 URL 재노출(호출부 편의).
export { assetUrl };

// CLI는 진행로그를 stderr로, 결과 JSON을 stdout으로 — 단 섞일 수 있어 JSON 블록만 추출.
export function extractJson(stdout: string): unknown {
  const arr = stdout.indexOf("[");
  const obj = stdout.indexOf("{");
  const start = arr === -1 ? obj : obj === -1 ? arr : Math.min(arr, obj);
  if (start === -1) return null;
  try {
    return JSON.parse(stdout.slice(start));
  } catch {
    return null;
  }
}

/**
 * `generate get <id> --json` 결과에서 완성물 URL을 뽑는다.
 *
 * 2026-10-02 리뷰 MAJOR 1/2/3(실물 픽스처로 재현): 종전엔 응답 전체를 문자열로 뭉쳐
 * 확장자 정규식으로 아무 URL이나 집었다. 실물 응답에는 결과가 아닌 URL이 여러 개 섞여
 * 있다 — 이미지는 `params.style.url`(스타일 견본 webp, get-image-pending.json), 영상은
 * `params.input_image.url`(바탕 그림 webp, get-video-pending.json 합성). 대기 중
 * (`status: "in_progress"`)인데도 이 URL들이 있어서, 정규식 폴백이 "완료"로 오판하고
 * 스타일 견본·바탕 그림을 산출물로 저장하는 사고가 났다. 진짜 결과는 최상위 `result_url`
 * 필드 하나뿐이고(get-image-done.json/get-video-done.json), `min_result_url`은 썸네일이라
 * 역시 결과가 아니다. 최상위 필드를 신뢰하고, 그 필드가 없는 낯선 shape에서만 정규식으로
 * 보수적으로 폴백한다.
 */
export function findResultUrl(data: unknown, ext: RegExp): string | null {
  if (data && typeof data === "object" && !Array.isArray(data)) {
    const obj = data as Record<string, unknown>;
    // "result_url" 키가 실제로 있으면(값이 null이어도) 이것이 실물 shape다 — 대기 중
    // 응답은 `"result_url": null`로 "아직 없다"는 사실 자체를 명시한다(get-image-
    // pending.json 실측). 그 경우 정규식 폴백으로 넘어가면 params.style.url·
    // params.input_image.url을 대신 집어버린다(실제로 그랬다, 리뷰 MAJOR 1/2). 키가
    // 있는데 문자열이 아니면 "아직 결과 없음"으로 단정하고 폴백하지 않는다.
    if ("result_url" in obj) {
      const topLevel = obj.result_url;
      return typeof topLevel === "string" && topLevel.trim() ? topLevel : null;
    }
  }
  // 하위호환 폴백: result_url 키 자체가 없는 낯선 응답 shape일 때만 쓴다.
  const txt = JSON.stringify(data ?? "");
  const m = txt.match(new RegExp(`https?://[^"'\\\\ ]+\\.(?:${ext.source})`, "i"));
  return m ? m[0] : null;
}

/**
 * `generate create ... --json`(--wait 없이) 응답에서 생성기가 매긴 작업 id를 뽑는다.
 *
 * 2026-10-01 비동기 전환: CLI 문서화된 키 이름을 확정할 수 없어(로그인·네트워크가 없는
 * 환경에서 실제 호출 불가) 후보 키를 여러 개 방어적으로 훑는다. 어느 것도 없으면 null —
 * 호출부가 "작업 id를 받지 못했다"로 사용자에게 사실대로 말한다(ADR-007).
 */
/**
 * 2026-10-02 리뷰 MAJOR 6(실물 픽스처 create-image.json으로 재현): `generate create ...
 * --json`(--wait 없음)의 실제 출력은 **객체가 아니라 작업 id 문자열 하나짜리 배열**이다
 * (`["df664d17-429f-4ff7-aae2-1e266cff67ba"]`). 종전 구현은 최상위가 object일 때만 보고
 * 배열은 즉시 null을 반환해, 비동기 생성이 "작업 번호를 받지 못했다"로 매번 거절됐다.
 */
export function extractJobId(data: unknown): string | null {
  if (Array.isArray(data)) {
    for (const item of data) {
      if (typeof item === "string" && item.trim()) return item.trim();
      if (typeof item === "number" && Number.isFinite(item)) return String(item);
    }
    for (const item of data) {
      const nested = extractJobId(item);
      if (nested) return nested;
    }
    return null;
  }
  if (!data || typeof data !== "object") return null;
  const obj = data as Record<string, unknown>;
  const candidates = ["id", "job_id", "jobId", "request_id", "requestId", "generation_id", "uuid"];
  for (const key of candidates) {
    const v = obj[key];
    if (typeof v === "string" && v.trim()) return v.trim();
    if (typeof v === "number" && Number.isFinite(v)) return String(v);
  }
  // 일부 응답은 { data: { id: ... } } 또는 { result: { id: ... } } 로 한 단계 감쌀 수 있다.
  for (const wrapKey of ["data", "result", "job"]) {
    const wrapped = obj[wrapKey];
    if (wrapped && typeof wrapped === "object") {
      const nested = extractJobId(wrapped);
      if (nested) return nested;
    }
  }
  return null;
}

/**
 * 작업 상태를 알아내 세 상태(done/failed/pending)로 정규화한다.
 *
 * 2026-10-02 리뷰 MAJOR 1/2(실물 픽스처로 재현): 종전엔 응답 전체를 소문자 문자열로
 * 뭉쳐 "complet|success|done|finish|ready" 패턴이나 아무 결과물 확장자 URL이 있으면
 * 완료로 판정했다. 실물 "대기 중" 응답(get-image-pending.json)엔 `status: "in_progress"`
 * 이면서도 `params.style.url`에 스타일 견본 webp가, 영상 쪽(get-video-pending.json 합성)엔
 * `params.input_image.url`에 바탕 그림 webp가 있다 — URL 유무로 완료를 판정하면 아직
 * 진행 중인 작업을 첫 폴링에서 완료/실패로 확정해 버린다. 최상위 `status` 필드 하나만
 * 신뢰한다.
 */
export type HiggsfieldJobCliStatus = "done" | "failed" | "pending";

const DONE_STATUSES = new Set(["completed", "succeeded", "success", "done", "finished", "ready"]);
const FAILED_STATUSES = new Set([
  "failed", "fail", "error", "errored", "rejected", "canceled", "cancelled",
  "nsfw_detected", "nsfw", "content_moderated",
]);

export function normalizeJobStatus(data: unknown, rawStdout: string): HiggsfieldJobCliStatus {
  if (data && typeof data === "object" && !Array.isArray(data)) {
    const raw = (data as Record<string, unknown>).status;
    if (typeof raw === "string" && raw.trim()) {
      const status = raw.trim().toLowerCase();
      if (FAILED_STATUSES.has(status)) return "failed";
      if (DONE_STATUSES.has(status)) return "done";
      // "in_progress"·"queued"·"pending"·"processing" 등 — 모르는 값도 보수적으로 대기.
      return "pending";
    }
  }
  // status 필드를 못 찾은(또는 JSON 파싱이 실패한) 경우에만 원문에서 보수적으로 찾는다.
  // 단 이 폴백도 status 필드의 값만 보고, URL 유무로는 완료를 판정하지 않는다 —
  // params.*.url(스타일 견본·바탕 그림)과 진짜 result_url을 문자열만으로는 구분할 수 없다.
  const txt = rawStdout.toLowerCase();
  const statusMatch = txt.match(/"status"\s*:\s*"([^"]+)"/);
  const status = statusMatch?.[1] || "";
  if ([...FAILED_STATUSES].some((s) => status.includes(s))) return "failed";
  if ([...DONE_STATUSES].some((s) => status.includes(s))) return "done";
  return "pending";
}

/** `higgsfield generate get <id> --json` — 진행 상태·결과를 짧게 1회 조회. */
export async function hfGetJob(providerJobId: string): Promise<{ stdout: string; stderr: string }> {
  return hfRun(["generate", "get", providerJobId, "--json"], 20000);
}

/** 실행기 자체가 없을 때 던지는 오류. 라우트가 이것을 구분해 사용자에게 사실을 말한다. */
export class HiggsfieldUnavailableError extends Error {
  constructor() {
    super("이미지·영상 생성기가 이 서버에 설치되어 있지 않습니다.");
    this.name = "HiggsfieldUnavailableError";
  }
}

/** 실행기는 있는데 로그인이 안 된 상태. 사용자에게 할 일이 다르므로 따로 구분한다. */
export class HiggsfieldUnauthenticatedError extends Error {
  constructor() {
    super("이미지·영상 생성기에 로그인되어 있지 않습니다.");
    this.name = "HiggsfieldUnauthenticatedError";
  }
}

/** 다른 생성 요청이 OAuth 자격 증명을 갱신 중이라 공유 잠금을 제시간에 얻지 못한 상태. */
export class HiggsfieldBusyError extends Error {
  constructor() {
    super("이미지·영상 생성기가 다른 작업을 처리 중입니다. 잠시 후 다시 시도해 주세요.");
    this.name = "HiggsfieldBusyError";
  }
}

export function isHiggsfieldLockBusyError(error: unknown): boolean {
  const code = (error as { code?: string | number } | null)?.code;
  const stderr = (error as { stderr?: unknown } | null)?.stderr;
  return (code === 75 || code === "75")
    && typeof stderr === "string"
    && stderr.includes("HIGGSFIELD_LOCK_BUSY");
}

/**
 * 생성기가 쓸 수 있는 상태인지 짧게 먼저 확인한다.
 *
 * 2026-09-06 실측: 실행기를 컨테이너에 넣었더니 이번에는 인증이 없어 호출이 멈췄고,
 * 게이트웨이가 502 를 돌려줬다. 사용자는 또 이유를 모른다. 긴 생성 호출에 들어가기 전에
 * 짧은 확인을 한 번 해서, 없으면 없다고 로그인 안 됐으면 안 됐다고 말한다.
 */
export async function assertHiggsfieldReady(): Promise<void> {
  try {
    if (process.env.HIGGSFIELD_LOCK_DIR?.trim()) {
      await refreshHiggsfieldCredentialsIfNeeded();
    } else {
      await execHiggsfield(["auth", "token"], 8000, 1024 * 1024);
    }
  } catch (e) {
    const code = (e as { code?: string })?.code;
    if (code === "ENOENT") throw new HiggsfieldUnavailableError();
    if (isHiggsfieldLockBusyError(e)) throw new HiggsfieldBusyError();
    throw new HiggsfieldUnauthenticatedError();
  }
}

export async function hfRun(args: string[], timeoutMs = 480000): Promise<{ stdout: string; stderr: string }> {
  try {
    return await execHiggsfield(args, timeoutMs, 16 * 1024 * 1024);
  } catch (e) {
    // 2026-09-06 실측: 운영 컨테이너에 실행기가 없어 생성 요청이 502 로 끝났다. 화면에는
    // "Request failed: 502" 만 떠 무엇이 문제인지 알 수 없었다. 없는 것과 실패한 것을
    // 구분해 사용자에게 사실을 말한다(ADR-007 조용한 실패 금지).
    const code = (e as { code?: string })?.code;
    if (code === "ENOENT") throw new HiggsfieldUnavailableError();
    if (isHiggsfieldLockBusyError(e)) throw new HiggsfieldBusyError();
    throw e;
  }
}

// 생성 로그 — Higgsfield 거래내역(모델/시각만 줌)과 시간으로 매칭해 "어느 산출물인지" 표시용
/**
 * 생성 로그 경로.
 *
 * 2026-09-06: 상수로 두면 모듈을 처음 읽는 순간의 테넌트 문맥(=공유 루트)이 굳어,
 * 고객에게 생성을 열자마자 모두의 이력이 한 파일에 섞인다. 호출 시점에 계산해
 * 작업 공간별로 갈라 놓는다. dataPath 가 테넌트 문맥을 보고 경로를 나눈다.
 */
export function genlogPath(): string {
  return dataPath(path.join("studio", "genlog.json"));
}
export function logGen(kind: "image" | "video", model: string, label: string): void {
  try {
    const target = genlogPath();
    fs.mkdirSync(path.dirname(target), { recursive: true });
    let arr: unknown[] = [];
    try { arr = JSON.parse(fs.readFileSync(target, "utf8")); } catch { arr = []; }
    arr.push({ ts: Date.now(), kind, model, label: (label || "").slice(0, 80) });
    fs.writeFileSync(target, JSON.stringify((arr as unknown[]).slice(-300)));
  } catch { /* noop */ }
}
export function readGenLog(): Array<{ ts: number; kind: string; model: string; label: string }> {
  try { return JSON.parse(fs.readFileSync(genlogPath(), "utf8")); } catch { return []; }
}

export const FFMPEG_BIN = process.env.FFMPEG_BIN || "ffmpeg";
export const SAY_BIN = process.env.SAY_BIN || "say"; // macOS TTS (로컬). prod linux는 ElevenLabs로 교체 예정.

export type NarrationResult =
  | { ok: true }
  | { ok: false; reason: "narration_empty" | "server_tts_unavailable" | "audio_mix_failed" };

// 무음 Higgsfield 클립에 내레이션 음성 입히기. 성공 시 outPath에 사운드 영상 생성.
// 영상을 내레이션 길이에 맞춰 루프(-stream_loop)하여 음성이 잘리지 않게.
export async function addNarration(videoPath: string, text: string, outPath: string): Promise<NarrationResult> {
  if (!text || !text.trim()) return { ok: false, reason: "narration_empty" };
  const aiff = `${outPath}.narr.aiff`;
  try {
    await execFileP(SAY_BIN, ["-v", "Yuna", "-r", "205", "-o", aiff, text.slice(0, 600)], { timeout: 60000 });
  } catch {
    return { ok: false, reason: "server_tts_unavailable" }; // say 미존재(비-macOS) → 무음 유지
  }
  try {
    await execFileP(FFMPEG_BIN, [
      "-y", "-stream_loop", "-1", "-i", videoPath, "-i", aiff,
      "-map", "0:v:0", "-map", "1:a:0",
      "-c:v", "libx264", "-pix_fmt", "yuv420p", "-c:a", "aac", "-b:a", "128k",
      "-shortest", outPath,
    ], { timeout: 120000 });
    return { ok: true };
  } catch {
    return { ok: false, reason: "audio_mix_failed" };
  } finally {
    try { fs.unlinkSync(aiff); } catch { /* noop */ }
  }
}

export async function downloadTo(url: string, outPath: string): Promise<number> {
  const res = await fetch(url, { signal: AbortSignal.timeout(60000) });
  if (!res.ok) throw new Error(`download ${res.status}`);
  const buf = Buffer.from(await res.arrayBuffer());
  fs.mkdirSync(path.dirname(outPath), { recursive: true });
  fs.writeFileSync(outPath, buf);
  return buf.length;
}

/**
 * 미디어 생성 1건을 사용량 정본(usage_events)에 남긴다.
 *
 * 2026-09-06 회장 확정으로 이미지·영상 생성을 고객에게 열었다. 글 생성은 이미 토큰까지
 * usage_events 에 남기는데 미디어는 파일 로그에만 남아 사용량 화면이 못 읽었다.
 * 같은 자리에 남겨야 고객이 자기 사용량을 보고 운영자가 종합 관리를 할 수 있다.
 * 기록 실패가 이미 성공한 생성을 뒤집지 않는다.
 */
export async function recordMediaGenerationEvent(
  tenantId: string,
  kind: "image" | "video",
  model: string,
  label: string,
): Promise<void> {
  try {
    const { withTenant } = await import("@/lib/db");
    await withTenant(tenantId, (sql) => sql`
      INSERT INTO usage_events (tenant_id, event_type, quantity, meta)
      VALUES (${tenantId}, 'mediaGeneration', 1, ${sql.json({
        kind, model, label: (label || "").slice(0, 80), source: "higgsfield",
      })})`);
  } catch (e) {
    if (process.env.OSMU_DEBUG) console.error("[higgsfield] usage_events 기록 실패(무시):", e);
  }
}
