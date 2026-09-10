import path from "path";
import { effectiveTenantId } from "@/lib/tenant-auth";
import { signMediaToken } from "@/lib/media-token";
import { runWithTenant } from "@/lib/tenant-context";
import { toGeneratorRatio } from "@/lib/generator-aspect-ratio";
import { hfRun, extractJson, findResultUrl, downloadTo, logGen, recordMediaGenerationEvent, HiggsfieldUnavailableError, HiggsfieldUnauthenticatedError, assertHiggsfieldReady, studioDir, assetUrl } from "@/lib/higgsfield";

// POST /api/higgsfield/image — Soul V2 text→image. body: { prompt, aspectRatio?, quality?, label? }
// 반환: { url(cloudfront), file(/studio-assets/..), localPath } — video 단계에서 localPath 재사용
// img·video 태그는 인증 헤더를 못 붙인다. 그래서 헤더 인증만 있는 자산 경로로는 화면에
// 아무것도 안 뜬다. 이미 있는 서명 배달 경로로 돌려준다. 서명이 없으면(비밀 미설정)
// 종전 자산 경로로 떨어뜨려 최소한 운영자 화면에서는 보이게 한다.
// 2026-09-08 실측: 생성기가 거절한 요청에 502 로 답했더니, 우리 앞의 리버스 프록시가
// 우리 JSON 본문을 자기 HTML 오류 페이지로 갈아치웠다. 그래서 화면에는 "Request failed: 502"
// 나 "Load failed" 만 뜨고 진짜 이유(막힌 주제·잔액 부족)는 한 번도 사용자에게 닿지 못했다.
// 나조차 재생성 기능이 고장 난 줄 알고 한참을 팠다. 영상 발행 경로에서 같은 이유로 이미
// 한 번 겪은 일이다.
//
// 502 는 "게이트웨이가 상류에서 잘못된 응답을 받았다" 는 뜻이라 프록시가 개입할 여지를 준다.
// 우리가 하려는 말은 "요청은 정상 처리했고 생성기가 거절했다" 이므로 그 뜻에 맞게 답한다.
const GENERATOR_REFUSED = 200;

function deliverUrl(tenantId: string, filename: string): string {
  const token = signMediaToken(tenantId, filename);
  return token ? `/api/media/${encodeURIComponent(token)}` : assetUrl(tenantId, filename);
}

export async function POST(request: Request) {
  const body = await request.json();
  const { prompt, aspectRatio = "9:16", quality = "1.5k", label = "" } = body;
  if (!prompt || typeof prompt !== "string") {
    return Response.json({ error: "prompt required" }, { status: 400 });
  }
  // 누가 만든 것인지 남겨야 사용량과 이력이 작업 공간별로 갈린다. 고객에게 생성을
  // 연 이상 이것이 없으면 모두의 이력이 한 파일에 섞인다(2026-09-06).
  const tenantId = await effectiveTenantId(request, body.tenant_id);
  if (!tenantId) return Response.json({ error: "테넌트를 식별할 수 없습니다." }, { status: 401 });
  // 2026-09-06: 생성 요청이 Cloudflare 502(Host Error)로 끝나는데 컨테이너 로그에 아무것도
  // 남지 않아 어느 단계가 죽는지 알 수 없었다. 단계 표식을 남겨 다음 시도 한 번이면 특정된다.
  const mark = (step: string, extra?: string) =>
    console.log(JSON.stringify({ kind: "hf_image_step", step, extra: extra?.slice(0, 300) }));
  try {
    mark("ready:start");
    await assertHiggsfieldReady();
    mark("ready:ok");
    const { stdout } = await hfRun([
      "generate", "create", "text2image_soul_v2",
      // 생성기가 아는 화면비로 옮겨 보낸다. 4:5 같은 우리 규격을 그대로 넘기면
      // "Invalid values" 로 끝난다(2026-09-10 실측).
      "--prompt", prompt, "--aspect_ratio", toGeneratorRatio(aspectRatio), "--quality", quality,
      "--wait", "--json",
    ]);
    mark("run:ok", `stdout=${stdout.length}`);
    const url = findResultUrl(extractJson(stdout), /png|jpg|jpeg|webp/);
    if (!url) return Response.json({ ok: false, error: "생성기가 이미지를 만들지 못했습니다. 잠시 후 다시 시도해 주세요.", raw: stdout.slice(-400) }, { status: GENERATOR_REFUSED });

    // 종전에는 공용 루트에 저장하고 주소도 테넌트 없이 돌려줬다. 그런데 자산 라우트는
    // 테넌트 폴더에서만 읽고 tenant_id 를 요구한다. 그래서 만들기는 성공하는데 화면에서
    // 그림이 안 뜨는 상태였다(회장 2026-09-07 실사용). 저장과 주소를 테넌트로 맞춘다.
    // 생성기가 주는 파일은 png 가 아닐 수 있다(실제로 webp 를 준다). 이름을 png 로 굳혀
    // 두면 배달할 때 종류를 잘못 알려 주게 되고, 브라우저는 그림 그리기를 거부한다.
    // 만들기는 성공하는데 화면만 비어 "생성이 안 된다" 로 읽힌다(2026-09-08 회장 실사용).
    const ext = (url.split("?")[0].match(/\.(png|jpe?g|webp)$/i)?.[0] || ".webp").toLowerCase();
    const fname = `img_${Date.now()}${ext}`;
    const localPath = path.join(studioDir(tenantId), fname);
    await downloadTo(url, localPath);
    runWithTenant(tenantId, () => logGen("image", "Higgsfield Soul V2", label));
    await recordMediaGenerationEvent(tenantId, "image", "Higgsfield Soul V2", label);
    return Response.json({ ok: true, url, file: deliverUrl(tenantId, fname), localPath });
  } catch (e) {
    mark("catch", e instanceof Error ? `${e.name}: ${e.message}` : String(e));
    if (e instanceof HiggsfieldUnauthenticatedError) {
      return Response.json({
        error: "이미지 생성기에 로그인되어 있지 않습니다. 서버에서 생성기 로그인을 한 번 해 주시면 바로 쓰실 수 있습니다.",
        code: "GENERATOR_UNAUTHENTICATED",
      }, { status: 503 });
    }
    if (e instanceof HiggsfieldUnavailableError) {
      return Response.json({
        error: "이미지 생성기가 아직 이 서버에 준비되지 않았습니다. 준비되면 바로 쓰실 수 있습니다.",
        code: "GENERATOR_UNAVAILABLE",
      }, { status: 503 });
    }
    const msg = e instanceof Error ? e.message : String(e);
    const nsfw = /nsfw/i.test(msg);
    const credits = /not enough credits/i.test(msg);
    return Response.json({ ok: false, error: msg.slice(0, 400), nsfw, credits }, { status: GENERATOR_REFUSED });
  }
}
