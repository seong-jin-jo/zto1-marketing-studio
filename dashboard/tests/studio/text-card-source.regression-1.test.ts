import { describe, expect, it } from "vitest";
import { resolveTextCardLines } from "@/lib/studio/text-card-source";

// 2026-10-02 운영 사고(결함 C): "글자 카드로 만들기 (바로·무료)"가 구조 초안의 라벨
// ("고객이 겪는 문제" / "문제가 생기는 이유" / "바로 적용할 방법" — StudioRooms.tsx의
// STRUCTURE_CANDIDATES A안 그대로)을 카드 그림에 박았다. 실제로는 그 주제로 생성된 본문
// (quickDraft.instagram.slides + caption)이 이미 있었는데도 그것을 쓰지 않았다. 편집실
// 초기 "문구 1~3" 칸도 같은 값을 물려받는다. 이 함수가 없던 커밋(수정 전)에는 이 import
// 자체가 실패하고, StudioRooms.tsx의 makeTextCards()는 candidateOutline/quickStructureOutline
// 라벨을 생성 본문보다 먼저 집어 이 테스트가 실패한다.
describe("resolveTextCardLines — 글자 카드는 라벨이 아니라 생성된 본문을 우선한다", () => {
  const structureLabels = ["고객이 겪는 문제", "문제가 생기는 이유", "바로 적용할 방법"];

  it("생성된 본문이 있으면 구조 라벨을 무시하고 본문을 쓴다", () => {
    const generated = ["초반 3초에 월 매출이 멈춘 이유를 보여준다", "재고 회전율 공식을 한 줄로", "오늘 바로 적용하는 체크리스트"];
    const lines = resolveTextCardLines({
      generatedLines: generated,
      candidateOutline: structureLabels,
      quickStructureOutline: structureLabels,
    });
    expect(lines).toEqual(generated);
    // 핵심 회귀 조건: 결과에 구조 라벨 문구가 섞여 나오면 안 된다.
    expect(lines).not.toContain("고객이 겪는 문제");
  });

  it("생성된 본문이 아직 없으면 구조 초안(candidate) 라벨로 폴백한다", () => {
    const lines = resolveTextCardLines({
      generatedLines: [],
      candidateOutline: structureLabels,
      quickStructureOutline: null,
    });
    expect(lines).toEqual(structureLabels);
  });

  it("후보도 없으면 빠른 구조 선택 라벨로 폴백한다", () => {
    const lines = resolveTextCardLines({
      generatedLines: undefined,
      candidateOutline: undefined,
      quickStructureOutline: structureLabels,
    });
    expect(lines).toEqual(structureLabels);
  });

  it("빈 줄과 자리표시 지시문은 생성 본문에서도 걸러낸다", () => {
    const lines = resolveTextCardLines({
      generatedLines: ["실제 문장", "   ", "(여기에 CTA 입력하세요)"],
      candidateOutline: null,
      quickStructureOutline: null,
    });
    expect(lines).toEqual(["실제 문장"]);
  });

  it("아무 것도 없으면 빈 배열이다", () => {
    expect(resolveTextCardLines({})).toEqual([]);
  });
});
