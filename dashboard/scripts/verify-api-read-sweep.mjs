#!/usr/bin/env node

import { execFileSync } from "node:child_process";
import { createHash } from "node:crypto";
import { promises as fs } from "node:fs";
import path from "node:path";
import process from "node:process";
import { fileURLToPath } from "node:url";
import { classifyApiReadResponse } from "./lib/api-sweep-contract.mjs";

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
const requestTimeoutMs = Number(process.env.API_SWEEP_TIMEOUT_MS || "120000");
const totalTimeoutMs = Number(process.env.API_SWEEP_TOTAL_TIMEOUT_MS || "300000");
// Next dev compiles unseen Route Handlers on demand. Starting several cold
// compilations at once can starve the dev server and turn healthy routes into
// timeouts, so the safe default is sequential. Production checks can opt in to
// bounded parallelism with API_SWEEP_CONCURRENCY.
const sweepConcurrency = Number(process.env.API_SWEEP_CONCURRENCY || "1");

if (!workspaceId) throw new Error("API_SWEEP_WORKSPACE_ID 또는 STUDIO_DEV_WORKSPACE_IDS가 필요합니다");
if (!operatorToken) throw new Error("DASHBOARD_AUTH_TOKEN이 필요합니다");
if (!studioToken) throw new Error("STUDIO_DEV_BEARER_TOKEN이 필요합니다");
if (!Number.isFinite(requestTimeoutMs) || requestTimeoutMs <= 0) {
  throw new Error("API_SWEEP_TIMEOUT_MS는 0보다 큰 숫자여야 합니다");
}
if (!Number.isFinite(totalTimeoutMs) || totalTimeoutMs <= 0) throw new Error("API_SWEEP_TOTAL_TIMEOUT_MS는 0보다 큰 숫자여야 합니다");
if (!Number.isInteger(sweepConcurrency) || sweepConcurrency < 1 || sweepConcurrency > 12) throw new Error("API_SWEEP_CONCURRENCY는 1부터 12 사이 정수여야 합니다");

const READ_METHODS = ["GET", "HEAD"];
const READ_EXPORT = Object.fromEntries(READ_METHODS.map((method) => [
  method,
  new RegExp(`^\\s*export\\s+(?:async\\s+)?function\\s+${method}\\b|^\\s*export\\s+const\\s+${method}\\b`, "m"),
]));

async function collectRouteFiles(directory) {
  const entries = await fs.readdir(directory, { withFileTypes: true });
  const files = [];
  for (const entry of entries) {
    const fullPath = path.join(directory, entry.name);
    if (entry.isDirectory()) files.push(...await collectRouteFiles(fullPath));
    if (entry.isFile() && entry.name === "route.ts") {
      const source = await fs.readFile(fullPath, "utf8");
      const methods = READ_METHODS.filter((method) => READ_EXPORT[method].test(source));
      if (methods.length) files.push({ file: fullPath, methods });
    }
  }
  return files.sort((left, right) => left.file.localeCompare(right.file));
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

const expectedRejections = new Map([
  ["src/app/api/card-slides/[batchId]/route.ts:GET", { statuses: [400], reason: "없는 카드 묶음 번호 형식 거절" }],
  ["src/app/api/connect/[provider]/route.ts:GET", { statuses: [503], reason: "Threads OAuth 설정 미준비 거절" }],
  ["src/app/api/engagement/route.ts:GET", { statuses: [404], reason: "지정 작업 공간의 발행 글 없음" }],
  ["src/app/api/figma-mcp/callback/route.ts:GET", { statuses: [400], reason: "OAuth state 불일치 거절" }],
  ["src/app/api/higgsfield/asset/[file]/route.ts:GET", { statuses: [404], reason: "없는 자산 거절" }],
  ["src/app/api/images/deliver/[token]/route.ts:GET", { statuses: [404], reason: "없는 전달 토큰 거절" }],
  ["src/app/api/isolation-proof/route.ts:GET", { statuses: [401], reason: "테넌트 인증 토큰 없음" }],
  ["src/app/api/media/[token]/route.ts:GET", { statuses: [404], reason: "없는 서명 미디어 토큰 거절" }],
  ["src/app/api/media/[token]/route.ts:HEAD", { statuses: [404], reason: "없는 서명 미디어 토큰을 본문 없이 거절" }],
  ["src/app/api/studio/v1/derivations/[batchId]/route.ts:GET", { statuses: [404], reason: "없는 파생 작업 거절" }],
  ["src/app/api/studio/v1/generations/[jobId]/route.ts:GET", { statuses: [404], reason: "없는 생성 작업 거절" }],
  ["src/app/api/studio/v1/shorts-factory/runs/[runId]/route.ts:GET", { statuses: [404], reason: "없는 숏폼 공장 실행 거절" }],
  ["src/app/api/tiktok/creator-info/route.ts:GET", { statuses: [400], reason: "토큰에서 테넌트 확인 불가" }],
  ["src/app/api/tiktok/publish-status/route.ts:GET", { statuses: [400], reason: "토큰에서 테넌트 확인 불가" }],
]);

const gitCommit = execFileSync("git", ["rev-parse", "HEAD"], { cwd: dashboardRoot, encoding: "utf8" }).trim();
const healthResponse = await fetch(new URL("/api/health", baseUrl), {
  headers: { accept: "application/json" },
  signal: AbortSignal.timeout(Math.min(requestTimeoutMs, 10_000)),
});
const healthBody = await healthResponse.json().catch(() => null);
const serverBuildCommit = healthBody && typeof healthBody === "object" && typeof healthBody.build_commit === "string"
  ? healthBody.build_commit
  : "";
const buildCommitMatches = healthResponse.ok && serverBuildCommit === gitCommit;
if (!buildCommitMatches) {
  throw new Error(`실행 서버 커밋 불일치: SERVER=${serverBuildCommit || "없음"} EXPECTED=${gitCommit}`);
}

const files = await collectRouteFiles(apiRoot);
const requests = files.flatMap(({ file, methods }) => methods.map((method) => ({ file, method })));
const results = [];
const deadlineAt = Date.now() + totalTimeoutMs;
let cursor = 0;

async function collectFiles(directory) {
  const entries = await fs.readdir(directory, { withFileTypes: true });
  const collected = [];
  for (const entry of entries) {
    const fullPath = path.join(directory, entry.name);
    if (entry.isDirectory()) collected.push(...await collectFiles(fullPath));
    if (entry.isFile()) collected.push(fullPath);
  }
  return collected;
}

const evidenceFiles = [
  ...await collectFiles(path.join(dashboardRoot, "src")),
  ...await collectFiles(path.join(dashboardRoot, "scripts")),
].sort();

async function sourceHash() {
  const hash = createHash("sha256");
  for (const file of evidenceFiles) {
    hash.update(path.relative(dashboardRoot, file));
    hash.update("\0");
    hash.update(await fs.readFile(file));
    hash.update("\0");
  }
  return hash.digest("hex");
}

function listenerPids() {
  const url = new URL(baseUrl);
  const port = url.port || (url.protocol === "https:" ? "443" : "80");
  try {
    return execFileSync("lsof", ["-nP", "-t", `-iTCP:${port}`, "-sTCP:LISTEN"], { encoding: "utf8" })
      .trim().split(/\s+/).filter(Boolean).sort();
  } catch {
    return [];
  }
}

const sourceHashBefore = await sourceHash();
const listenerPidsBefore = listenerPids();

async function inspectRoute({ file, method }) {
  const apiPath = routePath(file);
  const url = requestUrl(apiPath);
  const relativeFile = path.relative(dashboardRoot, file);
  const expectedRejection = expectedRejections.get(`${relativeFile}:${method}`);
  const expectedContract = expectedRejection?.reason || "2xx 성공. 3xx, 예상하지 않은 4xx·5xx는 계약 재검토";
  const startedAt = Date.now();
  const remainingMs = deadlineAt - startedAt;
  if (remainingMs <= 0) {
    results.push({
      route: apiPath,
      method,
      file: relativeFile,
      expected_contract: expectedContract,
      status: 0,
      classification: "전체 시간 초과",
      duration_ms: 0,
      body_sha256: "",
      body_preview: "전체 실행시간 예산이 끝나 요청하지 않았습니다",
    });
    return;
  }
  try {
    const response = await fetch(url, {
      method,
      headers: requestHeaders(apiPath),
      redirect: "manual",
      signal: AbortSignal.timeout(Math.min(requestTimeoutMs, remainingMs)),
    });
    const fullBody = await response.text();
    const safeBody = redact(fullBody);
    const classification = classifyApiReadResponse({
      status: response.status,
      expectedRejection,
      method,
      contentType: response.headers.get("content-type") || "",
      bodyText: fullBody,
    });
    results.push({
      route: apiPath,
      method,
      file: relativeFile,
      expected_contract: expectedContract,
      status: response.status,
      classification,
      duration_ms: Date.now() - startedAt,
      body_sha256: createHash("sha256").update(safeBody).digest("hex"),
      body_preview: response.status >= 400 || classification !== "정상"
        ? safeBody.replace(/\s+/g, " ").slice(0, 220)
        : "",
    });
  } catch (error) {
    results.push({
      route: apiPath,
      method,
      file: relativeFile,
      expected_contract: expectedContract,
      status: 0,
      classification: "요청 실패",
      duration_ms: Date.now() - startedAt,
      body_sha256: "",
      body_preview: redact(error instanceof Error ? error.message : String(error)),
    });
  }
}

await Promise.all(Array.from({ length: Math.min(sweepConcurrency, files.length) }, async () => {
  while (cursor < requests.length) {
    const request = requests[cursor++];
    await inspectRoute(request);
  }
}));
results.sort((left, right) => left.route.localeCompare(right.route) || left.method.localeCompare(right.method));

const sourceHashAfter = await sourceHash();
const listenerPidsAfter = listenerPids();
const evidenceStable = sourceHashBefore === sourceHashAfter
  && JSON.stringify(listenerPidsBefore) === JSON.stringify(listenerPidsAfter)
  && listenerPidsBefore.length > 0;

const counts = Object.fromEntries(
  [...new Set(results.map((result) => result.classification))]
    .sort()
    .map((name) => [name, results.filter((result) => result.classification === name).length]),
);
const report = {
  observed_at: new Date().toISOString(),
  base_url: baseUrl,
  git_commit: gitCommit,
  server_build_commit: serverBuildCommit || null,
  build_commit_matches: buildCommitMatches,
  workspace_id: workspaceId,
  request_timeout_ms: requestTimeoutMs,
  total_timeout_ms: totalTimeoutMs,
  concurrency: sweepConcurrency,
  route_count: files.length,
  request_count: requests.length,
  method_counts: Object.fromEntries(READ_METHODS.map((method) => [method, requests.filter((entry) => entry.method === method).length])),
  listener_pids_before: listenerPidsBefore,
  listener_pids_after: listenerPidsAfter,
  source_hash_before: sourceHashBefore,
  source_hash_after: sourceHashAfter,
  source_hash_scope: ["src/**/*", "scripts/**/*"],
  evidence_stable: evidenceStable,
  counts,
  results,
};

for (const result of results) {
  const detail = result.body_preview ? ` ${result.body_preview}` : "";
  console.log(`${result.status}\t${result.classification}\t${result.method}\t${result.route}${detail}`);
}
console.log(`합계 경로 ${files.length}개, 요청 ${requests.length}개 ${JSON.stringify(counts)}`);
console.log(`증거 고정 ${evidenceStable ? "PASS" : "FAIL"} PID ${listenerPidsBefore.join(",") || "없음"} -> ${listenerPidsAfter.join(",") || "없음"} HASH ${sourceHashBefore} -> ${sourceHashAfter}`);
console.log(`실행 커밋 ${buildCommitMatches ? "PASS" : "FAIL"} SERVER ${serverBuildCommit || "없음"} EXPECTED ${gitCommit}`);

if (outputPath) await fs.writeFile(outputPath, `${JSON.stringify(report, null, 2)}\n`, "utf8");

const failed = results.filter((result) => !["정상", "계약상 거절"].includes(result.classification));
process.exit(failed.length || !evidenceStable || !buildCommitMatches ? 1 : 0);
