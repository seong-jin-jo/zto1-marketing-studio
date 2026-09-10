import {
  chmodSync,
  mkdtempSync,
  mkdirSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { resolve } from "node:path";
import { spawnSync } from "node:child_process";
import { describe, expect, it } from "vitest";

const dashboardRoot = process.cwd();
const repoRoot = resolve(dashboardRoot, "..");
const recovery = readFileSync(
  resolve(dashboardRoot, "scripts/recover-operator-token.sh"),
  "utf8",
);
const formE2e = readFileSync(
  resolve(dashboardRoot, "scripts/verify-operator-form-e2e.sh"),
  "utf8",
);
const packageJson = JSON.parse(
  readFileSync(resolve(dashboardRoot, "package.json"), "utf8"),
) as { scripts: Record<string, string> };
const runbook = readFileSync(
  resolve(repoRoot, "wiki/3-operations/runbooks/operator-token-recovery.md"),
  "utf8",
);

function writeExecutable(path: string, source: string) {
  writeFileSync(path, source, { mode: 0o700 });
  chmodSync(path, 0o700);
}

function runRecovery(apiMeStatus = "200") {
  const root = mkdtempSync(resolve(tmpdir(), "operator-token-contract-"));
  const fakeBin = resolve(root, "bin");
  const secretFile = resolve(root, "openclaw-auto.env");
  const callsFile = resolve(root, "calls.log");
  const fixtureToken = "runtime-contract-token";
  mkdirSync(fakeBin);
  writeFileSync(
    secretFile,
    `DASHBOARD_AUTH_TOKEN=${fixtureToken}\nOSMU_DASHBOARD_AUTH_TOKEN=${fixtureToken}\n`,
    { mode: 0o600 },
  );

  writeExecutable(
    resolve(fakeBin, "gh"),
    `#!/usr/bin/env bash
set -euo pipefail
printf 'gh %s %s\\n' "\${1:-}" "\${2:-}" >> "$CALLS_FILE"
case "\${1:-} \${2:-}" in
  "secret set")
    payload="$(cat)"
    [ "$payload" = "$EXPECTED_TOKEN" ]
    ;;
  "workflow run")
    printf 'https://github.com/example/repo/actions/runs/424242\\n'
    ;;
  "run watch")
    [ "\${3:-}" = "424242" ]
    ;;
  *) exit 64 ;;
esac
`,
  );

  writeExecutable(
    resolve(fakeBin, "curl"),
    `#!/usr/bin/env bash
set -euo pipefail
output=""
url=""
while [ "$#" -gt 0 ]; do
  case "$1" in
    --output) output="$2"; shift 2 ;;
    -H) shift 2 ;;
    http*) url="$1"; shift ;;
    *) shift ;;
  esac
done
header="$(cat)"
[ "$header" = "Authorization: Bearer $EXPECTED_TOKEN" ]
printf 'curl %s\\n' "$url" >> "$CALLS_FILE"
case "$url" in
  */api/me)
    printf '{"isOperator":true}' > "$output"
    printf '%s' "$FAKE_API_ME_STATUS"
    ;;
  */api/operator/customers)
    printf '{"customers":[]}' > "$output"
    printf '200'
    ;;
  *) exit 65 ;;
esac
`,
  );

  writeExecutable(
    resolve(fakeBin, "jq"),
    `#!/usr/bin/env bash
set -euo pipefail
case "\${1:-}" in
  -e) grep -q '"isOperator":true' "\${3:-}" ;;
  -Rs)
    payload="$(cat)"
    printf '"%s"\\n' "$payload"
    ;;
  *) exit 67 ;;
esac
`,
  );

  writeExecutable(
    resolve(fakeBin, "browse"),
    `#!/usr/bin/env bash
set -euo pipefail
mkdir -p "$(dirname "$BROWSE_STATE_FILE")"
url_file="$BROWSE_STATE_FILE.url"
printf 'browse %s\\n' "\${1:-}" >> "$CALLS_FILE"
case "\${1:-}" in
  goto) printf '%s' "$2" > "$url_file" ;;
  eval) printf '%s/operator/customers' "$EXPECTED_BASE_URL" > "$url_file" ;;
  url) cat "$url_file" ;;
  js)
    case "$2" in
      *"운영자"*"고객 관리"*) printf 'true\\n' ;;
      *"운영자 토큰이 유효하지"*) printf 'false\\n' ;;
      *) printf 'storage-cleared\\n' ;;
    esac
    ;;
  network)
    [ "\${2:-}" = "--clear" ] || printf '(no network requests)\\n'
    ;;
  wait) ;;
  console)
    [ "\${2:-}" = "--clear" ] || printf '(no console errors)\\n'
    ;;
  stop) ;;
  *) exit 66 ;;
esac
`,
  );

  const result = spawnSync(
    "bash",
    [resolve(dashboardRoot, "scripts/recover-operator-token.sh")],
    {
      cwd: dashboardRoot,
      encoding: "utf8",
      env: {
        ...process.env,
        PATH: `${fakeBin}:${process.env.PATH ?? ""}`,
        OPENCLAW_SECRET_FILE: secretFile,
        OSMU_GITHUB_REPOSITORY: "example/repo",
        OSMU_BASE_URL: "https://operator.example",
        EXPECTED_BASE_URL: "https://operator.example",
        EXPECTED_TOKEN: fixtureToken,
        FAKE_API_ME_STATUS: apiMeStatus,
        CALLS_FILE: callsFile,
      },
    },
  );
  const calls = readFileSync(callsFile, "utf8");
  rmSync(root, { recursive: true, force: true });
  return { ...result, calls, fixtureToken };
}

describe("operator canonical token recovery contract", () => {
  it("uses the protected local secret inventory as the only plaintext source", () => {
    expect(recovery).toContain(
      "${OPENCLAW_SECRET_FILE:-$HOME/.sj-agent-harness/secrets/openclaw-auto.env}",
    );
    expect(recovery).toMatch(/set -euo pipefail/);
    expect(recovery).toMatch(/set \+x/);
    expect(recovery).toMatch(/umask 077/);
    expect(recovery).toMatch(/DASHBOARD_AUTH_TOKEN/);
    expect(recovery).toMatch(/OSMU_DASHBOARD_AUTH_TOKEN/);
    expect(recovery).toMatch(/600/);
    expect(recovery).toMatch(/symbolic link|symlink/i);
  });

  it("sends the token to GitHub and curl only through stdin, never argv", () => {
    expect(recovery).toMatch(
      /printf '%s' "\$TOKEN" \| gh secret set OSMU_DASHBOARD_AUTH_TOKEN/,
    );
    expect(recovery).not.toMatch(/gh secret set[^\n]*(?:--body|-b)\b/);
    expect(recovery).toContain("-H @-");
    expect(recovery).not.toMatch(
      /curl[^\n]*-H\s+["']Authorization:\s*Bearer\s*\$\{?TOKEN/,
    );
  });

  it("watches the exact deployment run and fails before browser verification on any bad API contract", () => {
    expect(recovery).toMatch(/gh workflow run/);
    expect(recovery).toMatch(/gh run watch "\$RUN_ID" --exit-status/);
    expect(recovery).toContain("/api/me");
    expect(recovery).toContain("/api/operator/customers");
    expect(recovery).toMatch(/\.isOperator == true/);
    expect(recovery).toContain("verify-operator-form-e2e.sh");
  });

  it("keeps the real operator form as a reusable gstack E2E with strict exit criteria", () => {
    expect(formE2e).toMatch(/set -euo pipefail/);
    expect(formE2e).toContain("gstack");
    expect(formE2e).toContain("localStorage.clear()");
    expect(formE2e).toContain("sessionStorage.clear()");
    expect(formE2e).toContain("/operator/customers");
    expect(formE2e).toContain("운영자");
    expect(formE2e).toContain("고객 관리");
    expect(formE2e).toContain("운영자 토큰이 유효하지");
    expect(formE2e).toMatch(/4\d\d|5\d\d/);
    expect(formE2e).toMatch(/console --errors/);
  });

  it("exposes both commands in package scripts and documents fail-closed recovery", () => {
    expect(packageJson.scripts["e2e:operator"]).toBe(
      "bash scripts/verify-operator-form-e2e.sh",
    );
    expect(packageJson.scripts["ops:recover-operator-token"]).toBe(
      "bash scripts/recover-operator-token.sh",
    );
    expect(runbook).toContain(
      "~/.sj-agent-harness/secrets/openclaw-auto.env",
    );
    expect(runbook).toContain("OSMU_DASHBOARD_AUTH_TOKEN");
    expect(runbook).toContain("gh run watch");
    expect(runbook).toContain("/operator/customers");
    expect(runbook).toMatch(/fail-closed/i);
  });

  it("executes sync → exact run watch → APIs → gstack form without leaking plaintext", () => {
    const result = runRecovery();
    const output = `${result.stdout}${result.stderr}`;
    expect(result.status).toBe(0);
    expect(output).toContain("PASS run=424242");
    expect(output).not.toContain(result.fixtureToken);
    expect(result.calls).toMatch(
      /gh secret set[\s\S]*gh workflow run[\s\S]*gh run watch[\s\S]*curl .*\/api\/me[\s\S]*curl .*\/api\/operator\/customers[\s\S]*browse goto/,
    );
  });

  it("fails closed before the browser when live operator identity is not HTTP 200", () => {
    const result = runRecovery("401");
    const output = `${result.stdout}${result.stderr}`;
    expect(result.status).not.toBe(0);
    expect(output).toContain("live /api/me returned HTTP 401");
    expect(output).not.toContain(result.fixtureToken);
    expect(result.calls).not.toContain("browse ");
  });
});
