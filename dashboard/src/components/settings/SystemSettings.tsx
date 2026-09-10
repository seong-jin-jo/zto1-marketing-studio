"use client";

import { useCronStatus } from "@/hooks/useOverview";
import { fmtTime } from "@/lib/format";
import { Account } from "./Account";

export function SystemSettings() {
  const { data: cronData } = useCronStatus();
  const jobs = (((cronData as Record<string, unknown>)?.jobs || cronData || []) as Array<Record<string, unknown>>);

  return (
    <div className="grid grid-cols-1 md:grid-cols-2 gap-stack-section">
      <div className="card p-stack-section">
        <h3 className="text-body-sm font-medium text-muted mb-pad-inset">예약 작업 상태</h3>
        <p className="text-caption text-subtle mb-stack">자동화 작업 실행 현황</p>
        <div className="space-y-stack">
          {jobs.map((j, i) => {
            const dot = j.lastStatus === "ok" ? "bg-success" : j.lastStatus === "error" ? "bg-danger" : "bg-surface-2";
            return (
              <div key={i} className="flex items-center justify-between">
                <div className="flex items-center gap-stack-tight">
                  <div className={`w-1.5 h-1.5 rounded-pill ${dot}`} />
                  <span className="text-caption text-muted">{String(j.name || "")}</span>
                </div>
                <span className="text-caption text-subtle">
                  {j.lastStatus === "error" ? (
                    <span className="text-danger">오류</span>
                  ) : (
                    j.nextRunAt ? fmtTime(j.nextRunAt) : ""
                  )}
                </span>
              </div>
            );
          })}
        </div>
      </div>
      <div className="space-y-pad-inset">
        <Account />
      </div>
    </div>
  );
}
