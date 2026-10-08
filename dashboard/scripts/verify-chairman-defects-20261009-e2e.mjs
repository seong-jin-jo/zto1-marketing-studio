#!/usr/bin/env node

import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { chromium } from "playwright-core";
import sharp from "sharp";

const scriptDir = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(scriptDir, "../..");
const baseUrl = process.env.CHAIRMAN_FIX_BASE_URL || "http://127.0.0.1:3471";
const outputDir = process.env.CHAIRMAN_FIX_OUTPUT_DIR || path.join(repoRoot, "logs/diff/editroom-chairman-fix-20261009/after");
const workspaceId = "11111111-1111-4111-8111-111111111111";
const imageUrl = "/qa/alignment-card-1.jpg";
const videoUrl = "/qa/alignment-sample.mp4";
const lines = ["문제를 먼저 짚습니다", "이 구간은 컷합니다", "다음 행동을 제안합니다"];

fs.mkdirSync(outputDir, { recursive: true });

function json(route, body, status = 200) {
  return route.fulfill({ status, contentType: "application/json", body: JSON.stringify(body) });
}

const initialWork = {
  idea: "회장 결함 통합 검증",
  text: {
    threads: "실제 미디어가 모든 방에 이어지는지 확인합니다.",
    x: "실제 미디어 흐름 검증",
    facebook: "실제 이미지와 영상 미리보기",
    instagram: { caption: "카드뉴스 캡션", hashtags: ["통합검증"], slides: lines },
    shorts: { hook: lines[0], body: lines[1], cta: lines[2] },
  },
  img: null,
  vid: { url: videoUrl, file: videoUrl, filename: "alignment-sample.mp4", subtitlesBaked: false },
  includes: { threads: true, x: true, facebook: true, instagram: true, shorts: true, reels: true, tiktok: true },
  editLines: lines,
  editKind: "card",
  editFormat: { kind: "card", aspectRatio: "4:5", background: "화이트", subtitleSize: "보통" },
};

const browser = await chromium.launch({ headless: true });
const context = await browser.newContext({ viewport: { width: 1440, height: 900 } });
await context.addInitScript(({ id, work }) => {
  localStorage.setItem("dashboard_auth_token", "chairman-fix-token");
  localStorage.setItem("active_workspace", JSON.stringify({ id, slug: "chairman-fix", name: "회장 통합 검증", tier: "team" }));
  localStorage.setItem(`studio_work:${id}`, JSON.stringify(work));
}, { id: workspaceId, work: initialWork });

const page = await context.newPage();
page.setDefaultTimeout(90_000);
const consoleErrors = [];
const draftSaves = [];
const apiRequests = [];
let currentDraft = null;
page.on("pageerror", (error) => consoleErrors.push(error.message));
page.on("console", (message) => { if (message.type() === "error") consoleErrors.push(message.text()); });

await page.route("**/api/**", async (route) => {
  const request = route.request();
  const requestUrl = new URL(request.url());
  const pathname = requestUrl.pathname;
  apiRequests.push(`${request.method()} ${pathname}`);
  if (pathname === "/api/me") return json(route, { isOperator: false, tenant: { id: workspaceId, slug: "chairman-fix", name: "회장 통합 검증", status: "active" } });
  if (pathname === "/api/overview") return json(route, { statusCounts: {}, followers: 0, weekDelta: 0, viralPosts: [], summary: { published: 0, engagementRate: 0 } });
  if (pathname === "/api/usage") return json(route, { today: {}, thisWeek: {}, tier: "team", quota: {} });
  if (pathname === "/api/onboarding") return json(route, { completed: true });
  if (pathname === "/api/channel-config") return json(route, { threads: { connected: true }, x: { connected: true }, facebook: { connected: true }, instagram: { connected: true }, youtube: { connected: true }, tiktok: { connected: true } });
  if (pathname === "/api/studio/brand-setup") return json(route, { guide: null });
  if (pathname === "/api/studio/engine-status") return json(route, { ready: true });
  if (pathname === "/api/studio/estimate") return json(route, { ok: true, min_minor: 10, max_minor: 20, estimated_seconds_min: 1, estimated_seconds_max: 2, assumptions: ["브라우저 통합 검증"] });
  if (pathname === "/api/higgsfield/image") return json(route, { ok: true, jobId: "chairman-image-job" }, 202);
  if (pathname === "/api/higgsfield/job/chairman-image-job") return json(route, { ok: true, status: "completed", file: imageUrl, url: imageUrl, filename: "alignment-card-1.jpg" });
  if (pathname === "/api/higgsfield/status") return json(route, { credits: 100 });
  if (pathname === "/api/media/resign") {
    const body = request.postDataJSON();
    return json(route, { ok: true, file: body?.purpose === "video" ? videoUrl : imageUrl });
  }
  if (pathname === "/api/studio/drafts") {
    if (request.method() === "POST") {
      const body = request.postDataJSON();
      draftSaves.push(body);
      currentDraft = { ...currentDraft, ...body, id: body.id || currentDraft?.id || "chairman-draft", status: body.status || "draft" };
      return json(route, { ok: true, id: currentDraft.id, bodyRevision: draftSaves.length });
    }
    if (requestUrl.searchParams.get("id")) return json(route, { draft: currentDraft });
    return json(route, { drafts: currentDraft ? [currentDraft] : [], currentWork: currentDraft ? { draftId: currentDraft.id, stage: "edit", stageLabel: "편집실", idea: currentDraft.idea } : null });
  }
  if (/^\/api\/studio\/drafts\/[^/]+$/.test(pathname)) return currentDraft ? json(route, currentDraft) : json(route, { error: "not found" }, 404);
  if (pathname === "/api/publish/first-comment-capabilities") return json(route, { capabilities: [] });
  if (/^\/api\/channels\/[^/]+\/accounts$/.test(pathname)) return json(route, { accounts: [{ id: "account-1", display_name: "운영 계정", username: "studio.official", is_default: true, connection_state: "connected" }] });
  if (pathname === "/api/tiktok/creator-info") return json(route, { username: "studio.official", privacy_level_options: ["PUBLIC_TO_EVERYONE"], max_video_post_duration_sec: 600, duet_disabled: false, stitch_disabled: false, comment_disabled: false });
  if (pathname === "/api/queue") return json(route, { posts: [] });
  if (pathname === "/api/images") return json(route, { images: [] });
  if (pathname === "/api/elevenlabs-voices") return json(route, { voices: [] });
  return json(route, {});
});

async function assertNoHorizontalOverflow(label) {
  const measure = await page.evaluate(() => ({ client: document.documentElement.clientWidth, scroll: document.documentElement.scrollWidth }));
  if (measure.scroll > measure.client + 1) throw new Error(`${label} 가로 넘침: ${JSON.stringify(measure)}`);
  return measure;
}

await page.goto(`${baseUrl}/studio?room=create`, { waitUntil: "networkidle" });
await page.getByTestId("create-card-image").click();
await page.getByTestId("cost-approval-approve").click();
try {
  await page.getByTestId("create-made-image").waitFor({ state: "attached", timeout: 30_000 });
} catch (error) {
  await page.screenshot({ path: path.join(outputDir, "failed-create.png") });
  fs.writeFileSync(path.join(outputDir, "failed-create.json"), JSON.stringify({
    apiRequests,
    draftSaves,
    consoleErrors,
    body: (await page.locator("body").innerText()).slice(0, 4000),
  }, null, 2));
  throw error;
}
await page.evaluate(() => window.scrollTo(0, 0));
const createRect = await page.getByTestId("create-made").boundingBox();
if (!createRect || createRect.y + createRect.height > 900) throw new Error(`생성 결과가 첫 화면 밖입니다: ${JSON.stringify(createRect)}`);
const generatedNaturalWidth = await page.getByTestId("create-made-image").evaluate((image) => image.naturalWidth);
if (generatedNaturalWidth <= 0) throw new Error("생성 결과 이미지가 실제 픽셀을 불러오지 못했습니다");
if (!draftSaves.some((save) => save.img?.file === imageUrl && save.vid?.file === videoUrl)) throw new Error("생성 결과 이미지와 기존 영상이 같은 초안에 저장되지 않았습니다");

await page.getByRole("button", { name: /작업물 전체/ }).click();
await page.getByTestId("work-thumbnail-chairman-draft").waitFor();
await page.screenshot({ path: path.join(outputDir, "create-1440x900.png") });

await page.locator('[data-work-item="chairman-draft"]').click();
const editRoom = page.locator('[data-room="edit"]');
try {
  await editRoom.locator('[data-card-canvas-editor]').waitFor({ timeout: 15_000 });
} catch (error) {
  fs.writeFileSync(path.join(outputDir, "failed-work-item-edit.json"), JSON.stringify({
    currentDraft,
    roomText: (await editRoom.innerText().catch(() => "편집실 없음")).slice(0, 5000),
    apiRequests,
    consoleErrors,
  }, null, 2));
  await page.screenshot({ path: path.join(outputDir, "failed-work-item-edit.png") });
  throw error;
}
await editRoom.locator('[data-card-slide-scene]').waitFor();
const cardBackground = editRoom.locator('[data-card-slide-scene] img').first();
await cardBackground.waitFor();
if (await cardBackground.evaluate((image) => image.naturalWidth) <= 0) throw new Error("편집실 카드에 실제 생성 이미지 픽셀이 표시되지 않았습니다");
const stageRect = await editRoom.locator('[data-card-slide-scene]').boundingBox();
if (!stageRect || stageRect.y + stageRect.height > 900) {
  const geometry = await editRoom.evaluate((root) => Array.from(root.querySelectorAll('[data-room-top="edit"], [data-card-canvas-editor] > *, [data-edit-workspace]')).map((node) => {
    const rect = node.getBoundingClientRect();
    return { tag: node.tagName, marker: node.getAttribute("data-card-template-gallery") || node.getAttribute("data-edit-workspace") || node.getAttribute("role") || node.className, y: rect.y, height: rect.height };
  }));
  await page.screenshot({ path: path.join(outputDir, "failed-edit-card-first-screen.png") });
  throw new Error(`카드 캔버스가 1440 첫 화면 밖입니다: ${JSON.stringify({ stageRect, geometry })}`);
}
const textElement = editRoom.locator('[data-element-selection]').first();
const beforeBox = await textElement.boundingBox();
const beforePixels = await editRoom.locator('[data-card-slide-scene]').screenshot();
if (!beforeBox) throw new Error("드래그할 카드 글자 요소가 없습니다");
await page.mouse.move(beforeBox.x + beforeBox.width / 2, beforeBox.y + beforeBox.height / 2);
await page.mouse.down();
await page.mouse.move(beforeBox.x + 84, beforeBox.y + 112, { steps: 12 });
await page.mouse.up();
const afterBox = await textElement.boundingBox();
const afterPixels = await editRoom.locator('[data-card-slide-scene]').screenshot();
if (!afterBox || (Math.abs(afterBox.x - beforeBox.x) < 2 && Math.abs(afterBox.y - beforeBox.y) < 2)) throw new Error("카드 글자 드래그 뒤 좌표가 바뀌지 않았습니다");
const pixelDiff = await sharp(beforePixels).composite([{ input: afterPixels, blend: "difference" }]).stats();
if (!pixelDiff.channels.some((channel) => channel.mean > 0.2)) throw new Error("카드 글자 드래그 뒤 미리보기 픽셀이 바뀌지 않았습니다");

for (const viewport of [{ width: 1440, height: 900 }, { width: 1512, height: 982 }, { width: 390, height: 844 }]) {
  await page.setViewportSize(viewport);
  await assertNoHorizontalOverflow(`편집실 ${viewport.width}`);
  const canvas = editRoom.locator('[data-card-slide-scene]');
  await canvas.waitFor();
  await page.screenshot({ path: path.join(outputDir, `edit-card-${viewport.width}x${viewport.height}.png`) });
}

const mobileFixture = await page.evaluate(() => {
  const clone = document.documentElement.cloneNode(true);
  clone.querySelectorAll("script, link[rel='stylesheet']").forEach((node) => node.remove());
  const css = Array.from(document.styleSheets).flatMap((sheet) => {
    try { return Array.from(sheet.cssRules).map((rule) => rule.cssText); } catch { return []; }
  }).join("\n");
  const style = document.createElement("style");
  style.textContent = css;
  clone.querySelector("head")?.append(style);
  return `<!doctype html>${clone.outerHTML}`;
});
fs.writeFileSync(path.join(outputDir, "mobile-edit-data-fixture.html"), mobileFixture);

await page.setViewportSize({ width: 1440, height: 900 });
await page.evaluate(() => window.scrollTo(0, 0));
const videoTab = editRoom.getByRole("button", { name: "영상" });
await videoTab.evaluate((element) => element.scrollIntoView({ block: "center", inline: "nearest" }));
const videoTabGeometry = await videoTab.evaluate((element) => {
  const rect = element.getBoundingClientRect();
  const hit = document.elementFromPoint(rect.x + rect.width / 2, rect.y + rect.height / 2);
  return { rect: { x: rect.x, y: rect.y, width: rect.width, height: rect.height }, hit: hit?.outerHTML.slice(0, 180) ?? null };
});
await videoTab.click({ timeout: 10_000 });
await editRoom.locator('[data-video-el]').waitFor();
await editRoom.locator('[data-video-subtitle-cut-toggle]').first().click();
const skippedTime = await editRoom.locator('[data-video-el]').evaluate((video) => {
  video.currentTime = 0.1;
  video.dispatchEvent(new Event("timeupdate"));
  return video.currentTime;
});
if (skippedTime <= 0.1) throw new Error(`컷 재생이 구간을 건너뛰지 않았습니다: ${skippedTime}`);
await page.screenshot({ path: path.join(outputDir, "edit-video-1440x900.png") });

await page.evaluate(() => window.scrollTo(0, 0));
const publishLink = page.locator('a[href*="room=publish"]').first();
await publishLink.evaluate((element) => element.scrollIntoView({ block: "center", inline: "nearest" }));
await publishLink.click({ timeout: 10_000 });
const publishRoom = page.locator('[data-room="publish"]');
await publishRoom.locator('[data-publish-preview-stack]').first().waitFor();
const previewCards = publishRoom.locator('[data-room-preview]');
const boxes = await previewCards.evaluateAll((nodes) => nodes.slice(0, 3).map((node) => {
  const rect = node.getBoundingClientRect();
  return { x: rect.x, y: rect.y, width: rect.width };
}));
if (boxes.length < 3 || !(boxes[0].y < boxes[1].y && boxes[1].y < boxes[2].y) || boxes.some((box) => Math.abs(box.x - boxes[0].x) > 2)) {
  throw new Error(`발행 플랫폼 카드가 세로로 쌓이지 않았습니다: ${JSON.stringify(boxes)}`);
}
if (await publishRoom.locator('img[src*="alignment-card-1"], video[src*="alignment-sample"]').count() < 3) throw new Error("발행 미리보기에 실제 이미지·영상이 표시되지 않았습니다");
await page.screenshot({ path: path.join(outputDir, "publish-1440x900.png") });

if (consoleErrors.length) throw new Error(`브라우저 콘솔 오류: ${JSON.stringify(consoleErrors.slice(0, 10))}`);
fs.writeFileSync(path.join(outputDir, "result.json"), JSON.stringify({
  ok: true,
  draftSaveCount: draftSaves.length,
  cardDrag: { before: beforeBox, after: afterBox, pixelMean: pixelDiff.channels.map((channel) => channel.mean) },
  videoTabGeometry,
  videoCutSkippedTo: skippedTime,
  publishBoxes: boxes,
  consoleErrors: 0,
}, null, 2));

await browser.close();
console.log(JSON.stringify({ ok: true, outputDir, draftSaveCount: draftSaves.length, videoCutSkippedTo: skippedTime }, null, 2));
