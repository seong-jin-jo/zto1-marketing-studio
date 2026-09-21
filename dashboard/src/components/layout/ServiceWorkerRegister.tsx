"use client";

import { useEffect } from "react";

// service worker 등록은 프로덕션에서만. dev 는 next dev 의 HMR·핫리로드와 캐시가
// 충돌해 코드 변경이 반영 안 되는 것처럼 보이는 사고가 흔해 process.env.NODE_ENV 로 막는다.
export function ServiceWorkerRegister() {
  useEffect(() => {
    if (process.env.NODE_ENV !== "production") return;
    if (typeof window === "undefined" || !("serviceWorker" in navigator)) return;
    navigator.serviceWorker.register("/sw.js").catch(() => {
      // 등록 실패는 오프라인 폴백을 못 받는 것일 뿐 앱 동작에는 영향 없다 — 조용히 무시.
    });
  }, []);
  return null;
}
