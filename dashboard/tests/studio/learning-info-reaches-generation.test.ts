import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { buildStudioGenerationRequest } from "@/lib/studio/generation/client";

// 2026-09-10 실측: 화면은 "말투: 따뜻하게" 라고 표시하면서 생성기에는 말투를 null 로,
// 금지 표현을 빈 목록으로 보내고 있었다. **일곱 칸을 채우게 해 놓고 쓰지 않으면 그 문답은
// 장식이다.** 회장이 핵심 과제로 못 박은 "학습정보를 잘 받아서" 가 바로 이 자리다.
const base = {
  workspaceId: "workspace",
  topic: "주제",
  purpose: "목표",
  audience: "고객",
  workspaceFacts: ["브랜드 문서"],
  forbiddenPhrases: [],
  materialRightsConfirmed: true,
  contentBranch: "text_image" as const,
};

describe("고른 학습 정보가 생성 요청에 실린다", () => {
  it("말투를 고르면 그대로 실린다", () => {
    const body = buildStudioGenerationRequest({ ...base, tone: "따뜻하게" });
    expect(body.learning_context.u3.tone).toBe("따뜻하게");
  });

  it("말투를 안 골랐으면 비운다. 빈 글자를 말투로 넘기지 않는다", () => {
    expect(buildStudioGenerationRequest({ ...base, tone: "   " }).learning_context.u3.tone).toBeNull();
    expect(buildStudioGenerationRequest(base).learning_context.u3.tone).toBeNull();
  });

  it("금지 표현을 보내면 비어 있지 않다고 표시한다", () => {
    const body = buildStudioGenerationRequest({ ...base, forbiddenPhrases: ["과장"] });
    expect(body.learning_context.u3.forbidden_phrases).toEqual(["과장"]);
    expect(body.learning_context.u3.forbidden_phrases_confirmed_empty).toBe(false);
  });

  it("생성실이 학습 정보의 말투와 금지 표현을 넘긴다", () => {
    const src = readFileSync(
      resolve(process.cwd(), "src/components/studio/StudioRooms.tsx"),
      "utf8",
    );
    expect(src).toContain("tone: learning.voice");
    expect(src).toContain("forbiddenPhrases: forbiddenFromLearning");
  });

  it("'별도 제한 없음' 을 금지어로 넘기지 않는다", () => {
    // 그것은 금지어가 아니라 금지어가 없다는 답이다. 금지어로 넣으면 그 말이 들어간
    // 정상 문장이 통째로 버려진다.
    const src = readFileSync(
      resolve(process.cwd(), "src/components/studio/StudioRooms.tsx"),
      "utf8",
    );
    expect(src).toMatch(/별도 제한 없음\|없음\|제한 없음/);
  });

  it("견본 문장은 금지어에서 떼어 낸다", () => {
    // 이 칸은 "별도 제한 없음. 예: ..." 처럼 견본이 붙어 저장된다. 통째로 넘기면 그 문장
    // 전체가 결과에 있는지 찾게 되어 아무것도 안 걸린다.
    const src = readFileSync(
      resolve(process.cwd(), "src/components/studio/StudioRooms.tsx"),
      "utf8",
    );
    expect(src).toContain('.split("예:")[0]');
  });
});

// 2026-09-10 실측: 업종 칸이 비면 브랜드 문서 전문(388자)을 업종 자리에 대신 넣고 있었다.
// 라벨은 "업종" 인데 내용은 페르소나·보이스·금지 표현이 뒤섞인 문서 전체였다. 사용자는
// 자기가 업종을 그렇게 적었다고 오해하고, 바로 아래 말투 칸과 같은 내용이 두 번 보인다.
describe("학습 정보 칸은 그 칸의 값만 보여 준다", () => {
  const src = readFileSync(
    resolve(process.cwd(), "src/components/studio/StudioRooms.tsx"),
    "utf8",
  );

  it("업종 자리에 브랜드 문서를 대신 넣지 않는다", () => {
    expect(src).toContain('["업종", learning.industry || "아직 없음"]');
    expect(src).not.toContain('learning.industry || guide');
  });

  it("브랜드 문서는 따로 알려 준다", () => {
    // 비었다고 말하는 것과 안 쓴다는 것은 다르다. 문서는 계속 생성에 들어간다.
    expect(src).toContain("브랜드 문서도 그대로 반영합니다");
  });
});
