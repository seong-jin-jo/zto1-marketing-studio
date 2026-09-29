/**
 * 모델이 완성 문장 대신 남긴 괄호형 작성 지시를 찾는다.
 *
 * 일반 괄호 설명까지 막지 않도록 "입력·작성·채우기·대체"처럼 다음 작성자에게 행동을
 * 시키는 표현만 잡는다. 생성 결과는 카드와 발행 미리보기의 공통 원천이므로 어느 화면에서
 * 가릴 게 아니라 저장 상태로 승격하기 전에 차단해야 한다.
 */
const INSTRUCTION_PLACEHOLDER = /\([^()\n]{0,160}(?:(?:으?로)\s*대체(?:하세요|해\s*주세요|할\s*것)?|(?:직접\s*)?(?:입력|작성|기입)(?:하세요|해\s*주세요|할\s*것|이\s*필요)|(?:채워|채우|넣어)(?:\s*주세요|야\s*함|야\s*합니다)|\b(?:todo|placeholder|fill\s+in)\b)[^()\n]{0,160}\)/iu;

export function findInstructionPlaceholder(value: unknown): string | null {
  if (typeof value === "string") return value.match(INSTRUCTION_PLACEHOLDER)?.[0] ?? null;
  if (Array.isArray(value)) {
    for (const entry of value) {
      const found = findInstructionPlaceholder(entry);
      if (found) return found;
    }
    return null;
  }
  if (value !== null && typeof value === "object") {
    for (const entry of Object.values(value as Record<string, unknown>)) {
      const found = findInstructionPlaceholder(entry);
      if (found) return found;
    }
  }
  return null;
}

export function containsInstructionPlaceholder(value: unknown): boolean {
  return findInstructionPlaceholder(value) !== null;
}
