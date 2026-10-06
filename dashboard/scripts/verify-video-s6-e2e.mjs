#!/usr/bin/env node
import { execFileSync } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { ensureBrowser } from "@remotion/renderer";
import { chromium } from "playwright-core";
import { createJiti } from "jiti";

const jiti = createJiti(import.meta.url, { alias: { "@": path.resolve("src") } });
const { addComment, addOverlay, addTextSticker, emptyVideoEdit, setSubtitles, setVideoMusic } = await jiti.import("../src/lib/studio/video-edit-contract.ts");
const baseUrl = process.env.VIDEO_S6_BASE_URL || "http://localhost:3476";
const outputDir = process.env.VIDEO_S6_OUTPUT_DIR || path.resolve(process.cwd(), "../docs/qa/editroom-v2-s6");
const snapshotPath = process.env.VIDEO_S6_SNAPSHOT || path.join(os.tmpdir(), "editroom-v2-s6-mobile-snapshot.html");
const workspaceId = "61111111-1111-4111-8111-111111111111";
const draftId = "62222222-2222-4222-8222-222222222222";
const fixtureRoot = fs.mkdtempSync(path.join(os.tmpdir(), "editroom-v2-s6-browser-"));
const fixtureVideo = path.join(fixtureRoot, "source.mp4");

execFileSync(process.env.FFMPEG_BIN || "ffmpeg", [
  "-y", "-f", "lavfi", "-i", "testsrc2=size=360x640:rate=30:duration=4",
  "-f", "lavfi", "-i", "sine=frequency=440:duration=4",
  "-c:v", "libx264", "-pix_fmt", "yuv420p", "-c:a", "aac", "-shortest", fixtureVideo,
], { stdio: "ignore" });
const fixtureBytes = fs.readFileSync(fixtureVideo);

let videoEdit = emptyVideoEdit();
videoEdit = setSubtitles(videoEdit, [
  { id: "s6-sub-1", order: 0, text: "첫 장면 자막", startSec: 0, endSec: 1.3, cut: false },
  { id: "s6-sub-2", order: 1, text: "둘째 장면 자막", startSec: 1.3, endSec: 2.6, cut: false },
  { id: "s6-sub-3", order: 2, text: "마지막 장면 자막", startSec: 2.6, endSec: 4, cut: false },
]);
videoEdit = addTextSticker(videoEdit, { kind: "text", text: "핵심 제목", startSec: 0.4, endSec: 2.4, animation: "rise" });
videoEdit = addOverlay(videoEdit, "hook", "3초 만에 원인 하나", 0.2, 2.2);
videoEdit = addComment(videoEdit, { author: "실사용자", text: "이 순서가 핵심이네요", source: "collected", startSec: 1, endSec: 3.4 });
videoEdit = setVideoMusic(videoEdit, { source: "builtin", assetId: "calm-focus", label: "차분한 집중", volume: 18, offsetSec: 0, fadeOut: true, duckUnderVoice: true, rightsConfirmed: true });
let videoEditServerRevision = 1;
const saves = [];

function work() {
  return {
    idea: "S6 영상 5레인 실구동",
    draftId,
    editKind: "video",
    editFormat: { kind: "video", aspectRatio: "9:16", subtitleSize: "보통" },
    editLines: ["첫 장면 자막", "둘째 장면 자막", "마지막 장면 자막"],
    videoEdit,
    videoEditServerRevision,
    vid: { file: "/api/media/s6-browser-source", url: "/api/media/s6-browser-source", editSource: { filename: "source.mp4", url: "/api/media/s6-browser-source" } },
    bodyRevision: 0,
    includes: {},
    publishReconciliations: {},
    publishProgress: { running: false, stopped: false, status: {}, urls: {}, errors: {}, already: {} },
  };
}

function draft() {
  return { id: draftId, ...work(), status: "draft", savedAt: "2026-10-07T00:00:00.000Z" };
}

function json(route, body, status = 200) {
  return route.fulfill({ status, contentType: "application/json", body: JSON.stringify(body) });
}

async function waitUntil(predicate, timeoutMs, message) {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    if (predicate()) return;
    await new Promise((resolve) => setTimeout(resolve, 50));
  }
  throw new Error(message);
}

fs.mkdirSync(outputDir, { recursive: true });
const browserInfo = await ensureBrowser({ logLevel: "silent" });
const browser = await chromium.launch({ headless: true, executablePath: browserInfo.path });
const context = await browser.newContext({ viewport: { width: 1440, height: 1000 } });
await context.addInitScript(({ id, state }) => {
  localStorage.setItem("dashboard_auth_token", "video-s6-token");
  localStorage.setItem("active_workspace", JSON.stringify({ id, slug: "s6", name: "S6 실구동", tier: "team" }));
  localStorage.setItem(`studio_work:${id}`, JSON.stringify(state));
}, { id: workspaceId, state: work() });

await context.route("**/api/media/s6-browser-source", (route) => route.fulfill({ status: 200, contentType: "video/mp4", body: fixtureBytes }));
await context.route("**/api/**", async (route) => {
  const request = route.request();
  const pathname = new URL(request.url()).pathname;
  if (pathname === "/api/media/s6-browser-source") return route.fulfill({ status: 200, contentType: "video/mp4", body: fixtureBytes });
  if (pathname === "/api/me") return json(route, { isOperator: false, tenant: { id: workspaceId, slug: "s6", name: "S6 실구동", status: "active" } });
  if (pathname === "/api/elevenlabs-voices") return json(route, { voices: [] });
  if (pathname === "/api/studio/drafts") {
    if (request.method() !== "POST") return json(route, new URL(request.url()).searchParams.has("id") ? { draft: draft() } : { drafts: [draft()], currentWork: null });
    const body = JSON.parse(request.postData() || "{}");
    saves.push(body);
    if (body.videoEdit) videoEdit = structuredClone(body.videoEdit);
    videoEditServerRevision += 1;
    return json(route, { ok: true, id: draftId, bodyRevision: 0, videoEditServerRevision });
  }
  if (pathname === "/api/studio/brand-setup") return json(route, { guide: null });
  if (pathname === "/api/publish/first-comment-capabilities") return json(route, { capabilities: [] });
  if (/^\/api\/channels\/[^/]+\/accounts$/.test(pathname)) return json(route, { accounts: [] });
  if (pathname === "/api/images") return json(route, { images: [] });
  if (pathname === "/api/schedule") return json(route, { schedules: [] });
  return json(route, {});
});

const page = await context.newPage();
const consoleErrors = [];
const failedRequests = [];
page.on("pageerror", (error) => consoleErrors.push(error.message));
page.on("console", (message) => { if (message.type() === "error") consoleErrors.push(message.text()); });
page.on("requestfailed", (request) => failedRequests.push(`${request.method()} ${request.url()} ${request.failure()?.errorText || "failed"}`));

try {
  await page.goto(`${baseUrl}/studio?room=edit&kind=video&draft_id=${draftId}`, { waitUntil: "networkidle", timeout: 60_000 });
  try {
    await page.locator("[data-video-workbench]").waitFor({ state: "visible", timeout: 60_000 });
  } catch (error) {
    const diagnostic = { url: page.url(), body: (await page.locator("body").innerText()).slice(0, 4_000), consoleErrors, failedRequests };
    await page.screenshot({ path: path.join(outputDir, "s6-video-load-failure.png"), fullPage: true });
    console.error("S6_LOAD_DIAGNOSTIC", JSON.stringify(diagnostic, null, 2));
    throw error;
  }
  if (await page.locator("[data-video-timeline-lane]").count() !== 5) throw new Error("5레인 타임라인이 렌더되지 않았습니다");
  if (await page.locator('[data-video-timeline-block="subtitle"]').count() !== 3) throw new Error("데이터 자막 블록 3개가 렌더되지 않았습니다");
  if (await page.locator('[data-video-timeline-block="text"]').count() < 1 || await page.locator('[data-video-timeline-block="overlay"]').count() < 1) throw new Error("글·훅 데이터 블록이 없습니다");

  const video = page.locator("[data-video-el]");
  if (await video.count() !== 1) {
    const diagnostic = { url: page.url(), body: (await page.locator("body").innerText()).slice(0, 4_000), consoleErrors, failedRequests };
    await page.screenshot({ path: path.join(outputDir, "s6-video-element-failure.png"), fullPage: true });
    console.error("S6_VIDEO_DIAGNOSTIC", JSON.stringify(diagnostic, null, 2));
    throw new Error("실제 video 엘리먼트가 렌더되지 않았습니다");
  }
  await video.evaluate((element) => new Promise((resolve, reject) => {
    const media = element;
    if (media.readyState >= 1) return resolve();
    media.addEventListener("loadedmetadata", () => resolve(), { once: true });
    media.addEventListener("error", () => reject(new Error("fixture video load failed")), { once: true });
  }));
  await page.getByRole("button", { name: "재생", exact: true }).click();
  await page.waitForFunction(() => document.querySelector("[data-video-el]")?.currentTime > 0.15, null, { timeout: 10_000 });
  const playbackTime = await video.evaluate((element) => element.currentTime);
  await page.getByRole("button", { name: "일시정지", exact: true }).click();

  const block = page.locator('[data-video-timeline-block="subtitle"]').first();
  const beforeDrag = await block.getAttribute("aria-label");
  const blockBox = await block.boundingBox();
  if (!blockBox) throw new Error("자막 블록 끌기 좌표를 찾지 못했습니다");
  const dragStartX = blockBox.x + blockBox.width / 2;
  await block.dispatchEvent("pointerdown", { pointerId: 1, clientX: dragStartX, clientY: blockBox.y + blockBox.height / 2, bubbles: true });
  await page.waitForTimeout(100);
  await page.evaluate((clientX) => window.dispatchEvent(new PointerEvent("pointermove", { pointerId: 1, clientX, bubbles: true })), dragStartX + 24);
  await page.evaluate((clientX) => window.dispatchEvent(new PointerEvent("pointerup", { pointerId: 1, clientX, bubbles: true })), dragStartX + 24);
  const afterDrag = await block.getAttribute("aria-label");
  if (beforeDrag === afterDrag) throw new Error("자막 블록 끌기가 시간을 바꾸지 않았습니다");

  const endHandle = block.getByRole("button", { name: /끝점 조절/ });
  const beforeResize = await block.getAttribute("aria-label");
  const endBox = await endHandle.boundingBox();
  if (!endBox) throw new Error("자막 끝점 조절 좌표를 찾지 못했습니다");
  const resizeStartX = endBox.x + endBox.width / 2;
  await endHandle.dispatchEvent("pointerdown", { pointerId: 2, clientX: resizeStartX, clientY: endBox.y + endBox.height / 2, bubbles: true });
  await page.waitForTimeout(100);
  await page.evaluate((clientX) => window.dispatchEvent(new PointerEvent("pointermove", { pointerId: 2, clientX, bubbles: true })), resizeStartX + 12);
  await page.evaluate((clientX) => window.dispatchEvent(new PointerEvent("pointerup", { pointerId: 2, clientX, bubbles: true })), resizeStartX + 12);
  const afterResize = await block.getAttribute("aria-label");
  if (beforeResize === afterResize) throw new Error("자막 블록 끝점 조절이 길이를 바꾸지 않았습니다");
  await waitUntil(() => saves.some((body) => Array.isArray(body.videoEdit?.subtitles) && body.videoEdit.subtitles[0]?.startSec > 0), 15_000, "끌기 결과가 초안에 저장되지 않았습니다");

  const responsive = [];
  for (const viewport of [{ width: 1440, height: 1000 }, { width: 1024, height: 900 }, { width: 390, height: 844 }]) {
    await page.setViewportSize(viewport);
    await page.locator("[data-video-workbench]").scrollIntoViewIfNeeded();
    const overflow = await page.evaluate(() => ({ width: document.documentElement.clientWidth, scroll: document.documentElement.scrollWidth }));
    if (overflow.scroll > overflow.width + 1) throw new Error(`${viewport.width}px 가로 넘침: ${JSON.stringify(overflow)}`);
    const screenshot = path.join(outputDir, `s6-video-editor-${viewport.width}.png`);
    await page.screenshot({ path: screenshot, fullPage: true });
    responsive.push({ viewport: viewport.width, overflow, screenshot });
  }

  const snapshot = await page.evaluate(() => {
    const workbench = document.querySelector("[data-video-workbench]");
    if (!(workbench instanceof HTMLElement)) throw new Error("영상 편집기 스냅샷 대상을 찾지 못했습니다");
    const css = [...document.styleSheets]
      .flatMap((sheet) => {
        try {
          return [...sheet.cssRules].map((rule) => rule.cssText);
        } catch {
          return [];
        }
      })
      .join("\n");
    return {
      css,
      htmlClass: document.documentElement.className,
      bodyClass: document.body.className,
      workbench: workbench.outerHTML,
    };
  });
  const html = `<!doctype html><html lang="ko" class="${snapshot.htmlClass}"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><style>${snapshot.css}</style></head><body class="${snapshot.bodyClass}"><main data-room="edit">${snapshot.workbench}</main></body></html>`;
  fs.writeFileSync(snapshotPath, html);
  if (consoleErrors.length) throw new Error(`브라우저 console/page 오류 ${consoleErrors.length}건: ${consoleErrors.join(" | ")}`);
  if (failedRequests.length) throw new Error(`실패 network request ${failedRequests.length}건: ${failedRequests.join(" | ")}`);

  const result = {
    result: "PASS",
    playbackTime,
    lanes: 5,
    subtitleBlocks: 3,
    beforeDrag,
    afterDrag,
    beforeResize,
    afterResize,
    savedStartSec: videoEdit.subtitles[0].startSec,
    savedEndSec: videoEdit.subtitles[0].endSec,
    saves: saves.length,
    responsive,
    consoleErrors: consoleErrors.length,
    failedRequests: failedRequests.length,
    snapshotPath,
  };
  fs.writeFileSync(path.join(outputDir, "s6-video-result.json"), JSON.stringify(result, null, 2));
  console.log(JSON.stringify(result, null, 2));
} finally {
  await browser.close();
  fs.rmSync(fixtureRoot, { recursive: true, force: true });
}
