import { repurposeVideo, getClippingConfig } from "@/lib/clipping";
import { effectiveTenantId } from "@/lib/tenant-auth";
import { runWithTenant } from "@/lib/tenant-context";

// POST /api/video/repurpose
// body: { videoUrl?: string, uploadRef?: string, provider?: string, ...options }
// Returns clips ready for OSMU refinement + publish.
// 0차: external clipping (Reap/Ssemble) + basic mock support. Then refine in UI with wiki.
export async function POST(request: Request) {
  const body = await request.json().catch(() => ({}));
  const tenantId = await effectiveTenantId(request, body.tenant_id);

  const videoUrl: string | undefined = body.videoUrl;
  const uploadRef: string | undefined = body.uploadRef; // from /video/upload

  if (!videoUrl && !uploadRef) {
    return Response.json({ error: "videoUrl or uploadRef required" }, { status: 400 });
  }

  // For local long video (uploadRef), external providers need public URL. For 0차, recommend YT URL.
  // If uploadRef and no videoUrl, we can use it for local processing if provider supports, but current is url based.
  if (uploadRef && !videoUrl) {
    // For now, require videoUrl for clipping; uploadRef is for output clips or future.
    // To support local long video, user can host or use YT.
    return Response.json({ error: "For long video input, provide public videoUrl (YT preferred). uploadRef is for clip output." }, { status: 400 });
  }

  const cfg = getClippingConfig();
  if (!cfg.apiKey && !videoUrl?.includes("example")) {
    // allow mock for dev
  }

  // runWithTenant로 감싼다(MAJOR, 코드리뷰 2026-09-25 파생건). 실제 저장 경로는
  // downloadClipToLocal이 tenantId 인자로 storage.tenantVideosDir을 직접 고정하므로
  // 컨텍스트 유무와 무관하다. getClippingConfig가 읽는 clipping-config.json(CONFIG_PATH)은
  // 이 컨텍스트와 무관하다 — dataPath()가 모듈 로드 시점(요청/테넌트 컨텍스트 밖)에 이미
  // 한 번 평가해 고정한 값이고, 그건 버그가 아니라 설계상 의도다: 이 키는 운영자가 한 번
  // 설정하는 공용 3rd-party API 자격증명이다(MINOR-1, 코드리뷰 2026-09-26 정정 — 이전
  // 주석은 이걸 "컨텍스트 누락 버그"처럼 적어 오해를 샀다). 이 wrap의 실제 목적은 이
  // 라우트가 유일하게 runWithTenant 없이 테넌트 요청을 처리하던 곳이었다는 재발 방지
  // 대상 — 다른 video/* 라우트와 동일한 패턴을 맞추는 것뿐이다.
  return runWithTenant(tenantId, async () => {
    try {
      // For uploadRef (local), in full impl we would make it accessible (copy to R2 or temp url).
      // For 0차 MVP: prefer videoUrl (YT). Local uploadRef can be handled by passing local path if provider supports, but here we expect caller to provide accessible url.
      const input = { videoUrl }; // uploadRef for local long not supported for input yet (use public YT URL)

      const result = await repurposeVideo(input, tenantId, {
        provider: body.provider,
        numClips: body.numClips || 6,
        ...body.options,
      });

      // Record usage
      try {
        const auth = request.headers.get('Authorization') || '';
        await fetch(new URL('/api/usage/record', request.url), {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Authorization': auth,
          },
          body: JSON.stringify({ event: 'shortsGeneration', count: result.clips.length }),
        });
      } catch {}

      return Response.json({
        ok: true,
        provider: result.provider,
        clips: result.clips,
        // Add tenant context for later refinement
        tenant_id: tenantId,
      });
    } catch (e: any) {
      return Response.json({ error: e.message || String(e) }, { status: 500 });
    }
  });
}
