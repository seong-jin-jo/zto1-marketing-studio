#!/usr/bin/env node

import playwright from "/Users/sj/kimstudy-auto/node_modules/playwright-core/index.js";

const { chromium } = playwright;
const baseUrl = process.env.V75_BASE_URL || "http://127.0.0.1:3467";
const executablePath = process.env.V75_CHROME_PATH || "/Users/sj/Library/Caches/ms-playwright/chromium-1228/chrome-mac-x64/Google Chrome for Testing.app/Contents/MacOS/Google Chrome for Testing";
const useLiveText = process.env.V75_USE_LIVE_TEXT === "1";
const screenshotPath = process.env.V75_SCREENSHOT_PATH;
const workspaceId = "11111111-1111-4111-8111-111111111111";
const generatedText = "선택한 구조가 반영된 한국어 초안입니다. 첫 문제를 짚고, 해결 순서를 설명한 뒤, 오늘 할 행동으로 마칩니다.";
const textRequests = [];
const consoleErrors = [];

function json(route, body, status = 200) {
  return route.fulfill({ status, contentType: "application/json", body: JSON.stringify(body) });
}

const browser = await chromium.launch({ executablePath, headless: true });
const context = await browser.newContext({ viewport: { width: 1024, height: 900 } });
await context.addInitScript(({ id }) => {
  localStorage.setItem("dashboard_auth_token", "build-click-token");
  localStorage.setItem("active_workspace", JSON.stringify({ id, slug: "build-click", name: "클릭 검증 작업 공간", tier: "team" }));
}, { id: workspaceId });

const page = await context.newPage();
page.on("pageerror", (error) => consoleErrors.push(error.message));
page.on("console", (message) => {
  if (message.type() === "error") consoleErrors.push(message.text());
});

await page.route("**/api/**", async (route) => {
  const request = route.request();
  const url = new URL(request.url());
  const pathname = url.pathname;

  if (pathname === "/api/me") return json(route, { isOperator: false, tenant: { id: workspaceId, slug: "build-click", name: "클릭 검증 작업 공간", status: "active" } });
  if (pathname === "/api/channel-config") return json(route, {});
  if (pathname === "/api/studio/brand-setup") return json(route, { guide: null });
  if (pathname === "/api/studio/engine-status") return json(route, { ready: true });
  if (pathname === "/api/studio/drafts") return json(route, { drafts: [], currentWork: null });
  if (pathname === "/api/images") return json(route, { images: [] });
  if (pathname === "/api/studio/v1/generations" && request.method() === "POST") {
    return json(route, {
      data: {
        job_id: "job-v75-build",
        candidates: ["A", "B", "C"].map((label, index) => ({
          candidate_id: `candidate-${label}`,
          ordinal: index + 1,
          label,
          angle: ["problem_first", "proof_first", "process_first"][index],
          title: `${label} 구조`,
          rationale: `${label} 설명`,
          format: { content_branch: "video", preview_kind: "structured_storyboard", quality: "draft", outline: [`${label} 첫 장면`, `${label} 본문`, `${label} 마무리`] },
        })),
      },
    }, 201);
  }
  if (pathname === "/api/studio/text" && request.method() === "POST") {
    textRequests.push(JSON.parse(request.postData() || "{}"));
    if (useLiveText) return route.continue();
    return json(route, { ok: true, threads: generatedText });
  }
  return json(route, {});
});

try {
  await page.goto(`${baseUrl}/studio?room=create`, { waitUntil: "networkidle", timeout: 60_000 });
  await page.locator('[data-room="create"]').waitFor({ state: "visible" });
  const assistant = page.getByLabel("생성 담당 대화창");
  const workspace = page.locator("[data-create-workspace]");
  const chatPresent = await assistant.isVisible();
  const directGenerationButtonCount = await workspace.getByRole("button", { name: "초안 만들기", exact: true }).count();
  await workspace.getByRole("button", { name: "B 구조 사용", exact: true }).click();
  await workspace.getByLabel("초안 주제").fill("고객이 바로 이해하는 서비스 소개");

  const directBodyBefore = await page.evaluate(() => document.body.innerText.length);
  await workspace.getByRole("button", { name: "초안 만들기", exact: true }).click();
  await page.locator("[data-quick-draft-result]").waitFor({ state: "visible" });
  const directBodyAfter = await page.evaluate(() => document.body.innerText.length);
  const observedGeneratedText = await page.locator("[data-quick-draft-result]").innerText();

  const learningStatus = page.locator("button[data-learning-status]:visible").first();
  const headerLearningText = (await learningStatus.innerText()).replace(/\s+/g, " ").trim();
  const learningBodyBefore = await page.evaluate(() => document.body.innerText.length);
  await learningStatus.click();
  await page.locator("[data-learning-wizard]").waitFor({ state: "visible" });
  const learningBodyAfter = await page.evaluate(() => document.body.innerText.length);
  await page.getByRole("button", { name: "나중에 하기", exact: true }).click();

  const buttonTexts = await page.locator("button").allInnerTexts();
  const englishButtonLabels = buttonTexts
    .map((text) => text.replace(/\s+/g, " ").trim())
    .filter((text) => /[A-Za-z]{2,}/.test(text));

  if (!chatPresent) throw new Error("생성 담당 대화창이 화면에 없습니다");
  if (directGenerationButtonCount !== 1) throw new Error(`본문 직접 생성 단추가 ${directGenerationButtonCount}개입니다`);
  if (directBodyAfter === directBodyBefore) throw new Error("본문 직접 생성 클릭 전후 본문 길이가 같습니다");
  if (learningBodyAfter === learningBodyBefore) throw new Error("헤더 학습 정보 클릭 전후 본문 길이가 같습니다");
  if (textRequests.length !== 1) throw new Error(`텍스트 생성 요청이 ${textRequests.length}건입니다`);
  if (textRequests[0]?.structure?.label !== "B") throw new Error("선택한 B 구조가 생성 요청에 없습니다");
  if (!useLiveText && !observedGeneratedText.includes(generatedText)) throw new Error("결정론적 생성 결과가 화면과 다릅니다");
  if (englishButtonLabels.length !== 0) throw new Error(`영어 단추 라벨이 남았습니다: ${englishButtonLabels.join(", ")}`);
  if (consoleErrors.length !== 0) throw new Error(`브라우저 콘솔 오류가 남았습니다: ${consoleErrors.join(" | ")}`);
  if (screenshotPath) await page.screenshot({ path: screenshotPath, fullPage: true });

  const evidence = {
    directGenerationClick: {
      bodyTextLengthBefore: directBodyBefore,
      bodyTextLengthAfter: directBodyAfter,
      delta: directBodyAfter - directBodyBefore,
    },
    chatPresent,
    directGenerationButtonCount,
    headerLearningText,
    learningClick: {
      bodyTextLengthBefore: learningBodyBefore,
      bodyTextLengthAfter: learningBodyAfter,
      delta: learningBodyAfter - learningBodyBefore,
    },
    buttonTexts,
    englishButtonLabelCount: englishButtonLabels.length,
    textRequestCount: textRequests.length,
    textRequestStructure: textRequests[0].structure,
    generatedResult: observedGeneratedText,
    responseMode: useLiveText ? "실제 생성 경로" : "결정론적 build 응답",
    consoleErrorCount: consoleErrors.length,
  };
  process.stdout.write(`${JSON.stringify(evidence, null, 2)}\n`);
} finally {
  await browser.close();
}
