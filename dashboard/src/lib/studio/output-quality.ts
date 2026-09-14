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
