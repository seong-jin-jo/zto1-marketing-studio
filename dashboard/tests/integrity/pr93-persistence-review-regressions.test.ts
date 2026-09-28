import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { spawnSync } from "node:child_process";
import { describe, expect, it } from "vitest";

const repositoryRoot = path.resolve(process.cwd(), "..");
const workflow = fs.readFileSync(path.join(repositoryRoot, ".github/workflows/deploy-marketing.yml"), "utf8");
const bootstrapPath = path.join(repositoryRoot, "bootstrap-postagi-4tenants.sh");
const bootstrap = fs.readFileSync(bootstrapPath, "utf8");
const migrationPath = path.join(repositoryRoot, "migrate-postagi-persist-mounts.sh");
const migration = fs.readFileSync(migrationPath, "utf8");

function installFakeUname(binDir: string) {
  fs.mkdirSync(binDir, { recursive: true });
  fs.writeFileSync(path.join(binDir, "uname"), "#!/bin/sh\necho Darwin\n", { mode: 0o755 });
}

function installFakeDocker(binDir: string, divergent: boolean) {
  fs.writeFileSync(path.join(binDir, "docker"), `#!/bin/sh
printf '%s\\n' "$*" >> "$FAKE_DOCKER_LOG"
state="$FAKE_DOCKER_STATE"
mkdir -p "$state"
case "$1" in
  inspect)
    format=""; target=""
    if [ "$2" = "--format" ]; then format="$3"; target="$4"; else target="$2"; fi
    case "$format" in
      *State.Running*) [ -f "$state/$target.stopped" ] && echo false || echo true ;;
      *State.ExitCode*) echo 0 ;;
      *State.Pid*) echo 4242 ;;
      *) if [ -n "$format" ]; then echo abcdef0123456789; else exit 0; fi ;;
    esac ;;
  exec)
    if [ "$3" = "stat" ]; then
      ${divergent ? 'case "$2" in *dashboard*) echo 2049:222 ;; *) echo 2049:111 ;; esac' : "echo 2049:12345"}
    fi ;;
  cp)
    mkdir -p "$3"
    ${divergent ? 'case "$2" in *dashboard*) printf \'dashboard-only\\n\' > "$3/state.json" ;; *) printf \'gateway-only\\n\' > "$3/state.json" ;; esac' : "printf 'same-final-state\\n' > \"$3/state.json\""} ;;
  image) exit 0 ;;
  pull) exit 0 ;;
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
    holder="$4"
    control="$(cat "$state/$holder.control")"
    fixture="$(mktemp -d "$state/holder.XXXXXX")"
    mkdir -p "$fixture/config" "$fixture/data"
    printf 'same-final-state\\n' > "$fixture/config/state.json"
    printf 'same-final-state\\n' > "$fixture/data/state.json"
    tar -cf "$control/config.tar" -C "$fixture/config" .
    tar -cf "$control/data.tar" -C "$fixture/data" .
    touch "$state/$holder.stopped" ;;
  compose)
    case "$*" in
      *" up "*)
        count_file="$state/health-count"
        count=0; [ ! -f "$count_file" ] || count="$(cat "$count_file")"
        count=$((count + 1)); printf '%s\\n' "$count" > "$count_file"
        [ "$count" -gt "\${FAKE_HEALTH_FAILS:-0}" ] ;;
      *) exit 0 ;;
    esac ;;
  pause|unpause|stop|rm|logs) exit 0 ;;
  *) exit 1 ;;
esac
`, { mode: 0o755 });
}

function runBootstrap(setup?: (sandbox: string, persistRoot: string) => void) {
  const tempRoot = fs.mkdtempSync(path.join(os.tmpdir(), "pr93-bootstrap-"));
  const sandbox = path.join(tempRoot, "repo");
  const persistRoot = path.join(tempRoot, "persist");
  const binDir = path.join(tempRoot, "bin");
  fs.mkdirSync(path.join(sandbox, "data"), { recursive: true });
  fs.cpSync(path.join(repositoryRoot, "data/templates"), path.join(sandbox, "data/templates"), { recursive: true });
  fs.copyFileSync(bootstrapPath, path.join(sandbox, "bootstrap-postagi-4tenants.sh"));
  installFakeUname(binDir);
  setup?.(sandbox, persistRoot);
  const result = spawnSync("bash", ["bootstrap-postagi-4tenants.sh"], {
    cwd: sandbox,
    env: { ...process.env, OPENCLAW_PERSIST_ROOT: persistRoot, PATH: `${binDir}:${process.env.PATH}` },
    encoding: "utf8",
  });
  return { tempRoot, persistRoot, result };
}

function runDivergentMigration() {
  const tempRoot = fs.mkdtempSync(path.join(os.tmpdir(), "pr93-divergent-"));
  const sandbox = path.join(tempRoot, "repo");
  const persistRoot = path.join(tempRoot, "persist");
  const binDir = path.join(tempRoot, "bin");
  const dockerLog = path.join(tempRoot, "docker.log");
  const dockerState = path.join(tempRoot, "docker-state");
  fs.mkdirSync(sandbox, { recursive: true });
  installFakeUname(binDir);
  installFakeDocker(binDir, true);
  fs.copyFileSync(migrationPath, path.join(sandbox, "migrate-postagi-persist-mounts.sh"));
  fs.writeFileSync(path.join(sandbox, "docker-compose.postagi-4tenants.yml"), "services: {}\n");
  for (const tenant of [2, 3, 4]) {
    fs.writeFileSync(path.join(sandbox, `.env.tenant${tenant}`), "TOKEN=dummy\n", { mode: 0o600 });
  }
  const result = spawnSync("bash", ["migrate-postagi-persist-mounts.sh"], {
    cwd: sandbox,
    env: { ...process.env, PATH: `${binDir}:${process.env.PATH}`, OPENCLAW_PERSIST_ROOT: persistRoot, DOCKER_GID: "999", FAKE_DOCKER_LOG: dockerLog, FAKE_DOCKER_STATE: dockerState },
    encoding: "utf8",
  });
  return { tempRoot, persistRoot, dockerLog, result };
}

function runCutoverMigration(healthFailures: number) {
  const tempRoot = fs.mkdtempSync(path.join(os.tmpdir(), "pr93-cutover-failure-"));
  const sandbox = path.join(tempRoot, "repo");
  const persistRoot = path.join(tempRoot, "persist");
  const binDir = path.join(tempRoot, "bin");
  const dockerLog = path.join(tempRoot, "docker.log");
  const dockerState = path.join(tempRoot, "docker-state");
  fs.mkdirSync(sandbox, { recursive: true });
  installFakeUname(binDir);
  installFakeDocker(binDir, false);
  fs.copyFileSync(migrationPath, path.join(sandbox, "migrate-postagi-persist-mounts.sh"));
  fs.writeFileSync(path.join(sandbox, "docker-compose.postagi-4tenants.yml"), "services: {}\n");
  for (const tenant of [2, 3, 4]) {
    fs.writeFileSync(path.join(sandbox, `.env.tenant${tenant}`), "TOKEN=dummy\n", { mode: 0o600 });
  }
  const result = spawnSync("bash", ["migrate-postagi-persist-mounts.sh"], {
    cwd: sandbox,
    env: { ...process.env, PATH: `${binDir}:${process.env.PATH}`, OPENCLAW_PERSIST_ROOT: persistRoot, DOCKER_GID: "999", FAKE_DOCKER_LOG: dockerLog, FAKE_DOCKER_STATE: dockerState, FAKE_HEALTH_FAILS: String(healthFailures) },
    encoding: "utf8",
  });
  return { tempRoot, persistRoot, dockerLog, result };
}

describe("PR93 independent review regressions", () => {
  it("PR93-B1: legacy tenant1 config/data are restored after checkout cleanup", () => {
    expect(workflow).toContain('cp -a "$persist_root/config-tenant1" ./config-tenant1');
    expect(workflow).toContain('cp -a "$persist_root/data-tenant1" ./data-tenant1');
  });

  it("PR93-B2: divergent gateway/dashboard snapshots are preserved separately and fail closed", () => {
    expect(migration).toContain("recovery-mount-v1-");
    expect(migration).toContain('diff -qr "${tenant_root}/gateway" "${tenant_root}/dashboard"');
    expect(migration).toContain("gateway/dashboard ${phase} 스냅샷이 다릅니다");
    const run = runDivergentMigration();
    try {
      expect(run.result.status).not.toBe(0);
      expect(run.result.stderr).toContain("자동 병합하지 않습니다");
      const recovery = fs.readdirSync(run.persistRoot).find((entry) => entry.startsWith("recovery-mount-v1-"));
      expect(recovery).toBeTruthy();
      expect(fs.readFileSync(path.join(run.persistRoot, recovery!, "frozen/tenant2/gateway/config/state.json"), "utf8")).toBe("gateway-only\n");
      expect(fs.readFileSync(path.join(run.persistRoot, recovery!, "frozen/tenant2/dashboard/config/state.json"), "utf8")).toBe("dashboard-only\n");
      expect(fs.existsSync(path.join(run.persistRoot, ".mount-v2-ready"))).toBe(false);
    } finally {
      fs.rmSync(run.tempRoot, { recursive: true, force: true });
    }
  });

  it("PR93-B3: bootstrap tells operators to migrate while containers are live", () => {
    expect(bootstrap).toContain("컨테이너를 절대 멈추지 말고");
    expect(bootstrap).not.toContain("실행 중인 컨테이너를 멈추고");
  });

  it("PR93-M1: cutover uses a non-zero graceful stop without resuming writers first", () => {
    expect(migration).toContain('docker stop --timeout 30 "$container"');
    expect(migration).not.toContain('docker stop --timeout 0 "$container"');
    expect(migration).toContain("create_mount_holder");
    expect(migration).toContain("archive_holders");
    const cutover = migration.split("STOP_ATTEMPTED=1")[1] ?? "";
    expect(cutover.split("archive_holders")[0]).not.toContain('docker unpause "$container"');
    expect(cutover).not.toContain("docker cp");
    expect(migration).toContain("mount --bind");
  });

  it("PR93-M2: migration cutover brings existing images back on persistent mounts before success", () => {
    expect(migration).toContain("--no-build --force-recreate");
    expect(migration).toContain("--wait --wait-timeout 120");
    expect(migration).toContain("재시도 후에도 health 확인에 실패");
    expect(migration).not.toContain("컨테이너는 정지 상태입니다");
    const run = runCutoverMigration(1);
    try {
      expect(run.result.status, `${run.result.stdout}\n${run.result.stderr}`).toBe(0);
      expect(run.result.stderr).toContain("동일 조건으로 1회 재시도합니다");
      const log = fs.readFileSync(run.dockerLog, "utf8");
      expect(log.match(/compose .* up -d --no-build --force-recreate/g)?.length).toBe(2);
      expect(fs.existsSync(path.join(run.persistRoot, ".mount-v2-ready"))).toBe(true);
      expect(fs.existsSync(path.join(run.persistRoot, ".mount-v2-pending"))).toBe(false);
      expect(fs.readFileSync(path.join(run.persistRoot, "config-tenant2/state.json"), "utf8")).toBe("same-final-state\n");
      const recovery = fs.readdirSync(run.persistRoot).find((entry) => entry.startsWith("recovery-mount-v1-"));
      expect(recovery).toBeTruthy();
      expect(fs.readFileSync(path.join(run.persistRoot, recovery!, "final/tenant2/gateway/config/state.json"), "utf8")).toBe("same-final-state\n");
    } finally {
      fs.rmSync(run.tempRoot, { recursive: true, force: true });
    }

    const failedRecovery = runCutoverMigration(2);
    try {
      expect(failedRecovery.result.status).not.toBe(0);
      expect(failedRecovery.result.stderr).toContain("재시도 후에도 health 확인에 실패했습니다");
      expect(failedRecovery.result.stderr).toContain("복구 자료:");
      expect(fs.existsSync(path.join(failedRecovery.persistRoot, ".mount-v2-ready"))).toBe(false);
      expect(fs.existsSync(path.join(failedRecovery.persistRoot, ".mount-v2-pending"))).toBe(true);
      expect(fs.readFileSync(path.join(failedRecovery.persistRoot, ".mount-v2-pending"), "utf8")).toContain("status=pending-health");
    } finally {
      fs.rmSync(failedRecovery.tempRoot, { recursive: true, force: true });
    }
  });

  it("PR93-M3: OSMU-only deploy skips tenant persistence validation but still exports DOCKER_GID", () => {
    const gidStep = workflow.split("- name: Docker socket GID 확인")[1]?.split("- name:")[0] ?? "";
    const persistenceStep = workflow.split("- name: tenant2·3·4 영속 config/data 검증")[1]?.split("- name:")[0] ?? "";
    expect(gidStep).toContain('echo "DOCKER_GID=$docker_gid" >> "$GITHUB_ENV"');
    expect(persistenceStep).toContain("if: ${{ github.event.inputs.services == '' || contains(github.event.inputs.services, 'tenant2') || contains(github.event.inputs.services, 'tenant3') || contains(github.event.inputs.services, 'tenant4') }}");
  });

  it("PR93-M4: partial persistent state without a valid marker is rejected", () => {
    const run = runBootstrap((_sandbox, persistRoot) => {
      fs.mkdirSync(path.join(persistRoot, "config-tenant2"), { recursive: true });
      fs.writeFileSync(path.join(persistRoot, "config-tenant2/state.json"), "partial\n");
    });
    try {
      expect(run.result.status).not.toBe(0);
      expect(run.result.stderr).toContain("표식 없는 기존 영속 데이터");
      expect(fs.existsSync(path.join(run.persistRoot, ".mount-v2-ready"))).toBe(false);
    } finally {
      fs.rmSync(run.tempRoot, { recursive: true, force: true });
    }

    const resume = runBootstrap((_sandbox, persistRoot) => {
      fs.mkdirSync(persistRoot, { recursive: true });
      fs.writeFileSync(path.join(persistRoot, ".mount-v2-ready"), "schema=2\nsource=fresh-bootstrap\n");
      for (const tenant of [2, 3, 4]) {
        fs.mkdirSync(path.join(persistRoot, `config-tenant${tenant}`));
        fs.mkdirSync(path.join(persistRoot, `data-tenant${tenant}`));
        fs.writeFileSync(path.join(persistRoot, `.env.tenant${tenant}`), "TOKEN=preserved\n", { mode: 0o600 });
      }
    });
    try {
      expect(resume.result.status, `${resume.result.stdout}\n${resume.result.stderr}`).toBe(0);
      expect(resume.result.stdout).toContain("fresh-bootstrap 상태를 이어서 검증합니다");
      expect(fs.readFileSync(path.join(resume.persistRoot, ".env.tenant2"), "utf8")).toBe("TOKEN=preserved\n");
    } finally {
      fs.rmSync(resume.tempRoot, { recursive: true, force: true });
    }
  });
});
