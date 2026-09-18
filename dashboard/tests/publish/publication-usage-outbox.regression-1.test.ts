import { beforeEach, describe, expect, it, vi } from "vitest";

const H = vi.hoisted(() => ({
  status: "pending" as "pending" | "recorded" | "missing",
  insertFailuresRemaining: 0,
  usageInserts: 0,
  insertedAt: "",
  remaining: 0,
}));

vi.mock("@/lib/db", () => ({
  withTenant: vi.fn(async (_tenantId: string, callback: (sql: unknown) => unknown) => {
    const sql = Object.assign(
      (strings: TemplateStringsArray, ...values: unknown[]) => {
        const query = strings.join(" ");
        if (query.includes("SELECT id::text, platform")) {
          return Promise.resolve(H.status === "pending" ? [{ id: "11111111-1111-4111-8111-111111111111", platform: "threads" }] : []);
        }
        if (query.includes("SELECT provider_meta")) {
          return Promise.resolve([{ usage_status: H.status === "missing" ? null : H.status,
            occurred_at: "2026-08-31T23:59:00.000Z", published_at: "2026-08-31T23:59:00.000Z" }]);
        }
        if (query.includes("COUNT(*)::int AS remaining")) return Promise.resolve([{ remaining: H.remaining }]);
        if (query.includes("INSERT INTO usage_events")) {
          if (H.insertFailuresRemaining > 0) {
            H.insertFailuresRemaining -= 1;
            return Promise.reject(new Error("usage ledger unavailable"));
          }
          H.usageInserts += 1;
          H.insertedAt = String(values.at(-1));
          return Promise.resolve([]);
        }
        if (query.includes("UPDATE published_posts") && query.includes("jsonb_set")) {
          H.status = "recorded";
          return Promise.resolve([]);
        }
        return Promise.resolve([]);
      },
      { json: (value: unknown) => value },
    );
    return callback(sql);
  }),
}));

import {
  publicationUsageOutbox,
  reconcilePendingPublicationEvents,
  recordPublicationEvent,
} from "@/lib/usage-events";

describe("발행 사용량 transactional outbox", () => {
  beforeEach(() => {
    H.status = "pending";
    H.insertFailuresRemaining = 0;
    H.usageInserts = 0;
    H.insertedAt = "";
    H.remaining = 0;
  });

  it("CODE-REVIEW-20260917-09 정상: pending 발행을 사용량 장부에 한 번 기록하고 recorded로 닫는다", async () => {
    expect(publicationUsageOutbox("threads", "2026-08-31T23:59:00.000Z"))
      .toEqual({ usageEvent: { status: "pending", platform: "threads", occurredAt: "2026-08-31T23:59:00.000Z" } });

    await expect(recordPublicationEvent(
      "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa",
      "11111111-1111-4111-8111-111111111111",
      "threads",
    )).resolves.toEqual({ recorded: true, alreadyRecorded: false });

    expect(H.usageInserts).toBe(1);
    expect(H.status).toBe("recorded");
    expect(H.insertedAt).toBe("2026-08-31T23:59:00.000Z");
  });

  it("CODE-REVIEW-20260917-10 경합: recorded outbox 재호출은 사용량을 중복 기록하지 않는다", async () => {
    await recordPublicationEvent("tenant", "11111111-1111-4111-8111-111111111111", "threads");
    const second = await recordPublicationEvent("tenant", "11111111-1111-4111-8111-111111111111", "threads");

    expect(second).toEqual({ recorded: false, alreadyRecorded: true });
    expect(H.usageInserts).toBe(1);
  });

  it("CODE-REVIEW-20260917-11 복구: 첫 INSERT 실패 뒤 durable pending을 relay가 다시 처리한다", async () => {
    H.insertFailuresRemaining = 1;
    await expect(recordPublicationEvent("tenant", "11111111-1111-4111-8111-111111111111", "threads"))
      .rejects.toThrow("usage ledger unavailable");
    expect(H.status).toBe("pending");
    expect(H.usageInserts).toBe(0);

    await expect(reconcilePendingPublicationEvents("tenant")).resolves.toEqual({ processed: 1, failed: 0, remaining: 0 });
    expect(H.status).toBe("recorded");
    expect(H.usageInserts).toBe(1);
  });

  it("CODE-REVIEW-20260917-12 거절: outbox가 없는 옛 발행에는 추측으로 사용량을 추가하지 않는다", async () => {
    H.status = "missing";
    await expect(recordPublicationEvent("tenant", "11111111-1111-4111-8111-111111111111", "threads"))
      .resolves.toEqual({ recorded: false, alreadyRecorded: false });
    expect(H.usageInserts).toBe(0);
  });

  it("REVIEW-20260918-06 정상: 월경계 뒤 relay해도 발생일인 8월 장부로 기록한다", async () => {
    await recordPublicationEvent("tenant", "11111111-1111-4111-8111-111111111111", "threads");
    expect(H.insertedAt).toBe("2026-08-31T23:59:00.000Z");
  });

  it("REVIEW-20260918-07 거절: 제한 묶음 뒤 pending 한 건이 남으면 완료로 보고하지 않는다", async () => {
    H.remaining = 1;
    const result = await reconcilePendingPublicationEvents("tenant", 50);
    expect(result).toEqual({ processed: 1, failed: 0, remaining: 1 });
  });
});
