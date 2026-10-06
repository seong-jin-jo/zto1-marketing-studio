#!/usr/bin/env node
import fs from "node:fs";
import path from "node:path";
import { ensureBrowser } from "@remotion/renderer";
import { chromium } from "playwright-core";
import { createJiti } from "jiti";
import { createServer as createViteServer } from "vite";

const jiti = createJiti(import.meta.url, { alias: { "@": path.resolve("src") } });
const { validateCardDeck } = await jiti.import("../src/lib/studio/card-deck-contract.ts");
const { validateCardDeckV3 } = await jiti.import("../src/lib/studio/card-element-contract.ts");
const { cardSlideRenderModel } = await jiti.import("../src/lib/studio/card-render-model.ts");
const { renderCardSlidePng } = await jiti.import("../src/lib/studio/card-slide-render.ts");
const { isSynchronizedChatCardDeckV3, migrateCardDeckV2ToV3 } = await jiti.import("../src/lib/studio/card-deck-v2-to-v3.ts");

const baseUrl = process.env.CHAT_S5_BASE_URL || "http://localhost:3475";
const outputDir = process.env.CHAT_S5_OUTPUT_DIR || path.resolve(process.cwd(), "../docs/qa/editroom-v2-s5");
const workspaceId = "51111111-1111-4111-8111-111111111111";
const draftId = "52222222-2222-4222-8222-222222222222";
const photoSvg = "data:image/svg+xml;base64,PHN2ZyB4bWxucz0naHR0cDovL3d3dy53My5vcmcvMjAwMC9zdmcnIHdpZHRoPScxMDgwJyBoZWlnaHQ9JzEzNTAnPjxyZWN0IHdpZHRoPScxMDgwJyBoZWlnaHQ9JzEzNTAnIGZpbGw9JyMzMzU1YWEnLz48Y2lyY2xlIGN4PSc4ODAnIGN5PScyMjAnIHI9JzE2MCcgZmlsbD0nIzIyYWE3NycvPjwvc3ZnPg==";
const profileSvg = "data:image/svg+xml;base64,PHN2ZyB4bWxucz0naHR0cDovL3d3dy53My5vcmcvMjAwMC9zdmcnIHdpZHRoPScxNjAnIGhlaWdodD0nMTYwJz48cmVjdCB3aWR0aD0nMTYwJyBoZWlnaHQ9JzE2MCcgZmlsbD0nI0ZFNDUwMCcvPjxjaXJjbGUgY3g9JzgwJyBjeT0nNTUnIHI9JzMwJyBmaWxsPScjRkZGRkZGJy8+PHBhdGggZD0nTTMwIDE0MGM1LTM1IDk1LTM1IDEwMCAwJyBmaWxsPScjRkZGRkZGJy8+PC9zdmc+";
const photoUrl = `${baseUrl}/__s5-assets/s5-chat-photo.svg`;
const profileUrl = `${baseUrl}/__s5-assets/s5-chat-profile.svg`;
const sourceDeck = JSON.parse(fs.readFileSync(path.resolve("tests/studio/fixtures/deck-d100.v2.json"), "utf8"));
sourceDeck.slides[0].cover_image_url = photoUrl;
sourceDeck.slides[sourceDeck.slides.length - 1].cover_image_url = photoUrl;
sourceDeck.brand.profile_image_url = profileUrl;
sourceDeck.brand.profile_image_asset_id = "s5b-profile.svg";
let serverLegacyDeck = structuredClone(sourceDeck);
const fixturePhotoAssetId = "s5-fixture-photo.svg";
let serverDeck = migrateCardDeckV2ToV3(sourceDeck, { coverImageAssetIds: { [photoUrl]: fixturePhotoAssetId }, profileImageAssetId: "s5b-profile.svg" });
serverDeck.slides[1].elements.push({
  id: "el_orphan-old", type: "text", name: "브랜드 말풍선", x: 80, y: 120, width: 500, height: 180,
  rotation: 0, z_index: 0, opacity: 1, locked: false, hidden: false, text: "렌더되면 안 되는 옛 projection",
  style: { font_family: "Pretendard Variable", font_size: 40, font_weight: 500, line_height: 1.2, letter_spacing: 0, color: "#111111", align: "left", vertical_align: "middle" },
});
serverDeck.slides[1].elements.push({
  id: "s5-preserved-logo", type: "logo", name: "보존할 로고", x: 640, y: 980, width: 300, height: 120,
  rotation: 0, z_index: 1, opacity: 1, locked: false, hidden: false,
  asset_id: "builtin:logo-osmu", alt: "OSMU 로고", fit: "contain",
});
const preservedOverlay = structuredClone(serverDeck.slides[1].elements.find((element) => element.id === "s5-preserved-logo"));
let bodyRevision = 0;
let uploadCount = 0;
const uploadedAssets = { [fixturePhotoAssetId]: photoSvg, "s5b-profile.svg": profileSvg };
const posts = [];
const rejectedDraftSaves = [];

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
  throw new Error(typeof message === "function" ? message() : message);
}

const canvasProofServer = await createViteServer({
  root: process.cwd(),
  configFile: path.resolve("tests/fixtures/editroom-v2/vite.config.ts"),
  logLevel: "error",
  server: { host: "127.0.0.1", port: 3476, strictPort: true },
});
await canvasProofServer.listen();
const browserInfo = await ensureBrowser({ logLevel: "silent" });
const browser = await chromium.launch({ headless: true, executablePath: browserInfo.path });
const context = await browser.newContext({ viewport: { width: 1440, height: 1000 } });
await context.addInitScript(({ id, state }) => {
  localStorage.setItem("dashboard_auth_token", "chat-s5-token");
  localStorage.setItem("active_workspace", JSON.stringify({ id, slug: "s5", name: "S5 실구동", tier: "team" }));
  localStorage.setItem(`studio_work:${id}`, JSON.stringify(state));
}, { id: workspaceId, state: work() });

await context.route("**/__s5-assets/**", async (route) => {
  const dataUrl = route.request().url().includes("profile") ? profileSvg : photoSvg;
  return route.fulfill({
    status: 200,
    contentType: "image/svg+xml",
    headers: { "access-control-allow-origin": "*" },
    body: Buffer.from(dataUrl.split(",")[1], "base64"),
  });
});

await context.route("**/api/**", async (route) => {
  const request = route.request();
  const pathname = new URL(request.url()).pathname;
  if (pathname === "/api/me") return json(route, { isOperator: false, tenant: { id: workspaceId, slug: "s5", name: "S5 실구동", status: "active" } });
  if (pathname === "/api/studio/drafts") {
    if (request.method() !== "POST") return json(route, new URL(request.url()).searchParams.has("id") ? { draft: draft(true) } : { drafts: [draft()], currentWork: null });
    const body = JSON.parse(request.postData() || "{}");
    posts.push(body);
    if (body.bodyBaseRevision !== undefined && body.bodyBaseRevision !== bodyRevision) {
      rejectedDraftSaves.push({ status: 409, code: "BODY_STALE_REVISION" });
      return json(route, { ok: false, code: "BODY_STALE_REVISION", latestBody: { editLines: ["카톡 대화 카드"], cardDeck: serverLegacyDeck, cardDeckV3: serverDeck, bodyRevision } }, 409);
    }
    if (body.cardDeckV3 && body.cardDeck && !isSynchronizedChatCardDeckV3(body.cardDeck, body.cardDeckV3)) {
      rejectedDraftSaves.push({ status: 409, code: "CARD_CHAT_V3_SOURCE_MISMATCH" });
      return json(route, { ok: false, code: "CARD_CHAT_V3_SOURCE_MISMATCH", error: "v2/v3 source hash mismatch" }, 409);
    }
    if (body.cardDeck) {
      try {
        validateCardDeck(body.cardDeck);
      } catch (error) {
        rejectedDraftSaves.push({ status: 422, code: "CARD_DECK_INVALID", error: error instanceof Error ? error.message : String(error) });
        return json(route, { ok: false, code: "CARD_DECK_INVALID", error: error instanceof Error ? error.message : String(error) }, 422);
      }
      serverLegacyDeck = structuredClone(body.cardDeck);
    }
    if (body.cardDeckV3) {
      validateCardDeckV3(body.cardDeckV3);
      serverDeck = structuredClone(body.cardDeckV3);
    }
    if (body.clearCardDeckV3 === true) serverDeck = null;
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
    return json(route, { filename, url: photoUrl });
  }
  if (pathname.startsWith("/api/images/") && request.method() === "DELETE") return json(route, { ok: true });
  if (pathname === "/api/media/resign") {
    const body = JSON.parse(request.postData() || "{}");
    return json(route, { ok: true, file: body.filename === "s5b-profile.svg" ? profileUrl : photoUrl });
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
    await page.locator("[data-card-deck-v3-workbench]").waitFor({ state: "visible", timeout: 60_000 });
  } catch (error) {
    await page.screenshot({ path: path.join(outputDir, "s5-chat-load-failure.png"), fullPage: true });
    console.error("S5_LOAD_DIAGNOSTIC", JSON.stringify({ url: page.url(), body: (await page.locator("body").innerText()).slice(0, 4_000), runtimeErrors, failedRequests }, null, 2));
    throw error;
  }
  await page.getByLabel("표지 또는 마지막 장 배경 사진 파일").setInputFiles({
    name: "changed-cover.png",
    mimeType: "image/png",
    buffer: Buffer.from("89504e470d0a1a0a", "hex"),
  });
  await waitUntil(
    () => serverDeck?.slides[0]?.background?.kind === "image" && serverDeck.slides[0].background.asset_id === "s5-chat-photo-1.png",
    15_000,
    () => `바꾼 표지 사진이 v3 덱에 저장되지 않았습니다: ${JSON.stringify(rejectedDraftSaves)}`,
  );
  await page.getByRole("button", { name: "2장" }).click();
  if ((await page.locator("[data-chat-bubble-id]").count()) < 2) throw new Error("데이터가 있는 말풍선 장을 열지 못했습니다");
  const beforeSpeakers = serverDeck.slides.map((slide) => slide.base.kind === "chat_bubble" ? slide.base.bubbles.map((bubble) => bubble.speaker) : []);
  await page.getByRole("button", { name: "덱 전체 화자 서로 바꾸기" }).click();
  await waitUntil(() => JSON.stringify(serverDeck.slides.map((slide) => slide.base.kind === "chat_bubble" ? slide.base.bubbles.map((bubble) => bubble.speaker) : [])) !== JSON.stringify(beforeSpeakers), 15_000, "전체 화자 교환이 저장되지 않았습니다");
  await page.getByRole("button", { name: "실행 취소" }).click();
  await waitUntil(() => JSON.stringify(serverDeck.slides.map((slide) => slide.base.kind === "chat_bubble" ? slide.base.bubbles.map((bubble) => bubble.speaker) : [])) === JSON.stringify(beforeSpeakers), 15_000, "전체 화자 교환 undo가 저장되지 않았습니다");

  for (const label of ["글 추가", "스티커 추가", "로고 추가"]) await page.getByRole("button", { name: label }).click();
  await page.locator("[data-card-element-list]").getByRole("button", { name: "글", exact: true }).click();
  await page.getByLabel("카드 편집 스테이지").press("Enter");
  await page.getByLabel("글 내용 직접 편집").fill("S5b 덧붙임 글");
  await page.getByLabel("글 내용 직접 편집").blur();
  await page.getByRole("button", { name: "글 오른쪽 이동" }).click();
  await page.getByRole("button", { name: "로고 삭제", exact: true }).click();
  await waitUntil(() => {
    const elements = serverDeck.slides[1].elements;
    return elements.some((element) => element.type === "text" && element.text === "S5b 덧붙임 글")
      && elements.some((element) => element.type === "sticker")
      && elements.filter((element) => element.type === "logo").length === 1;
  }, 15_000, "글·스티커 추가와 새 로고 삭제가 저장되지 않았습니다");
  if (serverDeck.slides[1].elements.some((element) => element.id === "el_orphan-old")) throw new Error("고아 projection 글 요소가 정리되지 않았습니다");

  await page.getByRole("button", { name: "후보 3개 비교" }).click();
  await page.getByRole("dialog", { name: "말투 다듬기 비교" }).waitFor();
  if (await page.getByRole("button", { name: "이 후보 적용" }).count() !== 3) throw new Error("말투 후보가 정확히 3개가 아닙니다");
  await page.locator('[data-tone-candidate="b"]').getByRole("button", { name: "이 후보 적용" }).click();
  await waitUntil(() => serverDeck.slides[1].base.kind === "chat_bubble" && serverDeck.slides[1].base.bubbles.every((bubble) => bubble.segments.map((segment) => segment.text).join("").endsWith(" B")), 15_000, "선택한 말투 후보만 저장되지 않았습니다");

  const cover = serverDeck.slides[0];
  const final = serverDeck.slides.at(-1);
  if (cover.background.kind !== "image" || final.background.kind !== "image") throw new Error("표지·마지막 사진이 v3 배경에 남지 않았습니다");
  if (!serverLegacyDeck.slides[0].cover_image_url || !serverLegacyDeck.slides.at(-1).cover_image_url) throw new Error("legacy 표지·마지막 사진이 사라졌습니다");
  if (!await page.getByLabel("카톡 대화 고급 편집 도구").isVisible()) throw new Error("카톡 고급 편집 도구가 보이지 않습니다");
  if (!await page.locator("[data-card-deck-v3-workbench]").isVisible()) throw new Error("저장된 카톡 v3 덱이 공용 편집 화면을 열지 않았습니다");
  if (!await page.locator('[data-card-slide-scene] [data-chat-avatar="media"]').isVisible()) throw new Error("브라우저 고급 편집 화면에 프로필 아바타가 보이지 않습니다");
  const currentOverlay = serverDeck.slides[1].elements.find((element) => element.id === "s5-preserved-logo");
  if (!currentOverlay || currentOverlay.x !== preservedOverlay.x || currentOverlay.y !== preservedOverlay.y) throw new Error("기존 v3 덧붙임 요소 위치가 바뀌었습니다");

  const viewports = [
    { width: 360, height: 800 }, { width: 390, height: 844 }, { width: 412, height: 915 },
    { width: 600, height: 900 }, { width: 700, height: 1000 }, { width: 780, height: 1000 },
    { width: 820, height: 1100 }, { width: 900, height: 1100 }, { width: 1000, height: 1200 },
    { width: 1440, height: 1000 },
  ];
  const responsive = [];
  const layoutAssertionWidths = new Set([390, 600, 1440]);
  for (const viewport of viewports) {
    await page.setViewportSize(viewport);
    await page.locator("[data-card-canvas-editor]").scrollIntoViewIfNeeded();
    const overflow = await page.evaluate(() => ({ width: document.documentElement.clientWidth, scroll: document.documentElement.scrollWidth }));
    if (overflow.scroll > overflow.width + 1) throw new Error(`${viewport.width}px 가로 넘침: ${JSON.stringify(overflow)}`);
    let layout = null;
    if (layoutAssertionWidths.has(viewport.width)) {
      await page.locator("[data-card-stage]").scrollIntoViewIfNeeded();
      layout = await page.evaluate(({ width, height }) => {
        const stageElement = document.querySelector("[data-card-stage]");
        const stage = stageElement?.getBoundingClientRect();
        const rightPanelElement = document.querySelector("[data-card-right-panel]");
        const rightPanel = rightPanelElement?.getBoundingClientRect();
        const editorElement = document.querySelector("[data-card-canvas-editor]");
        const editor = editorElement?.getBoundingClientRect();
        const advancedToolbar = document.querySelector('[aria-label="카톡 대화 고급 편집 도구"]')?.getBoundingClientRect();
        const firstBubbleButton = document.querySelector("[data-chat-bubble-id] button")?.getBoundingClientRect();
        const workspace = document.querySelector("[data-card-stage-column]")?.parentElement?.getBoundingClientRect();
        const stageColumn = document.querySelector("[data-card-stage-column]")?.getBoundingClientRect();
        if (!stage || !rightPanel || !advancedToolbar || !firstBubbleButton) return null;
        const visibleRect = (rect) => ({
          left: rect.left,
          right: rect.right,
          top: rect.top,
          bottom: rect.bottom,
          width: rect.width,
          height: rect.height,
          visibleWidth: Math.max(0, Math.min(rect.right, width) - Math.max(rect.left, 0)),
          visibleHeight: Math.max(0, Math.min(rect.bottom, height) - Math.max(rect.top, 0)),
        });
        return {
          stage: visibleRect(stage),
          advancedToolbar: visibleRect(advancedToolbar),
          rightPanel: visibleRect(rightPanel),
          firstBubbleButton: visibleRect(firstBubbleButton),
          containers: {
            innerWidth: window.innerWidth,
            mobileMedia: window.matchMedia("(max-width: 1023px)").matches,
            editor: editor ? { left: editor.left, right: editor.right, width: editor.width, scrollLeft: editorElement.scrollLeft, scrollWidth: editorElement.scrollWidth, clientWidth: editorElement.clientWidth } : null,
            workspace: workspace ? { left: workspace.left, right: workspace.right, width: workspace.width } : null,
            stageColumn: stageColumn ? { left: stageColumn.left, right: stageColumn.right, width: stageColumn.width } : null,
            stageStyle: {
              width: getComputedStyle(stageElement).width,
              minWidth: getComputedStyle(stageElement).minWidth,
              maxWidth: getComputedStyle(stageElement).maxWidth,
              display: getComputedStyle(stageElement).display,
              position: getComputedStyle(stageElement).position,
            },
          },
        };
      }, viewport);
      if (!layout) throw new Error(`${viewport.width}px 카드 미리보기 또는 오른쪽 패널을 찾지 못했습니다`);
      if (layout.stage.visibleWidth < layout.stage.width - 1 || layout.stage.visibleHeight < Math.min(layout.stage.height, 160)) {
        throw new Error(`${viewport.width}px 카드 미리보기가 가시 영역 밖입니다: ${JSON.stringify(layout)}`);
      }
      if (layout.rightPanel.width < 240 || layout.rightPanel.visibleWidth < Math.min(layout.rightPanel.width, 240) - 1) {
        throw new Error(`${viewport.width}px 오른쪽 패널이 가시 영역 밖입니다: ${JSON.stringify(layout.rightPanel)}`);
      }
      if (layout.advancedToolbar.visibleWidth < Math.min(layout.advancedToolbar.width, 240) - 1) {
        throw new Error(`${viewport.width}px 카톡 고급 편집 도구가 가시 영역 밖입니다: ${JSON.stringify(layout.advancedToolbar)}`);
      }
      if (layout.firstBubbleButton.visibleWidth < Math.min(layout.firstBubbleButton.width, 44) - 1) {
        throw new Error(`${viewport.width}px 첫 말풍선 편집 버튼이 가시 영역 밖입니다: ${JSON.stringify(layout.firstBubbleButton)}`);
      }
      if (layout.containers.editor?.scrollLeft !== 0) {
        throw new Error(`${viewport.width}px 편집기 컨테이너가 가로 스크롤됐습니다: ${JSON.stringify(layout.containers.editor)}`);
      }
    }
    const screenshot = path.join(outputDir, `s5-chat-advanced-editor-${viewport.width}.png`);
    await page.screenshot({ path: screenshot, fullPage: true });
    responsive.push({ viewport: viewport.width, overflow, ...(layout ? { layout } : {}) });
  }

  await page.setViewportSize({ width: 1440, height: 1000 });
  const editorScenePng = path.join(outputDir, "s5b-chat-overlay-browser-scene.png");
  await page.locator("[data-card-slide-scene]").screenshot({ path: editorScenePng });

  const canvasProofPage = await context.newPage();
  await canvasProofPage.goto("http://127.0.0.1:3476/tests/fixtures/editroom-v2/chat-canvas-proof.html", { waitUntil: "networkidle" });
  const browserCanvas = canvasProofPage.locator('[data-browser-canvas-proof="ready"]');
  await browserCanvas.waitFor({ state: "visible" });
  const browserCanvasDataUrl = await browserCanvas.evaluate((canvas) => canvas.toDataURL("image/png"));
  const browserCanvasPng = path.join(outputDir, "s5b-chat-profile-browser-canvas.png");
  fs.writeFileSync(browserCanvasPng, Buffer.from(browserCanvasDataUrl.split(",")[1], "base64"));
  await canvasProofPage.close();

  const remotionPng = path.join(outputDir, "s5b-chat-overlay-profile-remotion.png");
  await renderCardSlidePng({ model: cardSlideRenderModel(serverDeck, serverDeck.slides[1].id, uploadedAssets), outputPath: remotionPng });
  const readerBubbleCount = serverDeck.slides[1].base.kind === "chat_bubble"
    ? serverDeck.slides[1].base.bubbles.filter((bubble) => bubble.speaker === "reader").length
    : 0;
  if (readerBubbleCount < 1) throw new Error("독자 말풍선이 있는 실렌더 픽스처가 아닙니다");

  const alternatingDeck = structuredClone(serverDeck);
  const alternatingSlide = alternatingDeck.slides[1];
  if (alternatingSlide.base.kind !== "chat_bubble") throw new Error("작성자-독자-작성자 검증용 카톡 장이 없습니다");
  const readerBubble = alternatingSlide.base.bubbles.find((bubble) => bubble.speaker === "reader");
  const authorBubble = alternatingSlide.base.bubbles.find((bubble) => bubble.speaker === "brand");
  if (!readerBubble || !authorBubble) throw new Error("작성자-독자-작성자 검증용 두 화자가 없습니다");
  alternatingSlide.base.bubbles = [
    { ...structuredClone(authorBubble), id: "s5-author-first", order: 0 },
    { ...structuredClone(readerBubble), id: "s5-reader-middle", order: 1 },
    { ...structuredClone(authorBubble), id: "s5-author-second", order: 2, segments: [{ text: "다시 답할 때 이름도 다시 보여요", bold: false }] },
  ];
  const alternatingPng = path.join(outputDir, "s5-chat-author-reader-author-remotion.png");
  await renderCardSlidePng({ model: cardSlideRenderModel(alternatingDeck, alternatingSlide.id, uploadedAssets), outputPath: alternatingPng });

  const overflowingDeck = structuredClone(serverDeck);
  const overflowSlide = overflowingDeck.slides[1];
  if (overflowSlide.base.kind !== "chat_bubble") throw new Error("넘침 검증용 카톡 장이 없습니다");
  overflowSlide.base.bubbles = overflowSlide.base.bubbles.map((bubble) => ({
    ...bubble,
    segments: [{ text: `${bubble.segments.map((segment) => segment.text).join("")} `.repeat(45), bold: false }],
  }));
  let overflowError = "";
  try {
    await renderCardSlidePng({ model: cardSlideRenderModel(overflowingDeck, overflowSlide.id, uploadedAssets), outputPath: path.join(outputDir, "s5-chat-overflow-should-not-exist.png") });
  } catch (error) {
    overflowError = error instanceof Error ? error.message : String(error);
  }
  if (!overflowError.includes("CARD_CHAT_OVERFLOW")) throw new Error(`넘치는 Remotion 렌더가 거절되지 않았습니다: ${overflowError}`);

  const coverPng = path.join(outputDir, "s5-chat-cover-photo.png");
  const finalPng = path.join(outputDir, "s5-chat-final-photo.png");
  await renderCardSlidePng({ model: cardSlideRenderModel(serverDeck, cover.id, uploadedAssets), outputPath: coverPng });
  await renderCardSlidePng({ model: cardSlideRenderModel(serverDeck, final.id, uploadedAssets), outputPath: finalPng });
  await page.evaluate(() => {
    window.__s5bPublishMessages = [];
    const observer = new MutationObserver((mutations) => {
      for (const mutation of mutations) {
        for (const node of mutation.addedNodes) {
          const text = node.textContent?.trim();
          if (text) window.__s5bPublishMessages.push(text);
        }
      }
    });
    observer.observe(document.body, { childList: true, subtree: true });
  });
  await page.getByRole("button", { name: "발행실로 이동" }).click();
  try {
    await page.locator('[data-room="publish"]').waitFor({ state: "visible", timeout: 30_000 });
  } catch (error) {
    await page.screenshot({ path: path.join(outputDir, "s5-chat-publish-route-failure.png"), fullPage: true });
    const bodyText = await page.locator("body").innerText();
    throw new Error(`발행실 route 이동 실패: ${JSON.stringify({
      url: page.url(),
      rejectedDraftSaves,
      posts: posts.length,
      uploads: uploadCount,
      runtimeErrors,
      failedRequests,
      observedMessages: await page.evaluate(() => window.__s5bPublishMessages ?? []),
      messages: bodyText.split("\n").filter((line) => /(못|실패|오류|사진|저장)/.test(line)).slice(-20),
    })}`, { cause: error });
  }
  if (!new URL(page.url()).searchParams.get("room")?.includes("publish")) throw new Error(`실제 발행실 route로 이동하지 않았습니다: ${page.url()}`);
  const publishRoute = page.url();
  const finalDeck = structuredClone(serverDeck);
  await page.goto(`${baseUrl}/studio?room=edit&draft_id=${draftId}`, { waitUntil: "networkidle", timeout: 60_000 });
  await page.locator("[data-card-deck-v3-workbench]").waitFor({ state: "visible", timeout: 60_000 });
  await page.getByRole("button", { name: "기본 편집으로 돌아가기" }).click();
  await page.getByRole("button", { name: "기본 말풍선 편집기로 돌아가기" }).click();
  await page.locator("[data-card-deck-workbench]").waitFor({ state: "visible", timeout: 30_000 });
  await waitUntil(
    () => serverDeck === null,
    15_000,
    () => `카톡 v3 덱이 서버에서 정리되지 않았습니다: ${JSON.stringify(rejectedDraftSaves)}`,
  );
  if (serverLegacyDeck.slides[0].cover_image_url !== photoUrl) throw new Error("바꾼 표지 사진이 기본 말풍선 편집기로 보존되지 않았습니다");
  if (runtimeErrors.length) throw new Error(`브라우저 console/page 오류 ${runtimeErrors.length}건: ${runtimeErrors.join(" | ")}`);
  if (failedRequests.length) throw new Error(`실패 network request ${failedRequests.length}건: ${failedRequests.join(" | ")}`);

  const result = {
    result: "PASS",
    cards: finalDeck.slides.length,
    uploads: uploadCount,
    chatV3Workbench: true,
    speakerSwapUndo: true,
    toneCandidateCount: 3,
    advancedEditorPreserved: true,
    overlayPreserved: Boolean(currentOverlay) && currentOverlay.x === preservedOverlay.x && currentOverlay.y === preservedOverlay.y,
    overlayTypes: finalDeck.slides[1].elements.map((element) => element.type),
    orphanProjectionRemoved: !finalDeck.slides[1].elements.some((element) => element.id === "el_orphan-old"),
    profileAssetId: finalDeck.brand.profile_image_asset_id,
    browserEditorProfileVisible: true,
    browserCanvasPng,
    editorScenePng,
    remotionPng,
    readerBubbleCount,
    authorReaderAuthorRendered: true,
    overflowRejected: overflowError.includes("CARD_CHAT_OVERFLOW"),
    overflowError,
    coverPhoto: cover.background,
    finalPhoto: final.background,
    returnedToBasicEditor: true,
    returnedCoverPhotoPreserved: serverLegacyDeck.slides[0].cover_image_url === photoUrl,
    responsive,
    consoleErrors: runtimeErrors.length,
    failedRequests: failedRequests.length,
    saves: posts.length,
    publishRoute,
  };
  fs.writeFileSync(path.join(outputDir, "s5-chat-result.json"), JSON.stringify(result, null, 2));
  console.log(JSON.stringify(result, null, 2));
} finally {
  await browser.close();
  await canvasProofServer.close();
}
