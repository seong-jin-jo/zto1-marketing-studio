import fs from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

const read = (relative: string) => fs.readFileSync(path.resolve(process.cwd(), relative), "utf8");

describe("OSMU 코드 리뷰 화면 계약", () => {
  it("시험 13: 홈과 성과실은 같은 성과 대시보드 정본만 렌더한다", () => {
    const home = read("src/app/page.tsx");
    const performance = read("src/app/performance/page.tsx");
    for (const route of [home, performance]) {
      expect(route).toContain('from "@/components/home/PerformanceDashboard"');
      expect(route).not.toContain("function PerformanceDashboard");
    }
  });

  it("시험 20과 MINOR 1, 5: 학습 이력은 별도 화면이며 스크림과 플레이어 토큰과 임의 높이가 없다", () => {
    const panel = read("src/components/home/PerformanceChatPanel.tsx");
    const detail = read("src/components/home/LearningDecisionsDialog.tsx");
    const page = read("src/app/learn/page.tsx");
    expect(panel).toContain('href={`/learn?tenant_id=');
    expect(page).toContain("<LearningDecisionsDialog");
    expect(detail).not.toContain("fixed inset-0");
    expect(detail).not.toContain("aria-modal");
    expect(detail).not.toContain("bg-player-surface");
    expect(detail).not.toContain("max-h-[");
  });

  it("시험 21과 22: 판단 근거와 저표본 경고와 승인된 선택 문구를 보존한다", () => {
    const panel = read("src/components/home/PerformanceChatPanel.tsx");
    const detail = read("src/components/home/LearningDecisionsDialog.tsx");
    expect(panel).toContain('"그렇게 해"');
    expect(panel).toContain("아니");
    expect(detail).toContain("decision.sourceLabel");
    expect(detail).toContain("decision.sampleCount");
    expect(detail).toContain("formatLearningPeriod");
    expect(detail).toContain("작업 공간의 다음 생성");
    expect(detail).toContain("근거가 아직 얇습니다");
  });

  it("시험 MINOR 4: 세로 영상 미리보기는 메타데이터까지만 선로딩한다", () => {
    expect(read("src/components/studio/PlatformPreview.tsx")).toContain('preload="metadata"');
  });
});
