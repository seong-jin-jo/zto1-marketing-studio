import { readFileSync, readdirSync, statSync } from "node:fs";
import { resolve, join } from "node:path";
import { describe, expect, it } from "vitest";

/**
 * 편집실 **밖** 화면의 44px 조작 영역 계약.
 *
 * `edit-room-design-contract.test.ts` 가 편집실과 공용 `Button` 을 고정한 뒤, 편집실 밖에
 * 남은 자리를 2026-09-14 에 실렌더로 다시 셌다(로컬 dev, Chromium, 라이트, 8경로 x 390/1440).
 * 공용 `Button` 을 안 쓰는 맨 `<button>` 과 `<a>` 라 공용 수정이 닿지 않던 자리들이다.
 *
 *   수정 전 → 수정 후 (44px 미만 개수)
 *     1440 /            21 → 0      390 /          1 → 0
 *     1440 /settings    29 → 0      390 /settings  9 → 0
 *     1440 /calendar    24 → 1*     390 /calendar  4 → 1*
 *     1440 /inbox       24 → 1*     390 /inbox     4 → 1*
 *     390 /studio?room=publish 7 → 0 (체크 표식)
 *   (*) 문장 안에 박힌 글자 링크. 아래 INLINE_TEXT_EXCEPTIONS 에 사유와 함께 남겼다.
 *   가로 넘침은 수정 전후 모두 8경로 x 2폭 전부 0px 이었다.
 */

const root = process.cwd();
const read = (relative: string) => readFileSync(resolve(root, relative), "utf8");

/**
 * JSX 여는 태그 하나를 통째로 집는다. `<button[\s\S]*?>` 같은 정규식은
 * `onClick={() => ...}` 의 화살표에서 먼저 멈춰 className 을 못 본다. 그러면 이미 고친
 * 자리를 위반으로 잡는다(2026-09-14 실제로 겪었다). 중괄호 깊이를 세면서 태그를 닫는
 * `>` 를 직접 찾는다.
 */
function openingTags(source: string, tagName: string): string[] {
  const tags: string[] = [];
  const opener = new RegExp(`<${tagName}[\\s>]`, "g");
  let match: RegExpExecArray | null;
  while ((match = opener.exec(source))) {
    let depth = 0;
    let quote = "";
    for (let i = match.index; i < source.length; i += 1) {
      const ch = source[i];
      if (quote) { if (ch === quote) quote = ""; continue; }
      if (ch === '"' || ch === "'" || ch === "`") { quote = ch; continue; }
      if (ch === "{") depth += 1;
      else if (ch === "}") depth -= 1;
      else if (ch === ">" && depth === 0) { tags.push(source.slice(match.index, i + 1)); break; }
    }
  }
  return tags;
}

/** 44px 하한을 만드는 표식. 하나라도 있으면 그 조작 영역은 계약을 지킨 것으로 본다. */
const TOUCH_MARKERS = ["ds-touch-target", "min-h-control-touch"];

/**
 * 하한에서 빠지는 자리와 그 사유. **사유 없이 빠지는 것을 막으려고 여기 적는다.**
 *
 * WCAG 2.2 의 2.5.8 최소 표적 크기는 "문장이나 글 덩어리 안에 박힌(inline) 표적" 을 하한에서
 * 명시적으로 뺀다(https://www.w3.org/WAI/WCAG22/Understanding/target-size-minimum.html).
 * 줄 높이를 44px 로 키우면 그 문장의 줄 간격이 벌어져 글이 읽기 나빠지고, 같은 목적지로 가는
 * 44px 짜리 자리가 화면에 이미 따로 있다(`PublishTrip` 의 세 칸, 사이드바 항목).
 */
const INLINE_TEXT_EXCEPTIONS = [
  {
    file: "src/app/calendar/page.tsx",
    snippet: '<Link href="/inbox" className="font-semibold underline">승인 인박스</Link>',
    reason: "설명 문장 안의 글자 링크(WCAG 2.5.8 inline 예외). 같은 목적지가 PublishTrip 과 사이드바에 44px 로 있다",
  },
  {
    file: "src/app/inbox/page.tsx",
    snippet: '<Link href="/calendar" className="font-semibold underline">발행 캘린더</Link>',
    reason: "설명 문장 안의 글자 링크(WCAG 2.5.8 inline 예외). 같은 목적지가 PublishTrip 과 사이드바에 44px 로 있다",
  },
] as const;

describe("편집실 밖 조작 영역 하한 계약", () => {
  it("QA-APP-TOUCH-01 정상: 사이드바 항목이 44px 세로 하한을 갖는다", () => {
    // DESIGN.md 부품표 「앱 사이드바 … 항목 최소 높이 44px」. 실렌더는 55x32 였고 이 항목이
    // 모든 화면에 20개씩 떠서 전 화면 위반의 절반 이상을 혼자 만들고 있었다.
    const rule = read("src/app/globals.css").match(/\.sidebar-item \{([^}]*)\}/)?.[1] ?? "";
    expect(rule).toMatch(/min-height:\s*var\(--control-touch\)/);
  });

  it("QA-APP-TOUCH-02 정상: 설정 탭 줄과 캘린더 월 이동 단추가 하한 표식을 갖는다", () => {
    const settings = read("src/app/settings/page.tsx");
    expect(settings).toMatch(/ds-touch-target[^`"]*rounded-chip \$\{activeTab === t\.key/);
    const calendar = read("src/app/calendar/page.tsx");
    for (const label of ["이전 달", "다음 달"]) {
      const tag = openingTags(calendar, "button").find((item) => item.includes(`aria-label="${label}"`)) ?? "";
      expect(tag, `${label} 단추가 있어야 한다`).not.toBe("");
      expect(tag).toContain("ds-touch-target");
    }
    expect(calendar).toMatch(/ds-touch-target[^"]*ml-micro px-stack-tight/);
  });

  it("QA-APP-TOUCH-03 정상: 인박스 펼침 단추 둘과 발행 시점 선택이 하한 표식을 갖는다", () => {
    const inbox = read("src/app/inbox/page.tsx");
    expect(inbox).toMatch(/setShowSrc\(\(v\) => !v\)\} className="ds-touch-target/);
    expect(inbox).toMatch(/setShowTone\(\(v\) => !v\)\} className="ds-touch-target/);
    expect(inbox).toMatch(/className="min-h-control-touch bg-surface-2 text-muted text-caption/);
  });

  it("QA-APP-TOUCH-04 정상: 채널 OAuth 연결은 맨 button 이 아니라 공용 Button 이다", () => {
    // 근본 수정. 모양이 공용 primary 와 같은 자리라 유틸리티만 덧대지 않고 공용으로 바꿨다.
    const settings = read("src/app/settings/page.tsx");
    expect(settings).toMatch(/<Button variant="primary" size="sm" onClick=\{\(\) => setShowConnect\(true\)\}/);
    expect(settings).not.toMatch(/<button[^>]*setShowConnect\(true\)/);
  });

  it("QA-APP-TOUCH-05 경계: 발행실 체크는 표식 20px · 조작면 44px 로 분리한다", () => {
    // DESIGN.md 발행실 절의 문장 그대로다. 체크 입력 자체를 44px 로 키우면 표식이 커져
    // 계약을 반대로 어긴다. 표식은 20px(h-5 w-5)로 두고 감싼 label 이 조작면이 된다.
    const studio = read("src/app/studio/page.tsx");
    const labels = studio.match(/<label className="ds-touch-target flex min-h-control-touch[^"]*"[\s\S]{0,400}?type="checkbox"[^>]*>/g) ?? [];
    expect(labels.length, "발행 · 미지원 두 자리 모두 조작면이 있어야 한다").toBe(2);
    for (const label of labels) expect(label).toMatch(/className="h-5 w-5 shrink-0"/);
  });

  it("QA-APP-TOUCH-06 정상: 전 화면에 뜨는 개인정보 설정 단추가 하한 표식을 갖는다", () => {
    // `fixed` 라 문서 흐름 밖이다. 44px 로 키워도 바닥글이 두꺼워지지 않으므로 예외로 두지
    // 않았다. 글자 크기(text-caption)는 그대로 두고 히트 영역만 넓힌다.
    const consent = read("src/components/shared/ConsentBanner.tsx");
    const tag = openingTags(consent, "button").find((item) => item.includes("openConsentSettings")) ?? "";
    expect(tag).toContain("ds-touch-target");
    expect(tag).toContain("text-caption");
    expect(tag).not.toMatch(/text-(body|lead|subheading)/);
  });

  it("QA-APP-TOUCH-07 경계: 하한에서 빠진 자리는 사유와 함께 목록에 남아 있다", () => {
    // 이유 없이 빠지는 것이 다음 사고다. 목록의 자리가 사라지면(고쳤거나 지웠으면) 이 테스트가
    // 깨져서 목록을 손보게 만든다.
    expect(INLINE_TEXT_EXCEPTIONS.length).toBeGreaterThan(0);
    for (const item of INLINE_TEXT_EXCEPTIONS) {
      expect(read(item.file), `${item.file} 의 예외 대상이 그대로 있어야 한다`).toContain(item.snippet);
      expect(item.reason.length, "사유가 비어 있으면 예외가 아니다").toBeGreaterThan(20);
    }
  });
});

/** 새 맨 `<button>` 이 늘어나는 것을 막는 래칫. */
function tsxFiles(dir: string, acc: string[] = []): string[] {
  for (const entry of readdirSync(dir)) {
    const full = join(dir, entry);
    if (statSync(full).isDirectory()) tsxFiles(full, acc);
    else if (entry.endsWith(".tsx")) acc.push(full);
  }
  return acc;
}

describe("맨 button 래칫", () => {
  // 2026-09-14 실측 기준선. 공용 `Button` 을 안 쓰는 맨 `<button>` 의 전체 수다. 이 수는
  // 줄기만 해야 한다. 늘리려는 변경은 공용 `Button` 을 쓸 수 없는 이유를 먼저 대야 한다.
  //
  // 2026-09-22 교차 코드리뷰 MINOR 대응 +1(239): PlatformPreview.tsx MediaCarousel 의
  // 점 인디케이터를 비의미 <span> 에서 role="group" 안 <button> 으로 바꿨다(키보드로
  // 카드를 직접 고를 수 있게, 접근성 개선). 소스에는 map 안 button 하나뿐이라(런타임에
  // 카드 수만큼 찍혀도 소스 리터럴은 하나) 순증은 +1.
  //
  // 2026-09-22 4라운드: PublishEditSidebar(오른쪽 사이드바 채팅형 편집)를 이 브랜치에서
  // 뺐다(세 라운드 연속 싱글턴이 깨져 별도 브랜치로 이관). EditTrigger·사이드바 자체
  // 버튼(닫기·취소·저장)이 전부 사라져 기준선이 240 에서 239 로 내려간다.
  const BASELINE = 239;

  it("QA-APP-TOUCH-08 경계: 맨 button 총수가 기준선을 넘지 않는다", () => {
    const count = tsxFiles(resolve(root, "src"))
      .reduce((total, file) => total + openingTags(readFileSync(file, "utf8"), "button").length, 0);
    expect(count, `맨 <button> 이 ${BASELINE} 개에서 ${count} 개로 늘었다. 공용 Button 을 쓰거나 기준선을 낮춰라`).toBeLessThanOrEqual(BASELINE);
  });

  it("QA-APP-TOUCH-09 정상: 이번에 고친 네 화면에는 하한 표식 없는 맨 button 이 없다", () => {
    // 이 네 파일에 새 맨 `<button>` 을 하한 표식 없이 넣으면 여기서 잡힌다.
    const scope = [
      "src/app/settings/page.tsx",
      "src/app/calendar/page.tsx",
      "src/app/inbox/page.tsx",
      "src/components/shared/ConsentBanner.tsx",
    ];
    const offenders: string[] = [];
    for (const file of scope) {
      const source = read(file);
      for (const tag of openingTags(source, "button")) {
        if (TOUCH_MARKERS.some((marker) => tag.includes(marker))) continue;
        // 부모가 조작면을 소유하는 자리(카드 전체가 단추인 경우)는 py- 세로 여백으로 44px 을
        // 만든다. 그 형태는 py-stack 이상을 갖는다.
        if (/py-(stack|pad-inset|region)/.test(tag)) continue;
        // 달력 날짜 칸처럼 칸 자체가 정사각형으로 커지는 자리. 실측 1440 에서 176x176,
        // 390 에서 47x47 이라 하한을 넘는다.
        if (/aspect-square/.test(tag)) continue;
        offenders.push(`${file}: ${tag.replace(/\s+/g, " ").slice(0, 90)}`);
      }
    }
    expect(offenders, offenders.join("\n")).toEqual([]);
  });
});
