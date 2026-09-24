import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const workflow = readFileSync(
  resolve(__dirname, "../../../.github/workflows/deploy-marketing.yml"),
  "utf8",
);
const redactExpression = "s/(ya29|eyJ)[A-Za-z0-9_.\\-]+/[가림]/g";

describe("생성기 인증 관측 계약", () => {
  it("GEN-AUTH-OBS-01 정상 경로와 실패 경로 모두 종료 코드와 가린 출력을 남긴다", () => {
    expect(workflow.match(/probe_generator\(\) \{/g)).toHaveLength(2);
    expect(workflow.match(/higgsfield auth token 2>&1/g)).toHaveLength(2);
    expect(workflow.match(/higgsfield auth token \(exit \$probe_status, 비밀값 가림\)/g)).toHaveLength(2);
    expect(workflow.match(/return "\$probe_status"/g)).toHaveLength(2);
    expect(workflow).not.toMatch(/higgsfield auth token >\/dev\/null 2>&1/);
  });

  it("GEN-AUTH-OBS-02 거절 경로에서 토큰은 가리고 실제 오류 문구는 보존한다", () => {
    const input = "eyJsecret.payload.signature\nError: refresh token is invalid or expired\n";
    const output = execFileSync("sed", ["-E", redactExpression], {
      input,
      encoding: "utf8",
    });

    expect(output).toContain("[가림]");
    expect(output).not.toContain("eyJsecret.payload.signature");
    expect(output).toContain("Error: refresh token is invalid or expired");
    expect(workflow.match(/s\/\(ya29\|eyJ\)\[A-Za-z0-9_.\\-\]\+\/\[가림\]\/g/g)).toHaveLength(2);
  });
});
