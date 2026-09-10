"use client";

import { useState } from "react";
import useSWR from "swr";
import { apiPost, fetcher } from "@/lib/api";
import { useToast } from "@/components/layout/Toast";

interface RuntimeData {
  mode: "gateway" | "cli";
}

export function AIEngine() {
  const { data: runtimeData, mutate } = useSWR<RuntimeData>("/api/ai-runtime", fetcher);
  const { showToast } = useToast();
  const [switching, setSwitching] = useState(false);

  const mode = runtimeData?.mode || "gateway";

  const handleModeSwitch = async (newMode: string) => {
    if (newMode === mode) return;
    setSwitching(true);
    try {
      const r = await apiPost<{ ok: boolean; message: string; gateway: string }>("/api/ai-runtime", { action: "set-mode", mode: newMode });
      if (r?.ok) {
        showToast(r.message || "전환 완료", "success");
        if (r.gateway && r.gateway !== "ok") showToast(r.gateway, "warning");
      }
      mutate();
    } catch (e) { showToast(`전환 실패: ${(e as Error).message}`, "error"); }
    finally { setSwitching(false); }
  };

  return (
    <div className="card p-stack-section">
      <h3 className="text-body-sm font-medium text-muted mb-stack">실행 환경</h3>
      <div className="grid grid-cols-2 gap-stack-tight">
        <button onClick={() => handleModeSwitch("gateway")} disabled={switching} className={`p-stack rounded-chip border text-left transition-colors disabled:opacity-50 ${mode === "gateway" ? "border-accent bg-accent-soft" : "border-border hover:border-border"}`}>
          <div className="text-caption font-medium text-muted">OpenClaw Gateway</div>
          <div className="text-caption text-subtle mt-micro">추가 사용량 과금</div>
        </button>
        <button onClick={() => handleModeSwitch("cli")} disabled={switching} className={`p-stack rounded-chip border text-left transition-colors disabled:opacity-50 ${mode === "cli" ? "border-success bg-success/10" : "border-border hover:border-border"}`}>
          <div className="text-caption font-medium text-muted">Claude CLI</div>
          <div className="text-caption text-success/70 mt-micro">요금제 사용량 (Max 요금제)</div>
        </button>
      </div>
      {switching && <p className="text-caption text-warning mt-stack-tight">전환 중... Gateway 재시작 포함 (~15초)</p>}
      <p className="text-caption text-subtle mt-stack">전환 시 Gateway 자동 재시작. 크론잡 상태 자동 이관.</p>
    </div>
  );
}
