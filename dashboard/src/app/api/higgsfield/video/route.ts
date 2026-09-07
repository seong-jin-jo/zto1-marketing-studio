import path from "path";
import fs from "fs";
import { effectiveTenantId } from "@/lib/tenant-auth";
import { signMediaToken } from "@/lib/media-token";
import { runWithTenant } from "@/lib/tenant-context";
import { hfRun, extractJson, findResultUrl, downloadTo, addNarration, logGen, recordMediaGenerationEvent, HiggsfieldUnavailableError, HiggsfieldUnauthenticatedError, assertHiggsfieldReady, studioDir, assetUrl } from "@/lib/higgsfield";

// POST /api/higgsfield/video — image→video. body: { localPath, prompt, model?, narration? }
// localPath = /api/higgsfield/image 가 반환한 서버측 절대경로(CLI가 자동 업로드).
// model 기본 minimax_hailuo(6cr) — 무음. narration 주면 생성 후 TTS 음성 ffmpeg 합성(소리 추가).
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
  const { localPath, prompt, model = "minimax_hailuo", narration = "", label = "" } = body;
  if (!localPath || !fs.existsSync(localPath)) {
    return Response.json({ error: "valid localPath required (먼저 /api/higgsfield/image 호출)" }, { status: 400 });
  }
  // 이미지와 같은 이유로 작업 공간을 남긴다(2026-09-06 고객 개방).
  const tenantId = await effectiveTenantId(request, body.tenant_id);
  if (!tenantId) return Response.json({ error: "테넌트를 식별할 수 없습니다." }, { status: 401 });
  const motion = prompt || "subtle idle motion, gentle sway and glow, fixed camera, smooth";
  // Marketing Studio(UGC/제품광고)는 mode·aspect_ratio 파라미터 필요 → 모델별 분기
  const extra = model.startsWith("marketing_studio")
    ? ["--mode", "ugc", "--aspect_ratio", "9:16"]
    : [];
  try {
    await assertHiggsfieldReady();
    const { stdout } = await hfRun([
      "generate", "create", model,
      "--image", localPath, "--prompt", motion, ...extra,
      "--wait", "--wait-timeout", "10m", "--json",
    ]);
    const data = extractJson(stdout);
    const status = JSON.stringify(data ?? "").match(/"status"\s*:\s*"([^"]+)"/)?.[1] || "";
    if (/nsfw/i.test(status)) {
      return Response.json({ ok: false, error: "이 주제는 생성기가 만들 수 없다고 했습니다. 글감이나 결을 바꿔 다시 시도해 주세요.", nsfw: true }, { status: GENERATOR_REFUSED });
    }
    const url = findResultUrl(data, /mp4|webm|mov/);
    if (!url) return Response.json({ ok: false, error: "생성기가 영상을 만들지 못했습니다. 잠시 후 다시 시도해 주세요.", status, raw: stdout.slice(-400) }, { status: GENERATOR_REFUSED });

    const ts = Date.now();
    const silentPath = path.join(studioDir(tenantId), `vidsilent_${ts}.mp4`);
    await downloadTo(url, silentPath);

    // 무음 클립에 내레이션 음성 합성 (성공 시 사운드 영상, 실패/비-mac이면 무음 유지)
    let finalName = `vidsilent_${ts}.mp4`;
    let hasAudio = false;
    const narrationRequested = Boolean(narration && String(narration).trim());
    let narrationReason: "server_tts_unavailable" | "audio_mix_failed" | undefined;
    if (narration && String(narration).trim()) {
      const soundName = `vid_${ts}.mp4`;
      const narrationResult = await addNarration(silentPath, String(narration), path.join(studioDir(tenantId), soundName));
      if (narrationResult.ok) {
        finalName = soundName;
        hasAudio = true;
      } else if (narrationResult.reason !== "narration_empty") {
        narrationReason = narrationResult.reason;
      }
    }
    runWithTenant(tenantId, () => logGen("video", model, label));
    await recordMediaGenerationEvent(tenantId, "video", model, label);
    const narrationMessage = narrationReason === "server_tts_unavailable"
      ? "내레이션 없이 생성됨 (서버에 TTS 실행기가 없음)"
      : narrationReason === "audio_mix_failed"
        ? "내레이션 없이 생성됨 (TTS 오디오 합성 실패)"
        : undefined;
    return Response.json({
      ok: true,
      url,
      file: deliverUrl(tenantId, finalName),
      model,
      hasAudio,
      narration: {
        requested: narrationRequested,
        included: hasAudio,
        ...(narrationReason ? { reason: narrationReason } : {}),
        ...(narrationMessage ? { message: narrationMessage } : {}),
      },
    });
  } catch (e) {
    if (e instanceof HiggsfieldUnauthenticatedError) {
      return Response.json({
        error: "영상 생성기에 로그인되어 있지 않습니다. 서버에서 생성기 로그인을 한 번 해 주시면 바로 쓰실 수 있습니다.",
        code: "GENERATOR_UNAUTHENTICATED",
      }, { status: 503 });
    }
    if (e instanceof HiggsfieldUnavailableError) {
      return Response.json({
        error: "영상 생성기가 아직 이 서버에 준비되지 않았습니다. 준비되면 바로 쓰실 수 있습니다.",
        code: "GENERATOR_UNAVAILABLE",
      }, { status: 503 });
    }
    const msg = e instanceof Error ? e.message : String(e);
    return Response.json({ ok: false, error: msg.slice(0, 400), nsfw: /nsfw/i.test(msg), credits: /not enough credits/i.test(msg) }, { status: GENERATOR_REFUSED });
  }
}
