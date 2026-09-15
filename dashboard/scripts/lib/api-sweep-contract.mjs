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
