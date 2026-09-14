import type { Metadata } from "next";
import "./globals.css";
import { Providers } from "@/components/layout/Providers";
import { ToastContainer } from "@/components/layout/Toast";
import { LoginModal } from "@/components/shared/LoginModal";
import { ConfirmHost } from "@/components/shared/ConfirmHost";
import { AuthGate } from "@/components/shared/AuthGate";
import { ImagePickerModal } from "@/components/queue/ImagePickerModal";
import { ConsentBanner, PrivacySettingsLink } from "@/components/shared/ConsentBanner";
import { RouteTracker } from "@/components/shared/RouteTracker";

export const metadata: Metadata = {
  title: "Marketing Hub",
  description: "Multi-channel marketing automation dashboard",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="ko" suppressHydrationWarning>
      <head>
        {/* FOUC 방지: 첫 페인트 전 테마 적용. 기본 라이트, 저장값 우선. */}
        <script
          dangerouslySetInnerHTML={{
            __html:
              "(function(){try{var t=localStorage.getItem('theme');document.documentElement.setAttribute('data-theme',t==='dark'?'dark':'light');}catch(e){document.documentElement.setAttribute('data-theme','light');}})();",
          }}
        />
        {/* 청크 로드 실패 자동복구: Cloudflare 터널이 간헐 520으로 /_next 청크를 떨구면
            하이드레이션이 통째로 실패해 모든 버튼이 죽는다(2026-07-02 라이브 QA 실측
            "구글 로그인 안 먹음"의 앱측 원인). 스크립트 리소스 에러를 캡처 단계에서 잡아
            15초 가드로 1회 자동 새로고침. 지속 장애면 루프 안 돌고 멈춤. */}
        <script
          dangerouslySetInnerHTML={{
            __html:
              "(function(){try{var K='osmu_chunk_reload';window.addEventListener('error',function(e){var t=e.target;if(t&&t.tagName==='SCRIPT'&&t.src&&t.src.indexOf('/_next/')>-1){var n=Date.now(),l=+(sessionStorage.getItem(K)||0);if(n-l>15000){sessionStorage.setItem(K,String(n));location.reload();}}},true);}catch(_){}})();",
          }}
        />
      </head>
      <body className="min-h-screen">
        <Providers>
          <AuthGate>{children}</AuthGate>
          <ToastContainer />
          <LoginModal />
          <ConfirmHost />
          <ImagePickerModal />
          {/* GA4 consent-gated 트래킹(dashboard/src/lib/analytics/) — 동의 전엔 완전 no-op */}
          <RouteTracker />
          <ConsentBanner />
          <PrivacySettingsLink />
        </Providers>
      </body>
    </html>
  );
}
