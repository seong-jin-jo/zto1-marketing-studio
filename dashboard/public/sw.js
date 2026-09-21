// OSMU 스튜디오 최소 service worker. 범위: 설치 가능 + 앱 셸 캐시 + 오프라인 폴백까지만
// (회장 2026-09-22 "pwa 만들어서 배포는 빨리 해놓고" — 고도화된 캐시 전략·푸시는 범위 밖).
// ES 모듈로 등록된다(ServiceWorkerRegister.tsx가 { type: "module" }로 register).
// 경로 판정은 sw-cache-policy.js에 순수 함수로 분리해 브라우저 없이 유닛 테스트한다
// (PR #73 코드리뷰 MAJOR "테스트 부재" 대응).
import { isApiPath, isAuthPath, isCacheableStatic, shouldServeOfflineFallback } from "./sw-cache-policy.js";

// 등록 URL의 ?v=<빌드ID>를 캐시 키에 섞는다. 상수 캐시명은 배포해도 절대 안 바뀌어
// activate의 구버전 정리가 한 번도 안 돌고 /_next/static 청크가 무한히 쌓인다
// (PR #73 코드리뷰 MAJOR — next.config.ts의 NEXT_PUBLIC_BUILD_ID, ServiceWorkerRegister.tsx 참고).
const BUILD_VERSION = new URL(self.location.href).searchParams.get("v") || "dev";
const CACHE_NAME = `osmu-shell-${BUILD_VERSION}`;
const OFFLINE_URL = "/offline.html";
const APP_SHELL = [OFFLINE_URL];

self.addEventListener("install", (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => cache.addAll(APP_SHELL)).catch(() => undefined)
  );
  self.skipWaiting();
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) => Promise.all(keys.filter((key) => key !== CACHE_NAME).map((key) => caches.delete(key))))
      .then(() => self.clients.claim())
  );
});

self.addEventListener("fetch", (event) => {
  const { request } = event;
  const url = new URL(request.url);
  if (url.origin !== self.location.origin) return;

  // 네비게이션(페이지 이동): 네트워크 우선, 실패하면 오프라인 폴백.
  // /api/* 네비게이션(OAuth 콜백 등)은 손대지 않고 그대로 통과시킨다 — shouldServeOfflineFallback
  // 이 false를 주면 여기서 일찍 return해 브라우저 기본 동작에 맡긴다(PR #73 MINOR 1).
  //
  // 알려진 한계(범위 밖, PR #73 MINOR): Cloudflare 터널이 520/522를 주면 fetch()는 reject가
  // 아니라 그 오류 페이지를 담은 정상 Response로 resolve된다. 그 경우 이 catch는 안 타고
  // 오프라인 폴백 대신 Cloudflare 오류 HTML이 그대로 보인다. 실제 오프라인(네트워크 단절)만
  // 이 폴백의 대상이다.
  if (request.mode === "navigate") {
    if (!shouldServeOfflineFallback(request, url)) return;
    event.respondWith(
      fetch(request).catch(() => caches.match(OFFLINE_URL).then((cached) => cached ?? Response.error()))
    );
    return;
  }

  // 2중 방어선: 아래 정적 캐시 분기가 이미 /_next/static·/icons만 취급하므로 API·인증
  // 경로는 사실 이 지점에 도달해도 캐시되지 않는다. 그래도 의도를 명시적으로 남긴다.
  if (isApiPath(url.pathname) || isAuthPath(url.pathname)) return;

  // 정적 자산: 캐시 우선, 없으면 네트워크에서 받아 채운다.
  if (isCacheableStatic(url.pathname)) {
    event.respondWith(
      caches.match(request).then((cached) => {
        if (cached) return cached;
        return fetch(request).then((response) => {
          if (response.ok) {
            const clone = response.clone();
            caches.open(CACHE_NAME).then((cache) => cache.put(request, clone));
          }
          return response;
        });
      })
    );
  }
});
