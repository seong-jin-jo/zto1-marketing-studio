/**
 * 모델이 완성 문장 대신 남긴 괄호형 작성 지시를 찾는다.
 *
 * 일반 괄호 설명까지 막지 않도록 "입력·작성·채우기·대체"처럼 다음 작성자에게 행동을
 * 시키는 표현만 잡는다. 생성 결과는 카드와 발행 미리보기의 공통 원천이므로 어느 화면에서
 * 가릴 게 아니라 저장 상태로 승격하기 전에 차단해야 한다.
 */
const BRACKETED_FRAGMENT = /\{\{[^{}\n]{1,200}\}\}|\([^()\n]{1,200}\)|\[[^\[\]\n]{1,200}\]/gu;
// 오탐 한 건이 곧 생성 전체 실패이므로(route.ts:88-90, llm.ts) 정밀도를 최우선한다.
// "확신 높은 패턴만 위치와 무관하게 차단"하고, 애매한 것은 통과시킨다(11차 리뷰 확정 원칙).
// ① 명령형 어미(하세요/해주세요/할 것/해야 함 등)나 명사형 지시 어미(채우기/넣기/적기)가
// 실제로 붙었을 때만 차단한다. "입력/작성/기입/추가"는 일반 명사로도 쓰이므로 접미사 없는
// 맨 동사형은 여기서 잡지 않고 bareFillVerbBlocks()에서 앞 단어(필드 "명"류)를 보고 따로
// 판정한다.
const KOREAN_INSTRUCTION_ENDING = /(?:(?:으?로\s*)?대체|(?:직접\s*)?(?:입력|작성|기입|추가)(?:하세요|해\s*주세요|하라|할\s*것|해야\s*(?:함|합니다)|바랍니다|이\s*필요)|(?:채워|채우|넣어|넣으|적어|적으)(?:\s*주세요|세요|라|야\s*(?:함|합니다)|기\s*바랍니다)|(?:채우기|넣기|적기))\s*[.!?]?$/iu;
// ③ 영어 지시어 괄호: [INSERT …], [TODO …], "Replace with …" 명시형, (your 명사구 here) 류만
// 위치와 무관하게 차단한다. "Replace 쿠폰 2장 증정"처럼 대체 대상이 없는 일반 문구나
// "Tag your friends here"처럼 "your"로 시작하지 않는 실제 CTA 문구는 통과시킨다
// (12차 리뷰 MINOR: 지나치게 넓은 영어 패턴 오탐 방지).
const ENGLISH_INSTRUCTION = /^\s*(?:todo|placeholder|fill\s+in|insert)\b/iu;
const ENGLISH_REPLACE_WITH = /^\s*replace\s+with\b/iu;
const ENGLISH_YOUR_HERE = /^your(?:\s+[a-z][a-z'-]*){1,3}\s+here\s*$/iu;
// ④ 괄호 몸통이 대체할 값 없는 필드명 그 자체일 때만 가리킨다. 괄호 종류(()·[]·{{}}) 구분
// 없이 동일 규칙. 허용 목록 방식(12차 리뷰 확정) — 두 갈래만 필드명으로 본다.
//   (a) 정체성 이름 계열: (브랜드|서비스|상품|제품|행사|가게|상호|업체|회사|매장|이벤트|
//       캠페인|프로그램) + (명|명칭|이름|공백+이름). "실명"·"서명"·"설명"처럼 이 낱말들과
//       무관하게 우연히 "명"으로 끝나는 일반 명사는 여기 걸리지 않는다(12차 리뷰 MAJOR:
//       NAME_FIELD_SUFFIX가 "명으로 끝나는 모든 낱말"을 잡던 오탐 수정).
//   (b) 단독 필드어: 링크·URL·주소. 연락처·시간·내용처럼 실제 공지문에도 흔히 홀로 쓰이는
//       일반 명사는 넣지 않는다(11차 리뷰 MINOR: "문의(연락처)" 오탐 방지).
const NAME_FIELD_STEMS = "브랜드|서비스|상품|제품|행사|가게|상호|업체|회사|매장|이벤트|캠페인|프로그램";
const NAME_FIELD_WHOLE = new RegExp(`^(?:${NAME_FIELD_STEMS})(?:명|명칭|이름|\\s*이름)$`, "iu");
const NAME_FIELD_ENDING = new RegExp(`(?:${NAME_FIELD_STEMS})(?:명|명칭|이름|\\s*이름)$`, "iu");
const STANDALONE_FIELD_WORD = /^(?:링크|url|주소)$/iu;
// 정체성 이름 계열 바로 뒤에 붙은 맨 동사형(입력/작성/기입/추가, 어미 없음)만 자리표시로
// 본다. "자동 입력"·"옵션 추가"·"고객 직접 작성"처럼 정체성 이름이 아닌 말 뒤에 오는 맨
// 동사형은 실제 문구일 가능성이 높아 통과시킨다. "5명 추가"·"실명 입력"처럼 숫자나 목록
// 밖의 일반 명사 뒤에 오는 "명"도 통과시킨다.
const BARE_FILL_VERBS = ["입력", "작성", "기입", "추가"] as const;

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
    return NAME_FIELD_ENDING.test(before);
  }
  return false;
}

// 허용 예외는 하나뿐: 줄 맨 앞(또는 줄바꿈 직후)의 "[항목명] 값" 공지 항목 제목
// ("[장소] 강남역 3번 출구"). 그 외에는 괄호 뒤에 어떤 글자가 이어지든 판정을 건너뛰지 않는다
// (11차 리뷰 MAJOR: 이전 "뒤에 값이 이어지면 통과" 규칙이 문장 중간 자리표시를 전부 놓쳤다).
function isLineStartLabelValue(value: string, raw: string, index: number): boolean {
  if (!raw.startsWith("[")) return false;
  const lineStart = value.lastIndexOf("\n", Math.max(index - 1, 0)) + 1;
  const linePrefix = value.slice(lineStart, index);
  if (linePrefix.trim().length > 0) return false;
  const tail = value.slice(index + raw.length);
  return /^[ \t]+\S/u.test(tail);
}

export function findInstructionPlaceholder(value: unknown): string | null {
  if (typeof value === "string") {
    for (const match of value.matchAll(BRACKETED_FRAGMENT)) {
      const raw = match[0];
      const index = match.index ?? 0;
      const body = bracketBody(raw);
      if (raw.startsWith("{{")) {
        if (body.length > 0) return raw;
        continue;
      }
      if (
        KOREAN_INSTRUCTION_ENDING.test(body)
        || ENGLISH_INSTRUCTION.test(body)
        || ENGLISH_REPLACE_WITH.test(body)
        || ENGLISH_YOUR_HERE.test(body)
      ) {
        return raw;
      }
      if (isLineStartLabelValue(value, raw, index)) continue;
      if (NAME_FIELD_WHOLE.test(body) || STANDALONE_FIELD_WORD.test(body)) return raw;
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
