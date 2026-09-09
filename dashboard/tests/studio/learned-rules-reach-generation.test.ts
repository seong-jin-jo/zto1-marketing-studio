import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

// 2026-09-10 감사: 주 생성 경로의 클라이언트가 accepted_rules 를 **빈 배열로 박아** 보내고
// 있었다. 고객이 성과를 보고 "이건 규칙으로 삼자" 라고 승낙해도 그 규칙이 다음 콘텐츠에
// 한 글자도 닿지 않았다.
//
// 이 구멍은 2026-09-07 에 한 번 발견돼 /api/studio/text 한 곳만 고쳐졌다. 그런데 스튜디오가
// 실제로 쓰는 길은 v1/generations 라서, **고친 곳은 안 쓰는 길이었고 쓰는 길은 그대로
// 비어 있었다.** risks.md 가 이 실패 형태에 붙인 이름이 "가짜 학습" 이다.
const read = (p: string) => readFileSync(resolve(process.cwd(), p), "utf8");

describe("성과에서 배운 규칙이 실제 생성에 닿는다", () => {
  it("주 생성 경로가 저장된 규칙을 채워 넣는다", () => {
    const route = read("src/app/api/studio/v1/generations/route.ts");
    expect(route).toContain("withStoredLearnedRules");
    // 원본이 아니라 채워진 값을 넘겨야 한다. 채워 놓고 안 쓰면 안 채운 것과 같다.
    expect(route).toMatch(/create\(\s*principal\.memberId,[\s\S]*?enriched,/);
  });

  it("서버가 채운다. 화면이 들고 다니게 하지 않는다", () => {
    // 화면이 잊는 순간 학습이 조용히 죽고, 조용히 죽는 것은 아무도 모른다.
    const merge = read("src/lib/studio/generation/learned-rules-merge.ts");
    expect(merge).toContain("performance-learned-rules.json");
    expect(merge).toContain("withStoredLearnedRules");
  });

  it("화면이 보낸 규칙도 함께 쓴다", () => {
    // 서버 것만 쓰면 앞으로 화면이 규칙을 보낼 수 있게 됐을 때 그 값이 조용히 버려진다.
    const merge = read("src/lib/studio/generation/learned-rules-merge.ts");
    expect(merge).toContain("...sent");
  });

  it("같은 규칙을 두 번 넣지 않는다", () => {
    // 중복되면 모델이 그것만 중요한 줄 안다.
    const merge = read("src/lib/studio/generation/learned-rules-merge.ts");
    expect(merge).toContain("new Set");
  });

  it("규칙을 못 읽어도 생성을 막지 않는다", () => {
    // 규칙 없이 만드는 것이 아무것도 못 만드는 것보다 낫다.
    const merge = read("src/lib/studio/generation/learned-rules-merge.ts");
    expect(merge).toMatch(/catch\s*\{[\s\S]*?return \[\];/);
  });

  it("프롬프트가 승인된 규칙 자리를 실제로 갖고 있다", () => {
    const llm = read("src/lib/studio/generation/llm.ts");
    expect(llm).toContain("layers.l5.acceptedRules");
  });
});
