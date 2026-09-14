import { describe, expect, it } from "vitest";
import {
  HASHTAG_BUDGET,
  hashtagsForPlatform,
  parseHashtags,
  parsePublishCommand,
  spreadHashtags,
  trimAllOverLimit,
  trimOverLimit,
  type BulkPlatform,
} from "@/lib/studio/publish-bulk";

const ALL: BulkPlatform[] = ["threads", "x", "facebook", "instagram", "shorts", "reels", "tiktok"];

describe("해시태그 한 벌 나누기", () => {
  it("표기가 섞여 있어도 낱말만 뽑고 중복을 지운다", () => {
    expect(parseHashtags("#OSMU, 콘텐츠  #자동화 #OSMU")).toEqual(["OSMU", "콘텐츠", "자동화"]);
  });

  it("빈 입력은 빈 배열이다", () => {
    expect(parseHashtags("")).toEqual([]);
    expect(parseHashtags("  #  ")).toEqual([]);
  });

  it("플랫폼마다 관습이 다른 개수로 잘린다", () => {
    const tags = ["가", "나", "다", "라", "마", "바"];
    expect(hashtagsForPlatform(tags, "x")).toBe("#가 #나");
    expect(hashtagsForPlatform(tags, "instagram")).toBe("#가 #나 #다");
    expect(hashtagsForPlatform(tags, "threads")).toBe("#가 #나 #다 #라 #마");
  });

  it("일곱 자리 전부에 규격대로 퍼진다", () => {
    const spread = spreadHashtags("#가 #나 #다 #라 #마 #바", ALL);
    expect(Object.keys(spread).sort()).toEqual([...ALL].sort());
    for (const platform of ALL) {
      expect(spread[platform].split(" ").filter(Boolean).length)
        .toBeLessThanOrEqual(HASHTAG_BUDGET[platform]);
    }
  });

  it("태그가 예산보다 적으면 있는 만큼만 붙는다", () => {
    expect(spreadHashtags("#하나", ALL).threads).toBe("#하나");
  });
});

describe("한도 넘긴 곳만 줄이기", () => {
  it("한도 안이면 손대지 않는다", () => {
    expect(trimOverLimit("짧은 글", "x")).toBeNull();
  });

  it("한도를 넘기면 줄임표를 남기고 한도에 맞춘다", () => {
    const long = "가".repeat(300);
    const trimmed = trimOverLimit(long, "x");
    expect(trimmed).not.toBeNull();
    expect([...(trimmed as string)]).toHaveLength(280);
    expect(trimmed?.endsWith("…")).toBe(true);
  });

  it("한도가 없는 자리는 건너뛴다", () => {
    expect(trimOverLimit("가".repeat(5000), "shorts")).toBeNull();
  });

  it("여러 자리 중 넘긴 곳만 결과에 담긴다", () => {
    const body = "가".repeat(400);
    const next = trimAllOverLimit(() => body, ALL);
    // x(280)만 넘고 threads(500)·facebook·instagram은 여유가 있다.
    expect(Object.keys(next)).toEqual(["x"]);
  });

  it("바뀔 것이 없으면 빈 객체다", () => {
    expect(trimAllOverLimit(() => "짧다", ALL)).toEqual({});
  });
});

describe("대화창 자유 입력 해석", () => {
  const cases: [string, string][] = [
    ["전부 올려", "selectAll"],
    ["일곱 곳 다 선택해줘", "selectAll"],
    ["전체 해제", "clearAll"],
    ["X 만 빼고 올려", "exclude"],
    ["인스타 빼줘", "exclude"],
    ["해시태그 세 개로 통일", "unifyHashtags"],
    ["길이 넘는 곳만 줄여", "trimOverLimit"],
    ["내일 아침 8시로 예약", "schedule"],
    ["먼저 검토받을게", "requestReview"],
    ["임시 저장해줘", "saveDraft"],
    ["지금 발행", "publishNow"],
  ];
  it.each(cases)("%s → %s", (input, kind) => {
    expect(parsePublishCommand(input).kind).toBe(kind);
  });

  it("플랫폼 이름을 함께 돌려준다", () => {
    const parsed = parsePublishCommand("스레드 빼고 올려");
    expect(parsed).toEqual({ kind: "exclude", platform: "threads" });
  });

  it("알아듣지 못한 말은 정직하게 unknown이다", () => {
    expect(parsePublishCommand("오늘 날씨 어때").kind).toBe("unknown");
    expect(parsePublishCommand("").kind).toBe("unknown");
  });

  it("PUB-ACCOUNT-02 거절: 읽기 전용 계정 이름 변경 명령은 실행 계약으로 해석하지 않는다", () => {
    expect(parsePublishCommand("표시 이름 맞춰줘")).toEqual({ kind: "unknown" });
  });
});
