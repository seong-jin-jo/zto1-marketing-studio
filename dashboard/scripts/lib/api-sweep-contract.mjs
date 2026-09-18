/**
 * @typedef {object} ExpectedRejection
 * @property {number[]} statuses
 * @property {string[]=} bodyIncludes
 * @property {boolean=} emptyBody
 */

/**
 * @param {object} input
 * @param {number} input.status
 * @param {ExpectedRejection | null=} input.expectedRejection
 * @param {boolean=} input.allowEmptyArray
 * @param {string} input.method
 * @param {string} input.contentType
 * @param {string} input.bodyText
 */
export function classifyApiReadResponse({ status, expectedRejection = null, allowEmptyArray = false, method, contentType, bodyText }) {
  if (expectedRejection?.statuses.includes(status)) {
    if (expectedRejection.bodyIncludes && !expectedRejection.bodyIncludes.some((marker) => bodyText.includes(marker))) {
      return "계약 불일치";
    }
    if (expectedRejection.emptyBody === true && bodyText.length !== 0) return "계약 불일치";
    return "계약상 거절";
  }
  if (status >= 200 && status < 300) {
    if (expectedRejection) return "계약 불일치";
    if (method !== "HEAD" && String(contentType).toLowerCase().includes("application/json")) {
      try {
        const body = JSON.parse(bodyText);
        if (Array.isArray(body) && body.length === 0 && !allowEmptyArray) return "응답 구조 오류";
        if (body && typeof body === "object" && !Array.isArray(body)) {
          if (body.ok === false || body.success === false) return "실패 본문";
          if (typeof body.error === "string" && body.error.trim()) return "실패 본문";
        }
      } catch {
        return "응답 형식 오류";
      }
    }
    return "정상";
  }
  if (status >= 300 && status < 400) return "리다이렉트 검토";
  if (status === 500) return "고장";
  if (status >= 500) return "서버 오류 검토";
  return "예상 밖 거절";
}

function sameOrderedStrings(left, right) {
  return left.length === right.length && left.every((value, index) => value === right[index]);
}

/**
 * A long live sweep is authoritative only when both the observed process and
 * the complete source inventory stay fixed. Comparing only the files found at
 * startup misses a route that is added while requests are still running.
 *
 * @param {object} input
 * @param {string} input.sourceHashBefore
 * @param {string} input.sourceHashAfter
 * @param {string[]} input.listenerPidsBefore
 * @param {string[]} input.listenerPidsAfter
 * @param {string[]} input.evidenceFilesBefore
 * @param {string[]} input.evidenceFilesAfter
 * @param {string[]} input.routeInventoryBefore
 * @param {string[]} input.routeInventoryAfter
 */
export function evaluateSweepEvidenceStability(input) {
  const sourceHashMatches = input.sourceHashBefore === input.sourceHashAfter;
  const listenerMatches = input.listenerPidsBefore.length > 0
    && sameOrderedStrings(input.listenerPidsBefore, input.listenerPidsAfter);
  const evidenceFileInventoryMatches = sameOrderedStrings(
    input.evidenceFilesBefore,
    input.evidenceFilesAfter,
  );
  const routeInventoryMatches = sameOrderedStrings(
    input.routeInventoryBefore,
    input.routeInventoryAfter,
  );
  return {
    stable: sourceHashMatches
      && listenerMatches
      && evidenceFileInventoryMatches
      && routeInventoryMatches,
    sourceHashMatches,
    listenerMatches,
    evidenceFileInventoryMatches,
    routeInventoryMatches,
  };
}
