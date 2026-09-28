import fs from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

const composePath = path.resolve(process.cwd(), "../docker-compose.postagi-4tenants.yml");
const compose = fs.readFileSync(composePath, "utf8");
const deployWorkflowPath = path.resolve(process.cwd(), "../.github/workflows/deploy-marketing.yml");
const deployWorkflow = fs.readFileSync(deployWorkflowPath, "utf8");

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
    }
  });

  it("GATEWAY-PERSIST-02: legacy tenant1의 opt-in 상대 마운트는 바꾸지 않는다", () => {
    const legacy = compose.split("  openclaw-gateway-tenant1:")[1]?.split("\n  # ─")[0] ?? "";

    expect(legacy).toContain('profiles: ["legacy-tenant1"]');
    expect(legacy).toContain("- ./config-tenant1:/home/node/.openclaw");
    expect(legacy).toContain("- ./data-tenant1:/home/node/data");
  });

  it("GATEWAY-PERSIST-03: 배포는 영속 디렉터리를 준비하고 config/data를 체크아웃으로 복사하지 않는다", () => {
    expect(deployWorkflow).toContain('install -d -m 0755 "$HOME/openclaw-persist/config-tenant${tenant}"');
    expect(deployWorkflow).toContain('install -d -m 0755 "$HOME/openclaw-persist/data-tenant${tenant}"');
    expect(deployWorkflow).not.toContain('cp -a "$d" ./');
    expect(deployWorkflow).toContain('cp -a "$f" ./');
  });
});
