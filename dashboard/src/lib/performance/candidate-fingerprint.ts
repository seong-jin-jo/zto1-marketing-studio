import { createHash } from "node:crypto";

/**
 * 성과 학습 후보의 정규 지문.
 *
 * 화면이 만드는 candidateId 는 탭마다 무작위라, 같은 후보를 두 탭에서 만들면
 * 서버의 중복·반대 판단 방지가 통째로 우회됐다(2026-09-12 감사 MAJOR).
 * 유일성은 규칙 문장, 정렬한 출처 글 id, 관찰 기간으로 만든 이 값에 건다.
 * 문장의 공백 차이는 같은 후보로 본다.
 */
export function candidateFingerprint(input: {
  text: string;
  sourcePostIds: string[];
  observedFrom: string | null;
  observedTo: string | null;
}): string {
  return createHash("sha256")
    .update(JSON.stringify([
      input.text.replace(/\s+/g, " ").trim(),
      [...input.sourcePostIds].sort(),
      input.observedFrom,
      input.observedTo,
    ]))
    .digest("hex")
    .slice(0, 32);
}
