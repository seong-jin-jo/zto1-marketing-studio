import { readJson, dataPath } from "@/lib/file-io";
import { runWithTenant } from "@/lib/tenant-context";

/**
 * 성과실에서 고객이 승낙한 규칙을 생성 프롬프트에 넣을 문단으로 만든다.
 *
 * 2026-09-07 감사에서 드러난 구멍: 승낙된 규칙은 performance-learned-rules.json 에
 * 저장되는데 그 파일을 읽는 생성 경로가 하나도 없었다. 소비처는 저장 라우트와 성과실
 * 화면뿐이었다. 즉 고객이 "이건 규칙으로 삼자" 라고 승낙해도 다음 글에 아무 영향이
 * 없었다. risks.md 가 이 실패 형태에 이미 "가짜 학습" 이라는 이름을 붙여 두었다.
 *
 * 성과가 다음 콘텐츠를 바꾸는 순환이 이 제품이 파는 것이고, 그 순환의 마지막 한 칸이
 * 여기다. 이 칸이 비면 성과실은 예쁜 숫자판일 뿐 제품이 아니다.
 *
 * 규칙은 브랜드 톤 가이드보다 뒤, 글감보다 앞에 놓는다. 가이드가 큰 틀이고 규칙은
 * 그 안에서 실측으로 좁힌 것이라 나중 것이 앞의 것을 조여야 한다.
 */
export interface LearnedRuleRecord {
  id: string;
  text: string;
  active?: boolean;
  createdAt?: string;
}

const FILE_NAME = "performance-learned-rules.json";
/** 프롬프트가 규칙으로만 채워지지 않도록 최근 것부터 이 수까지만 넣는다. */
const MAX_RULES = 12;

export function formatLearnedRules(rules: LearnedRuleRecord[]): string {
  const active = rules.filter((rule) => rule.active !== false && String(rule.text || "").trim());
  if (!active.length) return "";
  const recent = active.slice(-MAX_RULES);
  const lines = recent.map((rule) => `- ${String(rule.text).trim()}`).join("\n");
  return `\n=== 이 고객의 성과에서 배운 규칙 (실제 반응이 확인된 것. 브랜드 톤 가이드보다 우선한다) ===\n${lines}\n===\n`;
}

export async function getLearnedRulesContext(tenantId: string | null | undefined): Promise<string> {
  if (!tenantId) return "";
  try {
    return await runWithTenant(tenantId, async () => {
      const data = readJson<{ rules?: LearnedRuleRecord[] }>(dataPath(FILE_NAME));
      return formatLearnedRules(data?.rules ?? []);
    });
  } catch {
    // 규칙을 못 읽는다고 생성 자체를 막지 않는다. 규칙 없이 만드는 것이 아무것도 못 만드는 것보다 낫다.
    return "";
  }
}
