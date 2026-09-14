import { getLearnedRulesContext, formatLearnedRules, type LearnedRuleRecord } from "@/lib/studio/learned-rules-context";
import { readJson, dataPath } from "@/lib/file-io";
import { runWithTenant } from "@/lib/tenant-context";
import type { GenerationRequest } from "./contracts";

/**
 * 성과실에서 승낙한 규칙을 **서버가** 생성 입력에 채워 넣는다.
 *
 * 2026-09-10 감사에서 드러났다. 주 생성 경로(`/api/studio/v1/generations`)의 클라이언트가
 * `accepted_rules: []` 를 **빈 배열로 박아** 보내고 있었다. 즉 고객이 성과를 보고 "이건
 * 규칙으로 삼자" 라고 승낙해도 그 규칙이 다음 콘텐츠에 한 글자도 닿지 않았다.
 *
 * 이 구멍은 2026-09-07 에 한 번 발견돼 `/api/studio/text` 한 곳만 고쳐졌다. 그런데 스튜디오가
 * 실제로 쓰는 길은 이쪽이라, **고친 곳은 안 쓰는 길이었고 쓰는 길은 그대로 비어 있었다.**
 * risks.md 가 이 실패 형태에 붙여 둔 이름이 "가짜 학습" 이다. 성과가 다음 콘텐츠를 바꾸는
 * 순환이 이 제품이 파는 것이고, 그 순환이 끊기면 성과실은 예쁜 숫자판일 뿐이다.
 *
 * 그래서 클라이언트를 고치는 대신 **서버가 채운다.** 클라이언트가 잊으면 학습이 조용히
 * 죽는데, 조용히 죽는 것은 아무도 모른다. 규칙은 그 작업 공간의 자산이지 화면이 들고
 * 다녀야 할 짐이 아니다.
 *
 * 클라이언트가 보낸 규칙이 있으면 함께 쓴다. 서버 것만 쓰면 앞으로 화면이 규칙을 보낼 수
 * 있게 됐을 때 그 값이 조용히 버려진다.
 */
const FILE_NAME = "performance-learned-rules.json";
const MAX_RULES = 12;

async function storedRules(workspaceId: string): Promise<string[]> {
  try {
    return await runWithTenant(workspaceId, async () => {
      const data = readJson<{ rules?: LearnedRuleRecord[] }>(dataPath(FILE_NAME));
      return (data?.rules ?? [])
        .filter((rule) => rule.active !== false && String(rule.text || "").trim())
        .map((rule) => String(rule.text).trim());
    });
  } catch {
    // 규칙을 못 읽는다고 생성을 막지 않는다. 규칙 없이 만드는 것이 아무것도 못 만드는 것보다 낫다.
    return [];
  }
}

/**
 * 채워 넣은 결과와 **무엇을 채웠는지**를 함께 돌려준다.
 *
 * 서버가 조용히 채우면 확인할 방법이 없다. 오늘 이 기능만 세 군데에서 끊겨 있었는데,
 * 매번 화면을 눌러 보고서야 알았다. **보이지 않는 것은 언젠가 조용히 끊긴다.**
 * 그래서 적용한 규칙을 응답에 실어 화면과 기록이 같이 볼 수 있게 한다.
 */
export async function withStoredLearnedRules(
  request: GenerationRequest,
): Promise<{ request: GenerationRequest; applied: string[] }> {
  const stored = await storedRules(request.workspaceId);
  const sent = request.learningContext.l5.acceptedRules;
  // 같은 규칙을 두 번 넣으면 모델이 그것만 중요한 줄 안다.
  const merged = [...new Set([...sent, ...stored])].slice(-MAX_RULES);
  const unchanged = merged.length === sent.length && merged.every((rule, index) => rule === sent[index]);
  if (unchanged) return { request, applied: merged };
  return {
    request: {
      ...request,
      learningContext: {
        ...request.learningContext,
        l5: { ...request.learningContext.l5, acceptedRules: merged },
      },
    },
    applied: merged,
  };
}

export { getLearnedRulesContext, formatLearnedRules };
