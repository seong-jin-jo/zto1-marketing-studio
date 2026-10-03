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
  // 2026-09-22 교차리뷰 MINOR: "for text overlay" 는 NO_TEXT 주석이 실측한 대로
  // "text" 라는 낱말을 그림 속 글자로 그리게 한다. 뜻(카드 글자를 얹기 좋은 구도)은
  // 살리되 "text" 를 말하지 않는다.
  { id: "calm", title: "차분한 여백", hint: "글자를 얹기 좋은 넉넉한 빈 공간",
    prompt: "calm minimal composition, generous negative space, uncluttered open area" },
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
 * 글자를 부르지 않기 위해 **글자를 언급하지 않는다**.
 *
 * 2026-09-08 실측 두 번:
 *   ① "no text, no lettering" 을 넣었더니 카페 손가방에 뭉개진 상표가 박혔다.
 *   ② 더 세게 "free of any text, blank signage, no packaging labels" 로 바꿨더니
 *      오히려 탁자마다 뜻 없는 글자가 더 늘었다.
 *
 * 이 모델은 부정 지시 파라미터를 받지 않는다(비율·화질·씨앗·참조 이미지만). 부정을
 * 이해하지 못하는 모델에게 "글자 없이" 라고 말하면 남는 것은 "글자" 라는 낱말이고,
 * 모델은 그 낱말을 그린다. 그래서 금지어를 늘리는 방향이 정반대였다.
 *
 * 글자를 원하지 않으면 글자 이야기를 꺼내지 않는 것이 맞다. 대신 글자가 놓일 자리가
 * 적은 장면을 그리도록 구도만 말한다.
 */
/**
 * 2026-09-16 실측 추가(j.the.great.investor): 생성 이미지에 깨진 영문 간판 글자
 * ("hry lecimino Dry Cleening")가 박혔다. 주제가 "세탁소" 계열이었는데 그 업종에 맞는
 * `INDUSTRY_SCENES` 항목이 없어 장면 묘사가 붙지 않았고, `pickImageSubject` 가 돌려준
 * 한국어 원문이 그대로 지시문의 주인공이 됐다. 모델은 한글을 모르니 그 뜻(세탁소)만
 * 알아듣고 **간판을 지어 그리려다** 못 읽는 라틴 글자 비슷한 것을 뭉갰다.
 *
 * 위에서 이미 실측한 대로 "글자 없이·간판 없이"를 부정문으로 적으면 그 낱말 자체가
 * 더 강하게 그려진다(두 번 실측, `NO_TEXT` 아래 참고). 그래서 "간판"이라는 말을
 * 꺼내지 않고 **간판이 나올 자리 자체를 지운다** — 실외 정면(간판이 달리는 자리) 대신
 * 실내 근접 구도로 좁힌다.
 */
const NO_TEXT = "clean minimal composition, plain surfaces, natural materials, close interior framing";

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
 *
 * 2026-09-14 고친 것: **주제가 지시문에서 빠져 있었다.** 컨트롤러가 발행 대기 중인
 * 영상을 내려받아 프레임을 떠 보니, 주제가 "계약서 조건 세 가지" 인데 화면에는 손이 치즈
 * 덩어리를 만지고 있었다. 원인이 여기였다. 시각 묘사가 있으면 **그것만** 쓰고 주제를
 * 버렸는데, 그 시각 묘사는 앞선 글감 때 만들어진 것일 수 있다. 그러면 무엇을 그릴지
 * 아무도 말해 주지 않은 채로 생성기가 알아서 그린다.
 *
 * 순서를 바꾼다. **주제가 무엇을 그릴지 정하고 시각 묘사는 그것을 꾸민다.** 둘 다 있으면
 * 둘 다 싣되 주제를 앞에 둔다. 앞에 오는 말이 그림의 주인공이 된다.
 */
/**
 * 2026-09-22 실측(j.the.great.creator): `/api/studio/text` 가 낸 `image_prompt` 에
 * "a dashboard with icons and charts" 처럼 글자가 놓일 물체 이름이 그대로 들어 있었다.
 * 지시문 규격(route.ts)을 고쳐도 LLM 이 규격을 완전히 지키리라는 보장은 없다. 부정문으로
 * "화면 없이"를 더하면 위 `NO_TEXT` 주석의 실측대로 그 낱말이 오히려 더 그려진다. 그래서
 * 규격을 어기고 들어온 위험 명사를 **지시문에서 지운다** — 없던 일로 만든다.
 *
 * 2026-09-22 교차 리뷰(REQUEST_CHANGES MAJOR-4) 실측: 단순 정규식으로 낱말만 지우면
 * ①"sign/display/label/paper" 처럼 동사로도 흔한 낱말이 동사 자리에서도 지워져 술어가
 * 사라진다("A woman signs a contract" → "A woman a contract") ②지운 자리에 관사·전치사만
 * 남는다("with charts and icons" → "with and"). 그 비문이 그대로 생성기로 갔다.
 *
 * 토큰 단위로 고친다.
 * ① 동사 오탐: `sign/display/label/paper` 는 **바로 앞 낱말이 관사류(a/an/the/...)일
 *   때만** 명사로 본다 — 동사는 주어 뒤에 오지 관사 뒤에 오지 않는다("A woman signs" 의
 *   "signs" 는 앞이 "woman"이라 명사로 안 본다. "a paper menu" 의 "paper"는 앞이 "a"라
 *   명사로 본다).
 * ② 고아 관사·전치사: 명사를 지운 자리의 관사(a/the/...)·전치사(with/on/at/showing/...)는,
 *   그 뒤로 다음 전치사·구두점·문장 끝을 만날 때까지 훑어 살아남는 낱말이 하나도 없을
 *   때만 같이 지운다("and/or" 는 훑고 지나간다 — 목록을 잇는 말이라 그 앞뒤가 둘 다
 *   지워지면 "and" 도 비어야 한다). 이 연쇄를 몇 차례 반복해 잡는다.
 */
const DETERMINERS = new Set(["a", "an", "the", "this", "that", "these", "those", "some", "any", "no", "his", "her", "its", "their", "your", "my", "our"]);
const CONJUNCTIONS = new Set(["and", "or"]);
const CLAUSE_PREPOSITIONS = new Set(["with", "of", "on", "at", "in", "by", "for", "near", "onto", "into", "to", "showing", "having", "displaying", "containing"]);
const FUNCTION_WORDS: ReadonlySet<string> = new Set([...DETERMINERS, ...CONJUNCTIONS, ...CLAUSE_PREPOSITIONS]);

// 언제나 명사(글자가 놓일 물체)로 본다. 이 자리에 흔히 쓰이는 동사가 없다.
const RISKY_NOUNS = new Set([
  "screen", "screens", "monitor", "monitors", "dashboard", "dashboards", "document", "documents",
  "signage", "signboard", "signboards", "storefront", "storefronts", "icon", "icons", "chart", "charts",
  "graph", "graphs", "infographic", "infographics", "bubble", "bubbles", "notification", "notifications",
  "badge", "badges", "tag", "tags", "logo", "logos", "banner", "banners", "poster", "posters",
  "billboard", "billboards", "menu", "menus", "receipt", "receipts", "invoice", "invoices",
  "lettering", "typography", "caption", "captions", "subtitle", "subtitles", "watermark", "watermarks",
  "ui", "uis", "app", "apps", "interface", "interfaces", "website", "websites", "webpage", "webpages",
  "text", "texts",
]);

// 흔히 동사로도 쓰인다("she signs", "it displays", "he labels/papers/texts"). 바로 앞이
// 관사류일 때만 명사로 본다.
const RISKY_NOUNS_IF_AFTER_DETERMINER = new Set(["sign", "signs", "display", "displays", "label", "labels", "paper", "papers"]);

function tokenize(text: string): string[] {
  return text.match(/[A-Za-z][A-Za-z'-]*|[,.]/g) || [];
}

function joinTokens(tokens: readonly string[]): string {
  let out = "";
  for (const tok of tokens) {
    if (tok === "," || tok === ".") { out = out.trimEnd() + tok; continue; }
    out += (out ? " " : "") + tok;
  }
  return out.replace(/\s{2,}/g, " ").replace(/,\s*,/g, ",").trim();
}

/** LLM 이 규격을 어기고 낸 위험 명사를 지시문에서 지운다. 위 주석의 토큰 규칙을 따른다. */
export function stripRiskyNouns(text: string): string {
  const tokens = tokenize(text);
  const removed = new Array(tokens.length).fill(false);

  for (let i = 0; i < tokens.length; i++) {
    const word = tokens[i].toLowerCase();
    if (RISKY_NOUNS.has(word)) { removed[i] = true; continue; }
    if (RISKY_NOUNS_IF_AFTER_DETERMINER.has(word)) {
      const prevWord = i > 0 ? tokens[i - 1].toLowerCase() : "";
      if (DETERMINERS.has(prevWord)) removed[i] = true;
    }
  }

  // 관사·전치사가 고아로 남는지 훑는다. 연쇄(관사를 지우면 그 앞 전치사도 비는 경우)가
  // 있어 안정될 때까지 몇 차례 반복한다.
  for (let pass = 0; pass < 4; pass++) {
    let changed = false;
    for (let i = 0; i < tokens.length; i++) {
      if (removed[i]) continue;
      const word = tokens[i].toLowerCase();
      // 관사·전치사뿐 아니라 접속사(and/or)도 양쪽이 다 비면 고아로 남는다
      // ("charts and icons" 에서 둘 다 지워지면 "and" 도 지워야 한다).
      if (!DETERMINERS.has(word) && !CLAUSE_PREPOSITIONS.has(word) && !CONJUNCTIONS.has(word)) continue;
      let foundContent = false;
      for (let j = i + 1; j < tokens.length; j++) {
        if (removed[j]) continue;
        const next = tokens[j].toLowerCase();
        if (next === "," || next === ".") break; // 구두점 = 경계
        if (CONJUNCTIONS.has(next)) continue; // and/or 는 훑고 지나간다
        if (CLAUSE_PREPOSITIONS.has(next)) break; // 새 구가 시작되면 경계
        foundContent = true; // 살아있는 낱말(관사류 포함)을 만나면 내용이 있다고 본다
        break;
      }
      if (!foundContent) { removed[i] = true; changed = true; }
    }
    if (!changed) break;
  }

  return joinTokens(tokens.filter((_, i) => !removed[i]));
}

/** 위험 명사를 지우고 남은 말이 피사체를 잃을 만큼 빈약한지, 내용어(기능어 제외) 수로 본다. */
function isThin(text: string): boolean {
  const contentWords = tokenize(text).filter((tok) => {
    if (tok === "," || tok === ".") return false;
    return !FUNCTION_WORDS.has(tok.toLowerCase());
  });
  return contentWords.length < 2;
}

export function pickImageSubject(input: { imagePrompt?: string; topic?: string; industry?: string }): string {
  const visualRaw = (input.imagePrompt || "").trim();
  const visual = visualRaw ? stripRiskyNouns(visualRaw) : "";
  const topic = (input.topic || "").trim();
  // 주제어도 길면 문장일 가능성이 높다. 짧을 때만 쓴다.
  const usableTopic = topic && [...topic].length <= 30 ? topic : "";
  const industryScene = INDUSTRY_SCENES.find((one) => one.match.test(input.industry || ""))?.scene;
  const visualUsable = visual && !isThin(visual) ? visual : "";
  if (usableTopic && visualUsable) return `${usableTopic}. ${visualUsable}`;
  // 2026-09-22 교차 리뷰 MAJOR-1 회귀 수선: 여기 있던 "시각 묘사만 있으면 그것을 쓴다"
  // 분기가 사라지는 바람에, 주제가 없거나 30자를 넘기면(글감은 문장형이 흔하다) 위험
  // 명사가 하나도 없는 정상 image_prompt 까지 통째로 버리고 있었다. 되살린다.
  if (visualUsable) return visualUsable;
  // 규격을 어기고 온 시각 묘사가 위험 명사를 지우고 나서 빈약해지면, 피사체 없이 내보내지
  // 않고 업종 장면으로 보강한다(업종을 모르면 기존 계약대로 무난한 장면 하나만 쓴다).
  if (visualRaw && !visualUsable) return usableTopic ? `${usableTopic}. ${industryScene || "brand lifestyle scene"}` : (industryScene || "brand lifestyle scene");
  if (usableTopic) return usableTopic;
  return "brand lifestyle scene";
}

/**
 * 그림 지시문에 실을 학습 정보.
 *
 * 회장 2026-09-14: "학습정보를 잘 받아서 프롬프팅이나 하네스엔지니어링 없이도 최고의
 * 퀄리티를 만들어나가는 것." 고객은 업종·말투·목표·금지어를 이미 골라 뒀다. 그런데 그림
 * 생성에는 그중 브랜드 색 하나만 실리고 나머지는 한 번도 쓰이지 않았다. 골라 둔 것이
 * 결과에 안 나타나면 고객은 결국 지시문을 직접 만지게 된다. 그것이 이 제품이 없애려는 일이다.
 */
export type ImagePromptLearning = {
  industry?: string;
  voice?: string;
  audience?: string;
  purpose?: string;
  forbidden?: string;
  palette?: string;
};

/**
 * 학습 정보 칸은 한국어 문장으로 저장된다("동네 가게. 예: 가까운 손님이 걸어와 …").
 * 그것을 지시문에 그대로 넣으면 생성기가 그 말을 **그림 속 글자로 그린다**(브랜드 색에서
 * 이미 겪었다 — `PALETTE_COLORS` 주석). 그래서 고른 칸을 **장면 묘사**로 옮긴다.
 * 못 알아본 값은 버린다. 억지로 찍으면 고객 업종이 아닌 장면이 나간다.
 */
const INDUSTRY_SCENES: readonly { match: RegExp; scene: string }[] = [
  { match: /교육|강의|학원/, scene: "set in a bright learning space with a desk and an open notebook" },
  { match: /앱|서비스|소프트웨어/, scene: "set in a tidy modern workspace with a laptop on a clean desk" },
  { match: /식음료|카페|음식|베이커리/, scene: "set at a warm neighborhood cafe counter" },
  { match: /뷰티|미용|헤어|네일/, scene: "set in a calm beauty studio interior" },
  { match: /쇼핑몰|커머스|스토어/, scene: "set around a neatly styled product display on a table" },
  { match: /부동산|인테리어/, scene: "set in a sunlit well-kept living space" },
  { match: /운동|건강|피트니스|필라테스/, scene: "set in a clean fitness studio with natural light" },
  { match: /금융|재테크|투자/, scene: "set at a quiet desk with a notebook and a cup of coffee" },
  { match: /여행|숙박/, scene: "set in a calm travel scene with a packed bag by a window" },
  { match: /반려동물/, scene: "set in a cozy home corner arranged for a pet" },
  // "shop front"(정면 외관)는 간판이 달리는 자리라 모델이 그 위에 글자를 지어 그리려다
  // 뭉갰다(2026-09-16 실측 "hry lecimino Dry Cleening"). 정면 대신 매장 안쪽 카운터로
  // 좁혀 간판이 나올 자리 자체를 없앤다.
  { match: /동네 가게|로컬/, scene: "set at a small shop's interior counter in soft daylight" },
  { match: /세탁|드라이클리닝/, scene: "set at a tidy laundromat interior counter with folded fabrics" },
  { match: /기업|회사|B2B/i, scene: "set at a composed office meeting table" },
];

const VOICE_MOODS: readonly { match: RegExp; mood: string }[] = [
  { match: /차분/, mood: "quiet composed mood, restrained tones" },
  { match: /친하|친근/, mood: "friendly approachable mood" },
  { match: /짧고|단단/, mood: "crisp graphic mood, firm shapes" },
  { match: /전문/, mood: "precise professional mood" },
  { match: /따뜻/, mood: "warm gentle mood, soft daylight" },
  { match: /가볍|재밌|재미/, mood: "light playful mood, cheerful energy" },
];

const PURPOSE_FRAMINGS: readonly { match: RegExp; framing: string }[] = [
  { match: /알리|인지/, framing: "wide establishing framing" },
  { match: /신뢰/, framing: "close honest framing on hands at work" },
  { match: /문의|상담/, framing: "inviting framing with an open seat facing the viewer" },
  { match: /방문|예약/, framing: "welcoming entrance framing" },
  { match: /구매|판매|주문/, framing: "clear product-forward framing" },
  { match: /재방문|재구매|다시/, framing: "familiar returning-customer framing" },
];

/**
 * 쓰지 않을 표현. 그림 지시문에서 **뺀다**.
 *
 * 부정 지시("과장 없이")를 적으면 이 모델은 그 낱말을 그린다(`NO_TEXT` 주석의 두 번
 * 실측). 그래서 금지는 말로 적는 것이 아니라 **해당하는 말을 지시문에서 지우는 것**으로
 * 이행한다. 금지를 글자로 적으면 금지를 어기게 되는 역설을 피한다.
 *
 * 왼쪽(match)은 **금지 카드가 실제로 저장하는 표제**에만 맞춘다. `/과장/` 처럼 넓게 잡으면
 * "과장님" 같은 멀쩡한 말까지 금지 범주로 판정한다(교차 리뷰 2026-09-14 지적).
 */
const FORBIDDEN_TERMS: readonly { match: RegExp; drop: RegExp }[] = [
  { match: /과장 표현/, drop: /\b(dramatic|epic|extreme|hyper-?realistic|stunning|spectacular)\b/gi },
  { match: /불안·압박|압박 표현|불안과 압박/, drop: /\b(urgent|alarming|tense|anxious|ominous)\b/gi },
  { match: /전문 용어/, drop: /\b(technical diagram|schematic|infographic)\b/gi },
  { match: /유행어|비속어/, drop: /\b(meme|slang|graffiti)\b/gi },
];

/** 금지 칸이 고른 항목에 해당하는 말을 지시문에서 걷어낸다. */
export function stripForbidden(text: string, forbidden?: string): string {
  const value = (forbidden || "").trim();
  if (!value) return text;
  let out = text;
  for (const rule of FORBIDDEN_TERMS) {
    if (rule.match.test(value)) out = out.replace(rule.drop, " ");
  }
  return out.replace(/\s{2,}/g, " ").replace(/\s+\./g, ".").trim();
}

/**
 * 영상 움직임 지시문.
 *
 * 2026-09-14 이전에는 화면에서 부르는 자리에 `"subtle idle motion, gentle glow, fixed
 * camera"` 한 줄이 **박혀** 있었다. 주제도 학습 정보도 한 글자도 실리지 않았다. 그래서
 * 무엇에 관한 영상이든 같은 지시가 갔다. 움직임은 무엇이 움직이는가에 달렸으므로 주제를
 * 먼저 말하고 그 다음에 움직임을 말한다. 카메라는 계속 고정이다. 짧은 숏폼에서 카메라가
 * 움직이면 자막을 읽을 시간이 사라진다.
 */
export function buildMotionPrompt(subject: string, learning?: string | ImagePromptLearning): string {
  const info: ImagePromptLearning = typeof learning === "string" || learning == null
    ? { palette: learning ?? undefined }
    : learning;
  const parts = [subject.trim()].filter(Boolean);
  const voice = VOICE_MOODS.find((one) => one.match.test(info.voice || ""));
  if (voice) parts.push(voice.mood);
  parts.push("subtle idle motion, gentle sway and glow, fixed camera, smooth");
  return stripForbidden(parts.join(". "), info.forbidden);
}

/** 학습 정보 여러 칸을 그림이 알아듣는 장면 묘사 조각으로 옮긴다. 못 알아본 칸은 빠진다. */
export function learningVisualHints(info: ImagePromptLearning): string[] {
  const out: string[] = [];
  const industry = INDUSTRY_SCENES.find((one) => one.match.test(info.industry || ""));
  if (industry) out.push(industry.scene);
  const voice = VOICE_MOODS.find((one) => one.match.test(info.voice || ""));
  if (voice) out.push(voice.mood);
  const purpose = PURPOSE_FRAMINGS.find((one) => one.match.test(info.purpose || ""));
  if (purpose) out.push(purpose.framing);
  return out;
}

/**
 * 셋째 인자는 종전에 브랜드 색 한 칸이었다. 학습 정보 전체를 받게 넓히되 문자열도 계속
 * 받는다. 옛 호출부와 그 계약 시험이 같은 뜻으로 계속 돌아야 한다.
 */
export function buildImagePrompt(
  base: string,
  style: { id: string; custom?: string } | null,
  learning?: string | ImagePromptLearning,
): string {
  const info: ImagePromptLearning = typeof learning === "string" || learning == null
    ? { palette: learning ?? undefined }
    : learning;
  const parts = [base.trim()].filter(Boolean);
  // 학습 정보는 주제 바로 뒤에 온다. 무엇을 그릴지 다음으로 중요한 것이 어디에서 누구에게
  // 인가이고, 그 다음이 결이다.
  parts.push(...learningVisualHints(info));
  if (style) {
    if (style.id === CUSTOM_STYLE_ID) {
      const custom = (style.custom || "").trim();
      if (custom) parts.push(custom);
    } else {
      const found = IMAGE_STYLES.find((one) => one.id === style.id);
      if (found) parts.push(found.prompt);
    }
  }
  const colors = paletteToColors(info.palette);
  if (colors) parts.push(`color palette: ${colors}`);
  parts.push(NO_TEXT);
  return stripForbidden(parts.join(". "), info.forbidden);
}
