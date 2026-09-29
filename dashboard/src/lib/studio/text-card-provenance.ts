export interface TextCardImageState {
  url?: string;
  file?: string;
  imageUrls?: string[];
  topicKey?: string;
  textEmbedded?: boolean;
}

export interface TextCardRecoveryInput {
  img: TextCardImageState | null;
  editKind: unknown;
  editLines: unknown;
  cardDeck: unknown;
}

/**
 * `textEmbedded`를 넣기 전 무료 글자 카드만 식별하는 보수적 복구 규칙이다.
 *
 * 과거 Studio 구현에서 이 경로만 cardDeck 없이, 주제 도장을 가진 여러 장의 그림을
 * 문구 장수와 정확히 맞춰 저장했다. 이미지가 여러 장이라는 이유만으로 승격하면 일반
 * 배경 카드와 외부 편집기 인계를 오판하므로 아래 조건을 하나라도 잃으면 false다.
 */
export function isLegacyEmbeddedTextCard(input: TextCardRecoveryInput): boolean {
  const { img } = input;
  if (!img || img.textEmbedded !== undefined) return img?.textEmbedded === true;
  if (input.editKind !== "card" || input.cardDeck != null) return false;
  if (typeof img.topicKey !== "string" || !img.topicKey.trim()) return false;
  if (!Array.isArray(img.imageUrls) || img.imageUrls.length === 0) return false;
  if (!img.imageUrls.every((url) => typeof url === "string" && url.length > 0)) return false;
  if (img.url !== img.imageUrls[0] || img.file !== img.imageUrls[0]) return false;
  if (!Array.isArray(input.editLines)) return false;
  const lines = input.editLines.filter((line): line is string => typeof line === "string" && line.trim().length > 0);
  return lines.length > 0 && lines.length === img.imageUrls.length;
}

/** 명시 표식 또는 엄격한 구형 서명을 한 가지 저장 계약으로 정규화한다. */
export function recoverEmbeddedTextCard<T extends TextCardImageState>(
  img: T | null,
  input: Omit<TextCardRecoveryInput, "img">,
): T | null {
  if (!img) return null;
  return isLegacyEmbeddedTextCard({ img, ...input }) && img.textEmbedded !== true
    ? { ...img, textEmbedded: true }
    : img;
}

/** 생성·재합성 두 경로가 같은 명시 표식을 붙이게 하는 생성자다. */
export function embeddedTextCardImage<T extends TextCardImageState>(img: T): T & { textEmbedded: true } {
  return { ...img, textEmbedded: true };
}
