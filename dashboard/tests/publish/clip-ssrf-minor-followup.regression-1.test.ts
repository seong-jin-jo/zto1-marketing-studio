import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import fs from "fs";
import os from "os";
import http from "http";
import path from "path";
import { Agent } from "undici";

// 2026-09-26 재리뷰 후속 MINOR 3건 재발 방지(PR #90, 3a3a15db 머지 뒤 리뷰어 지적).
//
// MINOR-1(연결 누수, 리뷰어 실측) — downloadClipToLocal이 4xx/5xx 응답에서 본문을 안
// 읽고 바로 throw했다. undici는 본문을 다 못 비운 소켓을 keep-alive 풀에 되돌리지
// 못해 매번 새 연결을 열었고, 옛 연결은 idle timeout까지 남았다(404 5회 뒤 연결
// 4~5개가 남는 것이 실측됨). throw 직전 res.body?.cancel()로 비운다.
//
// MINOR-2 — __setSsrfBlocklistCheckForTests가 프로덕션에서도 호출 가능했다. 실수로
// (또는 침해 경로로) 호출되면 SSRF 방어 전체가 조용히 꺼진다. NODE_ENV!=="test"면
// 던지게 한다.
//
// MINOR-3 — 차단 대역에 240.0.0.0/4(예약), ff00::/8(IPv6 멀티캐스트),
// 2002::/16(6to4 터널 — 내부에 임의 IPv4를 실어나른다)을 추가.

const A = "aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa";
let root: string;
const vd = (t: string) => path.join(root, "tenants", t, "videos");

beforeEach(() => {
  root = fs.mkdtempSync(path.join(os.tmpdir(), "ssrf-minor-"));
  process.env.DATA_DIR = root;
  fs.mkdirSync(vd(A), { recursive: true });
});

afterEach(() => {
  fs.rmSync(root, { recursive: true, force: true });
  vi.unstubAllEnvs();
});

describe("MINOR-1 — 4xx/5xx 응답 뒤 연결이 정리된다(mock 없음, 실측)", () => {
  it("실제 downloadClipToLocal이 404를 5번 연속 받아도 매번 정상 결과를 내고 빠르게 끝난다", async () => {
    const { downloadClipToLocal, __setSsrfBlocklistCheckForTests } = await import("@/lib/clipping");
    const srv = http.createServer((_, res) => {
      res.writeHead(404, { "Content-Type": "text/plain" });
      res.end("not found");
    });
    srv.listen(0, "127.0.0.1");
    await new Promise((r) => srv.once("listening", r));
    const port = (srv.address() as any).port;

    __setSsrfBlocklistCheckForTests(() => false);
    const start = Date.now();
    try {
      for (let i = 0; i < 5; i++) {
        const result = await downloadClipToLocal(`http://localhost.:${port}/clip-${i}.mp4`, A);
        expect(result.localSaveFailed).toBe(true); // 404라 저장은 실패해야 정상
      }
      // 소켓이 정리되지 않고 쌓이면(고쳐지기 전 회귀) 다음 hop이 새 연결을 기다리며
      // 지연되거나, 서버의 keepAliveTimeout 근처까지 늘어질 수 있다. 5번 다 실제
      // 네트워크 왕복을 거치고도 이 정도면 넉넉히 빠르다.
      expect(Date.now() - start).toBeLessThan(5000);
    } finally {
      __setSsrfBlocklistCheckForTests(null);
      srv.closeAllConnections();
      srv.close();
    }
  }, 15000);

  it("소스 가드: downloadClipToLocal의 !res.ok 분기가 throw 전에 res.body?.cancel()을 호출한다", () => {
    const src = fs.readFileSync(
      path.resolve(__dirname, "../../src/lib/clipping.ts"),
      "utf8",
    );
    const fnStart = src.indexOf("export async function downloadClipToLocal");
    expect(fnStart).toBeGreaterThan(-1);
    const fnBody = src.slice(fnStart, src.indexOf("\n}\n", fnStart));
    const okBranch = fnBody.slice(fnBody.indexOf("if (!res.ok)"), fnBody.indexOf("if (!res.ok)") + 400);
    expect(okBranch).toMatch(/res\.body\?\.cancel\(\)/);
    // cancel이 throw보다 먼저 나와야 한다(순서가 바뀌면 도달 못 하고 죽는다).
    expect(okBranch.indexOf("res.body?.cancel()")).toBeLessThan(okBranch.indexOf("throw new Error"));
  });

  it("돌연변이 검증(메커니즘 재현): 풀이 좁아 재사용이 강제되는 상황에서 본문을 안 비우면 다음 요청이 막힌다", async () => {
    // downloadClipToLocal은 내부 dispatcher(연결 풀이 넉넉한 기본 Agent)를 써서, 이
    // 정도 소규모 테스트로는 "연결이 새로 열리는지"의 차이가 눈에 잘 안 보인다(직접
    // 재현해본 결과, 작은 응답 바디에서는 opened 수가 cancel 유무와 무관하게 비슷했다).
    // 진짜 위험은 연결 풀이 죌 때(connections: 1) 드러난다 — 이전 응답 바디를 안
        // 비우면 그 소켓을 되돌려주지 못해 다음 요청이 "영원히" 못 나간다. 이것이
    // res.body?.cancel()이 실제로 막는 결함이다. 같은 http 서버, 같은 undici Agent
    // 메커니즘으로 그 사실 자체를 mock 없이 재현한다.
    const BIG = "x".repeat(2 * 1024 * 1024); // 2MB — TCP 버퍼에 한 번에 안 들어가 backpressure가 걸린다.
    const srv = http.createServer((_, res) => {
      res.writeHead(404);
      res.end(BIG);
    });
    srv.listen(0, "127.0.0.1");
    await new Promise((r) => srv.once("listening", r));
    const port = (srv.address() as any).port;
    // 풀을 1개 연결로 죈다 — 재사용이 강제된다(운영 dispatcher도 결국 유한한 풀이라
    // 트래픽이 몰리면 같은 상황에 도달한다. 이 테스트는 그 극단을 빠르게 드러낸다).
    const constrainedAgent = new Agent({ connections: 1 });
    try {
      // 첫 요청의 본문을 의도적으로 비우지 않는다(고쳐지기 전 동작 재현).
      const first = await fetch(`http://127.0.0.1:${port}/a`, { dispatcher: constrainedAgent } as RequestInit);
      expect(first.status).toBe(404);
      // cancel 없이 두 번째 요청을 걸면, 위 첫 응답 바디를 다 못 비운 소켓이 재사용되지
      // 못해 두 번째 요청이 막힌다 — 짧은 타임아웃 안에 끝나지 않아야 한다(=재현 성공).
      const second = fetch(`http://127.0.0.1:${port}/b`, { dispatcher: constrainedAgent } as RequestInit);
      const raced = await Promise.race([
        second.then(() => "resolved"),
        new Promise((r) => setTimeout(() => r("timeout"), 800)),
      ]);
      expect(raced).toBe("timeout");
    } finally {
      srv.closeAllConnections();
      srv.close();
    }
  }, 10000);
});

describe("MINOR-2 — __setSsrfBlocklistCheckForTests는 NODE_ENV=test 밖에서 던진다", () => {
  it("NODE_ENV가 production이면 호출이 즉시 예외를 던지고 판정 함수는 바뀌지 않는다", async () => {
    const { __setSsrfBlocklistCheckForTests, isPrivateOrLoopbackHost } = await import("@/lib/clipping");
    vi.stubEnv("NODE_ENV", "production");
    expect(() => __setSsrfBlocklistCheckForTests(() => false)).toThrow(/test-only/i);
    // 예외가 나면서 루프백 판정이 여전히 정상(차단)으로 남아 있어야 한다 — 즉
    // 방어가 "조용히" 꺼지지 않았다는 것을 확인한다.
    expect(isPrivateOrLoopbackHost("127.0.0.1")).toBe(true);
  });

  it("NODE_ENV=test에서는(기본, vitest가 보장) 정상 동작한다(회귀 없음)", async () => {
    const { __setSsrfBlocklistCheckForTests } = await import("@/lib/clipping");
    expect(process.env.NODE_ENV).toBe("test");
    expect(() => __setSsrfBlocklistCheckForTests(() => false)).not.toThrow();
    __setSsrfBlocklistCheckForTests(null);
  });

  it("돌연변이 검증: NODE_ENV 가드를 지우면 production에서도 조용히 통과한다(회귀 재현)", async () => {
    const src = fs.readFileSync(path.resolve(__dirname, "../../src/lib/clipping.ts"), "utf8");
    const fnStart = src.indexOf("export function __setSsrfBlocklistCheckForTests");
    const fnBody = src.slice(fnStart, src.indexOf("\n}\n", fnStart));
    expect(fnBody).toMatch(/NODE_ENV\s*!==\s*"test"/);
    expect(fnBody).toMatch(/throw new Error/);
  });
});

describe("MINOR-3 — 예약/멀티캐스트/6to4 대역을 차단한다", () => {
  it.each([
    ["http://240.0.0.1/x", "240/4 예약"],
    ["http://[ff02::1]/x", "IPv6 멀티캐스트"],
    ["http://[2002:c000:204::1]/x", "6to4(내부 IPv4 192.0.2.4)"],
  ])("%s(%s)는 차단된다", async (url) => {
    const { isSafeExternalMediaUrl } = await import("@/lib/clipping");
    expect(isSafeExternalMediaUrl(url)).toBe(false);
  });

  it("정상 공개 IPv4/IPv6는 여전히 통과한다(회귀 없음)", async () => {
    const { isSafeExternalMediaUrl } = await import("@/lib/clipping");
    expect(isSafeExternalMediaUrl("https://93.184.216.34/x")).toBe(true); // example.com 대역
    expect(isSafeExternalMediaUrl("http://[2606:4700::1]/x")).toBe(true);
  });
});
