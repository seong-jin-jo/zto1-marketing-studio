#!/usr/bin/env node
import fs from "node:fs";
import path from "node:path";
import { ensureBrowser } from "@remotion/renderer";
import { chromium } from "playwright-core";
import { createJiti } from "jiti";
import sharp from "sharp";

const jiti = createJiti(import.meta.url, { alias: { "@": path.resolve("src") } });
const { validateCardDeckV3 } = await jiti.import("../src/lib/studio/card-element-contract.ts");
const { cardSlideRenderModel } = await jiti.import("../src/lib/studio/card-render-model.ts");
const { renderCardSlidePng } = await jiti.import("../src/lib/studio/card-slide-render.ts");

const baseUrl = process.env.CARD_FREEFORM_BASE_URL || "http://127.0.0.1:3472";
const outputDir = process.env.CARD_FREEFORM_OUTPUT_DIR || path.resolve(process.cwd(), "../docs/qa/editroom-v2-s2");
const workspaceId = "31111111-1111-4111-8111-111111111111";
const draftId = "32222222-2222-4222-8222-222222222222";
const lines = ["AI 카드 첫 장", "두 번째 AI 카드", "저장하고 다시 보세요"];
const positions = ["top-center", "center", "bottom-center"];
const backgroundSvg = "data:image/svg+xml;base64,PHN2ZyB4bWxucz0naHR0cDovL3d3dy53My5vcmcvMjAwMC9zdmcnIHdpZHRoPScxMDgwJyBoZWlnaHQ9JzEzNTAnPjxyZWN0IHdpZHRoPScxMDgwJyBoZWlnaHQ9JzEzNTAnIGZpbGw9JyNGNUYwRTgnLz48Y2lyY2xlIGN4PSc4ODAnIGN5PScxODAnIHI9JzEyMCcgZmlsbD0nI0Q2RTZGRicvPjwvc3ZnPg==";
const uploadedAssets = {};
let uploadCount = 0;
let bodyRevision = 0;
let serverDeck = null;
let serverLegacyDeck = null;
const posts = [];

fs.mkdirSync(outputDir, { recursive: true });

function draft(includeV3 = false) {
  return {
    id: draftId,
    idea: "S2 AI 카드 직접 편집 실구동",
    editKind: "card",
    editFormat: { kind: "card", aspectRatio: "4:5" },
    editLines: lines,
    cardTextPositions: positions,
    bodyRevision,
    hasCardDeckV3: serverDeck !== null,
    img: {
      url: backgroundSvg,
      imageUrls: [backgroundSvg, backgroundSvg, backgroundSvg],
      filename: "ai-card-original.png",
      textEmbedded: true,
      textSourceRecoverable: true,
      aspectRatio: "4:5",
    },
    ...(includeV3 ? { cardDeckV3: serverDeck, cardDeck: serverLegacyDeck, cardDeckV3SourceSnapshot: null } : {}),
    status: "draft",
    savedAt: "2026-10-05T00:00:00.000Z",
  };
}

function work() {
  return {
    idea: draft().idea,
    draftId,
    editKind: "card",
    editFormat: { kind: "card", aspectRatio: "4:5" },
    editLines: lines,
    img: draft().img,
    bodyRevision,
    includes: {},
    publishReconciliations: {},
    publishProgress: { running: false, stopped: false, status: {}, urls: {}, errors: {}, already: {} },
  };
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

async function drag(page, locator, dx, dy) {
  await locator.scrollIntoViewIfNeeded();
  const box = await locator.boundingBox();
  if (!box) throw new Error("글 요소의 화면 좌표를 찾지 못했습니다");
  const x = box.x + box.width / 2;
  const y = box.y + box.height / 2;
  await page.mouse.move(x, y);
  await page.mouse.down();
  await page.mouse.move(x + dx, y + dy, { steps: 8 });
  await page.mouse.up();
}

async function comparePng(leftPath, rightPath) {
  const left = await sharp(leftPath).ensureAlpha().raw().toBuffer({ resolveWithObject: true });
  const right = await sharp(rightPath).ensureAlpha().raw().toBuffer({ resolveWithObject: true });
  if (left.info.width !== right.info.width || left.info.height !== right.info.height) {
    throw new Error(`PNG 크기가 다릅니다: ${left.info.width}x${left.info.height} / ${right.info.width}x${right.info.height}`);
  }
  let changed = 0;
  let maxChannelDelta = 0;
  for (let offset = 0; offset < left.data.length; offset += 4) {
    let pixelDelta = 0;
    for (let channel = 0; channel < 4; channel += 1) {
      const delta = Math.abs(left.data[offset + channel] - right.data[offset + channel]);
      pixelDelta = Math.max(pixelDelta, delta);
      maxChannelDelta = Math.max(maxChannelDelta, delta);
    }
    if (pixelDelta > 8) changed += 1;
  }
  return {
    width: left.info.width,
    height: left.info.height,
    changedPixels: changed,
    changedPixelRatio: changed / (left.info.width * left.info.height),
    maxChannelDelta,
  };
}

const browserInfo = await ensureBrowser({ logLevel: "silent" });
const browser = await chromium.launch({ headless: true, executablePath: browserInfo.path });
const context = await browser.newContext({ viewport: { width: 1440, height: 1000 } });
await context.addInitScript(({ id, state }) => {
  localStorage.setItem("dashboard_auth_token", "card-freeform-s2-token");
  localStorage.setItem("active_workspace", JSON.stringify({ id, slug: "s2", name: "S2 실구동", tier: "team" }));
  localStorage.setItem(`studio_work:${id}`, JSON.stringify(state));
}, { id: workspaceId, state: work() });

await context.route("**/api/**", async (route) => {
  const request = route.request();
  const pathname = new URL(request.url()).pathname;
  if (pathname === "/api/me") return json(route, { isOperator: false, tenant: { id: workspaceId, slug: "s2", name: "S2 실구동", status: "active" } });
  if (pathname === "/api/studio/drafts") {
    if (request.method() !== "POST") {
      return json(route, new URL(request.url()).searchParams.has("id") ? { draft: draft(true) } : { drafts: [draft()], currentWork: null });
    }
    const body = JSON.parse(request.postData() || "{}");
    posts.push(body);
    if (body.bodyBaseRevision !== undefined && body.bodyBaseRevision !== bodyRevision) {
      return json(route, { ok: false, code: "BODY_STALE_REVISION", latestBody: { text: null, editLines: lines, cardDeckV3: serverDeck, bodyRevision } }, 409);
    }
    if (body.cardDeckV3) {
      validateCardDeckV3(body.cardDeckV3);
      serverDeck = structuredClone(body.cardDeckV3);
      serverLegacyDeck = structuredClone(body.cardDeck);
    }
    bodyRevision += 1;
    return json(route, { ok: true, id: draftId, bodyRevision, videoEditServerRevision: null });
  }
  if (pathname === "/api/images/upload") {
    uploadCount += 1;
    const filename = `s2-ai-background-${uploadCount}.png`;
    uploadedAssets[filename] = backgroundSvg;
    return json(route, { filename, url: backgroundSvg });
  }
  if (pathname.startsWith("/api/images/") && request.method() === "DELETE") return json(route, { ok: true });
  if (pathname === "/api/media/resign") {
    const body = JSON.parse(request.postData() || "{}");
    return json(route, { ok: true, file: uploadedAssets[body.filename] || backgroundSvg });
  }
  if (pathname === "/api/studio/brand-setup") return json(route, { guide: null });
  if (pathname === "/api/publish/first-comment-capabilities") return json(route, { capabilities: [] });
  if (/^\/api\/channels\/[^/]+\/accounts$/.test(pathname)) return json(route, { accounts: [] });
  if (pathname === "/api/images") return json(route, { images: [] });
  if (pathname === "/api/schedule") return json(route, { schedules: [] });
  return json(route, {});
});

const page = await context.newPage();
const errors = [];
page.on("pageerror", (error) => errors.push(error.message));
page.on("console", (message) => { if (message.type() === "error") errors.push(message.text()); });

try {
  await page.goto(`${baseUrl}/studio?room=edit&draft_id=${draftId}`, { waitUntil: "networkidle", timeout: 60_000 });
  const entryButton = page.getByRole("button", { name: "자유 배치로 편집" });
  await entryButton.waitFor({ state: "visible", timeout: 60_000 });
  await entryButton.click();
  await page.locator("[data-card-canvas-editor]").waitFor({ state: "visible" });
  await waitUntil(() => serverDeck !== null && posts.some((post) => post.cardDeckV3 && post.cardDeck === null), 15_000, "AI 카드 v3·legacy 이중 저장 요청이 없습니다");
  if (serverDeck.slides.length !== 3) throw new Error(`데이터 카드가 3장이 아닙니다: ${serverDeck.slides.length}`);
  const firstSlide = serverDeck.slides[0];
  const background = firstSlide.elements.find((element) => element.type === "image");
  const text = firstSlide.elements.find((element) => element.type === "text");
  if (!background || !background.locked || background.z_index !== 0 || !text || text.z_index <= background.z_index) {
    throw new Error("AI 카드가 글자를 지운 바탕과 독립 글 요소로 분해되지 않았습니다");
  }

  const selection = page.locator(`[data-element-selection="${text.id}"]`);
  await selection.dblclick();
  const editor = page.getByLabel("글 내용 직접 편집");
  await editor.fill("AI 카드 문구를 1440에서 직접 수정");
  await editor.press("Tab");
  await waitUntil(() => serverDeck?.slides[0]?.elements?.find((element) => element.id === text.id)?.text.includes("1440"), 15_000, "1440 직접 글 편집이 저장되지 않았습니다");
  const before1440 = serverDeck.slides[0].elements.find((element) => element.id === text.id);
  await drag(page, selection, 64, 40);
  await waitUntil(() => {
    const current = serverDeck?.slides[0]?.elements?.find((element) => element.id === text.id);
    return current && (current.x !== before1440.x || current.y !== before1440.y);
  }, 15_000, "1440 글 요소 끌기가 저장되지 않았습니다");
  await page.screenshot({ path: path.join(outputDir, "s2-ai-freeform-1440.png"), fullPage: true });

  await page.setViewportSize({ width: 390, height: 844 });
  await selection.scrollIntoViewIfNeeded();
  await selection.dblclick();
  await page.getByLabel("글 내용 직접 편집").fill("AI 카드 문구를 390에서도 직접 수정");
  await page.getByLabel("글 내용 직접 편집").press("Tab");
  await waitUntil(() => serverDeck?.slides[0]?.elements?.find((element) => element.id === text.id)?.text.includes("390"), 15_000, "390 직접 글 편집이 저장되지 않았습니다");
  const before390 = serverDeck.slides[0].elements.find((element) => element.id === text.id);
  await drag(page, selection, 18, 12);
  await waitUntil(() => {
    const current = serverDeck?.slides[0]?.elements?.find((element) => element.id === text.id);
    return current && (current.x !== before390.x || current.y !== before390.y);
  }, 15_000, "390 글 요소 끌기가 저장되지 않았습니다");
  const overflow = await page.evaluate(() => ({ viewport: document.documentElement.clientWidth, scroll: document.documentElement.scrollWidth }));
  if (overflow.scroll > overflow.viewport + 1) throw new Error(`390px 가로 넘침: ${JSON.stringify(overflow)}`);
  await page.screenshot({ path: path.join(outputDir, "s2-ai-freeform-390.png"), fullPage: true });

  await page.setViewportSize({ width: 1600, height: 1600 });
  await page.locator("[data-card-stage]").evaluate((node) => {
    node.style.width = "1080px";
    node.style.minWidth = "1080px";
    node.style.maxWidth = "none";
  });
  await page.evaluate(() => document.fonts.ready);
  const editorPng = path.join(outputDir, "s2-card-scene-editor.png");
  const remotionPng = path.join(outputDir, "s2-card-scene-remotion.png");
  await page.locator("[data-card-slide-scene]").first().screenshot({ path: editorPng });
  const currentSlide = serverDeck.slides[0];
  await renderCardSlidePng({ model: cardSlideRenderModel(serverDeck, currentSlide.id, uploadedAssets), outputPath: remotionPng });
  const pixelDiff = await comparePng(editorPng, remotionPng);
  if (pixelDiff.changedPixelRatio > 0.005) {
    throw new Error(`editor/Remotion 픽셀 차이가 0.5%를 넘었습니다: ${JSON.stringify(pixelDiff)}`);
  }
  if (errors.length) throw new Error(`브라우저 오류 ${errors.length}건: ${errors.join(" | ")}`);
  if (serverLegacyDeck !== null) throw new Error("AI 카드는 원래 v2 덱이 없으므로 legacy null 보존 상태여야 합니다");

  const result = {
    result: "PASS",
    cards: serverDeck.slides.length,
    uploads: uploadCount,
    textElement: text.id,
    directEdit: { width1440: true, width390: true },
    drag: { width1440: true, width390: true },
    mobile: overflow,
    pixelDiff,
    consoleErrors: errors.length,
  };
  fs.writeFileSync(path.join(outputDir, "s2-freeform-result.json"), JSON.stringify(result, null, 2));
  console.log(JSON.stringify(result, null, 2));
} finally {
  await browser.close();
}
