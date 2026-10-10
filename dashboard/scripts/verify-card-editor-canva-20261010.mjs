#!/usr/bin/env node

import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { ensureBrowser } from "@remotion/renderer";
import { chromium } from "playwright-core";
import { createJiti } from "jiti";
import postgres from "postgres";
import sharp from "sharp";

const baseUrl = process.env.CARD_CANVA_BASE_URL || "http://localhost:3481";
const outputDir = process.env.CARD_CANVA_OUTPUT_DIR || path.resolve(process.cwd(), "../logs/diff/card-editor-canva-20261010");
const databaseUrl = process.env.DATABASE_URL;
if (!databaseUrl) throw new Error("실제 PostgreSQL 검증에는 DATABASE_URL이 필요합니다.");

const jiti = createJiti(import.meta.url, { alias: { "@": path.resolve("src") } });
const { applyGeneratedImageBackground, createPlainCardDeckV3 } = await jiti.import("../src/lib/studio/card-element-commands.ts");
const { cardSlideRenderModel } = await jiti.import("../src/lib/studio/card-render-model.ts");
const { renderCardSlidePng } = await jiti.import("../src/lib/studio/card-slide-render.ts");
const { mediaStore } = await jiti.import("../src/lib/media-store.ts");

const workspaceId = "78101010-1010-4010-8010-101010101010";
const browserToken = "osmu_card_canva_20261010_local_e2e";
const photoFilename = "chairman-photo.jpg";
const photoPath = path.resolve("public/qa/chairman-photo.jpg");
const lines = ["첫 장을 캔버스에서 직접 편집", "실제 사진과 도형을 함께 배치", "저장하고 다시 확인하세요"];
const originalDeck = applyGeneratedImageBackground(createPlainCardDeckV3(lines, "deck_card_canva_20261010"), photoFilename);
const admin = postgres(databaseUrl, { max: 2 });
let draftId = "";

fs.mkdirSync(outputDir, { recursive: true });

function authHeaders(extra = {}) {
  return { Authorization: `Bearer ${browserToken}`, ...extra };
}

async function responseJson(response, label) {
  const body = await response.json().catch(() => null);
  if (!response.ok) throw new Error(`${label} 실패: ${response.status} ${JSON.stringify(body)}`);
  return body;
}

async function currentDeck() {
  const [row] = await admin`
    SELECT payload->'cardDeckV3' AS deck
    FROM drafts WHERE tenant_id=${workspaceId} AND id=${draftId}`;
  if (!row?.deck) throw new Error("실제 DB에서 카드 덱을 찾지 못했습니다.");
  return row.deck;
}

async function waitForDeck(predicate, message, timeoutMs = 20_000) {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    const deck = await currentDeck();
    if (predicate(deck)) return deck;
    await new Promise((resolve) => setTimeout(resolve, 150));
  }
  throw new Error(message);
}

async function comparePng(leftPath, rightPath) {
  const left = await sharp(leftPath).ensureAlpha().raw().toBuffer({ resolveWithObject: true });
  const right = await sharp(rightPath).ensureAlpha().raw().toBuffer({ resolveWithObject: true });
  if (left.info.width !== right.info.width || left.info.height !== right.info.height) {
    throw new Error(`PNG 크기가 다릅니다: ${left.info.width}x${left.info.height} / ${right.info.width}x${right.info.height}`);
  }
  let changedPixels = 0;
  for (let offset = 0; offset < left.data.length; offset += 4) {
    const delta = Math.max(
      Math.abs(left.data[offset] - right.data[offset]),
      Math.abs(left.data[offset + 1] - right.data[offset + 1]),
      Math.abs(left.data[offset + 2] - right.data[offset + 2]),
      Math.abs(left.data[offset + 3] - right.data[offset + 3]),
    );
    if (delta > 8) changedPixels += 1;
  }
  return {
    width: left.info.width,
    height: left.info.height,
    changedPixels,
    changedPixelRatio: changedPixels / (left.info.width * left.info.height),
  };
}

async function drag(page, locator, dx, dy, modifiers = []) {
  await locator.scrollIntoViewIfNeeded();
  const box = await locator.boundingBox();
  if (!box) throw new Error("끌 대상의 화면 좌표를 찾지 못했습니다.");
  const start = { x: box.x + box.width / 2, y: box.y + box.height / 2 };
  for (const key of modifiers) await page.keyboard.down(key);
  await page.mouse.move(start.x, start.y);
  await page.mouse.down();
  await page.mouse.move(start.x + dx, start.y + dy, { steps: 8 });
  await page.mouse.up();
  for (const key of [...modifiers].reverse()) await page.keyboard.up(key);
}

async function seed() {
  await admin`DELETE FROM drafts WHERE tenant_id=${workspaceId}`;
  await admin`DELETE FROM tenant_tokens WHERE tenant_id=${workspaceId}`;
  await admin`DELETE FROM tenants WHERE id=${workspaceId}`;
  await admin`
    INSERT INTO tenants(id,slug,name,status)
    VALUES (${workspaceId},'card-canva-20261010','카드 편집기 실구동','active')`;
  await admin`
    INSERT INTO tenant_tokens(tenant_id,token_hash,label)
    VALUES (${workspaceId},${crypto.createHash("sha256").update(browserToken).digest("hex")},'card-canva-e2e')`;
  await mediaStore.put(workspaceId, photoFilename, fs.readFileSync(photoPath), "image/jpeg");

  const response = await fetch(`${baseUrl}/api/studio/drafts`, {
    method: "POST",
    headers: authHeaders({ "content-type": "application/json" }),
    body: JSON.stringify({
      tenant_id: workspaceId,
      idea: "캔버스 카드 편집기 실구동",
      editKind: "card",
      editLines: lines,
      img: { url: `${baseUrl}/qa/chairman-photo.jpg`, filename: photoFilename, aspectRatio: "4:5", textEmbedded: false },
      cardDeckV3: originalDeck,
      cardTemplateState: { activeTemplateId: "text_only", previousTemplate: null },
      status: "draft",
    }),
  });
  const saved = await responseJson(response, "실제 초안 저장 API");
  if (typeof saved.id !== "string") throw new Error("실제 초안 ID가 없습니다.");
  draftId = saved.id;
}

await seed();
const browserInfo = await ensureBrowser({ logLevel: "silent" });
const browser = await chromium.launch({ headless: true, executablePath: browserInfo.path });
const context = await browser.newContext({ viewport: { width: 1440, height: 900 } });
await context.addInitScript(({ id, token, state }) => {
  localStorage.setItem("dashboard_auth_token", token);
  localStorage.setItem("active_workspace", JSON.stringify({ id, slug: "card-canva-20261010", name: "카드 편집기 실구동", tier: "team" }));
  localStorage.setItem(`studio_work:${id}`, JSON.stringify(state));
}, {
  id: workspaceId,
  token: browserToken,
  state: {
    idea: "캔버스 카드 편집기 실구동", draftId, editKind: "card", editLines: lines,
    cardDeckV3: originalDeck, bodyRevision: 0, includes: {}, publishReconciliations: {},
    publishProgress: { running: false, stopped: false, status: {}, urls: {}, errors: {}, already: {} },
  },
});

const page = await context.newPage();
page.setDefaultTimeout(60_000);
const consoleErrors = [];
const failedRequests = [];
page.on("pageerror", (error) => consoleErrors.push(error.message));
page.on("console", (message) => { if (message.type() === "error") consoleErrors.push(message.text()); });
page.on("requestfailed", (request) => {
  const failure = request.failure()?.errorText ?? "failed";
  if (failure === "net::ERR_ABORTED" && (request.url().includes("/__nextjs_font/") || request.url().includes("/api/images/deliver/"))) return;
  failedRequests.push(`${request.method()} ${request.url()} ${failure}`);
});

const evidence = {};
try {
  await page.goto(`${baseUrl}/studio?room=edit&kind=card&draft_id=${draftId}`, { waitUntil: "networkidle" });
  const editor = page.locator("[data-card-canvas-editor]");
  await editor.waitFor({ state: "visible" });
  await page.locator('[data-card-stage] > [data-card-slide-scene] img').first().waitFor({ state: "visible" });
  if (await page.getByText("불러오지 못했어요").count()) throw new Error("오류 상태 화면이 열렸습니다.");
  if (await page.locator("[data-card-slide]").count() < 3) throw new Error("데이터 카드 3장 이상이 화면에 없습니다.");

  const authResponse = await fetch(`${baseUrl}/api/me`, { headers: authHeaders() });
  const me = await responseJson(authResponse, "실제 인증 API");
  if (me?.tenant?.id !== workspaceId) throw new Error("실제 인증 tenant가 E2E workspace와 다릅니다.");

  const textId = originalDeck.slides[0].elements.find((element) => element.type === "text").id;
  const selection = page.locator(`[data-element-selection="${textId}"]`);
  await selection.click();
  if (await selection.locator("[data-handle]").count() !== 8) throw new Error("선택 요소의 크기 조절 핸들이 8개가 아닙니다.");
  if (await selection.getByRole("button", { name: "회전" }).count() !== 1) throw new Error("회전 핸들이 없습니다.");

  const beforeMove = (await currentDeck()).slides[0].elements.find((element) => element.id === textId);
  await drag(page, selection, 42, 24);
  await waitForDeck((deck) => {
    const element = deck.slides[0].elements.find((candidate) => candidate.id === textId);
    return element && (element.x !== beforeMove.x || element.y !== beforeMove.y);
  }, "실제 마우스 끌기 결과가 DB에 저장되지 않았습니다.");

  const beforeResizeDeck = await currentDeck();
  const beforeResize = beforeResizeDeck.slides[0].elements.find((element) => element.id === textId);
  await drag(page, selection.locator('[data-handle="se"]'), 48, 8, ["Shift"]);
  const resizedDeck = await waitForDeck((deck) => deck.revision > beforeResizeDeck.revision, "Shift 크기 조절이 저장되지 않았습니다.");
  const resized = resizedDeck.slides[0].elements.find((element) => element.id === textId);
  if (Math.abs(resized.width / resized.height - beforeResize.width / beforeResize.height) > 0.002) throw new Error("Shift 크기 조절이 비율을 보존하지 않았습니다.");

  const beforeRotateDeck = await currentDeck();
  await drag(page, selection.getByRole("button", { name: "회전" }), 54, 24);
  const rotatedDeck = await waitForDeck((deck) => deck.revision > beforeRotateDeck.revision, "회전 결과가 저장되지 않았습니다.");
  const rotated = rotatedDeck.slides[0].elements.find((element) => element.id === textId);
  if (rotated.rotation === resized.rotation) throw new Error("회전 각도가 바뀌지 않았습니다.");

  await selection.dblclick();
  const directEditor = page.getByRole("textbox", { name: "글 내용 직접 편집" });
  await directEditor.fill("캔버스 위에서 바로 고친 문장");
  await directEditor.press("Tab");
  await waitForDeck((deck) => deck.slides[0].elements.some((element) => element.id === textId && element.text === "캔버스 위에서 바로 고친 문장"), "직접 글 편집이 저장되지 않았습니다.");

  await page.getByLabel("글꼴").selectOption("Georgia");
  await page.getByLabel("글자 크기").fill("70");
  await page.getByRole("button", { name: "굵게" }).click();
  await page.getByLabel("글자 색").fill("#17324d");
  await page.getByLabel("글 배경색").fill("#fff2a8");
  await page.getByRole("button", { name: "가운데 정렬" }).click();
  const styledDeck = await waitForDeck((deck) => {
    const element = deck.slides[0].elements.find((candidate) => candidate.id === textId);
    return element?.type === "text" && element.style.font_family === "Georgia" && element.style.font_size === 70
      && element.style.color.toLowerCase() === "#17324d" && element.style.background_color?.toLowerCase() === "#fff2a8"
      && element.style.align === "center";
  }, "글 도구 변경이 실제 DB에 모두 저장되지 않았습니다.");

  await page.getByRole("button", { name: "생성 미디어" }).click();
  await page.getByRole("button", { name: `생성 미디어 ${photoFilename} 추가` }).click();
  const generatedMediaDeck = await waitForDeck((deck) => deck.slides[0].elements.filter((element) => element.type === "image").length >= 1, "생성 미디어를 카드에 추가하지 못했습니다.");
  const generatedImageCount = generatedMediaDeck.slides[0].elements.filter((element) => element.type === "image").length;

  const [uploadResponse] = await Promise.all([
    page.waitForResponse((response) => response.request().method() === "POST" && new URL(response.url()).pathname === "/api/images/upload"),
    page.getByLabel("사진 파일", { exact: true }).setInputFiles(photoPath),
  ]);
  if (uploadResponse.status() !== 200) throw new Error("실제 사진 업로드 API가 200이 아닙니다.");
  await waitForDeck((deck) => deck.slides[0].elements.filter((element) => element.type === "image").length > generatedImageCount, "업로드 사진을 카드에 추가하지 못했습니다.");

  await page.getByRole("button", { name: "도형 추가" }).click();
  const shapeDeck = await waitForDeck((deck) => deck.slides[0].elements.some((element) => element.type === "shape"), "도형을 추가하지 못했습니다.");
  const shape = shapeDeck.slides[0].elements.find((element) => element.type === "shape");
  const shapeSelection = page.locator(`[data-element-selection="${shape.id}"]`);
  await shapeSelection.focus();
  await page.keyboard.press("Meta+d");
  const duplicatedDeck = await waitForDeck((deck) => deck.slides[0].elements.filter((element) => element.type === "shape").length === 2, "Cmd+D 복제가 저장되지 않았습니다.");
  const duplicateShape = duplicatedDeck.slides[0].elements.filter((element) => element.type === "shape").find((element) => element.id !== shape.id);
  await page.locator(`[data-element-selection="${duplicateShape.id}"]`).focus();
  await page.keyboard.press("Delete");
  await waitForDeck((deck) => deck.slides[0].elements.filter((element) => element.type === "shape").length === 1, "Delete 삭제가 저장되지 않았습니다.");

  await shapeSelection.click();
  await page.getByRole("button", { name: "맨 뒤로" }).click();
  await waitForDeck((deck) => deck.slides[0].elements.find((element) => element.id === shape.id)?.z_index === 0, "레이어 맨 뒤 이동이 저장되지 않았습니다.");
  await page.getByRole("button", { name: "앞으로 한 층" }).click();
  await waitForDeck((deck) => deck.slides[0].elements.find((element) => element.id === shape.id)?.z_index === 1, "레이어 한 층 앞으로 이동이 저장되지 않았습니다.");
  await page.getByRole("button", { name: "맨 앞으로" }).click();
  const layeredDeck = await waitForDeck((deck) => deck.slides[0].elements.find((element) => element.id === shape.id)?.z_index === deck.slides[0].elements.length - 1, "레이어 앞으로 이동이 저장되지 않았습니다.");
  await page.getByRole("button", { name: "실행 취소" }).click();
  await waitForDeck((deck) => deck.revision !== layeredDeck.revision || deck.slides[0].elements.find((element) => element.id === shape.id)?.z_index !== layeredDeck.slides[0].elements.find((element) => element.id === shape.id)?.z_index, "실행 취소가 저장되지 않았습니다.");
  await page.getByRole("button", { name: "다시 실행" }).click();
  await waitForDeck((deck) => deck.slides[0].elements.find((element) => element.id === shape.id)?.z_index === deck.slides[0].elements.length - 1, "다시 실행이 저장되지 않았습니다.");

  await selection.click();
  await page.getByLabel("요소 각도").fill("0");
  await waitForDeck((deck) => deck.slides[0].elements.find((element) => element.id === textId)?.rotation === 0, "스냅 검증용 각도 초기화가 저장되지 않았습니다.");
  await selection.waitFor({ state: "visible" });
  const stageBox = await page.locator("[data-card-stage]").boundingBox();
  const selectionBox = await selection.boundingBox();
  const latest = (await currentDeck()).slides[0].elements.find((element) => element.id === textId);
  if (!stageBox || !selectionBox) throw new Error("스냅 검증 좌표를 찾지 못했습니다.");
  const startX = selectionBox.x + selectionBox.width / 2;
  const startY = selectionBox.y + selectionBox.height / 2;
  await page.mouse.move(startX, startY);
  await page.mouse.down();
  await page.mouse.move(startX - latest.x / 1080 * stageBox.width + 1, startY, { steps: 8 });
  await page.locator('[data-axis="x"]').waitFor({ state: "visible" });
  const edgeGuide = await page.locator('[data-axis="x"]').getAttribute("style");
  if (!edgeGuide?.includes("0%")) throw new Error(`가장자리 스냅 가이드가 0% 위치가 아닙니다: ${edgeGuide}`);
  await page.mouse.up();
  await waitForDeck((deck) => deck.slides[0].elements.find((element) => element.id === textId)?.x === 0, "왼쪽 가장자리 스냅이 저장되지 않았습니다.");

  await page.reload({ waitUntil: "networkidle" });
  await editor.waitFor({ state: "visible" });
  await selection.click();
  const centeredSource = (await currentDeck()).slides[0].elements.find((element) => element.id === textId);
  const centeredSelectionBox = await selection.boundingBox();
  const centeredStageBox = await page.locator("[data-card-stage]").boundingBox();
  if (!centeredSource || !centeredSelectionBox || !centeredStageBox) throw new Error("중앙 스냅 검증 좌표를 찾지 못했습니다.");
  const centerStartX = centeredSelectionBox.x + centeredSelectionBox.width / 2;
  const centerStartY = centeredSelectionBox.y + centeredSelectionBox.height / 2;
  const centeredX = (1080 - centeredSource.width) / 2;
  await page.mouse.move(centerStartX, centerStartY);
  await page.mouse.down();
  await page.mouse.move(centerStartX + centeredX / 1080 * centeredStageBox.width, centerStartY, { steps: 8 });
  await page.locator('[data-axis="x"]').waitFor({ state: "visible" });
  const centerGuide = await page.locator('[data-axis="x"]').getAttribute("style");
  if (!centerGuide?.includes("50%")) throw new Error(`중앙 스냅 가이드가 50% 위치가 아닙니다: ${centerGuide}`);
  await page.mouse.up();
  await waitForDeck((deck) => Math.abs((deck.slides[0].elements.find((element) => element.id === textId)?.x ?? -1) - centeredX) < 0.01, "가로 중앙 스냅이 저장되지 않았습니다.");

  const pageCountBefore = (await currentDeck()).slides.length;
  await page.getByRole("button", { name: "새 장 추가" }).click();
  await waitForDeck((deck) => deck.slides.length === pageCountBefore + 1, "새 카드 페이지가 저장되지 않았습니다.");
  await page.getByRole("button", { name: "이 장 복제" }).click();
  await waitForDeck((deck) => deck.slides.length === pageCountBefore + 2, "카드 페이지 복제가 저장되지 않았습니다.");
  const movedPageId = await page.locator('[data-card-slide][aria-pressed="true"]').getAttribute("data-card-slide");
  const movedPageOrder = (await currentDeck()).slides.find((slide) => slide.id === movedPageId)?.order;
  if (!movedPageId || movedPageOrder == null || movedPageOrder < 1) throw new Error("순서변경할 카드 페이지를 찾지 못했습니다.");
  await page.getByRole("button", { name: "장 앞으로" }).click();
  await waitForDeck((deck) => deck.slides.find((slide) => slide.id === movedPageId)?.order === movedPageOrder - 1, "카드 페이지 순서변경이 저장되지 않았습니다.");
  await page.getByRole("button", { name: "이 장 삭제" }).click();
  await waitForDeck((deck) => deck.slides.length === pageCountBefore + 1, "카드 페이지 삭제가 저장되지 않았습니다.");
  await page.getByRole("button", { name: "1장" }).click();
  await selection.click();

  await page.locator('[data-room="edit"]').evaluate((node) => {
    const top = node.getBoundingClientRect().top + window.scrollY;
    window.scrollTo({ left: 0, top, behavior: "instant" });
  });
  await page.waitForTimeout(100);
  const addToolbarRect = await page.getByRole("toolbar", { name: "카드 요소 추가" }).boundingBox();
  const textToolbarRect = await page.locator("[data-card-element-toolbar]").boundingBox();
  const stageRect = await page.locator("[data-card-stage]").boundingBox();
  const pageStripRect = await page.locator("[data-card-page-strip]").boundingBox();
  const pageActionsRect = await page.getByRole("toolbar", { name: "카드 페이지 편집 도구" }).boundingBox();
  const assistantRect = await page.locator('[data-edit-helper="true"]').boundingBox();
  if (!addToolbarRect || !textToolbarRect || !stageRect || !pageStripRect || !pageActionsRect || !assistantRect) throw new Error("첫 화면 배치 요소의 좌표를 찾지 못했습니다.");
  const overlaps = !(stageRect.x + stageRect.width <= assistantRect.x || assistantRect.x + assistantRect.width <= stageRect.x
    || stageRect.y + stageRect.height <= assistantRect.y || assistantRect.y + assistantRect.height <= stageRect.y);
  if (overlaps) throw new Error("편집 담당 대화창이 카드 캔버스를 가립니다.");
  const coreRects = { addToolbarRect, textToolbarRect, stageRect, pageStripRect, pageActionsRect };
  const outside = Object.entries(coreRects).filter(([, rect]) => rect.y < 0 || rect.y + rect.height > 900);
  if (outside.length) throw new Error(`필수 카드 편집 도구가 1440x900 첫 화면을 벗어났습니다: ${JSON.stringify(outside)}`);
  const desktopOverflow = await page.evaluate(() => ({ viewport: document.documentElement.clientWidth, scrollWidth: document.documentElement.scrollWidth, scrollX: window.scrollX }));
  if (desktopOverflow.scrollWidth > desktopOverflow.viewport + 1 || desktopOverflow.scrollX !== 0) throw new Error(`1440px 가로 넘침 또는 가로 스크롤: ${JSON.stringify(desktopOverflow)}`);
  await page.screenshot({ path: path.join(outputDir, "card-editor-1440x900.png") });

  const fixtureHtml = await page.evaluate(() => {
    const editorNode = document.querySelector("[data-card-canvas-editor]");
    if (!editorNode) throw new Error("측정용 편집기 DOM이 없습니다.");
    const css = [...document.styleSheets].flatMap((sheet) => {
      try { return [...sheet.cssRules].map((rule) => rule.cssText); } catch { return []; }
    }).join("\n");
    const clone = editorNode.cloneNode(true);
    clone.querySelectorAll("script").forEach((node) => node.remove());
    return `<!doctype html><html lang="ko"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><style>${css}\nbody{margin:0;padding:16px;background:#f5f5f5} button:active,[role=button]:active{transform:scale(.98)} [data-card-page-strip] [data-card-slide-scene]>*{display:none!important}</style></head><body><main data-room="edit">${clone.outerHTML}</main></body></html>`;
  });
  fs.writeFileSync(path.join(outputDir, "measurement-fixture.html"), fixtureHtml);

  await page.setViewportSize({ width: 390, height: 844 });
  await page.locator("[data-card-stage]").evaluate((node) => node.scrollIntoView({ block: "start" }));
  const mobileOverflow = await page.evaluate(() => ({ viewport: document.documentElement.clientWidth, scrollWidth: document.documentElement.scrollWidth }));
  if (mobileOverflow.scrollWidth > mobileOverflow.viewport + 1) throw new Error(`390px 가로 넘침: ${JSON.stringify(mobileOverflow)}`);
  await page.screenshot({ path: path.join(outputDir, "card-editor-390x844.png") });

  await page.setViewportSize({ width: 1600, height: 1500 });
  await page.getByRole("button", { name: "1장" }).click();
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
  const editorPng = path.join(outputDir, "card-editor-screen.png");
  const exportPng = path.join(outputDir, "card-editor-export.png");
  await page.locator('[data-card-stage] > [data-card-slide-scene]').screenshot({ path: editorPng });
  const finalDeck = await currentDeck();
  const gallery = await responseJson(await fetch(`${baseUrl}/api/images?tenant_id=${workspaceId}`, { headers: authHeaders() }), "실제 이미지 목록 API");
  const assetUrls = Object.fromEntries(gallery.map((item) => [item.filename, item.url]));
  await renderCardSlidePng({ model: cardSlideRenderModel(finalDeck, finalDeck.slides[0].id, assetUrls), outputPath: exportPng });
  const pixelDiff = await comparePng(editorPng, exportPng);
  if (pixelDiff.changedPixelRatio > 0.02) throw new Error(`화면과 PNG 픽셀 차이가 2%를 넘었습니다: ${JSON.stringify(pixelDiff)}`);

  const photoStats = await sharp(photoPath).stats();
  const meanDeviation = photoStats.channels.slice(0, 3).reduce((sum, channel) => sum + channel.stdev, 0) / 3;
  if (meanDeviation < 10) throw new Error(`실사진 분산이 너무 낮습니다: ${meanDeviation}`);
  if (consoleErrors.length) throw new Error(`브라우저 console/page 오류 ${consoleErrors.length}건: ${consoleErrors.join(" | ")}`);
  if (failedRequests.length) throw new Error(`실패 네트워크 요청 ${failedRequests.length}건: ${failedRequests.join(" | ")}`);

  Object.assign(evidence, {
    result: "PASS",
    runtime: { next: baseUrl, database: "PostgreSQL", routesMocked: 0, actualTenant: workspaceId },
    selection: { handles: 8, move: true, shiftRatioResize: true, rotation: rotated.rotation },
    text: { inline: true, font: "Georgia", size: 70, bold: true, color: "#17324d", align: "center", background: "#fff2a8" },
    assets: { generatedMedia: true, upload: true, shape: true, realPhotoStdev: meanDeviation },
    commands: { duplicate: true, delete: true, layerBackward: true, layerForward: true, undo: true, redo: true, edgeSnapGuide: edgeGuide, centerSnapGuide: centerGuide },
    pages: { before: pageCountBefore, after: finalDeck.slides.length, reorder: true, bottomStripWithin900: true },
    layout: { stageAssistantOverlap: overlaps, mobileOverflow },
    png: { editorPng, exportPng, pixelDiff },
    screenshots: ["card-editor-1440x900.png", "card-editor-390x844.png"],
    consoleErrors: 0,
    failedRequests: 0,
    persistedRevision: styledDeck.revision,
  });
  fs.writeFileSync(path.join(outputDir, "measurements.json"), JSON.stringify(evidence, null, 2));
  fs.writeFileSync(path.join(outputDir, "report.md"), `# 카드 편집기 Canva 기본 조작 실구동\n\n- 결과: PASS\n- 경로: 실제 Next.js ${baseUrl}, 실제 PostgreSQL, 실제 로컬 미디어 파일. page.route 0건.\n- 조작: 선택 8핸들, 이동, Shift 비율 고정, 회전, 캔버스 위 글 수정, 글 도구, 생성 미디어, 업로드, 도형, 복제, 삭제, 레이어 양방향, 실행 취소/다시 실행, 중앙·가장자리 스냅, 페이지 추가/복제/이동/삭제를 마우스와 키보드로 실행했다.\n- 배치: 1440x900에서 하단 페이지 줄이 첫 화면 안에 있고 편집 담당 대화창과 캔버스 겹침은 0이다. 390x844 가로 넘침은 0이다.\n- 실사진: ${photoFilename}, RGB 평균 표준편차 ${meanDeviation.toFixed(2)}. 단색 픽스처를 쓰지 않았다.\n- PNG: 화면과 내보내기 차이 ${(pixelDiff.changedPixelRatio * 100).toFixed(4)}%, 기준 2% 이하.\n- 오류: 브라우저 console/page 오류 0, 실패 요청 0.\n- 남은 것: 외부 SNS 실제 게시는 정책에 따라 실행하지 않았다.\n`);
  console.log(JSON.stringify(evidence, null, 2));
} finally {
  await browser.close();
  await admin`DELETE FROM drafts WHERE tenant_id=${workspaceId}`;
  await admin`DELETE FROM tenant_tokens WHERE tenant_id=${workspaceId}`;
  await admin`DELETE FROM tenants WHERE id=${workspaceId}`;
  await admin.end();
  const tenantMediaDir = path.resolve(process.cwd(), "../data/tenants", workspaceId);
  fs.rmSync(tenantMediaDir, { recursive: true, force: true });
}
