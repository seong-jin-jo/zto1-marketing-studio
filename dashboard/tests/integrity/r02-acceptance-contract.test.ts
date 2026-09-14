import fs from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

const read = (relativePath: string) => fs.readFileSync(path.resolve(process.cwd(), relativePath), "utf8");

describe("R-02 AC와 TC 회귀 계약", () => {
  it("TC-A1: 로그인은 Google 단일 진입과 설정 오류의 다음 행동을 유지한다", () => {
    const login = read("src/app/login/page.tsx");
    const authRoute = read("src/app/api/auth/google/route.ts");
    const oauthErrors = read("src/lib/oauth-errors.ts");
    expect(login.match(/Google로 계속/g)).toHaveLength(1);
    expect(authRoute).toContain("NEXT_PUBLIC_SUPABASE_URL");
    expect(authRoute).toContain('oauthErrorMessage("supabaseUrl is required", "Google")');
    expect(oauthErrors).toContain("관리자에게 Supabase 설정을 확인해달라고 요청하세요");
  });

  it("TC-C1/G1/G2/G3: 홈은 DB 성과 1블록과 미연동 상태만 표시한다", () => {
    const home = read("src/components/home/PerformanceDashboard.tsx");
    const performance = read("src/components/home/PerformanceRoom.tsx");
    expect(performance.match(/성과 요약 ·/g)).toHaveLength(1);
    expect(home + performance).not.toContain(">운영 현황<");
    expect(home + performance).not.toContain(">This Week<");
    expect(home + performance).not.toContain(">발행물 성과<");
    expect(performance.match(/미수집/g)?.length || 0).toBeGreaterThanOrEqual(6);
    expect(performance).toContain("data-perf-verdict");
    expect(home).toContain("homeSummary.published");
  });

  it("TC-H1: 고객 Settings는 8개 탭을 모두 mount하는 분기를 가진다", () => {
    const settings = read("src/app/settings/page.tsx");
    for (const key of ["channels", "ai", "storage", "design", "notifications", "tokens", "keywords", "system"]) {
      expect(settings).toContain(`key: "${key}"`);
      expect(settings).toContain(`activeTab === "${key}"`);
    }
    expect(settings).toContain('t.key !== "video" || isOperator');
  });

  it("TC-M1: 홈 API는 기본 DB, 명시적 파일 롤백, 섀도우 비교를 공통 사용한다", () => {
    for (const file of [
      "src/app/api/overview/route.ts",
      "src/app/api/activity/route.ts",
      "src/app/api/weekly-report/route.ts",
      "src/app/api/weekly-summary/route.ts",
    ]) {
      const source = read(file);
      expect(source, file).toContain("homeDataSource");
      expect(source, file).toContain("logHomeShadowDiff");
      expect(source, file).toContain("homeDbUnavailable");
      expect(source, file).not.toContain('source: "file-fallback"');
    }
  });

  it("Expand: queue.json 변경 경로는 queue_posts 미러를 빠뜨리지 않는다", () => {
    const writers = [
      "src/app/api/queue/add/route.ts",
      "src/app/api/queue/[postId]/approve/route.ts",
      "src/app/api/queue/[postId]/update/route.ts",
      "src/app/api/queue/[postId]/add-image/route.ts",
      "src/app/api/queue/[postId]/variants/route.ts",
      "src/app/api/queue/bulk-approve/route.ts",
      "src/app/api/queue/[postId]/delete/route.ts",
      "src/app/api/queue/bulk-delete/route.ts",
      "src/app/api/figma/export-to-queue/route.ts",
      "src/lib/sourcing-bridge.ts",
    ];
    for (const file of writers) {
      const source = read(file);
      if (/addQueuePost/.test(source)) {
        expect(read("src/lib/queue-add.ts"), `${file} -> src/lib/queue-add.ts`).toMatch(/mirrorQueuePost/);
        continue;
      }
      expect(source, file).toMatch(/mirrorQueue(Post|Delete)/);
    }
  });
});
