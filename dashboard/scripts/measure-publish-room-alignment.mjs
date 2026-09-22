#!/usr/bin/env node
// 발행실 카드 정렬 실측. 2026-09-22 교차 코드리뷰(PR #77) C3 요구 증거.
//
// /qa-alignment-harness (개발 전용, 운영에서는 notFound) 가 app/studio/page.tsx 의
// 발행실 그리드 마크업을 그대로 복제해 실제 PlatformPreview 를 그린다. 이 스크립트는
// 그 페이지를 실제 헤드리스 브라우저로 열고, 같은 줄(같은 GROUPS 섹션) 카드들의
// 편집 칸(data-testid^="inline-editor-") top 좌표를 재 델타를 계산한다.
import playwright from "/Users/sj/kimstudy-auto/node_modules/playwright-core/index.js";

const { chromium } = playwright;
const baseUrl = process.env.HARNESS_BASE_URL || "http://localhost:3457";
const executablePath = process.env.HARNESS_CHROME_PATH
  || "/Users/sj/Library/Caches/ms-playwright/chromium-1228/chrome-mac-x64/Google Chrome for Testing.app/Contents/MacOS/Google Chrome for Testing";
const width = Number(process.env.HARNESS_WIDTH || "1792");

async function main() {
  const browser = await chromium.launch({ executablePath, headless: true });
  try {
    const page = await browser.newPage({ viewport: { width, height: 2000 } });
    const consoleErrors = [];
    page.on("console", (msg) => { if (msg.type() === "error") consoleErrors.push(msg.text()); });
    await page.goto(`${baseUrl}/qa-alignment-harness`, { waitUntil: "networkidle", timeout: 60000 });

    const sections = await page.$$eval("section", (nodes) =>
      nodes.map((section) => {
        const title = section.querySelector("b")?.textContent || "";
        const cards = Array.from(section.querySelectorAll("[data-room-preview]")).map((card) => {
          const platform = card.getAttribute("data-room-preview");
          const editRect = card.querySelector('[data-testid^="inline-editor-"]')?.getBoundingClientRect();
          const cardRect = card.getBoundingClientRect();
          const headerRect = card.querySelector('[data-preview-card]')?.firstElementChild?.getBoundingClientRect();
          return {
            platform,
            cardTop: Math.round(cardRect.top),
            cardHeight: Math.round(cardRect.height),
            editTop: editRect ? Math.round(editRect.top) : null,
            headerHeight: headerRect ? Math.round(headerRect.height) : null,
          };
        });
        return { title, cards };
      }),
    );

    console.log(`\n=== 발행실 카드 정렬 실측 (폭 ${width}) ===\n`);
    let worstDelta = 0;
    for (const section of sections) {
      const tops = section.cards.map((c) => c.editTop).filter((v) => v !== null);
      const delta = tops.length > 1 ? Math.max(...tops) - Math.min(...tops) : 0;
      worstDelta = Math.max(worstDelta, delta);
      console.log(`--- ${section.title} (delta=${delta}px) ---`);
      for (const c of section.cards) {
        console.log(`  ${c.platform.padEnd(10)} editTop=${c.editTop} cardHeight=${c.cardHeight} headerHeight=${c.headerHeight}`);
      }
    }
    console.log(`\n최대 delta: ${worstDelta}px (목표: <=2px)`);
    if (consoleErrors.length) {
      console.log(`\n콘솔 에러 ${consoleErrors.length}건:`);
      consoleErrors.forEach((e) => console.log(`  - ${e}`));
    } else {
      console.log("\n콘솔 에러 0건");
    }

    if (worstDelta > 2) {
      console.error(`\n실패: 최대 delta ${worstDelta}px 가 2px 를 초과했습니다.`);
      process.exitCode = 1;
    } else {
      console.log("\n통과: 모든 섹션의 같은 줄 카드 delta가 2px 이하입니다.");
    }
  } finally {
    await browser.close();
  }
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
