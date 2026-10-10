/**
 * 영상 편집 계약 v1 (PR4 세션맥락 B).
 *
 * `card-deck-contract.ts` 와 같은 자리를 영상에 만든다. 저장 위치는 그 파일과 같은 원칙을
 * 따라 `drafts.payload.videoEdit`(신규 테이블 0건)이다. 회장이 직접 지목한 네 기능(후킹
 * CTA 오버레이 · 댓글 오버레이=사회적 증거 · 자막 기반 편집 · 음성 변경)을 각각 한 필드로
 * 둔다.
 *
 * 렌더 반영: 컷 구간, 자막 시간, 후킹·CTA 문구, 댓글 문구는 playback-edit-plan.ts 가
 * ffmpeg 명령으로 만들고, /api/video/subtitle 이 videoEdit 을 받으면 그 명령을 실행한다.
 * 적용을 마친 인트로·아웃트로 합성 결과는 별도 렌더 경로에서 미리보기와 발행 파일
 * 후보로 쓴다. 목소리는 선택만 저장하며, 표지와 움직이는 제목은 아직 파일에 굽지 않는다.
 */

export const VIDEO_EDIT_CONTRACT_VERSION = "1.0" as const;

export const VIDEO_TRANSITIONS = ["cut", "fade", "push"] as const;
export type VideoTransition = typeof VIDEO_TRANSITIONS[number];

export const VIDEO_SUBTITLE_STYLE_PRESETS = ["basic", "yellow", "box", "brand", "band", "word"] as const;
export type VideoSubtitleStylePreset = typeof VIDEO_SUBTITLE_STYLE_PRESETS[number];
export type VideoSubtitleStyle = {
  preset: VideoSubtitleStylePreset;
  position: "top" | "middle" | "bottom";
  sizePercent: number;
  outline: boolean;
  fontFamily?: "sans" | "serif" | "round";
  /** ffmpeg drawtext와 브라우저가 함께 쓰는 6자리 RGB 색상. */
  color?: `#${string}`;
  /** 영상 프레임 기준 자막 중심 좌표. 직접 드래그한 위치를 저장한다. */
  xPercent?: number;
  yPercent?: number;
};

/** 원본 영상의 한 구간. 배열 순서가 곧 출력 순서다. */
export type VideoClip = {
  id: string;
  order: number;
  sourceStartSec: number;
  sourceEndSec: number;
};

export type VideoTextSticker = {
  id: string;
  order: number;
  kind: "text" | "sticker";
  text: string;
  startSec: number;
  endSec: number;
  animation: "none" | "fade" | "rise" | "scale" | "type";
};

export type VideoMusic = {
  source: "builtin" | "upload";
  /** builtin은 제품 카탈로그 ID, upload는 현재 테넌트의 저장 파일명이다. */
  assetId: string;
  label: string;
  volume: number;
  offsetSec: number;
  fadeOut: boolean;
  duckUnderVoice: boolean;
  rightsConfirmed: boolean;
} | null;

export type VideoCover = {
  source: "recommended" | "frame" | "upload";
  recommendationIndex?: number;
  frameSec?: number;
  imageUrl?: string;
  imageFilename?: string;
  textPreset: "none" | "headline" | "question";
} | null;

/** 영상 위 훅/CTA 배너. 구간(초) 동안만 보인다. */
export type VideoOverlay = {
  id: string;
  order: number;
  kind: "hook" | "cta";
  text: string;
  startSec: number;
  endSec: number;
};

/**
 * 사회적 증거 댓글 오버레이. `source==="collected"` 는 실제 수집 댓글(연결 시 채널 ID를
 * 함께 저장), `source==="manual"` 은 직접 입력이다. 가짜 댓글을 기본값으로 채우지 않는다
 * (세션맥락 금지 규칙) — 빈 배열이 기본값이고, manual 항목은 발행 전 "예시" 경고 대상이다.
 */
export type VideoComment = {
  id: string;
  order: number;
  author: string;
  text: string;
  source: "collected" | "manual";
  startSec: number;
  endSec: number;
};

/** 자막 한 줄. cut 이면 playback-edit-plan 이 그 구간을 내보내는 파일에서 뺀다. */
export type SubtitleLine = {
  id: string;
  order: number;
  text: string;
  startSec: number;
  endSec: number;
  cut: boolean;
};

export type VoiceSelection = { voiceId: string; voiceName: string } | null;

/**
 * 인트로/아웃트로(Remotion) 합성 결과. 2026-10-02 신설 — 회장 반려(R-27-5 미연결)
 * 대응: 적용 결과를 이 계약에 저장해 다른 영상 편집과 똑같이 자동저장·새로고침 복원이
 * 되게 한다. `resultFilename` 이 발행이 원본 대신 올려야 하는 합성 파일명이다.
 *
 * `deliverUrl`(2026-10-02 독립 리뷰 M-3): `/api/higgsfield/asset/<file>`는
 * proxy.ts TENANT_AWARE_PATHS에 걸려 Bearer 토큰을 요구하는데 `<video src>`는
 * Authorization 헤더를 못 보낸다 — 그래서 미리보기가 401로 깨졌다. job GET이 이미
 * 서명해 돌려주는 `/api/media/<token>` 배달 URL(media-token.ts, Bearer 불필요,
 * 자체 HMAC 검증)을 그대로 저장해 미리보기가 그 URL을 쓰게 한다.
 *
 * `sourceFilename`(M-4): 이 합성이 만들어질 때의 원본 영상 파일명. 그 뒤 생성실에서
 * 영상을 다시 만들면(원본이 바뀌면) 이 합성은 더 이상 유효하지 않다 — 발행·미리보기
 * 양쪽에서 `isIntroOutroStale`로 걸러낸다.
 */
export type IntroOutroApplied = {
  introCompId: string | null;
  outroCompId: string | null;
  /** 인트로·아웃트로만 합친 기준 파일. 자막을 다시 구울 때 항상 이 파일에서 시작한다. */
  compositeFilename?: string;
  /** 글자 없는 합성 기준 파일의 배달 URL. 편집 미리보기는 구운 결과 대신 이 주소를 쓴다. */
  compositeDeliverUrl?: string;
  /** 인트로 길이. 원본 기준 자막·컷 시간을 합성본 시간축으로 옮길 때 쓴다. */
  introDurationSec?: number;
  outroDurationSec?: number;
  titleText?: string;
  /** 현재 발행할 최종 결과. 자막을 다시 구우면 이 값만 새 결과로 전진한다. */
  resultFilename: string;
  /** 현재 결과 파일에 이미 반영된 컷. 값은 본문 원본 시간축이며 재생 위치 역변환에 쓴다. */
  renderedCutRanges?: Array<{ startSec: number; endSec: number }>;
  deliverUrl: string;
  sourceFilename: string;
} | null;

/**
 * 적용된 인트로/아웃트로가 지금 원본과 더 이상 맞지 않는지(생성실에서 영상을 다시
 * 만든 뒤) 판정한다. currentSourceFilename을 모르면(아직 로딩 전 등) 섣불리 무효화하지
 * 않는다 — false 를 돌려준다.
 */
export function isIntroOutroStale(applied: IntroOutroApplied, currentSourceFilename: string | null | undefined): boolean {
  if (!applied || !currentSourceFilename) return false;
  return ![
    applied.sourceFilename,
    applied.compositeFilename,
    applied.resultFilename,
  ].filter(Boolean).includes(currentSourceFilename);
}

export type VideoEdit = {
  contract_version: typeof VIDEO_EDIT_CONTRACT_VERSION;
  overlays: VideoOverlay[];
  comments: VideoComment[];
  subtitles: SubtitleLine[];
  /** 구데이터에는 없다. 없으면 원본 전체를 한 클립으로 해석한다. */
  clips?: VideoClip[];
  voice: VoiceSelection;
  /** v71 S6: 영상 레인 사이의 전환. 인트로/아웃트로가 없으면 해당 값은 저장만 된다. */
  transitions: { introToMain: VideoTransition; mainToOutro: VideoTransition };
  /** v71 S6: 글·스티커 레인의 시간 블록. */
  textStickers: VideoTextSticker[];
  subtitleStyle: VideoSubtitleStyle;
  music: VideoMusic;
  /** 안전영역은 편집 가이드이며 결과 픽셀에는 들어가지 않는다. */
  safeArea: boolean;
  cover: VideoCover;
  /** 인트로/아웃트로를 다음 신규 영상의 기본값으로 복사할지 여부. */
  introOutroDefaults: { intro: boolean; outro: boolean };
  /** 인트로/아웃트로 적용 결과. 없으면(구데이터 포함) null과 동일하게 취급한다. */
  introOutro: IntroOutroApplied;
  /** 편집 연산마다 +1(card-deck-ops.ts withRevision 관습과 동일). */
  revision: number;
};

export class VideoEditValidationError extends Error {
  constructor(readonly rule: string, message: string) {
    super(message);
  }
}

function isFiniteNumber(value: unknown): value is number {
  return typeof value === "number" && Number.isFinite(value);
}

/** 오버레이/댓글/자막 공통: 시작 < 끝, 둘 다 0 이상. */
function assertValidRange(startSec: unknown, endSec: unknown, field: string): void {
  if (!isFiniteNumber(startSec) || !isFiniteNumber(endSec)) {
    throw new VideoEditValidationError("range_not_number", `${field} startSec/endSec must be finite numbers`);
  }
  if (startSec < 0) {
    throw new VideoEditValidationError("range_negative", `${field} startSec must be >= 0`);
  }
  if (endSec <= startSec) {
    throw new VideoEditValidationError("range_order", `${field} endSec must be greater than startSec`);
  }
}

export function emptyVideoEdit(): VideoEdit {
  return {
    contract_version: VIDEO_EDIT_CONTRACT_VERSION,
    overlays: [],
    comments: [],
    subtitles: [],
    voice: null,
    transitions: { introToMain: "cut", mainToOutro: "cut" },
    textStickers: [],
    subtitleStyle: { preset: "basic", position: "bottom", sizePercent: 100, outline: true },
    music: null,
    safeArea: false,
    cover: null,
    introOutroDefaults: { intro: false, outro: false },
    introOutro: null,
    revision: 0,
  };
}

const OVERLAY_ALLOWED_KEYS = new Set(["id", "order", "kind", "text", "startSec", "endSec"]);
const COMMENT_ALLOWED_KEYS = new Set(["id", "order", "author", "text", "source", "startSec", "endSec"]);
const SUBTITLE_ALLOWED_KEYS = new Set(["id", "order", "text", "startSec", "endSec", "cut"]);
const TEXT_STICKER_ALLOWED_KEYS = new Set(["id", "order", "kind", "text", "startSec", "endSec", "animation"]);
const CLIP_ALLOWED_KEYS = new Set(["id", "order", "sourceStartSec", "sourceEndSec"]);
const COVER_ALLOWED_KEYS = new Set(["source", "recommendationIndex", "frameSec", "imageUrl", "imageFilename", "textPreset"]);
export const MAX_VIDEO_CLIPS = 256;

function assertNoUnknownKeys(value: Record<string, unknown>, allowed: Set<string>, field: string): void {
  for (const key of Object.keys(value)) {
    if (!allowed.has(key)) {
      throw new VideoEditValidationError("unknown_key", `${field} has an unknown key: ${key}`);
    }
  }
}

function assertValidOrder(order: unknown, field: string): void {
  if (typeof order !== "number" || !Number.isInteger(order) || order < 0) {
    throw new VideoEditValidationError("order", `${field}.order must be a non-negative integer`);
  }
}

function assertValidVideoCover(value: unknown): asserts value is NonNullable<VideoCover> {
  if (!value || typeof value !== "object") throw new VideoEditValidationError("cover", "videoEdit.cover must be an object when set");
  const cover = value as Record<string, unknown>;
  assertNoUnknownKeys(cover, COVER_ALLOWED_KEYS, "cover");
  if (!['recommended', 'frame', 'upload'].includes(String(cover.source))) {
    throw new VideoEditValidationError("cover_source", "videoEdit.cover.source is invalid");
  }
  if (!['none', 'headline', 'question'].includes(String(cover.textPreset))) {
    throw new VideoEditValidationError("cover_text_preset", "videoEdit.cover.textPreset is invalid");
  }
  if (cover.source === "recommended") {
    if (!Number.isInteger(cover.recommendationIndex) || Number(cover.recommendationIndex) < 0 || Number(cover.recommendationIndex) > 2
      || !isFiniteNumber(cover.frameSec) || cover.frameSec < 0) {
      throw new VideoEditValidationError("cover_recommended", "recommended cover requires recommendationIndex 0..2 and a non-negative frameSec");
    }
  } else if (cover.source === "frame") {
    if (!isFiniteNumber(cover.frameSec) || cover.frameSec < 0) {
      throw new VideoEditValidationError("cover_frame", "frame cover requires a non-negative frameSec");
    }
  } else if (typeof cover.imageFilename !== "string" || !cover.imageFilename
    || typeof cover.imageUrl !== "string" || !cover.imageUrl) {
    throw new VideoEditValidationError("cover_upload", "upload cover requires imageFilename and imageUrl");
  }
}

/** `unknown` 저장값을 계약대로 검증한다. 하나라도 어긋나면 이유를 담아 던진다(조용한 실패 금지). */
export function validateVideoEdit(value: unknown): asserts value is VideoEdit {
  if (typeof value !== "object" || value === null) {
    throw new VideoEditValidationError("not_object", "videoEdit must be an object");
  }
  const v = value as Record<string, unknown>;
  if (v.contract_version !== VIDEO_EDIT_CONTRACT_VERSION) {
    throw new VideoEditValidationError("version_mismatch", `videoEdit.contract_version must be ${VIDEO_EDIT_CONTRACT_VERSION}`);
  }
  if (!Array.isArray(v.overlays)) throw new VideoEditValidationError("overlays_not_array", "videoEdit.overlays must be an array");
  v.overlays.forEach((overlay, index) => {
    assertNoUnknownKeys(overlay as Record<string, unknown>, OVERLAY_ALLOWED_KEYS, `overlays[${index}]`);
    const o = overlay as Partial<VideoOverlay>;
    if (typeof o.id !== "string" || !o.id) throw new VideoEditValidationError("overlay_id", `overlays[${index}].id must be a non-empty string`);
    assertValidOrder(o.order, `overlays[${index}]`);
    if (o.kind !== "hook" && o.kind !== "cta") throw new VideoEditValidationError("overlay_kind", `overlays[${index}].kind must be hook|cta`);
    if (typeof o.text !== "string" || !o.text.trim()) throw new VideoEditValidationError("overlay_text", `overlays[${index}].text must not be empty`);
    assertValidRange(o.startSec, o.endSec, `overlays[${index}]`);
  });
  if (!Array.isArray(v.comments)) throw new VideoEditValidationError("comments_not_array", "videoEdit.comments must be an array");
  v.comments.forEach((comment, index) => {
    assertNoUnknownKeys(comment as Record<string, unknown>, COMMENT_ALLOWED_KEYS, `comments[${index}]`);
    const c = comment as Partial<VideoComment>;
    if (typeof c.id !== "string" || !c.id) throw new VideoEditValidationError("comment_id", `comments[${index}].id must be a non-empty string`);
    assertValidOrder(c.order, `comments[${index}]`);
    if (typeof c.author !== "string" || !c.author.trim()) throw new VideoEditValidationError("comment_author", `comments[${index}].author must be a non-empty string`);
    if (typeof c.text !== "string" || !c.text.trim()) throw new VideoEditValidationError("comment_text", `comments[${index}].text must not be empty`);
    if (c.source !== "collected" && c.source !== "manual") throw new VideoEditValidationError("comment_source", `comments[${index}].source must be collected|manual`);
    assertValidRange(c.startSec, c.endSec, `comments[${index}]`);
  });
  if (!Array.isArray(v.subtitles)) throw new VideoEditValidationError("subtitles_not_array", "videoEdit.subtitles must be an array");
  v.subtitles.forEach((line, index) => {
    assertNoUnknownKeys(line as Record<string, unknown>, SUBTITLE_ALLOWED_KEYS, `subtitles[${index}]`);
    const s = line as Partial<SubtitleLine>;
    if (typeof s.id !== "string" || !s.id) throw new VideoEditValidationError("subtitle_id", `subtitles[${index}].id must be a non-empty string`);
    assertValidOrder(s.order, `subtitles[${index}]`);
    if (typeof s.text !== "string") throw new VideoEditValidationError("subtitle_text", `subtitles[${index}].text must be a string`);
    if (typeof s.cut !== "boolean") throw new VideoEditValidationError("subtitle_cut", `subtitles[${index}].cut must be a boolean`);
    assertValidRange(s.startSec, s.endSec, `subtitles[${index}]`);
  });
  if (v.voice !== null) {
    const voice = v.voice as Partial<NonNullable<VoiceSelection>>;
    if (typeof voice.voiceId !== "string" || !voice.voiceId) throw new VideoEditValidationError("voice_id", "videoEdit.voice.voiceId must be a non-empty string when set");
    if (typeof voice.voiceName !== "string" || !voice.voiceName) throw new VideoEditValidationError("voice_name", "videoEdit.voice.voiceName must be a non-empty string when set");
  }
  const transitions = (v.transitions ?? { introToMain: "cut", mainToOutro: "cut" }) as Record<string, unknown>;
  if (!VIDEO_TRANSITIONS.includes(transitions.introToMain as VideoTransition)
    || !VIDEO_TRANSITIONS.includes(transitions.mainToOutro as VideoTransition)) {
    throw new VideoEditValidationError("transition", "videoEdit.transitions must contain supported transition values");
  }
  const textStickers = v.textStickers ?? [];
  if (!Array.isArray(textStickers)) throw new VideoEditValidationError("text_stickers_not_array", "videoEdit.textStickers must be an array");
  textStickers.forEach((item, index) => {
    assertNoUnknownKeys(item as Record<string, unknown>, TEXT_STICKER_ALLOWED_KEYS, `textStickers[${index}]`);
    const block = item as Partial<VideoTextSticker>;
    if (typeof block.id !== "string" || !block.id) throw new VideoEditValidationError("text_sticker_id", `textStickers[${index}].id must be set`);
    assertValidOrder(block.order, `textStickers[${index}]`);
    if (block.kind !== "text" && block.kind !== "sticker") throw new VideoEditValidationError("text_sticker_kind", `textStickers[${index}].kind is invalid`);
    if (typeof block.text !== "string" || !block.text.trim()) throw new VideoEditValidationError("text_sticker_text", `textStickers[${index}].text must not be empty`);
    if (!["none", "fade", "rise", "scale", "type"].includes(String(block.animation))) throw new VideoEditValidationError("text_sticker_animation", `textStickers[${index}].animation is invalid`);
    assertValidRange(block.startSec, block.endSec, `textStickers[${index}]`);
  });
  const clips = v.clips ?? [];
  if (!Array.isArray(clips)) throw new VideoEditValidationError("clips_not_array", "videoEdit.clips must be an array");
  if (clips.length > MAX_VIDEO_CLIPS) throw new VideoEditValidationError("clips_too_many", `videoEdit.clips must contain at most ${MAX_VIDEO_CLIPS} clips`);
  const clipIds = new Set<string>();
  clips.forEach((item, index) => {
    assertNoUnknownKeys(item as Record<string, unknown>, CLIP_ALLOWED_KEYS, `clips[${index}]`);
    const clip = item as Partial<VideoClip>;
    if (typeof clip.id !== "string" || !clip.id) throw new VideoEditValidationError("clip_id", `clips[${index}].id must be set`);
    if (clipIds.has(clip.id)) throw new VideoEditValidationError("clip_id_duplicate", `clips[${index}].id must be unique`);
    clipIds.add(clip.id);
    assertValidOrder(clip.order, `clips[${index}]`);
    assertValidRange(clip.sourceStartSec, clip.sourceEndSec, `clips[${index}]`);
  });
  const subtitleStyle = (v.subtitleStyle ?? { preset: "basic", position: "bottom", sizePercent: 100, outline: true }) as Record<string, unknown>;
  if (!VIDEO_SUBTITLE_STYLE_PRESETS.includes(subtitleStyle.preset as VideoSubtitleStylePreset)
    || !["top", "middle", "bottom"].includes(String(subtitleStyle.position))
    || !isFiniteNumber(subtitleStyle.sizePercent) || subtitleStyle.sizePercent < 70 || subtitleStyle.sizePercent > 160
    || typeof subtitleStyle.outline !== "boolean"
    || (subtitleStyle.fontFamily !== undefined && !["sans", "serif", "round"].includes(String(subtitleStyle.fontFamily)))
    || (subtitleStyle.color !== undefined && (typeof subtitleStyle.color !== "string" || !/^#[0-9a-fA-F]{6}$/.test(subtitleStyle.color)))
    || (subtitleStyle.xPercent !== undefined && (!isFiniteNumber(subtitleStyle.xPercent) || subtitleStyle.xPercent < 5 || subtitleStyle.xPercent > 95))
    || (subtitleStyle.yPercent !== undefined && (!isFiniteNumber(subtitleStyle.yPercent) || subtitleStyle.yPercent < 5 || subtitleStyle.yPercent > 95))) {
    throw new VideoEditValidationError("subtitle_style", "videoEdit.subtitleStyle is invalid");
  }
  if (v.music !== undefined && v.music !== null) {
    const music = v.music as Record<string, unknown>;
    if ((music.source !== "builtin" && music.source !== "upload") || typeof music.assetId !== "string" || !music.assetId
      || typeof music.label !== "string" || !music.label || !isFiniteNumber(music.volume) || music.volume < 0 || music.volume > 100
      || !isFiniteNumber(music.offsetSec) || music.offsetSec < 0 || typeof music.fadeOut !== "boolean"
      || typeof music.duckUnderVoice !== "boolean" || typeof music.rightsConfirmed !== "boolean") {
      throw new VideoEditValidationError("music", "videoEdit.music is invalid");
    }
    if (music.source === "upload" && music.rightsConfirmed !== true) {
      throw new VideoEditValidationError("music_rights", "uploaded music requires rights confirmation");
    }
  }
  if (v.safeArea !== undefined && typeof v.safeArea !== "boolean") throw new VideoEditValidationError("safe_area", "videoEdit.safeArea must be boolean");
  if (v.cover !== undefined && v.cover !== null) assertValidVideoCover(v.cover);
  const defaults = (v.introOutroDefaults ?? { intro: false, outro: false }) as Record<string, unknown>;
  if (typeof defaults.intro !== "boolean" || typeof defaults.outro !== "boolean") {
    throw new VideoEditValidationError("intro_outro_defaults", "videoEdit.introOutroDefaults is invalid");
  }
  // introOutro는 신규 필드라 구데이터에는 없다(undefined) — 없으면 null과 동일하게 통과.
  if (v.introOutro !== undefined && v.introOutro !== null) {
    const io = v.introOutro as Record<string, unknown>;
    if (typeof io.resultFilename !== "string" || !io.resultFilename) {
      throw new VideoEditValidationError("intro_outro_result_filename", "videoEdit.introOutro.resultFilename must be a non-empty string when set");
    }
    if (typeof io.deliverUrl !== "string" || !io.deliverUrl) {
      throw new VideoEditValidationError("intro_outro_deliver_url", "videoEdit.introOutro.deliverUrl must be a non-empty string when set");
    }
    if (typeof io.sourceFilename !== "string" || !io.sourceFilename) {
      throw new VideoEditValidationError("intro_outro_source_filename", "videoEdit.introOutro.sourceFilename must be a non-empty string when set");
    }
    if (io.compositeFilename !== undefined && (typeof io.compositeFilename !== "string" || !io.compositeFilename)) {
      throw new VideoEditValidationError("intro_outro_composite_filename", "videoEdit.introOutro.compositeFilename must be a non-empty string when set");
    }
    if (io.compositeDeliverUrl !== undefined && (typeof io.compositeDeliverUrl !== "string" || !io.compositeDeliverUrl)) {
      throw new VideoEditValidationError("intro_outro_composite_deliver_url", "videoEdit.introOutro.compositeDeliverUrl must be a non-empty string when set");
    }
    if (io.introDurationSec !== undefined && (!isFiniteNumber(io.introDurationSec) || io.introDurationSec < 0)) {
      throw new VideoEditValidationError("intro_outro_intro_duration", "videoEdit.introOutro.introDurationSec must be a non-negative finite number when set");
    }
    if (io.outroDurationSec !== undefined && (!isFiniteNumber(io.outroDurationSec) || io.outroDurationSec < 0)) {
      throw new VideoEditValidationError("intro_outro_outro_duration", "videoEdit.introOutro.outroDurationSec must be a non-negative finite number when set");
    }
    if (io.titleText !== undefined && typeof io.titleText !== "string") {
      throw new VideoEditValidationError("intro_outro_title", "videoEdit.introOutro.titleText must be a string when set");
    }
    if (io.renderedCutRanges !== undefined) {
      if (!Array.isArray(io.renderedCutRanges)) {
        throw new VideoEditValidationError("intro_outro_rendered_cuts", "videoEdit.introOutro.renderedCutRanges must be an array when set");
      }
      io.renderedCutRanges.forEach((range, index) => {
        const value = range as Record<string, unknown>;
        assertNoUnknownKeys(value, new Set(["startSec", "endSec"]), `introOutro.renderedCutRanges[${index}]`);
        assertValidRange(value.startSec, value.endSec, `introOutro.renderedCutRanges[${index}]`);
      });
    }
    if (io.introCompId !== null && typeof io.introCompId !== "string") {
      throw new VideoEditValidationError("intro_outro_intro_id", "videoEdit.introOutro.introCompId must be a string or null");
    }
    if (io.outroCompId !== null && typeof io.outroCompId !== "string") {
      throw new VideoEditValidationError("intro_outro_outro_id", "videoEdit.introOutro.outroCompId must be a string or null");
    }
  }
  if (typeof v.revision !== "number" || !Number.isFinite(v.revision)) {
    throw new VideoEditValidationError("revision", "videoEdit.revision must be a finite number");
  }
}

export function newId(prefix: string): string {
  return `${prefix}-${Math.random().toString(36).slice(2, 10)}`;
}

function withRevision(edit: VideoEdit, patch: Partial<VideoEdit>): VideoEdit {
  return { ...edit, ...patch, revision: edit.revision + 1 };
}

/**
 * M2(2026-09-22 코드리뷰): addOverlay/updateOverlay/addComment가 assertValidRange 를 안
 * 거쳐 VideoEditor.tsx 의 try/catch 가 죽은 코드였다. 영상 끝에서 추가하면 startSec===endSec
 * 이 만들어져 800ms 뒤 자동저장이 400 으로 실패했다. 여기서 즉시 던진다.
 */
export function addOverlay(edit: VideoEdit, kind: VideoOverlay["kind"], text: string, startSec: number, endSec: number): VideoEdit {
  assertValidRange(startSec, endSec, "overlay");
  if (!text.trim()) throw new VideoEditValidationError("overlay_text", "overlay text must not be empty");
  const overlay: VideoOverlay = { id: newId("ov"), order: edit.overlays.length, kind, text, startSec, endSec };
  return withRevision(edit, { overlays: [...edit.overlays, overlay] });
}

export function updateOverlay(edit: VideoEdit, id: string, patch: Partial<Omit<VideoOverlay, "id" | "order">>): VideoEdit {
  const overlays = edit.overlays.map((o) => (o.id === id ? { ...o, ...patch } : o));
  const updated = overlays.find((o) => o.id === id);
  if (updated) assertValidRange(updated.startSec, updated.endSec, "overlay");
  return withRevision(edit, { overlays });
}

export function removeOverlay(edit: VideoEdit, id: string): VideoEdit {
  const overlays = edit.overlays.filter((o) => o.id !== id).map((o, order) => ({ ...o, order }));
  return withRevision(edit, { overlays });
}

export function addComment(edit: VideoEdit, comment: Omit<VideoComment, "id" | "order">): VideoEdit {
  assertValidRange(comment.startSec, comment.endSec, "comment");
  if (!comment.author.trim()) throw new VideoEditValidationError("comment_author", "comment author must not be empty");
  if (!comment.text.trim()) throw new VideoEditValidationError("comment_text", "comment text must not be empty");
  const next: VideoComment = { ...comment, id: newId("cm"), order: edit.comments.length };
  return withRevision(edit, { comments: [...edit.comments, next] });
}

export function updateComment(edit: VideoEdit, id: string, patch: Partial<Omit<VideoComment, "id" | "order">>): VideoEdit {
  const comments = edit.comments.map((c) => (c.id === id ? { ...c, ...patch } : c));
  return withRevision(edit, { comments });
}

export function removeComment(edit: VideoEdit, id: string): VideoEdit {
  const comments = edit.comments.filter((c) => c.id !== id).map((c, order) => ({ ...c, order }));
  return withRevision(edit, { comments });
}

export function setSubtitles(edit: VideoEdit, subtitles: SubtitleLine[]): VideoEdit {
  return withRevision(edit, { subtitles: subtitles.map((s, order) => ({ ...s, order })) });
}

export function toggleSubtitleCut(edit: VideoEdit, id: string): VideoEdit {
  const subtitles = edit.subtitles.map((s) => (s.id === id ? { ...s, cut: !s.cut } : s));
  return withRevision(edit, { subtitles });
}

/** v70 §4.3: 그 자리에서 자막 문구를 고친다. 순서·구간은 손대지 않는다. */
export function updateSubtitleText(edit: VideoEdit, id: string, text: string): VideoEdit {
  const subtitles = edit.subtitles.map((s) => (s.id === id ? { ...s, text } : s));
  return withRevision(edit, { subtitles });
}

/**
 * v70 §4.4: 타임라인에서 블록을 끌어 구간을 바꾼다. 자막은 생성 시 정해진 순번이 있어
 * `assertValidRange` 를 그대로 통과해야 한다 — 끌어서 시작이 끝을 넘는 조작은 여기서 막는다.
 */
export function updateSubtitleTiming(edit: VideoEdit, id: string, patch: { startSec?: number; endSec?: number }): VideoEdit {
  const subtitles = edit.subtitles.map((s) => (s.id === id ? { ...s, ...patch } : s));
  const updated = subtitles.find((s) => s.id === id);
  if (updated) assertValidRange(updated.startSec, updated.endSec, "subtitle");
  return withRevision(edit, { subtitles });
}

export function setVoice(edit: VideoEdit, voice: VoiceSelection): VideoEdit {
  return withRevision(edit, { voice });
}

export function normalizeVideoEdit(edit: VideoEdit): VideoEdit {
  return {
    ...emptyVideoEdit(),
    ...edit,
    transitions: edit.transitions ?? { introToMain: "cut", mainToOutro: "cut" },
    textStickers: edit.textStickers ?? [],
    clips: edit.clips ?? [],
    subtitleStyle: edit.subtitleStyle ?? { preset: "basic", position: "bottom", sizePercent: 100, outline: true },
    music: edit.music ?? null,
    safeArea: edit.safeArea ?? false,
    cover: edit.cover ?? null,
    introOutroDefaults: edit.introOutroDefaults ?? { intro: false, outro: false },
  };
}

export function addTextSticker(edit: VideoEdit, block: Omit<VideoTextSticker, "id" | "order">): VideoEdit {
  assertValidRange(block.startSec, block.endSec, "textSticker");
  if (!block.text.trim()) throw new VideoEditValidationError("text_sticker_text", "text sticker text must not be empty");
  return withRevision(edit, { textStickers: [...(edit.textStickers ?? []), { ...block, id: newId("txt"), order: edit.textStickers?.length ?? 0 }] });
}

export function updateTextSticker(edit: VideoEdit, id: string, patch: Partial<Omit<VideoTextSticker, "id" | "order">>): VideoEdit {
  const textStickers = (edit.textStickers ?? []).map((item) => item.id === id ? { ...item, ...patch } : item);
  const updated = textStickers.find((item) => item.id === id);
  if (updated) assertValidRange(updated.startSec, updated.endSec, "textSticker");
  return withRevision(edit, { textStickers });
}

export function removeTextSticker(edit: VideoEdit, id: string): VideoEdit {
  return withRevision(edit, { textStickers: (edit.textStickers ?? []).filter((item) => item.id !== id).map((item, order) => ({ ...item, order })) });
}

export function setVideoTransition(edit: VideoEdit, edge: "introToMain" | "mainToOutro", transition: VideoTransition): VideoEdit {
  return withRevision(edit, { transitions: { ...(edit.transitions ?? { introToMain: "cut", mainToOutro: "cut" }), [edge]: transition } });
}

export function setSubtitleStyle(edit: VideoEdit, patch: Partial<VideoSubtitleStyle>): VideoEdit {
  return withRevision(edit, { subtitleStyle: { ...(edit.subtitleStyle ?? emptyVideoEdit().subtitleStyle), ...patch } });
}

export function setVideoMusic(edit: VideoEdit, music: VideoMusic): VideoEdit {
  return withRevision(edit, { music });
}

export function setVideoSafeArea(edit: VideoEdit, safeArea: boolean): VideoEdit {
  return withRevision(edit, { safeArea });
}

export function setVideoCover(edit: VideoEdit, cover: VideoCover): VideoEdit {
  if (cover !== null) assertValidVideoCover(cover);
  return withRevision(edit, { cover });
}

export function setIntroOutroDefaults(edit: VideoEdit, patch: Partial<VideoEdit["introOutroDefaults"]>): VideoEdit {
  return withRevision(edit, { introOutroDefaults: { ...(edit.introOutroDefaults ?? { intro: false, outro: false }), ...patch } });
}

/** 인트로/아웃트로 렌더 완료 시 결과를 계약에 싣는다. 제거 시 호출자가 null을 넘긴다. */
export function setIntroOutroApplied(edit: VideoEdit, applied: IntroOutroApplied): VideoEdit {
  return withRevision(edit, { introOutro: applied });
}

/** 컷으로 표시된 자막 구간. playback-edit-plan 이 이 구간을 나가는 영상에서 뺀다. */
export function cutRanges(edit: VideoEdit): Array<{ startSec: number; endSec: number }> {
  return edit.subtitles.filter((s) => s.cut).map((s) => ({ startSec: s.startSec, endSec: s.endSec }));
}

/**
 * N2(2026-09-22 코드리뷰) → R2(3차 재검토로 되돌림): updateOverlay/updateComment는
 * range만 보고 text/author 빈 문자열은 막지 않는다. 사용자가 문구·작성자 칸을 지우고
 * 다시 타이핑하는 정상 동작 중간에 800ms 자동저장이 오면 서버가 400을 낸다.
 *
 * 2차 수정은 저장 직전에 빈 항목만 걸러(sanitizeForSave) 보냈는데, `/api/studio/drafts`
 * 는 videoEdit를 부분 병합이 아니라 통째로 치환한다(route.ts videoEditPatch). 그래서
 * 걸러낸 "일부 빠진 전체 객체"를 보내면 서버에 이미 저장돼 있던 항목까지 조용히
 * 사라진다 — 화면 state엔 남아 있어 사용자는 모르고, 새로고침하면 사라져 있었다.
 * 400을 없애는 대가로 조용한 데이터 삭제를 만든 셈이라 더 나쁘다.
 *
 * 그래서 걸러 보내는 대신, 빈 항목이 있는 동안 저장 자체를 보류한다(빠짐없이 이유를
 * 화면에 보여준다 — ADR-007). cardDeck의 pruneEmptyBubbles + emptyBubbleSlideNumber와
 * 같은 "보류" 패턴이다.
 */
export function videoEditIncompleteEntryReason(edit: VideoEdit): string | null {
  const emptyOverlayIndex = edit.overlays.findIndex((o) => !o.text.trim());
  if (emptyOverlayIndex !== -1) {
    return `${emptyOverlayIndex + 1}번째 오버레이 문구가 비어 있어 자동 저장을 보류했습니다. 문구를 채우면 저장됩니다.`;
  }
  const emptyCommentIndex = edit.comments.findIndex((c) => !c.author.trim() || !c.text.trim());
  if (emptyCommentIndex !== -1) {
    return `${emptyCommentIndex + 1}번째 댓글의 작성자 또는 내용이 비어 있어 자동 저장을 보류했습니다. 채우면 저장됩니다.`;
  }
  return null;
}
