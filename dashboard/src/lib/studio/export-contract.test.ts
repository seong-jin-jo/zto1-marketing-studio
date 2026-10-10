import { afterEach, describe, expect, it, vi } from "vitest";
import { exportMemberId, localDryRunExportMemberId } from "./export-contract";

const TENANT_ID = "cd1d0a40-540d-4524-9b49-bf2445d82182";

function configureLocalDryRun() {
  vi.stubEnv("NODE_ENV", "test");
  vi.stubEnv("PUBLISH_DRY_RUN", "1");
  vi.stubEnv("STUDIO_IDENTITY_MODE", "development");
  vi.stubEnv("STUDIO_DEV_BEARER_TOKEN", "studio-development-token");
  vi.stubEnv("STUDIO_DEV_MEMBER_ID", "local-development-member");
  vi.stubEnv("STUDIO_DEV_WORKSPACE_IDS", TENANT_ID);
}

afterEach(() => {
  vi.unstubAllEnvs();
});

describe("localDryRunExportMemberId", () => {
  it("S4-LOCAL-02 허용된 로컬 드라이런 작업공간에는 개발 작성자를 반환한다", () => {
    configureLocalDryRun();
    expect(localDryRunExportMemberId(TENANT_ID)).toBe("local-development-member");
  });

  it("S4-LOCAL-03 운영 환경에서는 드라이런 설정이 있어도 개발 작성자를 거절한다", () => {
    configureLocalDryRun();
    vi.stubEnv("NODE_ENV", "production");
    expect(localDryRunExportMemberId(TENANT_ID)).toBeNull();
  });

  it("S4-LOCAL-04 작업공간 토큰은 허용된 로컬 드라이런에서만 작성자 ID로 보완한다", async () => {
    configureLocalDryRun();
    const request = new Request("http://localhost/api/studio/drafts/draft/exports", {
      headers: { Authorization: "Bearer osmu_local_workspace_token" },
    });
    await expect(exportMemberId(request, TENANT_ID)).resolves.toBe("local-development-member");
    await expect(exportMemberId(request, "00000000-0000-4000-8000-000000000000")).rejects.toMatchObject({
      code: "TOKEN_INVALID",
    });
  });
});
