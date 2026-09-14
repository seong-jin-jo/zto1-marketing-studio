import { describe, expect, it } from "vitest";
import { studioFailure } from "@/lib/studio/generation/http";
import { StudioApiError } from "@/lib/studio/generation/errors";

// 우리 앞의 프록시는 5xx 응답의 본문을 자기 HTML 오류 페이지로 갈아치운다. 두 번 당했다.
// 2026-09-08 이미지 경로(502), 2026-09-09 영상 구조 초안(504). 두 번 다 **우리가 쓴 이유가
// 지워지고** 사용자는 엉뚱한 문장을 봤다. 그래서 생성기 쪽 사정은 200 으로 답하고 이유는
// 본문에 담는다. 화면은 본문의 error 를 읽으므로 사용자가 보는 것은 그대로다.
describe("프록시가 우리 이유를 지우지 못하게 한다", () => {
  const cases = [502, 503, 504];

  it.each(cases)("%i 는 200 으로 답하고 이유를 본문에 담는다", async (status) => {
    const response = studioFailure(
      new StudioApiError({ status, code: "STUDIO_LLM_TIMEOUT", message: "AI 생성 엔진의 응답 시간이 초과되었습니다" }),
    );
    expect(response.status).toBe(200);
    expect(response.headers.get("X-Studio-Status")).toBe(String(status));
    const body = await response.json() as { error?: { message?: string } };
    expect(body.error?.message).toContain("응답 시간이 초과");
  });

  it("우리 잘못인 진짜 서버 오류는 5xx 로 남긴다", async () => {
    const response = studioFailure(
      new StudioApiError({ status: 500, code: "INTERNAL_ERROR", message: "Studio 요청을 처리하지 못했습니다" }),
    );
    expect(response.status).toBe(500);
  });

  it("클라이언트 잘못은 그대로 4xx 다", () => {
    const response = studioFailure(
      new StudioApiError({ status: 400, code: "INVALID_JSON_BODY", message: "올바른 JSON 본문이 필요합니다" }),
    );
    expect(response.status).toBe(400);
  });
});
