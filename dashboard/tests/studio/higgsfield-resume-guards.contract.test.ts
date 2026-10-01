import { describe, expect, it } from "vitest";
import fs from "fs";
import path from "path";

// 2026-10-02 독립 리뷰 MINOR — 새로고침 복구 폴링의 클라이언트 가드 3종이 소스에서
// 실제로 배선돼 있는지 확인한다. studio/page.tsx는 수십 개의 provider/상태에 묶여 있어
// 풀 마운트 테스트 비용이 크다 — 이 레포가 이미 쓰는 소스-그렙 계약 테스트 패턴
// (higgsfield-resume-aspect-ratio.contract.test.ts 등)을 그대로 따른다. 각 단언은
// 해당 가드를 제거하는 변이에 민감해야 한다(보고에 되돌림→실패 로그 첨부).
const pageSrc = fs.readFileSync(path.resolve(__dirname, "../../src/app/studio/page.tsx"), "utf8");

function sliceResumeEffect(): string {
  const start = pageSrc.indexOf("const pendingImg = readPendingJob(workspaceId");
  expect(start, "복구 effect를 찾지 못했다").toBeGreaterThanOrEqual(0);
  // 다음 useEffect 선언 전까지(이 effect의 끝 근방)만 본다.
  const next = pageSrc.indexOf("useEffect(() => {", start + 1);
  return pageSrc.slice(Math.max(0, start - 600), next > start ? next : start + 2200);
}

describe("복구 폴링 가드 1 — 언마운트/재전환 시 abort", () => {
  it("복구 effect의 cleanup이 그 effect 전용 controller를 abort한다", () => {
    const body = sliceResumeEffect();
    expect(body).toMatch(/return \(\) => \{\s*controller\.abort\(\);/);
  });
});

describe("복구 폴링 가드 2 — 복구 전용 signal 전달", () => {
  it("이미지 복구 호출이 복구 effect의 signal을 pollAndFinishImage에 넘긴다", () => {
    const body = sliceResumeEffect();
    expect(body).toMatch(/pollAndFinishImage\(\s*pendingImg\.jobId,\s*workspaceId,[^)]*\{\s*signal:\s*controller\.signal/);
  });
  it("영상 복구 호출이 복구 effect의 signal을 pollAndFinishVideo에 넘긴다", () => {
    const body = sliceResumeEffect();
    expect(body).toMatch(/pollAndFinishVideo\(\s*pendingVid\.jobId,\s*workspaceId,\s*\{\s*signal:\s*controller\.signal/);
  });
});

describe("복구 폴링 가드 3 — 작업공간 전환 가드", () => {
  it("pollAndFinishImage가 결과를 적용하기 전에 activeWorkspaceIdRef로 현재 작업공간을 확인한다", () => {
    const start = pageSrc.indexOf("async function pollAndFinishImage(");
    const end = pageSrc.indexOf("async function genImage(");
    const body = pageSrc.slice(start, end);
    expect(body).toMatch(/activeWorkspaceIdRef\.current !== tenantId/);
  });
  it("pollAndFinishVideo가 결과를 적용하기 전에 activeWorkspaceIdRef로 현재 작업공간을 확인한다", () => {
    const start = pageSrc.indexOf("async function pollAndFinishVideo(");
    const end = pageSrc.indexOf("async function genVideo(");
    const body = pageSrc.slice(start, end);
    expect(body).toMatch(/activeWorkspaceIdRef\.current !== tenantId/);
  });
});

describe("복구 폴링 가드 4 — 사용자 취소가 복구 폴링도 함께 끊는다(MINOR)", () => {
  it("cancelGeneration이 resumePollAbort도 abort한다", () => {
    const start = pageSrc.indexOf("function cancelGeneration()");
    const end = pageSrc.indexOf("}", start);
    const body = pageSrc.slice(start, end);
    expect(body).toMatch(/resumePollAbort\.current\?\.abort\(\)/);
  });
  it("discardCurrentWork(버리고 새로 시작)가 resumePollAbort도 abort한다", () => {
    const start = pageSrc.indexOf("async function discardCurrentWork(");
    const body = pageSrc.slice(start, start + 2000);
    expect(body).toMatch(/resumePollAbort\.current\?\.abort\(\)/);
  });
});
