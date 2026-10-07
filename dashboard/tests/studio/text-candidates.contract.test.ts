import { beforeEach, describe, expect, it, vi } from "vitest";

const generateText = vi.fn();

vi.mock("@/lib/anthropic", () => ({
  generateText,
  sharedGenerationQuotaErrorResponse: () => null,
  sharedAiApprovalErrorResponse: () => null,
}));
vi.mock("@/lib/tenant-auth", () => ({ effectiveTenantId: vi.fn(async () => "tenant-1") }));
vi.mock("@/lib/wiki-retrieve", () => ({ getWikiContext: vi.fn(async () => ({ text: "수능 100일" })) }));
vi.mock("@/lib/github", () => ({ fetchRepoFile: vi.fn() }));
vi.mock("@/lib/studio/learned-rules-context", () => ({ getLearnedRulesContext: vi.fn(async () => "친근한 존댓말") }));

function candidate(id: "question" | "number" | "pain", threads: string, recommended = false) {
  return {
    id,
    label: id === "question" ? "질문형" : id === "number" ? "숫자형" : "고통 인식형",
    recommended,
    recommendation_reason: "Threads에서 읽기 쉬운 첫 문장입니다",
    content: {
      threads,
      facebook: threads,
      x: threads,
      instagram: { caption: threads, hashtags: ["수능"], slides: [threads] },
      shorts: { hook: `${threads} 훅`, body: `${threads} 본문`, cta: `${threads} CTA` },
      image_prompt: `Editorial image about ${id}`,
    },
  };
}

describe("POST /api/studio/text S7 후보 계약", () => {
  beforeEach(() => generateText.mockReset());

  it("S7-AC1 세 각도를 한 응답에 유지하고 서버 계산 경고와 기존 최상위 필드를 함께 돌려준다", async () => {
    generateText.mockResolvedValue(JSON.stringify({
      text_candidates: [
        candidate("question", "수능 100일, 지금 무엇을 바꿔야 할까요?", true),
        candidate("number", "90일 안에 바꾸는 세 가지"),
        candidate("pain", "계획은 세웠는데 매일 흔들리시나요?"),
      ],
    }));
    const { POST } = await import("@/app/api/studio/text/route");
    const response = await POST(new Request("http://localhost/api/studio/text", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ idea: "수능 100일 공부 계획", structure: { label: "A", title: "문제 제시", outline: ["100일 계획"] }, card_template_id: "headline_cover" }),
    }));
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body.ok).toBe(true);
    expect(body.text_candidates.map((item: { id: string }) => item.id)).toEqual(["question", "number", "pain"]);
    expect(body.text_candidates[1].warnings).toEqual(expect.arrayContaining([
      expect.objectContaining({ code: "fact_mismatch", terms: ["90일"] }),
    ]));
    expect(body.threads).toBe(body.text_candidates[0].content.threads);
    expect(body.recommended_text_candidate_id).toBe("question");
    expect(body.card_template_id).toBe("headline_cover");
    expect(generateText).toHaveBeenCalledWith(expect.stringContaining("큰 제목 표지형 (headline_cover)"), "tenant-1");
    const prompt = generateText.mock.calls[0]?.[0] as string;
    expect(prompt.match(/"shorts"/g)).toHaveLength(3);
    expect(prompt.match(/"image_prompt"/g)).toHaveLength(3);
  });

  it("하위 호환: 후보 배열이 없는 기존 생성기 응답은 종전 최상위 계약 그대로 통과한다", async () => {
    generateText.mockResolvedValue(JSON.stringify({
      threads: "기존 Threads",
      facebook: "기존 Facebook",
      x: "기존 X",
      instagram: { caption: "기존 IG", hashtags: [], slides: ["첫 장"] },
    }));
    const { POST } = await import("@/app/api/studio/text/route");
    const response = await POST(new Request("http://localhost/api/studio/text", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ idea: "기존 호출" }),
    }));
    const body = await response.json();
    expect(body).toMatchObject({ ok: true, threads: "기존 Threads", x: "기존 X" });
    expect(body.text_candidates).toBeUndefined();
  });

  it("거절 조건: 세 각도 중 하나가 빠지면 깨진 후보를 본문으로 저장하지 않는다", async () => {
    generateText.mockResolvedValue(JSON.stringify({ text_candidates: [candidate("question", "질문", true)] }));
    const { POST } = await import("@/app/api/studio/text/route");
    const response = await POST(new Request("http://localhost/api/studio/text", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ idea: "계약 위반" }),
    }));
    // 상류 실패는 프록시가 본문을 HTML로 바꾸지 않도록 200 + ok:false 계약을 쓴다.
    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toMatchObject({ ok: false, error: expect.stringContaining("후보 3개 계약") });
  });

  it("S7-R1-M5 거절: 어느 후보든 영상 대본이나 이미지 프롬프트가 빠지면 생성 전체를 거절한다", async () => {
    const broken = candidate("number", "100일 계획");
    delete (broken.content as Partial<typeof broken.content>).shorts;
    delete (broken.content as Partial<typeof broken.content>).image_prompt;
    generateText.mockResolvedValue(JSON.stringify({
      text_candidates: [
        candidate("question", "수능 100일, 지금 무엇을 바꿔야 할까요?", true),
        broken,
        candidate("pain", "계획은 세웠는데 매일 흔들리시나요?"),
      ],
    }));
    const { POST } = await import("@/app/api/studio/text/route");
    const response = await POST(new Request("http://localhost/api/studio/text", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ idea: "수능 100일 공부 계획" }),
    }));

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toMatchObject({ ok: false, error: expect.stringContaining("후보 3개 계약") });
  });

  it("S7-R1-B1 거절: 알 수 없는 카드 템플릿 ID는 생성기를 호출하지 않는다", async () => {
    const { POST } = await import("@/app/api/studio/text/route");
    const response = await POST(new Request("http://localhost/api/studio/text", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ idea: "잘못된 템플릿", card_template_id: "unknown" }),
    }));
    expect(response.status).toBe(400);
    expect(generateText).not.toHaveBeenCalled();
  });
});
