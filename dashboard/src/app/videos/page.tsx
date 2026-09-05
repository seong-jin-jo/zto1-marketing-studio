"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import useSWR from "swr";
import { fetcher, apiPost, handleUnauthorizedResponse } from "@/lib/api";
import { authHeaders, getAuthToken } from "@/lib/auth";
import { useToast } from "@/components/layout/Toast";
import { useUIStore } from "@/store/ui-store";

interface Video {
  filename: string;
  url: string;
  size: number;
  createdAt: number;
}

interface SlideInput {
  text: string;
  duration: number;
  imageUrl: string;
}

interface ChannelAccount {
  id: string;
  display_name: string | null;
  username: string | null;
  is_default: boolean;
}

interface TikTokCreator {
  username: string;
  nickname: string;
  privacyLevels: string[];
  commentDisabled: boolean;
  duetDisabled: boolean;
  stitchDisabled: boolean;
}

// 같은 출처(/videos/...) 영상에서 첫 프레임을 캡처해 썸네일 data URL 생성. best-effort.
// 교차출처(provider http url)는 canvas가 taint되어 toDataURL이 throw → null 반환.
function captureThumbnail(src: string): Promise<string | null> {
  return new Promise((resolve) => {
    try {
      const video = document.createElement("video");
      video.crossOrigin = "anonymous";
      video.muted = true;
      video.preload = "metadata";
      video.src = src;
      const done = (val: string | null) => { video.src = ""; resolve(val); };
      const timer = setTimeout(() => done(null), 6000);
      video.addEventListener("loadeddata", () => {
        try { video.currentTime = Math.min(1, (video.duration || 2) / 2); } catch { /* ignore */ }
      });
      video.addEventListener("seeked", () => {
        try {
          const canvas = document.createElement("canvas");
          canvas.width = video.videoWidth || 360;
          canvas.height = video.videoHeight || 640;
          const ctx = canvas.getContext("2d");
          if (!ctx) { clearTimeout(timer); return done(null); }
          ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
          clearTimeout(timer);
          done(canvas.toDataURL("image/jpeg", 0.6));
        } catch { clearTimeout(timer); done(null); }
      });
      video.addEventListener("error", () => { clearTimeout(timer); done(null); });
    } catch { resolve(null); }
  });
}

export default function VideosPage() {
  const { activeWorkspace } = useUIStore();
  const { data, mutate } = useSWR<{ videos: Video[] }>("/api/video/list", fetcher);
  const { data: ytStatus } = useSWR<{ connected: boolean; status?: "valid" | "invalid" | "unverified" }>("/api/youtube/status", fetcher);
  // SNS-015: Reels는 연결된 Instagram 계정이 있어야만 실행 가능 — 없으면 정직하게 미연결로 표시.
  const { data: igAccounts } = useSWR<{ accounts?: unknown[] }>(
    activeWorkspace ? `/api/channels/instagram/accounts?tenant_id=${activeWorkspace.id}` : null,
    fetcher,
  );
  const igConnected = Array.isArray(igAccounts?.accounts) && igAccounts.accounts.length > 0;
  // SNS-015 보안: 슬라이드 영상 생성(/api/video/generate)은 임의 URL fetch + 동기 ffmpeg라
  // 운영자 전용으로 남긴다(proxy.ts TENANT_AWARE_PATHS 제외). 고객(OAuth/JWT) 세션에는 403이
  // 확정된 버튼을 아예 그리지 않는다 — "눌러봐야 실패하는 기능"을 제안하지 않기 위함.
  const { data: me } = useSWR<{ isOperator?: boolean }>("/api/me", fetcher);
  const canGenerate = me?.isOperator === true;
  // clipping-config/elevenlabs-config는 테넌트별 격리가 없는 전역 단일 파일(운영자 전용 —
  // proxy.ts TENANT_AWARE_PATHS 제외 사유 참고). 고객 세션에서 fetch하면 403만 나므로
  // 운영자로 확인된 뒤에만 조회한다(canGenerate === false면 SWR key를 null로 비활성화).
  const { data: elConfig } = useSWR<{ configured: boolean }>(canGenerate ? "/api/elevenlabs-config" : null, fetcher);
  const { data: clipConfig } = useSWR<{ configured: boolean; provider?: string }>(canGenerate ? "/api/clipping-config" : null, fetcher);
  const { data: ytAccountsData } = useSWR<{ accounts: ChannelAccount[] }>(
    activeWorkspace ? `/api/channels/youtube/accounts?tenant_id=${activeWorkspace.id}` : null,
    fetcher,
  );
  const { data: tiktokAccountsData } = useSWR<{ accounts: ChannelAccount[] }>(
    activeWorkspace ? `/api/channels/tiktok/accounts?tenant_id=${activeWorkspace.id}` : null,
    fetcher,
  );
  const { showToast } = useToast();

  const [tab, setTab] = useState<"list" | "generate">("list");
  const [slides, setSlides] = useState<SlideInput[]>([
    { text: "", duration: 4, imageUrl: "" },
  ]);
  const [ttsEnabled, setTtsEnabled] = useState(true);
  const [bgmUrl, setBgmUrl] = useState(""); // 효과음/배경음 URL 또는 /sfx/{name}
  const [generating, setGenerating] = useState(false);
  const [publishingFile, setPublishingFile] = useState<string | null>(null);
  const [publishTitle, setPublishTitle] = useState("");
  const [publishDesc, setPublishDesc] = useState("");
  const [publishAccountId, setPublishAccountId] = useState("");
  const [tiktokAccountId, setTiktokAccountId] = useState("");
  const [tiktokPrivacy, setTiktokPrivacy] = useState("");
  const [tiktokDisableComment, setTiktokDisableComment] = useState(false);
  const [tiktokDisableDuet, setTiktokDisableDuet] = useState(false);
  const [tiktokDisableStitch, setTiktokDisableStitch] = useState(false);
  const [tiktokAiGenerated, setTiktokAiGenerated] = useState(true);
  const [publishingPlatform, setPublishingPlatform] = useState<string | null>(null);
  // publish_id는 TikTok이 비동기 처리하는 동안 유일한 회수 키다. 탭 새로고침 뒤에도 현재
  // workspace에 한해서만 polling을 재개한다(다른 tenant의 이전 브라우저 상태는 섞지 않는다).
  const [tiktokPendingState, setTiktokPendingState] = useState<{
    workspaceId: string | null;
    entries: Record<string, string>;
  }>({ workspaceId: null, entries: {} });
  const pendingWorkspaceId = activeWorkspace?.id ?? null;
  // workspace prop이 바뀐 첫 렌더부터 이전 tenant 상태를 숨긴다. useEffect가 실행되기 전의
  // 한 프레임에도 오래된 publish_id가 새 tenant 인증으로 poll되지 않아야 한다.
  const tiktokPending = tiktokPendingState.workspaceId === pendingWorkspaceId
    ? tiktokPendingState.entries
    : {};
  const [previewFile, setPreviewFile] = useState<string | null>(null); // 인라인 임베드 플레이어 (발행 전 미리보기)

  // 0차 Long Video Repurpose (external clipper + OSMU refine)
  const [repurposeUrl, setRepurposeUrl] = useState("");
  const [repurposeFile, setRepurposeFile] = useState<File | null>(null);
  const [repurposing, setRepurposing] = useState(false);
  const [repurposeClips, setRepurposeClips] = useState<any[]>([]);
  const [refiningClip, setRefiningClip] = useState<string | null>(null);
  const [clipProvider, setClipProvider] = useState("reap");
  const [clipKey, setClipKey] = useState("");
  const [savingKey, setSavingKey] = useState(false);
  // OSMU 팬아웃: 클립을 큐에 넣을 때 텍스트 글(스레드/캡션)도 함께 생성 → 1 소스 → 영상+텍스트 멀티채널
  const [fanoutText, setFanoutText] = useState(true);

  const videos = data?.videos || [];
  const youtubeAccounts = ytAccountsData?.accounts || [];
  const tiktokAccounts = tiktokAccountsData?.accounts || [];
  const tiktokCreatorUrl = tiktokAccounts.length > 0
    ? `/api/tiktok/creator-info${tiktokAccountId ? `?account_id=${encodeURIComponent(tiktokAccountId)}` : ""}`
    : null;
  const { data: tiktokCreatorData } = useSWR<{
    ready: boolean;
    creator?: TikTokCreator;
  }>(tiktokCreatorUrl, fetcher);
  const tiktokCreator = tiktokCreatorData?.creator;

  useEffect(() => {
    setPublishAccountId("");
    setTiktokAccountId("");
    setTiktokPrivacy("");
    const workspaceId = activeWorkspace?.id;
    const storageKey = workspaceId ? `tiktok-pending:${workspaceId}` : "";
    if (!workspaceId) {
      setTiktokPendingState({ workspaceId: null, entries: {} });
      return;
    }
    try {
      const saved = JSON.parse(window.localStorage.getItem(storageKey) || "{}") as Record<string, unknown>;
      setTiktokPendingState({
        workspaceId,
        entries: Object.fromEntries(
          Object.entries(saved)
            .filter(([, value]) => typeof value === "string")
            .map(([filename, publishId]) => [filename, publishId as string]),
        ),
      });
    } catch {
      setTiktokPendingState({ workspaceId, entries: {} });
    }
  }, [activeWorkspace?.id]);

  const rememberTikTokPending = (filename: string, publishId: string) => {
    const workspaceId = activeWorkspace?.id;
    if (!workspaceId) return;
    setTiktokPendingState((current) => {
      const currentEntries = current.workspaceId === workspaceId ? current.entries : {};
      const entries = { ...currentEntries, [filename]: publishId };
      window.localStorage.setItem(`tiktok-pending:${workspaceId}`, JSON.stringify(entries));
      return { workspaceId, entries };
    });
  };

  const clearTikTokPending = (filename: string) => {
    const workspaceId = activeWorkspace?.id;
    if (!workspaceId) return;
    setTiktokPendingState((current) => {
      if (current.workspaceId !== workspaceId) return current;
      const { [filename]: _removed, ...entries } = current.entries;
      window.localStorage.setItem(`tiktok-pending:${workspaceId}`, JSON.stringify(entries));
      return { workspaceId, entries };
    });
  };

  useEffect(() => {
    const entries = Object.entries(tiktokPending);
    if (entries.length === 0) return;
    let cancelled = false;
    const poll = async () => {
      await Promise.all(entries.map(async ([filename, publishId]) => {
        try {
          const requestToken = getAuthToken();
          const response = await fetch(
            `/api/tiktok/publish-status?publish_id=${encodeURIComponent(publishId)}`,
            { headers: requestToken ? { Authorization: `Bearer ${requestToken}` } : {} },
          );
          if (response.status === 401) {
            handleUnauthorizedResponse(requestToken, false);
            return;
          }
          const body = await response.json() as { ok?: boolean; status?: string; url?: string; error?: string };
          if (cancelled || body.status === "processing") return;
          if (body.status === "published") {
            clearTikTokPending(filename);
            showToast(body.url ? `TikTok 발행 완료: ${body.url}` : "TikTok 발행이 완료되었습니다.", "success");
          } else if (body.status === "failed") {
            clearTikTokPending(filename);
            showToast(body.error || "TikTok 발행 상태를 더 이상 확인할 수 없습니다. 계정과 영상 상태를 확인해주세요.", "error");
          } else if (response.status < 500 && response.status !== 429) {
            // 저장된 작업이 없거나 계정이 제거된 경우에는 이 브라우저의 stale key만 정리한다.
            // 5xx/429는 일시 오류일 수 있으므로 pending을 보존해 다음 poll에서 회수한다.
            clearTikTokPending(filename);
            showToast(body.error || "TikTok 발행 상태를 확인할 수 없습니다.", "error");
          }
        } catch {
          // 일시 네트워크 오류는 예약을 지우지 않는다. 다음 주기의 tenant-scoped poll이 회수한다.
        }
      }));
    };
    void poll();
    const interval = window.setInterval(() => { void poll(); }, 4000);
    return () => { cancelled = true; window.clearInterval(interval); };
  }, [tiktokPending, activeWorkspace?.id, showToast]);

  useEffect(() => {
    // TikTok UX 가이드: 공개 범위는 계정별 옵션을 보여준 뒤 사용자가 직접 선택해야 한다.
    setTiktokPrivacy("");
    setTiktokDisableComment(tiktokCreator?.commentDisabled ?? false);
    setTiktokDisableDuet(tiktokCreator?.duetDisabled ?? false);
    setTiktokDisableStitch(tiktokCreator?.stitchDisabled ?? false);
  }, [tiktokAccountId, tiktokCreator?.username, tiktokCreator?.commentDisabled, tiktokCreator?.duetDisabled, tiktokCreator?.stitchDisabled]);

  // 추천순(바이럴 점수 desc) 정렬 — 점수는 "우선순위 힌트"일 뿐(보장 아님). 빈 화면 대신 완성 클립 그리드를 히어로로.
  const rankedClips = [...repurposeClips].sort(
    (a, b) => (Number(b?.viralScore) || 0) - (Number(a?.viralScore) || 0)
  );

  const handleGenerate = async () => {
    const validSlides = slides.filter((s) => s.text.trim());
    if (!validSlides.length) {
      showToast("At least one slide with text required", "error");
      return;
    }
    setGenerating(true);
    try {
      const res = await apiPost<{
        ok: boolean;
        filename: string;
        error?: string;
        narration?: { requested: boolean; included: boolean; reason?: string; message?: string };
      }>("/api/video/generate", {
        slides: validSlides,
        ttsEnabled,
        bgmUrl: bgmUrl.trim() || undefined,
      });
      if (res?.ok) {
        showToast(
          res.narration?.message || `Video generated: ${res.filename}`,
          res.narration?.message ? "warning" : "success",
        );
        setTab("list");
        mutate();
      } else {
        showToast(res?.error || "Generation failed", "error");
      }
    } catch (e) {
      showToast(`Error: ${(e as Error).message}`, "error");
    } finally {
      setGenerating(false);
    }
  };

  const handleDelete = async (filename: string) => {
    if (!confirm("Delete this video?")) return;
    try {
      await apiPost("/api/video/delete", { filename });
      showToast("Deleted", "success");
      mutate();
    } catch (e) {
      showToast(`Error: ${(e as Error).message}`, "error");
    }
  };

  const handlePublish = async (filename: string, platform: "youtube" | "reels" | "tiktok" = "youtube") => {
    const label = platform === "reels" ? "Instagram Reels" : platform === "tiktok" ? "TikTok" : "YouTube";
    setPublishingPlatform(`${platform}:${filename}`);
    try {
      const res = await apiPost<{ ok: boolean; processing?: boolean; publishId?: string; url?: string; error?: string }>("/api/video/publish", {
        filename,
        title: publishTitle || filename,
        description: publishDesc,
        platform,
        account_id: platform === "youtube" ? (publishAccountId || undefined) : platform === "tiktok" ? (tiktokAccountId || undefined) : undefined,
        ...(platform === "tiktok" ? {
          privacy_level: tiktokPrivacy,
          disable_comment: tiktokDisableComment,
          disable_duet: tiktokDisableDuet,
          disable_stitch: tiktokDisableStitch,
          is_ai_generated: tiktokAiGenerated,
        } : {}),
      });
      if (res?.ok) {
        if (platform === "tiktok" && res.processing && res.publishId) {
          rememberTikTokPending(filename, res.publishId);
        }
        showToast(res.processing ? `${label}에서 영상을 처리 중입니다.` : `Published to ${label}: ${res.url || ""}`, "success");
        setPublishingFile(null);
      } else {
        showToast(res?.error || `${label} 발행 실패`, "error");
      }
    } catch (e) {
      showToast(`Error: ${(e as Error).message}`, "error");
    } finally {
      setPublishingPlatform(null);
    }
  };

  // 0차: Repurpose long video via external + OSMU refine
  const handleRepurpose = async () => {
    setRepurposing(true);
    try {
      let payload: any = {};
      if (repurposeUrl) {
        payload.videoUrl = repurposeUrl;
      } else if (repurposeFile) {
        // upload first
        const form = new FormData();
        form.append("file", repurposeFile);
        const up = await fetch("/api/video/upload", { method: "POST", headers: authHeaders(), body: form }).then(r => r.json());
        if (!up?.filename) throw new Error("upload failed");
        payload.uploadRef = up.filename;
      } else {
        showToast("URL 또는 파일을 입력하세요", "error");
        return;
      }

      const r = await apiPost<{ ok?: boolean; clips?: any[]; provider?: string; error?: string }>("/api/video/repurpose", payload);
      if (r?.ok) {
        setRepurposeClips(r.clips || []);
        showToast(`${r.clips?.length || 0} clips received from ${r.provider}`, "success");
      } else {
        showToast(r?.error || "Repurpose failed", "error");
      }
    } catch (e) {
      showToast(`Error: ${(e as Error).message}`, "error");
    } finally {
      setRepurposing(false);
    }
  };

  const refineClip = async (idx: number) => {
    const clip = repurposeClips[idx];
    if (!clip) return;
    setRefiningClip(clip.id);
    try {
      const r = await apiPost<{ ok?: boolean; refinedCaption?: string; refinedHook?: string; error?: string }>("/api/video/refine-clip", {
        caption: clip.caption || clip.title,
        hook: clip.title,
        // tenant_id handled server side via auth if needed
      });
      if (r?.ok) {
        const next = [...repurposeClips];
        next[idx] = {
          ...clip,
          caption: r.refinedCaption || clip.caption,
          title: r.refinedHook || clip.title,
        };
        setRepurposeClips(next);
        showToast("Refined with wiki/brand tone", "success");
      }
    } catch (e) {
      showToast(`Refine error: ${(e as Error).message}`, "error");
    } finally {
      setRefiningClip(null);
    }
  };

  // 클립을 로컬에 적재 + Queue 항목 생성. 썸네일(첫프레임)도 best-effort 캡처해 같이 저장.
  // opts.silent: 배치 추가 시 클립별 토스트 억제. 성공 여부 반환.
  const addClipToLibrary = async (clip: any, opts?: { silent?: boolean; fanout?: boolean }): Promise<boolean> => {
    try {
      let filename = clip.id || `clip-${Date.now()}`;
      const isLocalFilename = clip.url && !clip.url.startsWith('http') && !clip.url.startsWith('/');
      if (isLocalFilename) {
        filename = clip.url;
      } else {
        try {
          const res = await fetch(clip.url);
          if (res.ok) {
            const buf = await res.arrayBuffer();
            const upForm = new FormData();
            upForm.append("file", new Blob([buf], { type: "video/mp4" }), `${filename}.mp4`);
            const up = await fetch("/api/video/upload", { method: "POST", headers: authHeaders(), body: upForm }).then(r => r.json());
            if (up?.filename) filename = up.filename;
          }
        } catch {}
      }

      // 로컬 파일이면 same-origin이라 썸네일 캡처 가능(교차출처면 null).
      const localUrl = `/videos/${filename}`;
      const thumb = await captureThumbnail(localUrl);

      // Also create a queue entry with video + basic text (refined caption as base)
      await apiPost("/api/queue/add", {
        text: clip.caption || clip.title || "Shorts clip",
        topic: "video-repurpose",
        videoFilename: filename,
        videoUrl: clip.url,
        videoThumbnail: thumb,
        hashtags: [],
      });

      // OSMU 팬아웃: 같은 소스에서 텍스트 전용 글도 큐에 생성(영상 없는 채널/스레드용).
      // 멀티채널 발행 엔진이 채널별로 압축/변형하므로 hook+caption을 베이스 텍스트로 넣는다.
      if (opts?.fanout ?? fanoutText) {
        const hook = (clip.title || "").trim();
        const body = (clip.caption || "").trim();
        const text = [hook, body].filter(Boolean).join("\n\n") || "Shorts 텍스트 글";
        try {
          await apiPost("/api/queue/add", {
            text,
            topic: "video-repurpose-text",
            hashtags: [],
          });
        } catch { /* 텍스트 팬아웃 실패는 클립 추가를 막지 않음 */ }
      }

      if (!opts?.silent) {
        showToast(`Queue 추가됨${(opts?.fanout ?? fanoutText) ? " (영상+텍스트)" : ""}. Queue 확인.`, "success");
        mutate();
      }
      return true;
    } catch (e) {
      if (!opts?.silent) showToast(`Added reference: ${clip.url}`, "success");
      return false;
    }
  };

  const [addingAll, setAddingAll] = useState(false);
  // 원클릭: 모든 클립을 동시성 3으로 Queue에 추가. 부분 실패 허용(성공 카운트 토스트).
  const addAllClipsToQueue = async () => {
    if (addingAll || repurposeClips.length === 0) return;
    setAddingAll(true);
    let ok = 0;
    try {
      const clips = [...repurposeClips];
      const CONCURRENCY = 3;
      for (let i = 0; i < clips.length; i += CONCURRENCY) {
        const batch = clips.slice(i, i + CONCURRENCY);
        const results = await Promise.all(batch.map((c) => addClipToLibrary(c, { silent: true })));
        ok += results.filter(Boolean).length;
      }
      showToast(`${ok}/${clips.length}개 클립을 Queue에 추가했습니다. Queue 확인.`, ok > 0 ? "success" : "error");
      mutate();
    } finally {
      setAddingAll(false);
    }
  };

  const addSlide = () => setSlides([...slides, { text: "", duration: 4, imageUrl: "" }]);
  const removeSlide = (i: number) => setSlides(slides.filter((_, idx) => idx !== i));
  const updateSlide = (i: number, field: keyof SlideInput, value: string | number) => {
    const next = [...slides];
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    (next[i] as any)[field] = value;
    setSlides(next);
  };

  return (
    <div className="px-region py-stack-section">
      <div className="flex items-center justify-between mb-stack-section">
        <div>
          <h2 className="text-subheading font-bold text-text">영상</h2>
          <p className="text-caption text-subtle mt-micro">숏폼 영상 생성·발행</p>
        </div>
        <div className="flex gap-stack-tight">
          <button
            onClick={() => setTab("list")}
            className={`px-stack py-stack-tight text-caption rounded-chip ${tab === "list" ? "bg-accent text-accent-fg" : "text-subtle hover:bg-surface-2"}`}
          >
            라이브러리 ({videos.length})
          </button>
          {canGenerate && (
            <button
              data-testid="video-generate-tab"
              onClick={() => setTab("generate")}
              className={`px-stack py-stack-tight text-caption rounded-chip ${tab === "generate" ? "bg-accent text-accent-fg" : "text-subtle hover:bg-surface-2"}`}
            >
              + 생성
            </button>
          )}
        </div>
      </div>

      {/* Status cards */}
      <div className="grid grid-cols-3 gap-stack mb-stack-section">
        <div className="card p-stack">
          <div className="text-caption text-subtle mb-micro">영상</div>
          <div className="text-lead font-bold text-text">{videos.length}</div>
        </div>
        <div className="card p-stack" data-testid="youtube-connect-card">
          <div className="flex items-start justify-between gap-stack">
            <div>
              <div className="text-caption text-subtle mb-micro">YouTube</div>
              <div className={`text-body-sm font-medium ${ytStatus?.connected ? "text-success" : "text-subtle"}`}>
                {ytStatus?.connected ? `연결됨 · ${youtubeAccounts.length}개 계정` : "미연결"}
              </div>
            </div>
            <Link
              href="/channels/youtube"
              className="shrink-0 text-caption text-accent hover:text-accent-hover"
            >
              채널 관리 →
            </Link>
          </div>
        </div>
        <div className="card p-stack">
          <div className="text-caption text-subtle mb-micro">TTS (ElevenLabs)</div>
          <div className={`text-body-sm font-medium ${elConfig?.configured ? "text-success" : "text-subtle"}`}>
            {elConfig?.configured ? "설정됨" : "미설정"}
          </div>
        </div>
        <div className="card p-stack col-span-2" data-testid="tiktok-status-card">
          <div className="flex items-start justify-between gap-stack">
            <div>
              <div className="text-caption text-subtle mb-micro">TikTok</div>
              <div className={`text-body-sm font-medium ${tiktokCreatorData?.ready ? "text-success" : "text-subtle"}`}>
                {tiktokCreatorData?.ready ? `@${tiktokCreator?.username} 발행 준비됨` : tiktokAccounts.length > 0 ? "계정 권한 확인 필요" : "미연결"}
              </div>
            </div>
            <Link
              href="/channels/tiktok"
              className="shrink-0 text-caption text-accent hover:text-accent-hover"
            >
              채널 관리 →
            </Link>
          </div>
          {tiktokAccounts.length > 1 && (
            <select
              data-testid="tiktok-publish-account-select"
              value={tiktokAccountId}
              onChange={(event) => setTiktokAccountId(event.target.value)}
              className="mt-stack-tight w-full rounded-chip border border-border bg-surface-2 p-stack-tight text-caption text-text"
            >
              <option value="">기본계정</option>
              {tiktokAccounts.map((account) => (
                <option key={account.id} value={account.id}>{account.display_name || account.username || account.id.slice(0, 8)}</option>
              ))}
            </select>
          )}
          {tiktokCreator && (
            <div className="mt-stack-tight grid grid-cols-2 gap-stack-tight text-caption">
              <label className="col-span-2 text-subtle">
                공개 범위
                <select
                  data-testid="tiktok-privacy-select"
                  value={tiktokPrivacy}
                  onChange={(event) => setTiktokPrivacy(event.target.value)}
                  className="mt-micro w-full rounded-chip border border-border bg-surface-2 p-stack-tight text-text"
                >
                  <option value="">선택</option>
                  {tiktokCreator.privacyLevels.map((privacy) => <option key={privacy} value={privacy}>{privacy}</option>)}
                </select>
              </label>
              <label><input type="checkbox" checked={tiktokDisableComment} disabled={tiktokCreator.commentDisabled} onChange={(e) => setTiktokDisableComment(e.target.checked)} /> 댓글 끄기</label>
              <label><input type="checkbox" checked={tiktokDisableDuet} disabled={tiktokCreator.duetDisabled} onChange={(e) => setTiktokDisableDuet(e.target.checked)} /> 듀엣 끄기</label>
              <label><input type="checkbox" checked={tiktokDisableStitch} disabled={tiktokCreator.stitchDisabled} onChange={(e) => setTiktokDisableStitch(e.target.checked)} /> 스티치 끄기</label>
              <label><input type="checkbox" checked={tiktokAiGenerated} onChange={(e) => setTiktokAiGenerated(e.target.checked)} /> AI 생성 영상</label>
            </div>
          )}
        </div>
        {/* SNS-015: Reels 발행 분기가 실제로 존재하므로 "미구현"이 아니다. 다만 Instagram 연결이
            없으면 실행 자체가 불가하므로 그 사실을 정직하게 구분해 표시한다. */}
        <div className="card p-stack" data-testid="reels-status-card">
          <div className="text-caption text-subtle mb-micro">Instagram Reels</div>
          <div className={`text-body-sm font-medium ${igConnected ? "text-success" : "text-subtle"}`}>
            {igConnected ? "발행 가능" : "Instagram 미연결. /channels/instagram에서 연결 필요"}
          </div>
        </div>
        <div className="card p-stack">
          <div className="text-caption text-subtle mb-micro">영상 클리퍼 (0차)</div>
          <div className={`text-body-sm font-medium ${clipConfig?.configured ? "text-success" : "text-subtle"}`}>
            {clipConfig?.configured ? (clipConfig.provider || "준비됨") : "미설정 (mock 모드)"}
          </div>
        </div>
      </div>

      {/* 0차: Long Video Repurpose (external clipper + OSMU brand/wiki refine) */}
      <div className="card p-pad-inset mb-stack-section">
        <div className="flex items-center gap-stack-tight mb-stack">
          <span className="text-body-sm font-medium">긴 영상 재활용 (0차)</span>
          <span className="text-caption text-subtle">외부 서비스 (Reap/Ssemble) → OSMU 보정 후 발행</span>
        </div>
        {/* 클리핑 API 키는 운영자 전용 전역 설정(/api/clipping-config — proxy.ts 제외 사유 참고).
            고객 세션에는 입력 폼을 그리지 않는다(눌러봐야 403 나는 버튼 금지, SNS-015 전례). */}
        {canGenerate && (
          <div className="mb-stack-tight text-caption flex flex-wrap items-center gap-micro">
            <span>클리핑 API 키 설정 (최초 1회):</span>
            <input value={clipProvider} onChange={(e) => setClipProvider(e.target.value)} placeholder="reap 또는 ssemble" className="bg-surface-2 p-micro w-24" />
            <input value={clipKey} onChange={(e) => setClipKey(e.target.value)} placeholder="API 키" className="bg-surface-2 p-micro w-48" />
            <button
              disabled={savingKey || !clipKey.trim()}
              onClick={async () => {
                setSavingKey(true);
                try {
                  await apiPost('/api/clipping-config', { provider: clipProvider.trim(), apiKey: clipKey.trim() });
                  showToast('키 저장됨. 이제 클립을 만드세요.', 'success');
                  setClipKey('');
                } catch (e) {
                  showToast(`키 저장 실패: ${(e as Error).message}`, 'error');
                } finally { setSavingKey(false); }
              }}
              className="px-stack-tight py-micro text-caption bg-surface-2 rounded-chip disabled:opacity-50"
            >
              {savingKey ? '저장 중…' : '키 저장'}
            </button>
          </div>
        )}
        <div className="flex flex-wrap gap-stack-tight items-center mb-stack">
          <input
            value={repurposeUrl}
            onChange={(e) => { setRepurposeUrl(e.target.value); setRepurposeFile(null); }}
            placeholder="YouTube 긴 영상 주소"
            className="flex-1 min-w-[280px] bg-surface-2 text-muted text-caption p-stack-tight rounded-chip border border-border"
          />
          <button onClick={handleRepurpose} disabled={repurposing} className="px-stack py-stack-tight text-caption bg-accent hover:bg-accent-hover rounded-chip disabled:opacity-50">
            {repurposing ? "Clipping..." : "Clip"}
          </button>
        </div>
        <div className="text-caption text-subtle mb-stack-tight">로컬 긴 영상은 YouTube에 먼저 올리거나 공개 주소를 사용하세요. 입력용 로컬 파일 지원은 제한되며 결과 영상은 로컬에 저장됩니다.</div>

        {repurposeClips.length === 0 ? (
          <div className="mt-stack-tight rounded-chip border border-dashed border-border bg-surface/40 p-stack-section text-center">
            <p className="text-caption text-subtle">긴 영상 링크를 붙여넣으면 <span className="text-muted">완성된 세로 클립</span>이 추천순 그리드로 나옵니다.</p>
            <p className="text-caption text-subtle mt-micro">각 클립 → 한 번에 큐로. 팬아웃 켜면 영상+텍스트 글이 함께 멀티채널 큐에 들어갑니다.</p>
          </div>
        ) : (
          <div className="space-y-stack mt-stack-tight">
            <div className="flex flex-wrap items-center justify-between gap-stack-tight">
              <div className="text-caption text-muted">완성 클립 <span className="text-text font-semibold">{rankedClips.length}</span>개 · <span className="text-subtle">추천순</span></div>
              <div className="flex items-center gap-stack">
                <label className="flex items-center gap-micro text-caption text-subtle">
                  <input type="checkbox" checked={fanoutText} onChange={(e) => setFanoutText(e.target.checked)} className="rounded-chip" />
                  OSMU 팬아웃(영상+텍스트)
                </label>
                <button onClick={addAllClipsToQueue} disabled={addingAll} className="text-caption px-stack py-micro bg-success text-status-fg hover:bg-success rounded-chip disabled:opacity-50">
                  {addingAll ? "추가 중…" : `전체 큐에 추가 (${rankedClips.length})`}
                </button>
              </div>
            </div>

            <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-stack">
              {rankedClips.map((c, rank) => {
                const oi = repurposeClips.indexOf(c); // 정렬 전 원본 인덱스(편집/refine 대상)
                const src = c.url ? (c.url.startsWith("http") ? c.url : `/videos/${c.url}`) : "";
                return (
                  <div key={c.id || oi} className="relative bg-surface-2 rounded-control overflow-hidden flex flex-col">
                    {/* 9:16 프리뷰 + 랭크/점수 오버레이 */}
                    <div className="relative bg-player-surface aspect-[9/16]">
                      {src && <video src={src} controls playsInline className="w-full h-full object-contain" />}
                      <span className="absolute top-1.5 left-1.5 text-caption font-bold bg-player-surface/70 text-text rounded-chip px-stack-tight py-micro">#{rank + 1}</span>
                      {c.viralScore != null && (
                        <span className="absolute top-1.5 right-1.5 text-caption bg-player-surface/70 text-warning rounded-chip px-stack-tight py-micro" title="추천 우선순위 힌트(보장 아님)">
                          ★ {Number(c.viralScore).toFixed(1)}
                        </span>
                      )}
                    </div>
                    {/* 편집 + 액션 */}
                    <div className="p-stack-tight space-y-micro text-caption flex flex-col flex-1">
                      <input
                        className="w-full bg-surface p-micro rounded-chip text-caption"
                        placeholder="훅(첫 문장)"
                        value={c.title || ""}
                        onChange={(e) => { const next = [...repurposeClips]; next[oi] = { ...next[oi], title: e.target.value }; setRepurposeClips(next); }}
                      />
                      <textarea
                        className="w-full bg-surface p-micro rounded-chip text-caption"
                        rows={2}
                        placeholder="캡션"
                        value={c.caption || ""}
                        onChange={(e) => { const next = [...repurposeClips]; next[oi] = { ...next[oi], caption: e.target.value }; setRepurposeClips(next); }}
                      />
                      <div className="flex gap-micro mt-auto pt-micro">
                        <button onClick={() => refineClip(oi)} disabled={refiningClip === c.id} className="flex-1 text-caption px-micro py-micro bg-accent hover:bg-accent-hover rounded-chip disabled:opacity-50">
                          {refiningClip === c.id ? "다듬는 중…" : "Wiki/브랜드 톤"}
                        </button>
                        <button onClick={() => addClipToLibrary(c)} className="flex-1 text-caption px-micro py-micro bg-success text-status-fg hover:bg-success rounded-chip">
                          큐에 추가
                        </button>
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        )}
      </div>

      {tab === "list" && (
        <div className="space-y-stack">
          {videos.length === 0 ? (
            <div className="card p-region text-center">
              <p className="text-subtle text-body-sm">아직 영상이 없습니다. 먼저 영상을 만들어 주세요.</p>
            </div>
          ) : (
            videos.map((v) => (
              <div key={v.filename} className="card p-pad-inset">
                <div className="flex items-start justify-between">
                  <div className="flex-1">
                    <h3 className="text-body-sm font-medium text-muted">{v.filename}</h3>
                    <p className="text-caption text-subtle mt-micro">
                      {(v.size / 1024 / 1024).toFixed(1)} MB
                      {" | "}
                      {new Date(v.createdAt).toLocaleString("ko-KR")}
                    </p>
                  </div>
                  <div className="flex gap-stack-tight">
                    <button
                      onClick={() => setPreviewFile(previewFile === v.filename ? null : v.filename)}
                      className={`px-stack-tight py-micro text-caption rounded-chip ${previewFile === v.filename ? "bg-accent text-accent-fg" : "bg-surface-2 text-muted hover:bg-surface-2"}`}
                    >
                      {previewFile === v.filename ? "Hide" : "미리보기"}
                    </button>
                    {ytStatus?.connected && (
                      publishingFile === v.filename ? (
                        <div className="flex gap-micro items-center">
                          <input
                            value={publishTitle}
                            onChange={(e) => setPublishTitle(e.target.value)}
                            placeholder="제목"
                            className="px-stack-tight py-micro text-caption bg-surface-2 text-text rounded-chip border border-border w-32"
                          />
                          {youtubeAccounts.length > 1 && (
                            <select
                              data-testid="youtube-publish-account-select"
                              value={publishAccountId}
                              onChange={(e) => setPublishAccountId(e.target.value)}
                              className="px-stack-tight py-micro text-caption bg-surface-2 text-text rounded-chip border border-border max-w-32"
                            >
                              <option value="">기본계정</option>
                              {youtubeAccounts.map((account) => (
                                <option key={account.id} value={account.id}>
                                  {account.display_name || (account.username ? `@${account.username}` : account.id.slice(0, 8))}
                                </option>
                              ))}
                            </select>
                          )}
                          <button onClick={() => handlePublish(v.filename)} className="px-stack-tight py-micro text-caption bg-danger text-status-fg rounded-chip hover:bg-danger">올리기</button>
                          <button onClick={() => setPublishingFile(null)} className="px-stack-tight py-micro text-caption bg-surface-2 text-muted rounded-chip">취소</button>
                        </div>
                      ) : (
                        <button onClick={() => { setPublishingFile(v.filename); setPublishTitle(v.filename.replace(".mp4", "")); }} className="px-stack-tight py-micro text-caption bg-danger text-status-fg rounded-chip hover:bg-danger">
                          유튜브
                        </button>
                      )
                    )}
                    {/* SNS-015: Reels는 YouTube 연결과 무관하다 — Instagram 연결이 있을 때만 그린다. */}
                    {igConnected && (
                      <button
                        data-testid="reels-publish-button"
                        onClick={() => handlePublish(v.filename, "reels")}
                        className="px-stack-tight py-micro text-caption bg-accent text-accent-fg rounded-chip hover:bg-accent-hover"
                      >
                        릴스
                      </button>
                    )}
                    {tiktokCreatorData?.ready && tiktokPrivacy && (
                      <button
                        data-testid="tiktok-publish-button"
                        disabled={publishingPlatform === `tiktok:${v.filename}` || Boolean(tiktokPending[v.filename])}
                        onClick={() => handlePublish(v.filename, "tiktok")}
                        className="px-stack-tight py-micro text-caption bg-surface-2 text-text rounded-chip hover:bg-surface disabled:opacity-50"
                      >
                        {publishingPlatform === `tiktok:${v.filename}` || tiktokPending[v.filename] ? "처리 중" : "TikTok"}
                      </button>
                    )}
                    <button onClick={() => handleDelete(v.filename)} className="px-stack-tight py-micro text-caption bg-danger/15 text-danger rounded-chip hover:bg-danger/25">
                      삭제
                    </button>
                  </div>
                </div>
                {previewFile === v.filename && (
                  <div className="mt-stack flex justify-center">
                    {/* 세로 쇼츠/릴스 임베드 플레이어 — 발행 전 검수용 */}
                    <video
                      key={v.url}
                      src={v.url}
                      controls
                      playsInline
                      className="rounded-control bg-player-surface w-full max-w-[260px] aspect-[9/16] object-contain"
                    />
                  </div>
                )}
              </div>
            ))
          )}
        </div>
      )}

      {tab === "generate" && canGenerate && (
        <div className="card p-stack-section">
          <h3 className="text-body-sm font-medium text-muted mb-pad-inset">장면 편집</h3>
          <div className="space-y-stack mb-pad-inset">
            {slides.map((s, i) => (
              <div key={i} className="flex gap-stack-tight items-start">
                <span className="text-caption text-subtle mt-stack-tight w-5">{i + 1}</span>
                <textarea
                  value={s.text}
                  onChange={(e) => updateSlide(i, "text", e.target.value)}
                  placeholder="장면 문구"
                  className="flex-1 bg-surface-2 text-muted text-caption p-stack-tight rounded-chip border border-border"
                  rows={2}
                />
                <input
                  type="number"
                  value={s.duration}
                  onChange={(e) => updateSlide(i, "duration", Number(e.target.value))}
                  className="w-14 bg-surface-2 text-muted text-caption p-stack-tight rounded-chip border border-border"
                  min={1}
                  max={30}
                  title="재생 시간(초)"
                />
                <input
                  value={s.imageUrl}
                  onChange={(e) => updateSlide(i, "imageUrl", e.target.value)}
                  placeholder="이미지 주소(선택)"
                  className="w-40 bg-surface-2 text-muted text-caption p-stack-tight rounded-chip border border-border"
                />
                {slides.length > 1 && (
                  <button onClick={() => removeSlide(i)} className="text-danger hover:text-danger text-body-sm mt-micro">삭제</button>
                )}
              </div>
            ))}
          </div>
          <div className="flex items-center gap-pad-inset mb-pad-inset">
            <button onClick={addSlide} className="px-stack py-stack-tight text-caption bg-surface-2 text-muted rounded-chip hover:bg-surface-2">
              + Add Slide
            </button>
            <label className="flex items-center gap-stack-tight text-caption text-subtle">
              <input
                type="checkbox"
                checked={ttsEnabled}
                onChange={(e) => setTtsEnabled(e.target.checked)}
                className="rounded-chip"
              />
              TTS Narration {!elConfig?.configured && "(not configured)"}
            </label>
            <span className="text-caption text-subtle">
              Total: {slides.reduce((s, sl) => s + sl.duration, 0)}s
            </span>
          </div>
          <div className="flex items-center gap-stack-tight mb-pad-inset">
            <label className="text-caption text-subtle w-20">효과음/BGM</label>
            <input
              value={bgmUrl}
              onChange={(e) => setBgmUrl(e.target.value)}
              placeholder="음원 URL 또는 /sfx/whoosh.mp3 (선택)"
              className="flex-1 bg-surface-2 text-muted text-caption p-stack-tight rounded-chip border border-border"
            />
          </div>
          <button
            onClick={handleGenerate}
            disabled={generating}
            className="px-pad-inset py-stack-tight text-body-sm bg-accent text-accent-fg rounded-chip hover:bg-accent-hover disabled:opacity-50"
          >
            {generating ? "Generating..." : "Generate Video"}
          </button>
        </div>
      )}
    </div>
  );
}
