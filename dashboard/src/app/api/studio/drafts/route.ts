import { withTenant } from "@/lib/db";
import { effectiveTenantId } from "@/lib/tenant-auth";
import { validateContentEditFormat } from "@/lib/studio/content-edit-format";
import { resolveCurrentWork } from "@/lib/studio/current-work";
import { validateCardDeck, CardDeckValidationError, deckProjection } from "@/lib/studio/card-deck-contract";
import { cardDeckV3Projection, CardDeckV3ValidationError, validateCardDeckV3 } from "@/lib/studio/card-element-contract";
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

interface LatestBodySnapshot {
  text: unknown | null;
  editLines: unknown | null;
  cardDeckV3: unknown | null;
  bodyRevision: number;
}

/** PR87 r4: 마지막으로 읽은 서버 판과 현재 서버 판이 다른 본문 저장을 막는 신호. */
class StaleBodyRevisionError extends Error {
  constructor(
    readonly serverRevision: number,
    readonly clientBaseRevision: number,
    readonly latestBody: LatestBodySnapshot,
  ) {
    super(`body revision stale: server=${serverRevision} clientBase=${clientBaseRevision}`);
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
    publishProgress?: unknown;
    editor_handoff?: unknown;
    editFormat?: unknown;
    editKind?: unknown;
    editLines?: unknown;
    bodyRevision?: unknown;
    cardTextPositions?: unknown;
    cardDeck?: unknown;
    cardDeckV3?: unknown;
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
    publishProgress: r.payload?.publishProgress ?? null,
    editorHandoff: r.payload?.editor_handoff ?? null,
    editFormat: r.payload?.editFormat ?? null,
    editKind: r.payload?.editKind ?? null,
    editLines: r.payload?.editLines ?? null,
    bodyRevision: Number.isSafeInteger(r.payload?.bodyRevision) ? r.payload.bodyRevision : 0,
    cardTextPositions: r.payload?.cardTextPositions ?? null,
    cardDeck: r.payload?.cardDeck ?? null,
    cardDeckV3: r.payload?.cardDeckV3 ?? null,
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
  let cardDeckV3ProjectedLines: string[] | null = null;
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
  if (body.cardDeckV3 !== undefined && body.cardDeckV3 !== null) {
    try {
      validateCardDeckV3(body.cardDeckV3);
      cardDeckV3ProjectedLines = cardDeckV3Projection(body.cardDeckV3);
    } catch (error) {
      const validation = error instanceof CardDeckV3ValidationError ? error : null;
      return Response.json({
        ok: false,
        code: validation?.code ?? "INVALID_CARD_DECK_V3",
        error: error instanceof Error ? error.message : "자유 배치 카드 덱을 확인해 주세요",
      }, { status: validation?.code === "CARD_DECK_TOO_LARGE" ? 413 : 400, headers: { "Cache-Control": "no-store" } });
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
  if (body.id && (!Number.isSafeInteger(body.bodyBaseRevision) || body.bodyBaseRevision < 0)) {
    return Response.json({
      ok: false,
      code: "BODY_BASE_REVISION_REQUIRED",
      error: "마지막으로 받은 본문 판 번호를 확인해 주세요",
    }, { status: 422, headers: { "Cache-Control": "no-store" } });
  }
  const bodyBaseRevision = Number.isSafeInteger(body.bodyBaseRevision) && body.bodyBaseRevision >= 0
    ? body.bodyBaseRevision as number
    : 0;
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
  // validateCardDeckV3를 통과한 JSON 트리지만 postgres의 JSONValue는 index signature가
  // 없는 TypeScript interface를 받지 못한다. v2 cardDeck과 같은 검증 뒤 경계 캐스팅이다.
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const cardDeckV3Patch: { cardDeckV3?: any } = {};
  if (body.clearCardDeckV3 === true) {
    cardDeckV3Patch.cardDeckV3 = null;
  } else if (Object.prototype.hasOwnProperty.call(body, "cardDeckV3") && body.cardDeckV3 != null) {
    cardDeckV3Patch.cardDeckV3 = body.cardDeckV3;
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
  if (cardDeckV3ProjectedLines !== null) {
    editLinesPatch.editLines = cardDeckV3ProjectedLines;
  } else if (cardDeckProjectedLines !== null) {
    editLinesPatch.editLines = cardDeckProjectedLines;
  } else if (Object.prototype.hasOwnProperty.call(body, "editLines")) {
    editLinesPatch.editLines = body.editLines ?? null;
  }
  const bodyText = body.text ?? null;
  const bodyLines = editLinesPatch.editLines ?? null;
  const payload = {
    text: bodyText,
    // 새 초안의 첫 서버 판은 0이다. 기존 초안은 아래 UPDATE가 현재 서버 판을 +1한다.
    bodyRevision: 0,
    img: body.img ?? null, vid: body.vid ?? null,
    includes: body.includes ?? {},
    publishReconciliations: body.publishReconciliations ?? {},
    publishReconciliation: body.publishReconciliation ?? null,
    publishProgress: body.publishProgress ?? null,
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
    ...cardDeckV3Patch,
    ...videoEditPatch,
    ...editLinesPatch,
  };
  const status = body.status || "draft";
  const idea = body.idea || "";
  try {
    const result = await withTenant(tenantId, async (sql) => {
      if (body.id) {
        // PR87 r4: bodyBaseRevision은 클라이언트 조작 횟수가 아니라 마지막으로 읽은 서버
        // 판 번호다. 현재 서버 판과 정확히 같을 때만 본문을 저장하고 서버가 +1한다.
        // 조건은 행 컬럼을 직접 참조하므로 잠금 대기 뒤 PostgreSQL이 최신 행으로 다시
        // 평가한다. 오래된 탭이 로컬에서 100번 편집했어도 기준판이 낡았으면 통과 못 한다.
        const nonBodyPayload = { ...payload };
        delete (nonBodyPayload as { text?: unknown }).text;
        delete (nonBodyPayload as { editLines?: unknown }).editLines;
        delete (nonBodyPayload as { bodyRevision?: unknown }).bodyRevision;
        if (videoEditPatch.videoEdit) {
          const baseRevision = typeof body.videoEditBaseRevision === "number" ? body.videoEditBaseRevision : null;
          const videoEditClientPayload = videoEditPatch.videoEdit;
          delete (nonBodyPayload as { videoEdit?: unknown }).videoEdit;
          const [row] = await sql<{ id: string; body_revision: number; server_revision: number }[]>`
            UPDATE drafts SET
              idea = ${idea},
              payload = (COALESCE(drafts.payload, '{}'::jsonb) || ${sql.json(nonBodyPayload)}::jsonb)
                || jsonb_build_object('videoEdit', ${sql.json(videoEditClientPayload)}::jsonb
                  || jsonb_build_object('revision', COALESCE((drafts.payload->'videoEdit'->>'revision')::int, -1) + 1))
                || jsonb_build_object(
                  'text', ${sql.json(bodyText)}::jsonb,
                  'editLines', ${sql.json(bodyLines)}::jsonb,
                  'bodyRevision', COALESCE((drafts.payload->>'bodyRevision')::int, 0) + 1
                ),
              status = ${status}, updated_at = now()
            WHERE drafts.id = ${body.id} AND drafts.tenant_id = ${tenantId}
              AND (drafts.payload->'videoEdit'->>'revision')::int IS NOT DISTINCT FROM ${baseRevision}::int
              AND COALESCE((drafts.payload->>'bodyRevision')::int, 0) = ${bodyBaseRevision}
            RETURNING drafts.id, (drafts.payload->>'bodyRevision')::int AS body_revision,
              (drafts.payload->'videoEdit'->>'revision')::int AS server_revision`;
          if (row) return { id: row.id, bodyRevision: row.body_revision, videoEditServerRevision: row.server_revision };
        } else {
          const [row] = await sql<{ id: string; body_revision: number }[]>`
            UPDATE drafts SET idea = ${idea},
              payload = (COALESCE(drafts.payload, '{}'::jsonb) || ${sql.json(nonBodyPayload)}::jsonb)
                || jsonb_build_object(
                  'text', ${sql.json(bodyText)}::jsonb,
                  'editLines', ${sql.json(bodyLines)}::jsonb,
                  'bodyRevision', COALESCE((drafts.payload->>'bodyRevision')::int, 0) + 1
                ),
              status = ${status}, updated_at = now()
            WHERE id = ${body.id} AND tenant_id = ${tenantId}
              AND COALESCE((drafts.payload->>'bodyRevision')::int, 0) = ${bodyBaseRevision}
            RETURNING id, (payload->>'bodyRevision')::int AS body_revision`;
          if (row) return { id: row.id, bodyRevision: row.body_revision, videoEditServerRevision: null };
        }
        const [existsRow] = await sql<{
          id: string;
          body_revision: number | null;
          text: unknown | null;
          edit_lines: unknown | null;
          card_deck_v3: unknown | null;
          revision: number | null;
        }[]>`
          SELECT id, COALESCE((payload->>'bodyRevision')::int, 0) AS body_revision,
            payload->'text' AS text,
            payload->'editLines' AS edit_lines,
            payload->'cardDeckV3' AS card_deck_v3,
            (payload->'videoEdit'->>'revision')::int AS revision
          FROM drafts WHERE id = ${body.id} AND tenant_id = ${tenantId}`;
        if (existsRow) {
          const serverBodyRevision = existsRow.body_revision ?? 0;
          if (bodyBaseRevision !== serverBodyRevision) {
            throw new StaleBodyRevisionError(serverBodyRevision, bodyBaseRevision, {
              text: existsRow.text,
              editLines: existsRow.edit_lines,
              cardDeckV3: existsRow.card_deck_v3,
              bodyRevision: serverBodyRevision,
            });
          }
          if (videoEditPatch.videoEdit) {
            const baseRevision = typeof body.videoEditBaseRevision === "number" ? body.videoEditBaseRevision : null;
            throw new StaleVideoEditRevisionError(existsRow.revision, baseRevision);
          }
        }
      }
      const [row] = await sql<{ id: string }[]>`
        INSERT INTO drafts (tenant_id, idea, payload, status)
        VALUES (${tenantId}, ${idea}, ${sql.json(payload)}, ${status}) RETURNING id`;
      return { id: row.id, bodyRevision: 0, videoEditServerRevision: videoEditPatch.videoEdit ? (videoEditPatch.videoEdit.revision ?? 0) : null };
    });
    return Response.json({ ok: true, id: result.id, bodyRevision: result.bodyRevision, videoEditServerRevision: result.videoEditServerRevision });
  } catch (e) {
    if (e instanceof StaleBodyRevisionError) {
      return Response.json({
        ok: false,
        code: "BODY_STALE_REVISION",
        error: "다른 곳에서 더 최신으로 저장된 본문이 있습니다. 최신 값을 다시 불러온 뒤 다시 시도해 주세요.",
        serverRevision: e.serverRevision,
        clientBaseRevision: e.clientBaseRevision,
        latestBody: e.latestBody,
      }, { status: 409, headers: { "Cache-Control": "no-store" } });
    }
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
