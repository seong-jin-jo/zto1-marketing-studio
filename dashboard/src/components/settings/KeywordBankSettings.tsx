"use client";

import { useState } from "react";
import useSWR from "swr";
import { fetcher, apiPost } from "@/lib/api";
import { useToast } from "@/components/layout/Toast";

interface KeywordEntry {
  keyword: string;
  source?: string;
  addedAt?: string;
  used?: boolean;
  usedAt?: string;
}

interface KeywordBank {
  keywords: KeywordEntry[];
}

export function KeywordBankSettings() {
  const { data, mutate } = useSWR<KeywordBank>("/api/keyword-bank", fetcher);
  const { showToast } = useToast();
  const [newKeywords, setNewKeywords] = useState("");
  const [filter, setFilter] = useState<"all" | "unused" | "used">("all");

  const keywords = data?.keywords || [];
  const filtered = filter === "all" ? keywords : keywords.filter((k) => (filter === "used" ? k.used : !k.used));

  const handleAdd = async () => {
    const kws = newKeywords.split("\n").map((k) => k.trim()).filter(Boolean);
    if (!kws.length) return;
    try {
      const res = await apiPost<{ added: number }>("/api/keyword-bank/add", { keywords: kws, source: "manual" });
      showToast(`${res?.added || 0} keywords added`, "success");
      setNewKeywords("");
      mutate();
    } catch (e) {
      showToast(`Error: ${(e as Error).message}`, "error");
    }
  };

  const handleRemove = async (keyword: string) => {
    try {
      await apiPost("/api/keyword-bank/remove", { keyword });
      mutate();
    } catch (e) {
      showToast(`Error: ${(e as Error).message}`, "error");
    }
  };

  const handleMarkUsed = async (keyword: string) => {
    try {
      await apiPost("/api/keyword-bank/mark-used", { keyword });
      mutate();
    } catch (e) {
      showToast(`Error: ${(e as Error).message}`, "error");
    }
  };

  return (
    <div className="space-y-pad-inset">
      <div className="flex items-center justify-between">
        <h3 className="text-body-sm font-medium text-text">키워드 목록</h3>
        <span className="text-caption text-subtle">{keywords.length} total | {keywords.filter((k) => !k.used).length} unused</span>
      </div>

      {/* Add keywords */}
      <div className="card p-pad-inset">
        <label className="text-caption text-subtle block mb-micro">Add keywords (one per line)</label>
        <textarea
          value={newKeywords}
          onChange={(e) => setNewKeywords(e.target.value)}
          rows={3}
          className="w-full bg-surface-2 text-muted text-caption p-stack-tight rounded-chip border border-border font-mono mb-stack-tight"
          placeholder="keyword 1&#10;keyword 2&#10;keyword 3"
        />
        <button onClick={handleAdd} className="px-stack py-stack-tight text-caption bg-accent text-accent-fg rounded-chip hover:bg-accent-hover">추가</button>
      </div>

      {/* Filter */}
      <div className="flex gap-micro">
        {(["all", "unused", "used"] as const).map((f) => (
          <button key={f} onClick={() => setFilter(f)} className={`px-stack-tight py-micro text-caption rounded-chip ${filter === f ? "bg-accent text-accent-fg" : "text-subtle hover:bg-surface-2"}`}>
            {f}
          </button>
        ))}
      </div>

      {/* Keyword list */}
      <div className="card p-pad-inset max-h-80 overflow-auto">
        {filtered.length === 0 ? (
          <p className="text-subtle text-caption text-center">키워드 없음</p>
        ) : (
          <div className="space-y-micro">
            {filtered.map((k) => (
              <div key={k.keyword} className="flex items-center justify-between py-micro border-b border-border/30">
                <div className="flex items-center gap-stack-tight">
                  <span className={`text-caption ${k.used ? "text-subtle line-through" : "text-muted"}`}>{k.keyword}</span>
                  <span className="text-caption text-subtle">{k.source}</span>
                </div>
                <div className="flex gap-micro">
                  {!k.used && (
                    <button onClick={() => handleMarkUsed(k.keyword)} className="text-caption text-success hover:text-success">사용함</button>
                  )}
                  <button onClick={() => handleRemove(k.keyword)} className="text-caption text-danger hover:text-danger">삭제</button>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
