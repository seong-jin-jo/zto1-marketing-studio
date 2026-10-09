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

// 2026-10-01 비동기 전환: 작업 기록은 실제 파일 I/O(fs)로 이뤄지는데, 이 판은 node:fs를
// 이미 다른 목적(narration 임시 파일)으로 전면 모킹해 두고 있다. 그 모킹과 작업 기록용
// 파일 읽기/쓰기가 충돌하지 않게, 이 판의 관심사(narration 폴백 계약)와 무관한
// 작업 기록은 메모리 Map으로 대체한다.
const H2 = vi.hoisted(() => ({ jobs: new Map<string, unknown>() }));
vi.mock("@/lib/higgsfield-jobs", () => ({
  createHiggsfieldJob: vi.fn((tenantId: string, kind: string, providerJobId: string, input: unknown) => {
    const jobId = `test-job-${H2.jobs.size + 1}`;
    const record = { jobId, tenantId, kind, providerJobId, input, status: "queued", createdAt: Date.now(), updatedAt: Date.now() };
    H2.jobs.set(jobId, record);
    return record;
  }),
  readHiggsfieldJob: vi.fn((tenantId: string, jobId: string) => {
    const record = H2.jobs.get(jobId) as { tenantId?: string } | undefined;
    if (!record || record.tenantId !== tenantId) return null;
    return record;
  }),
  updateHiggsfieldJob: vi.fn((tenantId: string, jobId: string, patch: Record<string, unknown>) => {
    const current = H2.jobs.get(jobId) as Record<string, unknown> | undefined;
    if (!current || current.tenantId !== tenantId) return null;
    const next = { ...current, ...patch, updatedAt: Date.now() };
    H2.jobs.set(jobId, next);
    return next;
  }),
  writeHiggsfieldJob: vi.fn(),
}));

vi.mock("@/lib/higgsfield", () => ({
  hfRun: vi.fn(async () => ({ stdout: '{"id":"job-1","status":"completed","url":"https://cdn.example/video.mp4"}' })),
  extractJson: vi.fn(() => ({ id: "job-1", status: "completed" })),
  // 2026-10-01 비동기 전환: POST는 extractJobId로 작업 id를 뽑고, GET job은 normalizeJobStatus로
  // 완료 여부를 판정한다 — 둘 다 이 모킹이 전체 모듈을 대체하므로 직접 공급해야 한다.
  extractJobId: vi.fn(() => "job-1"),
  normalizeJobStatus: vi.fn(() => "done" as const),
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
  HiggsfieldBusyError: class extends Error {},
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
  // MINOR-4(코드리뷰 2026-09-25): higgsfield/video 라우트가 filename 검증에
  // isSafeMediaFilename을 새로 쓴다 — 이 판의 관심사(무음 폴백 응답 계약)와 무관하니
  // 항상 통과시킨다.
  isSafeMediaFilename: vi.fn(() => true),
}));

// 2026-09-25 코드리뷰 MAJOR-0b: video 라우트가 더 이상 localPath를 받지 않고 filename만 받아
// resolveGeneratedFile로 서버 경로를 직접 푼다. 이 판의 관심사는 무음 폴백 응답 계약이므로
// 파일 탐색 자체는 항상 성공한 것으로 둔다.
vi.mock("@/lib/storage", () => ({
  resolveGeneratedFile: vi.fn(() => "/tmp/input.png"),
}));

beforeEach(() => {
  vi.resetModules();
  H.higgsNarration = { ok: false, reason: "server_tts_unavailable" };
});

describe("내레이션 무음 폴백 응답 계약", () => {
  it("Higgsfield TTS 실행기가 없으면 성공 응답에 무음 사유를 명시한다", async () => {
    // 2026-10-01 비동기 전환: POST는 jobId만 접수한다 — 결과는 GET job에서 확인한다.
    const { POST } = await import("@/app/api/higgsfield/video/route");
    const accepted = await POST(new Request("http://localhost/api/higgsfield/video", {
      method: "POST",
      body: JSON.stringify({
        filename: "input.png",
        prompt: "motion",
        narration: "읽어줄 문장",
        tenant_id: "11111111-1111-4111-8111-111111111111",
      }),
    }));
    const acceptedBody = await accepted.json();
    expect(accepted.status).toBe(202);
    expect(acceptedBody.ok).toBe(true);

    const { GET } = await import("@/app/api/higgsfield/job/[id]/route");
    const response = await GET(
      new Request(`http://localhost/api/higgsfield/job/${acceptedBody.jobId}?tenant_id=11111111-1111-4111-8111-111111111111`),
      { params: Promise.resolve({ id: acceptedBody.jobId }) },
    );
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
