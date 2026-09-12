import { readdirSync, readFileSync } from "node:fs";
import { basename, resolve } from "node:path";
import { describe, expect, it } from "vitest";

const dbRoot = resolve(__dirname, "../../db");

function sqlFiles(): string[] {
  return readdirSync(resolve(dbRoot, "migrations"))
    .filter((file) => file.endsWith(".sql"))
    .sort();
}

function manifestFiles(): string[] {
  return readFileSync(resolve(dbRoot, "migration-manifest.tsv"), "utf8")
    .split("\n")
    .filter((line) => line && !line.startsWith("#"))
    .map((line) => basename(line.split("\t")[2] ?? ""))
    .sort();
}

describe("OSMU migration manifest 완전성 회귀", () => {
  // Regression: API-READ-20260912-02. 파생 장부 migration이 manifest에서 빠져 GET이 HTTP 500을 반환했다.
  // Found by /qa on 2026-09-12
  // Report: docs/qa/qa-tracker.md
  it("모든 migration SQL을 명시적 실행 manifest에 등록한다", () => {
    expect(manifestFiles()).toEqual(sqlFiles());
  });
});
