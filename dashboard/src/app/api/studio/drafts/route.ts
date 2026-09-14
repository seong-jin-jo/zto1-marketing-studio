import { withTenant } from "@/lib/db";
import { effectiveTenantId } from "@/lib/tenant-auth";
import { validateContentEditFormat } from "@/lib/studio/content-edit-format";
import { resolveCurrentWork } from "@/lib/studio/current-work";

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
export async function GET(request: Request) {
  const tenantId = await effectiveTenantId(request, new URL(request.url).searchParams.get("tenant_id"));
  if (!tenantId) return Response.json({ drafts: [], currentWork: null });
  try {
    const rows = await withTenant(tenantId, (sql) => sql<DraftRow[]>`
      SELECT id, tenant_id, idea, payload, status, created_at, updated_at
      FROM drafts WHERE tenant_id = ${tenantId}
      ORDER BY updated_at DESC LIMIT 50`);
    // 기존 Studio 형식과 호환되게 평탄화
    const drafts = rows.map((r) => ({
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
      titles: r.payload?.titles ?? {},
      captions: r.payload?.captions ?? {},
      hashtags: r.payload?.hashtags ?? {},
      topicTags: r.payload?.topicTags ?? {},
      firstComments: r.payload?.firstComments ?? {},
      selectedAccounts: r.payload?.selectedAccounts ?? {},
      reviewQueueId: r.payload?.reviewQueueId ?? null,
      status: r.status,
      savedAt: r.updated_at,
    }));
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
  const tenantId = await effectiveTenantId(request, body.tenant_id);
  if (!tenantId) return Response.json({ error: "tenant_id required" }, { status: 400 });
  const payload = {
    text: body.text ?? null, img: body.img ?? null, vid: body.vid ?? null,
    includes: body.includes ?? {},
    publishReconciliations: body.publishReconciliations ?? {},
    publishReconciliation: body.publishReconciliation ?? null,
    editFormat: body.editFormat ?? null,
    editKind: body.editKind ?? null,
    editLines: body.editLines ?? null,
    cardTextPositions: body.cardTextPositions ?? null,
    titles: body.titles ?? {},
    captions: body.captions ?? {},
    hashtags: body.hashtags ?? {},
    topicTags: body.topicTags ?? {},
    firstComments: body.firstComments ?? {},
    selectedAccounts: body.selectedAccounts ?? {},
    reviewQueueId: body.reviewQueueId ?? null,
  };
  const status = body.status || "draft";
  const idea = body.idea || "";
  try {
    const id = await withTenant(tenantId, async (sql) => {
      if (body.id) {
        const [row] = await sql<{ id: string }[]>`
          UPDATE drafts SET idea = ${idea}, payload = COALESCE(payload, '{}'::jsonb) || ${sql.json(payload)}::jsonb, status = ${status}, updated_at = now()
          WHERE id = ${body.id} AND tenant_id = ${tenantId} RETURNING id`;
        if (row) return row.id;
      }
      const [row] = await sql<{ id: string }[]>`
        INSERT INTO drafts (tenant_id, idea, payload, status)
        VALUES (${tenantId}, ${idea}, ${sql.json(payload)}, ${status}) RETURNING id`;
      return row.id;
    });
    return Response.json({ ok: true, id });
  } catch (e) {
    return Response.json({ error: String(e) }, { status: 500 });
  }
}
