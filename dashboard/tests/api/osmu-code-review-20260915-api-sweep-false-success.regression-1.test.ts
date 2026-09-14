import { describe, expect, it } from "vitest";
import { classifyApiReadResponse } from "../../scripts/lib/api-sweep-contract.mjs";

describe("CODE-REVIEW-20260915-27 API 읽기 검증 거짓 성공 방지", () => {
  it("CODE-REVIEW-20260915-27 정상: JSON 200 성공 본문은 정상으로 센다", () => {
    expect(classifyApiReadResponse({
      status: 200,
      method: "GET",
      contentType: "application/json; charset=utf-8",
      bodyText: JSON.stringify({ ok: true }),
    })).toBe("정상");
  });

  it("CODE-REVIEW-20260915-27 거절: HTTP 200이어도 ok:false와 깨진 JSON은 실패로 센다", () => {
    expect(classifyApiReadResponse({
      status: 200,
      method: "GET",
      contentType: "application/json",
      bodyText: JSON.stringify({ ok: false, code: "SUBTITLE_FONT_MISSING" }),
    })).toBe("실패 본문");
    expect(classifyApiReadResponse({
      status: 200,
      method: "GET",
      contentType: "application/json",
      bodyText: "<html>오류</html>",
    })).toBe("응답 형식 오류");
  });
});
