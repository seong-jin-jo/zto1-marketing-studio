#!/usr/bin/env node

import fs from "node:fs";
import path from "node:path";
import { pathToFileURL } from "node:url";
import playwright from "/Users/sj/kimstudy-auto/node_modules/playwright-core/index.js";

const { chromium } = playwright;
const baseUrl = process.env.V24_BASE_URL || "http://localhost:3456";
const operatorToken = process.env.DASHBOARD_AUTH_TOKEN || "";
const workspaceId = process.env.V24_WORKSPACE_ID || "cd1d0a40-540d-4524-9b49-bf2445d82182";
const outputDir = process.env.V24_OUTPUT_DIR || path.resolve(process.cwd(), "../docs/design/prototypes/legacy-prototype-20260912/prototype/qa-v24-remediation");
const prototypePath = process.env.V24_PROTOTYPE_PATH || path.resolve(process.cwd(), "../docs/design/prototypes/legacy-prototype-20260912/prototype/openclaw-auto-4room-v63.html");
const executablePath = process.env.V24_CHROME_PATH || "/Users/sj/Library/Caches/ms-playwright/chromium-1228/chrome-mac-x64/Google Chrome for Testing.app/Contents/MacOS/Google Chrome for Testing";
const widths = [390, 1024, 1440];
const draftMarker = "V24 본문 복원 관찰 증거";

if (!operatorToken) throw new Error("DASHBOARD_AUTH_TOKEN이 필요합니다");
fs.mkdirSync(outputDir, { recursive: true });

const operatorRequest = async (pathname, options = {}) => fetch(`${baseUrl}${pathname}`, {
  ...options,
  headers: {
    authorization: `Bearer ${operatorToken}`,
    ...(options.body ? { "content-type": "application/json" } : {}),
    ...(options.headers || {}),
  },
});

let issuedTokenId = "";
let browser;
const observations = [];

async function closeBrowserWithin(timeoutMs) {
  if (!browser) return;
  let timeout;
  await Promise.race([
    browser.close(),
    new Promise((resolve) => { timeout = setTimeout(resolve, timeoutMs); }),
  ]);
  if (timeout) clearTimeout(timeout);
}

function recordBrowserFailures(page, label, failures) {
  page.on("pageerror", (error) => failures.push(`${label} pageerror ${error.message}`));
  page.on("console", (message) => {
    if (message.type() === "error") failures.push(`${label} console ${message.text()}`);
  });
  page.on("response", (response) => {
    if (response.status() === 401) failures.push(`${label} HTTP 401 ${response.url()}`);
  });
}

try {
  const issued = await operatorRequest("/api/tenant-tokens", {
    method: "POST",
    body: JSON.stringify({ tenant_id: workspaceId, label: `qa-v24-${Date.now()}` }),
  });
  const issuedBody = await issued.json();
  if (!issued.ok || !issuedBody.token || !issuedBody.id) throw new Error(`고객 토큰 발급 실패 HTTP ${issued.status}`);
  issuedTokenId = issuedBody.id;

  const operatorResponse = await operatorRequest("/api/operator/customers");
  const operatorBody = await operatorResponse.json();
  if (!operatorResponse.ok || !Array.isArray(operatorBody.oauthProviders)) {
    throw new Error(`운영자 고객 API 실패 HTTP ${operatorResponse.status}`);
  }

  browser = await chromium.launch({ executablePath, headless: true });
  const browserFailures = [];

  for (const width of widths) {
    const context = await browser.newContext({ viewport: { width, height: width === 390 ? 844 : 1200 } });
    const page = await context.newPage();
    recordBrowserFailures(page, `프로토타입 ${width}`, browserFailures);
    await page.goto(pathToFileURL(prototypePath).href, { waitUntil: "networkidle", timeout: 60000 });
    await page.screenshot({ path: path.join(outputDir, `v63-${width}-approved-prototype.png`), fullPage: true });
    observations.push({ width, approvedPrototypeCaptured: true });
    await context.close();
  }

  for (const width of widths) {
    const context = await browser.newContext({ viewport: { width, height: width === 390 ? 844 : 1200 } });
    await context.addInitScript(({ token, workspace, marker }) => {
      localStorage.setItem("dashboard_auth_token", token);
      localStorage.setItem("active_workspace", JSON.stringify({ id: workspace, slug: "qa-v24", name: "V24 검증 작업 공간", tier: "team" }));
      localStorage.setItem("studio_work", JSON.stringify({
        idea: "검수 본문 복원",
        text: { shorts: { hook: "본문 복원 시작", body: marker, cta: "본문 복원 끝" } },
        editLines: ["본문 복원 시작", marker, "본문 복원 끝"],
        includes: { threads: true },
        createBranch: "video",
        editKind: "video",
      }));
    }, { token: issuedBody.token, workspace: workspaceId, marker: draftMarker });
    const page = await context.newPage();
    recordBrowserFailures(page, `고객 ${width}`, browserFailures);

    await page.goto(`${baseUrl}/`, { waitUntil: "networkidle", timeout: 60000 });
    await page.locator('[data-room="performance"]').waitFor({ state: "visible", timeout: 30000 });
    const performance = await page.evaluate(() => ({
      roomCount: document.querySelectorAll('[data-room="performance"]').length,
      documentWidth: document.documentElement.scrollWidth,
      legacyPipeline: document.body.textContent?.includes("콘텐츠 파이프라인") || false,
      legacyRecent: document.body.textContent?.includes("최근 활동") || false,
      legacyChannels: document.body.textContent?.includes("Channels Status") || false,
      redundantLocation: document.body.textContent?.includes("지금 여기") || false,
    }));
    if (performance.roomCount !== 1) throw new Error(`${width} 성과실 렌더 수 ${performance.roomCount}`);
    if (performance.documentWidth > width + 1) throw new Error(`${width} 성과실 가로 넘침 ${performance.documentWidth}`);
    if (performance.legacyPipeline || performance.legacyRecent || performance.legacyChannels) throw new Error(`${width} 성과실 레거시 패널 재등장`);
    if (performance.redundantLocation) throw new Error(`${width} 사이드바 중복 현재 위치 문구 재등장`);
    await page.screenshot({ path: path.join(outputDir, `v24-${width}-performance.png`), fullPage: true });

    await page.goto(`${baseUrl}/studio?room=edit`, { waitUntil: "networkidle", timeout: 60000 });
    await page.locator('[data-room="edit"]').waitFor({ state: "visible", timeout: 30000 });
    if (await page.getByText(draftMarker, { exact: true }).count() < 1) throw new Error(`${width} 저장 본문 복원 실패`);
    await page.screenshot({ path: path.join(outputDir, `v24-${width}-draft-restored.png`), fullPage: true });
    observations.push({ width, performance, draftBodyRestored: true });
    await context.close();
  }

  for (const width of widths) {
    const context = await browser.newContext({ viewport: { width, height: width === 390 ? 844 : 1200 } });
    await context.addInitScript((token) => localStorage.setItem("dashboard_auth_token", token), operatorToken);
    const page = await context.newPage();
    recordBrowserFailures(page, `운영자 ${width}`, browserFailures);
    await page.goto(`${baseUrl}/operator/customers`, { waitUntil: "networkidle", timeout: 60000 });
    await page.locator("[data-oauth-provider]").first().waitFor({ state: "visible", timeout: 30000 });
    const operator = await page.evaluate(() => ({
      providerCount: document.querySelectorAll("[data-oauth-provider]").length,
      expandedCount: document.querySelectorAll('[data-oauth-provider] button[aria-expanded="true"]').length,
      documentWidth: document.documentElement.scrollWidth,
    }));
    if (operator.providerCount !== operatorBody.oauthProviders.length) {
      throw new Error(`${width} OAuth 카드 ${operator.providerCount}, API ${operatorBody.oauthProviders.length}`);
    }
    if (operator.expandedCount !== 0) throw new Error(`${width} OAuth 기본 펼침 ${operator.expandedCount}건`);
    if (operator.documentWidth > width + 1) throw new Error(`${width} 운영자 화면 가로 넘침 ${operator.documentWidth}`);
    await page.screenshot({ path: path.join(outputDir, `v24-${width}-operator-oauth.png`), fullPage: true });
    observations.push({ width, operator: { ...operator, apiProviderCount: operatorBody.oauthProviders.length } });
    await context.close();
  }

  if (browserFailures.length) throw new Error(`브라우저 실패 ${browserFailures.length}건: ${browserFailures.slice(0, 3).join(" | ")}`);
  fs.writeFileSync(path.join(outputDir, "v24-observations.json"), JSON.stringify({ workspaceId, widths, observations, browserFailures }, null, 2));
  console.log(`PASS 성과실 단일 블록과 사이드바 문구 ${widths.length}폭`);
  console.log(`PASS 저장 본문 복원 ${widths.length}폭`);
  console.log(`PASS OAuth ${operatorBody.oauthProviders.length}개 기본 접힘과 API 정합 ${widths.length}폭`);
  console.log(`CAPTURES ${outputDir}`);
} finally {
  if (issuedTokenId) {
    const revoked = await operatorRequest(`/api/tenant-tokens?id=${encodeURIComponent(issuedTokenId)}`, { method: "DELETE" });
    if (!revoked.ok) console.error(`임시 고객 토큰 폐기 실패 HTTP ${revoked.status}`);
  }
  await closeBrowserWithin(5000);
}

process.exit(0);
