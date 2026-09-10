#!/usr/bin/env node

import fs from "node:fs";
import path from "node:path";
import playwright from "/Users/sj/kimstudy-auto/node_modules/playwright-core/index.js";

const { chromium } = playwright;
const baseUrl = process.env.FE3_BASE_URL || "http://localhost:3456";
const dashboardToken = process.env.FE3_DASHBOARD_TOKEN || "";
const studioToken = process.env.FE3_STUDIO_TOKEN || "";
const workspaceId = process.env.FE3_WORKSPACE_ID || "";
const studioWorkspaceId = process.env.FE3_STUDIO_WORKSPACE_ID || workspaceId;
const outputDir = process.env.FE3_OUTPUT_DIR || path.resolve(process.cwd(), "../docs/prototype/qa-fe6");
const executablePath = process.env.FE3_CHROME_PATH || "/Users/sj/Library/Caches/ms-playwright/chromium-1228/chrome-mac-x64/Google Chrome for Testing.app/Contents/MacOS/Google Chrome for Testing";

if (!dashboardToken || !studioToken || !workspaceId) {
  throw new Error("FE3_DASHBOARD_TOKEN, FE3_STUDIO_TOKEN, FE3_WORKSPACE_ID are required");
}
fs.mkdirSync(outputDir, { recursive: true });
let chatAlwaysAt390 = 0;
const basicFlow = [];
let chatVisibleAt390 = false;
const responsiveObservations = [];
const performanceObservations = [];
const studioRoomObservations = [];

const RESPONSIVE_ROUTES = [
  { key: "performance-room", path: "/" },
  { key: "studio-publish", path: "/studio?room=publish" },
  { key: "channel-threads", path: "/channels/threads" },
  { key: "settings", path: "/settings" },
];

const RESPONSIVE_VIEWPORTS = [
  { width: 390, height: 844 },
  { width: 768, height: 1024 },
  { width: 1024, height: 900 },
  { width: 1440, height: 1200 },
];

const browser = await chromium.launch({ executablePath, headless: true });
const context = await browser.newContext({ viewport: { width: 1440, height: 1200 } });
await context.addInitScript(({ dashboardTokenValue, studioTokenValue, workspaceIdValue, studioWorkspaceIdValue }) => {
  localStorage.setItem("dashboard_auth_token", dashboardTokenValue);
  localStorage.setItem("active_workspace", JSON.stringify({ id: workspaceIdValue, slug: "local-fe3-verification", name: "로컬 검증 작업 공간", tier: "team" }));
  localStorage.setItem("studio_work", JSON.stringify({
    idea: "1인 사업가의 콘텐츠 운영 시간 줄이기",
    text: {
      threads: "콘텐츠 운영 시간을 줄이는 세 가지 기준",
      x: "반복 업무부터 줄여야 콘텐츠가 남습니다.",
      facebook: "아이디어, 편집, 발행을 한 흐름으로 묶습니다.",
      instagram: { caption: "한 번 만들고 일곱 채널에 맞게 고칩니다.", hashtags: ["OSMU", "콘텐츠운영"], slides: ["기준 1", "기준 2", "기준 3"] },
      shorts: { hook: "매일 발행해도 시간이 남는 이유", body: "반복을 줄이고 기준을 남깁니다.", cta: "오늘 한 편부터 묶어 보세요." },
    },
    includes: { threads: true, x: true, facebook: false, instagram: true, shorts: false, reels: false, tiktok: false },
    editLines: ["첫 장면에서 문제를 짚습니다.", "둘째 장면에서 해결 순서를 보여 줍니다.", "마지막 장면에서 바로 할 일을 말합니다."],
    createBranch: "video",
    editKind: "video",
  }));
  sessionStorage.setItem("studio_generation_token", studioTokenValue);
  sessionStorage.setItem("studio_skill_version_id", "22222222-2222-4222-8222-222222222222");
  sessionStorage.setItem("studio_workspace_id", studioWorkspaceIdValue);
}, { dashboardTokenValue: dashboardToken, studioTokenValue: studioToken, workspaceIdValue: workspaceId, studioWorkspaceIdValue: studioWorkspaceId });

const page = await context.newPage();
await page.route("**/api/me", (route) => route.fulfill({
  status: 200,
  contentType: "application/json",
  body: JSON.stringify({ isOperator: false, tenant: { id: workspaceId, slug: "local-fe3-verification", name: "로컬 검증 작업 공간", status: "active" } }),
}));

const consoleErrors = [];
const unauthorizedUrls = [];
page.on("console", (message) => { if (message.type() === "error") consoleErrors.push(message.text()); });
page.on("pageerror", (error) => consoleErrors.push(error.message));
page.on("response", (response) => {
  if (response.status() === 401) unauthorizedUrls.push(response.url());
});

try {
  await page.goto(`${baseUrl}/studio?room=publish`, { waitUntil: "networkidle", timeout: 60000 });
  await page.locator('[data-room="publish"]').waitFor();
  const loginCancel = page.getByRole("button", { name: "Cancel", exact: true });
  if (await loginCancel.count()) await loginCancel.click();
  if (unauthorizedUrls.length) throw new Error(`live browser received 401: ${JSON.stringify(unauthorizedUrls)}`);

  const roomFlow = page.getByRole("region", { name: "한 편의 제작 순서" });
  for (const room of ["생성실", "편집실", "발행실", "성과실"]) {
    if (await roomFlow.getByRole("link", { name: new RegExp(room) }).count() !== 1) throw new Error(`${room} sidebar route missing`);
  }
  if (await page.getByText("Marketing Hub", { exact: true }).count()) throw new Error("legacy Marketing Hub sidebar rendered");
  await page.screenshot({ path: path.join(outputDir, "sidebar-4room-1440.png") });
  await page.setViewportSize({ width: 1024, height: 900 });
  for (const room of ["생성실", "편집실", "발행실", "성과실"]) {
    if (!await roomFlow.getByText(room, { exact: true }).isVisible()) throw new Error(`${room} label hidden in narrow sidebar`);
  }
  await page.screenshot({ path: path.join(outputDir, "sidebar-4room-1024.png") });
  await page.setViewportSize({ width: 1440, height: 1200 });

  if (await page.locator("[data-room-preview]").count() !== 7) throw new Error("seven publish previews did not render");
  if (await page.getByRole("complementary", { name: "발행 담당 대화창" }).count() !== 1) throw new Error("publish chat dock missing");
  if (await page.getByRole("complementary", { name: "발행 담당 대화창" }).getByText("발행 채널", { exact: true }).count()) throw new Error("legacy channel selector rendered in chat dock");
  if (await page.getByText("발행 이력", { exact: true }).count()) throw new Error("legacy publish history rendered");
  if (await page.getByRole("button", { name: /중지/ }).count()) throw new Error("unsupported publish stop button rendered");
  for (const label of ["임시 저장하기", "승인 인박스로 보내기", "선택한 3곳에 지금 발행", "예약 발행"]) {
    if (await page.getByRole("button", { name: label, exact: true }).count() !== 1) throw new Error(`${label} action missing`);
  }
  for (const platform of ["threads", "x", "facebook", "instagram"]) {
    const preview = page.locator(`[data-room-preview="${platform}"]`);
    if (await preview.getByRole("checkbox", { name: new RegExp("발행$") }).count() !== 1) throw new Error(`${platform} inline publish checkbox missing`);
    if (await preview.getByRole("combobox", { name: new RegExp("발행 계정$") }).count() !== 1) throw new Error(`${platform} inline account selector missing`);
  }
  await page.screenshot({ path: path.join(outputDir, "publish-room-1440.png"), fullPage: true });

  // 기본 흐름 점검: 네 방이 각각 실제 내용을 그리는지 본다(회장 2026-08-28 우선순위).
  for (const room of ["create", "edit", "publish", "perf"]) {
    await page.goto(`${baseUrl}/studio?room=${room}`, { waitUntil: "networkidle" });
    await page.waitForTimeout(900);
    basicFlow.push(await page.evaluate((roomName) => ({
      room: roomName,
      rendered: document.querySelector(`[data-room="${roomName}"]`) !== null,
      roomTop: document.querySelector(`[data-room-top="${roomName}"]`) !== null,
      outlineItems: document.querySelectorAll("[data-edit-outline] li").length,
      scriptLines: document.querySelectorAll("[data-edit-script] input, [data-edit-script] li").length,
      previews: document.querySelectorAll(".osmu-wall > *").length,
      buttons: document.querySelectorAll("main button").length,
    }), room));
  }
  await page.goto(`${baseUrl}/studio`, { waitUntil: "networkidle" });
  await page.waitForTimeout(600);
  await page.setViewportSize({ width: 390, height: 844 });
  await page.waitForTimeout(600);
  chatAlwaysAt390 = await page.locator('[data-chat-always="true"]').count();
  chatVisibleAt390 = await page.locator('[data-chat-always="true"]').isVisible();
  const mobileMenuButton = page.getByRole("button", { name: "메뉴 열기" });
  if (!await mobileMenuButton.isVisible()) throw new Error("390 mobile menu trigger missing");
  await mobileMenuButton.click();
  const mobileSidebar = page.getByRole("complementary", { name: "주요 사이드바" });
  if (!await mobileSidebar.isVisible()) throw new Error("390 navigation drawer did not open");
  for (const room of ["생성실", "편집실", "발행실", "성과실"]) {
    if (!await mobileSidebar.getByText(room, { exact: true }).isVisible()) throw new Error(`${room} missing from 390 drawer`);
  }
  if (!await mobileSidebar.getByText("지금 여기", { exact: true }).isVisible()) throw new Error("390 drawer current room marker missing");
  await mobileSidebar.getByRole("button", { name: "메뉴 닫기" }).click();
  await page.screenshot({ path: path.join(outputDir, "publish-room-390.png") });
  await page.setViewportSize({ width: 1440, height: 1200 });
  await page.waitForTimeout(400);

  await roomFlow.getByRole("link", { name: /생성실/ }).click();
  await page.locator('[data-room="create"]').waitFor();
  const createAssistant = page.getByRole("complementary", { name: "생성 담당 대화창" });
  await createAssistant.getByRole("button", { name: "영상", exact: true }).click();
  await createAssistant.getByRole("button", { name: "다음", exact: true }).click();
  await createAssistant.getByRole("button", { name: "문의 늘리기", exact: true }).click();
  await createAssistant.getByRole("button", { name: "혼자 일하는 사장", exact: true }).click();
  await createAssistant.locator("[data-create-topic-picker] button").first().click();
  await createAssistant.getByLabel("위 조건을 확인했습니다.").check();
  await createAssistant.getByRole("button", { name: "입력 내용 확인", exact: true }).click();
  const generationResponse = page.waitForResponse((response) => response.url().includes("/api/studio/v1/generations") && response.request().method() === "POST");
  await createAssistant.getByRole("button", { name: "구조 초안 3개 보기", exact: true }).click();
  const response = await generationResponse;
  if (response.status() !== 201) throw new Error(`Studio generation returned ${response.status()}`);
  await createAssistant.getByRole("button", { name: "A 구조 초안 선택" }).waitFor();
  if (await createAssistant.getByRole("button", { name: /구조 초안 선택$/ }).count() !== 3) throw new Error("Studio API candidates A, B, C did not render");
  for (const viewport of RESPONSIVE_VIEWPORTS) {
    await page.setViewportSize(viewport);
    await page.waitForTimeout(300);
    const room = page.locator('[data-room="create"]');
    const metrics = await room.evaluate((root) => {
      const workspace = root.querySelector("[data-create-workspace]");
      const chat = root.querySelector('[data-chat-always="true"]');
      return {
        viewportWidth: window.innerWidth,
        bodyScrollWidth: document.documentElement.scrollWidth,
        roomClientWidth: root.clientWidth,
        roomScrollWidth: root.scrollWidth,
        directGenerationVisible: Boolean(workspace?.querySelector("#studio-quick-topic"))
          && Array.from(workspace?.querySelectorAll("button") ?? []).some((button) => button.textContent?.trim() === "초안 만들기"),
        candidateCards: workspace?.querySelectorAll("[data-create-candidate]").length ?? -1,
        chatVisible: chat instanceof HTMLElement && chat.offsetParent !== null,
      };
    });
    if (metrics.bodyScrollWidth > metrics.viewportWidth + 1 || metrics.roomScrollWidth > metrics.roomClientWidth + 1) throw new Error(`create ${viewport.width} overflow: ${JSON.stringify(metrics)}`);
    if (!metrics.directGenerationVisible || metrics.candidateCards !== 3 || !metrics.chatVisible) throw new Error(`create ${viewport.width} dual flow contract failed: ${JSON.stringify(metrics)}`);
    studioRoomObservations.push({ room: "create", width: viewport.width, httpStatus: response.status(), ...metrics });
    await page.screenshot({ path: path.join(outputDir, `create-room-${viewport.width}.png`), fullPage: true });
  }

  await page.setViewportSize({ width: 1440, height: 1200 });
  await createAssistant.getByRole("button", { name: "A 구조 초안 선택" }).click();
  await createAssistant.getByRole("button", { name: "편집실에서 다듬기" }).click();
  await page.locator('[data-room="edit"]').waitFor();
  for (const viewport of RESPONSIVE_VIEWPORTS) {
    await page.setViewportSize(viewport);
    await page.waitForTimeout(300);
    const room = page.locator('[data-room="edit"]');
    const metrics = await room.evaluate((root) => {
      const outline = root.querySelector("[data-edit-outline]");
      const stage = root.querySelector("[data-edit-stage]");
      const script = root.querySelector("[data-edit-script]");
      const tools = root.querySelector("[data-edit-tools]");
      const outlineRect = outline?.getBoundingClientRect();
      const stageRect = stage?.getBoundingClientRect();
      const scriptRect = script?.getBoundingClientRect();
      return {
        viewportWidth: window.innerWidth,
        bodyScrollWidth: document.documentElement.scrollWidth,
        roomClientWidth: root.clientWidth,
        roomScrollWidth: root.scrollWidth,
        outlineLeftOfStage: Boolean(outlineRect && stageRect && outlineRect.left < stageRect.left),
        scriptBelowStage: Boolean(scriptRect && stageRect && scriptRect.top >= stageRect.bottom),
        toolButtons: tools?.querySelectorAll("button").length ?? -1,
        chatVisible: root.querySelector('[data-chat-dock="persistent"]') instanceof HTMLElement,
        honestPreview: root.textContent?.includes("실제 영상 렌더는 준비 중입니다.") ?? false,
      };
    });
    if (metrics.bodyScrollWidth > metrics.viewportWidth + 1 || metrics.roomScrollWidth > metrics.roomClientWidth + 1) throw new Error(`edit ${viewport.width} overflow: ${JSON.stringify(metrics)}`);
    if (!metrics.scriptBelowStage || metrics.toolButtons < 4 || !metrics.chatVisible || !metrics.honestPreview) throw new Error(`edit ${viewport.width} v63 contract failed: ${JSON.stringify(metrics)}`);
    if (viewport.width >= 768 && !metrics.outlineLeftOfStage) throw new Error(`edit ${viewport.width} outline is not left of stage`);
    studioRoomObservations.push({ room: "edit", width: viewport.width, httpStatus: 200, ...metrics });
    await page.screenshot({ path: path.join(outputDir, `edit-room-${viewport.width}.png`), fullPage: true });
  }

  await page.setViewportSize({ width: 1440, height: 1200 });
  const durationBefore = await page.locator("[data-edit-duration]").textContent();
  await page.getByRole("button", { name: "빼기" }).first().click();
  const durationAfterRemove = await page.locator("[data-edit-duration]").textContent();
  await page.getByRole("button", { name: "되살리기" }).click();
  const durationAfterRestore = await page.locator("[data-edit-duration]").textContent();
  if (durationBefore === durationAfterRemove || durationBefore !== durationAfterRestore) throw new Error(`edit remove and restore failed: ${durationBefore}/${durationAfterRemove}/${durationAfterRestore}`);
  studioRoomObservations.push({ room: "edit", interaction: "대사 빼기와 되살리기", durationBefore, durationAfterRemove, durationAfterRestore });

  if (process.env.FE3_CAPTURE_SCOPE !== "rooms") {
    for (const route of RESPONSIVE_ROUTES) {
      for (const viewport of RESPONSIVE_VIEWPORTS) {
      await page.setViewportSize(viewport);
      await page.goto(`${baseUrl}${route.path}`, { waitUntil: "networkidle", timeout: 60000 });
      const dismissOnboarding = page.getByRole("button", { name: "나중에 설정하기" });
      if (await dismissOnboarding.isVisible().catch(() => false)) {
        await dismissOnboarding.click();
      }
      await page.locator('[data-app-main="true"]').waitFor({ state: "attached" });
      await page.waitForTimeout(300);

      const metrics = await page.evaluate(() => {
        const main = document.querySelector('[data-app-main="true"]');
        const sidebar = document.querySelector('[aria-label="주요 사이드바"]');
        const rect = main?.getBoundingClientRect();
        const sidebarRect = sidebar?.getBoundingClientRect();
        const shell = main?.parentElement;
        return {
          bodyScrollWidth: document.documentElement.scrollWidth,
          viewportWidth: window.innerWidth,
          mainLeft: rect ? Math.round(rect.left) : -1,
          mainWidth: rect ? Math.round(rect.width) : 0,
          sidebarWidth: sidebarRect ? Math.round(sidebarRect.width) : 0,
          sidebarVisible: sidebar instanceof HTMLElement && getComputedStyle(sidebar).display !== "none",
          shellDisplay: shell ? getComputedStyle(shell).display : "missing",
          shellDirection: shell ? getComputedStyle(shell).flexDirection : "missing",
        };
      });

      if (metrics.bodyScrollWidth > metrics.viewportWidth + 1) {
        throw new Error(`${route.key} ${viewport.width} body overflow ${metrics.bodyScrollWidth}/${metrics.viewportWidth}`);
      }
      if (metrics.mainWidth < Math.min(320, viewport.width - 16)) {
        throw new Error(`${route.key} ${viewport.width} main width too small: ${JSON.stringify(metrics)}`);
      }
      if (viewport.width === 390) {
        if (metrics.sidebarVisible) throw new Error(`${route.key} 390 permanent sidebar still visible`);
        const trigger = page.getByRole("button", { name: "메뉴 열기" });
        if (!await trigger.isVisible()) throw new Error(`${route.key} 390 mobile trigger missing`);
        await trigger.click();
        if (!await page.getByRole("complementary", { name: "주요 사이드바" }).isVisible()) {
          throw new Error(`${route.key} 390 drawer failed to open`);
        }
        await page.getByRole("complementary", { name: "주요 사이드바" }).getByRole("button", { name: "메뉴 닫기" }).click();
      } else if (!metrics.sidebarVisible) {
        throw new Error(`${route.key} ${viewport.width} room rail hidden`);
      }

      const roomLinks = await page.locator('[aria-label="한 편의 제작 순서"] a').count();
      if (roomLinks !== 4) throw new Error(`${route.key} ${viewport.width} room links ${roomLinks}/4`);
      if (route.key === "performance-room") {
        const performanceRoom = page.locator('[data-room="performance"]');
        await performanceRoom.waitFor({ state: "visible" });
        for (const marker of [
          '[data-room-top="performance"]',
          "[data-perf-verdict]",
          "[data-perf-loop]",
          "[data-perf-comments]",
          "[data-perf-inherit]",
        ]) {
          if (await performanceRoom.locator(marker).count() !== 1) {
            throw new Error(`performance ${viewport.width} marker missing: ${marker}`);
          }
        }
        if (await performanceRoom.getByText("댓글 본문 읽기와 답글 보내기는 준비 중입니다.", { exact: true }).count()) {
          if (await performanceRoom.getByRole("textbox", { name: /답글/ }).count()) throw new Error(`performance ${viewport.width} readiness and reply textbox rendered together`);
          if (await performanceRoom.getByRole("button", { name: /답글.*보내기/ }).count()) throw new Error(`performance ${viewport.width} readiness and reply submit rendered together`);
        }
        const performanceMetrics = await performanceRoom.evaluate((root) => {
          const selectors = [
            '[data-room-top="performance"]',
            "[data-perf-verdict]",
            "[data-perf-loop]",
            "[data-perf-suggestions]",
            "[data-perf-comments]",
            "[data-perf-inherit]",
          ];
          const tops = selectors.map((selector) => {
            const element = root.querySelector(selector);
            return element instanceof HTMLElement ? Math.round(element.getBoundingClientRect().top) : -1;
          });
          return {
            clientWidth: root.clientWidth,
            scrollWidth: root.scrollWidth,
            sectionTops: tops,
            ordered: tops.every((top, index) => index === 0 || top > tops[index - 1]),
          };
        });
        if (performanceMetrics.scrollWidth > performanceMetrics.clientWidth + 1) {
          throw new Error(`performance ${viewport.width} overflow ${performanceMetrics.scrollWidth}/${performanceMetrics.clientWidth}`);
        }
        if (!performanceMetrics.ordered) {
          throw new Error(`performance ${viewport.width} flow order broken: ${JSON.stringify(performanceMetrics.sectionTops)}`);
        }
        performanceObservations.push({ width: viewport.width, ...performanceMetrics });
      }
      responsiveObservations.push({ route: route.key, width: viewport.width, ...metrics, roomLinks });
        await page.screenshot({
          path: path.join(outputDir, `${route.key}-${viewport.width}.png`),
          fullPage: route.key === "performance-room",
        });
      }
    }
  }

  fs.writeFileSync(
    path.join(outputDir, "responsive-observations.json"),
    `${JSON.stringify(responsiveObservations, null, 2)}\n`,
  );
  fs.writeFileSync(
    path.join(outputDir, "performance-observations.json"),
    `${JSON.stringify(performanceObservations, null, 2)}\n`,
  );
  fs.writeFileSync(
    path.join(outputDir, "studio-room-observations.json"),
    `${JSON.stringify(studioRoomObservations, null, 2)}\n`,
  );
  if (unauthorizedUrls.length) throw new Error(`live browser received 401: ${JSON.stringify(unauthorizedUrls)}`);
  if (consoleErrors.length) throw new Error(`browser console errors: ${JSON.stringify(consoleErrors)}`);
  process.stdout.write(`${JSON.stringify({
    sidebarRooms: 4,
    publishPreviews: 7,
    inlinePublishCheckboxes: 4,
    inlineAccountSelectors: 4,
    generationStatus: response.status(),
    candidateButtons: 3,
    publishStopButtons: 0,
    basicFlow,
    chatAlwaysAt390,
    chatVisibleAt390,
    unauthorizedUrls,
    consoleErrors,
    responsiveObservations,
    performanceObservations,
    studioRoomObservations,
  }, null, 2)}\n`);
} finally {
  await browser.close();
}
