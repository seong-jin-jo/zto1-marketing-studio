import { describe, expect, it } from "vitest";
import fs from "fs";
import path from "path";

// 2026-10-02 독립 리뷰 MAJOR 5a 재발 방지(소스 가드).
// higgsfield-poll.test.ts가 저장소 함수(savePendingJob/readPendingJob) 자체는 비율을
// 보존한다는 것을 증명하지만, studio/page.tsx가 그 값을 실제로 pollAndFinishImage에
// 넘기지 않고 하드코딩된 "9:16"을 다시 쓰면 저장소가 맞아도 화면 동작은 그대로
// 재발한다. 배선 자체를 소스에서 확인한다.
const pageSrc = fs.readFileSync(path.resolve(__dirname, "../../src/app/studio/page.tsx"), "utf8");

describe("새로고침 복구가 접수 시점 이미지 비율을 하드코딩하지 않는다", () => {
  it("복구 effect가 pendingImg.aspectRatio를 pollAndFinishImage에 넘긴다", () => {
    const effectStart = pageSrc.indexOf("const pendingImg = readPendingJob(workspaceId");
    expect(effectStart, "복구 effect를 찾지 못했다").toBeGreaterThanOrEqual(0);
    const effectBody = pageSrc.slice(effectStart, effectStart + 1500);
    expect(effectBody).toMatch(/pollAndFinishImage\(\s*pendingImg\.jobId,\s*workspaceId,\s*pendingImg\.aspectRatio/);
  });

  it("복구 effect 안에서 비율을 '9:16' 리터럴로 못박지 않는다(기본값 폴백은 허용)", () => {
    const effectStart = pageSrc.indexOf("const pendingImg = readPendingJob(workspaceId");
    const effectBody = pageSrc.slice(effectStart, effectStart + 1500);
    // pendingImg.aspectRatio ?? "9:16" 같은 "없을 때만 기본값" 폴백은 허용하지만,
    // pollAndFinishImage 호출에 리터럴 "9:16"을 직접 박아 넣는 회귀(저장된 값 무시)는 막는다.
    expect(effectBody).not.toMatch(/pollAndFinishImage\(pendingImg\.jobId,\s*workspaceId,\s*"9:16"/);
  });

  it("genImage가 접수 시 aspectRatio를 savePendingJob에 실어 보낸다(저장 배선)", () => {
    const genImageStart = pageSrc.indexOf("async function genImage(");
    expect(genImageStart).toBeGreaterThanOrEqual(0);
    const genImageBody = pageSrc.slice(genImageStart, genImageStart + 1500);
    expect(genImageBody).toMatch(/savePendingJob\([^)]*aspectRatio/);
  });
});
