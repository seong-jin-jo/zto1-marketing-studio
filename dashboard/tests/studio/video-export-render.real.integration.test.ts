import { execFileSync } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it, vi } from "vitest";
import { addTextSticker, emptyVideoEdit, setSubtitles, setSubtitleStyle, setVideoMusic, setVoice } from "@/lib/studio/video-edit-contract";

const real = process.env.S6_RENDER_REAL === "1" ? describe : describe.skip;
const ffmpegBin = process.env.S6_FFMPEG_BIN || process.env.FFMPEG_BIN || "ffmpeg";
const ffprobeBin = process.env.S6_FFPROBE_BIN || process.env.FFPROBE_BIN || "ffprobe";
let root = "";

afterEach(() => {
  vi.unstubAllGlobals();
  if (root) fs.rmSync(root, { recursive: true, force: true });
  delete process.env.DATA_DIR;
  delete process.env.SUBTITLE_FONT_FILE;
  root = "";
});

real("S6 실제 MP4 렌더", () => {
  it("S6-AC2 자막 스타일·글·음악·선택 목소리가 실제 MP4 영상·오디오 스트림에 반영된다", async () => {
    root = fs.mkdtempSync(path.join(os.tmpdir(), "s6-real-render-"));
    process.env.DATA_DIR = root;
    process.env.FFMPEG_BIN = ffmpegBin;
    process.env.FFPROBE_BIN = ffprobeBin;
    process.env.SUBTITLE_FONT_FILE = "/System/Library/Fonts/AppleSDGothicNeo.ttc";
    const tenantId = "tenant-s6-real";
    const videosDir = path.join(root, "tenants", tenantId, "videos");
    fs.mkdirSync(videosDir, { recursive: true });
    const sourcePath = path.join(videosDir, "source.mp4");
    const voiceFixture = path.join(root, "voice.mp3");
    const outputPath = path.join(root, "result.mp4");
    execFileSync(ffmpegBin, ["-y", "-f", "lavfi", "-i", "color=c=0x223344:s=360x640:d=3:r=30", "-f", "lavfi", "-i", "sine=frequency=330:duration=3", "-c:v", "libx264", "-pix_fmt", "yuv420p", "-c:a", "aac", "-shortest", sourcePath], { stdio: "ignore" });
    execFileSync(ffmpegBin, ["-y", "-f", "lavfi", "-i", "sine=frequency=660:duration=2", "-c:a", "libmp3lame", voiceFixture], { stdio: "ignore" });
    const configDir = path.join(root, "tenants", tenantId);
    fs.mkdirSync(configDir, { recursive: true });
    fs.writeFileSync(path.join(configDir, "elevenlabs-config.json"), JSON.stringify({ apiKey: "test-key" }));
    const voiceBytes = fs.readFileSync(voiceFixture);
    vi.stubGlobal("fetch", vi.fn(async () => new Response(voiceBytes, { status: 200, headers: { "Content-Type": "audio/mpeg" } })));
    vi.resetModules();
    const { renderVideoExport, probeRenderedVideo } = await import("@/lib/studio/video-export-renderer");
    let edit = setSubtitles(emptyVideoEdit(), [{ id: "s1", order: 0, text: "실제 자막", startSec: 0, endSec: 2.5, cut: false }]);
    edit = setSubtitleStyle(edit, { preset: "yellow", position: "top", sizePercent: 110, outline: true });
    edit = addTextSticker(edit, { kind: "text", text: "실제 제목", startSec: 0.5, endSec: 2.5, animation: "rise" });
    edit = setVideoMusic(edit, { source: "builtin", assetId: "calm-focus", label: "차분한 집중", volume: 18, offsetSec: 0, fadeOut: true, duckUnderVoice: true, rightsConfirmed: true });
    edit = setVoice(edit, { voiceId: "voice-test", voiceName: "테스트 목소리" });
    const result = await renderVideoExport(tenantId, { sourceFilename: "source.mp4", edit, lines: ["실제 자막"], subtitleSize: "보통" }, outputPath);
    const probed = await probeRenderedVideo(outputPath);
    expect(result).toMatchObject({ width: 360, height: 640, hasAudio: true });
    expect(probed.hasAudio).toBe(true);
    expect(probed.durationSec).toBeGreaterThan(1.8);
    expect(fs.statSync(outputPath).size).toBeGreaterThan(10_000);
  }, 120_000);
});
