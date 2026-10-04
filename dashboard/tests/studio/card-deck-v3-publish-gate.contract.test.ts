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
});
