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
    const body = request.postDataJSON();
    if (body.webhookUrl !== "https://hooks.slack.com/services/FIXTURE/ONLY/NOT_REAL") throw new Error("unexpected fixture input");
    posts += 1;
    connected = true;
    return route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify({ ok: true, verified: true, account: "fixture webhook" }) });
  }
  return route.fulfill({ status: 200, contentType: "application/json", body: "{}" });
});
const page = await context.newPage();
page.on("pageerror", (error) => errors.push(error.message));
page.on("console", (message) => { if (message.type() === "error") errors.push(message.text()); });
try {
  await page.goto(`${baseUrl}/settings`, { waitUntil: "domcontentloaded", timeout: 120000 });
  await page.getByRole("link", { name: /Slack/ }).first().click({ timeout: 120000 });
  await page.waitForURL("**/channels/slack", { timeout: 120000 });
  await page.getByRole("heading", { name: "Incoming Webhook 연결" }).waitFor({ timeout: 120000 });
  await page.locator("#ch-slack-webhookUrl").fill("https://hooks.slack.com/services/FIXTURE/ONLY/NOT_REAL");
  await page.getByRole("button", { name: "연결", exact: true }).click();
  await page.locator("span:visible").filter({ hasText: /^연결됨$/ }).first().waitFor({ timeout: 30000 });
  await page.reload({ waitUntil: "domcontentloaded", timeout: 120000 });
  await page.locator("span:visible").filter({ hasText: /^연결됨$/ }).first().waitFor({ timeout: 120000 });
  if (await page.locator("#ch-slack-webhookUrl").inputValue() !== "********") throw new Error("saved secret was not masked on reload");
  if (process.env.CHANNEL_SMOKE_CAPTURE) await page.screenshot({ path: process.env.CHANNEL_SMOKE_CAPTURE, fullPage: true });
  process.stdout.write(JSON.stringify({ path: new URL(page.url()).pathname, posts, reloadConnected: true, errors }) + "\n");
  if (posts !== 1 || errors.length) process.exitCode = 1;
} finally {
  await browser.close();
}
