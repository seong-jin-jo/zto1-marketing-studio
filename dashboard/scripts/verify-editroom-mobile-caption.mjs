#!/usr/bin/env node

import { existsSync } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";
import { chromium } from "playwright-core";

const targetUrl = process.env.EDITROOM_MOBILE_CAPTION_URL || "http://127.0.0.1:3472/qa/mobile-editroom-snapshot";
const widths = [390, 820];
const home = homedir();
const executablePath = [
  join(home, "Library/Caches/ms-playwright/chromium_headless_shell-1234/chrome-headless-shell-mac-x64/chrome-headless-shell"),
  join(home, "Library/Caches/ms-playwright/chromium_headless_shell-1228/chrome-headless-shell-mac-x64/chrome-headless-shell"),
].find(existsSync);

const browser = await chromium.launch(executablePath ? { executablePath } : {});
const observations = [];

try {
  for (const width of widths) {
    // P1-04에서 실제 데이터로 캡처한 편집실 DOM에 현재 dev CSS만 다시 연결한다.
    // JavaScript를 끄면 과거 캡처의 Next hydration 청크가 현재 dev 청크와 섞이지 않는다.
    const context = await browser.newContext({
      viewport: { width, height: Math.round(width * 1.8) },
      javaScriptEnabled: false,
    });
    const page = await context.newPage();
    const consoleErrors = [];
    page.on("console", (message) => {
      if (message.type() === "error") consoleErrors.push(message.text());
    });

    await page.goto(targetUrl, { waitUntil: "domcontentloaded", timeout: 60_000 });
    await page.waitForFunction(() => {
      const root = document.querySelector('[data-room="edit"]');
      return root && root.querySelectorAll(".text-caption").length >= 3;
    }, { timeout: 60_000 });

    const observed = await page.evaluate(() => {
      const root = document.querySelector('[data-room="edit"]');
      if (!(root instanceof HTMLElement)) throw new Error("편집실 루트 data-room=edit가 없습니다.");
      const captions = [...root.querySelectorAll(".text-caption")]
        .filter((element) => {
          const rect = element.getBoundingClientRect();
          return rect.width > 0 && rect.height > 0;
        })
        .slice(0, 20);
      return {
        rootTag: root.tagName.toLowerCase(),
        captionCount: captions.length,
        captionFontSizes: [...new Set(captions.map((element) => getComputedStyle(element).fontSize))],
      };
    });

    const result = { width, ...observed, consoleErrors };
    observations.push(result);
    if (result.captionCount < 3) throw new Error(`${width}px에서 보이는 caption이 3개보다 적습니다.`);
    if (result.captionFontSizes.length !== 1 || result.captionFontSizes[0] !== "16px") {
      throw new Error(`${width}px 편집실 caption 계산값이 16px가 아닙니다: ${result.captionFontSizes.join(", ")}`);
    }
    if (consoleErrors.length > 0) throw new Error(`${width}px 콘솔 오류: ${consoleErrors.join(" | ")}`);
    await context.close();
  }
} finally {
  await browser.close();
}

process.stdout.write(`${JSON.stringify({ ok: true, targetUrl, observations }, null, 2)}\n`);
