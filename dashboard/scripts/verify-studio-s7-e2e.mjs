#!/usr/bin/env node
import { chromium } from "playwright-core";

const baseUrl = process.env.STUDIO_S7_BASE_URL || "http://127.0.0.1:3481";
const workspaceId = "71111111-1111-4111-8111-111111111111";
const draftId = "72222222-2222-4222-8222-222222222222";
let bodyRevision = 0;
const posts = [];

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

function textCandidate(id, label, body, recommended = false, warnings = []) {
  return {
    id, label, recommended, recommendation_reason: recommended ? "A 문제 제시형 구조에 잘 맞습니다" : "다른 첫 문장 각도입니다", warnings,
    content: { threads: body, facebook: `${body} Facebook`, x: body, instagram: { caption: `${body} Instagram`, hashtags: ["S7"], slides: [body, "두 번째 장", "세 번째 장", "저장해 두세요"] } },
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
  return { ...commonWork(), idea: "수능 100일 공부 계획", text: { text_candidates: textCandidates, recommended_text_candidate_id: "question" }, editLines: [], editKind: "text", bodyRevision: 0 };
}

function cardWork(deck) {
  return { ...commonWork(), idea: "S7 템플릿 실구동", draftId, text: null, editLines: ["수능 100일의 문제", "바꿀 공부 순서", "오늘 할 행동"], editKind: "card", editFormat: { kind: "card", aspectRatio: "4:5", background: "화이트", subtitleSize: "보통" }, cardDeckV3: deck, cardDeckV3SourceSnapshot: null, bodyRevision };
}

async function installRoutes(context, getDeck, getTemplateState = () => null) {
  await context.route("**/api/**", async (route) => {
    const request = route.request();
    const url = new URL(request.url());
    const pathname = url.pathname;
    if (pathname === "/api/me") return json(route, { isOperator: false, tenant: { id: workspaceId, slug: "s7", name: "S7 실구동", status: "active" } });
    if (pathname === "/api/studio/drafts") {
      if (request.method() === "POST") {
        const body = JSON.parse(request.postData() || "{}");
        posts.push(body);
        bodyRevision += 1;
        return json(route, { ok: true, id: draftId, bodyRevision, videoEditServerRevision: null });
      }
      const deck = getDeck();
      const draft = { id: draftId, idea: "S7 템플릿 실구동", editKind: "card", editLines: cardWork(deck).editLines, bodyRevision, hasCardDeckV3: true, cardDeckV3: deck, cardTemplateState: getTemplateState(), cardDeckV3SourceSnapshot: null, status: "draft", savedAt: "2026-10-07T00:00:00.000Z" };
      return json(route, url.searchParams.has("id") ? { draft } : { drafts: [draft], currentWork: null });
    }
    if (pathname === "/api/studio/text" && request.method() === "POST") {
      const body = JSON.parse(request.postData() || "{}");
      posts.push({ endpoint: "text", ...body });
      return json(route, {
        ok: true,
        threads: "수능 100일의 문제",
        facebook: "수능 100일의 문제",
        x: "수능 100일의 문제",
        instagram: { caption: "수능 100일의 문제", hashtags: ["S7"], slides: ["수능 100일의 문제", "바꿀 공부 순서", "오늘 할 행동"] },
        shorts: { hook: "수능 100일의 문제", body: "바꿀 공부 순서", cta: "오늘 할 행동" },
        ...(body.card_template_id ? { card_template_id: body.card_template_id } : {}),
      });
    }
    if (pathname === "/api/studio/brand-setup") return json(route, { guide: "따뜻하고 구체적인 존댓말" });
    if (pathname === "/api/publish/first-comment-capabilities") return json(route, { capabilities: [] });
    if (/^\/api\/channels\/[^/]+\/accounts$/.test(pathname)) return json(route, { accounts: [] });
    if (pathname === "/api/images") return json(route, { images: [] });
    return json(route, {});
  });
}

async function runCreateCardFlow(browser) {
  const postStart = posts.length;
  const context = await browser.newContext({ viewport: { width: 1440, height: 1000 } });
  const errors = [];
  await context.addInitScript(({ id, work, createState }) => {
    localStorage.setItem("dashboard_auth_token", "studio-s7-token");
    localStorage.setItem("active_workspace", JSON.stringify({ id, slug: "s7", name: "S7 실구동", tier: "team" }));
    localStorage.setItem(`studio_work:${id}`, JSON.stringify(work));
    localStorage.setItem(`studio_create_state:${id}`, JSON.stringify(createState));
  }, {
    id: workspaceId,
    work: textWork(),
    createState: { primaryKind: "card", alsoKinds: [], questionIndex: 5, purpose: "공부 계획 안내", audience: "수험생", rightsConfirmed: true, topicOpen: false, candidates: [structureCandidate], selected: "A", quickStructure: { label: "A", title: "문제 제시형", outline: structureCandidate.format.outline }, cardTemplateId: "number_list", topic: "수능 100일 공부 계획" },
  });
  await installRoutes(context, () => plainDeck());
  const page = await context.newPage();
  page.on("pageerror", (error) => errors.push(error.message));
  page.on("console", (message) => { if (message.type() === "error") errors.push(message.text()); });
  await page.goto(`${baseUrl}/studio?room=create&kind=card`, { waitUntil: "networkidle", timeout: 60_000 });
  await page.locator('[data-card-template="number_list"]').waitFor({ state: "visible" });
  const chatButton = page.locator('[data-card-template="chat_bubble"]');
  if (!(await chatButton.isDisabled()) || !(await chatButton.innerText()).includes("기존 카톡 말풍선 덱")) throw new Error("plain 카드의 카톡 템플릿이 기존 변환 경로 안내와 함께 비활성화되지 않았습니다");
  await page.getByRole("button", { name: "초안 만들기" }).click();
  await waitUntil(
    () => posts.slice(postStart).some((post) => post.endpoint === "text" && post.card_template_id === "number_list"),
    10_000,
    "생성실에서 고른 cardTemplateId가 글 생성 API에 전달되지 않았습니다",
  );
  await page.waitForFunction((id) => {
    const value = JSON.parse(localStorage.getItem(`studio_work:${id}`) || "{}");
    return value.cardTemplateState?.activeTemplateId === "number_list" && value.cardDeckV3?.slides?.[0]?.elements?.[0]?.x === 244;
  }, workspaceId);
  const dimensions = await noHorizontalOverflow(page, "생성실 카드 템플릿 1440");
  if (errors.length) throw new Error(`생성실 카드 템플릿 콘솔 오류: ${errors.join(" | ")}`);
  await context.close();
  return { viewport: 1440, dimensions, template: "number_list" };
}

async function noHorizontalOverflow(page, label) {
  const dimensions = await page.evaluate(() => ({ width: document.documentElement.clientWidth, scrollWidth: document.documentElement.scrollWidth }));
  if (dimensions.scrollWidth > dimensions.width) throw new Error(`${label} 가로 넘침 ${dimensions.scrollWidth - dimensions.width}px`);
  return dimensions;
}

async function runTextFlow(browser, viewport) {
  const context = await browser.newContext({ viewport });
  const errors = [];
  await context.addInitScript(({ id, work, createState }) => {
    localStorage.setItem("dashboard_auth_token", "studio-s7-token");
    localStorage.setItem("active_workspace", JSON.stringify({ id, slug: "s7", name: "S7 실구동", tier: "team" }));
    localStorage.setItem(`studio_work:${id}`, JSON.stringify(work));
    localStorage.setItem(`studio_create_state:${id}`, JSON.stringify(createState));
  }, {
    id: workspaceId,
    work: textWork(),
    createState: { primaryKind: "text", alsoKinds: [], questionIndex: 5, purpose: "공부 계획 안내", audience: "수험생", rightsConfirmed: true, topicOpen: false, candidates: [structureCandidate], selected: "A", quickStructure: { label: "A", title: "문제 제시형", outline: structureCandidate.format.outline }, topic: "수능 100일 공부 계획" },
  });
  await installRoutes(context, () => plainDeck());
  const page = await context.newPage();
  page.on("pageerror", (error) => errors.push(error.message));
  page.on("console", (message) => { if (message.type() === "error") errors.push(message.text()); });
  await page.goto(`${baseUrl}/studio?room=create&kind=text`, { waitUntil: "networkidle", timeout: 60_000 });
  try {
    await page.locator("[data-text-candidate-picker]").waitFor({ state: "visible" });
  } catch (error) {
    throw new Error(`글 후보 비교 화면을 찾지 못했습니다. 화면=${(await page.locator("body").innerText()).slice(0, 1200)} 오류=${errors.join(" | ")} 원인=${error instanceof Error ? error.message : String(error)}`);
  }
  await page.locator('[data-text-candidate-tab="number"]').click();
  await page.locator('[data-text-candidate-preview="number"]').getByRole("button", { name: "이 후보로" }).click();
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
  const initial = plainDeck();
  let latestDeck = structuredClone(initial);
  let latestTemplateState = null;
  const context = await browser.newContext({ viewport });
  const errors = [];
  await context.addInitScript(({ id, work }) => {
    localStorage.setItem("dashboard_auth_token", "studio-s7-token");
    localStorage.setItem("active_workspace", JSON.stringify({ id, slug: "s7", name: "S7 실구동", tier: "team" }));
    localStorage.setItem(`studio_work:${id}`, JSON.stringify(work));
  }, { id: workspaceId, work: cardWork(initial) });
  await installRoutes(context, () => latestDeck, () => latestTemplateState);
  const page = await context.newPage();
  page.on("pageerror", (error) => errors.push(error.message));
  page.on("console", (message) => { if (message.type() === "error") errors.push(message.text()); });
  await page.goto(`${baseUrl}/studio?room=edit&kind=card`, { waitUntil: "networkidle", timeout: 60_000 });
  await page.locator("[data-card-canvas-editor]").waitFor({ state: "visible" });

  await page.locator('[data-card-template="headline_cover"]').click();
  await page.getByRole("button", { name: "이 템플릿으로 바꾸기" }).click();
  await page.waitForFunction((id) => JSON.parse(localStorage.getItem(`studio_work:${id}`) || "{}").cardDeckV3?.slides?.[0]?.elements?.[0]?.x === 96, workspaceId);
  latestDeck = await page.evaluate((id) => JSON.parse(localStorage.getItem(`studio_work:${id}`) || "{}").cardDeckV3, workspaceId);
  if (latestDeck.slides[0].elements[0].id !== "el_s7_cover" || latestDeck.slides[0].elements[0].x !== 96) throw new Error("전체 템플릿이 요소 ID를 보존해 적용되지 않았습니다");
  await page.getByRole("button", { name: "실행 취소" }).click();
  await page.waitForFunction((id) => JSON.parse(localStorage.getItem(`studio_work:${id}`) || "{}").cardDeckV3?.slides?.[0]?.elements?.[0]?.x === 100, workspaceId);
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
    () => posts.slice(postStart).some((post) => post.cardDeckV3?.slides?.[0]?.elements?.[0]?.x === 72
      && JSON.stringify(post.cardDeckV3.slides[1]) === JSON.stringify(oneSlide.slides[1])),
    15_000,
    "템플릿 최종 덱이 실제 초안 저장 API까지 왕복하지 않았습니다",
  );
  const persisted = posts.slice(postStart).findLast((post) => post.cardTemplateState?.activeTemplateId === "photo_band");
  if (!persisted?.cardTemplateState?.previousTemplate?.deck) throw new Error("템플릿 ID와 복원용 직전 상태가 초안 저장 API에 함께 영속되지 않았습니다");
  latestDeck = structuredClone(persisted.cardDeckV3);
  latestTemplateState = structuredClone(persisted.cardTemplateState);
  await page.reload({ waitUntil: "networkidle", timeout: 60_000 });
  await page.locator("[data-card-canvas-editor]").waitFor({ state: "visible" });
  await page.getByRole("button", { name: /이전 템플릿\(큰 제목 표지형\)으로/ }).waitFor({ state: "visible" });

  const dimensions = await noHorizontalOverflow(page, `카드 템플릿 ${viewport.width}`);
  if (await page.locator("[data-card-stage]").count() < 1) throw new Error("데이터가 있는 카드 작업대가 열리지 않았습니다");
  if (errors.length) throw new Error(`카드 템플릿 콘솔 오류: ${errors.join(" | ")}`);
  await context.close();
  return { viewport: viewport.width, dimensions, slideCount: oneSlide.slides.length };
}

const browser = await chromium.launch({ headless: true });
try {
  const results = [];
  results.push(await runCreateCardFlow(browser));
  results.push(await runTextFlow(browser, { width: 1440, height: 1000 }));
  results.push(await runCardFlow(browser, { width: 1440, height: 1000 }));
  results.push(await runCardFlow(browser, { width: 1024, height: 900 }));
  results.push(await runCardFlow(browser, { width: 390, height: 844 }));
  process.stdout.write(`${JSON.stringify({ ok: true, results, posts: posts.length, consoleErrors: 0 }, null, 2)}\n`);
} finally {
  await browser.close();
}
