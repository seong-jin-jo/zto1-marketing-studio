/**
 * 영상에 자막을 **박는다**. 얹는 것이 아니라 나가는 파일 안에 굽는다.
 *
 * 2026-09-14 실측(컨트롤러가 발행 대기 중인 영상을 내려받아 프레임을 떠서 직접 확인):
 * 편집실에는 "자막 크기" 를 고르는 자리가 있는데 만들어져 나가는 mp4 에는 글자가 **한
 * 자도 없었다**. 768x768 · 5.875초 · 무음 클립이 그대로 발행 대기에 올라가 있었다.
 * 소리 없는 숏폼에서 자막은 내용 전달의 전부다. 자막 없는 무음 클립은 콘텐츠가 아니다.
 *
 * 이것은 카드뉴스가 겪고 이미 푼 것과 **같은 성질의 문제**다. 카드도 편집실에서 고친
 * 글자가 미리보기에만 있고 나가는 그림에는 없었다. `card-deck.ts` 가 "보이는 것과 나가는
 * 것이 한 코드에서 나온다" 로 그것을 닫았다. 영상도 같은 자리에서 닫는다. 다만 카드는
 * 브라우저 캔버스가 그리고, 영상은 서버 ffmpeg 이 굽는다. 그래서 **굽는 명령을 만드는
 * 순수 함수(이 파일)** 와 **그것을 실행하는 서버(api/video/subtitle)** 를 나눈다.
 * 나눠야 어느 쪽이 깨졌는지 구분되고, 명령을 실제 인코딩 없이 시험할 수 있다.
 */
import { SUBTITLE_SIZES } from "./content-edit-format";

export type SubtitleSize = typeof SUBTITLE_SIZES[number];

/**
 * 자막 글자 크기를 영상 **가로 폭에 대한 비율**로 둔다. 절대 픽셀로 박으면 768 짜리
 * 클립과 1080 짜리 클립에서 글자가 전혀 다른 크기로 보인다. 실제로 지금 나오는 클립은
 * 768x768 이고 편집실 미리보기는 1080 기준이다.
 *
 * 값은 숏폼 관행을 따른다. 세로 영상 자막은 폭의 4~6% 사이가 읽히는 구간이고, 그보다
 * 작으면 휴대폰에서 안 읽히고 크면 두 줄이 화면을 덮는다.
 */
export const SUBTITLE_FONT_SCALE: Record<SubtitleSize, number> = {
  작게: 0.040,
  보통: 0.050,
  크게: 0.062,
};

export function isSubtitleSize(value: unknown): value is SubtitleSize {
  return typeof value === "string" && (SUBTITLE_SIZES as readonly string[]).includes(value);
}

/** 편집실이 고른 크기를 이 영상에서 쓸 실제 글자 크기(px)로 옮긴다. */
export function subtitleFontSize(size: SubtitleSize, videoWidth: number): number {
  const width = Number.isFinite(videoWidth) && videoWidth > 0 ? videoWidth : 1080;
  return Math.max(16, Math.round(width * SUBTITLE_FONT_SCALE[size]));
}

/**
 * drawtext 가 먹는 꼴로 글자를 탈출시킨다.
 *
 * 이 탈출을 빼먹으면 **글자 하나 때문에 인코딩 전체가 죽는다.** 콜론은 필터 인자
 * 구분자고, 작은따옴표는 인자 묶음의 끝이고, 백슬래시는 탈출의 시작이고, 퍼센트는
 * drawtext 의 시각 확장 표기다. 한국어 문장에는 콜론과 퍼센트가 자주 들어온다.
 * 순서가 중요하다. 백슬래시를 **가장 먼저** 바꾸지 않으면 뒤에서 넣은 백슬래시를 다시
 * 탈출하게 된다.
 *
 * 퍼센트는 **탈출하지 않는다.** 대신 `expansion=none` 으로 drawtext 의 글자 확장을 끈다
 * (`buildSubtitleFilter` 참조). 2026-09-14 운영 환경(alpine ffmpeg)에서 실제로 돌려 보니
 * `\%` 도 `%%` 도 `Stray % near ...` 경고와 함께 **그 줄 전체를 화면에서 지웠다.** 그런데
 * 인코딩은 exit 0 으로 성공해서, 프레임을 떠서 눈으로 보기 전까지 멀쩡해 보였다.
 * 확장을 끄면 퍼센트가 특별한 글자가 아니게 되어 탈출 자체가 필요 없다.
 */
export function escapeDrawText(text: string): string {
  return String(text ?? "")
    .replace(/\\/g, "\\\\")
    .replace(/'/g, "’")
    .replace(/:/g, "\\:")
    .replace(/\r/g, "")
    .replace(/\n/g, " ")
    .trim();
}

/**
 * 한 줄이 화면 폭을 넘으면 접는다.
 *
 * 브라우저 캔버스처럼 실제 글자 폭을 잴 수 없으므로 글자 수로 어림한다. 한글은 거의
 * 정사각이라 한 글자가 글자 크기만큼의 폭을 먹고, 라틴 문자와 숫자는 대략 그 절반이다.
 * 어림을 쓰는 이유를 적어 둔다. 서버에는 폰트 메트릭이 없고, 그것을 들여오면 이 순수
 * 함수가 폰트 파일에 묶여 시험할 수 없게 된다. 넘칠 바에는 한 줄 일찍 접는 쪽이 낫다.
 */
export function wrapSubtitleLine(text: string, fontSize: number, maxWidth: number): string[] {
  const clean = String(text ?? "").trim();
  if (!clean) return [];
  const widthOf = (value: string) =>
    [...value].reduce((sum, char) => sum + (/[\x20-\x7E]/.test(char) ? fontSize * 0.52 : fontSize), 0);
  if (widthOf(clean) <= maxWidth) return [clean];

  const out: string[] = [];
  let current = "";
  for (const word of clean.split(" ")) {
    const candidate = current ? `${current} ${word}` : word;
    if (widthOf(candidate) <= maxWidth) { current = candidate; continue; }
    if (current) { out.push(current); current = ""; }
    // 한국어는 띄어쓰기가 드물어 낱말 하나가 한 줄을 통째로 넘기도 한다. 그때는 글자로 자른다.
    let piece = "";
    for (const char of word) {
      if (widthOf(piece + char) > maxWidth && piece) { out.push(piece); piece = ""; }
      piece += char;
    }
    current = piece;
  }
  if (current) out.push(current);
  return out;
}

/**
 * 글꼴 경로도 필터 인자다. 글자와 같은 규칙으로 탈출한다.
 *
 * 지금 이 값은 환경 변수나 서버 후보 목록에서만 오지만, 그 환경 변수가 오염되면 경로 안의
 * 콜론 하나로 필터 구조가 바뀐다. **"지금은 신뢰할 수 있는 출처" 는 잠금장치가 아니다.**
 * 교차 리뷰(Codex, 2026-09-14)에서 지적된 자리다.
 */
export function escapeFilterPath(value: string): string {
  return String(value ?? "")
    .replace(/\\/g, "\\\\")
    .replace(/'/g, "")
    .replace(/:/g, "\\:");
}

/**
 * 자막으로 받을 수 있는 양의 상한.
 *
 * 상한이 없으면 줄 수와 줄 길이가 그대로 필터 문자열 크기와 ffmpeg 실행 시간이 된다.
 * 한 요청으로 서버를 오래 붙잡아 둘 수 있다(교차 리뷰 지적). 숏폼 한 편의 장면 대사는
 * 실제로 서너 줄이고 한 줄은 한 화면에 들어갈 길이다. 그 현실보다 넉넉하되 유한하게 둔다.
 */
export const SUBTITLE_MAX_LINES = 12;
export const SUBTITLE_MAX_CHARS_PER_LINE = 120;

export type SubtitleLimitCheck =
  | { ok: true; lines: string[] }
  | { ok: false; reason: "too_many_lines" | "line_too_long" };

/** 상한을 넘으면 자르지 않고 거절한다. 조용히 자르면 사용자가 쓴 말이 소리 없이 사라진다. */
export function checkSubtitleLimits(lines: string[]): SubtitleLimitCheck {
  const kept = (lines ?? []).map((line) => String(line ?? "")).filter((line) => line.trim().length > 0);
  if (kept.length > SUBTITLE_MAX_LINES) return { ok: false, reason: "too_many_lines" };
  if (kept.some((line) => [...line].length > SUBTITLE_MAX_CHARS_PER_LINE)) return { ok: false, reason: "line_too_long" };
  return { ok: true, lines: kept };
}

export type SubtitleCue = {
  /** 화면에 실제로 그려질 줄들(이미 접힌 상태). */
  lines: string[];
  startSec: number;
  endSec: number;
};

/**
 * 대사 여러 줄을 영상 길이에 고르게 나눠 배치한다.
 *
 * 지금 클립은 6초 안팎이고 대사는 후킹·본문·마무리 세 줄이다. 세 줄을 한꺼번에 띄우면
 * 화면의 절반이 글자로 덮이고, 아예 안 띄우면 지금 상태(글자 0)다. 순서대로 나눠 띄운다.
 * 마지막 조각은 영상 끝까지 붙인다. 반올림 때문에 끝에 자막 없는 빈 구간이 남으면
 * 보는 사람은 그것을 잘림으로 읽는다.
 */
export function subtitleCues(input: {
  lines: string[];
  durationSec: number;
  fontSize: number;
  maxWidth: number;
}): SubtitleCue[] {
  const kept = (input.lines ?? [])
    .map((line) => String(line ?? "").trim())
    .filter((line) => line.length > 0);
  if (!kept.length) return [];
  const duration = Number.isFinite(input.durationSec) && input.durationSec > 0 ? input.durationSec : 6;
  const slot = duration / kept.length;
  return kept.map((line, index) => ({
    lines: wrapSubtitleLine(line, input.fontSize, input.maxWidth),
    startSec: Number((index * slot).toFixed(3)),
    // 마지막 조각만 영상 끝까지. 중간 조각을 끝까지 늘리면 서로 겹쳐 그려진다.
    endSec: index === kept.length - 1 ? Number((duration + 0.5).toFixed(3)) : Number(((index + 1) * slot).toFixed(3)),
  })).filter((cue) => cue.lines.length > 0);
}

export type SubtitleFilterInput = {
  lines: string[];
  size: SubtitleSize;
  width: number;
  height: number;
  durationSec: number;
  /** 한글이 그려지는 폰트 파일. 없으면 ffmpeg 기본 폰트가 한글을 네모로 그린다. */
  fontFile?: string | null;
};

/**
 * ffmpeg `-vf` 에 넘길 필터 문자열을 만든다.
 *
 * 자막은 **아래에서 올라온 자리**에 둔다. 숏폼 플랫폼은 화면 아래쪽을 자기 조작 단추로
 * 덮는다(DESIGN.md §안전 영역: Shorts 약 320px · 릴스 약 500px · TikTok 400px, 1920 기준).
 * 그래서 바닥에 붙이면 우리가 박은 자막이 플랫폼 UI 밑으로 들어가 안 보인다. 폭 대비
 * 비율로 띄워 어느 크기의 클립에서도 같은 자리에 오게 한다.
 *
 * 글자에는 검은 테두리와 반투명 띠를 함께 준다. 배경 그림이 밝은지 어두운지 우리는
 * 모른다. 둘 중 하나만으로는 어떤 장면에서 반드시 안 읽힌다.
 */
export function buildSubtitleFilter(input: SubtitleFilterInput): string {
  const fontSize = subtitleFontSize(input.size, input.width);
  const maxWidth = Math.max(fontSize * 4, Math.round(input.width * 0.86));
  const cues = subtitleCues({
    lines: input.lines,
    durationSec: input.durationSec,
    fontSize,
    maxWidth,
  });
  if (!cues.length) return "";

  const lineHeight = Math.round(fontSize * 1.32);
  // 바닥에서 띄우는 높이. 세로 영상 하단 조작 영역을 피한다.
  const bottomInset = Math.round(input.height * 0.16);
  const border = Math.max(2, Math.round(fontSize * 0.09));
  const parts: string[] = [];

  for (const cue of cues) {
    const block = cue.lines.length;
    cue.lines.forEach((line, row) => {
      // 아래에서 위로 쌓는다. 마지막 줄이 bottomInset 자리에 오고 윗줄이 그 위로 간다.
      const fromBottom = bottomInset + (block - 1 - row) * lineHeight;
      const args = [
        `text='${escapeDrawText(line)}'`,
        // 글자 확장을 끈다. 두 가지를 동시에 막는다.
        //   ① 퍼센트 한 글자가 그 줄 전체를 지우는 것(2026-09-14 운영 환경 실측).
        //   ② 사용자가 쓴 `%{pts}` 같은 확장 표기가 실행되는 것. 자막은 사용자가 쓴 글이고
        //      우리는 그것을 **글자 그대로** 그려야지 식으로 해석하면 안 된다.
        "expansion=none",
        `fontsize=${fontSize}`,
        "fontcolor=white",
        `borderw=${border}`,
        "bordercolor=black@0.9",
        "box=1",
        "boxcolor=black@0.45",
        `boxborderw=${Math.round(fontSize * 0.3)}`,
        "x=(w-text_w)/2",
        `y=h-${fromBottom}-text_h`,
        `enable='between(t,${cue.startSec},${cue.endSec})'`,
      ];
      if (input.fontFile) args.splice(1, 0, `fontfile='${escapeFilterPath(input.fontFile)}'`);
      parts.push(`drawtext=${args.join(":")}`);
    });
  }
  return parts.join(",");
}

/**
 * 자막을 구울 ffmpeg 인자 전체. 실행은 서버가 한다.
 *
 * 영상은 다시 인코딩하고 소리는 그대로 복사한다. 소리까지 다시 인코딩하면 이미 붙은
 * 내레이션이 손상되고, 소리가 없는 클립에서는 `-c:a copy` 가 조용히 넘어간다.
 */
export function subtitleFfmpegArgs(input: SubtitleFilterInput & {
  inputPath: string;
  outputPath: string;
}): string[] | null {
  const filter = buildSubtitleFilter(input);
  if (!filter) return null;
  return [
    "-y", "-i", input.inputPath,
    "-vf", filter,
    "-c:v", "libx264", "-pix_fmt", "yuv420p", "-preset", "veryfast", "-crf", "20",
    "-c:a", "copy",
    input.outputPath,
  ];
}

/**
 * 자막에 쓸 폰트를 고른다.
 *
 * 2026-09-14 확인: 운영 이미지는 `node:20-alpine` 이고 거기에는 ffmpeg 도 한글 폰트도
 * 없었다. 폰트가 없으면 ffmpeg 는 한글을 **네모로** 그린다. 자막이 없는 것보다 나쁘다.
 * 그래서 후보를 실재 여부로 골라 쓰고, 하나도 없으면 자막을 굽지 않고 그 사실을 말한다.
 * 조용히 네모를 내보내지 않는다.
 */
export const SUBTITLE_FONT_CANDIDATES: readonly string[] = [
  "/usr/share/fonts/noto/NotoSansCJK-Regular.ttc",
  "/usr/share/fonts/opentype/noto/NotoSansCJK-Regular.ttc",
  "/usr/share/fonts/truetype/noto/NotoSansCJK-Regular.ttc",
  "/System/Library/Fonts/Supplemental/AppleGothic.ttf",
  "/System/Library/Fonts/AppleSDGothicNeo.ttc",
] as const;

export function pickSubtitleFont(exists: (candidate: string) => boolean, override?: string | null): string | null {
  const configured = (override || "").trim();
  if (configured) return exists(configured) ? configured : null;
  return SUBTITLE_FONT_CANDIDATES.find((candidate) => exists(candidate)) ?? null;
}
