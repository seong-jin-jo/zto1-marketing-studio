// 백그라운드 탭에서도 안 묶이는 대기 — 여러 폴링 모듈(higgsfield-poll.ts, job-poll.ts)이
// 공유하는 정본.
//
// 2026-10-02 실측(세션맥락): 백그라운드 탭에서 브라우저가 setTimeout을 묶어 둬 다음 폴링이
// 2.5초가 아니라 22분 뒤에 나간 사고가 있었다. 탭이 다시 보이거나 창이 포커스를 받으면
// 그 즉시 대기를 끝내 바로 다음 조회가 나가게 한다(서버 쪽 백그라운드 완료 처리가 보강돼도,
// 화면이 그 결과를 "받아서 보여주는" 시점은 여전히 이 폴링에 달려 있다).
export function wakeableSleep(ms: number, signal?: AbortSignal): Promise<void> {
  return new Promise((resolve) => {
    let done = false;
    const hasDocument = typeof document !== "undefined";
    const hasWindow = typeof window !== "undefined";
    const finish = () => {
      if (done) return;
      done = true;
      clearTimeout(t);
      signal?.removeEventListener("abort", onAbort);
      if (hasDocument) document.removeEventListener("visibilitychange", onWake);
      if (hasWindow) {
        window.removeEventListener("focus", onWake);
        window.removeEventListener("pageshow", onWake);
      }
      resolve();
    };
    const onAbort = () => finish();
    const onWake = () => {
      if (!hasDocument || document.visibilityState === "visible") finish();
    };
    const t = setTimeout(finish, ms);
    signal?.addEventListener("abort", onAbort, { once: true });
    if (hasDocument) document.addEventListener("visibilitychange", onWake);
    if (hasWindow) {
      window.addEventListener("focus", onWake);
      window.addEventListener("pageshow", onWake);
    }
  });
}
