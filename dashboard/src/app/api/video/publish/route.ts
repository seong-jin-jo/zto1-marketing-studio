import fs from "fs";
import path from "path";
import { dataPath } from "@/lib/file-io";
import { tenantMediaDir } from "@/lib/storage";
import { effectiveTenantId } from "@/lib/tenant-auth";
import { runWithTenant } from "@/lib/tenant-context";
import crypto from "crypto";
import { getChannelCred, publishInstagramReels } from "@/lib/publish";
import { refreshYoutubeAccessToken } from "@/lib/youtube-token";
import { withTenant } from "@/lib/db";
import { signMediaToken } from "@/lib/media-token";
import { canonicalPublicOrigin } from "@/lib/social-connect";
import { MAX_VIDEO_BYTES, MAX_VIDEO_MIB } from "@/lib/video-limits";
import {
  queryTikTokCreatorInfo,
  startTikTokVideoPost,
  TIKTOK_PRIVACY_LEVELS,
  type TikTokPrivacyLevel,
} from "@/lib/tiktok";

// SNS-015 Reels 제약: published_posts에 기록되는 플랫폼 키(대시보드 SSOT)와 허용 영상 형식/용량.
const REELS_PLATFORM = "instagram_reels";
const REELS_VIDEO_EXTS = new Set([".mp4", ".mov"]);
// 업로드 상한과 **같은 상수**를 쓴다 — 업로드는 통과했는데 발행에서 되튕기는 불일치 방지.
const REELS_MAX_BYTES = MAX_VIDEO_BYTES;
// Instagram 캡션 상한(공식 콘텐츠 발행 가이드) — 프로바이더 호출 전에 여기서 먼저 거른다.
const REELS_MAX_CAPTION = 2200;
// YouTube API 상한(snippet.title 100자 / snippet.description 5000자 / tags). 초과분을 그대로 보내면
// 초기화가 400으로 실패하므로 사용자에게 이유를 먼저 알려준다.
// ⚠ 이 값들은 **YouTube 분기에서만** 적용한다 — Reels는 제목+설명을 합쳐 2200자 캡션 하나로
// 보내므로 YouTube의 100자 제목 규칙을 전역 적용하면 정상 캡션이 잘못 거부된다.
const YT_MAX_TITLE = 100;
const YT_MAX_DESCRIPTION = 5000;
const TIKTOK_VIDEO_EXTS = new Set([".mp4", ".mov", ".webm"]);
const TIKTOK_MAX_CAPTION = 2200;
const TIKTOK_MEDIA_TTL_MS = 65 * 60 * 1000;
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

// finding 6: VIDEO_OUTPUT_DIR을 module scope 상수(`const VIDEO_OUTPUT_DIR = dataPath("videos")`)로
// 두면 import 시점(모듈 최초 로드, 요청/테넌트 컨텍스트 밖)에 단 한 번 dataPath()가 평가된다 —
// 그 시점엔 runWithTenant AsyncLocalStorage 컨텍스트가 없어 tenantSeg()가 항상 ""(공유 루트)로
// 고정되고, 이후 모든 요청(테넌트 무관)이 같은 경로를 공유하게 된다. 파일명은 사용자 입력이라
// 테넌트 간 파일 존재 유무·경로가 새는 구조. 반드시 요청 핸들러 "안", tenantId가 확정된
// runWithTenant(tenantId, ...) 컨텍스트 안에서만 dataPath()를 호출한다.
/**
 * 올릴 영상 파일을 찾는다.
 *
 * 2026-09-07: 이 경로가 옛 영상 폴더(data/videos) 한 곳만 봤다. 그런데 생성실이 만든
 * 숏폼 영상은 작업 공간 폴더(data/studio/{작업공간})에 떨어진다. 그래서 발행실에서 만든
 * 영상을 이 경로로 올리면 파일이 있는데도 "video not found" 로 끝난다. 오늘 아침 배달
 * 경로에서 똑같은 이유로 화면에 영상이 안 뜬 일이 있었고 그때는 배달 쪽만 고쳤다.
 * 발행 쪽에 같은 구멍이 남아 있었다.
 *
 * 배달 경로(api/media/[token])가 쓰는 것과 같은 두 곳을 같은 순서로 본다. 한쪽만 보면
 * 못 찾는다는 사실이 두 곳에 따로 적혀 있으면 다음에 또 어긋난다.
 */
function resolveVideoPath(tenantId: string, filename: string): string | null {
  const dirs: string[] = [dataPath("videos")];
  try {
    // 작업 공간 식별자가 비었거나 형식이 틀리면 이 함수가 예외를 던진다. 탐색이 그것 때문에
    // 죽으면 옛 폴더에 있는 영상까지 못 올린다. 한 곳이라도 볼 수 있으면 본다.
    if (tenantId) dirs.push(tenantMediaDir(tenantId));
  } catch { /* 작업 공간 폴더는 건너뛴다 */ }
  for (const dir of dirs) {
    const fp = path.join(dir, filename);
    // 파일명은 위에서 이미 구분자·상위경로를 막았으므로 존재 확인만으로 충분하다.
    if (fs.existsSync(fp)) return fp;
  }
  return null;
}

// published_posts.draft_id는 UUID라서, 동일한 발행 의도를 DB unique index로 직렬화할 수 있도록
// 안정적인 UUID 모양의 키를 유도한다. 캡션/공개범위/상호작용 옵션 중 하나라도 달라지면 새 발행이다.
function publishReservationKey(parts: readonly string[]): string {
  return crypto
    .createHash("sha256")
    .update(parts.join("\u0000"))
    .digest("hex")
    .replace(/^(.{8})(.{4})(.{4})(.{4})(.{12}).*$/, "$1-$2-$3-$4-$5");
}

export async function POST(request: Request) {
  // 잘못된 본문(빈 body·깨진 JSON·배열/문자열 등 비객체)은 500이 아니라 안정적인 400으로 끝낸다.
  let data: Record<string, unknown>;
  try {
    const parsed: unknown = await request.json();
    if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
      return Response.json({ error: "요청 본문은 JSON 객체여야 합니다." }, { status: 400 });
    }
    data = parsed as Record<string, unknown>;
  } catch {
    return Response.json({ error: "요청 본문을 JSON으로 읽을 수 없습니다." }, { status: 400 });
  }

  // 스칼라 문자열만 허용 — 배열/객체가 들어오면 아래 length·정규식 검사가 의도치 않게 통과한다.
  const scalarString = (v: unknown): v is string => typeof v === "string";
  if (data.filename !== undefined && !scalarString(data.filename)) {
    return Response.json({ error: "파일명 형식이 올바르지 않습니다." }, { status: 400 });
  }
  if (data.platform !== undefined && !scalarString(data.platform)) {
    return Response.json({ error: "플랫폼 형식이 올바르지 않습니다." }, { status: 400 });
  }
  const filename: string = scalarString(data.filename) ? data.filename : "";
  const title: string = data.title == null ? "" : (data.title as string);
  const description: string = data.description == null ? "" : (data.description as string);
  const tags: unknown = data.tags == null ? [] : data.tags;
  const platform: string = scalarString(data.platform) && data.platform ? data.platform : "youtube";
  const accountId: string | undefined = scalarString(data.account_id) && data.account_id ? data.account_id : undefined;

  if (!filename) {
    return Response.json({ error: "filename required" }, { status: 400 });
  }
  // path traversal 방지 — 파일명에 구분자/상위경로 금지(테넌트 스코프 디렉터리를 벗어나지 못하게).
  if (filename.includes("/") || filename.includes("\\") || filename.includes("..")) {
    return Response.json({ error: "invalid filename" }, { status: 400 });
  }

  // 입력 경계 — 프로바이더 호출 전에 전부 확정한다(잘못된 입력으로 외부 API/폴링을 낭비하지 않기).
  if (typeof title !== "string" || typeof description !== "string") {
    return Response.json({ error: "제목/설명 형식이 올바르지 않습니다." }, { status: 400 });
  }
  // 길이 상한은 플랫폼마다 다르므로 각 분기에서 검사한다(YouTube 100자 제목 규칙을 Reels에
  // 전역 적용하면 2200자 캡션이 잘못 거부된다).
  // account_id는 DB에서 ::uuid로 캐스팅된다 — 형식이 틀리면 쿼리 단계 에러가 되므로 여기서 거른다.
  if (accountId !== undefined && !UUID_RE.test(accountId)) {
    return Response.json({ error: "계정 식별자 형식이 올바르지 않습니다." }, { status: 400 });
  }
  if (filename.length > 200) {
    return Response.json({ error: "invalid filename" }, { status: 400 });
  }

  const tenantId = await effectiveTenantId(request, null);

  return runWithTenant(tenantId, async () => {
    const videoPath = resolveVideoPath(tenantId || "", filename);
    if (!videoPath) {
      return Response.json({ error: "video not found" }, { status: 404 });
    }

    if (platform === "youtube") {
      // SNS-006 SSOT 통일: /channels/youtube 연결 버튼이 저장하는 DB integrations를 그대로 읽는다
      // (과거엔 openclaw.json 파일을 별도로 읽어 연결해도 "credentials not configured"로 막혔다).
      if (!tenantId) return Response.json({ error: "테넌트를 확인할 수 없습니다." }, { status: 400 });
      // YouTube 전용 상한 — 이 분기에서만 적용한다.
      if (title.length > YT_MAX_TITLE) {
        return Response.json({ error: `제목은 최대 ${YT_MAX_TITLE}자입니다(현재 ${title.length}자).` }, { status: 400 });
      }
      if (description.length > YT_MAX_DESCRIPTION) {
        return Response.json({ error: `설명은 최대 ${YT_MAX_DESCRIPTION}자입니다(현재 ${description.length}자).` }, { status: 400 });
      }
      if (!Array.isArray(tags) || tags.length > 50 || tags.some((t) => typeof t !== "string" || t.length > 100)) {
        return Response.json({ error: "태그는 최대 50개, 각 100자 이내의 문자열이어야 합니다." }, { status: 400 });
      }

      const cred = await getChannelCred(tenantId, "youtube", accountId);
      let accessToken = cred?.token || "";
      if (!accessToken) {
        return Response.json(
          { error: "YouTube가 연결되지 않았습니다. /channels/youtube에서 YouTube OAuth 연결을 먼저 완료해주세요." },
          { status: 400 },
        );
      }

      try {
        const videoSize = fs.statSync(videoPath).size;
        const metadata = JSON.stringify({
          snippet: {
            title: title || filename,
            description: description || "Generated by Marketing Hub",
            tags: tags || [],
            categoryId: "27",
          },
          status: {
            privacyStatus: "public",
            selfDeclaredMadeForKids: false,
            madeForKids: false,
          },
        });

        // finding 5: 만료된 access_token으로 최초 시도 → 401이면 공유 헬퍼로 정확히 1회만
        // refresh 후 재시도(무한 재시도 루프 금지). 두 번째 시도도 실패하면 그대로 에러 반환.
        const initUploadOnce = (token: string) =>
          fetch(
            "https://www.googleapis.com/upload/youtube/v3/videos?uploadType=resumable&part=snippet,status",
            {
              method: "POST",
              headers: {
                Authorization: `Bearer ${token}`,
                "Content-Type": "application/json; charset=UTF-8",
                "X-Upload-Content-Type": "video/mp4",
                "X-Upload-Content-Length": String(videoSize),
              },
              body: metadata,
              signal: AbortSignal.timeout(15000),
            },
          );

        let initRes = await initUploadOnce(accessToken);
        if (initRes.status === 401) {
          const refreshed = await refreshYoutubeAccessToken(tenantId, accountId);
          if (!refreshed.ok || !refreshed.accessToken) {
            return Response.json(
              { error: refreshed.error || "YouTube 인증이 만료되었습니다. 다시 연결해주세요." },
              { status: 401 },
            );
          }
          accessToken = refreshed.accessToken;
          initRes = await initUploadOnce(accessToken);
        }

        if (!initRes.ok) {
          return Response.json({ error: `YouTube 업로드 초기화 실패 (오류 코드 ${initRes.status}).` }, { status: initRes.status === 401 ? 401 : 502 });
        }

        const uploadUrl = initRes.headers.get("Location");
        if (!uploadUrl) {
          return Response.json({ error: "Failed to get upload URL" }, { status: 500 });
        }

        // Step 2: Upload video
        const videoData = fs.readFileSync(videoPath);
        const uploadRes = await fetch(uploadUrl, {
          method: "PUT",
          headers: { "Content-Type": "video/mp4" },
          body: videoData,
          signal: AbortSignal.timeout(120000),
        });
        if (!uploadRes.ok) {
          return Response.json(
            { error: `YouTube 영상 업로드 실패 (오류 코드 ${uploadRes.status}).` },
            { status: 502 },
          );
        }
        let result: unknown;
        try {
          result = await uploadRes.json();
        } catch {
          return Response.json({ error: "YouTube 업로드 응답을 확인할 수 없습니다." }, { status: 502 });
        }
        const videoId =
          result && typeof result === "object" && typeof (result as { id?: unknown }).id === "string"
            ? (result as { id: string }).id.trim()
            : "";
        if (!videoId) {
          return Response.json({ error: "YouTube 업로드 결과에 영상 ID가 없습니다." }, { status: 502 });
        }

        return Response.json({
          ok: true,
          platform: "youtube",
          videoId,
          url: `https://youtube.com/shorts/${videoId}`,
        });
      } catch {
        // finding 7: provider raw 에러/스택트레이스를 그대로 노출하지 않는다.
        return Response.json({ error: "YouTube 업로드 중 오류가 발생했습니다. 잠시 후 다시 시도해주세요." }, { status: 500 });
      }
    }

    if (platform === "tiktok") {
      if (!tenantId) return Response.json({ error: "테넌트를 확인할 수 없습니다." }, { status: 400 });
      const cred = await getChannelCred(tenantId, "tiktok", accountId);
      // 비동기 상태 회수는 예약에 저장한 channel_account의 토큰으로만 가능하다. 레거시 기본
      // integration(accountId 없음)을 허용하면 그 사이 기본계정이 바뀌었을 때 다른 계정의
      // publish_id를 조회할 수 있으므로, TikTok은 명시적인 저장 계정이 있을 때만 시작한다.
      if (!cred?.token || !cred.accountId) {
        return Response.json(
          { error: accountId ? "선택한 TikTok 계정을 찾을 수 없습니다." : "TikTok 계정을 먼저 연결해주세요." },
          { status: 400 },
        );
      }

      const ext = path.extname(filename).toLowerCase();
      if (!TIKTOK_VIDEO_EXTS.has(ext)) {
        return Response.json({ error: "TikTok은 mp4, mov 또는 webm 영상만 지원합니다." }, { status: 400 });
      }
      const videoSize = fs.statSync(videoPath).size;
      if (videoSize <= 0 || videoSize > MAX_VIDEO_BYTES) {
        return Response.json({ error: `TikTok 영상은 0B 초과 ~ ${MAX_VIDEO_MIB}MiB여야 합니다.` }, { status: 400 });
      }
      const caption = (title ? `${title}\n\n` : "") + description;
      if (caption.length > TIKTOK_MAX_CAPTION) {
        return Response.json({ error: `TikTok 캡션은 최대 ${TIKTOK_MAX_CAPTION}자입니다(현재 ${caption.length}자).` }, { status: 400 });
      }

      const privacyLevel = scalarString(data.privacy_level) ? data.privacy_level : "";
      if (!(TIKTOK_PRIVACY_LEVELS as readonly string[]).includes(privacyLevel)) {
        return Response.json({ error: "TikTok 공개 범위를 직접 선택해주세요." }, { status: 400 });
      }
      const booleanValue = (key: string): boolean | null =>
        typeof data[key] === "boolean" ? data[key] as boolean : null;
      const disableComment = booleanValue("disable_comment");
      const disableDuet = booleanValue("disable_duet");
      const disableStitch = booleanValue("disable_stitch");
      const isAiGenerated = booleanValue("is_ai_generated");
      if ([disableComment, disableDuet, disableStitch, isAiGenerated].some((value) => value === null)) {
        return Response.json({ error: "TikTok 상호작용 및 AI 생성 여부를 확인해주세요." }, { status: 400 });
      }

      const creator = await queryTikTokCreatorInfo(cred.token);
      if (!creator || !creator.privacyLevels.includes(privacyLevel as TikTokPrivacyLevel)) {
        return Response.json({ error: "현재 TikTok 계정에서 선택할 수 없는 공개 범위입니다." }, { status: 400 });
      }
      const origin = canonicalPublicOrigin();
      if (!origin) return Response.json({ error: "TikTok 발행에는 OSMU_PUBLIC_URL 설정이 필요합니다." }, { status: 400 });
      const token = signMediaToken(tenantId, filename, TIKTOK_MEDIA_TTL_MS);
      if (!token) return Response.json({ error: "미디어 서명 설정이 없어 TikTok에 발행할 수 없습니다." }, { status: 400 });

      // TikTok은 init 후 완료까지 비동기로 진행된다. Reels와 같은 published_posts 예약을 먼저
      // 잡아 동시 클릭/순차 재시도가 두 번째 init을 호출하지 못하게 한다. publish_id가 생긴 뒤에는
      // external_id에 즉시 저장하므로 새로고침 뒤 상태 API가 같은 계정 토큰으로 회수할 수 있다.
      const optionsKey = JSON.stringify({
        privacyLevel,
        disableComment: creator.commentDisabled || disableComment,
        disableDuet: creator.duetDisabled || disableDuet,
        disableStitch: creator.stitchDisabled || disableStitch,
        isAiGenerated,
      });
      const explicitKey = typeof data.draft_id === "string" && data.draft_id
        ? data.draft_id
        : (typeof data.idempotency_key === "string" ? data.idempotency_key : "");
      const idKey = UUID_RE.test(explicitKey)
        ? explicitKey
        : publishReservationKey(["osmu-tiktok-dedupe-v1", tenantId, cred.accountId || "", filename, caption, optionsKey]);
      const reserve = () => withTenant(tenantId, (sql) => sql<{ id: string }[]>`
        INSERT INTO published_posts (tenant_id, draft_id, platform, text, status, account_id, provider_meta)
        VALUES (${tenantId}::uuid, ${idKey}::uuid, ${"tiktok"}, ${caption || null}, 'in_progress',
                ${cred.accountId ?? null}::uuid, ${JSON.stringify({ privacyLevel })}::jsonb)
        ON CONFLICT DO NOTHING
        RETURNING id
      `);

      let reservationId: string | null = null;
      try {
        const [row] = await reserve();
        reservationId = row?.id ?? null;
      } catch {
        return Response.json({ error: "TikTok 발행 상태를 확인할 수 없어 중단했습니다. 잠시 후 다시 시도해주세요." }, { status: 503 });
      }

      if (!reservationId) {
        // init 호출 전 프로세스가 중단되면 publish_id 없는 예약만 남는다. 이 경우에는 상태를
        // 회수할 방법이 없으므로, Reels와 같은 충분한 유예 뒤 failed로 닫고 다음 재시도를
        // 허용한다. 활성 작업을 탈취하지 않도록 정상 폴링 예산보다 넉넉한 15분을 쓴다.
        try {
          const reclaimed = await withTenant(tenantId, (sql) => sql<{ id: string }[]>`
            UPDATE published_posts
               SET status = 'failed', error = ${"완료되지 않은 TikTok 예약(stale) 자동 회수"}
             WHERE tenant_id = ${tenantId}::uuid
               AND draft_id = ${idKey}::uuid
               AND platform = ${"tiktok"}
               AND status = 'in_progress'
               AND external_id IS NULL
               AND account_id IS NOT DISTINCT FROM ${cred.accountId ?? null}::uuid
               AND published_at < now() - interval '15 minutes'
            RETURNING id
          `);
          if (reclaimed.length > 0) {
            const [row] = await reserve();
            reservationId = row?.id ?? null;
          }
        } catch {
          return Response.json({ error: "TikTok 발행 상태를 확인할 수 없어 중단했습니다. 잠시 후 다시 시도해주세요." }, { status: 503 });
        }
      }

      if (!reservationId) {
        let holder: { status: string; external_id: string | null; provider_post_id: string | null; permalink: string | null } | undefined;
        try {
          [holder] = await withTenant(tenantId, (sql) => sql<{
            status: string; external_id: string | null; provider_post_id: string | null; permalink: string | null;
          }[]>`
            SELECT status, external_id, provider_post_id, permalink
              FROM published_posts
             WHERE tenant_id = ${tenantId}::uuid
               AND draft_id = ${idKey}::uuid
               AND platform = ${"tiktok"}
               AND account_id IS NOT DISTINCT FROM ${cred.accountId ?? null}::uuid
               AND status IN ('published', 'in_progress')
             ORDER BY published_at DESC
             LIMIT 1
          `);
        } catch {
          return Response.json({ error: "TikTok 발행 상태를 확인할 수 없어 중단했습니다. 잠시 후 다시 시도해주세요." }, { status: 503 });
        }
        if (holder?.status === "published") {
          return Response.json({ ok: true, platform: "tiktok", videoId: holder.provider_post_id ?? undefined, url: holder.permalink ?? undefined, alreadyPublished: true });
        }
        // publish_id를 이미 받은 요청이면 UI가 해당 ID로 status endpoint를 폴링한다. 외부 ID가 아직
        // 없으면 init 네트워크 경계가 불명확하므로 새 init을 강행하지 않고 fail-closed 한다.
        return Response.json({
          ok: true,
          processing: true,
          platform: "tiktok",
          publishId: holder?.external_id ?? undefined,
          error: holder?.external_id ? undefined : "TikTok 발행 요청을 확인 중입니다. 잠시 후 새로고침해주세요.",
        }, { status: 202 });
      }

      const started = await startTikTokVideoPost({
        accessToken: cred.token,
        videoUrl: `${origin}/api/media/${token}`,
        title: caption,
        privacyLevel: privacyLevel as TikTokPrivacyLevel,
        disableComment: creator.commentDisabled || disableComment!,
        disableDuet: creator.duetDisabled || disableDuet!,
        disableStitch: creator.stitchDisabled || disableStitch!,
        isAiGenerated: isAiGenerated!,
      });
      if (!started.ok) {
        try {
          await withTenant(tenantId, (sql) => sql`
            UPDATE published_posts SET status = 'failed', error = ${"TikTok 발행 요청 실패"}
             WHERE id = ${reservationId}::uuid AND tenant_id = ${tenantId}::uuid`);
        } catch { /* 기록 실패가 provider 오류를 노출하지 않는다 */ }
        return Response.json({ error: "TikTok이 발행 요청을 거부했습니다. 앱 권한과 계정 상태를 확인해주세요." }, { status: 502 });
      }

      try {
        await withTenant(tenantId, (sql) => sql`
          UPDATE published_posts
             SET external_id = ${started.publishId}, error = null, published_at = now()
           WHERE id = ${reservationId}::uuid AND tenant_id = ${tenantId}::uuid AND status = 'in_progress'`);
      } catch {
        // init 성공 후 publish_id를 잃으면 상태 회수가 불가능하고 재시도가 중복 게시할 수 있다.
        // 따라서 성공을 반환하지 않고 사용자에게 재시도 대신 상태 확인을 요구한다.
        return Response.json({ error: "TikTok 발행 식별자를 저장하지 못했습니다. 중복 방지를 위해 잠시 후 상태를 확인해주세요." }, { status: 503 });
      }

      // 완료 확인은 tenant-scoped 상태 API가 맡는다. 요청 경로에서 provider를 폴링하면 새로고침
      // 중복/긴 요청이 겹치고, 처리 중 버튼 복구도 할 수 없다. publish_id는 이미 DB에 영속됐다.
      return Response.json({ ok: true, processing: true, platform: "tiktok", publishId: started.publishId }, { status: 202 });
    }
    if (platform === "reels" || platform === "instagram_reels") {
      // SNS-015: 연결된 Instagram 계정으로 Reels 실발행.
      if (!tenantId) return Response.json({ error: "테넌트를 확인할 수 없습니다." }, { status: 400 });
      // account_id는 getChannelCred에 그대로 넘긴다 — 지정 계정이 없으면 다른 계정으로 새지 않고 null.
      const cred = await getChannelCred(tenantId, "instagram", accountId);
      if (!cred || !cred.userId) {
        return Response.json(
          {
            error: accountId
              ? "선택한 Instagram 계정을 찾을 수 없습니다 — 삭제되었거나 다른 테넌트 소유입니다."
              : "Instagram이 연결되지 않았습니다. /channels/instagram에서 연결을 먼저 완료해주세요.",
          },
          { status: 400 },
        );
      }

      // 영상 형식/크기 검증 — Meta가 가져갈 수 있는 형식만, 그리고 비상식적 크기는 거부.
      const ext = path.extname(filename).toLowerCase();
      if (!REELS_VIDEO_EXTS.has(ext)) {
        return Response.json({ error: "Reels는 mp4 또는 mov 영상만 지원합니다." }, { status: 400 });
      }
      const videoSize = fs.statSync(videoPath).size;
      if (videoSize <= 0 || videoSize > REELS_MAX_BYTES) {
        return Response.json(
          { error: `Reels 영상 용량이 허용 범위를 벗어났습니다(0B 초과 ~ ${MAX_VIDEO_MIB}MiB). 파일을 압축하거나 길이를 줄여 다시 시도해주세요.` },
          { status: 400 },
        );
      }

      // 프로바이더(Meta)가 서버 대 서버로 직접 가져갈 공개 HTTPS URL. 요청 헤더(x-forwarded-host 등)는
      // 위조 가능하므로 여기서는 절대 신뢰하지 않고, 배포가 스스로 아는 정본 OSMU_PUBLIC_URL만 쓴다
      // (canonicalPublicOrigin — publicOrigin과 달리 폴백 없음).
      // 배달은 서명 토큰 경로로만 한다. 정확히 말하면 이 URL은 **비밀이 아니다** — 토큰 payload는
      // base64url JSON이라 토큰을 가진 쪽은 tenantId·파일명·만료시각을 그대로 읽을 수 있다.
      // 이 설계가 실제로 보장하는 것은 두 가지뿐: ①경로/쿼리에 원문 파일명·인증토큰이 실리지 않음
      // (프록시·리퍼러 로그 노출면 축소) ②HMAC 서명으로 위조 불가 + 짧은 만료.
      const origin = canonicalPublicOrigin();
      if (!origin) {
        return Response.json(
          { error: "Reels 발행에는 정본 공개 HTTPS 주소가 필요합니다(OSMU_PUBLIC_URL 환경변수 설정 필요)." },
          { status: 400 },
        );
      }
      const token = signMediaToken(tenantId, filename);
      if (!token) {
        return Response.json(
          { error: "미디어 서명 비밀이 설정되지 않아 Reels를 발행할 수 없습니다(MEDIA_SIGNING_SECRET 필요)." },
          { status: 400 },
        );
      }
      const videoUrl = `${origin}/api/media/${token}`;

      // 프로바이더 호출 "전"에 입력 경계를 확정한다 — 2200자를 넘는 캡션은 Meta가 어차피 거부하고,
      // 그 실패를 확인하려고 컨테이너 생성 + 최대 5분 폴링을 낭비할 이유가 없다.
      // 근거: Instagram Platform Content Publishing 가이드(캡션 최대 2,200자).
      const caption = (title ? `${title}\n\n` : "") + (description || "");
      if (caption.length > REELS_MAX_CAPTION) {
        return Response.json(
          { error: `캡션이 너무 깁니다 — 제목+설명 합쳐 최대 ${REELS_MAX_CAPTION}자입니다(현재 ${caption.length}자).` },
          { status: 400 },
        );
      }

      // 순차 재시도가 같은 초안을 두 번 외부 발행하지 않게 — /api/publish와 동일한 dedupe 계약.
      // 명시적 draft_id/idempotency_key(둘 다 UUID)가 있으면 그대로 쓴다. 없으면(= 실 UI에서
      // 버튼을 그냥 눌렀을 때) "같은 클릭 페이로드"를 결정론적으로 식별할 UUID를 유도한다 —
      // tenant + IG 계정 + 파일 아이덴티티(파일명은 upload/generate 시점에 이미 random hex라
      // 콘텐츠와 1:1) + caption 해시. 캡션/영상이 바뀌면 다른 키 → 재발행 허용.
      //
      // 동시성(SNS-015 finding 4): 순차 재시도뿐 아니라 "같은 키로 동시에 들어온 두 요청"도 막는다.
      // 방식 = 예약 INSERT(status='in_progress') + partial unique index(uq_published_posts_idem)의
      // ON CONFLICT DO NOTHING. 트랜잭션을 5분 폴링 내내 붙들지 않는다 — 예약은 단발 INSERT로
      // 즉시 커밋되고, 외부 발행이 끝난 뒤 같은 행을 UPDATE해 published/failed로 확정한다.
      // 패배한 요청은 조용히 성공을 흉내내지 않고 409(in_progress)로 fail-closed 응답한다.
      const explicitKey: string = typeof data.draft_id === "string" && data.draft_id
        ? data.draft_id
        : (typeof data.idempotency_key === "string" ? data.idempotency_key : "");
      const isExplicitUuid = UUID_RE.test(explicitKey);
      const idKey = isExplicitUuid
        ? explicitKey
        : crypto
            .createHash("sha256")
            // 프로바이더로 나가는 **최종 캡션**(제목+설명)을 해싱한다 — description만 해싱하면
            // 제목만 바꾼 재발행이 같은 키로 묶여 영영 막힌다(캡션은 실제로 달라지는데도).
            .update(`osmu-reels-dedupe-v2:${tenantId}:${cred.accountId ?? ""}:${filename}:${caption}`)
            .digest("hex")
            .replace(/^(.{8})(.{4})(.{4})(.{4})(.{12}).*$/, "$1-$2-$3-$4-$5"); // sha256 hex → UUID 형태(v4 아님, DB uuid 컬럼 형식만 맞춤)
      // ① 예약 시도. 이미 같은 키로 in_progress/published 행이 있으면 unique index가 막아 0행.
      //    (실패 이력 status='failed'는 인덱스 대상 밖이라 재시도를 방해하지 않는다.)
      //    이 INSERT가 실패(DB 장애)하면 예약 없이 외부 발행을 강행하지 않는다 — fail closed.
      const reserve = () =>
        withTenant(tenantId, (sql) => sql<{ id: string }[]>`
          INSERT INTO published_posts (tenant_id, draft_id, platform, text, status, account_id)
          VALUES (${tenantId}::uuid, ${idKey}::uuid, ${REELS_PLATFORM}, ${description ?? null},
                  'in_progress', ${cred.accountId ?? null}::uuid)
          ON CONFLICT DO NOTHING
          RETURNING id
        `);

      let reservationId: string | null = null;
      try {
        const [row] = await reserve();
        reservationId = row?.id ?? null;
      } catch {
        return Response.json(
          { error: "발행 상태를 확인할 수 없어 중단했습니다(중복 발행 방지). 잠시 후 다시 시도해주세요." },
          { status: 503 },
        );
      }

      if (!reservationId) {
        // 좀비 예약 회수: 프로세스가 발행 도중 죽으면 in_progress 행이 남아 이후 재시도가 영구히
        // 409로 막힌다. 폴링 예산(60s × 5회 = 5분, Meta 공식 권고)의 3배인 15분이 지난 예약은
        // 완료될 가망이 없다고 보고 failed로 내려(인덱스 대상에서 빠짐) 예약을 한 번 재시도한다.
        // 15분은 "정상 진행 중인 요청을 절대 가로채지 않는" 여유값이다.
        try {
          const reclaimed = await withTenant(tenantId, (sql) => sql<{ id: string }[]>`
            UPDATE published_posts
               SET status = 'failed', error = '완료되지 않은 예약(stale) 자동 회수'
             WHERE tenant_id = ${tenantId}::uuid
               AND draft_id = ${idKey}::uuid
               AND platform = ${REELS_PLATFORM}
               AND status = 'in_progress'
               AND account_id IS NOT DISTINCT FROM ${cred.accountId ?? null}::uuid
               AND published_at < now() - interval '15 minutes'
            RETURNING id
          `);
          if (reclaimed.length > 0) {
            const [row] = await reserve();
            reservationId = row?.id ?? null;
          }
        } catch {
          return Response.json(
            { error: "발행 상태를 확인할 수 없어 중단했습니다(중복 발행 방지). 잠시 후 다시 시도해주세요." },
            { status: 503 },
          );
        }
      }

      if (!reservationId) {
        // ② 예약 패배 — 이미 누가 잡고 있다. 그 행의 상태로 정직하게 분기한다.
        let holder: { status: string; external_id: string | null; permalink: string | null } | undefined;
        try {
          [holder] = await withTenant(tenantId, (sql) => sql<{
            status: string;
            external_id: string | null;
            permalink: string | null;
          }[]>`
            SELECT status, external_id, permalink
              FROM published_posts
             WHERE tenant_id = ${tenantId}::uuid
               AND draft_id = ${idKey}::uuid
               AND platform = ${REELS_PLATFORM}
               AND status IN ('published', 'in_progress')
               AND account_id IS NOT DISTINCT FROM ${cred.accountId ?? null}::uuid
             ORDER BY published_at DESC
             LIMIT 1
          `);
        } catch {
          return Response.json(
            { error: "발행 상태를 확인할 수 없어 중단했습니다(중복 발행 방지). 잠시 후 다시 시도해주세요." },
            { status: 503 },
          );
        }
        if (holder?.status === "published") {
          // 이미 성공한 발행 — 외부 media_publish를 다시 호출하지 않는다.
          return Response.json({
            ok: true,
            platform: REELS_PLATFORM,
            videoId: holder.external_id ?? undefined,
            url: holder.permalink ?? undefined,
            alreadyPublished: true,
          });
        }
        // in_progress(또는 조회 실패로 알 수 없음) — 성공을 흉내내지 않고 명시적 충돌로 되돌린다.
        return Response.json(
          {
            ok: false,
            error: "같은 영상의 Reels 발행이 이미 진행 중입니다. 완료될 때까지 기다린 뒤 결과를 확인해주세요.",
            code: "publish_in_progress",
          },
          { status: 409 },
        );
      }

      // ③ 예약 성공한 요청만 외부 발행. 어떤 경로로 끝나든 예약 행은 반드시 확정 상태로 닫는다
      //    — 안 그러면 in_progress가 남아 이후 재시도가 영구히 409로 막힌다.
      let result: Awaited<ReturnType<typeof publishInstagramReels>>;
      try {
        result = await publishInstagramReels(cred, caption, videoUrl);
      } catch {
        try {
          await withTenant(tenantId, (sql) => sql`
            UPDATE published_posts SET status = 'failed', error = ${"발행 중 예기치 못한 오류"}
             WHERE id = ${reservationId}::uuid AND tenant_id = ${tenantId}::uuid`);
        } catch { /* 기록 실패가 응답을 바꾸지 않는다 */ }
        return Response.json({ ok: false, error: "Reels 발행에 실패했습니다." }, { status: 502 });
      }

      try {
        await withTenant(tenantId, (sql) => sql`
          UPDATE published_posts
             SET status = ${result.ok ? "published" : "failed"},
                 external_id = ${result.externalId ?? null},
                 permalink = ${result.permalink ?? null},
                 error = ${result.error ?? null},
                 published_at = now()
           WHERE id = ${reservationId}::uuid AND tenant_id = ${tenantId}::uuid`);
      } catch {
        // 기록 실패가 발행 결과를 뒤집지 않는다(원문 로그 노출 금지).
      }

      if (!result.ok) {
        // publishInstagramReels의 에러는 이미 프로바이더 원문을 담지 않는 고정 문구다.
        return Response.json({ ok: false, error: result.error || "Reels 발행에 실패했습니다." }, { status: 502 });
      }
      return Response.json({
        ok: true,
        platform: REELS_PLATFORM,
        videoId: result.externalId,
        url: result.permalink,
      });
    }

    return Response.json({ error: `Unknown platform: ${platform}` }, { status: 400 });
  });
}
