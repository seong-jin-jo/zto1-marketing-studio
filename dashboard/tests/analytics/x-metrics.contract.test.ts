import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { isMetricsCollected } from "@/lib/metrics-support";

// 2026-09-09 회장 지적: "성과 수집이 Threads 만."
// 우리는 X 로 발행까지 하면서 그 결과를 한 번도 되받지 않았다. 성과실은 X 글을 영원히
// "미수집" 으로 두었다. 사업계획의 One Thing 은 "결과를 되받아 다음 제안으로 돌린다"
// 인데, 되받는 칸이 비어 있으면 그 뒤 칸이 전부 비어 돈다.
const src = (p: string) => readFileSync(resolve(__dirname, "../../src", p), "utf8");

describe("X 성과 수집", () => {
  it("X 를 수집하는 채널로 센다", () => {
    expect(isMetricsCollected("x")).toBe(true);
    expect(isMetricsCollected("threads")).toBe(true);
    // 아직 안 만든 채널을 수집한다고 말하면 화면이 거짓말한다.
    // youtube·shorts 는 2026-09-10 에, tiktok 은 2026-09-13 에 수집을 만들어 이 목록에서 뺐다.
    // 목록이 비면 이 반복은 아무것도 검사하지 않는다. 새 채널을 만들 때 여기 넣어라.
    for (const platform of [] as string[]) {
      expect(isMetricsCollected(platform), `${platform}`).toBe(false);
    }
    expect(isMetricsCollected("reels")).toBe(true);
  });

  it("쿼리까지 서명한다", () => {
    const publish = src("lib/publish.ts");
    // 종전 서명은 oauth_* 만 다뤘다. 그것은 쿼리 없는 POST 에서만 맞다. 성과 조회는
    // 쿼리가 있고 RFC5849 는 쿼리도 서명 대상에 넣으라고 한다. 안 넣으면 401 이다.
    expect(publish).toMatch(/buildXOAuthHeader\(method: string, url: string, k: XKeys, query/);
    expect(publish).toContain("{ ...query, ...oauth }");
  });

  it("두 연결 방식을 모두 받는다", () => {
    const publish = src("lib/publish.ts");
    // 화면 연결은 OAuth 2.0 토큰, 구 방식은 4키다. 한쪽만 보면 그 방식으로 연결한
    // 사람은 성과가 영원히 안 모인다. 발행이 이미 같은 방식으로 갈라져 있다.
    expect(publish).toMatch(/fetchXPublicMetrics[\s\S]{0,1400}hasLegacyKeys \? buildXOAuthHeader[\s\S]{0,60}Bearer/);
  });

  it("한 번에 묶어 묻는다", () => {
    const publish = src("lib/publish.ts");
    // 글마다 따로 부르면 요청 수가 그만큼 늘고 X 시간당 한도에 금방 닿는다.
    expect(publish).toMatch(/slice\(0, 100\)/);
    expect(publish).toContain('ids: ids.join(",")');
  });

  it("Threads 가 없어도 X 만으로 수집이 돈다", () => {
    const route = src("app/api/metrics/route.ts");
    // 종전에는 Threads 가 없으면 여기서 끝냈다. X 만 연결한 사람은 아예 못 돌렸다.
    // 채널이 늘어도 "하나라도 있으면 돈다" 는 규칙은 그대로여야 한다.
    expect(route).toMatch(/if \(!cred && !xCred && !igCred && !fbCred && !ytCred && !tiktokCred\)/);
    expect(route).toContain("fetchXPublicMetrics");
  });
});
