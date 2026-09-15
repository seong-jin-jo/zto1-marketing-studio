export function classifyApiReadResponse({ status, expectedRejection = null, method, contentType, bodyText }) {
  if (expectedRejection?.statuses.includes(status)) return "계약상 거절";
  if (status >= 200 && status < 300) {
    if (expectedRejection) return "계약 불일치";
    if (method !== "HEAD" && String(contentType).toLowerCase().includes("application/json")) {
      try {
        const body = JSON.parse(bodyText);
        if (body && typeof body === "object" && body.ok === false) return "실패 본문";
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
