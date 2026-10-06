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

const baseUrl = process.env.CHAT_S5_BASE_URL || "http://localhost:3475";
const outputDir = process.env.CHAT_S5_OUTPUT_DIR || path.resolve(process.cwd(), "../docs/qa/editroom-v2-s5");
const workspaceId = "51111111-1111-4111-8111-111111111111";
const draftId = "52222222-2222-4222-8222-222222222222";
const photoSvg = "data:image/svg+xml;base64,PHN2ZyB4bWxucz0naHR0cDovL3d3dy53My5vcmcvMjAwMC9zdmcnIHdpZHRoPScxMDgwJyBoZWlnaHQ9JzEzNTAnPjxyZWN0IHdpZHRoPScxMDgwJyBoZWlnaHQ9JzEzNTAnIGZpbGw9JyMzMzU1YWEnLz48Y2lyY2xlIGN4PSc4ODAnIGN5PScyMjAnIHI9JzE2MCcgZmlsbD0nIzIyYWE3NycvPjwvc3ZnPg==";
const sourceDeck = JSON.parse(fs.readFileSync(path.resolve("tests/studio/fixtures/deck-d100.v2.json"), "utf8"));
sourceDeck.slides[0].cover_image_url = photoSvg;
sourceDeck.slides[sourceDeck.slides.length - 1].cover_image_url = photoSvg;
let serverLegacyDeck = structuredClone(sourceDeck);
let serverDeck = null;
let bodyRevision = 0;
let uploadCount = 0;
const uploadedAssets = {};
const posts = [];

fs.mkdirSync(outputDir, { recursive: true });

function work() {
  return {
    idea: "S5 카톡 대화 고급 편집 실구동",
    draftId,
    editKind: "card",
    editFormat: { kind: "card", aspectRatio: "4:5" },
    editLines: ["카톡 대화 카드"],
    cardDeck: serverLegacyDeck,
    img: { url: photoSvg, file: photoSvg, imageUrls: [photoSvg], aspectRatio: "4:5", textEmbedded: false },
    bodyRevision,
    includes: {},
    publishReconciliations: {},
    publishProgress: { running: false, stopped: false, status: {}, urls: {}, errors: {}, already: {} },
  };
}

function draft(includeV3 = false) {
  return {
    id: draftId,
    idea: "S5 카톡 대화 고급 편집 실구동",
    editKind: "card",
    editFormat: { kind: "card", aspectRatio: "4:5" },
    editLines: ["카톡 대화 카드"],
    cardDeck: serverLegacyDeck,
    img: work().img,
    bodyRevision,
    hasCardDeckV3: serverDeck !== null,
    ...(includeV3 ? { cardDeckV3: serverDeck, cardDeckV3SourceSnapshot: null } : {}),
    status: "draft",
    savedAt: "2026-10-06T00:00:00.000Z",
  };
}

function json(route, body, statusCode = 200) {
  return route.fulfill({ status: statusCode, contentType: "application/json", body: JSON.stringify(body) });
}

async function waitUntil(predicate, timeoutMs, message) {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    if (predicate()) return;
    await new Promise((resolve) => setTimeout(resolve, 50));
  }
  throw new Error(message);
}

async function comparePng(leftPath, rightPath, region) {
  const left = await sharp(leftPath).extract(region).ensureAlpha().raw().toBuffer({ resolveWithObject: true });
  const right = await sharp(rightPath).extract(region).ensureAlpha().raw().toBuffer({ resolveWithObject: true });
  if (left.info.width !== right.info.width || left.info.height !== right.info.height) {
    throw new Error(`PNG 크기가 다릅니다: ${left.info.width}x${left.info.height} / ${right.info.width}x${right.info.height}`);
  }
  let changedPixels = 0;
  for (let offset = 0; offset < left.data.length; offset += 4) {
    let pixelDelta = 0;
    for (let channel = 0; channel < 4; channel += 1) pixelDelta = Math.max(pixelDelta, Math.abs(left.data[offset + channel] - right.data[offset + channel]));
    if (pixelDelta > 8) changedPixels += 1;
  }
  return { width: left.info.width, height: left.info.height, changedPixels, changedPixelRatio: changedPixels / (left.info.width * left.info.height) };
}

const browserInfo = await ensureBrowser({ logLevel: "silent" });
const browser = await chromium.launch({ headless: true, executablePath: browserInfo.path });
const context = await browser.newContext({ viewport: { width: 1440, height: 1000 } });
await context.addInitScript(({ id, state }) => {
  localStorage.setItem("dashboard_auth_token", "chat-s5-token");
  localStorage.setItem("active_workspace", JSON.stringify({ id, slug: "s5", name: "S5 실구동", tier: "team" }));
  localStorage.setItem(`studio_work:${id}`, JSON.stringify(state));
}, { id: workspaceId, state: work() });

await context.route("**/api/**", async (route) => {
  const request = route.request();
  const pathname = new URL(request.url()).pathname;
  if (pathname === "/api/me") return json(route, { isOperator: false, tenant: { id: workspaceId, slug: "s5", name: "S5 실구동", status: "active" } });
  if (pathname === "/api/studio/drafts") {
    if (request.method() !== "POST") return json(route, new URL(request.url()).searchParams.has("id") ? { draft: draft(true) } : { drafts: [draft()], currentWork: null });
    const body = JSON.parse(request.postData() || "{}");
    posts.push(body);
    if (body.bodyBaseRevision !== undefined && body.bodyBaseRevision !== bodyRevision) {
      return json(route, { ok: false, code: "BODY_STALE_REVISION", latestBody: { editLines: ["카톡 대화 카드"], cardDeck: serverLegacyDeck, cardDeckV3: serverDeck, bodyRevision } }, 409);
    }
    if (body.cardDeck) serverLegacyDeck = structuredClone(body.cardDeck);
    if (body.cardDeckV3) {
      validateCardDeckV3(body.cardDeckV3);
      serverDeck = structuredClone(body.cardDeckV3);
    }
    bodyRevision += 1;
    return json(route, { ok: true, id: draftId, bodyRevision, videoEditServerRevision: null });
  }
  if (pathname === "/api/studio/commands") {
    const body = JSON.parse(request.postData() || "{}");
    const lines = body.lines || [];
    return json(route, {
      ok: true,
      fact_warning: "숫자와 고유명사는 적용 전에 원문과 다시 확인하세요.",
      candidates: ["A", "B", "C"].map((suffix, index) => ({
        id: suffix.toLowerCase(), label: `후보 ${index + 1}`,
        lines: lines.map((line) => `${line} ${suffix}`),
        fact_warnings: suffix === "B" ? ["후보에 새로 생긴 숫자·고유명사: 10시간"] : [],
      })),
    });
  }
  if (pathname === "/api/images/upload") {
    uploadCount += 1;
    const filename = `s5-chat-photo-${uploadCount}.png`;
    uploadedAssets[filename] = photoSvg;
    return json(route, { filename, url: photoSvg });
  }
  if (pathname.startsWith("/api/images/") && request.method() === "DELETE") return json(route, { ok: true });
  if (pathname === "/api/media/resign") {
    const body = JSON.parse(request.postData() || "{}");
    return json(route, { ok: true, file: uploadedAssets[body.filename] || photoSvg });
  }
  if (pathname === "/api/studio/brand-setup") return json(route, { guide: null });
  if (pathname === "/api/publish/first-comment-capabilities") return json(route, { capabilities: [] });
  if (/^\/api\/channels\/[^/]+\/accounts$/.test(pathname)) return json(route, { accounts: [] });
  if (pathname === "/api/images") return json(route, { images: [] });
  if (pathname === "/api/schedule") return json(route, { schedules: [] });
  return json(route, {});
});

const page = await context.newPage();
const runtimeErrors = [];
const failedRequests = [];
page.on("pageerror", (error) => runtimeErrors.push(error.message));
page.on("console", (message) => { if (message.type() === "error") runtimeErrors.push(message.text()); });
page.on("requestfailed", (request) => failedRequests.push(`${request.method()} ${request.url()} ${request.failure()?.errorText || "failed"}`));

try {
  await page.goto(`${baseUrl}/studio?room=edit&draft_id=${draftId}`, { waitUntil: "networkidle", timeout: 60_000 });
  try {
    await page.locator("[data-card-deck-panel]").waitFor({ state: "visible", timeout: 60_000 });
  } catch (error) {
    await page.screenshot({ path: path.join(outputDir, "s5-chat-load-failure.png"), fullPage: true });
    console.error("S5_LOAD_DIAGNOSTIC", JSON.stringify({ url: page.url(), body: (await page.locator("body").innerText()).slice(0, 4_000), runtimeErrors, failedRequests }, null, 2));
    throw error;
  }
  await page.locator('[data-slide-id="slide-1"]').click();
  if ((await page.locator("[data-bubble-id]").count()) < 2) throw new Error("데이터가 있는 말풍선 장을 열지 못했습니다");
  const sourceBubble = structuredClone(serverLegacyDeck.slides[1].bubbles[0]);
  const bubbleHandle = page.getByRole("button", { name: "1번째 말풍선 옮기기" });
  const targetSlide = page.locator('[data-slide-id="slide-2"]').locator("xpath=ancestor::*[@data-slide-draggable][1]");
  const bubbleTransfer = await page.evaluateHandle(() => new DataTransfer());
  await bubbleHandle.dispatchEvent("dragstart", { dataTransfer: bubbleTransfer });
  await page.waitForTimeout(50);
  await targetSlide.dispatchEvent("dragover", { dataTransfer: bubbleTransfer });
  await targetSlide.dispatchEvent("drop", { dataTransfer: bubbleTransfer });
  await bubbleHandle.dispatchEvent("dragend", { dataTransfer: bubbleTransfer });
  await bubbleTransfer.dispose();
  await waitUntil(() => serverLegacyDeck.slides[2].bubbles.some((bubble) => bubble.id === sourceBubble.id), 15_000, "장간 말풍선 이동이 저장되지 않았습니다");
  const movedBubble = serverLegacyDeck.slides[2].bubbles.find((bubble) => bubble.id === sourceBubble.id);
  if (JSON.stringify({ ...movedBubble, order: sourceBubble.order }) !== JSON.stringify(sourceBubble)) throw new Error("장간 이동에서 말풍선 payload가 달라졌습니다");

  const beforeSpeakers = serverLegacyDeck.slides.map((slide) => (slide.bubbles || []).map((bubble) => bubble.speaker));
  await page.getByRole("button", { name: "덱 전체 화자 서로 바꾸기" }).click();
  await waitUntil(() => JSON.stringify(serverLegacyDeck.slides.map((slide) => (slide.bubbles || []).map((bubble) => bubble.speaker))) !== JSON.stringify(beforeSpeakers), 15_000, "전체 화자 교환이 저장되지 않았습니다");
  await page.getByRole("button", { name: "실행 취소" }).click();
  await waitUntil(() => JSON.stringify(serverLegacyDeck.slides.map((slide) => (slide.bubbles || []).map((bubble) => bubble.speaker))) === JSON.stringify(beforeSpeakers), 15_000, "전체 화자 교환 undo가 저장되지 않았습니다");

  await page.getByRole("button", { name: "후보 3개 비교" }).click();
  await page.getByRole("dialog", { name: "말투 다듬기 비교" }).waitFor();
  if (await page.getByRole("button", { name: "이 후보 적용" }).count() !== 3) throw new Error("말투 후보가 정확히 3개가 아닙니다");
  await page.locator('[data-tone-candidate="b"]').getByRole("button", { name: "이 후보 적용" }).click();
  await waitUntil(() => serverLegacyDeck.slides[2].bubbles.every((bubble) => bubble.segments.map((segment) => segment.text).join("").endsWith(" B")), 15_000, "선택한 말투 후보만 저장되지 않았습니다");
  if (!await page.getByText(/10시간/).isVisible()) throw new Error("후보 사실 변화 경고가 남지 않았습니다");

  await page.getByRole("button", { name: "자유 배치로 편집" }).click();
  await page.locator("[data-card-canvas-editor]").waitFor({ state: "visible" });
  await waitUntil(() => serverDeck !== null, 15_000, "카톡 v3 덱이 저장되지 않았습니다");
  const cover = serverDeck.slides[0];
  const final = serverDeck.slides.at(-1);
  if (cover.background.kind !== "image" || final.background.kind !== "image") throw new Error("표지·마지막 사진이 v3 배경에 남지 않았습니다");
  if (!serverLegacyDeck.slides[0].cover_image_url || !serverLegacyDeck.slides.at(-1).cover_image_url) throw new Error("legacy 표지·마지막 사진이 사라졌습니다");

  await page.getByRole("button", { name: "2장" }).click();
  await page.getByRole("button", { name: "로고 추가" }).click();
  await waitUntil(() => serverDeck?.slides[1]?.elements?.some((element) => element.type === "logo"), 15_000, "대화 장 로고가 저장되지 않았습니다");
  const logo = serverDeck.slides[1].elements.find((element) => element.type === "logo");
  const initialLogoX = logo.x;
  await page.getByRole("button", { name: "로고 오른쪽 이동" }).click();
  await waitUntil(() => serverDeck?.slides[1]?.elements?.find((element) => element.id === logo.id)?.x > initialLogoX, 15_000, "요소 목록 로고 이동이 저장되지 않았습니다");
  const renderedChatBubbles = page.locator("[data-card-slide-scene] [data-chat-bubble]");
  if (await renderedChatBubbles.count() < 1 || !(await renderedChatBubbles.first().innerText()).trim()) {
    throw new Error("카톡 원형 말풍선이 자유 배치 화면에 보이지 않습니다");
  }

  const viewports = [{ width: 1440, height: 1000 }, { width: 1024, height: 900 }, { width: 390, height: 844 }];
  const responsive = [];
  for (const viewport of viewports) {
    await page.setViewportSize(viewport);
    await page.locator("[data-card-canvas-editor]").scrollIntoViewIfNeeded();
    const overflow = await page.evaluate(() => ({ width: document.documentElement.clientWidth, scroll: document.documentElement.scrollWidth }));
    if (overflow.scroll > overflow.width + 1) throw new Error(`${viewport.width}px 가로 넘침: ${JSON.stringify(overflow)}`);
    const screenshot = path.join(outputDir, `s5-chat-overlay-${viewport.width}.png`);
    await page.screenshot({ path: screenshot, fullPage: true });
    responsive.push({ viewport: viewport.width, overflow });
  }

  await page.setViewportSize({ width: 1600, height: 1600 });
  await page.locator("[data-card-stage]").evaluate((node) => {
    node.style.width = "1080px";
    node.style.minWidth = "1080px";
    node.style.maxWidth = "none";
    node.style.border = "0";
    node.style.borderRadius = "0";
    node.style.boxShadow = "none";
    node.style.position = "fixed";
    node.style.left = "0";
    node.style.top = "0";
    node.style.zIndex = "2147483647";
    for (const child of node.children) if (!child.hasAttribute("data-card-slide-scene")) child.style.visibility = "hidden";
  });
  await page.evaluate(() => document.fonts.ready);
  const editorPng = path.join(outputDir, "s5-chat-overlay-editor.png");
  const remotionPng = path.join(outputDir, "s5-chat-overlay-remotion.png");
  await page.locator("[data-card-slide-scene]").screenshot({ path: editorPng });
  await renderCardSlidePng({ model: cardSlideRenderModel(serverDeck, serverDeck.slides[1].id, uploadedAssets), outputPath: remotionPng });
  const exportedLogo = serverDeck.slides[1].elements.find((element) => element.id === logo.id);
  const logoRegion = {
    left: Math.round(exportedLogo.x),
    top: Math.round(exportedLogo.y),
    width: Math.round(exportedLogo.width),
    height: Math.round(exportedLogo.height),
  };
  const pixelDiff = await comparePng(editorPng, remotionPng, logoRegion);
  if (pixelDiff.changedPixelRatio > 0.005) throw new Error(`로고 화면/PNG 픽셀 차이가 0.5%를 넘었습니다: ${JSON.stringify({ logoRegion, pixelDiff })}`);

  const coverPng = path.join(outputDir, "s5-chat-cover-photo.png");
  const finalPng = path.join(outputDir, "s5-chat-final-photo.png");
  await renderCardSlidePng({ model: cardSlideRenderModel(serverDeck, cover.id, uploadedAssets), outputPath: coverPng });
  await renderCardSlidePng({ model: cardSlideRenderModel(serverDeck, final.id, uploadedAssets), outputPath: finalPng });
  if (runtimeErrors.length) throw new Error(`브라우저 console/page 오류 ${runtimeErrors.length}건: ${runtimeErrors.join(" | ")}`);
  if (failedRequests.length) throw new Error(`실패 network request ${failedRequests.length}건: ${failedRequests.join(" | ")}`);

  const result = {
    result: "PASS",
    cards: serverDeck.slides.length,
    uploads: uploadCount,
    bubbleMove: true,
    speakerSwapUndo: true,
    toneCandidateCount: 3,
    logo: { id: logo.id, x: serverDeck.slides[1].elements.find((element) => element.id === logo.id).x },
    coverPhoto: cover.background,
    finalPhoto: final.background,
    responsive,
    logoRegion,
    pixelDiff,
    consoleErrors: runtimeErrors.length,
    failedRequests: failedRequests.length,
    saves: posts.length,
  };
  fs.writeFileSync(path.join(outputDir, "s5-chat-result.json"), JSON.stringify(result, null, 2));
  console.log(JSON.stringify(result, null, 2));
} finally {
  await browser.close();
}
