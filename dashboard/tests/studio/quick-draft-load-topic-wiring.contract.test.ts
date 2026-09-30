import { describe, expect, it } from "vitest";
import fs from "fs";
import path from "path";

// 2026-10-01 재리뷰 BLOCK: loadDraft(저장 초안 불러오기)와 발행실 복귀(linkedDraft) 경로가
// quickDraftTopicRef를 안 맞춰서, 주제 A로 빠른 초안을 만든 뒤 주제 B의 저장 초안을
// 불러오면 "주제 변경 시 무효화" 효과(958줄)가 방금 불러온 본문을 지웠다. 이 계약은
// 두 불러오기 경로 모두가 quickDraftTopicRef를 resolveRestoredQuickDraftTopic으로
// 다시 맞추는지 소스에서 고정한다(같은 파일의 create-room-wiring/publish-page-wiring
// 계약과 같은 기법 — 함수 단위 테스트가 못 잡는 배선 회귀를 잡는다).
const pageSrc = fs.readFileSync(path.resolve(__dirname, "../../src/app/studio/page.tsx"), "utf8");

function sliceFrom(marker: string, length = 900): string {
  const index = pageSrc.indexOf(marker);
  if (index === -1) throw new Error(`marker not found in page.tsx: ${marker}`);
  return pageSrc.slice(index, index + length);
}

describe("생성 후보 불러오기 경로의 quickDraftTopicRef 배선 계약", () => {
  it("LOAD-WIRING-01: loadDraft는 replaceBodySnapshot 직후 quickDraftTopicRef를 resolveRestoredQuickDraftTopic으로 맞춘다", () => {
    const body = sliceFrom("function loadDraft(d: Record<string, unknown>)", 2600);
    expect(body, "loadDraft가 quickDraftTopicRef를 다시 맞추지 않는다").toMatch(
      /quickDraftTopicRef\.current = resolveRestoredQuickDraftTopic\(\{[\s\S]*?restoredIdea: String\(d\.idea/,
    );
  });

  it("LOAD-WIRING-02: 발행실 복귀(linkedDraft) 경로도 replaceBodySnapshot 직후 quickDraftTopicRef를 맞춘다", () => {
    const body = sliceFrom("replaceBodySnapshot(\n        returnedEditLines,", 700);
    expect(body, "발행실 복귀 경로가 quickDraftTopicRef를 다시 맞추지 않는다").toMatch(
      /quickDraftTopicRef\.current = resolveRestoredQuickDraftTopic\(/,
    );
  });
});
