import { chmodSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { resolve } from "node:path";
import { spawnSync } from "node:child_process";
import { describe, expect, it } from "vitest";

const repositoryRoot = resolve(__dirname, "../../..");
const workflow = readFileSync(
  resolve(repositoryRoot, ".github/workflows/diagnose-generator.yml"),
  "utf8",
);

function extractRunScript(source: string): string {
  const marker = "        run: |\n";
  const start = source.indexOf(marker);
  if (start < 0) throw new Error("diagnose run block not found");
  return source
    .slice(start + marker.length)
    .split("\n")
    .map((line) => (line.startsWith("          ") ? line.slice(10) : line))
    .join("\n");
}

const runScript = extractRunScript(workflow);

function runWithFakeDocker(failProbe = "") {
  const fixtureRoot = mkdtempSync(resolve(tmpdir(), "higgsfield-diag-"));
  const fakeBin = resolve(fixtureRoot, "bin");
  const invocationLog = resolve(fixtureRoot, "docker-invocations.log");
  const mkdir = spawnSync("mkdir", ["-p", fakeBin]);
  if (mkdir.status !== 0) throw new Error("failed to create fake bin directory");

  const fakeDocker = `#!/usr/bin/env bash
set -u
printf '%s\n' "$*" >> "$FAKE_DOCKER_LOG"
probe="$FAIL_PROBE"
case "$1" in
  inspect)
    [ "$probe" = container ] && exit 9
    echo true
    ;;
  exec)
    target="$2"
    shift 2
    [ "$target" = openclaw-dashboard-osmu ] || exit 91
    joined="$*"
    case "$joined" in
      *"command -v higgsfield"*) [ "$probe" = cli_present ] && exit 9; exit 0 ;;
      *"higgsfield --version"*) [ "$probe" = cli_version ] && exit 9; echo 'higgsfield/1.1.26';;
      *"getent ahosts"*) [ "$probe" = dns ] && exit 9; echo '203.0.113.8 STREAM host';;
      *"curl -sS"*) [ "$probe" = https ] && exit 28; echo 'dns=0.001s tcp=0.002s tls=0.003s total=0.004s http_code=404 ssl_verify=0';;
      *"for name in HTTP_PROXY"*)
        [ "$probe" = proxy ] && exit 9
        for name in HTTP_PROXY HTTPS_PROXY NO_PROXY http_proxy https_proxy no_proxy; do echo "$name=[UNSET]"; done
        ;;
      *"stat -c"*) [ "$probe" = metadata ] && exit 9; echo '1791501587 263';;
      *"node -e"*) [ "$probe" = expiry ] && exit 9; echo 'expires_at=2026-10-09T23:19:46.000Z expired=false';;
      *"run-higgsfield-locked higgsfield account status"*)
        if [ "$probe" = account ]; then echo 'request failed (no response received)'; exit 2; fi
        echo 'plus plan dummy-secret';;
      *) exit 92 ;;
    esac
    ;;
  logs)
    [ "$probe" = logs ] && exit 9
    echo '{"kind":"hf_image_step","step":"request_received","extra":"dummy-secret"}'
    echo 'GENERATOR_UNAVAILABLE dummy-secret'
    echo '/api/higgsfield/image dummy-secret status=503'
    echo '::error::dummy-secret'
    ;;
  *) exit 93 ;;
esac
`;
  const fakeTimeout = `#!/usr/bin/env bash
shift
exec "$@"
`;

  writeFileSync(resolve(fakeBin, "docker"), fakeDocker);
  writeFileSync(resolve(fakeBin, "timeout"), fakeTimeout);
  chmodSync(resolve(fakeBin, "docker"), 0o755);
  chmodSync(resolve(fakeBin, "timeout"), 0o755);

  try {
    const result = spawnSync("bash", ["-c", runScript], {
      encoding: "utf8",
      timeout: 10_000,
      env: {
        ...process.env,
        PATH: `${fakeBin}:${process.env.PATH ?? ""}`,
        FAKE_DOCKER_LOG: invocationLog,
        FAIL_PROBE: failProbe,
        GITHUB_RUN_ID: "503",
      },
    });
    return {
      status: result.status,
      output: `${result.stdout}${result.stderr}`,
      invocations: readFileSync(invocationLog, "utf8").trim().split("\n"),
    };
  } finally {
    rmSync(fixtureRoot, { recursive: true, force: true });
  }
}

describe("Higgsfield 운영 읽기 전용 진단 workflow 계약", () => {
  it("HIGGSFIELD-DIAG-01 정상: DNS와 token 없는 HTTPS 연결을 시간과 상태코드로 분리한다", () => {
    expect(workflow).toContain("fnf-api-gw.higgsfield.ai");
    expect(workflow).toContain("getent ahosts");
    expect(workflow).toContain("time_namelookup");
    expect(workflow).toContain("time_connect");
    expect(workflow).toContain("time_appconnect");
    expect(workflow).toContain("http_code");
    expect(workflow).toContain("--connect-timeout 10");
    expect(workflow).toContain("--max-time 20");
    expect(workflow).toContain("-o /dev/null");
    expect(workflow).toContain("dns_exit=");
    expect(workflow).toContain("https_exit=");
  });

  it("HIGGSFIELD-DIAG-02 정상: proxy 존재, CLI 버전, token 만료시각만 출력한다", () => {
    for (const name of ["HTTP_PROXY", "HTTPS_PROXY", "NO_PROXY", "http_proxy", "https_proxy", "no_proxy"]) {
      expect(workflow).toContain(name);
    }
    expect(workflow).toContain("[SET:value-masked]");
    expect(workflow).toContain("higgsfield --version");
    expect(workflow).toContain("account_status_exit=");
    expect(workflow).toContain("account_status_class=");
    expect(workflow).toContain("/usr/local/bin/run-higgsfield-locked higgsfield account status");
    expect(workflow).not.toContain('printf \'%s\\n\' "$account_result"');
    expect(workflow).toContain("expires_at");
    expect(workflow).toContain("expired=");
  });

  it("HIGGSFIELD-DIAG-03 정상: 최근 30분 이미지 503 분기 로그를 제한하고 마스킹한다", () => {
    expect(workflow).toContain('docker logs --since 30m');
    expect(workflow).toContain("hf_image_step");
    expect(workflow).toContain("GENERATOR_UNAUTHENTICATED");
    expect(workflow).toContain("GENERATOR_UNAVAILABLE");
    expect(workflow).toContain("tail -200");
    expect(workflow).toContain("--tail 2000");
    expect(workflow).toContain("timeout 20s docker logs");
    expect(workflow).toContain("tail -c 1048576");
    expect(workflow).toContain('pipeline_status=("${PIPESTATUS[@]}")');
    expect(workflow).toContain("__DIAG_STATUS__ docker=%s");
    expect(workflow).toContain("matching_logs=0_or_outside_bounded_window");
    expect(workflow).toContain("hf_image_step step=%s");
    expect(workflow).toContain("hf_image_step step=unknown");
    expect(workflow).toContain("branch=GENERATOR_UNAUTHENTICATED");
    expect(workflow).toContain("branch=GENERATOR_UNAVAILABLE");
    expect(workflow).toContain("http_status=503");
    expect(workflow).toContain("::stop-commands::");
    expect(workflow).toContain('c="openclaw-dashboard-osmu"');
    expect(workflow).toContain("diagnostic_failed=");
    expect(workflow).toContain("permissions: {}");
    expect(workflow).not.toContain('printf \'%s\\n\' "$matching_logs" | redact');
    expect(workflow).not.toContain('recent_logs="$(');
  });

  it("HIGGSFIELD-DIAG-04 거절: 생성, 자격증명 변경, raw secret 출력은 포함하지 않는다", () => {
    expect(workflow).not.toContain("higgsfield generate");
    expect(workflow).not.toContain("higgsfield auth login");
    expect(workflow).not.toContain("higgsfield auth token");
    expect(workflow).not.toMatch(/cat\s+[^\n]*credentials\.json/);
    expect(workflow).not.toMatch(/\b(printenv|env)\b/);
    expect(workflow).not.toContain("grep -i osmu");
    expect(workflow).not.toMatch(/docker\s+(restart|rm|kill)/);
    expect(workflow).not.toContain("docker compose up");
    expect(workflow).not.toContain("HIGGSFIELD_CREDENTIALS_JSON");
    expect(workflow).not.toContain("Authorization:");
  });

  it("HIGGSFIELD-DIAG-05 통합: 허용 목록 출력만 남기고 정확한 운영 컨테이너를 진단한다", () => {
    const result = runWithFakeDocker();

    expect(result.status, result.output).toBe(0);
    expect(result.output).toContain("diagnostic_failed=0");
    expect(result.output).toContain("cli_version=1.1.26");
    expect(result.output).toContain("dns_address=203.0.113.8");
    expect(result.output).toContain("account_status_class=authenticated");
    expect(result.output).toContain("hf_image_step step=request_received");
    expect(result.output).toContain("branch=GENERATOR_UNAVAILABLE");
    expect(result.output).toContain("http_status=503");
    expect(result.output).not.toContain("dummy-secret");
    expect(result.output).not.toContain("::error::dummy-secret");
    for (const invocation of result.invocations) {
      if (/^(inspect|exec|logs)\b/.test(invocation)) {
        expect(invocation).toContain("openclaw-dashboard-osmu");
      }
    }
  });

  it.each(["cli_version", "dns", "https", "proxy", "metadata", "expiry", "account", "logs"])(
    "HIGGSFIELD-DIAG-06 거절: %s probe 실패를 누적하고 뒤 진단까지 수행한다",
    (failedProbe) => {
      const result = runWithFakeDocker(failedProbe);

      expect(result.status, result.output).toBe(1);
      expect(result.output).toContain("diagnostic_failed=1");
      expect(result.output).toContain("log_window=30m");
      expect(result.output).not.toContain("dummy-secret");
    },
  );
});
