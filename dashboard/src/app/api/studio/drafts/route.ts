import { withTenant } from "@/lib/db";
import { effectiveTenantId } from "@/lib/tenant-auth";
import { validateContentEditFormat } from "@/lib/studio/content-edit-format";
import { resolveCurrentWork } from "@/lib/studio/current-work";
import { validateCardDeck, CardDeckValidationError, deckProjection } from "@/lib/studio/card-deck-contract";
import { validateVideoEdit, VideoEditValidationError, type VideoEdit } from "@/lib/studio/video-edit-contract";

/** 직렬화 64KB 초과면 저장을 거부한다(설계 §7.2 413 CARD_DECK_TOO_LARGE). */
const CARD_DECK_MAX_BYTES = 64 * 1024;
/** videoEdit 도 같은 상한을 쓴다(오버레이·댓글·자막 목록 크기가 카드덱과 비슷한 자릿수). */
const VIDEO_EDIT_MAX_BYTES = 64 * 1024;

/** 교차 리뷰 BLOCKER 1: 뒤처진 revision의 videoEdit 저장을 막는 신호. */
class StaleVideoEditRevisionError extends Error {
  constructor(readonly serverRevision: number | null, readonly clientRevision: number | null) {
    super(`videoEdit revision stale: server=${serverRevision} client=${clientRevision}`);
  }
}

// Studio 초안/발행 이력 — Supabase drafts 테이블(테넌트별). payload jsonb에 본문 보관.
interface DraftRow {
  id: string;
  tenant_id: string;
  idea: string;
  payload: {
    text?: unknown;
    img?: unknown;
    vid?: unknown;
    includes?: Record<string, boolean>;
    publishReconciliations?: unknown;
    publishReconciliation?: unknown;
    editor_handoff?: unknown;
    editFormat?: unknown;
    editKind?: unknown;
    editLines?: unknown;
    cardTextPositions?: unknown;
    cardDeck?: unknown;
    videoEdit?: unknown;
    titles?: unknown;
    captions?: unknown;
    hashtags?: unknown;
    topicTags?: unknown;
    firstComments?: unknown;
    selectedAccounts?: unknown;
    reviewQueueId?: unknown;
  };
  status: string;
  created_at: string;
  updated_at: string;
}

// F1(fdd-r02): payload.text가 없는 레거시/seed 드래프트도 흡수하는 관대 폴백.
// 플랫폼 키(threads/x/instagram/shorts 등)가 payload 최상위에 직접 있으면 그것을 variants로 간주한다.
const PLATFORM_KEYS = ["threads", "x", "instagram", "shorts", "blog", "youtube", "tiktok", "linkedin", "facebook"];
function extractVariants(payload: Record<string, unknown> | null | undefined): unknown | null {
  if (!payload) return null;
  const found: Record<string, unknown> = {};
  for (const key of PLATFORM_KEYS) {
    if (payload[key] !== undefined && payload[key] !== null) found[key] = payload[key];
  }
  return Object.keys(found).length > 0 ? found : null;
}

// GET /api/studio/drafts?tenant_id=... — 워크스페이스 초안 목록(최근 50)
function flattenDraft(r: DraftRow) {
  return {
    id: r.id,
    idea: r.idea,
    text: r.payload?.text ?? extractVariants(r.payload as Record<string, unknown>),
    img: r.payload?.img ?? null,
    vid: r.payload?.vid ?? null,
    includes: r.payload?.includes ?? {},
    publishReconciliations: r.payload?.publishReconciliations ?? null,
    publishReconciliation: r.payload?.publishReconciliation ?? null,
    editorHandoff: r.payload?.editor_handoff ?? null,
    editFormat: r.payload?.editFormat ?? null,
    editKind: r.payload?.editKind ?? null,
    editLines: r.payload?.editLines ?? null,
    cardTextPositions: r.payload?.cardTextPositions ?? null,
    cardDeck: r.payload?.cardDeck ?? null,
    videoEdit: r.payload?.videoEdit ?? null,
    titles: r.payload?.titles ?? {},
    captions: r.payload?.captions ?? {},
    hashtags: r.payload?.hashtags ?? {},
    topicTags: r.payload?.topicTags ?? {},
    firstComments: r.payload?.firstComments ?? {},
    selectedAccounts: r.payload?.selectedAccounts ?? {},
    reviewQueueId: r.payload?.reviewQueueId ?? null,
    status: r.status,
    savedAt: r.updated_at,
  };
}

export async function GET(request: Request) {
  const tenantId = await effectiveTenantId(request, new URL(request.url).searchParams.get("tenant_id"));
  if (!tenantId) return Response.json({ drafts: [], currentWork: null });
  const singleId = new URL(request.url).searchParams.get("id");
  // 3차 재리뷰 BLOCKER(b): 목록(LIMIT 50) 밖에 있는 초안은 목록 응답에 없다는 이유만으로
  // "서버에 없다"고 오해하면 안 된다. draftId를 알면 이 단건 조회로 서버 값을 직접
  // 맞춘다(studio/page.tsx 재동기화 효과가 draft가 hist.drafts에 없을 때 이걸 부른다).
  if (singleId) {
    try {
      const rows = await withTenant(tenantId, (sql) => sql<DraftRow[]>`
        SELECT id, tenant_id, idea, payload, status, created_at, updated_at
        FROM drafts WHERE tenant_id = ${tenantId} AND id = ${singleId}`);
      if (!rows[0]) return Response.json({ draft: null }, { status: 404 });
      return Response.json({ draft: flattenDraft(rows[0]) });
    } catch (e) {
      return Response.json({ draft: null, error: String(e) }, { status: 500 });
    }
  }
  try {
    const rows = await withTenant(tenantId, (sql) => sql<DraftRow[]>`
      SELECT id, tenant_id, idea, payload, status, created_at, updated_at
      FROM drafts WHERE tenant_id = ${tenantId}
      ORDER BY updated_at DESC LIMIT 50`);
    // 기존 Studio 형식과 호환되게 평탄화
    const drafts = rows.map(flattenDraft);
    return Response.json({ drafts, currentWork: resolveCurrentWork(drafts) });
  } catch (e) {
    return Response.json({ drafts: [], currentWork: null, error: String(e) }, { status: 500 });
  }
}

// POST /api/studio/drafts — 초안 저장/갱신 { tenant_id, id?, idea, text, img, vid, includes, status }
export async function POST(request: Request) {
  const body = await request.json();
  if (body.editFormat !== undefined) {
    const formatValidation = validateContentEditFormat(body.editFormat);
    if (!formatValidation.valid) {
      return Response.json({
        ok: false,
        code: "INVALID_EDIT_FORMAT",
        error: "편집 형식값을 확인해 주세요",
        issues: formatValidation.issues,
      }, { status: 422, headers: { "Cache-Control": "no-store" } });
    }
  }
  if (
    body.selectedAccounts !== undefined
    && (body.selectedAccounts === null || typeof body.selectedAccounts !== "object" || Array.isArray(body.selectedAccounts))
  ) {
    return Response.json({
      ok: false,
      code: "INVALID_PUBLISH_DRAFT_STATE",
      error: "선택 계정값을 확인해 주세요",
    }, { status: 422, headers: { "Cache-Control": "no-store" } });
  }
  let cardDeckProjectedLines: string[] | null = null;
  if (body.cardDeck !== undefined && body.cardDeck !== null) {
    const serialized = JSON.stringify(body.cardDeck);
    if (Buffer.byteLength(serialized, "utf8") > CARD_DECK_MAX_BYTES) {
      return Response.json({
        ok: false,
        code: "CARD_DECK_TOO_LARGE",
        error: "카드 덱이 너무 큽니다",
      }, { status: 413, headers: { "Cache-Control": "no-store" } });
    }
    try {
      validateCardDeck(body.cardDeck);
      cardDeckProjectedLines = deckProjection(body.cardDeck).lines;
    } catch (e) {
      const rule = e instanceof CardDeckValidationError ? e.rule : "unknown";
      return Response.json({
        ok: false,
        code: "INVALID_CARD_DECK",
        rule,
        error: e instanceof Error ? e.message : "카드 덱을 확인해 주세요",
      }, { status: 400, headers: { "Cache-Control": "no-store" } });
    }
  }
  if (body.videoEdit !== undefined && body.videoEdit !== null) {
    const serialized = JSON.stringify(body.videoEdit);
    if (Buffer.byteLength(serialized, "utf8") > VIDEO_EDIT_MAX_BYTES) {
      return Response.json({
        ok: false,
        code: "VIDEO_EDIT_TOO_LARGE",
        error: "영상 편집 내용이 너무 큽니다",
      }, { status: 413, headers: { "Cache-Control": "no-store" } });
    }
    try {
      validateVideoEdit(body.videoEdit);
    } catch (e) {
      const rule = e instanceof VideoEditValidationError ? e.rule : "unknown";
      return Response.json({
        ok: false,
        code: "INVALID_VIDEO_EDIT",
        rule,
        error: e instanceof Error ? e.message : "영상 편집 내용을 확인해 주세요",
      }, { status: 400, headers: { "Cache-Control": "no-store" } });
    }
  }
  const tenantId = await effectiveTenantId(request, body.tenant_id);
  if (!tenantId) return Response.json({ error: "tenant_id required" }, { status: 400 });
  // cardDeck: 요청에 키가 아예 없으면 payload 에도 빼서 JSONB `||` 병합 대상에서
  // 제외한다(undefined 유지 → 기존 덱 보존). 지우려면 명시 플래그 `clearCardDeck:true`
  // 를 보낸다(2026-09-21 코드리뷰 MAJOR 4. 이전에는 `body.cardDeck ?? null` 이 병합에
  // null 을 얹어, cardDeck 을 안 싣는 모든 저장 경로가 자동저장 한 번에 기존 덱을 지웠다).
  // 스프레드로만 넣는다. payload 를 넓은 타입(Record<string, unknown>)으로 선언하고
  // 사후에 mutate 하면 `sql.json()` 이 기대하는 JSONValue 로 좁혀지지 않는다.
  // eslint-disable-next-line @typescript-eslint/no-explicit-any -- sql.json() 의 JSONValue
  // 타입은 이미 검증된 임의 JSON 트리(cardDeck)를 구조적으로 받아들이지 못한다. 이
  // 지점은 validateCardDeck() 을 이미 통과했다(위 CARD_DECK_MAX_BYTES 분기).
  const cardDeckPatch: { cardDeck?: any } = {};
  if (body.clearCardDeck === true) {
    cardDeckPatch.cardDeck = null;
  } else if (Object.prototype.hasOwnProperty.call(body, "cardDeck") && body.cardDeck != null) {
    cardDeckPatch.cardDeck = body.cardDeck;
  }
  // videoEdit도 cardDeck과 같은 보존 규칙: 키가 없으면 payload 병합에서 빠져 기존 값을
  // 지키고, 명시 플래그 clearVideoEdit로만 지운다.
  // M7(2026-09-22 코드리뷰): `any` 대신 VideoEdit로 좁힌다. body.videoEdit는 위에서 이미
  // validateVideoEdit()을 통과했다(개발 시점 assertion으로 VideoEdit로 좁혀져 있다).
  const videoEditPatch: { videoEdit?: VideoEdit | null } = {};
  if (body.clearVideoEdit === true) {
    videoEditPatch.videoEdit = null;
  } else if (Object.prototype.hasOwnProperty.call(body, "videoEdit") && body.videoEdit != null) {
    videoEditPatch.videoEdit = body.videoEdit as VideoEdit;
  }
  // 항목3(2026-09-22 코드리뷰 5차): editLines는 cardDeck·videoEdit와 달리 "키 없으면
  // 보존" 규칙 밖이라 매번 무조건 덮었다(`?? null`). 영상 자동저장이 cardDeck 키를 안
  // 보내게 된(4차 B) 지금, cardDeckProjectedLines가 null이 되어 서버의 덱 투영 editLines
  // 가 body.editLines(보통 비어 있거나 옛 값)로 교체될 수 있었다. cardDeck·videoEdit와
  // 같은 보존 규칙으로 옮긴다: cardDeck을 보냈으면(투영 갱신) 또는 body에 editLines 키가
  // 명시로 있으면만 payload에 싣고, 둘 다 없으면 키 자체를 빼 기존 값을 지킨다.
  const editLinesPatch: { editLines?: string[] | null } = {};
  if (cardDeckProjectedLines !== null) {
    editLinesPatch.editLines = cardDeckProjectedLines;
  } else if (Object.prototype.hasOwnProperty.call(body, "editLines")) {
    editLinesPatch.editLines = body.editLines ?? null;
  }
  const payload = {
    text: body.text ?? null, img: body.img ?? null, vid: body.vid ?? null,
    includes: body.includes ?? {},
    publishReconciliations: body.publishReconciliations ?? {},
    publishReconciliation: body.publishReconciliation ?? null,
    editFormat: body.editFormat ?? null,
    editKind: body.editKind ?? null,
    cardTextPositions: body.cardTextPositions ?? null,
    titles: body.titles ?? {},
    captions: body.captions ?? {},
    hashtags: body.hashtags ?? {},
    topicTags: body.topicTags ?? {},
    firstComments: body.firstComments ?? {},
    selectedAccounts: body.selectedAccounts ?? {},
    reviewQueueId: body.reviewQueueId ?? null,
    ...cardDeckPatch,
    ...videoEditPatch,
    ...editLinesPatch,
  };
  const status = body.status || "draft";
  const idea = body.idea || "";
  try {
    const result = await withTenant(tenantId, async (sql) => {
      if (body.id) {
        // 3차 재리뷰 BLOCKER(a): 클라이언트의 videoEdit.revision은 "이 클라이언트가 조작한
        // 횟수"이지 "서버 판 번호"가 아니다(withRevision이 조작마다 +1). 그래서 오래된
        // 클라이언트도 몇 번 타이핑해 revision을 서버보다 크게 만들면 통째로 덮어썼다.
        // 판 번호는 서버가 소유한다: 클라이언트는 자신이 마지막으로 읽은 서버 판 번호
        // (videoEditBaseRevision)를 보내고, 서버는 그 값이 현재 저장된 판 번호와
        // "정확히 같을 때만"(compare-and-set) 저장을 허락한다. 저장에 성공하면 서버가
        // 판 번호를 +1 해서 저장·응답한다 — 클라이언트의 조작 횟수(revision 필드)는
        // 그대로 함께 저장하되, 동시성 판정에는 이 서버 판 번호만 쓴다.
        // WITH...UPDATE...FROM 한 문장으로 SELECT-then-UPDATE 경쟁(MINOR)도 함께 막는다.
        if (videoEditPatch.videoEdit) {
          const baseRevision = typeof body.videoEditBaseRevision === "number" ? body.videoEditBaseRevision : null;
          const videoEditClientPayload = videoEditPatch.videoEdit; // revision 키는 아래에서 서버가 덮어쓴다
          const restPayload = { ...payload };
          delete (restPayload as { videoEdit?: unknown }).videoEdit;
          const [row] = await sql<{ id: string; server_revision: number }[]>`
            WITH old AS (
              SELECT (payload->'videoEdit'->>'revision')::int AS rev FROM drafts
              WHERE id = ${body.id} AND tenant_id = ${tenantId}
            )
            UPDATE drafts SET
              idea = ${idea},
              payload = (COALESCE(drafts.payload, '{}'::jsonb) || ${sql.json(restPayload)}::jsonb)
                || jsonb_build_object('videoEdit', ${sql.json(videoEditClientPayload)}::jsonb
                  || jsonb_build_object('revision', COALESCE((SELECT rev FROM old), -1) + 1)),
              status = ${status}, updated_at = now()
            WHERE drafts.id = ${body.id} AND drafts.tenant_id = ${tenantId}
              AND (SELECT rev FROM old) IS NOT DISTINCT FROM ${baseRevision}::int
            RETURNING drafts.id, (drafts.payload->'videoEdit'->>'revision')::int AS server_revision`;
          if (row) return { id: row.id, videoEditServerRevision: row.server_revision };
          const [existsRow] = await sql<{ id: string; revision: number | null }[]>`
            SELECT id, (payload->'videoEdit'->>'revision')::int AS revision FROM drafts
            WHERE id = ${body.id} AND tenant_id = ${tenantId}`;
          if (existsRow) throw new StaleVideoEditRevisionError(existsRow.revision, baseRevision);
          // 그 id의 초안이 이 테넌트에 아예 없다 — 기존 동작대로 아래에서 새로 만든다.
        } else {
          const [row] = await sql<{ id: string }[]>`
            UPDATE drafts SET idea = ${idea}, payload = COALESCE(payload, '{}'::jsonb) || ${sql.json(payload)}::jsonb, status = ${status}, updated_at = now()
            WHERE id = ${body.id} AND tenant_id = ${tenantId} RETURNING id`;
          if (row) return { id: row.id, videoEditServerRevision: null };
        }
      }
      const [row] = await sql<{ id: string }[]>`
        INSERT INTO drafts (tenant_id, idea, payload, status)
        VALUES (${tenantId}, ${idea}, ${sql.json(payload)}, ${status}) RETURNING id`;
      return { id: row.id, videoEditServerRevision: videoEditPatch.videoEdit ? (videoEditPatch.videoEdit.revision ?? 0) : null };
    });
    return Response.json({ ok: true, id: result.id, videoEditServerRevision: result.videoEditServerRevision });
  } catch (e) {
    if (e instanceof StaleVideoEditRevisionError) {
      return Response.json({
        ok: false,
        code: "VIDEO_EDIT_STALE_REVISION",
        error: "다른 곳에서 더 최신으로 저장된 영상 편집이 있습니다. 최신 값을 다시 불러온 뒤 다시 시도해 주세요.",
        serverRevision: e.serverRevision,
        clientRevision: e.clientRevision,
      }, { status: 409, headers: { "Cache-Control": "no-store" } });
    }
    return Response.json({ error: String(e) }, { status: 500 });
  }
}
