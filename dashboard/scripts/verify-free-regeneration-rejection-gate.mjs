#!/usr/bin/env node
// verify-free-regeneration-rejection-gate.mjs
//
// 무엇을 막는가: 후보 셋을 하나도 거절하지 않고 재생성을 부르면 하루 무료 몫이 그냥 나가던 결함.
// 요구 대장 R27 은 "후보 셋 다 거절 시 하루 1회 무료 재생성"이다.
// 기존 검증 스크립트는 같은 작업으로만 두 번 불러서 이 경로를 밟지 않았다.
//
// 함께 확인하는 것: 몫 복구 안내 시각이 실제 잠금 경계와 같은지.
//   몫 키는 협정시 날짜이므로 안내도 협정시 자정이어야 한다.
//
// 사용: cd dashboard && set -a && . ./.env.local && set +a &&
//       node scripts/verify-free-regeneration-rejection-gate.mjs
//
// 정리: 이 스크립트가 만든 작업, 거절, 몫 장부는 끝에서 전용 회원 기준으로만 지운다.
//       공유 원장을 통째로 지우지 않는다.
import { createRequire } from "node:module";
import postgres from "postgres";

const require = createRequire(import.meta.url);
const generationFixture = require("../tests/studio/generation-request.fixture.json");

const BASE = process.env.OSMU_BASE_URL || "http://localhost:3456";
const TOKEN = process.env.STUDIO_DEV_BEARER_TOKEN;
const WORKSPACE = (process.env.STUDIO_DEV_WORKSPACE_IDS || "").split(",")[0].trim();
const MEMBER = process.env.STUDIO_DEV_MEMBER_ID;
const DATABASE_URL = process.env.DATABASE_URL;
if (!TOKEN || !WORKSPACE || !MEMBER || !DATABASE_URL) {
  console.error("STUDIO_DEV_BEARER_TOKEN, STUDIO_DEV_WORKSPACE_IDS, STUDIO_DEV_MEMBER_ID, DATABASE_URL 이 필요합니다");
  process.exit(2);
}

const DEADLINE_MS = Number(process.env.VERIFY_DEADLINE_MS || 120_000);
const startedAt = Date.now();
const headers = () => ({
  "content-type": "application/json",
  authorization: `Bearer ${TOKEN}`,
  "Idempotency-Key": crypto.randomUUID(),
});

// 무인 검증은 반드시 끝나야 한다. 요청마다 제한 시간을 두고 전체 실행에도 마감을 둔다.
async function call(path, body) {
  if (Date.now() - startedAt > DEADLINE_MS) throw new Error("전체 검증 마감 시간을 넘겼습니다");
  const response = await fetch(`${BASE}${path}`, {
    method: "POST",
    headers: headers(),
    body: JSON.stringify(body ?? {}),
    signal: AbortSignal.timeout(20_000),
  });
  const payload = await response.json().catch(() => null);
  return { status: response.status, payload };
}

function generationBody(topic) {
  const body = structuredClone(generationFixture);
  body.workspace_id = WORKSPACE;
  body.learning_context.r6.topic = topic;
  return body;
}

const sql = postgres(DATABASE_URL, { max: 2, idle_timeout: 5, connect_timeout: 8, onnotice: () => {} });
const created = [];
const failures = [];

function check(label, actual, expected) {
  const ok = JSON.stringify(actual) === JSON.stringify(expected);
  console.log(`${ok ? "통과" : "실패"} ${label}: 관찰 ${JSON.stringify(actual)} 기대 ${JSON.stringify(expected)}`);
  if (!ok) failures.push(label);
}

try {
  // 이 검증은 오늘 몫이 비어 있어야 판정할 수 있다. 전용 회원 기준으로만 비운다.
  await sql`DELETE FROM studio_free_regeneration_uses WHERE member_id = ${MEMBER}`;

  const first = await call("/api/studio/v1/generations", generationBody("거절 관문 검증 작업"));
  check("생성 201", first.status, 201);
  const jobId = first.payload?.data?.job_id;
  if (!jobId) throw new Error("생성 응답에 작업 번호가 없습니다");
  created.push(jobId);
  const candidates = first.payload.data.candidates.map((candidate) => candidate.candidate_id);
  check("후보 세 장", candidates.length, 3);

  const blocked = await call(`/api/studio/v1/regenerations/${jobId}`, { reason: "free_retry" });
  check("거절 없는 재생성 거절 상태", blocked.status, 409);
  check("거절 없는 재생성 사유", blocked.payload?.error?.code, "CANDIDATES_NOT_REJECTED");

  const [afterBlocked] = await sql`
    SELECT count(*)::int AS uses FROM studio_free_regeneration_uses WHERE member_id = ${MEMBER}`;
  check("막힌 요청이 태운 몫", afterBlocked.uses, 0);

  const partial = await call(`/api/studio/v1/generations/${jobId}/rejections`, { candidate_id: candidates[0] });
  check("후보 한 장 거절 201", partial.status, 201);
  const stillBlocked = await call(`/api/studio/v1/regenerations/${jobId}`, { reason: "free_retry" });
  check("한 장만 거절한 재생성 거절", stillBlocked.payload?.error?.code, "CANDIDATES_NOT_REJECTED");

  for (const candidateId of candidates.slice(1)) {
    const response = await call(`/api/studio/v1/generations/${jobId}/rejections`, { candidate_id: candidateId });
    check(`후보 거절 201 (${candidateId.slice(0, 8)})`, response.status, 201);
  }

  const granted = await call(`/api/studio/v1/regenerations/${jobId}`, { reason: "free_retry" });
  check("셋 다 거절한 뒤 재생성", granted.status, 201);
  if (granted.payload?.data?.replacement?.job_id) created.push(granted.payload.data.replacement.job_id);

  // 오늘 둘째 무료 재생성은 막히고, 복구 안내는 협정시 자정이어야 한다.
  const second = await call("/api/studio/v1/generations", generationBody("둘째 무료 몫 검증 작업"));
  const secondJobId = second.payload?.data?.job_id;
  if (secondJobId) {
    created.push(secondJobId);
    for (const candidate of second.payload.data.candidates) {
      await call(`/api/studio/v1/generations/${secondJobId}/rejections`, { candidate_id: candidate.candidate_id });
    }
    const exhausted = await call(`/api/studio/v1/regenerations/${secondJobId}`, { reason: "free_retry" });
    check("둘째 무료 재생성 거절 사유", exhausted.payload?.error?.code, "PAID_REGENERATION_APPROVAL_REQUIRED");
    const resetsAt = exhausted.payload?.error?.details?.free_retry_resets_at;
    const now = new Date();
    const expected = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate() + 1)).toISOString();
    check("복구 안내가 실제 잠금 경계와 같다", resetsAt, expected);
  }

  const [uses] = await sql`
    SELECT count(*)::int AS value FROM studio_free_regeneration_uses WHERE member_id = ${MEMBER}`;
  check("하루에 나간 무료 몫", uses.value, 1);
} finally {
  // 만든 것만 역순으로 정리한다.
  try {
    await sql`DELETE FROM studio_generation_candidate_rejections WHERE member_id = ${MEMBER} AND job_id = ANY(${created}::uuid[])`;
    await sql`DELETE FROM studio_free_regeneration_uses WHERE member_id = ${MEMBER}`;
    await sql`DELETE FROM studio_generation_idempotency WHERE member_id = ${MEMBER} AND job_id = ANY(${created}::uuid[])`;
    await sql`DELETE FROM studio_generation_jobs WHERE member_id = ${MEMBER} AND id = ANY(${created}::uuid[])`;
  } catch (error) {
    console.error("정리 실패:", error instanceof Error ? error.message : String(error));
    failures.push("정리");
  }
  await sql.end({ timeout: 5 });
}

console.log(failures.length === 0 ? "\n판정: 무료 몫은 후보 셋을 다 거절한 뒤에만 나간다." : `\n판정: 실패 ${failures.length}건 (${failures.join(", ")})`);
process.exit(failures.length === 0 ? 0 : 1);
