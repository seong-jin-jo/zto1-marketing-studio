import { describe, expect, it } from "vitest";
import { evaluateSweepEvidenceStability } from "../../scripts/lib/api-sweep-contract.mjs";

// Regression: API-READ-INVENTORY-V16. The live sweep used the startup file
// list for both hashes, so a route added during the long run was invisible.
// Found by /qa on 2026-09-18.
// Report: docs/qa/osmu-api-read-sweep-v16-gpt-codex.md

const stableEvidence = {
  sourceHashBefore: "same-hash",
  sourceHashAfter: "same-hash",
  listenerPidsBefore: ["123"],
  listenerPidsAfter: ["123"],
  evidenceFilesBefore: ["src/app/api/a/route.ts", "scripts/verify-api-read-sweep.mjs"],
  evidenceFilesAfter: ["src/app/api/a/route.ts", "scripts/verify-api-read-sweep.mjs"],
  routeInventoryBefore: ["src/app/api/a/route.ts:GET"],
  routeInventoryAfter: ["src/app/api/a/route.ts:GET"],
};

describe("API-READ-INVENTORY-V16 실행 중 분모 변경 검출", () => {
  it("파일과 읽기 메서드 분모가 끝까지 같을 때만 증거를 인정한다", () => {
    expect(evaluateSweepEvidenceStability(stableEvidence)).toMatchObject({
      stable: true,
      evidenceFileInventoryMatches: true,
      routeInventoryMatches: true,
    });
  });

  it("실행 중 새 읽기 route가 추가되면 시작 요청이 모두 끝나도 증거를 거절한다", () => {
    expect(evaluateSweepEvidenceStability({
      ...stableEvidence,
      evidenceFilesAfter: [
        ...stableEvidence.evidenceFilesAfter,
        "src/app/api/new/route.ts",
      ],
      routeInventoryAfter: [
        ...stableEvidence.routeInventoryAfter,
        "src/app/api/new/route.ts:GET",
      ],
    })).toMatchObject({
      stable: false,
      evidenceFileInventoryMatches: false,
      routeInventoryMatches: false,
    });
  });

  it("실행 중 route 삭제와 listener 교체도 증거를 거절한다", () => {
    expect(evaluateSweepEvidenceStability({
      ...stableEvidence,
      listenerPidsAfter: ["456"],
      evidenceFilesAfter: ["scripts/verify-api-read-sweep.mjs"],
      routeInventoryAfter: [],
    })).toMatchObject({
      stable: false,
      listenerMatches: false,
      evidenceFileInventoryMatches: false,
      routeInventoryMatches: false,
    });
  });
});
