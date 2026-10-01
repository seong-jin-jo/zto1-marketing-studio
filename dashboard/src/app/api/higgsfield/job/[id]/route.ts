import path from "path";
import { effectiveTenantId } from "@/lib/tenant-auth";
import { signMediaToken } from "@/lib/media-token";
import { runWithTenant } from "@/lib/tenant-context";
import {
  hfRun, extractJson, findResultUrl, downloadTo, addNarration, logGen,
  recordMediaGenerationEvent, HiggsfieldUnavailableError, HiggsfieldUnauthenticatedError,
  assertHiggsfieldReady, studioDir, assetUrl, normalizeJobStatus,
} from "@/lib/higgsfield";
import {
  readHiggsfieldJob, updateHiggsfieldJob,
  type HiggsfieldImageJobInput, type HiggsfieldVideoJobInput,
} from "@/lib/higgsfield-jobs";

// GET /api/higgsfield/job/[id] — 비동기 생성 작업 상태 조회(비동기 전환 2026-10-01).
//
// - 완료/실패로 이미 저장돼 있으면 재조회 없이 그 결과를 그대로 돌려준다(멱등 — 두 번
//   호출해도 다운로드·usage_events 기록이 두 번 일어나지 않는다).
// - 진행 중이면 상태를 "processing"으로 먼저 찍어 락처럼 쓴 뒤(동시 요청 이중 후처리 방지)
//   `higgsfield generate get <id> --json`을 1회 호출해 결과를 반영한다.
// - 타 테넌트의 jobId로 조회하면 작업 존재 자체를 알리지 않고 404.
const GENERATOR_REFUSED = 200;

type RouteContext = { params: Promise<{ id: string }> };

function deliverUrl(tenantId: string, filename: string): string {
  const token = signMediaToken(tenantId, filename);
  return token ? `/api/media/${encodeURIComponent(token)}` : assetUrl(tenantId, filename);
}

export async function GET(request: Request, context: RouteContext) {
  const { id: jobId } = await context.params;
  const tenantId = await effectiveTenantId(request, new URL(request.url).searchParams.get("tenant_id"));
  if (!tenantId) return Response.json({ error: "테넌트를 식별할 수 없습니다." }, { status: 401 });
  if (!jobId) return Response.json({ error: "job id required" }, { status: 400 });

  const job = readHiggsfieldJob(tenantId, jobId);
  // 다른 테넌트 것이거나 애초에 없는 jobId — 존재를 알리지 않는다.
  if (!job) return Response.json({ error: "작업을 찾을 수 없습니다." }, { status: 404 });

  // 이미 끝난 작업은 저장된 결과를 그대로 반환 — 재조회·재다운로드·재기록 없음(멱등).
  if (job.status === "completed") {
    return Response.json(job.result ?? { ok: true });
  }
  if (job.status === "failed") {
    return Response.json(job.result ?? { ok: false, error: job.error || "생성에 실패했습니다." }, { status: GENERATOR_REFUSED });
  }

  // 동시 요청(두 탭, 짧은 폴링 간격)이 같은 작업을 동시에 "완료 처리"하지 않도록, 조회를
  // 시작하는 즉시 processing으로 찍어 락처럼 쓴다. 이미 processing이면 이번 호출은 CLI를
  // 다시 부르지 않고 "아직 진행 중"으로만 답한다 — 더블 다운로드·더블 usage_events 방지.
  if (job.status === "processing") {
    return Response.json({ ok: true, status: "processing", jobId: job.jobId });
  }
  updateHiggsfieldJob(tenantId, jobId, { status: "processing" });

  try {
    await assertHiggsfieldReady();
    // hfRun을 직접 쓴다(별도 hfGetJob 래퍼 대신) — 테스트가 hfRun 하나만 mock해도 이
    // 조회 호출까지 함께 잡히게 하기 위함.
    const { stdout } = await hfRun(["generate", "get", job.providerJobId, "--json"], 20000);
    const data = extractJson(stdout);
    const cliStatus = normalizeJobStatus(data, stdout);

    if (cliStatus === "pending") {
      // 아직 큐·진행 중. 다음 폴링에서 다시 물을 수 있도록 queued로 되돌린다.
      updateHiggsfieldJob(tenantId, jobId, { status: "queued" });
      return Response.json({ ok: true, status: "queued", jobId: job.jobId });
    }

    if (cliStatus === "failed") {
      const txt = JSON.stringify(data ?? "");
      const nsfw = /nsfw/i.test(txt) || /nsfw/i.test(stdout);
      const error = nsfw
        ? "이 주제는 생성기가 만들 수 없다고 했습니다. 글감이나 결을 바꿔 다시 시도해 주세요."
        : `${job.kind === "image" ? "이미지" : "영상"}를 만들지 못했습니다. 잠시 후 다시 시도해 주세요.`;
      const result = { ok: false, error, nsfw, raw: stdout.slice(-400) };
      updateHiggsfieldJob(tenantId, jobId, { status: "failed", result, error });
      return Response.json(result, { status: GENERATOR_REFUSED });
    }

    // cliStatus === "done"
    if (job.kind === "image") {
      const input = job.input as HiggsfieldImageJobInput;
      const url = findResultUrl(data, /png|jpg|jpeg|webp/);
      if (!url) {
        const result = { ok: false, error: "생성기가 이미지를 만들지 못했습니다. 잠시 후 다시 시도해 주세요.", raw: stdout.slice(-400) };
        updateHiggsfieldJob(tenantId, jobId, { status: "failed", result, error: result.error });
        return Response.json(result, { status: GENERATOR_REFUSED });
      }
      const ext = (url.split("?")[0].match(/\.(png|jpe?g|webp)$/i)?.[0] || ".webp").toLowerCase();
      const fname = `img_${Date.now()}${ext}`;
      const localPath = path.join(studioDir(tenantId), fname);
      await downloadTo(url, localPath);
      runWithTenant(tenantId, () => logGen("image", "Higgsfield Soul V2", input.label));
      await recordMediaGenerationEvent(tenantId, "image", "Higgsfield Soul V2", input.label);
      const result = { ok: true, url, file: deliverUrl(tenantId, fname), filename: fname };
      updateHiggsfieldJob(tenantId, jobId, { status: "completed", result });
      return Response.json(result);
    }

    // video
    const input = job.input as HiggsfieldVideoJobInput;
    const url = findResultUrl(data, /mp4|webm|mov/);
    if (!url) {
      const result = { ok: false, error: "생성기가 영상을 만들지 못했습니다. 잠시 후 다시 시도해 주세요.", raw: stdout.slice(-400) };
      updateHiggsfieldJob(tenantId, jobId, { status: "failed", result, error: result.error });
      return Response.json(result, { status: GENERATOR_REFUSED });
    }
    const ts = Date.now();
    const silentPath = path.join(studioDir(tenantId), `vidsilent_${ts}.mp4`);
    await downloadTo(url, silentPath);

    let finalName = `vidsilent_${ts}.mp4`;
    let hasAudio = false;
    const narrationRequested = Boolean(input.narration && input.narration.trim());
    let narrationReason: "server_tts_unavailable" | "audio_mix_failed" | undefined;
    if (narrationRequested) {
      const soundName = `vid_${ts}.mp4`;
      const narrationResult = await addNarration(silentPath, input.narration, path.join(studioDir(tenantId), soundName));
      if (narrationResult.ok) {
        finalName = soundName;
        hasAudio = true;
      } else if (narrationResult.reason !== "narration_empty") {
        narrationReason = narrationResult.reason;
      }
    }
    runWithTenant(tenantId, () => logGen("video", input.model, input.label));
    await recordMediaGenerationEvent(tenantId, "video", input.model, input.label);
    const narrationMessage = narrationReason === "server_tts_unavailable"
      ? "내레이션 없이 생성됨 (서버에 TTS 실행기가 없음)"
      : narrationReason === "audio_mix_failed"
        ? "내레이션 없이 생성됨 (TTS 오디오 합성 실패)"
        : undefined;
    const result = {
      ok: true,
      url,
      file: deliverUrl(tenantId, finalName),
      model: input.model,
      hasAudio,
      narration: {
        requested: narrationRequested,
        included: hasAudio,
        ...(narrationReason ? { reason: narrationReason } : {}),
        ...(narrationMessage ? { message: narrationMessage } : {}),
      },
    };
    updateHiggsfieldJob(tenantId, jobId, { status: "completed", result });
    return Response.json(result);
  } catch (e) {
    if (e instanceof HiggsfieldUnauthenticatedError) {
      const result = {
        error: "생성기에 로그인되어 있지 않습니다. 서버에서 생성기 로그인을 한 번 해 주시면 바로 쓰실 수 있습니다.",
        code: "GENERATOR_UNAUTHENTICATED",
      };
      updateHiggsfieldJob(tenantId, jobId, { status: "queued" }); // 일시적 상태 — 재시도 가능하게 락 해제
      return Response.json(result, { status: 503 });
    }
    if (e instanceof HiggsfieldUnavailableError) {
      const result = {
        error: "생성기가 아직 이 서버에 준비되지 않았습니다. 준비되면 바로 쓰실 수 있습니다.",
        code: "GENERATOR_UNAVAILABLE",
      };
      updateHiggsfieldJob(tenantId, jobId, { status: "queued" });
      return Response.json(result, { status: 503 });
    }
    // 조회 자체가 일시 오류(네트워크 등)면 작업을 실패로 확정하지 않고 다음 폴링이
    // 재시도할 수 있게 queued로 되돌린다 — 조용히 영구 실패로 떨어뜨리지 않는다.
    updateHiggsfieldJob(tenantId, jobId, { status: "queued" });
    const msg = e instanceof Error ? e.message : String(e);
    return Response.json({ ok: true, status: "queued", jobId, warning: msg.slice(0, 200) });
  }
}
