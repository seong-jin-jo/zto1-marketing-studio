import { describe, it, expect, beforeEach, vi } from "vitest";
import { generateText } from "@/lib/anthropic";

// A1 키스톤 검증 — 브랜드 증류가 claude -p 하드코딩이 아니라 generateText(테넌트 키 우선·claude
// 폴백) 경로로 돈다. 셀프서브 고객이 자기 Anthropic 키만 등록해도 증류가 502 없이 동작함을 박제.

const H = vi.hoisted(() => ({
  tenantId: "tenant-1" as string | null,
  gen: "" as string, // generateText가 돌려줄 raw 텍스트
  genCalls: [] as Array<{ prompt: string; tenantId: string | null }>,
  upserts: [] as unknown[][],
}));

vi.mock("@/lib/tenant-auth", () => ({
  effectiveTenantId: vi.fn(async (_req: Request, fb?: string | null) => H.tenantId ?? fb ?? null),
}));

vi.mock("@/lib/anthropic", () => ({
  generateText: vi.fn(async (prompt: string, tenantId: string | null) => {
    H.genCalls.push({ prompt, tenantId });
    return H.gen;
  }),
}));

vi.mock("@/lib/db", () => ({
  withTenant: vi.fn(async (_tenantId: string, cb: (sql: unknown) => unknown) => {
    const sql = Object.assign(
      (_strings: TemplateStringsArray, ...vals: unknown[]) => {
        H.upserts.push(vals);
        return Promise.resolve([]);
      },
      { json: (v: unknown) => v },
    );
    return cb(sql);
  }),
}));

async function brandSetup(body: Record<string, unknown>) {
  const { POST } = await import("@/app/api/studio/brand-setup/route");
  const res = await POST(
    new Request("http://localhost/api/studio/brand-setup", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    }),
  );
  return { status: res.status, body: await res.json() };
}

beforeEach(() => {
  vi.resetModules();
  H.tenantId = "tenant-1";
  H.gen = "";
  H.genCalls = [];
  H.upserts = [];
});

describe("POST /api/studio/brand-setup — generateText 경유 증류 (A1)", () => {
  it("tenant/answers 없으면 400", async () => {
    const { status } = await brandSetup({ answers: null });
    expect(status).toBe(400);
    expect(H.genCalls).toHaveLength(0);
  });

  it("generateText가 JSON 반환 → prompt_guide 저장 + 200 (claude CLI 미사용)", async () => {
    H.gen = '여기 가이드입니다 {"prompt_guide":"친근한 반말 톤, 금지어 없음","visual_rules":{"colors":["#111"],"typography":"산세리프","forbidden":[]}}';
    const { status, body } = await brandSetup({
      tenant_id: "tenant-1",
      answers: { service: "수학 과외", target: "고등학생", tone: "친근", banned: "", hooks: "1등급", visual: "미니멀" },
    });
    expect(status).toBe(200);
    expect(body.ok).toBe(true);
    expect(body.guide.prompt_guide).toMatch(/친근한 반말 톤/);
    // 핵심: generateText가 (prompt, tenantId)로 호출됐다 = 테넌트 키 경로로 통일됨
    expect(generateText).toHaveBeenCalledTimes(1);
    expect(H.genCalls[0].tenantId).toBe("tenant-1");
    expect(H.genCalls[0].prompt).toMatch(/브랜드 가이드/);
    expect(H.upserts).toHaveLength(1);
  });

  it("generateText가 JSON 아닌 텍스트 → 실패로 응답 (저장 안 함)", async () => {
    H.gen = "죄송합니다, 출력할 수 없습니다.";
    const { status, body } = await brandSetup({
      tenant_id: "tenant-1",
      answers: { service: "x", target: "y", tone: "z", banned: "", hooks: "", visual: "" },
    });
    // 2026-09-08: 생성 실패는 502 가 아니라 200 + ok:false 로 답한다. 502 는 게이트웨이가
    // 상류에서 잘못된 응답을 받았다는 뜻이라 우리 앞의 리버스 프록시가 우리 JSON 본문을
    // 자기 HTML 오류 페이지로 갈아치웠고, 화면에는 "502" 숫자만 뜨고 진짜 이유가 한 번도
    // 사용자에게 닿지 못했다(회장 실사용). 정본 = src/lib/api-failure.ts.
    expect(status).toBe(200);
    expect(body.error).toBeTruthy();
    expect(H.upserts).toHaveLength(0);
  });
});
