import { execFileSync } from "node:child_process";
import { createHash } from "node:crypto";
import { promises as fs, watch } from "node:fs";
import path from "node:path";

export const SOURCE_SCOPE_DIRS = ["src", "scripts"];

async function collectFiles(directory) {
  const entries = await fs.readdir(directory, { withFileTypes: true });
  const files = [];
  for (const entry of entries) {
    const fullPath = path.join(directory, entry.name);
    if (entry.isDirectory()) files.push(...await collectFiles(fullPath));
    if (entry.isFile()) files.push(fullPath);
  }
  return files;
}

export async function collectEvidenceFiles(dashboardRoot) {
  const groups = await Promise.all(SOURCE_SCOPE_DIRS.map((directory) => (
    collectFiles(path.join(dashboardRoot, directory))
  )));
  return groups.flat().sort();
}

export async function sourceFingerprint(dashboardRoot, evidenceFiles = null) {
  const files = evidenceFiles || await collectEvidenceFiles(dashboardRoot);
  const hash = createHash("sha256");
  for (const file of files) {
    hash.update(path.relative(dashboardRoot, file));
    hash.update("\0");
    hash.update(await fs.readFile(file));
    hash.update("\0");
  }
  return hash.digest("hex");
}

export function gitSourceState(dashboardRoot) {
  const output = execFileSync(
    "git",
    ["status", "--porcelain=v1", "--untracked-files=all", "--", ...SOURCE_SCOPE_DIRS],
    { cwd: dashboardRoot, encoding: "utf8" },
  ).trim();
  const changes = output ? output.split("\n").filter(Boolean) : [];
  return { clean: changes.length === 0, changes };
}

export function watchSourceChanges(dashboardRoot) {
  const events = [];
  const errors = [];
  const watchers = SOURCE_SCOPE_DIRS.map((directory) => {
    const scopeRoot = path.join(dashboardRoot, directory);
    const watcher = watch(scopeRoot, { recursive: true, persistent: false }, (eventType, filename) => {
      events.push({
        event: eventType,
        file: filename ? path.join(directory, String(filename)) : directory,
        observed_at: new Date().toISOString(),
      });
    });
    watcher.on("error", (error) => {
      errors.push(error instanceof Error ? error.message : String(error));
    });
    return watcher;
  });
  return {
    events,
    errors,
    close() {
      for (const watcher of watchers) watcher.close();
    },
  };
}
