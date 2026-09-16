import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

/**
 * 2026-09-16 사파리(배포본 1440 폭) 실측에서 채널 페이지 11곳
 * (threads x instagram facebook linkedin bluesky telegram discord slack youtube tiktok)에
 * 걸쳐 44px 미만으로 잡힌 조작 대상 계약. `safari-44px-sweep-20260915.contract.test.ts` 가
 * 홈·성과·블로그·키워드 플래너 등 개별 화면 파일을 고정한 뒤, 이번 실측은 그 화면들이
 * "전부 공유 컴포넌트다" — 즉 채널 라우트(`/channels/[channel]`)가 물고 있는 공용
 * 컴포넌트 쪽에서 한 번에 고쳐야 11개 채널 전체에 반영된다.
 *
 * 원칙(2026-09-14 결정, ADR): 글자 크기는 그대로 두고 누르는 면(min-height/padding)만
 * 키운다. 인라인 텍스트 링크는 `inline-flex items-center min-h-control-touch`, 폼
 * 컨트롤은 `min-h-control-touch`(또는 `.ds-field-control`), 아이콘 전용 버튼은
 * `ds-touch-target`. 새 `data-touch-exception` 은 만들지 않는다.
 *
 *   실측 위반 → 수정
 *     ChannelPage.tsx (threads/x/facebook/linkedin/bluesky/youtube/tiktok 공용)
 *       "원본 보기 →" 링크 18h                        → inline-flex + min-h-control-touch
 *       설정 탭 숫자 입력(w-20) 34h ×11                → min-h-control-touch
 *     SocialConnectButton.tsx (연결 버튼, 8개 화면 상단 액션)
 *       연결 버튼(px-pad-inset py-stack-tight) 36h     → min-h-control-touch
 *       가이드/전환/재확인 텍스트 링크 6곳 18h          → inline-flex + min-h-control-touch
 *     CredentialForm.tsx (bluesky/telegram/discord/slack 자격증명 입력 폼)
 *       입력창(w-full bg-surface border) 36h            → min-h-control-touch
 *       비밀번호 보기 토글(absolute right-2 top-1/2) 18h → ds-touch-target(44x44) + 입력 pr-wide 유지
 *       저장 버튼(flex-1 bg-accent) 36h                 → min-h-control-touch
 *       취소 버튼 36h · "연결 정보 수정" 링크 18h        → min-h-control-touch
 *     QueueList.tsx (큐 항목 액션, x/facebook/linkedin/bluesky/youtube/tiktok)
 *       필터·소싱가져오기·일괄승인·일괄삭제 버튼 26h    → min-h-control-touch
 *     ContentGuide.tsx / KeywordsEditor.tsx (설정 탭 콘텐츠 가이드·키워드, 전 채널 공용)
 *       AI 제안/공통복사/저장/적용/복사/닫기 버튼 26h    → min-h-control-touch
 *     InstagramPage.tsx (instagram 전용 카드뉴스 편집)
 *       스타일 토글, 슬라이드 추가, 이미지 추가, 설정에서 연결하기(×3) → min-h-control-touch
 *     ChannelConnect.tsx (studio 채널 연결 모달, 전 채널 공용 진입점)
 *       플랫폼 탭 버튼 · 고급 토큰 입력 토글 · 연결 테스트 버튼 · 닫기(✕) → min-h-control-touch / ds-touch-target
 *
 *   예외(측정 대상 아님): TenantAutomationSettings.tsx 의 `input.sr-only.peer` 는 시각적으로
 *   숨긴 토글 input(1h)이고 감싸는 `<label>` 이 실제 조작면이라 44px 계약 대상이 아니다.
 */

const root = process.cwd();
const read = (relative: string) => readFileSync(resolve(root, relative), "utf8");

const TOUCH_MARKERS = ["ds-touch-target", "min-h-control-touch"];

function windowAround(source: string, needle: string, before = 300, after = 250): string {
  const idx = source.indexOf(needle);
  expect(idx, `대상 문자열을 찾을 수 없다: ${needle}`).toBeGreaterThanOrEqual(0);
  return source.slice(Math.max(0, idx - before), idx + needle.length + after);
}

describe("2026-09-16 사파리 44px 스윕 계약 (채널 페이지 공유 컴포넌트)", () => {
  it("QA-SAFARI44C-01 정상: ChannelPage 의 '원본 보기' 링크와 설정 탭 숫자 입력이 하한 표식을 갖는다", () => {
    const source = read("src/components/channel/ChannelPage.tsx");
    expect(windowAround(source, "원본 보기 &rarr;")).toMatch(/min-h-control-touch/);
    expect(windowAround(source, 'className="min-h-control-touch w-20 bg-surface')).toMatch(/min-h-control-touch/);
  });

  it("QA-SAFARI44C-02 정상: SocialConnectButton 의 연결 버튼과 텍스트 링크들이 하한 표식을 갖는다", () => {
    const source = read("src/components/channel/SocialConnectButton.tsx");
    expect(windowAround(source, "px-pad-inset py-stack-tight text-body-sm rounded-control")).toMatch(/min-h-control-touch/);
    expect(windowAround(source, "다른 계정으로 연결하기")).toMatch(/min-h-control-touch/);
    expect(windowAround(source, "계정이 안 바뀌면 눌러 보세요")).toMatch(/min-h-control-touch/);
    expect(windowAround(source, "다시 확인")).toMatch(/min-h-control-touch/);
  });

  it("QA-SAFARI44C-03 정상: CredentialForm 의 입력창·비밀번호 토글·저장/취소 버튼·수정 링크가 하한 표식을 갖는다", () => {
    const source = read("src/components/shared/CredentialForm.tsx");
    expect(windowAround(source, "pr-wide text-caption text-muted placeholder-subtle")).toMatch(/min-h-control-touch/);
    expect(windowAround(source, "숨기기")).toMatch(/ds-touch-target/);
    expect(windowAround(source, "확인 중...")).toMatch(/min-h-control-touch/);
    expect(windowAround(source, "취소")).toMatch(/min-h-control-touch/);
    expect(windowAround(source, "연결 정보 수정")).toMatch(/min-h-control-touch/);
  });

  it("QA-SAFARI44C-04 정상: QueueList 의 필터·소싱가져오기·일괄승인·일괄삭제 버튼이 하한 표식을 갖는다", () => {
    const source = read("src/components/queue/QueueList.tsx");
    expect(windowAround(source, "FILTER_LABELS[f] || f")).toMatch(/min-h-control-touch/);
    expect(windowAround(source, "소싱에서 가져오기")).toMatch(/min-h-control-touch/);
    expect(windowAround(source, "handleBulkApprove}")).toMatch(/min-h-control-touch/);
    expect(windowAround(source, "handleBulkDelete}")).toMatch(/min-h-control-touch/);
  });

  it("QA-SAFARI44C-05 정상: ContentGuide 의 AI제안/공통복사/저장/적용/복사/닫기 버튼이 하한 표식을 갖는다", () => {
    const source = read("src/components/channel/ContentGuide.tsx");
    expect(windowAround(source, "handleAiSuggest}")).toMatch(/min-h-control-touch/);
    expect(windowAround(source, "공통에서 복사")).toMatch(/min-h-control-touch/);
    expect(windowAround(source, "handleSave} disabled={saving}")).toMatch(/min-h-control-touch/);
    expect(windowAround(source, "handleApplySuggestion}")).toMatch(/min-h-control-touch/);
  });

  it("QA-SAFARI44C-06 정상: KeywordsEditor 의 동일 계열 버튼들이 하한 표식을 갖는다", () => {
    const source = read("src/components/channel/KeywordsEditor.tsx");
    expect(windowAround(source, "handleApplyAll}")).toMatch(/min-h-control-touch/);
    expect(windowAround(source, "() => setSuggestedKeywords(null)")).toMatch(/min-h-control-touch/);
  });

  it("QA-SAFARI44C-07 정상: InstagramPage 의 스타일 토글·슬라이드 추가·설정에서 연결하기가 하한 표식을 갖는다", () => {
    const source = read("src/components/channel/InstagramPage.tsx");
    expect(windowAround(source, "+ 슬라이드 추가")).toMatch(/min-h-control-touch/);
    const settingsLinks = [...source.matchAll(/설정에서 연결하기/g)];
    expect(settingsLinks.length).toBeGreaterThanOrEqual(3);
    for (const m of settingsLinks) {
      expect(source.slice(Math.max(0, m.index! - 200), m.index!)).toMatch(/min-h-control-touch/);
    }
  });

  it("QA-SAFARI44C-08 정상: ChannelConnect 모달의 플랫폼 탭·토큰 토글·테스트 버튼·닫기가 하한 표식을 갖는다", () => {
    const source = read("src/components/studio/ChannelConnect.tsx");
    expect(windowAround(source, "rounded-control text-caption flex items-center gap-micro")).toMatch(/min-h-control-touch/);
    expect(windowAround(source, "고급: 토큰 직접 입력")).toMatch(/min-h-control-touch/);
    expect(windowAround(source, "연결 테스트 (저장된 키 재검증)")).toMatch(/min-h-control-touch/);
    expect(windowAround(source, "✕")).toMatch(/ds-touch-target/);
  });

  it("QA-SAFARI44C-09 경계: 하한 표식 상수는 둘 중 하나만 있으면 된다는 계약을 스스로 지킨다", () => {
    expect(TOUCH_MARKERS).toEqual(["ds-touch-target", "min-h-control-touch"]);
  });

  it("QA-SAFARI44C-10 정상(문서화): TenantAutomationSettings 의 숨김 토글 input 은 sr-only 라 측정 예외다", () => {
    const source = read("src/components/channel/TenantAutomationSettings.tsx");
    // sr-only 로 시각적으로 숨긴 실제 <input> — 조작면은 감싸는 <label> 이다. 44px 계약 대상이 아니므로
    // 여기서는 존재만 확인하고 min-h-control-touch 를 강제하지 않는다(강제하면 시각적으로 숨긴 요소가
    // 다시 나타나거나 레이아웃이 깨진다).
    expect(source).toMatch(/sr-only peer/);
  });

  /*
   * 2026-09-16 배포본 재측정(2차): 채널 페이지 위반이 36건 → 1건으로 줄어든 뒤 남은 3곳.
   * ①,②는 채널 설정 탭이 공유하는 컴포넌트, ③은 /channels/x 에서 계정이 access_paused ·
   * account_unavailable 상태일 때 전체 화면을 덮는 AuthGate 의 GateBlockScreen(role="alert") —
   * "모달"로 보였던 것의 실체는 이 풀스크린 차단 화면이다. layout.tsx 가 AuthGate 로 전 라우트를
   * 감싸므로 /channels/x 를 포함한 모든 경로에서 같은 화면이 뜬다.
   */
  it("QA-SAFARI44C-11 정상: SetupGuide 의 '더 알아보기/접기' 버튼이 하한 표식을 갖는다", () => {
    const source = read("src/components/shared/SetupGuide.tsx");
    expect(windowAround(source, "더 알아보기")).toMatch(/min-h-control-touch/);
  });

  it("QA-SAFARI44C-12 정상: AccountManager 의 '기본' 배지가 하한 표식을 갖는다", () => {
    const source = read("src/components/channel/AccountManager.tsx");
    expect(windowAround(source, "account-default-badge-${provider}")).toMatch(/min-h-control-touch/);
  });

  it("QA-SAFARI44C-13 정상: AuthGate GateBlockScreen 의 '로그아웃' 보조 버튼이 하한 표식을 갖는다 (/channels/x 포함 전 라우트에서 access_paused·account_unavailable 시 노출)", () => {
    const source = read("src/components/shared/AuthGate.tsx");
    expect(windowAround(source, "{secondaryLabel}")).toMatch(/min-h-control-touch/);
  });
});
