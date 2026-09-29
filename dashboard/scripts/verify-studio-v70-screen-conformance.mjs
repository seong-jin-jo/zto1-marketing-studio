#!/usr/bin/env node

import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { chromium } from "playwright-core";
import sharp from "sharp";

const scriptDir = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(scriptDir, "../..");
const baseUrl = process.env.STUDIO_V70_BASE_URL || "http://127.0.0.1:3470";
const outputDir = process.env.STUDIO_V70_OUTPUT_DIR || path.join(repoRoot, "docs/qa/studio-v70-screen-conformance-20260928");
const referenceRoot = process.env.STUDIO_V70_REFERENCE_ROOT || path.join(repoRoot, "docs/design/clean-frames");
const compareWithReferences = process.env.STUDIO_V70_COMPARE !== "0";
const workspaceId = "11111111-1111-4111-8111-111111111111";
const viewports = [
  { width: 1440, height: 900 },
  { width: 1024, height: 820 },
  { width: 390, height: 844 },
];
const requestedViewportWidths = new Set(
  (process.env.STUDIO_V70_VIEWPORTS || viewports.map(({ width }) => width).join(","))
    .split(",")
    .map((value) => Number(value.trim())),
);
const lines = ["첫 장에서 문제를 짚습니다", "두 번째 장에서 원인을 설명합니다", "마지막 장에서 다음 행동을 제안합니다"];
const images = ["/qa/alignment-card-1.jpg", "/qa/alignment-card-2.jpg", "/qa/alignment-card-3.jpg"];
const bakedTextLines = ["상위권 공부법을 그대로 따라 하고 있었어요", "내 공부 순서부터 다시 봤습니다", "오늘 한 단계만 바꿔 보세요"];
const bakedTextCard = `data:image/svg+xml;base64,${Buffer.from(`
  <svg xmlns="http://www.w3.org/2000/svg" width="1080" height="1350" viewBox="0 0 1080 1350">
    <rect width="1080" height="1350" fill="#171717"/>
    <text x="108" y="560" fill="#ffffff" font-family="Arial, sans-serif" font-size="76" font-weight="700">
      <tspan x="108" dy="0">상위권 공부법을 그대로</tspan>
      <tspan x="108" dy="112">따라 하고 있었어요</tspan>
    </text>
    <text x="108" y="1240" fill="#d4d4d4" font-family="Arial, sans-serif" font-size="38">1 / 3</text>
  </svg>
`).toString("base64")}`;
const bubbleDeck = JSON.parse(fs.readFileSync(path.join(repoRoot, "dashboard/tests/studio/fixtures/deck-d100.v2.json"), "utf8"));
const referenceStageCrops = {
  1440: { left: 483, top: 168, width: 520, height: 650 },
  1024: { left: 196, top: 168, width: 520, height: 650 },
  390: { left: 40, top: 276, width: 310, height: 387.5 },
};
// 일반 카드에는 위치 이동 단추와 편집 문구가 겹치므로 전체 평균을 쓰면 올바른 이미지도
// 약 0.06까지 올라가고, 다른 이미지(0.0667)와 분리가 거의 안 된다. 편집 UI가 없는 카드
// 상단 내부만 비교하면 올바른 fixture는 0, 다른 fixture와 검정 화면은 확실히 갈린다.
const directStageDiffRegion = { left: 26, top: 26, width: 208, height: 39 };
const stageDiffThreshold = Number(process.env.STUDIO_V70_STAGE_DIFF_THRESHOLD || "0.025");

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

function bubbleWork() {
  return {
    ...work("card"),
    idea: "말풍선 덱 v70 화면 정합 검증",
    cardDeck: bubbleDeck,
    editLines: ["말풍선 덱은 9장 모두 같은 스트립 규격을 사용합니다."],
  };
}

function bakedTextWork() {
  return {
    ...work("card"),
    idea: "무료 글자 카드 중복 방지 검증",
    img: {
      url: bakedTextCard,
      file: bakedTextCard,
      imageUrls: [bakedTextCard, bakedTextCard, bakedTextCard],
      topicKey: "v70-text-card-overlay",
      aspectRatio: "4:5",
      textEmbedded: true,
    },
    editLines: bakedTextLines,
    text: {
      ...work("card").text,
      instagram: { caption: "무료 글자 카드 캡션", hashtags: ["공부법"], slides: bakedTextLines },
    },
  };
}

function unrecoverableTextWork(cardCount) {
  const originalImageUrls = images.slice(0, cardCount);
  const originalLines = bakedTextLines.slice(0, cardCount);
  const idea = `원본 정보 없는 ${cardCount}장 카드 잠금 검증`;
  return {
    ...work("card"),
    idea,
    img: {
      url: originalImageUrls[0],
      file: originalImageUrls[0],
      imageUrls: originalImageUrls,
      topicKey: idea,
      aspectRatio: "4:5",
      textEmbedded: true,
      textSourceRecoverable: false,
    },
    editLines: originalLines,
    text: {
      ...work("card").text,
      instagram: { caption: "원본 없는 글자 카드 캡션", hashtags: ["보존"], slides: originalLines },
    },
  };
}

function videoWork() {
  return {
    ...work("video"),
    vid: { url: "/qa/alignment-sample.mp4", file: "/qa/alignment-sample.mp4" },
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

async function makeStageComparison(referencePath, actualStagePath, outputPath, viewportWidth, { enforceThreshold = true, kindLabel = "편집 스테이지" } = {}) {
  if (!fs.existsSync(referencePath)) throw new Error(`비교 원본 없음: ${referencePath}`);
  const cssCrop = referenceStageCrops[viewportWidth];
  if (!cssCrop) throw new Error(`${viewportWidth} 화면별 v70 기준 crop이 없습니다`);
  const referenceMetadata = await sharp(referencePath).metadata();
  const referenceScale = (referenceMetadata.width || viewportWidth) / viewportWidth;
  const crop = {
    left: Math.round(cssCrop.left * referenceScale),
    top: Math.round(cssCrop.top * referenceScale),
    width: Math.round(cssCrop.width * referenceScale),
    height: Math.round(cssCrop.height * referenceScale),
  };
  const normalized = { width: 260, height: 325 };
  const referenceInput = await sharp(referencePath).extract(crop).png().toBuffer();
  const actualInput = await sharp(actualStagePath).resize(normalized).png().toBuffer();
  const [referenceRaw, actualRaw] = await Promise.all([
    sharp(referenceInput).resize(normalized).greyscale().blur(4).raw().toBuffer(),
    sharp(actualInput).greyscale().blur(4).raw().toBuffer(),
  ]);
  let absoluteDifference = 0;
  for (let index = 0; index < referenceRaw.length; index += 1) {
    absoluteDifference += Math.abs(referenceRaw[index] - actualRaw[index]);
  }
  const score = absoluteDifference / (referenceRaw.length * 255);
  const referenceWidth = crop.width;
  const referenceHeight = crop.height;
  const presentationActual = await sharp(actualStagePath).resize({ width: referenceWidth, height: referenceHeight }).png().toBuffer();
  const labelHeight = 44;
  const canvasWidth = referenceWidth * 2;
  const canvasHeight = referenceHeight + labelHeight;
  const label = Buffer.from(`<svg width="${canvasWidth}" height="${labelHeight}"><rect width="100%" height="100%" fill="#111827"/><text x="20" y="29" fill="white" font-family="Arial" font-size="18" font-weight="700">REFERENCE</text><text x="${referenceWidth + 20}" y="29" fill="white" font-family="Arial" font-size="18" font-weight="700">IMPLEMENTATION</text></svg>`);
  await sharp({ create: { width: canvasWidth, height: canvasHeight, channels: 4, background: "#e5e7eb" } })
    .composite([
      { input: label, left: 0, top: 0 },
      { input: referenceInput, left: 0, top: labelHeight },
      { input: presentationActual, left: referenceWidth, top: labelHeight },
    ])
    .png()
    .toFile(outputPath);
  if (enforceThreshold && score > stageDiffThreshold) {
    throw new Error(`${viewportWidth} ${kindLabel} 이미지 차이 ${score.toFixed(4)}가 임계값 ${stageDiffThreshold}를 넘었습니다`);
  }
  return score;
}

async function directStageDiffScore(referenceInput, actualInput) {
  const normalized = { width: 260, height: 325 };
  const [referenceRaw, actualRaw] = await Promise.all([
    sharp(referenceInput).resize(normalized).extract(directStageDiffRegion).raw().toBuffer(),
    sharp(actualInput).resize(normalized).extract(directStageDiffRegion).raw().toBuffer(),
  ]);
  let absoluteDifference = 0;
  for (let index = 0; index < referenceRaw.length; index += 1) {
    absoluteDifference += Math.abs(referenceRaw[index] - actualRaw[index]);
  }
  return absoluteDifference / (referenceRaw.length * 255);
}

async function assertDirectStageDiffRejectsMutants() {
  const referencePath = path.join(repoRoot, "dashboard/public/qa/alignment-card-1.jpg");
  const wrongImagePath = path.join(repoRoot, "dashboard/public/qa/alignment-card-2.jpg");
  const blackFrame = await sharp({
    create: { width: 260, height: 325, channels: 3, background: "#000000" },
  }).jpeg().toBuffer();
  const [sameScore, wrongImageScore, blackFrameScore] = await Promise.all([
    directStageDiffScore(referencePath, referencePath),
    directStageDiffScore(referencePath, wrongImagePath),
    directStageDiffScore(referencePath, blackFrame),
  ]);
  if (sameScore > stageDiffThreshold || wrongImageScore <= stageDiffThreshold || blackFrameScore <= stageDiffThreshold) {
    throw new Error(`일반 카드 이미지 차이 판정 돌연변이 실패: ${JSON.stringify({ sameScore, wrongImageScore, blackFrameScore, stageDiffThreshold, directStageDiffRegion })}`);
  }
  return { sameScore, wrongImageScore, blackFrameScore, stageDiffThreshold, directStageDiffRegion };
}

async function makeDirectStageComparison(referencePath, actualStagePath, outputPath, viewportWidth, kindLabel = "스테이지") {
  if (!fs.existsSync(referencePath)) throw new Error(`${kindLabel} 비교 원본 없음: ${referencePath}`);
  const normalized = { width: 260, height: 325 };
  const [referenceInput, actualInput] = await Promise.all([
    sharp(referencePath).resize(normalized).png().toBuffer(),
    sharp(actualStagePath).resize(normalized).png().toBuffer(),
  ]);
  const score = await directStageDiffScore(referenceInput, actualInput);
  const labelHeight = 44;
  const label = Buffer.from(`<svg width="${normalized.width * 2}" height="${labelHeight}"><rect width="100%" height="100%" fill="#111827"/><text x="20" y="29" fill="white" font-family="Arial" font-size="18" font-weight="700">REFERENCE</text><text x="${normalized.width + 20}" y="29" fill="white" font-family="Arial" font-size="18" font-weight="700">IMPLEMENTATION</text></svg>`);
  await sharp({ create: { width: normalized.width * 2, height: normalized.height + labelHeight, channels: 4, background: "#e5e7eb" } })
    .composite([
      { input: label, left: 0, top: 0 },
      { input: referenceInput, left: 0, top: labelHeight },
      { input: actualInput, left: normalized.width, top: labelHeight },
    ])
    .png()
    .toFile(outputPath);
  if (score > stageDiffThreshold) {
    throw new Error(`${viewportWidth} ${kindLabel} 이미지 차이 ${score.toFixed(4)}가 임계값 ${stageDiffThreshold}를 넘었습니다`);
  }
  return score;
}

const visualDiffMutationCheck = await assertDirectStageDiffRejectsMutants();
const browser = await chromium.launch({ headless: true });
const context = await browser.newContext({ viewport: viewports[0] });
await context.addInitScript(({ id, initial }) => {
  localStorage.setItem("dashboard_auth_token", "studio-v70-screen-token");
  localStorage.setItem("active_workspace", JSON.stringify({ id, slug: "studio-v70-screen", name: "화면 검증 작업 공간", tier: "team" }));
  // addInitScript는 모든 탐색 전에 다시 돈다. 매번 기본 카드를 쓰면 setWork()가 넣은
  // 글자 내장 카드 fixture까지 다음 /studio 탐색에서 일반 카드로 되돌아가므로, 최초
  // 부트스트랩에만 기본값을 넣고 이후 화면별 fixture는 setWork()를 정본으로 둔다.
  if (!localStorage.getItem(`studio_work:${id}`)) {
    localStorage.setItem(`studio_work:${id}`, JSON.stringify(initial));
  }
}, { id: workspaceId, initial: work("card") });

const page = await context.newPage();
page.setDefaultTimeout(90_000);
const consoleErrors = [];
const observations = [];
const draftSaves = [];
let imageUploadCount = 0;
let currentDraft = null;
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
  if (pathname === "/api/elevenlabs-voices") return json(route, { voices: [] });
  if (pathname === "/api/studio/drafts") {
    if (request.method() === "POST") {
      draftSaves.push(request.postDataJSON());
      return json(route, { ok: true, id: "screen-draft", bodyRevision: draftSaves.length });
    }
    return json(route, {
      drafts: currentDraft ? [currentDraft] : [],
      currentWork: currentDraft ? { draftId: currentDraft.id, stage: "edit", stageLabel: "편집실", idea: currentDraft.idea } : null,
    });
  }
  if (pathname === "/api/images/upload") {
    imageUploadCount += 1;
    return json(route, { url: `/api/images/deliver/screen-upload-${imageUploadCount}` });
  }
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
  currentDraft = next.cardDeck
    ? { ...next, id: "screen-bubble-draft", status: "draft" }
    : next.vid
      ? { ...next, id: "screen-video-draft", status: "draft" }
      : null;
  // Studio를 연 채 localStorage를 바꾸면 직전 화면의 저장 effect가 다음 tick에서 새
  // fixture를 옛 상태로 덮을 수 있다. 같은 origin의 정적 자산에서 설정해 경쟁을 없앤다.
  await page.goto(`${baseUrl}/qa/alignment-card-1.jpg`, { waitUntil: "domcontentloaded", timeout: 60_000 });
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
    }), { id: workspaceId });
    diagnostic.consoleErrors = consoleErrors.slice(0, 10);
    await page.screenshot({ path: path.join(outputDir, `failed-edit-card-${viewport.width}x${viewport.height}.png`) });
    throw new Error(`카드 작업대가 열리지 않았습니다: ${JSON.stringify(diagnostic)}`, { cause: error });
  }
  if (await room.locator("[data-card-deck-missing-note]").count()) throw new Error("일반 카드 위에 말풍선 안내 상자가 남았습니다");
  if (await room.getByRole("group", { name: "콘텐츠 크기 고르기" }).count() !== 1) throw new Error("카드 비율 선택기가 한 벌이 아닙니다");
  if (await room.getByRole("group", { name: "콘텐츠 크기 고르기" }).getByRole("button").count() !== 1) throw new Error("일반 카드에 4:5 외 비율 선택지가 남았습니다");
  if (await room.locator("[data-card-thumbnail]").evaluateAll((nodes) => nodes.some((node) => (node.textContent || "").includes("문제") || (node.textContent || "").includes("원인")))) {
    throw new Error("일반 카드 스트립 썸네일에 본문 글자가 남았습니다");
  }
  if (await room.locator("[data-card-thumbnail-image]").count() !== images.length) {
    throw new Error("일반 카드의 장별 생성 이미지 썸네일이 모두 보이지 않습니다");
  }
  await room.locator('[data-edit-preview-media="image"]').waitFor();
  const inputValues = await room.locator("[data-line-input]").evaluateAll((nodes) => nodes.map((node) => node.value));
  if (inputValues.some((value) => !value.trim())) throw new Error(`카드 문구 입력이 비었습니다: ${JSON.stringify(inputValues)}`);
  const geometry = await room.evaluate((root) => {
    const strip = root.querySelector("[data-plain-card-strip]").getBoundingClientRect();
    const thumbnail = root.querySelector("[data-card-thumbnail]").getBoundingClientRect();
    const stage = root.querySelector("[data-edit-preview-frame]").getBoundingClientRect();
    const frame = root.querySelector("[data-edit-preview-frame]");
    const faceCopy = root.querySelector("[data-card-face-copy]").getBoundingClientRect();
    const assistant = root.querySelector("[data-edit-helper]").getBoundingClientRect();
    const chatLog = root.querySelector("[data-edit-chat-log]").getBoundingClientRect();
    return {
      strip: { left: strip.left, right: strip.right, top: strip.top, bottom: strip.bottom, width: strip.width },
      thumbnail: { left: thumbnail.left, right: thumbnail.right, top: thumbnail.top, bottom: thumbnail.bottom, width: thumbnail.width },
      stage: { left: stage.left, right: stage.right, top: stage.top, bottom: stage.bottom, width: stage.width, height: stage.height, ratio: frame.getAttribute("data-edit-preview-frame"), background: getComputedStyle(frame).backgroundColor },
      faceCopy: { left: faceCopy.left, right: faceCopy.right, top: faceCopy.top, bottom: faceCopy.bottom, width: faceCopy.width },
      assistant: { width: assistant.width, height: assistant.height },
      chatLog: { width: chatLog.width, height: chatLog.height },
    };
  });
  if (overlaps(geometry.strip, geometry.stage)) throw new Error(`카드 스트립과 무대가 겹칩니다: ${JSON.stringify(geometry)}`);
  const expectedStripWidth = viewport.width === 1440 ? 112 : viewport.width === 1024 ? 100 : 56;
  if (Math.abs(geometry.thumbnail.width - expectedStripWidth) > 1) {
    throw new Error(`${viewport.width} 카드 썸네일 폭 불일치: ${JSON.stringify({ expectedStripWidth, geometry })}`);
  }
  const expectedStageWidth = viewport.width === 390 ? "300~310" : 520;
  const stageWidthMatches = viewport.width === 390
    ? geometry.stage.width >= 300 && geometry.stage.width <= 310
    : Math.abs(geometry.stage.width - 520) <= 1;
  if (!stageWidthMatches || geometry.stage.ratio !== "4 / 5") {
    throw new Error(`${viewport.width} 카드 520px·4:5 규격 불일치: ${JSON.stringify({ expectedStageWidth, geometry })}`);
  }
  if (geometry.stage.background !== "rgb(255, 255, 255)") {
    throw new Error(`${viewport.width} 일반 카드 캔버스가 흰색이 아닙니다: ${geometry.stage.background}`);
  }
  if (viewport.width >= 1024 && Math.abs(geometry.assistant.width - 304) > 1) {
    throw new Error(`${viewport.width} 편집 담당 폭이 304px이 아닙니다: ${JSON.stringify(geometry.assistant)}`);
  }
  if (geometry.chatLog.height < 200) {
    throw new Error(`${viewport.width} 편집 담당 대화 흐름이 숨겨졌습니다: ${JSON.stringify(geometry.chatLog)}`);
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
  const stageScreenshot = path.join(outputDir, `edit-card-stage-${viewport.width}x${viewport.height}.png`);
  await room.locator("[data-edit-preview-frame]").screenshot({ path: stageScreenshot });
  observations.push({ screen: "edit-card", ...viewport, geometry, overflow, inputCount: inputValues.length });
  return { screenshot, stageScreenshot };
}

async function captureBakedTextCard(viewport) {
  await page.setViewportSize(viewport);
  await setWork(bakedTextWork());
  await page.goto(`${baseUrl}/studio?room=edit&kind=card`, { waitUntil: "networkidle", timeout: 60_000 });
  const room = page.locator('[data-room="edit"][data-edit-kind="card"]');
  const stage = room.locator("[data-edit-preview-frame]");
  const stageImage = stage.locator('[data-edit-preview-media="image"]');
  await stageImage.waitFor({ timeout: 10_000 });

  // v70 544행 계약을 실제 브라우저에서 검증한다. 글자 내장 원본을 그대로 둔 채
  // 별도 DOM 글자를 얹는 방식이면 src가 바뀌지 않으므로 이 두 변화가 모두 실패한다.
  const initialPreviewSrc = await stageImage.getAttribute("src");
  const editedLine = `즉시 반영 ${viewport.width}`;
  const firstLineInput = room.locator('[data-line-input="0"]');
  await firstLineInput.fill(editedLine);
  await page.waitForFunction(
    ({ selector, before }) => document.querySelector(selector)?.getAttribute("src") !== before,
    { selector: '[data-room="edit"] [data-edit-preview-media="image"]', before: initialPreviewSrc },
  );
  const textEditedPreviewSrc = await stageImage.getAttribute("src");
  await room.getByRole("group", { name: "카드 글자 위치" }).getByRole("button", { name: "하단" }).click();
  await page.waitForFunction(
    ({ selector, before }) => document.querySelector(selector)?.getAttribute("src") !== before,
    { selector: '[data-room="edit"] [data-edit-preview-media="image"]', before: textEditedPreviewSrc },
  );
  const positionEditedPreviewSrc = await stageImage.getAttribute("src");
  if (!positionEditedPreviewSrc?.startsWith("data:image/")) {
    throw new Error(`${viewport.width} 글자 수정 뒤 미리보기가 브라우저 재합성 이미지가 아닙니다`);
  }

  const duplicateControls = await room.locator('[aria-label="카드 글자 끌어 옮기기"], [data-card-face-copy]').count();
  const placeholderOverlays = await room.getByText("여기에 카드 화면이 놓입니다", { exact: true }).count();
  if (duplicateControls !== 0 || placeholderOverlays !== 0) {
    const storedImg = await page.evaluate((id) => JSON.parse(localStorage.getItem(`studio_work:${id}`) || "{}").img ?? null, workspaceId);
    const diagnostic = path.join(outputDir, `failed-edit-text-card-${viewport.width}x${viewport.height}.png`);
    await page.screenshot({ path: diagnostic });
    throw new Error(`${viewport.width} 글자 내장 카드 위에 편집 글자 레이어 ${duplicateControls}개·자리표시 레이어 ${placeholderOverlays}개가 다시 겹쳤습니다: ${JSON.stringify({ storedImg, diagnostic })}`);
  }
  await room.locator("[data-card-text-embedded-note]").waitFor();
  const inputValues = await room.locator("[data-line-input]").evaluateAll((nodes) => nodes.map((node) => node.value));
  const expectedEditedLines = [editedLine, ...bakedTextLines.slice(1)];
  if (JSON.stringify(inputValues) !== JSON.stringify(expectedEditedLines)) {
    throw new Error(`${viewport.width} 카드 문구 편집 목록이 수정 원문을 보존하지 않습니다: ${JSON.stringify(inputValues)}`);
  }
  const geometry = await stage.evaluate((frame) => {
    const stageRect = frame.getBoundingClientRect();
    const mediaRect = frame.querySelector('[data-edit-preview-media="image"]').getBoundingClientRect();
    return {
      stage: { left: stageRect.left, right: stageRect.right, top: stageRect.top, bottom: stageRect.bottom, width: stageRect.width, height: stageRect.height },
      media: { left: mediaRect.left, right: mediaRect.right, top: mediaRect.top, bottom: mediaRect.bottom, width: mediaRect.width, height: mediaRect.height },
    };
  });
  if (Math.abs(geometry.stage.width - geometry.media.width) > 1 || Math.abs(geometry.stage.height - geometry.media.height) > 1) {
    throw new Error(`${viewport.width} 내장 글자 카드 이미지가 무대 전체를 채우지 않습니다: ${JSON.stringify(geometry)}`);
  }
  const overflow = await assertNoOverflow(page, '[data-room="edit"]', `글자 내장 카드 ${viewport.width}`);
  await room.locator("[data-plain-card-shell]").evaluate((node) => {
    node.scrollIntoView({ block: "start" });
    window.scrollBy(0, -16);
  });
  const screenshot = path.join(outputDir, `edit-text-card-${viewport.width}x${viewport.height}.png`);
  await page.screenshot({ path: screenshot });
  const stageScreenshot = path.join(outputDir, `edit-text-card-stage-${viewport.width}x${viewport.height}.png`);
  await stage.screenshot({ path: stageScreenshot });
  observations.push({
    screen: "edit-text-card",
    ...viewport,
    duplicateControls,
    placeholderOverlays,
    inputCount: inputValues.length,
    editedLine,
    textPreviewChanged: initialPreviewSrc !== textEditedPreviewSrc,
    positionPreviewChanged: textEditedPreviewSrc !== positionEditedPreviewSrc,
    previewIsBrowserRenderedDataUrl: positionEditedPreviewSrc?.startsWith("data:image/") === true,
    geometry,
    overflow,
  });
  return { screenshot, stageScreenshot };
}

async function captureUnrecoverableTextCard(viewport, cardCount) {
  const lockedWork = unrecoverableTextWork(cardCount);
  const originalImageUrls = [...lockedWork.img.imageUrls];
  const uploadCountBefore = imageUploadCount;
  const draftSaveCountBefore = draftSaves.length;
  await page.setViewportSize(viewport);
  await setWork(lockedWork);
  await page.goto(`${baseUrl}/studio?room=edit&kind=card`, { waitUntil: "networkidle", timeout: 60_000 });

  const room = page.locator('[data-room="edit"][data-edit-kind="card"]');
  await room.locator("[data-card-source-lock]").waitFor({ timeout: 10_000 });
  await room.getByText("편집 원본 정보가 없어 문구·위치·순서를 바꿀 수 없습니다.", { exact: true }).waitFor();
  await room.getByText("기존 그림은 그대로 보존됩니다. 수정하려면 생성실에서 새 카드로 만들어 주세요.", { exact: true }).waitFor();
  await room.getByRole("button", { name: "생성실에서 새 카드 만들기" }).waitFor();
  if (await room.locator("[data-card-text-embedded-note]").count()) {
    throw new Error(`${viewport.width} ${cardCount}장 잠금 상태에 바로 반영 안내가 노출됐습니다`);
  }

  const lineInputs = room.locator("[data-line-input]");
  const thumbnailCount = await room.locator("[data-card-thumbnail]").count();
  if (await lineInputs.count() !== cardCount || thumbnailCount !== cardCount) {
    throw new Error(`${viewport.width} 원본 없는 ${cardCount}장 카드의 입력·썸네일 장수가 보존되지 않았습니다`);
  }
  const lockedControls = [
    lineInputs,
    room.locator("[data-line-up], [data-line-down]"),
    room.locator("[data-line-toggle]"),
    room.locator("[data-line-add]"),
    room.locator("[data-content-size-option]"),
    room.getByRole("group", { name: "카드 글자 위치" }).getByRole("button"),
  ];
  for (const controls of lockedControls) {
    const states = await controls.evaluateAll((nodes) => nodes.map((node) => node.disabled));
    if (!states.length || states.some((disabled) => !disabled)) {
      throw new Error(`${viewport.width} 원본 없는 ${cardCount}장 카드에 활성 조작이 남았습니다: ${JSON.stringify(states)}`);
    }
  }

  const previewSources = await room.locator('[data-edit-preview-media="image"]').evaluateAll((nodes) => nodes.map((node) => node.getAttribute("src")));
  if (!previewSources.length || !originalImageUrls.some((url) => previewSources.some((source) => source?.includes(url)))) {
    throw new Error(`${viewport.width} 원본 없는 ${cardCount}장 카드가 원본 그림을 미리보기에 유지하지 않았습니다`);
  }
  const overflow = await assertNoOverflow(page, '[data-room="edit"]', `원본 없는 ${cardCount}장 카드 ${viewport.width}`);
  const screenshot = path.join(outputDir, `edit-text-card-locked-${cardCount}-${viewport.width}x${viewport.height}.png`);
  await page.screenshot({ path: screenshot });

  await room.getByRole("button", { name: "발행실로 이동" }).click();
  await page.waitForFunction(() => new URL(location.href).searchParams.get("room") === "publish");
  if (imageUploadCount !== uploadCountBefore) {
    throw new Error(`${viewport.width} 원본 없는 ${cardCount}장 카드가 ${imageUploadCount - uploadCountBefore}장을 다시 업로드했습니다`);
  }
  const newDraftSaves = draftSaves.slice(draftSaveCountBefore);
  const savedDraft = newDraftSaves.at(-1);
  if (JSON.stringify(savedDraft?.img?.imageUrls) !== JSON.stringify(originalImageUrls)
    || savedDraft?.img?.textEmbedded !== true
    || savedDraft?.img?.textSourceRecoverable !== false) {
    throw new Error(`${viewport.width} 원본 없는 ${cardCount}장 카드 저장이 원본 URL·장수·잠금 표식을 보존하지 않았습니다: ${JSON.stringify(savedDraft?.img)}`);
  }
  const storedWork = await page.evaluate((id) => JSON.parse(localStorage.getItem(`studio_work:${id}`) || "{}"), workspaceId);
  if (JSON.stringify(storedWork?.img?.imageUrls) !== JSON.stringify(originalImageUrls)) {
    throw new Error(`${viewport.width} 원본 없는 ${cardCount}장 카드의 브라우저 작업물이 원본 URL·장수를 잃었습니다`);
  }
  observations.push({
    screen: `edit-text-card-locked-${cardCount}`,
    ...viewport,
    cardCount,
    thumbnailCount,
    originalImageUrls,
    savedImageUrls: savedDraft.img.imageUrls,
    imageUploads: imageUploadCount - uploadCountBefore,
    lockGuidanceVisible: true,
    controlsDisabled: true,
    overflow,
    screenshot,
  });
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

async function captureVideoActual(viewport) {
  await page.setViewportSize(viewport);
  await setWork(videoWork());
  await page.goto(`${baseUrl}/studio?room=edit&kind=video&draft_id=screen-video-draft`, { waitUntil: "networkidle", timeout: 60_000 });
  const room = page.locator('[data-room="edit"][data-edit-kind="video"]');
  try {
    await room.locator("[data-video-screen]").waitFor({ timeout: 10_000 });
  } catch (error) {
    const diagnostic = await page.evaluate(({ id }) => ({
      url: location.href,
      storedWork: localStorage.getItem(`studio_work:${id}`),
      roomHtml: document.querySelector('[data-room="edit"]')?.outerHTML.slice(0, 2_000),
      bodyText: document.body.innerText.slice(0, 1_000),
    }), { id: workspaceId });
    diagnostic.consoleErrors = consoleErrors.slice(0, 10);
    await page.screenshot({ path: path.join(outputDir, `failed-edit-video-actual-${viewport.width}x${viewport.height}.png`) });
    throw new Error(`실제 영상 작업대가 열리지 않았습니다: ${JSON.stringify(diagnostic)}`, { cause: error });
  }
  await room.locator("[data-video-subtitle-script]").waitFor();
  await room.locator("[data-video-workbench]").evaluate((node) => {
    node.scrollIntoView({ block: "start" });
    window.scrollBy(0, -16);
  });
  const geometry = await room.evaluate((root) => {
    const playback = root.querySelector("[data-video-playback]").getBoundingClientRect();
    const screen = root.querySelector("[data-video-screen]").getBoundingClientRect();
    const script = root.querySelector("[data-video-script-column]").getBoundingClientRect();
    const timeline = root.querySelector("[data-video-timeline]").getBoundingClientRect();
    return {
      playback: { top: playback.top, bottom: playback.bottom, height: playback.height },
      screen: { top: screen.top, bottom: screen.bottom, height: screen.height },
      script: { top: script.top, bottom: script.bottom, height: script.height },
      timeline: { top: timeline.top, bottom: timeline.bottom, height: timeline.height },
    };
  });
  if (viewport.width === 390) {
    if (Math.abs(geometry.playback.height - 180) > 1) throw new Error(`390 영상 플레이어 전체가 180px이 아닙니다: ${JSON.stringify(geometry)}`);
    if (geometry.script.top >= viewport.height) throw new Error(`390 첫 화면에 대본이 보이지 않습니다: ${JSON.stringify(geometry)}`);
    if (Math.abs(geometry.timeline.height - 108) > 1) throw new Error(`390 영상 타임라인이 108px이 아닙니다: ${JSON.stringify(geometry)}`);
  }
  const overflow = await assertNoOverflow(page, '[data-room="edit"]', `실제 영상 ${viewport.width}`);
  const screenshot = path.join(outputDir, `edit-video-actual-${viewport.width}x${viewport.height}.png`);
  await page.screenshot({ path: screenshot });
  observations.push({ screen: "edit-video-actual", ...viewport, geometry, overflow });
  return screenshot;
}

async function captureBubbleDeck(viewport) {
  await page.setViewportSize(viewport);
  await setWork(bubbleWork());
  await page.goto(`${baseUrl}/studio?room=edit&kind=card&draft_id=screen-bubble-draft`, { waitUntil: "networkidle", timeout: 60_000 });
  const room = page.locator('[data-room="edit"][data-edit-kind="card"]');
  const panel = room.locator("[data-card-deck-panel]");
  await panel.waitFor({ timeout: 10_000 });
  await panel.locator("[data-slide-id]").nth(2).click();
  await panel.locator("[data-bubble-content-editable]").nth(1).click();
  const thumbnailCount = await panel.locator("[data-slide-id]").count();
  if (thumbnailCount !== bubbleDeck.slides.length) {
    throw new Error(`말풍선 덱 장 수 불일치: 기대 ${bubbleDeck.slides.length}, 실제 ${thumbnailCount}`);
  }
  if (await panel.locator("[data-card-deck-thumbnail-strip] [data-selected-slide-toolbar]").count()) {
    throw new Error("말풍선 장 조작 툴바가 스트립 안에 반복 렌더됐습니다");
  }
  if (await panel.locator("[data-selected-slide-toolbar]").count() !== 0) {
    throw new Error("선택 장 위 ▲▼+장 툴바가 남았습니다");
  }
  const actionLabels = await panel.locator("[data-selected-slide-actions] button").allTextContents();
  if (JSON.stringify(actionLabels.map((label) => label.trim())) !== JSON.stringify(["이 장 복제", "이 장 삭제", "말풍선 추가"])) {
    throw new Error(`카드 아래 장 작업 단추가 규격과 다릅니다: ${JSON.stringify(actionLabels)}`);
  }
  const selectedSlide = panel.locator("[data-slide-id]").nth(2);
  const selectedSlideId = await selectedSlide.getAttribute("data-slide-id");
  const nextSlideIdBefore = await panel.locator("[data-slide-id]").nth(3).getAttribute("data-slide-id");
  await selectedSlide.focus();
  await selectedSlide.press("Alt+ArrowDown");
  if (await panel.locator("[data-slide-id]").nth(3).getAttribute("data-slide-id") !== selectedSlideId) throw new Error("Alt+↓ 키보드 순서 이동이 동작하지 않습니다");
  await panel.locator(`[data-slide-id="${selectedSlideId}"]`).press("Alt+ArrowUp");
  if (await panel.locator("[data-slide-id]").nth(3).getAttribute("data-slide-id") !== nextSlideIdBefore) throw new Error("Alt+↑ 키보드 순서 복원이 동작하지 않습니다");
  const geometry = await panel.evaluate((root) => {
    const strip = root.querySelector("[data-card-deck-thumbnail-strip]").getBoundingClientRect();
    const thumbnail = root.querySelector("[data-slide-id]").getBoundingClientRect();
    const stage = root.querySelector("[data-card-deck-stage]").getBoundingClientRect();
    const stripStyle = getComputedStyle(root.querySelector("[data-card-deck-thumbnail-strip]"));
    const selectedBubbleRow = root.querySelector('[data-bubble-editing="true"]');
    const selectedBubble = selectedBubbleRow?.firstElementChild;
    const toolbar = selectedBubbleRow?.querySelector("[data-bubble-controls]");
    const bubbleRect = selectedBubble?.getBoundingClientRect();
    const toolbarRect = toolbar?.getBoundingClientRect();
    const toolbarButtonRects = [...(toolbar?.querySelectorAll("button") ?? [])].map((button) => button.getBoundingClientRect());
    const intersectionWidth = bubbleRect && toolbarRect ? Math.max(0, Math.min(bubbleRect.right, toolbarRect.right) - Math.max(bubbleRect.left, toolbarRect.left)) : 0;
    const intersectionHeight = bubbleRect && toolbarRect ? Math.max(0, Math.min(bubbleRect.bottom, toolbarRect.bottom) - Math.max(bubbleRect.top, toolbarRect.top)) : 0;
    return {
      strip: { left: strip.left, right: strip.right, top: strip.top, bottom: strip.bottom, width: strip.width, height: strip.height },
      thumbnail: { left: thumbnail.left, right: thumbnail.right, top: thumbnail.top, bottom: thumbnail.bottom, width: thumbnail.width },
      stage: { left: stage.left, right: stage.right, top: stage.top, bottom: stage.bottom, width: stage.width, height: stage.height },
      stripDirection: stripStyle.flexDirection,
      bubbleToolbar: toolbar && toolbarRect ? {
        position: getComputedStyle(toolbar).position,
        intersectionArea: intersectionWidth * intersectionHeight,
        buttonTopDelta: toolbarButtonRects.length ? Math.max(...toolbarButtonRects.map((rect) => rect.top)) - Math.min(...toolbarButtonRects.map((rect) => rect.top)) : 0,
        top: toolbarRect.top,
        bottom: toolbarRect.bottom,
      } : null,
    };
  });
  const expectedWidth = viewport.width === 1440 ? 112 : viewport.width === 1024 ? 100 : 56;
  if (Math.abs(geometry.thumbnail.width - expectedWidth) > 1) {
    throw new Error(`${viewport.width} 말풍선 썸네일 폭 불일치: ${JSON.stringify({ expectedWidth, geometry })}`);
  }
  if (viewport.width === 390 && geometry.stripDirection !== "row") {
    throw new Error(`390 말풍선 스트립이 가로가 아닙니다: ${JSON.stringify(geometry)}`);
  }
  if (viewport.width !== 390 && geometry.strip.bottom > geometry.stage.bottom + 1) {
    throw new Error(`${viewport.width} 말풍선 스트립이 카드 아래로 넘습니다: ${JSON.stringify(geometry)}`);
  }
  if (!geometry.bubbleToolbar) throw new Error(`${viewport.width} 선택 말풍선 툴바를 찾지 못했습니다`);
  if (viewport.width !== 390 && geometry.bubbleToolbar.intersectionArea > 0.5) {
    throw new Error(`${viewport.width} 선택 말풍선과 툴바가 겹칩니다: ${JSON.stringify(geometry.bubbleToolbar)}`);
  }
  if (viewport.width !== 390 && geometry.bubbleToolbar.buttonTopDelta > 1) {
    throw new Error(`${viewport.width} 말풍선 툴바가 한 줄이 아닙니다: ${JSON.stringify(geometry.bubbleToolbar)}`);
  }
  if (viewport.width === 390 && geometry.bubbleToolbar.position !== "static") {
    throw new Error(`390 말풍선 내부 툴바 배치가 유지되지 않았습니다: ${JSON.stringify(geometry.bubbleToolbar)}`);
  }
  const overflow = await assertNoOverflow(page, '[data-room="edit"]', `말풍선 덱 ${viewport.width}`);
  await panel.evaluate((node) => {
    node.scrollIntoView({ block: "start" });
    window.scrollBy(0, -16);
  });
  const screenshot = path.join(outputDir, `edit-bubble-deck-${viewport.width}x${viewport.height}.png`);
  await page.screenshot({ path: screenshot });
  await assertVisibleEditorControlsDoNotOverlap(panel, `말풍선 덱 편집 영역 ${viewport.width}`);
  const stageScreenshot = path.join(outputDir, `edit-bubble-stage-${viewport.width}x${viewport.height}.png`);
  await panel.locator("[data-card-deck-stage]").screenshot({ path: stageScreenshot });
  observations.push({ screen: "edit-bubble-deck", ...viewport, geometry, overflow, thumbnailCount, toolbarCount: 0 });
  return { screenshot, stageScreenshot };
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
  for (const viewport of viewports.filter(({ width }) => requestedViewportWidths.has(width))) {
    const cardShots = await captureCard(viewport);
    await captureBakedTextCard(viewport);
    if (viewport.width === 1440 || viewport.width === 390) {
      await captureUnrecoverableTextCard(viewport, 1);
      await captureUnrecoverableTextCard(viewport, 2);
    }
    const bubbleShots = await captureBubbleDeck(viewport);
    await captureVideoEmpty(viewport);
    if (viewport.width === 390) await captureVideoActual(viewport);
    await capturePublish(viewport);
    // 일반 카드의 승인 기준은 화면 crop이 아니라 브라우저 fixture에 주입한 생성 이미지다.
    // 화면 clean-frame은 말풍선 덱을 담고 있으므로 일반 카드와 비교하면 오배선 회귀를 다시 허용한다.
    const cardReference = path.join(repoRoot, "dashboard/public/qa/alignment-card-1.jpg");
    const bubbleReference = path.join(referenceRoot, `osmu-v70-편집실-카드뉴스-편집중@${viewport.width}x${viewport.height}.png`);
    if (compareWithReferences) {
      const cardStageDiffScore = await makeDirectStageComparison(cardReference, cardShots.stageScreenshot, path.join(outputDir, `compare-edit-card-stage-${viewport.width}.png`), viewport.width, "일반 카드 스테이지");
      // 승인 clean-frame의 편집 영역은 말풍선 내용과 선택 상태가 fixture와 다르다.
      // 구현 캡처를 clean-frame으로 승격해 자기 자신과 비교하지 않는다. 픽셀 대조는
      // 육안 리포트만 만들고, CI 판정은 위 captureBubbleDeck의 폭·비율·겹침·툴바
      // 위치 수치 계약으로 한다.
      const bubbleStageDiffScore = await makeStageComparison(
        bubbleReference,
        bubbleShots.stageScreenshot,
        path.join(outputDir, `compare-edit-bubble-stage-${viewport.width}.png`),
        viewport.width,
        { enforceThreshold: false, kindLabel: "말풍선 스테이지" },
      );
      observations.push({ screen: "edit-card-stage-diff", ...viewport, stageDiffScore: cardStageDiffScore, stageDiffThreshold, reference: path.relative(repoRoot, cardReference) });
      observations.push({ screen: "edit-bubble-stage-diff", ...viewport, stageDiffScore: bubbleStageDiffScore, stageDiffThreshold, gateMode: "report-only", reference: path.relative(repoRoot, bubbleReference) });
    }
  }
  if (consoleErrors.length) throw new Error(`브라우저 콘솔 오류 ${consoleErrors.length}건: ${consoleErrors.slice(0, 5).join(" | ")}`);
  for (const name of fs.readdirSync(outputDir)) {
    if (name.startsWith("failed-") && name.endsWith(".png")) fs.unlinkSync(path.join(outputDir, name));
  }
  const report = {
    observations,
    consoleErrorCount: 0,
    outputDir,
    referenceComparison: compareWithReferences,
    visualDiffMutationCheck,
    imageDiffNote: "일반 카드는 생성 이미지 fixture와 실제 무대를 비교해 CI 판정한다. 말풍선 덱은 승인 clean-frame의 카드 영역과 대조 리포트만 만들며, CI는 폭·비율·겹침·툴바 위치 수치 계약으로 판정한다.",
  };
  fs.writeFileSync(path.join(outputDir, "observations.json"), `${JSON.stringify(report, null, 2)}\n`);
  process.stdout.write(`${JSON.stringify(report, null, 2)}\n`);
} finally {
  await browser.close();
}
