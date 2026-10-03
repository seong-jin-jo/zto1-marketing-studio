import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { issueRecoveryProof, verifyRecoveryProof } from "@/lib/publish-recovery-proof";

const input = {
  tenantId: "11111111-1111-4111-8111-111111111111",
  publicationId: "33333333-3333-4333-8333-333333333333",
  draftId: "22222222-2222-4222-8222-222222222222",
  platform: "threads",
  accountId: "44444444-4444-4444-8444-444444444444",
  externalId: "provider-1",
  permalink: "https://example.com/post/1",
  occurredAt: "2026-08-31T23:59:00.000Z",
  stage: "publication_record" as const,
};

describe("REVIEW-20260918-11 서버 발급 복구 증표", () => {
  beforeEach(() => {
    process.env.OSMU_SECRET_KEY = "recovery-test-key";
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-09-01T00:00:00.000Z"));
  });
  afterEach(() => vi.useRealTimers());

  it("정상: 테넌트·발행·초안·계정·외부 결과와 실패 단계가 함께 서명된다", () => {
    expect(verifyRecoveryProof(issueRecoveryProof(input))).toMatchObject(input);
  });

  it("거절: 변조와 만료된 증표는 복구 권한이 아니다", () => {
    const proof = issueRecoveryProof(input);
    const [body, signature] = proof.split(".");
    expect(verifyRecoveryProof(`${body}A.${signature}`)).toBeNull();
    vi.setSystemTime(new Date("2026-09-02T00:00:01.000Z"));
    expect(verifyRecoveryProof(proof)).toBeNull();
  });
});
