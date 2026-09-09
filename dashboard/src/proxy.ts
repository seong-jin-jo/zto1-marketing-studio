import { NextRequest, NextResponse } from "next/server";
import { resolveTenantToken, ensureTenantForUser, getTenantStatus } from "@/lib/tenant-auth";
import { verifySupabaseJwt } from "@/lib/supabase";
import {
  clearOperatorAuthFailures,
  recordInvalidOperatorBearer,
} from "@/lib/operator-auth-rate-limit";

// Next 16: middleware.ts → proxy.ts(Node.js 런타임 기본, Edge 아님). 그래서 여기서 DB(resolveTenantToken)·
// Supabase(verifySupabaseJwt) 실검증이 가능해졌다 — 구버전은 Edge라 "형태만 보고 통과"였고, 그게
// 위조 JWT/osmu 접두사만 있으면 라우트까지 도달하는 구멍이었다.

// 고객/osmu 토큰이 접근 가능한 명시적 테넌트인지 라우트만. 여기 없는 API는 전부 레거시(운영자 전용) —
// tenant-auth를 아직 안 쓰는 구코드라 osmu_/JWT를 통과시키면 테넌트 스코프 없이 데이터가 샌다.
const TENANT_AWARE_PATHS = [
  "/api/activity",
  "/api/agent-logs",
  "/api/alerts",
  "/api/analytics",
  "/api/blog-guide",
  "/api/blog-keywords",
  "/api/blog-queue/[postId]/approve",
  "/api/blog-queue/[postId]/delete",
  "/api/blog-queue/[postId]/update",
  "/api/blog-queue/approve",
  "/api/blog-queue/delete",
  "/api/blog-queue",
  "/api/blog-queue/update",
  "/api/blog-stats",
  "/api/blog-upload-image",
  "/api/brand/sync-repo",
  "/api/brand/sync-wiki",
  "/api/channel-config/[channel]",
  "/api/channel-config",
  "/api/channel-settings/[channel]",
  "/api/channel-settings",
  "/api/channels/[provider]/accounts/[id]/default",
  "/api/channels/[provider]/accounts/[id]",
  "/api/channels/[provider]/accounts",
  "/api/connect/[provider]",
  // "/api/cron-status"는 여기 없다(의도적). config/cron/jobs.json 전역 파일을 통째로 읽어 테넌트
  // 구분 없이 모든 크론 잡(이름·모델·주기)을 반환한다 — effectiveTenantId/runWithTenant를 전혀
  // 쓰지 않는 순수 운영 인프라 상태다. 고객별로 거를 방법이 없어 열면 전체 배포의 잡 목록이 그대로
  // 새어 나간다. 운영자 전용으로 유지하고, 성과실 UI(AutomationRulesPanel)는 이 엔드포인트를
  // 아예 호출하지 않도록 고쳤다(막힌 요청 반복 호출 금지).
  "/api/errors",
  "/api/engagement",
  "/api/figma/export-to-queue",
  "/api/growth",
  "/api/guide/[channel]",
  "/api/guide",
  // /api/images: GET이 effectiveTenantId(request)로 인증에서 테넌트를 직접 유도한다(클라이언트가
  // 보내는 tenant_id 쿼리/헤더는 신뢰하지 않음 — 그걸 신뢰하면 다른 테넌트 id를 넣어 갤러리를
  // 열람하는 IDOR이 된다). data/clipping-config.json·elevenlabs-config.json과 달리 이 경로는
  // 테넌트별 하위 디렉토리(data/tenants/{tenantId}/images/)로 물리 격리된다.
  "/api/images",
  "/api/images/upload",
  "/api/images/[filename]",
  "/api/integrations",
  "/api/isolation-proof",
  "/api/keyword-bank/add",
  "/api/keyword-bank/mark-used",
  "/api/keyword-bank/remove",
  "/api/keyword-bank",
  "/api/keywords/[channel]",
  "/api/keywords",
  "/api/me",
  "/api/metrics",
  "/api/notification-log",
  "/api/onboarding",
  "/api/overview",
  // /api/performance/learned-rules: GET/POST/DELETE 전부 effectiveTenantId(request, body/쿼리 tenant_id)로
  // 테넌트를 유도하고 runWithTenant로 감싸 data/tenants/{tenantId}/ 하위 파일만 읽고 쓴다 — 테넌트-safe.
  "/api/performance/learned-rules",
  "/api/popular/add",
  "/api/popular/delete",
  "/api/popular",
  "/api/product-source",
  "/api/provision",
  "/api/publish",
  "/api/publish/first-comment-capabilities",
  "/api/queue/[postId]/add-image",
  "/api/queue/[postId]/approve",
  "/api/queue/[postId]/delete",
  "/api/queue/[postId]/update",
  "/api/queue/[postId]/variants",
  "/api/queue/add",
  "/api/queue/backfill",
  "/api/queue/bulk-approve",
  "/api/queue/bulk-delete",
  "/api/queue",
  "/api/queue/seed",
  "/api/schedule/publish-due",
  "/api/schedule",
  "/api/settings",
  "/api/sourcing/import-to-queue",
  "/api/sourcing",
  "/api/studio/brand-setup",
  "/api/studio/commands",
  "/api/studio/drafts",
  // 편집실에서 여러 줄을 한 번에 고쳐 달라고 말로 시키는 자리(회장 2026-09-09).
  // 이 목록은 허용 목록이라, 새 라우트를 만들고 여기 안 넣으면 고객 화면에서 403 이 난다.
  // 실제로 그렇게 냈다. 만들자마자 여기 한 줄을 함께 추가한다.
  "/api/studio/edit-bulk",
  "/api/studio/drafts/[draftId]/editor",
  "/api/studio/drafts/[draftId]/enqueue",
  "/api/studio/engine-status",
  // 만들기 전 비용 산정. 고객이 승인 여부를 판단하는 화면이 부르므로 테넌트 경로다
  // (사업계획 v0.4 7절·10절의 비용 승인 관문).
  "/api/studio/estimate",
  // 고객이 자기 생성 이력을 보는 경로(회장 2026-09-06 확정).
  "/api/studio/generation-history",
  "/api/studio/handoffs",
  // 브랜드를 아는 일곱 칸의 서버 보관소. 고객 화면이 직접 읽고 쓰는 경로다.
  // 여기 없으면 저장은 코드에 있는데 화면에서 403 이 나 브라우저에만 남는다(2026-09-07 실측).
  "/api/studio/learning",
  "/api/studio/text",
  // 2026-09-06 회장 확정으로 이미지·영상 생성을 고객에게 열었다. 두 라우트는
  // effectiveTenantId 로 테넌트를 확인하고 사용량을 그 작업 공간에 남긴다.
  "/api/higgsfield/image",
  "/api/higgsfield/video",
  // 만든 그림과 영상을 화면이 불러오는 경로. 여기 없으면 만들기는 되는데 화면에 안 뜬다
  // (회장 2026-09-07 실사용). 라우트 자체가 tenant_id 를 요구하고 그 테넌트 폴더에서만 읽는다.
  "/api/higgsfield/asset/[file]",
  "/api/suggestions",
  "/api/suggestions/enqueue",
  "/api/threads-username",
  // /api/threads/low-engagement-candidates(GET, 읽기 전용)·/api/threads/low-engagement-cleanup(POST, 승낙된
  // postId만 삭제)는 effectiveTenantId + runWithTenant로 테넌트를 격리한다 — 테넌트-safe.
  "/api/threads/low-engagement-candidates",
  "/api/threads/low-engagement-cleanup",
  "/api/tiktok/creator-info",
  "/api/tiktok/publish-status",
  "/api/trend-report",
  "/api/usage/record",
  "/api/usage",
  // "/api/clipping-config"·"/api/elevenlabs-config"는 여기 없다(의도적). 두 라우트는
  // data/{clipping,elevenlabs}-config.json 단일 전역 파일을 GET에서 평문 apiKey까지 그대로
  // 되돌린다 — 테넌트 구분이 전혀 없어 허용하면 임의 테넌트가 다른 테넌트(사실상 전체 배포)의
  // 시크릿을 읽고 덮어쓸 수 있다. getChannelCred류 테넌트별 암호화 저장으로 옮기기 전까지
  // 운영자 전용으로 유지하고, UI는 canGenerate(=isOperator)로 입력 폼을 숨긴다.
  "/api/video/delete",
  // SNS-015 보안: "/api/video/generate"는 여기 없다(의도적). 이 라우트는 요청 본문의
  // slide.imageUrl / bgmUrl 을 서버가 그대로 fetch하고(임의 URL = SSRF: OWASP SSRF Prevention
  // Cheat Sheet "Avoid accepting complete URLs from users" 위반) 동기 ffmpeg를 슬라이드 수만큼
  // 돌린다(자원 고갈). 따라서 OAuth 고객 토큰/JWT에는 노출하지 않고 운영자 전용으로 유지한다.
  // UI(/videos)도 운영자에게만 생성 탭을 그려 403 나는 버튼을 고객에게 제안하지 않는다.
  "/api/video/list",
  "/api/video/publish",
  "/api/video/refine-clip",
  "/api/video/repurpose",
  "/api/video/upload",
  "/api/voice-tone",
  "/api/weekly-report",
  "/api/weekly-summary",
  // /api/youtube/status: effectiveTenantId(request, tenant_id)로 테넌트를 유도하고
  // getChannelCred(tenantId, "youtube")(DB, 테넌트별 암호화 토큰)만 읽는다 — 테넌트-safe.
  "/api/youtube/status",
];

const TENANT_AWARE_MATCHERS = TENANT_AWARE_PATHS.map((pattern) => {
  const escaped = pattern
    .split("/")
    .map((seg) => (seg.startsWith("[") && seg.endsWith("]") ? "[^/]+" : seg.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")))
    .join("/");
  return new RegExp(`^${escaped}$`);
});

const STUDIO_INDEPENDENT_MATCHERS = [
  /^\/api\/studio\/v1\/generations$/,
  /^\/api\/studio\/v1\/generations\/[^/]+$/,
  /^\/api\/studio\/v1\/generations\/[^/]+\/rejections$/,
  /^\/api\/studio\/v1\/generations\/[^/]+\/derivations$/,
  /^\/api\/studio\/v1\/derivations\/[^/]+$/,
  /^\/api\/studio\/v1\/regenerations\/[^/]+$/,
  /^\/api\/studio\/v1\/shorts-factory\/runs$/,
  /^\/api\/studio\/v1\/shorts-factory\/runs\/[^/]+$/,
];

function isTenantAwarePath(pathname: string): boolean {
  return TENANT_AWARE_MATCHERS.some((re) => re.test(pathname));
}

function isIndependentStudioPath(pathname: string): boolean {
  return STUDIO_INDEPENDENT_MATCHERS.some((re) => re.test(pathname));
}

// 계정 게이트: paused(정지)/unavailable(알수없는 상태)면 /api/me를 제외한 모든 tenant-aware 경로를
// 403으로 막는다. OSMU v1.0.0부터 신규 가입은 즉시 'active'로 생성되므로(ensureTenantForUser)
// pending(승인대기) 분기는 제거됐다 — 공개 대시보드는 active 상태를 계정 접근 자체로는 막지 않는다.
// 공유 AI(claude -p) 사용 승인은 별도 entitlement(tenants.shared_cli_approved_at)로,
// lib/anthropic.ts generateText가 quota reserve 전에 개별 게이트한다.
// /api/me는 이 상태 자체를 조회해 accessPaused로 화면분기해야 하므로 통과시킨다
// (라우트 핸들러가 effectiveTenantId(..., {allowInactive:true})로 재확인).
async function checkTenantAccess(tenantId: string): Promise<NextResponse | null> {
  let status: string | null;
  try {
    status = await getTenantStatus(tenantId);
  } catch {
    return NextResponse.json({ error: "테넌트 상태 확인 실패(DB 연결 불가)" }, { status: 503 });
  }
  if (status === "active") return null;
  if (status === "paused") {
    return NextResponse.json({ error: "계정 이용이 중지되었습니다", code: "account_paused" }, { status: 403 });
  }
  // fail-closed: 레거시 pending/null/미존재/알수없는 status는 통과시키지 않는다(assertTenantActive와 동일 정책).
  return NextResponse.json({ error: "테넌트 상태를 확인할 수 없습니다", code: "account_unavailable" }, { status: 403 });
}

function invalidBearerResponse(
  request: NextRequest,
  path: string,
  bearerSupplied: boolean,
): NextResponse {
  if (path === "/api/me" && bearerSupplied) {
    const rateLimit = recordInvalidOperatorBearer(request);
    if (rateLimit.limited) {
      return NextResponse.json(
        { error: "Too Many Requests" },
        {
          status: 429,
          headers: {
            "Cache-Control": "no-store",
            "Retry-After": String(rateLimit.retryAfterSeconds),
          },
        },
      );
    }
  }
  return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
}

export async function proxy(request: NextRequest) {
  const authToken = process.env.DASHBOARD_AUTH_TOKEN;
  const isApi = request.nextUrl.pathname.startsWith("/api/");

  // /api/health — 무인증 공개(컨테이너 healthcheck + 외부 업타임 모니터). 부작용 0, 이 인스턴스 직접 체크.
  if (request.nextUrl.pathname === "/api/health") return NextResponse.next();

  // 페이지(HTML) 문서 요청: 항상 최신 HTML을 받게 no-store.
  // 재배포 후 브라우저가 옛 HTML(이전 빌드의 죽은 JS 청크명)을 캐시 → 청크 404 →
  // "This page couldn't load"(ChunkLoadError) 나는 것을 차단. 해시된 _next 정적 청크는
  // matcher에서 제외되어 그대로 영구 캐시(불변). API는 아래 기존 로직.
  if (!isApi) {
    const res = NextResponse.next();
    res.headers.set("Cache-Control", "no-store, must-revalidate");
    return res;
  }

  // Studio v1은 openclaw 대시보드와 회원·권한 장부가 다른 독립 제품이다.
  // 같은 Authorization 헤더를 대시보드 토큰으로 먼저 해석하면 Studio bearer가
  // Route Handler에 도달하지 못하므로, 이 버전 네임스페이스만 Studio 인증 경계에 위임한다.
  // 기존 /api/studio/* 대시보드 경로와 TENANT_AWARE_PATHS는 그대로 보호한다.
  if (isIndependentStudioPath(request.nextUrl.pathname)) return NextResponse.next();

  // 프록시 모드(포크 셀프호스트, Phase 1): OSMU_API_BASE 설정 시 모든 /api를 중앙 인스턴스로
  // 토큰 붙여 그대로 전달(얇은 프록시). 토큰(OSMU_TENANT_TOKEN)은 서버 env에만 — 브라우저 노출 0.
  // DB·로직 없음. 중앙이 resolveTenantToken으로 검증 + RLS 스코프.
  const apiBase = process.env.OSMU_API_BASE;
  if (apiBase && isApi) {
    const dest = new URL(request.nextUrl.pathname + request.nextUrl.search, apiBase);
    const headers = new Headers(request.headers);
    const tok = process.env.OSMU_TENANT_TOKEN;
    if (tok) headers.set("Authorization", `Bearer ${tok}`);
    return NextResponse.rewrite(dest, { request: { headers } });
  }

  // L0-1: AUTH_TOKEN 미설정 시 전 API 공개 = 격리 근본구멍. prod는 fail-closed(503).
  // dev(NODE_ENV!=production) 또는 명시적 OSMU_AUTH_OPTIONAL=1 일 때만 무인증 허용.
  if (!authToken) {
    const devOptOut = process.env.NODE_ENV !== "production" || process.env.OSMU_AUTH_OPTIONAL === "1";
    if (isApi && !devOptOut) {
      return NextResponse.json(
        { error: "DASHBOARD_AUTH_TOKEN 미설정 — prod 무인증 차단. dev는 OSMU_AUTH_OPTIONAL=1로 우회." },
        { status: 503 },
      );
    }
    return NextResponse.next();
  }

  // Allow OPTIONS (CORS preflight)
  if (request.method === "OPTIONS") return NextResponse.next();

  // Allow Figma OAuth callback without auth
  if (request.nextUrl.pathname === "/api/figma-mcp/callback") return NextResponse.next();

  // SNS-015: 서명 미디어 배달(/api/media/<token>)은 여기서 Bearer 인증을 요구하지 않는다.
  // 이 URL을 가져가는 주체는 Meta(Instagram Reels container) 서버라 Authorization 헤더를
  // 붙일 수 없다 — 대신 라우트 핸들러(app/api/media/[token]/route.ts)가 자체 HMAC
  // 서명(verifyMediaToken)으로 테넌트·파일명·만료를 검증한다. 프록시는 경로 형태만
  // 확인하고 인증/인가 판단 자체는 핸들러에 위임(우회가 아니라 검증 지점 이동).
  if (request.nextUrl.pathname.startsWith("/api/media/")) return NextResponse.next();

  // SNS-016: 서명 이미지 배달(/api/images/deliver/<token>)도 동일한 이유로 Bearer 인증을 요구하지
  // 않는다 — Meta/Threads가 큐에 저장된 이미지 URL을 서버 대 서버로 직접 가져간다. 인가 판단은
  // 라우트 핸들러(app/api/images/deliver/[token]/route.ts)의 verifyImageToken이 담당한다.
  if (request.nextUrl.pathname.startsWith("/api/images/deliver/")) return NextResponse.next();

  // 고객 로그인 진입점. Google OAuth는 provider disabled raw JSON을 막기 위해 앱 서버에서 preflight한다.
  if (request.nextUrl.pathname === "/api/auth/google") return NextResponse.next();

  // 소셜 OAuth 연결 콜백(provider 리다이렉트 — 인증 헤더 없음). state(tenantId)로 스코프.
  if (request.nextUrl.pathname.startsWith("/api/connect/") && request.nextUrl.pathname.endsWith("/callback")) {
    return NextResponse.next();
  }

  const path = request.nextUrl.pathname;
  const authorization = request.headers.get("Authorization") ?? "";
  const bearerMatch = authorization.match(/^Bearer\s+(.+)$/i);
  const token = bearerMatch?.[1] ?? "";
  const looksLikeJwt = token.split(".").length === 3 && token.length > 40;

  // 운영자 토큰 = 전체 접근(대시보드)
  if (token === authToken) {
    clearOperatorAuthFailures(request);
    return NextResponse.next();
  }

  const tenantAware = isTenantAwarePath(path);

  // Authenticate-before-authorize(Codex 2nd-pass 반려 수정): 레거시(비-테넌트-aware) 경로라고
  // 해서 토큰 실검증을 건너뛰고 403부터 반환하면, 위조/폐기 토큰 소지자가 "이 토큰이 어떤 경로에서
  // 막히는지"로 경로 존재·분류를 정찰할 수 있고 무효 자격증명이 유효한 것처럼 취급받는 순서가 된다.
  // 그래서 먼저 실제 principal을 검증(unknown/revoked/fake=401, verifier/DB 장애=503)하고,
  // 그 결과가 valid일 때만 "그 경로 접근 권한이 있는가"(legacy=운영자 전용 403)를 따진다.
  if (token.startsWith("osmu_")) {
    let tenantId: string | null;
    try {
      tenantId = await resolveTenantToken(token);
    } catch {
      return NextResponse.json({ error: "테넌트 토큰 검증 실패(DB 연결 불가)" }, { status: 503 });
    }
    if (!tenantId) return invalidBearerResponse(request, path, bearerMatch !== null);
    if (!tenantAware) {
      return NextResponse.json({ error: "이 API는 운영자 전용입니다" }, { status: 403 });
    }
    if (path !== "/api/me") {
      const gate = await checkTenantAccess(tenantId);
      if (gate) return gate;
    }
    return NextResponse.next();
  }

  // 고객 로그인 세션(Supabase JWT) — 서명검증까지 실행(구버전은 헤더.페이로드.서명 형태만 보고 통과).
  if (looksLikeJwt) {
    const verified = await verifySupabaseJwt(token);
    if (verified.status === "unavailable") {
      return NextResponse.json({ error: "세션 토큰 검증 불가(Supabase 연결 실패)" }, { status: 503 });
    }
    if (verified.status === "invalid") {
      return invalidBearerResponse(request, path, bearerMatch !== null);
    }
    if (!tenantAware) {
      return NextResponse.json({ error: "이 API는 운영자 전용입니다" }, { status: 403 });
    }
    if (path !== "/api/me") {
      let tenantId: string;
      try {
        tenantId = await ensureTenantForUser(verified.user.id, verified.user.email ?? null);
      } catch {
        return NextResponse.json({ error: "테넌트 확인 실패(DB 연결 불가)" }, { status: 503 });
      }
      const gate = await checkTenantAccess(tenantId);
      if (gate) return gate;
    }
    return NextResponse.next();
  }

  // 운영자 로그인 UI가 검증하는 /api/me Bearer 실패를 이 인증 경계에서 제한한다. osmu_/JWT도
  // 실제 검증에 실패한 경우에는 같은 응답으로 합류해 공격자가 형태만 바꿔 bucket을 우회하지 못한다.
  // 성공한 customer 인증은 위에서 통과하며 이 카운터를 읽거나 소모하지 않는다.
  return invalidBearerResponse(request, path, bearerMatch !== null);
}

export const config = {
  // 페이지 + API 모두 통과(정적 자산·이미지·favicon 제외 → 청크는 영구캐시 유지).
  matcher: ["/((?!_next/static|_next/image|favicon.ico).*)"],
};
