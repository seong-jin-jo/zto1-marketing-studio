import fs from "node:fs/promises";
import path from "node:path";
import process from "node:process";
import { fileURLToPath, pathToFileURL } from "node:url";

const scriptDirectory = path.dirname(fileURLToPath(import.meta.url));
const repositoryRoot = path.resolve(scriptDirectory, "..");
const prototypePath = path.join(repositoryRoot, "docs/prototype/osmu-v68-create-performance-hub-gpt-codex-20260903-0022.html");
const outputDirectory = path.join(repositoryRoot, "docs/design/clean-frames");
const auditPath = path.join(outputDirectory, "osmu-v68-capture-audit-gpt-codex-20260903-0022.json");
const cdpPort = Number(process.env.OSMU_V68_CDP_PORT || 9468);
const stamp = "2026-09-03 00:22 KST";
const model = "gpt-codex/gpt-5.6";
const rooms = ["create", "performance"];
const states = ["normal", "empty", "loading", "error", "disabled", "overflow"];
const viewports = {
  "1024": { width: 1024, height: 900 },
  "390": { width: 390, height: 844 }
};

const roomNames = { create: "생성실", performance: "성과실" };
const stateNames = {
  normal: "기본",
  empty: "빈 상태",
  loading: "불러오는 중",
  error: "오류",
  disabled: "사용 불가",
  overflow: "긴 내용"
};

async function cdpHttp(route, options = {}) {
  const response = await fetch(`http://127.0.0.1:${cdpPort}${route}`, options);
  if (!response.ok) throw new Error(`CDP HTTP ${response.status}: ${route}`);
  return response.json();
}

async function openTarget() {
  try {
    return await cdpHttp("/json/new?about:blank", { method: "PUT" });
  } catch {
    const targets = await cdpHttp("/json");
    const target = targets.find(item => item.type === "page");
    if (!target) throw new Error("사용 가능한 크롬 페이지를 찾지 못했습니다.");
    return target;
  }
}

function createClient(webSocketUrl) {
  const socket = new WebSocket(webSocketUrl);
  let nextId = 0;
  const pending = new Map();
  const listeners = new Map();

  socket.addEventListener("message", event => {
    const message = JSON.parse(event.data);
    if (message.id) {
      const job = pending.get(message.id);
      if (!job) return;
      pending.delete(message.id);
      if (message.error) job.reject(new Error(message.error.message));
      else job.resolve(message.result);
      return;
    }
    const handlers = listeners.get(message.method) || [];
    handlers.forEach(handler => handler(message.params));
  });

  const ready = new Promise((resolve, reject) => {
    socket.addEventListener("open", resolve, { once: true });
    socket.addEventListener("error", reject, { once: true });
  });

  return {
    ready,
    send(method, params = {}) {
      const id = ++nextId;
      socket.send(JSON.stringify({ id, method, params }));
      return new Promise((resolve, reject) => pending.set(id, { resolve, reject }));
    },
    on(method, handler) {
      const handlers = listeners.get(method) || [];
      handlers.push(handler);
      listeners.set(method, handlers);
    },
    close() { socket.close(); }
  };
}

async function waitForReady(send) {
  const started = Date.now();
  while (Date.now() - started < 8000) {
    const result = await send("Runtime.evaluate", {
      expression: `document.documentElement.dataset.ready === "true"`,
      returnByValue: true
    });
    if (result.result.value === true) return;
    await new Promise(resolve => setTimeout(resolve, 80));
  }
  throw new Error("프로토타입 준비 상태를 8초 안에 확인하지 못했습니다.");
}

async function evaluate(send, expression) {
  const result = await send("Runtime.evaluate", { expression, returnByValue: true });
  if (result.exceptionDetails) throw new Error(result.exceptionDetails.text || "브라우저 평가 오류");
  return result.result.value;
}

function frameFileName(room, state, viewport) {
  return `osmu-v68-${room}-${state}-${viewport}-gpt-codex-20260903-0022.png`;
}

await fs.mkdir(outputDirectory, { recursive: true });
const target = await openTarget();
const client = createClient(target.webSocketDebuggerUrl);
await client.ready;
const send = client.send.bind(client);
const consoleErrors = [];
client.on("Runtime.exceptionThrown", payload => consoleErrors.push(payload.exceptionDetails?.text || "실행 오류"));
client.on("Log.entryAdded", payload => {
  if (payload.entry?.level === "error") consoleErrors.push(payload.entry.text);
});
await send("Page.enable");
await send("Runtime.enable");
await send("Log.enable");

const frames = [];
for (const room of rooms) {
  for (const viewport of Object.keys(viewports)) {
    const metrics = viewports[viewport];
    for (const state of states) {
      consoleErrors.length = 0;
      await send("Emulation.setDeviceMetricsOverride", {
        width: metrics.width,
        height: metrics.height,
        deviceScaleFactor: 1,
        mobile: viewport === "390"
      });
      const url = new URL(pathToFileURL(prototypePath));
      url.searchParams.set("room", room);
      url.searchParams.set("state", state);
      url.searchParams.set("viewport", viewport);
      url.searchParams.set("clean", "1");
      await send("Page.navigate", { url: url.href });
      await waitForReady(send);
      await new Promise(resolve => setTimeout(resolve, state === "loading" ? 180 : 80));

      const audit = await evaluate(send, `(() => {
        const root = document.documentElement;
        const device = document.getElementById("device");
        const review = document.querySelector(".review-bar");
        const main = document.querySelector(".main-pane");
        const assistant = document.querySelector(".assistant-pane");
        const rect = node => node ? ({ x: node.getBoundingClientRect().x, y: node.getBoundingClientRect().y, width: node.getBoundingClientRect().width, height: node.getBoundingClientRect().height }) : null;
        return {
          ready: root.dataset.ready,
          room: root.dataset.room,
          state: root.dataset.state,
          viewport: root.dataset.viewport,
          overflowX: root.dataset.overflowX,
          targetUnder44: Number(root.dataset.targetUnder44 || 0),
          consoleError: root.dataset.consoleError || "",
          reviewControlsVisible: review ? getComputedStyle(review).display !== "none" : false,
          bodyScrollWidth: document.body.scrollWidth,
          bodyScrollHeight: document.body.scrollHeight,
          innerWidth,
          innerHeight,
          scrollX,
          scrollY,
          device: rect(device),
          mainPane: rect(main),
          assistantPane: rect(assistant)
        };
      })()`);

      const screenshot = await send("Page.captureScreenshot", {
        format: "png",
        fromSurface: true,
        captureBeyondViewport: false
      });
      const file = frameFileName(room, state, viewport);
      await fs.writeFile(path.join(outputDirectory, file), Buffer.from(screenshot.data, "base64"));
      const sidecar = [
        "STAMP",
        `created_at: ${stamp}`,
        `model: ${model}`,
        "agent: product-designer",
        `room: ${roomNames[room]}`,
        `state: ${stateNames[state]}`,
        `viewport: ${metrics.width}x${metrics.height}`,
        "source: docs/prototype/osmu-v68-create-performance-hub-gpt-codex-20260903-0022.html",
        "clean: browser chrome, review controls, stamp, state toggles, user options, and explanatory overlays removed",
        ""
      ].join("\n");
      await fs.writeFile(path.join(outputDirectory, `${file}.stamp.txt`), sidecar, "utf8");
      frames.push({
        file,
        room,
        state,
        viewport: `${metrics.width}x${metrics.height}`,
        ...audit,
        consoleErrors: [...consoleErrors]
      });
    }
  }
}

const summary = {
  stamp,
  model,
  source: "docs/prototype/osmu-v68-create-performance-hub-gpt-codex-20260903-0022.html",
  expectedFrames: 24,
  capturedFrames: frames.length,
  rules: {
    exactViewport: ["1024x900", "390x844"],
    cleanExport: true,
    fullPageCapture: false,
    expectedOverflowX: "false",
    expectedTargetUnder44: 0,
    expectedConsoleErrors: 0
  },
  frames
};
await fs.writeFile(auditPath, `${JSON.stringify(summary, null, 2)}\n`, "utf8");
client.close();
console.log(`captured ${frames.length} frames`);
console.log(path.relative(repositoryRoot, auditPath));
