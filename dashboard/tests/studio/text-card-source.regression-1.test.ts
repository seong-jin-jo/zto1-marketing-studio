import { describe, expect, it } from "vitest";
import { resolveTextCardLines } from "@/lib/studio/text-card-source";

// 2026-10-02 운영 사고(결함 C): "글자 카드로 만들기 (바로·무료)"가 구조 초안의 라벨
// ("고객이 겪는 문제" / "문제가 생기는 이유" / "바로 적용할 방법" — StudioRooms.tsx의
// STRUCTURE_CANDIDATES A안 그대로)을 카드 그림에 박았다. 실제로는 그 주제로 생성된 본문
// (quickDraft.instagram.slides)이 이미 있었는데도 그것을 쓰지 않았다. 편집실 초기
// "문구 1~3" 칸도 같은 값을 물려받는다.
//
// 2026-10-03 독립 리뷰 MAJOR-8/MINOR-f 재발 방지: 생성 본문의 "출처"를 구분하지 못하면
// ①primaryKind="text"일 때 글 전체(한 문단)가 통째로 "한 장"이 되고, ②primaryKind=
// "card"여도 instagram.caption(해시태그 섞인 긴 문장)이 슬라이드 뒤에 붙어 마지막 장이
// 캡션이 됐다. 그래서 resolveTextCardLines는 반드시 instagram.slides만(캡션 제외) 받고,
// 폴백(라벨)을 썼는지(isPlaceholder)를 돌려줘야 호출부가 "라벨만 찍힌 카드"를 막을 수
// 있다.
describe("resolveTextCardLines — 글자 카드는 라벨이 아니라 생성된 본문(슬라이드)을 우선한다", () => {
  const structureLabels = ["고객이 겪는 문제", "문제가 생기는 이유", "바로 적용할 방법"];
  // 실제 운영 결함 재현 — 주제 "글 하나를 인스타·스레드·X에 맞게 바꾸는 3단계"의 초안
  // 모양: 문제/이유/방법 슬라이드 3장 + 해시태그 섞인 긴 캡션.
  const realSlides = [
    "글 하나를 3곳에 그대로 올리면 반응이 안 온다",
    "플랫폼마다 보는 눈과 읽는 방식이 다르기 때문이다",
    "인스타는 슬라이드, 스레드는 대화체, X는 한 문장으로 쪼갠다",
  ];
  const realCaption = "글 하나로 인스타·스레드·X 전부 잡는 법 #콘텐츠전략 #1인기업 #마케팅팁 #SNS운영 #카드뉴스 #OSMU";

  it("생성된 본문(슬라이드)이 있으면 구조 라벨을 무시하고 본문을 쓴다. isPlaceholder=false", () => {
    const generated = ["초반 3초에 월 매출이 멈춘 이유를 보여준다", "재고 회전율 공식을 한 줄로", "오늘 바로 적용하는 체크리스트"];
    const result = resolveTextCardLines({
      generatedLines: generated,
      candidateOutline: structureLabels,
      quickStructureOutline: structureLabels,
    });
    expect(result.lines).toEqual(generated);
    expect(result.isPlaceholder).toBe(false);
    // 핵심 회귀 조건: 결과에 구조 라벨 문구가 섞여 나오면 안 된다.
    expect(result.lines).not.toContain("고객이 겪는 문제");
  });

  it("실물 초안 모양: 슬라이드만 쓰고 캡션은 절대 섞지 않는다(MAJOR-8)", () => {
    // 호출부(StudioRooms.tsx)는 instagram.slides만 generatedLines로 넘긴다 — 캡션은
    // 아예 인자에 넣지 않는다. 혹시라도 캡션이 slides 배열 끝에 실수로 들어오는 경우까지
    // 방어하려면 호출부 계약이 "slides만" 임을 이 테스트로 못박는다.
    const result = resolveTextCardLines({
      generatedLines: realSlides, // 캡션(realCaption)은 여기 포함하지 않는다
      candidateOutline: structureLabels,
      quickStructureOutline: null,
    });
    expect(result.lines).toEqual(realSlides);
    expect(result.lines).not.toContain(realCaption);
    expect(result.lines.some((line) => line.includes("#"))).toBe(false);
    expect(result.isPlaceholder).toBe(false);
  });

  it("생성된 본문이 아직 없으면 구조 초안(candidate) 라벨로 폴백하고 isPlaceholder=true로 표시한다(MINOR-f)", () => {
    const result = resolveTextCardLines({
      generatedLines: [],
      candidateOutline: structureLabels,
      quickStructureOutline: null,
    });
    expect(result.lines).toEqual(structureLabels);
    expect(result.isPlaceholder).toBe(true);
  });

  it("후보도 없으면 빠른 구조 선택 라벨로 폴백하고 isPlaceholder=true다", () => {
    const result = resolveTextCardLines({
      generatedLines: undefined,
      candidateOutline: undefined,
      quickStructureOutline: structureLabels,
    });
    expect(result.lines).toEqual(structureLabels);
    expect(result.isPlaceholder).toBe(true);
  });

  it("빈 줄과 자리표시 지시문은 생성 본문에서도 걸러낸다", () => {
    const result = resolveTextCardLines({
      generatedLines: ["실제 문장", "   ", "(여기에 CTA 입력하세요)"],
      candidateOutline: null,
      quickStructureOutline: null,
    });
    expect(result.lines).toEqual(["실제 문장"]);
    expect(result.isPlaceholder).toBe(false);
  });

  it("아무 것도 없으면 빈 배열이고 isPlaceholder=false다(막을 안내문이 다르다)", () => {
    const result = resolveTextCardLines({});
    expect(result.lines).toEqual([]);
    expect(result.isPlaceholder).toBe(false);
  });

  it("한 줄이 120자를 넘으면 말줄임표로 자른다(캡션급 긴 문장 방어)", () => {
    const longLine = "가".repeat(150);
    const result = resolveTextCardLines({ generatedLines: [longLine], candidateOutline: null, quickStructureOutline: null });
    expect(result.lines[0].length).toBeLessThanOrEqual(120);
    expect(result.lines[0].endsWith("…")).toBe(true);
  });
});
