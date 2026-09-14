#!/usr/bin/env node

import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { spawn } from "node:child_process";

const baseUrl = process.env.FE1_BASE_URL || "http://localhost:3456";
const tenantToken = process.env.FE1_TENANT_TOKEN || "";
const operatorToken = process.env.FE1_OPERATOR_TOKEN || "";
const workspaceId = process.env.FE1_WORKSPACE_ID || "";
const workspaceName = process.env.FE1_WORKSPACE_NAME || "로컬 검증 워크스페이스";
const mode = process.env.FE1_MODE || "empty";
const outputDir = process.env.FE1_OUTPUT_DIR || path.resolve(process.cwd(), "../docs/design/prototypes/legacy-prototype-20260912/prototype/qa-fe1");
const chromePath = process.env.FE1_CHROME_PATH || "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome";
const debugPort = Number(process.env.FE1_CHROME_DEBUG_PORT || 9341);

if (!tenantToken || !operatorToken || !workspaceId) {
  throw new Error("FE1_TENANT_TOKEN, FE1_OPERATOR_TOKEN, FE1_WORKSPACE_ID are required");
}
if (!fs.existsSync(chromePath)) throw new Error(`Chrome not found: ${chromePath}`);
if (!new Set(["empty", "sample"]).has(mode)) throw new Error(`unsupported FE1_MODE: ${mode}`);

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

async function waitFor(check, message, timeoutMs = 20000) {
  const until = Date.now() + timeoutMs;
  let lastError;
  while (Date.now() < until) {
    try {
      const value = await check();
      if (value) return value;
    } catch (error) {
      lastError = error;
    }
    await sleep(200);
  }
  throw new Error(`${message}${lastError ? `: ${lastError.message}` : ""}`);
}

class Cdp {
  constructor(url) {
    this.socket = new WebSocket(url);
    this.id = 0;
    this.pending = new Map();
    this.listeners = new Map();
  }

  async open() {
    await new Promise((resolve, reject) => {
      this.socket.addEventListener("open", resolve, { once: true });
      this.socket.addEventListener("error", reject, { once: true });
    });
    this.socket.addEventListener("message", (event) => {
      const message = JSON.parse(String(event.data));
      if (message.id && this.pending.has(message.id)) {
        const { resolve, reject } = this.pending.get(message.id);
        this.pending.delete(message.id);
        if (message.error) reject(new Error(message.error.message));
        else resolve(message.result);
        return;
      }
      const key = `${message.sessionId || "browser"}:${message.method}`;
      for (const listener of this.listeners.get(key) || []) listener(message.params || {});
    });
  }

  call(method, params = {}, sessionId) {
    const id = ++this.id;
    return new Promise((resolve, reject) => {
      this.pending.set(id, { resolve, reject });
      this.socket.send(JSON.stringify({ id, method, params, ...(sessionId ? { sessionId } : {}) }));
    });
  }

  once(method, sessionId) {
    const key = `${sessionId || "browser"}:${method}`;
    return new Promise((resolve) => {
      const listener = (params) => {
        this.listeners.set(key, (this.listeners.get(key) || []).filter((item) => item !== listener));
        resolve(params);
      };
      this.listeners.set(key, [...(this.listeners.get(key) || []), listener]);
    });
  }

  on(method, sessionId, listener) {
    const key = `${sessionId || "browser"}:${method}`;
    this.listeners.set(key, [...(this.listeners.get(key) || []), listener]);
  }

  close() {
    this.socket.close();
  }
}

fs.mkdirSync(outputDir, { recursive: true });
const profileDir = fs.mkdtempSync(path.join(os.tmpdir(), "openclaw-fe1-chrome-"));
const chrome = spawn(chromePath, [
  "--headless=new",
  "--disable-gpu",
  "--no-first-run",
  "--no-default-browser-check",
  `--remote-debugging-port=${debugPort}`,
  `--user-data-dir=${profileDir}`,
  "--window-size=1440,1200",
  "about:blank",
], { stdio: "ignore" });

let cdp;
try {
  const version = await waitFor(async () => {
    const response = await fetch(`http://127.0.0.1:${debugPort}/json/version`);
    return response.ok ? response.json() : null;
  }, "Chrome DevTools did not start", 15000);
  cdp = new Cdp(version.webSocketDebuggerUrl);
  await cdp.open();
  const { targetId } = await cdp.call("Target.createTarget", { url: "about:blank" });
  const { sessionId } = await cdp.call("Target.attachToTarget", { targetId, flatten: true });
  await Promise.all([
    cdp.call("Page.enable", {}, sessionId),
    cdp.call("Runtime.enable", {}, sessionId),
    cdp.call("Log.enable", {}, sessionId),
  ]);

  const consoleErrors = [];
  cdp.on("Runtime.exceptionThrown", sessionId, ({ exceptionDetails }) => {
    consoleErrors.push(exceptionDetails?.text || "runtime exception");
  });
  cdp.on("Log.entryAdded", sessionId, ({ entry }) => {
    if (entry?.level === "error") consoleErrors.push(entry.text);
  });

  async function evaluate(expression) {
    const result = await cdp.call("Runtime.evaluate", {
      expression,
      awaitPromise: true,
      returnByValue: true,
    }, sessionId);
    if (result.exceptionDetails) throw new Error(result.exceptionDetails.text || "browser evaluation failed");
    return result.result?.value;
  }

  async function navigate(pathname) {
    const loaded = cdp.once("Page.loadEventFired", sessionId);
    await cdp.call("Page.navigate", { url: new URL(pathname, baseUrl).href }, sessionId);
    await Promise.race([
      loaded,
      sleep(15000).then(() => { throw new Error(`navigation timeout: ${pathname}`); }),
    ]);
    await waitFor(() => evaluate("document.readyState === 'complete'"), `page did not finish: ${pathname}`);
  }

  async function screenshot(filename) {
    const { data } = await cdp.call("Page.captureScreenshot", {
      format: "png",
      captureBeyondViewport: false,
    }, sessionId);
    const file = path.join(outputDir, filename);
    fs.writeFileSync(file, Buffer.from(data, "base64"));
    return file;
  }

  await navigate("/login");
  await evaluate(`(() => {
    localStorage.setItem("dashboard_auth_token", ${JSON.stringify(tenantToken)});
    localStorage.setItem("active_workspace", ${JSON.stringify(JSON.stringify({
      id: workspaceId,
      slug: "local-v63-verification",
      name: workspaceName,
      tier: "team",
    }))});
    return true;
  })()`);
  await navigate("/");
  await waitFor(() => evaluate(`(() => {
    if (document.querySelector('[data-room-top="performance"]')) return "room";
    return [...document.querySelectorAll("button")].some((item) => item.textContent?.trim() === "나중에 설정하기") ? "onboarding" : "";
  })()`), "home did not reach onboarding or performance room");
  const onboardingButton = await evaluate(`(async () => {
    const button = [...document.querySelectorAll("button")].find((item) => item.textContent?.trim() === "나중에 설정하기");
    if (!button) return null;
    button.scrollIntoView({ block: "center" });
    await new Promise((resolve) => requestAnimationFrame(resolve));
    const rect = button.getBoundingClientRect();
    return { x: rect.left + rect.width / 2, y: rect.top + rect.height / 2 };
  })()`);
  if (onboardingButton) {
    await cdp.call("Input.dispatchMouseEvent", { type: "mousePressed", x: onboardingButton.x, y: onboardingButton.y, button: "left", clickCount: 1 }, sessionId);
    await cdp.call("Input.dispatchMouseEvent", { type: "mouseReleased", x: onboardingButton.x, y: onboardingButton.y, button: "left", clickCount: 1 }, sessionId);
  }
  try {
    await waitFor(() => evaluate(`(() => {
      if (document.querySelector('[data-room-top="performance"]')) return true;
      const button = [...document.querySelectorAll("button")].find((item) => item.textContent?.trim() === "나중에 설정하기");
      button?.click();
      return false;
    })()`), "performance room did not render");
  } catch (error) {
    const state = await evaluate(`({ href: location.href, body: document.body.innerText.slice(0, 800) })`);
    throw new Error(`${error.message}: ${JSON.stringify(state)}`);
  }

  const result = { mode, sampleCount: null, queued: false, screenshots: [], consoleErrors };
  if (mode === "empty") {
    await waitFor(() => evaluate(`(() => {
      const room = document.querySelector('[data-perf-sample="0"]');
      return Boolean(room && document.body.innerText.includes("미수집") && document.body.innerText.includes("가설 · 우리 검증 기록 아님"));
    })()`), "empty sample state or hypothesis label did not render");
    result.sampleCount = 0;
    result.screenshots.push(await screenshot("performance-empty-1440.png"));

    await evaluate(`localStorage.setItem("dashboard_auth_token", ${JSON.stringify(operatorToken)})`);
    const clicked = await evaluate(`(() => {
      const buttons = [...document.querySelectorAll("button")].filter((item) => item.textContent?.trim() === "이 제안을 생성 큐에 넣기");
      const button = buttons[1] || buttons[0];
      if (!button || button.disabled) return false;
      button.scrollIntoView({ block: "center" });
      button.click();
      return true;
    })()`);
    if (!clicked) throw new Error("enqueue suggestion button missing");
    await waitFor(() => evaluate(`document.body.innerText.includes("생성 큐에 넣었어요") || document.body.innerText.includes("이미 생성 큐에 있어요")`), "suggestion did not enter queue");
    result.queued = true;
    result.screenshots.push(await screenshot("performance-suggestion-queued-1440.png"));
  } else {
    await waitFor(() => evaluate(`(() => {
      const room = document.querySelector('[data-perf-sample="5"]');
      return Boolean(room && document.querySelector('[data-perf-proof="2"]') && document.body.innerText.includes("가장 멀리 간 글"));
    })()`), "five-sample performance state did not render");
    result.sampleCount = 5;
    result.screenshots.push(await screenshot("performance-sample-1440.png"));
  }

  if (consoleErrors.length > 0) throw new Error(`browser console errors: ${JSON.stringify(consoleErrors)}`);
  process.stdout.write(`${JSON.stringify(result, null, 2)}\n`);
} catch (error) {
  process.stderr.write(`FE1 CAPTURE FAILED: ${error?.stack || error?.message || error}\n`);
  process.exitCode = 1;
} finally {
  cdp?.close();
  chrome.kill("SIGTERM");
  try { fs.rmSync(profileDir, { recursive: true, force: true, maxRetries: 5, retryDelay: 200 }); } catch {}
}
