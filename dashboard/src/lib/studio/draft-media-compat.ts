type UnknownRecord = Record<string, unknown>;

function record(value: unknown): UnknownRecord {
  return value && typeof value === "object" && !Array.isArray(value) ? value as UnknownRecord : {};
}

function string(value: unknown): string {
  return typeof value === "string" && value.trim() ? value : "";
}

function stringList(value: unknown): string[] {
  return Array.isArray(value) ? value.filter((entry): entry is string => typeof entry === "string" && entry.trim().length > 0) : [];
}

/**
 * 운영 drafts.payload에 공존하는 이미지 필드를 한 모양으로 만든다.
 *
 * 2026-10-09 운영 재측정: 과거 초안은 image_url/imageUrl/image_urls/imageUrls를
 * payload 최상위에 저장했고, 현재 초안은 img.file/img.url/img.imageUrls를 쓴다.
 * 편집실과 발행실이 각자 일부 필드만 읽으면 과거 실사 초안이 단색 카드가 된다.
 */
export function normalizeDraftImage(payload: UnknownRecord): UnknownRecord | null {
  const raw = payload.img;
  const img = record(raw);
  const urls = [
    ...stringList(img.imageUrls),
    ...stringList(img.image_urls),
    ...stringList(payload.imageUrls),
    ...stringList(payload.image_urls),
  ];
  const primary = string(img.file)
    || string(img.url)
    || urls[0]
    || string(payload.image_url)
    || string(payload.imageUrl)
    || string(raw);
  if (!primary) return null;
  const imageUrls = [...new Set([primary, ...urls])];
  return {
    ...img,
    url: string(img.url) || primary,
    file: string(img.file) || primary,
    imageUrls,
  };
}

/** 현재 vid 객체와 과거 video_url/videoUrl/string vid를 같은 경계로 흡수한다. */
export function normalizeDraftVideo(payload: UnknownRecord): UnknownRecord | null {
  const raw = payload.vid;
  const vid = record(raw);
  const primary = string(vid.url)
    || string(vid.file)
    || string(payload.video_url)
    || string(payload.videoUrl)
    || string(raw);
  if (!primary) return null;
  return {
    ...vid,
    url: string(vid.url) || primary,
    file: string(vid.file) || primary,
  };
}

export function draftImageSource(payload: UnknownRecord): string {
  const image = normalizeDraftImage(payload);
  return image ? string(image.file) || string(image.url) : "";
}

export function draftVideoSource(payload: UnknownRecord): string {
  const video = normalizeDraftVideo(payload);
  return video ? string(video.url) || string(video.file) : "";
}
