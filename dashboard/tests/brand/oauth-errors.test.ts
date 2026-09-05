import { describe, it, expect } from "vitest";
import { escapeHtml, oauthErrorMessage } from "@/lib/oauth-errors";

describe("oauthErrorMessage", () => {
  it("Supabase Google provider disabled JSON을 사용자가 읽는 문장으로 바꾼다", () => {
    const msg = oauthErrorMessage('{"code":400,"error_code":"validation_failed","msg":"Unsupported provider: provider is not enabled"}', "Google");
    expect(msg).toContain("Google 로그인이 아직 설정되지 않았습니다");
    expect(msg).not.toContain("Unsupported provider");
    expect(msg).not.toContain("이메일로 가입");
  });

  it("Meta tester invite 미수락 에러를 조치 가능한 문장으로 바꾼다", () => {
    const msg = oauthErrorMessage("Invalid Request: The user has not accepted the invite to test the app. error_code=1349245", "Threads");
    expect(msg).toContain("이 계정은 아직 테스트 사용자 초대를 수락하지 않았습니다");
    expect(msg).toContain("Threads");
  });

  it("AR-ERROR-001 거절: 이미 변환된 초대 미수락 문장을 다시 일반 오류로 덮지 않는다", () => {
    const once = oauthErrorMessage(
      "Invalid Request: The user has not accepted the invite to test the app. error_code=1349245",
      "Threads",
    );
    expect(oauthErrorMessage(once, "Threads")).toContain(
      "이 계정은 아직 테스트 사용자 초대를 수락하지 않았습니다",
    );
  });

  it("AR-ERROR-002 거절: 분류할 수 없는 오류는 자격증명을 가리고 원문을 함께 남긴다", () => {
    const msg = oauthErrorMessage(
      "unexpected provider response access_token=secret-token-value",
      "Threads",
    );
    expect(msg).toContain("원문: unexpected provider response");
    expect(msg).toContain("access_token=[가림]");
    expect(msg).not.toContain("secret-token-value");
    expect(oauthErrorMessage(msg, "Threads")).toBe(msg);
  });

  it("Supabase env missing 에러도 raw 문자열로 노출하지 않는다", () => {
    const msg = oauthErrorMessage("supabaseUrl is required.", "Google");
    expect(msg).toContain("로그인 설정");
    expect(msg).not.toContain("supabaseUrl");
  });

  it("Supabase env missing 안내는 Google-only 정책과 맞게 'Google 로그인'을 언급하고 이메일 로그인을 언급하지 않는다", () => {
    const msg = oauthErrorMessage("supabaseUrl is required.", "Google");
    expect(msg).toContain("Google 로그인이 안 되면");
    expect(msg).not.toContain("이메일 로그인");
    expect(msg).not.toContain("이메일로 가입");
  });

  it("Meta 개발자 역할 권한 부족 에러를 조치 가능한 문장으로 바꾼다", () => {
    const msg = oauthErrorMessage("개발자 역할 권한이 부족합니다", "Instagram");
    expect(msg).toContain("앱 역할 권한을 확인하지 못했습니다");
    expect(msg).toContain("개발자, 테스터, 관리자");
    expect(msg).not.toContain("이 계정은 아직 테스트 사용자 초대를 수락하지 않았습니다");
  });

  it("AR-ERROR-003 거절: 모호한 권한 오류는 초대 미수락으로 단정하지 않고 원문을 남긴다", () => {
    const msg = oauthErrorMessage("Permissions error: request was denied", "Threads");
    expect(msg).toContain("요청 권한이 허용되지 않았습니다");
    expect(msg).toContain("원문: Permissions error: request was denied");
    expect(msg).not.toContain("이 계정은 아직 테스트 사용자 초대를 수락하지 않았습니다");
  });

  it("HTML callback에 들어갈 에러 문자열을 escape한다", () => {
    expect(escapeHtml("<script>alert(1)</script>")).toBe("&lt;script&gt;alert(1)&lt;/script&gt;");
  });
});
