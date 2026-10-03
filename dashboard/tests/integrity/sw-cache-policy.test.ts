import { describe, expect, it } from "vitest";
import {
  isApiPath,
  isAuthPath,
  isCacheableStatic,
  shouldServeOfflineFallback,
} from "../../public/sw-cache-policy.js";

// sw.js가 실제로 import하는 그 파일을 직접 검증한다(PR #73 코드리뷰 MAJOR "테스트 부재").
// self/caches/fetch를 안 쓰는 순수 함수라 브라우저·service worker 환경 없이 그대로 돈다.

describe("SW-POLICY-01 API·인증 경로는 캐시 대상이 아니다", () => {
  it("정상: /api/* 경로는 캐시 대상이 아니다", () => {
    expect(isApiPath("/api/connect/instagram/callback")).toBe(true);
    expect(isApiPath("/api/health")).toBe(true);
  });

  it("거절: /api로 시작하지 않는 경로는 API 경로가 아니다", () => {
    expect(isApiPath("/studio")).toBe(false);
    expect(isApiPath("/apicheck")).toBe(false); // 접두만 같고 슬래시 없는 경로는 오탐 금지
  });

  it("정상: /login·/signup·/operator는 인증 경로다", () => {
    expect(isAuthPath("/login")).toBe(true);
    expect(isAuthPath("/signup")).toBe(true);
    expect(isAuthPath("/operator/customers")).toBe(true);
  });

  it("거절: 그 외 경로는 인증 경로가 아니다", () => {
    expect(isAuthPath("/settings")).toBe(false);
  });
});

describe("SW-POLICY-02 정적 자산만 캐시 대상이다", () => {
  it("정상: /_next/static/*와 /icons/*는 캐시 대상이다", () => {
    expect(isCacheableStatic("/_next/static/chunks/app/layout-abc123.js")).toBe(true);
    expect(isCacheableStatic("/icons/icon-192.png")).toBe(true);
  });

  it("거절: /_next/data나 API 응답은 캐시 대상이 아니다", () => {
    expect(isCacheableStatic("/_next/data/build-id/studio.json")).toBe(false);
    expect(isCacheableStatic("/api/studio/generate")).toBe(false);
  });
});

describe("SW-POLICY-03 오프라인 폴백은 /api 네비게이션을 건드리지 않는다", () => {
  it("정상: 일반 페이지 네비게이션이 실패하면 폴백을 보여준다", () => {
    const request = { mode: "navigate" } as Request;
    const url = new URL("https://example.com/studio");
    expect(shouldServeOfflineFallback(request, url)).toBe(true);
  });

  it("거절: /api/ 네비게이션(OAuth 콜백 등)은 폴백 없이 통과시킨다", () => {
    const request = { mode: "navigate" } as Request;
    const url = new URL("https://example.com/api/connect/threads/callback?code=one-time-use");
    expect(shouldServeOfflineFallback(request, url)).toBe(false);
  });

  it("거절: navigate가 아닌 요청(정적 자산 등)은 폴백 판정 대상이 아니다", () => {
    const request = { mode: "cors" } as Request;
    const url = new URL("https://example.com/_next/static/chunks/main.js");
    expect(shouldServeOfflineFallback(request, url)).toBe(false);
  });
});
