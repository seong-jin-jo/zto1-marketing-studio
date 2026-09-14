#!/usr/bin/env node

import fs from "node:fs";
import path from "node:path";
import playwright from "/Users/sj/kimstudy-auto/node_modules/playwright-core/index.js";

const { chromium } = playwright;

const baseUrl = process.env.FE2_BASE_URL || "http://localhost:3456";
const dashboardToken = process.env.FE2_DASHBOARD_TOKEN || "";
const studioToken = process.env.FE2_STUDIO_TOKEN || "";
const workspaceId = process.env.FE2_WORKSPACE_ID || "";
const studioWorkspaceId = process.env.FE2_STUDIO_WORKSPACE_ID || workspaceId;
const verifyHandoff = process.env.FE2_VERIFY_HANDOFF === "1";
const outputDir = process.env.FE2_OUTPUT_DIR || path.resolve(process.cwd(), "../docs/design/prototypes/legacy-prototype-20260912/prototype/qa-fe2");
const executablePath = process.env.FE2_CHROME_PATH || "/Users/sj/Library/Caches/ms-playwright/chromium-1228/chrome-mac-x64/Google Chrome for Testing.app/Contents/MacOS/Google Chrome for Testing";

if (!dashboardToken || !studioToken || !workspaceId) throw new Error("FE2_DASHBOARD_TOKEN, FE2_STUDIO_TOKEN, FE2_WORKSPACE_ID are required");
fs.mkdirSync(outputDir, { recursive: true });

const browser = await chromium.launch({ executablePath, headless: true });
const context = await browser.newContext({ viewport: { width: 1440, height: 1200 } });
await context.addInitScript(({ dashboardTokenValue, studioTokenValue, workspaceIdValue, studioWorkspaceIdValue }) => {
  localStorage.setItem("dashboard_auth_token", dashboardTokenValue);
  localStorage.setItem("active_workspace", JSON.stringify({ id: workspaceIdValue, slug: "local-fe2-verification", name: "로컬 검증 작업 공간", tier: "team" }));
  localStorage.setItem("studio_work", JSON.stringify({
    idea: "1인 사업가의 콘텐츠 운영 시간 줄이기",
    text: {
      threads: "콘텐츠 운영 시간을 줄이는 세 가지 기준",
      x: "반복 업무부터 줄여야 콘텐츠가 남습니다.",
      facebook: "아이디어, 편집, 발행을 한 흐름으로 묶습니다.",
      instagram: { caption: "한 번 만들고 일곱 채널에 맞게 고칩니다.", hashtags: ["OSMU", "콘텐츠운영"], slides: ["기준 1", "기준 2", "기준 3"] },
      shorts: { hook: "매일 발행해도 시간이 남는 이유", body: "반복을 줄이고 기준을 남깁니다.", cta: "오늘 한 편부터 묶어 보세요." },
    },
    includes: { threads: true, x: true, facebook: true, instagram: true, shorts: false, reels: false, tiktok: false },
  }));
  sessionStorage.setItem("studio_generation_token", studioTokenValue);
  sessionStorage.setItem("studio_skill_version_id", "22222222-2222-4222-8222-222222222222");
  sessionStorage.setItem("studio_workspace_id", studioWorkspaceIdValue);
}, { dashboardTokenValue: dashboardToken, studioTokenValue: studioToken, workspaceIdValue: workspaceId, studioWorkspaceIdValue: studioWorkspaceId });

const page = await context.newPage();
await page.route("**/api/me", (route) => route.fulfill({
  status: 200,
  contentType: "application/json",
  body: JSON.stringify({ isOperator: false, tenant: { id: workspaceId, slug: "local-fe2-verification", name: "로컬 검증 작업 공간", status: "active" } }),
}));
const consoleErrors = [];
page.on("console", (message) => { if (message.type() === "error") consoleErrors.push(message.text()); });
page.on("pageerror", (error) => consoleErrors.push(error.message));
const screenshots = [];

try {
  await page.goto(`${baseUrl}/studio`, { waitUntil: "networkidle", timeout: 60000 });
  await page.waitForTimeout(1000);
  if (await page.locator('[data-room="publish"]').count() === 0) {
    throw new Error(`publish room missing at ${page.url()}: ${(await page.locator("body").innerText()).slice(0, 500)}`);
  }
  await page.locator('[data-room="publish"]').waitFor();
  if (await page.locator("[data-room-preview]").count() !== 7) throw new Error("seven publish previews did not render");
  await page.waitForFunction(() => document.querySelectorAll('textarea[aria-label$="첫 댓글"]').length === 4);
  if (await page.getByRole("button", { name: /중지/ }).count()) throw new Error("unsupported publish stop button rendered");
  const publishScreenshot = path.join(outputDir, "publish-room-1440.png");
  await page.screenshot({ path: publishScreenshot }); screenshots.push(publishScreenshot);

  await page.getByRole("button", { name: "생성실" }).click();
  await page.locator('[data-room="create"]').waitFor();
  await page.locator("#studio-topic").fill("1인 사업가의 콘텐츠 운영 시간 줄이기");
  await page.locator("#studio-purpose").fill("콘텐츠 운영 시간을 줄인다");
  await page.locator("#studio-audience").fill("1인 사업가");
  await page.getByLabel("이 콘텐츠에 쓰는 사진과 글을 제가 쓸 권리가 있습니다").check();
  const generationResponse = page.waitForResponse((response) => response.url().includes("/api/studio/v1/generations") && response.request().method() === "POST");
  await page.getByRole("button", { name: "후보 세 장 만들기" }).click();
  const response = await generationResponse;
  if (response.status() !== 201) throw new Error(`Studio generation returned ${response.status()}: ${await response.text()}`);
  await page.getByText(": 문제부터 여는 안").waitFor();
  const createScreenshot = path.join(outputDir, "create-room-candidates-1440.png");
  await page.screenshot({ path: createScreenshot }); screenshots.push(createScreenshot);
  await page.getByRole("button", { name: "A안 선택" }).click();

  await page.getByRole("button", { name: "편집실" }).click();
  await page.locator('[data-room="edit"]').waitFor();
  await page.getByRole("button", { name: "2. 사용자가 겪는 문제" }).click();
  await page.getByLabel("대사 2").fill("반복 발행에서 먼저 줄일 일을 찾습니다.");
  const editScreenshot = path.join(outputDir, "edit-room-1440.png");
  await page.screenshot({ path: editScreenshot }); screenshots.push(editScreenshot);

  let handoffStatus = null;
  let readyStatus = null;
  let enqueueStatus = null;
  if (verifyHandoff) {
    const handoffResponse = page.waitForResponse((candidate) => candidate.url().includes("/api/studio/commands") && candidate.request().method() === "POST");
    await page.getByRole("button", { name: "편집실로 넘기기" }).click();
    const handoff = await handoffResponse;
    handoffStatus = handoff.status();
    if (handoffStatus !== 201) throw new Error(`Studio handoff returned ${handoffStatus}`);

    const readyResponse = page.waitForResponse((candidate) => candidate.url().includes("/api/studio/commands") && candidate.request().method() === "POST");
    await page.getByRole("button", { name: "발행 준비 마치기" }).click();
    const ready = await readyResponse;
    readyStatus = ready.status();
    if (readyStatus !== 200) throw new Error(`Studio ready command returned ${readyStatus}`);

    const enqueueResponse = page.waitForResponse((candidate) => candidate.url().includes("/api/studio/commands") && candidate.request().method() === "POST");
    await page.getByRole("button", { name: "발행 준비 큐에 넣기" }).click();
    const enqueue = await enqueueResponse;
    enqueueStatus = enqueue.status();
    if (![200, 201].includes(enqueueStatus)) throw new Error(`OpenClaw enqueue returned ${enqueueStatus}`);
    await page.getByText(/OpenClaw 발행 준비 큐에 넣었습니다|이미 같은 revision을 넘겼습니다/).waitFor();
    const handoffScreenshot = path.join(outputDir, "edit-room-openclaw-handoff-1440.png");
    await page.screenshot({ path: handoffScreenshot }); screenshots.push(handoffScreenshot);
  }

  if (consoleErrors.length) throw new Error(`browser console errors: ${JSON.stringify(consoleErrors)}`);
  process.stdout.write(`${JSON.stringify({
    screenshots,
    generationStatus: response.status(),
    handoffStatus,
    readyStatus,
    enqueueStatus,
    firstCommentSupportedInputs: 4,
    publishStopButtons: 0,
    consoleErrors,
  }, null, 2)}\n`);
} finally {
  await browser.close();
}
