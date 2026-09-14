"use client";

import { getAuthToken, clearAuthToken } from "@/lib/auth";

export function Account() {
  const hasAuth = typeof window !== "undefined" && !!getAuthToken();

  const handleLogout = () => {
    clearAuthToken();
    window.location.reload();
  };

  const handleChangeToken = () => {
    clearAuthToken();
    window.location.reload();
  };

  return (
    <div className="card p-stack-section">
      <h3 className="text-body-sm font-medium text-muted mb-pad-inset">계정</h3>
      <div className="space-y-stack-tight text-body-sm">
        <div className="flex justify-between">
          <span className="text-subtle">인증</span>
          <span className="text-muted">{hasAuth ? "Token set" : "No auth"}</span>
        </div>
      </div>
      {hasAuth ? (
        <div className="flex gap-stack-tight mt-pad-inset">
          <button onClick={handleLogout} className="px-pad-inset py-stack-tight text-caption bg-surface-2 text-muted rounded-chip hover:bg-surface-2">
            로그아웃
          </button>
          <button onClick={handleChangeToken} className="px-pad-inset py-stack-tight text-caption bg-surface-2 text-muted rounded-chip hover:bg-surface-2">
            인증 토큰 변경
          </button>
        </div>
      ) : null}
    </div>
  );
}
