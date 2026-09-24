import {
  chmodSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { resolve } from "node:path";
import { spawnSync } from "node:child_process";
import { describe, expect, it } from "vitest";

const repositoryRoot = resolve(__dirname, "../../..");
const workflow = readFileSync(
  resolve(repositoryRoot, ".github/workflows/deploy-marketing.yml"),
  "utf8",
);
const probe = readFileSync(
  resolve(repositoryRoot, "scripts/probe-generator-session.sh"),
  "utf8",
);

function runProbe(output: string, status: number) {
  const fakeBin = mkdtempSync(resolve(tmpdir(), "generator-probe-"));
  try {
    const timeout = resolve(fakeBin, "timeout");
    const docker = resolve(fakeBin, "docker");
    writeFileSync(
      timeout,
      '#!/bin/sh\nif [ "$1" = "-k" ]; then shift 2; fi\nshift\nexec "$@"\n',
    );
    writeFileSync(
      docker,
      '#!/bin/sh\nprintf "%s\\n" "$FAKE_DOCKER_OUTPUT"\nexit "$FAKE_DOCKER_STATUS"\n',
    );
    chmodSync(timeout, 0o755);
    chmodSync(docker, 0o755);

    return spawnSync("bash", [resolve(repositoryRoot, "scripts/probe-generator-session.sh")], {
      encoding: "utf8",
      env: {
        ...process.env,
        PATH: `${fakeBin}:${process.env.PATH ?? ""}`,
        FAKE_DOCKER_OUTPUT: output,
        FAKE_DOCKER_STATUS: String(status),
      },
    });
  } finally {
    rmSync(fakeBin, { recursive: true, force: true });
  }
}

function runUncooperativeProbe() {
  const fakeBin = mkdtempSync(resolve(tmpdir(), "generator-probe-hang-"));
  try {
    const docker = resolve(fakeBin, "docker");
    writeFileSync(docker, '#!/bin/sh\ntrap "" TERM\nexec sleep 10\n');
    chmodSync(docker, 0o755);

    const startedAt = Date.now();
    const result = spawnSync("bash", [resolve(repositoryRoot, "scripts/probe-generator-session.sh")], {
      encoding: "utf8",
      env: {
        ...process.env,
        PATH: `${fakeBin}:${process.env.PATH ?? ""}`,
        GENERATOR_PROBE_OUTER_TIMEOUT: "1s",
        GENERATOR_PROBE_INNER_TIMEOUT: "1s",
        GENERATOR_PROBE_KILL_AFTER: "1s",
      },
      timeout: 5_000,
    });
    return { result, elapsedMs: Date.now() - startedAt };
  } finally {
    rmSync(fakeBin, { recursive: true, force: true });
  }
}

describe("deploy-marketing.yml 생성기 API 생존 계약", () => {
  it("GENERATOR-LIVENESS-01 정상: 비용 없는 account status API로 배포 전후 세션 생존을 확인한다", () => {
    expect(probe).toContain("higgsfield account status");
    expect(probe).toContain('timeout -k "$kill_after" "$outer_timeout"');
    expect(probe).toContain('docker exec "$container" timeout -k "$kill_after" "$inner_timeout"');
    expect(workflow.match(/scripts\/probe-generator-session\.sh/g)?.length).toBeGreaterThanOrEqual(2);
    expect(workflow).not.toContain("higgsfield generate create");
    expect(probe).not.toContain("higgsfield generate");
  });

  it("GENERATOR-LIVENESS-02 거절: 저장 토큰을 출력하는 auth token만으로 생존을 판정할 수 없다", () => {
    expect(workflow).not.toContain("higgsfield auth token");
    expect(probe).not.toContain("higgsfield auth token");
  });

  it("GENERATOR-LIVENESS-03 경계: 탐침 원문은 폐기하고 실제 종료 코드만 보존한다", () => {
    expect(probe).toContain(">/dev/null 2>&1");
    expect(probe).toContain("생성기 API 생존 확인 종료 코드");
    expect(probe).toContain('exit "$probe_status"');

    const secretOutput = "access_token=hf_secret refresh_token=rt_secret Bearer opaque-secret operator@example.com";
    const result = runProbe(secretOutput, 7);
    expect(result.status).toBe(7);
    expect(result.stdout).toContain("생성기 API 생존 확인 종료 코드: 7");
    expect(result.stdout).not.toContain(secretOutput);
    expect(result.stdout).not.toContain("hf_secret");
    expect(result.stdout).not.toContain("operator@example.com");

    const success = runProbe("Authenticated", 0);
    expect(success.status).toBe(0);
    expect(success.stdout).toContain("생성기 API 생존 확인 종료 코드: 0");

    const timedOut = runProbe("account status timed out", 124);
    expect(timedOut.status).toBe(124);
    expect(timedOut.stdout).toContain("생성기 API 생존 확인 종료 코드: 124");

    const uncooperative = runUncooperativeProbe();
    expect(uncooperative.result.status).not.toBe(0);
    expect(uncooperative.result.error).toBeUndefined();
    expect(uncooperative.elapsedMs).toBeLessThan(5_000);
  });

  it("GENERATOR-LIVENESS-04 거절: 배포 뒤 API 탐침 실패는 단계 실패로 보이되 글자 카드 배포는 계속한다", () => {
    const finalProbeStart = workflow.indexOf("생성기 API 생존 최종 확인 (배포 뒤)");
    const finalProbeEnd = workflow.indexOf("OSMU 스모크 게이트", finalProbeStart);
    const finalProbeStep = workflow.slice(finalProbeStart, finalProbeEnd);
    const startStep = workflow.indexOf("- name: 기동");

    expect(finalProbeStart).toBeGreaterThan(-1);
    expect(finalProbeStart).toBeGreaterThan(startStep);
    expect(finalProbeStep).toContain("id: generator_liveness");
    expect(finalProbeStep).toContain("if: ${{ success()");
    expect(finalProbeStep).toContain("continue-on-error: true");
    expect(finalProbeStep).toContain("for attempt in 1 2 3");
    expect(finalProbeStep).toContain("sleep 3");
    expect(finalProbeStep).toContain("::error::");
    expect(finalProbeStep).toMatch(/exit 1/);
    expect(finalProbeStep).toContain("글자 카드는 영향 없음");
    expect(finalProbeStep).not.toContain("생성 가능");

    const summaryStart = workflow.indexOf("생성기 상태를 배포 요약에 기록");
    const summaryEnd = workflow.indexOf("OSMU 스모크 게이트", summaryStart);
    const summaryStep = workflow.slice(summaryStart, summaryEnd);
    expect(summaryStep).toContain("steps.generator_liveness.outcome");
    expect(summaryStep).toContain("DEGRADED");
    expect(summaryStep).toContain("GITHUB_STEP_SUMMARY");
  });

  it("GENERATOR-LIVENESS-05 거절: 기존 세션 탐침이 실패하면 죽은 자격증명을 보존하지 않는다", () => {
    const credentialStepStart = workflow.indexOf("이미지·영상 생성기 자격증명 배치");
    const credentialStepEnd = workflow.indexOf("OSMU DB 스키마 read-only preflight", credentialStepStart);
    const credentialStep = workflow.slice(credentialStepStart, credentialStepEnd);

    expect(credentialStep).toContain("CRED_ALIVE=no");
    expect(credentialStep).toMatch(/if probe_generator; then\s+CRED_ALIVE=yes/);
    expect(credentialStep).toContain('if [ "$CRED_ALIVE" = "yes" ]');
    expect(credentialStep).toContain("printf '%s' \"$HIGGSFIELD_CREDENTIALS_JSON\" > \"$CRED\"");
  });
});
