#!/usr/bin/env node

import { execFileSync } from "node:child_process";
import { createHash } from "node:crypto";
import { promises as fs } from "node:fs";
import path from "node:path";
import process from "node:process";
import { fileURLToPath } from "node:url";

const dashboardRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const apiRoot = path.join(dashboardRoot, "src", "app", "api");
const baseUrl = process.env.API_SWEEP_BASE_URL || "http://localhost:3456";
const workspaceId = process.env.API_SWEEP_WORKSPACE_ID
  || process.env.WORKSPACE_ID
  || (process.env.STUDIO_DEV_WORKSPACE_IDS || "").split(",")[0]?.trim();
const operatorToken = process.env.DASHBOARD_AUTH_TOKEN;
const studioToken = process.env.STUDIO_DEV_BEARER_TOKEN;
const tenantToken = process.env.API_SWEEP_TENANT_TOKEN || "";
const outputPath = process.env.API_SWEEP_OUTPUT || "";

if (!workspaceId) throw new Error("API_SWEEP_WORKSPACE_ID 또는 STUDIO_DEV_WORKSPACE_IDS가 필요합니다");
if (!operatorToken) throw new Error("DASHBOARD_AUTH_TOKEN이 필요합니다");
if (!studioToken) throw new Error("STUDIO_DEV_BEARER_TOKEN이 필요합니다");

const GET_EXPORT = /export\s+(?:async\s+)?function\s+GET\b|export\s+const\s+GET\b/;

async function collectRouteFiles(directory) {
  const entries = await fs.readdir(directory, { withFileTypes: true });
  const files = [];
  for (const entry of entries) {
    const fullPath = path.join(directory, entry.name);
    if (entry.isDirectory()) files.push(...await collectRouteFiles(fullPath));
    if (entry.isFile() && entry.name === "route.ts") {
      const source = await fs.readFile(fullPath, "utf8");
      if (GET_EXPORT.test(source)) files.push(fullPath);
    }
  }
  return files.sort();
}

const dynamicValues = {
  batchId: "00000000-0000-4000-8000-000000000000",
  channel: "threads",
  file: "없는-파일.png",
  jobId: "00000000-0000-4000-8000-000000000000",
  provider: "threads",
  runId: "00000000-0000-4000-8000-000000000000",
  token: "없는-토큰",
};

function routePath(file) {
  const relative = path.relative(path.join(dashboardRoot, "src", "app"), file);
  return `/${relative.replace(/\/route\.ts$/, "").split(path.sep).map((segment) => {
    const match = segment.match(/^\[([^\]]+)\]$/);
    if (!match) return segment;
    const value = dynamicValues[match[1]];
    if (!value) throw new Error(`동적 경로 대체값이 없습니다: ${match[1]} (${relative})`);
    return encodeURIComponent(value);
  }).join("/")}`;
}

function requestUrl(apiPath) {
  const url = new URL(apiPath, baseUrl);
  const common = {
    tenant_id: workspaceId,
    workspace_id: workspaceId,
    channel: "threads",
    provider: "threads",
    publish_id: "없는-발행-ID",
    post_id: "00000000-0000-4000-8000-000000000000",
    draft_id: "00000000-0000-4000-8000-000000000000",
    redirect_to: "/studio",
  };
  for (const [key, value] of Object.entries(common)) url.searchParams.set(key, value);
  return url;
}

function requestHeaders(apiPath) {
  const needsTenantToken = apiPath === "/api/isolation-proof" || apiPath.startsWith("/api/tiktok/");
  const token = apiPath.startsWith("/api/studio/v1/")
    ? studioToken
    : needsTenantToken && tenantToken
      ? tenantToken
      : operatorToken;
  return { authorization: `Bearer ${token}`, accept: "application/json" };
}

function redact(text) {
  let safe = text;
  for (const secret of [operatorToken, studioToken, tenantToken]) {
    if (secret) safe = safe.split(secret).join("[REDACTED]");
  }
  return safe.replace(/(access_token|refresh_token|api[_-]?key|secret|token)\s*[=:]\s*[^\s,}"']+/gi, "$1=[REDACTED]");
}

function classify(status) {
  if (status >= 200 && status < 400) return "정상";
  if ([400, 401, 403, 404, 405, 409, 410, 422, 429, 503].includes(status)) return "의도된 거절 후보";
  if (status === 500) return "고장";
  if (status >= 500) return "서버 오류 검토";
  return "거절 검토";
}

const files = await collectRouteFiles(apiRoot);
const results = [];

for (const file of files) {
  const apiPath = routePath(file);
  const url = requestUrl(apiPath);
  const startedAt = Date.now();
  try {
    const response = await fetch(url, {
      headers: requestHeaders(apiPath),
      redirect: "manual",
      signal: AbortSignal.timeout(15_000),
    });
    const body = redact((await response.text()).slice(0, 500));
    results.push({
      route: apiPath,
      file: path.relative(dashboardRoot, file),
      status: response.status,
      classification: classify(response.status),
      duration_ms: Date.now() - startedAt,
      body_sha256: createHash("sha256").update(body).digest("hex"),
      body_preview: response.status >= 400 ? body.replace(/\s+/g, " ").slice(0, 220) : "",
    });
  } catch (error) {
    results.push({
      route: apiPath,
      file: path.relative(dashboardRoot, file),
      status: 0,
      classification: "요청 실패",
      duration_ms: Date.now() - startedAt,
      body_sha256: "",
      body_preview: redact(error instanceof Error ? error.message : String(error)),
    });
  }
}

const counts = Object.fromEntries(
  [...new Set(results.map((result) => result.classification))]
    .sort()
    .map((name) => [name, results.filter((result) => result.classification === name).length]),
);
const gitCommit = execFileSync("git", ["rev-parse", "HEAD"], { cwd: dashboardRoot, encoding: "utf8" }).trim();
const report = {
  observed_at: new Date().toISOString(),
  base_url: baseUrl,
  git_commit: gitCommit,
  workspace_id: workspaceId,
  route_count: files.length,
  counts,
  results,
};

for (const result of results) {
  const detail = result.body_preview ? ` ${result.body_preview}` : "";
  console.log(`${result.status}\t${result.classification}\t${result.route}${detail}`);
}
console.log(`합계 ${files.length}개 ${JSON.stringify(counts)}`);

if (outputPath) await fs.writeFile(outputPath, `${JSON.stringify(report, null, 2)}\n`, "utf8");

const failed = results.filter((result) => ["고장", "서버 오류 검토", "요청 실패"].includes(result.classification));
process.exit(failed.length ? 1 : 0);
