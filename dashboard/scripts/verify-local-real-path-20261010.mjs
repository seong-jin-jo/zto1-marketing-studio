import fs from "node:fs";
import path from "node:path";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import postgres from "postgres";
import playwright from "/Users/sj/kimstudy-auto/node_modules/playwright-core/index.js";

const scriptDir = path.dirname(fileURLToPath(import.meta.url));
const dashboardDir = path.resolve(scriptDir, "..");
const repoDir = path.resolve(dashboardDir, "..");
const evidenceDir = path.join(repoDir, "logs/diff/local-real-path-20261010");
const previewEvidenceDir = path.join(evidenceDir, "publish-previews");
const baseUrl = process.env.LOCAL_REAL_PATH_BASE_URL || "http://127.0.0.1:3483";
const tenantId = process.env.LOCAL_REAL_PATH_TENANT_ID || "cd1d0a40-540d-4524-9b49-bf2445d82182";
const targetIdea = process.env.LOCAL_REAL_PATH_IDEA || "로컬 실제 경로 검증";
const operatorToken = process.env.DASHBOARD_AUTH_TOKEN || "";
const studioToken = process.env.STUDIO_DEV_BEARER_TOKEN || "";
function localStackDatabaseUrl(value) {
  if (!value) return "";
  const url = new URL(value);
  url.pathname = "/osmu_local_real_path_20261010";
  return url.toString();
}

const databaseUrl = process.env.LOCAL_REAL_PATH_DATABASE_URL
  || localStackDatabaseUrl(process.env.DATABASE_URL || "");
const dataRoot = process.env.DATA_DIR || path.join(repoDir, "data/local-real-path-20261010");
const dryRunLog = process.env.PUBLISH_DRY_RUN_LOG || path.join(dataRoot, "publish-dry-run/requests.jsonl");
const browserExecutable = process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE
  || "/Users/sj/Library/Caches/ms-playwright/chromium-1228/chrome-mac-x64/Google Chrome for Testing.app/Contents/MacOS/Google Chrome for Testing";
const timeoutMs = Number(process.env.LOCAL_REAL_PATH_TIMEOUT_MS || 240_000);
const mobileWidths = [360, 390, 412, 600, 700, 780, 820, 900, 1000];

const channelLabels = [
  "Threads", "X", "Facebook", "Instagram", "LinkedIn", "Bluesky",
  "Telegram", "Discord", "Slack", "KakaoTalk", "Shorts", "Reels", "TikTok",
];
const expectedRecordedPlatforms = [
  "threads", "x", "facebook", "instagram", "linkedin", "bluesky",
  "telegram", "discord", "slack", "kakao", "youtube", "reels", "tiktok",
];
const previewPlatforms = [
  "threads", "x", "facebook", "instagram", "linkedin", "bluesky",
  "telegram", "discord", "slack", "kakao", "shorts", "reels", "tiktok",
];

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

function redactDeliveryTokens(value) {
  if (typeof value === "string") {
    return value.replace(/(\/api\/(?:media|exports\/deliver|images\/deliver)\/)[^?\s"']+/g, "$1[SIGNED_TOKEN]");
  }
  if (Array.isArray(value)) return value.map(redactDeliveryTokens);
  if (value && typeof value === "object") {
    return Object.fromEntries(Object.entries(value).map(([key, entry]) => [key, redactDeliveryTokens(entry)]));
  }
  return value;
}

async function api(pathname, token, options = {}) {
  const response = await fetch(`${baseUrl}${pathname}`, {
    ...options,
    headers: {
      Authorization: `Bearer ${token}`,
      ...(options.body ? { "Content-Type": "application/json" } : {}),
      ...(options.headers || {}),
    },
    signal: AbortSignal.timeout(60_000),
  });
  const body = await response.json().catch(() => ({}));
  return { response, body };
}

function tokenFilename(deliveryPath) {
  const marker = "/api/media/";
  if (typeof deliveryPath !== "string" || !deliveryPath.startsWith(marker)) return null;
  const encoded = deliveryPath.slice(marker.length);
  const token = decodeURIComponent(encoded);
  const body = token.split(".")[0];
  if (!body) return null;
  try {
    const parsed = JSON.parse(Buffer.from(body.replace(/-/g, "+").replace(/_/g, "/"), "base64url").toString("utf8"));
    return typeof parsed.f === "string" ? parsed.f : null;
  } catch {
    return null;
  }
}

function probeMedia(filePath, seekSeconds = null) {
  const probe = spawnSync("ffprobe", [
    "-v", "error", "-show_entries", "stream=codec_name,width,height:format=format_name,duration,size",
    "-of", "json", filePath,
  ], { encoding: "utf8", timeout: 30_000 });
  assert(probe.status === 0, `ffprobe 실패: ${path.basename(filePath)}`);
  const parsed = JSON.parse(probe.stdout);
  const signalArgs = ["-v", "error"];
  if (seekSeconds !== null) signalArgs.push("-ss", String(seekSeconds));
  signalArgs.push("-i", filePath, "-frames:v", "1", "-vf", "signalstats,metadata=print:file=-", "-f", "null", "-");
  const signal = spawnSync("ffmpeg", signalArgs, { encoding: "utf8", timeout: 30_000 });
  assert(signal.status === 0, `픽셀 검사 실패: ${path.basename(filePath)}`);
  const output = `${signal.stdout}\n${signal.stderr}`;
  const ymin = Number(output.match(/lavfi\.signalstats\.YMIN=(\d+(?:\.\d+)?)/)?.[1]);
  const ymax = Number(output.match(/lavfi\.signalstats\.YMAX=(\d+(?:\.\d+)?)/)?.[1]);
  assert(Number.isFinite(ymin) && Number.isFinite(ymax) && ymax - ymin >= 8, `실미디어 픽셀 변화 부족: ${path.basename(filePath)}`);
  return { filePath, ...parsed, pixelRange: { ymin, ymax, delta: ymax - ymin } };
}

function resolveLocalMediaPath(filename) {
  const candidates = [
    path.join(dataRoot, "studio", tenantId, filename),
    path.join(dataRoot, "tenants", tenantId, "images", filename),
    path.join(dataRoot, "tenants", tenantId, "videos", filename),
  ];
  return candidates.find((candidate) => fs.existsSync(candidate)) || null;
}

async function measureMobileErgonomics(page, width) {
  await page.setViewportSize({ width, height: Math.max(800, Math.round(width * 1.6)) });
  await page.waitForTimeout(300);
  return page.evaluate(() => {
    const visible = (element) => {
      const rect = element.getBoundingClientRect();
      return element instanceof HTMLElement && element.offsetParent !== null && rect.width > 0 && rect.height > 0;
    };
    const textElements = [...document.querySelectorAll("body *")].filter((element) => {
      if (!visible(element) || ["SCRIPT", "STYLE", "SVG", "PATH"].includes(element.tagName)) return false;
      return [...element.childNodes].some((node) => node.nodeType === Node.TEXT_NODE && node.textContent?.trim().length > 1);
    });
    const fontSizes = textElements.map((element) => Number.parseFloat(getComputedStyle(element).fontSize)).sort((left, right) => left - right);
    const medianFontPx = fontSizes.length ? fontSizes[Math.floor(fontSizes.length / 2)] : 0;
    const fontBelow13 = fontSizes.filter((size) => size < 13).length;
    const fontBelow13Sample = textElements.filter((element) => Number.parseFloat(getComputedStyle(element).fontSize) < 13)
      .slice(0, 6).map((element) => `${getComputedStyle(element).fontSize}:${element.textContent?.trim().slice(0, 20)}`);
    const tapTargets = [...document.querySelectorAll('a[href],button,[role="button"],input:not([type="hidden"]),select,textarea,summary,label[for]')].filter(visible);
    const smallTapTargets = tapTargets.filter((element) => {
      const rect = element.getBoundingClientRect();
      return rect.width < 43.5 || rect.height < 43.5;
    });
    const tapBelow44 = smallTapTargets.length;
    const tapBelow44Sample = smallTapTargets.slice(0, 8).map((element) => {
      const rect = element.getBoundingClientRect();
      return `${element.tagName.toLowerCase()} ${Math.round(rect.width)}x${Math.round(rect.height)}:${(element.textContent || element.getAttribute("aria-label") || "").trim().slice(0, 20)}`;
    });
    const activeSelectors = [];
    const walk = (rules) => {
      for (const rule of rules) {
        const selector = rule.selectorText || "";
        if (selector.includes(":active")) activeSelectors.push(...selector.split(",").map((item) => item.replaceAll(":active", "").trim()).filter(Boolean));
        if (rule.cssRules?.length) walk(rule.cssRules);
      }
    };
    for (const styleSheet of document.styleSheets) {
      try { walk(styleSheet.cssRules); } catch { /* 같은 출처 앱 CSS만 판정한다. */ }
    }
    const activeCovered = tapTargets.filter((element) => activeSelectors.some((selector) => {
      try { return element.matches(selector); } catch { return false; }
    })).length;
    const activeCoverage = tapTargets.length ? activeCovered / tapTargets.length : 1;
    return {
      fontBelow13,
      fontBelow13Sample,
      medianFontPx,
      tapTargets: tapTargets.length,
      tapBelow44,
      tapBelow44Sample,
      activeCoverage,
      viewportWidth: innerWidth,
      scrollWidth: document.documentElement.scrollWidth,
      overflowX: document.documentElement.scrollWidth > innerWidth,
    };
  });
}

async function waitForRecords(count) {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    const rows = fs.existsSync(dryRunLog)
      ? fs.readFileSync(dryRunLog, "utf8").split("\n").filter(Boolean).map((line) => JSON.parse(line))
      : [];
    if (rows.length >= count) return rows;
    await new Promise((resolve) => setTimeout(resolve, 500));
  }
  throw new Error(`드라이런 요청 ${count}건을 제한시간 안에 확인하지 못했습니다.`);
}

assert(operatorToken, "DASHBOARD_AUTH_TOKEN이 필요합니다.");
assert(studioToken, "STUDIO_DEV_BEARER_TOKEN이 필요합니다.");
assert(databaseUrl, "DATABASE_URL이 필요합니다.");
assert(Number.isFinite(timeoutMs) && timeoutMs > 0, "LOCAL_REAL_PATH_TIMEOUT_MS가 올바르지 않습니다.");
const dbAddress = new URL(databaseUrl);
assert(["127.0.0.1", "localhost", "::1"].includes(dbAddress.hostname), "검증 DB는 로컬 주소여야 합니다.");
assert(dbAddress.pathname === "/osmu_local_real_path_20261010", "검증 DB는 이 worktree 전용 데이터베이스여야 합니다.");

fs.mkdirSync(evidenceDir, { recursive: true });
fs.mkdirSync(path.dirname(dryRunLog), { recursive: true });
fs.writeFileSync(dryRunLog, "", { encoding: "utf8", mode: 0o600 });

let browser;
let issuedTokenId = "";
let sql;
const consoleErrors = [];
const unauthorized = [];
const externalBrowserRequests = [];

try {
  const draftsResult = await api(`/api/studio/drafts?tenant_id=${encodeURIComponent(tenantId)}`, operatorToken);
  assert(draftsResult.response.ok, `초안 목록 조회 실패: HTTP ${draftsResult.response.status}`);
  const draft = draftsResult.body.drafts?.find((candidate) => candidate.idea === targetIdea);
  assert(draft?.id, `실제 생성 초안을 찾지 못했습니다: ${targetIdea}`);
  assert(draft.img?.file && draft.vid?.file, "실제 생성 초안에 이미지 또는 영상이 없습니다.");

  const imageFilename = draft.img.filename || tokenFilename(draft.img.file);
  const videoFilename = draft.vid.filename || tokenFilename(draft.vid.file);
  assert(imageFilename && videoFilename, "서명 미디어 주소에서 파일명을 확인하지 못했습니다.");
  const imagePath = resolveLocalMediaPath(imageFilename);
  const videoPath = resolveLocalMediaPath(videoFilename);
  assert(imagePath && videoPath, "로컬 디스크의 실제 이미지 또는 영상 파일이 없습니다.");
  const imageEvidence = probeMedia(imagePath);
  const videoEvidence = probeMedia(videoPath, 1);

  sql = postgres(databaseUrl, { max: 1 });
  await sql`DELETE FROM published_posts WHERE tenant_id = ${tenantId}::uuid AND draft_id = ${draft.id}::uuid`;
  const originalVideoFilename = typeof draft.vid?.editSource?.filename === "string"
    ? draft.vid.editSource.filename
    : videoFilename;
  const localSource = await api("/api/media/resign", operatorToken, {
    method: "POST",
    body: JSON.stringify({ tenant_id: tenantId, filename: originalVideoFilename, purpose: "media" }),
  });
  assert(localSource.response.ok && typeof localSource.body.file === "string", "원본 영상의 로컬 배달 주소를 발급하지 못했습니다.");
  await sql`
    UPDATE drafts
    SET status = 'draft',
        payload = jsonb_set(
          payload - 'publishProgress' - 'publishReconciliations' - 'publishReconciliation',
          '{vid,editSource}',
          jsonb_build_object('filename', ${originalVideoFilename}::text, 'url', ${localSource.body.file}::text),
          true
        ),
        updated_at = now()
    WHERE tenant_id = ${tenantId}::uuid AND id = ${draft.id}::uuid
  `;

  const issued = await api("/api/tenant-tokens", operatorToken, {
    method: "POST",
    body: JSON.stringify({ tenant_id: tenantId, label: `local-real-path-${Date.now()}` }),
  });
  assert(issued.response.ok && issued.body.token && issued.body.id, `임시 고객 토큰 발급 실패: HTTP ${issued.response.status}`);
  issuedTokenId = issued.body.id;

  browser = await playwright.chromium.launch({ executablePath: browserExecutable, headless: true, timeout: 60_000 });
  const context = await browser.newContext({ viewport: { width: 1440, height: 1200 } });
  await context.addInitScript(({ customerToken, generationToken, workspaceId }) => {
    localStorage.setItem("dashboard_auth_token", customerToken);
    localStorage.setItem("dashboard_auth_identity_kind", "customer");
    localStorage.setItem("active_workspace", JSON.stringify({ id: workspaceId, slug: "qa-four-room", name: "로컬 실경로 검증", tier: "team" }));
    sessionStorage.setItem("studio_generation_token", generationToken);
    sessionStorage.setItem("studio_workspace_id", workspaceId);
  }, { customerToken: issued.body.token, generationToken: studioToken, workspaceId: tenantId });

  const page = await context.newPage();
  page.on("pageerror", (error) => consoleErrors.push(error.message));
  page.on("console", (message) => { if (message.type() === "error") consoleErrors.push(message.text()); });
  page.on("response", (response) => { if (response.status() === 401) unauthorized.push(response.url()); });
  page.on("request", (request) => {
    const url = new URL(request.url());
    if (!["127.0.0.1", "localhost"].includes(url.hostname) && url.protocol.startsWith("http")) externalBrowserRequests.push(url.origin);
  });

  const draftResponse = page.waitForResponse((response) => response.url().includes("/api/studio/drafts") && response.status() === 200, { timeout: timeoutMs });
  await page.goto(`${baseUrl}/studio?room=create`, { waitUntil: "domcontentloaded", timeout: timeoutMs });
  await draftResponse;
  await page.getByRole("button", { name: /작업물 전체/ }).waitFor({ state: "visible", timeout: timeoutMs });
  await page.getByRole("button", { name: /작업물 전체/ }).click();
  const workItem = page.locator(`[data-work-item="${draft.id}"]`);
  await workItem.waitFor({ state: "visible", timeout: timeoutMs });
  const workThumbnail = workItem.locator("img").first();
  await workThumbnail.waitFor({ state: "visible", timeout: timeoutMs });
  await workThumbnail.evaluate((image) => image.decode());
  assert(await workThumbnail.evaluate((image) => image.complete && image.naturalWidth > 0 && image.naturalHeight > 0), "생성실 작업물 목록의 실제 이미지 썸네일이 로드되지 않았습니다.");
  await page.screenshot({ path: path.join(evidenceDir, "01-create-room-list.png"), fullPage: true });
  console.log("STEP 생성실 실제 썸네일 확인");

  await workItem.click();
  await page.locator('[data-room="edit"]').waitFor({ state: "visible", timeout: timeoutMs });
  await page.waitForURL(/room=edit/, { timeout: timeoutMs });
  const editMedia = page.locator('[data-room="edit"] video, [data-room="edit"] img');
  await editMedia.first().waitFor({ state: "visible", timeout: timeoutMs });
  assert((await editMedia.count()) > 0, "편집실 첫 화면에 생성한 미디어가 없습니다.");
  const editVideo = page.locator('[data-room="edit"] [data-video-el]');
  await editVideo.waitFor({ state: "visible", timeout: timeoutMs });
  await page.waitForFunction(() => {
    const video = document.querySelector('[data-room="edit"] [data-video-el]');
    return video instanceof HTMLVideoElement && video.videoWidth > 0 && video.videoHeight > 0 && Number.isFinite(video.duration) && video.duration > 0;
  }, undefined, { timeout: timeoutMs });
  await page.locator('[data-room="edit"] [data-video-play-toggle]').click();
  await page.waitForFunction(() => {
    const video = document.querySelector('[data-room="edit"] [data-video-el]');
    return video instanceof HTMLVideoElement && video.currentTime >= 0.5;
  }, undefined, { timeout: timeoutMs });
  await page.screenshot({ path: path.join(evidenceDir, "02-edit-room-media.png"), fullPage: true });
  console.log("STEP 편집실 실제 미디어 확인");

  await page.getByRole("button", { name: "내보내기", exact: true }).click();
  const exportPanel = page.locator("[data-export-panel]");
  const publishRoom = page.locator('[data-room="publish"]');
  await Promise.race([
    exportPanel.waitFor({ state: "visible", timeout: timeoutMs }),
    publishRoom.waitFor({ state: "visible", timeout: timeoutMs }),
  ]);
  if (await exportPanel.isVisible().catch(() => false)) {
    const openPublish = exportPanel.locator("[data-export-open-publish]");
    if (!(await openPublish.isVisible().catch(() => false))) {
      await exportPanel.locator("[data-export-start]").click();
      await openPublish.waitFor({ state: "visible", timeout: timeoutMs });
    }
    await openPublish.click();
  }
  await publishRoom.waitFor({ state: "visible", timeout: timeoutMs });
  await page.waitForURL(/room=publish/, { timeout: timeoutMs });
  await page.locator("[data-room-preview]").first().waitFor({ state: "visible", timeout: timeoutMs });
  assert(await page.locator("[data-room-preview]").count() === channelLabels.length, `발행실 미리보기 수가 ${channelLabels.length}개가 아닙니다.`);
  await page.locator('[data-testid="publish-selected-image"]').waitFor({ state: "visible", timeout: timeoutMs });
  await page.locator('[data-testid="publish-selected-video"]').waitFor({ state: "visible", timeout: timeoutMs });
  console.log("STEP 발행실 실제 이미지와 영상 확인");

  const tiktokPrivacySelect = page.locator('[data-testid="tiktok-publish-privacy-select"]');
  try {
    await tiktokPrivacySelect.waitFor({ state: "visible", timeout: timeoutMs });
  } catch {
    const creatorError = await page.locator('[data-testid="tiktok-creator-info-error"]').textContent().catch(() => null);
    throw new Error(`TikTok 공개 범위 UI를 열지 못했습니다. creatorError=${creatorError || "없음"}, console=${consoleErrors.slice(0, 3).join(" | ") || "없음"}`);
  }
  await tiktokPrivacySelect.selectOption("SELF_ONLY", { timeout: timeoutMs });
  console.log("STEP TikTok 공개 범위 선택");
  for (const label of channelLabels) {
    const checkbox = page.getByRole("checkbox", { name: `${label} 발행`, exact: true });
    await checkbox.waitFor({ state: "visible", timeout: timeoutMs });
    await checkbox.check({ timeout: timeoutMs });
  }
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.locator('[data-room="publish"]').scrollIntoViewIfNeeded();
  await page.screenshot({ path: path.join(evidenceDir, "03-publish-room-previews.png"), fullPage: false });
  fs.mkdirSync(previewEvidenceDir, { recursive: true });
  await page.locator('[data-room="publish"] video').evaluateAll((videos) => {
    for (const video of videos) {
      if (!(video instanceof HTMLVideoElement)) continue;
      video.pause();
      if (Number.isFinite(video.duration) && video.duration > 0) video.currentTime = Math.min(0.5, video.duration / 2);
    }
  });
  for (const [index, platform] of previewPlatforms.entries()) {
    const preview = page.locator(`[data-room-preview="${platform}"]`);
    await preview.waitFor({ state: "visible", timeout: timeoutMs });
    await preview.evaluate((element) => element.scrollIntoView({ block: "center", inline: "nearest" }));
    await page.waitForTimeout(150);
    await page.screenshot({ path: path.join(previewEvidenceDir, `${String(index + 1).padStart(2, "0")}-${platform}.png`), fullPage: false });
  }
  console.log("STEP 13개 채널 선택");

  const publishButton = page.getByRole("button", { name: new RegExp(`선택한 ${channelLabels.length}곳에 지금 발행`) });
  await publishButton.waitFor({ state: "visible", timeout: timeoutMs });
  assert(await publishButton.isEnabled(), "전체 채널 발행 단추가 활성화되지 않았습니다.");
  await publishButton.click();
  const records = await waitForRecords(expectedRecordedPlatforms.length);
  await page.getByRole("main").getByText("발행 완료", { exact: true }).waitFor({ state: "visible", timeout: timeoutMs });
  await page.screenshot({ path: path.join(evidenceDir, "04-publish-dry-run-result.png"), fullPage: false });
  console.log("STEP 13개 채널 드라이런 완료");

  const mobileMeasurements = [];
  for (const width of mobileWidths) {
    const measurement = await measureMobileErgonomics(page, width);
    const pass = measurement.fontBelow13 === 0
      && measurement.medianFontPx >= 16
      && measurement.tapBelow44 === 0
      && measurement.activeCoverage >= 0.9
      && !measurement.overflowX;
    mobileMeasurements.push({ width, ...measurement, pass });
    assert(pass, `모바일 사용성 ${width}px 실패: ${JSON.stringify(measurement)}`);
  }
  fs.writeFileSync(path.join(evidenceDir, "mobile-ergonomics.json"), `${JSON.stringify(mobileMeasurements, null, 2)}\n`, "utf8");
  console.log(`STEP 모바일 사용성 ${mobileWidths.length}개 폭 완료`);

  const recorded = [...new Set(records.map((record) => record.platform))].sort();
  const expected = [...expectedRecordedPlatforms].sort();
  assert(JSON.stringify(recorded) === JSON.stringify(expected), `드라이런 기록 채널 불일치: ${recorded.join(", ")}`);
  assert(records.every((record) => typeof record.endpoint === "string" && record.endpoint.startsWith("https://")), "외부 API 직전 엔드포인트가 기록되지 않았습니다.");
  assert(records.every((record) => record.body && Object.keys(record.body).length > 0), "채널 요청 본문이 비어 있습니다.");
  const videoRecords = records.filter((record) => ["youtube", "reels", "tiktok"].includes(record.platform));
  assert(videoRecords.length === 3 && videoRecords.every((record) => record.mediaSpec?.bytes > 0 && record.mediaSpec?.codec === "h264"), "영상 3채널의 실제 미디어 규격 기록이 올바르지 않습니다.");
  const imageRecords = records.filter((record) => record.mediaSpec?.path?.endsWith(imageFilename));
  assert(imageRecords.length >= 1, "텍스트·이미지 채널 요청에 실제 이미지 규격이 기록되지 않았습니다.");
  assert(consoleErrors.length === 0, `브라우저 콘솔 오류 ${consoleErrors.length}건: ${consoleErrors.slice(0, 3).join(" | ")}`);
  assert(unauthorized.length === 0, `브라우저 401 ${unauthorized.length}건`);
  assert(externalBrowserRequests.length === 0, `브라우저가 외부 HTTP 요청을 보냈습니다: ${[...new Set(externalBrowserRequests)].join(", ")}`);

  const evidenceRecords = records.map(redactDeliveryTokens);
  fs.writeFileSync(path.join(evidenceDir, "requests.jsonl"), `${evidenceRecords.map((record) => JSON.stringify(record)).join("\n")}\n`, "utf8");
  fs.writeFileSync(path.join(evidenceDir, "media-specs.json"), `${JSON.stringify({ image: imageEvidence, video: videoEvidence }, null, 2)}\n`, "utf8");
  fs.writeFileSync(path.join(evidenceDir, "verification.json"), `${JSON.stringify({
    ok: true,
    baseUrl,
    tenantId,
    draftId: draft.id,
    idea: draft.idea,
    workListThumbnail: true,
    editRoomMedia: true,
    publishPreviewCount: channelLabels.length,
    recordedPlatforms: recorded,
    requestCount: records.length,
    consoleErrors: 0,
    unauthorizedResponses: 0,
    externalBrowserRequests: 0,
    mobileWidths: mobileMeasurements,
    screenshots: [
      "01-create-room-list.png",
      "02-edit-room-media.png",
      "03-publish-room-previews.png",
      ...previewPlatforms.map((platform, index) => `publish-previews/${String(index + 1).padStart(2, "0")}-${platform}.png`),
      "04-publish-dry-run-result.png",
    ],
  }, null, 2)}\n`, "utf8");
  console.log(`PASS 실제 생성 초안 ${draft.id}: 생성실 썸네일 → 편집실 미디어 → 내보내기 → 발행실 ${channelLabels.length}개 미리보기 → 드라이런 ${records.length}건`);
} finally {
  if (browser) await Promise.race([browser.close(), new Promise((resolve) => setTimeout(resolve, 5_000))]);
  if (issuedTokenId) {
    const revoked = await api(`/api/tenant-tokens?id=${encodeURIComponent(issuedTokenId)}`, operatorToken, { method: "DELETE" });
    if (!revoked.response.ok) console.error(`임시 고객 토큰 폐기 실패: HTTP ${revoked.response.status}`);
  }
  if (sql) await sql.end({ timeout: 5 }).catch(() => {});
}
