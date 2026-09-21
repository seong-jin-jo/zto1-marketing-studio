// service worker 캐시/오프라인 판정 순수 함수. 부작용 없음(self·caches·fetch 미사용) —
// sw.js 가 ES 모듈로 import 하고, 유닛 테스트(tests/integrity/sw-cache-policy.test.ts)가
// 같은 파일을 직접 import 해 브라우저 없이 검증한다(PR #73 MAJOR "테스트 부재" 대응).

export function isApiPath(pathname) {
  return pathname.startsWith("/api/");
}

export function isAuthPath(pathname) {
  return pathname.startsWith("/login") || pathname.startsWith("/signup") || pathname.startsWith("/operator");
}

export function isCacheableStatic(pathname) {
  return pathname.startsWith("/_next/static/") || pathname.startsWith("/icons/");
}

// 네비게이션 실패 시 오프라인 폴백을 보여줄지 여부. /api/* 네비게이션(OAuth 콜백 등)은
// 제외한다 — 1회용 인가 code 를 오프라인 페이지의 "다시 시도"로 재요청하면 provider가
// 거부한다(PR #73 MINOR 1, ADR-004 OAuth 연결 플로우 접점).
export function shouldServeOfflineFallback(request, url) {
  if (request.mode !== "navigate") return false;
  return !isApiPath(url.pathname);
}
