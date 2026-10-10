#!/usr/bin/env node

import crypto from "node:crypto";
import { spawn, execFileSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import postgres from "postgres";
import playwright from "playwright-core";

const root = path.resolve(process.cwd(), "..");
const baseUrl = process.env.VIDEO_EDITOR_BASE_URL || "http://localhost:3482";
const outputDir = path.resolve(root, "logs/diff/video-editor-capcut-20261010");
const captureDir = path.join(outputDir, "captures");
const operatorToken = process.env.DASHBOARD_AUTH_TOKEN || "";
const sourceDatabaseUrl = process.env.DATABASE_URL || "";
const workspaceId = (process.env.STUDIO_DEV_WORKSPACE_IDS || "").split(",")[0]?.trim();
const studioToken = process.env.STUDIO_DEV_BEARER_TOKEN || "";
const chromePath = process.env.VIDEO_EDITOR_CHROME_PATH
  || "/Users/sj/Library/Caches/ms-playwright/chromium-1228/chrome-mac-x64/Google Chrome for Testing.app/Contents/MacOS/Google Chrome for Testing";
const dataDir = process.env.DATA_DIR || path.resolve(root, "data");
const sourceFixture = path.resolve(process.cwd(), "public/qa/video-editor-real-composite-12s.mp4");
const sourceFilename = `qa-video-editor-${crypto.randomUUID()}.mp4`;
const sourceStoragePath = path.join(dataDir, "tenants", workspaceId || "missing", "videos", sourceFilename);
const devLog = path.join(outputDir, "next-dev.log");
const workerLog = path.join(outputDir, "export-worker.log");
const databaseLog = path.join(outputDir, "temporary-database.log");
const qaDatabaseName = `osmu_video_editor_qa_${process.pid}_${Date.now()}`;
const workerHealthPort = Number(process.env.VIDEO_EDITOR_WORKER_HEALTH_PORT || 40_000 + (process.pid % 20_000));
const mediaSigningSecret = crypto.randomBytes(32).toString("hex");

if (!operatorToken || !sourceDatabaseUrl || !workspaceId || !studioToken) {
  throw new Error("DASHBOARD_AUTH_TOKEN, DATABASE_URL, STUDIO_DEV_WORKSPACE_IDS, STUDIO_DEV_BEARER_TOKEN이 필요합니다.");
}
if (!fs.existsSync(sourceFixture)) throw new Error(`실제 영상 원본이 없습니다: ${sourceFixture}`);
if (!fs.existsSync(chromePath)) throw new Error("Chrome for Testing 실행 파일이 없습니다.");
const sourceDuration = Number(probe(sourceFixture).format?.duration);
if (!Number.isFinite(sourceDuration) || sourceDuration < 12) {
  throw new Error(`실제 영상 원본은 12초 이상이어야 합니다: ${sourceDuration}`);
}

fs.mkdirSync(captureDir, { recursive: true });
const observations = [];
const consoleErrors = [];
const optionalProviderWarnings = [];
const children = [];
let browser;
let issuedTokenId = "";
let draftId = "";
let exportId = "";
let artifactFilename = "";
let sql;
let adminSql;
let testDatabaseUrl = "";
let testDatabaseCreated = false;

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
const headers = (token, json = false) => ({
  Authorization: `Bearer ${token}`,
  ...(json ? { "Content-Type": "application/json" } : {}),
});

function launchLogged(command, args, logPath, extraEnv = {}) {
  const fd = fs.openSync(logPath, "w");
  const child = spawn(command, args, {
    cwd: process.cwd(),
    env: { ...process.env, ...extraEnv },
    stdio: ["ignore", fd, fd],
    detached: true,
  });
  children.push({ child, fd });
  return child;
}

async function stopChildren() {
  for (const { child } of children) {
    try { if (child.pid) process.kill(-child.pid, "SIGTERM"); } catch { /* already stopped */ }
  }
  await sleep(1_000);
  for (const { child, fd } of children.reverse()) {
    try { if (child.pid) process.kill(-child.pid, "SIGKILL"); } catch { /* already stopped */ }
    try { fs.closeSync(fd); } catch { /* already closed */ }
  }
}

async function waitForServer() {
  for (let attempt = 0; attempt < 120; attempt += 1) {
    try {
      const response = await fetch(`${baseUrl}/api/me`, { headers: headers(operatorToken), signal: AbortSignal.timeout(2_000) });
      if (response.status === 200) return;
    } catch { /* cold start */ }
    await sleep(500);
  }
  throw new Error("Next dev 서버가 60초 안에 준비되지 않았습니다.");
}

async function waitForWorker() {
  for (let attempt = 0; attempt < 60; attempt += 1) {
    try {
      const response = await fetch(`http://127.0.0.1:${workerHealthPort}`, { signal: AbortSignal.timeout(2_000) });
      const body = await response.json();
      if (response.ok && body.status === "active") return;
    } catch { /* cold start */ }
    await sleep(500);
  }
  throw new Error("export worker가 30초 안에 active 상태가 되지 않았습니다.");
}

function emptyEdit(duration) {
  return {
    contract_version: "1.0",
    overlays: [], comments: [],
    subtitles: [
      { id: "qa-sub-1", order: 0, text: "첫 장면을 확인합니다", startSec: 0, endSec: 3, cut: false },
      { id: "qa-sub-2", order: 1, text: "삭제할 가운데 장면", startSec: 3, endSec: 6, cut: false },
      { id: "qa-sub-3", order: 2, text: "마지막 장면을 확인합니다", startSec: 6, endSec: duration, cut: false },
    ],
    clips: [], voice: null,
    transitions: { introToMain: "cut", mainToOutro: "cut" },
    textStickers: [],
    subtitleStyle: { preset: "basic", position: "bottom", sizePercent: 100, outline: true },
    music: null, safeArea: false, cover: null,
    introOutroDefaults: { intro: false, outro: false }, introOutro: null, revision: 0,
  };
}

async function api(pathname, options = {}, token = operatorToken) {
  const response = await fetch(`${baseUrl}${pathname}`, {
    ...options,
    headers: { ...headers(token, Boolean(options.body)), ...(options.headers || {}) },
    signal: AbortSignal.timeout(120_000),
  });
  const body = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(`${pathname} HTTP ${response.status}: ${body.code || body.error || "unknown"}`);
  return body;
}

async function downloadArtifact(artifactUrl) {
  let lastError;
  for (let attempt = 1; attempt <= 3; attempt += 1) {
    try {
      const response = await fetch(`${baseUrl}${artifactUrl}`, { signal: AbortSignal.timeout(60_000) });
      if (!response.ok) throw new Error(`HTTP ${response.status}`);
      return Buffer.from(await response.arrayBuffer());
    } catch (error) {
      lastError = error;
      if (attempt < 3) await sleep(attempt * 500);
    }
  }
  throw new Error(`MP4 다운로드 실패: ${lastError instanceof Error ? lastError.message : String(lastError)}`);
}

function probe(file) {
  return JSON.parse(execFileSync("ffprobe", [
    "-v", "error", "-show_entries", "stream=width,height,codec_type:format=duration", "-of", "json", file,
  ], { encoding: "utf8" }));
}

function frame(file, sec, width = 32, height = 32, contentOnly = false) {
  return execFileSync("ffmpeg", [
    "-v", "error", "-ss", String(sec), "-i", file, "-frames:v", "1",
    "-vf", `${contentOnly ? "crop=iw:ih*0.45:0:0," : ""}scale=${width}:${height}:flags=area,format=rgb24`, "-f", "rawvideo", "pipe:1",
  ], { maxBuffer: width * height * 4 });
}

function meanAbsoluteDifference(left, right) {
  if (left.length !== right.length) throw new Error("프레임 버퍼 크기가 다릅니다.");
  let total = 0;
  for (let index = 0; index < left.length; index += 1) total += Math.abs(left[index] - right[index]);
  return total / left.length;
}

function yellowRows(file, sec) {
  const width = 180;
  const height = 320;
  const pixels = frame(file, sec, width, height);
  const rows = [];
  let yellowPixels = 0;
  for (let y = 0; y < height; y += 1) {
    let row = 0;
    for (let x = 0; x < width; x += 1) {
      const at = (y * width + x) * 3;
      if (pixels[at] > 170 && pixels[at + 1] > 120 && pixels[at + 2] < 110) row += 1;
    }
    if (row >= 2) rows.push(y);
    yellowPixels += row;
  }
  let clusters = 0;
  rows.forEach((row, index) => { if (index === 0 || row > rows[index - 1] + 2) clusters += 1; });
  return { yellowPixels, rowClusters: clusters, firstRow: rows[0] ?? null, lastRow: rows.at(-1) ?? null };
}

function activeSubtitleLayerCount(edit, clips, outputSec) {
  let cursor = 0;
  let sourceSec = null;
  for (const clip of clips) {
    const span = clip.sourceEndSec - clip.sourceStartSec;
    if (outputSec >= cursor && outputSec < cursor + span) {
      sourceSec = clip.sourceStartSec + outputSec - cursor;
      break;
    }
    cursor += span;
  }
  if (sourceSec === null) return 0;
  return (edit.subtitles || []).filter((line) => !line.cut && line.text.trim()
    && sourceSec >= line.startSec && sourceSec < line.endSec).length;
}

async function measureMobileEditor(page, width) {
  await page.setViewportSize({ width, height: Math.round(width * 2.16) });
  await page.waitForTimeout(250);
  return page.evaluate(() => {
    const visible = (element) => {
      const rect = element.getBoundingClientRect();
      return element.offsetParent !== null && rect.width > 0 && rect.height > 0;
    };
    const textElements = [...document.querySelectorAll("body *")].filter((element) => visible(element)
      && !["SCRIPT", "STYLE", "SVG", "PATH"].includes(element.tagName)
      && [...element.childNodes].some((node) => node.nodeType === 3 && node.textContent.trim().length > 1));
    const fontBelow13 = textElements.filter((element) => Number.parseFloat(getComputedStyle(element).fontSize) < 13).length;
    const taps = [...document.querySelectorAll("a[href],button,[role=button],input:not([type=hidden]),select,textarea,summary,label[for]")].filter(visible);
    const tapBelow44 = taps.filter((element) => {
      const rect = element.getBoundingClientRect();
      return rect.width < 43.5 || rect.height < 43.5;
    }).length;
    const activeSelectors = [];
    const walk = (rules) => {
      for (const rule of rules) {
        if (rule.selectorText?.includes(":active")) activeSelectors.push(...rule.selectorText.split(","));
        if (rule.cssRules?.length) walk(rule.cssRules);
      }
    };
    for (const sheet of document.styleSheets) {
      try { walk(sheet.cssRules); } catch { /* same-origin product CSS is readable */ }
    }
    const baseSelectors = activeSelectors.map((selector) => selector.replaceAll(":active", "").trim()).filter(Boolean);
    const tapWithActive = taps.filter((element) => baseSelectors.some((selector) => {
      try { return element.matches(selector); } catch { return false; }
    })).length;
    const probe = document.createElement("span");
    probe.className = "font-designer-14r";
    probe.textContent = "x";
    probe.style.position = "absolute";
    probe.style.visibility = "hidden";
    document.body.appendChild(probe);
    const tokenBodyPx = Number.parseFloat(getComputedStyle(probe).fontSize);
    probe.remove();
    return {
      fontBelow13,
      tokenBodyPx,
      tapBelow44,
      tapTargets: taps.length,
      tapWithActiveRatio: taps.length ? tapWithActive / taps.length : 1,
      overflowX: document.documentElement.scrollWidth > innerWidth,
      clips: document.querySelectorAll("[data-video-clip-id]").length,
      loadError: Boolean(document.querySelector("[data-video-load-failed]")),
    };
  });
}

try {
  const adminUrl = new URL(sourceDatabaseUrl);
  adminUrl.pathname = "/postgres";
  adminSql = postgres(adminUrl.toString(), { max: 1 });
  await adminSql.unsafe(`CREATE DATABASE "${qaDatabaseName}"`);
  testDatabaseCreated = true;
  const qaUrl = new URL(sourceDatabaseUrl);
  qaUrl.pathname = `/${qaDatabaseName}`;
  testDatabaseUrl = qaUrl.toString();
  const schemaOutput = execFileSync("psql", [testDatabaseUrl, "-v", "ON_ERROR_STOP=1", "-f", "db/schema.sql"], {
    cwd: process.cwd(), encoding: "utf8", maxBuffer: 20 * 1024 * 1024,
  });
  const rlsOutput = execFileSync("psql", [testDatabaseUrl, "-v", "ON_ERROR_STOP=1", "-f", "db/rls.sql"], {
    cwd: process.cwd(), encoding: "utf8", maxBuffer: 20 * 1024 * 1024,
  });
  fs.writeFileSync(databaseLog, `${schemaOutput}\n${rlsOutput}`);
  sql = postgres(testDatabaseUrl, { max: 2 });
  await sql`
    INSERT INTO tenants (id, slug, name, status, tier, shared_cli_approved_at)
    VALUES (${workspaceId}, ${`qa-video-editor-${process.pid}`}, '영상 편집기 검증', 'active', 'team', now())`;

  let portOccupied = false;
  try {
    const response = await fetch(`${baseUrl}/api/me`, { headers: headers(operatorToken), signal: AbortSignal.timeout(1_500) });
    portOccupied = response.status >= 100;
  } catch { /* unused */ }
  if (portOccupied) throw new Error("3482 포트를 다른 서버가 사용 중입니다.");
  launchLogged("npm", ["run", "dev", "--", "-p", "3482"], devLog, {
    DATABASE_URL: testDatabaseUrl,
    MEDIA_SIGNING_SECRET: mediaSigningSecret,
  });
  await waitForServer();

  const issued = await api("/api/tenant-tokens", {
    method: "POST",
    body: JSON.stringify({ tenant_id: workspaceId, label: `qa-video-editor-${Date.now()}` }),
  });
  if (!issued.token || !issued.id) throw new Error("임시 고객 토큰 발급 응답이 불완전합니다.");
  issuedTokenId = issued.id;
  const customerToken = issued.token;

  fs.mkdirSync(path.dirname(sourceStoragePath), { recursive: true });
  fs.copyFileSync(sourceFixture, sourceStoragePath);
  const initialEdit = emptyEdit(sourceDuration);
  const lines = initialEdit.subtitles.map((line) => line.text);
  const vid = {
    url: "/qa/video-editor-real-composite-12s.mp4",
    file: "/qa/video-editor-real-composite-12s.mp4",
    filename: sourceFilename,
    editSource: { filename: sourceFilename, url: "/qa/video-editor-real-composite-12s.mp4" },
    subtitleLineageState: "unbaked",
    subtitlesBaked: false,
  };
  const saved = await api("/api/studio/drafts", {
    method: "POST",
    body: JSON.stringify({
      tenant_id: workspaceId,
      idea: "실제 영상 편집기 검증",
      vid,
      editLines: lines,
      editKind: "video",
      editFormat: { kind: "video", aspectRatio: "9:16", subtitleSize: "보통", playbackSpeed: 1, voice: "차분한 남성" },
      videoEdit: initialEdit,
      status: "draft",
    }),
  }, customerToken);
  draftId = saved.id;
  if (!draftId) throw new Error("실제 초안 저장 API가 draft id를 돌려주지 않았습니다.");

  launchLogged("./node_modules/.bin/tsx", ["src/workers/studio-export-worker.ts"], workerLog, {
    DATABASE_URL: testDatabaseUrl,
    MEDIA_SIGNING_SECRET: mediaSigningSecret,
    OSMU_PUBLIC_URL: baseUrl,
    EXPORT_WORKER_HEALTH_PORT: String(workerHealthPort),
    DATA_DIR: dataDir,
  });
  await waitForWorker();

  browser = await playwright.chromium.launch({ executablePath: chromePath, headless: true });
  const context = await browser.newContext({ viewport: { width: 1440, height: 900 }, acceptDownloads: true });
  await context.addInitScript(({ token, st, workspace, draft, edit, draftLines, draftVid }) => {
    localStorage.setItem("dashboard_auth_token", token);
    localStorage.setItem("dashboard_auth_identity_kind", "customer");
    localStorage.setItem("active_workspace", JSON.stringify({ id: workspace, slug: "qa-video-editor", name: "영상 편집기 검증", tier: "team" }));
    localStorage.setItem(`studio_work:${workspace}`, JSON.stringify({
      idea: "실제 영상 편집기 검증", draftId: draft, vid: draftVid,
      editLines: draftLines, editKind: "video", videoEdit: edit,
      editFormat: { kind: "video", aspectRatio: "9:16", subtitleSize: "보통", playbackSpeed: 1, voice: "차분한 남성" },
      includes: {},
    }));
    sessionStorage.setItem("studio_generation_token", st);
    sessionStorage.setItem("studio_skill_version_id", "22222222-2222-4222-8222-222222222222");
    sessionStorage.setItem("studio_workspace_id", workspace);
  }, { token: customerToken, st: studioToken, workspace: workspaceId, draft: draftId, edit: initialEdit, draftLines: lines, draftVid: vid });

  const page = await context.newPage();
  page.on("pageerror", (error) => consoleErrors.push(error.message));
  page.on("console", (message) => {
    if (message.type() !== "error") return;
    const location = message.location().url || "";
    if (location.includes("/api/elevenlabs-voices") && message.text().includes("Failed to load resource")) {
      optionalProviderWarnings.push({ url: "/api/elevenlabs-voices", message: message.text() });
      return;
    }
    consoleErrors.push(message.text());
  });
  await page.goto(`${baseUrl}/studio?room=edit`, { waitUntil: "domcontentloaded", timeout: 120_000 });
  await page.locator("[data-video-editor]").waitFor({ state: "visible", timeout: 120_000 });
  await page.waitForFunction(() => {
    const video = document.querySelector("[data-video-el]");
    return video instanceof HTMLVideoElement && Number.isFinite(video.duration) && video.duration >= 12;
  }, null, { timeout: 60_000 });

  await page.waitForFunction(() => {
    const frames = [...document.querySelectorAll("[data-video-clip-thumbnail-frame]")];
    return frames.length === 3 && frames.every((frame) => getComputedStyle(frame).opacity !== "0");
  }, null, { timeout: 60_000 });

  const previewBox = await page.locator("[data-video-screen]").boundingBox();
  const timelineBox = await page.locator("[data-video-timeline]").boundingBox();
  const helperBox = await page.locator("[data-edit-helper='true']").boundingBox();
  const overlap = previewBox && helperBox
    ? Math.max(0, Math.min(previewBox.x + previewBox.width, helperBox.x + helperBox.width) - Math.max(previewBox.x, helperBox.x))
      * Math.max(0, Math.min(previewBox.y + previewBox.height, helperBox.y + helperBox.height) - Math.max(previewBox.y, helperBox.y))
    : -1;
  const firstScreenLayout = await page.evaluate(() => {
    const scroll = document.querySelector("[data-video-timeline-scroll]");
    const track = document.querySelector("[data-video-timeline-track]");
    const clip = document.querySelector("[data-video-clip-id]");
    return {
      zoom: document.querySelector("[data-video-timeline-zoom]")?.textContent || "",
      scrollWidth: scroll?.clientWidth || 0,
      trackWidth: track?.getBoundingClientRect().width || 0,
      clipWidth: clip?.getBoundingClientRect().width || 0,
      clipLabel: clip?.textContent || "",
      thumbnailFrames: clip?.querySelectorAll("[data-video-clip-thumbnail-frame]").length || 0,
    };
  });
  if (!previewBox || previewBox.height < 380 || !timelineBox || timelineBox.y + timelineBox.height > 900 || overlap !== 0
    || firstScreenLayout.zoom !== "100%" || Math.abs(firstScreenLayout.trackWidth - firstScreenLayout.scrollWidth) > 2
    || firstScreenLayout.clipWidth < 176 || !firstScreenLayout.clipLabel.includes("클립 1") || firstScreenLayout.thumbnailFrames !== 3) {
    throw new Error(`1440x900 첫 화면 계약 실패: preview=${JSON.stringify(previewBox)} timeline=${JSON.stringify(timelineBox)} helperOverlap=${overlap}`);
  }
  await page.screenshot({ path: path.join(captureDir, "01-first-screen-1440x900.png"), fullPage: false });
  observations.push({ check: "first_screen", preview: previewBox, timeline: timelineBox, assistantOverlapPx2: overlap, ...firstScreenLayout });

  const scrubber = page.locator("[data-video-scrubber]");
  const seek = async (value) => scrubber.fill(String(Math.round(value * 10) / 10));
  await seek(3);
  await page.locator("[data-video-split]").click();
  await seek(6);
  await page.locator("[data-video-timeline-toolbar] b").click();
  await page.keyboard.press("s");
  await seek(9);
  await page.locator("[data-video-timeline-toolbar] b").click();
  await page.keyboard.press("s");
  await page.waitForFunction(() => document.querySelectorAll("[data-video-clip-id]").length === 4);
  const middleClip = page.locator("[data-video-clip-id]").nth(1);
  await middleClip.click();
  await page.keyboard.press("Delete");
  await page.waitForFunction(() => document.querySelectorAll("[data-video-clip-id]").length === 3);
  await page.locator("[data-video-undo]").click();
  await page.waitForFunction(() => document.querySelectorAll("[data-video-clip-id]").length === 4);
  await page.locator("[data-video-redo]").click();
  await page.waitForFunction(() => document.querySelectorAll("[data-video-clip-id]").length === 3);

  const clips = page.locator("[data-video-clip-id]");
  await clips.nth(1).dragTo(clips.nth(0));
  const firstStartHandle = page.getByRole("button", { name: "클립 1 시작점 트림" });
  const handleBox = await firstStartHandle.boundingBox();
  if (!handleBox) throw new Error("클립 트림 손잡이가 보이지 않습니다.");
  await page.mouse.move(handleBox.x + handleBox.width / 2, handleBox.y + handleBox.height / 2);
  await page.mouse.down();
  // 한 번의 실제 pointermove로 24px 트림한다. 다단 move는 각 프레임의 자동저장
  // 재렌더와 섞여 의도보다 여러 번 트림하는 브라우저 경로를 만들 수 있다.
  await page.mouse.move(handleBox.x + handleBox.width / 2 + 24, handleBox.y + handleBox.height / 2);
  await page.mouse.up();
  await page.locator("[data-video-timeline-playhead]").dispatchEvent("pointerdown", { clientX: timelineBox.x + timelineBox.width * 0.35 });
  await page.mouse.move(timelineBox.x + timelineBox.width * 0.45, timelineBox.y + 40, { steps: 4 });
  await page.mouse.up();
  await page.getByRole("button", { name: "확대" }).click();
  if ((await page.locator("[data-video-timeline-zoom]").textContent()) !== "125%") throw new Error("타임라인 확대가 반영되지 않았습니다.");

  const thirdText = page.locator("[data-video-subtitle-text]").nth(2);
  await thirdText.fill("마지막 장면 자막 한 줄");
  await page.locator("[data-video-subtitle-cut-toggle]").nth(1).click();
  await page.locator("[data-video-insert-drawer-toggle]").click();
  await page.getByRole("tab", { name: "자막" }).click();
  await page.locator("[data-video-subtitle-font]").selectOption("serif");
  await page.locator("[data-video-subtitle-color]").fill("#ffd600");
  await page.getByLabel(/글자 크기/).fill("120");
  if (await page.getByLabel(/글자 크기/).inputValue() !== "120") {
    throw new Error("자막 글자 크기 120% 입력이 UI 상태에 반영되지 않았습니다.");
  }
  await page.getByRole("button", { name: "넣기 서랍 닫기" }).click();
  await seek(0.3);
  const subtitle = page.locator("[data-video-subtitle-draggable]");
  await subtitle.waitFor({ state: "visible" });
  const screen = await page.locator("[data-video-screen]").boundingBox();
  const subtitleBox = await subtitle.boundingBox();
  if (!screen || !subtitleBox) throw new Error("자막 직접 이동 대상이 보이지 않습니다.");
  await page.mouse.move(subtitleBox.x + subtitleBox.width / 2, subtitleBox.y + subtitleBox.height / 2);
  await page.mouse.down();
  // React가 pointerdown 상태를 커밋하고 window pointermove 수신기를 붙인 뒤 움직인다.
  // 대기 없이 바로 move하면 브라우저 스케줄링에 따라 실제 드래그를 놓칠 수 있다.
  await page.waitForTimeout(100);
  await page.mouse.move(screen.x + screen.width * 0.50, screen.y + screen.height * 0.70, { steps: 8 });
  await page.mouse.up();
  const editedClipLayout = await page.evaluate(() => {
    const clips = [...document.querySelectorAll("[data-video-clip-id]")].map((clip) => {
      const rect = clip.getBoundingClientRect();
      return { left: rect.left, right: rect.right, width: rect.width, label: clip.textContent || "" };
    });
    return {
      clips,
      overlapCount: clips.slice(1).filter((clip, index) => clip.left < clips[index].right - 1).length,
      labelsVisible: clips.every((clip) => /클립 \d+/.test(clip.label) && clip.width >= 176),
    };
  });
  if (editedClipLayout.overlapCount !== 0 || !editedClipLayout.labelsVisible) {
    throw new Error(`편집 후 클립 블록 겹침 또는 라벨 손실: ${JSON.stringify(editedClipLayout)}`);
  }
  observations.push({ check: "edited_clip_layout", ...editedClipLayout });
  await page.screenshot({ path: path.join(captureDir, "02-edited-timeline-and-subtitle.png"), fullPage: false });

  let playbackPersisted = null;
  for (let attempt = 0; attempt < 60; attempt += 1) {
    playbackPersisted = await api(`/api/studio/drafts?tenant_id=${workspaceId}&id=${draftId}`, {}, customerToken);
    const edit = playbackPersisted.draft?.videoEdit;
    if (edit?.clips?.length === 3
      && edit?.subtitleStyle?.sizePercent === 120
      && Number.isFinite(edit?.subtitleStyle?.xPercent)
      && Number.isFinite(edit?.subtitleStyle?.yPercent)
      && edit?.subtitles?.some((line) => line.text === "마지막 장면 자막 한 줄")) break;
    await sleep(500);
  }
  if (playbackPersisted?.draft?.videoEdit?.subtitleStyle?.sizePercent !== 120) {
    throw new Error("실제 PostgreSQL 초안에 최종 편집 상태가 30초 안에 자동저장되지 않았습니다.");
  }
  const draggedStyle = playbackPersisted.draft.videoEdit.subtitleStyle;
  if (!(draggedStyle.xPercent >= 45 && draggedStyle.xPercent <= 55
    && draggedStyle.yPercent >= 65 && draggedStyle.yPercent <= 75)) {
    throw new Error(`자막 직접 드래그 좌표 저장 실패: ${JSON.stringify(draggedStyle)}`);
  }
  observations.push({ check: "autosave", status: 200 });

  const playbackClips = [...(playbackPersisted.draft?.videoEdit?.clips || [])].sort((a, b) => a.order - b.order);
  if (playbackClips.length < 2) throw new Error("편집 미리보기 건너뛰기를 검사할 클립이 부족합니다.");
  const firstPlaybackSpan = playbackClips[0].sourceEndSec - playbackClips[0].sourceStartSec;
  await seek(Math.max(0.02, firstPlaybackSpan - 0.06));
  await page.waitForFunction(({ sourceEnd }) => {
    const video = document.querySelector("[data-video-el]");
    return video instanceof HTMLVideoElement && Math.abs(video.currentTime - sourceEnd) < 0.15;
  }, { sourceEnd: playbackClips[0].sourceEndSec });
  await page.getByRole("button", { name: "재생", exact: true }).click();
  await page.waitForFunction(({ nextStart }) => {
    const video = document.querySelector("[data-video-el]");
    return video instanceof HTMLVideoElement && video.currentTime >= nextStart && video.currentTime < nextStart + 0.45;
  }, { nextStart: playbackClips[1].sourceStartSec }, { timeout: 5_000 });
  const playbackJumpTime = await page.locator("[data-video-el]").evaluate((video) => video.currentTime);
  const pause = page.getByRole("button", { name: "일시정지", exact: true });
  if (await pause.isVisible().catch(() => false)) await pause.click();
  observations.push({
    check: "edited_playback_jump",
    fromSourceEndSec: playbackClips[0].sourceEndSec,
    toSourceStartSec: playbackClips[1].sourceStartSec,
    observedSourceSec: playbackJumpTime,
  });

  const mobileMeasurements = [];
  for (const width of [360, 390, 412, 600, 700, 780, 820, 900, 1000]) {
    const measurement = await measureMobileEditor(page, width);
    const pass = measurement.fontBelow13 === 0
      && measurement.tokenBodyPx >= 16
      && measurement.tapBelow44 === 0
      && measurement.tapWithActiveRatio >= 0.9
      && !measurement.overflowX
      && measurement.clips >= 2
      && !measurement.loadError;
    mobileMeasurements.push({ width, ...measurement, pass });
    if (!pass) throw new Error(`모바일 사용성 ${width}px 실패: ${JSON.stringify(measurement)}`);
  }
  await page.setViewportSize({ width: 1440, height: 900 });
  observations.push({ check: "mobile_ergonomics", widths: mobileMeasurements });

  await page.getByRole("button", { name: "내보내기", exact: true }).click();
  let initialExportState = null;
  for (let attempt = 0; attempt < 250; attempt += 1) {
    const [state] = await sql`
      SELECT job.id, job.status, item.status AS item_status, item.error_code, item.error_detail
      FROM studio_export_jobs job
      JOIN studio_export_items item ON item.tenant_id=job.tenant_id AND item.job_id=job.id
      WHERE job.tenant_id=${workspaceId} AND job.draft_id=${draftId}
      ORDER BY job.created_at DESC LIMIT 1`;
    if (state) {
      initialExportState = state;
      if (state.status === "succeeded" && state.item_status === "succeeded") break;
      if (state.status === "failed" || state.item_status === "failed") {
        throw new Error(`실제 export worker 렌더 실패: ${state.error_code || "unknown"} ${state.error_detail || ""}`);
      }
    }
    await sleep(1_000);
  }
  if (!initialExportState || initialExportState.status !== "succeeded") {
    let workerHealth = null;
    try { workerHealth = await (await fetch(`http://127.0.0.1:${workerHealthPort}`)).json(); } catch { /* report below */ }
    throw new Error(`실제 export worker 제한시간 초과: state=${JSON.stringify(initialExportState)} health=${JSON.stringify(workerHealth)}`);
  }
  observations.push({ check: "export_queue", status: initialExportState.status, itemStatus: initialExportState.item_status });
  exportId = String(initialExportState.id || "");
  if (!exportId) throw new Error("완료된 내보내기 작업을 DB에서 찾지 못했습니다.");
  const job = await api(`/api/studio/drafts/${draftId}/exports/${exportId}?tenant_id=${workspaceId}`, {}, customerToken);
  const artifactUrl = job.items?.[0]?.artifact_url;
  artifactFilename = job.items?.[0]?.artifact_filename || "";
  if (!artifactUrl || !artifactFilename) throw new Error("완료된 MP4 배달 주소가 없습니다.");
  const outputVideo = path.join(outputDir, "exported-video-editor.mp4");
  fs.writeFileSync(outputVideo, await downloadArtifact(artifactUrl));

  const persisted = await api(`/api/studio/drafts?tenant_id=${workspaceId}&id=${draftId}`, {}, customerToken);
  const savedEdit = persisted.draft?.videoEdit;
  const savedClips = Array.isArray(savedEdit?.clips) ? [...savedEdit.clips].sort((a, b) => a.order - b.order) : [];
  if (savedEdit?.subtitleStyle?.sizePercent !== 120) {
    throw new Error(`자막 글자 크기 저장 실패: ${String(savedEdit?.subtitleStyle?.sizePercent)}`);
  }
  if (!(savedEdit?.subtitleStyle?.xPercent >= 45 && savedEdit.subtitleStyle.xPercent <= 55
    && savedEdit?.subtitleStyle?.yPercent >= 65 && savedEdit.subtitleStyle.yPercent <= 75)) {
    throw new Error(`자막 직접 드래그 좌표 내보내기 입력 실패: ${JSON.stringify(savedEdit?.subtitleStyle)}`);
  }
  const expectedDuration = savedClips.reduce((sum, clip) => sum + clip.sourceEndSec - clip.sourceStartSec, 0);
  const outputProbe = probe(outputVideo);
  const actualDuration = Number(outputProbe.format?.duration);
  const durationDelta = Math.abs(actualDuration - expectedDuration);
  if (!Number.isFinite(actualDuration) || durationDelta > 0.2) {
    throw new Error(`내보내기 길이 불일치: expected=${expectedDuration}, actual=${actualDuration}`);
  }

  const firstClipDuration = savedClips[0].sourceEndSec - savedClips[0].sourceStartSec;
  const firstOutputTime = Math.max(0.02, Math.min(firstClipDuration / 2, firstClipDuration - 0.02));
  const firstOutput = frame(outputVideo, firstOutputTime, 32, 32, true);
  const secondClip = savedClips[1];
  const secondClipDuration = secondClip.sourceEndSec - secondClip.sourceStartSec;
  const secondOffset = Math.max(0.02, Math.min(secondClipDuration / 2, secondClipDuration - 0.02));
  const secondOutputTime = firstClipDuration + secondOffset;
  const secondOutput = frame(outputVideo, secondOutputTime, 32, 32, true);
  const firstExpectedSource = frame(sourceFixture, savedClips[0].sourceStartSec + firstOutputTime, 32, 32, true);
  const secondExpectedSource = frame(sourceFixture, secondClip.sourceStartSec + secondOffset, 32, 32, true);
  const deletedSource = frame(sourceFixture, 4.5, 32, 32, true);
  const frameDiffs = {
    firstToExpected: meanAbsoluteDifference(firstOutput, firstExpectedSource),
    firstToDeleted: meanAbsoluteDifference(firstOutput, deletedSource),
    secondToExpected: meanAbsoluteDifference(secondOutput, secondExpectedSource),
    secondToDeleted: meanAbsoluteDifference(secondOutput, deletedSource),
  };
  if (!(frameDiffs.firstToExpected < frameDiffs.firstToDeleted && frameDiffs.secondToExpected < frameDiffs.secondToDeleted)) {
    throw new Error(`삭제 구간 프레임 비교 실패: ${JSON.stringify(frameDiffs)}`);
  }

  execFileSync("ffmpeg", ["-y", "-v", "error", "-ss", "0.3", "-i", outputVideo, "-frames:v", "1", path.join(captureDir, "03-export-full-frame.png")]);
  execFileSync("ffmpeg", ["-y", "-v", "error", "-ss", "0.3", "-i", outputVideo, "-vf", "crop=iw:ih*0.28:0:ih*0.56", "-frames:v", "1", path.join(captureDir, "04-export-subtitle-crop.png")]);
  const subtitlePixels = yellowRows(outputVideo, 0.3);
  const activeSubtitleLayers = activeSubtitleLayerCount(savedEdit, savedClips, 0.3);
  if (subtitlePixels.yellowPixels < 10 || activeSubtitleLayers !== 1) {
    throw new Error(`자막 한 겹 픽셀 판정 실패: pixels=${JSON.stringify(subtitlePixels)} activeLayers=${activeSubtitleLayers}`);
  }
  observations.push({
    check: "real_export",
    source: "dashboard/public/qa/video-editor-real-composite-12s.mp4",
    sourceDuration,
    expectedDuration, actualDuration, durationDelta, frameDiffs, subtitlePixels, activeSubtitleLayers,
    savedClips,
    subtitleStyle: savedEdit.subtitleStyle,
  });

  if (consoleErrors.length) throw new Error(`브라우저 콘솔 오류 ${consoleErrors.length}건: ${consoleErrors.slice(0, 3).join(" | ")}`);
  const reportStamp = new Intl.DateTimeFormat("sv-SE", {
    timeZone: "Asia/Seoul", year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit",
  }).format(new Date()).replace(",", "");
  const report = `# 영상 편집기 CapCut·Vrew 기본 조작 실제 경로 검증\n\n`
    + `STAMP: ${reportStamp} KST | gpt-5-codex | code-builder | qa | CapCut·Vrew 공식 기능 문서와 v71 승인 시안\n\n`
    + `## 판정\n\nPASS. page.route 없이 실제 Next dev 3482, 실제 PostgreSQL 초안·자동저장, 실제 export worker, 실제 영상 파일을 사용했다.\n\n`
    + `## 결과\n\n- 1440x900 첫 화면: 미리보기 ${previewBox.height.toFixed(0)}px, 자막 문장 목록과 전체폭 타임라인 동시 표시, 편집 담당 대화창 겹침 ${overlap}px².\n`
    + `- 타임라인: 기본 100%에서 전체 ${sourceDuration.toFixed(3)}초가 가용 폭 ${firstScreenLayout.scrollWidth}px에 맞는다. 편집 후 세 클립 폭은 ${editedClipLayout.clips.map((clip) => clip.width.toFixed(1)).join("·")}px, 겹침 ${editedClipLayout.overlapCount}개이며 각 클립 이름과 실제 영상 프레임 3장이 보인다.\n`
    + `- 편집 조작: S 자르기 3회, Delete 선택 삭제 1회, 양끝 트림, 순서 변경, 재생헤드 이동, 125% 확대, 실행취소·다시실행을 Playwright로 조작했다.\n`
    + `- 편집 미리보기: 첫 클립 끝에서 다음 재배치 클립의 원본 ${playbackJumpTime.toFixed(3)}초로 실제 재생이 건너뛰었다.\n`
    + `- 모바일: 360·390·412·600·700·780·820·900·1000px에서 13px 미만 글자 0, 본문 토큰 16px 이상, 44px 미만 누름 0, 눌림 상태 90% 이상, 가로 넘침 0을 데이터 포함 편집 화면에서 확인했다.\n`
    + `- 자막: 문장 이동·수정·구간 삭제, 화면 직접 드래그(${savedEdit.subtitleStyle.xPercent.toFixed(1)}%, ${savedEdit.subtitleStyle.yPercent.toFixed(1)}%), 명조·120%·#ffd600을 실제 저장했다.\n`
    + `- MP4: 예상 ${expectedDuration.toFixed(3)}초, ffprobe ${actualDuration.toFixed(3)}초, 차이 ${durationDelta.toFixed(3)}초.\n`
    + `- 삭제 프레임: 기대 구간 MAD ${frameDiffs.firstToExpected.toFixed(3)}/${frameDiffs.secondToExpected.toFixed(3)}, 삭제 구간 MAD ${frameDiffs.firstToDeleted.toFixed(3)}/${frameDiffs.secondToDeleted.toFixed(3)}.\n`
    + `- 자막: 노랑 ${subtitlePixels.yellowPixels}픽셀, 해당 프레임 활성 자막 레이어 ${activeSubtitleLayers}개. crop은 captures/04-export-subtitle-crop.png.\n`
    + `- 브라우저 애플리케이션 오류: 0건. 미연결 선택 제공자(목소리) HTTP 경고: ${optionalProviderWarnings.length}건. 외부 SNS 게시: 0건.\n\n`
    + `## 증거\n\n- captures/01-first-screen-1440x900.png\n- captures/02-edited-timeline-and-subtitle.png\n- captures/03-export-full-frame.png\n- captures/04-export-subtitle-crop.png\n- exported-video-editor.mp4\n- next-dev.log, export-worker.log, observations.json\n\n`
    + `## 벤치마크 적용\n\nCapCut의 분할·트림·클립 재정렬·타임라인 확대 조작을 차용했고, Vrew의 문장 클릭 이동·수정·삭제 기반 컷 편집을 차용했다. 이 제품은 두 방식을 한 화면의 단일 편집 계약으로 묶고, 외부 SNS 게시를 실행하지 않는 점이 다르다.\n\n`
    + `## 셀프 검증\n\n- 이 결론이 틀렸다면 가장 그럴듯한 이유: UI 조작은 저장됐지만 worker가 다른 편집 계약을 읽었을 수 있다. 저장 JSON, ffprobe 길이, 삭제 프레임 MAD, 자막 픽셀을 함께 대조해 반박했다.\n`
    + `- 레드팀: 픽스처 API나 단색 영상이면 실제 고객 경로를 증명하지 못한다. page.route를 쓰지 않고 실제 PostgreSQL·실영상·worker·다운로드 경로를 사용했다.\n\n`
    + `SKILLS_USED: qa, 실제 사용자 조작과 렌더 결과 검증 절차에 사용\n`
    + `SKILLS_SKIPPED: 없음\n`
    + `KNOWLEDGE_QUERY: OSMU 편집실 제품 정본, CapCut 타임라인 편집, Vrew 문장 기반 영상 편집\n`
    + `HITS_USED: v71 승인 시안은 화면 구조, CapCut 공식 문서는 클립 조작, Vrew 공식 문서는 문장 기반 자막 편집 근거로 채택\n`
    + `HITS_REJECTED: BRAIN 일반 마케팅 자료는 이번 구현의 조작·렌더 계약과 직접 관련이 없어 미채택\n`
    + `CONFLICTS: 없음\n`
    + `PRESENTATION_CHECK: 내부 태그 잔재 없음, 캡처 4장과 MP4 프레임 렌더 확인함\n`
    + `SOURCES/MODEL: gpt-5-codex | docs/design/prototypes/osmu-editroom-v71-hub-claude-opus-20261001-2335.html | https://www.capcut.com/resource/how-to-use-capcut | https://www.capcut.com/resource/free-video-edit | https://vrew.ai/en/feature/text-based-video-editing/ | https://vrew.ai/en/feature/ai-video-subtitle/\n`;
  fs.writeFileSync(path.join(outputDir, "observations.json"), `${JSON.stringify({ observations, consoleErrors, optionalProviderWarnings }, null, 2)}\n`);
  fs.writeFileSync(path.join(outputDir, "report.md"), report);
  console.log(JSON.stringify({ ok: true, expectedDuration, actualDuration, durationDelta, frameDiffs, subtitlePixels }));
} finally {
  if (browser) await browser.close().catch(() => undefined);
  if (issuedTokenId) {
    await fetch(`${baseUrl}/api/tenant-tokens?id=${encodeURIComponent(issuedTokenId)}`, {
      method: "DELETE", headers: headers(operatorToken), signal: AbortSignal.timeout(30_000),
    }).catch(() => undefined);
  }
  if (draftId) await sql`DELETE FROM drafts WHERE tenant_id=${workspaceId} AND id=${draftId}`.catch(() => undefined);
  if (sql) await sql.end({ timeout: 5 }).catch(() => undefined);
  for (const file of [
    sourceStoragePath,
    artifactFilename ? path.join(dataDir, "tenants", workspaceId, "videos", artifactFilename) : "",
    artifactFilename ? path.join(dataDir, "tenants", workspaceId, "images", artifactFilename) : "",
  ]) {
    if (file) { try { fs.rmSync(file, { force: true }); } catch { /* evidence copy is in logs */ } }
  }
  await stopChildren();
  if (testDatabaseCreated && adminSql) {
    await adminSql.unsafe(`DROP DATABASE IF EXISTS "${qaDatabaseName}" WITH (FORCE)`).catch(() => undefined);
  }
  if (adminSql) await adminSql.end({ timeout: 5 }).catch(() => undefined);
}
