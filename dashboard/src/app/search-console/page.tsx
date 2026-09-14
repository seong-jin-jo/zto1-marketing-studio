"use client";

import { useState } from "react";
import { BackButton } from "@/components/shared/BackButton";
import useSWR from "swr";
import { fetcher } from "@/lib/api";

interface GscRow {
  key: string;
  clicks: number;
  impressions: number;
  ctr: number;
  position: number;
}

interface GscData {
  totalClicks: number;
  totalImpressions: number;
  avgCtr: number;
  avgPosition: number;
  rows: GscRow[];
  cached?: boolean;
  error?: string;
}

export default function SearchConsolePage() {
  const [days, setDays] = useState(28);
  const [dimension, setDimension] = useState<"query" | "page">("query");
  const [siteUrl, setSiteUrl] = useState("");

  const { data, isLoading } = useSWR<GscData>(
    siteUrl ? `/api/gsc-analytics?site=${encodeURIComponent(siteUrl)}&days=${days}&dimension=${dimension}` : null,
    fetcher,
    { revalidateOnFocus: false }
  );

  const stats = data || { totalClicks: 0, totalImpressions: 0, avgCtr: 0, avgPosition: 0, rows: [] };

  return (
    <div className="px-region py-stack-section">
      <div className="flex items-center justify-between mb-stack-section">
        <div>
          <BackButton />
          <h2 className="text-subheading font-bold text-text">Search Console</h2>
          <p className="text-caption text-subtle mt-micro">Google 검색 성과</p>
        </div>
        <div className="flex gap-stack-tight">
          <input
            value={siteUrl}
            onChange={(e) => setSiteUrl(e.target.value)}
            placeholder="sc-domain:example.com"
            className="bg-surface-2 text-muted text-caption px-stack-tight py-micro rounded-chip border border-border w-48"
          />
          {[7, 28, 90].map((d) => (
            <button
              key={d}
              onClick={() => setDays(d)}
              className={`px-stack-tight py-micro text-caption rounded-chip ${days === d ? "bg-accent text-accent-fg" : "text-subtle hover:bg-surface-2"}`}
            >{d}일</button>
          ))}
          <select
            value={dimension}
            onChange={(e) => setDimension(e.target.value as "query" | "page")}
            className="bg-surface-2 text-muted text-caption px-stack-tight py-micro rounded-chip border border-border"
          >
            <option value="query">검색어</option>
            <option value="page">페이지</option>
          </select>
        </div>
      </div>

      {data?.error && (
        <div className="card p-pad-inset mb-pad-inset border border-warning/40">
          <p className="text-caption text-warning">{data.error}</p>
          <p className="text-caption text-subtle mt-micro">설정 → 채널 → Search Console에서 서비스 계정을 설정하세요.</p>
        </div>
      )}

      {data?.cached && (
        <div className="card p-stack-tight mb-pad-inset border border-border">
          <p className="text-caption text-subtle">캐시된 데이터 표시 중 (API 호출 실패)</p>
        </div>
      )}

      {/* Summary */}
      <div className="grid grid-cols-4 gap-stack mb-stack-section">
        <div className="card p-stack">
          <div className="text-caption text-subtle mb-micro">클릭수</div>
          <div className="text-lead font-bold text-text">{stats.totalClicks.toLocaleString()}</div>
        </div>
        <div className="card p-stack">
          <div className="text-caption text-subtle mb-micro">노출수</div>
          <div className="text-lead font-bold text-text">{stats.totalImpressions.toLocaleString()}</div>
        </div>
        <div className="card p-stack">
          <div className="text-caption text-subtle mb-micro">평균 CTR</div>
          <div className="text-lead font-bold text-text">{stats.avgCtr}%</div>
        </div>
        <div className="card p-stack">
          <div className="text-caption text-subtle mb-micro">평균 순위</div>
          <div className="text-lead font-bold text-text">{stats.avgPosition}</div>
        </div>
      </div>

      {/* Table */}
      {isLoading ? (
        <div className="card p-region text-center"><p className="text-subtle text-body-sm">로딩 중...</p></div>
      ) : (stats.rows || []).length === 0 ? (
        <div className="card p-region text-center"><p className="text-subtle text-body-sm">데이터가 없습니다.</p></div>
      ) : (
        <div className="card overflow-hidden">
          <table className="w-full text-body-sm">
            <thead>
              <tr className="border-b border-border text-subtle text-caption">
                <th className="text-left px-pad-inset py-stack-tight">{dimension === "query" ? "검색어" : "페이지"}</th>
                <th className="text-right px-pad-inset py-stack-tight">클릭</th>
                <th className="text-right px-pad-inset py-stack-tight">노출</th>
                <th className="text-right px-pad-inset py-stack-tight">CTR</th>
                <th className="text-right px-pad-inset py-stack-tight">순위</th>
              </tr>
            </thead>
            <tbody>
              {stats.rows.map((r) => (
                <tr key={r.key} className="border-b border-border/50 hover:bg-surface/50">
                  <td className="px-pad-inset py-stack-tight text-muted text-caption truncate max-w-xs">{r.key}</td>
                  <td className="px-pad-inset py-stack-tight text-right text-muted text-caption">{r.clicks}</td>
                  <td className="px-pad-inset py-stack-tight text-right text-muted text-caption">{r.impressions.toLocaleString()}</td>
                  <td className="px-pad-inset py-stack-tight text-right text-muted text-caption">{r.ctr}%</td>
                  <td className="px-pad-inset py-stack-tight text-right text-muted text-caption">{r.position}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
