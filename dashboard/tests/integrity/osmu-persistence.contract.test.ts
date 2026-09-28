import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { spawnSync } from "node:child_process";
import { describe, expect, it } from "vitest";

const repositoryRoot = path.resolve(process.cwd(), "..");
const composePath = path.join(repositoryRoot, "docker-compose.postagi-4tenants.yml");
const compose = fs.readFileSync(composePath, "utf8");
const deployWorkflowPath = path.join(repositoryRoot, ".github/workflows/deploy-marketing.yml");
const deployWorkflow = fs.readFileSync(deployWorkflowPath, "utf8");
const bootstrapPath = path.join(repositoryRoot, "bootstrap-postagi-4tenants.sh");
const bootstrap = fs.readFileSync(bootstrapPath, "utf8");
const migrationPath = path.join(repositoryRoot, "migrate-postagi-persist-mounts.sh");
const migration = fs.readFileSync(migrationPath, "utf8");

function installFakeUname(binDir: string) {
  fs.mkdirSync(binDir, { recursive: true });
  const unamePath = path.join(binDir, "uname");
  fs.writeFileSync(unamePath, "#!/bin/sh\necho Darwin\n", { mode: 0o755 });
}

describe("OSMU production persistence contract", () => {
  it("keeps customer data outside the disposable Actions checkout", () => {
    const service = compose.split("  openclaw-dashboard-osmu:")[1] ?? "";

    expect(service).toContain("- osmu-data:/app/data");
    expect(service).toContain("- osmu-config:/app/config");
    expect(service).not.toContain("- ./data-osmu:/app/data");
    expect(service).not.toContain("- ./config-osmu:/app/config");
  });

  it("pins globally stable Docker volume names", () => {
    expect(compose).toContain("name: openclaw-osmu-data");
    expect(compose).toContain("name: openclaw-osmu-config");
  });

  it("GATEWAY-PERSIST-01: tenant2·3·4 gateway와 dashboard가 체크아웃 밖 같은 영속 경로를 공유한다", () => {
    for (const tenant of [2, 3, 4]) {
      const gateway = compose.split(`  openclaw-gateway-tenant${tenant}:`)[1]?.split(`\n  openclaw-dashboard-tenant${tenant}:`)[0] ?? "";
      const dashboard = compose.split(`  openclaw-dashboard-tenant${tenant}:`)[1]?.split("\n  # ─")[0] ?? "";
      const configSource = `source: \${OPENCLAW_PERSIST_ROOT:-\${HOME}/openclaw-persist}/config-tenant${tenant}`;
      const dataSource = `source: \${OPENCLAW_PERSIST_ROOT:-\${HOME}/openclaw-persist}/data-tenant${tenant}`;

      for (const service of [gateway, dashboard]) {
        expect(service).toContain(configSource);
        expect(service).toContain(dataSource);
        expect(service).toContain("create_host_path: false");
        expect(service).not.toContain(`./config-tenant${tenant}`);
        expect(service).not.toContain(`./data-tenant${tenant}`);
      }
      expect(dashboard).toContain('user: "1000:1000"');
      expect(dashboard).toContain('"${DOCKER_GID:?set DOCKER_GID from the host docker socket group}"');
      expect(gateway).toContain(`env_file: \${OPENCLAW_PERSIST_ROOT:-\${HOME}/openclaw-persist}/.env.tenant${tenant}`);
      expect(dashboard).toContain(`env_file: \${OPENCLAW_PERSIST_ROOT:-\${HOME}/openclaw-persist}/.env.tenant${tenant}`);
    }
  });

  it("GATEWAY-PERSIST-02: legacy tenant1의 opt-in 상대 마운트는 바꾸지 않는다", () => {
    const legacy = compose.split("  openclaw-gateway-tenant1:")[1]?.split("\n  # ─")[0] ?? "";

    expect(legacy).toContain('profiles: ["legacy-tenant1"]');
    expect(legacy).toContain("- ./config-tenant1:/home/node/.openclaw");
    expect(legacy).toContain("- ./data-tenant1:/home/node/data");
  });

  it("GATEWAY-PERSIST-03: 배포는 영속 디렉터리를 준비하고 config/data를 체크아웃으로 복사하지 않는다", () => {
    expect(deployWorkflow).toContain('persist_root="${OPENCLAW_PERSIST_ROOT:-$HOME/openclaw-persist}"');
    expect(deployWorkflow).toContain('[ "$(id -u)" != "1000" ]');
    expect(deployWorkflow).toContain("grep -qx 'schema=2'");
    expect(deployWorkflow).toContain("fresh-bootstrap|mount-namespace-holder");
    expect(deployWorkflow).toContain('chmod 0700 "$config_dir"');
    expect(deployWorkflow).toContain('chmod 0750 "$data_dir"');
    expect(deployWorkflow).toContain("DOCKER_GID=$docker_gid");
    expect(deployWorkflow).not.toContain('cp -a "$d" ./');
    expect(deployWorkflow).not.toMatch(/(?:cp|rsync|install|mkdir)[^\n]*(?:\.\/|\$GITHUB_WORKSPACE)[^\n]*(?:config|data)-tenant[234]/);
    expect(deployWorkflow).not.toContain('cp -a "$f" ./');
    expect(deployWorkflow).toContain("up -d --wait --wait-timeout 120");
  });

  it("GATEWAY-PERSIST-04: bootstrap이 영속 루트에 seed와 비공개 권한을 만든다", () => {
    const tempRoot = fs.mkdtempSync(path.join(os.tmpdir(), "osmu-persist-bootstrap-"));
    const sandbox = path.join(tempRoot, "repo");
    const persistRoot = path.join(tempRoot, "persist");
    const binDir = path.join(tempRoot, "bin");
    fs.mkdirSync(path.join(sandbox, "data"), { recursive: true });
    fs.cpSync(path.join(repositoryRoot, "data/templates"), path.join(sandbox, "data/templates"), { recursive: true });
    fs.copyFileSync(bootstrapPath, path.join(sandbox, "bootstrap-postagi-4tenants.sh"));
    installFakeUname(binDir);

    try {
      const result = spawnSync("bash", ["bootstrap-postagi-4tenants.sh"], {
        cwd: sandbox,
        env: {
          ...process.env,
          OPENCLAW_PERSIST_ROOT: persistRoot,
          PATH: `${binDir}:${process.env.PATH}`,
        },
        encoding: "utf8",
      });
      expect(result.status, `${result.stdout}\n${result.stderr}`).toBe(0);
      expect(fs.existsSync(path.join(persistRoot, ".mount-v2-ready"))).toBe(true);
      expect(fs.readFileSync(path.join(persistRoot, ".mount-v2-ready"), "utf8")).toContain("source=fresh-bootstrap");
      expect(bootstrap).not.toContain("OPENCLAW_RUNTIME_UID");

      for (const tenant of [2, 3, 4]) {
        const configDir = path.join(persistRoot, `config-tenant${tenant}`);
        const dataDir = path.join(persistRoot, `data-tenant${tenant}`);
        expect(fs.statSync(configDir).mode & 0o777).toBe(0o700);
        expect(fs.statSync(dataDir).mode & 0o777).toBe(0o750);
        expect(fs.existsSync(path.join(dataDir, "prompt-guide.txt"))).toBe(true);
        expect(fs.existsSync(path.join(dataDir, "search-keywords.txt"))).toBe(true);
        expect(fs.statSync(path.join(persistRoot, `.env.tenant${tenant}`)).mode & 0o777).toBe(0o600);
        expect(fs.existsSync(path.join(sandbox, `config-tenant${tenant}`))).toBe(false);
        expect(fs.existsSync(path.join(sandbox, `data-tenant${tenant}`))).toBe(false);
      }
    } finally {
      fs.rmSync(tempRoot, { recursive: true, force: true });
    }
  });

  it("GATEWAY-PERSIST-05: bootstrap은 기존 checkout 데이터가 있으면 이전 완료로 표시하지 않는다", () => {
    const tempRoot = fs.mkdtempSync(path.join(os.tmpdir(), "osmu-persist-migration-"));
    const sandbox = path.join(tempRoot, "repo");
    const persistRoot = path.join(tempRoot, "persist");
    const binDir = path.join(tempRoot, "bin");
    fs.mkdirSync(path.join(sandbox, "data/templates"), { recursive: true });
    fs.mkdirSync(path.join(sandbox, "config-tenant2"), { recursive: true });
    fs.copyFileSync(bootstrapPath, path.join(sandbox, "bootstrap-postagi-4tenants.sh"));
    installFakeUname(binDir);

    try {
      const result = spawnSync("bash", ["bootstrap-postagi-4tenants.sh"], {
        cwd: sandbox,
        env: {
          ...process.env,
          OPENCLAW_PERSIST_ROOT: persistRoot,
          PATH: `${binDir}:${process.env.PATH}`,
        },
        encoding: "utf8",
      });
      expect(result.status).not.toBe(0);
      expect(result.stderr).toContain("기존 config/data가 남아 있습니다");
      expect(fs.existsSync(path.join(persistRoot, ".mount-v2-ready"))).toBe(false);
    } finally {
      fs.rmSync(tempRoot, { recursive: true, force: true });
    }
  });

  it("GATEWAY-PERSIST-06: 이전 도구가 pause한 컨테이너를 스냅샷한 뒤에만 검증 표식을 만든다", () => {
    const tempRoot = fs.mkdtempSync(path.join(os.tmpdir(), "osmu-persist-migrate-"));
    const sandbox = path.join(tempRoot, "repo");
    const persistRoot = path.join(tempRoot, "persist");
    const binDir = path.join(tempRoot, "bin");
    fs.mkdirSync(sandbox, { recursive: true });
    installFakeUname(binDir);
    const dockerPath = path.join(binDir, "docker");
    const dockerLog = path.join(tempRoot, "docker.log");
    const dockerState = path.join(tempRoot, "docker-state");
    fs.writeFileSync(dockerPath, `#!/bin/sh
printf '%s\\n' "$*" >> "$FAKE_DOCKER_LOG"
state="$FAKE_DOCKER_STATE"
mkdir -p "$state"
case "$1" in
  inspect)
    format=""; target=""
    if [ "$2" = "--format" ]; then format="$3"; target="$4"; else target="$2"; fi
    case "$format" in
      *State.Running*) [ -f "$state/$target.stopped" ] && echo false || echo true ;;
      *State.Paused*) echo true ;;
      *State.ExitCode*) echo 0 ;;
      *State.Pid*) echo 4242 ;;
      *) if [ -n "$format" ]; then echo abcdef0123456789; else exit 0; fi ;;
    esac
    ;;
  exec) [ "$3" != "stat" ] || echo "2049:12345" ;;
  compose) exit 0 ;;
  image|pull|pause|unpause|stop|rm|logs) exit 0 ;;
  cp)
    [ "\${FAKE_DOCKER_FAIL_CP:-0}" != "1" ] || exit 42
    mkdir -p "$3"
    printf 'snapshot\n' > "$3/state.json"
    ;;
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
    printf 'snapshot\n' > "$fixture/config/state.json"
    printf 'snapshot\n' > "$fixture/data/state.json"
    tar -cf "$control/config.tar" -C "$fixture/config" .
    tar -cf "$control/data.tar" -C "$fixture/data" .
    touch "$state/$holder.stopped" ;;
  *) exit 1 ;;
esac
`, { mode: 0o755 });
    fs.copyFileSync(migrationPath, path.join(sandbox, "migrate-postagi-persist-mounts.sh"));
    for (const tenant of [2, 3, 4]) {
      fs.writeFileSync(path.join(sandbox, `.env.tenant${tenant}`), "TOKEN=dummy\n", { mode: 0o600 });
    }

    try {
      const result = spawnSync("bash", ["migrate-postagi-persist-mounts.sh"], {
        cwd: sandbox,
        env: { ...process.env, PATH: `${binDir}:${process.env.PATH}`, OPENCLAW_PERSIST_ROOT: persistRoot, DOCKER_GID: "999", FAKE_DOCKER_LOG: dockerLog, FAKE_DOCKER_STATE: dockerState },
        encoding: "utf8",
      });
      expect(result.status, `${result.stdout}\n${result.stderr}`).toBe(0);
      const marker = fs.readFileSync(path.join(persistRoot, ".mount-v2-ready"), "utf8");
      expect(marker).toContain("schema=2");
      expect(marker).toContain("source=mount-namespace-holder");
      expect(marker).toContain("status=ready");
      for (const tenant of [2, 3, 4]) {
        expect(marker).toContain(`tenant${tenant}_gateway_container=abcdef0123456789`);
        expect(marker).toContain(`tenant${tenant}_dashboard_container=abcdef0123456789`);
        expect(fs.existsSync(path.join(persistRoot, `config-tenant${tenant}/state.json`))).toBe(true);
        expect(fs.existsSync(path.join(persistRoot, `data-tenant${tenant}/state.json`))).toBe(true);
        expect(fs.statSync(path.join(persistRoot, `.env.tenant${tenant}`)).mode & 0o777).toBe(0o600);
      }
      expect(migration).toContain('docker pause "$container"');
      expect(migration).toContain('docker stop --timeout 30 "$container"');
      expect(migration).not.toContain('docker start "$container"');
      expect(migration).toContain("mount --bind");
      expect(fs.readFileSync(dockerLog, "utf8")).toContain("pause openclaw-gateway-tenant2");
      expect(fs.readFileSync(dockerLog, "utf8")).toContain("stop --timeout 30 openclaw-gateway-tenant2");
      expect(fs.readFileSync(dockerLog, "utf8")).not.toContain("unpause openclaw-gateway-tenant2");
      expect(fs.readFileSync(dockerLog, "utf8")).not.toContain("start openclaw-");
    } finally {
      fs.rmSync(tempRoot, { recursive: true, force: true });
    }
  });

  it("GATEWAY-PERSIST-07: 스냅샷 실패 시 pause한 컨테이너를 다시 실행 상태로 돌린다", () => {
    const tempRoot = fs.mkdtempSync(path.join(os.tmpdir(), "osmu-persist-rollback-"));
    const sandbox = path.join(tempRoot, "repo");
    const persistRoot = path.join(tempRoot, "persist");
    const binDir = path.join(tempRoot, "bin");
    const dockerLog = path.join(tempRoot, "docker.log");
    fs.mkdirSync(sandbox, { recursive: true });
    installFakeUname(binDir);
    fs.writeFileSync(path.join(binDir, "docker"), `#!/bin/sh
printf '%s\\n' "$*" >> "$FAKE_DOCKER_LOG"
case "$1" in
  inspect)
    case "$2" in
      --format)
        case "$3" in
          *State.Running*) echo "true" ;;
          *State.Paused*) echo "true" ;;
          *) echo "abcdef0123456789" ;;
        esac
        ;;
      *) exit 0 ;;
    esac
    ;;
  exec) echo "2049:12345" ;;
  compose) exit 0 ;;
  image|pull|pause|unpause|stop|start) exit 0 ;;
  cp) exit 42 ;;
  *) exit 1 ;;
esac
`, { mode: 0o755 });
    fs.copyFileSync(migrationPath, path.join(sandbox, "migrate-postagi-persist-mounts.sh"));
    for (const tenant of [2, 3, 4]) {
      fs.writeFileSync(path.join(sandbox, `.env.tenant${tenant}`), "TOKEN=dummy\n", { mode: 0o600 });
    }

    try {
      const result = spawnSync("bash", ["migrate-postagi-persist-mounts.sh"], {
        cwd: sandbox,
        env: { ...process.env, PATH: `${binDir}:${process.env.PATH}`, OPENCLAW_PERSIST_ROOT: persistRoot, DOCKER_GID: "999", FAKE_DOCKER_LOG: dockerLog },
        encoding: "utf8",
      });
      expect(result.status).toBe(42);
      expect(result.stderr).toContain("아직 실행 중인 원본 컨테이너의 pause를 해제합니다");
      const log = fs.readFileSync(dockerLog, "utf8");
      expect(log).toContain("pause openclaw-gateway-tenant2");
      expect(log).toContain("unpause openclaw-gateway-tenant2");
      expect(log).not.toContain("stop openclaw-gateway-tenant2");
      expect(log).not.toContain("start openclaw-gateway-tenant2");
      expect(log).toContain("openclaw-dashboard-tenant4");
      expect(fs.existsSync(path.join(persistRoot, ".mount-v2-ready"))).toBe(false);
    } finally {
      fs.rmSync(tempRoot, { recursive: true, force: true });
    }
  });
});
