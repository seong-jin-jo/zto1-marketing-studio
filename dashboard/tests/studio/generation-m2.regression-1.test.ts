import crypto from "node:crypto";
import { afterEach, describe, expect, it } from "vitest";
import postgres from "postgres";
import { parseGenerationRequest } from "@/lib/studio/generation/contracts";
import { PostgresGenerationRepository } from "@/lib/studio/generation/repository";
import { GenerationService } from "@/lib/studio/generation/service";
import { getDatabaseUrl } from "../isolation/_env";
import { FIXTURE_STUDIO_CONTENT_GENERATOR, generationRequestFixture } from "./generation-fixture";

// Regression: OSMU-BLOCK-M2. 사용자가 내부 무료 재생성 키와 같은 생성 키를 선점하면
// 두 번째 멱등 기록 INSERT가 unique violation으로 500을 내던 결함.
// Found by 교차 모델 검수 on 2026-08-28.
// Report: docs/_archive/legacy-20260912/audit/osmu-cross-review-2026-08-28-opus.md

let admin: ReturnType<typeof postgres> | null = null;
let memberId = "";

afterEach(async () => {
  if (!admin || !memberId) return;
  await admin`DELETE FROM studio_generation_idempotency WHERE member_id = ${memberId}`;
  await admin`DELETE FROM studio_free_regeneration_uses WHERE member_id = ${memberId}`;
  await admin`DELETE FROM studio_generation_candidate_rejections WHERE member_id = ${memberId}`;
  await admin`DELETE FROM studio_generation_jobs WHERE member_id = ${memberId}`;
  await admin.end({ timeout: 5 });
  admin = null;
  memberId = "";
});

describe("무료 재생성 멱등 이름 공간 회귀", () => {
  it("OSMU-BLOCK-M2 정상: 사용자가 내부 모양의 생성 키를 먼저 써도 무료 재생성은 별도 멱등 영역에서 성공한다", async (ctx) => {
    const url = getDatabaseUrl();
    if (!url) {
      if (process.env.CI) throw new Error("CI requires DATABASE_URL for M2 regression");
      ctx.skip();
      return;
    }
    process.env.DATABASE_URL = url;
    admin = postgres(url, { max: 3, idle_timeout: 5, connect_timeout: 8, onnotice: () => {} });
    const [tenant] = await admin<{ id: string }[]>`SELECT id FROM tenants ORDER BY created_at LIMIT 1`;
    if (!tenant) throw new Error("M2 regression requires one tenant");

    memberId = `studio-m2-${crypto.randomUUID()}`;
    const service = new GenerationService(new PostgresGenerationRepository(), undefined, FIXTURE_STUDIO_CONTENT_GENERATOR);
    const body = generationRequestFixture();
    body.workspace_id = tenant.id;
    const original = await service.create(memberId, "m2-origin", parseGenerationRequest(body));
    const now = new Date("2026-08-28T12:00:00.000Z");
    const collisionKey = `free-regeneration:${original.jobId}:2026-08-28`;

    const collidingBody = generationRequestFixture();
    collidingBody.workspace_id = tenant.id;
    collidingBody.learning_context.r6.topic = "내부 키 모양을 선점한 일반 생성";
    await service.create(memberId, collisionKey, parseGenerationRequest(collidingBody), now);

    // 무료 재생성은 후보 셋을 모두 거절한 뒤에만 나간다(요구 대장 R27).
    for (const candidate of original.candidates) {
      await service.rejectCandidate(memberId, original.jobId, candidate.candidateId, [tenant.id]);
    }
    const regenerated = await service.regenerate(memberId, original.jobId, [tenant.id], now);

    expect(regenerated.freeRetryConsumed).toBe(true);
    expect(regenerated.replacement.jobId).not.toBe(original.jobId);
    const rows = await admin<{ operation: string }[]>`
      SELECT operation FROM studio_generation_idempotency
      WHERE member_id = ${memberId} AND idempotency_key = ${collisionKey}
      ORDER BY operation`;
    expect(rows.map((row) => row.operation)).toEqual(["generation.create", "generation.regenerate"]);
  });
});
