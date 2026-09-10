import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

// 2026-09-08 회장 실사용 재발 방지.
// ① "이번 달 생성" 을 누른 다음 "학습 정보" 를 누르니 생성 이력 판이 학습 정보를 덮어
//    아무것도 못 했다. 머리줄에서 여는 판들이 같은 자리에 겹쳐 뜨는데 서로를 몰라서,
//    덮인 쪽은 닫을 수도 없었다.
// ② 발행실에서 쇼츠·릴스의 "계정 관리" 를 누르면 "알 수 없는 채널: shorts" 만 떴다.
//    계정 조회는 이미 제공자(YouTube·Instagram)로 바꿔 부르는데 링크만 미리보기 이름을
//    그대로 붙이고 있었다. /channels/shorts 라는 화면은 없다.
const src = readFileSync(resolve(__dirname, "../../src/app/studio/page.tsx"), "utf8");

describe("작업실 머리줄", () => {
  it("판을 하나 열면 다른 판을 닫는다", () => {
    expect(src).toContain("setShowUsageHistory(false); setShowWorks((value) => !value)");
    expect(src).toContain("setShowWorks(false); setShowUsageHistory((open) => !open)");
    // 학습 정보를 열 때도 덮고 있던 판을 치운다.
    expect(src).toContain("setShowUsageHistory(false); setShowWorks(false); setShowWizard(true)");
  });

  it("채널 화면 주소를 미리보기 이름이 아니라 제공자 이름으로 만든다", () => {
    expect(src).toContain("function channelHref(");
    expect(src).toContain("VIDEO_ACCOUNT_PROVIDER[platform] || platform");
    // 미리보기 이름을 그대로 붙이던 옛 방식이 남아 있으면 또 "알 수 없는 채널" 이 뜬다.
    expect(src).not.toContain("href={`/channels/${platform}`}");
  });
});
