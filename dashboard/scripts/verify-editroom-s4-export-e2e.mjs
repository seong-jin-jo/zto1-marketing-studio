#!/usr/bin/env node

import fs from "node:fs";
import path from "node:path";
import crypto from "node:crypto";
import { chromium } from "playwright-core";
import { createJiti } from "jiti";
import postgres from "postgres";

const jiti = createJiti(import.meta.url, { alias: { "@": path.resolve("src") } });
const { createPlainCardDeckV3 } = await jiti.import("../src/lib/studio/card-element-commands.ts");
const { mediaStore } = await jiti.import("../src/lib/media-store.ts");

const baseUrl = process.env.EDITROOM_S4_BASE_URL || "http://localhost:3474";
const outputDir = process.env.EDITROOM_S4_OUTPUT_DIR || path.resolve(process.cwd(), "../docs/qa/editroom-v2-s4");
const databaseUrl = process.env.DATABASE_URL;
if (!databaseUrl) throw new Error("EDITROOM S4 actual-backend E2E requires DATABASE_URL");
const workspaceId = "41111111-1111-4111-8111-111111111111";
const browserToken = process.env.EDITROOM_S4_BEARER_TOKEN || "osmu_editroom_s4_browser_token";
let draftId = "";
const lines = Array.from({ length: 9 }, (_, index) => `${index + 1}장 실제 내보내기 검증 내용`);
const deck = createPlainCardDeckV3(lines, "deck_s4_browser");
function canonical(value) {
  if (Array.isArray(value)) return value.map(canonical);
  if (value && typeof value === "object") {
    return Object.fromEntries(Object.entries(value)
      .sort(([left], [right]) => left.localeCompare(right))
      .map(([key, entry]) => [key, canonical(entry)]));
  }
  return value;
}
const source = {
  sourceRevision: deck.revision,
  sourceHash: crypto.createHash("sha256").update(JSON.stringify(canonical(deck))).digest("hex"),
};
const emptySlide = { order: 5, number: 6, item_key: deck.slides[5].id };
const viewports = [
  { width: 1440, height: 1000 },
  { width: 1024, height: 900 },
  { width: 390, height: 844 },
];

let scenario = "progress";
let exportId = "";
let retryRequests = [];
let draftSaves = [];
let imageUploads = 0;
let enqueueReceipt = null;
let createdDrafts = 0;
let resettingPage = false;

const admin = postgres(databaseUrl, { max: 2 });
const tinyPng = Buffer.from("iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M/wHwAF/gL+XQ8lWQAAAABJRU5ErkJggg==", "base64");

async function aggregateJob(jobId) {
  await admin`
    WITH counts AS (
      SELECT
        count(*) FILTER (WHERE status='succeeded')::smallint AS succeeded,
        count(*) FILTER (WHERE status='failed')::smallint AS failed,
        count(*) FILTER (WHERE status='processing') AS processing,
        count(*) FILTER (WHERE status='queued') AS queued
      FROM studio_export_items WHERE tenant_id=${workspaceId} AND job_id=${jobId}
    )
    UPDATE studio_export_jobs AS job
    SET succeeded_items=counts.succeeded,failed_items=counts.failed,
        status=CASE
          WHEN counts.succeeded=job.total_items THEN 'succeeded'
          WHEN counts.failed > 0 AND counts.succeeded + counts.failed=job.total_items
            THEN CASE WHEN counts.succeeded > 0 THEN 'partially_failed' ELSE 'failed' END
          WHEN counts.processing > 0 THEN 'processing'
          ELSE 'queued'
        END,
        started_at=CASE WHEN counts.processing > 0 THEN COALESCE(job.started_at,now()) ELSE job.started_at END,
        finished_at=CASE WHEN counts.succeeded + counts.failed=job.total_items THEN now() ELSE NULL END,
        updated_at=now()
    FROM counts WHERE job.tenant_id=${workspaceId} AND job.id=${jobId}`;
}

async function processQueued(limit, failOrdinal = null) {
  let processed = 0;
  while (processed < limit) {
    const [claimed] = await admin`
      WITH candidate AS (
        SELECT id FROM studio_export_items
        WHERE tenant_id=${workspaceId} AND status='queued' AND available_at <= now()
        ORDER BY available_at,created_at,id FOR UPDATE SKIP LOCKED LIMIT 1
      )
      UPDATE studio_export_items AS item
      SET status='processing',attempt_count=item.attempt_count+1,lease_token=gen_random_uuid(),
          lease_owner=${`s4-browser-worker-${processed}`},lease_expires_at=now()+interval '5 minutes',
          heartbeat_at=now(),started_at=COALESCE(item.started_at,now()),updated_at=now()
      FROM candidate WHERE item.id=candidate.id RETURNING item.*`;
    if (!claimed) break;
    if (failOrdinal === claimed.ordinal) {
      await admin`
        UPDATE studio_export_items
        SET status='failed',lease_token=NULL,lease_owner=NULL,lease_expires_at=NULL,heartbeat_at=NULL,
            error_code='CARD_DECK_INVALID',error_detail='S4 browser worker stub failure',finished_at=now(),updated_at=now()
        WHERE tenant_id=${workspaceId} AND id=${claimed.id}`;
    } else {
      const filename = `s4-browser-${claimed.job_id}-${claimed.ordinal}.png`;
      await mediaStore.put(workspaceId, filename, tinyPng, "image/png");
      await admin`
        UPDATE studio_export_items
        SET status='succeeded',artifact_key=${filename},
            artifact_sha256=${crypto.createHash("sha256").update(tinyPng).digest("hex")},
            content_type='image/png',byte_size=${tinyPng.byteLength},width=1080,height=1350,
            lease_token=NULL,lease_owner=NULL,lease_expires_at=NULL,heartbeat_at=NULL,
            error_code=NULL,error_detail=NULL,finished_at=now(),updated_at=now()
        WHERE tenant_id=${workspaceId} AND id=${claimed.id}`;
    }
    await aggregateJob(claimed.job_id);
    processed += 1;
  }
  return processed;
}

async function resetDatabase(nextScenario) {
  scenario = nextScenario;
  await admin`DELETE FROM queue_posts WHERE tenant_id=${workspaceId}`;
  await admin`DELETE FROM drafts WHERE tenant_id=${workspaceId}`;
  await admin`
    INSERT INTO tenants(id,slug,name,status)
    VALUES (${workspaceId},'editroom-s4-browser','S4 브라우저 검증','active')
    ON CONFLICT (id) DO UPDATE SET status='active',name=EXCLUDED.name`;
  await admin`
    INSERT INTO tenant_tokens(tenant_id,token_hash,label)
    VALUES (${workspaceId},${crypto.createHash("sha256").update(browserToken).digest("hex")},'editroom-s4-browser-e2e')
    ON CONFLICT (token_hash) DO UPDATE SET tenant_id=EXCLUDED.tenant_id,revoked=false`;
  const saveResponse = await fetch(`${baseUrl}/api/studio/drafts`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${browserToken}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      tenant_id: workspaceId,
      idea: "S4 내보내기 브라우저 검증",
      cardDeckV3: deck,
      editLines: lines,
      editKind: "card",
      status: "draft",
    }),
  });
  const saved = await saveResponse.json();
  if (saveResponse.status !== 200 || saved.ok !== true || typeof saved.id !== "string") {
    throw new Error(`실제 초안 저장 API가 실패했습니다: ${saveResponse.status} ${JSON.stringify(saved)}`);
  }
  draftId = saved.id;
  createdDrafts += 1;
  const createResponse = await fetch(`${baseUrl}/api/studio/drafts/${draftId}/exports`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${browserToken}`,
      "Content-Type": "application/json",
      "Idempotency-Key": `s4-browser-${nextScenario}-${Date.now()}`,
    },
    body: JSON.stringify({
      tenant_id: workspaceId,
      kind: "card_deck",
      expected_source_revision: source.sourceRevision,
      expected_source_hash: source.sourceHash,
      item_keys: null,
    }),
  });
  const created = await createResponse.json();
  if (![200, 202].includes(createResponse.status) || typeof created.export_id !== "string") {
    throw new Error(`실제 export 생성 API가 실패했습니다: ${createResponse.status} ${JSON.stringify(created)}`);
  }
  exportId = created.export_id;

  if (nextScenario === "progress" || nextScenario === "partial") {
    await admin`
      UPDATE studio_export_items SET available_at=now()+interval '10 minutes'
      WHERE tenant_id=${workspaceId} AND job_id=${exportId} AND ordinal=3`;
    if (await processQueued(3) !== 3) throw new Error("실제 작업자가 초기 3장을 처리하지 못했습니다");
  }
  if (nextScenario === "partial") {
    await admin`
      UPDATE studio_export_items SET available_at=now()
      WHERE tenant_id=${workspaceId} AND job_id=${exportId} AND status='queued'`;
    await processQueued(20, 3);
  }
  if (nextScenario === "success" || nextScenario === "stale") {
    await processQueued(20);
  }
}

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
    bodyRevision: 0,
    includes: {},
    publishReconciliations: {},
    publishProgress: { running: false, stopped: false, status: {}, urls: {}, errors: {}, already: {} },
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
await context.addInitScript(({ id }) => {
  try {
    const payload = JSON.parse(window.name || "null");
    localStorage.setItem("dashboard_auth_token", payload?.token ?? "");
    localStorage.setItem("active_workspace", JSON.stringify({ id, slug: "editroom-s4", name: "S4 브라우저 검증", tier: "team" }));
    if (payload?.state) localStorage.setItem(`studio_work:${id}`, JSON.stringify(payload.state));
  } catch { /* about:blank에는 저장소 origin이 없다. 실제 앱 origin에서 다시 실행된다. */ }
}, { id: workspaceId });

// 인증 세션만 고정한다. 초안 저장과 조회, 이미지 업로드, 내보내기, 재시도,
// 발행실 고정은 실제 Next API와 PostgreSQL을 통과해야 이 검증의 증거가 된다.
await context.route("**/api/me", (route) => json(route, {
  isOperator: false,
  tenant: { id: workspaceId, slug: "editroom-s4", name: "S4 브라우저 검증", status: "active" },
}));

const page = await context.newPage();
page.setDefaultTimeout(60_000);
const browserErrors = [];
const failedRequests = [];
const intentionalAborts = [];
page.on("pageerror", (error) => browserErrors.push(error.message));
page.on("console", (message) => { if (message.type() === "error") browserErrors.push(message.text()); });
page.on("requestfailed", (request) => {
  const failure = `${request.method()} ${request.url()} ${request.failure()?.errorText ?? "failed"}`;
  if (request.failure()?.errorText === "net::ERR_ABORTED"
    && (
      resettingPage
      || request.url().includes(`/drafts/${draftId}/exports/`)
      || request.url().includes("/api/images/deliver/")
      || request.url().includes("/__nextjs_font/")
    )) {
    intentionalAborts.push(failure);
    return;
  }
  failedRequests.push(failure);
});
page.on("request", (request) => {
  if (request.method() !== "POST") return;
  const pathname = new URL(request.url()).pathname;
  if (pathname === "/api/studio/drafts") {
    try { draftSaves.push(request.postDataJSON()); } catch { draftSaves.push(null); }
  }
  if (pathname === "/api/images/upload") imageUploads += 1;
  if (!exportId) return;
  if (pathname !== `/api/studio/drafts/${draftId}/exports/${exportId}/retry`) return;
  try {
    retryRequests.push(request.postDataJSON());
  } catch {
    retryRequests.push(null);
  }
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
  for (let attempt = 0; attempt < 120 && await button.evaluate((node) => node.disabled); attempt += 1) {
    await page.waitForTimeout(250);
  }
  const buttonState = await button.evaluate((node) => ({
    disabled: node.disabled,
    inertAncestor: Boolean(node.closest("[inert]")),
    disabledFieldset: Boolean(node.closest("fieldset[disabled]")),
  }));
  if (buttonState.disabled || buttonState.inertAncestor || buttonState.disabledFieldset) {
    const diagnostic = {
      disabledDom: await button.evaluate((node) => ({
        outerHTML: node.outerHTML,
        property: node.disabled,
        inertAncestor: node.closest("[inert]")?.outerHTML.slice(0, 500) ?? null,
        disabledFieldset: node.closest("fieldset[disabled]")?.outerHTML.slice(0, 500) ?? null,
      })),
      room: (await room.innerText()).slice(0, 6_000),
      body: (await page.locator("body").innerText()).slice(0, 8_000),
      draftSaves,
      browserErrors,
      failedRequests,
    };
    await page.screenshot({ path: path.join(outputDir, "s4-disabled-export-diagnostic.png"), fullPage: true });
    console.error("S4_DISABLED_EXPORT_DIAGNOSTIC", JSON.stringify(diagnostic, null, 2));
    throw new Error("내보내기 버튼이 비활성 상태입니다");
  }
  // Playwright 1.61의 isDisabled/actionability가 이 화면에서 disabled=false인 버튼을
  // disabled로 오판한다. 위에서 실제 DOM disabled/inert/fieldset을 모두 단언한 뒤
  // 실제 click 이벤트만 강제로 전달한다.
  await button.click({ force: true });
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
  resettingPage = true;
  await page.goto("about:blank");
  resettingPage = false;
  await resetDatabase(nextScenario);
  await page.setViewportSize(viewport);
  await page.evaluate(({ state, token }) => { window.name = JSON.stringify({ state, token }); }, { state: work(), token: browserToken });
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

  await reset("partial", viewports[0]);
  await page.getByRole("button", { name: "4장 다시 시도", exact: true }).waitFor();
  await page.screenshot({ path: path.join(outputDir, "s4-partial-failure.png"), fullPage: true });
  const retryResponsePromise = page.waitForResponse((response) => {
    const pathname = new URL(response.url()).pathname;
    return response.request().method() === "POST"
      && pathname === `/api/studio/drafts/${draftId}/exports/${exportId}/retry`;
  });
  await page.getByRole("button", { name: "4장 다시 시도", exact: true }).click();
  const retryResponse = await retryResponsePromise;
  if (retryResponse.status() !== 202) {
    const [draftBeforeRetry] = await admin`
      SELECT id,(payload->>'bodyRevision')::int AS body_revision
      FROM drafts WHERE tenant_id=${workspaceId} AND id=${draftId}`;
    const [jobBeforeRetry] = await admin`
      SELECT id,draft_id,status,source_hash
      FROM studio_export_jobs
      WHERE tenant_id=${workspaceId} AND draft_id=${draftId} AND id=${exportId}`;
    throw new Error(`실제 retry API 상태가 202가 아닙니다: ${JSON.stringify({
      status: retryResponse.status(),
      body: await retryResponse.json().catch(() => null),
      draftBeforeRetry,
      jobBeforeRetry,
      draftId,
      exportId,
    })}`);
  }
  if (JSON.stringify(retryRequests) !== JSON.stringify([{ item_keys: [deck.slides[3].id], tenant_id: workspaceId }])) {
    throw new Error(`실패 장 단독 retry 요청이 다릅니다: ${JSON.stringify(retryRequests)}`);
  }
  const retryState = await admin`
    SELECT ordinal,status FROM studio_export_items
    WHERE tenant_id=${workspaceId} AND job_id=${exportId} ORDER BY ordinal`;
  if (retryState.length !== 9
    || retryState[3]?.status !== "queued"
    || retryState.filter((item) => item.status === "succeeded").length !== 8) {
    throw new Error(`실제 retry DB 상태가 다릅니다: ${JSON.stringify(retryState)}`);
  }
  if (await processQueued(1) !== 1) throw new Error("재시도 장을 실제 작업자가 처리하지 못했습니다");
  await page.getByRole("button", { name: "내보내기 닫기" }).click();
  await openPanel();
  await page.getByRole("button", { name: "발행실로", exact: true }).waitFor({ timeout: 15_000 });
  await page.screenshot({ path: path.join(outputDir, "s4-retry-success.png"), fullPage: true });

  const enqueueResponsePromise = page.waitForResponse((response) => {
    const pathname = new URL(response.url()).pathname;
    return response.request().method() === "POST" && pathname === `/api/studio/drafts/${draftId}/enqueue`;
  });
  await page.getByRole("button", { name: "발행실로", exact: true }).click();
  const enqueueResponse = await enqueueResponsePromise;
  const enqueueBody = await enqueueResponse.json();
  if (enqueueResponse.status() !== 200 || enqueueBody.pin_status !== "unpinned" || enqueueBody.code !== "EDITOR_HANDOFF_NOT_FOUND") {
    throw new Error(`handoff 없는 실제 초안의 고정 실패 응답이 다릅니다: ${JSON.stringify({ status: enqueueResponse.status(), body: enqueueBody })}`);
  }
  await page.locator('[data-room="publish"]').waitFor({ state: "visible" });
  const pinNotice = page.getByTestId("publish-export-pin-notice");
  await pinNotice.waitFor({ state: "visible" });
  if (await pinNotice.getAttribute("data-pin-status") !== "unpinned") {
    throw new Error(`handoff 없는 이동의 고정 상태가 unpinned가 아닙니다: ${await pinNotice.innerText()}`);
  }
  const queuedRows = await admin`
    SELECT id,payload FROM queue_posts WHERE tenant_id=${workspaceId}`;
  if (queuedRows.length !== 0) {
    throw new Error(`고정 실패인데 발행 큐 항목이 생겼습니다: ${JSON.stringify(queuedRows)}`);
  }
  enqueueReceipt = {
    status: "unpinned",
    enqueueStatus: enqueueResponse.status(),
    code: enqueueBody.code,
    navigatedToPublish: true,
  };
  await page.waitForLoadState("networkidle");

  await reset("success", viewports[1]);
  await page.getByRole("button", { name: "내보내기 닫기" }).click();
  const staleSave = page.waitForResponse((response) => response.request().method() === "POST"
    && new URL(response.url()).pathname === "/api/studio/drafts"
    && response.status() === 200);
  await page.locator(`[data-element-selection="${deck.slides[0].elements[0].id}"]`).dblclick();
  const directEditor = page.getByRole("textbox", { name: "글 내용 직접 편집" });
  await directEditor.fill(`${lines[0]} 수정됨`);
  await directEditor.press("Tab");
  await staleSave;
  await openPanel();
  await page.locator('[data-export-blocker="EXPORT_SOURCE_STALE"]').waitFor();
  await page.getByRole("button", { name: "최신 내용 다시 내보내기", exact: true }).waitFor();
  await page.screenshot({ path: path.join(outputDir, "s4-stale.png"), fullPage: true });

  await reset("success", viewports[2]);
  await page.getByRole("button", { name: "내보내기 닫기" }).click();
  await page.locator(`[data-card-slide="${deck.slides[5].id}"]`).click();
  const emptyTarget = page.locator(`[data-element-selection="${deck.slides[5].elements[0].id}"]`);
  await emptyTarget.focus();
  const emptySave = page.waitForResponse((response) => response.request().method() === "POST"
    && new URL(response.url()).pathname === "/api/studio/drafts"
    && response.status() === 200);
  await page.locator('[data-placeholder="false"]').getByRole("button", { name: "삭제", exact: true }).click();
  await emptySave;
  await openPanel();
  await page.locator("[data-export-empty-slide]").waitFor();
  await page.getByRole("button", { name: "6장 열기", exact: true }).click();
  await page.locator("[data-export-panel]").waitFor({ state: "detached" });
  const emptySlideButton = page.locator(`[data-card-slide="${deck.slides[5].id}"]`);
  if (await emptySlideButton.getAttribute("aria-pressed") !== "true") throw new Error("빈 6번째 장이 선택되지 않았습니다");
  if (await page.locator("[data-card-stage]").evaluate((node) => document.activeElement === node) !== true) throw new Error("빈 장 카드 스테이지에 초점이 이동하지 않았습니다");
  await page.screenshot({ path: path.join(outputDir, "s4-empty-slide-focus.png"), fullPage: true });

  if (createdDrafts < viewports.length + 4) throw new Error(`실제 API로 만든 초안이 부족합니다: ${createdDrafts}`);
  if (draftSaves.length < viewports.length + 4) throw new Error(`브라우저의 실제 편집 저장 요청이 부족합니다: ${draftSaves.length}`);
  if (imageUploads < 9) throw new Error(`카드 결과 파일 업로드가 실제 실행되지 않았습니다: ${imageUploads}`);
  if (browserErrors.length) throw new Error(`브라우저 console/page 오류 ${browserErrors.length}건: ${browserErrors.join(" | ")}`);
  if (failedRequests.length) throw new Error(`실패 network request ${failedRequests.length}건: ${failedRequests.join(" | ")}`);

  const result = {
    result: "PASS",
    backendPath: { api: "actual Next route", database: "PostgreSQL", worker: "stub only; actual PostgreSQL claim/complete/fail" },
    responsive,
    persistedProgressAfterReload: "3 / 9장",
    partialFailure: { failedOrdinal: 4, retriedItemKeys: retryRequests[0].item_keys, finalStatus: "succeeded" },
    enqueueReceipt,
    stale: { blocker: "EXPORT_SOURCE_STALE", action: "최신 내용 다시 내보내기" },
    empty: { number: emptySlide.number, selectedSlideId: emptySlide.item_key, focusedStage: true },
    draftSaves: draftSaves.length,
    createdDrafts,
    imageUploads,
    consoleErrors: browserErrors.length,
    failedRequests: failedRequests.length,
    intentionalPollingAborts: intentionalAborts.length,
  };
  fs.writeFileSync(path.join(outputDir, "s4-browser-result.json"), JSON.stringify(result, null, 2));
  console.log(JSON.stringify(result, null, 2));
} finally {
  await browser.close();
  await admin`DELETE FROM queue_posts WHERE tenant_id=${workspaceId}`;
  await admin`DELETE FROM drafts WHERE tenant_id=${workspaceId}`;
  await admin`DELETE FROM tenants WHERE id=${workspaceId}`;
  await admin.end();
}
