#!/usr/bin/env node
import { chromium } from "playwright-core";
import postgres from "postgres";

const baseUrl = process.env.STUDIO_S7_BASE_URL || "http://127.0.0.1:3481";
const workspaceId = "71111111-1111-4111-8111-111111111111";
const draftId = "72222222-2222-4222-8222-222222222222";
const databaseUrl = process.env.DATABASE_URL;
const operatorToken = process.env.DASHBOARD_AUTH_TOKEN;
if (!databaseUrl) throw new Error("DATABASE_URL is required for S7 live E2E");
if (!operatorToken) throw new Error("DASHBOARD_AUTH_TOKEN is required for S7 live E2E");
const sql = postgres(databaseUrl, { max: 4, idle_timeout: 5, connect_timeout: 8, onnotice: () => {} });
const posts = [];

function json(route, body, status = 200) {
  return route.fulfill({ status, contentType: "application/json", body: JSON.stringify(body) });
}

async function waitUntil(predicate, timeoutMs, message) {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    if (await predicate()) return;
    await new Promise((resolve) => setTimeout(resolve, 50));
  }
  throw new Error(message);
}

function textCandidate(id, label, body, recommended = false, warnings = []) {
  return {
    id, label, recommended, recommendation_reason: recommended ? "A 문제 제시형 구조에 잘 맞습니다" : "다른 첫 문장 각도입니다", warnings,
    content: {
      threads: body,
      facebook: `${body} Facebook`,
      x: body,
      instagram: { caption: `${body} Instagram`, hashtags: ["S7"], slides: [body, "두 번째 장", "세 번째 장", "저장해 두세요"] },
      shorts: { hook: `${body} 훅`, body: `${body} 본문`, cta: `${body} CTA` },
      image_prompt: `Editorial study image for ${id}`,
    },
  };
}

const textCandidates = [
  textCandidate("question", "질문형", "수능 100일, 지금 무엇을 바꿔야 할까요?", true),
  textCandidate("number", "숫자형", "100일 동안 지킬 세 가지 공부 순서"),
  textCandidate("pain", "고통 인식형", "계획을 세워도 매일 흔들리는 이유가 있습니다", false, [{ code: "length_overflow", channel: "x", message: "X 3자 넘침", overflow: 3 }]),
];

const structureCandidate = {
  generation_id: "gen-s7", candidate_id: "candidate-s7-a", ordinal: 1, label: "A", angle: "problem_first",
  title: "문제 제시형", rationale: "문제를 먼저 짚습니다",
  format: { content_branch: "text_image", preview_kind: "structured_storyboard", quality: "draft", outline: ["수능 100일의 문제", "바꿀 공부 순서", "오늘 할 행동"] },
};

function plainDeck() {
  const text = (id, value, order) => ({
    id, type: "text", name: "본문", x: 100, y: 120, width: 760, height: 220, rotation: order * 3, z_index: 0, opacity: 1, locked: false, hidden: false, text: value,
    style: { font_family: "Pretendard Variable", font_size: 64, font_weight: 700, line_height: 1.2, letter_spacing: 0, color: "#111111", align: "left", vertical_align: "middle" },
  });
  return {
    contract_version: "3.0", id: "deck_s7_browser", template: "plain", ratio: "4:5", revision: 0,
    theme: { background: "#FFF9F0", foreground: "#111111", accent: "#2563EB" },
    brand: { display_name: "S7 브랜드", handle: null }, hook_type: "pain",
    cta: { keyword: "정리본", comment_example: "정리본을 남겨 주세요", save_reason: "나중에 다시 확인하세요" },
    slides: [
      { id: "slide_s7_cover", order: 0, role: "cover", content_state: "filled", background: { kind: "solid", color: "#FFF9F0" }, base: { kind: "plain", lines: ["수능 100일의 문제"] }, elements: [text("el_s7_cover", "수능 100일의 문제", 0)] },
      { id: "slide_s7_body", order: 1, role: "body", content_state: "filled", background: { kind: "solid", color: "#FFF9F0" }, base: { kind: "plain", lines: ["바꿀 공부 순서"] }, elements: [text("el_s7_body", "바꿀 공부 순서", 1)] },
      { id: "slide_s7_cta", order: 2, role: "cta", content_state: "filled", background: { kind: "solid", color: "#111111" }, base: { kind: "plain", lines: ["오늘 할 행동"] }, elements: [text("el_s7_cta", "오늘 할 행동", 2)] },
    ],
  };
}

function commonWork() {
  return { includes: {}, publishReconciliations: {}, publishProgress: { running: false, stopped: false, status: {}, urls: {}, errors: {}, already: {} } };
}

function textWork() {
  return {
    ...commonWork(),
    idea: "수능 100일 공부 계획",
    text: { text_candidates: textCandidates, selected_text_candidate_id: "question", recommended_text_candidate_id: "question" },
    editLines: ["직접 고친 첫 문장", "직접 고친 둘째 문장"],
    editKind: "text",
    bodyRevision: 0,
  };
}

function cardWork(deck) {
  return { ...commonWork(), idea: "S7 템플릿 실구동", draftId, text: null, editLines: ["수능 100일의 문제", "바꿀 공부 순서", "오늘 할 행동"], editKind: "card", editFormat: { kind: "card", aspectRatio: "4:5", background: "작업실 책상", subtitleSize: "보통" }, cardDeckV3: deck, cardDeckV3SourceSnapshot: null, bodyRevision: 0 };
}

function observeCoreRequests(page) {
  page.on("request", (request) => {
    const pathname = new URL(request.url()).pathname;
    if (request.method() !== "POST" || !["/api/studio/drafts", "/api/studio/text", "/api/queue/add"].includes(pathname) && !/\/api\/queue\/[^/]+\/request-review$/.test(pathname)) return;
    let body = {};
    try { body = JSON.parse(request.postData() || "{}"); } catch { body = {}; }
    posts.push({ endpoint: pathname, ...body });
  });
}

async function installRoutes(context) {
  const handler = async (route) => {
    const request = route.request();
    const url = new URL(request.url());
    const pathname = url.pathname;
    if (pathname === "/api/me") return json(route, { isOperator: false, tenant: { id: workspaceId, slug: "s7", name: "S7 실구동", status: "active" } });
    if (pathname === "/api/studio/brand-setup") return json(route, { guide: "따뜻하고 구체적인 존댓말" });
    if (pathname === "/api/usage") return json(route, { today: {}, thisWeek: {}, tier: "team", quota: {} });
    if (pathname === "/api/studio/engine-status") return json(route, { ready: true });
    if (pathname === "/api/studio/learning") return json(route, { info: {} });
    if (pathname === "/api/channel-config") return json(route, {});
    if (pathname === "/api/onboarding") return json(route, { completed: true });
    if (pathname === "/api/performance/learned-rules") return json(route, { rules: [] });
    if (/^\/api\/studio\/v1\/generations\/[^/]+\/derivations$/.test(pathname) && request.method() === "GET") {
      return json(route, {
        data: {
          quote: {
            currency: "KRW",
            total_minor: 0,
            lines: [{ kind: "card", label: "카드뉴스", unit_minor: 0 }],
            assumptions: ["S7 브라우저 픽스처"],
          },
        },
      });
    }
    if (pathname === "/api/publish/first-comment-capabilities") return json(route, { capabilities: [] });
    if (/^\/api\/channels\/[^/]+\/accounts$/.test(pathname)) return json(route, { accounts: [] });
    if (pathname === "/api/images/upload") return json(route, { url: "/qa/alignment-card-1.jpg", filename: "alignment-card-1.jpg" });
    if (pathname === "/api/images") return json(route, { images: [] });
    if (pathname === "/api/queue/add" && request.method() === "POST") return json(route, { post: { id: "s7-review-queue" } });
    if (/^\/api\/queue\/[^/]+\/request-review$/.test(pathname) && request.method() === "POST") return json(route, { ok: true, reused: false });
    return json(route, {});
  };
  const mockedApiRoutes = [
    "**/api/me",
    "**/api/studio/brand-setup**",
    "**/api/usage**",
    "**/api/studio/engine-status**",
    "**/api/studio/learning**",
    "**/api/channel-config**",
    "**/api/onboarding**",
    "**/api/performance/learned-rules**",
    "**/api/studio/v1/generations/*/derivations**",
    "**/api/publish/first-comment-capabilities**",
    "**/api/channels/*/accounts**",
    "**/api/images**",
    "**/api/queue/add",
    "**/api/queue/*/request-review",
  ];
  for (const pattern of mockedApiRoutes) await context.route(pattern, handler);
}

async function prepareDatabase() {
  await sql`DELETE FROM tenants WHERE id = ${workspaceId}`;
  await sql`
    INSERT INTO tenants (id, slug, name, status, tier, shared_cli_approved_at)
    VALUES (${workspaceId}, 's7-live-e2e', 'S7 실구동', 'active', 'team', now())`;
}

async function resetCardDraft() {
  const deck = plainDeck();
  await sql`DELETE FROM drafts WHERE tenant_id = ${workspaceId}`;
  await sql`
    INSERT INTO drafts (id, tenant_id, idea, payload, status)
    VALUES (${draftId}, ${workspaceId}, 'S7 템플릿 실구동', ${sql.json(cardWork(deck))}, 'draft')`;
  return deck;
}

async function latestStoredDraft() {
  const [row] = await sql`
    SELECT id, payload, updated_at FROM drafts
    WHERE tenant_id = ${workspaceId}
    ORDER BY updated_at DESC LIMIT 1`;
  if (!row) throw new Error("실제 PostgreSQL에 저장된 S7 초안이 없습니다");
  return row;
}

async function runCreateCardFlow(browser) {
  const postStart = posts.length;
  const context = await browser.newContext({ viewport: { width: 1440, height: 1000 } });
  const errors = [];
  await context.addInitScript(({ id, work, createState, token }) => {
    localStorage.setItem("dashboard_auth_token", token);
    localStorage.setItem("active_workspace", JSON.stringify({ id, slug: "s7", name: "S7 실구동", tier: "team" }));
    localStorage.setItem(`studio_work:${id}`, JSON.stringify(work));
    localStorage.setItem(`studio_create_state:${id}`, JSON.stringify(createState));
  }, {
    id: workspaceId,
    token: operatorToken,
    work: textWork(),
    createState: { primaryKind: "card", alsoKinds: [], questionIndex: 5, purpose: "공부 계획 안내", audience: "수험생", rightsConfirmed: true, topicOpen: false, candidates: [structureCandidate], selected: "A", quickStructure: { label: "A", title: "문제 제시형", outline: structureCandidate.format.outline }, cardTemplateId: "number_list", topic: "수능 100일 공부 계획" },
  });
  await installRoutes(context);
  const page = await context.newPage();
  observeCoreRequests(page);
  collectBrowserErrors(page, errors);
  await page.goto(`${baseUrl}/studio?room=create&kind=card`, { waitUntil: "networkidle", timeout: 60_000 });
  await page.getByLabel("초안 주제").fill("수능 100일 공부 계획");
  const useStructure = page.getByRole("button", { name: "A 구조 사용" });
  if (await useStructure.isVisible()) await useStructure.click();
  const numberTemplate = page.locator('[data-card-template="number_list"]');
  try {
    await numberTemplate.waitFor({ state: "visible" });
  } catch (error) {
    throw new Error(`생성실 카드 템플릿을 찾지 못했습니다. 화면=${(await page.locator("body").innerText()).slice(0, 1800)} 오류=${errors.join(" | ")} 원인=${error instanceof Error ? error.message : String(error)}`);
  }
  await numberTemplate.click();
  const chatButton = page.locator('[data-card-template="chat_bubble"]');
  if (!(await chatButton.isDisabled()) || !(await chatButton.innerText()).includes("기존 카톡 말풍선 덱")) throw new Error("plain 카드의 카톡 템플릿이 기존 변환 경로 안내와 함께 비활성화되지 않았습니다");
  await page.getByRole("button", { name: "초안 만들기" }).click();
  try {
    await waitUntil(
      () => posts.slice(postStart).some((post) => post.endpoint === "/api/studio/text" && post.card_template_id === "number_list"),
      10_000,
      "생성실에서 고른 cardTemplateId가 글 생성 API에 전달되지 않았습니다",
    );
  } catch (error) {
    throw new Error(`${error instanceof Error ? error.message : String(error)} 요청=${JSON.stringify(posts.slice(postStart))} 화면=${(await page.locator("body").innerText()).slice(0, 1600)} 오류=${errors.join(" | ")}`);
  }
  await page.waitForFunction((id) => {
    const value = JSON.parse(localStorage.getItem(`studio_work:${id}`) || "{}");
    return value.cardTemplateState?.activeTemplateId === "number_list" && value.cardDeckV3?.slides?.[0]?.elements?.[0]?.x === 244;
  }, workspaceId);
  await waitUntil(async () => {
    const [stored] = await sql`
      SELECT payload FROM drafts WHERE tenant_id = ${workspaceId}
      ORDER BY updated_at DESC LIMIT 1`;
    return stored?.payload?.cardTemplateState?.activeTemplateId === "number_list"
      && stored?.payload?.cardDeckV3?.slides?.[0]?.elements?.[0]?.x === 244;
  }, 15_000, "생성 직후 v3 덱과 템플릿 상태가 실제 PostgreSQL에 저장되지 않았습니다");
  const stored = await latestStoredDraft();
  const dimensions = await noHorizontalOverflow(page, "생성실 카드 템플릿 1440");
  if (errors.length) throw new Error(`생성실 카드 템플릿 콘솔 오류: ${errors.join(" | ")}`);
  await context.close();
  return { viewport: 1440, dimensions, template: "number_list", storedDraftId: stored.id };
}

async function noHorizontalOverflow(page, label) {
  const dimensions = await page.evaluate(() => ({ width: document.documentElement.clientWidth, scrollWidth: document.documentElement.scrollWidth }));
  if (dimensions.scrollWidth > dimensions.width) throw new Error(`${label} 가로 넘침 ${dimensions.scrollWidth - dimensions.width}px`);
  return dimensions;
}

function collectBrowserErrors(page, errors) {
  page.on("pageerror", (error) => errors.push(error.message));
  page.on("console", (message) => { if (message.type() === "error") errors.push(message.text()); });
  page.on("response", (response) => {
    if (response.status() >= 500) errors.push(`${response.status()} ${new URL(response.url()).pathname}`);
  });
}

async function runTextFlow(browser, viewport) {
  const context = await browser.newContext({ viewport });
  const errors = [];
  await context.addInitScript(({ id, work, createState, token }) => {
    localStorage.setItem("dashboard_auth_token", token);
    localStorage.setItem("active_workspace", JSON.stringify({ id, slug: "s7", name: "S7 실구동", tier: "team" }));
    localStorage.setItem(`studio_work:${id}`, JSON.stringify(work));
    localStorage.setItem(`studio_create_state:${id}`, JSON.stringify(createState));
  }, {
    id: workspaceId,
    token: operatorToken,
    work: textWork(),
    createState: { primaryKind: "text", alsoKinds: [], questionIndex: 5, purpose: "공부 계획 안내", audience: "수험생", rightsConfirmed: true, topicOpen: false, candidates: [structureCandidate], selected: "A", quickStructure: { label: "A", title: "문제 제시형", outline: structureCandidate.format.outline }, topic: "수능 100일 공부 계획" },
  });
  await installRoutes(context);
  const page = await context.newPage();
  observeCoreRequests(page);
  collectBrowserErrors(page, errors);
  await page.goto(`${baseUrl}/studio?room=create&kind=text`, { waitUntil: "networkidle", timeout: 60_000 });
  try {
    await page.locator("[data-text-candidate-picker]").waitFor({ state: "visible" });
  } catch (error) {
    throw new Error(`글 후보 비교 화면을 찾지 못했습니다. 화면=${(await page.locator("body").innerText()).slice(0, 1200)} 오류=${errors.join(" | ")} 원인=${error instanceof Error ? error.message : String(error)}`);
  }
  await page.locator('[data-text-candidate-tab="number"]').click();
  await page.locator('[data-text-candidate-preview="number"]').getByRole("button", { name: "이 후보로" }).click();
  await page.getByRole("heading", { name: "고친 본문을 다른 후보로 바꿀까요?" }).waitFor({ state: "visible" });
  await page.getByRole("button", { name: "현재 본문 유지" }).click();
  await page.waitForFunction((id) => {
    const value = JSON.parse(localStorage.getItem(`studio_work:${id}`) || "{}");
    return value.text?.selected_text_candidate_id === "question" && value.editLines?.[0] === "직접 고친 첫 문장";
  }, workspaceId);
  await page.locator('[data-text-candidate-preview="number"]').getByRole("button", { name: "이 후보로" }).click();
  await page.getByRole("button", { name: "고친 내용을 버리고 바꾸기" }).click();
  await page.waitForFunction((id) => {
    const value = JSON.parse(localStorage.getItem(`studio_work:${id}`) || "{}");
    return value.text?.selected_text_candidate_id === "number" && value.editLines?.[0]?.includes("100일 동안");
  }, workspaceId);
  const dimensions = await noHorizontalOverflow(page, `글 후보 ${viewport.width}`);
  if (errors.length) throw new Error(`글 후보 콘솔 오류: ${errors.join(" | ")}`);
  await context.close();
  return { viewport: viewport.width, dimensions };
}

async function runCardFlow(browser, viewport) {
  const postStart = posts.length;
  const initial = await resetCardDraft();
  const context = await browser.newContext({ viewport });
  const errors = [];
  await context.addInitScript(({ id, work, token }) => {
    localStorage.setItem("dashboard_auth_token", token);
    localStorage.setItem("active_workspace", JSON.stringify({ id, slug: "s7", name: "S7 실구동", tier: "team" }));
    localStorage.setItem(`studio_work:${id}`, JSON.stringify(work));
  }, { id: workspaceId, work: cardWork(initial), token: operatorToken });
  await installRoutes(context);
  const page = await context.newPage();
  observeCoreRequests(page);
  collectBrowserErrors(page, errors);
  await page.goto(`${baseUrl}/studio?room=edit&kind=card&draft_id=${draftId}`, { waitUntil: "networkidle", timeout: 60_000 });
  await page.locator("[data-card-canvas-editor]").waitFor({ state: "visible" });
  if (await page.locator("[data-card-stage]").count() < 1) throw new Error("데이터가 있는 카드 작업대가 열리지 않았습니다");

  await page.locator('[data-card-template="headline_cover"]').click();
  await page.getByRole("button", { name: "이 템플릿으로 바꾸기" }).click();
  await page.waitForFunction((id) => JSON.parse(localStorage.getItem(`studio_work:${id}`) || "{}").cardDeckV3?.slides?.[0]?.elements?.[0]?.x === 96, workspaceId);
  const latestDeck = await page.evaluate((id) => JSON.parse(localStorage.getItem(`studio_work:${id}`) || "{}").cardDeckV3, workspaceId);
  if (latestDeck.slides[0].elements[0].id !== "el_s7_cover" || latestDeck.slides[0].elements[0].x !== 96) throw new Error("전체 템플릿이 요소 ID를 보존해 적용되지 않았습니다");
  await page.getByRole("button", { name: "실행 취소" }).click();
  await page.waitForFunction((id) => {
    const value = JSON.parse(localStorage.getItem(`studio_work:${id}`) || "{}");
    return value.cardDeckV3?.slides?.[0]?.elements?.[0]?.x === 100
      && value.cardTemplateState?.activeTemplateId === "text_only";
  }, workspaceId);
  const undone = await page.evaluate((id) => JSON.parse(localStorage.getItem(`studio_work:${id}`) || "{}").cardDeckV3, workspaceId);
  if (undone.slides[0].elements[0].x !== initial.slides[0].elements[0].x) throw new Error("템플릿 undo 1회가 원래 배치를 복원하지 않았습니다");

  await page.locator('[data-card-template="headline_cover"]').click();
  await page.getByRole("button", { name: "이 템플릿으로 바꾸기" }).click();
  await page.waitForFunction((id) => JSON.parse(localStorage.getItem(`studio_work:${id}`) || "{}").cardDeckV3?.slides?.[0]?.elements?.[0]?.x === 96, workspaceId);
  const headline = await page.evaluate((id) => JSON.parse(localStorage.getItem(`studio_work:${id}`) || "{}").cardDeckV3, workspaceId);
  await page.locator('[data-card-template="number_list"]').click();
  await page.getByRole("button", { name: "이 템플릿으로 바꾸기" }).click();
  await page.waitForFunction((id) => JSON.parse(localStorage.getItem(`studio_work:${id}`) || "{}").cardDeckV3?.slides?.[0]?.elements?.[0]?.x === 244, workspaceId);
  await page.getByRole("button", { name: /이전 템플릿\(큰 제목 표지형\)으로/ }).click();
  await page.waitForFunction((id) => JSON.parse(localStorage.getItem(`studio_work:${id}`) || "{}").cardDeckV3?.slides?.[0]?.elements?.[0]?.x === 96, workspaceId);
  const restored = await page.evaluate((id) => JSON.parse(localStorage.getItem(`studio_work:${id}`) || "{}").cardDeckV3, workspaceId);
  if (JSON.stringify(restored.slides) !== JSON.stringify(headline.slides)) throw new Error("이전 템플릿 복원이 요소 상태를 정확히 복원하지 않았습니다");

  await page.getByRole("button", { name: "이 장만 바꾸기" }).click();
  await page.locator('[data-card-template="photo_band"]').click();
  const beforeOne = structuredClone(restored);
  await page.getByRole("button", { name: "이 템플릿으로 바꾸기" }).click();
  await page.waitForFunction((id) => JSON.parse(localStorage.getItem(`studio_work:${id}`) || "{}").cardDeckV3?.slides?.[0]?.elements?.[0]?.x === 72, workspaceId);
  const oneSlide = await page.evaluate((id) => JSON.parse(localStorage.getItem(`studio_work:${id}`) || "{}").cardDeckV3, workspaceId);
  if (JSON.stringify(oneSlide.slides[1]) !== JSON.stringify(beforeOne.slides[1])) throw new Error("이 장만 적용이 다른 장 JSON을 바꿨습니다");
  if (JSON.stringify(oneSlide.slides[0]) === JSON.stringify(beforeOne.slides[0])) throw new Error("이 장만 적용이 고른 장을 바꾸지 않았습니다");
  await waitUntil(
    () => posts.slice(postStart).some((post) => post.endpoint === "/api/studio/drafts"
      && post.cardDeckV3?.slides?.[0]?.elements?.[0]?.x === 72
      && JSON.stringify(post.cardDeckV3.slides[1]) === JSON.stringify(oneSlide.slides[1])),
    15_000,
    "템플릿 최종 덱이 실제 초안 저장 API까지 왕복하지 않았습니다",
  );
  const persisted = posts.slice(postStart).findLast((post) => post.endpoint === "/api/studio/drafts" && post.cardTemplateState?.activeTemplateId === "photo_band");
  if (!persisted?.cardTemplateState?.previousTemplate?.deck) throw new Error("템플릿 ID와 복원용 직전 상태가 초안 저장 API에 함께 영속되지 않았습니다");
  await waitUntil(async () => {
    const [stored] = await sql`SELECT payload FROM drafts WHERE id = ${draftId} AND tenant_id = ${workspaceId}`;
    return stored?.payload?.cardTemplateState?.activeTemplateId === "photo_band"
      && stored?.payload?.cardDeckV3?.slides?.[0]?.elements?.[0]?.x === 72;
  }, 15_000, "템플릿 덱과 복원 상태가 실제 PostgreSQL에 함께 저장되지 않았습니다");
  await page.reload({ waitUntil: "networkidle", timeout: 60_000 });
  await page.locator("[data-card-canvas-editor]").waitFor({ state: "visible" });
  await page.getByRole("button", { name: /이전 템플릿\(큰 제목 표지형\)으로/ }).waitFor({ state: "visible" });

  const draftsBeforeMove = posts.filter((post) => post.endpoint === "/api/studio/drafts").length;
  await page.getByRole("button", { name: "발행실로 이동" }).click();
  await page.waitForURL(/room=publish/, { timeout: 30_000 });
  await waitUntil(
    () => posts.filter((post) => post.endpoint === "/api/studio/drafts").length > draftsBeforeMove,
    10_000,
    "발행실 이동 전 실제 drafts 저장이 호출되지 않았습니다",
  );

  const draftsBeforePublishSave = posts.filter((post) => post.endpoint === "/api/studio/drafts").length;
  await page.getByRole("button", { name: "임시 저장하기" }).click();
  await waitUntil(
    () => posts.filter((post) => post.endpoint === "/api/studio/drafts").length > draftsBeforePublishSave,
    10_000,
    "발행실 임시 저장이 실제 drafts route를 호출하지 않았습니다",
  );

  const draftsBeforeReview = posts.filter((post) => post.endpoint === "/api/studio/drafts").length;
  await page.getByRole("button", { name: "검토 요청하기" }).click();
  await waitUntil(
    () => posts.filter((post) => post.endpoint === "/api/studio/drafts").length > draftsBeforeReview
      && posts.some((post) => post.endpoint === "/api/queue/add")
      && posts.some((post) => /\/api\/queue\/[^/]+\/request-review$/.test(post.endpoint)),
    15_000,
    "검토 요청 전 저장 또는 검토 큐 호출을 관찰하지 못했습니다",
  );

  const [storedAfterActions] = await sql`SELECT payload FROM drafts WHERE id = ${draftId} AND tenant_id = ${workspaceId}`;
  if (storedAfterActions?.payload?.cardTemplateState?.activeTemplateId !== "photo_band") {
    throw new Error("수동 저장·발행실 이동·검토 요청 뒤 실제 DB의 템플릿 상태가 유지되지 않았습니다");
  }

  const dimensions = await noHorizontalOverflow(page, `카드 템플릿 ${viewport.width}`);
  if (errors.length) throw new Error(`카드 템플릿 콘솔 오류: ${errors.join(" | ")}`);
  await context.close();
  return {
    viewport: viewport.width,
    dimensions,
    slideCount: oneSlide.slides.length,
    bodyRevision: storedAfterActions.payload.bodyRevision,
  };
}

await prepareDatabase();
const browser = await chromium.launch({ headless: true });
try {
  const results = [];
  results.push(await runCreateCardFlow(browser));
  results.push(await runTextFlow(browser, { width: 1440, height: 1000 }));
  results.push(await runCardFlow(browser, { width: 1440, height: 1000 }));
  results.push(await runCardFlow(browser, { width: 1024, height: 900 }));
  results.push(await runCardFlow(browser, { width: 390, height: 844 }));
  const [{ count: draftRows }] = await sql`SELECT count(*)::int AS count FROM drafts WHERE tenant_id = ${workspaceId}`;
  process.stdout.write(`${JSON.stringify({
    ok: true,
    apiEvidence: "live-dev-server-postgresql",
    draftRouteEvidence: "actual-route-rls-postgresql",
    llmEvidence: "server-side-cli-stub-only",
    results,
    posts: posts.length,
    coreDraftPosts: posts.filter((post) => post.endpoint === "/api/studio/drafts").length,
    draftRows,
    consoleErrors: 0,
  }, null, 2)}\n`);
} finally {
  await browser.close();
  await sql`DELETE FROM tenants WHERE id = ${workspaceId}`;
  await sql.end({ timeout: 5 });
}
