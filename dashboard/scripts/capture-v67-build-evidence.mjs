#!/usr/bin/env node

import fs from "node:fs";
import path from "node:path";
import playwright from "/Users/sj/kimstudy-auto/node_modules/playwright-core/index.js";

const { chromium } = playwright;
const baseUrl = process.env.V67_BASE_URL || "http://localhost:3467";
const outputDir = process.env.V67_OUTPUT_DIR || path.resolve(process.cwd(), "../docs/qa/osmu-v67-build-evidence-20260902");
const executablePath = process.env.V67_CHROME_PATH || "/Users/sj/Library/Caches/ms-playwright/chromium-1228/chrome-mac-x64/Google Chrome for Testing.app/Contents/MacOS/Google Chrome for Testing";
const workspaceId = "11111111-1111-4111-8111-111111111111";

fs.mkdirSync(outputDir, { recursive: true });

const candidates = [
  ["A", 1, "problem_first", "반복 작업에서 먼저 줄일 일", "문제부터 짚고 해결 순서를 제시합니다."],
  ["B", 2, "proof_first", "전후 결과로 확인하는 방법", "결과 차이를 먼저 보여 주고 방법을 설명합니다."],
  ["C", 3, "process_first", "세 단계 실행 순서", "처음부터 끝까지 따라 할 순서를 제시합니다."],
].map(([label, ordinal, angle, title, rationale]) => ({
  candidate_id: `candidate-${String(label).toLowerCase()}`,
  ordinal,
  label,
  angle,
  title,
  rationale,
  format: {
    content_branch: "video",
    preview_kind: "structured_storyboard",
    quality: "draft",
    outline: ["문제를 한 문장으로 정리합니다.", "실행 순서를 보여 줍니다.", "다음 행동으로 마칩니다."],
  },
}));

function json(route, body, status = 200) {
  return route.fulfill({ status, contentType: "application/json", body: JSON.stringify(body) });
}

const browser = await chromium.launch({ executablePath, headless: true });
const context = await browser.newContext({ viewport: { width: 1024, height: 900 } });
await context.addInitScript(({ id }) => {
  localStorage.setItem("dashboard_auth_token", "build-visual-token");
  localStorage.setItem("active_workspace", JSON.stringify({ id, slug: "build-visual", name: "검증 작업 공간", tier: "team" }));
  localStorage.setItem(`studio_work:${id}`, JSON.stringify({
    idea: "반복 콘텐츠 작업 줄이기",
    text: {
      threads: "반복 작업에서 먼저 줄일 일을 찾습니다.",
      x: "반복 작업부터 줄여야 꾸준히 발행할 수 있습니다.",
      facebook: "생성, 편집, 발행을 한 흐름으로 묶습니다.",
      instagram: { caption: "한 번 만든 내용을 채널에 맞게 고칩니다.", hashtags: ["콘텐츠운영"], slides: ["문제", "실행", "결과"] },
      shorts: { hook: "반복 작업을 줄이는 기준", body: "한 흐름으로 묶습니다.", cta: "오늘 한 편부터 시작하세요." },
    },
    includes: { threads: true, x: false, facebook: false, instagram: true, shorts: false, reels: false, tiktok: false },
    editLines: ["문제를 한 문장으로 정리합니다.", "실행 순서를 보여 줍니다.", "다음 행동으로 마칩니다."],
    editKind: "text",
    editFormat: { kind: "text" },
  }));
  sessionStorage.setItem("studio_generation_token", "build-visual-studio-token");
}, { id: workspaceId });

const page = await context.newPage();
const consoleErrors = [];
const observations = [];
const publishRequests = [];

page.on("pageerror", (error) => consoleErrors.push(error.message));
page.on("console", (message) => {
  if (message.type() === "error") consoleErrors.push(message.text());
});

await page.route("**/api/**", async (route) => {
  const request = route.request();
  const url = new URL(request.url());
  const pathname = url.pathname;

  if (pathname === "/api/me") return json(route, { isOperator: false, tenant: { id: workspaceId, slug: "build-visual", name: "검증 작업 공간", status: "active" } });
  if (pathname === "/api/overview") return json(route, { statusCounts: {}, followers: 120, weekDelta: 8, viralPosts: [], summary: { published: 2, engagementRate: 3.4 } });
  if (pathname === "/api/usage") return json(route, { today: {}, thisWeek: {}, tier: "team", quota: {} });
  if (pathname === "/api/onboarding") return json(route, { completed: true });
  if (pathname === "/api/metrics") return json(route, request.method() === "POST" ? { ok: true } : { posts: [] });
  if (pathname === "/api/channel-config") return json(route, { threads: { connected: true }, instagram: { connected: true } });
  if (pathname === "/api/connect/readiness") {
    return json(route, { providers: { threads: { available: true, connected: false, status: "not_connected", reason: null, guidance: null } } });
  }
  if (pathname === "/api/connect/threads") return json(route, { authUrl: `${baseUrl}/oauth-build-fixture` });
  if (pathname === "/api/studio/brand-setup") return json(route, { guide: null });
  if (pathname === "/api/studio/engine-status") return json(route, { ready: true });
  if (pathname === "/api/publish/first-comment-capabilities") {
    return json(route, { capabilities: [
      { platform: "threads", supported: true, reason: null },
      { platform: "x", supported: true, reason: null },
      { platform: "facebook", supported: true, reason: null },
      { platform: "instagram", supported: true, reason: null },
      { platform: "shorts", supported: false, reason: "현재 첫 댓글 발행을 지원하지 않습니다." },
      { platform: "reels", supported: false, reason: "현재 첫 댓글 발행을 지원하지 않습니다." },
      { platform: "tiktok", supported: false, reason: "현재 첫 댓글 발행을 지원하지 않습니다." },
    ] });
  }
  if (/^\/api\/channels\/[^/]+\/accounts$/.test(pathname)) {
    const platform = pathname.split("/")[3];
    return json(route, { accounts: [{ id: `${platform}-account`, display_name: "연결 계정", username: null, is_default: true }] });
  }
  if (pathname === "/api/studio/drafts") {
    return json(route, request.method() === "POST" ? { ok: true, id: "draft-v67-build" } : { drafts: [], currentWork: null });
  }
  if (pathname === "/api/studio/v1/generations" && request.method() === "POST") {
    return json(route, { data: { job_id: "generation-v67-build", candidates } }, 201);
  }
  if (pathname === "/api/publish" && request.method() === "POST") {
    publishRequests.push(JSON.parse(request.postData() || "{}"));
    return json(route, { ok: true, permalink: "https://example.invalid/post/build-evidence" });
  }
  if (pathname === "/api/queue") return json(route, { posts: [] });
  if (pathname === "/api/images") return json(route, { images: [] });
  return json(route, {});
});

async function captureRoom(room, width) {
  await page.setViewportSize({ width, height: width === 390 ? 844 : 900 });
  const root = page.locator(`[data-room="${room}"]`);
  await root.waitFor({ state: "visible" });
  let focusContract = null;
  if (room === "publish") {
    const allFilter = root.getByTestId("publish-focus-all");
    await allFilter.click();
    await root.locator("[data-room-preview]").first().waitFor({ state: "visible" });
    if (await root.locator("[data-room-preview]").count() !== 7) throw new Error(`${width} 전체 보기 카드가 일곱 장이 아닙니다`);

    const preservedValue = `필터 왕복 보존 본문 ${width}`;
    const threadsCaption = root.getByRole("textbox", { name: "threads 캡션" });
    await threadsCaption.fill(preservedValue);
    const selectedBefore = await root.getByRole("checkbox", { name: "Threads 발행" }).isChecked();

    await root.getByTestId("publish-focus-x").click();
    const focusedCards = root.locator("[data-room-preview]");
    if (await focusedCards.count() !== 1 || await focusedCards.first().getAttribute("data-room-preview") !== "x") {
      throw new Error(`${width} X 집중 보기가 한 장으로 좁혀지지 않았습니다`);
    }
    await page.screenshot({ path: path.join(outputDir, `publish-x-focus-${width}.png`), fullPage: true });

    await root.getByTestId("publish-focus-threads").click();
    const selectedAfter = await root.getByRole("checkbox", { name: "Threads 발행" }).isChecked();
    if (await threadsCaption.inputValue() !== preservedValue || selectedAfter !== selectedBefore) {
      throw new Error(`${width} 필터 왕복에서 본문 또는 발행 대상 선택이 바뀌었습니다`);
    }

    await allFilter.click();
    if (await root.locator("[data-room-preview]").count() !== 7) throw new Error(`${width} 전체 복귀 카드가 일곱 장이 아닙니다`);
    focusContract = {
      chipCount: await root.locator("[data-platform-filter] button").count(),
      allPreviewCount: 7,
      focusedPreviewCount: 1,
      inputPreserved: true,
      selectionPreserved: true,
    };
  }
  const metrics = await root.evaluate((element) => ({
    viewportWidth: window.innerWidth,
    documentWidth: document.documentElement.scrollWidth,
    roomWidth: element.clientWidth,
    roomScrollWidth: element.scrollWidth,
    accountStates: Array.from(element.querySelectorAll("[data-account-state]")).map((node) => node.getAttribute("data-account-state")),
    displayNameInputs: element.querySelectorAll('[aria-label$="표시 이름"]').length,
  }));
  if (metrics.documentWidth > width + 1 || metrics.roomScrollWidth > metrics.roomWidth + 1) {
    throw new Error(`${room} ${width} 가로 넘침: ${JSON.stringify(metrics)}`);
  }
  observations.push({ room, width, ...metrics, focusContract });
  await page.screenshot({ path: path.join(outputDir, `${room}-${width}.png`), fullPage: true });
}

try {
  await page.goto(`${baseUrl}/channels/threads`, { waitUntil: "networkidle", timeout: 60_000 });
  const connectButton = page.getByTestId("connect-threads");
  await connectButton.waitFor({ state: "visible" });
  if (!(await connectButton.isEnabled())) throw new Error("Threads OAuth 연결 단추가 활성 상태가 아닙니다");
  const popupPromise = context.waitForEvent("page");
  await connectButton.click();
  const popup = await popupPromise;
  await page.evaluate(() => {
    window.dispatchEvent(new MessageEvent("message", {
      origin: window.location.origin,
      data: { source: "osmu-oauth-connect", provider: "threads", ok: true },
    }));
  });
  await page.getByText(/Threads 연결 완료/).waitFor();
  observations.push({ room: "connection", provider: "threads", buttonActive: true, callbackObserved: true });
  await popup.close();

  await page.goto(`${baseUrl}/studio?room=create`, { waitUntil: "networkidle", timeout: 60_000 });
  await page.locator('[data-room="create"]').waitFor();
  const kindPicker = page.locator("[data-create-kind-picker]");
  await kindPicker.getByRole("button", { name: "영상", exact: true }).click();
  await kindPicker.getByRole("button", { name: "다음", exact: true }).click();
  await page.locator("[data-create-purpose-picker] button").first().click();
  await page.locator("[data-create-audience-picker] button").first().click();
  await page.locator("[data-create-topic-picker] button").first().click();
  await page.getByLabel("위 조건을 확인했습니다.").check();
  await page.getByRole("button", { name: "입력 내용 확인", exact: true }).click();
  await page.getByRole("button", { name: "구조 초안 3개 보기", exact: true }).click();
  await page.getByRole("button", { name: "A 구조 초안 선택", exact: true }).waitFor();
  await page.getByRole("button", { name: "A 구조 초안 선택", exact: true }).click();
  await page.getByRole("button", { name: "선택한 구조 초안을 편집실에서 보기", exact: true }).click();

  await captureRoom("edit", 1024);
  await captureRoom("edit", 390);
  await page.getByRole("button", { name: "발행실로 이동" }).click();

  await captureRoom("publish", 1024);
  await captureRoom("publish", 390);
  const connectedStates = await page.locator('[data-room="publish"] [data-account-state="connected"]').count();
  if (connectedStates !== 4) throw new Error(`연결 계정 읽기 전용 상태가 4곳이 아닙니다: ${connectedStates}`);
  if (await page.locator('[data-room="publish"] [aria-label$="표시 이름"]').count()) throw new Error("표시 이름 편집기가 남아 있습니다");

  await page.getByRole("button", { name: /선택한 [0-9]+곳에 지금 발행/ }).click();
  await page.locator('[data-room="publish"]').getByText("발행 완료", { exact: true }).waitFor();
  await page.goto(`${baseUrl}/`, { waitUntil: "networkidle", timeout: 60_000 });
  await page.locator('[data-room="performance"]').waitFor();
  observations.push({ room: "performance", width: 390, rendered: true });

  if (publishRequests.length !== 2) throw new Error(`선택한 두 계정 발행 요청이 ${publishRequests.length}건입니다`);
  if (consoleErrors.length) throw new Error(`브라우저 콘솔 오류 ${consoleErrors.length}건: ${consoleErrors.slice(0, 3).join(" | ")}`);

  const report = {
    stamp: {
      createdAt: new Date().toISOString(),
      model: "gpt-5.6",
      agent: "code-builder",
      skill: "qa",
      source: "OSMU v67 pinned candidate and current Next.js render",
      concern: "외부 플랫폼 대신 결정론적 API fixture를 사용한 build 단계 화면 증거다.",
    },
    observations,
    publishRequestCount: publishRequests.length,
    consoleErrors,
  };
  fs.writeFileSync(path.join(outputDir, "observations.json"), JSON.stringify(report, null, 2));
  process.stdout.write(`${JSON.stringify(report, null, 2)}\n`);
} finally {
  await browser.close();
}
