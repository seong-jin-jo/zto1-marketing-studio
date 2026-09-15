import { beforeEach, describe, expect, it, vi } from "vitest";

const state = vi.hoisted(() => ({ output: "" }));

vi.mock("@/lib/tenant-auth", () => ({ effectiveTenantId: vi.fn(async () => "tenant-ai-contract") }));
vi.mock("@/lib/anthropic", () => ({
  generateText: vi.fn(async () => state.output),
  sharedAiApprovalErrorResponse: vi.fn(() => null),
  sharedGenerationQuotaErrorResponse: vi.fn(() => null),
}));

function post(path: string, body: unknown): Request {
  return new Request(`http://localhost${path}`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  });
}

// Regression: OSMU-CODE-REVIEW-20260916-04. 신뢰 경계 밖 모델 JSON이 타입 검사 없이
// success를 덮고 문자열 slides를 정상 응답으로 만들었다.
// Found by /qa on 2026-09-16
// Report: docs/_archive/legacy-20260912/audit/osmu-code-review-2026-09-16.md
describe("OSMU-CODE-REVIEW-20260916-04 외부 모델 출력 계약", () => {
  beforeEach(() => { state.output = ""; });

  it("정상: 허용 키와 정확한 타입의 카드뉴스, 가이드, 키워드만 성공한다", async () => {
    state.output = JSON.stringify({ slides: ["첫 장"], caption: "설명", hashtags: ["태그"] });
    const outline = await import("@/app/api/card-news/outline/route");
    expect(await (await outline.POST(post("/api/card-news/outline", { title: "주제" }))).json()).toEqual({
      success: true, slides: ["첫 장"], caption: "설명", hashtags: ["태그"],
    });

    state.output = JSON.stringify({ guide: "검증된 가이드" });
    const guide = await import("@/app/api/ai-suggest/guide/route");
    expect((await guide.POST(post("/api/ai-suggest/guide", { channel: "Threads" }))).status).toBe(200);

    state.output = "```json\n{\"keywords\":[\"첫 키워드\"]}\n```";
    const keywords = await import("@/app/api/ai-suggest/keywords/route");
    expect((await keywords.POST(post("/api/ai-suggest/keywords", { channel: "Instagram" }))).status).toBe(200);
  });

  it.each([
    JSON.stringify({ slides: "한 장", caption: "설명", hashtags: [] }),
    JSON.stringify({ slides: ["첫 장"], caption: "설명", hashtags: [], success: false }),
    JSON.stringify({ slides: [""], caption: "설명", hashtags: [] }),
  ])("거절: 잘못된 카드뉴스 모델 출력은 HTTP 502와 비성공 계약으로 닫는다", async (output) => {
    state.output = output;
    const outline = await import("@/app/api/card-news/outline/route");
    const response = await outline.POST(post("/api/card-news/outline", { title: "주제" }));
    expect(response.status).toBe(502);
    expect(await response.json()).toMatchObject({ success: false, code: "AI_OUTPUT_INVALID" });
  });
});
