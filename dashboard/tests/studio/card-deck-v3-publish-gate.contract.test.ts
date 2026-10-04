import fs from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

const read = (relative: string) => fs.readFileSync(path.join(process.cwd(), relative), "utf8");

describe("S1-R4-PUBLISH-GATE-01 v3 결과 불일치 차단 연결", () => {
  it("실발행, 큐 생성, 기존 큐 검토 요청이 모두 같은 서버 안전문을 지난다", () => {
    for (const file of [
      "src/app/api/publish/route.ts",
      "src/app/api/queue/[postId]/request-review/route.ts",
    ]) {
      const source = read(file);
      expect(source).toContain("draftHasCardDeckV3");
      expect(source).toContain("cardDeckV3PublishBlockedResponse");
    }
    const queueRoute = read("src/app/api/queue/add/route.ts");
    expect(queueRoute).toContain("addQueuePost");
    expect(queueRoute).toContain("cardDeckV3PublishBlockedErrorResponse");
    expect(read("src/lib/queue-add.ts")).toContain("assertDraftCanEnterPublishQueue");
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

  it("S1-R5-QUEUE-01 큐 진입 경로를 전수 열거하고 모두 공통 하위 안전문으로 닫는다", () => {
    const apiRoot = path.join(process.cwd(), "src/app/api");
    const routeFiles: string[] = [];
    const visit = (directory: string) => {
      for (const entry of fs.readdirSync(directory, { withFileTypes: true })) {
        const target = path.join(directory, entry.name);
        if (entry.isDirectory()) visit(target);
        else if (entry.name === "route.ts") {
          const source = fs.readFileSync(target, "utf8");
          if (/addQueuePost|enqueueDraft|assertDraftCanEnterPublishQueue/.test(source)) {
            routeFiles.push(path.relative(process.cwd(), target));
          }
        }
      }
    };
    visit(apiRoot);

    expect(routeFiles.sort()).toEqual([
      "src/app/api/queue/add/route.ts",
      "src/app/api/queue/promote/route.ts",
      "src/app/api/studio/commands/route.ts",
      "src/app/api/studio/drafts/[draftId]/enqueue/route.ts",
      "src/app/api/suggestions/enqueue/route.ts",
    ].sort());

    const lower = read("src/lib/queue-add.ts");
    expect(lower).toContain("assertDraftCanEnterPublishQueue");
    expect(read("src/app/api/queue/add/route.ts")).toContain("addQueuePost");
    expect(read("src/app/api/studio/drafts/[draftId]/enqueue/route.ts")).toContain("addQueuePost");
    expect(read("src/app/api/studio/commands/route.ts")).toContain("enqueueDraft");
    expect(read("src/app/api/queue/promote/route.ts")).toContain("assertDraftCanEnterPublishQueue");
    expect(read("src/app/api/suggestions/enqueue/route.ts")).toContain("addQueuePost");
  });

  it("S1-R4-HYDRATION-RACE-01·RESELECT-01 단건 응답은 로컬 편집·저장 중 덱을 덮지 않고 목록 재선택은 상세를 먼저 읽는다", () => {
    const source = read("src/app/studio/page.tsx");
    expect(source).toContain("cardDeckV3SavePendingGenerationRef.current !== null");
    expect(source).toContain("cardDeckV3DirtyRef.current");
    expect(source).toContain("const loaded = await loadDraftDetail(draft as unknown as Record<string, unknown>)");
  });

  it("S1-R5-RETURN-SNAPSHOT-01 복원 확인과 스냅샷 전송 범위를 명시한다", () => {
    const source = read("src/app/studio/page.tsx");
    expect(source).toContain('title: "기본 편집으로 돌아갈까요?"');
    expect(source).toContain('confirmLabel: "자유 배치 작업을 버리고 돌아가기"');
    expect(source).toContain('Object.prototype.hasOwnProperty.call(cardDeckV3Options, "sourceSnapshot")');
    expect(source).toContain("{ sourceSnapshot: snapshot }");
    expect(source).toContain("{ clear: true, sourceSnapshot: null");
    expect(source).toContain("cardDeckV3PendingSourceSnapshotRef");
    expect(source).toContain("includeSourceSnapshot = false");
    expect(source).toContain("await fetchDraftDetail({ id: draftIdRef.current })");
    const editRoomBranch = source.slice(source.indexOf('if (activeRoom === "edit")'), source.indexOf('if (activeRoom === "publish")'));
    expect(editRoomBranch).toContain("<ConfirmDialog");
  });

  it("S1-R5-LIST-FIRST-01 목록 데이터로 먼저 열고 상세 실패는 화면 진입을 막지 않는다", () => {
    const source = read("src/app/studio/page.tsx");
    const helperStart = source.indexOf("async function loadDraftDetail");
    const helperEnd = source.indexOf("async function resumeCurrentWork", helperStart);
    const helper = source.slice(helperStart, helperEnd);
    expect(helper.indexOf("const kind = loadDraft(draftToLoad)")).toBeGreaterThanOrEqual(0);
    expect(helper.indexOf("void fetchDraftDetail(draftToLoad)")).toBeGreaterThan(helper.indexOf("const kind = loadDraft(draftToLoad)"));
    expect(helper).toContain("return { kind }");
    expect(helper).toContain("목록 내용으로 열었습니다");
  });
});
