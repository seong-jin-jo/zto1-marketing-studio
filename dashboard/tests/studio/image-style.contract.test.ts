import { describe, expect, it } from "vitest";
import { buildImagePrompt, paletteToColors, pickImageSubject, learningVisualHints, IMAGE_STYLES, CUSTOM_STYLE_ID } from "@/components/studio/image-style";

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
