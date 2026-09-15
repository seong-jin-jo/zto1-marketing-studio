#!/usr/bin/env node

import fs from "node:fs";
import path from "node:path";
import playwright from "/Users/sj/kimstudy-auto/node_modules/playwright-core/index.js";
import { runCleanupSteps } from "./lib/cleanup-steps.mjs";

const { chromium } = playwright;
const baseUrl = process.env.FOUR_ROOM_BASE_URL || "http://localhost:3456";
const operatorToken = process.env.DASHBOARD_AUTH_TOKEN || "";
const workspaceId = process.env.FOUR_ROOM_WORKSPACE_ID || "cd1d0a40-540d-4524-9b49-bf2445d82182";
const outputDir = process.env.FOUR_ROOM_OUTPUT_DIR || path.resolve(process.cwd(), "../logs/diff/osmu-four-room-flow/captures");
const executablePath = process.env.FOUR_ROOM_CHROME_PATH || "/Users/sj/Library/Caches/ms-playwright/chromium-1228/chrome-mac-x64/Google Chrome for Testing.app/Contents/MacOS/Google Chrome for Testing";
const dataRoot = process.env.DATA_DIR || path.resolve(process.cwd(), "../data");
const settingsPath = path.join(dataRoot, "tenants", workspaceId, "settings.json");
const readyTimeoutMs = Number(process.env.FOUR_ROOM_READY_TIMEOUT_MS || "120000");
const totalTimeoutMs = Number(process.env.FOUR_ROOM_TOTAL_TIMEOUT_MS || "300000");

if (!operatorToken) throw new Error("DASHBOARD_AUTH_TOKEN이 필요합니다");
if (!fs.existsSync(settingsPath)) throw new Error(`첫 사용자 설정 파일이 없습니다: ${settingsPath}`);
if (!Number.isFinite(readyTimeoutMs) || readyTimeoutMs <= 0) {
  throw new Error("FOUR_ROOM_READY_TIMEOUT_MS는 0보다 큰 숫자여야 합니다");
}
if (!Number.isFinite(totalTimeoutMs) || totalTimeoutMs <= 0) throw new Error("FOUR_ROOM_TOTAL_TIMEOUT_MS는 0보다 큰 숫자여야 합니다");
const deadlineAt = Date.now() + totalTimeoutMs;
function remainingTimeout(label) {
  const remaining = deadlineAt - Date.now();
  if (remaining <= 0) throw new Error(`전체 실행시간 초과: ${label}`);
  return Math.min(readyTimeoutMs, remaining);
}

const widths = [390, 768, 1024, 1440];
// 좁은 폭(390)과 어두운 화면은 QA가 넓은 화면·밝은 화면으로만 검증하고 넘어가기 쉽다
// (2026-08-30 회장 지적: "390 폭과 어두운 화면을 아무도 안 봤다"). 테마는 라이트 기본값
// 하나만으로는 가로 넘침·잘림이 안 잡히므로, 390 폭에서는 다크 모드도 같이 돈다.
// 테마 전환은 media query가 아니라 <html data-theme> + localStorage('theme')로 이뤄진다
// (src/app/layout.tsx FOUC 스크립트, src/components/layout/ThemeToggle.tsx) — colorScheme
// 컨텍스트 옵션만으로는 실제 다크 렌더가 걸리지 않는다.
const narrowDarkWidth = 390;
const roomContracts = [
  { key: "create", label: "생성실", href: "/studio?room=create", selector: '[data-room="create"]' },
  { key: "edit", label: "편집실", href: "/studio?room=edit", selector: '[data-room="edit"]' },
  { key: "publish", label: "발행실", href: "/studio?room=publish", selector: '[data-room="publish"]' },
  { key: "performance", label: "성과실", href: "/performance", selector: '[data-room="performance"]' },
];

const request = async (pathname, options = {}) => fetch(`${baseUrl}${pathname}`, {
  ...options,
  headers: {
    authorization: `Bearer ${operatorToken}`,
    ...(options.body ? { "content-type": "application/json" } : {}),
    ...(options.headers || {}),
  },
  signal: AbortSignal.timeout(Math.max(1, Math.min(15_000, deadlineAt - Date.now()))),
});
const cleanupRequest = async (pathname, options = {}) => fetch(`${baseUrl}${pathname}`, {
  ...options,
  headers: {
    authorization: `Bearer ${operatorToken}`,
    ...(options.headers || {}),
  },
  signal: AbortSignal.timeout(60_000),
});

let issuedTokenId = "";
let browser;
let deadlineTimer;
const originalSettings = fs.readFileSync(settingsPath, "utf8");
const observations = [];
const consoleErrors = [];
const unauthorizedUrls = [];

async function closeBrowserWithin(timeoutMs) {
  if (!browser) return;
  let timeout;
  await Promise.race([
    browser.close(),
    new Promise((resolve) => {
      timeout = setTimeout(resolve, timeoutMs);
    }),
  ]);
  if (timeout) clearTimeout(timeout);
}

function firstUserSettings(raw) {
  const parsed = JSON.parse(raw);
  return JSON.stringify({ ...parsed, onboardingComplete: false }, null, 2);
}

async function sidebar(page, width) {
  if (width < 768) {
    const open = page.getByRole("button", { name: "메뉴 열기" });
    if (await open.getAttribute("aria-expanded") !== "true") await open.click();
  }
  const nav = page.getByRole("complementary", { name: "주요 사이드바" });
  await nav.waitFor({ state: "visible", timeout: remainingTimeout(`${width} 사이드바`) });
  return nav.getByRole("region", { name: "한 편의 제작 순서" });
}

async function roomFlow(page, width) {
  // v68 promotes the four-room flow into the shared top header. Keep the
  // sidebar fallback for non-studio routes and older customer shells.
  const currentPath = `${new URL(page.url()).pathname}${new URL(page.url()).search}`;
  const headerFlow = page.getByRole("navigation", { name: "작업 단계" });
  if (await headerFlow.count() && await headerFlow.isVisible()) return headerFlow;
  const flow = await sidebar(page, width);
  return flow;
}

async function clickRoom(page, width, room) {
  const currentPath = `${new URL(page.url()).pathname}${new URL(page.url()).search}`;
  if (currentPath !== room.href) {
    const flow = await roomFlow(page, width);
    const link = flow.getByRole("link", { name: new RegExp(room.label) });
    if (await link.getAttribute("href") !== room.href) {
      throw new Error(`${width} ${room.label} href가 ${room.href}가 아닙니다`);
    }
    // Next.js client navigation does not emit a new document load event. Waiting for
    // load makes a successful room transition look like a timeout. Arm the URL waiter
    // before the click so a fast client transition cannot finish between both awaits.
    await Promise.all([
      page.waitForURL((url) => `${url.pathname}${url.search}` === room.href, { waitUntil: "commit", timeout: remainingTimeout(`${width} ${room.label} 주소 이동`) }),
      link.click(),
    ]);
  }
  await page.locator(room.selector).waitFor({ state: "visible", timeout: remainingTimeout(`${width} ${room.label} 표시`) });
}

async function measureRoom(page, width, room, theme = "light") {
  const tag = `${width}/${theme} ${room.label}`;
  if (room.key === "performance") {
    await page.waitForFunction(
      () => Number(document.querySelector("[data-perf-suggestions]")?.getAttribute("data-perf-suggestions") || 0) >= 3,
      undefined,
      { timeout: remainingTimeout(`${tag} 성과 제안`) },
    );
  }
  // 상단 단계 이동 직후 방 본문만 기다리면, 사이드바 현재 위치가 이전 방에 남은 회귀를
  // 놓치고 150ms 색 전환 중간 프레임을 증거로 저장한다. 데스크톱에서는 두 길잡이가
  // 같은 방을 가리키는지 DOM 계약으로 확인한 뒤 전환이 끝난 화면을 캡처한다.
  if (width >= 768) {
    const currentSelector = 'aside section[aria-label="한 편의 제작 순서"] a[aria-current="page"]';
    await page.waitForFunction(
      ({ selector, label }) => {
        const current = [...document.querySelectorAll(selector)];
        return current.length === 1 && (current[0].textContent || "").replace(/\s+/g, "").includes(label);
      },
      { selector: currentSelector, label: room.label },
      { timeout: remainingTimeout(`${tag} 사이드바 현재 위치`) },
    );
    const sidebarCurrent = page.locator(currentSelector);
    const currentLabels = (await sidebarCurrent.allTextContents()).map((value) => value.replace(/\s+/g, ""));
    if (currentLabels.length !== 1 || !currentLabels[0].includes(room.label)) {
      throw new Error(`${tag} 사이드바 현재 위치 불일치: ${currentLabels.join(", ") || "없음"}`);
    }
    await page.waitForTimeout(200);
  }
  const metrics = await page.evaluate((roomKey) => {
    const overlay = document.querySelector('[data-onboarding-mode="modal"], .fixed.inset-0.z-50');
    const firstAction = roomKey === "create"
      ? document.querySelector('[data-empty-next="create"]')
      : roomKey === "publish"
        ? document.querySelector('[data-empty-next="publish"]')
        : roomKey === "performance"
          ? document.querySelector('[data-perf-suggestions]')
          // 편집실 빈 상태에는 목차가 없고 StateNotice의 되돌아가기 단추가 다음 행동이다.
          // 목차만 찾으면 정상적인 빈 상태를 길 잃은 화면으로 잘못 판정한다.
          : document.querySelector('[data-state="empty"] button');
    return {
      viewportWidth: window.innerWidth,
      documentWidth: document.documentElement.scrollWidth,
      fullScreenOverlay: Boolean(overlay),
      blockingNavigation: document.querySelector('[aria-label="메뉴 바깥 닫기"]') instanceof HTMLElement,
      nextActionVisible: firstAction instanceof HTMLElement && firstAction.offsetParent !== null,
      suggestionCount: Number(document.querySelector("[data-perf-suggestions]")?.getAttribute("data-perf-suggestions") || 0),
      inlineOnboarding: document.querySelector('[data-onboarding-mode="inline"]') instanceof HTMLElement,
      appliedTheme: document.documentElement.getAttribute("data-theme"),
      bodyBackground: getComputedStyle(document.body).backgroundColor,
    };
  }, room.key);
  if (metrics.documentWidth > width + 1) throw new Error(`${tag} 가로 넘침 ${metrics.documentWidth}/${width}`);
  if (metrics.fullScreenOverlay) throw new Error(`${tag} 전체 화면 모달이 길을 막습니다`);
  if (metrics.blockingNavigation) throw new Error(`${tag} 이동 뒤 탐색 메뉴가 화면을 가립니다`);
  if (!metrics.nextActionVisible) throw new Error(`${tag} 다음 행동이 보이지 않습니다`);
  if (room.key === "performance" && metrics.suggestionCount < 3) throw new Error(`${tag} 방향 제안이 ${metrics.suggestionCount}건입니다`);
  if (metrics.appliedTheme !== theme) throw new Error(`${tag} 테마가 적용 안 됨: data-theme=${metrics.appliedTheme} (기대 ${theme})`);
  observations.push({ width, theme, room: room.key, path: new URL(page.url()).pathname + new URL(page.url()).search, ...metrics });
  // QA 증거는 원본 프로토타입을 덮지 않고 logs/diff에 둔다. 비교할 때
  // viewport 밖의 세로 길이가 섞이지 않도록 사용자가 보는 화면만 캡처한다.
  await page.screenshot({ path: path.join(outputDir, `${width}-${theme}-${room.key}.png`), fullPage: false, timeout: remainingTimeout(`${tag} 캡처`) });
}

try {
  deadlineTimer = setTimeout(() => { void closeBrowserWithin(1000); }, totalTimeoutMs);
  const issued = await request("/api/tenant-tokens", {
    method: "POST",
    body: JSON.stringify({ tenant_id: workspaceId, label: `qa-four-room-${Date.now()}` }),
  });
  const issuedBody = await issued.json();
  if (!issued.ok || !issuedBody.token || !issuedBody.id) throw new Error(`고객 토큰 발급 실패: HTTP ${issued.status}`);
  issuedTokenId = issuedBody.id;

  fs.writeFileSync(settingsPath, firstUserSettings(originalSettings));
  fs.mkdirSync(outputDir, { recursive: true });

  browser = await chromium.launch({ executablePath, headless: true, timeout: remainingTimeout("브라우저 시작") });
  for (const width of widths) {
    // 390 폭은 라이트+다크 둘 다, 그 외 폭은 라이트만(마찰 대비 최소 범위 확대).
    const themes = width === narrowDarkWidth ? ["light", "dark"] : ["light"];
    for (const theme of themes) {
      const context = await browser.newContext({ viewport: { width, height: width === 390 ? 844 : width === 768 ? 1024 : 1200 } });
      await context.addInitScript(({ token, workspace, mode }) => {
        localStorage.setItem("dashboard_auth_token", token);
        localStorage.setItem("dashboard_auth_identity_kind", "customer");
        localStorage.setItem("active_workspace", JSON.stringify({ id: workspace, slug: "qa-four-room", name: "네 방 검증 작업 공간", tier: "team" }));
        localStorage.setItem("theme", mode);
      }, { token: issuedBody.token, workspace: workspaceId, mode: theme });
      const page = await context.newPage();
      const tag = `${width}/${theme}`;
      page.on("pageerror", (error) => consoleErrors.push(`${tag}: ${error.message}`));
      page.on("console", (message) => { if (message.type() === "error") consoleErrors.push(`${tag}: ${message.text()}`); });
      page.on("response", (response) => { if (response.status() === 401) unauthorizedUrls.push(`${tag}: ${response.url()}`); });

      // Next dev keeps HMR and background requests alive. The room locator below is the
      // user-visible readiness signal; networkidle can misclassify a rendered page as a timeout.
      await page.goto(`${baseUrl}/studio?room=create`, { waitUntil: "domcontentloaded", timeout: remainingTimeout(`${tag} 생성실 진입`) });
      for (const room of roomContracts) {
        console.log(`검증 ${tag} ${room.label}`);
        await clickRoom(page, width, room);
        await measureRoom(page, width, room, theme);
      }

      await clickRoom(page, width, roomContracts[0]);
      if (!await page.locator('[data-room="create"]').isVisible()) throw new Error(`${tag} 성과실에서 생성실로 돌아가지 못했습니다`);
      observations.push({ width, theme, room: "performance-to-create", path: new URL(page.url()).pathname + new URL(page.url()).search, navigated: true });
      await context.close();
    }
  }

  if (consoleErrors.length) throw new Error(`브라우저 콘솔 오류 ${consoleErrors.length}건: ${consoleErrors.slice(0, 3).join(" | ")}`);
  if (unauthorizedUrls.length) throw new Error(`브라우저 401 ${unauthorizedUrls.length}건: ${unauthorizedUrls.slice(0, 3).join(" | ")}`);
  fs.writeFileSync(path.join(outputDir, "observations.json"), JSON.stringify({ workspaceId, widths, readyTimeoutMs, observations, consoleErrors, unauthorizedUrls }, null, 2));
  const totalRuns = observations.filter((entry) => entry.room !== "performance-to-create").length;
  console.log(`PASS 네 방 ${roomContracts.length}개 x ${widths.length}폭(390은 라이트+다크), 총 ${totalRuns}회 측정`);
  console.log(`PASS 가로 넘침 0px, 전체 화면 모달 0건, 브라우저 401 0건, 콘솔 오류 0건, 390 다크 테마 미적용 0건`);
  console.log(`CAPTURES ${outputDir}`);
} finally {
  if (deadlineTimer) clearTimeout(deadlineTimer);
  const cleanupFailures = await runCleanupSteps([
    {
      label: "첫 사용자 설정 복구",
      run: async () => { fs.writeFileSync(settingsPath, originalSettings); },
    },
    {
      label: "임시 고객 토큰 폐기",
      run: async () => {
        if (!issuedTokenId) return;
      const revoked = await cleanupRequest(`/api/tenant-tokens?id=${encodeURIComponent(issuedTokenId)}`, { method: "DELETE" });
        if (!revoked.ok) throw new Error(`HTTP ${revoked.status}`);
      },
    },
    {
      label: "브라우저 종료",
      run: async () => closeBrowserWithin(5000),
    },
  ]);
  if (cleanupFailures.length > 0) {
    process.exitCode = 1;
    for (const failure of cleanupFailures) {
      console.error(`${failure.label} 실패: ${failure.message}`);
    }
  }
}
