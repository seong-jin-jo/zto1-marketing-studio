import { filterInstructionPlaceholderLines } from "@/lib/studio/generated-copy";

/**
 * 2026-10-02 운영 사고(결함 C): "글자 카드로 만들기 (바로·무료)"가 구조 초안의 **라벨**
 * (예: "고객이 겪는 문제", "문제가 생기는 이유", "바로 적용할 방법" — StudioRooms.tsx의
 * STRUCTURE_CANDIDATES)을 카드 그림에 그대로 찍었다. 같은 화면에 실제로 생성된 본문
 * (quickDraft — 카드뉴스는 instagram.slides + caption)이 이미 있는데도 그것을 쓰지 않아,
 * 고객이 발행하면 라벨 글자만 박힌 카드가 실제로 나갔다. 편집실 초기 "문구 1~3" 칸도
 * 이 함수의 결과를 그대로 물려받으므로(onTextCardsCreated → replaceEditLines) 한 자리만
 * 고치면 두 결함이 같이 닫힌다.
 *
 * 우선순위: ①실제로 생성된 본문(있으면 그것) ②구조 초안(candidate) 라벨 ③빠른 구조
 * 선택(quickStructure) 라벨. ②③는 초안을 아직 안 만들었을 때 완전히 빈 카드보다는
 * 구조라도 보여주기 위한 폴백이다(2026-09-14 결정 유지) — 생성된 본문이 있으면 항상
 * 그것이 이긴다.
 */
export function resolveTextCardLines(input: {
  generatedLines?: readonly string[] | null;
  candidateOutline?: readonly string[] | null;
  quickStructureOutline?: readonly string[] | null;
}): string[] {
  const candidates: ReadonlyArray<readonly string[] | null | undefined> = [
    input.generatedLines,
    input.candidateOutline,
    input.quickStructureOutline,
  ];
  for (const source of candidates) {
    if (!source || source.length === 0) continue;
    const nonEmpty = source.filter((line) => line.trim().length > 0);
    const lines = filterInstructionPlaceholderLines(nonEmpty);
    if (lines.length > 0) return lines;
  }
  return [];
}
