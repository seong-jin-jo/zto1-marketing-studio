import { describe, expect, it } from "vitest";
import { buildImagePrompt, paletteToColors, pickImageSubject, stripRiskyNouns, learningVisualHints, IMAGE_STYLES, CUSTOM_STYLE_ID } from "@/components/studio/image-style";

// 회장 2026-09-08: "생성할 때 여러 옵션은 안 받는 거냐. 고객은 이것저것 결을 보고 선택한
// 다음 생성하고 싶어할 듯." 종전에는 결을 고를 자리가 없어 같은 글감이면 늘 같은 결만
// 나왔고, 마음에 안 들면 다시 만드는 수밖에 없었다(그만큼 돈이 나간다).
// 그리고 학습 정보의 브랜드 색은 고객이 골라 뒀는데 그림 생성에 한 번도 쓰이지 않았다.
describe("그림 지시문 조립", () => {
  it("고른 결을 글감 뒤에 붙인다", () => {
    const out = buildImagePrompt("카페 창가", { id: "warm" }, "");
    expect(out.startsWith("카페 창가")).toBe(true);
    expect(out).toContain(IMAGE_STYLES.find((s) => s.id === "warm")!.prompt);
  });

  it("브랜드 색은 한국어 문장이 아니라 색 이름으로 옮겨 싣는다", () => {
    // 2026-09-08 실측: 카드 문장을 그대로 넣었더니 생성기가 그 말을 그림 안에 글자로
    // 그렸다. 결과 이미지 상단에 "Grein · Cram" 같은 뭉개진 글자가 박혀 나왔다.
    const out = buildImagePrompt("카페 창가", { id: "photo" }, "그린·크림. 예: 그린과 크림을 중심으로 편안하게");
    expect(out).toContain("color palette: sage green and cream");
    expect(out).not.toContain("그린과 크림을 중심으로");
  });

  it("글자를 부르지 않기 위해 글자를 언급하지 않는다", () => {
    // 2026-09-08 실측 두 번. "no text" 를 넣으면 상표가 박히고, 더 세게 "blank signage"
    // 까지 넣으면 글자가 더 늘었다. 부정을 이해하지 못하는 모델에게 "글자 없이" 라고
    // 말하면 남는 것은 "글자" 라는 낱말이고 모델은 그것을 그린다.
    const out = buildImagePrompt("카페 창가", null);
    expect(out).not.toMatch(/text|letter|signage|watermark|logo|label/i);
    expect(out).toContain("plain surfaces");
  });

  it("모르는 색 표현은 억지로 넣지 않는다", () => {
    expect(paletteToColors("보라·형광")).toBe("");
  });

  it("직접 적기를 고르면 그 문장을 쓴다(준비된 카드 밖으로 나갈 수 있어야 한다)", () => {
    const out = buildImagePrompt("카페 창가", { id: CUSTOM_STYLE_ID, custom: "비 오는 날 필름 사진" }, "");
    expect(out).toContain("비 오는 날 필름 사진");
    for (const style of IMAGE_STYLES) expect(out).not.toContain(style.prompt);
  });

  it("직접 적기를 골랐는데 비어 있으면 결을 덧붙이지 않는다", () => {
    const out = buildImagePrompt("카페 창가", { id: CUSTOM_STYLE_ID, custom: "   " }, "");
    expect(out.startsWith("카페 창가")).toBe(true);
    for (const style of IMAGE_STYLES) expect(out).not.toContain(style.prompt);
  });

  it("결을 안 골랐어도 글감만으로 만든다", () => {
    expect(buildImagePrompt("카페 창가", null).startsWith("카페 창가")).toBe(true);
  });

  it("결 이름은 결과의 언어로 쓴다(모델·기법 이름 금지)", () => {
    for (const style of IMAGE_STYLES) {
      expect(style.title).not.toMatch(/soul|hailuo|v2|model|SDXL/i);
      expect(style.hint.length).toBeGreaterThan(0);
    }
  });
});

// 2026-09-08 실측 사고: 그림 지시문 자리에 카드뉴스 본문이 그대로 들어가, 생성기가 그
// 한국어 문장을 그림 속 상자와 간판에 글자로 그렸다. 뭉개진 알파벳으로 뒤덮인 쓸 수 없는
// 이미지가 나왔다. 지시문은 무엇을 그릴지를 말해야지 무엇이라고 쓸지를 말하면 안 된다.
describe("그림 주제 고르기", () => {
  // 2026-09-14 이 계약을 뒤집었다. 종전 계약은 "시각 묘사가 있으면 **그것만** 쓴다" 였고,
  // 그것이 바로 회장이 실물 영상에서 잡아낸 사고의 원인이다. 주제가 "계약서 조건 세 가지"
  // 인데 화면에는 손이 치즈 덩어리를 만지고 있었다. 시각 묘사는 앞선 글감 때 만들어진
  // 것일 수 있는데 그때 주제를 버리면 무엇을 그릴지 아무도 말해 주지 않게 된다.
  // 이제 주제가 무엇을 그릴지 정하고 시각 묘사가 그것을 꾸민다(앞에 오는 말이 주인공이다).
  it("시각 묘사가 있어도 주제를 버리지 않고 주제를 앞에 둔다", () => {
    expect(pickImageSubject({ imagePrompt: "a sunlit cafe counter", topic: "카페" }))
      .toBe("카페. a sunlit cafe counter");
  });

  it("시각 묘사가 없으면 짧은 주제어까지만 쓴다", () => {
    expect(pickImageSubject({ topic: "동네 필라테스" })).toBe("동네 필라테스");
  });

  it("본문처럼 긴 문장은 넘기지 않는다", () => {
    const body = "처음 온 고객 10명 중 9명이 같은 실수를 한다. 예약 없이 왔다가 대기 30분, 원하는 메뉴 품절, 그냥 돌아간다.";
    const out = pickImageSubject({ topic: body });
    expect(out).not.toContain("예약 없이");
    expect(out).toBe("brand lifestyle scene");
  });

  it("아무것도 없으면 무난한 장면으로 대신한다", () => {
    expect(pickImageSubject({})).toBe("brand lifestyle scene");
  });
});

// 2026-09-16 실측(j.the.great.investor): 생성 이미지에 깨진 영문 간판 글자
// ("hry lecimino Dry Cleening")가 박혔다. "동네 가게" 업종 장면이 정면 외관("shop front")을
// 그리게 했고, 정면 외관은 간판이 달리는 자리라 모델이 못 읽는 글자를 지어 그렸다.
describe("업종 장면은 간판이 나올 자리를 피한다", () => {
  it("동네 가게 장면은 정면 외관(shop front) 대신 매장 안쪽을 그린다", () => {
    const hints = learningVisualHints({ industry: "동네 가게" });
    const scene = hints.join(" ");
    expect(scene).not.toMatch(/shop front/i);
    expect(scene).toContain("interior counter");
  });

  it("세탁소·드라이클리닝 업종에도 간판 없는 실내 장면을 붙인다", () => {
    const hints = learningVisualHints({ industry: "동네 세탁소" });
    expect(hints.join(" ")).toContain("laundromat interior");
  });

  it("최종 지시문은 실외 정면 대신 실내 근접 구도를 말한다(간판이라는 낱말 없이)", () => {
    const out = buildImagePrompt("동네 세탁소 후기", null, {});
    expect(out).toContain("close interior framing");
    expect(out).not.toMatch(/text|letter|signage|watermark|logo|label|sign\b/i);
  });
});

// 2026-09-22 실측(j.the.great.creator): 힉스필드 대표 이미지가 뭉개진 영문 글자·UI
// 대시보드·태그가 가득한 범용 플랫 일러스트로 나왔다. `/api/studio/text` 규격을 고쳐도
// LLM 이 규격을 어기고 화면·아이콘·차트 같은 명사를 낼 수 있다. 그 명사는 지시문에서
// 지운다(부정문 추가가 아니라 삭제).
//
// 2026-09-22 교차 리뷰(REQUEST_CHANGES MAJOR-4): 낱말만 지우는 정규식은 ①동사로도 쓰이는
// 낱말(signs/displays/labels/papers)을 동사 자리에서도 지워 술어를 없애고 ②지운 자리에
// 관사·전치사만 남겼다("A laptop showing a with and"). 아래는 그 실측 나쁜 샘플 7개에
// 대해 실제로 돌아온 문장을 통째로 단언한다(길이·부분일치가 아니라 값 자체).
describe("위험 명사 제거", () => {
  it("명사만 지우고 동사·비문·고아 관사는 만들지 않는다(실측 7개 값 단언)", () => {
    // 명사 위치의 위험 낱말(화면·대시보드·차트·아이콘·알림뱃지·태그·UI)은 지우고, 지운
    // 자리에 남는 관사·전치사·접속사도 함께 걷어낸다.
    expect(stripRiskyNouns("A laptop screen showing a dashboard with charts and icons")).toBe("A laptop");
    expect(stripRiskyNouns("A hand holding a phone with notification badges and tags on the UI")).toBe("A hand holding a phone");
    // "signs/displays" 는 여기서 동사다(주어 뒤). 동사 자리는 손대지 않아 문장이 안 깨진다.
    expect(stripRiskyNouns("A woman signs a contract at a wooden desk, warm light")).toBe("A woman signs a contract at a wooden desk, warm light");
    expect(stripRiskyNouns("A barista displays a latte on the counter")).toBe("A barista displays a latte on the counter");
    // "paper" 는 관사 바로 뒤라 명사로 보고 지운다. 뒤 구("at a rustic table")는 안 건드린다.
    expect(stripRiskyNouns("A chef reading a paper menu at a rustic table")).toBe("A chef reading at a rustic table");
    // "screen" 은 늘 명사로 보되, 지운 자리에 진짜 명사("door")가 남으면 관사는 지우지 않는다.
    expect(stripRiskyNouns("A hand opening a screen door to a sunlit garden")).toBe("A hand opening a door to a sunlit garden");
    // "label" 은 관사 바로 뒤가 아니라("fabric" 뒤) 손대지 않는다 — 과잉 삭제보다 안전이 우선.
    expect(stripRiskyNouns("A tailor sewing a fabric label onto a linen jacket")).toBe("A tailor sewing a fabric label onto a linen jacket");
  });

  it("업종 안 물어도 명사만 지운 결과가 위험 명사를 안 담는다", () => {
    const out = pickImageSubject({ imagePrompt: "A shop sign with a logo and text, a poster on the wall", industry: "앱" });
    expect(out).not.toMatch(/logo|text|poster|dashboard|\bui\b/i);
  });

  it("명사를 지우고 남은 문장이 빈약하면(내용어 2개 미만) 업종 장면으로 보강한다", () => {
    // "A screen with a dashboard" 는 지우면 내용어가 0개(고아 관사·전치사까지 다 걷힌다).
    expect(stripRiskyNouns("A screen with a dashboard")).toBe("");
    const out = pickImageSubject({ imagePrompt: "A screen with a dashboard", industry: "카페" });
    expect(out).toBe("set at a warm neighborhood cafe counter");
  });

  it("기존 image-style 계약은 회귀 없이 그대로다", () => {
    expect(pickImageSubject({ imagePrompt: "a sunlit cafe counter", topic: "카페" }))
      .toBe("카페. a sunlit cafe counter");
  });

  it("[회귀 방지] 위험 명사가 없는 정상 image_prompt는 주제가 없거나 길어도 버려지지 않는다", () => {
    // 2026-09-22 교차 리뷰 MAJOR-1: pickImageSubject 에서 "시각 묘사만 있으면 그것을
    // 쓴다" 분기가 사라져, 주제가 없거나 30자를 넘으면 위험 명사가 전혀 없는 정상
    // image_prompt 까지 통째로 버리고 "brand lifestyle scene" 만 나가고 있었다.
    expect(pickImageSubject({ imagePrompt: "a sunlit cafe counter" })).toBe("a sunlit cafe counter");
    const longTopic = "처음 온 고객 열 명 중 아홉 명이 같은 실수를 하는 이유 세 가지, 바로 예약 없이 오는 것입니다";
    expect(pickImageSubject({ imagePrompt: "a sunlit cafe counter with fresh bread", topic: longTopic }))
      .toBe("a sunlit cafe counter with fresh bread");
  });
});
