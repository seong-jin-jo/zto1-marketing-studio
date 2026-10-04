import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const pageSource = readFileSync(resolve(process.cwd(), "src/app/studio/page.tsx"), "utf8");

function functionBody(startMarker: string, endMarker: string): string {
  const start = pageSource.indexOf(startMarker);
  const end = pageSource.indexOf(endMarker, start + startMarker.length);
  expect(start, `${startMarker} 시작점을 찾지 못했다`).toBeGreaterThanOrEqual(0);
  expect(end, `${endMarker} 끝점을 찾지 못했다`).toBeGreaterThan(start);
  return pageSource.slice(start, end);
}

describe("S1-R8 자유 배치 상세 상태 초기화", () => {
  it("S1-R8-DETAIL-RESET-01 loading/error 중 새 작업을 시작하는 세 경로가 덱과 상세 상태를 함께 비워 진입과 발행 차단을 해제한다", () => {
    const resetSequence = /setCardDeckV3\(null\);\s*setCardDeckV3DetailStatus\("idle"\)/;
    const newQuickDraft = functionBody("async function generateQuickDraft", "async function discardCurrentWork");
    const discardAndRestart = functionBody("async function discardCurrentWork", "async function recompositeCards");
    const chooseCandidate = functionBody("function chooseCandidate", "function updatePreviewCaption");

    expect(newQuickDraft, "새 작업 생성 경로가 남은 loading/error를 해제하지 않는다").toMatch(resetSequence);
    expect(discardAndRestart, "버리고 새로 시작 경로가 남은 loading/error를 해제하지 않는다").toMatch(resetSequence);
    expect(chooseCandidate, "후보 선택 경로가 남은 loading/error를 해제하지 않는다").toMatch(resetSequence);

    expect(pageSource).toContain('const cardDeckV3HydrationBlockedReason = cardDeckV3DetailBlockedReason(cardDeckV3DetailStatus)');
    expect(pageSource).toContain('publishBlockedReason={cardDeckV3 ? CARD_DECK_V3_PUBLISH_BLOCK_MESSAGE : cardDeckV3HydrationBlockedReason}');
  });
});
