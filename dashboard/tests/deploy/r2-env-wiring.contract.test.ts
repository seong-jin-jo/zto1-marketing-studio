import fs from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

const repositoryRoot = path.resolve(__dirname, "../../..");
const workflow = fs.readFileSync(path.join(repositoryRoot, ".github/workflows/deploy-marketing.yml"), "utf8");
const compose = fs.readFileSync(path.join(repositoryRoot, "docker-compose.postagi-4tenants.yml"), "utf8");

describe("R2 운영 환경변수 배선 계약", () => {
  it("R2-DEPLOY-01 정상 OSMU 런타임에 비공개 R2 설정 네 개만 전달한다", () => {
    for (const key of ["R2_ACCESS_KEY_ID", "R2_SECRET_ACCESS_KEY", "R2_BUCKET", "R2_ENDPOINT"]) {
      expect(workflow).toContain(`${key}=\${{ secrets.${key} }}`);
    }
    expect(compose).toMatch(/openclaw-dashboard-osmu:[\s\S]*?env_file: \.env\.osmu/);
  });

  it("R2-DEPLOY-02 거절 공개 R2 URL은 운영 환경에 배선하지 않는다", () => {
    expect(workflow).not.toMatch(/^\s*R2_PUBLIC_URL=/m);
  });
});
