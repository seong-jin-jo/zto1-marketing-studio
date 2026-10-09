import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const repositoryRoot = resolve(__dirname, "../../..");
const workflow = readFileSync(
  resolve(repositoryRoot, ".github/workflows/diagnose-generator.yml"),
  "utf8",
);

describe("Higgsfield 운영 읽기 전용 진단 workflow 계약", () => {
  it("HIGGSFIELD-DIAG-01 정상: DNS와 token 없는 HTTPS 연결을 시간과 상태코드로 분리한다", () => {
    expect(workflow).toContain("fnf-api-gw.higgsfield.ai");
    expect(workflow).toContain("getent ahosts");
    expect(workflow).toContain("time_namelookup");
    expect(workflow).toContain("time_connect");
    expect(workflow).toContain("time_appconnect");
    expect(workflow).toContain("http_code");
    expect(workflow).toContain("--connect-timeout 10");
    expect(workflow).toContain("--max-time 20");
    expect(workflow).toContain("-o /dev/null");
    expect(workflow).toContain("dns_exit=");
    expect(workflow).toContain("https_exit=");
  });

  it("HIGGSFIELD-DIAG-02 정상: proxy 존재, CLI 버전, token 만료시각만 출력한다", () => {
    for (const name of ["HTTP_PROXY", "HTTPS_PROXY", "NO_PROXY", "http_proxy", "https_proxy", "no_proxy"]) {
      expect(workflow).toContain(name);
    }
    expect(workflow).toContain("[SET:value-masked]");
    expect(workflow).toContain("higgsfield --version");
    expect(workflow).toContain("account_status_exit=");
    expect(workflow).toContain("expires_at");
    expect(workflow).toContain("expired=");
  });

  it("HIGGSFIELD-DIAG-03 정상: 최근 30분 이미지 503 분기 로그를 제한하고 마스킹한다", () => {
    expect(workflow).toContain('docker logs --since 30m');
    expect(workflow).toContain("hf_image_step");
    expect(workflow).toContain("GENERATOR_UNAUTHENTICATED");
    expect(workflow).toContain("GENERATOR_UNAVAILABLE");
    expect(workflow).toContain("[REDACTED]");
    expect(workflow).toContain("tail -200");
  });

  it("HIGGSFIELD-DIAG-04 거절: 생성, 자격증명 변경, raw secret 출력은 포함하지 않는다", () => {
    expect(workflow).not.toContain("higgsfield generate");
    expect(workflow).not.toContain("higgsfield auth login");
    expect(workflow).not.toContain("higgsfield auth token");
    expect(workflow).not.toMatch(/cat\s+[^\n]*credentials\.json/);
    expect(workflow).not.toMatch(/\b(printenv|env|set)\b/);
    expect(workflow).not.toMatch(/docker\s+(restart|rm|kill)/);
    expect(workflow).not.toContain("docker compose up");
    expect(workflow).not.toContain("HIGGSFIELD_CREDENTIALS_JSON");
    expect(workflow).not.toContain("Authorization:");
  });
});
