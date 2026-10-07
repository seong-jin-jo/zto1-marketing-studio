#!/usr/bin/env node

import fs from "node:fs";
import path from "node:path";
import { chromium } from "playwright-core";
import { createJiti } from "jiti";

const jiti = createJiti(import.meta.url, { alias: { "@": path.resolve("src") } });
const { createPlainCardDeckV3 } = await jiti.import("../src/lib/studio/card-element-commands.ts");

const baseUrl = process.env.EDITROOM_S4_BASE_URL || "http://localhost:3474";
const outputDir = process.env.EDITROOM_S4_OUTPUT_DIR || path.resolve(process.cwd(), "../docs/qa/editroom-v2-s4");
const workspaceId = "41111111-1111-4111-8111-111111111111";
const draftId = "42222222-2222-4222-8222-222222222222";
const exportId = "43333333-3333-4333-8333-333333333333";
const sourceHash = "a".repeat(64);
const staleHash = "b".repeat(64);
const lines = Array.from({ length: 9 }, (_, index) => `${index + 1}장 실제 내보내기 검증 내용`);
const deck = createPlainCardDeckV3(lines, "deck_s4_browser");
const emptySlide = { order: 5, number: 6, item_key: deck.slides[5].id };
const viewports = [
  { width: 1440, height: 1000 },
  { width: 1024, height: 900 },
  { width: 390, height: 844 },
];

let scenario = "progress";
let retryRequests = [];
let draftSaves = [];
let statusReads = 0;
let imageUploads = 0;

fs.mkdirSync(outputDir, { recursive: true });

function json(route, body, status = 200) {
  return route.fulfill({ status, contentType: "application/json", body: JSON.stringify(body) });
}

function work() {
  return {
    idea: "S4 내보내기 브라우저 검증",
    draftId,
    editKind: "card",
    editLines: lines,
    cardDeckV3: deck,
    bodyRevision: 8,
    includes: {},
    publishReconciliations: {},
    publishProgress: { running: false, stopped: false, status: {}, urls: {}, errors: {}, already: {} },
  };
}

function draft() {
  return { id: draftId, ...work(), hasCardDeckV3: true, status: "draft", savedAt: "2026-10-07T00:00:00.000Z" };
}

function item(index, status) {
  return {
    item_key: deck.slides[index].id,
    ordinal: index,
    status,
    attempt_count: status === "succeeded" ? 1 : status === "failed" ? 1 : 0,
    ...(status === "succeeded" ? { artifact_url: `/qa/alignment-card-${index % 3 + 1}.jpg` } : {}),
    ...(status === "failed" ? { error_code: "RENDER_FAILED" } : {}),
  };
}

function job(status = scenario) {
  if (status === "progress") {
    return {
      export_id: exportId, status: "processing", source_revision: 8, source_hash: sourceHash,
      progress: { completed: 3, total: 9 },
      items: Array.from({ length: 9 }, (_, index) => item(index, index < 3 ? "succeeded" : index === 3 ? "processing" : "queued")),
      updated_at: "2026-10-07T00:00:03.000Z", finished_at: null,
    };
  }
  if (status === "partial") {
    return {
      export_id: exportId, status: "partially_failed", source_revision: 8, source_hash: sourceHash,
      progress: { completed: 9, total: 9 },
      items: Array.from({ length: 9 }, (_, index) => item(index, index === 3 ? "failed" : "succeeded")),
      updated_at: "2026-10-07T00:00:09.000Z", finished_at: "2026-10-07T00:00:09.000Z",
    };
  }
  if (status === "retrying") {
    return {
      export_id: exportId, status: "processing", source_revision: 8, source_hash: sourceHash,
      progress: { completed: 8, total: 9 },
      items: Array.from({ length: 9 }, (_, index) => item(index, index === 3 ? "processing" : "succeeded")),
      updated_at: "2026-10-07T00:00:10.000Z", finished_at: null,
    };
  }
  return {
    export_id: exportId, status: "succeeded", source_revision: 8, source_hash: sourceHash,
    progress: { completed: 9, total: 9 },
    items: Array.from({ length: 9 }, (_, index) => item(index, "succeeded")),
    updated_at: "2026-10-07T00:00:12.000Z", finished_at: "2026-10-07T00:00:12.000Z",
  };
}

function latest() {
  if (scenario === "empty") {
    return { current_source_revision: 8, current_source_hash: sourceHash, latest_export: null, is_latest: false, blocker: "EMPTY_SLIDE", first_empty_slide: emptySlide };
  }
  if (scenario === "stale") {
    return {
      current_source_revision: 9, current_source_hash: staleHash,
      latest_export: { export_id: exportId, status: "succeeded", source_revision: 8, source_hash: sourceHash, finished_at: "2026-10-07T00:00:12.000Z" },
      is_latest: false, blocker: "EXPORT_SOURCE_STALE",
    };
  }
  const exportStatus = scenario === "progress" || scenario === "retrying" ? "processing" : scenario === "partial" ? "partially_failed" : "succeeded";
  return {
    current_source_revision: 8,
    current_source_hash: sourceHash,
    latest_export: { export_id: exportId, status: exportStatus, source_revision: 8, source_hash: sourceHash, finished_at: exportStatus === "succeeded" ? "2026-10-07T00:00:12.000Z" : null },
    is_latest: scenario === "success",
    blocker: scenario === "progress" || scenario === "retrying" ? "EXPORT_IN_PROGRESS" : scenario === "partial" ? "EXPORT_FAILED" : null,
  };
}

function assertNoOverflow(page, label) {
  return page.evaluate((name) => {
    const panel = document.querySelector("[data-export-panel]");
    if (!(panel instanceof HTMLElement)) throw new Error(`${name}: 내보내기 패널이 없습니다`);
    const measured = {
      viewport: document.documentElement.clientWidth,
      documentScroll: document.documentElement.scrollWidth,
      panelClient: panel.clientWidth,
      panelScroll: panel.scrollWidth,
    };
    if (measured.documentScroll > measured.viewport + 1 || measured.panelScroll > measured.panelClient + 1) {
      throw new Error(`${name}: 가로 넘침 ${JSON.stringify(measured)}`);
    }
    return measured;
  }, label);
}

const browser = await chromium.launch({ headless: true });
const context = await browser.newContext({ viewport: viewports[0] });
await context.addInitScript(({ id, state }) => {
  localStorage.setItem("dashboard_auth_token", "editroom-s4-browser-token");
  localStorage.setItem("active_workspace", JSON.stringify({ id, slug: "editroom-s4", name: "S4 브라우저 검증", tier: "team" }));
  localStorage.setItem(`studio_work:${id}`, JSON.stringify(state));
}, { id: workspaceId, state: work() });

await context.route("**/api/**", async (route) => {
  const request = route.request();
  const url = new URL(request.url());
  const pathname = url.pathname;
  if (pathname === "/api/me") return json(route, { isOperator: false, tenant: { id: workspaceId, slug: "editroom-s4", name: "S4 브라우저 검증", status: "active" } });
  if (pathname === "/api/studio/drafts") {
    if (request.method() === "POST") {
      draftSaves.push(request.postDataJSON());
      return json(route, { ok: true, id: draftId, bodyRevision: 8 });
    }
    return json(route, url.searchParams.has("id") ? { draft: draft() } : { drafts: [draft()], currentWork: null });
  }
  if (pathname.endsWith(`/drafts/${draftId}/exports/latest`)) return json(route, latest());
  if (pathname.endsWith(`/drafts/${draftId}/exports/${exportId}/retry`)) {
    const body = request.postDataJSON();
    retryRequests.push(body);
    scenario = "retrying";
    statusReads = 0;
    return json(route, { export_id: exportId, status: "queued", requeued_item_keys: body.item_keys }, 202);
  }
  if (pathname.endsWith(`/drafts/${draftId}/exports/${exportId}`)) {
    statusReads += 1;
    if (scenario === "retrying" && statusReads >= 2) scenario = "success";
    return json(route, job());
  }
  if (pathname.endsWith(`/drafts/${draftId}/exports`) && request.method() === "POST") {
    scenario = "progress";
    statusReads = 0;
    return json(route, { export_id: exportId, draft_id: draftId, kind: "card_deck", status: "queued", source_revision: 8, source_hash: sourceHash, total_items: 9, status_url: `/api/studio/drafts/${draftId}/exports/${exportId}` }, 202);
  }
  if (pathname === "/api/images/upload") {
    imageUploads += 1;
    return json(route, { url: `/qa/alignment-card-${imageUploads % 3 + 1}.jpg` });
  }
  if (pathname === "/api/studio/brand-setup") return json(route, { guide: null });
  if (pathname === "/api/publish/first-comment-capabilities") return json(route, { capabilities: [] });
  if (/^\/api\/channels\/[^/]+\/accounts$/.test(pathname)) return json(route, { accounts: [] });
  if (pathname === "/api/images") return json(route, { images: [] });
  if (pathname === "/api/elevenlabs-voices") return json(route, { voices: [] });
  return json(route, {});
});

const page = await context.newPage();
page.setDefaultTimeout(60_000);
const browserErrors = [];
const failedRequests = [];
const intentionalAborts = [];
page.on("pageerror", (error) => browserErrors.push(error.message));
page.on("console", (message) => { if (message.type() === "error") browserErrors.push(message.text()); });
page.on("requestfailed", (request) => {
  const failure = `${request.method()} ${request.url()} ${request.failure()?.errorText ?? "failed"}`;
  if (request.failure()?.errorText === "net::ERR_ABORTED" && request.url().includes(`/drafts/${draftId}/exports/`)) {
    intentionalAborts.push(failure);
    return;
  }
  failedRequests.push(failure);
});

async function openPanel() {
  const room = page.locator('[data-room="edit"][data-edit-kind="card"]');
  try {
    await room.waitFor({ state: "visible" });
  } catch (error) {
    const diagnostic = {
      url: page.url(),
      body: (await page.locator("body").innerText()).slice(0, 4_000),
      rooms: await page.locator("[data-room]").evaluateAll((nodes) => nodes.map((node) => ({ room: node.getAttribute("data-room"), kind: node.getAttribute("data-edit-kind") }))),
      browserErrors,
      failedRequests,
    };
    await page.screenshot({ path: path.join(outputDir, "s4-open-panel-failure.png"), fullPage: true });
    console.error("S4_OPEN_PANEL_DIAGNOSTIC", JSON.stringify(diagnostic, null, 2));
    throw error;
  }
  const button = room.getByRole("button", { name: "내보내기", exact: true });
  await button.waitFor({ state: "visible" });
  await button.click();
  try {
    await page.locator("[data-export-panel]").waitFor({ state: "visible" });
  } catch (error) {
    const diagnostic = {
      url: page.url(),
      room: (await room.innerText()).slice(0, 4_000),
      body: (await page.locator("body").innerText()).slice(0, 5_000),
      draftSaves,
      browserErrors,
      failedRequests,
    };
    await page.screenshot({ path: path.join(outputDir, "s4-panel-after-click-failure.png"), fullPage: true });
    console.error("S4_PANEL_AFTER_CLICK_DIAGNOSTIC", JSON.stringify(diagnostic, null, 2));
    throw error;
  }
}

async function reset(nextScenario, viewport) {
  scenario = nextScenario;
  statusReads = 0;
  await page.setViewportSize(viewport);
  await page.goto(`${baseUrl}/studio?room=edit&kind=card&draft_id=${draftId}`, { waitUntil: "networkidle", timeout: 60_000 });
  await openPanel();
}

try {
  const responsive = [];
  for (const viewport of viewports) {
    await reset("progress", viewport);
    await page.getByText("3 / 9장", { exact: true }).waitFor();
    if (await page.locator('[data-export-item-status="succeeded"]').count() !== 3) throw new Error(`${viewport.width}px 진행 완료 장 수가 3이 아닙니다`);
    const overflow = await assertNoOverflow(page, `진행 ${viewport.width}`);
    const screenshot = path.join(outputDir, `s4-progress-${viewport.width}.png`);
    await page.screenshot({ path: screenshot, fullPage: true });
    responsive.push({ viewport: viewport.width, overflow, screenshot });
  }

  await reset("progress", viewports[0]);
  await page.getByText("3 / 9장", { exact: true }).waitFor();
  await page.reload({ waitUntil: "networkidle", timeout: 60_000 });
  await openPanel();
  await page.getByText("3 / 9장", { exact: true }).waitFor();

  scenario = "partial";
  await page.getByRole("button", { name: "내보내기 닫기" }).click();
  await openPanel();
  await page.getByRole("button", { name: "4장 다시 시도", exact: true }).waitFor();
  await page.screenshot({ path: path.join(outputDir, "s4-partial-failure.png"), fullPage: true });
  await page.getByRole("button", { name: "4장 다시 시도", exact: true }).click();
  await page.getByRole("button", { name: "발행실로", exact: true }).waitFor({ timeout: 15_000 });
  if (JSON.stringify(retryRequests) !== JSON.stringify([{ item_keys: [deck.slides[3].id], tenant_id: workspaceId }])) {
    throw new Error(`실패 장 단독 retry 요청이 다릅니다: ${JSON.stringify(retryRequests)}`);
  }
  await page.screenshot({ path: path.join(outputDir, "s4-retry-success.png"), fullPage: true });

  await reset("stale", viewports[1]);
  await page.locator('[data-export-blocker="EXPORT_SOURCE_STALE"]').waitFor();
  await page.getByRole("button", { name: "최신 내용 다시 내보내기", exact: true }).waitFor();
  await page.screenshot({ path: path.join(outputDir, "s4-stale.png"), fullPage: true });

  await reset("empty", viewports[2]);
  await page.locator("[data-export-empty-slide]").waitFor();
  await page.getByRole("button", { name: "6장 열기", exact: true }).click();
  await page.locator("[data-export-panel]").waitFor({ state: "detached" });
  const emptySlideButton = page.locator(`[data-card-slide="${deck.slides[5].id}"]`);
  if (await emptySlideButton.getAttribute("aria-pressed") !== "true") throw new Error("빈 6번째 장이 선택되지 않았습니다");
  if (await page.locator("[data-card-stage]").evaluate((node) => document.activeElement === node) !== true) throw new Error("빈 장 카드 스테이지에 초점이 이동하지 않았습니다");
  await page.screenshot({ path: path.join(outputDir, "s4-empty-slide-focus.png"), fullPage: true });

  if (draftSaves.length < viewports.length + 4) throw new Error(`실제 편집 저장 요청이 부족합니다: ${draftSaves.length}`);
  if (imageUploads < 9) throw new Error(`카드 결과 파일 업로드가 실제 실행되지 않았습니다: ${imageUploads}`);
  if (browserErrors.length) throw new Error(`브라우저 console/page 오류 ${browserErrors.length}건: ${browserErrors.join(" | ")}`);
  if (failedRequests.length) throw new Error(`실패 network request ${failedRequests.length}건: ${failedRequests.join(" | ")}`);

  const result = {
    result: "PASS",
    responsive,
    persistedProgressAfterReload: "3 / 9장",
    partialFailure: { failedOrdinal: 4, retriedItemKeys: retryRequests[0].item_keys, finalStatus: scenario === "empty" ? "succeeded-before-empty-case" : scenario },
    stale: { blocker: "EXPORT_SOURCE_STALE", action: "최신 내용 다시 내보내기" },
    empty: { number: emptySlide.number, selectedSlideId: emptySlide.item_key, focusedStage: true },
    draftSaves: draftSaves.length,
    imageUploads,
    consoleErrors: browserErrors.length,
    failedRequests: failedRequests.length,
    intentionalPollingAborts: intentionalAborts.length,
  };
  fs.writeFileSync(path.join(outputDir, "s4-browser-result.json"), JSON.stringify(result, null, 2));
  console.log(JSON.stringify(result, null, 2));
} finally {
  await browser.close();
}
