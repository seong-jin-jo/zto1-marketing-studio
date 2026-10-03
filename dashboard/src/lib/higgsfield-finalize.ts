// Higgsfield 비동기 작업 "마무리 처리"의 정본 — GET /api/higgsfield/job/[id]와 서버측
// 백그라운드 완료 루프(higgsfield-background-poll.ts)가 이 함수 하나를 공유한다.
//
// 왜 공유해야 하나(세션맥락 2026-10-02): 화면 GET만 결과를 회수하던 때는, 탭이 백그라운드로
// 묶이거나 사용자가 생성실을 닫으면 완료 처리 자체가 일어나지 않았다(22분 소실 실측).
// 접수 직후 서버 프로세스 안에서 스스로 확인·완료 처리하는 루프를 돌리려면, GET 라우트가
// 이미 갖고 있던 "진행 중 락(TTL)·멱등 반환·결과 해석" 로직을 라우트 밖으로 꺼내 두
// 호출자가 똑같이 쓰게 해야 한다.
import path from "path";
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
import { withHiggsfieldConcurrency } from "@/lib/higgsfield-concurrency";

export const GENERATOR_REFUSED = 200;
// 이 락에 만료가 없으면 processing을 찍은 호출이 서버 재시작·타임아웃·예외로 중간에 죽을 때
// 그 작업이 영원히 "진행 중"에 갇힌다(2026-10-02 리뷰 MAJOR 4). 5분 넘은 processing은 죽은
// 락으로 보고 회수한다.
export const PROCESSING_LOCK_TTL_MS = 5 * 60 * 1000;

export interface HiggsfieldFinalizeOutcome {
  httpStatus: number;
  body: Record<string, unknown>;
}

function deliverUrl(tenantId: string, filename: string): string {
  const token = signMediaToken(tenantId, filename);
  return token ? `/api/media/${encodeURIComponent(token)}` : assetUrl(tenantId, filename);
}

// 같은 프로세스 안에서 같은 작업을 동시에(화면 GET + 서버 백그라운드 루프, 혹은 겹친 두
// 번의 GET) 마무리 처리하지 않도록 직렬화한다. 파일 기반 processing 락(위 TTL)은 프로세스
// 재시작·다중 인스턴스에 대비한 바깥쪽 방어선이고, 이 인메모리 맵은 "지금 이 프로세스 안의
// 동시 호출"을 완전히 하나로 합쳐 더블 다운로드·더블 usage_events 기록을 막는다.
const inFlight = new Map<string, Promise<HiggsfieldFinalizeOutcome | null>>();

export function finalizeHiggsfieldJob(tenantId: string, jobId: string): Promise<HiggsfieldFinalizeOutcome | null> {
  const key = `${tenantId}:${jobId}`;
  const existing = inFlight.get(key);
  if (existing) return existing;
  const p = finalizeHiggsfieldJobInner(tenantId, jobId).finally(() => {
    if (inFlight.get(key) === p) inFlight.delete(key);
  });
  inFlight.set(key, p);
  return p;
}

/** 테스트 전용 — 모듈 전역 상태를 초기화한다. */
export function __resetHiggsfieldFinalizeForTest(): void {
  inFlight.clear();
}

async function finalizeHiggsfieldJobInner(
  tenantId: string,
  jobId: string,
): Promise<HiggsfieldFinalizeOutcome | null> {
  const job = readHiggsfieldJob(tenantId, jobId);
  // 다른 테넌트 것이거나 애초에 없는 jobId — 호출부가 이를 404로 번역한다.
  if (!job) return null;

  // 이미 끝난 작업은 저장된 결과를 그대로 반환 — 재조회·재다운로드·재기록 없음(멱등).
  if (job.status === "completed") {
    return { httpStatus: 200, body: job.result ?? { ok: true } };
  }
  if (job.status === "failed") {
    return {
      httpStatus: GENERATOR_REFUSED,
      body: job.result ?? { ok: false, error: job.error || "생성에 실패했습니다." },
    };
  }

  if (job.status === "processing") {
    const lockAgeMs = Date.now() - job.updatedAt;
    if (lockAgeMs < PROCESSING_LOCK_TTL_MS) {
      return { httpStatus: 200, body: { ok: true, status: "processing", jobId: job.jobId } };
    }
    // 락이 5분 넘게 안 풀렸다 — 그 호출이 죽었다고 보고 회수해 이번 호출이 다시 시도한다.
  }
  updateHiggsfieldJob(tenantId, jobId, { status: "processing" });

  try {
    await assertHiggsfieldReady();
    // hfRun을 직접 쓴다(별도 hfGetJob 래퍼 대신) — 테스트가 hfRun 하나만 mock해도 이
    // 조회 호출까지 함께 잡히게 하기 위함. 전체 동시 생성기 호출 상한을 여기서 건다.
    const { stdout } = await withHiggsfieldConcurrency(() =>
      hfRun(["generate", "get", job.providerJobId, "--json"], 20000),
    );
    const data = extractJson(stdout);
    const cliStatus = normalizeJobStatus(data, stdout);

    if (cliStatus === "pending") {
      // 아직 큐·진행 중. 다음 폴링에서 다시 물을 수 있도록 queued로 되돌린다.
      updateHiggsfieldJob(tenantId, jobId, { status: "queued" });
      return { httpStatus: 200, body: { ok: true, status: "queued", jobId: job.jobId } };
    }

    if (cliStatus === "failed") {
      const txt = JSON.stringify(data ?? "");
      const nsfw = /nsfw/i.test(txt) || /nsfw/i.test(stdout);
      const error = nsfw
        ? "이 주제는 생성기가 만들 수 없다고 했습니다. 글감이나 결을 바꿔 다시 시도해 주세요."
        : `${job.kind === "image" ? "이미지" : "영상"}를 만들지 못했습니다. 잠시 후 다시 시도해 주세요.`;
      const result = { ok: false, error, nsfw, raw: stdout.slice(-400) };
      updateHiggsfieldJob(tenantId, jobId, { status: "failed", result, error });
      return { httpStatus: GENERATOR_REFUSED, body: result };
    }

    // cliStatus === "done"
    if (job.kind === "image") {
      const input = job.input as HiggsfieldImageJobInput;
      const url = findResultUrl(data, /png|jpg|jpeg|webp/);
      if (!url) {
        const result = { ok: false, error: "생성기가 이미지를 만들지 못했습니다. 잠시 후 다시 시도해 주세요.", raw: stdout.slice(-400) };
        updateHiggsfieldJob(tenantId, jobId, { status: "failed", result, error: result.error });
        return { httpStatus: GENERATOR_REFUSED, body: result };
      }
      const ext = (url.split("?")[0].match(/\.(png|jpe?g|webp)$/i)?.[0] || ".webp").toLowerCase();
      const fname = `img_${Date.now()}${ext}`;
      const localPath = path.join(studioDir(tenantId), fname);
      await downloadTo(url, localPath);
      runWithTenant(tenantId, () => logGen("image", "Higgsfield Soul V2", input.label));
      await recordMediaGenerationEvent(tenantId, "image", "Higgsfield Soul V2", input.label);
      const result = { ok: true, url, file: deliverUrl(tenantId, fname), filename: fname };
      updateHiggsfieldJob(tenantId, jobId, { status: "completed", result });
      return { httpStatus: 200, body: result };
    }

    // video
    const input = job.input as HiggsfieldVideoJobInput;
    const url = findResultUrl(data, /mp4|webm|mov/);
    if (!url) {
      const result = { ok: false, error: "생성기가 영상을 만들지 못했습니다. 잠시 후 다시 시도해 주세요.", raw: stdout.slice(-400) };
      updateHiggsfieldJob(tenantId, jobId, { status: "failed", result, error: result.error });
      return { httpStatus: GENERATOR_REFUSED, body: result };
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
    return { httpStatus: 200, body: result };
  } catch (e) {
    // 2026-10-01 PR #98(main dda88ef6) 재발 방지: 운영 측 자격증명 문제를 고객 계정
    // 탓으로 오해하게 만드는 서버-작업-지시 투 문구는 금지다(회장 질책). image/video
    // POST 라우트와 같은 고객 관점 문구로 맞춘다. image/video POST 라우트(PR #98)와
    // 정확히 같은 문자열을 매체별로 쓴다 — 정적 소스 그렙 테스트
    // (higgsfield-customer-facing-copy.regression-1.test.ts)가 큰따옴표 리터럴을
    // 전제하므로 템플릿 리터럴 보간을 쓰지 않고 if/else로 분기한다.
    if (e instanceof HiggsfieldUnauthenticatedError) {
      const result = job.kind === "image"
        ? {
          error: "이미지 생성 서비스 연결이 잠시 끊겼습니다. 계정 로그인 문제는 아니며 운영팀이 복구하고 있습니다. 글 카드는 지금도 만드실 수 있습니다.",
          code: "GENERATOR_UNAUTHENTICATED",
        }
        : {
          error: "영상 생성 서비스 연결이 잠시 끊겼습니다. 계정 로그인 문제는 아니며 운영팀이 복구하고 있습니다. 글 카드는 지금도 만드실 수 있습니다.",
          code: "GENERATOR_UNAUTHENTICATED",
        };
      updateHiggsfieldJob(tenantId, jobId, { status: "queued" }); // 일시적 상태 — 재시도 가능하게 락 해제
      return { httpStatus: 503, body: result };
    }
    if (e instanceof HiggsfieldUnavailableError) {
      const result = job.kind === "image"
        ? {
          error: "이미지 생성 서비스가 아직 준비되지 않았습니다. 계정 로그인 문제는 아니며 운영팀이 준비하고 있습니다. 글 카드는 지금도 만드실 수 있습니다.",
          code: "GENERATOR_UNAVAILABLE",
        }
        : {
          error: "영상 생성 서비스가 아직 준비되지 않았습니다. 계정 로그인 문제는 아니며 운영팀이 준비하고 있습니다. 글 카드는 지금도 만드실 수 있습니다.",
          code: "GENERATOR_UNAVAILABLE",
        };
      updateHiggsfieldJob(tenantId, jobId, { status: "queued" });
      return { httpStatus: 503, body: result };
    }
    // 조회 자체가 일시 오류(네트워크 등)면 작업을 실패로 확정하지 않고 다음 폴링이
    // 재시도할 수 있게 queued로 되돌린다 — 조용히 영구 실패로 떨어뜨리지 않는다.
    updateHiggsfieldJob(tenantId, jobId, { status: "queued" });
    // 2026-10-02 리뷰 MINOR: execFile 오류 메시지엔 실행한 명령 전체(프롬프트 포함)가
    // 그대로 들어 있을 수 있다(hfRun 주석 참고). 서버 로그에는 원문을 남기되, 고객에게는
    // 고객 관점 문구만 내보낸다.
    const msg = e instanceof Error ? e.message : String(e);
    console.error(JSON.stringify({ kind: "hf_job_finalize_transient_error", jobId, tenantId, reason: msg.slice(0, 500) }));
    return { httpStatus: 200, body: { ok: true, status: "queued", jobId } };
  }
}
