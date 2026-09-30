/**
 * 모델이 완성 문장 대신 남긴 괄호형 작성 지시를 찾는다.
 *
 * 일반 괄호 설명까지 막지 않도록 "입력·작성·채우기·대체"처럼 다음 작성자에게 행동을
 * 시키는 표현만 잡는다. 생성 결과는 카드와 발행 미리보기의 공통 원천이므로 어느 화면에서
 * 가릴 게 아니라 저장 상태로 승격하기 전에 차단해야 한다.
 */
const BRACKETED_FRAGMENT = /\{\{[^{}\n]{1,200}\}\}|\([^()\n]{1,200}\)|\[[^\[\]\n]{1,200}\]/gu;
// 명확한 명령형 어미(하세요/해주세요/할 것/해야 함 등)나 명사형 지시 어미(채우기/넣기/적기)로
// 끝나는 것만 무조건 자리표시로 본다. "입력/작성/기입/추가"는 일반 명사로도 쓰이므로 여기서는
// 접미사가 실제로 붙어 있을 때만 잡고, 접미사 없는 맨 동사형은 BARE_FILL_VERB_STEMS에서
// 앞 단어를 보고 따로 판정한다(10차 리뷰: "자동 입력"·"옵션 추가" 같은 정상 문구 오탐 방지).
const KOREAN_INSTRUCTION_ENDING = /(?:(?:으?로\s*)?대체|(?:직접\s*)?(?:입력|작성|기입|추가)(?:하세요|해\s*주세요|하라|할\s*것|해야\s*(?:함|합니다)|바랍니다|이\s*필요)|(?:채워|채우|넣어|넣으|적어|적으)(?:\s*주세요|세요|라|야\s*(?:함|합니다)|기\s*바랍니다)|(?:채우기|넣기|적기))\s*[.!?]?$/iu;
const ENGLISH_INSTRUCTION = /^\s*(?:todo|placeholder|fill\s+in|insert|replace)\b/iu;
// 대체할 값이 채워지지 않은 필드명 그 자체(브랜드명·링크·주소 등)만 가리킨다. 괄호/대괄호/중괄호
// 종류와 무관하게 동일 규칙 — 몸통 전체가 이 목록 중 하나와 정확히 같을 때만 자리표시로 본다.
const FIELD_PLACEHOLDER_WORD = /^(?:브랜드|서비스|제품|회사|업체|상호|고객|대상|제목|본문|내용|문구|설명|링크|url|날짜|시간|장소|지역|주소|연락처|이메일|전화번호|가격|해시태그|키워드|이름)(?:명|명칭|이름)?$/iu;
// 접미사 없는 "필드명 + 입력/작성/기입/추가" 맨 동사형만 자리표시로 본다. "직접"이 동사 바로
// 앞에 오면("고객 직접 작성") 실제 작성 주체를 설명하는 일반 문구이지 생성 지시가 아니므로 허용.
const BARE_FILL_VERBS = ["입력", "작성", "기입", "추가"] as const;
const TRAILING_PARTICLE = /(을|를|이|가|은|는)$/u;

function bracketBody(fragment: string): string {
  return fragment.startsWith("{{")
    ? fragment.slice(2, -2).trim()
    : fragment.slice(1, -1).trim();
}

function bareFillVerbBlocks(body: string): boolean {
  const trimmed = body.replace(/[.!?]\s*$/u, "").trim();
  for (const verb of BARE_FILL_VERBS) {
    if (!trimmed.endsWith(verb)) continue;
    const before = trimmed.slice(0, -verb.length).trim();
    if (before.length === 0) return false;
    if (before.endsWith("직접")) return false;
    const precedingWord = before.split(/\s+/).pop() ?? "";
    const bareWord = precedingWord.replace(TRAILING_PARTICLE, "");
    return FIELD_PLACEHOLDER_WORD.test(bareWord);
  }
  return false;
}

export function findInstructionPlaceholder(value: unknown): string | null {
  if (typeof value === "string") {
    for (const match of value.matchAll(BRACKETED_FRAGMENT)) {
      const raw = match[0];
      // 괄호 바로 뒤에 실제 값이 이어지면("[장소] 강남역 3번 출구") 항목 제목:값 표기이지
      // 자리표시가 아니다.
      const tail = value.slice((match.index ?? 0) + raw.length);
      if (/^\s*\S/u.test(tail)) continue;
      const body = bracketBody(raw);
      if (raw.startsWith("{{")) {
        if (body.length > 0) return raw;
        continue;
      }
      if (FIELD_PLACEHOLDER_WORD.test(body)) return raw;
      if (KOREAN_INSTRUCTION_ENDING.test(body) || ENGLISH_INSTRUCTION.test(body)) return raw;
      if (bareFillVerbBlocks(body)) return raw;
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
