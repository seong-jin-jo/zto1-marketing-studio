import { filterInstructionPlaceholderLines } from "@/lib/studio/generated-copy";

/**
 * 2026-10-02 운영 사고(결함 C): "글자 카드로 만들기 (바로·무료)"가 구조 초안의 **라벨**
 * (예: "고객이 겪는 문제", "문제가 생기는 이유", "바로 적용할 방법" — StudioRooms.tsx의
 * STRUCTURE_CANDIDATES)을 카드 그림에 그대로 찍었다. 같은 화면에 실제로 생성된 본문
 * (quickDraft — 카드뉴스는 instagram.slides)이 이미 있는데도 그것을 쓰지 않아, 고객이
 * 발행하면 라벨 글자만 박힌 카드가 실제로 나갔다. 편집실 초기 "문구 1~3" 칸도 이 함수의
 * 결과를 그대로 물려받으므로(onTextCardsCreated → replaceEditLines) 한 자리만 고치면
 * 두 결함이 같이 닫힌다.
 *
 * 2026-10-03 독립 리뷰 MAJOR-8/MINOR-f 재발 방지(같은 주제 "글 하나를 인스타·스레드·X에
 * 맞게 바꾸는 3단계" 실물 초안으로 재현):
 * - 호출부(StudioRooms.tsx)가 primaryKind 섹션을 넘기면, primaryKind가 "text"일 때 글
 *   전체(threads/x/facebook 중 하나, 긴 한 문단)가 그대로 "한 장"이 되고, primaryKind가
 *   "card"여도 instagram.caption(해시태그 포함 긴 문장)이 슬라이드 뒤에 따라붙어 마지막
 *   장이 캡션으로 찍혔다. 카드는 캡션을 쓰는 매체가 아니다. 그래서 이 함수는 더는
 *   "현재 선택된 섹션의 줄"을 받지 않고, 호출부가 **instagram.slides만**(캡션 제외) 넘기게
 *   계약을 좁혔다(`generatedLines`는 오직 slides용).
 * - 자리표시 폴백(②③)을 실제로 발행 가능한 결과물과 같은 취급으로 두면 "라벨만 찍힌 카드"
 *   사고가 그대로 재발한다. 그래서 폴백을 썼는지(`isPlaceholder`)를 반드시 돌려주고,
 *   호출부가 그 경우 카드를 만들지 않고 막아야 한다(차단 = 아무 것도 못 만들게 하는 것 =
 *   그 뒤 발행으로 이어질 것이 없다는 뜻. "발행을 막는다"의 가장 단순한 형태).
 * - 한 줄이 지나치게 길면(캡션급 문장) 폭에 맞춰 줄바꿈은 되어도 줄 수가 카드 높이를
 *   넘어 글자가 최소 크기에서도 잘려 나갔다(text-card-image.ts). 그 2차 방어와 별개로,
 *   여기서도 한 줄의 글자 수 자체를 상한으로 자른다(말줄임표) — 렌더러가 줄바꿈을 아무리
 *   잘해도 한 "장"에 한 문단 전체를 넣는 것은 카드 형식에 맞지 않는 콘텐츠이기 때문이다.
 */
const MAX_CARD_LINE_CHARS = 120;

function capLineLength(line: string): string {
  const trimmed = line.trim();
  if (trimmed.length <= MAX_CARD_LINE_CHARS) return trimmed;
  return `${trimmed.slice(0, MAX_CARD_LINE_CHARS - 1).trimEnd()}…`;
}

export interface ResolvedTextCardLines {
  lines: string[];
  /**
   * true면 실제 생성 본문이 아니라 구조 초안/빠른 구조의 라벨로 채운 것이다. 호출부는
   * 이 경우 카드를 만들지 않고 "구조 초안에 실제 내용이 없어…" 안내로 막아야 한다 —
   * 라벨이 찍힌 카드가 그대로 발행되는 사고(2026-10-02)를 다시 만들지 않기 위함.
   */
  isPlaceholder: boolean;
}

export function resolveTextCardLines(input: {
  /** 카드뉴스용으로 생성된 슬라이드 줄만. 캡션·본문 전체를 섞어 넘기지 않는다. */
  generatedLines?: readonly string[] | null;
  candidateOutline?: readonly string[] | null;
  quickStructureOutline?: readonly string[] | null;
}): ResolvedTextCardLines {
  const sources: ReadonlyArray<{ lines: readonly string[] | null | undefined; isPlaceholder: boolean }> = [
    { lines: input.generatedLines, isPlaceholder: false },
    { lines: input.candidateOutline, isPlaceholder: true },
    { lines: input.quickStructureOutline, isPlaceholder: true },
  ];
  for (const source of sources) {
    if (!source.lines || source.lines.length === 0) continue;
    const nonEmpty = source.lines.filter((line) => line.trim().length > 0);
    const filtered = filterInstructionPlaceholderLines(nonEmpty);
    if (filtered.length > 0) {
      return { lines: filtered.map(capLineLength), isPlaceholder: source.isPlaceholder };
    }
  }
  return { lines: [], isPlaceholder: false };
}
