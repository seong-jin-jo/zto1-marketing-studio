#!/usr/bin/env node
// verify-basic-flow-e2e.mjs: 네 방 기본 흐름 회귀 검증.
//
// 왜 (회장 2026-08-28 "일단 기본 flow 잘 돌아가는 것에 우선순위를 높여라"):
//   개별 API 는 통과하는데 방과 방 사이 인계가 끊기면 제품이 아니다.
//   생성실에서 만든 것이 편집실로, 편집한 것이 발행 큐로, 성과 제안이 다시
//   생성 큐로 이어지는 한 줄을 끝까지 통과시킨다.
//
// 사용: cd dashboard && set -a && . ./.env.local && set +a && node scripts/verify-basic-flow-e2e.mjs
//
// 주의: 실제 채널 발행은 하지 않는다. 발행 직전까지만 간다(계정 로그인은 회장 몫).
import fs from "node:fs";
const B="http://localhost:3456";
const T=process.env.DASHBOARD_AUTH_TOKEN, ST=process.env.STUDIO_DEV_BEARER_TOKEN;
const W=process.env.STUDIO_DEV_WORKSPACE_IDS.split(",")[0].trim();
const H=()=>({ "content-type":"application/json", authorization:`Bearer ${T}` });
const SH=()=>({ "content-type":"application/json", authorization:`Bearer ${ST}`, "Idempotency-Key": crypto.randomUUID() });
const out=[]; const say=(n,ok,detail="")=>{out.push({n,ok});console.log(`${ok?"통과":"실패"}  ${n}${detail?"  "+detail:""}`);};

console.log("== 생성실 ==");
// 감독 워커는 저장소 루트에서 이 스크립트를 실행할 수 있다. 현재 작업 디렉터리에
// 의존하면 fixture를 읽기 전에 끝나 실제 생성 제공자 병목과 구분할 수 없으므로,
// 검증기 자신의 위치를 기준으로 읽는다.
// 요청 본문은 tests/studio/generation-request.fixture.json 하나에서 읽는다.
// 종전에는 TS 파일에서 객체 리터럴을 정규식으로 오려 eval 했고, 리터럴 모양이 바뀌자
// 네트워크 요청 전에 SyntaxError 로 죽었다(2026-09-12 코드리뷰 MAJOR).
const body=JSON.parse(fs.readFileSync(new URL("../tests/studio/generation-request.fixture.json", import.meta.url),"utf8"));
body.workspace_id=W;
body.workspace_id=W;
const g=await fetch(`${B}/api/studio/v1/generations`,{method:"POST",headers:SH(),body:JSON.stringify(body)});
const gd=await g.json();
say("후보를 만든다", g.status===201 && gd.data?.candidates?.length===3, `후보 ${gd.data?.candidates?.length??0}장`);
if(g.status!==201){ console.log(JSON.stringify(gd).slice(0,300)); process.exit(1); }

console.log("\n== 편집실 ==");
const L=(id,order,text)=>({id,order,text});
const h=await fetch(`${B}/api/studio/handoffs`,{method:"POST",headers:H(),body:JSON.stringify({
  tenant_id:W, idea:"기본 흐름 검증",
  handoff:{ kind:"video", summary:"기본 흐름을 확인하는 짧은 영상",
    source:{ generation_id: gd.data.job_id, candidate_id: gd.data.candidates[0].candidate_id },
    payload:{ asset_url:"https://example.invalid/a.mp4", scenes:[
      {id:"s1",order:0,title:"첫 장면",lines:[L("l1",0,"첫 문장"),L("l2",1,"둘째 문장")]},
      {id:"s2",order:1,title:"둘째 장면",lines:[L("l3",0,"셋째 문장")]}]}}})});
const hd=await h.json();
say("생성 결과를 편집실로 넘긴다", h.status===201, `초안 ${hd.draft_id??"없음"}`);
if(h.status!==201){ console.log(JSON.stringify(hd).slice(0,300)); process.exit(1); }
const draftId=hd.draft_id; let rev=hd.handoff.revision;
const patch=async(b)=>{const r=await fetch(`${B}/api/studio/drafts/${draftId}/editor`,{method:"PATCH",headers:H(),body:JSON.stringify({tenant_id:W,...b})});return [r.status, await r.json()];};
let [s1,b1]=await patch({operation:"reorder_scenes",expected_revision:rev,ordered_ids:["s2","s1"]});
say("장면 순서를 바꾼다", s1===200, s1===200?b1.handoff.payload.scenes.map(x=>x.id).join(" 다음 "):"");
if(s1===200) rev=b1.handoff.revision;
let [s2,b2]=await patch({operation:"delete_line",expected_revision:rev,line_id:"l2"});
say("문장을 지운다", s2===200); if(s2===200) rev=b2.handoff.revision;
let [s3,b3]=await patch({operation:"restore_line",expected_revision:rev,line_id:"l2"});
say("지운 문장을 되살린다", s3===200); if(s3===200) rev=b3.handoff.revision;
let [s4]=await patch({operation:"mark_ready",expected_revision:rev});
say("편집을 마쳤다고 표시한다", s4===200);

console.log("\n== 발행실 ==");
const q=await fetch(`${B}/api/studio/drafts/${draftId}/enqueue`,{method:"POST",headers:H(),body:JSON.stringify({tenant_id:W})});
const qd=await q.json();
say("편집 결과를 발행 큐로 넘긴다", q.status===200||q.status===201, `상태 ${q.status}`);
if(!(q.status===200||q.status===201)) console.log(JSON.stringify(qd).slice(0,300));
const cap=await fetch(`${B}/api/publish/first-comment-capabilities?tenant_id=${W}`,{headers:H()});
say("채널별 지원 여부를 알려 준다", cap.status===200);

console.log("\n== 성과실 ==");
const sg=await fetch(`${B}/api/suggestions`,{method:"POST",headers:H(),body:JSON.stringify({tenant_id:W})});
const sd=await sg.json();
say("성과가 없어도 방향을 제안한다", sg.status===200 && (sd.ideas?.length??0)>=3, `제안 ${sd.ideas?.length??0}건`);
const en=await fetch(`${B}/api/suggestions/enqueue`,{method:"POST",headers:H(),body:JSON.stringify({tenant_id:W,suggestion:sd.suggestions[0]})});
const ed=await en.json();
say("제안을 다시 생성 큐로 넘긴다", en.status===200, `출처 보존 ${ed.post?.sourceContext?.suggestionId?"됨":"안 됨"}`);
const met=await fetch(`${B}/api/metrics?tenant_id=${W}`,{headers:H()});
say("성과 지표를 읽는다", met.status===200);

const bad=out.filter(x=>!x.ok);
console.log(`\n${out.length}단계 중 통과 ${out.length-bad.length}, 실패 ${bad.length}`);
if(bad.length) console.log("막힌 곳: "+bad.map(x=>x.n).join(", "));
process.exit(bad.length?1:0);
