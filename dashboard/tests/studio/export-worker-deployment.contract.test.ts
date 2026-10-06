import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const root = resolve(__dirname, "../../..");
const dockerfile = readFileSync(resolve(root, "dashboard/Dockerfile"), "utf8");
const compose = readFileSync(resolve(root, "docker-compose.postagi-4tenants.yml"), "utf8");
const envExample = readFileSync(resolve(root, ".env.example"), "utf8");
const deploy = readFileSync(resolve(root, ".github/workflows/deploy-marketing.yml"), "utf8");
const worker = readFileSync(resolve(root, "dashboard/src/workers/studio-export-worker.ts"), "utf8");
const repository = readFileSync(resolve(root, "dashboard/src/lib/studio/export-repository.ts"), "utf8");

describe("S3 별도 export worker 실행·배포 계약", () => {
  it("S3-DEPLOY-01 정상: 같은 image의 별도 worker entry와 healthcheck를 선언한다", () => {
    expect(dockerfile).toContain("COPY --from=builder /app/src ./src");
    expect(compose).toContain("openclaw-studio-export-worker:");
    expect(compose).toContain('["node_modules/.bin/tsx", "src/workers/studio-export-worker.ts"]');
    expect(compose).toContain("EXPORT_WORKER_HEALTH_PORT: \"34620\"");
    expect(compose).toContain("fetch('http://127.0.0.1:34620')");
  });

  it("S3-DEPLOY-02 경계: worker는 scale을 막는 container_name과 host port 공유가 없다", () => {
    const workerService = compose.slice(compose.indexOf("  openclaw-studio-export-worker:"), compose.indexOf("\nvolumes:"));
    expect(workerService).not.toContain("container_name:");
    expect(workerService).not.toContain("network_mode: host");
    expect(workerService).not.toContain("ports:");
  });

  it("S3-DEPLOY-03 거절: concurrency=1과 R2 필수 설정을 fail-closed로 검사한다", () => {
    expect(worker).toContain('concurrency !== 1');
    for (const key of ["R2_ACCESS_KEY_ID", "R2_SECRET_ACCESS_KEY", "R2_BUCKET", "R2_ENDPOINT"]) {
      expect(worker).toContain(`"${key}"`);
    }
    expect(envExample).toContain("EXPORT_RENDER_CONCURRENCY=1");
    expect(deploy).toContain("EXPORT_RENDER_CONCURRENCY=1");
  });

  it("S3-DEPLOY-04 정상: session advisory lock, tenant round-robin, SKIP LOCKED를 사용한다", () => {
    expect(worker).toContain("pg_try_advisory_lock(hashtextextended('studio-export-render-worker-v1',0))");
    expect(worker).toContain("tenantCursor");
    expect(repository).toContain("FOR UPDATE SKIP LOCKED LIMIT 1");
    expect(repository).toContain("lease_token=${item.lease_token}");
  });
});
