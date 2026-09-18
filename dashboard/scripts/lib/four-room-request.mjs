export function remainingRequestTimeout(readyTimeoutMs, deadlineAt, now = Date.now()) {
  const remaining = deadlineAt - now;
  if (remaining <= 0) throw new Error("전체 실행시간이 끝나 요청할 수 없습니다");
  return Math.max(1, Math.min(readyTimeoutMs, remaining));
}

export function requestWithinDeadline(url, options, { readyTimeoutMs, deadlineAt }) {
  return fetch(url, {
    ...options,
    signal: AbortSignal.timeout(remainingRequestTimeout(readyTimeoutMs, deadlineAt)),
  });
}
