import { describe, expect, it } from "vitest";
import { isChatToneCandidateList, parseChatToneSuggestionResponse } from "./chat-tone-suggestions";

describe("S5-AC3 말투 후보 응답 계약", () => {
  it("정상: 후보 3개의 줄 수와 사실 경고를 고정한다", () => {
    const candidates = parseChatToneSuggestionResponse(JSON.stringify({ candidates: [
      { id: "a", label: "후보 1", lines: ["9시간 공부했어요"] },
      { id: "b", label: "후보 2", lines: ["10시간 공부했어요"] },
      { id: "c", label: "후보 3", lines: ["9시간 학습했어요"] },
    ] }), ["9시간 공부했어요"]);
    expect(isChatToneCandidateList(candidates, 1)).toBe(true);
    expect(candidates[1].fact_warnings.join(" ")).toContain("9시간");
    expect(candidates[1].fact_warnings.join(" ")).toContain("10시간");
  });

  it("거절: 후보 수·중복 ID·줄 수·과대 문장을 계약 밖으로 내보내지 않는다", () => {
    expect(() => parseChatToneSuggestionResponse('{"candidates":[]}', ["원문"])).toThrow("CHAT_TONE_CANDIDATE_COUNT");
    expect(() => parseChatToneSuggestionResponse(JSON.stringify({ candidates: [
      { id: "same", label: "1", lines: ["가"] },
      { id: "same", label: "2", lines: ["나"] },
      { id: "c", label: "3", lines: ["다"] },
    ] }), ["원문"])).toThrow("CHAT_TONE_DUPLICATE_ID");
    expect(isChatToneCandidateList([
      { id: "a", label: "1", lines: ["가"], fact_warnings: [] },
      { id: "b", label: "2", lines: [], fact_warnings: [] },
      { id: "c", label: "3", lines: ["다"], fact_warnings: [] },
    ], 1)).toBe(false);
    expect(() => parseChatToneSuggestionResponse(JSON.stringify({ candidates: [
      { id: "a", label: "1", lines: ["가".repeat(2_001)] },
      { id: "b", label: "2", lines: ["나"] },
      { id: "c", label: "3", lines: ["다"] },
    ] }), ["원문"])).toThrow("CHAT_TONE_LINE_COUNT");
  });
});
