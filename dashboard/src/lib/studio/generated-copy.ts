/**
 * 모델이 완성 문장 대신 남긴 괄호형 작성 지시를 찾는다.
 *
 * 일반 괄호 설명까지 막지 않도록 "입력·작성·채우기·대체"처럼 다음 작성자에게 행동을
 * 시키는 표현만 잡는다. 생성 결과는 카드와 발행 미리보기의 공통 원천이므로 어느 화면에서
 * 가릴 게 아니라 저장 상태로 승격하기 전에 차단해야 한다.
 */
const BRACKETED_FRAGMENT = /\{\{[^{}\n]{1,200}\}\}|\([^()\n]{1,200}\)|\[[^\[\]\n]{1,200}\]/gu;
const KOREAN_INSTRUCTION_ENDING = /(?:(?:으?로\s*)?대체|(?:직접\s*)?(?:입력|작성|기입|추가)(?:하세요|해\s*주세요|하라|할\s*것|해야\s*(?:함|합니다)|바랍니다|이\s*필요)?|(?:채워|채우|넣어|넣으|적어|적으)(?:\s*주세요|세요|라|야\s*(?:함|합니다)|기\s*바랍니다)|(?:채우기|넣기|적기))\s*[.!?]?$/iu;
const ENGLISH_INSTRUCTION = /^\s*(?:todo|placeholder|fill\s+in|insert|replace)\b/iu;
const SQUARE_FIELD_PLACEHOLDER = /^(?:브랜드|서비스|제품|회사|업체|상호|고객|대상|제목|본문|내용|문구|설명|링크|url|날짜|시간|장소|지역|주소|연락처|이메일|전화번호|가격|해시태그|키워드|이름)(?:명|명칭|이름)?$/iu;

function bracketBody(fragment: string): string {
  return fragment.startsWith("{{")
    ? fragment.slice(2, -2).trim()
    : fragment.slice(1, -1).trim();
}

export function findInstructionPlaceholder(value: unknown): string | null {
  if (typeof value === "string") {
    for (const match of value.matchAll(BRACKETED_FRAGMENT)) {
      const body = bracketBody(match[0]);
      if (match[0].startsWith("{{") && body.length > 0) return match[0];
      if (match[0].startsWith("[") && SQUARE_FIELD_PLACEHOLDER.test(body)) return match[0];
      if (KOREAN_INSTRUCTION_ENDING.test(body) || ENGLISH_INSTRUCTION.test(body)) return match[0];
    }
    return null;
  }
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
