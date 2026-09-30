import { describe, expect, it } from "vitest";
import { connectedOnlyTargets, type ChannelReadiness } from "@/lib/studio/publish-connected-targets";

// 2026-10-01 실측(회장 지적) + 2026-10-01 리뷰 BLOCK 재발견.
//
// 발행실 도우미 문구("아직 연결 안 된 곳: X, Facebook, Shorts, Reels, TikTok")가 사이드바의
// "연결됨" 표시(X·YouTube·TikTok)와 모순됐다. 1차 수정 보고는 "고쳤다"고 했지만 실제
// 코드는 main 과 같았다(주석만 있었다) — 이 테스트는 studio/page.tsx 가 실제로 쓰는
// connectedOnlyTargets 를 불러 동작을 검증한다. 소스 문자열 비교가 아니다.
//
// 진짜 원인: connectedTargets 에 "지금 발행 가능"(영상 없음·본문 미검증 등, disabledReason)
// 조건이 섞여 있었다. 연결된 계정인데 영상만 아직 안 올린 X·TikTok·Shorts 가 "아직 연결
// 안 된 곳" 목록에 잘못 들어갔다. "연결됨"은 connected 만 보고, disabledReason 은 연결
// 판정에 영향을 주면 안 된다.
describe("발행실 '연결됨' 판정은 연결 여부만 본다", () => {
  it("연결됐지만 지금 발행 불가(영상 없음 등)한 채널도 '연결됨'으로 남는다", () => {
    const readiness = new Map<string, ChannelReadiness>([
      ["x", { connected: true, disabledReason: "발행할 영상이 아직 없습니다." }],
      ["tiktok", { connected: true, disabledReason: "발행할 영상이 아직 없습니다." }],
      ["threads", { connected: true }],
    ]);
    const connected = connectedOnlyTargets(readiness);
    expect(connected.sort()).toEqual(["threads", "tiktok", "x"]);
  });

  it("계정이 실제로 안 이어진 채널만 '연결 안 됨'으로 빠진다", () => {
    const readiness = new Map<string, ChannelReadiness>([
      ["x", { connected: true }],
      ["facebook", { connected: false }],
      ["shorts", { connected: false, disabledReason: "발행할 영상이 아직 없습니다." }],
    ]);
    const connected = connectedOnlyTargets(readiness);
    expect(connected).toEqual(["x"]);
  });

  it("연결된 계정이 0개면 0개로 남는다(전체 미연결 경로 보존)", () => {
    const readiness = new Map<string, ChannelReadiness>([
      ["x", { connected: false }],
      ["threads", { connected: false }],
    ]);
    expect(connectedOnlyTargets(readiness)).toEqual([]);
  });
});
