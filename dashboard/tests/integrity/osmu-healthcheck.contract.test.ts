import fs from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

// 헬스체크 명령이 이미지에 없는 실행 파일을 부르면 검사가 매번 실패하고,
// autoheal 이 컨테이너를 2분마다 재시작한다(2026-10-05 운영 재시작 반복 사고).
const root = path.resolve(process.cwd(), "..");
const compose = fs.readFileSync(path.join(root, "docker-compose.postagi-4tenants.yml"), "utf8");
const dockerfile = fs.readFileSync(path.join(root, "dashboard/Dockerfile"), "utf8");

describe("OSMU dashboard healthcheck contract", () => {
  const service = compose.split("  openclaw-dashboard-osmu:")[1] ?? "";
  const testLine = service.split("\n").find((line) => line.trim().startsWith("test:")) ?? "";
  const binary = /\["CMD",\s*"([^"]+)"/.exec(testLine)?.[1];

  it("runs a binary the runtime image is guaranteed to contain", () => {
    expect(binary).toBeDefined();
    const runtimeStage = dockerfile.slice(dockerfile.lastIndexOf("\nFROM "));
    const fromNodeImage = /\nFROM node:/.test(runtimeStage);
    const installedByApt = new RegExp(`apt-get install[^\\n]*(\\\\\\n[^\\n]*)*\\b${binary}\\b`).test(runtimeStage);
    expect(binary === "node" ? fromNodeImage : installedByApt).toBe(true);
  });

  it("probes the health endpoint on the dashboard port", () => {
    expect(testLine).toContain("http://localhost:18789/api/health");
  });
});
