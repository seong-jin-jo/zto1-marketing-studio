import { spawnSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

const root = path.resolve(__dirname, "../..");

describe("2026-09-18 운영 검증 회귀", () => {
  it("REVIEW-24H-20260918-05 거절: 브라우저 하나가 꺼져 있으면 status가 비정상 종료하고 그림문자를 출력하지 않는다", () => {
    const script = path.join(root, "scripts/osmu-browsers.sh");
    const result = spawnSync("bash", [script, "status"], {
      env: { ...process.env, OSMU_MEMBER_CDP: "65534" },
      encoding: "utf8",
    });
    const output = `${result.stdout}${result.stderr}`;

    expect(result.status).not.toBe(0);
    expect(output).toContain("오류 member");
    expect(output).not.toMatch(/[✓✗⛔]/u);
    expect(output).not.toContain("unbound variable");
  });

  it("REVIEW-24H-20260918-05 경합: 네 방 검증기는 설정 전체 스냅샷을 복원하지 않고 자기 필드만 조건부 복구한다", () => {
    const source = fs.readFileSync(path.join(root, "scripts/verify-four-room-ui-e2e.mjs"), "utf8");
    expect(source).toContain("restoreOwnSettingsChange");
    expect(source).toContain("current.onboardingComplete !== false");
    expect(source).toContain("writeSettingsAtomically");
    expect(source).toContain("await lockfile.lock(settingsPath");
    expect(source).not.toContain("fs.writeFileSync(settingsPath, originalSettings)");
  });

  it("REVIEW-24H-20260918-04 정상: 성과실은 사용량 지연 상태를 낮은 숫자 대신 표시한다", () => {
    const dashboard = fs.readFileSync(path.join(root, "src/components/home/PerformanceDashboard.tsx"), "utf8");
    const room = fs.readFileSync(path.join(root, "src/components/home/PerformanceRoom.tsx"), "utf8");
    expect(dashboard).toContain("classifyUsageError(usageError)");
    expect(dashboard).toContain("usageDelayed={usageProblem.delayed}");
    expect(room).toContain("data-usage-delayed");
    expect(room).toContain("발행 사용량 반영이 지연되고 있습니다");
  });

  // 9d0b4302의 동등 회귀는 통합 기준 a403f533의 조상에 없었다.
  // 충돌 중 삭제된 것이 아니라 별도 분기 계약이 통합되지 않은 것이므로 여기서 보존한다.
  it("REVIEW-24H-20260918-E2E 정상: 성과 제안은 새 큐 201·기존 큐 200과 원본 제안 번호 일치를 검증한다", () => {
    const source = fs.readFileSync(path.join(root, "scripts/verify-basic-flow-e2e.mjs"), "utf8");
    expect(source).toContain("(en.status===200||en.status===201)");
    expect(source).toContain("Boolean(ed.post?.sourceContext?.suggestionId)");
    expect(source).toContain("ed.post.sourceContext.suggestionId===sd.suggestions[0].id");
  });
});
