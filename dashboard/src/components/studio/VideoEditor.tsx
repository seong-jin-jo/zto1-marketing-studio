"use client";

/**
 * 편집실 영상 편집 UI (세션맥락 과업 B, PR4 뒤).
 *
 * 회장이 직접 지목한 네 기능: 후킹 CTA 오버레이 선택 · 영상 위 댓글(사회적 증거) 오버레이 ·
 * 재생 · 자막 기반 편집 · 음성 변경. `BubbleEditor.tsx` 와 같은 원칙(D-2026-09-09-1 직접
 * 편집 기본, ADR-007 조용한 실패 금지)을 따른다 — 상태 변화는 `video-edit-contract.ts` 의
 * 순수 함수만 거치고, 실패는 이유를 화면에 그대로 보여준다.
 *
 * 렌더 반영 범위(정직하게 명시): 오버레이·댓글·컷·음성은 이 화면에서 저장은 되지만, 실제
 * 나가는 mp4 에 굽는 것은 자막만 기존 `/api/video/subtitle` 로 연결돼 있다. 나머지는
 * "렌더 반영은 다음 단계입니다" 배지를 옆에 붙인다 — 적용된 척 숨기지 않는다.
 *
 * 근거: docs/eng-design/osmu-quality-stage1-v1-claude-opus.md, wiki/거버넌스/결정.md
 * ADR-007, card-deck-ops.ts(같은 순수함수+revision 패턴), DeliveredMedia.tsx(video 태그
 * 실패 처리 패턴).
 */
import { useEffect, useMemo, useRef, useState } from "react";
import { Button } from "@/components/shared/Button";
import { authHeaders } from "@/lib/auth";
import {
  type SubtitleLine,
  type VideoEdit,
  type VideoOverlay,
  VideoEditValidationError,
  addComment,
  addOverlay,
  newId,
  removeComment,
  removeOverlay,
  setSubtitles,
  setVoice,
  toggleSubtitleCut,
  updateComment,
  updateOverlay,
} from "@/lib/studio/video-edit-contract";

/**
 * 훅/CTA 문구 칩 — 카드덱 `HOOK_BANK`(BubbleEditor.tsx)와 같은 출처
 * (docs/design/osmu-content-quality-benchmark-v1-claude-opus.html §REF A-3·⑦CTA)의
 * 영상판. 표지 훅 3공식(질문·숫자·고통인식)과 댓글 유도 CTA를 영상 오버레이 문구로 옮겼다.
 */
const VIDEO_HOOK_PRESETS = [
  "이거 순서가 틀렸다면?",
  "3초 만에 원인 하나",
  "안 되는 건 재능이 아니라 순서다",
];
const VIDEO_CTA_PRESETS = [
  "댓글에 '순서' 남기면 방법 보내줄게",
  "저장해두고 나중에 다시 봐",
  "다음 편은 팔로우해야 놓치지 않아",
];

export interface VideoEditorProps {
  videoEdit: VideoEdit;
  onVideoEditChange: (edit: VideoEdit) => void;
  previewVideoUrl: string | null;
}

function formatSec(sec: number): string {
  return Number.isInteger(sec) ? `${sec}` : sec.toFixed(1);
}

/** VideoEditValidationError.rule → 화면에 보여줄 고정 한국어 문구(N3). */
function videoEditErrorMessage(rule: string): string {
  if (rule === "overlay_text") return "오버레이 문구를 입력해 주세요.";
  if (rule === "comment_author" ) return "작성자를 입력해 주세요.";
  if (rule === "comment_text") return "댓글 내용을 입력해 주세요.";
  if (rule.startsWith("range_")) return "구간의 시작·끝 시간을 확인해 주세요.";
  return "입력한 값을 확인해 주세요.";
}

export function VideoEditor({ videoEdit, onVideoEditChange, previewVideoUrl }: VideoEditorProps) {
  const [error, setError] = useState<string | null>(null);
  const [duration, setDuration] = useState<number | null>(null);
  const [playhead, setPlayhead] = useState(0);
  const videoRef = useRef<HTMLVideoElement | null>(null);

  function run(op: (edit: VideoEdit) => VideoEdit) {
    try {
      setError(null);
      onVideoEditChange(op(videoEdit));
    } catch (cause) {
      // N3(2026-09-22 코드리뷰): VideoEditValidationError.message는 영문 내부 필드 경로
      // 원문이다. 원문은 로그로만 보내고 화면은 고정 한국어 문구로 바꾼다.
      if (cause instanceof VideoEditValidationError) {
        console.error("영상 편집 조작 실패", cause.rule, cause.message);
        setError(videoEditErrorMessage(cause.rule));
      } else {
        setError("영상 편집 내용을 바꾸지 못했습니다. 잠시 후 다시 시도해 주세요.");
      }
    }
  }

  if (!previewVideoUrl) {
    return (
      <div className="space-y-stack-tight rounded-surface border border-dashed border-border bg-surface-2 p-pad-inset" data-video-editor-empty>
        <b className="block text-body font-semibold text-text">아직 편집할 영상이 없습니다</b>
        <p className="text-caption text-muted">생성실에서 영상을 먼저 만들면 여기서 후킹 CTA·댓글 오버레이·자막·음성을 편집할 수 있습니다.</p>
      </div>
    );
  }

  return (
    <div className="space-y-stack" data-video-editor>
      {error ? <p role="alert" className="rounded-control border border-danger bg-danger-soft p-stack text-caption text-danger" data-video-editor-error>{error}</p> : null}
      <VideoPlayback
        src={previewVideoUrl}
        videoRef={videoRef}
        overlays={videoEdit.overlays}
        playhead={playhead}
        duration={duration}
        onLoadedMetadata={(d) => setDuration(d)}
        onTimeUpdate={(t) => setPlayhead(t)}
        onSeek={(t) => {
          if (videoRef.current) videoRef.current.currentTime = t;
          setPlayhead(t);
        }}
      />
      <OverlayEditor edit={videoEdit} duration={duration} playhead={playhead} run={run} />
      <CommentOverlayEditor edit={videoEdit} duration={duration} playhead={playhead} run={run} />
      <SubtitleCutEditor edit={videoEdit} run={run} />
      <VoiceSelector edit={videoEdit} run={run} />
    </div>
  );
}

function VideoPlayback({
  src, videoRef, overlays, playhead, duration, onLoadedMetadata, onTimeUpdate, onSeek,
}: {
  src: string;
  videoRef: React.RefObject<HTMLVideoElement | null>;
  overlays: VideoOverlay[];
  playhead: number;
  duration: number | null;
  onLoadedMetadata: (duration: number) => void;
  onTimeUpdate: (time: number) => void;
  onSeek: (time: number) => void;
}) {
  const [loadFailed, setLoadFailed] = useState(false);
  const activeOverlays = overlays.filter((o) => playhead >= o.startSec && playhead <= o.endSec);

  return (
    <div className="space-y-stack-tight" data-video-playback>
      <div className="relative overflow-hidden rounded-surface border border-border bg-surface-2">
        {loadFailed ? (
          <p className="p-pad-inset text-caption text-danger" data-video-load-failed>영상을 불러오지 못했습니다. 생성실에서 다시 만들어 주세요.</p>
        ) : (
          // 오버레이·자막·컷 구간은 재생 위치와 맞춰야 해서 video DOM ref와
          // onTimeUpdate/onLoadedMetadata를 직접 잡는다(DeliveredMedia는 이 훅을 밖으로
          // 내보내지 않는다). raw-media-ok: onError로 로드 실패를 이미 문구로 보여준다.
          <video
            ref={videoRef}
            src={src}
            controls
            preload="metadata"
            className="w-full"
            onLoadedMetadata={(e) => onLoadedMetadata(e.currentTarget.duration)}
            onTimeUpdate={(e) => onTimeUpdate(e.currentTarget.currentTime)}
            onError={() => setLoadFailed(true)}
            data-video-el
          />
        )}
        {activeOverlays.map((overlay) => (
          <div
            key={overlay.id}
            data-video-overlay-active
            data-video-overlay-kind={overlay.kind}
            className={`pointer-events-none absolute inset-x-0 bottom-4 mx-auto w-fit max-w-11/12 rounded-chip px-stack py-micro text-center text-caption font-semibold ${overlay.kind === "hook" ? "bg-accent-soft text-accent" : "bg-success-soft text-success"}`}
          >
            {overlay.text}
          </div>
        ))}
      </div>
      {duration ? (
        <input
          aria-label="재생 위치"
          type="range"
          min={0}
          max={duration}
          step={0.1}
          value={playhead}
          onChange={(e) => onSeek(Number.parseFloat(e.target.value))}
          className="w-full"
          data-video-scrubber
        />
      ) : null}
      <p className="text-caption text-muted">{formatSec(playhead)}초 / {duration ? `${formatSec(duration)}초` : "길이 확인 중"}</p>
    </div>
  );
}

function OverlayEditor({ edit, duration, playhead, run }: { edit: VideoEdit; duration: number | null; playhead: number; run: (op: (e: VideoEdit) => VideoEdit) => void }) {
  const [text, setText] = useState("");
  const [kind, setKind] = useState<VideoOverlay["kind"]>("hook");
  const presets = kind === "hook" ? VIDEO_HOOK_PRESETS : VIDEO_CTA_PRESETS;
  const clipEnd = duration ?? playhead + 3;
  // M2(2026-09-22 코드리뷰): 재생 위치가 영상 끝(duration)에 닿으면 min(clipEnd, playhead+3)
  // 이 playhead와 같아져 startSec===endSec 인 오버레이가 만들어졌다. 끝 쪽으로 갈수록
  // 시작을 당겨서라도 최소 0.5초 구간을 보장한다.
  const overlayStart = Math.max(0, Math.min(playhead, clipEnd - 0.5));
  const overlayEnd = Math.max(overlayStart + 0.5, Math.min(clipEnd, playhead + 3));

  return (
    <section aria-label="후킹 CTA 오버레이" className="space-y-stack-tight rounded-surface border border-border bg-surface-2 p-pad-inset" data-video-overlay-editor>
      <b className="text-caption font-semibold text-text">후킹 · CTA 오버레이</b>
      <div className="flex flex-wrap gap-stack-tight" role="radiogroup" aria-label="오버레이 종류" data-video-overlay-kind-toggle>
        <Button size="sm" variant={kind === "hook" ? "primary" : "secondary"} role="radio" aria-checked={kind === "hook"} onClick={() => setKind("hook")}>후킹</Button>
        <Button size="sm" variant={kind === "cta" ? "primary" : "secondary"} role="radio" aria-checked={kind === "cta"} onClick={() => setKind("cta")}>CTA</Button>
      </div>
      <div className="flex flex-wrap gap-stack-tight" data-video-overlay-presets>
        {presets.map((preset) => (
          <Button key={preset} size="sm" variant="secondary" onClick={() => setText(preset)}>{preset}</Button>
        ))}
      </div>
      <input
        aria-label="오버레이 문구"
        value={text}
        onChange={(e) => setText(e.target.value)}
        className="w-full rounded-control border border-border bg-surface p-stack text-body text-text"
        placeholder="영상 위에 보여줄 문구"
      />
      <Button
        size="sm"
        disabled={!text.trim()}
        onClick={() => {
          run((e) => addOverlay(e, kind, text.trim(), overlayStart, overlayEnd));
          setText("");
        }}
      >
        {formatSec(playhead)}초 구간에 추가
      </Button>
      <ul className="space-y-stack-tight" aria-label="추가된 오버레이 목록" data-video-overlay-list>
        {edit.overlays.map((overlay, overlayIndex) => (
          <li key={overlay.id} className="flex flex-wrap items-center gap-stack-tight rounded-control border border-border bg-surface p-stack text-caption" data-video-overlay-id={overlay.id}>
            <span className={`rounded-chip border px-micro font-semibold ${overlay.kind === "hook" ? "border-accent bg-accent-soft text-accent" : "border-success bg-success-soft text-success"}`}>{overlay.kind === "hook" ? "훅" : "CTA"}</span>
            <input
              aria-label={`${overlayIndex + 1}번째 오버레이 문구`}
              value={overlay.text}
              onChange={(e) => run((d) => updateOverlay(d, overlay.id, { text: e.target.value }))}
              className="min-w-0 flex-1 rounded-control border border-border bg-surface-2 p-micro text-caption text-text"
            />
            <input
              aria-label={`${overlayIndex + 1}번째 오버레이 시작 초`}
              type="number"
              min={0}
              step={0.1}
              value={overlay.startSec}
              onChange={(e) => {
                const next = Number.parseFloat(e.target.value);
                if (Number.isFinite(next)) run((d) => updateOverlay(d, overlay.id, { startSec: next }));
              }}
              className="w-16 rounded-control border border-border bg-surface-2 p-micro text-caption"
            />
            <span>~</span>
            <input
              aria-label={`${overlayIndex + 1}번째 오버레이 끝 초`}
              type="number"
              min={0}
              step={0.1}
              value={overlay.endSec}
              onChange={(e) => {
                const next = Number.parseFloat(e.target.value);
                if (Number.isFinite(next)) run((d) => updateOverlay(d, overlay.id, { endSec: next }));
              }}
              className="w-16 rounded-control border border-border bg-surface-2 p-micro text-caption"
            />
            <Button size="sm" variant="secondary" aria-label={`${overlayIndex + 1}번째 오버레이 삭제`} onClick={() => run((d) => removeOverlay(d, overlay.id))}>삭제</Button>
          </li>
        ))}
      </ul>
      <p className="text-caption text-subtle" data-render-status-note>렌더 반영은 다음 단계입니다. 지금은 편집실 미리보기에만 겹쳐 보입니다.</p>
    </section>
  );
}

function CommentOverlayEditor({ edit, duration, playhead, run }: { edit: VideoEdit; duration: number | null; playhead: number; run: (op: (e: VideoEdit) => VideoEdit) => void }) {
  const [author, setAuthor] = useState("");
  const [text, setText] = useState("");
  const clipEnd = duration ?? playhead + 3;
  // M2: 오버레이와 같은 이유로 최소 0.5초 구간을 보장한다.
  const commentStart = Math.max(0, Math.min(playhead, clipEnd - 0.5));
  const commentEnd = Math.max(commentStart + 0.5, Math.min(clipEnd, playhead + 3));
  const hasManual = edit.comments.some((c) => c.source === "manual");

  return (
    <section aria-label="댓글 오버레이" className="space-y-stack-tight rounded-surface border border-border bg-surface-2 p-pad-inset" data-video-comment-editor>
      <b className="text-caption font-semibold text-text">댓글 오버레이 (사회적 증거)</b>
      <p className="text-caption text-muted">실제 수집된 댓글이 아직 연결되지 않아 여기서는 직접 입력만 가능합니다. 가짜 후기로 오해되지 않도록 발행 전에 꼭 실제 댓글로 바꾸거나 "예시"임을 밝혀 주세요.</p>
      <div className="flex flex-wrap gap-stack-tight">
        <input aria-label="작성자" value={author} onChange={(e) => setAuthor(e.target.value)} placeholder="작성자 (예: 실제 아이디)" className="w-40 rounded-control border border-border bg-surface p-stack text-body text-text" />
        <input aria-label="댓글 내용" value={text} onChange={(e) => setText(e.target.value)} placeholder="댓글 내용" className="flex-1 min-w-40 rounded-control border border-border bg-surface p-stack text-body text-text" />
      </div>
      <Button
        size="sm"
        disabled={!text.trim() || !author.trim()}
        onClick={() => {
          run((e) => addComment(e, { author: author.trim(), text: text.trim(), source: "manual", startSec: commentStart, endSec: commentEnd }));
          setAuthor("");
          setText("");
        }}
      >
        {formatSec(playhead)}초 구간에 추가
      </Button>
      {hasManual ? (
        <p role="alert" className="rounded-control border border-warning bg-warning-soft p-stack text-caption text-warning" data-video-comment-fake-warning>
          직접 입력한 댓글이 있습니다. 실제 댓글이 아니라면 발행 전에 "예시"라고 밝혀야 합니다.
        </p>
      ) : null}
      <ul className="space-y-stack-tight" aria-label="추가된 댓글 목록" data-video-comment-list>
        {edit.comments.map((comment, commentIndex) => (
          <li key={comment.id} className="flex flex-wrap items-center gap-stack-tight rounded-control border border-border bg-surface p-stack text-caption" data-video-comment-id={comment.id}>
            <span className={`rounded-chip border px-micro font-semibold ${comment.source === "manual" ? "border-warning bg-warning-soft text-warning" : "border-success bg-success-soft text-success"}`}>{comment.source === "manual" ? "직접입력" : "실제 댓글"}</span>
            <input
              aria-label={`${commentIndex + 1}번째 댓글 작성자`}
              value={comment.author}
              onChange={(e) => run((d) => updateComment(d, comment.id, { author: e.target.value }))}
              className="w-24 rounded-control border border-border bg-surface-2 p-micro text-caption text-text"
            />
            <input
              aria-label={`${commentIndex + 1}번째 댓글 내용`}
              value={comment.text}
              onChange={(e) => run((d) => updateComment(d, comment.id, { text: e.target.value }))}
              className="min-w-0 flex-1 rounded-control border border-border bg-surface-2 p-micro text-caption text-text"
            />
            <Button size="sm" variant="secondary" aria-label={`${commentIndex + 1}번째 댓글 삭제`} onClick={() => run((d) => removeComment(d, comment.id))}>삭제</Button>
          </li>
        ))}
      </ul>
    </section>
  );
}

/** 자막 기반 편집. 기존 `/api/video/subtitle` 은 굽기 전용(줄 목록 조회 API가 없다)이라
 * 여기서는 수동으로 줄을 입력·삭제한다(삭제=컷 표시). 렌더링 굽기 자체는 저장 시
 * 기존 subtitle API가 그대로 처리한다(별도 API 신설 없음, 세션맥락 "있으면 재사용"). */
function SubtitleCutEditor({ edit, run }: { edit: VideoEdit; run: (op: (e: VideoEdit) => VideoEdit) => void }) {
  const [draft, setDraft] = useState("");
  const cutCount = useMemo(() => edit.subtitles.filter((s) => s.cut).length, [edit.subtitles]);

  function addLine() {
    const text = draft.trim();
    if (!text) return;
    const lastEnd = edit.subtitles.length ? edit.subtitles[edit.subtitles.length - 1].endSec : 0;
    const line: SubtitleLine = { id: newId("sub"), order: edit.subtitles.length, text, startSec: lastEnd, endSec: lastEnd + 3, cut: false };
    run((e) => setSubtitles(e, [...e.subtitles, line]));
    setDraft("");
  }

  return (
    <section aria-label="자막 기반 편집" className="space-y-stack-tight rounded-surface border border-border bg-surface-2 p-pad-inset" data-video-subtitle-editor>
      <b className="text-caption font-semibold text-text">자막 기반 편집</b>
      <p className="text-caption text-muted">자막 줄을 입력하고, 빼고 싶은 줄은 "컷 표시"를 누르세요. 지금은 여기 적은 자막이 영상에 굽히지 않습니다. 자막 반영과 컷 구간 삭제 렌더링은 모두 다음 단계입니다.</p>
      <div className="flex flex-wrap gap-stack-tight">
        <input aria-label="자막 줄" value={draft} onChange={(e) => setDraft(e.target.value)} onKeyDown={(e) => e.key === "Enter" && addLine()} placeholder="자막 한 줄" className="flex-1 min-w-40 rounded-control border border-border bg-surface p-stack text-body text-text" />
        <Button size="sm" disabled={!draft.trim()} onClick={addLine}>줄 추가</Button>
      </div>
      <ul className="space-y-stack-tight" data-video-subtitle-list>
        {edit.subtitles.map((line) => (
          <li key={line.id} className={`flex items-center gap-stack-tight rounded-control border p-stack text-caption ${line.cut ? "border-danger bg-danger-soft text-danger line-through" : "border-border bg-surface text-text"}`} data-video-subtitle-id={line.id} data-video-subtitle-cut={line.cut}>
            <span className="flex-1">{line.text}</span>
            <Button size="sm" variant="secondary" onClick={() => run((d) => toggleSubtitleCut(d, line.id))}>{line.cut ? "컷 취소" : "컷 표시"}</Button>
          </li>
        ))}
      </ul>
      <p className="text-caption text-subtle">컷 표시된 줄 {cutCount}개</p>
    </section>
  );
}

function VoiceSelector({ edit, run }: { edit: VideoEdit; run: (op: (e: VideoEdit) => VideoEdit) => void }) {
  const [voices, setVoices] = useState<Array<{ id: string; name: string; category: string }> | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    // M4(2026-09-22 코드리뷰): res.ok를 안 보고 data.error(영문 원문·String(e))를 그대로
    // 화면에 찍었다. status/code로 분기하고, 사람이 읽는 한국어 고정 문구만 보여준다.
    fetch("/api/elevenlabs-voices", { headers: authHeaders() })
      .then(async (res) => {
        const data = (await res.json().catch(() => null)) as { voices?: Array<{ id: string; name: string; category: string }>; code?: string } | null;
        if (cancelled) return;
        // MINOR(2026-09-22 코드리뷰): res.ok인데 voices가 빈 배열이면 그것도 성공이다
        // ("목록 없음"과 "호출 실패"는 다른 사건). 빈 배열도 voices에 담아 성공 분기로
        // 보내고, 화면은 "목소리가 없다"를 loadError가 아닌 안내문으로 따로 보여준다.
        if (res.ok && data && Array.isArray(data.voices)) {
          setVoices(data.voices);
          return;
        }
        if (res.status === 503 || data?.code === "ELEVENLABS_NOT_CONFIGURED") {
          setLoadError("음성 설정이 아직 연결되지 않았습니다. 설정에서 먼저 연결해 주세요.");
          return;
        }
        console.error("elevenlabs-voices 응답 실패", { status: res.status, code: data?.code });
        setLoadError("목소리 목록을 불러오지 못했습니다. 잠시 후 다시 시도해 주세요.");
      })
      .catch((cause) => {
        console.error("elevenlabs-voices 요청 실패", cause);
        if (!cancelled) setLoadError("연결이 끊겨 목소리 목록을 불러오지 못했습니다.");
      });
    return () => { cancelled = true; };
  }, []);

  return (
    <section aria-label="음성 변경" className="space-y-stack-tight rounded-surface border border-border bg-surface-2 p-pad-inset" data-video-voice-editor>
      <b className="text-caption font-semibold text-text">음성 변경</b>
      {loadError ? <p className="text-caption text-danger" data-video-voice-error>{loadError}</p> : null}
      {!voices && !loadError ? <p className="text-caption text-muted">목소리 목록을 불러오는 중입니다.</p> : null}
      {voices && voices.length === 0 ? <p className="text-caption text-muted" data-video-voice-empty>연결된 음성 설정에 등록된 목소리가 없습니다.</p> : null}
      {voices ? (
        <div className="flex flex-wrap gap-stack-tight" data-video-voice-options>
          {voices.map((voice) => (
            <Button
              key={voice.id}
              size="sm"
              variant={edit.voice?.voiceId === voice.id ? "primary" : "secondary"}
              aria-pressed={edit.voice?.voiceId === voice.id}
              onClick={() => run((e) => setVoice(e, { voiceId: voice.id, voiceName: voice.name }))}
            >
              {voice.name}
            </Button>
          ))}
        </div>
      ) : null}
      <p className="text-caption text-subtle" data-video-voice-status>
        {edit.voice ? `선택된 목소리: ${edit.voice.voiceName}. 지금은 선택만 저장됩니다. 실제 목소리 교체는 다음 단계입니다.` : "아직 목소리를 고르지 않았습니다. 지금 이 영상은 기존 음성을 그대로 씁니다."}
      </p>
    </section>
  );
}
