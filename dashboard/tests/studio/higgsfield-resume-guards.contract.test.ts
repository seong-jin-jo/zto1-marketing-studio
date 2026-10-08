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
  // 2026-10-02 server-side finalize 보강: 복구 로직이 resumePendingJobs 콜백으로 옮겨가고
  // 그 abort는 바로 뒤 useEffect의 cleanup이 맡는다 — 그 cleanup까지 포함되도록 범위를
  // 두 번째 useEffect 선언 전까지 넓힌다(첫 번째는 resumePendingJobs 정의 안의
  // Promise.allSettled일 수 있으므로).
  const firstUseEffect = pageSrc.indexOf("useEffect(() => {", start + 1);
  const secondUseEffect = pageSrc.indexOf("useEffect(() => {", firstUseEffect + 1);
  const end = secondUseEffect > firstUseEffect ? secondUseEffect : start + 2600;
  return pageSrc.slice(Math.max(0, start - 600), end);
}

describe("복구 폴링 가드 1 — 언마운트/재전환 시 abort", () => {
  it("복구 effect의 cleanup이 복구 전용 AbortController를 abort한다", () => {
    const body = sliceResumeEffect();
    // 일반 생성과 복구 폴링을 모두 끊는 순서로 확장돼도 복구 전용 abort 보호는 유지한다.
    expect(body).toMatch(/return \(\) => \{[\s\S]*?resumePollAbort\.current\?\.abort\(\);/);
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
