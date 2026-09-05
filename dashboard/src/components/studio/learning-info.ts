// 학습 정보. 여덟 칸의 정의와 저장. (docs/학습정보-층계-계약-v2.1.md §4 U3·U4·L5)
//
// 회장 지적: "왜 헤더에 학습 정보가 사라짐?" 그리고 "주관식이면 나라도 뭘 입력해야할 지를 모르겠는데".
// 그래서 이 파일은 두 가지를 한다.
//   1. 여덟 칸이 얼마나 찼는지를 한 숫자로 만든다. 헤더가 그 숫자를 항상 보여준다.
//   2. 각 칸을 카드로 고를 수 있게 후보를 미리 갖고 있는다. 빈칸을 주지 않는다.
//
// 저장은 작업 공간별 localStorage 다. 브랜드 가이드 증류(POST /api/studio/brand-setup)는
// 이 값에서 파생해 따로 보내고, 화면 진행 상태는 이 파일이 소유한다.

export type LearningSlotKey =
  | "industry"
  | "voice"
  | "audience"
  | "purpose"
  | "forbidden"
  | "palette"
  | "rights"
  | "learnedRules";

export interface LearningSlot {
  key: LearningSlotKey;
  label: string;
  layer: "U3" | "U4" | "L5";
}

// 여덟 칸. 순서가 곧 화면에 쌓이는 순서다.
export const LEARNING_SLOTS: readonly LearningSlot[] = [
  { key: "industry", label: "업종", layer: "U3" },
  { key: "audience", label: "주요 고객", layer: "U4" },
  { key: "voice", label: "말투", layer: "U3" },
  { key: "purpose", label: "콘텐츠 목표", layer: "U4" },
  { key: "forbidden", label: "쓰지 않을 표현", layer: "U3" },
  { key: "palette", label: "브랜드 색", layer: "U3" },
  { key: "rights", label: "소재 권리", layer: "U3" },
  { key: "learnedRules", label: "성과에서 배운 규칙", layer: "L5" },
] as const;

export const LEARNING_SLOT_TOTAL = LEARNING_SLOTS.length;

export type LearningInfo = Partial<Record<LearningSlotKey, string>>;

export interface LearningCard {
  id: string;
  title: string;
  /** 카드 본문. 설명이 아니라 그 선택이 만들어 낼 실제 문장 한 줄이다. */
  sample: string;
}

/** 걸음 1. 무엇을 하는 곳입니까. */
export const INDUSTRY_CARDS: readonly LearningCard[] = [
  { id: "education", title: "교육·강의", sample: "배우고 싶은 사람에게 강의와 배움을 파는 곳" },
  { id: "app", title: "앱·서비스", sample: "앱이나 웹 서비스를 만들어 쓰게 하는 곳" },
  { id: "food", title: "식음료·카페", sample: "먹고 마시는 것을 직접 만들어 파는 곳" },
  { id: "beauty", title: "뷰티·미용", sample: "얼굴과 몸을 다듬어 주는 곳" },
  { id: "commerce", title: "쇼핑몰·커머스", sample: "물건을 골라 담아 파는 곳" },
  { id: "estate", title: "부동산·인테리어", sample: "사는 공간을 찾아 주고 고쳐 주는 곳" },
  { id: "health", title: "운동·건강", sample: "몸을 움직여 건강해지게 돕는 곳" },
  { id: "finance", title: "금융·재테크", sample: "돈을 굴리고 지키는 법을 다루는 곳" },
  { id: "travel", title: "여행·숙박", sample: "떠나고 머무는 일을 준비해 주는 곳" },
  { id: "pet", title: "반려동물", sample: "같이 사는 동물을 위한 것을 다루는 곳" },
  { id: "local", title: "동네 가게", sample: "가까운 손님이 걸어와 이용하는 곳" },
  { id: "b2b", title: "기업 상대 일", sample: "회사를 손님으로 두고 일하는 곳" },
] as const;

/** 걸음 2. 누구에게 말합니까. 카드 본문이 그 대상에게 실제로 쓴 문장이다. */
export const AUDIENCE_CARDS: readonly LearningCard[] = [
  { id: "starter", title: "처음 해 보는 사람", sample: "뭐부터 해야 할지 모르겠다면, 오늘은 이거 하나만 하세요." },
  { id: "solo", title: "혼자 일하는 사장", sample: "사람 더 못 뽑는 상황에서, 하루를 두 시간 줄이는 방법입니다." },
  { id: "veteran", title: "이미 잘하는 사람", sample: "아시는 내용은 건너뛰고, 놓치기 쉬운 한 지점만 짚습니다." },
  { id: "parent", title: "아이를 키우는 사람", sample: "아이 재우고 나서 십 분이면 됩니다." },
  { id: "youth", title: "이십 대", sample: "지금 시작해도 안 늦었습니다. 오늘 첫 칸만 채워요." },
  { id: "company", title: "회사 담당자", sample: "결재 올리실 때 근거로 쓰실 수 있게 숫자부터 적었습니다." },
] as const;

/** 걸음 3. 어떤 결로 말합니까. 같은 내용을 그 말투로 쓴 견본이다. */
export const VOICE_CARDS: readonly LearningCard[] = [
  { id: "calm", title: "차분하게", sample: "천천히 보셔도 됩니다. 순서대로 하면 됩니다." },
  { id: "friendly", title: "친하게", sample: "이거 진짜 편해요. 한 번만 해 보면 아실 거예요." },
  { id: "crisp", title: "짧고 단단하게", sample: "세 줄로 끝냅니다. 첫째, 오늘 하나만 바꿉니다." },
  { id: "expert", title: "전문가처럼", sample: "결론부터 말씀드리면, 이 방식이 평균 대비 이십 퍼센트 빠릅니다." },
  { id: "warm", title: "따뜻하게", sample: "오늘 하루도 고생하셨습니다. 잠깐 쉬면서 보세요." },
  { id: "playful", title: "가볍고 재밌게", sample: "이거 모르면 손해예요. 진짜로요." },
] as const;

/** 걸음 4. 이번에 노리는 것. */
export const PURPOSE_CARDS: readonly LearningCard[] = [
  { id: "awareness", title: "브랜드 알리기", sample: "처음 보는 고객이 브랜드 이름과 하는 일을 기억하게 합니다." },
  { id: "trust", title: "신뢰 높이기", sample: "브랜드를 아는 고객에게 전문성과 실제 경험을 보여 줍니다." },
  { id: "inquiry", title: "문의 늘리기", sample: "관심 있는 고객이 상담이나 문의를 시작하게 합니다." },
  { id: "visit", title: "방문·예약 늘리기", sample: "고객이 매장 방문이나 예약을 진행하게 합니다." },
  { id: "sale", title: "구매 늘리기", sample: "구매를 고민하는 고객이 주문이나 결제를 진행하게 합니다." },
  { id: "retain", title: "재방문 늘리기", sample: "기존 고객이 다시 방문하거나 구매하게 합니다." },
] as const;

/** 걸음 5. 콘텐츠에서 사용하지 않을 표현. */
export const FORBIDDEN_CARDS: readonly LearningCard[] = [
  { id: "hype", title: "과장 표현", sample: "무조건, 100%, 역대급 같은 과장 표현은 쓰지 않습니다." },
  { id: "pressure", title: "불안·압박 표현", sample: "지금 안 하면 손해 같은 불안과 압박을 주는 표현은 쓰지 않습니다." },
  { id: "jargon", title: "어려운 전문 용어", sample: "고객이 바로 이해하기 어려운 전문 용어와 약어는 쓰지 않습니다." },
  { id: "slang", title: "유행어·비속어", sample: "유행어, 비속어, 과한 반말은 쓰지 않습니다." },
  { id: "none", title: "별도 제한 없음", sample: "법과 플랫폼 정책을 지키는 범위에서 별도 금지 표현은 없습니다." },
] as const;

/** 걸음 6. 콘텐츠에 사용할 대표 색 조합. */
export const PALETTE_CARDS: readonly LearningCard[] = [
  { id: "navy", title: "네이비·화이트", sample: "네이비와 화이트를 중심으로 차분하고 신뢰감 있게 표현합니다." },
  { id: "black", title: "블랙·화이트", sample: "블랙과 화이트를 중심으로 간결하고 선명하게 표현합니다." },
  { id: "green", title: "그린·크림", sample: "그린과 크림을 중심으로 편안하고 자연스럽게 표현합니다." },
  { id: "blue", title: "블루·라이트 그레이", sample: "블루와 라이트 그레이를 중심으로 깨끗하고 전문적으로 표현합니다." },
  { id: "warm", title: "오렌지·베이지", sample: "오렌지와 베이지를 중심으로 따뜻하고 친근하게 표현합니다." },
] as const;

/** 걸음 7. 콘텐츠 소재 사용 권리. 추천으로 대신 선택하면 안 된다. */
export const RIGHTS_CARDS: readonly LearningCard[] = [
  { id: "owned", title: "직접 만든 자료만 사용", sample: "직접 촬영하거나 직접 작성한 사진·영상·글만 사용합니다." },
  { id: "licensed", title: "사용 허가를 받은 자료도 사용", sample: "직접 만든 자료와 저작권자에게 제작·게시 허가를 받은 자료만 사용합니다." },
] as const;

export const LEARNING_CARDS: Partial<Record<LearningSlotKey, readonly LearningCard[]>> = {
  industry: INDUSTRY_CARDS,
  audience: AUDIENCE_CARDS,
  voice: VOICE_CARDS,
  purpose: PURPOSE_CARDS,
  forbidden: FORBIDDEN_CARDS,
  palette: PALETTE_CARDS,
  rights: RIGHTS_CARDS,
};

export function learningStorageKey(workspaceId: string): string {
  return `studio_learning:${workspaceId}`;
}

export function readLearningInfo(workspaceId: string): LearningInfo {
  if (!workspaceId) return {};
  try {
    const raw = localStorage.getItem(learningStorageKey(workspaceId));
    const parsed = raw ? (JSON.parse(raw) as unknown) : null;
    if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) return {};
    return Object.fromEntries(
      Object.entries(parsed as Record<string, unknown>)
        .filter(([key, value]) => typeof value === "string" && value.trim() && LEARNING_SLOTS.some((slot) => slot.key === key)),
    ) as LearningInfo;
  } catch {
    return {};
  }
}

export function writeLearningInfo(workspaceId: string, info: LearningInfo): void {
  if (!workspaceId) return;
  try {
    localStorage.setItem(learningStorageKey(workspaceId), JSON.stringify(info));
  } catch {
    /* 저장소가 막혀 있으면 이번 화면 상태만 유지한다 */
  }
}

/** 채워진 칸 수. 헤더가 보여 주는 그 숫자다. */
export function countFilledLearningSlots(info: LearningInfo, extras: { guide?: string } = {}): number {
  const filled = LEARNING_SLOTS.filter((slot) => (info[slot.key] || "").trim()).length;
  // 저장소가 비어 있어도 브랜드 가이드가 이미 증류돼 있으면 "하는 일" 한 칸은 찬 것으로 센다.
  if (!filled && extras.guide?.trim()) return 1;
  return filled;
}

export function missingLearningSlots(info: LearningInfo): LearningSlot[] {
  return LEARNING_SLOTS.filter((slot) => !(info[slot.key] || "").trim());
}

/**
 * 고른 카드가 저장소에 남길 값.
 *
 * 2026-09-05 회장 계정 실측: 저장된 값이 `audience: "뭐부터 해야 할지 모르겠다면..."`,
 * `voice: "이거 모르면 손해예요. 진짜로요."` 였다. 카드의 견본 문장만 저장했기 때문이다.
 * 그 값이 그대로 생성 입력의 `target`(주요 고객)과 `tone`(말투)으로 들어가면,
 * 모델은 "처음 해 보는 사람"이 아니라 저 카피 한 줄을 고객으로 읽는다.
 * 이름과 견본을 함께 남겨 무엇을 고른 것인지와 그 결이 둘 다 전달되게 한다.
 */
export function cardValue(card: LearningCard): string {
  return `${card.title}. 예: ${card.sample}`;
}

/** 저장값이 이 카드인가. 견본만 저장하던 시절의 값도 같은 카드로 인정한다. */
export function isCardChosen(card: LearningCard, stored: string | undefined): boolean {
  if (!stored) return false;
  return stored === cardValue(card) || stored === card.sample;
}

export function cardById(cards: readonly LearningCard[], id: string | undefined): LearningCard | null {
  return cards.find((card) => card.id === id) ?? null;
}

/** 고른 카드에서 브랜드 가이드 증류에 보낼 답변을 만든다. 고객은 이 문장을 직접 쓰지 않는다. */
export function learningToBrandAnswers(info: LearningInfo): Record<string, string> {
  return {
    service: info.industry || "",
    target: info.audience || "",
    tone: info.voice || "",
    banned: info.forbidden || "",
    hooks: info.purpose || "",
    visual: info.palette || "",
  };
}

// 학습 정보 문답을 자동으로 띄운 적이 있는지 기억한다.
// 메모리 ref 만으로는 방을 옮길 때마다 초기화돼, 네 방 어디를 눌러도 모달이 다시 떠
// 화면을 가로막았다(2026-08-31 회장 실사용). 브라우저에 남겨 작업 공간당 한 번만 띄운다.
function learningPromptKey(workspaceId: string): string {
  return `studio_learning_prompted:${workspaceId}`;
}

export function wasLearningPrompted(workspaceId: string): boolean {
  if (!workspaceId) return true;
  try {
    return localStorage.getItem(learningPromptKey(workspaceId)) === "1";
  } catch {
    return true;
  }
}

export function markLearningPrompted(workspaceId: string): void {
  if (!workspaceId) return;
  try {
    localStorage.setItem(learningPromptKey(workspaceId), "1");
  } catch {
    // 저장 실패는 무시한다. 다음 방문에 한 번 더 뜨는 정도의 영향만 있다.
  }
}
