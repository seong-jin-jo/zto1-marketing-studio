export type CardTheme = { background: string; foreground: string; accent: string };

/** 기본 색. 브랜드 색을 아직 안 고른 작업 공간도 결과가 나와야 한다. */
export const DEFAULT_CARD_THEME: CardTheme = {
  background: "#12100E",
  foreground: "#F7F3EE",
  accent: "#E8843C",
};

/** 학습 정보의 한국어 색 이름을 실제 카드 렌더 색으로 옮기는 단일 팔레트. */
export const COLOR_WORDS: Record<string, string> = {
  "빨강": "#D7263D", "주황": "#E8843C", "오렌지": "#E8843C", "노랑": "#F2C14E",
  "초록": "#3E8E5A", "그린": "#3E8E5A", "파랑": "#2F6FED", "블루": "#2F6FED",
  "남색": "#1B3A6B", "보라": "#6B4E9B", "분홍": "#E37B9A", "핑크": "#E37B9A",
  "베이지": "#E8DCC8", "갈색": "#6B4A2F", "브라운": "#6B4A2F",
  "검정": "#12100E", "블랙": "#12100E", "흰색": "#F7F3EE", "화이트": "#F7F3EE",
  "회색": "#6E6A66", "그레이": "#6E6A66",
};

/** 배경이 밝으면 글자는 어둡게. 대비가 없으면 글자가 안 읽힌다. */
export function readableOn(background: string): string {
  const hex = background.replace("#", "");
  const r = parseInt(hex.slice(0, 2), 16);
  const g = parseInt(hex.slice(2, 4), 16);
  const b = parseInt(hex.slice(4, 6), 16);
  // 사람 눈은 초록에 가장 민감하다. 단순 평균을 쓰면 노랑 배경에서 흰 글자가 나온다.
  const luminance = (0.299 * r + 0.587 * g + 0.114 * b) / 255;
  return luminance > 0.6 ? "#12100E" : "#F7F3EE";
}
