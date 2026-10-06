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
 * 렌더 반영(ADR-007): 발행실로 이동할 때 videoEdit 을 /api/video/subtitle 에 보낸다.
 * 컷으로 뺀 구간, 타임라인에서 고친 자막 시간, 후킹·CTA 문구, 댓글 문구는 그때
 * 나가는 mp4 에 굽힌다. 적용을 마친 인트로·아웃트로 합성 결과는 미리보기와 발행
 * 파일 후보로 쓴다. S6에서는 목소리·표지·움직이는 제목까지 같은 videoEdit 계약에
 * 저장하고, 목소리·제목은 export queue의 실제 mp4 렌더 입력으로 쓴다.
 */
import { useEffect, useMemo, useRef, useState } from "react";
import { Button } from "@/components/shared/Button";
import { authHeaders } from "@/lib/auth";
import { IntroOutroPanel } from "./IntroOutroPanel";
import { isDeliveryUrlExpired, resignDeliveryUrl } from "./DeliveredMedia";
import {
  type SubtitleLine,
  type VideoComment,
  type VideoEdit,
  type VideoOverlay,
  type VideoTextSticker,
  type VideoTransition,
  VideoEditValidationError,
  addComment,
  addOverlay,
  addTextSticker,
  isIntroOutroStale,
  newId,
  removeComment,
  removeOverlay,
  removeTextSticker,
  setIntroOutroApplied,
  setIntroOutroDefaults,
  setSubtitles,
  setSubtitleStyle,
  setVideoCover,
  setVideoMusic,
  setVideoSafeArea,
  setVideoTransition,
  setVoice,
  updateComment,
  updateOverlay,
  updateSubtitleTiming,
  updateTextSticker,
} from "@/lib/studio/video-edit-contract";
import {
  bodyDurationFromPlaybackDuration,
  bodyTimeFromPlaybackTime,
  isPlaybackTimeWithinBody,
  playbackTimeFromBodyTime,
} from "@/lib/studio/video-edit-time-axis";
import { normalizeSubtitleWindows } from "@/lib/studio/playback-edit-plan";

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

const VIDEO_MUSIC_LIBRARY = [
  { id: "calm-focus", label: "차분한 집중", note: "잔잔한 설명 영상" },
  { id: "bright-step", label: "밝은 발걸음", note: "가벼운 팁 영상" },
  { id: "quiet-pulse", label: "조용한 박동", note: "문제 인식·긴장" },
  { id: "warm-story", label: "따뜻한 이야기", note: "후기·스토리" },
  { id: "clean-drive", label: "깔끔한 추진", note: "CTA·마무리" },
] as const;

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
  /** M6(교차 리뷰 MAJOR): 영상이 없는 빈 상태에 빠져나갈 길을 준다(ADR-007, 규격 §6). */
  onOpenCreate?: () => void;
  /** MAJOR2(3차 재리뷰): 서버 값과 맞추는 동안 편집을 막는다 — 안 막으면 맞추는 도중의
   * 수정이 조용히 사라질 수 있다. */
  syncing?: boolean;
  /**
   * 2026-10-02 회장 지적(편집실 영상 재생 안 됨): previewVideoUrl은 서명 배달 주소라
   * 12시간이면 만료된다. DeliveredMedia(카드·발행실 미리보기)는 만료·로드 실패 시
   * /api/media/resign으로 재서명해 되살리는데, 이 플레이어는 videoRef를 직접 잡아
   * 재생·탐색을 제어해야 해서 DeliveredMedia 컴포넌트를 그대로 못 쓴다. 같은 재서명
   * 경로를 VideoPlayback 안에서 직접 쓰려면 작업 공간 id가 필요하다.
   */
  /** 인트로/아웃트로(Remotion) 삽입 대상 원본 영상 파일명. 2026-10-02 신설(R-27-5). */
  sourceFilename?: string | null;
  /** 현재 미리보기 파일 자체에 자막·오버레이가 이미 구워졌으면 DOM 글자층을 숨긴다. */
  previewContainsBakedText?: boolean;
  tenantId?: string;
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

export function VideoEditor({ videoEdit, onVideoEditChange, previewVideoUrl, lines = [], onLinesChange, onOpenCreate, syncing = false, sourceFilename = null, previewContainsBakedText = false, tenantId }: VideoEditorProps) {
  const [error, setError] = useState<string | null>(null);
  const [duration, setDuration] = useState<number | null>(null);
  const [playhead, setPlayhead] = useState(0);
  const [playbackTime, setPlaybackTime] = useState(0);
  const [playing, setPlaying] = useState(false);
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [drawerTab, setDrawerTab] = useState<"intro" | "text" | "hook" | "transition" | "subtitle" | "music" | "cover">("intro");
  const [showOriginal, setShowOriginal] = useState(false);
  const videoRef = useRef<HTMLVideoElement | null>(null);
  // M3(교차 리뷰): 플레이어 미리보기 자막도 대본·타임라인과 같은 재구성 결과를 봐야
  // 서버에 아직 커밋 안 된(시딩만 된) 상태에서도 글자가 보인다 — 셋이 서로 다른 자막을
  // 보여주면 어느 게 진짜인지 알 수 없다(B2와 같은 이유로 한 계산을 공유한다).
  const displaySubtitles = useMemo(() => reconcileSubtitles(videoEdit.subtitles, lines, duration), [videoEdit.subtitles, lines, duration]);
  const previewSubtitles = useMemo(() => {
    if (!duration) return displaySubtitles;
    return normalizeSubtitleWindows(displaySubtitles, duration).windows.map((window, index) => ({
      id: `preview-${index}`,
      order: index,
      text: window.text,
      startSec: window.startSec,
      endSec: window.endSec,
      cut: false,
    }));
  }, [displaySubtitles, duration]);

  /**
   * B-1(4차 재리뷰 BLOCKER): 이 함수가 videoEdit을 바꾸는 유일한 입구다(오버레이·댓글·
   * 목소리·자막 문구·컷·타임라인 드래그 전부 여기를 거친다). 서버 값과 맞추는 중
   * (syncing)에는 여기서 거절한다 — 컨트롤 하나하나에 disabled를 붙이는 대신 이
   * 한 곳만 막으면 새로 생기는 컨트롤도 자동으로 안전하다. syncing이 시작되기 전
   * localStorage 잠정값 위에서 만든 편집본이 이 문을 통과해 서버 최신값을 덮는 것을
   * 막는다.
   */
  function run(op: (edit: VideoEdit) => VideoEdit) {
    if (syncing) {
      setError("서버 값과 맞추는 중입니다. 잠시 뒤 다시 시도해 주세요.");
      return;
    }
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

  // 인트로/아웃트로가 적용돼 있으면 편집실 미리보기도 합성 결과를 보여준다(2026-10-02
  // 회장 반려: 발행은 됐는데 미리보기가 원본을 계속 보여주면 "적용 안 된 것처럼" 보인다).
  const introOutroStale = isIntroOutroStale(videoEdit.introOutro, sourceFilename);
  const bakedIntroOutroResult = Boolean(videoEdit.introOutro
    && videoEdit.introOutro.compositeFilename
    && videoEdit.introOutro.resultFilename !== videoEdit.introOutro.compositeFilename);
  const effectivePreviewUrl = videoEdit.introOutro && !introOutroStale
    ? videoEdit.introOutro.compositeDeliverUrl
      || (sourceFilename === videoEdit.introOutro.compositeFilename
        ? previewVideoUrl
        : bakedIntroOutroResult && sourceFilename === videoEdit.introOutro.sourceFilename
        ? previewVideoUrl
        : videoEdit.introOutro.deliverUrl)
    : previewVideoUrl;
  const introOutroSourceFilename = videoEdit.introOutro && !introOutroStale
    ? videoEdit.introOutro.sourceFilename
    : sourceFilename;
  const playbackIntroOutro = introOutroStale ? null : videoEdit.introOutro;
  const legacyPreviewContainsBakedText = Boolean(videoEdit.introOutro
    && !introOutroStale
    && bakedIntroOutroResult
    && !videoEdit.introOutro.compositeDeliverUrl
    && sourceFilename === videoEdit.introOutro.resultFilename);
  const bodyLayersVisible = !previewContainsBakedText
    && !legacyPreviewContainsBakedText
    && isPlaybackTimeWithinBody(playbackTime, duration, playbackIntroOutro)
    && !showOriginal;

  useEffect(() => {
    setPlaybackTime(0);
    setPlayhead(0);
  }, [effectivePreviewUrl]);

  if (!previewVideoUrl) {
    // M6(교차 리뷰 MAJOR, ADR-007): 영상이 없어도 대본은 편집할 수 있어야 하고, 빈
    // 상태에는 빠져나갈 길이 있어야 한다. 플레이어·타임라인만 없다고 알리고, 자막 대본
    // 편집기(장면 대사)는 그대로 연다 — 생성실에서 영상이 나오면 이 대본이 그대로 이어진다.
    return (
      <div className="space-y-stack" data-video-editor data-video-editor-empty>
        <div className="space-y-stack-tight rounded-surface border border-dashed border-border bg-surface-2 p-pad-inset">
          <b className="block text-body font-semibold text-text">아직 편집할 영상이 없습니다</b>
          <p className="text-caption text-muted">플레이어·타임라인·후킹 CTA·댓글 오버레이·음성은 영상이 있어야 편집할 수 있습니다. 아래 대본은 지금도 고칠 수 있고, 영상이 나오면 그대로 이어집니다.</p>
          {onOpenCreate ? <Button size="sm" onClick={onOpenCreate}>생성실에서 영상 만들기</Button> : null}
        </div>
        <SubtitleScriptEditor lines={lines} onLinesChange={onLinesChange} edit={videoEdit} playhead={0} onSeek={() => {}} run={run} syncing={syncing} />
      </div>
    );
  }

  // 독립 리뷰 M-3: `/api/higgsfield/asset/...`는 proxy.ts TENANT_AWARE_PATHS에 걸려
  // Bearer 토큰을 요구하는데 video 태그의 src는 Authorization 헤더를 못 보낸다(401). job GET이
  // 이미 서명해 돌려준 `/api/media/<token>` 배달 URL(deliverUrl, Bearer 불필요)을 그대로
  // 쓴다.
  // 독립 리뷰 M-4: 합성 당시 원본과 지금 원본(sourceFilename)이 다르면(생성실 재생성)
  // 낡은 합성이다 — 미리보기도 되돌리고 재적용을 안내한다.
  const playbackPlayhead = playbackTime;

  function seekBodyTime(sec: number) {
    const targetPlaybackTime = playbackTimeFromBodyTime(sec, duration ?? sec, playbackIntroOutro);
    if (videoRef.current) {
      videoRef.current.currentTime = targetPlaybackTime;
    }
    setPlaybackTime(targetPlaybackTime);
    setPlayhead(sec);
  }

  return (
    <div className="space-y-stack" data-video-editor>
      {error ? <p role="alert" className="rounded-control border border-danger bg-danger-soft p-stack text-caption text-danger" data-video-editor-error>{error}</p> : null}
      <div className="flex flex-wrap items-center gap-stack-tight rounded-surface border border-border bg-surface-2 p-stack-tight" data-video-timeline-toolbar>
        <b className="text-caption text-text">타임라인</b>
        <span className="text-caption text-subtle">← 옆으로 밀어 더 보기 · 블록을 끌거나 양끝을 조절합니다</span>
        <span className="grow" />
        <Button size="sm" variant={drawerOpen ? "primary" : "secondary"} aria-expanded={drawerOpen} onClick={() => setDrawerOpen((open) => !open)} data-video-insert-drawer-toggle>＋ 넣기 ▾</Button>
        <Button size="sm" variant={videoEdit.safeArea ? "primary" : "secondary"} aria-pressed={videoEdit.safeArea ?? false} onClick={() => run((edit) => setVideoSafeArea(edit, !(edit.safeArea ?? false)))} data-video-safe-area-toggle>안전 영역</Button>
        <Button size="sm" variant={showOriginal ? "primary" : "secondary"} aria-pressed={showOriginal} onClick={() => setShowOriginal((value) => !value)} data-video-original-toggle>{showOriginal ? "편집 상태로" : "원본으로"}</Button>
      </div>
      <div data-video-workbench className="grid gap-pad-inset [grid-template-rows:minmax(0,1fr)_15rem] max-[64rem]:[grid-template-rows:minmax(0,1fr)_15rem] max-[26rem]:[grid-template-rows:auto_15rem]">
        <div data-video-top className="grid min-w-0 gap-pad-inset [grid-template-columns:18rem_minmax(0,1fr)] max-[64rem]:[grid-template-columns:13.25rem_minmax(0,1fr)] max-[26rem]:grid-cols-1">
          <VideoPlayback
            src={effectivePreviewUrl ?? previewVideoUrl}
            tenantId={tenantId}
            onOpenCreate={onOpenCreate}
            videoRef={videoRef}
            overlays={videoEdit.overlays}
            comments={videoEdit.comments}
            activeSubtitle={activeSubtitle(previewSubtitles, playhead)}
            playhead={playhead}
            playbackPlayhead={playbackPlayhead}
            bodyLayersVisible={bodyLayersVisible}
            safeAreaVisible={videoEdit.safeArea ?? false}
            textStickers={videoEdit.textStickers ?? []}
            duration={duration}
            playing={playing}
            onTogglePlay={togglePlay}
            voiceName={videoEdit.voice?.voiceName ?? null}
            onLoadedMetadata={(d) => {
              setDuration(bodyDurationFromPlaybackDuration(d, playbackIntroOutro));
              setPlaybackTime(videoRef.current?.currentTime ?? 0);
            }}
            onTimeUpdate={(t) => {
              setPlaybackTime(t);
              setPlayhead(bodyTimeFromPlaybackTime(t, duration ?? t, playbackIntroOutro));
            }}
            onSeek={seekBodyTime}
          />
          <div className="min-w-0 space-y-stack" data-video-script-column>
            {drawerOpen ? (
              <VideoInsertDrawer
                edit={videoEdit}
                duration={duration}
                playhead={playhead}
                sourceFilename={introOutroSourceFilename}
                tenantId={tenantId}
                activeTab={drawerTab}
                onTab={setDrawerTab}
                onClose={() => setDrawerOpen(false)}
                run={run}
              />
            ) : <><SubtitleScriptEditor
              lines={lines}
              onLinesChange={onLinesChange}
              edit={videoEdit}
              playhead={playhead}
              duration={duration}
              onSeek={seekBodyTime}
              run={run}
              syncing={syncing}
            />
            <OverlayEditor edit={videoEdit} duration={duration} playhead={playhead} run={run} syncing={syncing} />
            <CommentOverlayEditor edit={videoEdit} duration={duration} playhead={playhead} run={run} syncing={syncing} />
            <VoiceSelector edit={videoEdit} run={run} syncing={syncing} />
            {introOutroStale ? (
              <p role="alert" className="text-caption text-danger" data-intro-outro-stale-notice>
                원본 영상이 바뀌어 적용했던 인트로/아웃트로가 더 이상 맞지 않습니다. 미리보기·발행 모두
                원본으로 되돌렸습니다. 다시 적용해 주세요.
              </p>
            ) : null}
            </>}
          </div>
        </div>
        <VideoTimeline edit={videoEdit} displaySubtitles={displaySubtitles} duration={duration} playhead={playhead} onSeek={seekBodyTime} run={run} syncing={syncing} showOriginal={showOriginal} />
      </div>
      <p className="text-caption text-subtle" data-render-status-note>
        내보내면 컷, 자막 시간·스타일, 글·스티커, 훅·CTA·댓글, 배경음악, 인트로·아웃트로가 한 영상 파일에 반영됩니다. 안전 영역과 원본 보기 표시는 편집 가이드라 결과 파일에는 들어가지 않습니다.
      </p>
    </div>
  );
}

/**
 * 컷한 줄은 미리보기에서 숨기지 않는다. 흐리게 보여 줘야 되돌릴 수 있다.
 * 파일에서는 그 구간과 그 자막이 빠진다. 미리보기와 파일이 같은 줄을 가리키되,
 * 미리보기는 편집 중인 줄을 계속 보여 준다.
 */
function activeSubtitle(subtitles: SubtitleLine[], playhead: number): { text: string; cut: boolean } | null {
  const line = subtitles.find((s) => playhead >= s.startSec && playhead < s.endSec);
  return line ? { text: line.text, cut: line.cut } : null;
}

function VideoPlayback({
  src, tenantId, onOpenCreate, videoRef, overlays, comments, activeSubtitle, playhead, playbackPlayhead, bodyLayersVisible, safeAreaVisible, textStickers, duration, playing, onTogglePlay, voiceName, onLoadedMetadata, onTimeUpdate, onSeek,
}: {
  src: string;
  tenantId?: string;
  onOpenCreate?: () => void;
  videoRef: React.RefObject<HTMLVideoElement | null>;
  overlays: VideoOverlay[];
  comments: VideoComment[];
  activeSubtitle: { text: string; cut: boolean } | null;
  playhead: number;
  playbackPlayhead: number;
  bodyLayersVisible: boolean;
  safeAreaVisible: boolean;
  textStickers: VideoTextSticker[];
  duration: number | null;
  playing: boolean;
  onTogglePlay: () => void;
  voiceName: string | null;
  onLoadedMetadata: (duration: number) => void;
  onTimeUpdate: (time: number) => void;
  onSeek: (time: number) => void;
}) {
  const [loadFailed, setLoadFailed] = useState(false);
  /*
    2026-10-02 회장 지적: 편집실 영상이 재생 안 됨. previewVideoUrl(서명 배달 주소)이
    12시간 지나면 만료되는데 이 플레이어는 토큰을 문자열 그대로 video의 src 속성에
    꽂고 있었다 — DeliveredMedia(카드·발행실 미리보기)가 쓰는 재서명 경로가 없었다. 같은
    판정·재서명 함수를 여기서 직접 불러 videoRef 제어를 유지한 채 되살린다.
  */
  const [resolvedSrc, setResolvedSrc] = useState(() => (isDeliveryUrlExpired(src) ? "" : src));
  const [renewing, setRenewing] = useState(() => isDeliveryUrlExpired(src));
  const resignAttempted = useRef("");
  const resignInFlight = useRef<{ key: string; promise: Promise<string> } | null>(null);
  const mountedRef = useRef(false);
  const latestRequestKeyRef = useRef(`${tenantId || ""}|${src}`);
  latestRequestKeyRef.current = `${tenantId || ""}|${src}`;
  /*
    2026-10-02 독립 리뷰어 BLOCK-M-D: 이전 판은 handleError의 재시도 가드가
    `resignAttempted.current === attemptKey && !resolvedSrc` 였다. 재서명이 한 번
    성공하면 resolvedSrc가 채워지므로 이 조건은 다시는 true가 안 된다 — 코덱 깨짐·
    Range 미지원처럼 "주소는 새로 받았는데 그 영상도 여전히 재생이 안 되는" 경우
    onError→재서명→src 교체→onError가 무한히 돈다. DeliveredMedia.tsx:157과 같은
    패턴으로 고친다: 같은 attemptKey(작업공간+원본 주소)당 **딱 한 번**만 재시도하고,
    그 한 번이 성공했든 실패했든 다음 onError는 즉시 실패로 닫는다. 마운트 시 만료
    판정으로 이미 한 번 썼으면(아래 effect) handleError는 두 번째 시도를 안 한다 —
    DeliveredMedia도 "만료라서 미리 썼다"와 "멀쩡해 보였는데 걸어보니 터졌다"를
    합쳐 총 1회로 센다.
  */
  const activeOverlays = bodyLayersVisible
    ? overlays.filter((o) => playhead >= o.startSec && playhead <= o.endSec)
    : [];
  const activeComment = bodyLayersVisible
    ? comments.find((c) => playhead >= c.startSec && playhead <= c.endSec) ?? null
    : null;
  const activeTextStickers = bodyLayersVisible
    ? textStickers.filter((item) => playhead >= item.startSec && playhead <= item.endSec)
    : [];
  const hook = activeOverlays.find((o) => o.kind === "hook");
  const cta = activeOverlays.find((o) => o.kind === "cta");

  // 재서명으로 src가 바뀌면 video 엘리먼트가 다시 로드되며 브라우저가 재생 위치를
  // 0으로 되돌리고 멈춘다. 사용자가 보던 자리·재생 상태를 되살린다(독립 리뷰어 MINOR).
  const restoreOnLoad = useRef(false);
  const playbackPlayheadRef = useRef(playbackPlayhead);
  playbackPlayheadRef.current = playbackPlayhead;
  const playingRef = useRef(playing);
  playingRef.current = playing;

  useEffect(() => {
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
    };
  }, []);

  const canApplyResignResult = (attemptKey: string) => (
    mountedRef.current && latestRequestKeyRef.current === attemptKey
  );

  useEffect(() => {
    const attemptKey = `${tenantId || ""}|${src}`;
    setLoadFailed(false);
    if (!isDeliveryUrlExpired(src)) {
      resignAttempted.current = "";
      setResolvedSrc(src);
      setRenewing(false);
      return;
    }
    let promise: Promise<string>;
    if (resignAttempted.current === attemptKey) {
      if (resignInFlight.current?.key !== attemptKey) return;
      promise = resignInFlight.current.promise;
    } else {
      resignAttempted.current = attemptKey;
      promise = resignDeliveryUrl(src, tenantId);
      resignInFlight.current = { key: attemptKey, promise };
    }
    let canceled = false;
    setResolvedSrc("");
    setRenewing(true);
    void promise.then((next) => {
      if (canceled || !canApplyResignResult(attemptKey)) return;
      if (resignInFlight.current?.promise === promise) resignInFlight.current = null;
      setRenewing(false);
      if (next) { restoreOnLoad.current = true; setResolvedSrc(next); }
      else setLoadFailed(true);
    });
    return () => { canceled = true; };
  }, [src, tenantId]);

  async function handleError() {
    const attemptKey = `${tenantId || ""}|${src}`;
    if (resignAttempted.current === attemptKey) {
      setLoadFailed(true);
      return;
    }
    resignAttempted.current = attemptKey;
    const next = await resignDeliveryUrl(src, tenantId);
    if (!canApplyResignResult(attemptKey)) return;
    if (next) { restoreOnLoad.current = true; setResolvedSrc(next); }
    else setLoadFailed(true);
  }

  async function retryResign() {
    const attemptKey = `${tenantId || ""}|${src}`;
    resignAttempted.current = attemptKey;
    setLoadFailed(false);
    setRenewing(true);
    setResolvedSrc("");
    const promise = resignDeliveryUrl(src, tenantId);
    resignInFlight.current = { key: attemptKey, promise };
    const next = await promise;
    if (!canApplyResignResult(attemptKey)) return;
    if (resignInFlight.current?.promise === promise) resignInFlight.current = null;
    setRenewing(false);
    if (next) {
      restoreOnLoad.current = true;
      setResolvedSrc(next);
      return;
    }
    setLoadFailed(true);
  }

  function handleLoadedMetadata(duration: number) {
    onLoadedMetadata(duration);
    if (restoreOnLoad.current) {
      restoreOnLoad.current = false;
      const el = videoRef.current;
      if (el) {
        el.currentTime = playbackPlayheadRef.current;
        if (playingRef.current) {
          const p = el.play();
          if (p && typeof p.catch === "function") p.catch(() => {});
        }
      }
    }
  }

  return (
    <div className="min-w-0 space-y-stack-tight max-[26rem]:grid max-[26rem]:grid-rows-[auto_auto_auto] max-[26rem]:gap-stack-tight max-[26rem]:space-y-none" data-video-playback>
      <div className="relative aspect-[9/16] w-full overflow-hidden rounded-surface border border-border bg-player-surface max-[26rem]:h-40 max-[26rem]:min-h-40 max-[26rem]:aspect-auto" data-video-screen>
        {loadFailed ? (
          <div className="space-y-stack-tight p-pad-inset" role="alert" data-video-load-failed>
            <p className="text-caption text-danger">영상 주소가 만료됐거나 원본 파일을 찾지 못해 재생하지 못했습니다.</p>
            <p className="text-caption text-muted">편집한 대본과 설정은 그대로 남아 있습니다.</p>
            <div className="flex flex-wrap gap-stack-tight">
              <Button size="sm" onClick={() => void retryResign()}>영상 주소 다시 받기</Button>
              {onOpenCreate ? <Button size="sm" variant="secondary" onClick={onOpenCreate}>생성실에서 영상 확인</Button> : null}
            </div>
          </div>
        ) : renewing ? (
          <p className="p-pad-inset text-caption text-subtle" data-video-renewing>영상 주소를 다시 받는 중입니다</p>
        ) : (
          // controls는 규격 §4.2 커스텀 조작 줄로 대체한다(handleError는 재서명 1회
          // 재시도 후 실패로 닫는다. 위 useEffect·handleLoadedMetadata 참고).
          // raw-media-ok: DeliveredMedia는 ref를 안 내줘 재생·탐색을 직접 못 건다 —
          // 대신 그 재서명 로직을 이 파일에 그대로 재사용했다(resolvedSrc가 그 결과).
          <video
            ref={videoRef}
            src={resolvedSrc}
            preload="metadata"
            className="h-full w-full object-contain"
            onLoadedMetadata={(e) => handleLoadedMetadata(e.currentTarget.duration)}
            onTimeUpdate={(e) => onTimeUpdate(e.currentTarget.currentTime)}
            onError={handleError}
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
          <div data-video-comment-active className="pointer-events-none absolute bottom-[108px] left-3 flex max-w-[70%] items-center gap-micro rounded-chip bg-player-surface/60 px-stack-tight py-micro text-caption text-player-text">
            <span className="grid h-[18px] w-[18px] shrink-0 place-items-center rounded-pill bg-player-text/20 text-caption" aria-hidden="true">{activeComment.author.slice(0, 1)}</span>
            <span className="truncate">{activeComment.author}: {activeComment.text}</span>
          </div>
        ) : null}
        {activeTextStickers.map((item, index) => (
          <div
            key={item.id}
            data-video-text-sticker-active={item.kind}
            data-video-text-animation={item.animation}
            className={`pointer-events-none absolute inset-x-3 mx-auto w-fit max-w-[86%] truncate rounded-chip px-stack-tight py-micro text-center font-bold ${item.kind === "sticker" ? "bg-warning-soft text-warning" : "bg-player-surface/70 text-player-text"}`}
            style={{ top: `${30 + index * 9}%` }}
          >
            {item.text}
          </div>
        ))}
        {bodyLayersVisible && activeSubtitle ? (
          <p
            data-video-subtitle-active
            data-video-subtitle-active-cut={activeSubtitle.cut}
            className={`pointer-events-none absolute inset-x-2 bottom-[56px] text-center text-body font-extrabold [text-shadow:0_2px_6px_rgba(0,0,0,.8)] ${activeSubtitle.cut ? "text-player-text/45" : "text-player-text"}`}
          >
            {activeSubtitle.text}
          </p>
        ) : null}
        {safeAreaVisible ? (
          <div className="pointer-events-none absolute inset-x-[13%] bottom-[21.9%] top-[11.5%] rounded-control border border-dashed border-warning" aria-label="플랫폼 안전 영역" data-video-safe-area-guide />
        ) : null}
      </div>
      <div className="flex items-center gap-stack-tight rounded-control bg-player-panel p-stack-tight" data-video-controls>
        <Button
          variant="primary"
          aria-label={playing ? "일시정지" : "재생"}
          onClick={onTogglePlay}
          className="shrink-0 rounded-pill p-none"
          data-video-play-toggle
        >
          {playing ? "❚❚" : "▶"}
        </Button>
        {duration ? (
          <input
            aria-label="재생 위치"
            type="range"
            min={0}
            max={duration}
            step={0.1}
            value={playhead}
            onChange={(e) => onSeek(Number.parseFloat(e.target.value))}
            className="min-h-control-touch min-w-0 flex-1"
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
/**
 * 자막 목록을 장면 대사(`lines`) 기준으로 순수하게 다시 맞춘다. 부작용이 없다 — 아무것도
 * 저장하거나 dispatch하지 않는다.
 *
 * B1/B2/M1(교차 리뷰 BLOCK·MAJOR): 이전 판은 마운트 시 `edit.subtitles`가 비어 있으면
 * 곧바로 `run()`으로 시딩을 dispatch했다. 서버 값이 아직 도착하기 전(새로고침 직후,
 * draft_id 로드 경합 중)에 이게 실행되면 빈 videoEdit이 800ms 뒤 서버로 나가
 * 오버레이·댓글·목소리·컷을 통째로 지웠다(drafts/route.ts가 videoEdit을 부분 병합이 아니라
 * 통째 치환한다). 같은 함수가 이전 형식 데이터를 열 때(자막 목록과 장면 대사가 다를 때)와
 * 일괄 편집으로 대사가 바뀔 때도 동일하게 "장면 대사가 사라진다/되돌아간다" 버그를 냈다 —
 * 이유는 같다: 시딩·동기화가 저장을 유발하는 부작용이었기 때문이다.
 *
 * 고친 모델: 화면에 보여줄 자막 목록은 항상 `lines`에서 매 렌더 다시 계산한다(위치로
 * 대응, 문구는 항상 `lines[i]`를 따른다). 서버에는 사용자가 실제로 조작(문구 수정·컷·
 * 타임라인 드래그)할 때만 그 시점의 계산 결과를 커밋해서 내보낸다.
 */
/**
 * M3(교차 리뷰 MAJOR): 새로 만드는 구간의 시간은 굽기와 같은 규칙(영상 길이를 줄 수로
 * 고르게 나눈다, `video-subtitle.ts` `subtitleCues`와 동일)을 쓴다. 이전 판은 줄당
 * 고정 3초를 썼는데, 6초짜리 클립에 대사가 다섯 줄이면 미리보기와 실제 자막 타이밍이
 * 서로 달랐다. `duration`을 모르면(플레이어 로드 전) 그 함수와 같은 기본값 6초를 쓴다.
 */
/**
 * P4(교차 리뷰 재리뷰 MAJOR): 위치(index)로만 기존 컷·타이밍을 이어 붙이면, 대사 줄
 * 수가 바뀐 사이(맨 앞에 줄이 빠지거나 끼어드는 등) 자막이 엉뚱한 줄에 붙는다 —
 * 예: 서버 자막 [첫째(안컷), 둘째(컷), 셋째(안컷)]인데 lines가 ["둘째","셋째"]로
 * 바뀌면(첫째가 빠짐) 옛 코드는 "둘째"에 첫째의 "안컷"을, "셋째"에 둘째의 "컷"을 붙였다
 * — 실제로 컷한 줄과 정반대로 보였다. 줄 수가 서버 값과 다르면 위치 대응 자체를
 * 신뢰할 수 없으므로 컷·타이밍을 비우고 새로 시작한다(순서가 바뀐 것도 같은 이유로
 * 포함해 둔다 — 실제 콘텐츠 매칭 없이는 어느 줄이 어느 줄인지 구분할 수 없다).
 */
function reconcileSubtitles(subtitles: SubtitleLine[], lines: string[], duration: number | null): SubtitleLine[] {
  const total = duration && duration > 0 ? duration : 6;
  const slot = lines.length > 0 ? total / lines.length : total;
  const sameCount = subtitles.length === lines.length;
  // S6: 타임라인에서 사용자가 옮기거나 양끝을 조절한 시간은 다시 열어도 보존한다.
  // 글과 순서가 모두 같을 때만 같은 자막으로 확정할 수 있다. 줄 삽입·삭제·재배열이면
  // 아래 기존 안전 규칙대로 현재 순서 기준 시간을 다시 계산한다.
  const sameOrder = sameCount && subtitles.every((line, index) => line.text === lines[index]);
  const used = new Set<string>();
  return lines.map((text, index) => {
    let existing: SubtitleLine | undefined;
    if (sameCount) {
      // P7(3차 재리뷰 MAJOR): 줄 수는 같아도 순서가 바뀔 수 있다(끌어서 옮기기 등).
      // 위치만 믿으면 컷·타이밍이 엉뚱한 줄로 간다 — 그 자리 글자가 같을 때만 그대로
      // 쓰고, 다르면 같은 글자를 가진 아직 안 쓴 줄을 찾아 그 줄의 컷·타이밍을 옮긴다.
      // 어디에도 같은 글자가 없으면(진짜 새 줄) 아래에서 새로 시작한다.
      const atIndex = subtitles[index];
      existing = atIndex && atIndex.text === text && !used.has(atIndex.id)
        ? atIndex
        : subtitles.find((s) => s.text === text && !used.has(s.id));
    }
    // MINOR(4차 재리뷰): 위치는 바뀌었는데 글자가 같은 줄(중복 문장)을 매칭할 때, 매칭된
    // 줄의 순서가 바뀌었는데 옛 시간(startSec/endSec)을 그대로 들고 오면 타이밍이
    // 뒤죽박죽(역순)이 될 수 있다. 그래서 순서가 달라진 경우만 index 기준으로 다시
    // 계산한다. 글과 순서가 같다면 S6 타임라인에서 직접 조정한 시간을 보존한다.
    const startSec = sameOrder && existing ? existing.startSec : index * slot;
    const endSec = sameOrder && existing ? existing.endSec : index === lines.length - 1 ? total : (index + 1) * slot;
    if (existing) {
      used.add(existing.id);
      return { ...existing, text, order: index, startSec, endSec: Math.max(startSec + 0.1, endSec) };
    }
    return { id: newId("sub"), order: index, text, startSec, endSec: Math.max(startSec + 0.1, endSec), cut: false };
  });
}

function SubtitleScriptEditor({
  lines, onLinesChange, edit, playhead, duration = null, onSeek, run, syncing = false,
}: {
  lines: string[];
  onLinesChange?: (lines: string[]) => void;
  edit: VideoEdit;
  playhead: number;
  duration?: number | null;
  onSeek: (sec: number) => void;
  run: (op: (e: VideoEdit) => VideoEdit) => void;
  syncing?: boolean;
}) {
  const displaySubtitles = useMemo(() => reconcileSubtitles(edit.subtitles, lines, duration), [edit.subtitles, lines, duration]);
  // 서버에 저장된 그대로(재구성 전)와 화면에 보이는 것(재구성 후)이 다르면 아직 저장 안 한
  // 시딩·재동기화 상태다 — 조작 전에는 절대 dispatch하지 않았다는 것을 화면에도 밝힌다.
  const pendingCommit = edit.subtitles.length !== displaySubtitles.length
    || edit.subtitles.some((s, i) => s.text !== displaySubtitles[i]?.text);
  // MINOR(3차 재리뷰): 줄 수가 달라 컷·타이밍을 초기화했을 때 그 사실을 알린다(위
  // reconcileSubtitles의 P4 규칙 — 매칭되는 글자가 없으면 새로 시작한다).
  const resetByCountMismatch = edit.subtitles.length > 0 && edit.subtitles.length !== lines.length;

  /**
   * 문구 수정은 `lines`(대본 원문)와 `videoEdit.subtitles`에 함께 반영한다.
   * 컷은 대본 문구를 지우지 않고 subtitle의 `cut` 표식만 바꾼다. 내보내기에서는
   * playback-edit-plan이 그 표식의 시간 구간을 영상·음성·구운 자막에서 함께 제거한다.
   */
  function commitText(index: number, text: string) {
    // MINOR(5차 재리뷰): syncing 중에는 run()이 videoEdit 쪽을 거절하는데, 이 함수는
    // 그와 상관없이 onLinesChange(대본 원문)를 항상 실행해왔다 — videoEdit과 lines가
    // 서로 다른 상태(하나는 안 바뀌고 하나만 바뀐)로 갈라졌다. run()이 실제로 거절했는지
    // syncing 값으로 먼저 확인하고, 거절되면 lines도 함께 보류한다.
    if (syncing) return;
    const nextSubtitles = displaySubtitles.map((s, i) => (i === index ? { ...s, text } : s));
    run((e) => setSubtitles(e, nextSubtitles));
    onLinesChange?.(lines.map((l, i) => (i === index ? text : l)));
  }

  function commitCut(index: number) {
    const nextSubtitles = displaySubtitles.map((s, i) => (i === index ? { ...s, cut: !s.cut } : s));
    run((e) => setSubtitles(e, nextSubtitles));
  }

  const cutCount = displaySubtitles.filter((s) => s.cut).length;

  return (
    <section aria-label="자막 대본" className="space-y-stack-tight rounded-surface border border-border bg-surface-2 p-pad-inset" data-video-subtitle-script>
      <div className="flex flex-wrap items-center justify-between gap-stack-tight">
        <b className="text-caption font-semibold text-text">자막 대본</b>
        <div className="flex flex-wrap gap-stack-tight" data-video-script-quick-add>
          <Button size="sm" variant="secondary" disabled={syncing} onClick={() => run((e) => addOverlay(e, "hook", VIDEO_HOOK_PRESETS[0], Math.max(0, playhead), playhead + 3))}>＋훅</Button>
          <Button size="sm" variant="secondary" disabled={syncing} onClick={() => run((e) => addOverlay(e, "cta", VIDEO_CTA_PRESETS[0], Math.max(0, playhead), playhead + 3))}>＋CTA</Button>
          <Button size="sm" variant="secondary" disabled={syncing} onClick={() => run((e) => addComment(e, { author: "예시", text: "여기에 실제 댓글로 바꿔주세요", source: "manual", startSec: Math.max(0, playhead), endSec: playhead + 3 }))}>＋댓글</Button>
        </div>
      </div>
      {syncing ? <p className="text-caption text-subtle" data-video-syncing-note>서버 값과 맞추는 중입니다. 잠시만요.</p> : null}
      {resetByCountMismatch ? <p className="text-caption text-warning" data-video-subtitle-reset-note>장면 대사 수가 바뀌어 컷·시간 표시를 새로 시작했습니다.</p> : null}
      {displaySubtitles.length === 0 ? (
        <p className="text-caption text-muted" data-video-subtitle-empty>장면 대사가 없어 자막 컷이 아직 없습니다. 생성실 대본을 채우면 여기 한 줄씩 나타납니다.</p>
      ) : (
        <ol className="max-h-96 space-y-micro overflow-y-auto" data-video-subtitle-list data-video-subtitle-pending={pendingCommit}>
          {displaySubtitles.map((line, index) => {
            const isCurrent = !line.cut && playhead >= line.startSec && playhead < line.endSec;
            return (
              <li
                key={line.id}
                data-video-subtitle-id={line.id}
                data-video-subtitle-cut={line.cut}
                data-video-subtitle-current={isCurrent}
                className={`grid grid-cols-[44px_minmax(0,1fr)_auto] items-center gap-stack-tight rounded-control border-l-[3px] p-stack-tight text-caption max-[64rem]:grid-cols-[44px_minmax(44px,1fr)] ${
                  line.cut ? "border-l-danger bg-danger-soft text-subtle" : isCurrent ? "border-l-accent bg-accent-soft" : "border-l-border bg-surface"
                }`}
              >
                <Button
                  size="sm"
                  variant="secondary"
                  className="min-w-0 border-0 bg-transparent p-none font-mono text-caption text-subtle"
                  aria-label={`${formatClock(line.startSec)}로 이동`}
                  onClick={() => onSeek(line.startSec)}
                  data-video-subtitle-seek
                >
                  {formatClock(line.startSec)}
                </Button>
                <input
                  aria-label="자막 문구"
                  value={line.text}
                  disabled={syncing}
                  onFocus={() => onSeek(line.startSec)}
                  onChange={(e) => commitText(index, e.target.value)}
                  onKeyDown={(e) => {
                    // §4.3 "줄 삭제(Backspace) = 그 구간 컷". 문구가 이미 비어 있을 때만
                    // 컷 처리한다 — 글자를 지우는 중인 보통의 Backspace를 가로채지 않는다.
                    if (e.key === "Backspace" && line.text.length === 0 && !line.cut) {
                      e.preventDefault();
                      commitCut(index);
                    }
                  }}
                  className={`min-h-control-touch min-w-0 rounded-control border-0 bg-transparent px-micro text-body text-text outline-none [word-break:keep-all] ${line.cut ? "line-through text-subtle" : ""}`}
                  data-video-subtitle-text
                />
                <Button size="sm" variant="secondary" className="max-[64rem]:col-span-2 max-[64rem]:w-full" disabled={syncing} onClick={() => commitCut(index)} data-video-subtitle-cut-toggle>
                  {line.cut ? "되돌리기" : "컷"}
                </Button>
              </li>
            );
          })}
        </ol>
      )}
      {cutCount > 0 ? <p className="text-caption text-subtle" data-video-subtitle-cut-count>컷 표시 {cutCount}개. 발행실로 이동할 때 그 구간은 영상과 소리에서 빠지고, 그 줄의 자막도 파일에 들어가지 않습니다. 되돌리기로 표시를 되돌릴 수 있습니다.</p> : null}
    </section>
  );
}

function OverlayEditor({ edit, duration, playhead, run, syncing = false }: { edit: VideoEdit; duration: number | null; playhead: number; run: (op: (e: VideoEdit) => VideoEdit) => void; syncing?: boolean }) {
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
        disabled={!text.trim() || syncing}
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
              className="min-h-control-touch min-w-control-touch flex-1 rounded-control border border-border bg-surface-2 px-stack-tight text-caption text-text"
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

function CommentOverlayEditor({ edit, duration, playhead, run, syncing = false }: { edit: VideoEdit; duration: number | null; playhead: number; run: (op: (e: VideoEdit) => VideoEdit) => void; syncing?: boolean }) {
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
        disabled={!text.trim() || !author.trim() || syncing}
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
              className="min-h-control-touch w-24 rounded-control border border-border bg-surface-2 px-stack-tight text-caption text-text"
            />
            <input
              aria-label={`${commentIndex + 1}번째 댓글 내용`}
              value={comment.text}
              onChange={(e) => run((d) => updateComment(d, comment.id, { text: e.target.value }))}
              className="min-h-control-touch min-w-0 flex-1 rounded-control border border-border bg-surface-2 px-stack-tight text-caption text-text"
            />
            <Button size="sm" variant="secondary" aria-label={`${commentIndex + 1}번째 댓글 삭제`} onClick={() => run((d) => removeComment(d, comment.id))}>삭제</Button>
            {!comment.author.trim() || !comment.text.trim() ? <p className="w-full text-caption text-warning" data-video-comment-incomplete>작성자·내용이 비어 있는 동안 저장되지 않습니다.</p> : null}
          </li>
        ))}
      </ul>
    </section>
  );
}

function VoiceSelector({ edit, run, syncing = false }: { edit: VideoEdit; run: (op: (e: VideoEdit) => VideoEdit) => void; syncing?: boolean }) {
  const [voices, setVoices] = useState<Array<{ id: string; name: string; category: string }> | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [pendingVoice, setPendingVoice] = useState<{ id: string; name: string } | null>(null);

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
              disabled={syncing}
              onClick={() => {
                if (edit.voice?.voiceId === voice.id) return;
                setPendingVoice({ id: voice.id, name: voice.name });
              }}
            >
              {voice.name}
            </Button>
          ))}
        </div>
      ) : null}
      {pendingVoice ? (
        <div role="alert" className="space-y-stack-tight rounded-control border border-warning bg-warning-soft p-stack text-caption text-warning" data-video-voice-confirm>
          <p><b>{pendingVoice.name}</b> 목소리로 바꾸면 내보낼 때 나레이션을 다시 만들고 예상 크레딧 30을 사용합니다.</p>
          <div className="flex flex-wrap gap-stack-tight">
            <Button size="sm" onClick={() => { run((e) => setVoice(e, { voiceId: pendingVoice.id, voiceName: pendingVoice.name })); setPendingVoice(null); }}>바꾸기 · 크레딧 30</Button>
            <Button size="sm" variant="secondary" onClick={() => setPendingVoice(null)}>그대로 두기</Button>
          </div>
        </div>
      ) : null}
      <p className="text-caption text-subtle" data-video-voice-status>
        {edit.voice ? `선택된 목소리: ${edit.voice.voiceName}. 내보낸 MP4의 나레이션에 반영됩니다.` : "아직 목소리를 고르지 않았습니다. 지금 이 영상은 기존 음성을 그대로 씁니다."}
      </p>
    </section>
  );
}

type InsertDrawerTab = "intro" | "text" | "hook" | "transition" | "subtitle" | "music" | "cover";

const INSERT_DRAWER_TABS: Array<{ id: InsertDrawerTab; label: string }> = [
  { id: "intro", label: "인트로" },
  { id: "text", label: "글·스티커" },
  { id: "hook", label: "훅·댓글" },
  { id: "transition", label: "전환" },
  { id: "subtitle", label: "자막" },
  { id: "music", label: "음악" },
  { id: "cover", label: "표지" },
];

const SUBTITLE_PRESET_LABELS = [
  ["basic", "기본"],
  ["yellow", "강조 노랑"],
  ["box", "박스"],
  ["brand", "브랜드"],
  ["band", "하단 띠"],
  ["word", "한 단어 강조"],
] as const;

function VideoInsertDrawer({ edit, duration, playhead, sourceFilename, tenantId, activeTab, onTab, onClose, run }: {
  edit: VideoEdit;
  duration: number | null;
  playhead: number;
  sourceFilename: string | null;
  tenantId?: string;
  activeTab: InsertDrawerTab;
  onTab: (tab: InsertDrawerTab) => void;
  onClose: () => void;
  run: (op: (edit: VideoEdit) => VideoEdit) => void;
}) {
  const [text, setText] = useState("");
  const [textKind, setTextKind] = useState<VideoTextSticker["kind"]>("text");
  const [animation, setAnimation] = useState<VideoTextSticker["animation"]>("fade");
  const [musicRights, setMusicRights] = useState(false);
  const [uploading, setUploading] = useState<"music" | "cover" | null>(null);
  const [uploadError, setUploadError] = useState<string | null>(null);
  const blockStart = Math.max(0, Math.min(playhead, Math.max(0, (duration ?? playhead + 3) - 0.5)));
  const blockEnd = Math.max(blockStart + 0.5, Math.min(duration ?? playhead + 3, playhead + 3));

  async function uploadMusic(file: File) {
    if (!musicRights) {
      setUploadError("사용 권한을 확인한 뒤 음악을 올려 주세요.");
      return;
    }
    setUploading("music");
    setUploadError(null);
    try {
      const form = new FormData();
      form.set("file", file);
      form.set("kind", "music");
      form.set("rightsConfirmed", "true");
      if (tenantId) form.set("tenant_id", tenantId);
      const response = await fetch("/api/video/upload", { method: "POST", headers: authHeaders(), body: form });
      const body = await response.json() as { filename?: string; error?: string };
      if (!response.ok || !body.filename) throw new Error(body.error || "음악 업로드 실패");
      run((value) => setVideoMusic(value, {
        source: "upload", assetId: body.filename!, label: file.name, volume: 18, offsetSec: 0,
        fadeOut: true, duckUnderVoice: true, rightsConfirmed: true,
      }));
    } catch (cause) {
      console.error("배경 음악 업로드 실패", cause);
      setUploadError("음악을 올리지 못했습니다. 지원 형식과 파일 크기를 확인해 주세요.");
    } finally {
      setUploading(null);
    }
  }

  async function uploadCover(file: File) {
    setUploading("cover");
    setUploadError(null);
    try {
      const form = new FormData();
      form.set("file", file);
      const response = await fetch("/api/images/upload", { method: "POST", headers: authHeaders(), body: form });
      const body = await response.json() as { filename?: string; url?: string; error?: string };
      if (!response.ok || !body.filename || !body.url) throw new Error(body.error || "표지 업로드 실패");
      run((value) => setVideoCover(value, { source: "upload", imageFilename: body.filename, imageUrl: body.url, textPreset: edit.cover?.textPreset ?? "headline" }));
    } catch (cause) {
      console.error("표지 업로드 실패", cause);
      setUploadError("표지를 올리지 못했습니다. JPG, PNG 또는 WebP 파일인지 확인해 주세요.");
    } finally {
      setUploading(null);
    }
  }

  return (
    <section className="space-y-stack rounded-surface border border-border bg-surface-2 p-pad-inset" aria-label="영상 요소 넣기" data-video-insert-drawer>
      <div className="flex items-center justify-between gap-stack-tight">
        <b className="text-body font-semibold text-text">넣기</b>
        <Button size="sm" variant="secondary" onClick={onClose} aria-label="넣기 서랍 닫기">닫기</Button>
      </div>
      <div className="flex gap-stack-tight overflow-x-auto pb-micro" role="tablist" aria-label="넣을 요소">
        {INSERT_DRAWER_TABS.map((tab) => (
          <Button key={tab.id} size="sm" variant={activeTab === tab.id ? "primary" : "secondary"} role="tab" aria-selected={activeTab === tab.id} onClick={() => onTab(tab.id)}>{tab.label}</Button>
        ))}
      </div>
      {uploadError ? <p role="alert" className="text-caption text-danger">{uploadError}</p> : null}

      {activeTab === "intro" ? (
        <div className="space-y-stack-tight" data-video-drawer-intro>
          <IntroOutroPanel sourceFilename={sourceFilename} tenantId={tenantId} applied={edit.introOutro} transitions={edit.transitions} onApplied={(applied) => run((value) => setIntroOutroApplied(value, applied))} />
          <div className="grid grid-cols-2 gap-stack-tight">
            <Button size="sm" variant={edit.introOutroDefaults?.intro ? "primary" : "secondary"} aria-pressed={edit.introOutroDefaults?.intro ?? false} onClick={() => run((value) => setIntroOutroDefaults(value, { intro: !(value.introOutroDefaults?.intro ?? false) }))}>다음 영상에도 인트로</Button>
            <Button size="sm" variant={edit.introOutroDefaults?.outro ? "primary" : "secondary"} aria-pressed={edit.introOutroDefaults?.outro ?? false} onClick={() => run((value) => setIntroOutroDefaults(value, { outro: !(value.introOutroDefaults?.outro ?? false) }))}>다음 영상에도 아웃트로</Button>
          </div>
        </div>
      ) : null}

      {activeTab === "text" ? (
        <div className="space-y-stack-tight" data-video-drawer-text>
          <div className="flex flex-wrap gap-stack-tight">
            <Button size="sm" variant={textKind === "text" ? "primary" : "secondary"} onClick={() => setTextKind("text")}>글</Button>
            <Button size="sm" variant={textKind === "sticker" ? "primary" : "secondary"} onClick={() => setTextKind("sticker")}>스티커</Button>
            <select aria-label="움직임" value={animation} onChange={(event) => setAnimation(event.target.value as VideoTextSticker["animation"])} className="min-h-control-touch rounded-control border border-border bg-surface px-stack-tight text-body">
              <option value="none">움직임 없음</option><option value="fade">서서히</option><option value="rise">위로</option><option value="scale">확대</option><option value="type">타이핑</option>
            </select>
          </div>
          <div className="flex gap-stack-tight">
            <input aria-label="글 또는 스티커 내용" value={text} onChange={(event) => setText(event.target.value)} placeholder={textKind === "text" ? "영상 위 제목" : "예: ✅"} className="min-h-control-touch min-w-0 flex-1 rounded-control border border-border bg-surface px-stack text-body" />
            <Button size="sm" disabled={!text.trim()} onClick={() => { run((value) => addTextSticker(value, { kind: textKind, text: text.trim(), startSec: blockStart, endSec: blockEnd, animation })); setText(""); }}>추가</Button>
          </div>
          <ul className="space-y-micro">
            {(edit.textStickers ?? []).map((item) => <li key={item.id} className="flex items-center gap-stack-tight rounded-control bg-surface p-stack-tight text-caption"><span className="truncate">{item.text}</span><span className="ml-auto text-subtle">{formatClock(item.startSec)}~{formatClock(item.endSec)}</span><Button size="sm" variant="secondary" aria-label={`${item.text} 삭제`} onClick={() => run((value) => removeTextSticker(value, item.id))}>삭제</Button></li>)}
          </ul>
        </div>
      ) : null}

      {activeTab === "hook" ? (
        <div className="space-y-stack-tight" data-video-drawer-hook>
          <p className="text-caption text-subtle">현재 재생 위치에 3초 블록으로 넣고, 아래 타임라인에서 길이를 조절합니다.</p>
          <div className="flex flex-wrap gap-stack-tight">
            {VIDEO_HOOK_PRESETS.map((preset) => <Button key={preset} size="sm" variant="secondary" onClick={() => run((value) => addOverlay(value, "hook", preset, blockStart, blockEnd))}>{preset}</Button>)}
            {VIDEO_CTA_PRESETS.map((preset) => <Button key={preset} size="sm" variant="secondary" onClick={() => run((value) => addOverlay(value, "cta", preset, blockStart, blockEnd))}>{preset}</Button>)}
          </div>
          <CommentOverlayEditor edit={edit} duration={duration} playhead={playhead} run={run} />
        </div>
      ) : null}

      {activeTab === "transition" ? (
        <div className="grid gap-stack" data-video-drawer-transition>
          {(["introToMain", "mainToOutro"] as const).map((edge) => <fieldset key={edge} className="space-y-stack-tight"><legend className="text-caption font-semibold">{edge === "introToMain" ? "인트로 → 본문" : "본문 → 아웃트로"}</legend><div className="flex gap-stack-tight">{(["cut", "fade", "push"] as VideoTransition[]).map((transition) => <Button key={transition} size="sm" aria-pressed={(edit.transitions?.[edge] ?? "cut") === transition} variant={(edit.transitions?.[edge] ?? "cut") === transition ? "primary" : "secondary"} onClick={() => run((value) => setVideoTransition(value, edge, transition))}>{transition === "cut" ? "바로 전환" : transition === "fade" ? "페이드" : "밀기"}</Button>)}</div></fieldset>)}
        </div>
      ) : null}

      {activeTab === "subtitle" ? (
        <div className="space-y-stack" data-video-drawer-subtitle>
          <div className="grid grid-cols-3 gap-stack-tight">{SUBTITLE_PRESET_LABELS.map(([preset, label]) => <Button key={preset} size="sm" variant={(edit.subtitleStyle?.preset ?? "basic") === preset ? "primary" : "secondary"} onClick={() => run((value) => setSubtitleStyle(value, { preset }))}>{label}</Button>)}</div>
          <label className="grid gap-micro text-caption">위치<select value={edit.subtitleStyle?.position ?? "bottom"} onChange={(event) => run((value) => setSubtitleStyle(value, { position: event.target.value as "top" | "middle" | "bottom" }))} className="min-h-control-touch rounded-control border border-border bg-surface px-stack text-body"><option value="top">위</option><option value="middle">가운데</option><option value="bottom">아래</option></select></label>
          <label className="grid gap-micro text-caption">글자 크기 {edit.subtitleStyle?.sizePercent ?? 100}%<input type="range" min="70" max="160" step="10" value={edit.subtitleStyle?.sizePercent ?? 100} onChange={(event) => run((value) => setSubtitleStyle(value, { sizePercent: Number(event.target.value) }))} /></label>
          <Button size="sm" variant={edit.subtitleStyle?.outline ?? true ? "primary" : "secondary"} aria-pressed={edit.subtitleStyle?.outline ?? true} onClick={() => run((value) => setSubtitleStyle(value, { outline: !(value.subtitleStyle?.outline ?? true) }))}>글자 외곽선</Button>
        </div>
      ) : null}

      {activeTab === "music" ? (
        <div className="space-y-stack" data-video-drawer-music>
          <div className="grid grid-cols-2 gap-stack-tight">{VIDEO_MUSIC_LIBRARY.map((track) => <Button key={track.id} size="sm" variant={edit.music?.source === "builtin" && edit.music.assetId === track.id ? "primary" : "secondary"} onClick={() => run((value) => setVideoMusic(value, { source: "builtin", assetId: track.id, label: track.label, volume: 18, offsetSec: 0, fadeOut: true, duckUnderVoice: true, rightsConfirmed: true }))}><span className="grid text-left"><b>{track.label}</b><small>{track.note}</small></span></Button>)}</div>
          <label className="flex min-h-control-touch items-center gap-stack-tight text-caption"><input type="checkbox" checked={musicRights} onChange={(event) => setMusicRights(event.target.checked)} />직접 올릴 음악의 사용 권한을 확인했습니다.</label>
          <label className="grid cursor-pointer gap-micro text-caption">내 음악 올리기<input type="file" accept="audio/mpeg,audio/mp4,audio/wav" disabled={!musicRights || uploading === "music"} onChange={(event) => { const file = event.target.files?.[0]; if (file) void uploadMusic(file); }} /></label>
          {edit.music ? <><label className="grid gap-micro text-caption">음악 크기 {edit.music.volume}%<input type="range" min="0" max="100" value={edit.music.volume} onChange={(event) => run((value) => setVideoMusic(value, value.music ? { ...value.music, volume: Number(event.target.value) } : null))} /></label><div className="flex gap-stack-tight"><Button size="sm" variant={edit.music.duckUnderVoice ? "primary" : "secondary"} onClick={() => run((value) => setVideoMusic(value, value.music ? { ...value.music, duckUnderVoice: !value.music.duckUnderVoice } : null))}>말할 때 줄이기</Button><Button size="sm" variant="secondary" onClick={() => run((value) => setVideoMusic(value, null))}>음악 빼기</Button></div></> : null}
        </div>
      ) : null}

      {activeTab === "cover" ? (
        <div className="space-y-stack" data-video-drawer-cover>
          <p className="text-caption text-subtle">추천 장면 3개 중 고르거나, 원하는 초를 지정하거나, 이미지를 직접 올립니다.</p>
          <div className="grid grid-cols-3 gap-stack-tight">{[0, 1, 2].map((index) => <Button key={index} size="sm" variant={edit.cover?.source === "recommended" && edit.cover.recommendationIndex === index ? "primary" : "secondary"} onClick={() => run((value) => setVideoCover(value, { source: "recommended", recommendationIndex: index, frameSec: (duration ?? 0) * [0.2, 0.5, 0.8][index], textPreset: value.cover?.textPreset ?? "headline" }))}>추천 {index + 1}</Button>)}</div>
          <label className="grid gap-micro text-caption">영상 장면 고르기<input type="range" min="0" max={duration ?? 0} step="0.1" value={edit.cover?.source === "frame" ? edit.cover.frameSec ?? 0 : 0} onChange={(event) => run((value) => setVideoCover(value, { source: "frame", frameSec: Number(event.target.value), textPreset: value.cover?.textPreset ?? "headline" }))} /></label>
          <label className="grid gap-micro text-caption">표지 이미지 올리기<input type="file" accept="image/jpeg,image/png,image/webp" disabled={uploading === "cover"} onChange={(event) => { const file = event.target.files?.[0]; if (file) void uploadCover(file); }} /></label>
          <div className="flex gap-stack-tight"><span className="text-caption">문구:</span>{(["none", "headline", "question"] as const).map((preset) => <Button key={preset} size="sm" variant={(edit.cover?.textPreset ?? "headline") === preset ? "primary" : "secondary"} onClick={() => run((value) => setVideoCover(value, value.cover ? { ...value.cover, textPreset: preset } : { source: "recommended", recommendationIndex: 0, frameSec: (duration ?? 0) * 0.2, textPreset: preset }))}>{preset === "none" ? "없음" : preset === "headline" ? "제목" : "질문"}</Button>)}</div>
        </div>
      ) : null}
    </section>
  );
}

type DragState = { lane: "subtitle" | "text" | "overlay" | "comment"; id: string; edge: "move" | "start" | "end"; originStart: number; originEnd: number; originClientX: number } | null;

/** v71 §S6: 영상, 자막, 글·스티커, 훅·CTA·댓글, 배경 음악의 5레인 타임라인. */
function VideoTimeline({ edit, displaySubtitles, duration, playhead, onSeek, run, syncing = false, showOriginal = false }: {
  edit: VideoEdit;
  /** P3(교차 리뷰 재리뷰 MAJOR): 자막 레인은 서버 원본(edit.subtitles)이 아니라 대본
   * 재구성 결과를 그린다 — 대본·타임라인이 서로 다른 자막을 보여주면 어느 게 진짜인지
   * 알 수 없다(자막 대본 패널과 같은 계산을 공유한다). */
  displaySubtitles: SubtitleLine[];
  duration: number | null;
  playhead: number;
  onSeek: (sec: number) => void;
  run: (op: (e: VideoEdit) => VideoEdit) => void;
  syncing?: boolean;
  showOriginal?: boolean;
}) {
  const trackRef = useRef<HTMLDivElement | null>(null);
  const [drag, setDrag] = useState<DragState>(null);

  const total = Math.max(
    duration ?? 0,
    ...displaySubtitles.map((s) => s.endSec),
    ...(edit.textStickers ?? []).map((item) => item.endSec),
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
      updateBlock(drag.lane, drag.id, nextStart, nextEnd);
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

  // B-1(4차 재리뷰 BLOCKER): 드래그 시작점을 여기 한 곳에서 막는다 — 6개 pointerDown
  // 호출부마다 syncing 체크를 반복하는 대신, 드래그를 여는 이 함수가 거절하면 그 아래
  // onMove가 도는 run() 호출 자체가 발생하지 않는다(run()도 별도로 다시 막지만, 여기서
  // 막으면 드래그 중 화면이 움직이다 뚝 끊기는 어색함도 없앤다).
  function startDrag(lane: NonNullable<DragState>["lane"], id: string, edge: "move" | "start" | "end", startSec: number, endSec: number, clientX: number) {
    if (syncing) return;
    setDrag({ lane, id, edge, originStart: startSec, originEnd: endSec, originClientX: clientX });
  }

  function updateBlock(lane: NonNullable<DragState>["lane"], id: string, startSec: number, endSec: number) {
    const nextStart = Math.max(0, Math.round(startSec * 10) / 10);
    const nextEnd = Math.max(nextStart + 0.2, Math.round(endSec * 10) / 10);
    run((value) => {
      if (lane === "subtitle") {
        const materialized = value.subtitles.some((line) => line.id === id)
          ? value
          : setSubtitles(value, displaySubtitles);
        return updateSubtitleTiming(materialized, id, { startSec: nextStart, endSec: nextEnd });
      }
      if (lane === "text") return updateTextSticker(value, id, { startSec: nextStart, endSec: nextEnd });
      if (lane === "overlay") return updateOverlay(value, id, { startSec: nextStart, endSec: nextEnd });
      return updateComment(value, id, { startSec: nextStart, endSec: nextEnd });
    });
  }

  function nudgeBlock(lane: NonNullable<DragState>["lane"], id: string, startSec: number, endSec: number, edge: "move" | "start" | "end", deltaSec: number) {
    if (edge === "move") updateBlock(lane, id, Math.max(0, startSec + deltaSec), Math.max(endSec - startSec, 0.2) + Math.max(0, startSec + deltaSec));
    else if (edge === "start") updateBlock(lane, id, Math.max(0, Math.min(endSec - 0.2, startSec + deltaSec)), endSec);
    else updateBlock(lane, id, startSec, Math.max(startSec + 0.2, endSec + deltaSec));
  }

  // M7(교차 리뷰 MAJOR): 눈금·재생위치 선은 트랙 전체(레인 라벨 62px 포함)를 기준으로
  // 그려졌는데, 블록은 레인 라벨 오른쪽의 내용 칸을 기준으로 그려졌다 — 두 좌표계가
  // 62px + 레인 간격만큼 어긋나 블록이 항상 눈금보다 오른쪽에 떠 있었다. 레인 라벨 폭을
  // 상수로 두고 간격 없이 붙여, 눈금 오버레이도 같은 상수만큼 오프셋해 같은 원점을 쓴다.
  const LANE_LABEL_WIDTH = 62;
  return (
    <div
      data-video-timeline
      data-syncing={syncing || undefined}
      className={`min-w-0 space-y-micro rounded-surface border border-border bg-surface-2 p-stack-tight ${syncing ? "pointer-events-none opacity-60" : ""}`}
    >
      <div className="overflow-x-auto" data-video-timeline-scroll>
        <div ref={trackRef} className="relative" style={{ width: `${LANE_LABEL_WIDTH + Math.max(trackWidth, 240)}px` }} data-video-timeline-track>
          <div className="pointer-events-none absolute inset-0" aria-hidden="true">
            {ticks.map((t) => (
              <div key={t} className="absolute top-0 bottom-0 border-l border-border/60" style={{ left: `${LANE_LABEL_WIDTH + t * PX_PER_SEC}px` }}>
                <span className="absolute -top-4 left-0.5 text-caption text-subtle">{formatClock(t)}</span>
              </div>
            ))}
            <div className="absolute top-0 bottom-0 w-px bg-accent" style={{ left: `${LANE_LABEL_WIDTH + playhead * PX_PER_SEC}px` }} data-video-timeline-playhead />
          </div>
          <TimelineLane label="영상" labelWidth={LANE_LABEL_WIDTH}>
            {showOriginal ? <TimelineStaticBlock label="원본 영상" startSec={0} endSec={total} kind="video" /> : <>
              {edit.introOutro?.introCompId ? <TimelineStaticBlock label="인트로" startSec={0} endSec={Math.min(total, edit.introOutro.introDurationSec ?? 1.5)} kind="intro" /> : null}
              <TimelineStaticBlock label="본문 영상" startSec={edit.introOutro?.introDurationSec ?? 0} endSec={Math.max(edit.introOutro?.introDurationSec ?? 0.1, total - (edit.introOutro?.outroCompId ? 1.5 : 0))} kind="video" />
              {edit.introOutro?.outroCompId ? <TimelineStaticBlock label="아웃트로" startSec={Math.max(0, total - 1.5)} endSec={total} kind="outro" /> : null}
            </>}
          </TimelineLane>
          <TimelineLane label="자막" labelWidth={LANE_LABEL_WIDTH}>
            {!showOriginal ? displaySubtitles.map((s) => (
              <TimelineEditableBlock key={s.id} lane="subtitle" id={s.id} label={s.text || "(빈 자막)"} startSec={s.startSec} endSec={s.endSec} tone={s.cut ? "cut" : "subtitle"} onSeek={onSeek} onStartDrag={startDrag} onNudge={nudgeBlock} />
            )) : null}
          </TimelineLane>
          <TimelineLane label="글·스티커" labelWidth={LANE_LABEL_WIDTH}>
            {!showOriginal ? (edit.textStickers ?? []).map((item) => <TimelineEditableBlock key={item.id} lane="text" id={item.id} label={item.text} startSec={item.startSec} endSec={item.endSec} tone="text" onSeek={onSeek} onStartDrag={startDrag} onNudge={nudgeBlock} />) : null}
          </TimelineLane>
          <TimelineLane label="훅·댓글" labelWidth={LANE_LABEL_WIDTH}>
            {!showOriginal ? <>{edit.overlays.map((item) => <TimelineEditableBlock key={item.id} lane="overlay" id={item.id} label={item.text} startSec={item.startSec} endSec={item.endSec} tone={item.kind === "hook" ? "hook" : "cta"} onSeek={onSeek} onStartDrag={startDrag} onNudge={nudgeBlock} />)}{edit.comments.map((item) => <TimelineEditableBlock key={item.id} lane="comment" id={item.id} label={`${item.author}: ${item.text}`} startSec={item.startSec} endSec={item.endSec} tone="comment" onSeek={onSeek} onStartDrag={startDrag} onNudge={nudgeBlock} />)}</> : null}
          </TimelineLane>
          <TimelineLane label="배경 음악" labelWidth={LANE_LABEL_WIDTH}>
            {!showOriginal && edit.music ? <TimelineStaticBlock label={`${edit.music.label} · ${edit.music.volume}%`} startSec={0} endSec={total} kind="music" /> : null}
          </TimelineLane>
        </div>
      </div>
    </div>
  );
}

function TimelineStaticBlock({ label, startSec, endSec, kind }: { label: string; startSec: number; endSec: number; kind: "video" | "intro" | "outro" | "music" }) {
  return <div data-video-timeline-block={kind} className="absolute top-0 flex min-h-control-touch items-center overflow-hidden rounded-control border border-border bg-surface px-stack-tight text-caption text-text" style={{ left: `${startSec * PX_PER_SEC}px`, width: `${Math.max(4, (endSec - startSec) * PX_PER_SEC)}px` }}><span className="truncate">{label}</span></div>;
}

function TimelineEditableBlock({ lane, id, label, startSec, endSec, tone, onSeek, onStartDrag, onNudge }: {
  lane: NonNullable<DragState>["lane"];
  id: string;
  label: string;
  startSec: number;
  endSec: number;
  tone: "cut" | "subtitle" | "text" | "hook" | "cta" | "comment";
  onSeek: (sec: number) => void;
  onStartDrag: (lane: NonNullable<DragState>["lane"], id: string, edge: "move" | "start" | "end", startSec: number, endSec: number, clientX: number) => void;
  onNudge: (lane: NonNullable<DragState>["lane"], id: string, startSec: number, endSec: number, edge: "move" | "start" | "end", deltaSec: number) => void;
}) {
  const tones = {
    cut: "bg-danger/45 text-subtle line-through",
    subtitle: "bg-surface text-text",
    text: "bg-warning-soft text-warning",
    hook: "bg-accent-soft text-accent",
    cta: "bg-success-soft text-success",
    comment: "bg-surface text-text",
  } as const;

  function handleKey(event: React.KeyboardEvent, edge: "move" | "start" | "end") {
    if (event.key !== "ArrowLeft" && event.key !== "ArrowRight") return;
    event.preventDefault();
    onNudge(lane, id, startSec, endSec, event.shiftKey ? "end" : edge, event.key === "ArrowLeft" ? -0.1 : 0.1);
  }

  return (
    <div
      role="button"
      tabIndex={0}
      aria-label={`${label}, ${formatSec(startSec)}초부터 ${formatSec(endSec)}초`}
      data-video-timeline-block={lane}
      data-video-timeline-block-id={id}
      className={`absolute top-0 flex min-h-control-touch items-center overflow-visible rounded-control border border-border text-caption font-semibold active:opacity-90 max-[64rem]:!w-[calc(var(--control-touch)*2)] ${tones[tone]}`}
      style={{ left: `${startSec * PX_PER_SEC}px`, width: `${Math.max(44, (endSec - startSec) * PX_PER_SEC)}px` }}
      onClick={() => onSeek(startSec)}
      onKeyDown={(event) => handleKey(event, "move")}
      onPointerDown={(event) => onStartDrag(lane, id, "move", startSec, endSec, event.clientX)}
    >
      <Button size="sm" className="h-full w-control-touch shrink-0 cursor-ew-resize rounded-none border-0 border-r border-border bg-transparent p-none text-current" aria-label={`${label} 시작점 조절`} onKeyDown={(event) => handleKey(event, "start")} onPointerDown={(event) => { event.stopPropagation(); onStartDrag(lane, id, "start", startSec, endSec, event.clientX); }}><span aria-hidden="true" className="before:content-['‹']" /></Button>
      <span className="min-w-0 flex-1 truncate px-micro">{label}</span>
      <Button size="sm" className="h-full w-control-touch shrink-0 cursor-ew-resize rounded-none border-0 border-l border-border bg-transparent p-none text-current" aria-label={`${label} 끝점 조절`} onKeyDown={(event) => handleKey(event, "end")} onPointerDown={(event) => { event.stopPropagation(); onStartDrag(lane, id, "end", startSec, endSec, event.clientX); }}><span aria-hidden="true" className="before:content-['›']" /></Button>
    </div>
  );
}

function TimelineLane({ label, labelWidth, children }: { label: string; labelWidth: number; children: React.ReactNode }) {
  // 간격을 두지 않는다 — 이 라벨 폭이 곧 위 눈금 오버레이의 오프셋 상수와 같아야
  // 블록이 눈금과 같은 원점에서 시작한다(M7).
  return (
    <div className="relative flex min-h-control-touch items-center border-t border-border/40 pt-none first:border-t-0 sm:pt-micro" data-video-timeline-lane={label}>
      <span className="sticky left-0 z-[1] shrink-0 bg-surface-2 text-caption uppercase text-subtle" style={{ width: `${labelWidth}px` }} data-video-timeline-lane-label>{label}</span>
      <div className="relative min-h-control-touch min-w-0 flex-1">{children}</div>
    </div>
  );
}
