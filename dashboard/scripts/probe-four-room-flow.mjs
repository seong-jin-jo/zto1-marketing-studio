import playwright from "/Users/sj/kimstudy-auto/node_modules/playwright-core/index.js";
const exe="/Users/sj/Library/Caches/ms-playwright/chromium-1228/chrome-mac-x64/Google Chrome for Testing.app/Contents/MacOS/Google Chrome for Testing";
const W="cd1d0a40-540d-4524-9b49-bf2445d82182";
const base=process.env.FOUR_ROOM_BASE_URL||"http://localhost:3456";
const operatorToken=process.env.DASHBOARD_AUTH_TOKEN||"";
if(!operatorToken) throw new Error("DASHBOARD_AUTH_TOKEN이 필요합니다");

const request=(pathname,options={})=>fetch(`${base}${pathname}`,{
  ...options,
  headers:{authorization:`Bearer ${operatorToken}`,...(options.body?{"content-type":"application/json"}:{}),...(options.headers||{})},
});

let issuedTokenId="";
let b;
try {
  const issued=await request("/api/tenant-tokens",{
    method:"POST",
    body:JSON.stringify({tenant_id:W,label:`qa-four-room-probe-${Date.now()}`}),
  });
  const issuedBody=await issued.json();
  if(!issued.ok||!issuedBody.token||!issuedBody.id) throw new Error(`고객 토큰 발급 실패: HTTP ${issued.status}`);
  issuedTokenId=issuedBody.id;

  b=await playwright.chromium.launch({executablePath:exe,headless:true});
  const ctx=await b.newContext({viewport:{width:1440,height:1200}});
  await ctx.addInitScript(({t,st,w})=>{
    localStorage.setItem("dashboard_auth_token",t);
    localStorage.setItem("dashboard_auth_identity_kind","customer");
    localStorage.setItem("active_workspace",JSON.stringify({id:w,slug:"local",name:"로컬 검증 작업 공간",tier:"team"}));
    // 발행실은 작업 공간별 키(`studio_work:<작업공간>`)에서만 작업물을 복원하고, 옛 공용 키는
    // 화면이 뜨는 즉시 지운다. 지금까지 공용 키만 심어 온 탓에 발행실이 늘 빈 상태로 측정됐고
    // "발행실 단추 5개"라는 숫자가 거기서 나왔다. 실제 화면이 아니라 탐침이 틀렸던 것이다.
    localStorage.setItem(`studio_work:${w}`,JSON.stringify({
      idea:"1인 사업가의 콘텐츠 운영 시간 줄이기",
      text:{threads:"기준 셋",x:"반복부터 줄입니다.",facebook:"한 흐름으로 묶습니다.",
        instagram:{caption:"한 번 만들고 일곱 채널",hashtags:["OSMU"],slides:["1","2","3"]},
        shorts:{hook:"매일 발행해도 시간이 남는 이유",body:"반복을 줄입니다.",cta:"오늘 한 편부터."}},
      includes:{threads:true,x:true,facebook:false,instagram:true,shorts:false,reels:false,tiktok:false},
      editLines:["첫 장면에서 문제를 짚습니다.","둘째 장면에서 해결 순서를 보여 줍니다.","마지막 장면에서 할 일을 말합니다."],
      createBranch:"video",editKind:"video"}));
    sessionStorage.setItem("studio_generation_token",st);
    sessionStorage.setItem("studio_skill_version_id","22222222-2222-4222-8222-222222222222");
    sessionStorage.setItem("studio_workspace_id",w);
  },{t:issuedBody.token,st:process.env.STUDIO_DEV_BEARER_TOKEN,w:W});

  const p=await ctx.newPage();
  const consoleErrors=[];
  const unauthorizedUrls=[];
  p.on("pageerror",error=>consoleErrors.push(error.message));
  p.on("console",message=>{if(message.type()==="error") consoleErrors.push(message.text());});
  p.on("response",response=>{if(response.status()===401) unauthorizedUrls.push(response.url());});

  const rows=[];
  for(const [room,url] of [["create","/studio?room=create"],["edit","/studio?room=edit"],["publish","/studio?room=publish"],["performance","/performance"]]) {
    // Next dev keeps HMR and background requests alive. networkidle can time out after
    // the room is already interactive, so the visible room contract is the readiness signal.
    await p.goto(`${base}${url}`,{waitUntil:"domcontentloaded",timeout:60000});
    const roomRoot=p.locator(`[data-room="${room}"]`);
    await roomRoot.waitFor({state:"visible",timeout:30000});
    // AuthGate may finish a client navigation after DOMContentLoaded. Anchor evaluation
    // to the live room locator so Playwright re-resolves it in the final document.
    rows.push(await roomRoot.evaluate((_roomElement,r)=>({
      방:r,
      그려짐:document.querySelector(`[data-room="${r}"]`) instanceof HTMLElement,
      방머리:document.querySelector(`[data-room-top="${r}"]`) instanceof HTMLElement,
      목차항목:document.querySelectorAll("[data-edit-outline] li").length,
      대사줄:document.querySelectorAll("[data-edit-script] input, [data-edit-script] li").length,
      // 발행실 미리보기 칸은 `data-room-preview`로 선다. 이 선택자가 빠져 있어 발행실 미리보기가
      // 늘 0으로 세어졌다(실제로는 일곱 칸이 그려진다).
      미리보기:document.querySelectorAll("[data-pv-platform], [data-room-preview], [aria-label*='미리보기']").length,
      성과실:document.querySelector("[data-room='performance']") instanceof HTMLElement,
      가린모달:document.querySelectorAll("[data-onboarding-mode='modal'], .fixed.inset-0.z-50").length,
      단추:document.querySelectorAll("main button").length,
    }),room));
  }
  console.table(rows);
  const failed=rows.filter(row=>!row.그려짐||row.가린모달>0);
  if(failed.length) throw new Error(`네 방 탐침 실패: ${failed.map(row=>row.방).join(", ")}`);
  if(consoleErrors.length) throw new Error(`브라우저 콘솔 오류 ${consoleErrors.length}건: ${consoleErrors.slice(0,3).join(" | ")}`);
  if(unauthorizedUrls.length) throw new Error(`브라우저 401 ${unauthorizedUrls.length}건: ${unauthorizedUrls.slice(0,3).join(" | ")}`);
  console.log("PASS 네 방 4개 렌더, 가린 모달 0건, 브라우저 401 0건, 콘솔 오류 0건");
} finally {
  if(b) await b.close();
  if(issuedTokenId) {
    const revoked=await request(`/api/tenant-tokens?id=${encodeURIComponent(issuedTokenId)}`,{method:"DELETE"});
    if(!revoked.ok) console.error(`임시 고객 토큰 폐기 실패: HTTP ${revoked.status}`);
  }
}
