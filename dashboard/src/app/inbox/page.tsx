"use client";

import { useState, useEffect, useCallback } from "react";
import Link from "next/link";
import useSWR from "swr";
import { fetcher, apiPost, isAuthRequiredError } from "@/lib/api";
import { useToast } from "@/components/layout/Toast";
import type { VoiceTone } from "@/lib/voice-tone";
import type { PublishReturnContext } from "@/lib/publish-return-context";
import { PublishTrip } from "@/components/shared/PublishTrip";
import { missingReviewFields, normalizeReviewText, type MissingReviewField } from "@/lib/review-content";

const TONE_SLIDERS: { key: keyof VoiceTone; left: string; right: string }[] = [
  { key: "formal", left: "격식", right: "구어" },
  { key: "humor", left: "진지", right: "유머" },
  { key: "energy", left: "담백", right: "열정" },
  { key: "length", left: "짧게", right: "길게" },
];

interface Post {
  id: string;
  title?: string | null;
  text?: string | null;
  topic?: string;
  status?: string;
  generatedAt?: string;
  hashtags?: string[];
  videoUrl?: string;
  videoFilename?: string;
  videoThumbnail?: string;
  channels?: Record<string, unknown>;
  publishContext?: PublishReturnContext | null;
}

// "Approve, don't author" — AI가 쓰고 사람은 승인만. 한 주치 초안을 90초에 스와이프 승인하는 모바일 우선 인박스.
// 검토 대상 = status=draft. 승인 → /approve, 거절 → /delete. 액션 후 다음 카드로.
interface ProductSource { type?: string; owner?: string; repo?: string; path?: string; ref?: string; token?: string }

function customerTopicLabel(topic?: string) {
  const normalized = normalizeReviewText(topic);
  if (!normalized || normalized === "post") return "일반 콘텐츠";
  if (normalized === "studio-handoff") return "콘텐츠 작업실에서 보냄";
  return normalized;
}

function approvalWarning(fields: MissingReviewField[]) {
  if (fields.includes("body") && fields.includes("title")) {
    return "제목과 본문을 불러오지 못했습니다. 내용을 확인할 수 있을 때만 승인할 수 있습니다.";
  }
  if (fields.includes("title")) {
    return "제목을 불러오지 못했습니다. 내용을 확인할 수 있을 때만 승인할 수 있습니다.";
  }
  if (fields.includes("body")) {
    return "본문을 불러오지 못했습니다. 내용을 확인할 수 있을 때만 승인하거나 거절할 수 있습니다.";
  }
  return "";
}

export default function InboxPage() {
  const { data, error: queueError, mutate, isLoading } = useSWR<{ posts: Post[] }>("/api/queue?status=draft&returnTo=inbox", fetcher);
  const { data: psData, mutate: mutatePsrc } = useSWR<{ source: ProductSource | null }>("/api/product-source", fetcher);
  const { showToast } = useToast();

  const posts = queueError ? [] : data?.posts || [];
  const [idx, setIdx] = useState(0);
  const [scheduleHours, setScheduleHours] = useState(0);
  const [busy, setBusy] = useState(false);
  const [approved, setApproved] = useState(0);
  const [seeding, setSeeding] = useState(false);

  // 제품 소스(제품-grounded 생성): repo changelog/README를 근거로 seed가 글 생성.
  const psrc = psData?.source || null;
  const [showSrc, setShowSrc] = useState(false);
  const [srcForm, setSrcForm] = useState({ owner: "", repo: "", path: "CHANGELOG.md", ref: "main", token: "" });
  const [savingSrc, setSavingSrc] = useState(false);
  const saveSrc = async () => {
    if (!srcForm.owner.trim() || !srcForm.repo.trim() || !srcForm.path.trim()) {
      showToast("계정 이름, 프로젝트 이름, 파일 위치를 입력하세요", "error");
      return;
    }
    setSavingSrc(true);
    try {
      const r = await apiPost<{ ok?: boolean; error?: string }>("/api/product-source", { type: "github", ...srcForm });
      if (r?.ok) { showToast("제품 소스 연결됨. 이제 생성하면 제품 기반으로 작성됩니다.", "success"); setShowSrc(false); await mutatePsrc(); }
      else showToast(r?.error || "저장 실패", "error");
    } catch (e) {
      showToast(`오류: ${(e as Error).message}`, "error");
    } finally { setSavingSrc(false); }
  };

  // 브랜드 보이스 슬라이더(제품-grounded와 함께 생성 톤 제어).
  const { data: toneData, mutate: mutateTone } = useSWR<{ tone: VoiceTone }>("/api/voice-tone", fetcher);
  const [showTone, setShowTone] = useState(false);
  const [tone, setTone] = useState<VoiceTone | null>(null);
  useEffect(() => { if (toneData?.tone && !tone) setTone(toneData.tone); }, [toneData, tone]);
  const [savingTone, setSavingTone] = useState(false);
  const saveTone = async () => {
    if (!tone) return;
    setSavingTone(true);
    try {
      const r = await apiPost<{ ok?: boolean }>("/api/voice-tone", tone);
      if (r?.ok) { showToast("보이스 톤 저장됨. 다음 생성부터 반영됩니다.", "success"); await mutateTone(); }
    } catch (e) {
      showToast(`오류: ${(e as Error).message}`, "error");
    } finally { setSavingTone(false); }
  };

  // 빈 화면 박멸: 브랜드 톤 기반 초안 한 묶음 생성 → 인박스 즉시 채움.
  const seedDrafts = async () => {
    if (seeding) return;
    setSeeding(true);
    try {
      const r = await apiPost<{ ok?: boolean; added?: number; error?: string }>("/api/queue/seed", { count: 7 });
      if (r?.ok) { showToast(`${r.added}개 초안 생성됨`, "success"); setIdx(0); await mutate(); }
      else showToast(r?.error || "생성 실패", "error");
    } catch (e) {
      showToast(`오류: ${(e as Error).message}`, "error");
    } finally {
      setSeeding(false);
    }
  };

  // posts가 줄어들면 idx 보정
  useEffect(() => {
    if (idx >= posts.length && posts.length > 0) setIdx(posts.length - 1);
  }, [posts.length, idx]);

  const current = posts[idx];
  const currentTitle = normalizeReviewText(current?.title);
  const currentBody = normalizeReviewText(current?.text);
  const missingFields = current ? missingReviewFields(current) : [];
  const blockedWarning = approvalWarning(missingFields);
  const queueLoadFailed = Boolean(queueError);
  const authExpired = isAuthRequiredError(queueError);
  const canApprove = Boolean(current && missingFields.length === 0 && !queueLoadFailed);

  const advance = useCallback(() => {
    setIdx((i) => (i + 1 < posts.length ? i + 1 : i));
  }, [posts.length]);

  const approve = useCallback(async () => {
    if (!current || busy || queueLoadFailed || missingReviewFields(current).length > 0) return;
    setBusy(true);
    try {
      await apiPost(`/api/queue/${current.id}/approve`, { hours: scheduleHours });
      setApproved((n) => n + 1);
      await mutate();
      advance();
    } catch (e) {
      showToast(`승인 실패: ${(e as Error).message}`, "error");
    } finally {
      setBusy(false);
    }
  }, [current, busy, queueLoadFailed, scheduleHours, mutate, advance, showToast]);

  const reject = useCallback(async () => {
    if (!current || busy || queueLoadFailed || missingReviewFields(current).length > 0) return;
    setBusy(true);
    try {
      await apiPost(`/api/queue/${current.id}/delete`, {});
      await mutate();
      advance();
    } catch (e) {
      showToast(`거절 실패: ${(e as Error).message}`, "error");
    } finally {
      setBusy(false);
    }
  }, [current, busy, queueLoadFailed, mutate, advance, showToast]);

  // 데스크톱 단축키: A=승인, R=거절, ←/→ 이동
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement) return;
      if (e.key === "a" || e.key === "A") approve();
      else if (e.key === "r" || e.key === "R") reject();
      else if (e.key === "ArrowRight") setIdx((i) => Math.min(i + 1, posts.length - 1));
      else if (e.key === "ArrowLeft") setIdx((i) => Math.max(i - 1, 0));
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [approve, reject, posts.length]);

  const channels = current?.channels
    ? Object.keys(current.channels).map(normalizeReviewText).filter(Boolean)
    : [];
  const hashtags = current?.hashtags
    ?.map(normalizeReviewText)
    .filter(Boolean) ?? [];
  const videoSrc = current?.videoUrl
    ? (current.videoUrl.startsWith("http") ? current.videoUrl : `/videos/${current.videoUrl}`)
    : current?.videoFilename
      ? `/videos/${current.videoFilename}`
      : "";

  return (
    <div className="px-pad-inset sm:px-region py-stack-section max-w-lg mx-auto">
      <PublishTrip current="inbox" />
      <div className="mb-pad-inset">
        <h2 className="text-subheading font-bold text-text">승인 인박스</h2>
        <p className="text-caption text-subtle mt-micro">
          아직 올릴지 정하지 않은 글을 한 장씩 넘겨 보며 올릴지 말지만 정하는 곳입니다. 승인한 글은 정해진 시각에 자동으로 올라갑니다.
        </p>
        <p className="text-caption text-subtle mt-micro">
          날짜가 이미 정해진 것은 <Link href="/calendar" className="font-semibold underline">발행 캘린더</Link>에서 봅니다. 여기는 날짜가 아직 없는 것만 봅니다.
        </p>
      </div>

      {/* 제품 소스(제품-grounded): repo를 연결하면 "방금 만든 것"을 자동 홍보하는 글이 생성됨 */}
      <div className="mb-pad-inset text-caption">
        <button onClick={() => setShowSrc((v) => !v)} className="text-subtle hover:text-muted">
          {psrc?.owner ? `제품 내용: ${psrc.owner}/${psrc.repo}/${psrc.path}` : "제품 내용 연결 (선택. 최근 변경 내용 반영)"}
          <span className="ml-micro text-subtle">{showSrc ? "▲" : "▼"}</span>
        </button>
        {showSrc && (
          <div className="mt-stack-tight card p-stack grid grid-cols-2 gap-stack-tight">
            <input aria-label="계정 이름" value={srcForm.owner} onChange={(e) => setSrcForm({ ...srcForm, owner: e.target.value })} placeholder="계정 이름" className="bg-surface-2 p-stack-tight rounded-chip border border-border" />
            <input aria-label="프로젝트 이름" value={srcForm.repo} onChange={(e) => setSrcForm({ ...srcForm, repo: e.target.value })} placeholder="프로젝트 이름" className="bg-surface-2 p-stack-tight rounded-chip border border-border" />
            <input aria-label="변경 기록 파일 위치" value={srcForm.path} onChange={(e) => setSrcForm({ ...srcForm, path: e.target.value })} placeholder="변경 기록 파일 위치" className="bg-surface-2 p-stack-tight rounded-chip border border-border" />
            <input aria-label="기준 브랜치" value={srcForm.ref} onChange={(e) => setSrcForm({ ...srcForm, ref: e.target.value })} placeholder="기준 브랜치" className="bg-surface-2 p-stack-tight rounded-chip border border-border" />
            <input aria-label="접근 토큰" value={srcForm.token} onChange={(e) => setSrcForm({ ...srcForm, token: e.target.value })} placeholder="비공개 프로젝트 접근 토큰" type="password" className="bg-surface-2 p-stack-tight rounded-chip border border-border col-span-2" />
            <button onClick={saveSrc} disabled={savingSrc} className="col-span-2 py-stack-tight bg-accent hover:bg-accent-hover rounded-chip disabled:opacity-50">
              {savingSrc ? "저장 중…" : "연결 저장"}
            </button>
          </div>
        )}
      </div>

      {/* 브랜드 보이스 슬라이더: 보이고 조절 가능해 신뢰. 생성 톤 제어 */}
      <div className="mb-pad-inset text-caption">
        <button onClick={() => setShowTone((v) => !v)} className="text-subtle hover:text-muted">
          보이스 톤 {tone ? `(격식${100 - tone.formal}·유머${tone.humor}·열정${tone.energy})` : ""}
          <span className="ml-micro text-subtle">{showTone ? "▲" : "▼"}</span>
        </button>
        {showTone && tone && (
          <div className="mt-stack-tight card p-stack space-y-stack">
            {TONE_SLIDERS.map(({ key, left, right }) => (
              <div key={key}>
                <div className="flex justify-between text-caption text-subtle mb-micro">
                  <span>{left}</span><span>{right}</span>
                </div>
                <input
                  type="range" min={0} max={100} value={tone[key]}
                  onChange={(e) => setTone({ ...tone, [key]: Number(e.target.value) })}
                  className="w-full accent-accent"
                />
              </div>
            ))}
            <button onClick={saveTone} disabled={savingTone} className="w-full py-stack-tight bg-accent hover:bg-accent-hover rounded-chip disabled:opacity-50">
              {savingTone ? "저장 중…" : "톤 저장"}
            </button>
          </div>
        )}
      </div>

      {/* 진행률 */}
      <div className="flex items-center justify-between mb-stack text-caption">
        <span className="text-subtle">
          {posts.length > 0 ? `${idx + 1} / ${posts.length}` : "0 / 0"} 검토 중
        </span>
        <span className="text-success">{approved}건 승인됨</span>
      </div>
      <progress
        className="progress-semantic mb-stack-section h-1 w-full"
        max={Math.max(posts.length, 1)}
        value={posts.length ? idx : 0}
        aria-label="승인 검토 진행률"
      />

      {queueLoadFailed ? (
        <div
          id="queue-load-failure"
          role="alert"
          className="card mb-stack-section border border-danger/30 bg-danger-soft p-pad-inset text-body-sm text-danger"
        >
          <p className="font-semibold">
            {authExpired ? "로그인 상태가 만료되었습니다." : "검토할 초안을 불러오지 못했습니다."}
          </p>
          <p className="mt-stack-tight text-caption text-subtle">
            {authExpired
              ? "계속하려면 다시 로그인해주세요. 내용을 다시 불러오기 전까지 승인과 거절은 사용할 수 없습니다."
              : "연결 상태를 확인한 뒤 다시 불러와주세요. 내용을 확인하기 전까지 승인과 거절은 사용할 수 없습니다."}
          </p>
          {authExpired ? (
            <Link
              href="/login?returnTo=%2Finbox"
              className="mt-stack inline-flex min-h-control-touch items-center justify-center rounded-control bg-accent px-stack text-caption font-semibold text-accent-fg hover:bg-accent-hover"
            >
              로그인 화면으로 이동
            </Link>
          ) : (
            <button
              type="button"
              onClick={() => void mutate()}
              className="mt-stack min-h-control-touch rounded-control bg-accent px-stack text-caption font-semibold text-accent-fg hover:bg-accent-hover"
            >
              다시 불러오기
            </button>
          )}
        </div>
      ) : null}

      {queueLoadFailed ? (
        <div className="card p-pad-inset">
          <div className="grid grid-cols-2 gap-stack">
            <button
              type="button"
              disabled
              aria-describedby="queue-load-failure"
              className="py-stack rounded-control bg-danger/15 text-danger text-body-sm font-medium disabled:opacity-50"
            >
              거절
            </button>
            <button
              type="button"
              disabled
              aria-describedby="queue-load-failure"
              className="py-stack rounded-control bg-success text-status-fg text-body-sm font-medium disabled:opacity-50"
            >
              승인
            </button>
          </div>
        </div>
      ) : isLoading && data === undefined ? (
        <div className="card p-region text-center text-subtle text-body-sm">불러오는 중…</div>
      ) : posts.length === 0 ? (
        <div className="card p-region text-center">
          <p className="text-muted text-body-sm">검토할 초안이 없습니다</p>
          <p className="text-caption text-subtle mt-stack-tight">AI가 브랜드 톤으로 한 묶음 만들어 드릴게요. 검토만 하면 됩니다.</p>
          <button
            onClick={seedDrafts}
            disabled={seeding}
            className="mt-pad-inset px-pad-inset py-stack-tight text-body-sm bg-success text-status-fg rounded-control hover:bg-success disabled:opacity-50"
          >
            {seeding ? "생성 중…" : "AI로 한 주치 초안 생성"}
          </button>
          <p className="text-caption text-subtle mt-stack">예약 작업·생성실·영상에서 만든 글도 여기로 모입니다.</p>
        </div>
      ) : !current ? (
        <div className="card p-region text-center text-subtle text-body-sm">모두 검토 완료.</div>
      ) : (
        <div className="card p-pad-inset">
          {/* 채널 칩 */}
          {channels.length > 0 && (
            <div className="flex flex-wrap gap-micro mb-stack">
              {channels.map((ch) => (
                <span key={ch} className="text-caption px-stack-tight py-micro rounded-pill bg-surface-2 text-muted">{ch}</span>
              ))}
            </div>
          )}

          {/* 영상 프리뷰(있으면) */}
          {videoSrc && (
            <div className="flex justify-center mb-stack">
              <video src={videoSrc} controls playsInline className="rounded-control bg-player-surface w-full max-w-[240px] aspect-[9/16] object-contain" />
            </div>
          )}

          {/* 제목은 실제 제목 값이 있을 때만, text는 항상 본문 영역에 표시한다. */}
          <section aria-label="검토할 글" className="min-h-control-touch space-y-stack-tight" data-review-content>
            {currentTitle ? (
              <h3 className="text-body font-semibold text-text" data-review-title>{currentTitle}</h3>
            ) : null}
            {blockedWarning ? (
              <div role="alert" className="rounded-control border border-warning/30 bg-warning/10 p-stack text-body-sm text-warning">
                {blockedWarning}
              </div>
            ) : null}
            {currentBody ? (
              <p className="min-h-control-touch whitespace-pre-wrap text-body-sm leading-relaxed text-text" data-review-body>{currentBody}</p>
            ) : null}
          </section>

          {/* 해시태그 */}
          {hashtags.length > 0 && (
            <p className="text-caption text-accent mt-stack-tight">{hashtags.map((h) => (h.startsWith("#") ? h : `#${h}`)).join(" ")}</p>
          )}

          <div className="mt-stack text-caption text-subtle flex items-center justify-between">
            <span>{customerTopicLabel(current.topic)}</span>
            <span>{current.generatedAt ? new Date(current.generatedAt).toLocaleString("ko-KR") : ""}</span>
          </div>

          {/* 예약 시점 */}
          <div className="mt-pad-inset flex items-center gap-stack-tight text-caption">
            <label className="text-subtle">발행 시점</label>
            <select
              value={scheduleHours}
              onChange={(e) => setScheduleHours(Number(e.target.value))}
              className="bg-surface-2 text-muted text-caption p-stack-tight rounded-chip border border-border"
            >
              <option value={0}>지금(다음 발행 주기)</option>
              <option value={2}>2시간 뒤</option>
              <option value={6}>6시간 뒤</option>
              <option value={24}>내일</option>
              <option value={72}>3일 뒤</option>
            </select>
          </div>

          {/* 액션 */}
          <div className="mt-stack-section grid grid-cols-2 gap-stack">
            <button
              onClick={reject}
              disabled={busy || !canApprove}
              aria-describedby={queueLoadFailed ? "queue-load-failure" : !canApprove ? "approval-blocked-reason" : undefined}
              className="py-stack rounded-control bg-danger/15 text-danger hover:bg-danger/25 text-body-sm font-medium disabled:opacity-50"
            >
              거절
            </button>
            <button
              onClick={approve}
              disabled={busy || !canApprove}
              aria-describedby={queueLoadFailed ? "queue-load-failure" : !canApprove ? "approval-blocked-reason" : undefined}
              className="py-stack rounded-control bg-success text-status-fg hover:bg-success text-body-sm font-medium disabled:opacity-50"
            >
              승인
            </button>
          </div>
          {!queueLoadFailed && !canApprove ? (
            <p id="approval-blocked-reason" className="mt-stack-tight text-center text-caption text-warning">본문 확인 전에는 승인하거나 거절할 수 없습니다.</p>
          ) : null}
          {current.publishContext ? (
            <Link
              href={current.publishContext.returnUrl}
              className="mt-stack inline-flex min-h-control-touch w-full items-center justify-center rounded-control border border-border bg-surface-2 px-stack text-body-sm font-semibold text-muted hover:bg-surface"
            >
              발행실로 돌아가기
            </Link>
          ) : null}
          <p className="text-caption text-subtle text-center mt-stack-tight">단축키: A 승인 · R 거절 · ← → 이동</p>
        </div>
      )}
    </div>
  );
}
