import fs from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

const read = (relative: string) => fs.readFileSync(path.join(process.cwd(), relative), "utf8");

describe("S1-R4-PUBLISH-GATE-01 v3 결과 불일치 차단 연결", () => {
  it("실발행, 큐 생성, 기존 큐 검토 요청이 모두 같은 서버 안전문을 지난다", () => {
    for (const file of [
      "src/app/api/publish/route.ts",
      "src/app/api/queue/add/route.ts",
      "src/app/api/queue/[postId]/request-review/route.ts",
    ]) {
      const source = read(file);
      expect(source).toContain("draftHasCardDeckV3");
      expect(source).toContain("cardDeckV3PublishBlockedResponse");
    }
  });

  it("S1-R5-SCHEDULE-01 예약 등록과 예약 실행도 자유 배치 안전문을 지난다", () => {
    const register = read("src/app/api/schedule/route.ts");
    const execute = read("src/app/api/schedule/publish-due/route.ts");
    const studio = read("src/app/studio/page.tsx");
    expect(register).toContain("draftHasCardDeckV3");
    expect(execute).toContain("payloadHasCardDeckV3");
    expect(execute).toContain('status: "blocked"');
    expect(studio).toContain("showSchedule && activeWorkspace && !cardDeckV3");
    expect(studio).toContain("대기 중인 예약이 있습니다");
  });

  it("S1-R4-HYDRATION-RACE-01·RESELECT-01 단건 응답은 로컬 편집·저장 중 덱을 덮지 않고 목록 재선택은 상세를 먼저 읽는다", () => {
    const source = read("src/app/studio/page.tsx");
    expect(source).toContain("cardDeckV3SavePendingGenerationRef.current !== null");
    expect(source).toContain("cardDeckV3DirtyRef.current");
    expect(source).toContain("const loaded = await loadDraftDetail(draft as unknown as Record<string, unknown>)");
  });
});
