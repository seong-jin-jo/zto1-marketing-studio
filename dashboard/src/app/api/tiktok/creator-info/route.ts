import { effectiveTenantId, AuthError } from "@/lib/tenant-auth";
import { getChannelCred } from "@/lib/publish";
import { queryTikTokCreatorInfo } from "@/lib/tiktok";
import { isPublishDryRunEnabled } from "@/lib/publish-dry-run";

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export async function GET(request: Request) {
  const searchParams = new URL(request.url).searchParams;
  const accountId = searchParams.get("account_id") || undefined;
  const requestedTenantId = searchParams.get("tenant_id");
  if (accountId && !UUID_RE.test(accountId)) {
    return Response.json({ error: "계정 식별자 형식이 올바르지 않습니다." }, { status: 400 });
  }
  if (requestedTenantId && !UUID_RE.test(requestedTenantId)) {
    return Response.json({ error: "작업 공간 식별자 형식이 올바르지 않습니다." }, { status: 400 });
  }

  let tenantId: string | null;
  try {
    // 다른 채널 계정 API와 같은 계약이다. 운영자 요청은 화면이 선택한 작업 공간을
    // 사용하고, 고객 토큰 요청은 effectiveTenantId가 토큰에 매핑된 작업 공간을 우선한다.
    tenantId = await effectiveTenantId(request, requestedTenantId);
  } catch (error) {
    if (error instanceof AuthError) {
      return Response.json({ error: error.message, code: error.code }, { status: error.status });
    }
    return Response.json({ error: "테넌트를 확인할 수 없습니다." }, { status: 500 });
  }
  if (!tenantId) return Response.json({ error: "테넌트를 확인할 수 없습니다." }, { status: 400 });

  const cred = await getChannelCred(tenantId, "tiktok", accountId);
  if (!cred?.token) {
    return Response.json({ connected: false, error: "TikTok 계정을 먼저 연결해주세요." }, { status: 404 });
  }

  // 로컬 실경로 검증에서는 계정 선택과 개인정보 공개 UI까지 실제 화면을 통과하되,
  // TikTok 네트워크 경계는 넘지 않는다. 운영 빌드는 dry-run 자체가 비활성이다.
  if (isPublishDryRunEnabled()) {
    return Response.json({
      connected: true,
      ready: true,
      accountId: cred.accountId,
      creator: {
        username: typeof cred.meta?.username === "string" ? cred.meta.username : (cred.userId || "local-dry-run"),
        privacyLevels: ["SELF_ONLY", "MUTUAL_FOLLOW_FRIENDS", "PUBLIC_TO_EVERYONE"],
        commentDisabled: false,
        duetDisabled: false,
        stitchDisabled: false,
      },
    });
  }

  const creator = await queryTikTokCreatorInfo(cred.token);
  if (!creator) {
    return Response.json(
      { connected: true, ready: false, error: "TikTok 계정 정보를 확인하지 못했습니다. 계정을 다시 연결해주세요." },
      { status: 502 },
    );
  }
  return Response.json({ connected: true, ready: true, accountId: cred.accountId, creator });
}
