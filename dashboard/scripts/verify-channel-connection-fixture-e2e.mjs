#!/usr/bin/env node
// 실제 고객 화면 경로를 렌더하되 API만 가로채는 안전한 채널 연결 스모크.
// 외부 Webhook과 DB에 요청하지 않는다. 서버 실행: npm run dev -- --port 3464
import { createRequire } from "node:module";
import { homedir } from "node:os";
import path from "node:path";

const require = createRequire(import.meta.url);
let playwright;
try { playwright = require("playwright-core"); }
catch {
  try { playwright = require("playwright"); }
  catch { playwright = createRequire(path.join(homedir(), "kimstudy-auto", "package.json"))("playwright-core"); }
}
const target = new URL(process.env.CHANNEL_SMOKE_BASE_URL || "http://localhost:3464");
if (target.protocol !== "http:" || !["localhost", "127.0.0.1", "::1"].includes(target.hostname) || target.username || target.password || target.pathname !== "/") {
  throw new Error("CHANNEL_SMOKE_BASE_URL must be a loopback HTTP origin");
}
const baseUrl = target.origin;
const browser = await playwright.chromium.launch({
  ...(process.env.CHANNEL_SMOKE_CHROME_PATH ? { executablePath: process.env.CHANNEL_SMOKE_CHROME_PATH } : {}),
  headless: true,
});
let connected = false;
let posts = 0;
let externalPosts = 0;
const errors = [];
const context = await browser.newContext({ viewport: { width: 1024, height: 768 } });
await context.addInitScript(() => {
  localStorage.setItem("dashboard_auth_token", "fixture-customer-token");
  localStorage.setItem("dashboard_auth_identity_kind", "customer");
});
await context.route(`${baseUrl}/api/**`, async (route) => {
  const request = route.request();
  const path = new URL(request.url()).pathname;
  if (path === "/api/me") {
    return route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify({ isOperator: false, tenant: { id: "fixture-tenant", name: "Fixture" }, accessPaused: false }) });
  }
  if (path === "/api/channel-config") {
    return route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify({ slack: { status: connected ? "connected" : "available", connected, keys: connected ? { webhookUrl: "********" } : {} } }) });
  }
  if (path === "/api/channel-config/slack" && request.method() === "POST") {
    posts += 1;
    const body = request.postDataJSON();
    if (body.webhookUrl !== "https://hooks.slack.com/services/FIXTURE/ONLY/NOT_REAL") {
      return route.fulfill({ status: 400, contentType: "application/json", body: JSON.stringify({ verified: false, error: "fixture URL 원문 필요" }) });
    }
    await new Promise((resolve) => setTimeout(resolve, 120));
    connected = true;
    return route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify({ ok: true, verified: true, account: "fixture webhook" }) });
  }
  return route.fulfill({ status: 200, contentType: "application/json", body: "{}" });
});
const page = await context.newPage();
page.on("pageerror", (error) => errors.push(error.message));
page.on("console", (message) => { if (message.type() === "error") errors.push(message.text()); });
page.on("request", (request) => {
  if (request.method() === "POST" && new URL(request.url()).origin !== baseUrl) externalPosts += 1;
});
try {
  await page.goto(`${baseUrl}/settings`, { waitUntil: "domcontentloaded", timeout: 120000 });
  await page.getByRole("link", { name: /Slack/ }).first().click({ timeout: 120000 });
  await page.waitForURL("**/channels/slack", { timeout: 120000 });
  await page.getByRole("heading", { name: "Incoming Webhook 연결" }).waitFor({ timeout: 120000 });
  await page.getByText(/Slack 채널에 테스트 메시지 1건이 게시됩니다/).waitFor({ timeout: 120000 });
  await page.locator("#ch-slack-webhookUrl").fill("https://hooks.slack.com/services/FIXTURE/ONLY/NOT_REAL");
  await page.evaluate(() => {
    const button = [...document.querySelectorAll("button")].find((node) => node.textContent?.trim() === "테스트 메시지 보내고 연결");
    if (!button) throw new Error("Slack test-send button missing");
    button.click();
    button.click();
  });
  await page.locator("span:visible").filter({ hasText: /^연결됨$/ }).first().waitFor({ timeout: 30000 });
  if (posts !== 1) throw new Error(`rapid double click sent ${posts} API requests`);
  await page.reload({ waitUntil: "domcontentloaded", timeout: 120000 });
  await page.locator("span:visible").filter({ hasText: /^연결됨$/ }).first().waitFor({ timeout: 120000 });
  if (await page.locator("#ch-slack-webhookUrl").inputValue() !== "********") throw new Error("saved secret was not masked on reload");
  await page.getByRole("button", { name: "연결 정보 수정" }).click();
  await page.getByRole("button", { name: "테스트 메시지 보내고 연결" }).click();
  await page.getByRole("alert").getByText(/Incoming Webhook URL 원문을 다시 입력/).waitFor({ timeout: 30000 });
  const maskedRetryApiPosts = posts - 1;
  if (maskedRetryApiPosts !== 0) throw new Error("masked retry reached API POST");
  await page.locator("#ch-slack-webhookUrl").fill("https://hooks.slack.com/services/FIXTURE/ONLY/NOT_REAL");
  await page.getByRole("button", { name: "테스트 메시지 보내고 연결" }).click();
  await page.getByRole("button", { name: "연결 정보 수정" }).waitFor({ timeout: 30000 });
  if (posts !== 2) throw new Error(`fresh raw URL sent ${posts - 1} API requests instead of one`);
  if (process.env.CHANNEL_SMOKE_CAPTURE) await page.screenshot({ path: process.env.CHANNEL_SMOKE_CAPTURE, fullPage: true });
  process.stdout.write(JSON.stringify({ path: new URL(page.url()).pathname, posts, reloadConnected: true, maskedRetryApiPosts, externalPosts, errors }) + "\n");
  if (externalPosts !== 0 || errors.length) process.exitCode = 1;
} finally {
  await browser.close();
}
