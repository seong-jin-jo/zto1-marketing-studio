import { readJson, writeJson, dataPath } from "@/lib/file-io";
import { effectiveTenantId } from "@/lib/tenant-auth";
import { runWithTenant } from "@/lib/tenant-context";

/**
 * 학습 정보(브랜드를 아는 일곱 칸)의 서버 보관소.
 *
 * 2026-09-07 감사: 이 값이 브라우저 localStorage 에만 있었다. 회장 화면에는 "7 / 7 모두
 * 채움"이 떠 있지만 다른 기기나 다른 브라우저로 들어가면 0 칸이 된다. 방문 기록을 지워도
 * 사라진다. 쌓을수록 좋아진다고 파는 제품에서 쌓인 것이 기기에 묶여 있으면 그것은
 * 쌓이는 것이 아니다.
 *
 * 저장 단위는 작업 공간이다. 성과 학습 규칙과 같은 파일 보관 방식을 쓴다.
 */
const FILE_NAME = "studio-learning-info.json";

/** 저장 가능한 칸 이름. 화면의 LEARNING_SLOTS 와 같은 집합이다. */
const ALLOWED_KEYS = new Set([
  "business", "audience", "voice", "purpose", "forbidden", "palette", "rights", "learnedRules",
]);
/** 한 칸이 지나치게 길어져 프롬프트를 잡아먹는 것을 막는다. */
const MAX_VALUE_LENGTH = 2_000;

interface LearningFile {
  info?: Record<string, string>;
  updatedAt?: string;
}

function sanitize(input: unknown): Record<string, string> {
  if (!input || typeof input !== "object" || Array.isArray(input)) return {};
  const out: Record<string, string> = {};
  for (const [key, value] of Object.entries(input as Record<string, unknown>)) {
    if (!ALLOWED_KEYS.has(key)) continue;
    if (typeof value !== "string") continue;
    const trimmed = value.trim();
    if (!trimmed) continue;
    out[key] = trimmed.slice(0, MAX_VALUE_LENGTH);
  }
  return out;
}

export async function GET(request: Request) {
  const tenantId = await effectiveTenantId(request, new URL(request.url).searchParams.get("tenant_id"));
  if (!tenantId) return Response.json({ info: {} }, { status: 401 });
  return runWithTenant(tenantId, async () => {
    const data = readJson<LearningFile>(dataPath(FILE_NAME));
    return Response.json({ info: sanitize(data?.info ?? {}), updatedAt: data?.updatedAt ?? null });
  });
}

export async function PUT(request: Request) {
  const body = await request.json().catch(() => ({}));
  const tenantId = await effectiveTenantId(request, body.tenant_id ?? null);
  if (!tenantId) return Response.json({ error: "tenant_id required" }, { status: 401 });
  const info = sanitize(body.info);
  return runWithTenant(tenantId, async () => {
    const updatedAt = new Date().toISOString();
    writeJson(dataPath(FILE_NAME), { info, updatedAt });
    return Response.json({ ok: true, info, updatedAt });
  });
}
