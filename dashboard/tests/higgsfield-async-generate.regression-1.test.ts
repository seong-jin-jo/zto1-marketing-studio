import fs from "fs";
import os from "os";
import path from "path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

// 2026-10-01 비동기 전환 — 세션맥락 실측(cb35f3fd): 동기 --wait 생성 호출이 Higgsfield
// 대기열에서 15~20분 걸렸는데, 운영은 Cloudflare 터널 뒤라 100초 넘는 동기 HTTP 요청은
// 524로 끊긴다. 결과는 나중에 만들어지는데 서버는 이미 그 요청을 버려 크레딧만 쓰였다.
// wiki/거버넌스/결정.md ADR(구조 초안 생성이 프록시 제한 시간을 넘는다) 옵션2를 적용한다:
// POST는 접수만(짧은 타임아웃), 실제 생성·결과는 GET job이 폴링으로 가져온다.
//
// 2026-10-02 독립 리뷰 반영: hfRun mock이 손으로 쓴 stub JSON 대신 레포 픽스처
// (tests/fixtures/higgsfield/*.json — 컨트롤러가 실제 CLI 호출로 캡처)를 그대로 돌려준다.
const TENANT_A = "aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa";
const TENANT_B = "bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb";

const FIXTURE_DIR = path.join(__dirname, "fixtures", "higgsfield");
function fixture(name: string): string {
  return fs.readFileSync(path.join(FIXTURE_DIR, name), "utf8");
}

const H = vi.hoisted(() => ({
  tenantId: "aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa" as string | null,
  createStdout: "",
  getStdout: "",
  readyError: "" as "" | "busy",
  getError: "" as "" | "busy",
  hfRunCalls: [] as Array<{ args: string[]; timeoutMs?: number }>,
}));

vi.mock("@/lib/tenant-auth", () => ({
  effectiveTenantId: vi.fn(async (_request: Request, fallback?: string | null) => fallback ?? H.tenantId),
}));
vi.mock("@/lib/tenant-context", async () => {
  const actual = await vi.importActual<typeof import("@/lib/tenant-context")>("@/lib/tenant-context");
  return { ...actual, runWithTenant: vi.fn((_t: string | null, cb: () => unknown) => cb()) };
});
vi.mock("@/lib/media-token", () => ({
  signMediaToken: vi.fn(() => "signed-token"),
  isSafeMediaFilename: vi.fn(() => true),
}));
vi.mock("@/lib/generator-aspect-ratio", () => ({ toGeneratorRatio: vi.fn((r: string) => r) }));
vi.mock("@/lib/storage", async () => {
  const actual = await vi.importActual<typeof import("@/lib/storage")>("@/lib/storage");
  return { ...actual, resolveGeneratedFile: vi.fn(() => "/tmp/base.png") };
});

vi.mock("@/lib/higgsfield", async () => {
  const actual = await vi.importActual<typeof import("@/lib/higgsfield")>("@/lib/higgsfield");
  return {
    ...actual,
    assertHiggsfieldReady: vi.fn(async () => {
      if (H.readyError === "busy") throw new actual.HiggsfieldBusyError();
    }),
    downloadTo: vi.fn(async () => 1),
    logGen: vi.fn(),
    recordMediaGenerationEvent: vi.fn(async () => {}),
    // hfRun은 두 번 불린다 — POST(create)와 GET job(get). 호출마다 들어온 인자·타임아웃을
    // 기록해 "create 호출에 --wait류 인자가 없고 짧은 타임아웃으로 실행된다"를 검증한다.
    hfRun: vi.fn(async (args: string[], timeoutMs?: number) => {
      H.hfRunCalls.push({ args, timeoutMs });
      if (args.includes("create")) return { stdout: H.createStdout, stderr: "" };
      if (H.getError === "busy") throw new actual.HiggsfieldBusyError();
      return { stdout: H.getStdout, stderr: "" };
    }),
  };
});

let root: string;
beforeEach(() => {
  root = fs.mkdtempSync(path.join(os.tmpdir(), "hf-async-"));
  process.env.DATA_DIR = root;
  H.tenantId = TENANT_A;
  // 기본값: 실물 "접수 완료, 아직 대기 중" 조합(create-image.json + get-image-pending.json).
  H.createStdout = fixture("create-image.json");
  H.getStdout = fixture("get-image-pending.json");
  H.hfRunCalls = [];
  H.readyError = "";
  H.getError = "";
  vi.resetModules();
});
afterEach(() => {
  fs.rmSync(root, { recursive: true, force: true });
  vi.restoreAllMocks();
});

async function postImage() {
  const { POST } = await import("@/app/api/higgsfield/image/route");
  return POST(new Request("http://internal.local/api/higgsfield/image", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ prompt: "a cat", tenant_id: TENANT_A }),
  }));
}

async function getJob(jobId: string, tenantId: string) {
  const { GET } = await import("@/app/api/higgsfield/job/[id]/route");
  return GET(
    new Request(`http://internal.local/api/higgsfield/job/${jobId}?tenant_id=${tenantId}`),
    { params: Promise.resolve({ id: jobId }) },
  );
}

describe("생성 접수(POST)는 --wait를 쓰지 않고 짧게 끝난다", () => {
  it("POST가 실물 create 응답(작업 id 배열)에서 jobId를 뽑아 즉시 반환한다(202)", async () => {
    const res = await postImage();
    const body = await res.json();
    expect(res.status).toBe(202);
    expect(body.ok).toBe(true);
    expect(typeof body.jobId).toBe("string");
  });

  it("generate create 호출 인자에 --wait류가 없고 명시적으로 짧은 타임아웃(<=60초)으로 실행된다", async () => {
    await postImage();
    const createCall = H.hfRunCalls.find((c) => c.args.includes("create"));
    expect(createCall).toBeTruthy();
    expect(createCall!.args).not.toContain("--wait");
    expect(createCall!.args).not.toContain("--wait-timeout");
    expect(createCall!.timeoutMs).toBeDefined();
    expect(createCall!.timeoutMs!).toBeLessThanOrEqual(60000);
  });

  it("잠금 경합은 내부 명령을 노출하지 않고 GENERATOR_BUSY 503으로 답한다", async () => {
    H.readyError = "busy";
    const res = await postImage();
    const body = await res.json();
    expect(res.status).toBe(503);
    expect(body.code).toBe("GENERATOR_BUSY");
    expect(body.error).not.toMatch(/Command failed|run-higgsfield-locked|credentials\.json/);
  });
});

describe("GET job — 실물 대기 중 응답은 완료로 오판되지 않는다", () => {
  it("이미지가 아직 in_progress면 status:queued로 답하고 완료 처리(다운로드)를 하지 않는다", async () => {
    H.getStdout = fixture("get-image-pending.json"); // status: in_progress, params.style.url(견본)만 있음
    const postRes = await postImage();
    const { jobId } = await postRes.json();

    const { downloadTo } = await import("@/lib/higgsfield");
    const res = await getJob(jobId, TENANT_A);
    const body = await res.json();
    expect(res.status).toBe(200);
    expect(body.ok).toBe(true);
    expect(body.status).toBe("queued");
    expect(downloadTo).not.toHaveBeenCalled();
  });

  it("잠금 경합은 작업을 실패로 확정하지 않고 GENERATOR_BUSY 503으로 재시도시킨다", async () => {
    const postRes = await postImage();
    const { jobId } = await postRes.json();
    H.getError = "busy";
    const res = await getJob(jobId, TENANT_A);
    const body = await res.json();
    expect(res.status).toBe(503);
    expect(body.code).toBe("GENERATOR_BUSY");
    const { readHiggsfieldJob } = await import("@/lib/higgsfield-jobs");
    expect(readHiggsfieldJob(TENANT_A, jobId)?.status).toBe("queued");
  });

  it("영상이 아직 in_progress(바탕 그림 webp 포함)여도 실패로 확정되지 않는다", async () => {
    H.getStdout = fixture("get-video-pending.json");
    const postRes = await postImage();
    const { jobId } = await postRes.json();

    const res = await getJob(jobId, TENANT_A);
    const body = await res.json();
    expect(res.status).toBe(200);
    expect(body.ok).toBe(true);
    expect(body.status).toBe("queued");
    expect(res.status).not.toBe(503);
  });

  it("완료되면 result_url(원본)을 다운로드해 저장한다 — min_result_url(썸네일)이 아니다", async () => {
    H.getStdout = fixture("get-image-done.json");
    const postRes = await postImage();
    const { jobId } = await postRes.json();

    const { downloadTo } = await import("@/lib/higgsfield");
    const res = await getJob(jobId, TENANT_A);
    const body = await res.json();
    expect(res.status).toBe(200);
    expect(body.ok).toBe(true);
    const doneFixture = JSON.parse(fixture("get-image-done.json")) as { result_url: string; min_result_url: string };
    const downloadedUrl = (downloadTo as unknown as { mock: { calls: unknown[][] } }).mock.calls[0][0];
    expect(downloadedUrl).toBe(doneFixture.result_url);
    expect(downloadedUrl).not.toBe(doneFixture.min_result_url);
  });
});

describe("GET job 상태 조회의 멱등성", () => {
  it("완료 처리는 한 번만 일어난다(두 번째 조회는 다운로드를 다시 하지 않는다)", async () => {
    H.getStdout = fixture("get-image-done.json");
    const postRes = await postImage();
    const { jobId } = await postRes.json();

    const { downloadTo } = await import("@/lib/higgsfield");
    const first = await getJob(jobId, TENANT_A);
    const firstBody = await first.json();
    expect(first.status).toBe(200);
    expect(firstBody.ok).toBe(true);
    expect(downloadTo).toHaveBeenCalledTimes(1);

    const second = await getJob(jobId, TENANT_A);
    const secondBody = await second.json();
    expect(secondBody).toEqual(firstBody);
    expect(downloadTo).toHaveBeenCalledTimes(1);
    const getCalls = H.hfRunCalls.filter((c) => c.args.includes("get"));
    expect(getCalls.length).toBe(1);
  });

  it("동시(병렬) 2회 조회에도 완료 후처리는 한 번만 일어난다 — processing 락이 없으면 이 테스트가 실패해야 한다", async () => {
    H.getStdout = fixture("get-image-done.json");
    const postRes = await postImage();
    const { jobId } = await postRes.json();

    const { downloadTo } = await import("@/lib/higgsfield");
    const [r1, r2] = await Promise.all([getJob(jobId, TENANT_A), getJob(jobId, TENANT_A)]);
    await Promise.all([r1.json(), r2.json()]);
    // 락이 없다면 두 요청이 거의 동시에 "진행 중 아님"을 보고 둘 다 hfRun get + downloadTo를
    // 부른다. 락이 있으면 하나는 처리하고 하나는 processing 응답만 받는다.
    expect(downloadTo).toHaveBeenCalledTimes(1);
    const getCalls = H.hfRunCalls.filter((c) => c.args.includes("get"));
    expect(getCalls.length).toBe(1);
  });
});

describe("GET job — processing 락 만료(죽은 락 회수)", () => {
  it("processing으로 찍힌 지 5분 넘은 작업은 다시 조회를 시도한다", async () => {
    H.getStdout = fixture("get-image-done.json");
    const postRes = await postImage();
    const { jobId } = await postRes.json();

    const { readHiggsfieldJob, writeHiggsfieldJob } = await import("@/lib/higgsfield-jobs");
    const record = readHiggsfieldJob(TENANT_A, jobId);
    expect(record).toBeTruthy();
    // 죽은 락을 흉내낸다: processing으로 찍혔는데 6분 전에 멈췄다(서버가 죽었거나 예외로
    // 응답 없이 끝난 경우).
    writeHiggsfieldJob({ ...record!, status: "processing", updatedAt: Date.now() - 6 * 60 * 1000 });

    const { downloadTo } = await import("@/lib/higgsfield");
    const res = await getJob(jobId, TENANT_A);
    const body = await res.json();
    expect(res.status).toBe(200);
    expect(body.ok).toBe(true); // 완료 처리까지 실제로 진행됐다 — "아직 진행 중"에 갇히지 않았다.
    expect(downloadTo).toHaveBeenCalledTimes(1);
    const getCalls = H.hfRunCalls.filter((c) => c.args.includes("get"));
    expect(getCalls.length).toBe(1);
  });

  it("5분 안쪽의 processing은 여전히 락으로 존중한다(회귀 없음)", async () => {
    const postRes = await postImage();
    const { jobId } = await postRes.json();
    const { readHiggsfieldJob, writeHiggsfieldJob } = await import("@/lib/higgsfield-jobs");
    const record = readHiggsfieldJob(TENANT_A, jobId);
    writeHiggsfieldJob({ ...record!, status: "processing", updatedAt: Date.now() - 1000 });

    const { downloadTo } = await import("@/lib/higgsfield");
    const res = await getJob(jobId, TENANT_A);
    const body = await res.json();
    expect(body.status).toBe("processing");
    expect(downloadTo).not.toHaveBeenCalled();
  });
});

describe("타 테넌트 jobId 조회는 404로 거부한다", () => {
  it("다른 테넌트가 만든 작업을 조회하면 존재를 알리지 않고 404", async () => {
    const postRes = await postImage();
    const { jobId } = await postRes.json();

    const res = await getJob(jobId, TENANT_B);
    expect(res.status).toBe(404);
    const body = await res.json();
    expect(body.ok).toBeUndefined();
    expect(body.error).toBeTruthy();
  });
});
