import fs from "node:fs";
import path from "node:path";
import { beforeEach, describe, expect, it, vi } from "vitest";

const H = vi.hoisted(() => ({
  higgsNarration: {
    ok: false,
    reason: "server_tts_unavailable",
  } as { ok: boolean; reason?: string },
}));

vi.mock("node:fs", async (importOriginal) => {
  const actual = await importOriginal<typeof import("node:fs")>();
  return {
    ...actual,
    default: {
      ...actual,
    existsSync: vi.fn(() => true),
    mkdirSync: vi.fn(),
    mkdtempSync: vi.fn(() => "/tmp/video-narration-test"),
    writeFileSync: vi.fn(),
    renameSync: vi.fn(),
    rmSync: vi.fn(),
    },
  };
});

vi.mock("child_process", () => ({
  execFileSync: vi.fn(),
}));

vi.mock("@/lib/higgsfield", () => ({
  hfRun: vi.fn(async () => ({ stdout: '{"status":"completed","url":"https://cdn.example/video.mp4"}' })),
  extractJson: vi.fn(() => ({ status: "completed" })),
  findResultUrl: vi.fn(() => "https://cdn.example/video.mp4"),
  downloadTo: vi.fn(async () => 123),
  addNarration: vi.fn(async () => H.higgsNarration),
  logGen: vi.fn(),
  // 2026-09-06: 생성 1건을 사용량 정본에 남기는 헬퍼가 추가됐다. 이 판의 관심사는
  // 무음 폴백 응답이므로 기록은 통과시킨다.
  recordMediaGenerationEvent: vi.fn(async () => {}),
  // 2026-09-06: 긴 생성 호출 전에 생성기가 쓸 수 있는지 짧게 확인한다. 이 판은 무음
  // 폴백 응답만 보므로 준비된 것으로 둔다.
  assertHiggsfieldReady: vi.fn(async () => {}),
  HiggsfieldUnavailableError: class extends Error {},
  HiggsfieldUnauthenticatedError: class extends Error {},
  // 2026-09-07: 만든 파일을 테넌트 폴더에 두고 주소에도 테넌트를 실어야 화면이 불러온다.
  // 종전에는 공용 루트에 저장하고 주소에 테넌트가 없어 그림이 안 떴다.
  studioDir: vi.fn((tenantId: string) => `/tmp/studio/${tenantId}`),
  assetUrl: vi.fn((tenantId: string, key: string) => `/api/higgsfield/asset/${key}?tenant_id=${tenantId}`),
}));

vi.mock("@/lib/file-io", () => ({
  readJson: vi.fn(() => ({})),
  dataPath: vi.fn((p: string) => path.join("/tmp/data", p)),
}));

// 2026-09-06: 영상 생성이 사용량을 작업 공간별로 남기게 되면서 테넌트 식별을 요구한다.
// 이 판은 무음 폴백 응답 계약만 보므로 식별을 통과시킨다.
vi.mock("@/lib/tenant-auth", () => ({
  effectiveTenantId: vi.fn(async () => "11111111-1111-4111-8111-111111111111"),
}));

vi.mock("@/lib/tenant-context", () => ({
  runWithTenant: vi.fn(async (_tenantId: string | null, cb: () => unknown) => cb()),
}));

vi.mock("@/lib/media-token", () => ({
  signMediaToken: vi.fn(() => "signed"),
}));

beforeEach(() => {
  vi.resetModules();
  H.higgsNarration = { ok: false, reason: "server_tts_unavailable" };
});

describe("내레이션 무음 폴백 응답 계약", () => {
  it("Higgsfield TTS 실행기가 없으면 성공 응답에 무음 사유를 명시한다", async () => {
    const { POST } = await import("@/app/api/higgsfield/video/route");
    const response = await POST(new Request("http://localhost/api/higgsfield/video", {
      method: "POST",
      body: JSON.stringify({
        localPath: "/tmp/input.png",
        prompt: "motion",
        narration: "읽어줄 문장",
        tenant_id: "11111111-1111-4111-8111-111111111111",
      }),
    }));
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body.ok).toBe(true);
    expect(body.narration).toEqual({
      requested: true,
      included: false,
      reason: "server_tts_unavailable",
      message: "내레이션 없이 생성됨 (서버에 TTS 실행기가 없음)",
    });
  });

  it("ElevenLabs 키가 없으면 슬라이드 영상 응답에 별도 사유를 명시한다", async () => {
    const { POST } = await import("@/app/api/video/generate/route");
    const response = await POST(new Request("http://localhost/api/video/generate", {
      method: "POST",
      body: JSON.stringify({
        slides: [{ text: "첫 번째 슬라이드", duration: 1 }],
        ttsEnabled: true,
      }),
    }));
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body.ok).toBe(true);
    expect(body.narration).toEqual({
      requested: true,
      included: false,
      reason: "elevenlabs_key_missing",
      message: "내레이션 없이 생성됨 (ElevenLabs 키 미설정)",
    });
  });

  it("Studio와 영상 화면이 응답의 내레이션 메시지를 사용자에게 노출한다", () => {
    const studio = fs.readFileSync(path.join(process.cwd(), "src/app/studio/page.tsx"), "utf8");
    const videos = fs.readFileSync(path.join(process.cwd(), "src/app/videos/page.tsx"), "utf8");
    expect(studio).toContain("vid?.narration?.message");
    expect(videos).toContain("res.narration?.message");
  });
});
