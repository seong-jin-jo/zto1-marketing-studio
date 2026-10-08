import { readFileSync } from "node:fs";
import { execFileSync } from "node:child_process";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
import {
  REQUIRED_STUDIO_EXPORT_WORKER_ENV,
  requireStudioExportWorkerEnv,
} from "../../src/workers/studio-export-worker-env";

const root = resolve(__dirname, "../../..");
const dockerfile = readFileSync(resolve(root, "dashboard/Dockerfile"), "utf8");
const compose = readFileSync(resolve(root, "docker-compose.postagi-4tenants.yml"), "utf8");
const envExample = readFileSync(resolve(root, ".env.example"), "utf8");
const deploy = readFileSync(resolve(root, ".github/workflows/deploy-marketing.yml"), "utf8");
const worker = readFileSync(resolve(root, "dashboard/src/workers/studio-export-worker.ts"), "utf8");
const studioPage = readFileSync(resolve(root, "dashboard/src/app/studio/page.tsx"), "utf8");
const repository = readFileSync(resolve(root, "dashboard/src/lib/studio/export-repository.ts"), "utf8");
const packageJson = JSON.parse(readFileSync(resolve(root, "dashboard/package.json"), "utf8")) as {
  dependencies?: Record<string, string>;
  devDependencies?: Record<string, string>;
};

describe("S3 별도 export worker 실행·배포 계약", () => {
  it("S3-DEPLOY-01 정상: 같은 image의 별도 worker entry와 healthcheck를 선언한다", () => {
    expect(dockerfile).toContain("COPY --from=builder /app/src ./src");
    expect(compose).toContain("openclaw-studio-export-worker:");
    expect(compose).toContain('["node_modules/.bin/tsx", "src/workers/studio-export-worker.ts"]');
    expect(compose).toContain("EXPORT_WORKER_HEALTH_PORT: \"34620\"");
    expect(compose).toContain("fetch('http://127.0.0.1:34620')");
    expect(packageJson.dependencies).toHaveProperty("tsx");
    expect(packageJson.dependencies).toHaveProperty("@aws-sdk/client-s3");
    expect(packageJson.devDependencies).not.toHaveProperty("@aws-sdk/client-s3");
  });

  it("S3-DEPLOY-02 경계: worker는 scale을 막는 container_name과 host port 공유가 없다", () => {
    const workerService = compose.slice(compose.indexOf("  openclaw-studio-export-worker:"), compose.indexOf("\nvolumes:"));
    expect(workerService).not.toContain("container_name:");
    expect(workerService).not.toContain("network_mode: host");
    expect(workerService).not.toContain("ports:");
  });

  it("S6-MAJOR1-01 배포: dashboard와 worker가 같은 영상 데이터 볼륨과 경로를 사용한다", () => {
    const workerService = compose.slice(compose.indexOf("  openclaw-studio-export-worker:"), compose.indexOf("\nvolumes:"));
    expect(workerService).toContain("- osmu-data:/app/data");
    expect(workerService).toContain("DATA_DIR: /app/data");
    expect(studioPage).toContain("artifact_filename?: string");
    expect(studioPage).toContain("filename: resultFilename");
    expect(studioPage).toContain("videoResultFilename(vid)");
  });

  it("S3-DEPLOY-03 거절: concurrency=1과 R2 필수 설정을 fail-closed로 검사한다", () => {
    expect(worker).toContain('concurrency !== 1');
    for (const key of ["R2_ACCESS_KEY_ID", "R2_SECRET_ACCESS_KEY", "R2_BUCKET", "R2_ENDPOINT"]) {
      expect(REQUIRED_STUDIO_EXPORT_WORKER_ENV).toContain(key);
    }
    expect(envExample).toContain("EXPORT_RENDER_CONCURRENCY=1");
    expect(deploy).toContain("EXPORT_RENDER_CONCURRENCY=1");
  });

  it("EXPORT-WORKER-ENV-01 정상: 작업자 필수 환경변수를 compose가 빈 값 거절 계약으로 모두 전달한다", () => {
    const workerService = compose.slice(compose.indexOf("  openclaw-studio-export-worker:"), compose.indexOf("\nvolumes:"));
    const environment = workerService.slice(workerService.indexOf("    environment:"), workerService.indexOf("    command:"));
    const composeKeys = [...environment.matchAll(/^      ([A-Z][A-Z0-9_]+):/gm)].map((match) => match[1]);

    expect(workerService).toContain("env_file: .env.osmu");
    expect(REQUIRED_STUDIO_EXPORT_WORKER_ENV.filter((key) => !composeKeys.includes(key))).toEqual([]);
    for (const key of REQUIRED_STUDIO_EXPORT_WORKER_ENV) {
      expect(environment).toContain(`${key}: \${${key}:?`);
      expect(deploy).toMatch(new RegExp(`^\\s*${key}=`, "m"));
    }
  });

  it("EXPORT-WORKER-ENV-02 거절: 작업자 필수 환경변수 하나라도 없거나 공백이면 기동 전에 거절한다", () => {
    const complete = Object.fromEntries(REQUIRED_STUDIO_EXPORT_WORKER_ENV.map((key) => [key, `fixture-${key}`]));
    expect(requireStudioExportWorkerEnv(complete)).toEqual(complete);

    for (const key of REQUIRED_STUDIO_EXPORT_WORKER_ENV) {
      expect(() => requireStudioExportWorkerEnv({ ...complete, [key]: "  " })).toThrow(`${key} is required`);
    }
  });

  it("S3-DEPLOY-04 정상: session advisory lock, tenant round-robin, SKIP LOCKED를 사용한다", () => {
    expect(worker).toContain("max_lifetime: null");
    expect(worker).toContain("advisoryLockPool.reserve()");
    expect(worker).toContain("pg_try_advisory_lock(hashtextextended('studio-export-render-worker-v1',0))");
    expect(worker).toContain("tenantCursor");
    expect(repository).toContain("FOR UPDATE SKIP LOCKED LIMIT 1");
    expect(repository).toContain("lease_token=${item.lease_token}");
  });

  it("S3-PR122-M5 배포: dashboard 선택 배포는 같은 image의 export worker도 재기동한다", () => {
    expect(deploy).toContain('SERVICES="${{ github.event.inputs.services }}"');
    expect(deploy).toContain('SERVICES="$SERVICES openclaw-studio-export-worker"');
    expect(deploy).toContain("up -d $SERVICES");
    expect(deploy).not.toContain("up -d ${{ github.event.inputs.services }}");
  });

  it("EXPORT-WORKER-HEALTH-01 배포: 작업자 healthy를 기다리고 실패 시 마스킹한 최근 로그와 실패를 남긴다", () => {
    expect(worker).toContain('role === "active" || role === "standby"');
    expect(worker).toContain("response.writeHead(ready ? 200 : 503");
    expect(deploy).toContain("내보내기 작업자 healthy 확인 (배포 뒤)");
    expect(deploy).toContain("compose=(docker compose --env-file .env.osmu -f docker-compose.postagi-4tenants.yml)");
    expect(deploy).toContain('"${compose[@]}" ps -q --all openclaw-studio-export-worker');
    expect(deploy).toContain('"$status" != "healthy"');
    expect(deploy).toContain('docker logs --tail 200 "$worker"');
    expect(deploy).toContain("safe_masked_output");
    expect(deploy).toContain("[REDACTED]");
    expect(deploy).toContain("exit 1");
  });

  it("EXPORT-WORKER-HEALTH-02 거절: 배포 로그 마스커가 연결 문자열과 자격증명 원문을 제거한다", () => {
    const step = deploy.slice(deploy.indexOf("      - name: 내보내기 작업자 healthy 확인 (배포 뒤)"));
    const maskProgramMatch = step.match(/mask_output\(\) \{\s+perl -pe '\n([\s\S]*?)\n\s+'\n\s+\}/);
    expect(maskProgramMatch).not.toBeNull();
    const maskProgram = maskProgramMatch![1].replace(/^\s{14}/gm, "");
    const syntheticAccessKey = ["AK", "IA", "ABCDEFGHIJKLMNOP"].join("");
    const sensitive = [
      "postgres://worker:password@db.example/exports",
      "Authorization: Bearer worker-token-value",
      syntheticAccessKey,
      "https://r2.example/object?X-Amz-Signature=signature-value",
    ];
    const masked = execFileSync("perl", ["-pe", maskProgram], { input: sensitive.join("\n"), encoding: "utf8" });

    for (const value of sensitive) expect(masked).not.toContain(value);
    for (const secret of ["password", "worker-token-value", syntheticAccessKey, "signature-value"]) {
      expect(masked).not.toContain(secret);
    }
    expect(masked).toContain("[REDACTED]");
  });
});
