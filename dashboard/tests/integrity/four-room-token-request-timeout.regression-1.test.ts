import fs from "node:fs";
import http from "node:http";
import path from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { requestWithDeadline } from "../../scripts/request-with-deadline.mjs";

let server: http.Server | null = null;
afterEach(async () => {
  if (server) await new Promise<void>((resolve) => server!.close(() => resolve()));
  server = null;
});

describe("네 방 검증용 고객 토큰 요청 제한시간", () => {
  it("ISSUE-011 정상: 두 검증기의 토큰 요청이 실요청 제한 함수에 연결된다", () => {
    for (const file of ["scripts/probe-four-room-flow.mjs", "scripts/verify-four-room-ui-e2e.mjs"]) {
      const source = fs.readFileSync(path.resolve(process.cwd(), file), "utf8");
      expect(source).toContain('import { requestWithDeadline } from "./request-with-deadline.mjs"');
      expect(source).toMatch(/requestWithDeadline\(`\$\{base(?:Url)?\}\$\{pathname\}`/);
    }
  });

  it("ISSUE-011 거절: 본문이 상한 안에 오지 않으면 실제 fetch를 중단한다", async () => {
    server = http.createServer((_request, response) => {
      response.writeHead(200, { "content-type": "application/json" });
      response.write("{");
      setTimeout(() => response.end('"token":"late"}'), 180);
    });
    await new Promise<void>((resolve) => server!.listen(0, "127.0.0.1", resolve));
    const address = server.address();
    if (!address || typeof address === "string") throw new Error("test server address missing");
    await expect(requestWithDeadline(`http://127.0.0.1:${address.port}/api/tenant-tokens`,
      { method: "POST" }, 40, Date.now() + 1000).then((response) => response.text()))
      .rejects.toThrow();
  });
});
