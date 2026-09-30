import { describe, expect, it } from "vitest";
import {
  resolveRestoredQuickDraftTopic,
  sanitizeRestoredQuickDraftLines,
  sanitizeRestoredQuickDraftText,
  shouldInvalidateQuickDraft,
} from "@/lib/studio/quick-draft-topic";

// 2026-10-01 운영 실측(main fa66ae05): 생성실 "고른 형식의 생성 후보" 패널이 주제를
// 바꿔도 안 비워지고, 자리표시 문장("...으로 대체)")도 그대로 보였다. 이 모듈은
// main(fa66ae05)에는 존재하지 않는다 — import 단계에서 실패하는 것으로도 "수정 전"을
// 확인할 수 있다(git show fa66ae05:dashboard/src/lib/studio/quick-draft-topic.ts 는
// 존재하지 않음).
describe("생성 후보 패널 자리표시 제거", () => {
  it("괄호 지시형 어미가 든 문장은 값을 지운다(필드 전체가 아니라 그 값만)", () => {
    const text = {
      threads: "저희는 (브랜드가 실제로 제공하는 서비스 한 문장으로 대체)을 도와드리는 곳입니다.",
      x: "정상 문장입니다",
    };
    const cleaned = sanitizeRestoredQuickDraftText(text);
    expect(cleaned?.threads).toBeUndefined();
    expect(cleaned?.x).toBe("정상 문장입니다");
  });

  it("정상적인 괄호 사용은 지우지 않는다(오탐 방지)", () => {
    const text = { threads: "가격(부가세 포함) 안내", x: "무료체험(7일) 신청" };
    const cleaned = sanitizeRestoredQuickDraftText(text);
    expect(cleaned?.threads).toBe("가격(부가세 포함) 안내");
    expect(cleaned?.x).toBe("무료체험(7일) 신청");
  });

  it("shorts·instagram 중첩 필드도 같은 기준으로 걸러진다", () => {
    const text = {
      shorts: { hook: "저희는 (서비스명 입력)을 제공합니다", body: "정상 본문", cta: undefined },
      instagram: { slides: ["정상 슬라이드", "저희는 (서비스명으로 대체)입니다"], caption: "정상 캡션" },
    };
    const cleaned = sanitizeRestoredQuickDraftText(text);
    expect(cleaned?.shorts?.hook).toBeUndefined();
    expect(cleaned?.shorts?.body).toBe("정상 본문");
    expect(cleaned?.instagram?.slides).toEqual(["정상 슬라이드"]);
    expect(cleaned?.instagram?.caption).toBe("정상 캡션");
  });

  it("여러 줄 필드(영상 대본)에서 한 줄만 자리표시면 나머지 줄은 살아남는다(2026-10-01 재리뷰 BLOCK: 필드 전체를 지우면 안 된다)", () => {
    const text = {
      shorts: {
        hook: "정상 훅",
        body: "1. 도입부 정상 문장\n저희는 (브랜드가 실제로 제공하는 서비스 한 문장으로 대체)을 도와드리는 곳입니다.\n3. 마무리 정상 문장",
        cta: "정상 CTA",
      },
    };
    const cleaned = sanitizeRestoredQuickDraftText(text);
    expect(cleaned?.shorts?.body).toBe("1. 도입부 정상 문장\n3. 마무리 정상 문장");
  });

  it("null/undefined 는 그대로 통과한다", () => {
    expect(sanitizeRestoredQuickDraftText(null)).toBeNull();
    expect(sanitizeRestoredQuickDraftText(undefined)).toBeUndefined();
  });

  it("editLines 복원도 자리표시가 든 줄만 뺀다", () => {
    const lines = ["정상 줄", "저희는 (한 문장으로 대체)을 도와드리는 곳입니다.", "가격(부가세 포함)"];
    expect(sanitizeRestoredQuickDraftLines(lines)).toEqual(["정상 줄", "가격(부가세 포함)"]);
  });
});

describe("생성 후보 패널 주제 추적", () => {
  it("저장된 주제(quickDraftTopic)가 있으면 그것을 우선한다", () => {
    const topic = resolveRestoredQuickDraftTopic({ hasText: true, savedTopic: "다이어트", restoredIdea: "" });
    expect(topic).toBe("다이어트");
  });

  it("옛 저장본(주제 저장 전)은 복원 시점의 idea로 보완한다", () => {
    const topic = resolveRestoredQuickDraftTopic({ hasText: true, savedTopic: null, restoredIdea: " 다이어트 " });
    expect(topic).toBe("다이어트");
  });

  it("생성 후보가 없으면 추적할 것이 없다", () => {
    expect(resolveRestoredQuickDraftTopic({ hasText: false, savedTopic: "다이어트", restoredIdea: "다이어트" })).toBeNull();
  });

  it("주제가 바뀌면 무효화한다(trim 비교)", () => {
    expect(shouldInvalidateQuickDraft("다이어트", "새주제")).toBe(true);
    expect(shouldInvalidateQuickDraft("다이어트", " 다이어트 ")).toBe(false); // 공백 차이 오탐 방지
  });

  it("추적 값이 null이면(추적 대상 없음) 무효화하지 않는다", () => {
    expect(shouldInvalidateQuickDraft(null, "새주제")).toBe(false);
  });

  it("복원 직후 아직 도착하지 않은 빈 주제는 '지웠다'로 오판하지 않는다", () => {
    expect(shouldInvalidateQuickDraft("다이어트", "")).toBe(false);
    expect(shouldInvalidateQuickDraft("다이어트", "   ")).toBe(false);
  });
});
