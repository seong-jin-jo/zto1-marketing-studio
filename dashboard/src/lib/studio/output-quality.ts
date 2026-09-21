/**
 * 만들어진 글이 학습 정보를 실제로 지켰는지 잰다.
 *
 * 회장이 못 박은 핵심 과제는 "학습정보를 잘 받아서 프롬프팅이나 하네스엔지니어링 없이도
 * 최고의 퀄리티" 다. 그런데 우리는 **품질을 한 번도 재지 않았다.** 전달 경로만 고치고
 * "좋아졌을 것" 이라고 말해 왔다. 재지 않으면 좋아졌는지 나빠졌는지 아무도 모르고,
 * 프롬프트를 만질 때마다 감으로 판단하게 된다. 그것이 정확히 회장이 없애자고 한 상태다.
 *
 * 그래서 **결과물만 보고 기계가 판정할 수 있는 것**만 검사한다. 사람이 읽어야 아는 것
 * (재미있나, 설득되나)은 여기서 다루지 않는다. 그것까지 점수로 만들면 숫자가 그럴듯해지고
 * 아무도 안 믿게 된다.
 *
 * 검사 넷은 전부 "지키기로 해 놓고 안 지킨 것" 이다. 하나라도 걸리면 그 글은 학습 정보를
 * 안 따른 것이고, 사용자는 자기가 고른 값이 무시당했다고 느낀다.
 */
export type LearningExpectation = {
  /** 쓰지 않기로 한 표현. 견본 문장이 아니라 낱말만. */
  forbiddenPhrases?: readonly string[];
  /** 브랜드 문서에 있으나 이번 대상과 어긋나 새어 나오면 안 되는 표현. */
  leakPhrases?: readonly string[];
  /** 채널이 정한 글자 수 상한. 넘으면 잘려 나간다. */
  maxChars?: number;
};

export type QualityIssue = {
  rule: "forbidden" | "leak" | "dash" | "length" | "empty";
  detail: string;
};

export type QualityReport = {
  passed: boolean;
  issues: QualityIssue[];
  /** 검사한 글자 수. 0 이면 만들다 만 것이다. */
  chars: number;
};

/** 견본이 붙은 저장값에서 낱말만 뽑는다. "별도 제한 없음" 류는 금지어가 아니라 답이다. */
export function forbiddenWordsFrom(stored: string | null | undefined): string[] {
  const head = String(stored ?? "").split("예:")[0].trim();
  if (!head || /별도 제한 없음|제한 없음|없음/.test(head)) return [];
  // 문장 끝 마침표가 낱말에 붙어 오면 "허세." 로 저장돼 본문의 "허세" 를 못 잡는다.
  // 금지어는 낱말이지 문장이 아니다.
  return head
    .split(/[,·]/)
    .map((word) => word.trim().replace(/[.]+$/, "").trim())
    .filter(Boolean)
    .slice(0, 20);
}

export function checkOutputQuality(text: string, expect: LearningExpectation = {}): QualityReport {
  const body = String(text ?? "");
  const issues: QualityIssue[] = [];

  if (!body.trim()) {
    // 빈 결과를 통과시키면 다른 검사가 전부 통과해 만점이 나온다. 가장 나쁜 거짓 신호다.
    return { passed: false, issues: [{ rule: "empty", detail: "결과가 비어 있습니다" }], chars: 0 };
  }

  for (const phrase of expect.forbiddenPhrases ?? []) {
    const word = phrase.trim();
    if (word && body.includes(word)) {
      issues.push({ rule: "forbidden", detail: `쓰지 않기로 한 표현이 있습니다: ${word}` });
    }
  }

  for (const phrase of expect.leakPhrases ?? []) {
    const word = phrase.trim();
    if (word && body.includes(word)) {
      issues.push({ rule: "leak", detail: `이번 대상과 어긋나는 표현이 새어 나왔습니다: ${word}` });
    }
  }

  // 줄표는 회장 문체 규칙에서 금지다. 계약도 이것을 막는다. 결과에서도 확인한다.
  if (/[—–]/.test(body)) {
    issues.push({ rule: "dash", detail: "금지한 줄표가 있습니다" });
  }

  if (expect.maxChars && body.length > expect.maxChars) {
    issues.push({
      rule: "length",
      detail: `채널 상한 ${expect.maxChars}자를 넘었습니다(${body.length}자)`,
    });
  }

  return { passed: issues.length === 0, issues, chars: body.length };
}

// ---------------------------------------------------------------------------
// 카드 덱 계약 v2 전용 품질 반려(설계 §5 F3 규칙 6개). validateCardDeck() 은 계약의 "모양"
// (장수·역할·타입)만 지킨다. 여기는 "내용"이 계약이 약속한 의미를 실제로 지켰는지 잰다.
// 근거: docs/eng-design/osmu-quality-stage1-v1-claude-opus.md §5 F3 output-quality 표.
// ---------------------------------------------------------------------------
import type { CardDeck, HookType } from "./card-deck-contract";
import { COVER_HEADLINE_MAX_CHARS_PER_LINE } from "./card-deck-contract";

export type CardDeckQualityRule =
  | "cta_keyword"
  | "cta_link"
  | "cta_save_reason"
  | "hook_type"
  | "cover_lines"
  | "deck_shape"
  | "forbidden_phrase";

export type CardDeckQualityIssue = { rule: CardDeckQualityRule; detail: string };

export type CardDeckExpectation = {
  /** hook_type 를 사용자가 고정한 경우에만 채운다. auto 면 비운다(모델이 고른 값을 그대로 받는다). */
  fixedHookType?: HookType;
  forbiddenPhrases?: readonly string[];
  /**
   * hook_type이 "number"일 때 표지에 쓸 수 있는 숫자 전체 집합. 학습 정보 본문에서
   * `\d[\d,.%]*` 로 뽑은 값이다. 표지 숫자가 이 집합의 부분집합이 아니면 지어낸 숫자다
   * (설계 F3 "숫자형은 학습 정보의 실적만"). `undefined`(호출측이 학습 정보 자체를 안
   * 넘긴 경우)면만 검사를 건너뛴다. 빈 배열(학습 정보는 넘겼는데 숫자가 없음)은 검사
   * 대상이다 — 그때 표지에 숫자가 있으면 전부 지어낸 것이므로 반려한다(ADR-007).
   */
  knownNumbers?: readonly string[];
};

/** 학습 정보 직렬화 문자열에서 숫자 토큰만 뽑는다. number 훅이 지어낸 숫자인지 대조할 기준값. */
export function extractKnownNumbers(text: string): string[] {
  const matches = String(text ?? "").match(/\d[\d,.%]*/g) ?? [];
  return Array.from(new Set(matches.map((value) => value.trim()).filter(Boolean)));
}

function slideBubbleTexts(deck: CardDeck): string[] {
  const texts: string[] = [];
  for (const slide of deck.slides) {
    if (slide.role === "cover") {
      if (slide.cover?.headline) texts.push(slide.cover.headline);
      if (slide.cover?.sub) texts.push(slide.cover.sub);
      continue;
    }
    for (const bubble of slide.bubbles ?? []) {
      texts.push(bubble.segments.map((segment) => segment.text).join(""));
    }
  }
  return texts;
}

const HOOK_TYPE_MARKERS: Record<HookType, RegExp> = {
  question: /\?/,
  number: /\d/,
  pain: /아닙니다|아니라|때문입니다|못\s|하지\s마세요/,
};

/**
 * 카드 덱을 자로 잰다. `validateCardDeck()` 을 이미 통과한 덱만 여기 들어온다(모양은
 * 보증됨). 하나라도 걸리면 `issues` 에 쌓고 계속 검사한다 — 첫 위반에서 멈추면 재시도
 * 프롬프트가 한 번에 한 규칙만 고치게 되어 왕복이 늘어난다(실수.md 2026-09-09 "이유를
 * 하나만 주면 한 번에 하나씩만 고친다"와 같은 결).
 */
export function checkCardDeckQuality(deck: CardDeck, expect: CardDeckExpectation = {}): { passed: boolean; issues: CardDeckQualityIssue[] } {
  const issues: CardDeckQualityIssue[] = [];
  const ctaSlide = deck.slides[deck.slides.length - 1];
  const ctaText = (ctaSlide.bubbles ?? []).map((bubble) => bubble.segments.map((segment) => segment.text).join("")).join("\n");

  // rule: cta_keyword — CTA 장 본문에 "댓글" 과 "'키워드'" 둘 다 있어야 한다.
  if (!ctaText.includes("댓글") || !ctaText.includes(`'${deck.cta.keyword}'`)) {
    issues.push({ rule: "cta_keyword", detail: `CTA 장에 댓글 키워드 유도가 없습니다: '${deck.cta.keyword}'` });
  }

  // rule: cta_link — CTA·표지에 표면 링크 표현.
  const coverHeadline = deck.slides[0]?.cover?.headline ?? "";
  const linkHit = [ctaText, coverHeadline].join("\n").match(/https?:\/\/|www\.|\.com\b|링크|프로필/);
  if (linkHit) {
    issues.push({ rule: "cta_link", detail: `CTA 에 표면 링크 표현이 있습니다: ${linkHit[0]}` });
  }

  // rule: cta_save_reason — 저장 명분 6자 미만.
  if (!deck.cta.save_reason || deck.cta.save_reason.trim().length < 6) {
    issues.push({ rule: "cta_save_reason", detail: "저장 명분이 비었습니다" });
  }

  // rule: hook_type — 값이 허용 범위 밖이거나 고정값과 다르거나, 선언한 공식의 표식이
  // 헤드라인에 없다.
  if (!["question", "number", "pain"].includes(deck.hook_type)) {
    issues.push({ rule: "hook_type", detail: `훅 공식이 비어 있거나 허용 밖입니다: ${String(deck.hook_type)}` });
  } else if (expect.fixedHookType && deck.hook_type !== expect.fixedHookType) {
    issues.push({ rule: "hook_type", detail: `훅 공식이 ${expect.fixedHookType} 이어야 하는데 ${deck.hook_type} 입니다` });
  } else if (!HOOK_TYPE_MARKERS[deck.hook_type].test(coverHeadline)) {
    issues.push({ rule: "hook_type", detail: `표지가 선언한 훅 공식(${deck.hook_type})의 표식을 담고 있지 않습니다: "${coverHeadline}"` });
  } else if (deck.hook_type === "number" && expect.knownNumbers !== undefined) {
    // number 훅은 "학습 정보에 있는 실적만" 쓰기로 돼 있다(설계 F3). 표지 숫자 하나라도
    // 학습 정보 어디에도 없으면 모델이 지어낸 것이다. knownNumbers 가 빈 배열(학습 정보에
    // 숫자가 아예 없음)이라도 검사는 돌린다 — 건너뛰면 아무 숫자나 지어내도 통과한다
    // (ADR-007 조용한 실패 금지: 검사를 조용히 스킵하는 것도 같은 결의 구멍이다).
    // 호출측이 knownNumbers 자체를 안 넘긴 경우(undefined)에만 건너뛴다.
    const known = new Set(expect.knownNumbers);
    const coverNumbers = coverHeadline.match(/\d[\d,.%]*/g) ?? [];
    const madeUp = coverNumbers.filter((value) => !known.has(value.trim()));
    if (madeUp.length > 0) {
      const detail = expect.knownNumbers.length === 0
        ? `학습 정보에 숫자가 없는데 표지에 숫자가 있습니다: ${madeUp.join(", ")}`
        : `표지 숫자가 학습 정보에 없습니다: ${madeUp.join(", ")}`;
      issues.push({ rule: "hook_type", detail });
    }
  }

  // rule: cover_lines — 줄 수·줄당 글자수 상한(계약과 같은 상수를 재사용).
  const lines = coverHeadline.split("\n");
  if (lines.length > 3) {
    issues.push({ rule: "cover_lines", detail: `표지 줄 수가 ${lines.length}줄입니다(상한 3)` });
  }
  lines.forEach((line, index) => {
    if (line.length > COVER_HEADLINE_MAX_CHARS_PER_LINE) {
      issues.push({ rule: "cover_lines", detail: `표지 ${index + 1}번째 줄이 ${line.length}자입니다(상한 ${COVER_HEADLINE_MAX_CHARS_PER_LINE})` });
    }
  });

  // rule: deck_shape — 장수·역할 배치·화자 2종 미달(validateCardDeck 의 구조 규칙 재확인.
  // 여기서는 "어느 장이" 문제인지까지 짚는다).
  deck.slides.forEach((slide, index) => {
    if (slide.role !== "chat") return;
    const speakers = new Set((slide.bubbles ?? []).map((bubble) => bubble.speaker));
    if (!speakers.has("reader")) issues.push({ rule: "deck_shape", detail: `${index + 1}번 장에 reader 말풍선이 없습니다` });
    if (!speakers.has("brand")) issues.push({ rule: "deck_shape", detail: `${index + 1}번 장에 brand 말풍선이 없습니다` });
  });

  // 기존 4규칙(금지어·누출·줄표·빈 값)을 각 말풍선·표지 텍스트에도 돌린다(설계 §5 F3
  // "checkCardDeckQuality 가 기존 checkOutputQuality 도 돌린다").
  const forbidden = expect.forbiddenPhrases ?? [];
  for (const text of slideBubbleTexts(deck)) {
    const report = checkOutputQuality(text, { forbiddenPhrases: forbidden });
    for (const issue of report.issues) {
      // validateCardDeck() 이 이미 통과시킨 덱만 여기 온다(dash·empty 는 계약이 먼저 막는다).
      // 그래도 여기서 한 번 더 재는 것은 계약과 품질 검사가 서로 다른 텍스트 조각(세그먼트
      // 이어붙인 값)을 볼 수 있어서다 — 검사가 하나 놓치면 다른 하나가 잡는다.
      issues.push({ rule: "forbidden_phrase", detail: issue.detail });
    }
  }

  return { passed: issues.length === 0, issues };
}

/** 여러 편을 한 번에 재고 통과율을 낸다. 한 편만 보면 우연히 통과한 것을 실력으로 오해한다. */
export function summarizeQuality(
  texts: readonly string[],
  expect: LearningExpectation = {},
): { total: number; passed: number; rate: number; issues: QualityIssue[] } {
  const reports = texts.map((text) => checkOutputQuality(text, expect));
  const passed = reports.filter((report) => report.passed).length;
  return {
    total: reports.length,
    passed,
    rate: reports.length ? passed / reports.length : 0,
    issues: reports.flatMap((report) => report.issues),
  };
}
