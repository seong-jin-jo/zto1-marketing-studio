// 2026-10-02 독립 리뷰 MINOR-a: POST /api/video/publish는 effectiveTenantId를 항상
// fallback=null로 호출한다(운영자는 공유 루트에 저장, route.ts: `effectiveTenantId(request,
// null)`). GET job/[id]는 쿼리스트링의 tenant_id를 fallback으로 썼는데, 운영자가 활성
// 작업공간을 들고 있으면(= 쿼리에 그 workspace id가 실림) GET이 POST와 다른 테넌트 폴더를
// 봐서 "작업을 찾지 못했습니다"(404)로 거짓 실패가 났다. operator 경로를 흉내 낸 mock으로
// 이 불일치를 재현한다(실제 effectiveTenantId의 "운영자 토큰 매치 → fallback || null" 분기).
//
// POST의 전체 reels/youtube 발행 검증 체인을 다시 거치지 않고, "POST가 저장한 테넌트
// 컨텍스트"를 createVideoPublishJob(runWithTenant(null, ...)) 으로 직접 재현해 GET만
// 좁혀서 검증한다 — 이 버그는 POST 쪽 로직과 무관하게 순수히 "GET이 어떤 fallback을
// 쓰느냐"에서만 난다.
import fs from "fs";
import os from "os";
import path from "path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const H = vi.hoisted(() => ({
  // 실제 effectiveTenantId의 운영자 분기(`return fallback || null`)를 그대로 흉내낸다.
  effectiveTenantId: vi.fn(async (_req: Request, fallback?: string | null) => fallback || null),
}));

vi.mock("@/lib/tenant-auth", () => ({ effectiveTenantId: H.effectiveTenantId }));

let tmpRoot: string;
beforeEach(() => {
  tmpRoot = fs.mkdtempSync(path.join(os.tmpdir(), "hf-tenant-consistency-"));
  process.env.DATA_DIR = tmpRoot;
  H.effectiveTenantId.mockClear();
  vi.resetModules();
});
afterEach(() => {
  fs.rmSync(tmpRoot, { recursive: true, force: true });
});

describe("video/publish job 조회 — 운영자 테넌트 일관성", () => {
  it("POST가 쓴 fallback=null 컨텍스트에 접수된 작업을, 운영자가 활성 작업공간 id를 쿼리에 실어 GET해도 그대로 찾는다", async () => {
    const { createVideoPublishJob } = await import("@/lib/video-publish-jobs");
    const { runWithTenant } = await import("@/lib/tenant-context");
    // POST가 실제로 하는 것: effectiveTenantId(request, null) → 운영자면 null → 그 컨텍스트
    // 안에서 작업을 만든다.
    const job = await runWithTenant(null, async () =>
      createVideoPublishJob("job-operator-1", { platform: "reels", filename: "clip.mp4" }));

    // 운영자가 활성 작업공간("ws-active")을 들고 있어 GET 쿼리에 그 id가 실린 상황.
    const { GET } = await import("@/app/api/video/publish/job/[id]/route");
    const getRes = await GET(
      new Request(`http://internal.local/api/video/publish/job/${job.jobId}?tenant_id=ws-active`),
      { params: Promise.resolve({ id: job.jobId }) },
    );
    expect(getRes.status).not.toBe(404);
    const body = await getRes.json();
    expect(body.error).not.toBe("작업을 찾을 수 없습니다.");

    // GET이 실제로 fallback=null을 썼는지(쿼리의 "ws-active"를 무시했는지) 직접 확인한다.
    const getCall = H.effectiveTenantId.mock.calls[H.effectiveTenantId.mock.calls.length - 1];
    expect(getCall[1]).toBeNull();
  });
});
