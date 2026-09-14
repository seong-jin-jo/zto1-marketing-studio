#!/usr/bin/env node
// studio v1 생성 계약 E2E. 도는 앱에 실제로 붙어 상태코드와 응답을 관찰한다.
// 사용: set -a && . ./.env.local && set +a && node scripts/verify-studio-v1-e2e.mjs
import fs from "node:fs";

const base = process.env.STUDIO_E2E_BASE_URL || "http://localhost:3456";
const token = process.env.STUDIO_DEV_BEARER_TOKEN;
const workspace = (process.env.STUDIO_DEV_WORKSPACE_IDS || "").split(",")[0].trim();
if (!token || !workspace) throw new Error("STUDIO_DEV_BEARER_TOKEN 과 STUDIO_DEV_WORKSPACE_IDS 가 필요하다");

// 요청 본문은 tests/studio/generation-request.fixture.json 하나에서 읽는다.
// 정규식+eval 파싱은 요청 전에 SyntaxError 로 죽었다(2026-09-12 코드리뷰 MAJOR).
const body = JSON.parse(fs.readFileSync(new URL("../tests/studio/generation-request.fixture.json", import.meta.url), "utf8"));
body.workspace_id = workspace;

const auth = { authorization: `Bearer ${token}` };
const json = () => ({ "content-type": "application/json", ...auth, "Idempotency-Key": crypto.randomUUID() });
const results = [];
const record = (name, got, want) => {
  const ok = got === want;
  results.push({ name, got, want, ok });
  console.log(`${ok ? "통과" : "실패"}  ${name}  기대 ${want} 실제 ${got}`);
};
const rejectAllCandidates = async (generation) => {
  const statuses = [];
  for (const candidate of generation.candidates) {
    const response = await fetch(`${base}/api/studio/v1/generations/${generation.job_id}/rejections`, {
      method: "POST",
      headers: { "content-type": "application/json", ...auth },
      body: JSON.stringify({ candidate_id: candidate.candidate_id }),
    });
    statuses.push(response.status);
  }
  return statuses.every((status) => status === 201);
};

const noToken = await fetch(`${base}/api/studio/v1/generations`, {
  method: "POST", headers: { "content-type": "application/json", "Idempotency-Key": crypto.randomUUID() }, body: "{}",
});
record("토큰 없이 생성 요청은 거절된다", noToken.status, 401);

const noKey = await fetch(`${base}/api/studio/v1/generations`, {
  method: "POST", headers: { "content-type": "application/json", ...auth }, body: JSON.stringify(body),
});
record("멱등 키 없는 생성 요청은 거절된다", noKey.status, 400);

const empty = await fetch(`${base}/api/studio/v1/generations`, { method: "POST", headers: json(), body: "{}" });
record("빈 본문은 어느 항목이 빠졌는지 밝히며 거절된다", empty.status, 422);

const created = await fetch(`${base}/api/studio/v1/generations`, { method: "POST", headers: json(), body: JSON.stringify(body) });
const createdBody = await created.json();
record("일곱 층 학습 정보를 갖춘 생성 요청은 받아들여진다", created.status, 201);
if (created.status !== 201 || !createdBody.data) {
  console.log(JSON.stringify(createdBody).slice(0, 500));
  process.exit(1);
}
const payload = createdBody.data;
record("후보를 세 장 돌려준다", payload.candidates.length, 3);

const jobId = payload.job_id;
const lookup = await fetch(`${base}/api/studio/v1/generations/${jobId}`, { headers: auth });
record("만든 작업을 다시 조회할 수 있다", lookup.status, 200);

const missing = await fetch(`${base}/api/studio/v1/generations/00000000-0000-0000-0000-000000000000`, { headers: auth });
record("없는 작업 조회는 404 로 답한다", missing.status, 404);

const oppositeZoneBody = structuredClone(body);
oppositeZoneBody.learning_context.u2.time_zone = body.learning_context.u2.time_zone === "Pacific/Kiritimati"
  ? "Etc/GMT+12"
  : "Pacific/Kiritimati";
oppositeZoneBody.learning_context.r6.topic = `${body.learning_context.r6.topic} 교차 시간대`;
const oppositeZoneCreated = await fetch(`${base}/api/studio/v1/generations`, {
  method: "POST", headers: json(), body: JSON.stringify(oppositeZoneBody),
});
record("다른 시간대의 별도 작업도 생성된다", oppositeZoneCreated.status, 201);
const oppositeZoneCreatedBody = await oppositeZoneCreated.json();
if (oppositeZoneCreated.status !== 201 || !oppositeZoneCreatedBody.data) {
  console.log(JSON.stringify(oppositeZoneCreatedBody).slice(0, 500));
  process.exit(1);
}
const oppositeZonePayload = oppositeZoneCreatedBody.data;
const oppositeZoneJobId = oppositeZonePayload?.job_id;

record("첫 작업의 후보 세 장을 모두 거절로 남긴다", await rejectAllCandidates(payload), true);
record("다른 시간대 작업의 후보 세 장도 모두 거절로 남긴다", await rejectAllCandidates(oppositeZonePayload), true);

// 무료 다시 만들기 몫은 작업이나 클라이언트 시간대가 아니라 회원의 UTC 하루 단위다.
// 반복 실행으로 이미 오늘 몫을 쓴 환경에서는 두 호출이 모두 409일 수 있다. 첫 호출이 201이면
// 반대 시간대의 별도 작업은 반드시 409여야 하며, 어느 경우든 두 작업에서 201이 둘 나오면 실패다.
const retry = await fetch(`${base}/api/studio/v1/regenerations/${jobId}`, { method: "POST", headers: json(), body: JSON.stringify({ reason: "free_retry" }) });
record("무료 다시 만들기 첫 호출은 받아들이거나 오늘 몫 소진으로 거절한다", [201, 409].includes(retry.status), true);
if (retry.status === 409) {
  const denial = await retry.json();
  record("거절할 때는 언제 몫이 되살아나는지 함께 알린다", Boolean(denial.error?.details?.free_retry_resets_at), true);
} else {
  const accepted = await retry.json();
  record("첫 무료 다시 만들기는 사용 사실과 교체 작업을 돌려준다", Boolean(accepted.data?.free_retry_consumed && accepted.data?.replacement?.job_id), true);
}

const retryOtherZone = await fetch(`${base}/api/studio/v1/regenerations/${oppositeZoneJobId}`, {
  method: "POST", headers: json(), body: JSON.stringify({ reason: "free_retry" }),
});
record("서로 다른 시간대의 두 작업에서 무료 몫은 최대 한 번만 나간다", [retry.status, retryOtherZone.status].filter((status) => status === 201).length <= 1, true);
record("한 작업이 무료 몫을 썼다면 반대 시간대 작업은 거절된다", retry.status === 201 ? retryOtherZone.status : 409, 409);

const failed = results.filter((r) => !r.ok);
console.log(`\n${results.length}건 중 통과 ${results.length - failed.length}건, 실패 ${failed.length}건`);
process.exit(failed.length ? 1 : 0);
