#!/usr/bin/env node
// verify-derivation-osmu.mjs
//
// 무엇을 증명하는가: 주 갈래 하나를 확정하면서 같이 고른 갈래로 실제로 파생물이 생기고,
// 그 값이 확정 전에 보이며, 무료 재생성 몫을 갉아먹지 않고, 버려도 주 갈래가 남는지.
//
// 확인 항목
//   ① 견적을 확정 전에 받아 본다
//   ② 회원이 본 값과 다른 값을 보내면 시작하지 않는다(조용한 과금 차단)
//   ③ 파생이 실제로 만들어지고 갈래마다 편집실 작업물이 따로 생긴다
//   ④ 파생 뒤에도 오늘의 무료 재생성 몫이 그대로 남아 있다
//   ⑤ 같은 키로 두 번 눌러도 두 번 청구하지 않는다
//   ⑥ 파생을 버려도 주 갈래 결과는 그대로 조회된다
//
// 사용: cd dashboard && set -a && . ./.env.local && set +a &&
//       node scripts/verify-derivation-osmu.mjs
//
// 정리: 이 스크립트가 만든 것만 전용 회원과 전용 키로 지운다. 공유 장부를 통째로 지우지 않는다.
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

async function call(method, path, body, idempotencyKey) {
  if (Date.now() - startedAt > DEADLINE_MS) throw new Error("전체 검증 마감 시간을 넘겼습니다");
  const headers = { authorization: `Bearer ${TOKEN}` };
  if (body !== undefined) headers["content-type"] = "application/json";
  if (method === "POST") headers["Idempotency-Key"] = idempotencyKey ?? crypto.randomUUID();
  const response = await fetch(`${BASE}${path}`, {
    method,
    headers,
    body: body === undefined ? undefined : JSON.stringify(body),
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
const createdJobs = [];
const createdDrafts = [];
const failures = [];

function check(label, actual, expected) {
  const ok = JSON.stringify(actual) === JSON.stringify(expected);
  console.log(`${ok ? "통과" : "실패"} ${label}: 관찰 ${JSON.stringify(actual)} 기대 ${JSON.stringify(expected)}`);
  if (!ok) failures.push(label);
}

try {
  await sql`DELETE FROM studio_free_regeneration_uses WHERE member_id = ${MEMBER}`;

  const created = await call("POST", "/api/studio/v1/generations", generationBody("파생 검증용 주제"));
  check("주 갈래 생성 201", created.status, 201);
  const jobId = created.payload?.data?.job_id;
  if (!jobId) throw new Error("생성 응답에 작업 번호가 없습니다");
  createdJobs.push(jobId);
  const candidateId = created.payload.data.candidates[0].candidate_id;

  // ① 확정 전에 값을 본다.
  const quoted = await call("GET", `/api/studio/v1/generations/${jobId}/derivations?kinds=card,video`);
  check("견적 조회 200", quoted.status, 200);
  const quote = quoted.payload?.data?.quote;
  check("견적에 갈래 둘", quote?.lines?.length, 2);
  const totalMinor = quote?.total_minor;
  check("견적 합이 갈래 단가의 합", totalMinor, quote.lines.reduce((sum, line) => sum + line.unit_minor, 0));

  // ② 본 값과 다른 값을 보내면 시작하지 않는다.
  const mismatched = await call("POST", `/api/studio/v1/generations/${jobId}/derivations`, {
    candidate_id: candidateId,
    kinds: ["card", "video"],
    acknowledged_cost: { currency: quote.currency, total_minor: totalMinor + 1 },
  });
  check("값이 다르면 막힌다", mismatched.payload?.error?.code, "DERIVATION_QUOTE_CHANGED");
  const [afterMismatch] = await sql`
    SELECT count(*)::int AS value FROM studio_derivation_batches WHERE member_id = ${MEMBER} AND job_id = ${jobId}`;
  check("막힌 요청이 남긴 장부", afterMismatch.value, 0);

  // ③ 실제로 파생이 만들어진다.
  const idempotencyKey = `verify-derivation-${crypto.randomUUID()}`;
  const acknowledged = { currency: quote.currency, total_minor: totalMinor };
  const derived = await call("POST", `/api/studio/v1/generations/${jobId}/derivations`, {
    candidate_id: candidateId,
    kinds: ["card", "video"],
    acknowledged_cost: acknowledged,
  }, idempotencyKey);
  check("파생 생성 201", derived.status, 201);
  const batch = derived.payload?.data;
  check("파생 상태", batch?.status, "succeeded");
  check("갈래별 결과 둘", batch?.items?.length, 2);
  const draftIds = (batch?.items ?? []).map((item) => item.draft_id).filter(Boolean);
  createdDrafts.push(...draftIds);
  check("갈래마다 작업물이 따로", new Set(draftIds).size, 2);
  check("나간 값은 견적과 같다", batch?.cost?.charged_minor, totalMinor);
  check("무료 재생성을 쓰지 않았다", batch?.cost?.free_regeneration_consumed, false);

  const drafts = await sql`
    SELECT payload->'editor_handoff'->>'kind' AS kind
    FROM drafts WHERE tenant_id = ${WORKSPACE} AND id = ANY(${draftIds}::uuid[]) ORDER BY 1`;
  check("편집실에 들어간 갈래", drafts.map((row) => row.kind), ["card", "video"]);

  // ④ 파생이 무료 몫을 갉아먹지 않았다.
  const [uses] = await sql`
    SELECT count(*)::int AS value FROM studio_free_regeneration_uses WHERE member_id = ${MEMBER}`;
  check("파생 뒤 나간 무료 몫", uses.value, 0);

  // ⑤ 같은 키로 두 번 눌러도 두 번 청구하지 않는다.
  const replay = await call("POST", `/api/studio/v1/generations/${jobId}/derivations`, {
    candidate_id: candidateId,
    kinds: ["card", "video"],
    acknowledged_cost: acknowledged,
  }, idempotencyKey);
  check("재송신은 같은 파생", replay.payload?.data?.batch_id, batch.batch_id);
  const [batchCount] = await sql`
    SELECT count(*)::int AS value, COALESCE(sum(charged_minor), 0)::int AS charged
    FROM studio_derivation_batches WHERE member_id = ${MEMBER} AND job_id = ${jobId}`;
  check("장부에 남은 파생 건수", batchCount.value, 1);
  check("장부에 쌓인 값", batchCount.charged, totalMinor);

  // ⑥ 버려도 주 갈래는 남는다.
  const discarded = await call("DELETE", `/api/studio/v1/derivations/${batch.batch_id}`);
  check("버리기 200", discarded.status, 200);
  check("버린 시각이 적힌다", typeof discarded.payload?.data?.discarded_at, "string");
  const remaining = await sql`
    SELECT count(*)::int AS value FROM drafts WHERE tenant_id = ${WORKSPACE} AND id = ANY(${draftIds}::uuid[])`;
  check("버린 뒤 남은 파생 작업물", remaining[0].value, 0);
  const primaryStill = await call("GET", `/api/studio/v1/generations/${jobId}`);
  check("주 갈래는 그대로 조회된다", primaryStill.status, 200);
  check("주 갈래 후보 세 장", primaryStill.payload?.data?.candidates?.length, 3);
} catch (error) {
  console.error("검증 중단:", error instanceof Error ? error.message : String(error));
  failures.push("검증 중단");
} finally {
  try {
    if (createdDrafts.length > 0) {
      await sql`DELETE FROM drafts WHERE tenant_id = ${WORKSPACE} AND id = ANY(${createdDrafts}::uuid[])`;
    }
    await sql`DELETE FROM studio_derivation_batches WHERE member_id = ${MEMBER} AND job_id = ANY(${createdJobs}::uuid[])`;
    await sql`DELETE FROM studio_generation_candidate_rejections WHERE member_id = ${MEMBER} AND job_id = ANY(${createdJobs}::uuid[])`;
    await sql`DELETE FROM studio_free_regeneration_uses WHERE member_id = ${MEMBER}`;
    await sql`DELETE FROM studio_generation_idempotency WHERE member_id = ${MEMBER} AND job_id = ANY(${createdJobs}::uuid[])`;
    await sql`DELETE FROM studio_generation_jobs WHERE member_id = ${MEMBER} AND id = ANY(${createdJobs}::uuid[])`;
  } catch (error) {
    console.error("정리 실패:", error instanceof Error ? error.message : String(error));
    failures.push("정리");
  }
  await sql.end({ timeout: 5 });
}

console.log(failures.length === 0
  ? "\n판정: 하나의 주제로 여러 갈래가 실제로 만들어지고, 값은 확정 전에 보이며, 무료 몫은 그대로다."
  : `\n판정: 실패 ${failures.length}건 (${failures.join(", ")})`);
process.exit(failures.length === 0 ? 0 : 1);
