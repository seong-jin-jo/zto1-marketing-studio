import fs from "node:fs";
import http from "node:http";
import path from "node:path";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { requestWithinDeadline } from "../../scripts/lib/four-room-request.mjs";

let server: http.Server;
let baseUrl = "";

beforeAll(async () => {
  server = http.createServer((request, response) => {
    if (request.url !== "/api/tenant-tokens") {
      response.writeHead(404).end();
      return;
    }
    setTimeout(() => {
      response.writeHead(201, { "content-type": "application/json" });
      response.end(JSON.stringify({ id: "token-id", token: "token-value" }));
    }, 120);
  });
  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
  const address = server.address();
  if (!address || typeof address === "string") throw new Error("fixture server port unavailable");
  baseUrl = `http://127.0.0.1:${address.port}`;
});

afterAll(async () => {
  await new Promise<void>((resolve, reject) => server.close((error) => error ? reject(error) : resolve()));
});

describe("네 방 검증용 고객 토큰 요청 제한시간", () => {
  it("REVIEW-24H-20260919-04 정상 경로: 단계 예산 안의 지연 응답을 실제로 끝까지 읽는다", async () => {
    const response = await requestWithinDeadline(`${baseUrl}/api/tenant-tokens`, { method: "POST" }, {
      // 전체 회귀의 병렬 워커는 요청 함수 계약과 무관하게 로컬 fixture 콜백을 늦출 수 있다.
      // 120ms 지연 응답은 운영 단계 예산보다 충분히 짧게 유지하되, 부하 중 이벤트 루프 여유를 둔다.
      readyTimeoutMs: 1000,
      deadlineAt: Date.now() + 3000,
    });
    expect(response.status).toBe(201);
    await expect(response.json()).resolves.toMatchObject({ id: "token-id", token: "token-value" });
  });

  it("REVIEW-24H-20260919-04 거절 경로: 남은 전체 예산을 넘는 요청은 실제로 중단한다", async () => {
    const startedAt = Date.now();
    await expect(requestWithinDeadline(`${baseUrl}/api/tenant-tokens`, { method: "POST" }, {
      readyTimeoutMs: 500,
      deadlineAt: Date.now() + 40,
    })).rejects.toMatchObject({ name: "TimeoutError" });
    expect(Date.now() - startedAt).toBeLessThan(300);
  });

  it("REVIEW-24H-20260919-04 배선: 두 검증기가 검증된 요청 함수를 사용한다", () => {
    for (const file of ["scripts/probe-four-room-flow.mjs", "scripts/verify-four-room-ui-e2e.mjs"]) {
      const source = fs.readFileSync(path.resolve(process.cwd(), file), "utf8");
      expect(source).toContain('import { requestWithinDeadline } from "./lib/four-room-request.mjs";');
      expect(source).toContain("requestWithinDeadline(");
    }
  });
});
