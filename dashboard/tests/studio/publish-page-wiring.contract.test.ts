import { describe, expect, it } from "vitest";
import fs from "fs";
import path from "path";

// 2026-10-01 재재리뷰: 결함3·전부고르기 테스트(publish-connected-source-unified,
// publish-select-all-excludes-unpublishable)는 publish-connected-targets.ts 의 함수
// 자체만 단위 검사한다. studio/page.tsx 안에서 어느 자리에 어느 함수를 쓰는지는 전혀
// 보지 않아서, page.tsx의 배선을 되돌려도(예: "전부 고르기"에 connectedOnlyTargets를
// 다시 쓰거나, "아직 연결 안 된 곳" 문구에 publishableTargets를 쓰게 바꿔도) 계속
// 초록이다. 그래서 소스 배선 자체를 계약으로 고정한다(같은 파일의 create-room-wiring
// 계약과 같은 기법 — "함수는 맞는데 페이지가 안 이었다"를 못 잡는 문제를 해결).
const pageSrc = fs.readFileSync(path.resolve(__dirname, "../../src/app/studio/page.tsx"), "utf8");

function sliceFrom(marker: string, length = 600): string {
  const index = pageSrc.indexOf(marker);
  if (index === -1) throw new Error(`marker not found in page.tsx: ${marker}`);
  return pageSrc.slice(index, index + length);
}

describe("발행실 연결/발행가능 판정 배선 계약", () => {
  it("PUBLISH-WIRING-01: '전부 고르기' 선택 대상은 publishableTargets다", () => {
    const body = sliceFrom("function selectAllChannels()");
    expect(body, "전부 고르기가 publishableTargets를 안 쓴다").toMatch(/publishableTargets\.map|publishableTargets\.length/);
    expect(body, "전부 고르기가 순수 연결 집합(connectedTargets)을 쓰면 안 된다").not.toMatch(/connectedTargets\.(map|length)/);
  });

  it("PUBLISH-WIRING-02: 선택 카운트 알림은 publishableTargets.length를 쓴다", () => {
    const body = sliceFrom("function selectAllChannels()");
    expect(body, "알림 문구가 publishableTargets.length를 안 쓴다").toContain("발행 가능한 ${publishableTargets.length}곳을 모두 골랐습니다");
  });

  it("PUBLISH-WIRING-03: '전부 고르기' 버튼 비활성 조건은 publishableTargets 기준이다", () => {
    const body = sliceFrom('data-testid="publish-bulk-select-all"', 400);
    expect(body, "버튼 disabled가 publishableTargets를 안 쓴다").toMatch(/disabled=\{!accountsLoaded \|\| publishableTargets\.length === 0\}/);
  });

  it("PUBLISH-WIRING-04: '아직 연결 안 된 곳' 문구는 connectedTargets(순수 연결 여부)를 쓴다", () => {
    // "아직 연결 안 된 곳:" 은 주석에도 한 번 나온다(2026-10-01 리뷰 설명) — 실제 JSX
    // 문구(마지막 등장)를 봐야 한다.
    const index = pageSrc.lastIndexOf("아직 연결 안 된 곳:");
    const context = pageSrc.slice(Math.max(0, index - 400), index + 200);
    expect(context, "'아직 연결 안 된 곳' 판정이 connectedTargets를 안 쓴다").toMatch(/connectedTargets\.length < bulkTargets\.length/);
    expect(context, "'아직 연결 안 된 곳' 필터가 connectedTargets.includes 를 안 쓴다").toMatch(/!connectedTargets\.includes\(platform\)/);
    expect(context, "'아직 연결 안 된 곳' 판정에 publishableTargets가 섞이면 안 된다").not.toMatch(/publishableTargets\.length < bulkTargets\.length/);
  });

  it("PUBLISH-WIRING-05: connectedTargets 정의는 connectedOnlyTargets(순수 연결)에서 온다", () => {
    const body = sliceFrom("const connectedTargets =", 80);
    expect(body).toMatch(/const connectedTargets = connectedOnlyTargets\(channelReadiness\)/);
  });

  it("PUBLISH-WIRING-06: publishableTargets 정의는 disabledReason 있는 채널을 뺀다", () => {
    const body = sliceFrom("const publishableTargets =", 100);
    expect(body).toMatch(/const publishableTargets = computePublishableTargets\(channelReadiness\)/);
  });
});
