import { readJson, writeJson, dataPath } from "@/lib/file-io";
import { effectiveTenantId } from "@/lib/tenant-auth";
import { runWithTenant } from "@/lib/tenant-context";
import { sanitizeLearningInfo } from "@/lib/studio-learning-sanitize";

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

interface LearningFile {
  info?: Record<string, string>;
  updatedAt?: string;
}

export async function GET(request: Request) {
  const tenantId = await effectiveTenantId(request, new URL(request.url).searchParams.get("tenant_id"));
  if (!tenantId) return Response.json({ info: {} }, { status: 401 });
  return runWithTenant(tenantId, async () => {
    const data = readJson<LearningFile>(dataPath(FILE_NAME));
    return Response.json({ info: sanitizeLearningInfo(data?.info ?? {}), updatedAt: data?.updatedAt ?? null });
  });
}

export async function PUT(request: Request) {
  const body = await request.json().catch(() => ({}));
  const tenantId = await effectiveTenantId(request, body.tenant_id ?? null);
  if (!tenantId) return Response.json({ error: "tenant_id required" }, { status: 401 });
  const info = sanitizeLearningInfo(body.info);
  return runWithTenant(tenantId, async () => {
    const updatedAt = new Date().toISOString();
    writeJson(dataPath(FILE_NAME), { info, updatedAt });
    return Response.json({ ok: true, info, updatedAt });
  });
}
