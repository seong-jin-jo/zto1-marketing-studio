import { generateText, sharedAiApprovalErrorResponse, sharedGenerationQuotaErrorResponse } from "@/lib/anthropic";
import { effectiveTenantId } from "@/lib/tenant-auth";
import { upstreamFailure } from "@/lib/api-failure";

// POST /api/studio/edit-bulk — 편집실에서 여러 줄을 한 번에 고쳐 달라고 말로 시키는 자리.
//
// 2026-09-09 회장 지시: "편집실에서는 AI 요청 안 하고 직접 코드기반으로 수정할수있게
// 하는건데, AI 챗봇에서는 '자막에서 어투 이렇게 바꿔줘' 이렇게 요청할수도있는거고."
//
// 기준은 변경의 크기와 종류다. 한 곳을 정확히 바꾸는 것은 손이 빠르다(그래서 모든 줄이
// 언제나 입력칸이다). 여러 곳을 같은 규칙으로 바꾸는 것은 말이 빠르다. 손으로 하면 스무 번
// 반복해야 하는 것을 한 번에 시킨다. 이 라우트가 그 후자를 맡는다.
//
// 줄 수와 순서는 절대 바꾸지 않는다. 바뀌면 화면의 장면 순서와 어긋나고, 사용자가 무엇이
// 어디로 갔는지 알 수 없게 된다. 모델이 개수를 틀리면 그 결과는 버린다.
export async function POST(request: Request) {
  const body = await request.json().catch(() => ({}));
  const lines = Array.isArray(body?.lines) ? body.lines.map((line: unknown) => String(line ?? "")) : null;
  const instruction = typeof body?.instruction === "string" ? body.instruction.trim() : "";

  if (!lines || lines.length === 0) {
    return Response.json({ ok: false, error: "고칠 내용이 없습니다." }, { status: 400 });
  }
  if (!instruction) {
    return Response.json({ ok: false, error: "무엇을 바꿀지 한 줄로 적어 주세요." }, { status: 400 });
  }
  if (lines.length > 60) {
    return Response.json({ ok: false, error: "한 번에 고칠 수 있는 줄은 60개까지입니다." }, { status: 400 });
  }

  const tenantId = await effectiveTenantId(request, body?.tenant_id).catch(() => null);
  if (!tenantId) return Response.json({ ok: false, error: "작업 공간을 확인할 수 없습니다." }, { status: 401 });

  const prompt = [
    "아래 문장들을 요청대로 고쳐 주세요.",
    "규칙은 셋입니다. 이것을 어기면 결과가 버려집니다.",
    "1. 줄의 개수를 바꾸지 마세요. 받은 개수 그대로 돌려주세요.",
    "2. 줄의 순서를 바꾸지 마세요.",
    "3. 요청과 무관한 문장은 그대로 두세요.",
    "응답은 설명이나 코드 펜스 없이 JSON 객체 하나만 반환하세요.",
    '형식: {"lines":["고친 첫 줄","고친 둘째 줄"]}',
    "",
    `요청: ${instruction}`,
    "",
    "문장들:",
    JSON.stringify(lines),
  ].join("\n");

  try {
    const raw = await generateText(prompt, tenantId);
    const match = raw.match(/\{[\s\S]*\}/);
    if (!match) {
      return upstreamFailure("생성기가 알아볼 수 없는 형식으로 답했습니다. 잠시 후 다시 시도해 주세요.");
    }
    const parsed = JSON.parse(match[0]) as { lines?: unknown };
    const next = Array.isArray(parsed.lines) ? parsed.lines.map((line) => String(line ?? "")) : null;
    if (!next || next.length !== lines.length) {
      // 개수가 다르면 어느 줄이 어느 줄이 됐는지 알 수 없다. 조용히 덮으면 작업물이 망가진다.
      return upstreamFailure("고친 결과의 줄 수가 원래와 달라 적용하지 않았습니다. 요청을 조금 더 좁혀 다시 시도해 주세요.");
    }
    const changed = next.filter((line, index) => line !== lines[index]).length;
    return Response.json({ ok: true, lines: next, changed });
  } catch (e) {
    const approval = sharedAiApprovalErrorResponse(e);
    if (approval) return approval;
    const quota = sharedGenerationQuotaErrorResponse(e);
    if (quota) return quota;
    const message = e instanceof Error ? e.message : String(e);
    return upstreamFailure(message.slice(0, 300));
  }
}
