#!/usr/bin/env node

import http from "node:http";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const listenPort = Number(process.env.EDITROOM_MOBILE_FIXTURE_PORT || "3472");
const upstream = new URL(process.env.EDITROOM_MOBILE_UPSTREAM || "http://localhost:3470");
const workspaceId = "11111111-1111-4111-8111-111111111111";
const scriptDir = path.dirname(fileURLToPath(import.meta.url));
const snapshotPath = path.resolve(scriptDir, "../../logs/diff/editroom-v2-phase1/screen-conformance/mobile-editroom-snapshot.html");
const work = {
  id: "editroom-mobile-fixture",
  status: "draft",
  idea: "모바일 편집실 사용성 검증",
  text: {
    threads: "모바일에서도 읽고 고칠 수 있는 편집실입니다.",
    x: "모바일 편집실 사용성 검증",
    facebook: "세 장면과 실제 영상을 불러와 조작 영역을 측정합니다.",
    instagram: { caption: "모바일 편집실", hashtags: ["사용성"], slides: ["첫 장면", "둘째 장면", "셋째 장면"] },
    shorts: { hook: "첫 장면", body: "둘째 장면", cta: "셋째 장면" },
  },
  img: null,
  vid: { url: "/qa/alignment-sample.mp4", file: "/qa/alignment-sample.mp4" },
  includes: { threads: true, x: true, facebook: true, instagram: true, shorts: true, reels: true, tiktok: true },
  editLines: ["첫 장면에서 문제를 보여줍니다", "둘째 장면에서 해결 방법을 설명합니다", "셋째 장면에서 다음 행동을 제안합니다"],
  editKind: "video",
  editFormat: { kind: "video", aspectRatio: "9:16", playbackSpeed: 1, subtitleSize: "보통", voice: "차분한 남성" },
};

function sendJson(response, body, status = 200) {
  response.writeHead(status, { "content-type": "application/json; charset=utf-8", "cache-control": "no-store" });
  response.end(JSON.stringify(body));
}

function bootstrap(request, response) {
  const workspace = { id: workspaceId, slug: "editroom-mobile-fixture", name: "모바일 편집실 검증", tier: "team" };
  const script = `
    localStorage.setItem("dashboard_auth_token", "editroom-mobile-fixture-token");
    localStorage.setItem("active_workspace", ${JSON.stringify(JSON.stringify(workspace))});
    localStorage.setItem(${JSON.stringify(`studio_work:${workspaceId}`)}, ${JSON.stringify(JSON.stringify(work))});
  `;
  const upstreamRequest = http.request({
    protocol: upstream.protocol,
    hostname: upstream.hostname,
    port: upstream.port,
    method: "GET",
    path: `/studio?room=edit&kind=video&draft_id=${work.id}&fixture=1`,
    headers: { ...request.headers, host: upstream.host, "accept-encoding": "identity" },
  }, (upstreamResponse) => {
    const chunks = [];
    upstreamResponse.on("data", (chunk) => chunks.push(chunk));
    upstreamResponse.on("end", () => {
      const html = Buffer.concat(chunks).toString("utf8");
      const injected = html.replace("<head>", `<head><script>${script}</script>`);
      const headers = { ...upstreamResponse.headers, "cache-control": "no-store", "content-length": Buffer.byteLength(injected) };
      delete headers["content-encoding"];
      delete headers.etag;
      response.writeHead(upstreamResponse.statusCode || 200, headers);
      response.end(injected);
    });
  });
  upstreamRequest.on("error", (error) => sendJson(response, { error: error.message }, 502));
  upstreamRequest.end();
}

const server = http.createServer((request, response) => {
  const url = new URL(request.url || "/", `http://localhost:${listenPort}`);
  if (url.pathname === "/qa/mobile-editroom-snapshot") {
    if (!fs.existsSync(snapshotPath)) return sendJson(response, { error: "mobile snapshot not generated" }, 404);
    response.writeHead(200, { "content-type": "text/html; charset=utf-8", "cache-control": "no-store" });
    return response.end(fs.readFileSync(snapshotPath));
  }
  if (url.pathname === "/qa/mobile-editroom") return bootstrap(request, response);
  if (url.pathname === "/studio" && url.searchParams.get("fixture") === "1") return bootstrap(request, response);
  if (url.pathname === "/api/me") return sendJson(response, { isOperator: false, tenant: { id: workspaceId, slug: "editroom-mobile-fixture", name: "모바일 편집실 검증", status: "active" } });
  if (url.pathname === "/api/overview") return sendJson(response, { statusCounts: {}, followers: 0, weekDelta: 0, viralPosts: [], summary: { published: 0, engagementRate: 0 } });
  if (url.pathname === "/api/usage") return sendJson(response, { today: {}, thisWeek: {}, tier: "team", quota: {} });
  if (url.pathname === "/api/onboarding") return sendJson(response, { completed: true });
  if (url.pathname === "/api/channel-config") return sendJson(response, {});
  if (url.pathname === "/api/studio/brand-setup") return sendJson(response, { guide: null });
  if (url.pathname === "/api/studio/engine-status") return sendJson(response, { ready: true });
  if (url.pathname === "/api/elevenlabs-voices") return sendJson(response, { voices: [] });
  if (url.pathname === "/api/studio/drafts") {
    if (request.method === "POST") return sendJson(response, { ok: true, id: work.id, bodyRevision: 1 });
    return sendJson(response, { drafts: [work], currentWork: { draftId: work.id, stage: "edit", stageLabel: "편집실", idea: work.idea } });
  }

  const proxy = http.request({
    protocol: upstream.protocol,
    hostname: upstream.hostname,
    port: upstream.port,
    method: request.method,
    path: request.url,
    headers: { ...request.headers, host: upstream.host },
  }, (upstreamResponse) => {
    response.writeHead(upstreamResponse.statusCode || 502, upstreamResponse.headers);
    upstreamResponse.pipe(response);
  });
  proxy.on("error", (error) => sendJson(response, { error: error.message }, 502));
  request.pipe(proxy);
});

server.listen(listenPort, "127.0.0.1", () => {
  process.stdout.write(`editroom mobile fixture ready http://127.0.0.1:${listenPort}/qa/mobile-editroom\n`);
});

for (const signal of ["SIGINT", "SIGTERM"]) {
  process.on(signal, () => server.close(() => process.exit(0)));
}
