/**
 * 채널이 그림을 몇 장까지 받는가. 한 자리에서만 정한다.
 *
 * 2026-09-14 실측: 카드뉴스를 여러 장 만들어도 발행 요청에는 대표 한 장만 실렸다.
 * 그래서 카드뉴스가 늘 한 장짜리로 나갔다.
 *
 * 여기 적는 숫자는 **그 채널이 이론상 받을 수 있는 수가 아니라 우리가 실제로 보낼 수 있는
 * 수**다. Instagram 은 `lib/publish.ts` 의 `publishInstagram` 이 캐러셀 자식 묶음을 실제로
 * 만든다(최대 10장, 서버 계약 `api/publish/route.ts` 도 10장에서 막는다). 나머지 채널의
 * 발행 함수는 `imageUrl` 한 장만 받는다. 받을 수 있는 척하고 조용히 버리면 그건 거짓말이라,
 * 못 받는 채널은 화면에 그 사실을 밝히는 데 이 값을 쓴다.
 */

/** 서버 계약(api/publish/route.ts)이 한 요청에서 허용하는 최대 장수. */
export const PUBLISH_IMAGE_LIMIT = 10;

const CAPACITY: Record<string, number> = {
  instagram: PUBLISH_IMAGE_LIMIT,
  threads: 1,
  facebook: 1,
  x: 1,
  bluesky: 1,
  telegram: 1,
  discord: 1,
  slack: 1,
};

/** 모르는 채널은 한 장으로 본다. 모르면서 여러 장을 보내는 쪽이 더 위험하다. */
export function channelImageCapacity(platform: string): number {
  return CAPACITY[platform] ?? 1;
}

export type ChannelImagePlan = {
  /** 실제로 이 채널에 보낼 그림 */
  images: string[];
  /** 규격 때문에 못 보내고 남긴 장수 */
  dropped: number;
};

export function planChannelImages(platform: string, deck: readonly string[]): ChannelImagePlan {
  const usable = deck.filter((url) => typeof url === "string" && url.trim().length > 0);
  const capacity = channelImageCapacity(platform);
  const images = usable.slice(0, capacity);
  return { images, dropped: usable.length - images.length };
}

/**
 * 여러 장을 만들었는데 한 장만 받는 채널이 섞여 있으면 그것을 사람 말로 알린다.
 * 밝힐 것이 없으면 null 이라 화면에 아무 줄도 안 생긴다.
 */
export function limitedChannelNotice(
  platforms: readonly string[],
  deckSize: number,
  label: (platform: string) => string,
): string | null {
  if (deckSize <= 1) return null;
  const limited = platforms.filter((platform) => channelImageCapacity(platform) < deckSize);
  if (!limited.length) return null;
  const names = limited.map(label).join(", ");
  return `카드 ${deckSize}장 중 첫 장만 올라가는 채널이 있습니다: ${names}. 여러 장을 함께 올리려면 인스타그램을 골라 주세요.`;
}
