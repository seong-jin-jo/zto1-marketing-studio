import { describe, expect, it } from "vitest";
import { publishableTargets } from "@/lib/studio/publish-connected-targets";

// 2026-10-01 재리뷰 BLOCK: 1차 결함3 수정(connectedOnlyTargets 도입)이 새 회귀를 만들었다.
// studio/page.tsx 의 "전부 고르기" 버튼·선택 카운트 알림·비활성 비교가 connectedTargets
// (순수 연결 여부)를 그대로 썼다. 그래서 연결은 3곳(X·TikTok·Threads)인데 그중 X·TikTok 이
// "영상 없음" 으로 지금 발행 불가여도 버튼이 "연결된 3곳을 모두 골랐습니다"라고 알리며
// 실제로는 Threads 1곳만 선택됐다.
//
// 고침: "전부 고르기"·선택 카운트·비활성 비교는 반드시 publishableTargets(연결 + 지금
// 발행 가능, disabledReason 없음) 를 써야 한다. connectedOnlyTargets(순수 연결 여부)는
// "아직 연결 안 된 곳" 문구에만 남는다. 이 파일은 그 publishableTargets 함수 자체를
// 검증한다 — 수정 전 커밋(eacfea37)에는 이 export 가 없어 import 단계에서 실패한다
// (git show eacfea37:dashboard/src/lib/studio/publish-connected-targets.ts 로 확인 가능).
describe("발행실 '전부 고르기'는 지금 발행 가능한 채널만 고른다", () => {
  it("연결 3곳 중 2곳이 발행 불가면 전부고르기 대상은 1곳뿐이다", () => {
    const readiness = new Map([
      ["x", { connected: true, disabledReason: "발행할 영상이 아직 없습니다." }],
      ["tiktok", { connected: true, disabledReason: "발행할 영상이 아직 없습니다." }],
      ["threads", { connected: true }],
    ]);
    const targets = publishableTargets(readiness);
    expect(targets).toEqual(["threads"]);
    expect(targets.length).not.toBe(3); // "연결된 3곳을 모두 골랐습니다" 거짓 알림 재발 방지
  });

  it("연결됐고 발행 불가 사유가 없는 채널은 전부 포함된다", () => {
    const readiness = new Map([
      ["x", { connected: true }],
      ["threads", { connected: true }],
      ["facebook", { connected: false }],
    ]);
    expect(publishableTargets(readiness).sort()).toEqual(["threads", "x"]);
  });

  it("발행 가능한 채널이 하나도 없으면 빈 배열이다", () => {
    const readiness = new Map([
      ["x", { connected: true, disabledReason: "본문을 아직 못 채웠습니다." }],
      ["threads", { connected: false }],
    ]);
    expect(publishableTargets(readiness)).toEqual([]);
  });
});
