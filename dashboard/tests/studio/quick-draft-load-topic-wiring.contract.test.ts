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
    // R7 운영 초안 호환 정규화가 loadDraft 앞부분에 추가돼도 주제 복원 배선까지
    // 검사하도록 함수 절단 범위를 넓힌다. quickDraft 보호 단언 자체는 완화하지 않는다.
    const body = sliceFrom("function loadDraft(d: Record<string, unknown>)", 3400);
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

  // 2026-10-01 재리뷰 BLOCK(2차): "③은 신규 배선 테스트가 겸한다"고 보고했으나 실제로는
  // 위 LOAD-WIRING-01/02만 검사했고, 아래 두 배선(주제 변경 시 실제 비우기 / 복원 시
  // sanitize 반환값이 실제로 쓰이는지)은 어느 테스트도 안 잡았다 — 되돌려도 통과했다.
  // 이 두 항목을 소스에서 직접 고정한다.
  it("INVALIDATE-WIRING-01: 주제 변경 무효화 effect는 판정 통과 직후 replaceBodySnapshot([],null,...)로 본문을 실제로 비운다", () => {
    const body = sliceFrom("if (!shouldInvalidateQuickDraft(quickDraftTopicRef.current, idea)) return;", 260);
    expect(body, "주제 변경 판정 뒤 replaceBodySnapshot([], null, ...) 호출로 본문을 비우지 않는다").toMatch(
      /replaceBodySnapshot\(\[\],\s*null,\s*\{\s*replaceDocument:\s*true/,
    );
    expect(body, "주제 변경 판정 뒤 quickDraftTopicRef를 null로 리셋하지 않는다").toMatch(
      /quickDraftTopicRef\.current = null;/,
    );
  });

  it("RESTORE-WIRING-01: 복원 시 sanitizeRestoredQuickDraftText의 반환값이 replaceBodySnapshot의 본문 인자로 실제로 들어간다(버려지지 않는다)", () => {
    const body = sliceFrom("const restoredQuickDraftText = sanitizeRestoredQuickDraftText(w.text || null);", 400);
    expect(body, "sanitizeRestoredQuickDraftText의 반환값을 restoredQuickDraftText에 대입하지 않는다").toMatch(
      /const restoredQuickDraftText = sanitizeRestoredQuickDraftText\(w\.text \|\| null\);/,
    );
    expect(
      body,
      "restoredQuickDraftText가 replaceBodySnapshot의 두 번째(본문) 인자로 실제로 전달되지 않는다(반환값이 버려질 수 있다)",
    ).toMatch(/replaceBodySnapshot\(restoredQuickDraftLines,\s*restoredQuickDraftText,/);
  });
});
