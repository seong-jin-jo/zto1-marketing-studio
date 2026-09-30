import { filterInstructionPlaceholderLines } from "@/lib/studio/generated-copy";

/**
 * 생성실 "고른 형식의 생성 후보"(영상 대본 후보·글 후보) 패널의 주제 추적 + 자리표시 제거.
 *
 * 2026-10-01 운영 실측(main fa66ae05): 구조 초안(A/B/C)은 PR#96에서 주제 변경 시 비워지고
 * 복원 시 자리표시가 걸러지게 고쳤지만, 그 아래 "생성 후보" 패널(studio/page.tsx 의 `text`
 * 상태, quickDraft prop)은 같은 브라우저 저장·복원 경로(`studio_work` localStorage)를 쓰는데
 * 이 sanitize가 안 걸려 있었다. 그래서 ①주제를 바꿔도 이전 주제의 후보가 그대로 남고
 * ②"저희는 (...으로 대체)을 도와드리는 곳입니다" 같은 자리표시 문장이 그대로 보였다.
 *
 * 구조 초안(StudioRooms.tsx candidatesTopicRef)과 같은 패턴: 후보를 만들 때의 주제를
 * 기억해 두고, 복원 시점에는 저장된 주제(quickDraftTopic)를 우선하며, 실제 주제가 달라지면
 * (trim 비교) 후보를 비운다. 복원 직후 부모의 주제 복원이 아직 도착하지 않은 빈 문자열을
 * "주제를 지웠다"로 오판하지 않는다.
 */

export interface TextVariantsLike {
  threads?: string;
  facebook?: string;
  x?: string;
  instagram?: { caption?: string; hashtags?: string[]; slides?: string[] };
  shorts?: { hook?: string; body?: string; cta?: string };
  image_prompt?: string;
}

/**
 * 자리표시가 든 줄만 지운다(필드 전체를 버리지 않는다 — 정밀도 우선 원칙, 2026-10-01
 * 재리뷰 BLOCK: 영상 대본처럼 여러 줄인 필드에서 한 줄만 자리표시여도 전문이 사라졌다.
 * 기존 filterInstructionPlaceholderLines 를 줄 단위로 적용해 나머지 줄은 보존한다.
 */
function cleanMultiline(value?: string): string | undefined {
  if (!value) return value;
  const kept = filterInstructionPlaceholderLines(value.split("\n")).join("\n");
  return kept.trim().length > 0 ? kept : undefined;
}

export function sanitizeRestoredQuickDraftText<T extends TextVariantsLike | null | undefined>(text: T): T {
  if (!text) return text;
  return {
    ...text,
    threads: cleanMultiline(text.threads),
    facebook: cleanMultiline(text.facebook),
    x: cleanMultiline(text.x),
    image_prompt: cleanMultiline(text.image_prompt),
    instagram: text.instagram
      ? {
          ...text.instagram,
          caption: cleanMultiline(text.instagram.caption),
          slides: text.instagram.slides ? filterInstructionPlaceholderLines(text.instagram.slides) : text.instagram.slides,
        }
      : text.instagram,
    shorts: text.shorts
      ? {
          ...text.shorts,
          hook: cleanMultiline(text.shorts.hook),
          body: cleanMultiline(text.shorts.body),
          cta: cleanMultiline(text.shorts.cta),
        }
      : text.shorts,
  } as T;
}

/** 복원된 편집 줄(editLines)에서도 같은 필터로 자리표시 줄을 뺀다. */
export function sanitizeRestoredQuickDraftLines(lines: readonly string[] | null | undefined): string[] {
  return filterInstructionPlaceholderLines(lines ?? []);
}

/**
 * 복원 시점의 "생성 후보가 만들어진 주제"를 정한다. 저장해 둔 실제 주제(quickDraftTopic)가
 * 있으면 그걸 쓰고, 옛 저장본(주제를 같이 저장하기 전에 쓰인 값)만 복원 시점의 idea 로
 * 보완한다. text가 없으면 추적할 것이 없다(null).
 */
export function resolveRestoredQuickDraftTopic(params: {
  hasText: boolean;
  savedTopic?: string | null;
  restoredIdea: string;
}): string | null {
  if (!params.hasText) return null;
  if (params.savedTopic && params.savedTopic.trim()) return params.savedTopic.trim();
  return params.restoredIdea.trim() || null;
}

/**
 * 주제가 바뀌어 생성 후보를 비워야 하는지 판단한다. trim 비교, 복원 직후 오삭제 금지
 * (아직 도착하지 않은 빈 주제는 "지웠다"로 보지 않는다 — 구조 초안과 같은 규칙).
 */
export function shouldInvalidateQuickDraft(topicRef: string | null, currentTopic: string): boolean {
  if (topicRef === null) return false;
  if (!currentTopic.trim()) return false;
  return topicRef.trim() !== currentTopic.trim();
}
