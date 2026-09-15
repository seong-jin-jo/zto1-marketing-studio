import { readFileSync } from "node:fs";
import { resolve } from "node:path";
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

  // Regression: API-READ-ALL-V12 — 긴 정상 JSON을 미리보기 길이로 먼저
  // 자르면 JSON.parse가 실패해 정상 Route Handler를 고장으로 오판했다.
  // Found by /qa on 2026-09-15
  // Report: docs/qa/osmu-api-read-sweep-v12-gpt-codex.md
  it("API-READ-ALL-V12 긴 JSON을 미리보기 길이로 자르기 전에 판정한다", () => {
    const script = readFileSync(resolve(process.cwd(), "scripts/verify-api-read-sweep.mjs"), "utf8");

    expect(script).toContain("const fullBody = await response.text()");
    expect(script).toContain("bodyText: fullBody");
    expect(script).toContain('safeBody.replace(/\\s+/g, " ").slice(0, 220)');
    expect(script).not.toContain("bodyText: body,");
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

  // Regression: OSMU-CODE-REVIEW-20260916-11. success:false, 최상위 error와 빈 배열을
  // HTTP 200이라는 이유만으로 정상에 더했다.
  // Found by /qa on 2026-09-16
  // Report: docs/_archive/legacy-20260912/audit/osmu-code-review-2026-09-16.md
  it.each([
    [JSON.stringify({ success: false, error: "고장" }), "실패 본문"],
    [JSON.stringify({ error: "고장" }), "실패 본문"],
    [JSON.stringify([]), "응답 구조 오류"],
  ])("OSMU-CODE-REVIEW-20260916-11 거절: 오류 JSON %s를 정상으로 세지 않는다", (bodyText, expected) => {
    expect(classifyApiReadResponse({ status: 200, method: "GET", contentType: "application/json", bodyText })).toBe(expected);
  });

  it("OSMU-CODE-REVIEW-20260916-12 정상: 검증기는 health 실행 커밋과 현재 HEAD 일치를 강제한다", () => {
    const script = readFileSync(resolve(process.cwd(), "scripts/verify-api-read-sweep.mjs"), "utf8");
    const health = readFileSync(resolve(process.cwd(), "src/app/api/health/route.ts"), "utf8");
    expect(health).toContain("build_commit: BUILD_COMMIT");
    expect(script).toContain("serverBuildCommit === gitCommit");
    expect(script).toContain("!buildCommitMatches");
  });
});
