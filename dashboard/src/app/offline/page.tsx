"use client";

import { Button } from "@/components/shared/Button";

// service worker 가 네비게이션 실패 시 보여주는 오프라인 폴백. AuthGate 의 공개 경로 목록에
// 포함되어 있어 사이드바·인증 없이 풀스크린으로 렌더된다. onClick 이 있어 클라이언트 컴포넌트다
// (metadata export는 클라이언트 컴포넌트에서 못 쓰므로 title은 layout 기본값을 따른다).
export default function OfflinePage() {
  return (
    <div className="min-h-screen w-full bg-bg flex items-center justify-center px-stack-section">
      <div className="card p-region w-full max-w-sm text-center">
        <h1 className="text-lead font-bold text-text mb-stack-tight">연결이 끊겼습니다</h1>
        <p className="text-body-sm text-subtle mb-stack-section">인터넷 연결을 확인한 뒤 다시 시도해 주세요.</p>
        <Button onClick={() => window.location.reload()} variant="primary" className="min-w-full w-full">
          다시 시도
        </Button>
      </div>
    </div>
  );
}
