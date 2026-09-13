import { describe, expect, it } from "vitest";
import {
  buildImagePrompt,
  buildMotionPrompt,
  learningVisualHints,
  pickImageSubject,
  stripForbidden,
  CUSTOM_STYLE_ID,
} from "@/components/studio/image-style";

// 2026-09-14 실측: 주제가 "계약서 조건 세 가지" 이고 학습 정보가 업종 동네 가게 · 말투
// 따뜻하게 · 목표 상담 문의인데, 만들어진 영상에는 손이 치즈 덩어리를 만지는 장면이
// 나왔다. 주제도 학습 정보도 그림 지시문에 실리지 않았기 때문이다.
//
// 회장이 못박은 목표: "학습정보를 잘 받아서 프롬프팅이나 하네스엔지니어링 없이도 최고의
// 퀄리티를 만들어나가는 것." 고객이 골라 둔 것이 결과에 안 나타나면 고객은 결국 지시문을
// 직접 만지게 되고, 그것이 이 제품이 없애려는 일이다.
const 학습정보 = {
  industry: "동네 가게. 예: 가까운 손님이 걸어와 이용하는 곳",
  voice: "따뜻하게. 예: 오늘 하루도 고생하셨습니다",
  purpose: "문의 늘리기. 예: 관심 있는 고객이 상담이나 문의를 시작하게 합니다",
  forbidden: "과장 표현. 예: 무조건, 100%, 역대급 같은 과장 표현은 쓰지 않습니다",
  palette: "그린·크림. 예: 그린과 크림을 중심으로 편안하게",
};

describe("그림 지시문에 주제를 싣는다", () => {
  it("시각 묘사가 있어도 주제를 버리지 않는다 — 주제가 앞에 온다", () => {
    // 종전 동작: 시각 묘사가 있으면 그것만 쓰고 주제를 버렸다. 그 묘사가 앞선 글감 때
    // 만들어진 것이면 무엇을 그릴지 아무도 말해 주지 않은 상태가 된다(치즈 사고).
    const subject = pickImageSubject({ imagePrompt: "hands holding a block of cheese", topic: "계약서 조건 세 가지" });
    expect(subject).toContain("계약서 조건 세 가지");
    expect(subject.indexOf("계약서")).toBeLessThan(subject.indexOf("hands"));
  });

  it("주제만 있어도 싣고, 본문처럼 긴 글은 싣지 않는다", () => {
    expect(pickImageSubject({ topic: "동네 필라테스" })).toBe("동네 필라테스");
    const 본문 = "처음 온 고객 10명 중 9명이 같은 실수를 한다는 사실을 아시나요 오늘은 그 이야기를 해 보겠습니다";
    expect(pickImageSubject({ topic: 본문 })).toBe("brand lifestyle scene");
  });

  it("최종 지시문에 주제와 학습 정보가 함께 실린다", () => {
    const out = buildImagePrompt(
      pickImageSubject({ imagePrompt: "hands holding a block of cheese", topic: "계약서 조건 세 가지" }),
      { id: "photo" },
      학습정보,
    );
    expect(out).toContain("계약서 조건 세 가지");
    expect(out).toContain("neighborhood shop");   // 업종
    expect(out).toContain("warm gentle mood");     // 말투
    expect(out).toContain("inviting framing");     // 목표
    expect(out).toContain("color palette: sage green and cream"); // 브랜드 색
  });

  it("학습 정보의 한국어 문장 자체는 지시문에 넘기지 않는다", () => {
    // 한국어를 그대로 넘기면 생성기가 그 말을 그림 속 글자로 그린다(2026-09-08 실측).
    const out = buildImagePrompt("계약서 조건 세 가지", { id: "photo" }, 학습정보);
    expect(out).not.toContain("가까운 손님이 걸어와");
    expect(out).not.toContain("오늘 하루도 고생하셨습니다");
    expect(out).not.toContain("그린과 크림을 중심으로");
  });

  it("못 알아본 칸은 억지로 찍지 않고 뺀다", () => {
    expect(learningVisualHints({ industry: "우주 정거장 운영" })).toEqual([]);
  });

  it("금지 표현은 말로 적지 않고 지시문에서 뺀다", () => {
    // 부정 지시를 적으면 이 모델은 그 낱말을 그린다. 금지를 글자로 적으면 금지를 어긴다.
    const out = buildImagePrompt("계약서 조건 세 가지", { id: CUSTOM_STYLE_ID, custom: "dramatic stunning hero shot" }, 학습정보);
    expect(out).not.toMatch(/\bdramatic\b/i);
    expect(out).not.toMatch(/\bstunning\b/i);
    expect(out).not.toContain("과장");
    expect(out).toContain("hero shot");
  });

  it("금지 칸이 비면 아무것도 빼지 않는다", () => {
    expect(stripForbidden("dramatic hero shot", "")).toBe("dramatic hero shot");
  });

  it("옛 호출부처럼 브랜드 색 문자열만 넘겨도 같은 뜻으로 동작한다", () => {
    const out = buildImagePrompt("카페 창가", { id: "warm" }, "그린·크림. 예: 그린과 크림");
    expect(out).toContain("color palette: sage green and cream");
  });
});

describe("영상 움직임 지시문", () => {
  it("주제와 말투를 싣고 카메라는 고정한다", () => {
    // 종전에는 "subtle idle motion, gentle glow, fixed camera" 한 줄이 화면 코드에 박혀
    // 있어 무엇에 관한 영상이든 같은 지시가 갔다.
    const out = buildMotionPrompt("계약서 조건 세 가지", 학습정보);
    expect(out.startsWith("계약서 조건 세 가지")).toBe(true);
    expect(out).toContain("warm gentle mood");
    expect(out).toContain("fixed camera");
  });

  it("금지 표현은 움직임 지시문에서도 뺀다", () => {
    const out = buildMotionPrompt("dramatic 계약서 조건", 학습정보);
    expect(out).not.toMatch(/\bdramatic\b/i);
  });
});
