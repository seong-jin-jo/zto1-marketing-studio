import { effectiveTenantId, AuthError } from "@/lib/tenant-auth";
import { defaultAccountBlockedMessage, setDefaultAccount } from "@/lib/channel-accounts";

// POST /api/channels/{provider}/accounts/{id}/default — 기본계정 전환.
// cross-tenant면 setDefaultAccount가 0행 매칭 → 404(존재 자체를 숨김).
export async function POST(request: Request, { params }: { params: Promise<{ provider: string; id: string }> }) {
  const { provider, id } = await params;
  let tenantId: string | null;
  try {
    tenantId = await effectiveTenantId(request, new URL(request.url).searchParams.get("tenant_id"));
  } catch (e) {
    if (e instanceof AuthError) return Response.json({ error: e.message, code: e.code }, { status: e.status });
    return Response.json({ error: e instanceof Error ? e.message : String(e) }, { status: 500 });
  }
  if (!tenantId) return Response.json({ error: "테넌트를 식별할 수 없습니다." }, { status: 401 });

  try {
    const result = await setDefaultAccount(tenantId, provider, id);
    if (result.notFound) return Response.json({ error: "계정을 찾을 수 없습니다." }, { status: 404 });
    if (result.blockedReason) {
      return Response.json(
        { error: defaultAccountBlockedMessage(result.blockedReason), code: result.blockedReason },
        { status: 409 },
      );
    }
    return Response.json({ ok: true });
  } catch (e) {
    return Response.json({ error: e instanceof Error ? e.message : String(e) }, { status: 500 });
  }
}
