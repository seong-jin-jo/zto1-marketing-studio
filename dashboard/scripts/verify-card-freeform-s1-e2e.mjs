#!/usr/bin/env node
import fs from "node:fs";
import path from "node:path";
import { chromium } from "playwright-core";
import { createJiti } from "jiti";

const jiti = createJiti(import.meta.url);
const { validateCardDeckV3 } = await jiti.import("../src/lib/studio/card-element-contract.ts");

const baseUrl = process.env.CARD_FREEFORM_BASE_URL || "http://127.0.0.1:3472";
const outputDir = process.env.CARD_FREEFORM_OUTPUT_DIR || path.resolve(process.cwd(), "../docs/qa/editroom-v2-s1");
const workspaceId = "11111111-1111-4111-8111-111111111111";
const draftId = "22222222-2222-4222-8222-222222222222";
const uploadedImageUrl = "data:image/svg+xml;base64,PHN2ZyB4bWxucz0naHR0cDovL3d3dy53My5vcmcvMjAwMC9zdmcnIHdpZHRoPSc0MCcgaGVpZ2h0PSc0MCc+PHJlY3Qgd2lkdGg9JzQwJyBoZWlnaHQ9JzQwJyBmaWxsPScjMjU2M0VCJy8+PC9zdmc+";
let bodyRevision = 0;
let posts = [];
let serverDeck = null;
let expectedConflictCount = 0;

fs.mkdirSync(outputDir, { recursive: true });

function draft(includeCardDeckV3 = false) {
  return {
    id: draftId,
    idea: "S1 자유 배치 실구동",
    editKind: "card",
    editLines: ["자유 배치 첫 장", "두 번째 카드", "저장하세요"],
    bodyRevision,
    ...(includeCardDeckV3 ? { cardDeckV3: serverDeck } : {}),
    status: "draft",
    savedAt: "2026-10-04T00:00:00.000Z",
  };
}

function work() {
  return { idea: "S1 자유 배치 실구동", draftId, editKind: "card", editLines: ["자유 배치 첫 장", "두 번째 카드", "저장하세요"], bodyRevision, includes: {}, publishReconciliations: {}, publishProgress: { running: false, stopped: false, status: {}, urls: {}, errors: {}, already: {} } };
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
  const box = await locator.boundingBox();
  if (!box) throw new Error("조작 대상의 화면 좌표가 없습니다");
  const x = box.x + box.width / 2;
  const y = box.y + box.height / 2;
  await page.mouse.move(x, y);
  await page.mouse.down();
  await page.mouse.move(x + dx, y + dy, { steps: 8 });
  await page.mouse.up();
}

const browser = await chromium.launch({ headless: true });
const context = await browser.newContext({ viewport: { width: 1440, height: 1000 } });
await context.addInitScript(({ id, state }) => {
  localStorage.setItem("dashboard_auth_token", "card-freeform-s1-token");
  localStorage.setItem("active_workspace", JSON.stringify({ id, slug: "s1", name: "S1 실구동", tier: "team" }));
  if (!localStorage.getItem("card_freeform_s1_skip_seed")) {
    localStorage.setItem(`studio_work:${id}`, JSON.stringify(state));
  }
}, { id: workspaceId, state: work() });

await context.route("**/api/**", async (route) => {
  const request = route.request();
  const pathname = new URL(request.url()).pathname;
  if (pathname === "/api/me") return json(route, { isOperator: false, tenant: { id: workspaceId, slug: "s1", name: "S1 실구동", status: "active" } });
  if (pathname === "/api/studio/drafts") {
    if (request.method() !== "POST") {
      if (new URL(request.url()).searchParams.has("id")) return json(route, { draft: draft(true) });
      return json(route, { drafts: [draft()], currentWork: null });
    }
    const body = JSON.parse(request.postData() || "{}");
    posts.push(body);
    if (body.bodyBaseRevision !== bodyRevision) {
      expectedConflictCount += 1;
      return json(route, { ok: false, code: "BODY_STALE_REVISION", latestBody: { text: null, editLines: draft().editLines, cardDeckV3: serverDeck, bodyRevision } }, 409);
    }
    if (body.cardDeckV3) {
      validateCardDeckV3(body.cardDeckV3);
      serverDeck = structuredClone(body.cardDeckV3);
    }
    bodyRevision += 1;
    return json(route, { ok: true, id: draftId, bodyRevision, videoEditServerRevision: null });
  }
  if (pathname === "/api/images/upload") return json(route, { filename: "s1-photo.png", url: uploadedImageUrl });
  if (pathname === "/api/media/resign") return json(route, { ok: true, file: uploadedImageUrl });
  if (pathname === "/api/studio/brand-setup") return json(route, { guide: null });
  if (pathname === "/api/publish/first-comment-capabilities") return json(route, { capabilities: [] });
  if (/^\/api\/channels\/[^/]+\/accounts$/.test(pathname)) return json(route, { accounts: [] });
  if (pathname === "/api/images") return json(route, { images: [] });
  return json(route, {});
});

const page = await context.newPage();
const errors = [];
page.on("pageerror", (error) => errors.push(error.message));
page.on("console", (message) => { if (message.type() === "error") errors.push(message.text()); });

try {
  await page.goto(`${baseUrl}/studio?room=edit&draft_id=${draftId}`, { waitUntil: "networkidle", timeout: 60_000 });
  await page.getByRole("button", { name: "자유 배치로 편집" }).click();
  await page.locator("[data-card-canvas-editor]").waitFor({ state: "visible" });
  if (await page.locator("[data-element-list-item]").count() < 1) throw new Error("데이터가 있는 카드가 열리지 않았습니다");
  const editor = page.getByRole("region", { name: "카드 자유 배치 편집기" });

  const selection = page.locator("[data-element-selection]").first();
  const primaryElementId = await selection.getAttribute("data-element-selection");
  if (!primaryElementId) throw new Error("첫 글 요소 ID를 찾지 못했습니다");
  const primaryListItem = editor.locator(`[data-element-list-item="${primaryElementId}"]`);
  await primaryListItem.getByRole("button", { name: "글", exact: true }).click();
  await page.getByLabel("글자 크기").fill("72");
  await page.getByLabel("요소 너비").fill("900");
  await page.getByLabel("요소 높이").fill("540");
  await primaryListItem.getByRole("button", { name: "글", exact: true }).click();
  await drag(page, selection, 48, 32);
  await primaryListItem.getByRole("button", { name: "글", exact: true }).click();
  const rotateHandle = selection.getByRole("button", { name: "회전" });
  const rotateBox = await rotateHandle.boundingBox();
  const selectionBox = await selection.boundingBox();
  if (!rotateBox || !selectionBox) throw new Error("회전 손잡이 좌표가 없습니다");
  const center = { x: selectionBox.x + selectionBox.width / 2, y: selectionBox.y + selectionBox.height / 2 };
  const start = { x: rotateBox.x + rotateBox.width / 2, y: rotateBox.y + rotateBox.height / 2 };
  const radius = Math.hypot(start.x - center.x, start.y - center.y);
  const startAngle = Math.atan2(start.y - center.y, start.x - center.x);
  await page.keyboard.down("Shift");
  await page.mouse.move(start.x, start.y);
  await page.mouse.down();
  await page.mouse.move(center.x + Math.cos(startAngle + 17 * Math.PI / 180) * radius, center.y + Math.sin(startAngle + 17 * Math.PI / 180) * radius, { steps: 10 });
  await page.mouse.up();
  await page.keyboard.up("Shift");

  for (const name of ["글 추가", "도형 추가", "스티커 추가", "로고 추가"]) await page.getByRole("button", { name }).click();
  await page.locator('input[type="file"][aria-label="사진 파일"]').setInputFiles({ name: "photo.png", mimeType: "image/png", buffer: Buffer.from("s1-photo") });

  await waitUntil(() => posts.some((post) => post.cardDeckV3?.slides?.[0]?.elements?.length >= 6), 15_000, "5종 요소를 담은 자동저장 요청이 없습니다");
  const savedElement = serverDeck.slides[0].elements.find((element) => element.id === primaryElementId);
  if (!savedElement || savedElement.x === 120 || savedElement.width !== 900 || savedElement.height !== 540 || savedElement.rotation === 0 || savedElement.style.font_size !== 72) {
    throw new Error(`끌기·크기·회전·글자 크기 저장값이 다릅니다: ${JSON.stringify(savedElement)}`);
  }
  const types = new Set(serverDeck.slides[0].elements.map((element) => element.type));
  for (const type of ["text", "image", "shape", "sticker", "logo"]) if (!types.has(type)) throw new Error(`${type} 요소가 저장되지 않았습니다`);
  await page.screenshot({ path: path.join(outputDir, "s1-freeform-1440.png"), fullPage: true });

  await page.evaluate((id) => {
    localStorage.setItem("card_freeform_s1_skip_seed", "1");
    localStorage.removeItem(`studio_work:${id}`);
  }, workspaceId);
  await page.reload({ waitUntil: "networkidle", timeout: 60_000 });
  await page.locator("[data-card-canvas-editor]").waitFor({ state: "visible" });
  await page.waitForFunction(() => document.querySelectorAll("[data-element-list-item]").length >= 6);
  await page.getByAltText("photo.png").waitFor({ state: "visible" });
  if (await page.getByAltText("photo.png").getAttribute("src") !== uploadedImageUrl) throw new Error("새로고침 뒤 업로드 사진 URL이 복원되지 않았습니다");
  const restoredRotation = await page.locator(`[data-element-selection="${primaryElementId}"]`).evaluate((node) => getComputedStyle(node).getPropertyValue("--selection-rotation").trim());
  if (restoredRotation !== `${savedElement.rotation}deg`) throw new Error(`새로고침 뒤 회전값이 다릅니다: ${restoredRotation}`);

  bodyRevision += 1;
  await primaryListItem.getByRole("button", { name: "글", exact: true }).click();
  await page.getByLabel("요소 너비").fill("777");
  await page.getByRole("button", { name: "최신본 불러오기" }).waitFor({ state: "visible", timeout: 15_000 });
  await page.getByRole("button", { name: "최신본 불러오기" }).click();
  await page.getByRole("button", { name: "내 변경 다시 적용" }).click();
  await page.getByRole("button", { name: "내 변경 다시 적용" }).waitFor({ state: "detached", timeout: 15_000 });
  await waitUntil(() => serverDeck?.slides?.[0]?.elements?.find((element) => element.id === primaryElementId)?.width === 777, 15_000, "409 재적용 뒤 저장 JSON에 최신 너비가 없습니다");
  await primaryListItem.getByRole("button", { name: "글", exact: true }).click();
  if (await page.getByLabel("요소 너비").inputValue() !== "777") throw new Error("409 재적용 뒤 화면과 저장 JSON의 너비가 다릅니다");
  const lastSavedDeck = [...posts].reverse().find((post) => post.cardDeckV3)?.cardDeckV3;
  if (JSON.stringify(lastSavedDeck) !== JSON.stringify(serverDeck)) throw new Error("409 재적용 뒤 요청 JSON과 저장 JSON이 다릅니다");

  await page.setViewportSize({ width: 390, height: 844 });
  await primaryListItem.getByRole("button", { name: "글 오른쪽 이동" }).click();
  await primaryListItem.getByRole("button", { name: "글 잠금" }).click();
  await waitUntil(() => serverDeck.slides[0].elements.find((element) => element.id === primaryElementId)?.locked === true, 10_000, "390px 대체 조작이 저장되지 않았습니다");
  const overflow = await page.evaluate(() => ({ viewport: document.documentElement.clientWidth, scroll: document.documentElement.scrollWidth }));
  if (overflow.scroll > overflow.viewport + 1) throw new Error(`390px 가로 넘침: ${JSON.stringify(overflow)}`);
  await page.screenshot({ path: path.join(outputDir, "s1-freeform-390.png"), fullPage: true });
  const unexpectedErrors = [...errors];
  for (let index = 0; index < expectedConflictCount; index += 1) {
    const expectedIndex = unexpectedErrors.findIndex((message) => message.includes("status of 409"));
    if (expectedIndex >= 0) unexpectedErrors.splice(expectedIndex, 1);
  }
  if (unexpectedErrors.length) throw new Error(`브라우저 오류 ${unexpectedErrors.length}건: ${unexpectedErrors.join(" | ")}`);

  const measurementFixture = await page.evaluate(() => {
    const clone = document.documentElement.cloneNode(true);
    clone.querySelectorAll("script, link[rel='stylesheet'], meta[http-equiv]").forEach((node) => node.remove());
    const css = [...document.styleSheets].flatMap((sheet) => {
      try { return [...sheet.cssRules].map((rule) => rule.cssText); } catch { return []; }
    }).join("\n");
    const style = document.createElement("style");
    style.textContent = css;
    clone.querySelector("head")?.append(style);
    clone.querySelector("body")?.setAttribute("data-measurement-source", "card-freeform-s1-data-loaded");
    return `<!doctype html>${clone.outerHTML}`;
  });
  fs.writeFileSync(path.join(outputDir, "s1-freeform-measure-fixture.html"), measurementFixture);

  fs.writeFileSync(path.join(outputDir, "s1-freeform-result.json"), JSON.stringify({
    result: "PASS", posts: posts.length, bodyRevision, elementTypes: [...types].sort(), savedElement, restoredRotation, restoredImage: true, conflictReapplied: true, expectedConflicts: expectedConflictCount, mobile: overflow, consoleErrors: unexpectedErrors.length,
  }, null, 2));
  console.log(JSON.stringify({ result: "PASS", posts: posts.length, bodyRevision, elementTypes: [...types].sort(), savedElement, restoredRotation, restoredImage: true, conflictReapplied: true, expectedConflicts: expectedConflictCount, mobile: overflow, consoleErrors: unexpectedErrors.length }, null, 2));
} finally {
  await browser.close();
}
