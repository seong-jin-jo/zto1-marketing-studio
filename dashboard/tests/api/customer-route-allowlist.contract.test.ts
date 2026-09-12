import { describe, expect, it } from "vitest";
import { readdirSync, readFileSync, statSync } from "node:fs";
import { resolve } from "node:path";

// 2026-09-09 실사용에서 찾았다.
// 편집실에서 "말로 시키기" 를 눌렀는데 아무 반응이 없었다. 직접 불러 보니 403
// "이 API 는 운영자 전용입니다" 였다. proxy.ts 의 고객 허용 목록은 **허용 목록**이라,
// 새 라우트를 만들고 거기 안 넣으면 고객 화면에서만 조용히 막힌다.
// 만든 사람은 자기 화면(운영자)에서 되니까 모른다.
//
// 계약: 고객 화면이 부르는 studio 라우트는 전부 허용 목록에 있어야 한다.
// 새 라우트를 만들면 그 자리에서 한 줄을 함께 추가한다.
const root = resolve(__dirname, "../../src");
const proxy = readFileSync(resolve(root, "proxy.ts"), "utf8");

function studioRoutes(dir: string, prefix: string): string[] {
  const out: string[] = [];
  for (const name of readdirSync(dir)) {
    const full = resolve(dir, name);
    if (statSync(full).isDirectory()) {
      out.push(...studioRoutes(full, `${prefix}/${name}`));
    } else if (name === "route.ts") {
      out.push(prefix);
    }
  }
  return out;
}

describe("고객이 부르는 studio 라우트는 허용 목록에 있다", () => {
  it("studio 아래 라우트가 빠짐없이 등록돼 있다", () => {
    const routes = studioRoutes(resolve(root, "app/api/studio"), "/api/studio");
    // 허용 경로는 두 곳에 산다. 문자열 목록(TENANT_AWARE_PATHS)과 정규식 목록
    // (STUDIO_INDEPENDENT_MATCHERS)이다. 한쪽만 보면 멀쩡한 라우트를 빠졌다고 잡는다.
    const allowed = (route: string) => {
      if (proxy.includes(`"${route}"`)) return true;
      // 정규식 목록은 [id] 자리를 [^/]+ 로 적는다. 같은 모양으로 바꿔 대조한다.
      const asMatcher = route
        .replace(/\//g, "\\/")            // 먼저 슬래시를 이스케이프하고
        .replace(/\[[^\]]+\]/g, "[^/]+"); // 그다음 [id] 자리를 넣는다(이 안의 / 는 그대로)
      return proxy.includes(asMatcher);
    };
    // 운영자 전용으로 의도한 것은 여기 적고 이유를 남긴다. 적지 않은 채 빠지면 사고다.
    const operatorOnly = new Set<string>([]);
    const missing = routes.filter((route) => !operatorOnly.has(route) && !allowed(route));
    expect(missing, `허용 목록에 없는 studio 라우트: ${missing.join(", ")}`).toEqual([]);
  });

  // 2026-09-12 코드리뷰 MAJOR 에서 같은 사고가 queue 쪽에서 다시 나왔다.
  // 발행 중지(/api/queue/[postId]/cancel) 가 허용 목록에 없어 고객이 "발행을 멈춥니다"를
  // 눌러도 핸들러에 닿지 못하고 403 이었다. studio 만 검사하던 계약을 queue 까지 넓힌다.
  it("queue 아래 라우트가 빠짐없이 등록돼 있다", () => {
    const routes = studioRoutes(resolve(root, "app/api/queue"), "/api/queue");
    const allowed = (route: string) => {
      if (proxy.includes(`"${route}"`)) return true;
      const asMatcher = route.replace(/\//g, "\\/").replace(/\[[^\]]+\]/g, "[^/]+");
      return proxy.includes(asMatcher);
    };
    // 운영자 전용으로 의도한 것만 여기 적는다. 이유 없이 적으면 그게 다음 사고다.
    const operatorOnly = new Set<string>([
      "/api/queue/promote",   // schedule 라우트가 서버끼리 부른다. 고객 화면 경로가 아니다.
      "/api/queue/seed",      // 시드 주입. 운영자 도구다.
      "/api/queue/backfill",  // 과거 데이터 보정. 운영자 도구다.
    ]);
    const missing = routes.filter((route) => !operatorOnly.has(route) && !allowed(route));
    expect(missing, `허용 목록에 없는 queue 라우트: ${missing.join(", ")}`).toEqual([]);
  });

  it("이 목록이 허용 목록이라는 사실이 코드에 적혀 있다", () => {
    // 차단 목록으로 착각하면 새 라우트를 안 넣고 지나간다.
    expect(proxy).toContain("허용 목록");
  });
});
