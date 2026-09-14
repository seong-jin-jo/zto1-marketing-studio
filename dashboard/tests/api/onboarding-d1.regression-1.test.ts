import { beforeEach, describe, expect, it, vi } from "vitest";

// Regression: OSMU-BLOCK-D1. API가 wikiCount를 계산하면서도 체크리스트 계약에는
// 브랜드 문서 상태를 내리지 않던 결함.
// Found by 교차 모델 검수 on 2026-08-28.
// Report: docs/_archive/legacy-20260912/audit/osmu-cross-review-2026-08-28-opus.md

const H = vi.hoisted(() => ({ wikiCount: 0 }));

vi.mock("@/lib/tenant-auth", () => ({
  effectiveTenantId: vi.fn(async () => "cd1d0a40-540d-4524-9b49-bf2445d82182"),
}));
vi.mock("@/lib/tenant-context", () => ({ runWithTenant: vi.fn((_tenantId: string, fn: () => unknown) => fn()) }));
vi.mock("@/lib/file-io", () => ({
  readJson: vi.fn(() => ({ onboardingComplete: true, analyticsViewed: false })),
  writeJson: vi.fn(), readText: vi.fn(), writeText: vi.fn(), dataPath: vi.fn((v: string) => v),
  configPath: vi.fn((v: string) => v), sharedDataPath: vi.fn((v: string) => v),
}));
vi.mock("@/lib/db", () => ({
  withTenant: vi.fn(async (_tenantId: string, callback: (sql: unknown) => unknown) => {
    let call = 0;
    const sql = () => {
      call += 1;
      if (call === 1) return Promise.resolve([{ c: H.wikiCount }]);
      return Promise.resolve([{ c: 0 }]);
    };
    return callback(sql);
  }),
}));

beforeEach(() => { H.wikiCount = 0; });

describe("온보딩 브랜드 문서 API 회귀", () => {
  it("OSMU-BLOCK-D1 정상: 브랜드 문서가 있으면 checklist.wiki가 true다", async () => {
    H.wikiCount = 2;
    const { GET } = await import("@/app/api/onboarding/route");
    const response = await GET(new Request("http://localhost/api/onboarding"));
    const body = await response.json();
    expect(body.checklist.wiki).toBe(true);
  });

  it("OSMU-BLOCK-D1 거절: 브랜드 문서가 없으면 완료로 꾸미지 않는다", async () => {
    const { GET } = await import("@/app/api/onboarding/route");
    const response = await GET(new Request("http://localhost/api/onboarding"));
    const body = await response.json();
    expect(body.checklist.wiki).toBe(false);
  });
});
