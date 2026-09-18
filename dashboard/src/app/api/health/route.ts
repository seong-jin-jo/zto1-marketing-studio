import { db } from "@/lib/db";

// 서버 프로세스가 시작될 때 주입된 커밋만 신뢰한다. 요청 때마다 현재 작업트리 HEAD를 읽으면
// 오래된 서버도 새 커밋을 반환해 실행본 귀속을 위조할 수 있다.
const BUILD_COMMIT = process.env.OSMU_BUILD_EVIDENCE_COMMIT?.trim() || "unknown";
const BUILD_SOURCE_HASH = process.env.OSMU_BUILD_EVIDENCE_SOURCE_HASH?.trim() || "unknown";

// GET /api/health — 헬스체크(컨테이너 healthcheck + 외부 업타임 모니터용).
// ⚠️ 부작용 0 (이번 장애 교훈: 읽기 경로에 쓰기/테넌트생성 금지). 인증/테넌트 해석 안 함.
// DB 핑(SELECT 1)만 — 빠른 타임아웃. DB 불가 시 503으로 모니터가 감지.
export async function GET() {
  const started = Date.now();
  try {
    await Promise.race([
      db()`SELECT 1`,
      new Promise((_, reject) => setTimeout(() => reject(new Error("db timeout")), 3000)),
    ]);
    return Response.json({
      ok: true,
      db: "up",
      ms: Date.now() - started,
      build_commit: BUILD_COMMIT,
      build_source_hash: BUILD_SOURCE_HASH,
    });
  } catch (e) {
    return Response.json(
      {
        ok: false,
        db: "down",
        error: e instanceof Error ? e.message : String(e),
        ms: Date.now() - started,
        build_commit: BUILD_COMMIT,
        build_source_hash: BUILD_SOURCE_HASH,
      },
      { status: 503 },
    );
  }
}
