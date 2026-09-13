/**
 * 만든 그림·영상이 **어느 주제의 것인지** 기억하고, 새 주제에 옛 매체가 붙는 것을 막는다.
 *
 * 2026-09-14 실측(컨트롤러가 배포된 화면에서 직접 관통, `session-state.osmu.md` 06시 35분):
 * 새로 시작을 누르고 주제를 "동네 미용실 첫 방문 손님이 자주 묻는 세 가지" 로 바꿔 초안을
 * 새로 만들었는데, 숏폼 영상 만들기를 눌러도 **어제 계약 주제로 만든 영상이 그대로 붙었다.**
 * 서버 저장소에 새 mp4 가 하나도 안 생겼다. 생성 호출 자체가 없었다.
 *
 * 화면은 멀쩡해 보인다. 글도 있고 영상도 있다. 그래서 사용자는 그대로 발행한다.
 * **나가는 영상만 지난 주제다.** 이것이 이 결함이 위험한 이유다.
 *
 * 원인은 세 자리였다.
 * ① `새로 시작` 의 비어 있음 판정이 글·주제·초안번호만 보고 그림·영상을 안 봤다.
 *    글이 없고 영상만 남은 상태에서 눌러도 "이미 비어 있습니다" 로 닫혀 영상이 살아남았다.
 * ② 새 초안을 만들 때 그림·영상을 그대로 뒀다. 초안번호와 발행 흔적은 끊으면서 매체만 뒀다.
 * ③ 영상 만들기가 **어느 주제의 그림인지 묻지 않고** 남아 있는 그림을 바탕으로 썼다.
 *    그 그림이 어제 것이면 어제 파일 경로라 서버가 못 찾고, 실패는 잠깐 뜨는 알림뿐이라
 *    화면에는 옛 영상이 그대로 남는다.
 *
 * 그래서 매체에 **주제 도장**을 찍는다. 도장이 지금 주제와 다르면 그 매체는 이번 작업물의
 * 것이 아니다. 재사용도 발행도 하지 않는다.
 *
 * 관련: ADR-007(조용한 실패 금지), 카드뉴스 경로(`card-deck.ts`)는 누를 때마다 다시 그려서
 * 같은 사고가 없었다. 영상만 남아 있는 것을 쓰고 있었다.
 */

/** 주제 도장. 띄어쓰기·대소문자 차이로 남의 주제가 되지 않게 맞춘다. */
export function mediaTopicKey(idea: string | null | undefined): string {
  return String(idea ?? "").trim().replace(/\s+/g, " ").toLowerCase();
}

export type StampedMedia = { topicKey?: string } | null | undefined;

/**
 * 이 매체가 지금 주제의 것인가.
 * - `none`: 매체가 없다.
 * - `fresh`: 지금 주제로 만든 것이다.
 * - `stale`: 다른 주제로 만든 것이다.
 * - `unknown`: 도장이 없다(도장을 찍기 전에 만든 옛 작업물). **안전 쪽으로 stale 처럼 다룬다.**
 */
export function mediaFreshness(media: StampedMedia, idea: string | null | undefined): "none" | "fresh" | "stale" | "unknown" {
  if (!media) return "none";
  const stamped = typeof media.topicKey === "string" ? media.topicKey : "";
  if (!stamped) return "unknown";
  return stamped === mediaTopicKey(idea) ? "fresh" : "stale";
}

/** 재사용해도 되는 매체인가. 도장이 없는 것은 재사용하지 않는다(옛 파일 경로일 수 있다). */
export function isReusableMedia(media: StampedMedia, idea: string | null | undefined): boolean {
  return mediaFreshness(media, idea) === "fresh";
}

export type VideoRequestDecision = {
  /** 만들 것인가. `confirm` 이면 사용자에게 한 번 더 물은 뒤에만 만든다. */
  action: "generate" | "confirm";
  /** 바탕 그림을 새로 만들어야 하는가. 남의 주제 그림은 절대 재사용하지 않는다. */
  baseImage: "reuse" | "new";
  /** 만들기 전에 화면에 밝힐 말. 없으면 밝힐 것이 없다. */
  notice?: string;
  /** `confirm` 일 때 물을 말. */
  confirm?: { title: string; description: string };
};

/**
 * `숏폼 영상 만들기` 를 눌렀을 때 무엇을 할지 정한다.
 *
 * 돈이 나가는 자리라 두 가지를 동시에 지켜야 한다.
 * - **중복 생성으로 돈이 새지 않게 한다.** 같은 주제로 이미 만든 영상이 있으면 한 번 묻는다.
 * - **주제가 바뀌었는데 옛것을 쓰는 일은 없게 한다.** 도장이 다르면 묻지 않고 새로 만든다.
 *   여기서 물으면 사용자는 "이미 있다" 는 말을 듣고 취소하고, 옛 영상이 그대로 발행된다.
 */
export function decideVideoRequest(input: {
  idea: string | null | undefined;
  img: StampedMedia;
  vid: StampedMedia;
}): VideoRequestDecision {
  const baseImage = isReusableMedia(input.img, input.idea) ? "reuse" : "new";
  const video = mediaFreshness(input.vid, input.idea);
  if (video === "fresh") {
    return {
      action: "confirm",
      baseImage,
      confirm: {
        title: "이 주제로 만든 영상이 이미 있습니다. 다시 만들까요?",
        description: "다시 만들면 생성 비용이 한 번 더 듭니다. 지금 영상은 새 영상으로 바뀝니다.",
      },
    };
  }
  if (video === "stale" || video === "unknown") {
    return {
      action: "generate",
      baseImage,
      notice: "지금 붙어 있는 영상은 이전 주제로 만든 것이라 새 주제 영상으로 바꿉니다.",
    };
  }
  return { action: "generate", baseImage };
}

/**
 * 새 초안을 만들 때 옛 매체를 내린다.
 *
 * 남기고 "어느 주제의 것인지 밝히기" 도 검토했다. 채택하지 않았다. 발행실은 상태에 있는
 * 그림·영상을 그대로 싣고, 사용자는 화면에 영상이 보이면 만들어진 것으로 읽는다. 경고 문구
 * 하나로 **잘못 발행되는 것**을 막을 수 없다. 원본은 이미 저장된 작업물에 남아 있으므로
 * 이 화면에서 내려도 잃는 것이 없다. 그래서 내리고, 내렸다고 말한다(ADR-007).
 */
/**
 * 발행 직전 마지막 관문. **다른 주제 도장이 찍힌 매체는 내보내지 않는다.**
 *
 * 생성 단추에만 판정을 걸면 구멍이 남는다(2026-09-14 Codex 교차리뷰 P0). 사용자가 주제만
 * 고쳐 놓고 생성 없이 바로 발행하면 옛 매체가 그대로 나간다. 그래서 나가는 문에도 건다.
 *
 * 도장이 없는 옛 작업물(`unknown`)은 막지 않는다. 도장 도입 전에 저장된 것이 전부 발행
 * 불가가 되면 멀쩡한 작업물을 못 올리게 된다. 재사용만 막고 발행은 허용한다.
 */
export function stalePublishBlock(
  media: StampedMedia,
  idea: string | null | undefined,
  what: "이미지" | "영상",
): string | null {
  return mediaFreshness(media, idea) === "stale"
    ? `이 ${what}은 지금 주제가 아니라 이전 주제로 만든 것입니다. 생성실에서 다시 만든 뒤 올려 주세요.`
    : null;
}

export function droppedMediaNotice(had: { img: boolean; vid: boolean }): string | null {
  if (!had.img && !had.vid) return null;
  const what = had.img && had.vid ? "이미지와 영상" : had.img ? "이미지" : "영상";
  return `새 주제로 초안을 만들어 이전 ${what}은 내렸습니다. 저장된 작업물에는 그대로 남아 있습니다.`;
}
