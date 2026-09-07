/**
 * 만들 그림의 결.
 *
 * 회장 2026-09-08: "생성할 때 여러 옵션은 안 받는 거냐. 고객은 이것저것 결을 보고 선택한
 * 다음 생성하고 싶어할 듯."
 *
 * 종전에는 비율과 화질이 코드 기본값으로 고정돼 있고 결을 고를 자리가 아예 없었다. 같은
 * 글감으로 만들 수 있는 그림은 여러 가지인데 고객은 하나만 받아 보고 마음에 안 들면
 * 다시 만들 수밖에 없었다. 다시 만들면 그만큼 돈이 나간다. 만들기 전에 고르게 하는 것이
 * 결과를 고르는 가장 싼 방법이다.
 *
 * 설계 문서(osmu-4room-구조질문-선택지-v1.0.0-opus)가 스스로 경고한 것이 있다. 모든 것을
 * 카드로만 고르게 하면 "우리가 미리 준비한 것 밖으로는 못 나가는 제품"이 된다. 그래서
 * 카드 옆에 직접 적는 칸을 함께 둔다. 카드는 빠른 길이고 직접 적기는 열린 문이다.
 *
 * 이름은 결과의 언어로 쓴다. 고객은 모델이나 기법을 고르고 싶은 것이 아니라 결과를
 * 고르고 싶다(같은 문서 5번 항목).
 */
export interface ImageStyle {
  id: string;
  /** 화면에 보이는 이름. 결과가 어떻게 보일지로 쓴다. */
  title: string;
  /** 한 줄 설명. 무엇이 달라지는지 사람 말로. */
  hint: string;
  /** 생성기에 덧붙일 말. 화면에는 보이지 않는다. */
  prompt: string;
}

export const IMAGE_STYLES: readonly ImageStyle[] = [
  { id: "photo", title: "실제 사진처럼", hint: "실물을 찍은 듯한 자연스러운 사진",
    prompt: "photorealistic photograph, natural lighting, shallow depth of field" },
  { id: "clean", title: "깔끔한 제품 컷", hint: "배경이 정돈된 밝은 스튜디오 느낌",
    prompt: "clean studio product shot, soft even lighting, minimal uncluttered background" },
  { id: "warm", title: "따뜻한 일상",  hint: "사람 사는 온기가 도는 장면",
    prompt: "warm cozy lifestyle scene, golden hour light, inviting atmosphere" },
  { id: "bold", title: "눈에 띄는 강한 색", hint: "피드에서 시선을 잡는 선명한 색",
    prompt: "bold saturated colors, high contrast, striking graphic composition" },
  { id: "calm", title: "차분한 여백", hint: "글자를 얹기 좋은 넉넉한 빈 공간",
    prompt: "calm minimal composition with generous negative space for text overlay" },
  { id: "illust", title: "부드러운 일러스트", hint: "사진 대신 그림체로",
    prompt: "soft flat illustration, gentle shapes, limited color palette" },
] as const;

export const CUSTOM_STYLE_ID = "custom";

/**
 * 생성기에 보낼 최종 지시문을 만든다.
 *
 * 순서가 뜻을 정한다. 글감이 무엇을 그릴지 정하고, 결이 어떻게 보일지 정하고, 브랜드 색이
 * 마지막으로 조인다. 브랜드 색은 고객이 학습 정보에서 이미 골라 둔 값인데 종전에는 그림
 * 생성에 한 번도 쓰이지 않았다. 골라 둔 것이 결과에 안 나타나면 고른 의미가 없다.
 */
/**
 * 학습 정보의 브랜드 색 카드를 생성기가 알아듣는 색 이름으로 옮긴다.
 *
 * 2026-09-08 실측: 카드에 저장된 값은 "그린·크림. 예: 그린과 크림을 중심으로 편안하고
 * 자연스럽게 표현합니다." 같은 한국어 문장이다. 그것을 그대로 지시문에 넣었더니 생성기가
 * 그 말을 **그림 안에 글자로 그렸다**. 결과 이미지 상단에 "Grein · Cram" 같은 뭉개진
 * 글자와 뜻 없는 한자가 박혀 나왔다. 그림 생성기는 지시문에 있는 낱말을 그림 속 글자로
 * 옮기는 성질이 있다. 색을 말할 때는 색 이름만 말한다.
 */
const PALETTE_COLORS: readonly { match: RegExp; colors: string }[] = [
  { match: /네이비|navy/i, colors: "navy and white" },
  { match: /블랙|black/i, colors: "black and white" },
  { match: /그린|green/i, colors: "sage green and cream" },
  { match: /블루|blue/i, colors: "blue and light gray" },
  { match: /오렌지|베이지|orange|beige/i, colors: "warm orange and beige" },
];

export function paletteToColors(palette?: string): string {
  const value = (palette || "").trim();
  if (!value) return "";
  const hit = PALETTE_COLORS.find((one) => one.match.test(value));
  return hit ? hit.colors : "";
}

/**
 * 그림 안에 글자가 박히지 않게 하는 지시. 카드뉴스 글자는 편집실이 얹는다.
 *
 * 2026-09-08 실측: "no text" 한 마디만으로는 부족했다. 간판·포장지·상표 같은 **글자가
 * 있을 자리를 가진 물건**을 그리면 모델이 거기에 뭉개진 글자를 채워 넣는다. 실제로
 * 카페 장면을 시켰더니 손가방에 뜻 없는 상표가 박혀 나왔다.
 *
 * 쓰는 모델(Higgsfield Soul 2.0)은 부정 지시(negative prompt) 파라미터를 받지 않는다.
 * 받는 값은 비율·화질·씨앗·참조 이미지뿐이다. 그래서 "쓰지 마라" 가 아니라 "비어 있다"
 * 를 그리라고 말한다. 모델은 금지보다 묘사를 잘 따른다.
 */
const NO_TEXT = [
  "completely free of any text, letters, numbers or written characters",
  "blank unbranded surfaces",
  "empty signage",
  "no logo, no watermark, no packaging labels",
].join(", ");

/**
 * 그림 지시문의 바탕이 될 말을 고른다.
 *
 * 2026-09-08 실측에서 드러난 사고: 지시문 자리에 카드뉴스 **본문**이 그대로 들어가고
 * 있었다. "처음 온 고객 10명 중 9명이 같은 실수를 한다..." 같은 한국어 문장을 받은
 * 생성기는 그 말을 그림 속 상자와 간판에 글자로 그렸다. 결과는 뭉개진 알파벳으로 뒤덮인
 * 쓸 수 없는 이미지였다.
 *
 * 그림 지시문은 **무엇을 그릴지**를 말해야지 **무엇이라고 쓸지**를 말하면 안 된다.
 * 생성기가 만든 시각 묘사(image_prompt)가 있으면 그것을 쓰고, 없으면 짧은 주제어까지만
 * 쓴다. 본문은 어떤 경우에도 넘기지 않는다.
 */
export function pickImageSubject(input: { imagePrompt?: string; topic?: string }): string {
  const visual = (input.imagePrompt || "").trim();
  if (visual) return visual;
  const topic = (input.topic || "").trim();
  // 주제어도 길면 문장일 가능성이 높다. 짧을 때만 쓴다.
  if (topic && [...topic].length <= 30) return topic;
  return "brand lifestyle scene";
}

export function buildImagePrompt(
  base: string,
  style: { id: string; custom?: string } | null,
  palette?: string,
): string {
  const parts = [base.trim()].filter(Boolean);
  if (style) {
    if (style.id === CUSTOM_STYLE_ID) {
      const custom = (style.custom || "").trim();
      if (custom) parts.push(custom);
    } else {
      const found = IMAGE_STYLES.find((one) => one.id === style.id);
      if (found) parts.push(found.prompt);
    }
  }
  const colors = paletteToColors(palette);
  if (colors) parts.push(`color palette: ${colors}`);
  parts.push(NO_TEXT);
  return parts.join(". ");
}
