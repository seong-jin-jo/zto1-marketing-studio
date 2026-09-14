"use client";

import { useState } from "react";
import { BackButton } from "@/components/shared/BackButton";
import useSWR from "swr";
import { fetcher } from "@/lib/api";

interface Article {
  id: string;
  title: string;
  viewCount: number;
  tags: string[];
  regDate: string;
}

interface TagStat {
  tag: string;
  count: number;
  totalViews: number;
  avgViews: number;
}

interface BlogStats {
  totalArticles: number;
  totalViews: number;
  avgViews: number;
  dailyDelta: number;
  topArticle: Article | null;
  articles: Article[];
  topTags: TagStat[];
  history: { date: string; totalViews: number }[];
  error?: string;
}

export default function BlogPerformancePage() {
  const { data, isLoading } = useSWR<BlogStats>("/api/blog-stats", fetcher, { revalidateOnFocus: false });
  const [sortBy, setSortBy] = useState<"views" | "date">("views");

  const stats = data || { totalArticles: 0, totalViews: 0, avgViews: 0, dailyDelta: 0, topArticle: null, articles: [], topTags: [], history: [] };
  const articles = [...(stats.articles || [])].sort((a, b) =>
    sortBy === "views" ? b.viewCount - a.viewCount : (b.regDate || "").localeCompare(a.regDate || "")
  );

  return (
    <div className="px-region py-stack-section">
      <div className="mb-stack-section">
        <BackButton />
        <h2 className="text-subheading font-bold text-text">블로그 성과</h2>
        <p className="text-caption text-subtle mt-micro">블로그 게시물 조회수 및 성과 분석</p>
      </div>

      {data?.error && (
        <div className="card p-pad-inset mb-pad-inset border border-warning/40">
          <p className="text-caption text-warning">{data.error}</p>
          <p className="text-caption text-subtle mt-micro">설정 → 채널 → 블로그에서 연결 설정을 확인하세요.</p>
        </div>
      )}

      {/* Summary cards */}
      <div className="grid grid-cols-4 gap-stack mb-stack-section">
        <div className="card p-stack">
          <div className="text-caption text-subtle mb-micro">총 게시물</div>
          <div className="text-lead font-bold text-text">{stats.totalArticles}</div>
        </div>
        <div className="card p-stack">
          <div className="text-caption text-subtle mb-micro">총 조회수</div>
          <div className="text-lead font-bold text-text">{stats.totalViews.toLocaleString()}</div>
        </div>
        <div className="card p-stack">
          <div className="text-caption text-subtle mb-micro">평균 조회수</div>
          <div className="text-lead font-bold text-text">{stats.avgViews}</div>
        </div>
        <div className="card p-stack">
          <div className="text-caption text-subtle mb-micro">일일 증감</div>
          <div className={`text-lead font-bold ${stats.dailyDelta >= 0 ? "text-success" : "text-danger"}`}>
            {stats.dailyDelta >= 0 ? "+" : ""}{stats.dailyDelta}
          </div>
        </div>
      </div>

      {/* Top article */}
      {stats.topArticle && (
        <div className="card p-pad-inset mb-stack-section border border-warning/30">
          <div className="text-caption text-warning mb-micro">최고 성과 글</div>
          <h3 className="text-body-sm font-medium text-muted">{stats.topArticle.title}</h3>
          <span className="text-caption text-subtle">{stats.topArticle.viewCount.toLocaleString()} views</span>
        </div>
      )}

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-stack-section">
        {/* Articles list */}
        <div className="lg:col-span-2">
          <div className="flex items-center justify-between mb-stack">
            <h3 className="text-body-sm font-medium text-muted">게시물 목록</h3>
            <div className="flex gap-micro">
              <button
                onClick={() => setSortBy("views")}
                className={`px-stack-tight py-micro text-caption rounded-chip ${sortBy === "views" ? "bg-accent text-accent-fg" : "text-subtle hover:bg-surface-2"}`}
              >조회순</button>
              <button
                onClick={() => setSortBy("date")}
                className={`px-stack-tight py-micro text-caption rounded-chip ${sortBy === "date" ? "bg-accent text-accent-fg" : "text-subtle hover:bg-surface-2"}`}
              >최신순</button>
            </div>
          </div>
          {isLoading ? (
            <div className="card p-region text-center"><p className="text-subtle text-body-sm">로딩 중...</p></div>
          ) : articles.length === 0 ? (
            <div className="card p-region text-center"><p className="text-subtle text-body-sm">게시물이 없습니다.</p></div>
          ) : (
            <div className="space-y-stack-tight">
              {articles.map((a) => (
                <div key={a.id} className="card p-stack flex items-center justify-between">
                  <div className="flex-1 min-w-0 mr-stack">
                    <h4 className="text-body-sm text-muted truncate">{a.title}</h4>
                    <div className="flex gap-micro mt-micro">
                      {(a.tags || []).slice(0, 3).map((t) => (
                        <span key={t} className="text-caption text-accent">#{t}</span>
                      ))}
                    </div>
                  </div>
                  <div className="text-right flex-shrink-0">
                    <div className="text-body-sm font-medium text-text">{a.viewCount.toLocaleString()}</div>
                    <div className="text-caption text-subtle">{a.regDate?.split("T")[0] || ""}</div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Tag stats + History */}
        <div className="space-y-stack-section">
          <div>
            <h3 className="text-body-sm font-medium text-muted mb-stack">태그별 성과</h3>
            {(stats.topTags || []).length === 0 ? (
              <div className="card p-pad-inset text-center"><p className="text-subtle text-caption">데이터 없음</p></div>
            ) : (
              <div className="space-y-micro">
                {stats.topTags.map((t) => (
                  <div key={t.tag} className="card p-stack-tight flex items-center justify-between">
                    <span className="text-caption text-accent">#{t.tag}</span>
                    <div className="flex gap-stack text-caption text-subtle">
                      <span>{t.count}편</span>
                      <span>평균 {t.avgViews}</span>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>

          <div>
            <h3 className="text-body-sm font-medium text-muted mb-stack">일별 조회수 추이</h3>
            {(stats.history || []).length === 0 ? (
              <div className="card p-pad-inset text-center"><p className="text-subtle text-caption">히스토리 없음</p></div>
            ) : (
              <div className="space-y-micro">
                {stats.history.map((h) => (
                  <div key={h.date} className="flex items-center justify-between px-stack-tight py-micro">
                    <span className="text-caption text-subtle">{h.date}</span>
                    <span className="text-caption text-muted">{h.totalViews.toLocaleString()}</span>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
