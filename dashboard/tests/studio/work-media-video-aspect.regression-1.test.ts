import { describe, expect, it } from "vitest";
import { decideVideoRequest, isReusableVideoBaseImage } from "@/lib/studio/work-media";

// 2026-09-16 실측(j.the.great.investor): 숏폼 영상이 768x768 정사각형으로 나왔다(카드뉴스
// 대표 이미지 1536x1536 정사각형을 그대로 움직인 것). DESIGN.md 는 영상을 9:16 세로로
// 못박았다. /api/higgsfield/video 는 image→video 라 결과 비율이 바탕 그림을 따라간다 —
// 그래서 바탕 그림이 1:1이면 영상도 1:1이 된다. 원인은 decideVideoRequest 가 "주제가
// 같은가"만 보고 재사용을 허락해, 카드뉴스용 1:1 대표 이미지를 영상 바탕으로도 재사용한
// 것이다. 비율까지 확인해야 한다.
describe("영상 바탕 그림 재사용은 9:16 일 때만 허용한다", () => {
  it("1:1 대표 이미지는 주제가 같아도 영상 바탕으로 재사용하지 않는다", () => {
    const img = { topicKey: "카페 오픈 이벤트", aspectRatio: "1:1" as const };
    expect(isReusableVideoBaseImage(img, "카페 오픈 이벤트")).toBe(false);
  });

  it("9:16 이미지는 주제가 같으면 영상 바탕으로 재사용한다", () => {
    const img = { topicKey: "카페 오픈 이벤트", aspectRatio: "9:16" as const };
    expect(isReusableVideoBaseImage(img, "카페 오픈 이벤트")).toBe(true);
  });

  it("decideVideoRequest: 1:1 대표 이미지가 있으면 baseImage를 new로 정해 9:16으로 새로 만들게 한다", () => {
    const decision = decideVideoRequest({
      idea: "카페 오픈 이벤트",
      img: { topicKey: "카페 오픈 이벤트", aspectRatio: "1:1" },
      vid: null,
    });
    expect(decision.baseImage).toBe("new");
  });

  it("decideVideoRequest: 이미 9:16으로 만든 그림은 재사용한다(중복 과금 방지)", () => {
    const decision = decideVideoRequest({
      idea: "카페 오픈 이벤트",
      img: { topicKey: "카페 오픈 이벤트", aspectRatio: "9:16" },
      vid: null,
    });
    expect(decision.baseImage).toBe("reuse");
  });

  it("비율 도장이 없는 옛 작업물(도입 전)은 안전 쪽으로 새로 만든다", () => {
    const decision = decideVideoRequest({
      idea: "카페 오픈 이벤트",
      img: { topicKey: "카페 오픈 이벤트" },
      vid: null,
    });
    expect(decision.baseImage).toBe("new");
  });
});
