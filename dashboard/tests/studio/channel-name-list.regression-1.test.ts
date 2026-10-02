import { describe, expect, it } from "vitest";
import { channelNameList } from "@/lib/studio/channel-name-list";

// 2026-10-02 운영 사고(결함 D): 발행실 상단 배너와 "지금 발행" 버튼이 "선택한 1곳"처럼
// 숫자만 말해서, 미리보기 탭(보기 필터)에서 방금 Instagram 을 눌러 봐 놓고 실제로는
// 이전 세션에서 체크된 채 남아 있던 Threads 1곳이 발행 대상이라는 사실이 버튼 문구에서
// 전혀 드러나지 않았다. 컨트롤러가 "선택한 1곳에 지금 발행"을 눌러 Threads 에 실제로
// 게시해 버렸다. 고침 = 채널 이름을 그 자리에서 직접 말한다(channelNameList).
// 이 함수가 없던 커밋(수정 전)에는 이 import 자체가 실패한다.
describe("channelNameList — 발행 대상 채널 이름을 그 자리에서 밝힌다", () => {
  it("1곳이면 그 채널 이름을 그대로 말한다(숫자만 말하지 않는다)", () => {
    expect(channelNameList(["threads"])).toBe("Threads");
    // 핵심 회귀 조건: 미리보기에서 Instagram 을 보고 있어도 실제 선택이 Threads 면
    // 이름이 "Instagram"이 아니라 반드시 "Threads"로 나와야 한다.
    expect(channelNameList(["threads"])).not.toBe("Instagram");
  });

  it("2~3곳이면 쉼표로 전부 나열한다", () => {
    expect(channelNameList(["threads", "instagram"])).toBe("Threads, Instagram");
    expect(channelNameList(["threads", "instagram", "x"])).toBe("Threads, Instagram, X");
  });

  // 2026-10-03 독립 리뷰 MINOR-g: 종전에는 4곳을 넘으면 "4곳"처럼 숫자로 줄였는데,
  // 여러 채널에 동시 발행하는 **가장 헷갈리는 경우**에서 바로 이름을 감춰 사고를 막는
  // 효과가 가장 필요한 자리에서 가장 약했다. 이름은 항상 전부 나열한다(줄바꿈은 화면이
  // 처리).
  it("4곳을 넘어도 전부 나열한다 — 가장 헷갈리는 경우에서 이름을 감추지 않는다", () => {
    expect(channelNameList(["threads", "instagram", "x", "facebook"])).toBe("Threads, Instagram, X, Facebook");
    expect(channelNameList(["threads", "instagram", "x", "facebook", "shorts", "reels", "tiktok"]))
      .toBe("Threads, Instagram, X, Facebook, Shorts, Reels, TikTok");
  });

  it("선택이 없으면 빈 문자열이다", () => {
    expect(channelNameList([])).toBe("");
  });
});
