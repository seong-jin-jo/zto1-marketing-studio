#!/usr/bin/env node
// 발행실 카드 정렬 실측. 2026-09-22 교차 코드리뷰(PR #77) C3 요구 증거.
//
// 사전 조건(2026-09-23 5라운드에서 명시): 이 스크립트는 브라우저를 스스로 내려받지
// 않는다. 처음 돌리기 전에 한 번:
//   npx playwright install chromium
// 그리고 /qa-alignment-harness 를 서빙하는 dev 서버가 떠 있어야 한다:
//   npm run dev -- -p 3457   (다른 포트를 쓰면 HARNESS_BASE_URL 로 지정)
//
// /qa-alignment-harness (개발 전용, 운영에서는 notFound) 가 app/studio/page.tsx 의
// 발행실 그리드 마크업을 그대로 복제해 실제 PlatformPreview 를 그린다. 이 스크립트는
// 그 페이지를 실제 헤드리스 브라우저로 열고, 같은 줄(같은 GROUPS 섹션) 카드들의
// 헤더 영역과 편집 칸(data-testid^="inline-editor-") top 좌표를 재 델타를 계산한다.
//
// 2026-09-22 4라운드 J6: 이전 판은 다른 레포(kimstudy-auto)의 playwright-core 를
// 절대경로로 불렀고 Chrome 실행 파일도 절대경로로 박아, 다른 사람이 돌리면 첫 줄에서
// 죽었다. dashboard devDependencies 에 실제로 playwright-core 를 넣고, executablePath
// 를 넘기지 않아 playwright-core 자신이 시스템 표준 캐시(~/Library/Caches/ms-playwright,
// 이 머신의 모든 playwright-core 설치가 공유하는 OS 표준 경로)에서 자기 버전에 맞는
// 브라우저를 스스로 찾게 한다. 그 캐시가 비어 있으면(클린 머신·CI) 아래에서 명확한
// 안내와 함께 실패한다 — 원인 모를 스택트레이스로 죽지 않는다.
import { chromium } from "playwright-core";

const baseUrl = process.env.HARNESS_BASE_URL || "http://localhost:3457";
const width = Number(process.env.HARNESS_WIDTH || "1792");
// 2026-09-23 5라운드: 4라운드까지는 헤더영역 delta 를 출력만 하고 실패 게이트로
// 삼지 않았다. 그 결과 하네스가 실제 조건(긴 계정명)을 안 재도 "통과" 로 보였다.
// 이제 편집칸 delta 와 나란히 헤더영역 delta 도 게이트한다.
const MAX_DELTA_PX = 2;

async function main() {
  let browser;
  try {
    browser = await chromium.launch({ headless: true });
  } catch (error) {
    console.error(
      "\n브라우저를 못 띄웠습니다. `npx playwright install chromium` 을 먼저 실행하세요.\n" +
        `원본 에러: ${error.message}\n`,
    );
    process.exitCode = 1;
    return;
  }
  try {
    const page = await browser.newPage({ viewport: { width, height: 2400 } });
    const consoleErrors = [];
    page.on("console", (msg) => { if (msg.type() === "error") consoleErrors.push(msg.text()); });
    try {
      await page.goto(`${baseUrl}/qa-alignment-harness`, { waitUntil: "networkidle", timeout: 15000 });
    } catch (error) {
      console.error(
        `\n${baseUrl}/qa-alignment-harness 에 연결하지 못했습니다. dev 서버가 그 포트에 ` +
          `떠 있는지 확인하세요(예: npm run dev -- -p 3457, 또는 HARNESS_BASE_URL 로 다른 ` +
          `주소를 지정). 이 스크립트는 서버를 스스로 띄우지 않습니다.\n` +
          `원본 에러: ${error.message}\n`,
      );
      process.exitCode = 1;
      return;
    }

    const sections = await page.$$eval("section", (nodes) =>
      nodes.map((section) => {
        const title = section.querySelector("b")?.textContent || "";
        const cards = Array.from(section.querySelectorAll("[data-room-preview]")).map((card) => {
          const platform = card.getAttribute("data-room-preview");
          const cardRect = card.getBoundingClientRect();
          const previewCard = card.querySelector("[data-preview-card]");
          const iconLabelRow = previewCard?.children?.[0]?.getBoundingClientRect();
          const headerControlsRow = card.querySelector("[data-preview-header-controls]")?.getBoundingClientRect();
          const editRect = card.querySelector('[data-testid^="inline-editor-"]')?.getBoundingClientRect();
          const headerAreaBottom = headerControlsRow ? headerControlsRow.bottom : (iconLabelRow ? iconLabelRow.bottom : null);
          return {
            platform,
            cardTop: Math.round(cardRect.top),
            cardHeight: Math.round(cardRect.height),
            iconLabelHeight: iconLabelRow ? Math.round(iconLabelRow.height) : null,
            headerControlsHeight: headerControlsRow ? Math.round(headerControlsRow.height) : null,
            // 회장이 9444 에서 잰 44/72/124px 에 대응하는 값: 카드 top 에서 헤더 영역
            // (아이콘/라벨 줄 + 계정 배지 줄 + headerRight 줄) 바닥까지의 높이.
            headerAreaHeight: headerAreaBottom !== null ? Math.round(headerAreaBottom - cardRect.top) : null,
            editTop: editRect ? Math.round(editRect.top) : null,
          };
        });
        return { title, cards };
      }),
    );

    console.log(`\n=== 발행실 카드 정렬 실측 (폭 ${width}) ===\n`);
    let worstDelta = 0;
    let worstHeaderDelta = 0;
    for (const section of sections) {
      const tops = section.cards.map((c) => c.editTop).filter((v) => v !== null);
      const delta = tops.length > 1 ? Math.max(...tops) - Math.min(...tops) : 0;
      const headerHeights = section.cards.map((c) => c.headerAreaHeight).filter((v) => v !== null);
      const headerDelta = headerHeights.length > 1 ? Math.max(...headerHeights) - Math.min(...headerHeights) : 0;
      worstDelta = Math.max(worstDelta, delta);
      worstHeaderDelta = Math.max(worstHeaderDelta, headerDelta);
      console.log(`--- ${section.title} (편집칸 delta=${delta}px, 헤더영역 delta=${headerDelta}px) ---`);
      for (const c of section.cards) {
        console.log(`  ${c.platform.padEnd(10)} headerAreaHeight=${c.headerAreaHeight} editTop=${c.editTop} cardHeight=${c.cardHeight}`);
      }
    }
    console.log(`\n최대 편집칸 delta: ${worstDelta}px (목표: <=${MAX_DELTA_PX}px)`);
    console.log(`최대 헤더영역 delta: ${worstHeaderDelta}px (목표: <=${MAX_DELTA_PX}px — 회장 실측 기준 facebook 44 / threads·x·instagram·shorts 72 / reels·tiktok 124 가 하나로 수렴해야 함)`);
    if (consoleErrors.length) {
      console.log(`\n콘솔 에러 ${consoleErrors.length}건:`);
      consoleErrors.forEach((e) => console.log(`  - ${e}`));
    } else {
      console.log("\n콘솔 에러 0건");
    }

    // 2026-09-23 5라운드: 헤더영역 delta 도 게이트한다(전엔 출력만 하고 통과시켰다 —
    // 그래서 하네스가 실제 조건을 재현 못 해도 "통과" 로 보고됐다).
    const failures = [];
    if (worstDelta > MAX_DELTA_PX) failures.push(`편집칸 delta ${worstDelta}px`);
    if (worstHeaderDelta > MAX_DELTA_PX) failures.push(`헤더영역 delta ${worstHeaderDelta}px`);
    if (failures.length) {
      console.error(`\n실패: ${failures.join(", ")} 가 ${MAX_DELTA_PX}px 를 초과했습니다.`);
      process.exitCode = 1;
    } else {
      console.log("\n통과: 모든 섹션의 같은 줄 카드가 편집칸·헤더영역 둘 다 2px 이하로 수렴합니다.");
    }
  } finally {
    await browser.close();
  }
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
