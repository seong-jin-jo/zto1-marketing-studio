#!/usr/bin/env node

// Runs the tsdown build with output cleanup, stale chunk pruning, and bounded
// child-process diagnostics.
import { spawn, spawnSync } from "node:child_process";
import os from "node:os";
import fs from "node:fs";
import path from "node:path";
import { pathToFileURL } from "node:url";
import { BUNDLED_PLUGIN_PATH_PREFIX } from "./lib/bundled-plugin-paths.mjs";
import { TSDOWN_PACKAGE_OUTPUT_ROOTS } from "./lib/tsdown-output-roots.mjs";
import { resolvePnpmRunner } from "./pnpm-runner.mjs";
import {
  isSourceCheckoutRoot,
  pruneBundledPluginSourceNodeModules,
} from "./postinstall-bundled-plugins.mjs";

const logLevel = process.env.OPENCLAW_BUILD_VERBOSE ? "info" : "warn";
const INEFFECTIVE_DYNAMIC_IMPORT_MARKER = "[INEFFECTIVE_DYNAMIC_IMPORT]";
const UNRESOLVED_IMPORT_RE = /\[UNRESOLVED_IMPORT\]/;
const ANSI_ESCAPE_RE = new RegExp(String.raw`\u001B\[[0-9;]*m`, "g");
const DEPENDENCY_PATH_MARKERS = ["node_modules/", "openclaw-pnpm-node-modules/"];
const HASHED_ROOT_JS_RE = /^(?<base>.+)-[A-Za-z0-9_-]+\.js$/u;
const DEFAULT_CAPTURE_BYTES = 8 * 1024 * 1024;
const DEFAULT_HEARTBEAT_MS = 30_000;
const DEFAULT_TSDOWN_MAX_OLD_SPACE_MB = 12288;
const DEFAULT_WINDOWS_TSDOWN_MAX_OLD_SPACE_MB = 8192;
const MIN_TSDOWN_MAX_OLD_SPACE_MB = 2048;
// 빌드가 아닌 것들 몫으로 남겨 둘 메모리.
//
// 종전 768MB 는 "이 기계는 빌드 전용" 이라는 가정이다. 그 가정이 안 맞는 곳이 있다.
// OSMU 배포 머신(marketing VM)은 총 7,941MB 인데 서비스 컨테이너 8개와 운영체제가
// 상시 약 1,800MB 를 쓰고, 그 위에서 도커 데몬과 BuildKit 이 빌드를 돌린다.
//
// 2026-09-14 실측. 그 머신에서 게이트웨이 이미지 하나를 직렬로 빌드했다. 768MB 여유로
// 계산된 힙 상한은 7,173MB(= 7,941 - 768) 였고, 사용 메모리가 4,009 → 5,562 → 7,166 →
// 7,699MB 로 올라간 뒤 **머신이 통째로 응답을 멈췄다.** SSH 도 끊겼다. 그 전 배포들도
// 같은 이유로 exit 137 과 exit 255 로 죽었고 한 번은 CI 러너까지 같이 내려갔다.
//
// Dockerfile 에서 NODE_OPTIONS 를 낮춰도 소용없다. 아래 normalizeMaxOldSpaceSizeMb 가
// 이 값보다 작은 설정을 다시 올리기 때문이다. 그래서 여기가 진짜 손잡이다.
//
// 3,584MB 를 남기면 위 머신에서 힙 상한이 약 4,329MB 가 되고 운영체제와 컨테이너 몫이
// 남는다(2026-09-26 SSH 재실측: cgroup memory.max=max → /proc/meminfo MemTotal=8,103,680kB
// ≈7,913MB, cgroupCap=max(2048, 7913-3584)=4,329MB). 메모리가 큰 기계는 영향이 없다.
// 상한이 min(12288, 총량 - 여유) 라서 총량이 15.8GB 를 넘으면 12,288MB 로 그대로 걸린다.
//
// 2026-09-26: run 36177984718 이 이 값(4,329MB)에서 attempt 1·2 모두 heap out of memory 로
// 죽었다. 원인은 코드 회귀가 아니다 — 그 커밋(3a3a15db)은 dashboard/ 만 건드렸고 게이트웨이
// build context(`./openclaw`, docker-compose.postagi-4tenants.yml)는 안 건드린다(git diff --stat
// 로 배제 확인). 4,329MB 는 Dockerfile:133 이 명시하는 이 빌드의 힙 하한(4,608MB, 8-플러그인
// 구성 실측치)에 못 미치는 값이었다 — 헤드룸이 아니라 애초에 마진이 없었던 것이다.
//
// 헤드룸을 낮춰 힙을 올리는 안(3,200MB, 힙 ≈4,713MB)은 리뷰에서 반려됐다: 이 빌드는 운영과
// 같은 VM 에서 돌고 BuildKit 이 빌드에 메모리 상한을 안 건다. 힙을 올리면 VM 전체가 멈출
// 여유가 200~400MB 로 줄어든다(추정) — Dockerfile:134 가 전제한 "VM 12GB" 를 헤드룸만 깎아
// 우회하는 셈이라 받아들일 수 없다는 판단이다. 그래서 힙 상한(V8 안)은 3,584MB 헤드룸 그대로
// 두고, 힙 밖에서 rolldown(Rust)이 rayon 스레드마다 잡는 메모리를 RAYON_NUM_THREADS=1 로
// 줄인다(이 빌드에서만 — Dockerfile 의 pnpm build:docker RUN 에서 export). 코어 수만큼(이
// 머신은 4) 뜨던 스레드를 1개로 묶어 힙 밖 사용량 자체를 줄이는 접근이라, VM 여유 자체를
// 깎지 않는다. 실제 통과 여부는 이 값을 실은 다음 배포 run 의 [tsdown-build] 로그로 확인한다
// (운영 VM 위험 때문에 이 PR 에서 게이트웨이 빌드를 직접 재현·검증하지는 않았다).
const TSDOWN_CGROUP_MEMORY_HEADROOM_MB = 3584;
const CGROUP_MEMORY_LIMIT_PATHS = [
  "/sys/fs/cgroup/memory.max",
  "/sys/fs/cgroup/memory/memory.limit_in_bytes",
];
const PROC_MEMINFO_PATH = "/proc/meminfo";
const TERMINATION_GRACE_MS = 5_000;
const ROOT_TSDOWN_OUTPUT_ROOTS = ["dist", "dist-runtime"];
const PRESERVED_TSDOWN_OUTPUT_FILES = ["dist/cli-startup-metadata.json"];
const PRESERVE_CLI_STARTUP_METADATA_ENV = "OPENCLAW_PRESERVE_CLI_STARTUP_METADATA";
const GENERATED_SOURCE_DECLARATION_PATHSPEC = ":(glob)extensions/**/*.d.ts";
const DECLARATION_EXTENSIONS = [".d.ts", ".d.mts", ".d.cts"];
const SOURCE_DECLARATION_SOURCE_EXTENSIONS = [".ts", ".tsx", ".mts", ".cts", ".js", ".mjs", ".cjs"];
const RUN_NODE_SKIP_DTS_BUILD_ENV = "OPENCLAW_RUN_NODE_SKIP_DTS_BUILD";

function removeDistPluginNodeModulesSymlinks(rootDir) {
  const extensionsDir = path.join(rootDir, "extensions");
  if (!fs.existsSync(extensionsDir)) {
    return;
  }

  for (const dirent of fs.readdirSync(extensionsDir, { withFileTypes: true })) {
    if (!dirent.isDirectory()) {
      continue;
    }
    const nodeModulesPath = path.join(extensionsDir, dirent.name, "node_modules");
    try {
      if (fs.lstatSync(nodeModulesPath).isSymbolicLink()) {
        fs.rmSync(nodeModulesPath, { force: true, recursive: true });
      }
    } catch {
      // Skip missing or unreadable paths so the build can proceed.
    }
  }
}

function pruneStaleRuntimeSymlinks() {
  const cwd = process.cwd();
  // runtime-postbuild stages plugin-owned node_modules into dist/ and links the
  // dist-runtime overlay back to that tree. Remove only those symlinks up front
  // so tsdown's clean step cannot traverse stale runtime overlays on rebuilds.
  removeDistPluginNodeModulesSymlinks(path.join(cwd, "dist"));
  removeDistPluginNodeModulesSymlinks(path.join(cwd, "dist-runtime"));
}

/**
 * Removes build output roots while preserving explicitly protected artifacts.
 */
export function cleanTsdownOutputRoots(params = {}) {
  const cwd = params.cwd ?? process.cwd();
  const fsImpl = params.fs ?? fs;
  const env = params.env ?? process.env;
  const roots = listTsdownOutputRoots();
  const protectedDeclarationPaths =
    env[RUN_NODE_SKIP_DTS_BUILD_ENV] === "1"
      ? listExistingDeclarationOutputPaths({
          cwd,
          fs: fsImpl,
          roots,
        })
      : new Set();
  const protectedPaths = new Set([
    ...protectedDeclarationPaths,
    ...listExistingPreservedOutputPaths({ cwd, env, fs: fsImpl }),
  ]);
  for (const root of roots) {
    const rootPath = path.join(cwd, root);
    try {
      if (hasProtectedChild({ rootPath, protectedPaths })) {
        cleanOutputRootExcept(rootPath, protectedPaths, fsImpl);
      } else {
        fsImpl.rmSync(rootPath, { force: true, recursive: true });
      }
    } catch {
      // Best-effort cleanup. tsdown will recreate the output tree it needs.
    }
  }
}

function hasProtectedChild({ rootPath, protectedPaths }) {
  const rootWithSeparator = `${path.resolve(rootPath)}${path.sep}`;
  for (const protectedPath of protectedPaths) {
    if (protectedPath.startsWith(rootWithSeparator)) {
      return true;
    }
  }
  return false;
}

function cleanOutputRootExcept(rootPath, protectedPaths, fsImpl) {
  let entries;
  try {
    entries = fsImpl.readdirSync(rootPath, { withFileTypes: true });
  } catch {
    return;
  }

  for (const entry of entries) {
    const entryPath = path.join(rootPath, entry.name);
    const resolvedEntryPath = path.resolve(entryPath);
    if (protectedPaths.has(resolvedEntryPath)) {
      continue;
    }
    try {
      if (entry.isDirectory()) {
        cleanOutputRootExcept(entryPath, protectedPaths, fsImpl);
        fsImpl.rmdirSync(entryPath);
      } else {
        fsImpl.rmSync(entryPath, { force: true });
      }
    } catch {
      // Keep best-effort semantics; protected declaration children can keep a directory non-empty.
    }
  }
}

function listExistingDeclarationOutputPaths({ cwd, fs: fsImpl, roots }) {
  const protectedPaths = new Set();
  for (const root of roots) {
    collectDeclarationOutputPaths(path.join(cwd, root), protectedPaths, fsImpl);
  }
  return protectedPaths;
}

function listExistingPreservedOutputPaths({ cwd, env, fs: fsImpl }) {
  const protectedPaths = new Set();
  if (env[PRESERVE_CLI_STARTUP_METADATA_ENV] !== "1") {
    return protectedPaths;
  }
  for (const relativePath of PRESERVED_TSDOWN_OUTPUT_FILES) {
    const absolutePath = path.resolve(cwd, relativePath);
    try {
      if (fsImpl.statSync(absolutePath).isFile()) {
        protectedPaths.add(absolutePath);
      }
    } catch {
      // Missing preserved outputs are normal on first build.
    }
  }
  return protectedPaths;
}

function collectDeclarationOutputPaths(rootPath, protectedPaths, fsImpl) {
  let entries;
  try {
    entries = fsImpl.readdirSync(rootPath, { withFileTypes: true });
  } catch {
    return;
  }

  for (const entry of entries) {
    const entryPath = path.join(rootPath, entry.name);
    if (entry.isDirectory()) {
      collectDeclarationOutputPaths(entryPath, protectedPaths, fsImpl);
    } else if (DECLARATION_EXTENSIONS.some((extension) => entry.name.endsWith(extension))) {
      protectedPaths.add(path.resolve(entryPath));
    }
  }
}

export function pruneStaleRootChunkFiles(params = {}) {
  const cwd = params.cwd ?? process.cwd();
  const fsImpl = params.fs ?? fs;
  const roots = listTsdownOutputRoots({ cwd, fs: fsImpl }).map((root) => path.join(cwd, root));
  for (const root of roots) {
    let entries;
    try {
      entries = fsImpl.readdirSync(root, { withFileTypes: true });
    } catch {
      continue;
    }

    for (const entry of entries) {
      if (!entry.isFile()) {
        continue;
      }
      if (!HASHED_ROOT_JS_RE.test(entry.name)) {
        continue;
      }
      try {
        fsImpl.rmSync(path.join(root, entry.name), { force: true });
      } catch {
        // Best-effort cleanup. The subsequent build will overwrite any stragglers.
      }
    }
  }
}

export function listTsdownOutputRoots() {
  return [...ROOT_TSDOWN_OUTPUT_ROOTS, ...TSDOWN_PACKAGE_OUTPUT_ROOTS];
}

export function pruneUntrackedGeneratedSourceDeclarations(params = {}) {
  const cwd = params.cwd ?? process.cwd();
  const fsImpl = params.fs ?? fs;
  const spawnSyncImpl = params.spawnSync ?? spawnSync;
  let result;
  try {
    result = spawnSyncImpl(
      "git",
      ["ls-files", "--others", "--exclude-standard", "--", GENERATED_SOURCE_DECLARATION_PATHSPEC],
      {
        cwd,
        encoding: "utf8",
        stdio: ["ignore", "pipe", "ignore"],
      },
    );
  } catch {
    return 0;
  }
  if (result.status !== 0 || typeof result.stdout !== "string") {
    return 0;
  }

  let removed = 0;
  for (const rawPath of result.stdout.split(/\r?\n/u)) {
    const relativePath = rawPath.trim().replaceAll("\\", "/");
    if (!relativePath.startsWith("extensions/") || !relativePath.endsWith(".d.ts")) {
      continue;
    }
    const declarationPath = path.join(cwd, relativePath);
    const sourceBase = declarationPath.slice(0, -".d.ts".length);
    const hasMatchingSource = SOURCE_DECLARATION_SOURCE_EXTENSIONS.some((extension) =>
      fsImpl.existsSync(`${sourceBase}${extension}`),
    );
    if (!hasMatchingSource) {
      continue;
    }
    try {
      fsImpl.rmSync(declarationPath, { force: true });
      removed += 1;
    } catch {
      // Best-effort cleanup; tsdown will still report any remaining stale files.
    }
  }
  return removed;
}

export function pruneSourceCheckoutBundledPluginNodeModules(params = {}) {
  const cwd = params.cwd ?? process.cwd();
  const logger = params.logger ?? console;
  if (!isSourceCheckoutRoot({ packageRoot: cwd, existsSync: fs.existsSync })) {
    return;
  }
  try {
    pruneBundledPluginSourceNodeModules({
      extensionsDir: path.join(cwd, "extensions"),
      existsSync: fs.existsSync,
      readdirSync: fs.readdirSync,
      rmSync: fs.rmSync,
    });
  } catch (error) {
    logger.warn(`tsdown: could not prune bundled plugin source node_modules: ${String(error)}`);
  }
}

function findFatalUnresolvedImport(lines) {
  for (const line of lines) {
    if (!UNRESOLVED_IMPORT_RE.test(line)) {
      continue;
    }

    const normalizedLine = line.replace(ANSI_ESCAPE_RE, "");
    if (
      !normalizedLine.includes(BUNDLED_PLUGIN_PATH_PREFIX) &&
      !DEPENDENCY_PATH_MARKERS.some((marker) => normalizedLine.includes(marker))
    ) {
      return normalizedLine;
    }
  }

  return null;
}

function parsePositiveIntegerEnv(value, name) {
  if (typeof value !== "string" || value.trim() === "") {
    return null;
  }
  const text = value.trim();
  if (!/^\d+$/u.test(text)) {
    throw new Error(`${name} must be a positive integer`);
  }
  const parsed = Number(text);
  if (!Number.isSafeInteger(parsed) || parsed <= 0) {
    throw new Error(`${name} must be a positive safe integer`);
  }
  return parsed;
}

function parseNonNegativeIntegerEnv(value, name) {
  if (typeof value !== "string" || value.trim() === "") {
    return null;
  }
  const text = value.trim();
  if (!/^\d+$/u.test(text)) {
    throw new Error(`${name} must be a non-negative integer`);
  }
  const parsed = Number(text);
  if (!Number.isSafeInteger(parsed)) {
    throw new Error(`${name} must be a non-negative safe integer`);
  }
  return parsed;
}

function parseCgroupMemoryLimitBytes(value) {
  if (typeof value !== "string") {
    return null;
  }
  const trimmed = value.trim();
  if (trimmed === "" || trimmed === "max" || !/^\d+$/u.test(trimmed)) {
    return null;
  }
  const parsed = BigInt(trimmed);
  if (parsed <= 0n || parsed > BigInt(Number.MAX_SAFE_INTEGER)) {
    return null;
  }
  return Number(parsed);
}

function readCgroupMemoryLimitBytes(params = {}) {
  if (Number.isFinite(params.cgroupMemoryLimitBytes) && params.cgroupMemoryLimitBytes > 0) {
    return Math.trunc(params.cgroupMemoryLimitBytes);
  }

  const fsImpl = params.fs ?? fs;
  const paths = params.cgroupMemoryLimitPaths ?? CGROUP_MEMORY_LIMIT_PATHS;
  for (const limitPath of paths) {
    try {
      const limitBytes = parseCgroupMemoryLimitBytes(fsImpl.readFileSync(limitPath, "utf8"));
      if (limitBytes !== null) {
        return limitBytes;
      }
    } catch {
      // Missing cgroup files are expected outside Linux containers.
    }
  }

  return null;
}

function parseProcMemTotalBytes(value) {
  if (typeof value !== "string") {
    return null;
  }
  const match = value.match(/^MemTotal:\s+(\d+)\s+kB$/imu);
  if (!match) {
    return null;
  }
  const parsed = BigInt(match[1]) * 1024n;
  if (parsed <= 0n || parsed > BigInt(Number.MAX_SAFE_INTEGER)) {
    return null;
  }
  return Number(parsed);
}

function readProcMemTotalBytes(params = {}) {
  if (Number.isFinite(params.procMemTotalBytes) && params.procMemTotalBytes > 0) {
    return Math.trunc(params.procMemTotalBytes);
  }

  const fsImpl = params.fs ?? fs;
  try {
    return parseProcMemTotalBytes(
      fsImpl.readFileSync(params.procMeminfoPath ?? PROC_MEMINFO_PATH, "utf8"),
    );
  } catch {
    return null;
  }
}

function resolveTsdownMaxOldSpaceMb(params = {}) {
  const defaultMaxOldSpaceMb =
    (params.platform ?? process.platform) === "win32"
      ? DEFAULT_WINDOWS_TSDOWN_MAX_OLD_SPACE_MB
      : DEFAULT_TSDOWN_MAX_OLD_SPACE_MB;
  const limitBytes = readCgroupMemoryLimitBytes(params) ?? readProcMemTotalBytes(params);
  if (limitBytes === null) {
    return defaultMaxOldSpaceMb;
  }

  const limitMb = Math.floor(limitBytes / 1024 / 1024);
  if (limitMb <= 0) {
    return defaultMaxOldSpaceMb;
  }

  const cgroupCap = Math.max(
    MIN_TSDOWN_MAX_OLD_SPACE_MB,
    limitMb - TSDOWN_CGROUP_MEMORY_HEADROOM_MB,
  );
  return Math.min(defaultMaxOldSpaceMb, cgroupCap);
}

function parseMaxOldSpaceSizeMb(value, fallbackMb) {
  const parsed = Number(value);
  if (!Number.isFinite(parsed) || parsed <= 0) {
    return fallbackMb;
  }
  return Math.trunc(parsed);
}

function normalizeMaxOldSpaceSizeMb(value, maxOldSpaceMb) {
  // Build wrappers may inherit smaller runner-level caps; tsdown needs the
  // resolved build heap while still respecting cgroup-derived upper bounds.
  const parsed = parseMaxOldSpaceSizeMb(value, maxOldSpaceMb);
  if (parsed < maxOldSpaceMb) {
    return maxOldSpaceMb;
  }
  return Math.min(parsed, maxOldSpaceMb);
}

function normalizeTsdownNodeOptions(nodeOptions, params = {}) {
  const maxOldSpaceMb = resolveTsdownMaxOldSpaceMb(params);
  const parts = nodeOptions.trim().split(/\s+/u).filter(Boolean);
  const normalized = [];
  let foundMaxOldSpaceSize = false;

  for (let index = 0; index < parts.length; index += 1) {
    const part = parts[index];
    const inlineMatch = part.match(/^--max-old-space-size=(\d+)$/u);
    if (inlineMatch) {
      foundMaxOldSpaceSize = true;
      const value = normalizeMaxOldSpaceSizeMb(inlineMatch[1], maxOldSpaceMb);
      normalized.push(`--max-old-space-size=${value}`);
      continue;
    }

    if (part === "--max-old-space-size") {
      foundMaxOldSpaceSize = true;
      const next = parts[index + 1];
      const value = normalizeMaxOldSpaceSizeMb(next, maxOldSpaceMb);
      normalized.push(`--max-old-space-size=${value}`);
      if (next !== undefined) {
        index += 1;
      }
      continue;
    }

    normalized.push(part);
  }

  if (!foundMaxOldSpaceSize) {
    normalized.push(`--max-old-space-size=${maxOldSpaceMb}`);
  }

  return normalized.join(" ");
}

// 번들러 작업 스레드 수를 메모리에 맞춰 묶는다.
//
// tsdown 은 rolldown(Rust)을 쓴다. 그쪽이 잡는 메모리는 V8 힙 밖이라
// --max-old-space-size 로 안 잡힌다. 2026-09-14 실측: 힙 상한을 4,357MB 로 낮췄는데도
// 배포 머신에서 총 사용이 7,147MB 까지 갔고 tsdown 이 SIGABRT 로 죽었다. 차이 약 2.8GB 가
// 힙 밖이다. rayon 작업 스레드가 코어 수만큼(이 머신은 4) 뜨고 각자 메모리를 든다.
//
// 그래서 메모리 여유로 스레드 수를 정한다. 스레드당 약 1,024MB 를 잡고 최소 1, 최대는
// 코어 수다. 이 머신(여유 4,357MB 기준)에서는 2 로 떨어진다. 메모리가 큰 기계는 코어 수
// 그대로라 느려지지 않는다. 이미 값이 지정돼 있으면 존중한다.
function resolveRayonThreads(params = {}, maxOldSpaceMb) {
  const cpus = params.cpuCount ?? os.cpus().length ?? 1;
  const perThreadMb = 1024;
  const byMemory = Math.max(1, Math.floor(maxOldSpaceMb / perThreadMb) - 2);
  return Math.max(1, Math.min(cpus, byMemory));
}

function resolveTsdownEnv(env, params = {}) {
  const nodeOptions = env.NODE_OPTIONS?.trim() ?? "";
  const maxOldSpaceMb = resolveTsdownMaxOldSpaceMb(params);
  const next = {
    ...env,
    NODE_OPTIONS: normalizeTsdownNodeOptions(nodeOptions, params),
  };
  if (!next.RAYON_NUM_THREADS) {
    next.RAYON_NUM_THREADS = String(resolveRayonThreads(params, maxOldSpaceMb));
  }
  return next;
}

export function tsdownBuildUsage() {
  return [
    "Usage: node scripts/tsdown-build.mjs [tsdown args...]",
    "",
    "Builds OpenClaw with tsdown and validates emitted import diagnostics.",
    "",
    "Options:",
    "  -h, --help  Show this help without starting tsdown.",
    "",
    "Other arguments are forwarded to tsdown.",
  ].join("\n");
}

export function parseTsdownBuildArgs(argv) {
  if (argv.includes("--help") || argv.includes("-h")) {
    return {
      forwardedArgs: [],
      help: true,
    };
  }
  return {
    forwardedArgs: argv,
    help: false,
  };
}

export function createTsdownOutputScanner(params = {}) {
  const maxCaptureBytes = params.maxCaptureBytes ?? DEFAULT_CAPTURE_BYTES;
  let captured = "";
  let pendingLine = "";
  let hasIneffectiveDynamicImport = false;
  let fatalUnresolvedImport = null;

  function scanLines(text) {
    const combined = pendingLine + text;
    const lines = combined.split(/\r?\n/u);
    pendingLine = lines.pop() ?? "";
    for (const line of lines) {
      fatalUnresolvedImport ??= findFatalUnresolvedImport([line]);
    }
  }

  return {
    append(chunk) {
      const text = Buffer.isBuffer(chunk) ? chunk.toString("utf8") : String(chunk);
      if (text.includes(INEFFECTIVE_DYNAMIC_IMPORT_MARKER)) {
        hasIneffectiveDynamicImport = true;
      }
      scanLines(text);
      captured += text;
      if (captured.length > maxCaptureBytes) {
        captured = captured.slice(-maxCaptureBytes);
      }
    },
    finish() {
      if (pendingLine) {
        fatalUnresolvedImport ??= findFatalUnresolvedImport([pendingLine]);
        pendingLine = "";
      }
      return {
        captured,
        hasIneffectiveDynamicImport,
        fatalUnresolvedImport,
      };
    },
  };
}

// 힙(V8 max-old-space-size)과 rayon 스레드 수를 실행 직전에 한 줄로 남긴다. 계산이 맞는지
// 배포 로그만 보고 확인할 수 있어야, 다음 실패가 났을 때 SSH로 재현할 필요가 없다
// (2026-09-26 리뷰 지적 — 이 값들은 지금까지 로그에 안 남아 SSH로만 재구성했었다).
function logTsdownMemoryPlan(params, env) {
  const logFn = params.logMemoryPlan ?? console.log;
  const limitBytes = readCgroupMemoryLimitBytes(params) ?? readProcMemTotalBytes(params);
  const memTotalMb = limitBytes === null ? "unknown" : Math.floor(limitBytes / 1024 / 1024);
  const heapMatch = env.NODE_OPTIONS?.match(/--max-old-space-size=(\d+)/u);
  const heapCapMb = heapMatch ? heapMatch[1] : "unknown";
  logFn(
    `[tsdown-build] memTotal=${memTotalMb}MB heapCap=${heapCapMb}MB rayon=${env.RAYON_NUM_THREADS ?? "unset"}`,
  );
}

export function resolveTsdownBuildInvocation(params = {}) {
  const env = resolveTsdownEnv(params.env ?? process.env, params);
  logTsdownMemoryPlan(params, env);
  const forwardedArgs = params.args ?? [];
  const tsdownArgs = [
    "--config-loader",
    "unrun",
    "--logLevel",
    logLevel,
    "--no-clean",
    ...forwardedArgs,
  ];
  if (env.OPENCLAW_BUILD_ALL_NO_PNPM === "1") {
    return {
      command: params.nodeExecPath ?? process.execPath,
      args: ["node_modules/tsdown/dist/run.mjs", ...tsdownArgs],
      options: {
        stdio: ["ignore", "pipe", "pipe"],
        shell: false,
        windowsVerbatimArguments: undefined,
        env,
      },
    };
  }
  const runner = resolvePnpmRunner({
    env,
    pnpmArgs: ["exec", "tsdown", ...tsdownArgs],
    nodeExecPath: params.nodeExecPath ?? process.execPath,
    npmExecPath: params.npmExecPath ?? env.npm_execpath,
    comSpec: params.comSpec ?? env.ComSpec,
    platform: params.platform ?? process.platform,
  });
  return {
    command: runner.command,
    args: runner.args,
    options: {
      stdio: ["ignore", "pipe", "pipe"],
      shell: runner.shell,
      windowsVerbatimArguments: runner.windowsVerbatimArguments,
      env,
    },
  };
}

export async function runTsdownBuildInvocation(invocation, params = {}) {
  const stdout = params.stdout ?? process.stdout;
  const stderr = params.stderr ?? process.stderr;
  const env = params.env ?? process.env;
  const scanner = params.scanner ?? createTsdownOutputScanner();
  const timeoutMs = parsePositiveIntegerEnv(
    env.OPENCLAW_TSDOWN_TIMEOUT_MS,
    "OPENCLAW_TSDOWN_TIMEOUT_MS",
  );
  const heartbeatMs =
    parseNonNegativeIntegerEnv(env.OPENCLAW_TSDOWN_HEARTBEAT_MS, "OPENCLAW_TSDOWN_HEARTBEAT_MS") ??
    DEFAULT_HEARTBEAT_MS;
  let timedOut = false;
  let settled = false;
  let lastOutputAt = Date.now();

  const child = spawn(invocation.command, invocation.args, invocation.options);
  const pidText = child.pid ? ` pid=${child.pid}` : "";

  function markOutput() {
    lastOutputAt = Date.now();
  }

  child.stdout?.on("data", (chunk) => {
    markOutput();
    scanner.append(chunk);
    stdout.write(chunk);
  });
  child.stderr?.on("data", (chunk) => {
    markOutput();
    scanner.append(chunk);
    stderr.write(chunk);
  });

  const heartbeat =
    heartbeatMs > 0
      ? setInterval(() => {
          if (settled) {
            return;
          }
          const silentForMs = Date.now() - lastOutputAt;
          if (silentForMs < heartbeatMs) {
            return;
          }
          stderr.write(
            `[tsdown-build] still running${pidText}; no output for ${Math.round(
              silentForMs / 1000,
            )}s\n`,
          );
          lastOutputAt = Date.now();
        }, heartbeatMs).unref()
      : null;

  const timeout =
    timeoutMs !== null
      ? setTimeout(() => {
          timedOut = true;
          stderr.write(`[tsdown-build] timeout after ${timeoutMs}ms${pidText}; sending SIGTERM\n`);
          child.kill("SIGTERM");
          setTimeout(() => {
            if (!settled) {
              stderr.write(`[tsdown-build] forcing SIGKILL${pidText}\n`);
              child.kill("SIGKILL");
            }
          }, TERMINATION_GRACE_MS).unref();
        }, timeoutMs).unref()
      : null;

  return new Promise((resolve) => {
    child.once("error", (error) => {
      settled = true;
      clearInterval(heartbeat);
      clearTimeout(timeout);
      stderr.write(`[tsdown-build] failed to start: ${String(error)}\n`);
      resolve({
        status: 1,
        signal: null,
        timedOut,
        error,
        ...scanner.finish(),
      });
    });
    child.once("close", (status, signal) => {
      settled = true;
      clearInterval(heartbeat);
      clearTimeout(timeout);
      resolve({
        status,
        signal,
        timedOut,
        error: null,
        ...scanner.finish(),
      });
    });
  });
}

function isMainModule() {
  const argv1 = process.argv[1];
  if (!argv1) {
    return false;
  }
  return import.meta.url === pathToFileURL(argv1).href;
}

if (isMainModule()) {
  const args = parseTsdownBuildArgs(process.argv.slice(2));
  if (args.help) {
    console.log(tsdownBuildUsage());
    process.exit(0);
  }
  pruneSourceCheckoutBundledPluginNodeModules();
  pruneUntrackedGeneratedSourceDeclarations();
  pruneStaleRuntimeSymlinks();
  cleanTsdownOutputRoots();
  const invocation = resolveTsdownBuildInvocation({ args: args.forwardedArgs });
  const result = await runTsdownBuildInvocation(invocation);

  if (result.status === 0 && result.hasIneffectiveDynamicImport) {
    console.error(
      "Build emitted [INEFFECTIVE_DYNAMIC_IMPORT]. Replace transparent runtime re-export facades with real runtime boundaries.",
    );
    process.exit(1);
  }

  if (result.status === 0 && result.fatalUnresolvedImport) {
    console.error(
      `Build emitted [UNRESOLVED_IMPORT] outside extensions: ${result.fatalUnresolvedImport}`,
    );
    process.exit(1);
  }

  if (result.timedOut) {
    process.exit(124);
  }

  if (typeof result.status === "number") {
    process.exit(result.status);
  }

  process.exit(1);
}
