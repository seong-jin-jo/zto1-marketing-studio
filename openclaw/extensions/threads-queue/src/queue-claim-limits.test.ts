import { describe, expect, it } from "vitest";
import {
  DEFAULT_LEASE_MS,
  MAX_CLAIM_BATCH,
  MAX_CLAIM_LEASE_MS,
  MIN_CLAIM_LEASE_MS,
  normalizeClaimRequest,
} from "./queue-claim.js";

describe("CODE-REVIEW-20260915-11 발행 claim 자원 상한", () => {
  it("CODE-REVIEW-20260915-11 정상: 생략한 값과 경계값을 유한한 정수로 정규화한다", () => {
    expect(normalizeClaimRequest({})).toEqual({ limit: 1, leaseMs: DEFAULT_LEASE_MS });
    expect(normalizeClaimRequest({ limit: MAX_CLAIM_BATCH, leaseMs: MIN_CLAIM_LEASE_MS })).toEqual({
      limit: MAX_CLAIM_BATCH,
      leaseMs: MIN_CLAIM_LEASE_MS,
    });
  });

  it("CODE-REVIEW-20260915-11 거절: 무한·소수·초대형 batch와 lease를 받지 않는다", () => {
    expect(() => normalizeClaimRequest({ limit: Number.MAX_SAFE_INTEGER })).toThrow("limit");
    expect(() => normalizeClaimRequest({ limit: 1.5 })).toThrow("limit");
    expect(() => normalizeClaimRequest({ leaseMs: Infinity })).toThrow("leaseMs");
    expect(() => normalizeClaimRequest({ leaseMs: MAX_CLAIM_LEASE_MS + 1 })).toThrow("leaseMs");
  });
});
