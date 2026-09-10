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

export function findResultUrl(data: unknown, ext: RegExp): string | null {
  const txt = JSON.stringify(data ?? "");
  const m = txt.match(new RegExp(`https?://[^"'\\\\ ]+\\.(?:${ext.source})`, "i"));
  return m ? m[0] : null;
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

/**
 * 생성기가 쓸 수 있는 상태인지 짧게 먼저 확인한다.
 *
 * 2026-09-06 실측: 실행기를 컨테이너에 넣었더니 이번에는 인증이 없어 호출이 멈췄고,
 * 게이트웨이가 502 를 돌려줬다. 사용자는 또 이유를 모른다. 긴 생성 호출에 들어가기 전에
 * 짧은 확인을 한 번 해서, 없으면 없다고 로그인 안 됐으면 안 됐다고 말한다.
 */
export async function assertHiggsfieldReady(): Promise<void> {
  try {
    await execFileP(HF_BIN, ["auth", "token"], { timeout: 8000, maxBuffer: 1024 * 1024 });
  } catch (e) {
    const code = (e as { code?: string })?.code;
    if (code === "ENOENT") throw new HiggsfieldUnavailableError();
    throw new HiggsfieldUnauthenticatedError();
  }
}

export async function hfRun(args: string[], timeoutMs = 480000): Promise<{ stdout: string; stderr: string }> {
  try {
    return await execFileP(HF_BIN, args, { timeout: timeoutMs, maxBuffer: 16 * 1024 * 1024 });
  } catch (e) {
    // 2026-09-06 실측: 운영 컨테이너에 실행기가 없어 생성 요청이 502 로 끝났다. 화면에는
    // "Request failed: 502" 만 떠 무엇이 문제인지 알 수 없었다. 없는 것과 실패한 것을
    // 구분해 사용자에게 사실을 말한다(ADR-007 조용한 실패 금지).
    const code = (e as { code?: string })?.code;
    if (code === "ENOENT") throw new HiggsfieldUnavailableError();
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
