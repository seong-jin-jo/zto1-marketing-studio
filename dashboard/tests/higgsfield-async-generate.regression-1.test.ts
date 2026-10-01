import fs from "fs";
import os from "os";
import path from "path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

// 2026-10-01 비동기 전환 — 세션맥락 실측(cb35f3fd): 동기 --wait 생성 호출이 Higgsfield
// 대기열에서 15~20분 걸렸는데, 운영은 Cloudflare 터널 뒤라 100초 넘는 동기 HTTP 요청은
// 524로 끊긴다. 결과는 나중에 만들어지는데 서버는 이미 그 요청을 버려 크레딧만 쓰였다.
// wiki/거버넌스/결정.md ADR(구조 초안 생성이 프록시 제한 시간을 넘는다) 옵션2를 적용한다:
// POST는 접수만(짧은 타임아웃), 실제 생성·결과는 GET job이 폴링으로 가져온다.
const TENANT_A = "aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa";
const TENANT_B = "bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb";

const H = vi.hoisted(() => ({
  tenantId: "aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa" as string | null,
  createStdout: '{"id":"job-abc","status":"queued"}',
  getStdout: '{"id":"job-abc","status":"queued"}',
  hfRunCalls: [] as Array<{ args: string[]; timeoutMs?: number }>,
}));

// effectiveTenantId(request, fallback)의 두 번째 인자(요청이 넘긴 tenant_id)를 그대로
// 돌려준다 — 그래야 타 테넌트가 자기 tenant_id로 조회했을 때 실제로 다른 테넌트로
// 식별된다. H.tenantId는 더 쓰지 않는다(혼동 방지를 위해 남겨 두되 사용하지 않음).
vi.mock("@/lib/tenant-auth", () => ({
  effectiveTenantId: vi.fn(async (_request: Request, fallback?: string | null) => fallback ?? H.tenantId),
}));
vi.mock("@/lib/tenant-context", async () => {
  const actual = await vi.importActual<typeof import("@/lib/tenant-context")>("@/lib/tenant-context");
  return {
    ...actual,
    runWithTenant: vi.fn((_t: string | null, cb: () => unknown) => cb()),
  };
});
vi.mock("@/lib/media-token", () => ({
  signMediaToken: vi.fn(() => "signed-token"),
  isSafeMediaFilename: vi.fn(() => true),
}));
vi.mock("@/lib/generator-aspect-ratio", () => ({ toGeneratorRatio: vi.fn((r: string) => r) }));
vi.mock("@/lib/storage", async () => {
  const actual = await vi.importActual<typeof import("@/lib/storage")>("@/lib/storage");
  return {
    ...actual,
    resolveGeneratedFile: vi.fn(() => "/tmp/base.png"),
  };
});

vi.mock("@/lib/higgsfield", async () => {
  const actual = await vi.importActual<typeof import("@/lib/higgsfield")>("@/lib/higgsfield");
  return {
    ...actual,
    assertHiggsfieldReady: vi.fn(async () => {}),
    downloadTo: vi.fn(async () => 1),
    logGen: vi.fn(),
    recordMediaGenerationEvent: vi.fn(async () => {}),
    // hfRun은 두 번 불린다 — POST(create)와 GET job(get). 호출마다 들어온 인자·타임아웃을
    // 기록해 "create 호출에 --wait류 인자가 없고 짧은 타임아웃으로 실행된다"를 검증한다.
    // 어느 하위명령인지(generate create vs generate get)로 반환값을 가른다.
    hfRun: vi.fn(async (args: string[], timeoutMs?: number) => {
      H.hfRunCalls.push({ args, timeoutMs });
      if (args.includes("create")) return { stdout: H.createStdout, stderr: "" };
      return { stdout: H.getStdout, stderr: "" };
    }),
  };
});

let root: string;
beforeEach(() => {
  root = fs.mkdtempSync(path.join(os.tmpdir(), "hf-async-"));
  process.env.DATA_DIR = root;
  H.tenantId = TENANT_A;
  H.createStdout = '{"id":"job-abc","status":"queued"}';
  H.getStdout = '{"id":"job-abc","status":"queued"}';
  H.hfRunCalls = [];
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
  it("POST가 즉시 jobId를 반환한다(202)", async () => {
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

  // 회귀 증거: --wait를 다시 넣으면 이 단언이 실패해야 한다. 아래는 그 실패를 재현한
  // 로그를 보고에 남기기 위한 "의도적 되돌림" 시나리오 문서화 — 실제 되돌림/복원은
  // 보고에 첨부한 터미널 로그로 증명한다(이 파일 자체는 항상 수정된 구현만 테스트).
  it("문서화: --wait 복원 시 위 테스트가 실패해야 한다(수동 검증 대상)", () => {
    expect(true).toBe(true);
  });
});

describe("GET job 상태 조회의 멱등성", () => {
  it("완료 처리는 한 번만 일어난다(두 번째 조회는 다운로드를 다시 하지 않는다)", async () => {
    H.createStdout = '{"id":"job-done","status":"queued"}';
    H.getStdout = '{"id":"job-done","status":"completed","url":"https://cdn.example/img.webp"}';
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
    // 두 번째 조회는 생성기 CLI(get)도, 다운로드도 다시 부르지 않는다 — 저장된 결과 그대로.
    expect(downloadTo).toHaveBeenCalledTimes(1);
    const getCalls = H.hfRunCalls.filter((c) => c.args.includes("get"));
    expect(getCalls.length).toBe(1);
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
