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
  validateVideoEdit,
  VideoEditValidationError,
  type VideoEdit,
} from "./video-edit-contract";

export type PlaybackRange = { startSec: number; endSec: number };

const MIN_SPAN_SEC = 0.05;
const MAX_DRAW_LAYERS = 48;

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
    || edit.comments.some((item) => item.author.trim().length > 0 && item.text.trim().length > 0);
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

function removedBefore(timeSec: number, cuts: PlaybackRange[]): number {
  let removed = 0;
  for (const cut of cuts) {
    if (cut.endSec <= timeSec) removed += cut.endSec - cut.startSec;
    else break;
  }
  return removed;
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

type DrawKind = "subtitle" | "hook" | "cta" | "comment";

type SourceWindow = { text: string; startSec: number; endSec: number; kind: DrawKind };

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
  return { windows, dropped, warnings: normalizedSubtitles.warnings };
}

function shiftWindow(window: SourceWindow, cuts: PlaybackRange[]): OutputWindow[] {
  return piecesOutsideCuts(window.startSec, window.endSec, cuts).map((piece) => ({
    ...window,
    startSec: piece.startSec - removedBefore(piece.startSec, cuts),
    endSec: piece.endSec - removedBefore(piece.endSec, cuts),
  }));
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
}): string {
  const border = Math.max(2, Math.round(input.fontSize * 0.09));
  const args = [
    `text='${escapeDrawText(input.text)}'`,
    "expansion=none",
    `fontsize=${input.fontSize}`,
    "fontcolor=white",
    `borderw=${border}`,
    "bordercolor=black@0.9",
    "box=1",
    "boxcolor=black@0.45",
    `boxborderw=${Math.round(input.fontSize * 0.3)}`,
    "x=(w-text_w)/2",
    `y=${input.y}`,
    `enable='between(t,${fmt(input.startSec)},${fmt(input.endSec)})'`,
  ];
  if (input.fontFile) args.splice(1, 0, `fontfile='${escapeFilterPath(input.fontFile)}'`);
  return `drawtext=${args.join(":")}`;
}

function drawFilters(windows: OutputWindow[], input: {
  width: number;
  height: number;
  size: SubtitleSize;
  fontFile?: string | null;
}): string[] {
  const fontSize = subtitleFontSize(input.size, input.width);
  const maxWidth = Math.max(fontSize * 4, Math.round(input.width * 0.86));
  const lineHeight = Math.round(fontSize * 1.32);
  const bottomInset = Math.round(input.height * 0.16);
  const filters: string[] = [];
  const ordered = [
    ...windows.filter((window) => window.kind === "comment"),
    ...windows.filter((window) => window.kind === "hook" || window.kind === "cta"),
    ...windows.filter((window) => window.kind === "subtitle"),
  ];
  for (const window of ordered) {
    const lines = wrapSubtitleLine(window.text, fontSize, maxWidth);
    lines.forEach((line, row) => {
      const y = window.kind === "subtitle"
        ? `h-${bottomInset + (lines.length - 1 - row) * lineHeight}-text_h`
        : String(Math.round(input.height * (window.kind === "hook" ? 0.12 : window.kind === "cta" ? 0.22 : 0.40)) + row * lineHeight);
      filters.push(drawtext({
        text: line,
        fontSize,
        y,
        startSec: window.startSec,
        endSec: window.endSec,
        fontFile: input.fontFile,
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
    voiceApplied: false;
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
  const cuts = mergedCutRanges(durationSec, cutRanges(input.edit));
  const kept = keepRanges(durationSec, cuts);
  const outputDurationSec = Number(kept.reduce((sum, range) => sum + (range.endSec - range.startSec), 0).toFixed(3));
  if (outputDurationSec < 0.2) return { ok: false, reason: "nothing_left" };

  const source = sourceWindows(input.edit, durationSec);
  const droppedTexts = [...source.dropped];
  const outputWindows: OutputWindow[] = [];
  for (const window of source.windows) {
    const shifted = shiftWindow(window, cuts);
    if (!shifted.length) {
      droppedTexts.push(window.text);
      continue;
    }
    outputWindows.push(...shifted);
  }
  const draws = drawFilters(outputWindows, input);
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
      includeAudio: false,
      voiceApplied: false,
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
    voiceApplied: false,
    warnings: source.warnings,
  };
}

export function playbackFfmpegArgs(
  plan: PlaybackBurnPlan,
  paths: { inputPath: string; outputPath: string },
): string[] | null {
  if (!plan.ok) return null;
  const videoCodec = ["-c:v", "libx264", "-pix_fmt", "yuv420p", "-preset", "veryfast", "-crf", "20"];
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
