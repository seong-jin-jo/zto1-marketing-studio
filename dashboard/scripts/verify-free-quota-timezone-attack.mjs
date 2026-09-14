#!/usr/bin/env node
// verify-free-quota-timezone-attack.mjs: 무료 재생성 몫의 시간대 우회 회귀 검증.
//
// 왜 (교차 모델 리뷰 M1, 2026-08-28):
//   몫 키의 현지 날짜를 클라이언트가 보낸 시간대로 만들면, 협정시 -12 부터 +14 까지
//   26시간이 벌어져 있어 어느 시각에나 서로 다른 날짜가 최소 둘 나온다.
//   상시 두 배, 경계에서 세 배로 몫이 지급된다.
//   기존 계약 검증 10건은 같은 작업으로만 두 번 불러서 이 경로를 밟지 않았다.
//
// 사용: cd dashboard && set -a && . ./.env.local && set +a &&
//       psql "$DATABASE_URL" -c "delete from studio_free_regeneration_uses" &&
//       node scripts/verify-free-quota-timezone-attack.mjs
//   ※ 오늘 몫을 이미 썼으면 전부 409 가 나와 검증이 무의미하다. 먼저 비우고 돌려라.
import { createRequire } from "node:module";
const require = createRequire(import.meta.url);
const generationFixture = require("../tests/studio/generation-request.fixture.json");
const B="http://localhost:3456", ST=process.env.STUDIO_DEV_BEARER_TOKEN;
const W=process.env.STUDIO_DEV_WORKSPACE_IDS.split(",")[0].trim();
const H=()=>({ "content-type":"application/json", authorization:`Bearer ${ST}`, "Idempotency-Key": crypto.randomUUID() });
const make=(tz)=>{const b=structuredClone(generationFixture);b.workspace_id=W;b.learning_context.u2.time_zone=tz;return b;};
const create=async(tz)=>{const r=await fetch(`${B}/api/studio/v1/generations`,{method:"POST",headers:H(),body:JSON.stringify(make(tz))});const d=await r.json();return [r.status, d.data?.job_id];};
const retry=async(id)=>{const r=await fetch(`${B}/api/studio/v1/regenerations/${id}`,{method:"POST",headers:H(),body:JSON.stringify({reason:"free_retry"})});return r.status;};

const [s1,a]=await create("Asia/Seoul");        console.log("서울 작업 생성:",s1);
const [s2,b]=await create("Pacific/Kiritimati"); console.log("키리바시(UTC+14) 작업 생성:",s2);
const [s3,c]=await create("Pacific/Niue");       console.log("니우에(UTC-11) 작업 생성:",s3);
const r1=await retry(a); console.log("서울 작업으로 무료 재생성:", r1);
const r2=await retry(b); console.log("키리바시 작업으로 무료 재생성:", r2);
const r3=await retry(c); console.log("니우에 작업으로 무료 재생성:", r3);
const granted=[r1,r2,r3].filter(x=>x===201).length;
console.log(`\n무료 몫이 나간 횟수: ${granted}`);
console.log(granted<=1 ? "판정: 막혔다. 시간대를 바꿔도 하루 한 번뿐이다." : `판정: 뚫린다. 하루 몫이 ${granted}번 나갔다.`);
process.exit(granted<=1?0:1);
