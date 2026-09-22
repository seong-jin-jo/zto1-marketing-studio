// @vitest-environment jsdom
/**
 * 2026-09-23 사고 회귀: 카드덱(생성실→편집실)은 말풍선 13개를 `editLines`에 담아
 * 저장하지만, 발행실 본문(`text`)은 이 경로에서 한 번도 채워지지 않았다. 그래서
 * 편집실엔 내용이 있는데 발행실은 "올릴 본문이 아직 없습니다"를 띄우고 Threads
 * 0/500·X 0/280·Shorts 0/5000 으로 전부 빈칸이었다 — 회장이 "스레드 유튜브 틱톡에
 * 콘텐츠가 하나도 안 올라갔다"고 지적한 근본 원인. `text` 상태를 새로 합성하는 대신
 * 편집실이 이미 쓰는 `editLines`를 발행 본문의 대체 원천으로 그대로 잇는다.
 *
 * 이 파일의 다른 발행실 회귀(osmu-code-review-20260914-publish-room)와 같은 방식으로
 * page.tsx 소스 문자열을 검사한다 — 이 컴포넌트는 계정·채널·학습정보 등 훅이 매우
 * 많아 전체 렌더 없이 소스 계약으로 배선을 고정하는 것이 이 레포의 기존 관례다.
 */
import fs from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

const pageSource = fs.readFileSync(path.resolve(__dirname, "../../src/app/studio/page.tsx"), "utf8");

describe("덱→발행실 본문 배선 회귀", () => {
  it("WIRE-01 text가 비어도 editLines가 있으면 deckFallbackBody를 채운다", () => {
    const decl = pageSource.slice(
      pageSource.indexOf("const deckFallbackBody ="),
      pageSource.indexOf("const hasPublishableBody ="),
    );
    expect(decl).toBeTruthy();
    expect(decl).toContain("editLines");
    expect(decl).toContain("join(\"\\n\\n\")");
  });

  it("WIRE-02 platformText는 text가 없으면 빈 문자열이 아니라 deckFallbackBody로 물러선다", () => {
    const fn = pageSource.slice(
      pageSource.indexOf("function platformText(p: PreviewPlatform): string {"),
      pageSource.indexOf("function platformPublishInput"),
    );
    // 옛 결함: `if (!text) return "";` 두 곳이 전부 빈 문자열을 강제해 Threads/X/Shorts
    // 미리보기·실 발행 요청 본문이 항상 0자였다. 지금은 둘 다 deckFallbackBody로 물러서야
    // 한다 — 빈 문자열 반환이 하나라도 남아 있으면 그 채널은 여전히 0자다.
    expect(fn).not.toContain('if (!text) return "";');
    expect((fn.match(/return deckFallbackBody;/g) || []).length).toBe(2);
  });

  it("WIRE-03 발행 실 요청(text: publishText(p))이 platformText 경로를 그대로 탄다", () => {
    // /api/publish 로 나가는 본문이 화면 미리보기와 다른 값을 쓰면 미리보기만 고치고
    // 실제로는 여전히 안 올라가는 결함이 재발한다. 같은 함수를 쓰는지 고정한다.
    expect(pageSource).toContain("text: publishText(p)");
  });

  it("WIRE-04 발행 단추 가드는 text가 없어도 editLines에 내용이 있으면 막지 않는다", () => {
    const publishFn = pageSource.slice(
      pageSource.indexOf("async function publish() {"),
      pageSource.indexOf("async function requestReview"),
    );
    expect(publishFn).toContain('if (!text && !editLines.some((line) => line.trim())) {');
    // 옛 가드 `if (!text) {` 단독형이 되살아나면(즉 editLines 조건이 빠지면) 이 회귀가
    // 다시 재현된다.
    expect(publishFn).not.toMatch(/if \(!text\) \{\s*\n\s*showToast\("발행할 본문이 없습니다/);
  });

  it("WIRE-05 발행실 빈 상태 배너와 채널 편집 블록은 hasPublishableBody로 판정한다(!text 단독 금지)", () => {
    const publishRoom = pageSource.slice(
      pageSource.indexOf('if (activeRoom === "publish") return ('),
      pageSource.length,
    );
    expect(publishRoom).toContain('{!hasPublishableBody ? (');
    expect(publishRoom).toContain('data-testid="publish-empty"');
    // 채널별 편집 카드·채팅창 빠른 답장 블록도 같은 판정을 써야 한다. `{text ? (` 가 이
    // 구간에 그대로 남아 있으면 카드덱 전용 작업물은 여전히 빈 화면으로 떨어진다.
    expect(publishRoom).not.toContain("{text ? (");
  });
});
