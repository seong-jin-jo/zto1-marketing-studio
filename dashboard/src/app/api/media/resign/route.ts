import { AuthError, effectiveTenantId } from "@/lib/tenant-auth";
import { isSafeMediaFilename, signMediaToken } from "@/lib/media-token";
import { resolveGeneratedFile } from "@/lib/storage";

// POST /api/media/resign — 만료된 배달 주소를 같은 파일의 새 주소로 바꿔 준다.
//
// 왜 필요한가 (2026-09-08 코드 감사 F-03)
// 화면 배달 주소는 서명 토큰이고 12시간이면 만료된다. 그런데 초안과 브라우저 자동 저장은
// 만들 때 받은 주소를 문자열 그대로 보관한다. 그래서 어제 만든 작업을 오늘 열면 파일은
// 서버에 멀쩡히 있는데 이미지·영상만 안 보인다. 회장이 말한 "생성물이 안 보임" 의 남은
// 절반이 이것이다. 화면에는 오류도 안 뜬다. img 태그는 실패해도 조용히 빈 자리로 남는다.
//
// 만료를 늘리는 것으로는 못 막는다. 어떤 수명을 골라도 그보다 오래된 작업은 반드시 생긴다.
// 그래서 만료되면 다시 서명해 준다. 안전은 그대로다 — 새 주소는 **요청한 사람의 작업 공간**
// 으로만 발급하고, 그 작업 공간 폴더에 실제로 있는 파일에만 발급한다. 남의 파일 이름을
// 넣어도 자기 폴더에 없으면 아무것도 나오지 않는다.
export async function POST(request: Request) {
  const body = await request.json().catch(() => ({}));
  const filename = typeof body?.filename === "string" ? body.filename : "";
  if (!isSafeMediaFilename(filename)) {
    return Response.json({ ok: false, error: "파일 이름이 올바르지 않습니다." }, { status: 400 });
  }
  // effectiveTenantId 는 인증이 안 되면 던진다. 안 받으면 본문 없는 500 이 그대로 나가고,
  // 화면은 왜 안 되는지 한 마디도 못 듣는다(2026-09-08 배포 화면에서 실측).
  let tenantId: string | null = null;
  try {
    tenantId = await effectiveTenantId(request, body?.tenant_id);
  } catch (e) {
    if (e instanceof AuthError) return Response.json({ ok: false, error: e.message }, { status: e.status });
    throw e;
  }
  if (!tenantId) return Response.json({ ok: false, error: "작업 공간을 확인할 수 없습니다." }, { status: 401 });

  // 배달 라우트와 같은 함수로 찾는다. 탐색이 갈라지면 한쪽에서만 보이는 파일이 생긴다.
  const found = Boolean(resolveGeneratedFile(tenantId, filename));
  // 존재 여부를 그대로 알려 주면 남의 파일 이름을 넣어 보는 것으로 목록을 캘 수 있다.
  // 배달 라우트와 같은 말로 닫는다.
  if (!found) return Response.json({ ok: false, error: "not found" }, { status: 404 });

  const token = signMediaToken(tenantId, filename);
  if (!token) {
    return Response.json({ ok: false, error: "미디어 배달 서명이 설정되지 않았습니다." }, { status: 503 });
  }
  return Response.json({ ok: true, file: `/api/media/${encodeURIComponent(token)}` });
}
