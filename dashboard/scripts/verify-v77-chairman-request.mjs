#!/usr/bin/env node

import fs from "node:fs";
import path from "node:path";
import playwright from "/Users/sj/kimstudy-auto/node_modules/playwright-core/index.js";

const { chromium } = playwright;
const baseUrl = process.env.V77_BASE_URL || "http://127.0.0.1:3468";
const executablePath = process.env.V77_CHROME_PATH || "/Users/sj/Library/Caches/ms-playwright/chromium-1228/chrome-mac-x64/Google Chrome for Testing.app/Contents/MacOS/Google Chrome for Testing";
const workspaceId = "11111111-1111-4111-8111-111111111111";
const persistedTopic = "새로고침 뒤에도 남는 고객 질문";
const editBefore = "편집 전 글 본문";
const editAfter = "편집 뒤 반영된 글 본문";
const outputPath = path.resolve(process.cwd(), "../docs/qa/v77-click-observations.json");
const screenshotPath = process.env.V77_SCREENSHOT_PATH || "/tmp/osmu-v77-studio-click.png";
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
  const pathname = new URL(route.request().url()).pathname;
  if (pathname === "/api/me") return json(route, { isOperator: false, tenant: { id: workspaceId, slug: "build-click", name: "클릭 검증 작업 공간", status: "active" } });
  if (pathname === "/api/channel-config") return json(route, {});
  if (pathname === "/api/studio/brand-setup") return json(route, { guide: null });
  if (pathname === "/api/studio/engine-status") return json(route, { ready: true });
  if (pathname === "/api/studio/drafts") return json(route, { drafts: [], currentWork: null });
  if (pathname === "/api/studio/v1/generations") return json(route, {
    data: {
      job_id: "job-v77-click",
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
  if (pathname === "/api/studio/text") return json(route, {
    ok: true,
    threads: "고른 구조로 만든 글 후보",
    instagram: { slides: ["고른 구조로 만든 첫 카드", "고른 구조로 만든 마무리 카드"], caption: "카드뉴스 설명" },
    shorts: { hook: "고른 구조로 만든 영상 첫 문장", body: "영상 본문", cta: "영상 마무리" },
  });
  if (pathname === "/api/images") return json(route, { images: [] });
  return json(route, {});
});

try {
  await page.goto(`${baseUrl}/studio?room=create`, { waitUntil: "networkidle", timeout: 60_000 });
  await page.locator('[data-room="create"]').waitFor({ state: "visible" });

  const learningStatus = page.locator("button[data-learning-status]:visible").first();
  const headerLearningText = (await learningStatus.innerText()).replace(/\s+/g, " ").trim();
  const learningBefore = await page.evaluate(() => document.body.innerText.length);
  await learningStatus.click();
  await page.locator("[data-learning-wizard]").waitFor({ state: "visible" });
  const learningAfter = await page.evaluate(() => document.body.innerText.length);
  await page.getByRole("button", { name: "나중에 하기", exact: true }).click();

  const createAssistant = page.getByLabel("생성 담당 대화창");
  const directGenerationButtonCount = await page.locator("[data-create-workspace]").getByRole("button", { name: "초안 만들기", exact: true }).count();
  await createAssistant.getByRole("button", { name: "영상", exact: true }).click();
  await createAssistant.getByRole("button", { name: "다음", exact: true }).click();
  await createAssistant.getByRole("button", { name: "문의 늘리기", exact: true }).click();
  await createAssistant.getByRole("button", { name: "혼자 일하는 사장", exact: true }).click();
  await createAssistant.getByRole("button", { name: "직접 입력", exact: true }).click();
  await createAssistant.getByLabel("직접 입력한 주제").fill(persistedTopic);
  await createAssistant.getByRole("button", { name: "이 주제로 계속", exact: true }).click();
  await createAssistant.getByLabel("위 조건을 확인했습니다.").check();
  await createAssistant.getByRole("button", { name: "입력 내용 확인", exact: true }).click();
  await page.waitForFunction(({ id, topic }) => {
    const work = localStorage.getItem(`studio_work:${id}`) || "";
    const create = localStorage.getItem(`studio_create_state:${id}`) || "";
    return work.includes(topic) && create.includes('"primaryKind":"video"');
  }, { id: workspaceId, topic: persistedTopic });
  await page.reload({ waitUntil: "networkidle", timeout: 60_000 });
  const remainingString = (await page.getByText(persistedTopic, { exact: true }).innerText()).trim();

  await page.getByLabel("생성 담당 대화창").getByRole("button", { name: "구조 초안 3개 보기", exact: true }).click();
  const structureButton = page.getByLabel("생성 담당 대화창").getByRole("button", { name: "B 구조 초안 선택", exact: true });
  await structureButton.waitFor({ state: "visible" });
  const structureBefore = await page.evaluate(() => document.body.innerText.length);
  await structureButton.click();
  await page.locator("[data-quick-draft-result]").waitFor({ state: "visible" });
  const structureAfter = await page.evaluate(() => document.body.innerText.length);

  await page.evaluate(({ id, before }) => {
    localStorage.setItem(`studio_work:${id}`, JSON.stringify({
      idea: "편집 실측 작업물",
      text: { threads: before },
      editLines: [before],
      editKind: "text",
    }));
  }, { id: workspaceId, before: editBefore });
  await page.goto(`${baseUrl}/studio?room=edit`, { waitUntil: "networkidle", timeout: 60_000 });
  const editor = page.getByRole("textbox", { name: "글 전체" });
  const observedEditBefore = await editor.inputValue();
  await editor.fill(editAfter);
  await page.waitForFunction((expected) => document.querySelector('[aria-label="글 전체"]')?.value === expected, editAfter);
  const observedEditAfter = await editor.inputValue();

  const evidence = {
    headerLearningText,
    directGenerationButtonCount,
    learningClick: {
      bodyTextLengthBefore: learningBefore,
      bodyTextLengthAfter: learningAfter,
      delta: learningAfter - learningBefore,
    },
    structureClick: {
      bodyTextLengthBefore: structureBefore,
      bodyTextLengthAfter: structureAfter,
      delta: structureAfter - structureBefore,
    },
    reloadPersistence: { remainingString },
    textEdit: { before: observedEditBefore, after: observedEditAfter },
    consoleErrorCount: consoleErrors.length,
  };

  if (!headerLearningText.includes("학습 정보") || !headerLearningText.includes("남은")) throw new Error("헤더 학습 정보의 남은 칸 경로가 보이지 않습니다");
  if (directGenerationButtonCount !== 1) throw new Error(`본문 직접 생성 단추가 ${directGenerationButtonCount}개입니다`);
  if (evidence.learningClick.delta === 0) throw new Error("학습 정보 클릭 전후 본문 길이가 같습니다");
  if (evidence.structureClick.delta === 0) throw new Error("구조 선택 전후 본문 길이가 같습니다");
  if (remainingString !== persistedTopic) throw new Error("새로고침 뒤 생성실 입력이 남지 않았습니다");
  if (observedEditBefore !== editBefore || observedEditAfter !== editAfter) throw new Error("글 본문 편집 전후 값이 다릅니다");
  if (consoleErrors.length) throw new Error(`브라우저 콘솔 오류가 남았습니다: ${consoleErrors.join(" | ")}`);

  await page.screenshot({ path: screenshotPath, fullPage: true });
  fs.writeFileSync(outputPath, `${JSON.stringify(evidence, null, 2)}\n`);
  process.stdout.write(`${JSON.stringify(evidence, null, 2)}\n`);
} finally {
  await browser.close();
}
