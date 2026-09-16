import type { PublishValidationIssue } from "@/lib/studio/platform-publish-fields";

/**
 * "지금 발행" 이 채널 하나의 한도 위반으로 전부 멈추지 않게 나눈다.
 *
 * 2026-09-16 실측(j.the.great.investor): X 본문이 280 가중 문자를 넘으면(316) 발행 대상
 * 전체 중 "첫 번째로 걸리는 것"을 찾아 발행 자체를 통째로 멈췄다. Threads·YouTube 등 한도를
 * 넘지 않은 다른 채널까지 아무것도 시작되지 않았고, 사용자는 버튼이 안 눌리는 줄 알았다
 * (회장 "다 진행해 왜 멈춰" 계열 결함). 한도를 넘은 채널만 빼고 나머지는 그대로 발행한다.
 */
export function partitionBlockedPublishTargets<P extends string>(
  targets: readonly P[],
  validate: (platform: P) => PublishValidationIssue | undefined,
): { blocked: { platform: P; issue: PublishValidationIssue }[]; allowed: P[] } {
  const blocked: { platform: P; issue: PublishValidationIssue }[] = [];
  const allowed: P[] = [];
  for (const platform of targets) {
    const issue = validate(platform);
    if (issue) blocked.push({ platform, issue });
    else allowed.push(platform);
  }
  return { blocked, allowed };
}

export function blockedPublishFailures<P extends string>(
  blocked: readonly { platform: P; issue: PublishValidationIssue }[],
  label: (platform: P) => string,
): {
  status: Record<string, "failed">;
  errors: Record<string, string>;
  messages: string[];
} {
  const status: Record<string, "failed"> = {};
  const errors: Record<string, string> = {};
  const messages: string[] = [];

  for (const entry of blocked) {
    status[entry.platform] = "failed";
    errors[entry.platform] = entry.issue.message;
    messages.push(`${label(entry.platform)}: ${entry.issue.message}`);
  }

  return { status, errors, messages };
}
