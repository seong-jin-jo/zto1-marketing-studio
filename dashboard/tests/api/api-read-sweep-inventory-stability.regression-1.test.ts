import { execFileSync, spawn } from "node:child_process";
import fs from "node:fs";
import http from "node:http";
import os from "node:os";
import path from "node:path";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { sourceFingerprint } from "../../scripts/lib/source-evidence.mjs";

const sweepScript = path.resolve(process.cwd(), "scripts/verify-api-read-sweep.mjs");
let fixtureRoot = "";
let routePath = "";
let server: http.Server;
let baseUrl = "";
let buildCommit = "";
let buildSourceHash = "";
let onSlowRequest: (() => Promise<void>) | null = null;

function git(args: string[]) {
  return execFileSync("git", ["-c", "core.hooksPath=/dev/null", ...args], {
    cwd: fixtureRoot,
    encoding: "utf8",
  }).trim();
}

function runSweep() {
  return new Promise<{ code: number | null; output: string }>((resolve) => {
    const child = spawn(process.execPath, [sweepScript], {
      cwd: process.cwd(),
      env: {
        ...process.env,
        NODE_ENV: "test",
        API_SWEEP_DASHBOARD_ROOT: fixtureRoot,
        API_SWEEP_BASE_URL: baseUrl,
        API_SWEEP_WORKSPACE_ID: "11111111-1111-4111-8111-111111111111",
        API_SWEEP_TENANT_TOKEN: "tenant-test-token",
        API_SWEEP_EXPECTED_LISTENER_PID: String(process.pid),
        API_SWEEP_TIMEOUT_MS: "2000",
        API_SWEEP_TOTAL_TIMEOUT_MS: "5000",
        DASHBOARD_AUTH_TOKEN: "operator-test-token",
        STUDIO_DEV_BEARER_TOKEN: "studio-test-token",
      },
      stdio: ["ignore", "pipe", "pipe"],
    });
    let output = "";
    const timer = setTimeout(() => child.kill("SIGKILL"), 10_000);
    child.stdout.on("data", (chunk) => { output += String(chunk); });
    child.stderr.on("data", (chunk) => { output += String(chunk); });
    child.on("close", (code) => {
      clearTimeout(timer);
      resolve({ code, output });
    });
  });
}

beforeAll(async () => {
  fixtureRoot = fs.mkdtempSync(path.join(os.tmpdir(), "api-sweep-evidence-"));
  routePath = path.join(fixtureRoot, "src/app/api/slow/route.ts");
  fs.mkdirSync(path.dirname(routePath), { recursive: true });
  fs.mkdirSync(path.join(fixtureRoot, "src/app/api/health"), { recursive: true });
  fs.mkdirSync(path.join(fixtureRoot, "scripts"), { recursive: true });
  fs.writeFileSync(routePath, "export async function GET() { return Response.json({ ok: true }); }\n");
  fs.writeFileSync(
    path.join(fixtureRoot, "src/app/api/health/route.ts"),
    "export async function GET() { return Response.json({ ok: true }); }\n",
  );
  fs.writeFileSync(path.join(fixtureRoot, "scripts/fixture.mjs"), "export const fixture = true;\n");
  git(["init", "-q"]);
  git(["config", "user.email", "qa@example.com"]);
  git(["config", "user.name", "QA"]);
  git(["add", "."]);
  git(["commit", "-q", "-m", "fixture"]);
  buildCommit = git(["rev-parse", "HEAD"]);
  buildSourceHash = await sourceFingerprint(fixtureRoot);

  server = http.createServer(async (request, response) => {
    const pathname = new URL(request.url || "/", "http://localhost").pathname;
    if (pathname === "/api/health") {
      response.writeHead(200, { "content-type": "application/json" });
      response.end(JSON.stringify({ ok: true, build_commit: buildCommit, build_source_hash: buildSourceHash }));
      return;
    }
    if (pathname === "/api/slow" && onSlowRequest) await onSlowRequest();
    response.writeHead(200, { "content-type": "application/json" });
    response.end(JSON.stringify({ ok: true, pathname }));
  });
  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
  const address = server.address();
  if (!address || typeof address === "string") throw new Error("fixture server port unavailable");
  baseUrl = `http://127.0.0.1:${address.port}`;
}, 10_000);

afterAll(async () => {
  await new Promise<void>((resolve, reject) => server.close((error) => error ? reject(error) : resolve()));
  fs.rmSync(fixtureRoot, { recursive: true, force: true });
});

describe("API 읽기 전수검사 실행 소스 결속", () => {
  it("REVIEW-24H-20260919-02 정상 경로: 깨끗한 HEAD와 같은 서버 지문이면 실제 스크립트가 성공한다", async () => {
    onSlowRequest = null;
    const result = await runSweep();
    expect(result.code, result.output).toBe(0);
    expect(result.output).toContain("실행 소스 PASS");
    expect(result.output).toContain("실행 중 소스 변경 0건");
  }, 15_000);

  it("REVIEW-24H-20260919-02 거절 경로: 시작부터 dirty인 route는 요청 전에 실패한다", async () => {
    fs.appendFileSync(routePath, "// uncommitted\n");
    const result = await runSweep();
    expect(result.code).toBe(1);
    expect(result.output).toContain("검사 시작 소스가 HEAD와 다릅니다");
    git(["checkout", "--", "."]);
  }, 15_000);

  it("REVIEW-24H-20260919-03 경합: 실행 중 route 수정과 원복을 이벤트로 검출한다", async () => {
    const original = fs.readFileSync(routePath, "utf8");
    onSlowRequest = async () => {
      fs.writeFileSync(routePath, `${original}// transient\n`);
      await new Promise((resolve) => setTimeout(resolve, 80));
      fs.writeFileSync(routePath, original);
      await new Promise((resolve) => setTimeout(resolve, 80));
    };
    const result = await runSweep();
    expect(result.code).toBe(1);
    expect(result.output).toMatch(/실행 중 소스 변경 [1-9]\d*건/);
    expect(git(["status", "--porcelain"])).toBe("");
  }, 15_000);

  it("REVIEW-24H-20260919-05 배선: 실행 중 route 추가와 삭제도 실제 스크립트가 실패한다", async () => {
    const addedRoute = path.join(fixtureRoot, "src/app/api/transient/route.ts");
    onSlowRequest = async () => {
      fs.mkdirSync(path.dirname(addedRoute), { recursive: true });
      fs.writeFileSync(addedRoute, "export async function GET() { return Response.json({ ok: true }); }\n");
      await new Promise((resolve) => setTimeout(resolve, 80));
      fs.rmSync(path.dirname(addedRoute), { recursive: true, force: true });
      await new Promise((resolve) => setTimeout(resolve, 80));
    };
    const result = await runSweep();
    expect(result.code).toBe(1);
    expect(result.output).toMatch(/실행 중 소스 변경 [1-9]\d*건/);
    expect(git(["status", "--porcelain"])).toBe("");
  }, 15_000);
});
