"use client";

import { useState, useEffect } from "react";
import { useTokenStatus } from "@/hooks/useOverview";
import { apiPost } from "@/lib/api";
import { useToast } from "@/components/layout/Toast";
import { fmtAgo } from "@/lib/format";

export function ClaudeToken() {
  const { data: tokenStatus, mutate } = useTokenStatus();
  const { showToast } = useToast();
  const [saving, setSaving] = useState(false);
  const [showToken, setShowToken] = useState(false);
  const [editing, setEditing] = useState(false);
  const [tokenValue, setTokenValue] = useState("");

  const claude = (tokenStatus as Record<string, unknown>)?.claude as Record<string, unknown> | undefined;
  const currentToken = (claude?.token as string) || "";
  const hasToken = !!currentToken;

  useEffect(() => {
    setTokenValue(currentToken);
  }, [currentToken]);

  const handleSave = async () => {
    const token = tokenValue.trim();
    if (!token) { showToast("토큰을 입력하세요", "warning"); return; }
    if (!token.startsWith("sk-ant-")) { showToast("잘못된 토큰 형식 (sk-ant-...)", "error"); return; }
    setSaving(true);
    try {
      const r = await apiPost<{ ok: boolean; type: string }>("/api/claude-token", { token });
      if (r?.ok) {
        showToast(`Claude 토큰 업데이트 완료 (${r.type})`, "success");
        // 저장한 값 유지 — mutate 전에 tokenValue를 보존
        const savedToken = token;
        setEditing(false);
        await mutate();
        setTokenValue(savedToken);
      }
    } catch (e) { showToast((e as Error).message, "error"); }
    finally { setSaving(false); }
  };

  const editable = editing || !hasToken;

  return (
    <div className="card p-stack-section">
      <div className="flex items-center justify-between mb-pad-inset">
        <h3 className="text-body-sm font-medium text-muted">Claude 토큰</h3>
        <div className="flex items-center gap-stack-tight">
          {claude && (
            <span className={`text-caption px-stack-tight py-micro rounded-chip ${claude.healthy ? "bg-success/15 text-success" : "bg-danger/15 text-danger"}`}>
              {claude.healthy ? "Healthy" : "Error"}
            </span>
          )}
          {claude && <span className="text-caption text-subtle">{String(claude.type || "token")}</span>}
          {hasToken && !editing && (
            <button onClick={() => setEditing(true)} className="text-caption text-accent hover:text-accent">수정</button>
          )}
        </div>
      </div>

      {claude && (
        <div className="space-y-micro text-caption mb-stack">
          <div className="flex justify-between">
            <span className="text-subtle">오류</span>
            <span className={Number(claude.errorCount) > 0 ? "text-danger" : "text-subtle"}>{String(claude.errorCount)}</span>
          </div>
          <div className="flex justify-between">
            <span className="text-subtle">최근 사용</span>
            <span className="text-subtle">{claude.lastUsed ? fmtAgo(claude.lastUsed) : "-"}</span>
          </div>
        </div>
      )}

      <div className="space-y-stack">
        <div>
          <label className="text-caption text-subtle block mb-micro">Setup Token 또는 API Key</label>
          <div className="relative">
            <input
              type={showToken ? "text" : "password"}
              value={tokenValue}
              onChange={(e) => setTokenValue(e.target.value)}
              readOnly={!editable}
              title={tokenValue}
              placeholder="sk-ant-oat01-... or sk-ant-api..."
              className={`w-full ${editable ? "bg-surface" : "bg-surface/50 cursor-default"} border border-border rounded-chip px-stack py-stack-tight pr-wide text-caption text-muted placeholder-gray-600 font-mono`}
            />
            {tokenValue && (
              <button
                type="button"
                onClick={() => setShowToken(!showToken)}
                className="absolute right-2 top-1/2 -translate-y-1/2 text-caption text-subtle hover:text-muted"
              >
                {showToken ? "Hide" : "Show"}
              </button>
            )}
          </div>
        </div>
        <details className="text-caption">
          <summary className="text-accent hover:text-accent cursor-pointer">설정 안내</summary>
          <div className="mt-stack-tight p-stack-tight rounded-chip bg-surface/50 text-subtle space-y-micro">
            <p>1. 터미널에서 <code className="bg-surface-2 px-micro rounded-chip">claude setup-token</code> 실행</p>
            <p>2. 브라우저에서 Anthropic 로그인</p>
            <p>3. 생성된 <code className="bg-surface-2 px-micro rounded-chip">sk-ant-oat01-...</code> 토큰 복사</p>
            <p>4. 위 필드에 붙여넣기 → Update Token</p>
          </div>
        </details>
        {editable && (
          <div className="flex gap-stack-tight">
            <button
              onClick={handleSave}
              disabled={saving}
              className="flex-1 py-stack-tight bg-accent text-accent-fg text-body-sm rounded-chip hover:bg-accent-hover disabled:opacity-50"
            >
              {saving ? "Updating..." : hasToken ? "Update Token" : "Connect"}
            </button>
            {hasToken && editing && (
              <button
                onClick={() => { setEditing(false); setTokenValue(currentToken); }}
                className="px-pad-inset py-stack-tight bg-surface-2 text-muted text-body-sm rounded-chip hover:bg-surface-2"
              >
                취소
              </button>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
