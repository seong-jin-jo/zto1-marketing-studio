import fs from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

const root = path.resolve(process.cwd(), "..");
const compose = fs.readFileSync(path.join(root, "docker-compose.postagi-4tenants.yml"), "utf8");
const deploy = fs.readFileSync(path.join(root, ".github/workflows/deploy-marketing.yml"), "utf8");
const migration = fs.readFileSync(path.join(root, "migrate-postagi-persist-mounts.sh"), "utf8");
const bootstrap = fs.readFileSync(path.join(root, "bootstrap-postagi-4tenants.sh"), "utf8");

describe("tenant persistence deployment contract", () => {
  it.each([2, 3, 4])("GATEWAY-PERSIST-01: tenant%s uses checkout-external config/data for gateway and dashboard", (tenant) => {
    const prefix = "${OPENCLAW_PERSIST_ROOT:-${HOME}/openclaw-persist}";
    expect(compose.split(`source: ${prefix}/config-tenant${tenant}`).length - 1).toBe(2);
    expect(compose.split(`source: ${prefix}/data-tenant${tenant}`).length - 1).toBe(2);
    expect(compose).toContain(`env_file: ${prefix}/.env.tenant${tenant}`);
    expect(compose).not.toContain(`./config-tenant${tenant}:/`);
    expect(compose).not.toContain(`./data-tenant${tenant}:/`);
  });

  it("GATEWAY-PERSIST-02: legacy tenant1 and OSMU storage stay unchanged", () => {
    expect(compose).toContain("profiles: [\"legacy-tenant1\"]");
    expect(compose).toContain("- ./config-tenant1:/home/node/.openclaw");
    expect(compose).toContain("- ./data-tenant1:/home/node/data");
    expect(compose).toContain("name: openclaw-osmu-data");
    expect(compose).toContain("name: openclaw-osmu-config");
  });

  it("GATEWAY-PERSIST-03: deployment validates persistent paths without restoring them into checkout", () => {
    expect(deploy).toContain("tenant2·3·4 영속 config/data 검증");
    expect(deploy).not.toContain('for d in "$HOME"/openclaw-persist/config-*');
    expect(deploy).not.toContain(".mount-v2-ready");
    expect(deploy).toContain('cp -a "$persist_root/config-tenant1" ./config-tenant1');
    expect(deploy).toContain('cp -a "$persist_root/data-tenant1" ./data-tenant1');
  });

  it("GATEWAY-PERSIST-04: maintenance migration is bounded and contains no live handoff machinery", () => {
    expect(migration.trimEnd().split("\n").length).toBeLessThanOrEqual(50);
    expect(migration).toContain('stop -t 30 "${SERVICES[@]}"');
    expect(migration).toContain("backup-pre-cutover-");
    expect(migration).toContain('rsync -a --checksum --delete "$SOURCE_ROOT/$name/"');
    expect(migration).toContain("--wait --wait-timeout 60");
    for (const removed of ["mount holder", "mount-namespace", "snapshot", "resume-pending", ".mount-v2-"]) {
      expect(migration).not.toContain(removed);
    }
  });

  it("GATEWAY-PERSIST-05: fresh bootstrap writes directly to persist without readiness markers", () => {
    expect(bootstrap).toContain('PERSIST_ROOT="${OPENCLAW_PERSIST_ROOT:-${HOME}/openclaw-persist}"');
    expect(bootstrap).toContain('DATA_DIR="${PERSIST_ROOT}/data-${slug}"');
    expect(bootstrap).toContain('CONFIG_DIR="${PERSIST_ROOT}/config-${slug}"');
    expect(bootstrap).not.toContain(".mount-v2-ready");
  });
});
