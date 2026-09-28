import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { spawnSync } from "node:child_process";
import { describe, expect, it } from "vitest";

const repositoryRoot = path.resolve(process.cwd(), "..");
const migrationPath = path.join(repositoryRoot, "migrate-postagi-persist-mounts.sh");
const migration = fs.readFileSync(migrationPath, "utf8");
const runbook = fs.readFileSync(path.join(repositoryRoot, "docs/notes/POSTAGI_4_TENANTS.md"), "utf8");
const ci = fs.readFileSync(path.join(repositoryRoot, ".github/workflows/ci.yml"), "utf8");
const holderVerifier = fs.readFileSync(path.join(repositoryRoot, "scripts/verify-openclaw-mount-holder.sh"), "utf8");

const targets = [
  "config-tenant2",
  "data-tenant2",
  "config-tenant3",
  "data-tenant3",
  "config-tenant4",
  "data-tenant4",
];

function installExecutable(file: string, content: string) {
  fs.writeFileSync(file, content, { mode: 0o755 });
}

function createFaultSandbox(faultTarget: string) {
  const tempRoot = fs.mkdtempSync(path.join(os.tmpdir(), `pr93-r2-${faultTarget}-`));
  const sandbox = path.join(tempRoot, "repo");
  const persistRoot = path.join(tempRoot, "persist");
  const binDir = path.join(tempRoot, "bin");
  const dockerState = path.join(tempRoot, "docker-state");
  const dockerLog = path.join(tempRoot, "docker.log");
  const realMv = spawnSync("command", ["-v", "mv"], { shell: true, encoding: "utf8" }).stdout.trim() || "/bin/mv";
  fs.mkdirSync(sandbox, { recursive: true });
  fs.mkdirSync(binDir, { recursive: true });
  fs.mkdirSync(dockerState, { recursive: true });
  fs.copyFileSync(migrationPath, path.join(sandbox, "migrate-postagi-persist-mounts.sh"));
  fs.writeFileSync(path.join(sandbox, "docker-compose.postagi-4tenants.yml"), "services: {}\n");
  for (const tenant of [2, 3, 4]) {
    fs.writeFileSync(path.join(sandbox, `.env.tenant${tenant}`), "TOKEN=dummy\n", { mode: 0o600 });
  }

  installExecutable(path.join(binDir, "uname"), "#!/bin/sh\necho Darwin\n");
  installExecutable(path.join(binDir, "mv"), `#!/bin/sh
set -eu
printf '%s\\n' "$*" >> "$FAKE_MV_LOG"
case "\${1:-}:\${2:-}" in
  *mount-v2-new*:*/${faultTarget})
    if [ ! -e "$FAKE_MV_FAILED" ]; then
      : > "$FAKE_MV_FAILED"
      exit 74
    fi
    ;;
esac
exec ${realMv} "$@"
`);
  installExecutable(path.join(binDir, "docker"), `#!/bin/sh
set -eu
printf '%s\\n' "$*" >> "$FAKE_DOCKER_LOG"
state="$FAKE_DOCKER_STATE"
mkdir -p "$state"
case "$1" in
  inspect)
    format=""; target=""
    if [ "\${2:-}" = "--format" ]; then format="$3"; target="$4"; else target="\${2:-}"; fi
    case "$format" in
      *State.Running*)
        case "$target" in
          openclaw-mount-holder-*) [ -f "$state/$target.released" ] && echo false || echo true ;;
          *) [ -f "$state/$target.stopped" ] && echo false || echo true ;;
        esac ;;
      *State.Paused*) echo true ;;
      *State.ExitCode*) echo 0 ;;
      *State.Pid*) echo 4242 ;;
      *) [ -n "$format" ] && echo abcdef0123456789 || exit 0 ;;
    esac ;;
  exec)
    [ "\${3:-}" != "stat" ] || echo 2049:12345 ;;
  cp)
    mkdir -p "$3"
    printf 'same-final-state\\n' > "$3/state.json" ;;
  image|pull|pause|unpause|logs) exit 0 ;;
  stop)
    touch "$state/$4.stopped" ;;
  run)
    shift; name=""; control=""
    while [ "$#" -gt 0 ]; do
      case "$1" in
        --name) name="$2"; shift 2 ;;
        -v) control="\${2%:/control}"; shift 2 ;;
        *) shift ;;
      esac
    done
    mkdir -p "$control"
    printf ready > "$control/ready"
    printf '%s\\n' "$control" > "$state/$name.control"
    echo fake-holder ;;
  kill)
    signal="$3"; holder="$4"; control="$(cat "$state/$holder.control")"
    case "$signal" in
      USR1)
        fixture="$(mktemp -d "$state/archive.XXXXXX")"
        mkdir -p "$fixture/config" "$fixture/data"
        printf 'same-final-state\\n' > "$fixture/config/state.json"
        printf 'same-final-state\\n' > "$fixture/data/state.json"
        tar -cf "$control/config.tar" -C "$fixture/config" .
        tar -cf "$control/data.tar" -C "$fixture/data" .
        printf ready > "$control/archive-ready"
        ;;
      USR2) touch "$state/$holder.released" ;;
    esac ;;
  wait) exit 0 ;;
  rm) touch "$state/$3.removed" ;;
  compose) exit 0 ;;
  *) exit 1 ;;
esac
`);

  return { tempRoot, sandbox, persistRoot, binDir, dockerState, dockerLog };
}

function runMigration(run: ReturnType<typeof createFaultSandbox>) {
  return spawnSync("bash", ["migrate-postagi-persist-mounts.sh"], {
    cwd: run.sandbox,
    env: {
      ...process.env,
      PATH: `${run.binDir}:${process.env.PATH}`,
      OPENCLAW_PERSIST_ROOT: run.persistRoot,
      DOCKER_GID: "999",
      FAKE_DOCKER_STATE: run.dockerState,
      FAKE_DOCKER_LOG: run.dockerLog,
      FAKE_MV_LOG: path.join(run.tempRoot, "mv.log"),
      FAKE_MV_FAILED: path.join(run.tempRoot, "mv-failed"),
    },
    encoding: "utf8",
  });
}

describe("PR93 second-review restart safety", () => {
  it("PR93-R2-B1: holder archives first, stays alive for validation, then releases", () => {
    expect(migration).toContain("archive-ready");
    expect(migration).toContain("docker kill --signal USR2");
    expect(migration).toContain("검증되지 않은 holder를 보존합니다");
    expect(holderVerifier).toContain("PASS: 손상 archive 뒤 holder 생존과 재시도");
  });

  it.each(targets)("PR93-R2-M1: %s rename 중단 뒤 일반 재실행이 같은 최종 상태로 수렴", (faultTarget) => {
    expect(migration).toContain("write_journal targets-staged");
    const run = createFaultSandbox(faultTarget);
    try {
      const interrupted = runMigration(run);
      expect(interrupted.status, `${interrupted.stdout}\n${interrupted.stderr}`).toBe(74);
      const journal = path.join(run.persistRoot, ".mount-v2-pending");
      expect(fs.readFileSync(journal, "utf8")).toContain("phase=targets-staged");
      const resumed = runMigration(run);
      expect(resumed.status, `${resumed.stdout}\n${resumed.stderr}`).toBe(0);
      expect(resumed.stdout).toContain("이전 재개 완료");
      expect(fs.existsSync(path.join(run.persistRoot, ".mount-v2-ready"))).toBe(true);
      expect(fs.existsSync(journal)).toBe(false);
      for (const target of targets) {
        expect(fs.readFileSync(path.join(run.persistRoot, target, "state.json"), "utf8")).toBe("same-final-state\n");
      }
    } finally {
      fs.rmSync(run.tempRoot, { recursive: true, force: true });
    }
  });

  it("PR93-R2-M2: runbook names the resumable phases and never-restart boundary", () => {
    for (const phase of ["holders-ready", "archives-ready", "targets-staged", "pending-health"]) {
      expect(runbook).toContain(phase);
    }
    expect(runbook).toContain("원본 컨테이너를 절대 재시작하지");
    expect(runbook).toContain("검증되지 않은 holder");
  });

  it("PR93-R2-N1: CI runs the bounded real-Docker verifier and Docker absence fails", () => {
    expect(ci).toContain("timeout 180 bash scripts/verify-openclaw-mount-holder.sh");
    expect(holderVerifier).not.toContain("SKIP: docker");
    expect(holderVerifier).toContain("FAIL: docker CLI 없음");
    expect(holderVerifier).toContain("FAIL: docker daemon 접근 불가");
  });
});
