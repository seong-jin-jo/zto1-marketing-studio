import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { SCHEDULABLE_PLATFORMS, SCHEDULABLE_PLATFORM_LABELS } from "../../src/lib/constants";

// AuthGate는 React 컴포넌트라 풀 렌더 하네스 없이도 회귀를 잡아야 하는 안전계약이 있다.
// Codex 2nd-pass 반려: gateStatus="checking" 중에도 children이 mount됐고, /api/me 401/403/5xx/네트워크
// 오류를 전부 "ok"로 fail-open 처리했다(승인/정지 게이트를 통째로 우회 가능했음). 소스 기반 계약 테스트로
// "그 fail-open 패턴이 다시 들어오지 않는지"를 고정한다(리액트 렌더 테스트가 아니라 텍스트 계약).
const SRC = readFileSync(resolve(__dirname, "../../src/components/shared/AuthGate.tsx"), "utf-8");

describe("AuthGate — fail-open 회귀 방지 계약(소스 기반)", () => {
  it("poll()의 401 분기는 역할별 재인증으로 닫히고 ok로 fail-open하지 않는다", () => {
    const branch = SRC.match(/res\.status === 401([\s\S]{0,240})return;/)?.[1] || "";
    expect(branch).toContain("reauthenticateCurrentIdentity");
    expect(branch).not.toContain('setGateStatus("ok")');
  });

  // 2026-09-05: 상태 검사가 서버 오류로 한 번 실패했다고 곧장 화면을 막지는 않는다.
  // 배포 중 컨테이너 재시작으로 한 번 실패하자 작업 화면이 통째로 덮였고, 바로 뒤 같은
  // 토큰으로 부르면 정상이었다. 그래서 5xx 만 한 번 더 물어본다. 그러나 fail-open 은
  // 여전히 금지다. 재시도까지 실패하면 반드시 service_error 로 닫혀야 한다.
  it("poll()의 응답 실패 분기는 재시도 뒤에도 실패하면 service_error로 닫고 ok로 fail-open하지 않는다", () => {
    const guard = SRC.match(/if \(!statusRes\.ok\) \{\s*setVerifiedAccessKey\(requestAccessKey\);\s*setGateStatus\("service_error"\);/);
    expect(guard, "응답이 실패로 남으면 service_error 로 닫는 자리가 있어야 한다").toBeTruthy();
    // 재시도는 서버 오류에만 허용한다. 권한 거부까지 다시 물으면 막아야 할 것을 늦게 막는다.
    expect(SRC).toContain("statusRes.status >= 500");
    // 실패 응답을 받고 곧바로 통과시키는 자리가 없어야 한다.
    const failBlock = SRC.slice(SRC.indexOf("let statusRes = res;"), SRC.indexOf("const data = await statusRes.json()"));
    expect(failBlock).not.toContain('setGateStatus("ok")');
  });

  it("poll()의 catch(네트워크 오류) 분기는 service_error로 설정하고 ok로 fail-open하지 않는다", () => {
    const pollBlock = SRC.slice(SRC.indexOf("async function poll"), SRC.indexOf("const id = setInterval"));
    const catchStart = pollBlock.lastIndexOf("} catch");
    const catchBlock = pollBlock.slice(catchStart, catchStart + 420);
    expect(catchBlock).toContain("setVerifiedAccessKey(requestAccessKey)");
    expect(catchBlock).toContain('setGateStatus("service_error")');
    expect(catchBlock).not.toContain('setGateStatus("ok")');
  });

  it("checking 상태는 children/Sidebar를 mount하는 return보다 먼저 명시적으로 처리된다(fail-open 방지)", () => {
    const checkingIdx = SRC.indexOf('gateStatus === "checking"');
    const sidebarMountIdx = SRC.lastIndexOf("<Sidebar />");
    expect(checkingIdx).toBeGreaterThan(-1);
    expect(sidebarMountIdx).toBeGreaterThan(-1);
    expect(checkingIdx).toBeLessThan(sidebarMountIdx);
  });

  it("auth_error/service_error 상태도 Sidebar mount(children 진입)보다 먼저 분기된다", () => {
    const authErrIdx = SRC.indexOf('gateStatus === "auth_error"');
    const svcErrIdx = SRC.indexOf('gateStatus === "service_error"');
    const sidebarMountIdx = SRC.lastIndexOf("<Sidebar />");
    expect(authErrIdx).toBeGreaterThan(-1);
    expect(svcErrIdx).toBeGreaterThan(-1);
    expect(authErrIdx).toBeLessThan(sidebarMountIdx);
    expect(svcErrIdx).toBeLessThan(sidebarMountIdx);
  });

  it("로그아웃은 JWT 고객이면 Supabase auth.signOut()을 호출한 뒤 로컬 토큰을 지운다", () => {
    const logoutBlock = SRC.slice(SRC.indexOf("const doLogout"), SRC.indexOf("const doRefresh"));
    expect(logoutBlock).toMatch(/getAuthIdentityKind\(\) === "customer"/);
    expect(logoutBlock).toMatch(/isCustomerAuthToken\(t\)/);
    expect(logoutBlock).toMatch(/\.auth\.signOut\(\)/);
    expect(logoutBlock).toMatch(/clearAuthToken\(\)/);
  });

  it("GateStatus 타입에 auth_error/service_error가 명시적으로 존재한다", () => {
    expect(SRC).toMatch(/type GateStatus = [^;]*"auth_error"[^;]*"service_error"/);
  });

  it("operator /api/me 응답은 children을 열기 전에 persisted customer workspace를 지운다", () => {
    const pollBlock = SRC.slice(SRC.indexOf("async function poll"), SRC.indexOf("const id = setInterval"));
    const operatorClearIdx = pollBlock.indexOf("data.isOperator");
    const workspaceClearIdx = pollBlock.indexOf("setActiveWorkspace(null)");
    const gateOpenIdx = pollBlock.indexOf('setGateStatus("ok")');

    expect(operatorClearIdx).toBeGreaterThan(-1);
    expect(workspaceClearIdx).toBeGreaterThan(operatorClearIdx);
    expect(gateOpenIdx).toBeGreaterThan(workspaceClearIdx);
  });
});

// 랜딩 카피 정직성 계약 — 현재 실제 정책(OSMU v1.0.0 공개 대시보드, 가입 즉시 계정 이용 가능,
// 공유 AI 생성만 운영자 승인 또는 BYO 키 필요, quota 내 무료)과 맞지 않는 과장 문구
// ("100% 무료 — 모든 기능 제한 없음", "20+ 채널 동시 발행", "무제한 채널 연결",
// "운영자 승인 후에만 계정 이용 가능"류 구 정책 문구)가 다시 들어오지 않는지 소스 텍스트로 고정한다.
describe("AuthGate — 랜딩 카피 정직성 계약(공개 대시보드 + 공유 AI 승인 entitlement 정책 정합)", () => {
  it("금지 문구(무제한 무료/기능 제한 없음 주장)가 남아있지 않다", () => {
    expect(SRC).not.toMatch(/100%\s*무료/);
    expect(SRC).not.toMatch(/모든\s*기능\s*제한\s*없음/);
    expect(SRC).not.toMatch(/모든\s*기능(이|을)?\s*무료/);
    expect(SRC).not.toMatch(/무제한\s*채널/);
    expect(SRC).not.toMatch(/무료로\s*시작하기/);
  });

  it("금지 문구(과장된 채널 수 주장: 20+/20개 이상)가 남아있지 않다", () => {
    expect(SRC).not.toMatch(/20\+\s*채널/);
    expect(SRC).not.toMatch(/20개\s*이상의?\s*채널/);
  });

  it("배지는 베타 운영 중 + 가입 즉시 이용 가능함을 정직하게 표시한다(승인형 계정 게이트 문구 금지)", () => {
    expect(SRC).toMatch(/베타\s*운영\s*중/);
    expect(SRC).toMatch(/가입\s*즉시\s*이용/);
    expect(SRC).not.toMatch(/승인형\s*베타/);
  });

  it("핵심 기능은 '주요 채널 통합 발행'으로 표현되고 과장된 개수 주장을 하지 않는다", () => {
    expect(SRC).toMatch(/주요\s*채널\s*(동시|통합)\s*발행/);
  });

  it("요금 안내는 베타 기간 월 기본 제공량 내 무료임을 명시한다(quota 언급)", () => {
    expect(SRC).toMatch(/베타\s*기간.*(월\s*기본\s*제공량|제공량).*무료/);
  });

  it("계정 자체는 가입 즉시 이용 가능하고, 공유 AI 생성만 운영자 승인(또는 BYO 키)이 필요함을 명시한다", () => {
    expect(SRC).toMatch(/가입\s*즉시\s*(대시보드\s*)?이용\s*가능/);
    expect(SRC).toMatch(/공유\s*AI\s*생성(은|이)?\s*운영자\s*승인/);
  });
});

// 채널 수량 과장 회귀 방지 계약 — Codex 2nd-pass 반려 반영: PUBLISH_CHANNEL_GROUPS는 "연결 UI 범위"일 뿐
// 실제 동시/예약 발행 SSOT가 아니다. 실제 예약 발행 지원은 SCHEDULABLE_PLATFORMS 8개(constants.ts 주석:
// "노출=발행가능")이므로, 랜딩의 발행 지원 나열(FEATURES 발행 카드·CHANNEL_ICONS)은 이 8개와 **정확히 일치**
// 해야 한다. 연결만 가능한 채널(LinkedIn/Pinterest/Tumblr/TikTok/YouTube/Naver Blog/LINE)과 미연결·읽기전용
// 채널(Medium/Substack/Kakao/RSS/Custom API)은 발행 지원처럼 나열 금지. SSOT를 실제 import해 교차검증하므로
// 향후 SCHEDULABLE_PLATFORMS가 바뀌면 이 테스트가 그 변화에 맞춰 재계산된다 — 드리프트를 소스에서 잡는다.
describe("AuthGate — 채널 수량 과장 회귀 방지 계약(SCHEDULABLE_PLATFORMS SSOT 교차검증)", () => {
  const ssotLabels = SCHEDULABLE_PLATFORMS.map((k) => SCHEDULABLE_PLATFORM_LABELS[k]);
  const iconsBlock = () =>
    SRC.slice(SRC.indexOf("const CHANNEL_ICONS ="), SRC.indexOf("];", SRC.indexOf("const CHANNEL_ICONS =")));
  const iconLabels = () => [...iconsBlock().matchAll(/"([^"]+)"/g)].map((m) => m[1]);

  it("SSOT(SCHEDULABLE_PLATFORMS)에 실제 채널이 있어 이 계약 자체가 무의미해지지 않는다", () => {
    expect(ssotLabels.length).toBeGreaterThan(0);
  });

  it("CHANNEL_ICONS 마퀴는 SCHEDULABLE_PLATFORMS SSOT와 정확히 일치한다(초과·누락 모두 금지)", () => {
    expect([...iconLabels()].sort()).toEqual([...ssotLabels].sort());
  });

  it("암묵적 수량 패딩 태그('+8'/'+14' 류)가 FEATURES에 남아있지 않다 — 전부 실명 나열", () => {
    expect(SRC).not.toMatch(/"\+\d+"/);
  });

  it("FEATURES 발행 카드의 태그는 SSOT 라벨과 정확히 일치한다(약어·과장 나열 금지)", () => {
    const featBlock = SRC.slice(SRC.indexOf("const FEATURES ="), SRC.indexOf("] as const;", SRC.indexOf("const FEATURES =")));
    const firstTags = featBlock.match(/tags:\s*\[([^\]]*)\]/);
    expect(firstTags).not.toBeNull();
    const tagLabels = [...firstTags![1].matchAll(/"([^"]+)"/g)].map((m) => m[1]);
    expect([...tagLabels].sort()).toEqual([...ssotLabels].sort());
  });

  it("예약 발행 미지원 채널(연결 전용·미연결 포함)이 발행 지원처럼 재등장하지 않는다", () => {
    const banned = [
      "LinkedIn", "Pinterest", "Tumblr", "TikTok", "YouTube", "Naver Blog", "LINE",
      "Medium", "Substack", "Kakao", "RSS", "Custom API",
    ];
    const block = iconsBlock();
    for (const label of banned) {
      expect(block).not.toMatch(new RegExp(`"${label}"`));
      expect(SRC).not.toMatch(new RegExp(`tags:[^\\]]*"${label}"`));
    }
  });
});

// Google-only 가입 정책 회귀 방지 계약 (2026-07-16 owner directive: 이메일/비번 가입 전면 제거).
// 고객 랜딩(LandingPage) 카피·주석이 다시 "이메일로 가입"/"이메일·비번" 류 문구를 노출하면
// 실제로는 /login이 Google OAuth 버튼만 제공하는데 랜딩만 이메일 가입을 약속하는 정책 불일치가
// 재발한다. 이 계약은 LandingPage 섹션(고객 대면)만 스코프한다 — 운영자(/operator) 비밀번호
// 로그인 경로나 이 테스트 파일 자체의 과거 커밋 이력 언급은 대상이 아니다.
describe("AuthGate — Google-only 가입 카피 회귀 방지 계약(고객 랜딩 스코프)", () => {
  const landingBlock = () =>
    SRC.slice(SRC.indexOf("function LandingPage()"), SRC.indexOf("export function AuthGate"));

  it("LandingPage 섹션에 이메일/비밀번호 가입을 약속하는 문구가 없다", () => {
    const block = landingBlock();
    expect(block).not.toMatch(/이메일로\s*가입/);
    expect(block).not.toMatch(/이메일\s*·\s*비번/);
    expect(block).not.toMatch(/이메일\s*\/\s*비밀번호/);
    expect(block).not.toMatch(/비밀번호(를|로)\s*(설정|입력)하고\s*가입/);
  });

  it("LandingPage 섹션은 Google 계정으로 시작함을 명시한다", () => {
    const block = landingBlock();
    expect(block).toMatch(/Google\s*계정으로\s*시작/);
  });
});
