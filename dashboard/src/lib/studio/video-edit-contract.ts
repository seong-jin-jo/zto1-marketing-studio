/**
 * 영상 편집 계약 v1 (PR4 세션맥락 B).
 *
 * `card-deck-contract.ts` 와 같은 자리를 영상에 만든다. 저장 위치는 그 파일과 같은 원칙을
 * 따라 `drafts.payload.videoEdit`(신규 테이블 0건)이다. 회장이 직접 지목한 네 기능(후킹
 * CTA 오버레이 · 댓글 오버레이=사회적 증거 · 자막 기반 편집 · 음성 변경)을 각각 한 필드로
 * 둔다.
 *
 * 렌더 반영 범위: 오버레이·컷·음성 선택은 이 계약에 저장되지만, 실제로 나가는 mp4 에
 * 굽는 것은 자막(`/api/video/subtitle`)만 기존에 연결돼 있다. 오버레이·컷·음성은 이번
 * PR에서는 편집 상태로만 저장하고(조용히 적용된 척하지 않는다 — ADR-007), 화면에
 * "렌더 반영은 다음 단계입니다"를 명시한다. 근거는 VideoEditor.tsx 상단 주석.
 */

export const VIDEO_EDIT_CONTRACT_VERSION = "1.0" as const;

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

/** 자막 한 줄. 삭제하면 `cuts` 에 그 구간이 컷 후보로 들어간다(렌더 미연결, 편집 의도만 기록). */
export type SubtitleLine = {
  id: string;
  order: number;
  text: string;
  startSec: number;
  endSec: number;
  cut: boolean;
};

export type VoiceSelection = { voiceId: string; voiceName: string } | null;

export type VideoEdit = {
  contract_version: typeof VIDEO_EDIT_CONTRACT_VERSION;
  overlays: VideoOverlay[];
  comments: VideoComment[];
  subtitles: SubtitleLine[];
  voice: VoiceSelection;
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
    revision: 0,
  };
}

const OVERLAY_ALLOWED_KEYS = new Set(["id", "order", "kind", "text", "startSec", "endSec"]);
const COMMENT_ALLOWED_KEYS = new Set(["id", "order", "author", "text", "source", "startSec", "endSec"]);
const SUBTITLE_ALLOWED_KEYS = new Set(["id", "order", "text", "startSec", "endSec", "cut"]);

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

/** 컷 표시된 자막 구간 목록(렌더 미연결 — 편집 의도만 모아 보여줄 때 쓴다). */
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
