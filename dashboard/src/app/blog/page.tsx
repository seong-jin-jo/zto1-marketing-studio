"use client";

import { useState, useEffect } from "react";
import useSWR from "swr";
import { fetcher, apiPost } from "@/lib/api";
import { useToast } from "@/components/layout/Toast";

interface BlogPost {
  id: string;
  title: string;
  content?: string;
  body?: string;
  status: string;
  seoKeyword?: string;
  tags?: string[];
  blogPostUrl?: string;
  viewCount?: number;
  generatedAt?: string;
  approvedAt?: string;
}

interface KeywordBankItem {
  keyword: string;
  totalSearches?: number;
  competition?: string;
  used: boolean;
}

const STATUS_CLASS: Record<string, string> = {
  draft: "bg-warning/15 text-warning",
  approved: "bg-accent-soft text-accent",
  published: "bg-success/15 text-success",
  failed: "bg-danger/15 text-danger",
};

export default function BlogPage() {
  const { data: queueData, mutate: mutateQueue } = useSWR<{ posts: BlogPost[] }>("/api/blog-queue", fetcher);
  const { data: guideData, mutate: mutateGuide } = useSWR<{ guide: string }>("/api/blog-guide", fetcher);
  const { data: kwData, mutate: mutateKw } = useSWR<{ keywords: string[] }>("/api/blog-keywords", fetcher);
  const { data: bankData } = useSWR<{ keywords: KeywordBankItem[] }>("/api/keyword-bank", fetcher);
  const { showToast } = useToast();

  const [tab, setTab] = useState<"queue" | "editor" | "settings">("queue");
  const [editingPost, setEditingPost] = useState<BlogPost | null>(null);
  const [editTitle, setEditTitle] = useState("");
  const [editContent, setEditContent] = useState("");
  const [editTags, setEditTags] = useState("");
  const [editSeoKw, setEditSeoKw] = useState("");
  const [guide, setGuide] = useState("");
  const [keywords, setKeywords] = useState("");
  const [guideLoaded, setGuideLoaded] = useState(false);

  const posts = queueData?.posts || [];
  const bank = (bankData?.keywords || []).filter((k) => !k.used);

  useEffect(() => {
    if (guideData?.guide && !guideLoaded) {
      setGuide(guideData.guide);
      setGuideLoaded(true);
    }
  }, [guideData, guideLoaded]);

  useEffect(() => {
    if (kwData?.keywords) {
      setKeywords(kwData.keywords.join("\n"));
    }
  }, [kwData]);

  const handleApprove = async (id: string) => {
    try {
      await apiPost("/api/blog-queue/approve", { id });
      showToast("블로그 글 승인", "success");
      mutateQueue();
    } catch (e) { showToast(`실패: ${(e as Error).message}`, "error"); }
  };

  const handleDelete = async (id: string) => {
    if (!confirm("삭제?")) return;
    try {
      await apiPost("/api/blog-queue/delete", { id });
      showToast("삭제 완료", "success");
      mutateQueue();
    } catch (e) { showToast(`실패: ${(e as Error).message}`, "error"); }
  };

  const openEditor = (p: BlogPost) => {
    setEditingPost(p);
    setEditTitle(p.title || "");
    setEditContent(p.content || p.body || "");
    setEditTags((p.tags || []).join(", "));
    setEditSeoKw(p.seoKeyword || "");
    setTab("editor");
  };

  const handleSaveEdit = async () => {
    if (!editingPost) return;
    try {
      await apiPost("/api/blog-queue/update", {
        id: editingPost.id,
        title: editTitle,
        content: editContent,
        tags: editTags.split(",").map((t) => t.trim()).filter(Boolean),
        seoKeyword: editSeoKw,
      });
      showToast("저장 완료", "success");
      mutateQueue();
      setEditingPost(null);
      setTab("queue");
    } catch (e) { showToast(`실패: ${(e as Error).message}`, "error"); }
  };

  const handleSaveGuide = async () => {
    try {
      await apiPost("/api/blog-guide", { guide });
      showToast("Content Guide 저장", "success");
      mutateGuide();
    } catch (e) { showToast(`실패: ${(e as Error).message}`, "error"); }
  };

  const handleSaveKeywords = async () => {
    try {
      const kws = keywords.split("\n").map((l) => l.trim()).filter((l) => l && !l.startsWith("#"));
      await apiPost("/api/blog-keywords", { keywords: kws });
      showToast(`${kws.length}개 키워드 저장`, "success");
      mutateKw();
    } catch (e) { showToast(`실패: ${(e as Error).message}`, "error"); }
  };

  const addBankKeyword = (kw: string) => {
    const current = keywords.split("\n").map((l) => l.trim()).filter(Boolean);
    if (current.includes(kw)) { showToast("이미 추가됨", "warning"); return; }
    setKeywords(keywords + "\n" + kw);
    showToast(`"${kw}" 추가`, "success");
  };

  return (
    <div className="px-region py-stack-section">
      <div className="flex items-center justify-between mb-stack-section">
        <div>
          <h2 className="text-subheading font-bold text-text">블로그</h2>
          <p className="text-caption text-subtle mt-micro">학생/학부모 대상 SEO 칼럼 자동화</p>
        </div>
        <div className="flex gap-stack-tight">
          {(["queue", "editor", "settings"] as const).map((t) => (
            <button
              key={t}
              onClick={() => setTab(t)}
              className={`px-stack py-stack-tight text-caption rounded-chip ${tab === t ? "bg-accent text-accent-fg" : "text-subtle hover:bg-surface-2"}`}
            >
              {t === "queue" ? `Queue (${posts.length})` : t === "editor" ? "Editor" : "Settings"}
            </button>
          ))}
        </div>
      </div>

      {/* SEO Flow Guide */}
      {tab === "queue" && (
        <>
          <details className="card p-pad-inset mb-stack-section">
            <summary className="text-body-sm font-medium text-muted cursor-pointer">SEO 콘텐츠 자동화 플로우</summary>
            <div className="mt-stack text-caption text-subtle space-y-stack-tight">
              <div className="flex items-start gap-stack-tight"><span className="text-accent font-bold">1.</span><div><strong className="text-muted">키워드 수집</strong>. 키워드 찾기에서 검색량 높은 키워드를 찾아 블로그 키워드에 추가</div></div>
              <div className="flex items-start gap-stack-tight"><span className="text-accent font-bold">2.</span><div><strong className="text-muted">트렌드 확인</strong>. 네이버 트렌드에서 시즌 키워드 파악 (시험, 방학 등)</div></div>
              <div className="flex items-start gap-stack-tight"><span className="text-accent font-bold">3.</span><div><strong className="text-muted">콘텐츠 생산</strong>. AI가 블로그 키워드와 콘텐츠 지침을 바탕으로 칼럼 초안을 자동 생성</div></div>
              <div className="flex items-start gap-stack-tight"><span className="text-accent font-bold">4.</span><div><strong className="text-muted">검수 + 발행</strong>. 대기 목록에서 초안을 확인하고 수정한 뒤 승인하면 블로그에 자동 발행</div></div>
              <div className="flex items-start gap-stack-tight"><span className="text-accent font-bold">5.</span><div><strong className="text-muted">검색 노출</strong>. Search Console에서 색인 요청 → 검색 노출</div></div>
              <div className="flex items-start gap-stack-tight"><span className="text-accent font-bold">6.</span><div><strong className="text-muted">결과 분석</strong>. 블로그 성과에서 조회수와 검색 클릭 추적</div></div>
              <p className="text-caption text-subtle mt-stack-tight border-t border-border pt-stack-tight">설정 탭에서 콘텐츠 지침과 키워드를 수정하세요.</p>
            </div>
          </details>

          {/* Keyword Bank suggestions */}
          {bank.length > 0 ? (
            <div className="card p-pad-inset mb-pad-inset border-l-2 border-accent">
              <div className="flex items-center justify-between mb-stack-tight">
                <span className="text-body-sm font-medium text-muted">추천 키워드</span>
                <a href="/keyword-planner" className="text-caption text-accent hover:text-accent">더 많은 키워드 찾기 →</a>
              </div>
              <p className="text-caption text-subtle mb-stack-tight">키워드 목록에서 수집된 미사용 키워드입니다.</p>
              <div className="flex flex-wrap gap-stack-tight">
                {bank.slice(0, 10).map((k) => (
                  <span key={k.keyword} className="inline-flex items-center gap-micro px-stack-tight py-micro rounded-pill text-caption border border-accent bg-accent-soft text-accent">
                    {k.keyword}
                    {k.totalSearches ? <span className="text-subtle">{k.totalSearches >= 1000 ? Math.round(k.totalSearches / 1000) + "K" : k.totalSearches}</span> : null}
                  </span>
                ))}
              </div>
            </div>
          ) : (
            <div className="card p-pad-inset mb-pad-inset border-l-2 border-border">
              <div className="flex items-center justify-between">
                <p className="text-caption text-subtle">아직 수집된 키워드가 없습니다.</p>
                <a href="/keyword-planner" className="text-caption text-accent hover:text-accent whitespace-nowrap">키워드 찾기 →</a>
              </div>
            </div>
          )}

          {/* Queue */}
          {posts.length === 0 ? (
            <div className="card p-region text-center"><p className="text-subtle text-body-sm">블로그 글이 없습니다.</p></div>
          ) : (
            <div className="space-y-stack">
              {posts.map((p) => (
                <div key={p.id} className="card p-pad-inset cursor-pointer hover:border-border transition-colors" onClick={() => openEditor(p)}>
                  <div className="flex items-start justify-between mb-stack-tight">
                    <div className="flex items-center gap-stack-tight">
                      <span className={`text-caption px-stack-tight py-micro rounded-chip ${STATUS_CLASS[p.status] || "bg-surface-2 text-muted"}`}>{p.status}</span>
                      {p.seoKeyword && <span className="text-caption px-stack-tight py-micro rounded-chip bg-accent/40 text-accent">{p.seoKeyword}</span>}
                      {p.blogPostUrl && (
                        <a href={p.blogPostUrl} target="_blank" rel="noopener noreferrer" className="text-caption text-accent hover:underline" onClick={(e) => e.stopPropagation()}>보기 →</a>
                      )}
                    </div>
                    <div className="flex items-center gap-stack-tight">
                      {p.viewCount != null && <span className="text-caption text-subtle">조회: {p.viewCount}</span>}
                      <span className="text-caption text-subtle">{p.generatedAt?.split("T")[0] || ""}</span>
                    </div>
                  </div>
                  <h3 className="text-body-sm font-medium text-muted mb-micro">{p.title || ""}</h3>
                  <p className="text-caption text-subtle mb-stack-tight">
                    {(p.content || p.body || "").replace(/<[^>]*>/g, "").slice(0, 150)}...
                  </p>
                  {p.tags && p.tags.length > 0 && (
                    <div className="flex flex-wrap gap-micro mb-stack-tight">
                      {p.tags.slice(0, 8).map((t) => (
                        <span key={t} className="text-caption text-accent">#{t}</span>
                      ))}
                      {p.tags.length > 8 && <span className="text-caption text-subtle">+{p.tags.length - 8}</span>}
                    </div>
                  )}
                  <div className="flex gap-stack-tight mt-stack-tight" onClick={(e) => e.stopPropagation()}>
                    {p.status === "draft" && (
                      <button onClick={() => handleApprove(p.id)} className="px-stack-tight py-micro text-caption bg-success text-status-fg rounded-chip hover:bg-success">승인</button>
                    )}
                    {p.status !== "published" && (
                      <button onClick={() => handleDelete(p.id)} className="px-stack-tight py-micro text-caption bg-danger/15 text-danger rounded-chip hover:bg-danger/25">삭제</button>
                    )}
                  </div>
                </div>
              ))}
            </div>
          )}
        </>
      )}

      {/* Editor Tab */}
      {tab === "editor" && (
        editingPost ? (
          <div className="space-y-pad-inset">
            <button onClick={() => { setEditingPost(null); setTab("queue"); }} className="text-subtle hover:text-muted text-caption">← 대기 목록으로 돌아가기</button>
            <div className="flex items-center gap-stack-tight mb-stack-tight">
              <span className={`text-caption px-stack-tight py-micro rounded-chip ${STATUS_CLASS[editingPost.status] || "bg-surface-2 text-muted"}`}>{editingPost.status}</span>
              <span className="text-caption text-subtle">{editingPost.id.slice(0, 8)}</span>
            </div>
            <div>
              <label className="text-caption text-subtle block mb-micro">SEO 키워드</label>
              <input value={editSeoKw} onChange={(e) => setEditSeoKw(e.target.value)} className="w-full bg-surface-2 text-muted text-body-sm px-stack py-stack-tight rounded-chip border border-border" />
            </div>
            <div>
              <label className="text-caption text-subtle block mb-micro">제목</label>
              <input value={editTitle} onChange={(e) => setEditTitle(e.target.value)} className="w-full bg-surface-2 text-muted text-body-sm px-stack py-stack-tight rounded-chip border border-border" />
            </div>
            <div>
              <label className="text-caption text-subtle block mb-micro">본문 (마크다운)</label>
              <textarea value={editContent} onChange={(e) => setEditContent(e.target.value)} rows={20} className="w-full bg-surface-2 text-muted text-caption p-stack rounded-chip border border-border font-mono leading-relaxed" />
            </div>
            <div>
              <label className="text-caption text-subtle block mb-micro">태그 (쉼표 구분)</label>
              <input value={editTags} onChange={(e) => setEditTags(e.target.value)} className="w-full bg-surface-2 text-muted text-body-sm px-stack py-stack-tight rounded-chip border border-border" />
            </div>
            <div className="flex gap-stack-tight">
              <button onClick={handleSaveEdit} className="px-pad-inset py-stack-tight text-body-sm bg-accent text-accent-fg rounded-chip hover:bg-accent-hover">저장</button>
              {editingPost.status === "draft" && (
                <button onClick={async () => { await handleSaveEdit(); await handleApprove(editingPost.id); }} className="px-pad-inset py-stack-tight text-body-sm bg-success text-status-fg rounded-chip hover:bg-success">저장 후 승인</button>
              )}
              <button onClick={() => { setEditingPost(null); setTab("queue"); }} className="px-pad-inset py-stack-tight text-body-sm bg-surface-2 text-muted rounded-chip">취소</button>
            </div>
          </div>
        ) : (
          <div className="card p-region text-center">
            <p className="text-subtle text-body-sm">대기 목록에서 글을 클릭하여 편집하세요.</p>
            <button onClick={() => setTab("queue")} className="mt-stack px-pad-inset py-stack-tight text-caption bg-surface-2 text-muted rounded-chip hover:bg-surface-2">대기 목록으로 가기</button>
          </div>
        )
      )}

      {/* Settings Tab */}
      {tab === "settings" && (
        <div className="space-y-stack-section">
          {/* Content Guide */}
          <div className="card p-pad-inset">
            <div className="flex items-center justify-between mb-stack">
              <span className="text-body-sm font-medium text-text">콘텐츠 지침</span>
              <span className="text-caption text-subtle">학생/학부모 대상 콘텐츠 전략</span>
            </div>
            <textarea
              value={guide}
              onChange={(e) => setGuide(e.target.value)}
              rows={12}
              className="w-full bg-surface-2 text-muted text-caption p-stack rounded-chip border border-border font-mono leading-relaxed"
            />
            <button onClick={handleSaveGuide} className="mt-stack-tight px-pad-inset py-stack-tight text-caption bg-accent text-accent-fg rounded-chip hover:bg-accent-hover">안내 저장</button>
          </div>

          {/* SEO Keywords */}
          <div className="card p-pad-inset">
            <div className="flex items-center justify-between mb-stack">
              <span className="text-body-sm font-medium text-text">블로그 검색 키워드</span>
              <span className="text-caption text-subtle">학생/학부모 검색어</span>
            </div>
            {bank.length > 0 && (
              <div className="mb-stack p-stack rounded-chip bg-accent-soft border border-accent">
                <p className="text-caption text-accent mb-stack-tight">키워드 목록 ({bank.length}개). 클릭하여 추가</p>
                <div className="flex flex-wrap gap-micro">
                  {bank.map((k) => (
                    <button
                      key={k.keyword}
                      onClick={() => addBankKeyword(k.keyword)}
                      className="text-caption px-stack-tight py-micro rounded-chip bg-accent-soft text-accent hover:bg-accent-hover/50 border border-accent"
                    >
                      {k.keyword} {k.totalSearches ? <span className="text-subtle">{k.totalSearches.toLocaleString()}</span> : null}
                    </button>
                  ))}
                </div>
              </div>
            )}
            <textarea
              value={keywords}
              onChange={(e) => setKeywords(e.target.value)}
              rows={8}
              className="w-full bg-surface-2 text-muted text-caption p-stack rounded-chip border border-border font-mono"
            />
            <button onClick={handleSaveKeywords} className="mt-stack-tight px-pad-inset py-stack-tight text-caption bg-accent text-accent-fg rounded-chip hover:bg-accent-hover">키워드 저장</button>
          </div>
        </div>
      )}
    </div>
  );
}
