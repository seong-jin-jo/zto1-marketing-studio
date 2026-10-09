#!/usr/bin/env node

import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { chromium } from "playwright-core";
import sharp from "sharp";

const scriptDir = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(scriptDir, "../..");
const baseUrl = process.env.CHAIRMAN_FIX_BASE_URL || "http://127.0.0.1:3471";
const outputDir = process.env.CHAIRMAN_FIX_OUTPUT_DIR || path.join(repoRoot, "logs/diff/editroom-chairman-fix-r7/after");
const workspaceId = "11111111-1111-4111-8111-111111111111";
const imageUrl = "/qa/chairman-photo.jpg";
const videoUrl = "/qa/chairman-photo-motion.mp4";
const expiredVideoToken = `${Buffer.from(JSON.stringify({ f: "chairman-photo-motion.mp4", e: 1 })).toString("base64url")}.expired-signature`;
const expiredVideoUrl = `/api/media/${expiredVideoToken}`;
const exportedImageUrl = "/qa/chairman-photo.jpg?export=chairman-v3";
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
  vid: { url: videoUrl, file: videoUrl, filename: "chairman-photo-motion.mp4", subtitlesBaked: false },
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
let exportStarted = false;
let exportJobReads = 0;
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
  if (pathname === "/api/higgsfield/job/chairman-image-job") return json(route, { ok: true, status: "completed", file: imageUrl, url: imageUrl, filename: "chairman-photo.jpg" });
  if (pathname === "/api/higgsfield/status") return json(route, { credits: 100 });
  if (pathname === "/api/images/upload" && request.method() === "POST") {
    return json(route, { ok: true, url: imageUrl, filename: "chairman-photo.jpg" });
  }
  if (pathname === "/api/media/resign") {
    const body = request.postDataJSON();
    return json(route, { ok: true, file: body?.purpose === "media" ? videoUrl : imageUrl });
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
  if (/^\/api\/studio\/drafts\/[^/]+\/exports\/latest$/.test(pathname)) {
    return json(route, exportStarted ? {
      current_source_revision: draftSaves.length || 1,
      current_source_hash: "chairman-source-hash",
      latest_export: {
        export_id: "chairman-export",
        status: exportJobReads >= 2 ? "succeeded" : "processing",
        source_revision: draftSaves.length || 1,
        source_hash: "chairman-source-hash",
        finished_at: exportJobReads >= 2 ? new Date().toISOString() : null,
      },
      is_latest: exportJobReads >= 2,
      blocker: exportJobReads >= 2 ? null : "EXPORT_IN_PROGRESS",
    } : {
      current_source_revision: draftSaves.length || 1,
      current_source_hash: "chairman-source-hash",
      latest_export: null,
      is_latest: false,
      blocker: "NO_SUCCESSFUL_EXPORT",
    });
  }
  if (/^\/api\/studio\/drafts\/[^/]+\/exports$/.test(pathname) && request.method() === "POST") {
    exportStarted = true;
    exportJobReads = 0;
    return json(route, { export_id: "chairman-export", status: "queued" }, 202);
  }
  if (/^\/api\/studio\/drafts\/[^/]+\/exports\/chairman-export$/.test(pathname)) {
    exportJobReads += 1;
    const succeeded = exportJobReads >= 2;
    return json(route, {
      export_id: "chairman-export",
      status: succeeded ? "succeeded" : "processing",
      source_revision: draftSaves.length || 1,
      source_hash: "chairman-source-hash",
      progress: { completed: succeeded ? 1 : 0, total: 1 },
      items: [{
        item_key: "slide-1",
        ordinal: 0,
        status: succeeded ? "succeeded" : "processing",
        attempt_count: 1,
        ...(succeeded ? { artifact_url: exportedImageUrl } : {}),
      }],
      updated_at: new Date().toISOString(),
      finished_at: succeeded ? new Date().toISOString() : null,
    });
  }
  if (/^\/api\/studio\/drafts\/[^/]+\/enqueue$/.test(pathname) && request.method() === "POST") {
    return json(route, {
      ok: true,
      export_id: "chairman-export",
      source_hash: "chairman-source-hash",
      pin_status: "publish_ready",
      post: {
        id: "chairman-queue-post",
        imageUrl: exportedImageUrl,
        imageUrls: [exportedImageUrl],
        videoFilename: "chairman-photo-motion.mp4",
        videoUrl,
      },
    }, 201);
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

async function assertCardEditorFits(viewport) {
  const workbench = page.locator('[data-card-deck-v3-workbench]');
  const measurement = await workbench.evaluate((root, currentViewport) => {
    const rect = (node) => {
      const value = node.getBoundingClientRect();
      return { x: value.x, y: value.y, width: value.width, height: value.height, right: value.right, bottom: value.bottom };
    };
    const canvas = root.querySelector('[data-card-stage]');
    if (!(canvas instanceof HTMLElement)) throw new Error('카드 캔버스를 찾지 못했습니다');
    const rootRect = rect(root);
    const canvasRect = rect(canvas);
    const outside = [root, ...root.querySelectorAll('*')]
      .filter((node) => node instanceof HTMLElement && node.offsetParent !== null)
      .map((node) => ({ node, value: rect(node) }))
      .filter(({ value }) => value.x < rootRect.x - 1 || value.right > rootRect.right + 1)
      .slice(0, 20)
      .map(({ node, value }) => ({
        tag: node.tagName,
        marker: node.getAttribute('aria-label') || node.getAttribute('data-card-template-gallery') || node.className,
        rect: value,
      }));
    const overflow = [root, ...root.querySelectorAll('*')]
      .filter((node) => node instanceof HTMLElement && node.clientWidth > 0 && node.scrollWidth > node.clientWidth + 1)
      .map((node) => ({
        tag: node.tagName,
        marker: node.getAttribute('data-card-canvas-editor') !== null ? 'card-editor'
          : node.getAttribute('data-card-stage') !== null ? 'card-stage'
            : node.getAttribute('data-card-right-panel') !== null ? 'right-panel'
              : node.getAttribute('aria-label') || node.className,
        clientWidth: node.clientWidth,
        scrollWidth: node.scrollWidth,
        scrollLeft: node.scrollLeft,
      }));
    const elementActionButtons = [...root.querySelectorAll('[data-card-element-list] [aria-label$=" 조작"] button')]
      .filter((node) => node instanceof HTMLElement && node.offsetParent !== null)
      .map((node) => {
        const bounds = node.getBoundingClientRect();
        return {
          label: node.getAttribute('aria-label') || node.textContent?.trim() || '',
          width: bounds.width,
          height: bounds.height,
          clientWidth: node.clientWidth,
          scrollWidth: node.scrollWidth,
          flexShrink: getComputedStyle(node).flexShrink,
        };
      });
    return {
      viewport: currentViewport,
      root: rootRect,
      canvas: canvasRect,
      overflow,
      outside,
      elementActionButtons,
      rootScrollLeft: root.scrollLeft,
    };
  }, viewport);
  if (measurement.overflow.length) throw new Error(`카드 편집 자손 가로 넘침: ${JSON.stringify(measurement)}`);
  if (measurement.outside.length) throw new Error(`카드 편집 자손이 편집 패널 밖으로 이탈했습니다: ${JSON.stringify(measurement)}`);
  if (measurement.rootScrollLeft !== 0) throw new Error(`카드 편집 작업대가 가로로 스크롤됐습니다: ${JSON.stringify(measurement)}`);
  const invalidActionButton = measurement.elementActionButtons.find((button) => (
    button.width < 44
    || button.height < 44
    || button.scrollWidth > button.clientWidth + 1
    || button.flexShrink !== '0'
  ));
  if (invalidActionButton) {
    throw new Error(`카드 요소 조작 버튼의 44px·라벨 비절단 계약 위반: ${JSON.stringify(measurement)}`);
  }
  const canvasInsidePanel = measurement.canvas.x >= measurement.root.x - 1
    && measurement.canvas.right <= measurement.root.right + 1;
  const canvasInsideViewport = measurement.canvas.x >= -1
    && measurement.canvas.right <= viewport.width + 1;
  const canvasInsideFirstScreen = viewport.width < 1024
    || (measurement.canvas.y >= -1 && measurement.canvas.bottom <= viewport.height + 1);
  if (!canvasInsidePanel || !canvasInsideViewport || !canvasInsideFirstScreen) {
    throw new Error(`카드 캔버스가 편집 패널 또는 첫 화면 밖입니다: ${JSON.stringify(measurement)}`);
  }
  return measurement;
}

await page.goto(`${baseUrl}/studio?room=create`, { waitUntil: "domcontentloaded" });
await page.getByTestId("create-card-image").waitFor();
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
const generatedImageStats = await sharp(await page.getByTestId("create-made-image").screenshot()).stats();
if (!generatedImageStats.channels.some((channel) => channel.stdev > 20)) throw new Error("생성 결과가 식별 가능한 실제 이미지가 아니라 단색 픽스처입니다");
if (!draftSaves.some((save) => save.img?.file === imageUrl && save.vid?.file === videoUrl)) throw new Error("생성 결과 이미지와 기존 영상이 같은 초안에 저장되지 않았습니다");

// 운영 재측정(93b72a4b)에서 발견한 실제 과거 초안 모양을 그대로 재현한다.
// 현재 img/vid 객체가 아니라 payload 최상위 image_urls/videoUrl만 있고, 영상 주소는 만료됐다.
currentDraft = {
  ...currentDraft,
  img: null,
  vid: null,
  image_urls: [imageUrl],
  imageUrl: imageUrl,
  videoUrl: expiredVideoUrl,
};
await page.reload({ waitUntil: "domcontentloaded" });
await page.getByTestId("create-card-image").waitFor();

await page.getByRole("button", { name: /작업물 전체/ }).click();
const workThumbnail = page.getByTestId("work-thumbnail-chairman-draft");
await workThumbnail.waitFor();
const workThumbnailDelivery = await workThumbnail.evaluate((media) => ({
  tag: media.tagName,
  preload: media.getAttribute("preload"),
}));
if (workThumbnailDelivery.tag === "VIDEO" && workThumbnailDelivery.preload !== "none") {
  throw new Error(`작업물 영상 썸네일이 원본을 미리 내려받습니다: ${JSON.stringify(workThumbnailDelivery)}`);
}
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
const editRoomToasts = page.locator('#toast-container > div');
const editToastCount = await editRoomToasts.count();
if (editToastCount > 1) throw new Error(`초안 불러오기 뒤 토스트가 중복 표시됩니다: ${await editRoomToasts.allTextContents()}`);
if ((await page.getByText(/내보내기 판/).count()) > 0) throw new Error("사용자 안내에 '내보내기 판' 조어가 남아 있습니다");
const cardBackground = editRoom.locator('[data-card-slide-scene] img').first();
await cardBackground.waitFor();
if (await cardBackground.evaluate((image) => image.naturalWidth) <= 0) throw new Error("편집실 카드에 실제 생성 이미지 픽셀이 표시되지 않았습니다");
const stageRect = await editRoom.locator('[data-card-slide-scene]').boundingBox();
if (!stageRect || stageRect.x < 0 || stageRect.x + stageRect.width > 1440 || stageRect.y < 0 || stageRect.y + stageRect.height > 900) {
  const geometry = await editRoom.evaluate((root) => Array.from(root.querySelectorAll('[data-room-top="edit"], [data-card-canvas-editor] > *, [data-edit-workspace]')).map((node) => {
    const rect = node.getBoundingClientRect();
    return { tag: node.tagName, marker: node.getAttribute("data-card-template-gallery") || node.getAttribute("data-edit-workspace") || node.getAttribute("role") || node.className, y: rect.y, height: rect.height };
  }));
  await page.screenshot({ path: path.join(outputDir, "failed-edit-card-first-screen.png") });
  throw new Error(`카드 캔버스가 1440 첫 화면 밖입니다: ${JSON.stringify({ stageRect, geometry })}`);
}
const initialTextElement = editRoom.locator('[data-card-stage] [data-element-selection]').first();
const draggedElementId = await initialTextElement.getAttribute('data-element-selection');
if (!draggedElementId) throw new Error("드래그할 카드 글자 요소 식별자가 없습니다");
const textElement = editRoom.locator(`[data-card-stage] [data-element-selection="${draggedElementId}"]`).first();
const clientRect = (locator) => locator.evaluate((element) => {
  const rect = element.getBoundingClientRect();
  return { x: rect.x, y: rect.y, width: rect.width, height: rect.height };
});
const beforeBox = await clientRect(textElement);
const beforePixels = await editRoom.locator('[data-card-slide-scene]').screenshot();
if (!beforeBox) throw new Error("드래그할 카드 글자 요소가 없습니다");
await page.mouse.move(beforeBox.x + beforeBox.width / 2, beforeBox.y + beforeBox.height / 2);
await page.mouse.down();
await page.mouse.move(beforeBox.x + beforeBox.width / 2 + 84, beforeBox.y + beforeBox.height / 2 + 112, { steps: 12 });
await page.mouse.up();
await page.waitForFunction(({ elementId, before }) => {
  const element = document.querySelector(`[data-card-stage] [data-element-selection="${elementId}"]`);
  const scene = element?.closest('[data-card-stage]')?.querySelector('[data-card-slide-scene]');
  if (!(element instanceof HTMLElement) || !(scene instanceof HTMLElement)) return false;
  const elementRect = element.getBoundingClientRect();
  const sceneRect = scene.getBoundingClientRect();
  const moved = Math.abs(elementRect.x - before.x) >= 2 || Math.abs(elementRect.y - before.y) >= 2;
  const contained = elementRect.x >= sceneRect.x - 1
    && elementRect.y >= sceneRect.y - 1
    && elementRect.right <= sceneRect.right + 1
    && elementRect.bottom <= sceneRect.bottom + 1;
  if (!moved || !contained) {
    window.__chairmanDragStable = null;
    return false;
  }
  const signature = [elementRect.x, elementRect.y, elementRect.width, elementRect.height].map((value) => value.toFixed(2)).join(':');
  const previous = window.__chairmanDragStable;
  if (!previous || previous.signature !== signature) {
    window.__chairmanDragStable = { signature, since: performance.now() };
    return false;
  }
  return performance.now() - previous.since >= 120;
}, { elementId: draggedElementId, before: beforeBox }, { timeout: 5_000 });
const afterBox = await clientRect(textElement);
if (!afterBox || (Math.abs(afterBox.x - beforeBox.x) < 2 && Math.abs(afterBox.y - beforeBox.y) < 2)) throw new Error("카드 글자 드래그 뒤 좌표가 바뀌지 않았습니다");
const movedStageRect = await clientRect(editRoom.locator('[data-card-slide-scene]'));
if (!movedStageRect || !afterBox || afterBox.x < movedStageRect.x - 1 || afterBox.y < movedStageRect.y - 1 || afterBox.x + afterBox.width > movedStageRect.x + movedStageRect.width + 1 || afterBox.y + afterBox.height > movedStageRect.y + movedStageRect.height + 1) {
  const stageHostRect = await clientRect(editRoom.locator('[data-card-stage]'));
  const elementGeometry = await textElement.evaluate((element) => {
    const style = getComputedStyle(element);
    const parent = element.offsetParent;
    const parentRect = parent instanceof HTMLElement ? parent.getBoundingClientRect() : null;
    const selfRect = element.getBoundingClientRect();
    return {
      left: style.getPropertyValue('--selection-left'),
      top: style.getPropertyValue('--selection-top'),
      width: style.getPropertyValue('--selection-width'),
      height: style.getPropertyValue('--selection-height'),
      transform: style.transform,
      computedTop: style.top,
      computedLeft: style.left,
      position: style.position,
      selfRect: { x: selfRect.x, y: selfRect.y, width: selfRect.width, height: selfRect.height },
      parentRect: parentRect ? { x: parentRect.x, y: parentRect.y, width: parentRect.width, height: parentRect.height } : null,
      parentMarker: parent instanceof HTMLElement ? parent.getAttribute('data-card-stage') || parent.className : null,
    };
  });
  throw new Error(`카드 글자 요소가 캔버스 밖으로 잘렸습니다: ${JSON.stringify({ stageHostRect, movedStageRect, beforeBox, afterBox, elementGeometry })}`);
}
const afterPixels = await editRoom.locator('[data-card-slide-scene]').screenshot();
const pixelDiff = await sharp(beforePixels).composite([{ input: afterPixels, blend: "difference" }]).stats();
if (!pixelDiff.channels.some((channel) => channel.mean > 0.2)) throw new Error("카드 글자 드래그 뒤 미리보기 픽셀이 바뀌지 않았습니다");
if ((await page.getByText(/자유 배치를 시작했습니다|기본 편집으로 돌아가면/).count()) > 0) throw new Error("기본 카드 편집에 별도 자유 배치 모드 토스트가 남아 있습니다");

const cardLayout = [];
for (const viewport of [{ width: 1440, height: 900 }, { width: 1512, height: 982 }, { width: 390, height: 844 }]) {
  await page.setViewportSize(viewport);
  await assertNoHorizontalOverflow(`편집실 ${viewport.width}`);
  const canvas = editRoom.locator('[data-card-slide-scene]');
  await canvas.waitFor();
  cardLayout.push(await assertCardEditorFits(viewport));
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
await editRoom.locator('[data-card-stage]').evaluate((element) => element.scrollIntoView({ block: 'center', inline: 'nearest' }));
const resizeHandle = textElement.locator('[data-handle="se"]');
await resizeHandle.waitFor();
const resizeBeforeRect = await clientRect(textElement);
const resizeHandleBox = await clientRect(resizeHandle);
if (!resizeBeforeRect || !resizeHandleBox) throw new Error("카드 글자 크기 조절점을 찾지 못했습니다");
await page.mouse.move(resizeHandleBox.x + resizeHandleBox.width / 2, resizeHandleBox.y + resizeHandleBox.height / 2);
await page.mouse.down();
await page.mouse.move(Math.min(1438, resizeHandleBox.x + 300), Math.min(898, resizeHandleBox.y + 100), { steps: 12 });
await page.mouse.up();
await page.waitForFunction(({ elementId, before }) => {
  const element = document.querySelector(`[data-card-stage] [data-element-selection="${elementId}"]`);
  const scene = element?.closest('[data-card-stage]')?.querySelector('[data-card-slide-scene]');
  if (!(element instanceof HTMLElement) || !(scene instanceof HTMLElement)) return false;
  const elementRect = element.getBoundingClientRect();
  const sceneRect = scene.getBoundingClientRect();
  return (elementRect.width > before.width + 2 || elementRect.height > before.height + 2)
    && elementRect.x >= sceneRect.x - 1
    && elementRect.y >= sceneRect.y - 1
    && elementRect.right <= sceneRect.right + 1
    && elementRect.bottom <= sceneRect.bottom + 1;
}, { elementId: draggedElementId, before: resizeBeforeRect }, { timeout: 5_000 });
const resizedSelectionRect = await clientRect(textElement);
const resizedStageRect = await clientRect(editRoom.locator('[data-card-slide-scene]'));
if (!resizedSelectionRect || resizedSelectionRect.width <= resizeBeforeRect.width + 2 || resizedSelectionRect.height <= resizeBeforeRect.height + 2) {
  throw new Error(`카드 크기 조절 드래그가 요소 크기를 바꾸지 못했습니다: ${JSON.stringify({ resizeBeforeRect, resizedSelectionRect })}`);
}
if (!resizedStageRect
  || resizedSelectionRect.x < resizedStageRect.x - 1
  || resizedSelectionRect.y < resizedStageRect.y - 1
  || resizedSelectionRect.x + resizedSelectionRect.width > resizedStageRect.x + resizedStageRect.width + 1
  || resizedSelectionRect.y + resizedSelectionRect.height > resizedStageRect.y + resizedStageRect.height + 1) {
  throw new Error(`과도한 크기 조절 뒤 카드 요소가 캔버스 밖으로 잘렸습니다: ${JSON.stringify({ resizedSelectionRect, resizedStageRect })}`);
}
const cardResizeContainment = { before: resizeBeforeRect, selection: resizedSelectionRect, stage: resizedStageRect };
const videoTab = editRoom.getByRole("button", { name: "영상" });
await videoTab.evaluate((element) => element.scrollIntoView({ block: "center", inline: "nearest" }));
const videoTabGeometry = await videoTab.evaluate((element) => {
  const rect = element.getBoundingClientRect();
  const hit = document.elementFromPoint(rect.x + rect.width / 2, rect.y + rect.height / 2);
  return { rect: { x: rect.x, y: rect.y, width: rect.width, height: rect.height }, hit: hit?.outerHTML.slice(0, 180) ?? null };
});
await videoTab.click({ timeout: 10_000 });
const videoElement = editRoom.locator('[data-video-el]');
await videoElement.waitFor();
const videoFrame = await videoElement.evaluate(async (video) => {
  if (video.readyState < HTMLMediaElement.HAVE_CURRENT_DATA) {
    await new Promise((resolve, reject) => {
      const timeout = window.setTimeout(() => reject(new Error("영상 프레임 로드 시간 초과")), 10_000);
      video.addEventListener("loadeddata", () => { window.clearTimeout(timeout); resolve(undefined); }, { once: true });
      video.load();
    });
  }
  const targetTime = Math.min(1, Math.max(0, video.duration / 2));
  if (Math.abs(video.currentTime - targetTime) > 0.01) {
    await new Promise((resolve, reject) => {
      const timeout = window.setTimeout(() => {
        cleanup();
        reject(new Error("영상 프레임 탐색 시간 초과"));
      }, 5_000);
      const cleanup = () => {
        window.clearTimeout(timeout);
        video.removeEventListener("seeked", onSeeked);
        video.removeEventListener("error", onError);
      };
      const onSeeked = () => { cleanup(); resolve(undefined); };
      const onError = () => { cleanup(); reject(new Error("영상 프레임 탐색 실패")); };
      video.addEventListener("seeked", onSeeked, { once: true });
      video.addEventListener("error", onError, { once: true });
      video.currentTime = targetTime;
    });
  }
  video.pause();
  return { readyState: video.readyState, currentTime: video.currentTime, videoWidth: video.videoWidth, videoHeight: video.videoHeight };
});
if (videoFrame.videoWidth <= 0 || videoFrame.videoHeight <= 0) throw new Error(`영상 실제 프레임이 없습니다: ${JSON.stringify(videoFrame)}`);
const videoFrameStats = await sharp(await videoElement.screenshot()).stats();
if (!videoFrameStats.channels.some((channel) => channel.stdev > 20)) throw new Error(`영상 플레이어가 식별 가능한 프레임 대신 단색입니다: ${JSON.stringify(videoFrameStats.channels)}`);
await editRoom.locator('[data-video-subtitle-cut-toggle]').first().click();
const skippedTime = await editRoom.locator('[data-video-el]').evaluate((video) => {
  video.currentTime = 0.1;
  video.dispatchEvent(new Event("timeupdate"));
  return video.currentTime;
});
if (skippedTime <= 0.1) throw new Error(`컷 재생이 구간을 건너뛰지 않았습니다: ${skippedTime}`);
let videoTimelineGeometry = null;
for (const viewport of [{ width: 1440, height: 900 }, { width: 1512, height: 982 }, { width: 390, height: 844 }]) {
  await page.setViewportSize(viewport);
  await assertNoHorizontalOverflow(`영상 편집실 ${viewport.width}`);
  if (viewport.width >= 1024) {
    const timeline = await editRoom.locator('[data-video-timeline]').evaluate((root, height) => {
      const rect = root.getBoundingClientRect();
      const scroll = root.querySelector('[data-video-timeline-scroll]');
      const track = root.querySelector('[data-video-timeline-track]');
      const lanes = [...root.querySelectorAll('[data-video-timeline-lane]')].map((lane) => {
        const value = lane.getBoundingClientRect();
        return { label: lane.getAttribute('data-video-timeline-lane'), y: value.y, bottom: value.bottom, height: value.height };
      });
      const ticks = [...root.querySelectorAll('[data-video-timeline-tick]')].map((tick) => {
        const value = tick.getBoundingClientRect();
        const style = getComputedStyle(tick);
        return { text: tick.textContent, width: value.width, height: value.height, clientHeight: tick.clientHeight, scrollHeight: tick.scrollHeight, whiteSpace: style.whiteSpace };
      });
      const blocks = [...root.querySelectorAll('[data-video-timeline-block]')].map((block) => {
        const value = block.getBoundingClientRect();
        const handles = [...block.querySelectorAll('button')].map((handle) => {
          const box = handle.getBoundingClientRect();
          return { left: box.left, right: box.right, width: box.width };
        });
        return { kind: block.getAttribute('data-video-timeline-block'), width: value.width, handles };
      });
      const laneContent = root.querySelector('[data-video-timeline-lane="영상"] [data-video-timeline-lane-content]');
      const bodyVideo = root.querySelector('[data-video-timeline-lane="영상"] [data-video-timeline-block="video"]');
      const laneBox = laneContent?.getBoundingClientRect();
      const videoBox = bodyVideo?.getBoundingClientRect();
      const availableWidth = scroll ? Math.max(1, scroll.clientWidth - 62) : 1;
      const trackUsedWidth = track ? Math.max(0, track.getBoundingClientRect().width - 62) : 0;
      return {
        y: rect.y,
        bottom: rect.bottom,
        viewportHeight: height,
        lanes,
        ticks,
        blocks,
        trackUsage: trackUsedWidth / availableWidth,
        videoLaneUsage: laneBox && videoBox ? videoBox.width / laneBox.width : 0,
        pxPerSec: Number(track?.getAttribute('data-video-timeline-px-per-sec') || 0),
      };
    }, viewport.height);
    if (timeline.lanes.length !== 5 || timeline.bottom > viewport.height + 1 || timeline.lanes.some((lane) => lane.y < 0 || lane.bottom > viewport.height + 1)) {
      throw new Error(`영상 5레인 타임라인이 첫 화면 안에 없습니다: ${JSON.stringify(timeline)}`);
    }
    // 회장 R7 반려와 OD-2026-10-09-2: v71처럼 짧은 영상도 레인 전체를 쓰며, 눈금은
    // 0:00 0:01 형태의 한 줄이고 블록·양끝 손잡이는 서로 겹치지 않아야 한다.
    if (timeline.trackUsage < 0.8 || timeline.videoLaneUsage < 0.8) {
      throw new Error(`영상 타임라인이 가용 폭의 80%를 쓰지 않습니다: ${JSON.stringify(timeline)}`);
    }
    if (timeline.ticks.length < 5 || timeline.ticks.some((tick) => tick.whiteSpace !== 'nowrap' || tick.scrollHeight > tick.clientHeight + 1 || tick.height > 16)) {
      throw new Error(`영상 눈금 라벨이 한 줄이 아닙니다: ${JSON.stringify(timeline.ticks)}`);
    }
    if (timeline.blocks.some((block) => block.width < 24 || (block.handles.length === 2 && block.handles[0].right > block.handles[1].left + 1))) {
      throw new Error(`영상 블록 최소폭 또는 손잡이 비겹침 계약을 어겼습니다: ${JSON.stringify(timeline.blocks)}`);
    }
    if (viewport.width === 1440) videoTimelineGeometry = timeline;
  }
  await page.screenshot({ path: path.join(outputDir, `edit-video-${viewport.width}x${viewport.height}.png`) });
}

await page.setViewportSize({ width: 1440, height: 900 });
await page.evaluate(() => window.scrollTo(0, 0));
await editRoom.getByRole("button", { name: "카드뉴스" }).click();
await editRoom.locator("[data-card-canvas-editor]").waitFor();
const openExportButton = editRoom.getByRole("button", { name: "내보내기", exact: true }).last();
await openExportButton.evaluate((element) => element.scrollIntoView({ block: "center", inline: "nearest" }));
try {
  await openExportButton.click({ trial: true, timeout: 20_000 });
} catch (error) {
  const exportBlock = await openExportButton.locator("xpath=../..").innerText().catch(() => "내보내기 영역을 읽지 못했습니다");
  const alerts = await editRoom.getByRole("alert").allTextContents();
  const workbenchDisabled = await editRoom.locator('[data-card-deck-v3-workbench]').getAttribute('aria-disabled');
  throw new Error(`카드 편집 뒤 내보내기가 20초 안에 활성화되지 않았습니다: ${JSON.stringify({ exportBlock, alerts, workbenchDisabled, room: (await editRoom.innerText()).slice(-4_000), cause: error instanceof Error ? error.message : String(error) })}`);
}
await openExportButton.click();
const exportPanel = page.locator("[data-export-panel]");
await exportPanel.waitFor();
await exportPanel.locator("[data-export-start]").click();
await exportPanel.locator("[data-export-open-publish]").waitFor({ timeout: 20_000 });
await exportPanel.locator("[data-export-open-publish]").click();
const publishRoom = page.locator('[data-room="publish"]');
const selectedPublishImage = publishRoom.getByTestId("publish-selected-image");
const selectedPublishVideo = publishRoom.getByTestId("publish-selected-video");
await selectedPublishImage.waitFor();
await selectedPublishVideo.waitFor();
await page.getByTestId("publish-export-pin-notice").waitFor();
const visibleToasts = page.locator('#toast-container > div');
const publishToastCount = await visibleToasts.count();
if (publishToastCount > 1) throw new Error(`내보내기 뒤 토스트가 중복 표시됩니다: ${await visibleToasts.allTextContents()}`);
if ((await page.getByText(/내보내기 판/).count()) > 0) throw new Error("사용자 안내에 '내보내기 판' 조어가 남아 있습니다");
const selectedMediaBoxes = await Promise.all([selectedPublishImage.boundingBox(), selectedPublishVideo.boundingBox()]);
if (selectedMediaBoxes.some((box) => !box || box.y < 0 || box.y + box.height > 900)) throw new Error(`발행실 선택 미디어가 1440 첫 화면 밖입니다: ${JSON.stringify(selectedMediaBoxes)}`);
if (await selectedPublishImage.evaluate((image) => image.naturalWidth) <= 0) throw new Error("발행실 첫 화면 이미지가 실제 픽셀을 불러오지 못했습니다");
const selectedPublishImageSrc = await selectedPublishImage.getAttribute("src");
if (!selectedPublishImageSrc?.includes("export=chairman-v3")) throw new Error("발행실이 편집실 내보내기 고정 이미지를 사용하지 않습니다");
for (const viewport of [{ width: 1440, height: 900 }, { width: 1512, height: 982 }, { width: 390, height: 844 }]) {
  await page.setViewportSize(viewport);
  await page.evaluate(() => window.scrollTo(0, 0));
  await assertNoHorizontalOverflow(`발행실 ${viewport.width}`);
  await page.screenshot({ path: path.join(outputDir, `publish-${viewport.width}x${viewport.height}.png`) });
}

await page.setViewportSize({ width: 1440, height: 900 });
await publishRoom.locator('[data-publish-preview-stack]').first().scrollIntoViewIfNeeded();
await publishRoom.locator('[data-publish-preview-stack]').first().waitFor();
const previewCards = publishRoom.locator('[data-room-preview]');
const boxes = await previewCards.evaluateAll((nodes) => nodes.slice(0, 3).map((node) => {
  const rect = node.getBoundingClientRect();
  return { x: rect.x, y: rect.y, width: rect.width };
}));
if (boxes.length < 3 || !(boxes[0].y < boxes[1].y && boxes[1].y < boxes[2].y) || boxes.some((box) => Math.abs(box.x - boxes[0].x) > 2)) {
  throw new Error(`발행 플랫폼 카드가 세로로 쌓이지 않았습니다: ${JSON.stringify(boxes)}`);
}
if (await publishRoom.locator('img[src*="chairman-photo"], video[src*="chairman-photo-motion"]').count() < 3) throw new Error("발행 미리보기에 실제 이미지·영상이 표시되지 않았습니다");
await page.screenshot({ path: path.join(outputDir, "publish-platforms-1440x900.png") });

// R7-C: 생성실로 되돌아가지 않고 편집실 템플릿 선택만으로 카톡 덱을 만들고 말풍선을 고친다.
await page.goto(`${baseUrl}/studio?room=edit&kind=card`, { waitUntil: "domcontentloaded" });
await page.getByRole("button", { name: /작업물 전체/ }).click();
await page.locator('[data-work-item="chairman-draft"]').click();
const reopenedEditRoom = page.locator('[data-room="edit"]');
await reopenedEditRoom.getByRole("button", { name: "카드뉴스" }).click();
await reopenedEditRoom.locator('[data-card-canvas-editor]').waitFor();
const chatTemplate = reopenedEditRoom.locator('[data-card-template="chat_bubble"]');
await chatTemplate.scrollIntoViewIfNeeded();
await chatTemplate.click();
await reopenedEditRoom.getByRole("button", { name: "이 템플릿으로 바꾸기" }).click();
await reopenedEditRoom.locator('[data-card-deck-v3-return-note]').waitFor({ timeout: 15_000 });
await reopenedEditRoom.getByRole("button", { name: "2장", exact: true }).click();
try {
  await reopenedEditRoom.locator('[data-chat-base="conversation"]').first().waitFor({ timeout: 15_000 });
} catch (error) {
  fs.writeFileSync(path.join(outputDir, "failed-chat-conversion.json"), JSON.stringify({
    currentDraft,
    recentSaves: draftSaves.slice(-5),
    roomText: (await reopenedEditRoom.innerText().catch(() => "편집실 없음")).slice(-5_000),
    cause: error instanceof Error ? error.message : String(error),
  }, null, 2));
  await page.screenshot({ path: path.join(outputDir, "failed-chat-conversion.png") });
  throw error;
}
const firstBubbleInput = reopenedEditRoom.getByLabel(/번째 말풍선 내용/).first();
await firstBubbleInput.fill("편집실에서 바로 고친 카톡 말풍선");
await firstBubbleInput.blur();
await page.waitForTimeout(900);
if (!draftSaves.some((save) => save.cardDeck?.template === "chat_bubble" && save.cardDeckV3?.template === "chat_bubble")) {
  throw new Error("편집실 카톡 템플릿 전환이 v2·v3 동기화 저장으로 이어지지 않았습니다");
}
const chatStage = reopenedEditRoom.locator('[data-card-deck-stage]');
const chatCanvasGeometry = await chatStage.evaluate((stage, expectedText) => {
  const stageBox = stage.getBoundingClientRect();
  const bubbles = [...stage.querySelectorAll('[data-bubble-content-editable]')].map((bubble) => {
    const box = bubble.getBoundingClientRect();
    return { text: bubble.textContent, x: box.x, y: box.y, right: box.right, bottom: box.bottom };
  });
  return {
    expectedText,
    stage: { x: stageBox.x, y: stageBox.y, right: stageBox.right, bottom: stageBox.bottom },
    bubbles,
  };
}, "편집실에서 바로 고친 카톡 말풍선");
if (!chatCanvasGeometry.bubbles.some((bubble) => bubble.text?.includes(chatCanvasGeometry.expectedText))) {
  throw new Error(`카톡 캔버스에 편집한 말풍선이 렌더되지 않았습니다: ${JSON.stringify(chatCanvasGeometry)}`);
}
if (chatCanvasGeometry.bubbles.some((bubble) => bubble.x < chatCanvasGeometry.stage.x - 1 || bubble.right > chatCanvasGeometry.stage.right + 1 || bubble.y < chatCanvasGeometry.stage.y - 1 || bubble.bottom > chatCanvasGeometry.stage.bottom + 1)) {
  throw new Error(`카톡 말풍선이 캔버스 경계를 벗어났습니다: ${JSON.stringify(chatCanvasGeometry)}`);
}
await chatStage.evaluate((stage) => stage.scrollIntoView({ block: "center", inline: "nearest" }));
await page.waitForTimeout(100);
await page.screenshot({ path: path.join(outputDir, "edit-card-chat-1440x900.png") });

if (consoleErrors.length) throw new Error(`브라우저 콘솔 오류: ${JSON.stringify(consoleErrors.slice(0, 10))}`);
fs.writeFileSync(path.join(outputDir, "result.json"), JSON.stringify({
  ok: true,
  draftSaveCount: draftSaves.length,
  cardDrag: { before: beforeBox, after: afterBox, pixelMean: pixelDiff.channels.map((channel) => channel.mean) },
  cardResizeContainment,
  cardLayout,
  videoTabGeometry,
  videoCutSkippedTo: skippedTime,
  videoFrame,
  videoTimelineGeometry,
  expiredVideoResigned: apiRequests.filter((entry) => entry === "POST /api/media/resign").length,
  selectedPublishMedia: selectedMediaBoxes,
  exportFlow: { exportStarted, exportJobReads, selectedImageSrc: selectedPublishImageSrc },
  publishBoxes: boxes,
  toastCounts: { edit: editToastCount, publish: publishToastCount },
  chatCanvasGeometry,
  consoleErrors: 0,
}, null, 2));

await browser.close();
console.log(JSON.stringify({ ok: true, outputDir, draftSaveCount: draftSaves.length, videoCutSkippedTo: skippedTime }, null, 2));
