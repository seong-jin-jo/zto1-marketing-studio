import {
  chmodSync,
  existsSync,
  mkdtempSync,
  mkdirSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { resolve } from "node:path";
import { spawn, spawnSync } from "node:child_process";
import { describe, expect, it } from "vitest";

const repositoryRoot = resolve(__dirname, "../../..");
const workflow = readFileSync(
  resolve(repositoryRoot, ".github/workflows/deploy-marketing.yml"),
  "utf8",
);
const compose = readFileSync(
  resolve(repositoryRoot, "docker-compose.postagi-4tenants.yml"),
  "utf8",
);
const dockerfile = readFileSync(
  resolve(repositoryRoot, "dashboard/Dockerfile"),
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
        GENERATOR_PROBE_COMMAND_TIMEOUT_SECONDS: "1",
        GENERATOR_PROBE_KILL_AFTER: "1s",
      },
      timeout: 5_000,
    });
    return { result, elapsedMs: Date.now() - startedAt };
  } finally {
    rmSync(fakeBin, { recursive: true, force: true });
  }
}

function credentialStepScript(force: boolean, confirmLiveReplace = false): string {
  const name = "      - name: 이미지·영상 생성기 자격증명 저장소 준비·선택적 배치\n";
  const start = workflow.indexOf(name);
  const runStart = workflow.indexOf("        run: |\n", start);
  const nextStep = workflow.indexOf("\n      - name:", runStart + 1);
  if (start < 0 || runStart < 0 || nextStep < 0) throw new Error("credential step not found");
  return workflow
    .slice(runStart + "        run: |\n".length, nextStep)
    .split("\n")
    .map((line) => line.startsWith("          ") ? line.slice(10) : line)
    .join("\n")
    .replace("${{ github.event.inputs.force_generator_credentials }}", force ? "true" : "false")
    .replace("${{ github.event.inputs.confirm_replace_live_generator_credentials }}", confirmLiveReplace ? "true" : "false");
}

function startStepScript(services = "openclaw-dashboard-osmu"): string {
  const name = "      - name: 기동\n";
  const start = workflow.indexOf(name);
  const runStart = workflow.indexOf("        run: |\n", start);
  const nextStep = workflow.indexOf("\n      - name:", runStart + 1);
  if (start < 0 || runStart < 0 || nextStep < 0) throw new Error("start step not found");
  return workflow
    .slice(runStart + "        run: |\n".length, nextStep)
    .split("\n")
    .map((line) => line.startsWith("          ") ? line.slice(10) : line)
    .join("\n")
    .replaceAll("${{ github.event.inputs.services }}", services);
}

function runStartStepAsRestrictedRunner(options: { holderPersists?: boolean; services?: string } = {}) {
  const fixtureRoot = mkdtempSync(resolve(tmpdir(), "generator-start-nonroot-"));
  const fakeBin = resolve(fixtureRoot, "bin");
  const credentialDir = resolve(fixtureRoot, ".config/higgsfield");
  const dockerLog = resolve(fixtureRoot, "docker.log");
  mkdirSync(fakeBin, { recursive: true });
  mkdirSync(credentialDir, { recursive: true });
  chmodSync(credentialDir, 0o000);
  writeFileSync(resolve(fakeBin, "docker"), `#!/usr/bin/env bash
set -eu
printf '%s\\n' "$*" >> "$FAKE_DOCKER_LOG"
joined="$*"
case "$joined" in
  *'exec higgsfield-deploy-lock-'*'test -f /tmp/deploy-lock-ready'*) exit 0 ;;
  *'container inspect higgsfield-deploy-lock-'*)
    if [ "$FAKE_HOLDER_PERSISTS" = "true" ]; then exit 0; else exit 1; fi
    ;;
  *'container inspect openclaw-dashboard-osmu'*) exit 1 ;;
  *) exit 0 ;;
esac
`);
  chmodSync(resolve(fakeBin, "docker"), 0o755);
  try {
    const result = spawnSync("bash", ["-c", startStepScript(options.services)], {
      encoding: "utf8",
      env: {
        ...process.env,
        HOME: fixtureRoot,
        PATH: `${fakeBin}:${process.env.PATH ?? ""}`,
        FAKE_DOCKER_LOG: dockerLog,
        FAKE_HOLDER_PERSISTS: String(options.holderPersists ?? false),
        GITHUB_RUN_ID: "123",
        GITHUB_RUN_ATTEMPT: "1",
      },
    });
    return {
      result,
      dockerCalls: readFileSync(dockerLog, "utf8"),
    };
  } finally {
    chmodSync(credentialDir, 0o700);
    rmSync(fixtureRoot, { recursive: true, force: true });
  }
}

function runCredentialStep(
  state: string,
  force: boolean,
  options: {
    containerRunning?: boolean;
    wrapperAvailable?: boolean;
    wrapperUsesFlock?: boolean;
    secret?: string;
    confirmLiveReplace?: boolean;
  } = {},
) {
  const fixtureRoot = mkdtempSync(resolve(tmpdir(), "generator-credentials-"));
  const fakeBin = resolve(fixtureRoot, "bin");
  const invocationLog = resolve(fixtureRoot, "docker.log");
  const mkdir = spawnSync("mkdir", ["-p", fakeBin]);
  if (mkdir.status !== 0) throw new Error("failed to create fake bin directory");
  const fakeDocker = `#!/usr/bin/env bash
set -eu
joined="$*"
case "$joined" in
  *'inspect -f'*openclaw-dashboard-osmu*)
    if [ "$FAKE_CONTAINER_RUNNING" = "true" ]; then echo true; else echo false; fi
    ;;
  *'exec openclaw-dashboard-osmu test -x /usr/local/bin/run-higgsfield-locked'*)
    if [ "$FAKE_WRAPPER_AVAILABLE" = "true" ]; then exit 0; else exit 1; fi
    ;;
  *"exec openclaw-dashboard-osmu grep -q flock -w /usr/local/bin/run-higgsfield-locked"*)
    if [ "$FAKE_WRAPPER_USES_FLOCK" = "true" ]; then exit 0; else exit 1; fi
    ;;
  *'exec -i -e HIGGSFIELD_CREDENTIAL_FILE='*'/usr/local/bin/run-higgsfield-locked'*)
    cat >/dev/null
    echo write_credentials_locked >> "$FAKE_DOCKER_LOG"
    ;;
  *'console.log("missing")'*) echo "$FAKE_CRED_STATE" ;;
  *'node:20-bookworm-slim node -e'*'.credentials.json.tmp-'*)
    cat >/dev/null
    echo write_credentials_helper >> "$FAKE_DOCKER_LOG"
    ;;
  *'.config.json.tmp-'*) cat >/dev/null; echo write_config >> "$FAKE_DOCKER_LOG" ;;
  *) echo prepare_store >> "$FAKE_DOCKER_LOG" ;;
esac
`;
  writeFileSync(resolve(fakeBin, "docker"), fakeDocker);
  chmodSync(resolve(fakeBin, "docker"), 0o755);

  try {
    const result = spawnSync("bash", ["-c", credentialStepScript(force, options.confirmLiveReplace)], {
      encoding: "utf8",
      env: {
        ...process.env,
        HOME: fixtureRoot,
        PATH: `${fakeBin}:${process.env.PATH ?? ""}`,
        FAKE_CRED_STATE: state,
        FAKE_DOCKER_LOG: invocationLog,
        FAKE_CONTAINER_RUNNING: String(options.containerRunning ?? false),
        FAKE_WRAPPER_AVAILABLE: String(options.wrapperAvailable ?? true),
        FAKE_WRAPPER_USES_FLOCK: String(options.wrapperUsesFlock ?? true),
        HIGGSFIELD_CREDENTIALS_JSON: options.secret
          ?? '{"access_token":"masked-test-value","refresh_token":"masked-refresh-value"}',
      },
    });
    const invocations = readFileSync(invocationLog, "utf8").trim().split("\n").filter(Boolean);
    return { result, invocations };
  } finally {
    rmSync(fixtureRoot, { recursive: true, force: true });
  }
}

function credentialWriterScript(): string {
  const marker = "CREDENTIAL_WRITER_JS=\"$(cat <<'NODE'\n";
  const start = workflow.indexOf(marker);
  const end = workflow.indexOf("\n          NODE\n", start);
  if (start < 0 || end < 0) throw new Error("credential writer script not found");
  return workflow.slice(start + marker.length, end)
    .split("\n")
    .map((line) => line.startsWith("          ") ? line.slice(10) : line)
    .join("\n");
}

function runCredentialWriter(secret: string) {
  const fixtureRoot = mkdtempSync(resolve(tmpdir(), "generator-writer-"));
  const credentialFile = resolve(fixtureRoot, "credentials.json");
  writeFileSync(credentialFile, '{"access_token":"existing","refresh_token":"keep-me"}', { mode: 0o600 });
  const result = spawnSync(process.execPath, ["-e", credentialWriterScript()], {
    encoding: "utf8",
    input: secret,
    env: { ...process.env, HIGGSFIELD_CREDENTIAL_FILE: credentialFile },
  });
  const content = readFileSync(credentialFile, "utf8");
  rmSync(fixtureRoot, { recursive: true, force: true });
  return { result, content };
}

function waitForFile(file: string, timeoutMs = 3_000): Promise<void> {
  const startedAt = Date.now();
  return new Promise((resolveWait, rejectWait) => {
    const check = () => {
      if (existsSync(file)) {
        resolveWait();
        return;
      }
      if (Date.now() - startedAt >= timeoutMs) {
        rejectWait(new Error(`timed out waiting for ${file}`));
        return;
      }
      setTimeout(check, 20);
    };
    check();
  });
}

function waitForExit(child: ReturnType<typeof spawn>): Promise<number | null> {
  return new Promise((resolveExit, rejectExit) => {
    child.once("error", rejectExit);
    child.once("exit", resolveExit);
  });
}

describe("deploy-marketing.yml 생성기 API 생존 계약", () => {
  it("GENERATOR-LIVENESS-01 정상: 비용 없는 account status API로 배포 전후 세션 생존을 확인한다", () => {
    expect(probe).toContain("higgsfield account status");
    expect(probe).toContain('env HIGGSFIELD_LOCK_WAIT_SECONDS="$lock_wait"');
    expect(probe).toContain("/usr/local/bin/run-higgsfield-locked higgsfield account status");
    expect(probe).toContain('timeout -k "$kill_after" "$outer_timeout"');
    expect(probe).toContain('docker exec "$container" env HIGGSFIELD_LOCK_WAIT_SECONDS="$lock_wait"');
    expect(probe).toContain('HIGGSFIELD_COMMAND_TIMEOUT_SECONDS="$command_timeout_seconds"');
    expect(workflow.match(/scripts\/probe-generator-session\.sh/g)?.length).toBeGreaterThanOrEqual(1);
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

    const busy = runProbe("credential lock busy", 75);
    expect(busy.status).toBe(75);
    expect(busy.stdout).toContain("생성기 API 생존 확인 종료 코드: 75");

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
    expect(finalProbeStep).toContain("generator_probe_state=busy");
    expect(finalProbeStep).toContain('echo "state=$generator_probe_state" >> "$GITHUB_OUTPUT"');
    expect(summaryStep).toContain("steps.generator_liveness.outputs.state");
    expect(summaryStep).toContain("인증 실패로 판정하지 않았습니다");
    expect(summaryStep).toContain("DEGRADED");
    expect(summaryStep).toContain("GITHUB_STEP_SUMMARY");
  });

  it("GENERATOR-LIVENESS-05 정상: 배포 전 생존 판정은 만료 metadata만 읽고 CLI 갱신을 일으키지 않는다", () => {
    const credentialStepStart = workflow.indexOf("이미지·영상 생성기 자격증명 저장소 준비·선택적 배치");
    const credentialStepEnd = workflow.indexOf("OSMU DB 스키마 read-only preflight", credentialStepStart);
    const credentialStep = workflow.slice(credentialStepStart, credentialStepEnd);

    expect(credentialStep).toContain("CRED_ALIVE=no");
    expect(credentialStep).toContain("credential_state");
    expect(credentialStep).toContain("expires_at");
    expect(credentialStep).not.toContain("probe_generator");
    const stateFunction = credentialStep.slice(
      credentialStep.indexOf("credential_state()"),
      credentialStep.indexOf("container_up()"),
    );
    expect(stateFunction).not.toContain("higgsfield account status");
  });

  it("GENERATOR-LIVENESS-06 거절: force 입력 없이는 시크릿을 쓰거나 덮어쓰지 않는다", () => {
    const credentialStepStart = workflow.indexOf("이미지·영상 생성기 자격증명 저장소 준비·선택적 배치");
    const credentialStepEnd = workflow.indexOf("OSMU DB 스키마 read-only preflight", credentialStepStart);
    const credentialStep = workflow.slice(credentialStepStart, credentialStepEnd);

    expect(credentialStep).toContain('FORCE_CREDENTIALS="${{ github.event.inputs.force_generator_credentials }}"');
    expect(credentialStep).toMatch(/if \[ "\$FORCE_CREDENTIALS" = "true" \]; then[\s\S]*write_credentials/);
    expect(credentialStep).toMatch(/else[\s\S]*기존 생성기 자격증명 보존/);
    expect(credentialStep).toContain('CONFIRM_LIVE_REPLACE="${{ github.event.inputs.confirm_replace_live_generator_credentials }}"');
    expect(credentialStep).toContain("grep -q 'flock -w' /usr/local/bin/run-higgsfield-locked");
    expect(credentialStep).not.toContain('printf \'%s\' "$HIGGSFIELD_CREDENTIALS_JSON" > "$CRED"');
  });

  it("GENERATOR-LIVENESS-07 정상: 자격증명은 root 실행 UID·0600·쓰기 마운트로 영속된다", () => {
    const service = compose.slice(
      compose.indexOf("  openclaw-dashboard-osmu:"),
      compose.indexOf("  openclaw-studio-export-worker:"),
    );
    const worker = compose.slice(compose.indexOf("  openclaw-studio-export-worker:"));

    expect(service).toContain('user: "0:0"');
    expect(service).toContain("${HOME}/.config/higgsfield:/root/.config/higgsfield:rw");
    expect(service).toContain("HIGGSFIELD_LOCK_DIR: /root/.config/higgsfield/.cli.lock.d");
    expect(service).toContain('HIGGSFIELD_LOCK_WAIT_SECONDS: "10"');
    expect(worker).not.toContain(".config/higgsfield");
    expect(dockerfile).toContain("run-higgsfield-locked.sh /usr/local/bin/run-higgsfield-locked");
    expect(dockerfile).toContain("umask 077");
    expect(dockerfile).toContain("util-linux coreutils");
    expect(workflow).toContain('chmod 600 "/credentials/$file"');
    expect(workflow).toContain('chown 0:0 "/credentials/$file"');
  });

  it("GENERATOR-LIVENESS-08 정상: 배포 뒤 실제 마운트·UID·권한을 확인한다", () => {
    const finalProbeStart = workflow.indexOf("생성기 API 생존 최종 확인 (배포 뒤)");
    const finalProbeEnd = workflow.indexOf("생성기 상태를 배포 요약에 기록", finalProbeStart);
    const finalProbeStep = workflow.slice(finalProbeStart, finalProbeEnd);

    expect(finalProbeStep).toContain('echo "generator_mount_rw=$generator_mount_rw"');
    expect(finalProbeStep).toContain('echo "generator_runtime_uid=$generator_runtime_uid"');
    expect(finalProbeStep).toContain('echo "generator_credentials_mode=$generator_credentials_mode"');
    expect(finalProbeStep).toContain('echo "generator_credentials_uid=$generator_credentials_uid"');
    expect(finalProbeStep).toContain("생성기 자격증명 파일이 없거나 비어 있음");
  });

  it("GENERATOR-LIVENESS-08B 경합: 러너 셸은 호스트 파일을 열지 않고 컨테이너가 credential flock을 보유한다", () => {
    const start = workflow.indexOf("- name: 기동");
    const end = workflow.indexOf("- name: 상태", start);
    const startStep = workflow.slice(start, end);

    expect(startStep).toContain('generator_lock_holder="higgsfield-deploy-lock-${GITHUB_RUN_ID}-${GITHUB_RUN_ATTEMPT}"');
    expect(startStep).toContain('-v "$HOME/.config/higgsfield:/credentials:rw"');
    expect(startStep).toContain("exec 9>/credentials/.cli.lock.d/lock");
    expect(startStep).toContain("flock -w 45 9");
    expect(startStep).toContain("/tmp/deploy-lock-ready");
    expect(startStep).toContain("timeout-minutes: 20");
    expect(startStep).toContain("docker run -d --rm --name");
    expect(startStep).toContain("exec sleep 1800");
    expect(startStep).toContain("for _release_attempt in 1 2 3");
    expect(startStep).toContain('docker info >/dev/null 2>&1');
    expect(startStep).toContain('docker container inspect "$generator_lock_holder"');
    expect(startStep).not.toContain("exec sleep 300");
    expect(startStep).toContain("docker compose --env-file .env.osmu");
    expect(startStep).not.toContain('exec 9>"$HOME/.config/higgsfield');

    const { result, dockerCalls } = runStartStepAsRestrictedRunner();
    expect(result.status, `${result.stdout}\n${result.stderr}`).toBe(0);
    expect(dockerCalls).toContain("run -d --rm --name higgsfield-deploy-lock-123-1");
    expect(dockerCalls).toContain("compose --env-file .env.osmu");
  });

  it("GENERATOR-LIVENESS-08C 거절: lock holder 삭제가 확인되지 않으면 배포를 실패시킨다", () => {
    const { result, dockerCalls } = runStartStepAsRestrictedRunner({ holderPersists: true });
    expect(result.status).not.toBe(0);
    expect(result.stdout).toContain("생성기 자격증명 잠금 컨테이너를 제거하지 못함");
    expect(dockerCalls.match(/rm -f higgsfield-deploy-lock-123-1/g)?.length).toBeGreaterThanOrEqual(3);
    expect(dockerCalls).toContain("container inspect higgsfield-deploy-lock-123-1");
  });

  it("GENERATOR-LIVENESS-08D 정상: dashboard 미포함 선택 배포는 holder 없이 성공한다", () => {
    const { result, dockerCalls } = runStartStepAsRestrictedRunner({ services: "gateway" });
    expect(result.status, `${result.stdout}\n${result.stderr}`).toBe(0);
    expect(dockerCalls).not.toContain("higgsfield-deploy-lock-");
    expect(dockerCalls).toContain("compose --env-file .env.osmu");
  });

  it.each([
    ["unexpired", false, 0],
    ["expired", false, 0],
    ["missing", false, 0],
    ["unexpired", true, 1],
  ] as const)(
    "GENERATOR-LIVENESS-09 통합: state=%s force=%s일 때 credential 교체 횟수는 %i다",
    (state, force, expectedWrites) => {
      const { result, invocations } = runCredentialStep(state, force, {
        containerRunning: force,
        confirmLiveReplace: state !== "missing" && force,
      });
      expect(result.status, `${result.stdout}\n${result.stderr}`).toBe(0);
      expect(invocations.filter((line) => line.startsWith("write_credentials_"))).toHaveLength(expectedWrites);
      expect(invocations.filter((line) => line === "write_config")).toHaveLength(1);
      expect(result.stdout).not.toContain("masked-test-value");
    },
  );

  it("GENERATOR-LIVENESS-10 경합: 실행 중 dashboard의 force 교체는 같은 credential 잠금을 거친다", () => {
    const { result, invocations } = runCredentialStep("expired", true, {
      containerRunning: true,
      confirmLiveReplace: true,
    });
    expect(result.status, `${result.stdout}\n${result.stderr}`).toBe(0);
    expect(invocations.filter((line) => line === "write_credentials_locked")).toHaveLength(1);
    expect(invocations).not.toContain("write_credentials_helper");
  });

  it("GENERATOR-LIVENESS-10B 거절: 살아 있는 credential은 force만으로 교체하지 않고 2차 확인을 요구한다", () => {
    const { result, invocations } = runCredentialStep("unexpired", true, { containerRunning: true });
    expect(result.status).not.toBe(0);
    expect(result.stdout).toContain("confirm_replace_live_generator_credentials=true");
    expect(invocations.filter((line) => line.startsWith("write_credentials_"))).toHaveLength(0);
  });

  it("GENERATOR-LIVENESS-10C 거절: access token이 만료됐어도 refresh token이 남으면 2차 확인을 요구한다", () => {
    const { result, invocations } = runCredentialStep("expired", true, { containerRunning: true });
    expect(result.status).not.toBe(0);
    expect(result.stdout).toContain("state=expired");
    expect(result.stdout).toContain("confirm_replace_live_generator_credentials=true");
    expect(invocations.filter((line) => line.startsWith("write_credentials_"))).toHaveLength(0);
  });

  it("GENERATOR-LIVENESS-11 거절: 실행 중 옛 이미지에 잠금 wrapper가 없으면 force 교체를 중단한다", () => {
    const { result, invocations } = runCredentialStep("expired", true, {
      containerRunning: true,
      confirmLiveReplace: true,
      wrapperAvailable: false,
    });
    expect(result.status).not.toBe(0);
    expect(result.stdout).toContain("force=false 배포로 새 이미지를 먼저 올린 뒤");
    expect(invocations.filter((line) => line.startsWith("write_credentials_"))).toHaveLength(0);
  });

  it("GENERATOR-LIVENESS-11B 거절: 실행 중 이미지가 구형 mkdir wrapper면 force 교체를 중단한다", () => {
    const { result, invocations } = runCredentialStep("expired", true, {
      containerRunning: true,
      confirmLiveReplace: true,
      wrapperUsesFlock: false,
    });
    expect(result.status).not.toBe(0);
    expect(result.stdout).toContain("구형 잠금 구현");
    expect(invocations.filter((line) => line.startsWith("write_credentials_"))).toHaveLength(0);
  });

  it("GENERATOR-LIVENESS-12 거절: force 입력인데 시크릿이 비어 있으면 기존 파일을 건드리지 않는다", () => {
    const { result, invocations } = runCredentialStep("expired", true, { secret: "" });
    expect(result.status).not.toBe(0);
    expect(result.stdout).toContain("HIGGSFIELD_CREDENTIALS_JSON이 비어 있음");
    expect(invocations.filter((line) => line.startsWith("write_credentials_"))).toHaveLength(0);
  });

  it("GENERATOR-LIVENESS-12B 롤백: force 교체는 0600 백업 후 계정 검증 실패 시 이전 파일을 복원한다", () => {
    expect(workflow).toContain("credentials.json.bak-$(date -u +%Y%m%dT%H%M%SZ)");
    expect(workflow).toContain('fs.copyFileSync(target, backup)');
    expect(workflow).toContain('fs.chmodSync(backup, 0o600)');
    expect(workflow).toContain('higgsfield account status >/dev/null 2>&1');
    expect(workflow).toContain('cp -f "$backup" "$target"');
    expect(workflow).toContain('chmod 600 "$target"');
    expect(workflow).toContain("tail -n +4");
    expect(workflow).toContain("xargs -r rm -f");
  });

  it.each([
    ["잘못된 JSON", "{"],
    ["access_token 누락", "{}"],
    ["refresh_token 누락", '{"access_token":"access-only"}'],
    ["공백 refresh_token", '{"access_token":"access","refresh_token":"   "}'],
    ["객체 access_token", '{"access_token":{},"refresh_token":"refresh"}'],
    ["배열 refresh_token", '{"access_token":"access","refresh_token":[]}'],
  ])("GENERATOR-LIVENESS-13 거절: %s은 기존 credential을 보존한다", (_label, secret) => {
    const { result, content } = runCredentialWriter(secret);
    expect(result.status).not.toBe(0);
    expect(content).toBe('{"access_token":"existing","refresh_token":"keep-me"}');
    expect(result.stdout).not.toContain("keep-me");
    expect(result.stderr).not.toContain("keep-me");
    if (secret === "{") expect(result.stderr).toContain("invalid credential JSON");
  });

  const linuxIt = process.platform === "linux" ? it : it.skip;
  linuxIt(
    "GENERATOR-LIVENESS-14 경합: CI Linux에서 실제 flock wrapper가 force 교체와 timeout 경계를 보존한다",
    async () => {
      const fixtureRoot = mkdtempSync(resolve(tmpdir(), "generator-lock-integration-"));
      const lockDir = resolve(fixtureRoot, ".cli.lock.d");
      const lockFile = resolve(lockDir, "lock");
      const credentialFile = resolve(fixtureRoot, "credentials.json");
      const wrapper = resolve(repositoryRoot, "dashboard/scripts/run-higgsfield-locked.sh");
      const sharedEnv = {
        ...process.env,
        HIGGSFIELD_LOCK_DIR: lockDir,
        HIGGSFIELD_LOCK_WAIT_SECONDS: "3",
      };
      writeFileSync(credentialFile, '{"access_token":"existing","refresh_token":"keep-me"}', { mode: 0o600 });

      const holder = spawn(wrapper, ["sh", "-ceu", "sleep 0.6"], { env: sharedEnv, stdio: "ignore" });
      const holderExit = waitForExit(holder);
      try {
        await waitForFile(lockFile);
        await new Promise((resolveDelay) => setTimeout(resolveDelay, 100));
        const writer = spawn(wrapper, [process.execPath, "-e", credentialWriterScript()], {
          env: {
            ...sharedEnv,
            HIGGSFIELD_CREDENTIAL_FILE: credentialFile,
          },
          stdio: ["pipe", "ignore", "pipe"],
        });
        const writerExit = waitForExit(writer);
        writer.stdin.end('{"access_token":"new-server-session","refresh_token":"new-refresh"}');

        await new Promise((resolveDelay) => setTimeout(resolveDelay, 100));
        expect(readFileSync(credentialFile, "utf8")).toContain("keep-me");
        expect(await holderExit).toBe(0);
        expect(await writerExit).toBe(0);
        expect(JSON.parse(readFileSync(credentialFile, "utf8"))).toEqual({
          access_token: "new-server-session",
          refresh_token: "new-refresh",
        });

        const liveHolder = spawn(wrapper, ["sh", "-ceu", "sleep 2"], { env: sharedEnv, stdio: "ignore" });
        const liveHolderExit = waitForExit(liveHolder);
        await waitForFile(lockFile);
        await new Promise((resolveDelay) => setTimeout(resolveDelay, 100));
        const timedOut = spawnSync(wrapper, ["true"], {
          env: { ...sharedEnv, HIGGSFIELD_LOCK_WAIT_SECONDS: "1" },
          encoding: "utf8",
        });
        expect(timedOut.status).toBe(75);
        expect(await liveHolderExit).toBe(0);

        const preexistingLockFile = spawnSync(wrapper, ["true"], { env: sharedEnv, encoding: "utf8" });
        expect(preexistingLockFile.status, preexistingLockFile.stderr).toBe(0);
        expect(readFileSync(lockFile, "utf8")).toBe("");
      } finally {
        holder.kill("SIGTERM");
        rmSync(fixtureRoot, { recursive: true, force: true });
      }
    },
    10_000,
  );
});
