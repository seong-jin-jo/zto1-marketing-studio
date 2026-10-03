#!/usr/bin/env node

import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { chromium } from "playwright-core";

const scriptDir = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(scriptDir, "../..");
const baseUrl = process.env.EDITROOM_V2_BASE_URL || "http://127.0.0.1:3471";
const outputDir = process.env.EDITROOM_V2_OUTPUT_DIR || path.join(repoRoot, "logs/diff/editroom-v2-phase1");
const workspaceId = "11111111-1111-4111-8111-111111111111";

fs.mkdirSync(outputDir, { recursive: true });

function deliveryUrl(filename) {
  const body = Buffer.from(JSON.stringify({ v: 1, t: workspaceId, f: filename, e: 1 }), "utf8").toString("base64url");
  return `/api/media/${body}.c2ln`;
}

function json(route, body, status = 200) {
  return route.fulfill({ status, contentType: "application/json", body: JSON.stringify(body) });
}

function videoWork(filename) {
  const url = deliveryUrl(filename);
  return {
    id: "editroom-v2-resign-draft",
    status: "draft",
    idea: "편집실 v2 영상 재서명 검증",
    text: {
      threads: "",
      x: "",
      facebook: "",
      instagram: { caption: "", hashtags: [], slides: [] },
      shorts: { hook: "만료 주소 복구", body: "영상 주소를 다시 받아 재생합니다.", cta: "확인" },
    },
    img: null,
    vid: { url, file: url },
    includes: { threads: false, x: false, facebook: false, instagram: false, shorts: true, reels: true, tiktok: true },
    editLines: ["만료 주소 복구", "영상 주소를 다시 받아 재생합니다.", "확인"],
    editKind: "video",
    editFormat: { kind: "video", aspectRatio: "9:16", playbackSpeed: "1x", subtitleSize: "보통", voice: "기본" },
  };
}

const browser = await chromium.launch({ headless: true });
const context = await browser.newContext({ viewport: { width: 390, height: 844 } });
let currentWork = videoWork("success.mp4");
let resignMode = "success";
const consoleErrors = [];

await context.addInitScript(({ id, work }) => {
  localStorage.setItem("dashboard_auth_token", "editroom-v2-resign-token");
  localStorage.setItem("active_workspace", JSON.stringify({ id, slug: "editroom-v2-resign", name: "편집실 검증", tier: "team" }));
  localStorage.setItem(`studio_work:${id}`, JSON.stringify(work));
}, { id: workspaceId, work: currentWork });

const page = await context.newPage();
page.setDefaultTimeout(30_000);
page.on("pageerror", (error) => consoleErrors.push(error.message));
page.on("console", (message) => {
  if (message.type() === "error") consoleErrors.push(message.text());
});

await page.route("**/api/**", async (route) => {
  const request = route.request();
  const pathname = new URL(request.url()).pathname;
  if (pathname === "/api/media/resign") {
    return resignMode === "success"
      ? json(route, { ok: true, file: "/qa/alignment-sample.mp4" })
      : json(route, { ok: false, error: "not found" });
  }
  if (pathname === "/api/me") return json(route, { isOperator: false, tenant: { id: workspaceId, slug: "editroom-v2-resign", name: "편집실 검증", status: "active" } });
  if (pathname === "/api/overview") return json(route, { statusCounts: {}, followers: 0, weekDelta: 0, viralPosts: [], summary: { published: 0, engagementRate: 0 } });
  if (pathname === "/api/usage") return json(route, { today: {}, thisWeek: {}, tier: "team", quota: {} });
  if (pathname === "/api/onboarding") return json(route, { completed: true });
  if (pathname === "/api/channel-config") return json(route, {});
  if (pathname === "/api/studio/brand-setup") return json(route, { guide: null });
  if (pathname === "/api/studio/engine-status") return json(route, { ready: true });
  if (pathname === "/api/elevenlabs-voices") return json(route, { voices: [] });
  if (pathname === "/api/studio/drafts") {
    if (request.method() === "POST") return json(route, { ok: true, id: currentWork.id, bodyRevision: 1 });
    return json(route, { drafts: [currentWork], currentWork: { draftId: currentWork.id, stage: "edit", stageLabel: "편집실", idea: currentWork.idea } });
  }
  return json(route, {});
});

async function putWork(work) {
  currentWork = work;
  await page.goto(`${baseUrl}/qa/alignment-card-1.jpg`, { waitUntil: "domcontentloaded" });
  await page.evaluate(({ id, value }) => localStorage.setItem(`studio_work:${id}`, JSON.stringify(value)), { id: workspaceId, value: work });
}

try {
  await putWork(videoWork("success.mp4"));
  resignMode = "success";
  await page.goto(`${baseUrl}/studio?room=edit&kind=video&draft_id=${currentWork.id}`, { waitUntil: "domcontentloaded" });
  const player = page.locator("[data-video-el]");
  try {
    await player.waitFor();
  } catch (error) {
    const diagnostic = await page.evaluate(({ id }) => ({
      url: location.href,
      storedWork: localStorage.getItem(`studio_work:${id}`),
      room: document.querySelector('[data-room="edit"]')?.outerHTML.slice(0, 4_000),
      bodyText: document.body.innerText.slice(0, 1_500),
    }), { id: workspaceId });
    await page.screenshot({ path: path.join(outputDir, "p1-01-resign-diagnostic.png") });
    throw new Error(`영상 fixture를 복원하지 못했습니다: ${JSON.stringify(diagnostic)}`, { cause: error });
  }
  await page.waitForFunction(() => {
    const video = document.querySelector("[data-video-el]");
    return video?.getAttribute("src") === "/qa/alignment-sample.mp4" && video.readyState >= 1;
  });
  const success = await player.evaluate((video) => ({
    src: video.getAttribute("src"),
    readyState: video.readyState,
    duration: video.duration,
  }));
  await page.screenshot({ path: path.join(outputDir, "p1-01-resign-success-390x844.png") });

  await putWork(videoWork("failure.mp4"));
  resignMode = "failure";
  await page.goto(`${baseUrl}/studio?room=edit&kind=video&draft_id=${currentWork.id}`, { waitUntil: "domcontentloaded" });
  const failure = page.locator("[data-video-load-failed]");
  await failure.waitFor();
  const retry = page.getByRole("button", { name: "영상 주소 다시 받기" });
  await retry.waitFor();
  const failureText = (await failure.innerText()).trim();
  await page.screenshot({ path: path.join(outputDir, "p1-01-resign-failure-390x844.png") });

  resignMode = "success";
  await retry.click();
  await page.waitForFunction(() => document.querySelector("[data-video-el]")?.getAttribute("src") === "/qa/alignment-sample.mp4");
  const recoveredSrc = await page.locator("[data-video-el]").getAttribute("src");

  if (consoleErrors.length) throw new Error(`브라우저 콘솔 오류: ${JSON.stringify(consoleErrors)}`);
  const report = { success, failureText, retryVisible: true, recoveredSrc, consoleErrors };
  fs.writeFileSync(path.join(outputDir, "p1-01-resign-observations.json"), `${JSON.stringify(report, null, 2)}\n`);
  process.stdout.write(`${JSON.stringify(report)}\n`);
} finally {
  await browser.close();
}
