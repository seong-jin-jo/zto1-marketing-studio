#!/usr/bin/env node

import fs from "node:fs";
import path from "node:path";
import { chromium } from "playwright-core";
import sharp from "sharp";

const baseUrl = process.env.STUDIO_V70_BASE_URL || "http://127.0.0.1:3470";
const outputDir = process.env.STUDIO_V70_OUTPUT_DIR || path.resolve(process.cwd(), "../docs/qa/studio-v70-screen-conformance-20260928");
const referenceRoot = process.env.STUDIO_V70_REFERENCE_ROOT || "/Users/sj/sj_code_master/zto1-marketing-studio/docs/design/clean-frames";
const workspaceId = "11111111-1111-4111-8111-111111111111";
const viewports = [
  { width: 1440, height: 900 },
  { width: 1024, height: 820 },
  { width: 390, height: 844 },
];
const lines = ["첫 장에서 문제를 짚습니다", "두 번째 장에서 원인을 설명합니다", "마지막 장에서 다음 행동을 제안합니다"];
const images = ["/qa/alignment-card-1.jpg", "/qa/alignment-card-2.jpg", "/qa/alignment-card-3.jpg"];

fs.mkdirSync(outputDir, { recursive: true });

function json(route, body, status = 200) {
  return route.fulfill({ status, contentType: "application/json", body: JSON.stringify(body) });
}

function work(kind) {
  return {
    idea: "v70 화면 정합 검증",
    text: {
      threads: "화면이 실제 시안대로 보이는지 확인합니다.",
      x: "가".repeat(281),
      facebook: "발행실 계정과 미디어 상태를 한눈에 확인합니다.",
      instagram: { caption: "카드뉴스 캡션", hashtags: ["화면검수"], slides: lines },
      shorts: { hook: "영상 화면 검수", body: "미디어가 없으면 발행할 수 없습니다.", cta: "생성실에서 먼저 만드세요." },
    },
    img: { url: images[0], file: images[0], imageUrls: images, topicKey: "v70-screen", aspectRatio: "4:5" },
    vid: null,
    includes: { threads: true, x: true, facebook: true, instagram: true, shorts: true, reels: true, tiktok: true },
    editLines: lines,
    editKind: kind,
    editFormat: kind === "card" ? { kind: "card", aspectRatio: "4:5", background: "화이트", subtitleSize: "보통" } : { kind: "video", aspectRatio: "9:16", playbackSpeed: "1x", subtitleSize: "보통", voice: "기본" },
  };
}

function overlaps(a, b) {
  return Math.min(a.right, b.right) - Math.max(a.left, b.left) > 0.5
    && Math.min(a.bottom, b.bottom) - Math.max(a.top, b.top) > 0.5;
}

async function assertNoOverflow(page, scopeSelector, label) {
  const result = await page.locator(scopeSelector).evaluate((scope) => ({
    viewport: document.documentElement.clientWidth,
    documentScroll: document.documentElement.scrollWidth,
    scopeClient: scope.clientWidth,
    scopeScroll: scope.scrollWidth,
  }));
  if (result.documentScroll > result.viewport + 1 || result.scopeScroll > result.scopeClient + 1) {
    throw new Error(`${label} 좌우 넘침: ${JSON.stringify(result)}`);
  }
  return result;
}

async function assertDirectChildrenDoNotOverlap(locator, label) {
  const collision = await locator.evaluate((root) => {
    const visible = Array.from(root.children).filter((node) => {
      const style = getComputedStyle(node);
      const rect = node.getBoundingClientRect();
      return style.display !== "none" && style.visibility !== "hidden" && rect.width > 0 && rect.height > 0;
    });
    for (let i = 0; i < visible.length; i += 1) {
      for (let j = i + 1; j < visible.length; j += 1) {
        const a = visible[i].getBoundingClientRect();
        const b = visible[j].getBoundingClientRect();
        if (Math.min(a.right, b.right) - Math.max(a.left, b.left) > 0.5
          && Math.min(a.bottom, b.bottom) - Math.max(a.top, b.top) > 0.5) {
          return { a: visible[i].textContent, b: visible[j].textContent };
        }
      }
    }
    return null;
  });
  if (collision) throw new Error(`${label} 요소 겹침: ${JSON.stringify(collision)}`);
}

async function assertPublishAccountRows(room, viewportWidth) {
  const platforms = ["threads", "x", "instagram", "facebook", "shorts", "reels", "tiktok"];
  const rows = await Promise.all(platforms.map(async (platform) => {
    const card = room.locator(`[data-room-preview="${platform}"]`);
    const row = card.locator('[data-publish-header-row="primary"]');
    const chip = card.locator(`[data-testid="publish-account-label-${platform}"]`);
    const [cardRect, rowRect, chipGeometry] = await Promise.all([
      card.boundingBox(),
      row.boundingBox(),
      chip.evaluate((node) => {
        const style = getComputedStyle(node);
        return {
          clientWidth: node.clientWidth,
          scrollWidth: node.scrollWidth,
          overflowX: style.overflowX,
          textOverflow: style.textOverflow,
          whiteSpace: style.whiteSpace,
          title: node.getAttribute("title"),
          text: node.textContent?.trim() || "",
        };
      }),
    ]);
    if (!cardRect || !rowRect) throw new Error(`${platform} 계정 행 좌표를 측정하지 못했습니다`);
    const fits = chipGeometry.scrollWidth <= chipGeometry.clientWidth + 1;
    const ellipsizes = chipGeometry.textOverflow === "ellipsis"
      && chipGeometry.overflowX === "hidden"
      && chipGeometry.whiteSpace === "nowrap";
    if (!fits && !ellipsizes) {
      throw new Error(`${platform} 계정 칩이 말줄임 없이 잘립니다: ${JSON.stringify(chipGeometry)}`);
    }
    if (!chipGeometry.title || chipGeometry.title !== chipGeometry.text) {
      throw new Error(`${platform} 계정 칩 title이 전체 핸들을 보존하지 않습니다: ${JSON.stringify(chipGeometry)}`);
    }
    return { platform, relativeTop: rowRect.y - cardRect.y, chipGeometry };
  }));
  const tops = rows.map((row) => row.relativeTop);
  const delta = Math.max(...tops) - Math.min(...tops);
  if (delta > 2) throw new Error(`${viewportWidth} 계정 행 top 편차 ${delta}px: ${JSON.stringify(rows)}`);
  return { delta, rows };
}

async function assertVideoCoverRows(room, viewportWidth) {
  const platforms = ["shorts", "reels", "tiktok"];
  const rows = await Promise.all(platforms.map(async (platform) => {
    const card = room.locator(`[data-room-preview="${platform}"]`);
    const primary = card.locator('[data-publish-header-row="primary"]');
    const cover = card.locator('[data-publish-header-row="cover"]');
    const [cardRect, primaryRect, coverRect] = await Promise.all([
      card.boundingBox(),
      primary.boundingBox(),
      cover.boundingBox(),
    ]);
    if (!cardRect || !primaryRect || !coverRect) {
      throw new Error(`${platform} 표지 행 좌표를 측정하지 못했습니다`);
    }
    const gap = coverRect.y - (primaryRect.y + primaryRect.height);
    if (gap < 0) throw new Error(`${platform} 표지 행이 계정 행과 ${Math.abs(gap)}px 겹칩니다`);
    await assertDirectChildrenDoNotOverlap(cover, `${platform} 표지행 ${viewportWidth}`);
    return {
      platform,
      relativeTop: coverRect.y - cardRect.y,
      height: coverRect.height,
      gap,
    };
  }));
  const topDelta = Math.max(...rows.map((row) => row.relativeTop)) - Math.min(...rows.map((row) => row.relativeTop));
  const heightDelta = Math.max(...rows.map((row) => row.height)) - Math.min(...rows.map((row) => row.height));
  const gapDelta = Math.max(...rows.map((row) => row.gap)) - Math.min(...rows.map((row) => row.gap));
  if (topDelta > 2 || heightDelta > 2 || gapDelta > 2) {
    throw new Error(`${viewportWidth} 영상 표지 행 정렬 편차: ${JSON.stringify({ topDelta, heightDelta, gapDelta, rows })}`);
  }
  return { topDelta, heightDelta, gapDelta, rows };
}

async function assertVisibleEditorControlsDoNotOverlap(locator, label) {
  const collision = await locator.evaluate((root) => {
    const candidates = Array.from(new Set(root.querySelectorAll([
      "button",
      "input",
      "textarea",
      "select",
      "[data-card-thumbnail]",
    ].join(","))));
    const visible = candidates.filter((node) => {
      const style = getComputedStyle(node);
      const rect = node.getBoundingClientRect();
      return style.display !== "none"
        && style.visibility !== "hidden"
        && Number(style.opacity) > 0
        && rect.width > 0
        && rect.height > 0;
    });
    const describe = (node) => ({
      tag: node.tagName.toLowerCase(),
      label: node.getAttribute("aria-label") || node.textContent?.trim().replace(/\s+/g, " ").slice(0, 80) || "",
      thumbnail: node.getAttribute("data-card-thumbnail"),
    });
    for (let i = 0; i < visible.length; i += 1) {
      for (let j = i + 1; j < visible.length; j += 1) {
        const first = visible[i];
        const second = visible[j];
        if (first.contains(second) || second.contains(first)) continue;
        const a = first.getBoundingClientRect();
        const b = second.getBoundingClientRect();
        const width = Math.min(a.right, b.right) - Math.max(a.left, b.left);
        const height = Math.min(a.bottom, b.bottom) - Math.max(a.top, b.top);
        if (width > 0.5 && height > 0.5) {
          return {
            first: describe(first),
            second: describe(second),
            intersectionArea: Math.round(width * height),
          };
        }
      }
    }
    return null;
  });
  if (collision) throw new Error(`${label} 보이는 조작 요소 겹침: ${JSON.stringify(collision)}`);
}

async function makeComparison(referencePath, actualPath, outputPath) {
  if (!fs.existsSync(referencePath)) throw new Error(`비교 원본 없음: ${referencePath}`);
  const [referenceMeta, actualMeta] = await Promise.all([sharp(referencePath).metadata(), sharp(actualPath).metadata()]);
  const referenceWidth = referenceMeta.width || 1;
  const actualWidth = actualMeta.width || 1;
  const referenceHeight = referenceMeta.height || 1;
  const actualHeight = actualMeta.height || 1;
  const labelHeight = 44;
  const canvasWidth = referenceWidth + actualWidth;
  const canvasHeight = Math.max(referenceHeight, actualHeight) + labelHeight;
  const label = Buffer.from(`<svg width="${canvasWidth}" height="${labelHeight}"><rect width="100%" height="100%" fill="#111827"/><text x="20" y="29" fill="white" font-family="Arial" font-size="18" font-weight="700">REFERENCE</text><text x="${referenceWidth + 20}" y="29" fill="white" font-family="Arial" font-size="18" font-weight="700">IMPLEMENTATION</text></svg>`);
  await sharp({ create: { width: canvasWidth, height: canvasHeight, channels: 4, background: "#e5e7eb" } })
    .composite([
      { input: label, left: 0, top: 0 },
      { input: referencePath, left: 0, top: labelHeight },
      { input: actualPath, left: referenceWidth, top: labelHeight },
    ])
    .png()
    .toFile(outputPath);
}

const browser = await chromium.launch({ headless: true });
const context = await browser.newContext({ viewport: viewports[0] });
await context.addInitScript(({ id, initial }) => {
  localStorage.setItem("dashboard_auth_token", "studio-v70-screen-token");
  localStorage.setItem("active_workspace", JSON.stringify({ id, slug: "studio-v70-screen", name: "화면 검증 작업 공간", tier: "team" }));
  localStorage.setItem(`studio_work:${id}`, JSON.stringify(initial));
}, { id: workspaceId, initial: work("card") });

const page = await context.newPage();
const consoleErrors = [];
const observations = [];
page.on("pageerror", (error) => consoleErrors.push(error.message));
page.on("console", (message) => { if (message.type() === "error") consoleErrors.push(message.text()); });

await page.route("**/api/**", async (route) => {
  const request = route.request();
  const pathname = new URL(request.url()).pathname;
  if (pathname === "/api/me") return json(route, { isOperator: false, tenant: { id: workspaceId, slug: "studio-v70-screen", name: "화면 검증 작업 공간", status: "active" } });
  if (pathname === "/api/overview") return json(route, { statusCounts: {}, followers: 0, weekDelta: 0, viralPosts: [], summary: { published: 0, engagementRate: 0 } });
  if (pathname === "/api/usage") return json(route, { today: {}, thisWeek: {}, tier: "team", quota: {} });
  if (pathname === "/api/onboarding") return json(route, { completed: true });
  if (pathname === "/api/channel-config") return json(route, { threads: { connected: true }, x: { connected: true }, facebook: { connected: true }, instagram: { connected: true }, youtube: { connected: true }, tiktok: { connected: true } });
  if (pathname === "/api/studio/brand-setup") return json(route, { guide: null });
  if (pathname === "/api/studio/engine-status") return json(route, { ready: true });
  if (pathname === "/api/studio/drafts") return json(route, request.method() === "POST" ? { ok: true, id: "screen-draft" } : { drafts: [], currentWork: null });
  if (pathname === "/api/publish/first-comment-capabilities") return json(route, { capabilities: [] });
  if (/^\/api\/channels\/[^/]+\/accounts$/.test(pathname)) {
    const provider = pathname.split("/")[3];
    return json(route, { accounts: [{ id: "e2696d98-6dfa-40d4-8bd7-internal-only", display_name: `${provider} 운영 계정 전체 이름`, username: `${provider}.official.full.handle`, is_default: true, connection_state: "connected" }] });
  }
  if (pathname === "/api/queue") return json(route, { posts: [] });
  if (pathname === "/api/images") return json(route, { images: [] });
  return json(route, {});
});

async function setWork(next) {
  await page.goto(`${baseUrl}/studio?room=create`, { waitUntil: "domcontentloaded", timeout: 60_000 });
  await page.evaluate(({ id, value }) => localStorage.setItem(`studio_work:${id}`, JSON.stringify(value)), { id: workspaceId, value: next });
}

async function captureCard(viewport) {
  await page.setViewportSize(viewport);
  await setWork(work("card"));
  await page.goto(`${baseUrl}/studio?room=edit&kind=card`, { waitUntil: "networkidle", timeout: 60_000 });
  const room = page.locator('[data-room="edit"][data-edit-kind="card"]');
  try {
    await room.locator("[data-plain-card-shell]").waitFor({ timeout: 10_000 });
  } catch (error) {
    const diagnostic = await page.evaluate(({ id }) => ({
      url: location.href,
      roomKinds: Array.from(document.querySelectorAll("[data-room][data-edit-kind]"))
        .map((node) => ({ room: node.getAttribute("data-room"), kind: node.getAttribute("data-edit-kind") })),
      storedWork: localStorage.getItem(`studio_work:${id}`),
      bodyText: document.body.innerText.slice(0, 800),
      consoleErrors: consoleErrors.slice(0, 10),
    }), { id: workspaceId });
    await page.screenshot({ path: path.join(outputDir, `failed-edit-card-${viewport.width}x${viewport.height}.png`) });
    throw new Error(`카드 작업대가 열리지 않았습니다: ${JSON.stringify(diagnostic)}`, { cause: error });
  }
  if (await room.locator("[data-card-deck-missing-note]").count()) throw new Error("일반 카드 위에 말풍선 안내 상자가 남았습니다");
  if (await room.getByRole("group", { name: "콘텐츠 크기 고르기" }).count() !== 1) throw new Error("카드 비율 선택기가 한 벌이 아닙니다");
  const inputValues = await room.locator("[data-line-input]").evaluateAll((nodes) => nodes.map((node) => node.value));
  if (inputValues.some((value) => !value.trim())) throw new Error(`카드 문구 입력이 비었습니다: ${JSON.stringify(inputValues)}`);
  const geometry = await room.evaluate((root) => {
    const strip = root.querySelector("[data-plain-card-strip]").getBoundingClientRect();
    const thumbnail = root.querySelector("[data-card-thumbnail]").getBoundingClientRect();
    const stage = root.querySelector("[data-edit-preview-frame]").getBoundingClientRect();
    const faceCopy = root.querySelector("[data-card-face-copy]").getBoundingClientRect();
    return {
      strip: { left: strip.left, right: strip.right, top: strip.top, bottom: strip.bottom, width: strip.width },
      thumbnail: { left: thumbnail.left, right: thumbnail.right, top: thumbnail.top, bottom: thumbnail.bottom, width: thumbnail.width },
      stage: { left: stage.left, right: stage.right, top: stage.top, bottom: stage.bottom, width: stage.width },
      faceCopy: { left: faceCopy.left, right: faceCopy.right, top: faceCopy.top, bottom: faceCopy.bottom, width: faceCopy.width },
    };
  });
  if (overlaps(geometry.strip, geometry.stage)) throw new Error(`카드 스트립과 무대가 겹칩니다: ${JSON.stringify(geometry)}`);
  const expectedStripWidth = viewport.width === 1440 ? 112 : viewport.width === 1024 ? 100 : 56;
  if (Math.abs(geometry.thumbnail.width - expectedStripWidth) > 1) {
    throw new Error(`${viewport.width} 카드 썸네일 폭 불일치: ${JSON.stringify({ expectedStripWidth, geometry })}`);
  }
  if (viewport.width === 1440 && (geometry.strip.width < 110 || geometry.strip.width > 114 || geometry.stage.width < 500 || geometry.stage.width > 522)) {
    throw new Error(`1440 카드 규격 불일치: ${JSON.stringify(geometry)}`);
  }
  if (geometry.faceCopy.left < geometry.stage.left || geometry.faceCopy.right > geometry.stage.right
    || geometry.faceCopy.top < geometry.stage.top || geometry.faceCopy.bottom > geometry.stage.bottom) {
    throw new Error(`카드 문구가 카드 면 밖에 있습니다: ${JSON.stringify(geometry)}`);
  }
  await assertVisibleEditorControlsDoNotOverlap(room, `카드 편집 영역 ${viewport.width}`);
  const overflow = await assertNoOverflow(page, '[data-room="edit"]', `카드 ${viewport.width}`);
  await room.locator("[data-plain-card-shell]").evaluate((node) => {
    node.scrollIntoView({ block: "start" });
    window.scrollBy(0, -16);
  });
  const screenshot = path.join(outputDir, `edit-card-${viewport.width}x${viewport.height}.png`);
  await page.screenshot({ path: screenshot });
  observations.push({ screen: "edit-card", ...viewport, geometry, overflow, inputCount: inputValues.length });
  return screenshot;
}

async function captureVideoEmpty(viewport) {
  await page.setViewportSize(viewport);
  await setWork(work("card"));
  await page.goto(`${baseUrl}/studio?room=edit&kind=video`, { waitUntil: "networkidle", timeout: 60_000 });
  const room = page.locator('[data-room="edit"][data-edit-kind="video"]');
  await room.locator("[data-video-editor-empty]").waitFor();
  await room.getByText("아직 편집할 영상이 없습니다", { exact: true }).waitFor();
  await room.getByRole("button", { name: "생성실에서 영상 만들기" }).waitFor();
  const overflow = await assertNoOverflow(page, '[data-room="edit"]', `영상 빈 상태 ${viewport.width}`);
  await room.locator("[data-video-editor-empty]").evaluate((node) => {
    node.scrollIntoView({ block: "start" });
    window.scrollBy(0, -16);
  });
  const screenshot = path.join(outputDir, `edit-video-empty-${viewport.width}x${viewport.height}.png`);
  await page.screenshot({ path: screenshot });
  observations.push({ screen: "edit-video-empty", ...viewport, overflow, deepLinkKind: await room.getAttribute("data-edit-kind") });
  if (viewport.width === 1440) {
    await room.getByRole("button", { name: "생성실에서 영상 만들기" }).click();
    await page.waitForURL(/\/studio\?room=create&kind=video$/, { timeout: 10_000 });
    const selectedFormat = page.locator('[data-room="create"] article').filter({ hasText: "선택한 형식" }).locator("b");
    await selectedFormat.waitFor();
    if ((await selectedFormat.textContent())?.trim() !== "영상") throw new Error("영상 빈 상태 복구 행동이 영상 생성실을 열지 않았습니다");
  }
  return screenshot;
}

async function capturePublish(viewport) {
  await page.setViewportSize(viewport);
  await setWork(work("card"));
  await page.goto(`${baseUrl}/studio?room=publish`, { waitUntil: "networkidle", timeout: 60_000 });
  const room = page.locator('[data-room="publish"]');
  await room.locator('[data-room-preview="tiktok"] [data-testid="publish-account-label-tiktok"]').waitFor();
  const xCheckbox = room.getByRole("checkbox", { name: "X 발행" });
  if (await xCheckbox.isChecked() || await xCheckbox.isEnabled()) throw new Error("X 한도 초과 체크가 꺼진 비활성 상태가 아닙니다");
  await room.getByRole("button", { name: "한도 넘는 곳만 줄이기" }).first().waitFor();
  for (const platform of ["shorts", "reels", "tiktok"]) {
    const checkbox = room.getByRole("checkbox", { name: `${platform === "shorts" ? "Shorts" : platform === "reels" ? "Reels" : "TikTok"} 발행` });
    if (await checkbox.isEnabled()) throw new Error(`${platform} 미디어 없는 체크가 활성화됐습니다`);
    await room.locator(`[data-testid="publish-create-media-${platform}"]`).waitFor();
  }
  const bodyText = await room.innerText();
  if (bodyText.includes("e2696") || bodyText.includes("@연결 계정")) throw new Error("내부 계정 id 또는 자리표시 핸들이 노출됐습니다");
  if (await room.locator('select[data-testid^="publish-account-select-"]').count()) throw new Error("계정 select 중복 UI가 남았습니다");
  if (!bodyText.includes("표지로 쓸 장면(초)")) throw new Error("표지 시점 설명이 없습니다");
  for (const row of await room.locator('[data-publish-header-row="primary"]').all()) {
    await assertDirectChildrenDoNotOverlap(row, `발행 계정행 ${viewport.width}`);
  }
  const accountRows = await assertPublishAccountRows(room, viewport.width);
  const coverRows = await assertVideoCoverRows(room, viewport.width);
  const overflow = await assertNoOverflow(page, '[data-room="publish"]', `발행실 ${viewport.width}`);
  const xCard = room.locator('[data-room-preview="x"]');
  await xCard.evaluate((node) => {
    node.scrollIntoView({ block: "start" });
    window.scrollBy(0, -16);
  });
  const screenshot = path.join(outputDir, `publish-cards-${viewport.width}x${viewport.height}.png`);
  await page.screenshot({ path: screenshot });
  const missingMediaCard = room.locator('[data-room-preview="shorts"]');
  await missingMediaCard.evaluate((node) => {
    node.scrollIntoView({ block: "start" });
    window.scrollBy(0, -16);
  });
  const missingMediaScreenshot = path.join(outputDir, `publish-missing-media-${viewport.width}x${viewport.height}.png`);
  await page.screenshot({ path: missingMediaScreenshot });
  observations.push({ screen: "publish-cards", ...viewport, overflow, accountRows, coverRows, xChecked: false, missingMediaDisabled: 3, accountSelectCount: 0, missingMediaScreenshot });
  return { screenshot, missingMediaScreenshot };
}

try {
  for (const viewport of viewports) {
    const cardShot = await captureCard(viewport);
    const videoShot = await captureVideoEmpty(viewport);
    const publishShots = await capturePublish(viewport);
    const cardReference = path.join(referenceRoot, `osmu-v70-편집실-카드뉴스-편집중@${viewport.width}x${viewport.height}.png`);
    const videoReference = path.join(referenceRoot, "osmu-v70-편집실-영상-빈상태@1440x900.png");
    const publishReference = path.join(referenceRoot, viewport.width === 390 ? "osmu-v67-publish-normal-390-gpt-codex-20260902-0448.png" : "osmu-v67-publish-normal-1024-gpt-codex-20260902-0448.png");
    await makeComparison(cardReference, cardShot, path.join(outputDir, `compare-edit-card-${viewport.width}.png`));
    await makeComparison(videoReference, videoShot, path.join(outputDir, `compare-edit-video-empty-${viewport.width}.png`));
    await makeComparison(publishReference, publishShots.screenshot, path.join(outputDir, `compare-publish-cards-${viewport.width}.png`));
  }
  if (consoleErrors.length) throw new Error(`브라우저 콘솔 오류 ${consoleErrors.length}건: ${consoleErrors.slice(0, 5).join(" | ")}`);
  for (const name of fs.readdirSync(outputDir)) {
    if (name.startsWith("failed-") && name.endsWith(".png")) fs.unlinkSync(path.join(outputDir, name));
  }
  const report = {
    observations,
    consoleErrorCount: 0,
    outputDir,
    videoReferenceNote: "v70 영상 빈 상태 clean-frame은 1440만 있어 1024·390 대조에도 1440 원본을 사용",
    publishReferenceNote: "v70 발행실 clean-frame 부재로 최신 기존 clean-frame인 v67 normal을 비교 원본으로 사용",
  };
  fs.writeFileSync(path.join(outputDir, "observations.json"), `${JSON.stringify(report, null, 2)}\n`);
  process.stdout.write(`${JSON.stringify(report, null, 2)}\n`);
} finally {
  await browser.close();
}
