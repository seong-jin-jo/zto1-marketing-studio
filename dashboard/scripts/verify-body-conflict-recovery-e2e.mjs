#!/usr/bin/env node
// PR87-R5-MAJOR-01 실브라우저 두 탭 회귀. 탭 A가 본문을 먼저 저장한 뒤 탭 B의
// 영상 자동저장이 낡은 bodyBaseRevision으로 409를 받고, 로컬 입력 보관 → 최신본 확인
// → 명시적 재적용을 거쳐 최신 기준판으로 저장되는지 실제 StudioPage에서 검증한다.
import { chromium } from "playwright-core";

const baseUrl = process.env.BODY_CONFLICT_BASE_URL || "http://127.0.0.1:3471";
const workspaceId = "11111111-1111-4111-8111-111111111111";
const draftId = "22222222-2222-4222-8222-222222222222";
const baseVideoEdit = {
  contract_version: "1.0",
  overlays: [], comments: [], voice: null, revision: 3,
  subtitles: [{ id: "sub-1", order: 0, text: "공통 원문", startSec: 0, endSec: 3, cut: false }],
};
let serverBodyRevision = 5;
let serverVideoRevision = 3;
let serverLines = ["공통 원문"];
let serverText = { shorts: { hook: "공통 원문", body: "", cta: "" }, threads: "공통 원문" };
const posts = [];
let releaseRecovery;
const recoveryGate = new Promise((resolve) => { releaseRecovery = resolve; });

function json(route, body, status = 200) {
  return route.fulfill({ status, contentType: "application/json", body: JSON.stringify(body) });
}
function draft() {
  return {
    id: draftId, idea: "두 탭 충돌", editKind: "video", editLines: serverLines,
    text: serverText, bodyRevision: serverBodyRevision, videoEdit: { ...baseVideoEdit, revision: serverVideoRevision },
    vid: { url: "/api/media/test", file: "/api/media/test", model: "test" },
    status: "draft", savedAt: "2026-09-28T00:00:00.000Z",
  };
}
function work(kind) {
  return {
    idea: "두 탭 충돌", draftId, editKind: kind, editLines: ["공통 원문"], text: serverText,
    bodyRevision: 5, videoEdit: kind === "video" ? baseVideoEdit : null,
    vid: kind === "video" ? { url: "/api/media/test", file: "/api/media/test", model: "test" } : null,
  };
}
async function waitUntil(predicate, timeoutMs, message) {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    if (predicate()) return;
    await new Promise((resolve) => setTimeout(resolve, 50));
  }
  throw new Error(message);
}

const browser = await chromium.launch({ headless: true });
const context = await browser.newContext({ viewport: { width: 1280, height: 900 } });
await context.addInitScript(({ id }) => {
  localStorage.setItem("dashboard_auth_token", "body-conflict-e2e-token");
  localStorage.setItem("active_workspace", JSON.stringify({ id, slug: "body-conflict", name: "본문 충돌 검증", tier: "team" }));
}, { id: workspaceId });

await context.route("**/api/**", async (route) => {
  const request = route.request();
  const pathname = new URL(request.url()).pathname;
  if (pathname === "/api/me") return json(route, { isOperator: false, tenant: { id: workspaceId, slug: "body-conflict", name: "본문 충돌 검증", status: "active" } });
  if (pathname === "/api/studio/drafts") {
    if (request.method() !== "POST") return json(route, { drafts: [draft()], currentWork: null });
    const body = JSON.parse(request.postData() || "{}");
    posts.push(body);
    if (body.bodyBaseRevision !== serverBodyRevision) {
      return json(route, {
        ok: false, code: "BODY_STALE_REVISION", error: "다른 곳에서 더 최신으로 저장된 본문이 있습니다.",
        serverRevision: serverBodyRevision, clientBaseRevision: body.bodyBaseRevision,
        latestBody: { text: serverText, editLines: serverLines, bodyRevision: serverBodyRevision },
      }, 409);
    }
    if (body.videoEdit && body.videoEditBaseRevision !== serverVideoRevision) {
      return json(route, { ok: false, code: "VIDEO_EDIT_STALE_REVISION", error: "다른 곳에서 더 최신으로 저장된 영상 편집이 있습니다." }, 409);
    }
    if (body.bodyBaseRevision === 6 && body.videoEdit) await recoveryGate;
    serverBodyRevision += 1;
    serverLines = body.editLines;
    serverText = body.text;
    if (body.videoEdit) serverVideoRevision += 1;
    return json(route, { ok: true, id: draftId, bodyRevision: serverBodyRevision, videoEditServerRevision: body.videoEdit ? serverVideoRevision : null });
  }
  if (pathname === "/api/studio/brand-setup") return json(route, { guide: null });
  if (pathname === "/api/publish/first-comment-capabilities") return json(route, { capabilities: [] });
  if (pathname.includes("elevenlabs-voices")) return json(route, { voices: [] });
  if (/^\/api\/channels\/[^/]+\/accounts$/.test(pathname)) return json(route, { accounts: [] });
  if (pathname === "/api/images") return json(route, { images: [] });
  return json(route, {});
});

const pageA = await context.newPage();
const pageB = await context.newPage();
await pageA.route("**/api/studio/drafts**", async (route) => {
  if (route.request().method() === "POST") return route.fallback();
  const textDraft = { ...draft(), editKind: "text", videoEdit: null, vid: null };
  return json(route, { drafts: [textDraft], currentWork: null });
});
const browserErrors = [];
for (const page of [pageA, pageB]) {
  page.on("pageerror", (error) => browserErrors.push(error.message));
  page.on("console", (message) => {
    if (message.type() !== "error") return;
    const text = message.text();
    // 이 시나리오가 의도적으로 발생시키는 409 네트워크 표시는 앱 예외가 아니다.
    if (/Failed to load resource:.*409 \(Conflict\)/.test(text)) return;
    browserErrors.push(text);
  });
}

try {
  await pageA.goto(baseUrl, { waitUntil: "domcontentloaded" });
  await pageA.evaluate(({ key, value }) => localStorage.setItem(key, JSON.stringify(value)), { key: `studio_work:${workspaceId}`, value: work("text") });
  await pageA.goto(`${baseUrl}/studio?room=edit`, { waitUntil: "networkidle", timeout: 60_000 });
  await pageA.getByRole("textbox", { name: "글 전체" }).waitFor({ state: "visible" });

  await pageB.goto(baseUrl, { waitUntil: "domcontentloaded" });
  await pageB.evaluate(({ key, value }) => localStorage.setItem(key, JSON.stringify(value)), { key: `studio_work:${workspaceId}`, value: work("video") });
  await pageB.goto(`${baseUrl}/studio?room=edit`, { waitUntil: "networkidle", timeout: 60_000 });
  await pageB.locator("[data-video-subtitle-text]").waitFor({ state: "visible" });

  await pageA.getByRole("textbox", { name: "글 전체" }).fill("탭 A 최신본");
  await pageA.getByRole("button", { name: "발행실로 이동" }).click();
  await pageA.waitForFunction(() => document.querySelector('[data-room="publish"]'));
  if (serverBodyRevision !== 6) throw new Error(`탭 A 저장 뒤 본문 revision이 ${serverBodyRevision}입니다`);

  await pageB.locator("[data-video-subtitle-text]").fill("탭 B 내 변경");
  await pageB.locator("[data-body-edit-conflict]").waitFor({ state: "visible", timeout: 10_000 });
  const conflictPost = posts.find((post) => post.bodyBaseRevision === 5 && post.videoEdit);
  if (!conflictPost) throw new Error(`영상 자동저장 충돌 요청이 없습니다: ${JSON.stringify(posts)}`);
  if (conflictPost.videoEdit.subtitles?.[0]?.text !== "탭 B 내 변경") {
    throw new Error(`영상 자동저장 자막이 다릅니다: ${JSON.stringify(conflictPost.videoEdit.subtitles)}`);
  }
  const conflictCopy = (await pageB.locator("[data-body-edit-conflict]").innerText()).replace(/\s+/g, " ").trim();
  if (!conflictCopy.includes("다른 곳에서 먼저 수정됐어요")) throw new Error(`충돌 안내 문구가 다릅니다: ${conflictCopy}`);
  if (!await pageB.locator("[data-edit-workspace]").evaluate((element) => element.hasAttribute("inert"))) throw new Error("충돌 중 편집기가 잠기지 않았습니다");
  if (await pageB.locator("[data-video-subtitle-text]").inputValue() !== "탭 B 내 변경") throw new Error("충돌 직후 탭 B 입력이 보존되지 않았습니다");

  await pageB.locator("[data-body-conflict-load-latest]").click();
  await pageB.waitForFunction(() => document.querySelector("[data-video-subtitle-text]")?.value === "탭 A 최신본");
  await pageB.locator("[data-body-conflict-reapply]").click();
  await waitUntil(() => posts.some((post) => post.bodyBaseRevision === 6 && post.videoEdit), 10_000, "복구 저장 요청이 시작되지 않았습니다");
  if (!await pageB.locator("[data-edit-workspace]").evaluate((element) => element.hasAttribute("inert"))) throw new Error("복구 저장 중 편집기 잠금이 풀렸습니다");
  if (!await pageB.locator("[data-body-edit-conflict]").isVisible()) throw new Error("복구 저장 중 충돌 안내가 사라졌습니다");
  releaseRecovery();
  await pageB.locator("[data-body-edit-conflict]").waitFor({ state: "detached", timeout: 10_000 });
  await pageB.waitForFunction(() => document.querySelector("[data-video-subtitle-text]")?.value === "탭 B 내 변경");
  await waitUntil(
    () => serverBodyRevision === 7,
    10_000,
    `복구 저장이 끝나지 않았습니다. 현재 revision=${serverBodyRevision}, 요청=${JSON.stringify(posts.map((post) => ({ bodyBaseRevision: post.bodyBaseRevision, videoEditBaseRevision: post.videoEditBaseRevision, editLines: post.editLines })))}`,
  );

  const retry = posts.at(-1);
  if (retry.bodyBaseRevision !== 6) throw new Error(`재적용 기준판이 ${retry.bodyBaseRevision}입니다`);
  if (JSON.stringify(retry.editLines) !== JSON.stringify(["탭 B 내 변경"])) throw new Error(`재적용 본문이 다릅니다: ${JSON.stringify(retry.editLines)}`);
  if (serverBodyRevision !== 7) throw new Error(`복구 저장 뒤 본문 revision이 ${serverBodyRevision}입니다`);
  if (browserErrors.length) throw new Error(`브라우저 오류 ${browserErrors.length}건: ${browserErrors.join(" | ")}`);

  console.log(JSON.stringify({
    result: "PASS",
    tabs: 2,
    firstSaveRevision: 6,
    recoverySaveRevision: serverBodyRevision,
    retryBaseRevision: retry.bodyBaseRevision,
    preservedLocal: retry.editLines,
    conflictCopy,
    consoleErrors: browserErrors.length,
  }, null, 2));
} finally {
  await browser.close();
}
