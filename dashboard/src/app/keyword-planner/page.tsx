"use client";

import { useState } from "react";
import { BackButton } from "@/components/shared/BackButton";
import useSWR from "swr";
import { fetcher, apiPost } from "@/lib/api";
import { useToast } from "@/components/layout/Toast";

interface KwResult {
  keyword: string;
  pcSearches: number;
  mobileSearches: number;
  totalSearches: number;
  competition: string;
}

interface KeywordBankItem {
  keyword: string;
  source: string;
  addedAt: string;
  used: boolean;
}

export default function KeywordPlannerPage() {
  const [inputKws, setInputKws] = useState("");
  const [results, setResults] = useState<KwResult[]>([]);
  const [searching, setSearching] = useState(false);
  const { showToast } = useToast();

  const { data: bankData, mutate: mutateBank } = useSWR<{ keywords: KeywordBankItem[] }>("/api/keyword-bank", fetcher);
  const bank = bankData?.keywords || [];

  const handleSearch = async () => {
    const kws = inputKws.split(/[,\n]/).map((k) => k.trim().replace(/\s+/g, "")).filter(Boolean);
    if (!kws.length) return;
    setSearching(true);
    try {
      const res = await apiPost<{ results: KwResult[]; error?: string }>("/api/keyword-research", { keywords: kws.slice(0, 5) });
      if (res?.error) {
        showToast(res.error, "error");
      }
      setResults(res?.results || []);
    } catch (e) {
      showToast(`에러: ${(e as Error).message}`, "error");
    } finally {
      setSearching(false);
    }
  };

  const handleAddToBank = async (keyword: string) => {
    try {
      await apiPost("/api/keyword-bank/add", { keyword, source: "planner" });
      showToast(`"${keyword}" 뱅크에 추가`, "success");
      mutateBank();
    } catch (e) {
      showToast(`실패: ${(e as Error).message}`, "error");
    }
  };

  const bankSet = new Set(bank.map((b) => b.keyword));

  const compColor = (comp: string) => {
    if (comp === "높음" || comp === "high") return "text-danger";
    if (comp === "중간" || comp === "medium") return "text-warning";
    return "text-success";
  };

  return (
    <div className="px-region py-stack-section">
      <div className="mb-stack-section">
        <BackButton />
        <h2 className="text-subheading font-bold text-text">키워드 찾기</h2>
        <p className="text-caption text-subtle mt-micro">네이버 검색광고 API 기반 키워드 검색량 조회</p>
      </div>

      {/* Search */}
      <div className="card p-pad-inset mb-stack-section">
        <div className="flex gap-stack-tight">
          <input
            value={inputKws}
            onChange={(e) => setInputKws(e.target.value)}
            placeholder="키워드 입력 (쉼표 또는 줄바꿈 구분, 최대 5개)"
            className="flex-1 bg-surface-2 text-muted text-body-sm px-stack py-stack-tight rounded-chip border border-border"
            onKeyDown={(e) => e.key === "Enter" && handleSearch()}
          />
          <button
            onClick={handleSearch}
            disabled={searching}
            className="px-pad-inset py-stack-tight text-body-sm bg-accent text-accent-fg rounded-chip hover:bg-accent-hover disabled:opacity-50"
          >
            {searching ? "조회 중..." : "조회"}
          </button>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-stack-section">
        {/* Results */}
        <div className="lg:col-span-2">
          <h3 className="text-body-sm font-medium text-muted mb-stack">
            검색 결과 {results.length > 0 && `(${results.length})`}
          </h3>
          {results.length === 0 ? (
            <div className="card p-region text-center">
              <p className="text-subtle text-body-sm">키워드를 입력하고 조회하세요.</p>
            </div>
          ) : (
            <div className="card overflow-hidden">
              <table className="w-full text-body-sm">
                <thead>
                  <tr className="border-b border-border text-subtle text-caption">
                    <th className="text-left px-pad-inset py-stack-tight">키워드</th>
                    <th className="text-right px-pad-inset py-stack-tight">PC</th>
                    <th className="text-right px-pad-inset py-stack-tight">모바일</th>
                    <th className="text-right px-pad-inset py-stack-tight">합계</th>
                    <th className="text-right px-pad-inset py-stack-tight">경쟁도</th>
                    <th className="text-right px-pad-inset py-stack-tight">목록</th>
                  </tr>
                </thead>
                <tbody>
                  {results.map((r) => (
                    <tr key={r.keyword} className="border-b border-border/50 hover:bg-surface/50">
                      <td className="px-pad-inset py-stack-tight text-muted text-caption">{r.keyword}</td>
                      <td className="px-pad-inset py-stack-tight text-right text-muted text-caption">{r.pcSearches.toLocaleString()}</td>
                      <td className="px-pad-inset py-stack-tight text-right text-muted text-caption">{r.mobileSearches.toLocaleString()}</td>
                      <td className="px-pad-inset py-stack-tight text-right text-text text-caption font-medium">{r.totalSearches.toLocaleString()}</td>
                      <td className={`px-pad-inset py-stack-tight text-right text-caption ${compColor(r.competition)}`}>{r.competition || "-"}</td>
                      <td className="px-pad-inset py-stack-tight text-right">
                        {bankSet.has(r.keyword) ? (
                          <span className="text-caption text-success">저장됨</span>
                        ) : (
                          <button
                            onClick={() => handleAddToBank(r.keyword)}
                            className="text-caption text-accent hover:text-accent"
                          >목록에 추가</button>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>

        {/* Keyword Bank */}
        <div>
          <h3 className="text-body-sm font-medium text-muted mb-stack">
            Keyword Bank ({bank.filter((b) => !b.used).length})
          </h3>
          {bank.length === 0 ? (
            <div className="card p-pad-inset text-center"><p className="text-subtle text-caption">키워드 뱅크가 비어 있습니다.</p></div>
          ) : (
            <div className="space-y-micro">
              {bank.filter((b) => !b.used).slice(0, 20).map((b) => (
                <div key={b.keyword} className="card p-stack-tight flex items-center justify-between">
                  <span className="text-caption text-muted">{b.keyword}</span>
                  <span className="text-caption text-subtle">{b.source}</span>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
