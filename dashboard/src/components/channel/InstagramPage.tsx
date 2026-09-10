"use client";

import { useState, useEffect, useCallback } from "react";
import useSWR from "swr";
import { fetcher, apiPost, handleUnauthorizedResponse } from "@/lib/api";
import { getAuthToken } from "@/lib/auth";
import { useChannelConfig } from "@/hooks/useChannelConfig";
import { useToast } from "@/components/layout/Toast";
import { useUIStore } from "@/store/ui-store";
import { setupGuides } from "@/lib/setup-guides";
import { CredentialForm } from "@/components/shared/CredentialForm";
import { SocialConnectButton } from "@/components/channel/SocialConnectButton";
import { AccountManager } from "@/components/channel/AccountManager";
import { SetupGuide } from "@/components/shared/SetupGuide";
import { ContentGuide } from "./ContentGuide";
import { KeywordsEditor } from "./KeywordsEditor";
import { QueueList } from "@/components/queue/QueueList";
import { BackButton } from "@/components/shared/BackButton";
import { Button } from "@/components/shared/Button";
import { TenantAutomationSettings } from "./TenantAutomationSettings";
import { ChannelTabs } from "./ChannelTabs";
import { AnalyticsTab } from "./ChannelPage";
import { isChannelTabEnabled } from "@/lib/channel-capabilities";

/* ---------- Card News Editor ---------- */
interface CardEditorState {
  title: string;
  slides: string[];
  style: string;
  ending: string;
  caption: string;
  hashtags: string;
  generating: boolean;
  outlining: boolean;
  result: { slides: string[]; batchId?: string; totalSlides: number } | null;
}

function CardNewsEditor({ onReload, editingPostId, onBackToQueue }: { onReload: () => void; editingPostId?: string | null; onBackToQueue?: () => void }) {
  const { showToast } = useToast();
  const [mjGenerating, setMjGenerating] = useState(false);
  const [ed, setEd] = useState<CardEditorState>({
    title: "", slides: [""], style: "dark", ending: "", caption: "", hashtags: "",
    generating: false, outlining: false, result: null,
  });

  const aiOutline = async () => {
    const title = (document.getElementById("card-title") as HTMLInputElement)?.value?.trim();
    if (!title) { showToast("주제를 입력하세요", "warning"); return; }
    setEd(prev => ({ ...prev, title, outlining: true }));
    try {
      const r = await apiPost<{ success: boolean; slides?: string[]; caption?: string; hashtags?: string[] }>("/api/card-news/outline", { title });
      if (r?.success) {
        setEd(prev => ({
          ...prev,
          outlining: false,
          slides: r.slides || [""],
          caption: r.caption || "",
          hashtags: (r.hashtags || []).map(h => "#" + h).join(" "),
        }));
        showToast(`${r.slides?.length || 0}장 초안 생성 완료`, "success");
      } else { setEd(prev => ({ ...prev, outlining: false })); }
    } catch (e) { showToast((e as Error).message, "error"); setEd(prev => ({ ...prev, outlining: false })); }
  };

  const generate = async () => {
    const title = (document.getElementById("card-title") as HTMLInputElement)?.value || "";
    const ending = (document.getElementById("card-ending") as HTMLInputElement)?.value || "";
    // read slide textareas
    const slideEls = document.querySelectorAll<HTMLTextAreaElement>("[data-card-slide]");
    const slides = [...slideEls].map(el => el.value);
    if (!title) { showToast("제목을 입력하세요", "warning"); return; }
    if (!slides.some(s => s.trim())) { showToast("슬라이드 내용을 입력하세요", "warning"); return; }

    setEd(prev => ({ ...prev, title, ending, generating: true }));
    try {
      const r = await apiPost<{ success: boolean; batchId: string; slides: string[]; totalSlides: number }>(
        "/api/card-news/generate",
        { title, slides: slides.filter(s => s.trim()), style: ed.style, ending: ending || title },
      );
      if (r?.success) {
        setEd(prev => ({ ...prev, generating: false, result: r }));
        showToast(`카드뉴스 ${r.totalSlides}장 생성 완료`, "success");
      } else { setEd(prev => ({ ...prev, generating: false })); }
    } catch (e) { showToast((e as Error).message, "error"); setEd(prev => ({ ...prev, generating: false })); }
  };

  const saveDraft = async () => {
    if (!ed.result) return;
    const caption = (document.getElementById("card-caption") as HTMLTextAreaElement)?.value || ed.title;
    const hashStr = (document.getElementById("card-hashtags") as HTMLInputElement)?.value || "";
    const hashtags = hashStr.split(/[#\s]+/).filter(h => h.trim());
    try {
      if (editingPostId) {
        await apiPost(`/api/queue/${editingPostId}/update`, {
          text: caption, hashtags,
          imageUrl: ed.result.slides[0], imageUrls: ed.result.slides, cardBatchId: ed.result.batchId,
        });
        showToast("Draft 업데이트됨", "success");
      } else {
        const r = await apiPost<{ success: boolean }>("/api/queue/add", {
          text: caption, topic: "instagram-card", hashtags,
          imageUrl: ed.result.slides[0], imageUrls: ed.result.slides, cardBatchId: ed.result.batchId,
        });
        if (r?.success) showToast("큐에 Draft 저장됨", "success");
      }
      setEd({ title: "", slides: [""], style: "dark", ending: "", caption: "", hashtags: "", generating: false, outlining: false, result: null });
      onReload();
      if (editingPostId && onBackToQueue) onBackToQueue();
    } catch (e) { showToast((e as Error).message, "error"); }
  };

  const addSlide = () => {
    const slideEls = document.querySelectorAll<HTMLTextAreaElement>("[data-card-slide]");
    const updated = [...slideEls].map(el => el.value);
    updated.push("");
    setEd(prev => ({ ...prev, slides: updated }));
  };
  const removeSlide = (idx: number) => {
    const slideEls = document.querySelectorAll<HTMLTextAreaElement>("[data-card-slide]");
    const updated = [...slideEls].map(el => el.value);
    updated.splice(idx, 1);
    setEd(prev => ({ ...prev, slides: updated }));
  };
  const removeResultSlide = (idx: number) => {
    if (mjGenerating) { showToast("미드저니 생성 중. 완료 후 삭제하세요", "warning"); return; }
    if (!ed.result) return;
    const newSlides = [...ed.result.slides];
    newSlides.splice(idx, 1);
    setEd(prev => ({ ...prev, result: prev.result ? { ...prev.result, slides: newSlides, totalSlides: newSlides.length } : null }));
  };
  const [dragIdx, setDragIdx] = useState<number | null>(null);
  const [previewImg, setPreviewImg] = useState<string | null>(null);
  const handleDrop = (dropIdx: number) => {
    if (dragIdx === null || dragIdx === dropIdx || !ed.result) return;
    const slides = [...ed.result.slides];
    const [moved] = slides.splice(dragIdx, 1);
    slides.splice(dropIdx, 0, moved);
    setEd(prev => ({ ...prev, result: prev.result ? { ...prev.result, slides } : null }));
    setDragIdx(null);
  };

  const handleUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files;
    if (!files?.length) return;
    const uploaded: string[] = [];
    const errors: string[] = [];
    for (const file of files) {
      const formData = new FormData();
      formData.append("file", file);
      try {
        const requestToken = getAuthToken();
        const res = await fetch("/api/images/upload", {
          method: "POST",
          body: formData,
          headers: requestToken ? { Authorization: `Bearer ${requestToken}` } : {},
        });
        if (res.status === 401) {
          handleUnauthorizedResponse(requestToken, false);
          return;
        }
        const d = await res.json();
        if (res.ok && d.url) {
          uploaded.push(d.url);
        } else {
          errors.push(d.error || `${file.name}: 업로드 실패(${res.status})`);
        }
      } catch (err) {
        errors.push(`${file.name}: ${(err as Error).message}`);
      }
    }
    if (uploaded.length) {
      setEd(prev => {
        const currentSlides = prev.result?.slides || [];
        const newSlides = [...currentSlides, ...uploaded];
        return { ...prev, result: { slides: newSlides, totalSlides: newSlides.length, batchId: prev.result?.batchId || "upload" } };
      });
      showToast(`${uploaded.length}장 추가됨`, "success");
    }
    if (errors.length) {
      showToast(errors[0], "error");
    }
    e.target.value = "";
  };

  return (
    <>
    {editingPostId && onBackToQueue && (
      <button onClick={onBackToQueue} className="text-subtle hover:text-muted text-caption mb-stack block">대기열로 돌아가기</button>
    )}
    <div className="grid grid-cols-1 md:grid-cols-2 gap-stack-section">
      {/* Left: Editor */}
      <div className="space-y-pad-inset">
        <div className="card p-stack-section">
          <h3 className="text-body-sm font-medium text-muted mb-pad-inset">카드뉴스 만들기</h3>
          <div className="space-y-stack">
            <div>
              <label className="text-caption text-subtle block mb-micro">주제 입력</label>
              <div className="flex gap-stack-tight">
                <input id="card-title" type="text" defaultValue={ed.title} placeholder="예: AI 코딩 도구 비교 2026" className="flex-1 bg-surface border border-border rounded-chip px-stack py-stack-tight text-body-sm text-muted" />
                <button onClick={aiOutline} disabled={ed.outlining} className={`px-stack py-stack-tight bg-accent text-accent-fg text-caption rounded-chip hover:bg-accent-hover flex-shrink-0 ${ed.outlining ? "opacity-50 cursor-wait" : ""}`}>
                  {ed.outlining ? "생성중..." : "AI 초안"}
                </button>
              </div>
              <p className="text-caption text-subtle mt-micro">주제 입력 후 &quot;AI 초안&quot; 클릭하면 슬라이드 내용을 자동 생성합니다</p>
            </div>
            <div>
              <label className="text-caption text-subtle block mb-micro">스타일</label>
              <div className="flex gap-stack-tight">
                {["dark", "light", "gradient", "tech", "warm"].map(s => (
                  <button key={s} onClick={() => setEd(prev => ({ ...prev, style: s }))} className={`px-stack py-stack-tight text-caption rounded-chip ${ed.style === s ? "bg-accent text-accent-fg" : "bg-surface-2 text-subtle hover:bg-surface-2"}`}>
                    {s}
                  </button>
                ))}
              </div>
            </div>
            <div>
              <div className="flex items-center justify-between mb-micro">
                <label className="text-caption text-subtle">슬라이드 (각 장의 텍스트)</label>
                <button onClick={addSlide} className="text-caption text-accent hover:text-accent">+ 슬라이드 추가</button>
              </div>
              <div className="space-y-stack-tight">
                {ed.slides.map((s, i) => (
                  <div key={i} className="flex gap-stack-tight">
                    <span className="text-caption text-subtle mt-stack-tight w-4">{i + 1}</span>
                    <textarea data-card-slide={i} className="flex-1 bg-surface border border-border rounded-chip px-stack py-stack-tight text-body-sm text-muted" rows={3} placeholder={`슬라이드 ${i + 1} 내용`} defaultValue={s} />
                    {ed.slides.length > 1 && <button onClick={() => removeSlide(i)} className="text-danger hover:opacity-80 text-caption mt-stack-tight">삭제</button>}
                  </div>
                ))}
              </div>
            </div>
            <div>
              <label className="text-caption text-subtle block mb-micro">엔딩 슬라이드</label>
              <input id="card-ending" type="text" defaultValue={ed.ending} placeholder="자세한 내용은 프로필 링크에서 확인하세요" className="w-full bg-surface border border-border rounded-chip px-stack py-stack-tight text-body-sm text-muted" />
            </div>
            <button onClick={generate} disabled={ed.generating} className={`w-full py-stack bg-accent text-accent-fg text-body-sm rounded-chip hover:bg-accent-hover ${ed.generating ? "opacity-50 cursor-wait" : ""}`}>
              {ed.generating ? "생성 중..." : "카드뉴스 생성"}
            </button>
          </div>
        </div>
        <div className="card p-stack-section">
          <h3 className="text-body-sm font-medium text-muted mb-stack">캡션 &amp; 해시태그</h3>
          <textarea id="card-caption" className="w-full bg-surface border border-border rounded-chip px-stack py-stack-tight text-body-sm text-muted mb-stack-tight" rows={4} placeholder="Instagram 캡션을 입력하세요" defaultValue={ed.caption} />
          <input id="card-hashtags" type="text" defaultValue={ed.hashtags} placeholder="#AI #코딩 #개발 ..." className="w-full bg-surface border border-border rounded-chip px-stack py-stack-tight text-body-sm text-muted" />
        </div>
      </div>

      {/* Right: Preview */}
      <div className="card p-stack-section">
        <h3 className="text-body-sm font-medium text-muted mb-pad-inset">프리뷰</h3>
        {ed.result ? (
          <>
            <div className="mb-stack">
              <div className="flex items-center justify-between mb-stack-tight">
                <p className="text-caption text-subtle">{ed.result.slides.length} slides</p>
                <div className="flex gap-stack-tight">
                  <label className="text-caption text-accent hover:text-accent cursor-pointer">
                    + 이미지 추가
                    <input type="file" multiple accept="image/*" className="hidden" onChange={handleUpload} />
                  </label>
                  <button onClick={() => {
                    if (!ed.result) return;
                    ed.result.slides.forEach((url, i) => {
                      const a = document.createElement("a");
                      a.href = url; a.download = `slide-${i + 1}.png`; a.target = "_blank";
                      document.body.appendChild(a); a.click(); document.body.removeChild(a);
                    });
                  }} className="text-caption text-subtle hover:text-subtle">다운로드</button>
                </div>
              </div>
              <div className="scrollbar-semantic flex gap-stack-tight overflow-x-auto pb-stack-tight">
                {ed.result.slides.map((s, i) => (
                  <div
                    key={`${s}-${i}`}
                    className={`min-w-32 flex-shrink-0 relative group ${dragIdx === i ? "opacity-40" : ""}`}
                    draggable
                    onDragStart={() => setDragIdx(i)}
                    onDragEnd={() => setDragIdx(null)}
                    onDragOver={(e) => e.preventDefault()}
                    onDrop={() => handleDrop(i)}
                  >
                    <div className="w-32 h-40 rounded-control overflow-hidden border border-border cursor-pointer" onClick={() => setPreviewImg(s)}>
                      <img src={s} alt={`Slide ${i + 1}`} className="w-full h-full object-cover pointer-events-none" />
                    </div>
                    <button aria-label="슬라이드 삭제" onClick={() => removeResultSlide(i)} className="absolute -top-1 -right-1 w-5 h-5 bg-danger text-status-fg rounded-pill text-caption opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center">×</button>
                    <span className="absolute bottom-1 left-1 text-caption bg-player-surface/60 text-text px-micro rounded-chip">{i + 1}</span>
                  </div>
                ))}
              </div>
            </div>
            <div className="space-y-stack-tight mb-stack">
              <button onClick={saveDraft} className="w-full py-stack-tight bg-success text-status-fg text-body-sm rounded-chip hover:bg-success">{editingPostId ? "Draft 업데이트" : "큐에 Draft 저장"}</button>
              <button onClick={() => setEd(prev => ({ ...prev, result: null }))} className="w-full py-stack-tight bg-surface-2 text-muted text-caption rounded-chip hover:bg-surface-2">카드 재생성</button>
              <details className="text-caption">
                <summary className="text-subtle cursor-pointer hover:text-subtle">미드저니 이미지 추가 (선택)</summary>
                <div className="mt-stack-tight flex gap-stack-tight">
                  <input id="mj-bg-prompt" type="text" placeholder="이미지 프롬프트 (영문 권장)" className="flex-1 bg-surface border border-border rounded-chip px-stack-tight py-stack-tight text-caption text-muted" />
                  <button onClick={async () => {
                    const prompt = (document.getElementById("mj-bg-prompt") as HTMLInputElement)?.value?.trim();
                    if (!prompt) { showToast("프롬프트를 입력하세요", "warning"); return; }
                    setMjGenerating(true);
                    try {
                      const r = await apiPost<{ success: boolean; imagePath?: string }>("/api/midjourney/generate", { prompt: prompt + " --ar 4:5" });
                      if (r?.success && r.imagePath) {
                        setEd(prev => {
                          const currentSlides = prev.result?.slides || [];
                          const newSlides = [...currentSlides, r.imagePath!];
                          return { ...prev, result: { slides: newSlides, totalSlides: newSlides.length, batchId: prev.result?.batchId || "mj" } };
                        });
                        showToast("미드저니 이미지 추가됨", "success");
                      } else { showToast("미드저니 생성 실패", "error"); }
                    } catch (e) { showToast((e as Error).message, "error"); }
                    finally { setMjGenerating(false); }
                  }} disabled={mjGenerating} className={`px-stack py-stack-tight bg-warning text-status-fg text-caption rounded-chip hover:bg-warning flex-shrink-0 ${mjGenerating ? "opacity-50 cursor-wait" : ""}`}>
                    {mjGenerating ? "생성중..." : "생성"}
                  </button>
                </div>
              </details>
            </div>
          </>
        ) : (
          <div className="flex items-center justify-center h-64 text-subtle">
            <div className="text-center">
              <p className="text-body-sm mb-micro">카드뉴스를 생성하면 여기에 프리뷰가 표시됩니다</p>
              <p className="text-caption">제목 + 슬라이드 텍스트 입력 후 &quot;카드뉴스 생성&quot; 클릭</p>
            </div>
          </div>
        )}
      </div>
      {previewImg && (
        <div className="fixed inset-0 z-50 bg-player-surface/80 backdrop-blur-sm flex items-center justify-center cursor-pointer" onClick={() => setPreviewImg(null)}>
          <img src={previewImg} className="max-h-[90vh] max-w-[90vw] rounded-control shadow-2xl" alt="미리보기" />
        </div>
      )}
    </div>
    </>
  );
}

/* ---------- Instagram Settings ---------- */
function InstagramSettings() {
  const { showToast } = useToast();
  const { data: channelConfig, mutate: mutateConfig } = useChannelConfig();
  const [accountsRefreshTick, setAccountsRefreshTick] = useState(0);
  const [showManualCreds, setShowManualCreds] = useState(false);

  const cfg = (channelConfig || {}) as Record<string, Record<string, unknown>>;
  const igCfg = cfg.instagram || {};
  const keys = (igCfg.keys || {}) as Record<string, string>;
  const connected = !!igCfg.connected;
  // 저장된 토큰이 있어도 Instagram이 OAuth code 190(무효)을 리턴하면 connected=false +
  // reconnectRequired=true로 온다(GET /api/channel-config 라이브 검증, 2026-07-16 P0 QA 정정).
  const reconnectRequired = !!igCfg.reconnectRequired;
  const sg = setupGuides.instagram || { fields: [], labels: [], quick: ["연결 안내 준비 중"], detail: "" };

  const handleCredSave = async (newKeys: Record<string, string>) => {
    const r = await apiPost<{ verified?: boolean; error?: string; account?: string }>("/api/channel-config/instagram", newKeys);
    if (r?.verified) {
      showToast(`Instagram 연결 완료${r.account ? ". " + r.account : ""}`, "success");
      mutateConfig();
    } else {
      showToast(`연결 실패: ${r?.error || "연결 정보를 확인해 주세요"}`, "error");
      throw new Error(r?.error || "연결 확인에 실패했습니다");
    }
  };

  return (
    <div className="grid grid-cols-1 md:grid-cols-2 gap-stack-section">
      {/* Credentials */}
      <div className="card p-stack-section">
        <div className="mb-pad-inset">
          <SocialConnectButton
            provider="instagram"
            label="Instagram"
            onConnected={() => {
              mutateConfig();
              setAccountsRefreshTick((n) => n + 1);
            }}
          />
          <AccountManager
            key={`instagram-${accountsRefreshTick}`}
            provider="instagram"
            label="Instagram"
            onAccountsChanged={mutateConfig}
          />
          <p className="text-caption text-subtle mt-stack-tight">공식 연결이 기본입니다. 직접 입력은 지원 안내를 받은 경우에만 사용하세요.</p>
          <Button size="sm" onClick={() => setShowManualCreds((value) => !value)} className="mt-stack-tight">
            {showManualCreds ? "고급 연결 정보 닫기" : "고급 연결 정보 열기"}
          </Button>
        </div>
        {showManualCreds ? (
          <CredentialForm
            channelKey="instagram"
            fields={sg.fields}
            labels={sg.labels}
            currentKeys={keys}
            onSave={handleCredSave}
            connected={connected}
            title="Instagram 고급 연결 정보"
            connectLabel="Instagram 연결"
          />
        ) : null}
        {reconnectRequired && (
          <div className="mt-stack rounded-control border border-warning/40 bg-warning/10 p-stack text-caption text-warning">
            재연결 필요. 저장된 연결이 만료되었거나 유효하지 않습니다. 위 연결 단추로 다시 연결해 주세요.
          </div>
        )}
      </div>

      {/* 채널 정보와 연결 안내 */}
      <div className="space-y-pad-inset">
        <div className="card p-stack-section">
          <h3 className="text-body-sm font-medium text-muted mb-stack">채널 정보</h3>
          <div className="space-y-stack-tight text-body-sm">
            <div className="flex justify-between">
              <span className="text-subtle">상태</span>
              <span className={connected ? "text-success" : "text-warning"}>
                {connected ? "연결됨" : reconnectRequired ? "재연결 필요" : "연결 안 됨"}
              </span>
            </div>
            {igCfg.userId ? (
              <div className="flex justify-between">
                <span className="text-subtle">계정 식별자</span>
                <span className="text-muted font-mono">{String(igCfg.userId)}</span>
              </div>
            ) : null}
            <div className="flex justify-between">
              <span className="text-subtle">글자 수 제한</span>
              <span className="text-muted">2,200</span>
            </div>
            <div className="flex justify-between">
              <span className="text-subtle">이미지 형식</span>
              <span className="text-muted">캐러셀 / 단일 이미지</span>
            </div>
          </div>
        </div>
        <div className="card p-stack-section">
          <SetupGuide quick={sg.quick} detail={sg.detail} images={sg.images} />
        </div>
      </div>

      <TenantAutomationSettings channel="instagram" />

      {/* Content Guide + Keywords */}
      <ContentGuide channel="instagram" />
      <KeywordsEditor channel="instagram" />
    </div>
  );
}

/* ---------- Main Instagram Page ---------- */
export function InstagramPage() {
  const { data: channelConfig, mutate: mutateConfig } = useChannelConfig();
  const { subTab, setSubTab } = useUIStore();
  const [editingPostId, setEditingPostId] = useState<string | null>(null);

  const cfg = (channelConfig || {}) as Record<string, Record<string, unknown>>;
  const igCfg = cfg.instagram || {};
  const connected = !!igCfg.connected;
  const reconnectRequired = !!igCfg.reconnectRequired;

  // Load queue for reload callback
  const { mutate: mutateQueue } = useSWR("/api/queue", fetcher);

  useEffect(() => {
    if (!isChannelTabEnabled("instagram", subTab)) setSubTab("queue");
  }, [subTab, setSubTab]);

  const reload = useCallback(() => { mutateQueue(); mutateConfig(); }, [mutateQueue, mutateConfig]);

  return (
    <div className="px-region py-stack-section">
      <BackButton />
      <div className="flex items-center gap-stack mb-stack-section">
        <span className="w-8 h-8 rounded-control bg-gradient-to-br from-warning to-accent flex items-center justify-center text-body-sm font-bold text-text">IG</span>
        <div>
          <h2 className="text-subheading font-semibold text-text">Instagram</h2>
          <p className="text-caption text-subtle">{connected ? "연결됨" : reconnectRequired ? "재연결 필요" : "연결 안 됨"}</p>
        </div>
      </div>
      <ChannelTabs channel="instagram" activeTab={subTab} onTabChange={setSubTab} />

      {subTab === "queue" && (
        connected ? (
          <QueueList
            variant="visual"
            charLimit={2200}
            onEditInEditor={(postId) => { setEditingPostId(postId); setSubTab("editor"); }}
          />
        ) : (
          <div className="card p-region text-center">
            <p className="text-subtle text-body-sm mb-stack-tight">Instagram 계정을 연결하면 큐를 사용할 수 있습니다</p>
            <button onClick={() => setSubTab("settings")} className="text-caption text-accent hover:text-accent">설정에서 연결하기</button>
          </div>
        )
      )}
      {subTab === "editor" && (
        connected ? (
          <CardNewsEditor onReload={reload} editingPostId={editingPostId} onBackToQueue={() => { setEditingPostId(null); setSubTab("queue"); }} />
        ) : (
          <div className="card p-region text-center">
            <p className="text-subtle text-body-sm mb-stack-tight">Instagram 계정을 연결하면 카드뉴스 에디터를 사용할 수 있습니다</p>
            <button onClick={() => setSubTab("settings")} className="text-caption text-accent hover:text-accent">설정에서 연결하기</button>
          </div>
        )
      )}
      {subTab === "analytics" && (
        connected ? <AnalyticsTab /> : (
          <div className="card p-pad-inset text-center">
            <p className="text-subtle text-body-sm mb-stack-tight">Instagram 계정을 연결하면 분석을 사용할 수 있습니다</p>
            <button onClick={() => setSubTab("settings")} className="text-caption text-accent">설정에서 연결하기</button>
          </div>
        )
      )}
      {subTab === "settings" && <InstagramSettings />}
    </div>
  );
}
