"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { Button } from "@/components/shared/Button";
import { DeliveredMedia } from "@/components/studio/DeliveredMedia";
import { authHeaders } from "@/lib/auth";
import styles from "./ExportPanel.module.css";

export type ExportPanelKind = "card_deck" | "video";
type ExportBlocker = "EMPTY_SLIDE" | "EXPORT_IN_PROGRESS" | "EXPORT_FAILED" | "EXPORT_SOURCE_STALE" | "NO_SUCCESSFUL_EXPORT" | null;
type ExportItemStatus = "queued" | "processing" | "succeeded" | "failed" | "cancelled";

interface LatestExport {
  export_id: string;
  status: string;
  source_revision: number;
  source_hash: string;
  finished_at: string | null;
}

interface LatestExportResponse {
  current_source_revision: number;
  current_source_hash: string;
  latest_export: LatestExport | null;
  is_latest: boolean;
  blocker: ExportBlocker;
  first_empty_slide?: { order: number; number: number; item_key: string };
}

interface ExportJobResponse {
  export_id: string;
  status: "queued" | "processing" | "succeeded" | "partially_failed" | "failed" | "cancelled";
  source_revision: number;
  source_hash: string;
  progress: { completed: number; total: number };
  items: Array<{
    item_key: string;
    ordinal: number;
    status: ExportItemStatus;
    attempt_count: number;
    artifact_url?: string;
    error_code?: string;
  }>;
  updated_at: string;
  finished_at: string | null;
}

interface ExportPanelProps {
  tenantId: string;
  draftId: string;
  kind: ExportPanelKind;
  onClose: () => void;
  onOpenPublish: (receipt: { exportId: string; sourceHash: string }) => Promise<void> | void;
  onOpenEmptySlide: (slide: { order: number; number: number; item_key: string }) => void;
}

const FINAL_STATUSES = new Set(["succeeded", "partially_failed", "failed", "cancelled"]);
const POLL_INTERVAL_MS = 1_000;
const POLL_TIMEOUT_MS = 15 * 60 * 1_000;

function apiError(payload: unknown, fallback: string): string {
  return payload && typeof payload === "object" && typeof (payload as { error?: unknown }).error === "string"
    ? (payload as { error: string }).error
    : fallback;
}

function itemStatusLabel(status: ExportItemStatus): string {
  if (status === "succeeded") return "완료";
  if (status === "failed") return "실패";
  if (status === "processing") return "내보내는 중";
  if (status === "cancelled") return "취소됨";
  return "대기 중";
}

function blockerMessage(latest: LatestExportResponse | null, kind: ExportPanelKind): string | null {
  if (!latest?.blocker) return null;
  if (latest.blocker === "EXPORT_SOURCE_STALE") {
    return kind === "card_deck"
      ? "카드 이미지에 영향을 주는 편집을 내보낸 뒤 바꿨습니다. 캡션·발행 본문만 바꾼 경우는 다시 내보내지 않아도 됩니다. 최신 카드 이미지로 다시 내보내야 발행실로 갈 수 있습니다."
      : "영상 파일에 영향을 주는 편집을 내보낸 뒤 바꿨습니다. 캡션·발행 본문만 바꾼 경우는 다시 내보내지 않아도 됩니다. 최신 영상으로 다시 내보내야 발행실로 갈 수 있습니다.";
  }
  if (latest.blocker === "NO_SUCCESSFUL_EXPORT") return "이 편집본의 내보내기 결과가 아직 없습니다.";
  if (latest.blocker === "EXPORT_IN_PROGRESS") return "최신 편집본을 내보내고 있습니다.";
  if (latest.blocker === "EXPORT_FAILED") return "최신 편집본에서 실패한 항목이 있습니다. 실패한 항목만 다시 시도할 수 있습니다.";
  return null;
}

export function ExportPanel({ tenantId, draftId, kind, onClose, onOpenPublish, onOpenEmptySlide }: ExportPanelProps) {
  const [latest, setLatest] = useState<LatestExportResponse | null>(null);
  const [job, setJob] = useState<ExportJobResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [downloadingKey, setDownloadingKey] = useState<string | null>(null);
  const [error, setError] = useState("");
  const [pollTimedOut, setPollTimedOut] = useState(false);
  const pollingStartedAt = useRef<number | null>(null);
  const pollFailureCount = useRef(0);
  const pollRetryTimer = useRef<number | null>(null);

  const latestUrl = `/api/studio/drafts/${encodeURIComponent(draftId)}/exports/latest?kind=${kind}&tenant_id=${encodeURIComponent(tenantId)}`;

  const loadLatest = useCallback(async (signal?: AbortSignal): Promise<LatestExportResponse> => {
    const response = await fetch(latestUrl, { headers: authHeaders(), signal, cache: "no-store" });
    const payload = await response.json().catch(() => ({}));
    if (!response.ok) throw new Error(apiError(payload, "내보내기 상태를 불러오지 못했습니다."));
    const next = payload as LatestExportResponse;
    setLatest(next);
    return next;
  }, [latestUrl]);

  const loadJob = useCallback(async (exportId: string, signal?: AbortSignal): Promise<ExportJobResponse> => {
    const response = await fetch(`/api/studio/drafts/${encodeURIComponent(draftId)}/exports/${encodeURIComponent(exportId)}?tenant_id=${encodeURIComponent(tenantId)}`, {
      headers: authHeaders(), signal, cache: "no-store",
    });
    const payload = await response.json().catch(() => ({}));
    if (!response.ok) throw new Error(apiError(payload, "내보내기 진행 상태를 불러오지 못했습니다."));
    const next = payload as ExportJobResponse;
    setJob(next);
    return next;
  }, [draftId, tenantId]);

  useEffect(() => {
    const controller = new AbortController();
    setLoading(true);
    setError("");
    void loadLatest(controller.signal)
      .then(async (next) => {
        if (next.latest_export?.export_id) await loadJob(next.latest_export.export_id, controller.signal);
      })
      .catch((cause) => {
        if (!controller.signal.aborted) setError(cause instanceof Error ? cause.message : "내보내기 상태를 불러오지 못했습니다.");
      })
      .finally(() => { if (!controller.signal.aborted) setLoading(false); });
    return () => controller.abort();
  }, [loadJob, loadLatest]);

  useEffect(() => {
    if (!job || FINAL_STATUSES.has(job.status) || pollTimedOut) return;
    if (pollingStartedAt.current === null) pollingStartedAt.current = Date.now();
    const controller = new AbortController();
    const acceptJob = (next: ExportJobResponse) => {
      if (pollFailureCount.current > 0) {
        pollFailureCount.current = 0;
        setError("");
      }
      if (FINAL_STATUSES.has(next.status)) {
        pollingStartedAt.current = null;
        void loadLatest().catch((cause) => {
          setError(cause instanceof Error ? cause.message : "최신 내보내기 확인에 실패했습니다.");
        });
      }
    };
    const poll = () => {
      void loadJob(job.export_id, controller.signal)
        .then(acceptJob)
        .catch((cause) => {
          if (controller.signal.aborted) return;
          pollFailureCount.current += 1;
          if (pollingStartedAt.current !== null && Date.now() - pollingStartedAt.current >= POLL_TIMEOUT_MS) {
            setPollTimedOut(true);
            return;
          }
          const detail = cause instanceof Error ? cause.message : "진행 상태 확인에 실패했습니다.";
          setError(`${detail} 자동으로 다시 확인합니다. (${pollFailureCount.current}회 실패)`);
          pollRetryTimer.current = window.setTimeout(poll, POLL_INTERVAL_MS);
        });
    };
    const timer = window.setTimeout(() => {
      if (pollingStartedAt.current !== null && Date.now() - pollingStartedAt.current >= POLL_TIMEOUT_MS) {
        setPollTimedOut(true);
        return;
      }
      poll();
    }, POLL_INTERVAL_MS);
    return () => {
      window.clearTimeout(timer);
      if (pollRetryTimer.current !== null) window.clearTimeout(pollRetryTimer.current);
      pollRetryTimer.current = null;
      controller.abort();
    };
  }, [job, loadJob, loadLatest, pollTimedOut]);

  const startExport = async () => {
    setBusy(true);
    setError("");
    setPollTimedOut(false);
    pollFailureCount.current = 0;
    try {
      const source = await loadLatest();
      if (source.first_empty_slide) {
        onOpenEmptySlide(source.first_empty_slide);
        return;
      }
      const response = await fetch(`/api/studio/drafts/${encodeURIComponent(draftId)}/exports`, {
        method: "POST",
        headers: { ...authHeaders(), "Content-Type": "application/json", "Idempotency-Key": `editroom-s4:${draftId}:${source.current_source_hash}` },
        body: JSON.stringify({
          kind,
          expected_source_revision: source.current_source_revision,
          expected_source_hash: source.current_source_hash,
          item_keys: null,
          tenant_id: tenantId,
        }),
      });
      const payload = await response.json().catch(() => ({}));
      if (!response.ok) {
        if ((payload as { code?: string }).code === "EMPTY_SLIDE" && (payload as LatestExportResponse).first_empty_slide) {
          onOpenEmptySlide((payload as LatestExportResponse).first_empty_slide!);
          return;
        }
        if ((payload as { code?: string }).code === "EXPORT_ALREADY_ACTIVE" && typeof (payload as { export_id?: unknown }).export_id === "string") {
          pollingStartedAt.current = Date.now();
          await loadJob((payload as { export_id: string }).export_id);
          return;
        }
        throw new Error(apiError(payload, "내보내기를 시작하지 못했습니다."));
      }
      const exportId = (payload as { export_id?: string }).export_id;
      if (!exportId) throw new Error("내보내기 접수 번호를 받지 못했습니다.");
      pollingStartedAt.current = Date.now();
      await loadJob(exportId);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "내보내기를 시작하지 못했습니다.");
    } finally {
      setBusy(false);
    }
  };

  const retryItem = async (itemKey: string) => {
    if (!job) return;
    setBusy(true);
    setError("");
    try {
      const response = await fetch(`/api/studio/drafts/${encodeURIComponent(draftId)}/exports/${encodeURIComponent(job.export_id)}/retry`, {
        method: "POST",
        headers: { ...authHeaders(), "Content-Type": "application/json" },
        body: JSON.stringify({ item_keys: [itemKey], tenant_id: tenantId }),
      });
      const payload = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(apiError(payload, "실패한 항목을 다시 접수하지 못했습니다."));
      pollingStartedAt.current = Date.now();
      setPollTimedOut(false);
      pollFailureCount.current = 0;
      await loadJob(job.export_id);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "실패한 항목을 다시 접수하지 못했습니다.");
    } finally {
      setBusy(false);
    }
  };

  const downloadArtifact = async (item: ExportJobResponse["items"][number]) => {
    if (!item.artifact_url) return;
    setDownloadingKey(item.item_key);
    setError("");
    try {
      const response = await fetch(item.artifact_url, { headers: authHeaders(), cache: "no-store" });
      if (!response.ok) throw new Error(`${item.ordinal + 1}장 PNG를 내려받지 못했습니다.`);
      const blob = await response.blob();
      const objectUrl = URL.createObjectURL(blob);
      const anchor = document.createElement("a");
      anchor.href = objectUrl;
      anchor.download = `card-${item.ordinal + 1}.png`;
      document.body.appendChild(anchor);
      anchor.click();
      anchor.remove();
      window.setTimeout(() => URL.revokeObjectURL(objectUrl), 0);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : `${item.ordinal + 1}장 PNG를 내려받지 못했습니다.`);
    } finally {
      setDownloadingKey(null);
    }
  };

  const openPublish = async () => {
    setBusy(true);
    setError("");
    try {
      const current = await loadLatest();
      if (!current.is_latest || current.blocker || !current.latest_export) {
        throw new Error(blockerMessage(current, kind) ?? "최신 내보내기를 확인한 뒤 발행실로 이동할 수 있습니다.");
      }
      await onOpenPublish({ exportId: current.latest_export.export_id, sourceHash: current.current_source_hash });
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "최신 내보내기를 확인하지 못했습니다.");
    } finally {
      setBusy(false);
    }
  };

  const message = blockerMessage(latest, kind);
  const failedItems = job?.items.filter((item) => item.status === "failed") ?? [];
  const canPublish = Boolean(latest?.is_latest && !latest.blocker && latest.latest_export?.status === "succeeded" && job?.status === "succeeded");

  return (
    <section className={styles.overlay} role="dialog" aria-modal="true" aria-labelledby="export-panel-title" data-export-panel>
      <div className={styles.panel}>
        <header className={styles.header}>
          <div className="min-w-0">
            <p className="text-caption font-semibold text-accent">발행 파일 만들기</p>
            <h2 id="export-panel-title" className="text-heading font-bold text-text">내보내기</h2>
            <p className="ds-copy text-body-sm text-subtle">파일을 만든 뒤 최신 편집본인지 확인해야 발행실로 갈 수 있습니다.</p>
          </div>
          <Button size="sm" onClick={onClose} aria-label="내보내기 닫기">닫기</Button>
        </header>

        <div className={styles.content}>
          <div className={styles.statusColumn}>
            {message ? <div className="rounded-control border border-warning bg-warning-soft p-stack text-body-sm text-warning" role="status" data-export-blocker={latest?.blocker ?? undefined}>{message}</div> : null}
            {latest?.first_empty_slide ? (
              <div className="rounded-control border border-danger bg-danger-soft p-stack text-body-sm text-danger" role="alert" data-export-empty-slide>
                <b className="block">{latest.first_empty_slide.number}장이 비어 있습니다.</b>
                <p className="ds-copy mt-stack-tight">빈 장은 내보내거나 발행할 수 없습니다. 해당 장을 열어 내용을 채워 주세요.</p>
                <Button className="mt-stack" size="sm" onClick={() => onOpenEmptySlide(latest.first_empty_slide!)}>{latest.first_empty_slide.number}장 열기</Button>
              </div>
            ) : null}

            <article className="rounded-surface border border-border bg-surface p-stack" data-export-version-row>
              <div className="flex min-w-0 flex-wrap items-center gap-stack-tight">
                <b className="text-body text-text">{kind === "card_deck" ? "카드뉴스 PNG" : "영상 mp4"}</b>
                <span className="ml-auto text-caption text-subtle">{job ? `${job.progress.completed} / ${job.progress.total}${kind === "card_deck" ? "장" : "개"}` : "대기 전"}</span>
              </div>
              {job ? <progress className={styles.progress} max={Math.max(1, job.progress.total)} value={job.progress.completed} aria-label="내보내기 진행률" /> : null}
              <p className="mt-stack-tight text-caption text-subtle">
                {job?.status === "succeeded" ? "최신 편집본 내보내기 완료" : job?.status === "processing" ? "내보내는 중입니다. 다른 방으로 가도 서버에서 계속됩니다." : job?.status === "queued" ? "내보내기 대기열에 접수했습니다." : failedItems.length ? `${failedItems.length}개 항목이 실패했습니다.` : "내보내기 전입니다."}
              </p>
            </article>

            {error ? <p role="alert" className="rounded-control border border-danger bg-danger-soft p-stack text-body-sm text-danger">{error}</p> : null}
            {pollTimedOut ? (
              <div role="alert" className="rounded-control border border-warning bg-warning-soft p-stack text-body-sm text-warning">
                상태 확인 시간이 지났습니다. 서버 작업은 계속될 수 있습니다.
                {job ? <Button className="mt-stack" size="sm" onClick={() => { pollingStartedAt.current = Date.now(); setPollTimedOut(false); void loadJob(job.export_id); }}>상태 다시 확인</Button> : null}
              </div>
            ) : null}

            <div className="grid gap-stack-tight">
              {canPublish ? (
                <Button variant="primary" size="lg" onClick={() => void openPublish()} disabled={busy} data-export-open-publish>발행실로</Button>
              ) : (
                <Button variant="primary" size="lg" onClick={() => void startExport()} disabled={busy || loading || Boolean(latest?.first_empty_slide)} data-export-start>
                  {busy ? "확인 중" : latest?.blocker === "EXPORT_SOURCE_STALE" ? "최신 내용 다시 내보내기" : "내보내기"}
                </Button>
              )}
              <p className="ds-copy text-caption text-subtle">채널 선택과 실제 발행은 발행실에서 합니다. 여기서는 파일만 만듭니다.</p>
            </div>
          </div>

          <div className={styles.itemsColumn} aria-live="polite">
            <div className="flex items-center gap-stack-tight">
              <b className="text-body text-text">항목별 상태</b>
              {loading ? <span className="text-caption text-subtle">불러오는 중</span> : null}
            </div>
            {!job ? <p className="ds-copy text-body-sm text-subtle">내보내기를 시작하면 장마다 진행 상태가 여기에 표시됩니다.</p> : null}
            {job?.items.map((item) => (
              <article key={item.item_key} className="grid min-w-0 gap-stack-tight rounded-control border border-border bg-surface p-stack" data-export-item={item.item_key} data-export-item-status={item.status}>
                <div className="flex min-w-0 items-center gap-stack-tight">
                  <b className="text-body-sm text-text">{kind === "card_deck" ? `${item.ordinal + 1}장` : "영상"}</b>
                  <span className={`ml-auto text-caption ${item.status === "failed" ? "text-danger" : item.status === "succeeded" ? "text-success" : "text-subtle"}`}>{itemStatusLabel(item.status)}</span>
                </div>
                {item.error_code ? <p className="ds-copy text-caption text-danger">{item.error_code}</p> : null}
                {item.artifact_url ? <DeliveredMedia type="image" className={styles.thumbnail} src={item.artifact_url} tenantId={tenantId} loading="lazy" alt={`${item.ordinal + 1}장 내보내기 결과`} /> : null}
                {kind === "card_deck" && item.status === "succeeded" && item.artifact_url ? (
                  <Button size="sm" onClick={() => void downloadArtifact(item)} disabled={downloadingKey === item.item_key} data-export-download={item.item_key}>
                    {downloadingKey === item.item_key ? "받는 중" : `${item.ordinal + 1}장 PNG 다운로드`}
                  </Button>
                ) : null}
                {item.status === "failed" ? <Button size="sm" onClick={() => void retryItem(item.item_key)} disabled={busy}>{kind === "card_deck" ? `${item.ordinal + 1}장` : "영상"} 다시 시도</Button> : null}
              </article>
            ))}
          </div>
        </div>
      </div>
    </section>
  );
}
