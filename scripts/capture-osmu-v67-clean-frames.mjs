import { mkdir, writeFile } from 'node:fs/promises';
import { pathToFileURL } from 'node:url';

const port = process.env.OSMU_V67_CDP_PORT || '9367';
const root = new URL('../', import.meta.url);
const prototype = new URL('docs/prototype/osmu-v67-edit-publish-hub-gpt-codex-20260902-0448.html', root);
const outputDir = new URL('docs/design/clean-frames/', root);
const artifactUrl = pathToFileURL(prototype.pathname).href;
const sleep = ms => new Promise(resolve => setTimeout(resolve, ms));

await mkdir(outputDir, { recursive: true });
const target = await fetch(`http://127.0.0.1:${port}/json/new?about:blank`, { method: 'PUT' }).then(r => r.json());
const socket = new WebSocket(target.webSocketDebuggerUrl);
await new Promise((resolve, reject) => {
  socket.addEventListener('open', resolve, { once: true });
  socket.addEventListener('error', reject, { once: true });
});

let sequence = 0;
const pending = new Map();
const errors = [];
socket.addEventListener('message', event => {
  const message = JSON.parse(event.data);
  if (message.id && pending.has(message.id)) {
    const item = pending.get(message.id);
    pending.delete(message.id);
    message.error ? item.reject(new Error(message.error.message)) : item.resolve(message.result);
    return;
  }
  if (message.method === 'Runtime.exceptionThrown') errors.push(message.params.exceptionDetails.text || 'exception');
  if (message.method === 'Runtime.consoleAPICalled' && message.params.type === 'error') {
    errors.push(message.params.args.map(x => x.value || x.description || '').join(' '));
  }
});
function send(method, params = {}) {
  const id = ++sequence;
  socket.send(JSON.stringify({ id, method, params }));
  return new Promise((resolve, reject) => pending.set(id, { resolve, reject }));
}
async function evaluate(expression) {
  const result = await send('Runtime.evaluate', { expression, returnByValue: true, awaitPromise: true });
  if (result.exceptionDetails) throw new Error(result.exceptionDetails.text);
  return result.result.value;
}
await send('Page.enable');
await send('Runtime.enable');

const plan = [];
for (const room of ['edit', 'publish']) {
  for (const viewport of [1024, 390]) {
    for (const state of ['normal', 'empty', 'loading', 'error', 'disabled', 'overflow']) {
      plan.push({ room, viewport, state });
    }
  }
}
const only = process.env.OSMU_V67_ONLY || '';
const capturePlan = only ? plan.filter(x => `${x.room}-${x.state}-${x.viewport}` === only) : plan;
const report = { generatedAt: new Date().toISOString(), prototype: prototype.pathname, frames: [], consoleErrors: errors };
for (const item of capturePlan) {
  const height = item.viewport === 390 ? 844 : 900;
  await send('Emulation.setDeviceMetricsOverride', {
    width: item.viewport,
    height,
    deviceScaleFactor: 1,
    mobile: false,
    screenWidth: item.viewport,
    screenHeight: height
  });
  const url = `${artifactUrl}?clean=1&room=${item.room}&state=${item.state}&vp=${item.viewport}`;
  await send('Page.navigate', { url });
  await evaluate(`document.fonts.ready.then(() => document.readyState)`);
  await sleep(80);
  await evaluate(`(() => {
    window.scrollTo(0, 0);
    document.querySelectorAll('.content,.workarea,.chat-body').forEach(x => { x.scrollTop = 0; x.scrollLeft = 0; });
    return { scrollX, scrollY };
  })()`);
  const audit = await evaluate(`(() => ({
    ready: document.readyState,
    room: document.documentElement.dataset.currentRoom,
    state: document.documentElement.dataset.currentState,
    viewport: document.documentElement.dataset.currentVp,
    overflowX: document.documentElement.dataset.overflowX,
    targetUnder44: document.documentElement.dataset.targetUnder44,
    consoleError: document.documentElement.dataset.consoleError,
    reviewControlsVisible: [...document.querySelectorAll('[data-review-controls]')].some(x => getComputedStyle(x).display !== 'none'),
    bodyScrollWidth: document.body.scrollWidth,
    innerWidth: innerWidth,
    scrollX,
    scrollY,
    rects: Object.fromEntries(['.prototype','.app-main','.gnb-wrap','.workarea','.content','.chat-dock'].map(selector => {
      const element = document.querySelector(selector);
      if (!element) return [selector, null];
      const rect = element.getBoundingClientRect();
      return [selector, { x: rect.x, y: rect.y, width: rect.width, height: rect.height }];
    }))
  }))()`);
  const base = `osmu-v67-${item.room}-${item.state}-${item.viewport}-gpt-codex-20260902-0448`;
  const shot = await send('Page.captureScreenshot', { format: 'png', fromSurface: true, captureBeyondViewport: false });
  await writeFile(new URL(`${base}.png`, outputDir), Buffer.from(shot.data, 'base64'));
  const stamp = `# STAMP\n\n- line: osmu-v67\n- artifact: ${base}.png\n- created: 2026-09-02 04:48 KST\n- model: gpt-codex/gpt-5.6-sol\n- agent: product-designer\n- skills: design-html, design-review\n- route: ${item.room}\n- state: ${item.state}\n- viewport: ${item.viewport}x${height}\n- seed: osmu-v67-static-seed-01\n- source: docs/prototype/osmu-v67-edit-publish-hub-gpt-codex-20260902-0448.html\n- 고민 한 줄: 같은 셸과 같은 씨앗에서 상태 하나만 바꿔 비교 가능성을 지켰다.\n`;
  await writeFile(new URL(`${base}.png.stamp.md`, outputDir), stamp);
  report.frames.push({ file: `${base}.png`, ...item, height, audit });
  process.stdout.write(`captured ${base}.png\n`);
}
await writeFile(new URL('osmu-v67-capture-audit-gpt-codex-20260902-0448.json', outputDir), JSON.stringify(report, null, 2));
console.log(`frames=${report.frames.length} consoleErrors=${errors.length}`);
socket.close();
