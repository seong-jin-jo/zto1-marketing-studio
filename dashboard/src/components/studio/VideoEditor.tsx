"use client";

/**
 * 편집실 영상 편집 UI — v70 2단계(design-spec-editroom-v70.md §4).
 *
 * 1단계(과업 B)는 4단 세로 아코디언 + 초 숫자 입력칸이었다. 회장 R-25가 "편집실이
 * 못 쓸 물건", "영상 편집은 CapCut·Vrew 수준이어야 한다"고 지적했다(20번 가까이 "왜
 * 멈추냐"). 이번 판은 규격표 §4 그대로: 플레이어(288px) + 자막 대본(1fr) 위, 3레인
 * 타임라인(168px) 아래. 자막 한 줄 = 한 컷. 초 숫자 입력칸은 타임라인 드래그로 대체한다.
 *
 * 유지: 오버레이 추가 폼(`OverlayEditor`)·댓글 폼(`CommentOverlayEditor`)·음성 선택
 * (`VoiceSelector`)은 기존 회귀 테스트(video-editor-overlay-boundary.test.tsx,
 * edit-autosave-merge.regression-1.test.tsx)가 그 정확한 DOM(라벨·프리셋 문구·버튼
 * 텍스트)에 걸려 있어 그대로 둔다. 다만 각 오버레이 행의 초 숫자 입력칸은 규격 위반이라
 * 없애고, 시간 조정은 타임라인 드래그로만 한다.
 *
 * 렌더 반영 범위(정직하게 명시, ADR-007): 자막 문구 편집·컷은 `lines`(발행이 쓰는
 * 배열)에 그대로 반영되어 `/api/video/subtitle` 굽기에 실제로 실린다. 그러나 자막·오버레이·
 * 댓글의 시간 배치(타임라인 드래그)는 편집실 미리보기 전용이다 — 굽기는 지금도 영상
 * 길이를 줄 수만큼 균등하게 나눈다(video-subtitle.ts subtitleCues). 오버레이·댓글·음성은
 * 여전히 편집 상태로만 저장되고 mp4에는 굽히지 않는다. 이 사실을 화면에 그대로 적는다.
 */
import { useEffect, useMemo, useRef, useState } from "react";
import { Button } from "@/components/shared/Button";
import { authHeaders } from "@/lib/auth";
import {
  type SubtitleLine,
  type VideoComment,
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
  updateSubtitleText,
  updateSubtitleTiming,
} from "@/lib/studio/video-edit-contract";

/** 1초를 몇 px로 그리는지. design-spec-editroom-v70.md §4.4 "1초 ≈ 12px". */
const PX_PER_SEC = 12;
/** 눈금 간격(초). §4.4 "5초 간격". */
const TICK_SEC = 5;

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
  /**
   * 장면 대본(발행이 쓰는 원문 배열). 있으면 자막 대본 편집기가 이 값을 자막 컷의
   * 출발점으로 삼고, 문구 편집·컷은 이 배열에도 그대로 반영한다(§4.3).
   */
  lines?: string[];
  onLinesChange?: (lines: string[]) => void;
}

function formatSec(sec: number): string {
  return Number.isInteger(sec) ? `${sec}` : sec.toFixed(1);
}

function formatClock(sec: number): string {
  const safe = Number.isFinite(sec) && sec >= 0 ? sec : 0;
  const m = Math.floor(safe / 60);
  const s = Math.floor(safe % 60);
  return `${m}:${String(s).padStart(2, "0")}`;
}

/** VideoEditValidationError.rule → 화면에 보여줄 고정 한국어 문구(N3). */
function videoEditErrorMessage(rule: string): string {
  if (rule === "overlay_text") return "오버레이 문구를 입력해 주세요.";
  if (rule === "comment_author") return "작성자를 입력해 주세요.";
  if (rule === "comment_text") return "댓글 내용을 입력해 주세요.";
  if (rule.startsWith("range_")) return "구간의 시작·끝 시간을 확인해 주세요.";
  return "입력한 값을 확인해 주세요.";
}

export function VideoEditor({ videoEdit, onVideoEditChange, previewVideoUrl, lines = [], onLinesChange }: VideoEditorProps) {
  const [error, setError] = useState<string | null>(null);
  const [duration, setDuration] = useState<number | null>(null);
  const [playhead, setPlayhead] = useState(0);
  const [playing, setPlaying] = useState(false);
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

  function seek(sec: number) {
    if (videoRef.current) videoRef.current.currentTime = sec;
    setPlayhead(sec);
  }

  function togglePlay() {
    const el = videoRef.current;
    if (!el) return;
    if (el.paused) {
      const p = el.play();
      if (p && typeof p.catch === "function") p.catch(() => {});
      setPlaying(true);
    } else {
      el.pause();
      setPlaying(false);
    }
  }

  if (!previewVideoUrl) {
    return (
      <div className="space-y-stack-tight rounded-surface border border-dashed border-border bg-surface-2 p-pad-inset" data-video-editor-empty>
        <b className="block text-body font-semibold text-text">아직 편집할 영상이 없습니다</b>
        <p className="text-caption text-muted">생성실에서 영상을 먼저 만들면 여기서 자막·컷·후킹 CTA·댓글 오버레이·음성을 편집할 수 있습니다.</p>
      </div>
    );
  }

  return (
    <div className="space-y-stack" data-video-editor>
      {error ? <p role="alert" className="rounded-control border border-danger bg-danger-soft p-stack text-caption text-danger" data-video-editor-error>{error}</p> : null}
      <div data-video-workbench className="grid gap-pad-inset [grid-template-rows:minmax(0,1fr)_10.5rem] max-[64rem]:[grid-template-rows:minmax(0,1fr)_9.375rem] max-[26rem]:[grid-template-rows:auto_6.75rem]">
        <div data-video-top className="grid min-w-0 gap-pad-inset [grid-template-columns:18rem_minmax(0,1fr)] max-[64rem]:[grid-template-columns:13.25rem_minmax(0,1fr)] max-[26rem]:grid-cols-1">
          <VideoPlayback
            src={previewVideoUrl}
            videoRef={videoRef}
            overlays={videoEdit.overlays}
            comments={videoEdit.comments}
            activeSubtitleText={activeSubtitleText(videoEdit.subtitles, playhead)}
            playhead={playhead}
            duration={duration}
            playing={playing}
            onTogglePlay={togglePlay}
            voiceName={videoEdit.voice?.voiceName ?? null}
            onLoadedMetadata={(d) => setDuration(d)}
            onTimeUpdate={(t) => setPlayhead(t)}
            onSeek={seek}
          />
          <div className="min-w-0 space-y-stack" data-video-script-column>
            <SubtitleScriptEditor
              lines={lines}
              onLinesChange={onLinesChange}
              edit={videoEdit}
              playhead={playhead}
              onSeek={seek}
              run={run}
            />
            <OverlayEditor edit={videoEdit} duration={duration} playhead={playhead} run={run} />
            <CommentOverlayEditor edit={videoEdit} duration={duration} playhead={playhead} run={run} />
            <VoiceSelector edit={videoEdit} run={run} />
          </div>
        </div>
        <VideoTimeline edit={videoEdit} duration={duration} playhead={playhead} onSeek={seek} run={run} />
      </div>
      <p className="text-caption text-subtle" data-render-status-note>
        자막 문구·컷은 실제 발행 영상에 반영됩니다. 타임라인에서 끌어서 바꾼 시간 배치와 후킹·CTA·댓글 오버레이·음성 선택은
        지금은 편집실 미리보기에서만 보이고, 나가는 영상 파일에 굽는 것은 다음 단계입니다.
      </p>
    </div>
  );
}

function activeSubtitleText(subtitles: SubtitleLine[], playhead: number): string | null {
  const line = subtitles.find((s) => !s.cut && playhead >= s.startSec && playhead < s.endSec);
  return line ? line.text : null;
}

function VideoPlayback({
  src, videoRef, overlays, comments, activeSubtitleText, playhead, duration, playing, onTogglePlay, voiceName, onLoadedMetadata, onTimeUpdate, onSeek,
}: {
  src: string;
  videoRef: React.RefObject<HTMLVideoElement | null>;
  overlays: VideoOverlay[];
  comments: VideoComment[];
  activeSubtitleText: string | null;
  playhead: number;
  duration: number | null;
  playing: boolean;
  onTogglePlay: () => void;
  voiceName: string | null;
  onLoadedMetadata: (duration: number) => void;
  onTimeUpdate: (time: number) => void;
  onSeek: (time: number) => void;
}) {
  const [loadFailed, setLoadFailed] = useState(false);
  const activeOverlays = overlays.filter((o) => playhead >= o.startSec && playhead <= o.endSec);
  const activeComment = comments.find((c) => playhead >= c.startSec && playhead <= c.endSec) ?? null;
  const hook = activeOverlays.find((o) => o.kind === "hook");
  const cta = activeOverlays.find((o) => o.kind === "cta");

  return (
    <div className="min-w-0 space-y-stack-tight" data-video-playback>
      <div className="relative aspect-[9/16] w-full overflow-hidden rounded-surface border border-border bg-player-surface" data-video-screen>
        {loadFailed ? (
          <p className="p-pad-inset text-caption text-danger" data-video-load-failed>영상을 불러오지 못했습니다. 생성실에서 다시 만들어 주세요.</p>
        ) : (
          // 오버레이·자막·컷 구간은 재생 위치와 맞춰야 해서 video DOM ref와
          // onTimeUpdate/onLoadedMetadata를 직접 잡는다. controls는 규격 §4.2 커스텀
          // 조작 줄로 대체한다(raw-media-ok: onError로 로드 실패를 이미 문구로 보여준다).
          <video
            ref={videoRef}
            src={src}
            preload="metadata"
            className="h-full w-full object-contain"
            onLoadedMetadata={(e) => onLoadedMetadata(e.currentTarget.duration)}
            onTimeUpdate={(e) => onTimeUpdate(e.currentTarget.currentTime)}
            onError={() => setLoadFailed(true)}
            data-video-el
          />
        )}
        {hook ? (
          <div data-video-overlay-active data-video-overlay-kind="hook" className="pointer-events-none absolute inset-x-2 top-[22px] mx-auto w-fit max-w-[90%] truncate rounded-chip bg-accent px-stack-tight py-micro text-center text-caption font-bold text-accent-fg">
            {hook.text}
          </div>
        ) : null}
        {cta ? (
          <div data-video-overlay-active data-video-overlay-kind="cta" className="pointer-events-none absolute inset-x-2 bottom-[14px] mx-auto w-fit max-w-[90%] truncate rounded-chip bg-success px-stack-tight py-micro text-center text-caption font-bold text-status-fg">
            {cta.text}
          </div>
        ) : null}
        {activeComment ? (
          <div data-video-comment-active className="pointer-events-none absolute bottom-[108px] left-3 flex max-w-[70%] items-center gap-micro rounded-chip bg-black/60 px-stack-tight py-micro text-caption text-white">
            <span className="grid h-[18px] w-[18px] shrink-0 place-items-center rounded-pill bg-white/20 text-[10px]" aria-hidden="true">{activeComment.author.slice(0, 1)}</span>
            <span className="truncate">{activeComment.author}: {activeComment.text}</span>
          </div>
        ) : null}
        {activeSubtitleText ? (
          <p data-video-subtitle-active className="pointer-events-none absolute inset-x-2 bottom-[56px] text-center text-[15px] font-extrabold leading-[22px] text-white [text-shadow:0_2px_6px_rgba(0,0,0,.8)]">
            {activeSubtitleText}
          </p>
        ) : null}
      </div>
      <div className="flex items-center gap-stack-tight rounded-control bg-player-panel p-stack-tight" data-video-controls>
        <button
          type="button"
          aria-label={playing ? "일시정지" : "재생"}
          onClick={onTogglePlay}
          className="grid h-7 w-7 shrink-0 place-items-center rounded-pill bg-accent text-accent-fg"
          data-video-play-toggle
        >
          {playing ? "❚❚" : "▶"}
        </button>
        {duration ? (
          <input
            aria-label="재생 위치"
            type="range"
            min={0}
            max={duration}
            step={0.1}
            value={playhead}
            onChange={(e) => onSeek(Number.parseFloat(e.target.value))}
            className="h-1 min-w-0 flex-1"
            data-video-scrubber
          />
        ) : <span className="flex-1 text-caption text-subtle">길이 확인 중</span>}
        <span className="shrink-0 text-caption text-subtle">{formatSec(playhead)}초 / {duration ? `${formatSec(duration)}초` : "-"}</span>
      </div>
      <p className="text-caption text-subtle" data-video-voice-row>
        목소리: {voiceName ?? "기존 음성 그대로"}
      </p>
    </div>
  );
}

/**
 * §4.3 자막 대본. 한 줄 = 한 컷. `lines`(발행 원문)를 자막 컷의 출발점으로 삼아
 * `videoEdit.subtitles`를 한 번 시딩하고, 그 뒤로는 문구 편집·컷이 두 곳 모두에
 * 반영된다 — 발행은 `lines`를 읽고(subtitleCues), 미리보기는 `subtitles`의 시간을 읽는다.
 *
 * "무음·군말 한번에 컷"은 넣지 않는다. 실제 무음 검출 데이터가 없다(세션맥락 지시,
 * ADR-007) — 이전 판의 그 단추는 정규식(`/…|\.{3}|^\s*$/`)으로 무음을 흉내 낸 것이었다.
 */
function SubtitleScriptEditor({
  lines, onLinesChange, edit, playhead, onSeek, run,
}: {
  lines: string[];
  onLinesChange?: (lines: string[]) => void;
  edit: VideoEdit;
  playhead: number;
  onSeek: (sec: number) => void;
  run: (op: (e: VideoEdit) => VideoEdit) => void;
}) {
  const seeded = useRef(false);
  useEffect(() => {
    if (seeded.current) return;
    if (edit.subtitles.length > 0) { seeded.current = true; return; }
    const nonEmpty = lines.filter((l) => l.trim());
    if (!nonEmpty.length) return;
    seeded.current = true;
    const seededLines: SubtitleLine[] = nonEmpty.map((text, index) => ({
      id: newId("sub"), order: index, text, startSec: index * 3, endSec: index * 3 + 3, cut: false,
    }));
    run((e) => setSubtitles(e, seededLines));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [lines.join("\u0001")]);

  /** 컷 안 된 자막 문구를 순서대로 발행용 `lines`에 반영한다(발행은 이 배열만 읽는다). */
  function syncLines(subtitles: SubtitleLine[]) {
    if (!onLinesChange) return;
    onLinesChange(subtitles.filter((s) => !s.cut).map((s) => s.text));
  }

  function editText(id: string, text: string) {
    run((e) => {
      const next = updateSubtitleText(e, id, text);
      syncLines(next.subtitles);
      return next;
    });
  }

  function toggleCut(id: string) {
    run((e) => {
      const next = toggleSubtitleCut(e, id);
      syncLines(next.subtitles);
      return next;
    });
  }

  const cutCount = edit.subtitles.filter((s) => s.cut).length;

  return (
    <section aria-label="자막 대본" className="space-y-stack-tight rounded-surface border border-border bg-surface-2 p-pad-inset" data-video-subtitle-script>
      <div className="flex flex-wrap items-center justify-between gap-stack-tight">
        <b className="text-caption font-semibold text-text">자막 대본</b>
        <div className="flex flex-wrap gap-stack-tight" data-video-script-quick-add>
          <Button size="sm" variant="secondary" onClick={() => run((e) => addOverlay(e, "hook", VIDEO_HOOK_PRESETS[0], Math.max(0, playhead), playhead + 3))}>＋훅</Button>
          <Button size="sm" variant="secondary" onClick={() => run((e) => addOverlay(e, "cta", VIDEO_CTA_PRESETS[0], Math.max(0, playhead), playhead + 3))}>＋CTA</Button>
          <Button size="sm" variant="secondary" onClick={() => run((e) => addComment(e, { author: "예시", text: "여기에 실제 댓글로 바꿔주세요", source: "manual", startSec: Math.max(0, playhead), endSec: playhead + 3 }))}>＋댓글</Button>
        </div>
      </div>
      {edit.subtitles.length === 0 ? (
        <p className="text-caption text-muted" data-video-subtitle-empty>장면 대사가 없어 자막 컷이 아직 없습니다. 생성실 대본을 채우면 여기 한 줄씩 나타납니다.</p>
      ) : (
        <ol className="max-h-96 space-y-micro overflow-y-auto" data-video-subtitle-list>
          {edit.subtitles.map((line) => {
            const isCurrent = !line.cut && playhead >= line.startSec && playhead < line.endSec;
            return (
              <li
                key={line.id}
                data-video-subtitle-id={line.id}
                data-video-subtitle-cut={line.cut}
                data-video-subtitle-current={isCurrent}
                className={`grid grid-cols-[44px_minmax(0,1fr)_auto] items-center gap-stack-tight rounded-control border-l-[3px] p-stack-tight text-caption ${
                  line.cut ? "border-l-danger bg-danger-soft text-subtle" : isCurrent ? "border-l-accent bg-accent-soft" : "border-l-border bg-surface"
                }`}
              >
                <button type="button" className="font-mono text-[12px] text-subtle" aria-label={`${formatClock(line.startSec)}로 이동`} onClick={() => onSeek(line.startSec)} data-video-subtitle-seek>
                  {formatClock(line.startSec)}
                </button>
                <input
                  aria-label="자막 문구"
                  value={line.text}
                  disabled={line.cut}
                  onFocus={() => onSeek(line.startSec)}
                  onChange={(e) => editText(line.id, e.target.value)}
                  onKeyDown={(e) => {
                    // §4.3 "줄 삭제(Backspace) = 그 구간 컷". 문구가 이미 비어 있을 때만
                    // 컷 처리한다 — 글자를 지우는 중인 보통의 Backspace를 가로채지 않는다.
                    if (e.key === "Backspace" && line.text.length === 0 && !line.cut) {
                      e.preventDefault();
                      toggleCut(line.id);
                    }
                  }}
                  className={`min-w-0 rounded-control border-0 bg-transparent px-micro text-[15px] leading-[23px] text-text outline-none [word-break:keep-all] ${line.cut ? "line-through text-subtle" : ""}`}
                  data-video-subtitle-text
                />
                <Button size="sm" variant="secondary" onClick={() => toggleCut(line.id)} data-video-subtitle-cut-toggle>
                  {line.cut ? "되돌리기" : "컷"}
                </Button>
              </li>
            );
          })}
        </ol>
      )}
      {cutCount > 0 ? <p className="text-caption text-subtle" data-video-subtitle-cut-count>컷 표시된 줄 {cutCount}개. 발행 영상에서 빠지고, 되돌리기로 되살릴 수 있습니다.</p> : null}
    </section>
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
            <span className="text-subtle" data-video-overlay-range>{formatClock(overlay.startSec)}~{formatClock(overlay.endSec)} · 타임라인에서 끌어 바꿉니다</span>
            <Button size="sm" variant="secondary" aria-label={`${overlayIndex + 1}번째 오버레이 삭제`} onClick={() => run((d) => removeOverlay(d, overlay.id))}>삭제</Button>
            {!overlay.text.trim() ? <p className="w-full text-caption text-warning" data-video-overlay-incomplete>문구가 비어 있는 동안 저장되지 않습니다.</p> : null}
          </li>
        ))}
      </ul>
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
            {!comment.author.trim() || !comment.text.trim() ? <p className="w-full text-caption text-warning" data-video-comment-incomplete>작성자·내용이 비어 있는 동안 저장되지 않습니다.</p> : null}
          </li>
        ))}
      </ul>
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

type DragState = { lane: "overlay" | "comment"; id: string; edge: "move" | "start" | "end"; originStart: number; originEnd: number; originClientX: number } | null;

/**
 * §4.4 타임라인. 레인 3개(자막 / 훅·CTA / 댓글). 자막 레인은 생성된 컷을 그대로 보여주는
 * 시각화이고(초 숫자 입력칸 없이 대본에서 편집·컷한다 — 위 SubtitleScriptEditor 담당),
 * 훅·CTA·댓글 블록은 여기서 끌어서 구간을 바꾼다. 넘치면 가로 스크롤 + 안내 문구.
 */
function VideoTimeline({ edit, duration, playhead, onSeek, run }: {
  edit: VideoEdit;
  duration: number | null;
  playhead: number;
  onSeek: (sec: number) => void;
  run: (op: (e: VideoEdit) => VideoEdit) => void;
}) {
  const trackRef = useRef<HTMLDivElement | null>(null);
  const [drag, setDrag] = useState<DragState>(null);

  const total = Math.max(
    duration ?? 0,
    ...edit.subtitles.map((s) => s.endSec),
    ...edit.overlays.map((o) => o.endSec),
    ...edit.comments.map((c) => c.endSec),
    10,
  );
  const trackWidth = total * PX_PER_SEC;
  const ticks = useMemo(() => {
    const out: number[] = [];
    for (let t = 0; t <= total; t += TICK_SEC) out.push(t);
    return out;
  }, [total]);

  useEffect(() => {
    if (!drag) return;
    function onMove(event: PointerEvent) {
      if (!drag) return;
      const deltaSec = (event.clientX - drag.originClientX) / PX_PER_SEC;
      let nextStart = drag.originStart;
      let nextEnd = drag.originEnd;
      if (drag.edge === "move") {
        const span = drag.originEnd - drag.originStart;
        nextStart = Math.max(0, drag.originStart + deltaSec);
        nextEnd = nextStart + span;
      } else if (drag.edge === "start") {
        nextStart = Math.max(0, Math.min(drag.originEnd - 0.2, drag.originStart + deltaSec));
      } else {
        nextEnd = Math.max(drag.originStart + 0.2, drag.originEnd + deltaSec);
      }
      run((e) => (drag.lane === "overlay"
        ? updateOverlay(e, drag.id, { startSec: nextStart, endSec: nextEnd })
        : updateComment(e, drag.id, { startSec: nextStart, endSec: nextEnd })));
    }
    function onUp() { setDrag(null); }
    window.addEventListener("pointermove", onMove);
    window.addEventListener("pointerup", onUp);
    return () => {
      window.removeEventListener("pointermove", onMove);
      window.removeEventListener("pointerup", onUp);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [drag]);

  function startDrag(lane: "overlay" | "comment", id: string, edge: "move" | "start" | "end", startSec: number, endSec: number, clientX: number) {
    setDrag({ lane, id, edge, originStart: startSec, originEnd: endSec, originClientX: clientX });
  }

  return (
    <div data-video-timeline className="min-w-0 space-y-micro rounded-surface border border-border bg-surface-2 p-stack-tight">
      <p className="text-caption text-subtle" data-video-timeline-hint>← 옆으로 밀어 더 보기 · 블록을 끌어서 구간을 바꿉니다</p>
      <div className="overflow-x-auto" data-video-timeline-scroll>
        <div ref={trackRef} className="relative" style={{ width: `${Math.max(trackWidth, 240)}px` }} data-video-timeline-track>
          <div className="pointer-events-none absolute inset-0" aria-hidden="true">
            {ticks.map((t) => (
              <div key={t} className="absolute top-0 bottom-0 border-l border-border/60" style={{ left: `${t * PX_PER_SEC}px` }}>
                <span className="absolute -top-4 left-0.5 text-[10px] text-subtle">{formatClock(t)}</span>
              </div>
            ))}
            <div className="absolute top-0 bottom-0 w-px bg-accent" style={{ left: `${playhead * PX_PER_SEC}px` }} data-video-timeline-playhead />
          </div>
          <TimelineLane label="자막">
            {edit.subtitles.map((s) => (
              <button
                type="button"
                key={s.id}
                onClick={() => onSeek(s.startSec)}
                data-video-timeline-block="subtitle"
                data-video-timeline-block-id={s.id}
                className={`absolute top-0 h-7 rounded-control px-micro text-left text-[12px] ${s.cut ? "bg-danger/45 line-through text-subtle" : "bg-surface text-text"} border border-border`}
                style={{ left: `${s.startSec * PX_PER_SEC}px`, width: `${Math.max(4, (s.endSec - s.startSec) * PX_PER_SEC)}px` }}
              >
                <span className="block truncate">{s.text || "(빈 자막)"}</span>
              </button>
            ))}
          </TimelineLane>
          <TimelineLane label="훅·CTA">
            {edit.overlays.map((o) => (
              <div
                key={o.id}
                data-video-timeline-block="overlay"
                data-video-timeline-block-id={o.id}
                className={`absolute top-0 flex h-7 items-center rounded-control px-micro text-[12px] font-semibold ${o.kind === "hook" ? "bg-accent-soft text-accent" : "bg-success-soft text-success"} border border-border`}
                style={{ left: `${o.startSec * PX_PER_SEC}px`, width: `${Math.max(4, (o.endSec - o.startSec) * PX_PER_SEC)}px` }}
                onPointerDown={(e) => startDrag("overlay", o.id, "move", o.startSec, o.endSec, e.clientX)}
              >
                <span
                  className="mr-1 h-full w-1.5 shrink-0 cursor-ew-resize"
                  onPointerDown={(e) => { e.stopPropagation(); startDrag("overlay", o.id, "start", o.startSec, o.endSec, e.clientX); }}
                  aria-hidden="true"
                />
                <span className="truncate">{o.text}</span>
                <span
                  className="ml-1 h-full w-1.5 shrink-0 cursor-ew-resize"
                  onPointerDown={(e) => { e.stopPropagation(); startDrag("overlay", o.id, "end", o.startSec, o.endSec, e.clientX); }}
                  aria-hidden="true"
                />
              </div>
            ))}
          </TimelineLane>
          <TimelineLane label="댓글">
            {edit.comments.map((c) => (
              <div
                key={c.id}
                data-video-timeline-block="comment"
                data-video-timeline-block-id={c.id}
                className="absolute top-0 flex h-7 items-center rounded-control border border-border bg-surface px-micro text-[12px]"
                style={{ left: `${c.startSec * PX_PER_SEC}px`, width: `${Math.max(4, (c.endSec - c.startSec) * PX_PER_SEC)}px` }}
                onPointerDown={(e) => startDrag("comment", c.id, "move", c.startSec, c.endSec, e.clientX)}
              >
                <span
                  className="mr-1 h-full w-1.5 shrink-0 cursor-ew-resize"
                  onPointerDown={(e) => { e.stopPropagation(); startDrag("comment", c.id, "start", c.startSec, c.endSec, e.clientX); }}
                  aria-hidden="true"
                />
                <span className="truncate">{c.author}: {c.text}</span>
                <span
                  className="ml-1 h-full w-1.5 shrink-0 cursor-ew-resize"
                  onPointerDown={(e) => { e.stopPropagation(); startDrag("comment", c.id, "end", c.startSec, c.endSec, e.clientX); }}
                  aria-hidden="true"
                />
              </div>
            ))}
          </TimelineLane>
        </div>
      </div>
    </div>
  );
}

function TimelineLane({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="relative flex h-9 items-center gap-stack-tight border-t border-border/40 pt-1 first:border-t-0" data-video-timeline-lane={label}>
      <span className="sticky left-0 z-[1] w-[62px] shrink-0 bg-surface-2 text-[12px] uppercase text-subtle" data-video-timeline-lane-label>{label}</span>
      <div className="relative h-7 min-w-0 flex-1">{children}</div>
    </div>
  );
}
