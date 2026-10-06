import { execFile } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import { promisify } from "node:util";
import { dataPath, readJson } from "@/lib/file-io";
import { FFMPEG_BIN } from "@/lib/higgsfield";
import { resolveGeneratedFile } from "@/lib/storage";
import type { VideoEdit } from "./video-edit-contract";

const execFileP = promisify(execFile);

interface ElevenLabsConfig { apiKey?: string; voiceId?: string }

const BUILTIN_MUSIC: Record<string, { frequencies: [number, number]; tempo: number }> = {
  "calm-focus": { frequencies: [220, 330], tempo: 0.10 },
  "bright-step": { frequencies: [262, 392], tempo: 0.16 },
  "quiet-pulse": { frequencies: [110, 165], tempo: 0.12 },
  "warm-story": { frequencies: [196, 294], tempo: 0.09 },
  "clean-drive": { frequencies: [247, 370], tempo: 0.18 },
};

export class VideoRenderAssetError extends Error {
  constructor(readonly code: string, message: string) { super(message); }
}

/**
 * v71의 제품 기본 음악 5곡은 외부 권리 자산에 의존하지 않는 결정적 합성 베드다.
 * 같은 카탈로그 ID는 언제나 같은 파형을 만들고, 임시 디렉터리 밖에 원본을 남기지 않는다.
 */
export async function resolveRenderMusic(edit: VideoEdit, tenantId: string, tmpDir: string, durationSec: number): Promise<string | null> {
  if (!edit.music) return null;
  if (edit.music.source === "upload") {
    const resolved = resolveGeneratedFile(tenantId, edit.music.assetId);
    if (!resolved) throw new VideoRenderAssetError("VIDEO_MUSIC_NOT_FOUND", "올린 배경음악 파일을 찾지 못했습니다.");
    return resolved;
  }
  const preset = BUILTIN_MUSIC[edit.music.assetId];
  if (!preset) throw new VideoRenderAssetError("VIDEO_MUSIC_NOT_FOUND", "기본 배경음악을 찾지 못했습니다.");
  const outputPath = path.join(tmpDir, `music-${edit.music.assetId}.wav`);
  const [low, high] = preset.frequencies;
  await execFileP(FFMPEG_BIN, [
    "-y", "-f", "lavfi", "-i",
    `sine=frequency=${low}:sample_rate=44100:duration=${durationSec}`,
    "-f", "lavfi", "-i",
    `sine=frequency=${high}:sample_rate=44100:duration=${durationSec}`,
    "-filter_complex", `[0:a]volume=${preset.tempo}[a0];[1:a]volume=${preset.tempo / 2}[a1];[a0][a1]amix=inputs=2:normalize=0[a]`,
    "-map", "[a]", "-c:a", "pcm_s16le", outputPath,
  ], { timeout: 30_000 });
  return outputPath;
}

/** 선택한 목소리로 현재 남은 자막 원문을 합성한다. 실패하면 원본 음성을 조용히 내보내지 않는다. */
export async function renderSelectedVoice(edit: VideoEdit, script: string, outputPath: string): Promise<string | null> {
  if (!edit.voice) return null;
  if (!script.trim()) throw new VideoRenderAssetError("VIDEO_VOICE_SCRIPT_EMPTY", "바꿀 목소리의 대본이 비어 있습니다.");
  const config = readJson<ElevenLabsConfig>(dataPath("elevenlabs-config.json")) || {};
  if (!config.apiKey) throw new VideoRenderAssetError("VIDEO_VOICE_NOT_CONFIGURED", "음성 서비스 설정이 없어 목소리를 바꾸지 못했습니다.");
  const response = await fetch(`https://api.elevenlabs.io/v1/text-to-speech/${encodeURIComponent(edit.voice.voiceId)}`, {
    method: "POST",
    headers: { "xi-api-key": config.apiKey, "Content-Type": "application/json" },
    body: JSON.stringify({
      text: script,
      model_id: "eleven_multilingual_v2",
      voice_settings: { stability: 0.5, similarity_boost: 0.75 },
    }),
    signal: AbortSignal.timeout(45_000),
  });
  if (!response.ok) throw new VideoRenderAssetError("VIDEO_VOICE_RENDER_FAILED", "선택한 목소리를 만들지 못했습니다.");
  const buffer = Buffer.from(await response.arrayBuffer());
  if (!buffer.length) throw new VideoRenderAssetError("VIDEO_VOICE_RENDER_FAILED", "음성 결과가 비어 있습니다.");
  fs.writeFileSync(outputPath, buffer);
  return outputPath;
}
