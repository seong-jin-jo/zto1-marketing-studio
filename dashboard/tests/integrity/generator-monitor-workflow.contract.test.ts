import { spawnSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const repositoryRoot = resolve(__dirname, "../../..");
const monitor = readFileSync(
  resolve(repositoryRoot, ".github/workflows/osmu-generator-monitor.yml"),
  "utf8",
);
const deploy = readFileSync(
  resolve(repositoryRoot, ".github/workflows/deploy-marketing.yml"),
  "utf8",
);

describe("OSMU Higgsfield 로그인 정기 감시 계약", () => {
  it("GENERATOR-MONITOR-WORKFLOW-01 정상: 30분 주기와 수동 실행을 marketing_runner에서 5분 이내 수행한다", () => {
    expect(monitor).toMatch(/cron:\s*'\*\/30 \* \* \* \*'/);
    expect(monitor).toContain("workflow_dispatch: {}");
    expect(monitor).toMatch(/runs-on:\s*\[self-hosted, marketing_runner\]/);
    expect(monitor).toContain("timeout-minutes: 5");
  });

  it("GENERATOR-MONITOR-WORKFLOW-02 격리: 감시 기능이 운영 배포의 concurrency 계약을 바꾸지 않는다", () => {
    expect(monitor).toContain("group: osmu-generator-monitor");
    expect(monitor).toContain("cancel-in-progress: true");
    expect(monitor).not.toContain("queue:");
    expect(deploy).not.toMatch(/^concurrency:/m);
    expect(deploy).not.toContain("queue:");
  });

  it("GENERATOR-MONITOR-WORKFLOW-02B 안전: 운영 compose workspace를 지우거나 checkout하지 않는다", () => {
    expect(monitor).not.toContain("GITHUB_WORKSPACE");
    expect(monitor).not.toContain("rm -rf");
    expect(monitor).not.toContain("actions/checkout");
    expect(monitor).toContain("$RUNNER_TEMP/genmon-");
    expect(monitor).toContain("${{ runner.temp }}/.osmu-generator-state");
    expect(monitor).toContain("scripts/probe-generator-session.sh");
    expect(monitor).toContain("scripts/lib/generator-monitor-state.sh");
  });

  it("GENERATOR-MONITOR-WORKFLOW-03 경계: 최초 시도와 세 번 재시도 뒤 판정하고 컨테이너 미기동은 보류한다", () => {
    expect(monitor).toContain("for attempt in 1 2 3 4");
    expect(monitor).toContain("scripts/probe-generator-session.sh");
    expect(monitor).toContain("generator_monitor_classify");
    expect(monitor).toContain('if [ "${#probe_statuses[@]}" -eq 0 ]');
    expect(monitor).toContain('reason="container_not_running"');
    expect(monitor).toContain("generator_monitor_persisted_state");
  });

  it("GENERATOR-MONITOR-WORKFLOW-04 전이: 첫 down은 suspect로 저장하고 두 번째 down과 복구에만 알린다", () => {
    expect(monitor).toContain("actions/cache/restore@v4");
    expect(monitor).toContain("actions/cache/save@v4");
    expect(monitor).toContain("generator_monitor_transition");
    expect(monitor).toMatch(/if:\s*\$\{\{ steps\.transition\.outputs\.kind != 'none' \}\}/);
    expect(monitor).toContain("secrets.OSMU_ALERT_SLACK_WEBHOOK_URL");
    expect(monitor).toContain("생성기(Higgsfield) 로그인 만료: 사진 카드와 숏폼 영상 생성 중단, 글자 카드는 정상.");
    expect(monitor).toContain("force_generator_credentials 배포");
  });

  it("GENERATOR-MONITOR-WORKFLOW-05 보안: 읽기 전용 account status만 사용하고 생성·자격증명 덮어쓰기를 포함하지 않는다", () => {
    expect(monitor).not.toContain("higgsfield generate");
    expect(monitor).not.toContain("higgsfield auth login");
    expect(monitor).not.toContain("HIGGSFIELD_CREDENTIALS_JSON: ${{ secrets");
    expect(monitor).not.toContain("printf '%s' \"$HIGGSFIELD_CREDENTIALS_JSON\"");
    expect(monitor).not.toMatch(/echo.*\$SLACK_WEBHOOK/);
  });

  it("GENERATOR-MONITOR-WORKFLOW-06 단위: 정상·1회 실패·2회 실패·컨테이너 없음·복구 다섯 판정이 bash에서 통과한다", () => {
    const result = spawnSync(
      "bash",
      [resolve(repositoryRoot, "scripts/tests/generator-monitor-state.test.sh")],
      { encoding: "utf8" },
    );

    expect(result.status).toBe(0);
    expect(result.stdout).toContain("generator monitor state tests: 5 passed");
  });
});
