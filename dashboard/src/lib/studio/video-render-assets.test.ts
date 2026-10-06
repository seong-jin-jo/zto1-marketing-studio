import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

let dataDir = "";

beforeEach(() => {
  dataDir = fs.mkdtempSync(path.join(os.tmpdir(), "s6-voice-cache-"));
  process.env.DATA_DIR = dataDir;
  fs.writeFileSync(path.join(dataDir, "elevenlabs-config.json"), JSON.stringify({ apiKey: "test-key" }));
  vi.resetModules();
});

afterEach(() => {
  vi.unstubAllGlobals();
  delete process.env.DATA_DIR;
  fs.rmSync(dataDir, { recursive: true, force: true });
});

describe("S6 음성 렌더 자산", () => {
  it("S6-MINOR-VOICE-01 같은 테넌트·목소리·대본 재시도는 ElevenLabs를 다시 호출하지 않는다", async () => {
    const fetchMock = vi.fn(async () => new Response(Buffer.from("voice-bytes"), { status: 200 }));
    vi.stubGlobal("fetch", fetchMock);
    const { emptyVideoEdit, setVoice } = await import("./video-edit-contract");
    const { renderSelectedVoice } = await import("./video-render-assets");
    const edit = setVoice(emptyVideoEdit(), { voiceId: "voice-calm", voiceName: "차분한 목소리" });
    const first = path.join(dataDir, "first.mp3");
    const second = path.join(dataDir, "second.mp3");

    await renderSelectedVoice(edit, "같은 대본", first, "tenant-a");
    await renderSelectedVoice(edit, "같은 대본", second, "tenant-a");

    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(fs.readFileSync(first)).toEqual(Buffer.from("voice-bytes"));
    expect(fs.readFileSync(second)).toEqual(Buffer.from("voice-bytes"));
  });

  it("S6-MINOR-VOICE-02 테넌트나 대본이 다르면 캐시를 공유하지 않는다", async () => {
    const fetchMock = vi.fn(async () => new Response(Buffer.from("voice-bytes"), { status: 200 }));
    vi.stubGlobal("fetch", fetchMock);
    const { emptyVideoEdit, setVoice } = await import("./video-edit-contract");
    const { renderSelectedVoice } = await import("./video-render-assets");
    const edit = setVoice(emptyVideoEdit(), { voiceId: "voice-calm", voiceName: "차분한 목소리" });

    await renderSelectedVoice(edit, "첫 대본", path.join(dataDir, "a.mp3"), "tenant-a");
    await renderSelectedVoice(edit, "다른 대본", path.join(dataDir, "b.mp3"), "tenant-a");
    await renderSelectedVoice(edit, "첫 대본", path.join(dataDir, "c.mp3"), "tenant-b");

    expect(fetchMock).toHaveBeenCalledTimes(3);
  });
});
