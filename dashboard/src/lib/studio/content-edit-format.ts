export const VIDEO_ASPECT_RATIOS = ["9:16", "1:1", "16:9"] as const;
export const CARD_ASPECT_RATIOS = ["4:5", "1:1"] as const;
export const SUBTITLE_SIZES = ["작게", "보통", "크게"] as const;
export const PLAYBACK_SPEEDS = [0.75, 1, 1.25, 1.5] as const;
export const EDIT_VOICES = ["차분한 남성", "또렷한 여성", "내 목소리 복제"] as const;
export const EDIT_BACKGROUNDS = ["작업실 책상", "삭제 커밋 화면", "창밖 새벽"] as const;
export const EDIT_MUSIC_TRACKS = ["없음", "잔잔한 로파이", "밝은 어쿠스틱"] as const;
export const EDIT_MUSIC_VOLUMES = [0, 10, 20, 35] as const;

export type ContentEditFormat =
  | {
    kind: "text";
  }
  | {
    kind: "video";
    aspectRatio: typeof VIDEO_ASPECT_RATIOS[number];
    subtitleSize: typeof SUBTITLE_SIZES[number];
    playbackSpeed: typeof PLAYBACK_SPEEDS[number];
    voice: typeof EDIT_VOICES[number];
  }
  | {
    kind: "card";
    aspectRatio: typeof CARD_ASPECT_RATIOS[number];
    subtitleSize: typeof SUBTITLE_SIZES[number];
    background: typeof EDIT_BACKGROUNDS[number];
  }
  | {
    kind: "audio";
    voice: typeof EDIT_VOICES[number];
    musicTrack: typeof EDIT_MUSIC_TRACKS[number];
    musicVolume: typeof EDIT_MUSIC_VOLUMES[number];
  };

export type ContentEditFormatIssue = {
  field: string;
  message: string;
};

export type ContentEditFormatValidation =
  | { valid: true; value: ContentEditFormat; issues: [] }
  | { valid: false; value: null; issues: ContentEditFormatIssue[] };

function isRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

function oneOf<T extends readonly unknown[]>(
  input: Record<string, unknown>,
  field: string,
  allowed: T,
  issues: ContentEditFormatIssue[],
): T[number] | null {
  const value = input[field];
  if (!allowed.some((candidate) => candidate === value)) {
    issues.push({ field, message: `${field} 값은 ${allowed.join(", ")} 중 하나여야 합니다` });
    return null;
  }
  return value as T[number];
}

export function defaultContentEditFormat(kind: ContentEditFormat["kind"]): ContentEditFormat {
  if (kind === "text") return { kind };
  if (kind === "card") {
    return { kind, aspectRatio: "4:5", subtitleSize: "보통", background: "작업실 책상" };
  }
  if (kind === "audio") {
    return { kind, voice: "차분한 남성", musicTrack: "없음", musicVolume: 20 };
  }
  return { kind, aspectRatio: "9:16", subtitleSize: "보통", playbackSpeed: 1, voice: "차분한 남성" };
}

export function validateContentEditFormat(value: unknown): ContentEditFormatValidation {
  if (!isRecord(value)) {
    return { valid: false, value: null, issues: [{ field: "edit_format", message: "edit_format은 객체여야 합니다" }] };
  }
  const issues: ContentEditFormatIssue[] = [];
  if (value.kind === "text") {
    return { valid: true, value: { kind: "text" }, issues: [] };
  }
  if (value.kind === "video") {
    const aspectRatio = oneOf(value, "aspectRatio", VIDEO_ASPECT_RATIOS, issues);
    const subtitleSize = oneOf(value, "subtitleSize", SUBTITLE_SIZES, issues);
    const playbackSpeed = oneOf(value, "playbackSpeed", PLAYBACK_SPEEDS, issues);
    const voice = oneOf(value, "voice", EDIT_VOICES, issues);
    if (issues.length || aspectRatio === null || subtitleSize === null || playbackSpeed === null || voice === null) {
      return { valid: false, value: null, issues };
    }
    return { valid: true, value: { kind: "video", aspectRatio, subtitleSize, playbackSpeed, voice }, issues: [] };
  }
  if (value.kind === "card") {
    const aspectRatio = oneOf(value, "aspectRatio", CARD_ASPECT_RATIOS, issues);
    const subtitleSize = oneOf(value, "subtitleSize", SUBTITLE_SIZES, issues);
    const background = oneOf(value, "background", EDIT_BACKGROUNDS, issues);
    if (issues.length || aspectRatio === null || subtitleSize === null || background === null) {
      return { valid: false, value: null, issues };
    }
    return { valid: true, value: { kind: "card", aspectRatio, subtitleSize, background }, issues: [] };
  }
  if (value.kind === "audio") {
    const voice = oneOf(value, "voice", EDIT_VOICES, issues);
    const musicTrack = oneOf(value, "musicTrack", EDIT_MUSIC_TRACKS, issues);
    const musicVolume = oneOf(value, "musicVolume", EDIT_MUSIC_VOLUMES, issues);
    if (issues.length || voice === null || musicTrack === null || musicVolume === null) {
      return { valid: false, value: null, issues };
    }
    return { valid: true, value: { kind: "audio", voice, musicTrack, musicVolume }, issues: [] };
  }
  return {
    valid: false,
    value: null,
    issues: [{ field: "kind", message: "kind 값은 text, video, card, audio 중 하나여야 합니다" }],
  };
}
