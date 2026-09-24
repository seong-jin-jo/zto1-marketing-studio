import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const repositoryRoot = resolve(__dirname, "../../..");
const workflow = readFileSync(
  resolve(repositoryRoot, ".github/workflows/deploy-marketing.yml"),
  "utf8",
);
const probe = readFileSync(
  resolve(repositoryRoot, "scripts/probe-generator-session.sh"),
  "utf8",
);

describe("deploy-marketing.yml 생성기 API 생존 계약", () => {
  it("GENERATOR-LIVENESS-01 정상: 비용 없는 account status API로 배포 전후 세션 생존을 확인한다", () => {
    expect(probe).toContain("higgsfield account status");
    expect(workflow.match(/scripts\/probe-generator-session\.sh/g)?.length).toBeGreaterThanOrEqual(2);
    expect(workflow).not.toContain("higgsfield generate create");
    expect(probe).not.toContain("higgsfield generate");
  });

  it("GENERATOR-LIVENESS-02 거절: 저장 토큰을 출력하는 auth token만으로 생존을 판정할 수 없다", () => {
    expect(workflow).not.toContain("higgsfield auth token");
    expect(probe).not.toContain("higgsfield auth token");
  });

  it("GENERATOR-LIVENESS-03 경계: 탐침 출력은 토큰과 이메일을 가리고 실제 종료 코드를 보존한다", () => {
    expect(probe).toMatch(/\(ya29\|eyJ\)/);
    expect(probe).toContain("@[A-Za-z0-9.");
    expect(probe).toContain("[이메일 가림]");
    expect(probe).toContain("생성기 API 생존 확인 종료 코드");
    expect(probe).toContain('exit "$probe_status"');
  });

  it("GENERATOR-LIVENESS-04 거절: 배포 뒤 API 탐침 실패는 단계 실패로 보이되 글자 카드 배포는 계속한다", () => {
    const finalProbeStart = workflow.indexOf("생성기 API 생존 최종 확인 (배포 뒤)");
    const finalProbeEnd = workflow.indexOf("OSMU 스모크 게이트", finalProbeStart);
    const finalProbeStep = workflow.slice(finalProbeStart, finalProbeEnd);

    expect(finalProbeStart).toBeGreaterThan(-1);
    expect(finalProbeStep).toContain("continue-on-error: true");
    expect(finalProbeStep).toContain("::error::");
    expect(finalProbeStep).toMatch(/exit 1/);
    expect(finalProbeStep).toContain("글자 카드는 영향 없음");
  });
});
