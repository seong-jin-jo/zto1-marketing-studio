import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { createRequire } from "node:module";

const require = createRequire(import.meta.url);
const playwright = (() => {
  try { return require("playwright"); }
  catch { return require(path.join(os.homedir(), ".claude/skills/gstack/node_modules/playwright")); }
})();

const base = process.env.RECOVERY_UI_BASE_URL || "http://localhost:3463";
const dbHost = process.env.DATABASE_URL ? new URL(process.env.DATABASE_URL).hostname : "";
if (!new Set(["localhost", "127.0.0.1"]).has(dbHost)) {
  throw new Error("This browser fixture may issue a temporary token only against a local DB");
}
if (new URL(base).hostname !== "localhost") throw new Error("Next dev HMR requires localhost origin");
const operator = process.env.DASHBOARD_AUTH_TOKEN;
const workspace = (process.env.STUDIO_DEV_WORKSPACE_IDS || "").split(",")[0]?.trim();
if (!operator || !workspace) throw new Error("local QA fixture is missing");
const request = (path, options = {}) => fetch(`${base}${path}`, {
  ...options,
  headers: { authorization: `Bearer ${operator}`, "content-type": "application/json", ...(options.headers || {}) },
});
let issuedId;
let browser;
try {
  const issued = await request("/api/tenant-tokens", { method: "POST",
    body: JSON.stringify({ tenant_id: workspace, label: `qa-recovery-ui-${Date.now()}` }) });
  const account = await issued.json();
  if (!issued.ok || !account.token) throw new Error(`local customer token issue HTTP ${issued.status}`);
  issuedId = account.id;
  browser = await playwright.chromium.launch({ headless: true,
    executablePath: process.env.RECOVERY_UI_CHROME_PATH || playwright.chromium.executablePath() });
  const context = await browser.newContext({ viewport: { width: 1440, height: 1000 } });
  await context.addInitScript(({ token, workspaceId }) => {
    localStorage.setItem("dashboard_auth_token", token);
    localStorage.setItem("active_workspace", JSON.stringify({ id: workspaceId, slug: "local-qa", name: "로컬 검증 작업 공간", tier: "team" }));
  }, { token: account.token, workspaceId: workspace });
  const page = await context.newPage();
  const exceptions = [];
  const usageStatuses = [];
  page.on("response", (response) => {
    if (response.url().includes("/api/usage?")) usageStatuses.push(response.status());
  });
  page.on("pageerror", (e) => exceptions.push(e.message));
  page.on("console", (m) => {
    if (m.type() !== "error") return;
    const injectedUsageError = m.location().url.includes("/api/usage")
      && /Failed to load resource.*(500|503)/.test(m.text());
    if (!injectedUsageError) exceptions.push(m.text());
  });
  const output = path.resolve(process.cwd(), "../logs/diff/osmu-recovery0918");
  fs.mkdirSync(output, { recursive: true });

  await page.route("**/api/usage?**", (route) => route.fulfill({ status: 503, contentType: "application/json",
    body: JSON.stringify({ status: "delayed", error: "usage ledger pending" }) }));
  await page.goto(`${base}/performance`, { waitUntil: "domcontentloaded", timeout: 120000 });
  await page.locator('[data-room="performance"]').waitFor({ timeout: 120000 });
  await page.locator('[data-usage-delayed="true"]').waitFor({ timeout: 30000 });
  const delayed = await page.locator('[data-usage-delayed="true"]').innerText();
  await page.screenshot({ path: `${output}/performance-usage-delayed.png` });

  await page.unrouteAll({ behavior: "wait" });
  const usageResponse = page.waitForResponse((response) =>
    response.url().includes("/api/usage?") && response.status() === 200, { timeout: 30000 });
  await page.getByRole("button", { name: "다시 불러오기" }).click();
  await usageResponse;
  await page.locator('[data-usage-delayed="true"]').waitFor({ state: "detached", timeout: 30000 });
  const recovered = await page.locator('body').innerText();
  const recoveredUsage = recovered.includes("오늘 생성") && recovered.includes("이번 주 생성")
    && await page.locator('[data-usage-error="true"]').count() === 0;
  await page.screenshot({ path: `${output}/performance-usage-recovered.png` });

  await page.route("**/api/usage?**", (route) => route.fulfill({ status: 500, contentType: "application/json",
    body: JSON.stringify({ error: "temporary local QA error" }) }));
  await page.reload({ waitUntil: "domcontentloaded", timeout: 120000 });
  try { await page.locator('[data-usage-error="true"]').waitFor({ timeout: 30000 }); }
  catch {
    throw new Error(JSON.stringify({ phase: "generic-error", url: page.url(),
      room: await page.locator('[data-room="performance"]').count(),
      delayed: await page.locator('[data-usage-delayed="true"]').count(),
      generic: await page.locator('[data-usage-error="true"]').count(), usageStatuses }));
  }
  const generic = await page.locator('[data-usage-error="true"]').innerText();
  await page.screenshot({ path: `${output}/performance-usage-server-error.png` });

  console.log(JSON.stringify({ workspaceFixture: true, delayedVisible: delayed.includes("반영이 지연"),
    retryCleared: !recovered.includes("반영이 지연") && recoveredUsage, genericShowsStatus: generic.includes("500"),
    genericNotDelayed: !generic.includes("반영이 지연"), pageExceptions: exceptions,
    screenshots: ["performance-usage-delayed.png", "performance-usage-recovered.png", "performance-usage-server-error.png"],
    usageStatuses, output }));
  if (!delayed.includes("반영이 지연") || recovered.includes("반영이 지연") || !recoveredUsage
    || !generic.includes("500") || generic.includes("반영이 지연") || exceptions.length) process.exitCode = 1;
} finally {
  try { if (browser) await browser.close(); }
  finally {
    if (issuedId) {
      const deleted = await request(`/api/tenant-tokens?id=${issuedId}`, { method: "DELETE" });
      if (!deleted.ok) throw new Error(`temporary QA token cleanup HTTP ${deleted.status}`);
    }
  }
}
