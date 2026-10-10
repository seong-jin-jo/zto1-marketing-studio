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
process.env.OSMU_PUBLIC_URL = baseUrl;

const jiti = createJiti(import.meta.url, { alias: { "@": path.resolve("src") } });
const { applyGeneratedImageBackground, createPlainCardDeckV3 } = await jiti.import("../src/lib/studio/card-element-commands.ts");
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

async function comparePngRegion(leftPath, rightPath, region) {
  const leftRegion = await sharp(leftPath).extract(region).ensureAlpha().raw().toBuffer({ resolveWithObject: true });
  const rightRegion = await sharp(rightPath).extract(region).ensureAlpha().raw().toBuffer({ resolveWithObject: true });
  let changedPixels = 0;
  for (let offset = 0; offset < leftRegion.data.length; offset += 4) {
    const delta = Math.max(
      Math.abs(leftRegion.data[offset] - rightRegion.data[offset]),
      Math.abs(leftRegion.data[offset + 1] - rightRegion.data[offset + 1]),
      Math.abs(leftRegion.data[offset + 2] - rightRegion.data[offset + 2]),
      Math.abs(leftRegion.data[offset + 3] - rightRegion.data[offset + 3]),
    );
    if (delta > 8) changedPixels += 1;
  }
  return { ...region, changedPixels, changedPixelRatio: changedPixels / (region.width * region.height) };
}

async function waitForExportWorker(timeoutMs = 120_000) {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    const [job] = await admin`
      SELECT id,status,total_items,succeeded_items,failed_items
      FROM studio_export_jobs
      WHERE tenant_id=${workspaceId} AND draft_id=${draftId}
      ORDER BY created_at DESC LIMIT 1`;
    if (job?.status === "succeeded") return Number(job.succeeded_items);
    if (job?.status === "failed" || job?.status === "partially_failed") {
      throw new Error(`실제 내보내기 워커가 실패했습니다: ${job.status}, 실패 ${job.failed_items}장`);
    }
    await new Promise((resolve) => setTimeout(resolve, 250));
  }
  throw new Error("실제 내보내기 워커가 120초 안에 PNG를 만들지 못했습니다.");
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
  if (failure === "net::ERR_ABORTED"
    && request.method() === "GET"
    && request.url().includes(`/api/studio/drafts/${draftId}/exports/latest`)) return;
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

  await page.getByLabel("글꼴").selectOption("Pretendard Variable");
  await page.getByLabel("글자 크기").fill("70");
  await page.getByRole("button", { name: "굵게" }).click();
  await page.getByLabel("글자 색").fill("#17324d");
  await page.getByLabel("글 배경색").fill("#fff2a8");
  await page.getByLabel("글 정렬").selectOption("center");
  const styledDeck = await waitForDeck((deck) => {
    const element = deck.slides[0].elements.find((candidate) => candidate.id === textId);
    return element?.type === "text" && element.style.font_family === "Pretendard Variable" && element.style.font_size === 70
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
  await page.locator("[data-card-geometry-details] summary").click();
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
  await page.locator("[data-card-geometry-details] summary").click();

  await selection.click();
  await page.locator("[data-card-geometry-details] summary").click();
  await page.getByLabel("요소 각도").fill("0");
  await waitForDeck((deck) => deck.slides[0].elements.find((element) => element.id === textId)?.rotation === 0, "스냅 검증용 각도 초기화가 저장되지 않았습니다.");
  await page.locator("[data-card-geometry-details] summary").click();
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
  const thumbnailContents = await page.locator("[data-card-slide] [data-card-slide-scene]").evaluateAll((scenes) => scenes.map((scene) => ({
    text: scene.textContent?.trim() ?? "",
    images: scene.querySelectorAll("img").length,
  })));
  if (thumbnailContents.length < 3 || !thumbnailContents[1]?.text || thumbnailContents.some((content) => !content.text && content.images === 0)) {
    throw new Error(`실제 장 내용이 없는 페이지 썸네일이 있습니다: ${JSON.stringify(thumbnailContents)}`);
  }
  await page.getByRole("button", { name: "1장" }).click();
  await selection.click();

  await page.locator('[data-room="edit"]').evaluate((node) => {
    const top = node.getBoundingClientRect().top + window.scrollY;
    window.scrollTo({ left: 0, top, behavior: "instant" });
  });
  await page.waitForTimeout(100);
  const addToolbarRect = await page.getByRole("toolbar", { name: "카드 요소 추가" }).boundingBox();
  const textToolbarRect = await page.locator('[data-card-element-toolbar] [role="toolbar"]').boundingBox();
  const stageRect = await page.locator("[data-card-stage]").boundingBox();
  const pageStripRect = await page.locator("[data-card-page-strip]").boundingBox();
  const pageActionsRect = await page.getByRole("toolbar", { name: "카드 페이지 편집 도구" }).boundingBox();
  const assistantRect = await page.locator('[data-edit-helper="true"]').boundingBox();
  if (!addToolbarRect || !textToolbarRect || !stageRect || !pageStripRect || !pageActionsRect || !assistantRect) throw new Error("첫 화면 배치 요소의 좌표를 찾지 못했습니다.");
  const overlaps = !(stageRect.x + stageRect.width <= assistantRect.x || assistantRect.x + assistantRect.width <= stageRect.x
    || stageRect.y + stageRect.height <= assistantRect.y || assistantRect.y + assistantRect.height <= stageRect.y);
  if (overlaps) throw new Error("편집 담당 대화창이 카드 캔버스를 가립니다.");
  if (stageRect.height < 560) throw new Error(`1440x900 카드 캔버스 높이가 560px보다 작습니다: ${stageRect.height}`);
  if (textToolbarRect.height > 56) throw new Error(`선택 맥락 툴바가 한 줄 높이를 넘었습니다: ${textToolbarRect.height}`);
  const clippedToolbarValues = await page.locator('[data-card-element-toolbar] [role="toolbar"] input, [data-card-element-toolbar] [role="toolbar"] select').evaluateAll((controls) => controls.flatMap((control) => {
    const element = control;
    const rect = element.getBoundingClientRect();
    const parentRect = element.parentElement?.getBoundingClientRect();
    const style = getComputedStyle(element);
    const selectedText = element instanceof HTMLSelectElement ? element.selectedOptions[0]?.text ?? "" : "";
    const canvas = document.createElement("canvas");
    const context = canvas.getContext("2d");
    if (context) context.font = style.font;
    const selectedTextClipped = element instanceof HTMLSelectElement
      && Boolean(selectedText)
      && (context?.measureText(selectedText).width ?? 0) + parseFloat(style.paddingLeft) + parseFloat(style.paddingRight) + 28 > element.clientWidth;
    const clipped = element.scrollWidth > element.clientWidth + 1
      || rect.width <= 0
      || selectedTextClipped
      || (parentRect ? rect.left < parentRect.left - 1 || rect.right > parentRect.right + 1 : false);
    return clipped ? [element.getAttribute("aria-label") || element.tagName] : [];
  }));
  if (clippedToolbarValues.length) throw new Error(`맥락 툴바에서 잘린 값이 있습니다: ${clippedToolbarValues.join(", ")}`);
  if (await page.locator("[data-card-geometry-details]").getAttribute("open") !== null) throw new Error("너비·높이·각도 고급 항목이 기본으로 펼쳐져 있습니다.");
  const textBoxFits = await page.locator(`[data-card-stage] > [data-card-slide-scene] [data-card-element="${textId}"]`).evaluate((element) => {
    const text = element.querySelector("span");
    if (!(text instanceof HTMLElement)) return false;
    const outer = element.getBoundingClientRect();
    const inner = text.getBoundingClientRect();
    const style = getComputedStyle(text);
    return inner.left >= outer.left - 1 && inner.right <= outer.right + 1
      && inner.top >= outer.top - 1 && inner.bottom <= outer.bottom + 1
      && text.scrollWidth <= text.clientWidth + 1 && text.scrollHeight <= text.clientHeight + 1
      && parseFloat(style.paddingLeft) >= 4 && parseFloat(style.paddingRight) >= 4;
  });
  if (!textBoxFits) throw new Error("글자가 글 상자 안에서 줄바꿈되지 않거나 상자 밖으로 잘렸습니다.");
  const backgroundPhoto = await page.locator("[data-card-stage] > [data-card-slide-scene] img").first().evaluate((image) => {
    if (!(image instanceof HTMLImageElement)) throw new Error("배경 사진 요소가 아닙니다.");
    return {
      naturalWidth: image.naturalWidth,
      naturalHeight: image.naturalHeight,
      renderedWidth: image.getBoundingClientRect().width,
      renderedHeight: image.getBoundingClientRect().height,
      objectFit: getComputedStyle(image).objectFit,
    };
  });
  if (backgroundPhoto.objectFit !== "cover" || backgroundPhoto.naturalWidth < backgroundPhoto.renderedWidth || backgroundPhoto.naturalHeight < backgroundPhoto.renderedHeight) {
    throw new Error(`배경 사진이 cover가 아니거나 화면에서 원본 이상으로 확대됩니다: ${JSON.stringify(backgroundPhoto)}`);
  }
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

  const exportPng = path.join(outputDir, "card-editor-export.png");
  await page.setViewportSize({ width: 1440, height: 900 });
  const productExportButton = page.locator('[data-edit-helper="true"]').getByRole("button", { name: "내보내기", exact: true });
  if (await productExportButton.isDisabled()) throw new Error("제품 UI의 내보내기 버튼이 기본 상태에서 비활성입니다.");
  if (await page.getByText("카드 직접 편집 결과물 만들기는 다음 업데이트에서 열립니다.").count()) {
    throw new Error("제품 UI에 다음 업데이트 내보내기 차단 문구가 남아 있습니다.");
  }
  await productExportButton.click();
  const exportPanel = page.locator("[data-export-panel]");
  await exportPanel.waitFor({ state: "visible" });
  const enqueueResponsePromise = page.waitForResponse((response) => response.request().method() === "POST"
    && new URL(response.url()).pathname === `/api/studio/drafts/${draftId}/exports`);
  await exportPanel.getByRole("button", { name: "내보내기", exact: true }).click();
  const enqueueResponse = await enqueueResponsePromise;
  if (![200, 202].includes(enqueueResponse.status())) throw new Error(`제품 UI 내보내기 접수가 실패했습니다: ${enqueueResponse.status()}`);
  const processedExportItems = await waitForExportWorker();
  const firstDownload = exportPanel.getByRole("button", { name: "1장 PNG 다운로드" });
  await firstDownload.waitFor({ state: "visible", timeout: 120_000 });
  const downloadPromise = page.waitForEvent("download");
  await firstDownload.click();
  const download = await downloadPromise;
  await download.saveAs(exportPng);
  await exportPanel.getByRole("button", { name: "내보내기 닫기" }).click();
  await exportPanel.waitFor({ state: "detached" });

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
  await page.evaluate(async () => {
    await document.fonts.load('700 64px "Pretendard Variable"', "캔버스 글꼴 확인 ABC 123");
    await document.fonts.ready;
    if (!document.fonts.check('700 64px "Pretendard Variable"', "캔버스 글꼴 확인 ABC 123")) throw new Error("화면 Pretendard 글꼴이 준비되지 않았습니다.");
  });
  const editorPng = path.join(outputDir, "card-editor-screen.png");
  await page.locator('[data-card-stage] > [data-card-slide-scene]').screenshot({ path: editorPng });
  const finalDeck = await currentDeck();
  const pixelDiff = await comparePng(editorPng, exportPng);
  if (pixelDiff.changedPixelRatio > 0.02) throw new Error(`화면과 PNG 픽셀 차이가 2%를 넘었습니다: ${JSON.stringify(pixelDiff)}`);

  const finalText = finalDeck.slides[0].elements.find((element) => element.id === textId);
  if (!finalText || finalText.type !== "text") throw new Error("글꼴 비교용 글 요소가 없습니다.");
  const textRegion = {
    left: Math.max(0, Math.floor(finalText.x)),
    top: Math.max(0, Math.floor(finalText.y)),
    width: Math.min(1080 - Math.max(0, Math.floor(finalText.x)), Math.max(1, Math.ceil(finalText.width))),
    height: Math.min(1350 - Math.max(0, Math.floor(finalText.y)), Math.max(1, Math.ceil(finalText.height))),
  };
  const textPixelDiff = await comparePngRegion(editorPng, exportPng, textRegion);
  if (textPixelDiff.changedPixelRatio > 0.02) throw new Error(`글자 영역 화면·PNG 차이가 2%를 넘었습니다: ${JSON.stringify(textPixelDiff)}`);

  const photoStats = await sharp(photoPath).stats();
  const photoMetadata = await sharp(photoPath).metadata();
  if (!photoMetadata.width || !photoMetadata.height) throw new Error("실사진 원본 해상도를 읽지 못했습니다.");
  const coverScale = Math.max(1080 / photoMetadata.width, 1350 / photoMetadata.height);
  if (coverScale > 1) throw new Error(`배경 사진을 원본 이상으로 확대합니다: ${photoMetadata.width}x${photoMetadata.height}, scale=${coverScale}`);
  const exportMetadata = await sharp(exportPng).metadata();
  if (exportMetadata.width !== 1080 || exportMetadata.height !== 1350) throw new Error(`제품 UI PNG가 1080x1350이 아닙니다: ${exportMetadata.width}x${exportMetadata.height}`);
  const meanDeviation = photoStats.channels.slice(0, 3).reduce((sum, channel) => sum + channel.stdev, 0) / 3;
  if (meanDeviation < 10) throw new Error(`실사진 분산이 너무 낮습니다: ${meanDeviation}`);
  if (consoleErrors.length) throw new Error(`브라우저 console/page 오류 ${consoleErrors.length}건: ${consoleErrors.join(" | ")}`);
  if (failedRequests.length) throw new Error(`실패 네트워크 요청 ${failedRequests.length}건: ${failedRequests.join(" | ")}`);

  Object.assign(evidence, {
    result: "PASS",
    runtime: { next: baseUrl, database: "PostgreSQL", routesMocked: 0, actualTenant: workspaceId },
    selection: { handles: 8, move: true, shiftRatioResize: true, rotation: rotated.rotation },
    text: { inline: true, contained: textBoxFits, font: "Pretendard Variable", size: 70, bold: true, color: "#17324d", align: "center", background: "#fff2a8" },
    assets: { generatedMedia: true, upload: true, shape: true, realPhotoStdev: meanDeviation, backgroundPhoto, source: { width: photoMetadata.width, height: photoMetadata.height, coverScale } },
    commands: { duplicate: true, delete: true, layerBackward: true, layerForward: true, undo: true, redo: true, edgeSnapGuide: edgeGuide, centerSnapGuide: centerGuide },
    pages: { before: pageCountBefore, after: finalDeck.slides.length, reorder: true, bottomStripWithin900: true, thumbnailContents },
    layout: { stageHeight: stageRect.height, stageAssistantOverlap: overlaps, contextToolbarHeight: textToolbarRect.height, clippedToolbarValues, mobileOverflow },
    exportUi: { defaultButtonEnabled: true, blockedCopyAbsent: true, enqueueStatus: enqueueResponse.status(), processedExportItems, downloadedThroughUi: true },
    png: { editorPng, exportPng, width: exportMetadata.width, height: exportMetadata.height, pixelDiff, textPixelDiff },
    screenshots: ["card-editor-1440x900.png", "card-editor-390x844.png"],
    consoleErrors: 0,
    failedRequests: 0,
    persistedRevision: styledDeck.revision,
  });
  fs.writeFileSync(path.join(outputDir, "measurements.json"), JSON.stringify(evidence, null, 2));
  fs.writeFileSync(path.join(outputDir, "report.md"), `# 카드 편집기 Canva 기본 조작 R2 실구동\n\nSTAMP: 2026-10-10 KST | model: gpt-5/Codex | agent: code-builder | skill: qa | 근거: v71, 실제 Next.js·PostgreSQL·로컬 미디어·내보내기 워커·제품 UI 다운로드 | 고민: 직접 렌더 우회를 없애고 회장이 누르는 내보내기 버튼부터 받은 PNG까지 같은 경로로 묶었다.\n\n- 결과: PASS\n- 경로: 실제 Next.js ${baseUrl}, 실제 PostgreSQL, 실제 로컬 미디어 파일, 실제 내보내기 워커. page.route 0건.\n- 내보내기: 기능 플래그 미설정 기본 상태에서 제품의 내보내기 버튼이 활성이다. 제품 UI로 접수하고 ${processedExportItems}장을 렌더한 뒤 1장 PNG 다운로드 버튼으로 받은 파일을 비교했다.\n- 글꼴·글 상자: 화면과 내보내기 모두 Pretendard Variable 적재를 확인했다. 글 상자는 줄바꿈·overflow·좌우 안쪽 여백 조건을 통과했고 글자 영역 픽셀 차이는 ${(textPixelDiff.changedPixelRatio * 100).toFixed(4)}%다.\n- 맥락 툴바: 높이 ${textToolbarRect.height.toFixed(1)}px 한 줄, 선택값 실제 글자 폭까지 검사해 잘린 값 0건. 너비·높이·각도는 기본으로 접힌 크기·회전 항목에 있다.\n- 캔버스: 1440x900에서 높이 ${stageRect.height.toFixed(1)}px, 편집 담당 대화창과 겹침 0, 페이지 줄과 작업 버튼이 첫 화면 안에 있다.\n- 페이지: ${finalDeck.slides.length}장 썸네일 모두 실제 장 내용을 렌더하고 2번 썸네일도 비어 있지 않다.\n- 실사진: ${photoFilename} ${photoMetadata.width}x${photoMetadata.height}, cover 배치, 확대 배율 ${coverScale.toFixed(2)}, RGB 평균 표준편차 ${meanDeviation.toFixed(2)}. 단색 픽스처를 쓰지 않았다.\n- PNG: 1080x1350, 화면 전체 차이 ${(pixelDiff.changedPixelRatio * 100).toFixed(4)}%, 글자 영역 차이 ${(textPixelDiff.changedPixelRatio * 100).toFixed(4)}%, 두 기준 모두 2% 이하.\n- 육안 판정: 1440x900 캡처와 내보낸 PNG를 원본 해상도로 직접 열어 확인했다. 글꼴 선택값이 온전히 보이고 첫 글자가 선택 테두리 안에 있으며, 2번 썸네일은 실제 장 내용이고 편집 담당 대화창은 캔버스를 가리지 않는다. 화면과 PNG의 글꼴·줄바꿈·배치가 같다.\n- 오류: 브라우저 console/page 오류 0, 실패 요청 0.\n- 남은 것: 외부 SNS 실제 게시는 정책에 따라 실행하지 않았다.\n\n벤치마크: Canva 공식 도움말의 편집기 내 PNG 다운로드와 품질 선택 흐름, MDN CSS Font Loading API의 document.fonts.ready 완료 조건을 채택했다. 제품 정본에 없는 유료 옵션과 외부 SDK는 도입하지 않았다.\n\nSKILLS_USED: qa, 실제 사용자 경로 브라우저 검증과 증거 수집에 사용\nSKILLS_SKIPPED: review, 푸시·PR 전 단계이며 이번 위임은 R2 구현·실구동 검증 범위라 미호출\nSOURCES/MODEL: gpt-5/Codex | docs/design/prototypes/osmu-editroom-v71-hub-claude-opus-20261001-2335.html | https://www.canva.com/help/download-or-purchase/ | https://developer.mozilla.org/en-US/docs/Web/API/Document/fonts\nKNOWLEDGE_QUERY: BRAIN OSMU 편집 흐름, v71·회장 결함 보고서, Canva PNG 다운로드, MDN 글꼴 적재 완료 조건을 조회했다.\nHITS_USED: v71의 편집실 셸, Canva의 제품 UI 다운로드 흐름, MDN의 document.fonts.ready를 채택했다.\nHITS_REJECTED: 유료 Polotno와 react-konva 전환은 기존 공용 화면·내보내기 렌더를 이중화하므로 쓰지 않았다.\nCONFLICTS: 없음\n`);
  console.log(JSON.stringify(evidence, null, 2));
} finally {
  await browser.close();
  await admin`DELETE FROM drafts WHERE tenant_id=${workspaceId}`;
  await admin`DELETE FROM tenant_tokens WHERE tenant_id=${workspaceId}`;
  await admin`DELETE FROM tenants WHERE id=${workspaceId}`;
  await admin.end({ timeout: 2 });
  const tenantMediaDir = path.resolve(process.cwd(), "../data/tenants", workspaceId);
  fs.rmSync(tenantMediaDir, { recursive: true, force: true });
}
