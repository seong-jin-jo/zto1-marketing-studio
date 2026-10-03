// Shared by the two four-room probes. The timeout must be attached to the
// actual fetch, including its response body, rather than checked in isolation.
export function requestWithDeadline(url, options, readyTimeoutMs, deadlineAt, fetchImpl = fetch) {
  const remaining = deadlineAt - Date.now();
  if (remaining <= 0) throw new Error("전체 실행시간 초과: 고객 토큰 요청");
  const timeoutMs = Math.max(1, Math.min(readyTimeoutMs, remaining));
  return fetchImpl(url, { ...options, signal: AbortSignal.timeout(timeoutMs) });
}
