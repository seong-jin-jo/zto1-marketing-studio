import { describe, it, expect, beforeEach, vi } from "vitest";

// 셀프서브 핵심 payoff E2E — 콘텐츠 생성이 (1)브랜드 톤 가이드 (2)테넌트 위키 사실을
// 실제로 프롬프트에 주입하는지 박제. 키→브랜드→생성 체인의 마지막 고리(그라운딩)를 증명.
// brand-setup.test(브랜드 생성) + integrations-anthropic-verify(키) 와 함께 셀프서브 전 경로 커버.

const H = vi.hoisted(() => ({
  tenantId: "tenant-1" as string | null,
  wiki: "" as string,
  genPrompt: "" as string,
  genTenant: undefined as string | null | undefined,
  genReturn: "" as string,
}));

vi.mock("@/lib/tenant-auth", () => ({
  effectiveTenantId: vi.fn(async (_req: Request, fb?: string | null) => H.tenantId ?? fb ?? null),
}));

vi.mock("@/lib/wiki-retrieve", () => ({
  getWikiContext: vi.fn(async () => ({ text: H.wiki, mode: H.wiki ? "full" : "none", docs: H.wiki ? 1 : 0 })),
}));

vi.mock("@/lib/anthropic", () => ({
  generateText: vi.fn(async (prompt: string, tenantId: string | null) => {
    H.genPrompt = prompt;
    H.genTenant = tenantId;
    return H.genReturn;
  }),
}));

async function studioText(body: Record<string, unknown>) {
  const { POST } = await import("@/app/api/studio/text/route");
  const res = await POST(
    new Request("http://localhost/api/studio/text", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    }),
  );
  return { status: res.status, body: await res.json() };
}

const OK_JSON = JSON.stringify({
  threads: "스레드 본문", facebook: "페이스북 전용 본문", x: "x본문",
  instagram: { caption: "ig", hashtags: ["#a"], slides: ["s1"] },
  shorts: { hook: "h", body: "b", cta: "c" }, image_prompt: "img",
});

beforeEach(() => {
  vi.resetModules();
  H.tenantId = "tenant-1";
  H.wiki = "";
  H.genPrompt = "";
  H.genTenant = undefined;
  H.genReturn = OK_JSON;
});

describe("POST /api/studio/text — 브랜드+위키 그라운딩 주입 (셀프서브 payoff)", () => {
  it("idea 없으면 400", async () => {
    const { status } = await studioText({ tenant_id: "tenant-1" });
    expect(status).toBe(400);
  });

  it("브랜드 가이드 + 위키 사실이 프롬프트에 주입되고 테넌트 키 경로로 생성", async () => {
    H.wiki = "우리 카페는 2015년 창업, 시그니처는 흑임자 라떼.";
    const { status, body } = await studioText({
      idea: "신메뉴 출시 알림",
      tenant_id: "tenant-1",
      guide: "친근한 반말 톤, 이모지 최소, 흑임자 강조",
    });
    expect(status).toBe(200);
    expect(body.ok).toBe(true);
    expect(body.threads).toBeTruthy();
    expect(body.facebook).toBe("페이스북 전용 본문");
    expect(body.facebook).not.toBe(body.threads);
    // 핵심: 브랜드 가이드 + 위키 사실이 실제로 프롬프트에 들어갔다
    expect(H.genPrompt).toContain("친근한 반말 톤");
    expect(H.genPrompt).toContain("흑임자 라떼");
    expect(H.genPrompt).toContain("지어내기 금지"); // 사실 근거 강제 문구
    expect(H.genPrompt).toContain('"facebook"');
    // 생성은 테넌트 스코프(고객 키 우선 경로)로 호출됨
    expect(H.genTenant).toBe("tenant-1");
  });

  it("V75-STUDIO-TEXT-01 정상: 선택한 A 구조와 순서를 생성 프롬프트에 반영한다", async () => {
    const { status } = await studioText({
      idea: "첫은 팀의 콘텐츠 운영",
      tenant_id: "tenant-1",
      structure: { label: "A", title: "문제 제시형", outline: ["고객이 겪는 문제", "문제가 생기는 이유", "바로 적용할 방법"] },
    });

    expect(status).toBe(200);
    expect(H.genPrompt).toContain("사용자가 고른 구조: A 문제 제시형");
    expect(H.genPrompt).toContain("고객이 겪는 문제 → 문제가 생기는 이유 → 바로 적용할 방법");
    expect(H.genPrompt).toContain("반드시 반영");
  });

  it("V75-STUDIO-TEXT-02 거절: 알 수 없는 구조는 생성기 호출 전에 400으로 막는다", async () => {
    const { status } = await studioText({
      idea: "첫은 팀의 콘텐츠 운영",
      tenant_id: "tenant-1",
      structure: { label: "D", title: "알 수 없는 구조", outline: [] },
    });

    expect(status).toBe(400);
    expect(H.genPrompt).toBe("");
  });

  it("위키 없어도(신규 테넌트) idea만으로 생성은 됨", async () => {
    H.wiki = "";
    const { status, body } = await studioText({ idea: "오픈 이벤트", tenant_id: "tenant-1" });
    expect(status).toBe(200);
    expect(body.ok).toBe(true);
    expect(H.genPrompt).not.toContain("위키 참조");
  });

  it("생성 결과가 JSON 아니면 502", async () => {
    H.genReturn = "죄송합니다 출력 불가";
    const { status } = await studioText({ idea: "x", tenant_id: "tenant-1" });
    expect(status).toBe(502);
  });
});
