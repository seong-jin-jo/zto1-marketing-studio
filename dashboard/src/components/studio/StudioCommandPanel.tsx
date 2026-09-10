"use client";

import { useEffect, useMemo, useState } from "react";
import { apiPost } from "@/lib/api";
import { Button } from "@/components/shared/Button";
import { Stack } from "@/components/shared/Stack";
import type { EditorHandoff, EditorHandoffKind } from "@/lib/studio/editor-handoff";

type TextVariants = {
  threads?: string;
  facebook?: string;
  x?: string;
  instagram?: { caption?: string; slides?: string[] };
  shorts?: { hook?: string; body?: string; cta?: string };
};

type StudioCommandPanelProps = {
  workspaceId: string;
  draftId: string | null;
  idea: string;
  text: TextVariants | null;
  imageUrl: string | null;
  videoUrl: string | null;
  editorLines?: string[];
  /** 대화창이 여러 줄을 한 번에 고칠 때 쓴다. 이것이 손으로 하는 것과 갈리는 자리다 */
  onEditorLinesChange?: (lines: string[]) => void;
  source?: { generationId?: string | null; candidateId?: string | null };
  initialHandoff: EditorHandoff | null;
  preferredKind?: EditorHandoffKind;
  onKindSelect?: (kind: EditorHandoffKind) => void;
  onDraftId: (draftId: string) => void;
  onHandoff: (handoff: EditorHandoff) => void;
  onQueueChanged: () => void;
  onSaveEdit?: () => Promise<void> | void;
  onOpenPublish?: () => void;
};

type CommandResponse = {
  draft_id?: string;
  handoff?: EditorHandoff;
  reused?: boolean;
  error?: string;
};

function nonEmpty(values: Array<string | null | undefined>): string[] {
  return values.map((value) => value?.trim() || "").filter(Boolean);
}

export function StudioCommandPanel({
  workspaceId,
  draftId,
  idea,
  text,
  imageUrl,
  videoUrl,
  editorLines = [],
  onEditorLinesChange,
  source,
  initialHandoff,
  preferredKind,
  onKindSelect,
  onDraftId,
  onHandoff,
  onQueueChanged,
  onSaveEdit,
  onOpenPublish,
}: StudioCommandPanelProps) {
  const [handoff, setHandoff] = useState<EditorHandoff | null>(initialHandoff);
  const [selectedKind, setSelectedKind] = useState<EditorHandoffKind | null>(null);
  const [busy, setBusy] = useState("");
  const [message, setMessage] = useState("본문을 고친 뒤 저장하거나 발행실로 이동할 수 있습니다.");
  const [error, setError] = useState("");
  const [chatDraft, setChatDraft] = useState("");

  useEffect(() => setHandoff(initialHandoff), [initialHandoff]);

  const availableKinds = useMemo(() => {
    const kinds: EditorHandoffKind[] = [];
    if (videoUrl && nonEmpty(editorLines.length ? editorLines : [text?.shorts?.hook, text?.shorts?.body, text?.shorts?.cta]).length > 0) kinds.push("video");
    if ((text?.instagram?.slides?.length ?? 0) > 0) kinds.push("card");
    if (imageUrl) kinds.push("image");
    if (nonEmpty([text?.threads, text?.facebook, text?.x]).length > 0) kinds.push("text");
    return kinds;
  }, [editorLines, imageUrl, text, videoUrl]);

  useEffect(() => {
    if (preferredKind && !availableKinds.includes(preferredKind)) {
      setSelectedKind(null);
      return;
    }
    if (preferredKind && availableKinds.includes(preferredKind)) {
      setSelectedKind(preferredKind);
      return;
    }
    if (!selectedKind || !availableKinds.includes(selectedKind)) {
      const next = availableKinds[0] ?? null;
      setSelectedKind(next);
    }
  }, [availableKinds, preferredKind, selectedKind]);

  const updateHandoff = (next: EditorHandoff) => {
    setHandoff(next);
    onHandoff(next);
  };

  const command = async (body: Record<string, unknown>, progress: string, done: (response: CommandResponse) => string) => {
    setBusy(progress);
    setError("");
    try {
      const response = await apiPost<CommandResponse>("/api/studio/commands", { tenant_id: workspaceId, ...body });
      if (!response) {
        setError("인증을 다시 확인해 주세요");
        return null;
      }
      if (response.draft_id) onDraftId(response.draft_id);
      if (response.handoff) updateHandoff(response.handoff);
      setMessage(done(response));
      return response;
    } catch (caught) {
      const reason = caught instanceof Error ? caught.message : "명령을 실행하지 못했습니다";
      setError(reason);
      return null;
    } finally {
      setBusy("");
    }
  };

  const buildHandoff = () => {
    const summary = idea.trim() || nonEmpty([text?.threads, text?.facebook, text?.x])[0] || "Studio 원본 콘텐츠";
    const handoffSource = {
      generation_id: source?.generationId ?? null,
      candidate_id: source?.candidateId ?? null,
    };
    if (selectedKind === "text") {
      return { kind: "text", summary, source: handoffSource, payload: { body: nonEmpty([text?.threads, text?.facebook, text?.x]).join("\n\n") } };
    }
    if (selectedKind === "image") {
      return { kind: "image", summary, source: handoffSource, payload: { asset_url: imageUrl, alt_text: summary } };
    }
    if (selectedKind === "card") {
      return {
        kind: "card",
        summary,
        source: handoffSource,
        payload: {
          slides: (text?.instagram?.slides ?? []).map((slide, order) => ({
            id: `slide-${order + 1}`,
            order,
            text: slide,
            image_url: order === 0 ? imageUrl : null,
          })),
        },
      };
    }
    const videoLines = nonEmpty(editorLines.length ? editorLines : [text?.shorts?.hook, text?.shorts?.body, text?.shorts?.cta]);
    return {
      kind: "video",
      summary,
      source: handoffSource,
      payload: {
        asset_url: videoUrl,
        scenes: videoLines.map((line, order) => ({
          id: `scene-${order + 1}`,
          order,
          title: order === 0 ? "시작" : order === videoLines.length - 1 ? "마무리" : "본문",
          lines: [{ id: `line-${order + 1}`, order: 0, text: line }],
        })),
      },
    };
  };

  const handoffToEditor = () => command({
    action: "handoff_to_editor",
    draft_id: draftId,
    idea,
    handoff: buildHandoff(),
  }, "편집 내용 저장 중", () => "편집 내용을 서버에 저장했습니다.");

  const reverseScenes = () => {
    if (!handoff || handoff.payload.kind !== "video") return;
    return command({
      action: "reorder_scenes",
      draft_id: draftId,
      expected_revision: handoff.revision,
      ordered_ids: [...handoff.payload.scenes].reverse().map((scene) => scene.id),
    }, "장면 순서 변경 중", () => "장면 순서를 바꾸고 revision을 올렸습니다.");
  };

  const firstLine = handoff?.payload.kind === "video" ? handoff.payload.scenes[0]?.lines[0] : null;
  const toggleFirstLine = () => {
    if (!handoff || !firstLine) return;
    const action = firstLine.visible ? "delete_line" : "restore_line";
    return command({
      action,
      draft_id: draftId,
      expected_revision: handoff.revision,
      line_id: firstLine.id,
    }, firstLine.visible ? "문장 삭제 중" : "문장 복원 중", () => firstLine.visible ? "첫 문장을 숨겼습니다. 복원할 수 있어요." : "첫 문장을 복원했습니다.");
  };

  const markReady = () => {
    if (!handoff) return;
    return command({
      action: "mark_ready",
      draft_id: draftId,
      expected_revision: handoff.revision,
    }, "발행 준비 확인 중", () => "편집을 마쳤습니다. 이제 발행실로 넘길 수 있습니다.");
  };

  const enqueue = async () => {
    const response = await command({
      action: "enqueue_openclaw",
      draft_id: draftId,
    }, "발행실로 넘기는 중", (result) => result.reused ? "이미 같은 수정본을 발행실로 넘겼습니다." : "발행실로 넘겼습니다. 편집실에는 그대로 남습니다.");
    if (response) onQueueChanged();
  };

  // 대화창으로만 되는 일. 손으로 하면 줄마다 반복해야 하는 것을 한 번에 한다.
  // 회장 지적 "챗봇만의 UX 장점이 있어야 쓰는거아님?"의 답이 이 넷이다.
  // 몇 줄이 실제로 바뀌었는지 세어 그대로 말한다. 안 바뀐 것을 바꿨다고 하면 그 자리에서 들통난다.
  const bulkLines = (transform: (line: string) => string, done: (changed: number) => string, none: string) => {
    if (!onEditorLinesChange || !editorLines.length) {
      setError("대화창이 고칠 대사가 아직 없습니다");
      return;
    }
    const next = editorLines.map(transform);
    const changed = next.filter((line, index) => line !== editorLines[index]).length;
    if (!changed) {
      setMessage(none);
      return;
    }
    onEditorLinesChange(next);
    setMessage(done(changed));
  };
  const shortenAll = () => bulkLines(
    (line) => (line.length > 24 ? `${line.slice(0, 23)}…` : line),
    (changed) => `긴 줄 ${changed}개를 한 번에 줄였습니다. 되돌리려면 아래에서 다시 고치시면 됩니다.`,
    "스물넉 자를 넘는 줄이 없어 줄일 것이 없습니다.",
  );
  const politeAll = () => bulkLines(
    (line) => line.replace(/(다|음|함)\.?$/u, "습니다").replace(/\s+$/u, ""),
    (changed) => `${changed}줄의 말끝을 높임말로 맞췄습니다.`,
    "말끝이 이미 다 높임말입니다.",
  );
  const dropEmpty = () => {
    if (!onEditorLinesChange) return;
    const kept = editorLines.filter((line) => line.trim());
    if (kept.length === editorLines.length) {
      setMessage("비어 있는 줄은 없습니다.");
      return;
    }
    onEditorLinesChange(kept);
    setMessage(`빈 줄 ${editorLines.length - kept.length}개를 걷어냈습니다.`);
  };

  // 여기까지를 판으로 고정. 자동 저장인데 저장 단추를 두면 안 누르면 안 저장되는 줄 안다.
  // 그래서 저장이 아니라 되돌릴 지점을 사람이 찍는 것으로 만든다.
  const checkpointKey = `studio_checkpoint:${workspaceId}:${draftId || "draft"}`;
  const [checkpointAt, setCheckpointAt] = useState<string>("");
  useEffect(() => {
    try {
      const raw = localStorage.getItem(checkpointKey);
      setCheckpointAt(raw ? (JSON.parse(raw) as { savedAt?: string }).savedAt || "" : "");
    } catch {
      setCheckpointAt("");
    }
  }, [checkpointKey]);

  const pinRevision = () => {
    const savedAt = new Date().toLocaleString("ko-KR", { dateStyle: "short", timeStyle: "short" });
    try {
      localStorage.setItem(checkpointKey, JSON.stringify({ savedAt, lines: editorLines, idea }));
      setCheckpointAt(savedAt);
      setMessage(`${savedAt} 상태를 판으로 고정했습니다. 나중에 돌아오셔서 이 판으로 되돌릴 수 있습니다.`);
    } catch {
      setError("이 브라우저에 판을 고정하지 못했습니다");
    }
  };

  const restoreRevision = () => {
    try {
      const raw = localStorage.getItem(checkpointKey);
      const saved = raw ? (JSON.parse(raw) as { lines?: string[] }) : null;
      if (!saved?.lines?.length || !onEditorLinesChange) {
        setError("되돌릴 판이 없습니다");
        return;
      }
      onEditorLinesChange(saved.lines);
      setMessage(`${checkpointAt} 판으로 되돌렸습니다.`);
    } catch {
      setError("판을 읽지 못했습니다");
    }
  };

  /** 원본 내려받기. 지금 편집 중인 대사를 파일 하나로 저장한다. */
  const downloadSource = () => {
    const title = idea.trim() || "작업물";
    const body = [`제목: ${title}`, "", ...editorLines.map((line, index) => `${index + 1}. ${line}`)].join("\n");
    const url = URL.createObjectURL(new Blob([body], { type: "text/plain;charset=utf-8" }));
    const anchor = document.createElement("a");
    anchor.href = url;
    anchor.download = `${title}.txt`;
    anchor.click();
    URL.revokeObjectURL(url);
    setMessage("원본을 파일로 내려받았습니다.");
  };

  const submitChat = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const value = chatDraft.trim();
    if (!value) return;
    setChatDraft("");
    setError("");
    const kind = ({ 글: "text", 이미지: "image", 영상: "video", 카드뉴스: "card", 소리: "audio" } as const)[value as "글" | "이미지" | "영상" | "카드뉴스" | "소리"];
    if (!handoff && kind && availableKinds.includes(kind)) {
      setSelectedKind(kind);
      onKindSelect?.(kind);
      setMessage(`${value} 편집 화면으로 바꿨습니다.`);
      return;
    }
    if (/전부 짧게|짧게 줄여|다 줄여/.test(value)) shortenAll();
    else if (/높임말|말끝|존댓말/.test(value)) politeAll();
    else if (/빈 줄|빈칸 걷어|비어 있는/.test(value)) dropEmpty();
    else if (/판으로 고정|여기까지/.test(value)) pinRevision();
    else if (/되돌리/.test(value)) restoreRevision();
    else if (/내려받|다운로드|원본 받/.test(value)) downloadSource();
    else if (!handoff && /편집/.test(value)) await handoffToEditor();
    else if (handoff?.payload.kind === "video" && /순서/.test(value)) await reverseScenes();
    else if (handoff?.payload.kind === "video" && /첫 문장|삭제|복원/.test(value)) await toggleFirstLine();
    else if (handoff?.status === "editing" && /준비/.test(value)) await markReady();
    else if (handoff?.status !== "editing" && /발행/.test(value)) await enqueue();
    else setError("전부 짧게, 높임말로, 빈 줄 걷어내기, 저장, 원본 내려받기, 발행실로 이동 중 하나로 말씀해 주세요.");
  };

  const hasEditableContent = editorLines.some((line) => line.trim().length > 0) || availableKinds.length > 0;

  const saveEdit = async () => {
    if (!hasEditableContent || !onSaveEdit) return;
    setBusy("편집 내용 저장 중");
    setError("");
    try {
      await onSaveEdit();
      setMessage("편집 내용을 저장했습니다. 계속 고치거나 발행실로 이동할 수 있습니다.");
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "편집 내용을 저장하지 못했습니다");
    } finally {
      setBusy("");
    }
  };

  return (
    <aside className="card min-w-0 overflow-hidden" aria-label="편집 담당 대화창" data-chat-dock="persistent">
      <div className="flex items-center gap-stack-tight border-b border-border p-stack">
        <div className="grid h-10 w-10 place-items-center rounded-pill bg-accent text-body font-bold text-accent-fg">O</div>
        <div><b className="block text-body text-text">편집 담당</b><span className="text-caption text-success">지금 대기 중</span></div>
      </div>
      <div className="space-y-stack bg-surface-2 p-stack">
        <div className="max-w-[90%] rounded-surface rounded-tl-control border border-border bg-surface p-stack">
          <p className="break-keep text-body-sm text-text" aria-live="polite">{busy || message}</p>
        </div>
        {error ? <p className="break-keep text-caption text-danger" role="alert">{error}</p> : null}

        {handoff ? (
          <Stack gap={8}>
            <div className="rounded-surface border border-border bg-surface p-stack">
              <p className="text-caption font-semibold text-text">{{ text: "글", image: "이미지", video: "영상", card: "카드뉴스", audio: "소리" }[handoff.kind]} · 수정 {handoff.revision}</p>
              <p className="text-caption text-subtle break-keep">{handoff.summary}</p>
            </div>
            {handoff.payload.kind === "video" ? (
              <Stack direction="horizontal" gap={8} wrap>
                <Button size="sm" onClick={reverseScenes} disabled={Boolean(busy)}>장면 순서 뒤집기</Button>
                <Button size="sm" onClick={toggleFirstLine} disabled={Boolean(busy)}>
                  {firstLine?.visible ? "첫 문장 삭제" : "첫 문장 복원"}
                </Button>
              </Stack>
            ) : null}
          </Stack>
        ) : null}
        <Stack direction="horizontal" gap={8} wrap className="mt-stack" aria-label="편집실 다음 행동">
          <Button onClick={saveEdit} disabled={!hasEditableContent || !onSaveEdit || Boolean(busy)}>편집 내용 저장</Button>
          <Button variant="primary" onClick={onOpenPublish} disabled={!hasEditableContent || !onOpenPublish || Boolean(busy)}>발행실로 이동</Button>
        </Stack>
      </div>
      <div className="space-y-stack border-t border-border bg-surface-2 p-stack" data-chat-only-actions>
        <span className="text-caption font-semibold text-text">여러 문장 한꺼번에 고치기</span>
        <p className="break-keep text-caption text-subtle">현재 본문의 {Math.max(editorLines.length, 1)}개 문장에 같은 수정을 적용합니다.</p>
        <Stack direction="horizontal" gap={8} wrap>
          <Button size="sm" onClick={shortenAll} disabled={!editorLines.length}>전부 짧게 줄이기</Button>
          <Button size="sm" onClick={politeAll} disabled={!editorLines.length}>말끝 높임말로 맞추기</Button>
          <Button size="sm" onClick={dropEmpty} disabled={!editorLines.length}>빈 줄 걷어내기</Button>
        </Stack>
        <Stack direction="horizontal" gap={8} wrap>
          <Button size="sm" onClick={pinRevision}>여기까지를 판으로 고정</Button>
          {checkpointAt ? <Button size="sm" onClick={restoreRevision}>{checkpointAt} 판으로 되돌리기</Button> : null}
          <Button size="sm" onClick={downloadSource} disabled={!editorLines.length}>원본 내려받기</Button>
        </Stack>
        <p className="break-keep text-caption text-subtle">
          {checkpointAt ? `마지막 고정: ${checkpointAt}. 그 사이 고친 것도 자동으로 남아 있습니다.` : "고치시는 대로 자동으로 남습니다. 되돌릴 지점만 직접 찍으시면 됩니다."}
        </p>
      </div>
      <form onSubmit={submitChat} className="flex gap-stack-tight border-t border-border p-stack">
        <input aria-label="편집 담당에게 명령" value={chatDraft} onChange={(event) => setChatDraft(event.target.value)} placeholder="직접 쓰셔도 됩니다" className="min-h-control-touch min-w-0 flex-1 rounded-control border border-border bg-surface px-stack text-body-sm text-text" />
        <Button type="submit" variant="primary">보내기</Button>
      </form>
    </aside>
  );
}
