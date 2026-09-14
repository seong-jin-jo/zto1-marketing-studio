import fs from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

/**
 * 호스트 이음매 표류 감지.
 *
 * tests/vendor-host/openclaw-plugin-sdk/* 는 openclaw 호스트가 플러그인에 꽂아주는
 * 함수를 그대로 옮겨 둔 것이다. 옮겨 적은 사본은 원본이 바뀌면 조용히 낡는다.
 * 그러면 CI 는 초록인데 실제 발행 경로와 다른 규칙을 검증하게 된다. 그 조용한 낡음이
 * 이 파일이 막으려는 것이다. 원본이 바뀌면 여기서 빨간불이 나고, 사본을 따라 고쳐야
 * 한다. 사본을 느슨하게 고쳐 통과시키는 것은 이 장치를 무의미하게 만든다.
 *
 * 벤더 원본은 레포에 있으므로 node_modules 없이도 읽을 수 있다(CI 에서도 돈다).
 */

const repoRoot = path.resolve(__dirname, "../../..");
const hostDir = path.resolve(__dirname, "openclaw-plugin-sdk");

function read(relative: string): string {
  return fs.readFileSync(path.join(repoRoot, relative), "utf-8");
}

function readHost(file: string): string {
  return fs.readFileSync(path.join(hostDir, file), "utf-8");
}

/** `export function name(` 부터 첫 열-0 `}` 까지. 벤더 소스는 prettier 로 정렬돼 있다. */
function extractBlock(source: string, header: string): string {
  const start = source.indexOf(header);
  expect(start, `벤더 원본에서 "${header}" 를 찾지 못했다`).toBeGreaterThanOrEqual(0);
  const end = source.indexOf("\n}\n", start);
  expect(end, `"${header}" 블록의 끝을 찾지 못했다`).toBeGreaterThan(start);
  return source.slice(start, end + 2).trim();
}

/** 주석·들여쓰기 차이는 무시하고 실질 코드만 비교한다. */
function normalize(block: string): string {
  return block
    .split("\n")
    .map((line) => line.replace(/\/\/.*$/, "").trim())
    .filter(Boolean)
    .join("\n");
}

describe("openclaw 플러그인 호스트 이음매가 벤더 원본과 같은 규칙을 쓴다", () => {
  const cases: { vendorFile: string; header: string; hostFile: string }[] = [
    { vendorFile: "openclaw/src/agents/tools/common.ts", header: "export function readStringParam(\n  params: Record<string, unknown>,\n  key: string,\n  options: StringParamOptions = {},\n)", hostFile: "agent-runtime.ts" },
    { vendorFile: "openclaw/src/agents/tools/common.ts", header: "export function textResult<TDetails>(", hostFile: "agent-runtime.ts" },
    { vendorFile: "openclaw/src/agents/tools/common.ts", header: "export function jsonResult(", hostFile: "agent-runtime.ts" },
    { vendorFile: "openclaw/src/param-key.ts", header: "export function resolveSnakeCaseParamKey(", hostFile: "agent-runtime.ts" },
    { vendorFile: "openclaw/src/param-key.ts", header: "export function readSnakeCaseParamRaw(", hostFile: "agent-runtime.ts" },
    { vendorFile: "openclaw/src/param-key.ts", header: "function toSnakeCaseKey(", hostFile: "agent-runtime.ts" },
    { vendorFile: "openclaw/src/agents/schema/string-enum.ts", header: "export function stringEnum<T extends readonly string[]>(", hostFile: "core.ts" },
    { vendorFile: "openclaw/src/agents/schema/string-enum.ts", header: "export function optionalStringEnum<T extends readonly string[]>(", hostFile: "core.ts" },
  ];

  for (const { vendorFile, header, hostFile } of cases) {
    const label = header.split("(")[0].replace(/^(export )?function /, "");
    it(`${label} 가 ${vendorFile} 와 일치한다`, () => {
      const vendorBlock = normalize(extractBlock(read(vendorFile), header));
      const hostBlock = normalize(extractBlock(readHost(hostFile), header));
      expect(hostBlock).toBe(vendorBlock);
    });
  }

  it("ToolInputError 의 이름과 status 가 원본과 같다", () => {
    const vendorBlock = normalize(extractBlock(read("openclaw/src/agents/tools/common.ts"), "export class ToolInputError extends Error {"));
    const hostBlock = normalize(extractBlock(readHost("agent-runtime.ts"), "export class ToolInputError extends Error {"));
    expect(hostBlock).toBe(vendorBlock);
  });

  it("확장이 부르는 호스트 진입점이 전부 여기 있다", () => {
    const extensionSources = [
      "openclaw/extensions/threads-publish/src/threads-publish-tool.ts",
      "openclaw/extensions/instagram-publish/src/instagram-publish-tool.ts",
      "openclaw/extensions/threads-queue/src/threads-queue-tool.ts",
    ].map(read);

    const imported = new Set<string>();
    for (const source of extensionSources) {
      for (const match of source.matchAll(/import\s+\{([^}]+)\}\s+from\s+"openclaw\/plugin-sdk\/([\w-]+)"/g)) {
        for (const name of match[1].split(",")) {
          imported.add(`${match[2]}:${name.trim()}`);
        }
      }
    }

    for (const entry of imported) {
      const [moduleName, symbol] = entry.split(":");
      const host = readHost(`${moduleName}.ts`);
      expect(host, `${moduleName} 호스트에 ${symbol} 가 없다`).toContain(`export function ${symbol}`);
    }
    expect(imported.size).toBeGreaterThan(0);
  });
});
