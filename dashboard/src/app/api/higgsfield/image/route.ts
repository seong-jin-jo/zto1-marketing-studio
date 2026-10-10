import { effectiveTenantId } from "@/lib/tenant-auth";
import { toGeneratorRatio } from "@/lib/generator-aspect-ratio";
import { hfRun, extractJson, extractJobId, HiggsfieldUnavailableError, HiggsfieldUnauthenticatedError, assertHiggsfieldReady } from "@/lib/higgsfield";
import { createHiggsfieldJob } from "@/lib/higgsfield-jobs";
import { scheduleHiggsfieldBackgroundPoll } from "@/lib/higgsfield-background-poll";

// POST /api/higgsfield/image — GPT Image 2.5 text→image 작업 "접수"만 한다(비동기 전환 2026-10-01).
// 반환: 202 { ok: true, jobId } — 실제 생성·다운로드·결과는 GET /api/higgsfield/job/[id] 가 한다.
//
// 왜 비동기인가: 운영은 Cloudflare 터널 뒤라 100초 넘는 동기 HTTP 요청은 524로 끊긴다. 종전
// `--wait`는 생성기 대기열이 길어지면(실측 10분+) 그 안에서 요청이 끊기고 사용자는 이유도
// 모르고 실패로 읽는다. wiki/거버넌스/결정.md ADR "구조 초안 생성이 프록시 제한 시간을 넘는다"
// 옵션2(비동기 전환: 접수 즉시 jobId 반환, 화면이 상태를 물어본다)를 이 기능에 적용한다.
//
// 입력 검증(prompt 필수)과 "생성기가 거절(NSFW·크레딧 부족)" 류 오류는 접수 단계에서도
// 날 수 있으므로 기존 문구·상태코드 규약(거절=200, 실행기 미준비/미인증=503)을 그대로
// 유지한다 — 화면 쪽 문구 분기(r.credits/r.nsfw)가 접수 응답에도 그대로 먹힌다.
const GENERATOR_REFUSED = 200;
// 2026-10-11 R4 실생성 원인 추적:
// Soul V2 요청에는 참조 이미지도, 초안 본문도 없었지만 결과에 세로 가짜 캡션이 생겼다.
// CLI 모델 계약에도 negative_prompt 입력이 없다. Soul V2는 패션·에디토리얼 사진에 특화돼
// 장면에 장식 캡션을 자율 추가할 수 있으므로, 무문자 대표 이미지는 자연어 제약 준수가 더
// 강한 GPT Image 2.5로 분리한다. 1k/low는 이 용도의 화면·숏폼 바탕에 충분하고 실측 비용도
// Soul 0.12 대비 0.25 credit로 제한된다. 참조 이미지는 이 경로에서 받지도, 보내지도 않는다.
export const HIGGSFIELD_IMAGE_MODEL = "gpt_image_2_5";
export const HIGGSFIELD_IMAGE_RESOLUTION = "1k";
export const HIGGSFIELD_IMAGE_QUALITY = "low";

export async function POST(request: Request) {
  const body = await request.json();
  const { prompt, aspectRatio = "9:16", label = "" } = body;
  if (!prompt || typeof prompt !== "string") {
    return Response.json({ error: "prompt required" }, { status: 400 });
  }
  const tenantId = await effectiveTenantId(request, body.tenant_id);
  if (!tenantId) return Response.json({ error: "테넌트를 식별할 수 없습니다." }, { status: 401 });

  const mark = (step: string, extra?: string) =>
    console.log(JSON.stringify({ kind: "hf_image_step", step, extra: extra?.slice(0, 300) }));
  try {
    mark("ready:start");
    await assertHiggsfieldReady();
    mark("ready:ok");
    // --wait 를 쓰지 않는다 — 접수만 받고 즉시 돌아온다. 생성기 대기열이 몇 분이든
    // 이 HTTP 요청 자체는 수 초 안에 끝난다.
    // 2026-10-01 추가 실측(cb35f3fd): --wait를 뺐어도 hfRun 기본 타임아웃(480초)을 그대로
    // 물려받으면 "접수"라는 이름의 호출이 여전히 8분까지 걸릴 수 있다. 접수는 수십 초
    // 안에 끝나야 하는 짧은 호출이므로 타임아웃을 명시적으로 짧게 준다 — 걸리면 접수
    // 단계에서 바로 에러로 드러나야지, --wait 때처럼 조용히 길게 물려 있으면 안 된다.
    const { stdout } = await hfRun([
      "generate", "create", HIGGSFIELD_IMAGE_MODEL,
      "--prompt", prompt,
      "--aspect_ratio", toGeneratorRatio(aspectRatio),
      "--resolution", HIGGSFIELD_IMAGE_RESOLUTION,
      "--quality", HIGGSFIELD_IMAGE_QUALITY,
      "--json",
    ], 45000);
    mark("create:ok", `stdout=${stdout.length}`);
    const data = extractJson(stdout);
    const providerJobId = extractJobId(data);
    if (!providerJobId) {
      return Response.json({
        ok: false,
        error: "생성기가 작업 번호를 돌려주지 않았습니다. 잠시 후 다시 시도해 주세요.",
        raw: stdout.slice(-400),
      }, { status: GENERATOR_REFUSED });
    }
    const job = createHiggsfieldJob(tenantId, "image", providerJobId, {
      model: HIGGSFIELD_IMAGE_MODEL,
      prompt,
      aspectRatio,
      resolution: HIGGSFIELD_IMAGE_RESOLUTION,
      quality: HIGGSFIELD_IMAGE_QUALITY,
      imageReferences: [],
      label,
    });
    // 접수 직후 서버가 스스로 이 작업을 확인·완료 처리하는 백그라운드 루프를 돈다 —
    // 화면이 한 번도 GET하지 않아도(탭이 백그라운드에 묶이거나 닫혀도) 결과가 확정된다.
    scheduleHiggsfieldBackgroundPoll(tenantId, job.jobId);
    return Response.json({ ok: true, jobId: job.jobId }, { status: 202 });
  } catch (e) {
    const stderrTail = (e as { stderr?: string })?.stderr?.trim().slice(-300);
    mark("catch", stderrTail || (e instanceof Error ? `${e.name}: ${e.message}`.slice(-300) : String(e)));
    if (e instanceof HiggsfieldUnauthenticatedError) {
      return Response.json({
        error: "이미지 생성 서비스 연결이 잠시 끊겼습니다. 계정 로그인 문제는 아니며 운영팀이 복구하고 있습니다. 글 카드는 지금도 만드실 수 있습니다.",
        code: "GENERATOR_UNAUTHENTICATED",
      }, { status: 503 });
    }
    if (e instanceof HiggsfieldUnavailableError) {
      return Response.json({
        error: "이미지 생성 서비스가 아직 준비되지 않았습니다. 계정 로그인 문제는 아니며 운영팀이 준비하고 있습니다. 글 카드는 지금도 만드실 수 있습니다.",
        code: "GENERATOR_UNAVAILABLE",
      }, { status: 503 });
    }
    const msg = e instanceof Error ? e.message : String(e);
    const nsfw = /nsfw/i.test(msg);
    const credits = /not enough credits/i.test(msg);
    return Response.json({ ok: false, error: msg.slice(0, 400), nsfw, credits }, { status: GENERATOR_REFUSED });
  }
}
