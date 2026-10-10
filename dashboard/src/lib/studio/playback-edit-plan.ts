/**
 * 편집실에서 고친 재생(컷, 자막 시간, 후킹, CTA, 댓글)을 ffmpeg 명령으로 옮긴다.
 *
 * 저장만 되고 파일에 안 들어가면 고친 것이 아니다. 이 함수는 인코딩을 하지 않는다.
 * 명령을 만들고, 실행은 /api/video/subtitle 이 한다.
 *
 * 인트로·아웃트로는 별도 합성 결과가 미리보기와 발행 후보가 되므로 여기서 다시 굽지
 * 않는다. 목소리 교체, 표지, 움직이는 제목도 이 명령에 넣지 않는다.
 */
import {
  escapeDrawText,
  escapeFilterPath,
  subtitleFontSize,
  wrapSubtitleLine,
  type SubtitleSize,
} from "./video-subtitle";
import {
  cutRanges,
  newId,
  validateVideoEdit,
  VideoEditValidationError,
  type VideoClip,
  type VideoEdit,
} from "./video-edit-contract";

export type PlaybackRange = { startSec: number; endSec: number };

const MIN_SPAN_SEC = 0.05;
const MAX_DRAW_LAYERS = 48;

export type PlaybackSegment = PlaybackRange & { clipId: string; outputStartSec: number; outputEndSec: number };

/** 구데이터는 원본 전체 한 클립으로 읽는다. 저장된 배열 순서가 출력 순서다. */
export function materializeVideoClips(edit: VideoEdit, durationSec: number): VideoClip[] {
  const duration = finiteDuration(durationSec);
  const clips = edit.clips?.length
    ? edit.clips
    : [{ id: "clip-source", order: 0, sourceStartSec: 0, sourceEndSec: duration }];
  return clips
    .map((clip, index) => ({
      ...clip,
      order: index,
      sourceStartSec: Math.max(0, Math.min(duration, clip.sourceStartSec)),
      sourceEndSec: Math.max(0, Math.min(duration, clip.sourceEndSec)),
    }))
    .filter((clip) => clip.sourceEndSec - clip.sourceStartSec >= MIN_SPAN_SEC);
}

function withClips(edit: VideoEdit, clips: VideoClip[]): VideoEdit {
  return { ...edit, clips: clips.map((clip, order) => ({ ...clip, order })), revision: edit.revision + 1 };
}

function clipAtOutputTime(clips: VideoClip[], outputSec: number): { clip: VideoClip; offset: number } | null {
  let cursor = 0;
  for (const clip of clips) {
    const span = clip.sourceEndSec - clip.sourceStartSec;
    if (outputSec >= cursor && outputSec <= cursor + span) return { clip, offset: outputSec - cursor };
    cursor += span;
  }
  return null;
}

export function splitVideoClip(edit: VideoEdit, durationSec: number, outputSec: number): VideoEdit {
  const clips = materializeVideoClips(edit, durationSec);
  const hit = clipAtOutputTime(clips, outputSec);
  if (!hit) throw new VideoEditValidationError("clip_split_outside", "재생 위치가 영상 클립 밖입니다.");
  const sourceSec = hit.clip.sourceStartSec + hit.offset;
  if (sourceSec - hit.clip.sourceStartSec < MIN_SPAN_SEC || hit.clip.sourceEndSec - sourceSec < MIN_SPAN_SEC) {
    throw new VideoEditValidationError("clip_split_edge", "클립 양끝에서는 자를 수 없습니다.");
  }
  const index = clips.findIndex((clip) => clip.id === hit.clip.id);
  const next = [
    ...clips.slice(0, index),
    { ...hit.clip, id: newId("clip"), sourceEndSec: sourceSec },
    { ...hit.clip, id: newId("clip"), sourceStartSec: sourceSec },
    ...clips.slice(index + 1),
  ];
  return withClips(edit, next);
}

export function deleteVideoClips(edit: VideoEdit, ids: string[], durationSec: number): VideoEdit {
  const selected = new Set(ids);
  const next = materializeVideoClips(edit, durationSec).filter((clip) => !selected.has(clip.id));
  if (!next.length) throw new VideoEditValidationError("clip_delete_all", "마지막 영상 클립은 삭제할 수 없습니다.");
  return withClips(edit, next);
}

export function trimVideoClip(edit: VideoEdit, id: string, edge: "start" | "end", sourceSec: number, durationSec: number): VideoEdit {
  const clips = materializeVideoClips(edit, durationSec).map((clip) => {
    if (clip.id !== id) return clip;
    const value = Math.max(0, Math.min(durationSec, sourceSec));
    if (edge === "start" && clip.sourceEndSec - value >= MIN_SPAN_SEC) return { ...clip, sourceStartSec: value };
    if (edge === "end" && value - clip.sourceStartSec >= MIN_SPAN_SEC) return { ...clip, sourceEndSec: value };
    throw new VideoEditValidationError("clip_trim_span", "트림 뒤 클립 길이는 0.05초 이상이어야 합니다.");
  });
  return withClips(edit, clips);
}

export function reorderVideoClips(edit: VideoEdit, draggedId: string, targetId: string, durationSec: number): VideoEdit {
  const clips = materializeVideoClips(edit, durationSec);
  const from = clips.findIndex((clip) => clip.id === draggedId);
  const to = clips.findIndex((clip) => clip.id === targetId);
  if (from < 0 || to < 0 || from === to) return edit;
  const [moved] = clips.splice(from, 1);
  clips.splice(to, 0, moved);
  return withClips(edit, clips);
}

export function readPlaybackEdit(value: unknown):
  | { ok: true; edit: VideoEdit | null }
  | { ok: false; rule: string } {
  if (value === undefined || value === null) return { ok: true, edit: null };
  try {
    validateVideoEdit(value);
    return { ok: true, edit: value };
  } catch (error) {
    const rule = error instanceof VideoEditValidationError ? error.rule : "invalid";
    return { ok: false, rule };
  }
}

/**
 * 발행 본문 줄과 자막 줄 수가 같으면 문구는 본문을 따른다.
 * 시간과 컷은 videoEdit 에 있다. 줄 수가 다르면 videoEdit 문구를 그대로 쓴다.
 * 억지로 맞추면 어느 줄을 잘랐는지 달라진다.
 */
export function alignPlaybackScript(edit: VideoEdit, lines: string[]): VideoEdit {
  const script = lines.map((line) => String(line ?? "").trim());
  if (!edit.subtitles.length || script.length !== edit.subtitles.length) return edit;
  return {
    ...edit,
    subtitles: edit.subtitles.map((line, index) => ({ ...line, text: script[index] || line.text })),
  };
}

export function playbackHasWork(edit: VideoEdit): boolean {
  return edit.subtitles.some((line) => line.cut || line.text.trim().length > 0)
    || edit.overlays.some((item) => item.text.trim().length > 0)
    || edit.comments.some((item) => item.author.trim().length > 0 && item.text.trim().length > 0)
    || (edit.textStickers ?? []).some((item) => item.text.trim().length > 0)
    || Boolean(edit.music)
    || Boolean(edit.voice);
}

/** 겹친 컷을 한 구간으로 합치고, 영상 길이 밖으로 나간 부분은 버린다. */
export function mergedCutRanges(durationSec: number, cuts: PlaybackRange[]): PlaybackRange[] {
  const duration = finiteDuration(durationSec);
  const clamped = cuts
    .map((cut) => ({
      startSec: Math.max(0, cut.startSec),
      endSec: Math.min(duration, cut.endSec),
    }))
    .filter((cut) => cut.endSec - cut.startSec >= MIN_SPAN_SEC)
    .sort((a, b) => a.startSec - b.startSec);
  const merged: PlaybackRange[] = [];
  for (const cut of clamped) {
    const last = merged[merged.length - 1];
    if (!last || cut.startSec > last.endSec) merged.push({ ...cut });
    else last.endSec = Math.max(last.endSec, cut.endSec);
  }
  return merged;
}

/** 컷을 빼고 남는 원본 구간. 남는 길이가 이 영상의 출력 길이다. */
export function keepRanges(durationSec: number, cuts: PlaybackRange[]): PlaybackRange[] {
  const duration = finiteDuration(durationSec);
  const merged = mergedCutRanges(duration, cuts);
  const kept: PlaybackRange[] = [];
  let cursor = 0;
  for (const cut of merged) {
    if (cut.startSec - cursor >= MIN_SPAN_SEC) kept.push({ startSec: cursor, endSec: cut.startSec });
    cursor = Math.max(cursor, cut.endSec);
  }
  if (duration - cursor >= MIN_SPAN_SEC) kept.push({ startSec: cursor, endSec: duration });
  return kept;
}

function finiteDuration(durationSec: number): number {
  return Number.isFinite(durationSec) && durationSec > 0 ? durationSec : 0;
}

function fmt(value: number): string {
  return String(Math.round(value * 1000) / 1000);
}

function piecesOutsideCuts(startSec: number, endSec: number, cuts: PlaybackRange[]): PlaybackRange[] {
  const pieces: PlaybackRange[] = [];
  let cursor = startSec;
  for (const cut of cuts) {
    if (cut.endSec <= cursor) continue;
    if (cut.startSec >= endSec) break;
    if (cut.startSec - cursor >= MIN_SPAN_SEC) {
      pieces.push({ startSec: cursor, endSec: Math.min(cut.startSec, endSec) });
    }
    cursor = Math.max(cursor, cut.endSec);
    if (cursor >= endSec) return pieces;
  }
  if (endSec - cursor >= MIN_SPAN_SEC) pieces.push({ startSec: cursor, endSec });
  return pieces;
}

/** 클립 순서와 자막 삭제 구간을 함께 적용한 최종 출력 조각이다. */
export function playbackSegments(edit: VideoEdit, durationSec: number): PlaybackSegment[] {
  const cuts = mergedCutRanges(durationSec, cutRanges(edit));
  let cursor = 0;
  const segments: PlaybackSegment[] = [];
  for (const clip of materializeVideoClips(edit, durationSec)) {
    for (const piece of piecesOutsideCuts(clip.sourceStartSec, clip.sourceEndSec, cuts)) {
      const span = piece.endSec - piece.startSec;
      segments.push({
        ...piece,
        clipId: clip.id,
        outputStartSec: cursor,
        outputEndSec: cursor + span,
      });
      cursor += span;
    }
  }
  return segments;
}

export function outputTimeToSourceTime(edit: VideoEdit, durationSec: number, outputSec: number): number {
  const segments = playbackSegments(edit, durationSec);
  const bounded = Math.max(0, outputSec);
  const segment = segments.find((item) => bounded < item.outputEndSec)
    ?? segments[segments.length - 1];
  if (!segment) return 0;
  return Math.min(segment.endSec, segment.startSec + Math.max(0, bounded - segment.outputStartSec));
}

export function sourceTimeToOutputTime(edit: VideoEdit, durationSec: number, sourceSec: number, preferredClipId?: string): number {
  const segments = playbackSegments(edit, durationSec);
  const segment = segments.find((item) => (!preferredClipId || item.clipId === preferredClipId)
    && sourceSec >= item.startSec && sourceSec <= item.endSec)
    ?? segments.find((item) => sourceSec >= item.startSec && sourceSec <= item.endSec);
  return segment ? segment.outputStartSec + sourceSec - segment.startSec : 0;
}

type DrawKind = "subtitle" | "text" | "sticker" | "hook" | "cta" | "comment";

type SourceWindow = {
  text: string;
  startSec: number;
  endSec: number;
  kind: DrawKind;
  animation?: NonNullable<VideoEdit["textStickers"]>[number]["animation"];
};

type OutputWindow = SourceWindow;

export function normalizeSubtitleWindows(
  subtitles: VideoEdit["subtitles"],
  durationSec: number,
): { windows: SourceWindow[]; warnings: string[] } {
  const duration = finiteDuration(durationSec);
  const ordered = subtitles
    .filter((line) => !line.cut && line.text.trim())
    .map((line) => ({ ...line, text: line.text.trim() }))
    .sort((a, b) => a.startSec - b.startSec || a.order - b.order);
  const windows: SourceWindow[] = [];
  const pendingTexts: string[] = [];
  let pendingStart = duration;
  let mergedForShortVideo = false;

  for (let index = 0; index < ordered.length; index += 1) {
    const line = ordered[index];
    const startSec = Math.max(0, Math.min(duration, line.startSec));
    const nextStart = ordered[index + 1]
      ? Math.max(0, Math.min(duration, ordered[index + 1].startSec))
      : duration;
    const endSec = Math.max(startSec, Math.min(duration, line.endSec, nextStart));
    if (endSec - startSec < MIN_SPAN_SEC) {
      mergedForShortVideo = true;
      pendingTexts.push(line.text);
      pendingStart = Math.min(pendingStart, startSec);
      continue;
    }
    windows.push({
      text: [...pendingTexts.splice(0), line.text].join(" · "),
      startSec: pendingStart < duration ? Math.min(pendingStart, startSec) : startSec,
      endSec,
      kind: "subtitle",
    });
    pendingStart = duration;
  }

  if (pendingTexts.length) {
    const last = windows[windows.length - 1];
    if (last) last.text = [last.text, ...pendingTexts].join(" · ");
    else if (duration > 0) {
      windows.push({
        text: pendingTexts.join(" · "),
        startSec: Math.min(pendingStart, duration),
        endSec: duration,
        kind: "subtitle",
      });
    }
  }

  return {
    windows,
    warnings: mergedForShortVideo
      ? ["subtitle_windows_merged_for_short_video"]
      : [],
  };
}

function sourceWindows(edit: VideoEdit, durationSec: number): { windows: SourceWindow[]; dropped: string[]; warnings: string[] } {
  const windows: SourceWindow[] = [];
  const dropped: string[] = [];
  for (const line of edit.subtitles) {
    const text = line.text.trim();
    if (!text) continue;
    if (line.cut) {
      dropped.push(text);
    }
  }
  const normalizedSubtitles = normalizeSubtitleWindows(edit.subtitles, durationSec);
  windows.push(...normalizedSubtitles.windows);
  for (const overlay of edit.overlays) {
    const text = overlay.text.trim();
    if (!text) continue;
    windows.push({ text, startSec: overlay.startSec, endSec: overlay.endSec, kind: overlay.kind });
  }
  for (const comment of edit.comments) {
    const author = comment.author.trim();
    const text = comment.text.trim();
    if (!author || !text) continue;
    windows.push({ text: `${author} ${text}`, startSec: comment.startSec, endSec: comment.endSec, kind: "comment" });
  }
  for (const item of edit.textStickers ?? []) {
    const text = item.text.trim();
    if (!text) continue;
    windows.push({ text, startSec: item.startSec, endSec: item.endSec, kind: item.kind, animation: item.animation });
  }
  return { windows, dropped, warnings: normalizedSubtitles.warnings };
}

function shiftWindow(window: SourceWindow, segments: PlaybackSegment[]): OutputWindow[] {
  return segments.flatMap((segment) => {
    const startSec = Math.max(window.startSec, segment.startSec);
    const endSec = Math.min(window.endSec, segment.endSec);
    if (endSec - startSec < MIN_SPAN_SEC) return [];
    return [{
      ...window,
      startSec: segment.outputStartSec + startSec - segment.startSec,
      endSec: segment.outputStartSec + endSec - segment.startSec,
    }];
  });
}

/** type 움직임은 렌더 시간 앞부분에 글자 묶음을 순차 노출한다. 레이어 폭증은 12단계로 제한한다. */
function expandTypeWindows(windows: OutputWindow[]): OutputWindow[] {
  return windows.flatMap((window) => {
    if (window.animation !== "type") return window;
    const chars = Array.from(window.text);
    if (chars.length < 2) return { ...window, animation: "none" as const };
    const steps = Math.min(chars.length, 12);
    const revealDuration = Math.min(0.8, Math.max(MIN_SPAN_SEC, (window.endSec - window.startSec) * 0.5));
    return Array.from({ length: steps }, (_, index) => {
      const startSec = window.startSec + revealDuration * index / steps;
      const endSec = index === steps - 1
        ? window.endSec
        : window.startSec + revealDuration * (index + 1) / steps;
      return {
        ...window,
        text: chars.slice(0, Math.ceil(chars.length * (index + 1) / steps)).join(""),
        startSec,
        endSec,
        animation: "none" as const,
      };
    });
  });
}

function coversFullDuration(kept: PlaybackRange[], durationSec: number): boolean {
  return kept.length === 1
    && kept[0].startSec <= 0.001
    && Math.abs(kept[0].endSec - durationSec) < MIN_SPAN_SEC;
}

function drawtext(input: {
  text: string;
  fontSize: number;
  y: string;
  startSec: number;
  endSec: number;
  fontFile?: string | null;
  fontColor?: string;
  x?: string;
  boxColor?: string;
  box?: boolean;
  outline?: boolean;
  animation?: SourceWindow["animation"];
}): string {
  const border = Math.max(2, Math.round(input.fontSize * 0.09));
  const animationSec = Math.min(0.3, Math.max(MIN_SPAN_SEC, input.endSec - input.startSec));
  const progress = `if(lt(t\\,${fmt(input.startSec + animationSec)})\\,(t-${fmt(input.startSec)})/${fmt(animationSec)}\\,1)`;
  const fontSize = input.animation === "scale"
    ? `'${input.fontSize}*(0.85+0.15*${progress})'`
    : String(input.fontSize);
  const y = input.animation === "rise"
    ? `${input.y}+${Math.max(8, Math.round(input.fontSize * 0.8))}*(1-${progress})`
    : input.y;
  const args = [
    `text='${escapeDrawText(input.text)}'`,
    "expansion=none",
    `fontsize=${fontSize}`,
    `fontcolor=${input.fontColor ?? "white"}`,
    `borderw=${input.outline === false ? 0 : border}`,
    "bordercolor=black@0.9",
    `box=${input.box === false ? 0 : 1}`,
    `boxcolor=${input.boxColor ?? "black@0.45"}`,
    `boxborderw=${Math.round(input.fontSize * 0.3)}`,
    `x=${input.x ?? "(w-text_w)/2"}`,
    `y=${y}`,
    `enable='between(t,${fmt(input.startSec)},${fmt(input.endSec)})'`,
  ];
  if (input.animation === "fade") args.push(`alpha='${progress}'`);
  if (input.fontFile) args.splice(1, 0, `fontfile='${escapeFilterPath(input.fontFile)}'`);
  return `drawtext=${args.join(":")}`;
}

function drawFilters(windows: OutputWindow[], input: {
  width: number;
  height: number;
  size: SubtitleSize;
  fontFile?: string | null;
  edit: VideoEdit;
}): string[] {
  const subtitleStyle = input.edit.subtitleStyle ?? { preset: "basic", position: "bottom", sizePercent: 100, outline: true };
  const fontSize = Math.max(14, Math.round(subtitleFontSize(input.size, input.width) * subtitleStyle.sizePercent / 100));
  const maxWidth = Math.max(fontSize * 4, Math.round(input.width * 0.86));
  const lineHeight = Math.round(fontSize * 1.32);
  const bottomInset = Math.round(input.height * 0.16);
  const filters: string[] = [];
  const ordered = [
    ...windows.filter((window) => window.kind === "comment"),
    ...windows.filter((window) => window.kind === "text" || window.kind === "sticker"),
    ...windows.filter((window) => window.kind === "hook" || window.kind === "cta"),
    ...windows.filter((window) => window.kind === "subtitle"),
  ];
  for (const window of ordered) {
    const lines = wrapSubtitleLine(window.text, fontSize, maxWidth);
    lines.forEach((line, row) => {
      const customY = subtitleStyle.yPercent !== undefined
        ? `h*${fmt(subtitleStyle.yPercent / 100)}-text_h/2`
        : null;
      const subtitleY = customY ?? (subtitleStyle.position === "top"
        ? String(Math.round(input.height * 0.14) + row * lineHeight)
        : subtitleStyle.position === "middle"
          ? `(h-text_h)/2+${row * lineHeight}`
          : `h-${bottomInset + (lines.length - 1 - row) * lineHeight}-text_h`);
      const y = window.kind === "subtitle"
        ? subtitleY
        : String(Math.round(input.height * (window.kind === "hook" ? 0.12 : window.kind === "cta" ? 0.22 : window.kind === "text" || window.kind === "sticker" ? 0.30 : 0.40)) + row * lineHeight);
      const preset = window.kind === "subtitle" ? subtitleStyle.preset : "basic";
      filters.push(drawtext({
        text: line,
        fontSize,
        y,
        startSec: window.startSec,
        endSec: window.endSec,
        fontFile: input.fontFile,
        fontColor: window.kind === "subtitle" && subtitleStyle.color
          ? `0x${subtitleStyle.color.slice(1)}`
          : preset === "yellow" || preset === "word" ? "yellow" : preset === "brand" ? "0x7C5CFC" : "white",
        x: window.kind === "subtitle" && subtitleStyle.xPercent !== undefined
          ? `w*${fmt(subtitleStyle.xPercent / 100)}-text_w/2`
          : undefined,
        box: preset === "box" || preset === "band" || window.kind !== "subtitle",
        boxColor: preset === "brand" ? "0x241B4B@0.88" : preset === "band" ? "black@0.82" : "black@0.45",
        outline: subtitleStyle.outline,
        animation: window.animation,
      }));
    });
  }
  return filters;
}

function videoGraph(kept: PlaybackRange[], draws: string[]): string {
  const trim = (range: PlaybackRange, index: number) =>
    `[0:v]trim=start=${fmt(range.startSec)}:end=${fmt(range.endSec)},setpts=PTS-STARTPTS[v${index}]`;
  if (kept.length === 1) {
    const chain = [`trim=start=${fmt(kept[0].startSec)}:end=${fmt(kept[0].endSec)}`, "setpts=PTS-STARTPTS", ...draws];
    return `[0:v]${chain.join(",")}[vout]`;
  }
  const parts = kept.map((range, index) => trim(range, index));
  const inputs = kept.map((_, index) => `[v${index}]`).join("");
  if (!draws.length) {
    parts.push(`${inputs}concat=n=${kept.length}:v=1:a=0[vout]`);
    return parts.join(";");
  }
  parts.push(`${inputs}concat=n=${kept.length}:v=1:a=0[vcat]`);
  parts.push(`[vcat]${draws.join(",")}[vout]`);
  return parts.join(";");
}

function audioGraph(kept: PlaybackRange[]): string {
  const trim = (range: PlaybackRange, index: number) =>
    `[0:a]atrim=start=${fmt(range.startSec)}:end=${fmt(range.endSec)},asetpts=PTS-STARTPTS[a${index}]`;
  if (kept.length === 1) {
    return `[0:a]atrim=start=${fmt(kept[0].startSec)}:end=${fmt(kept[0].endSec)},asetpts=PTS-STARTPTS[aout]`;
  }
  const parts = kept.map((range, index) => trim(range, index));
  const inputs = kept.map((_, index) => `[a${index}]`).join("");
  parts.push(`${inputs}concat=n=${kept.length}:v=0:a=1[aout]`);
  return parts.join(";");
}

export type PlaybackBurnPlan =
  | {
    ok: true;
    outputDurationSec: number;
    keptTexts: string[];
    droppedTexts: string[];
    videoFilter: string | null;
    filterComplex: string | null;
    includeAudio: boolean;
    voiceRequested: boolean;
    musicRequested: boolean;
    musicVolume: number;
    musicOffsetSec: number;
    musicFadeOut: boolean;
    musicDuckUnderVoice: boolean;
    outputHasAudio: boolean;
    warnings: string[];
  }
  | { ok: false; reason: "nothing_left" | "too_many_layers" };

export function planPlaybackBurn(input: {
  edit: VideoEdit;
  durationSec: number;
  width: number;
  height: number;
  size: SubtitleSize;
  fontFile?: string | null;
  hasAudio: boolean;
}): PlaybackBurnPlan {
  const durationSec = finiteDuration(input.durationSec);
  const segments = playbackSegments(input.edit, durationSec);
  const kept = segments.map(({ startSec, endSec }) => ({ startSec, endSec }));
  const outputDurationSec = Number(kept.reduce((sum, range) => sum + (range.endSec - range.startSec), 0).toFixed(3));
  if (outputDurationSec < 0.2) return { ok: false, reason: "nothing_left" };

  const source = sourceWindows(input.edit, durationSec);
  const droppedTexts = [...source.dropped];
  const shiftedWindows: OutputWindow[] = [];
  for (const window of source.windows) {
    const shifted = shiftWindow(window, segments);
    if (!shifted.length) {
      droppedTexts.push(window.text);
      continue;
    }
    shiftedWindows.push(...shifted);
  }
  const outputWindows = expandTypeWindows(shiftedWindows);
  const draws = drawFilters(outputWindows, { ...input, edit: input.edit });
  if (draws.length > MAX_DRAW_LAYERS) return { ok: false, reason: "too_many_layers" };

  const keptTexts = [...new Set(outputWindows.map((window) => window.text))];
  const full = coversFullDuration(kept, durationSec);
  if (full) {
    return {
      ok: true,
      outputDurationSec,
      keptTexts,
      droppedTexts,
      videoFilter: draws.join(",") || null,
      filterComplex: null,
      includeAudio: input.hasAudio,
      voiceRequested: Boolean(input.edit.voice),
      musicRequested: Boolean(input.edit.music),
      musicVolume: input.edit.music?.volume ?? 0,
      musicOffsetSec: input.edit.music?.offsetSec ?? 0,
      musicFadeOut: input.edit.music?.fadeOut ?? false,
      musicDuckUnderVoice: input.edit.music?.duckUnderVoice ?? false,
      outputHasAudio: input.hasAudio || Boolean(input.edit.voice) || Boolean(input.edit.music),
      warnings: source.warnings,
    };
  }
  const video = videoGraph(kept, draws);
  const filterComplex = input.hasAudio ? `${video};${audioGraph(kept)}` : video;
  return {
    ok: true,
    outputDurationSec,
    keptTexts,
    droppedTexts,
    videoFilter: null,
    filterComplex,
    includeAudio: input.hasAudio,
    voiceRequested: Boolean(input.edit.voice),
    musicRequested: Boolean(input.edit.music),
    musicVolume: input.edit.music?.volume ?? 0,
    musicOffsetSec: input.edit.music?.offsetSec ?? 0,
    musicFadeOut: input.edit.music?.fadeOut ?? false,
    musicDuckUnderVoice: input.edit.music?.duckUnderVoice ?? false,
    outputHasAudio: input.hasAudio || Boolean(input.edit.voice) || Boolean(input.edit.music),
    warnings: source.warnings,
  };
}

export function playbackFfmpegArgs(
  plan: PlaybackBurnPlan,
  paths: { inputPath: string; outputPath: string; musicPath?: string | null; voicePath?: string | null },
): string[] | null {
  if (!plan.ok) return null;
  if (plan.musicRequested && !paths.musicPath) return null;
  if (plan.voiceRequested && !paths.voicePath) return null;
  const videoCodec = ["-c:v", "libx264", "-pix_fmt", "yuv420p", "-preset", "veryfast", "-crf", "20"];
  const externalAudio = Boolean(paths.musicPath || paths.voicePath);
  if (externalAudio) {
    const args = ["-y", "-i", paths.inputPath];
    let nextInput = 1;
    const voiceIndex = paths.voicePath ? nextInput++ : null;
    const musicIndex = paths.musicPath ? nextInput++ : null;
    if (paths.voicePath) args.push("-i", paths.voicePath);
    if (paths.musicPath) args.push("-stream_loop", "-1", "-i", paths.musicPath);
    const filters: string[] = [];
    if (plan.filterComplex) filters.push(voiceIndex !== null ? plan.filterComplex.split(";[0:a]")[0] : plan.filterComplex);
    else if (plan.videoFilter) filters.push(`[0:v]${plan.videoFilter}[vout]`);
    else filters.push("[0:v]null[vout]");
    let primaryAudio: string | null = null;
    if (voiceIndex !== null) {
      filters.push(`[${voiceIndex}:a]atrim=duration=${fmt(plan.outputDurationSec)},asetpts=PTS-STARTPTS[voice]`);
      primaryAudio = "[voice]";
    } else if (plan.includeAudio) {
      // 컷이 있는 경우 plan.filterComplex에 [aout]이 이미 들어 있다.
      primaryAudio = plan.filterComplex ? "[aout]" : "[0:a]";
    }
    let musicAudio: string | null = null;
    if (musicIndex !== null) {
      const musicFilters = [
        `atrim=start=${fmt(plan.musicOffsetSec)}:duration=${fmt(plan.outputDurationSec)}`,
        "asetpts=PTS-STARTPTS",
        `volume=${fmt(plan.musicVolume / 100)}`,
      ];
      if (plan.musicFadeOut) musicFilters.push(`afade=t=out:st=${fmt(Math.max(0, plan.outputDurationSec - 1))}:d=1`);
      filters.push(`[${musicIndex}:a]${musicFilters.join(",")}[musicraw]`);
      musicAudio = "[musicraw]";
    }
    if (musicAudio && primaryAudio && plan.musicDuckUnderVoice) {
      filters.push(`${primaryAudio}asplit=2[primarymix][duckkey]`);
      filters.push(`${musicAudio}[duckkey]sidechaincompress=threshold=0.04:ratio=8:attack=20:release=250[musicducked]`);
      primaryAudio = "[primarymix]";
      musicAudio = "[musicducked]";
    }
    const audioInputs = [primaryAudio, musicAudio].filter((value): value is string => Boolean(value));
    if (audioInputs.length > 1) filters.push(`${audioInputs.join("")}amix=inputs=${audioInputs.length}:duration=first:normalize=0[audioout]`);
    else if (audioInputs.length === 1) filters.push(`${audioInputs[0]}anull[audioout]`);
    args.push("-filter_complex", filters.join(";"), "-map", "[vout]");
    if (audioInputs.length) args.push("-map", "[audioout]", "-c:a", "aac", "-b:a", "128k");
    else args.push("-an");
    args.push(...videoCodec, "-t", fmt(plan.outputDurationSec), paths.outputPath);
    return args;
  }
  if (plan.filterComplex) {
    const args = ["-y", "-i", paths.inputPath, "-filter_complex", plan.filterComplex, "-map", "[vout]"];
    if (plan.includeAudio) args.push("-map", "[aout]", "-c:a", "aac", "-b:a", "128k");
    else args.push("-an");
    args.push(...videoCodec, paths.outputPath);
    return args;
  }
  if (!plan.videoFilter) return null;
  return [
    "-y", "-i", paths.inputPath,
    "-vf", plan.videoFilter,
    ...videoCodec,
    "-c:a", "copy",
    paths.outputPath,
  ];
}
