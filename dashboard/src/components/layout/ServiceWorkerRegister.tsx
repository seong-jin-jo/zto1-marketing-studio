"use client";

import { useEffect } from "react";

// service worker 등록은 프로덕션에서만. ES 모듈로 등록해 sw.js가 sw-cache-policy.js를
// import할 수 있게 한다. 등록 URL에 빌드 버전을 섞는다(next.config.ts의
// NEXT_PUBLIC_BUILD_ID) — 배포마다 스크립트 URL이 달라져야 브라우저가 SW를 무조건 새로
// 받고, sw.js activate의 구버전 캐시 정리가 실제로 돈다(PR #73 코드리뷰 MAJOR: 상수
// 캐시명은 배포해도 절대 안 바뀌어 /_next/static 청크가 무한히 쌓였다).
export function ServiceWorkerRegister() {
  useEffect(() => {
    if (typeof window === "undefined" || !("serviceWorker" in navigator)) return;

    if (process.env.NODE_ENV !== "production") {
      // dev에서 과거에(예: next build && next start를 같은 origin에서 한 번이라도 돌린
      // 뒤) 등록된 SW가 남아 있으면, dev 청크는 해시가 없어 캐시 우선 분기가 옛 청크를
      // 영원히 돌려준다 — "코드 변경이 반영 안 되는 것처럼 보이는" 사고(PR #73 MAJOR).
      // dev에서는 매번 잔존 SW를 걷어낸다.
      navigator.serviceWorker
        .getRegistrations()
        .then((registrations) => {
          registrations.forEach((registration) => {
            void registration.unregister();
          });
        })
        .catch(() => undefined);
      return;
    }

    const buildVersion = process.env.NEXT_PUBLIC_BUILD_ID ?? "dev";
    navigator.serviceWorker.register(`/sw.js?v=${buildVersion}`, { type: "module" }).catch(() => {
      // 등록 실패는 오프라인 폴백을 못 받는 것일 뿐 앱 동작에는 영향 없다 — 조용히 무시.
    });
  }, []);
  return null;
}
