export interface StudioLearningInput {
  workspaceId: string;
  topic: string;
  purpose: string;
  audience: string;
  workspaceFacts: string[];
  forbiddenPhrases: string[];
  materialRightsConfirmed: boolean;
  contentBranch: "text_image" | "video";
  /** 학습 정보의 말투 칸. 비면 브랜드 문서에 적힌 말투를 따른다. */
  tone?: string;
  /** 학습 정보의 브랜드 색 칸. 카드뉴스·영상 화면을 좌우한다. */
  palette?: string;
}

// 현재 생성기는 서버의 내장 X4 조립 규칙 v1을 사용한다. 사용자가 세션 저장소에 내부 UUID를
// 심어야만 생성되는 것은 제품 계약이 아니므로, 클라이언트 릴리스에 고정된 추적 ID로 보낸다.
export const STUDIO_GENERATION_SKILL_VERSION_ID = "9f73f414-7084-4a44-9ab4-6fe0fd0f5140";

export interface StudioGenerationCandidate {
  generation_id?: string;
  candidate_id: string;
  ordinal: 1 | 2 | 3;
  label: "A" | "B" | "C";
  angle: "problem_first" | "proof_first" | "process_first";
  title: string;
  rationale: string;
  format: {
    content_branch: "text_image" | "video";
    preview_kind: "structured_storyboard";
    quality: "draft";
    outline: string[];
  };
}

interface StudioGenerationEnvelope {
  data?: { job_id: string; candidates: StudioGenerationCandidate[] };
  error?: { message?: string; field_errors?: Array<{ field: string; reason: string }> };
}

interface StudioRegenerationEnvelope {
  data?: {
    replacement: { job_id: string; candidates: StudioGenerationCandidate[] };
  };
  error?: { message?: string };
}

function required(value: string, label: string): string {
  const normalized = value.trim();
  if (!normalized) throw new Error(`${label}이 비어 있습니다`);
  return normalized;
}

export function buildStudioGenerationRequest(input: StudioLearningInput) {
  const topic = required(input.topic, "이번 주제");
  const purpose = required(input.purpose, "목적");
  const audience = required(input.audience, "대상");
  if (!input.materialRightsConfirmed) throw new Error("소재 권리 확인이 필요합니다");

  return {
    workspace_id: required(input.workspaceId, "작업 공간"),
    learning_context: {
      s0: { revision: 1, safety_rules: ["거짓 정보와 권리 미확인 소재를 만들지 않는다"] },
      s1: { revision: 1, market_context: "한국어 소셜 채널용 OSMU 콘텐츠" },
      u2: { revision: 1, locale: "ko-KR", time_zone: "Asia/Seoul", accessibility_requirements: ["자막 없이도 핵심 문장이 읽혀야 한다"] },
      u3: {
        revision: 1,
        purpose,
        audience,
        content_branch: input.contentBranch,
        workspace_facts: input.workspaceFacts,
        workspace_facts_confirmed_empty: input.workspaceFacts.length === 0,
        forbidden_phrases: input.forbiddenPhrases,
        forbidden_phrases_confirmed_empty: input.forbiddenPhrases.length === 0,
        material_rights_confirmed: true,
        // 2026-09-10: 사용자가 학습 정보에서 고른 말투를 여기 안 넣고 null 로 보내고 있었다.
        // 화면은 "말투: 따뜻하게" 라고 표시하면서 생성기에는 말투를 한 글자도 안 준 것이다.
        // 일곱 칸을 채우게 해 놓고 쓰지 않으면 그 문답은 장식이다.
        tone: input.tone?.trim() || null,
      },
      x4: {
        revision: 1,
        skill_version_id: STUDIO_GENERATION_SKILL_VERSION_ID,
        structure_rules: ["후보 A, B, C를 서로 다른 도입 각도로 만든다"],
      },
      l5: { revision: 0, accepted_rules: [] },
      r6: { topic, output_language: "ko-KR", adjustments: {} },
    },
    platform_spec: null,
  };
}

/**
 * 응답을 JSON 으로 읽는다. 못 읽으면 왜 못 읽었는지를 사람 말로 담아 던진다.
 *
 * 2026-09-09 실사용에서 찾았다. 생성이 오래 걸리면 우리 앞의 리버스 프록시가 요청을 끊고
 * 자기 HTML 오류 페이지를 돌려준다. 그것을 JSON 으로 읽으려다 브라우저가
 * "The string did not match the expected pattern." 을 던졌고, 그 문구가 화면에 그대로 떴다.
 *
 * 더 나쁜 것은 **서버는 그때도 계속 만들고 있었다는 것**이다. 생성 이력에 그 건이 토큰까지
 * 기록돼 있었다. 즉 만들어졌는데 화면만 실패로 끝났다. 사용자는 돈이 나간 줄도 모르고
 * 다시 누른다.
 */
/**
 * 받침 유무로 은/는·이/가를 고른다.
 *
 * 2026-09-09 실제 화면에서 "구조 초안 만들기이 오래 걸려" 가 떴다. 조사를 고정 문자열로
 * 박아 두면 앞말이 바뀌는 순간 한국어가 깨진다. 사용자가 가장 불안한 순간에 뜨는 문장이
 * 어색하면 그것만으로 신뢰가 깎인다.
 */
function subjectParticle(word: string): string {
  const last = word.trim().slice(-1);
  const code = last.charCodeAt(0);
  if (Number.isNaN(code) || code < 0xac00 || code > 0xd7a3) return "가";
  return (code - 0xac00) % 28 === 0 ? "가" : "이";
}

async function readJson<T>(response: Response, what: string): Promise<T> {
  const text = await response.text();
  try {
    return JSON.parse(text) as T;
  } catch {
    if (response.status === 504 || response.status === 524 || response.status === 502) {
      throw new Error(`${what}${subjectParticle(what)} 오래 걸려 연결이 먼저 끊겼습니다. 서버에서는 계속 만들고 있을 수 있으니 잠시 뒤 작업물 전체에서 확인해 주세요.`);
    }
    throw new Error(`${what} 중 서버가 알아볼 수 없는 응답을 보냈습니다(${response.status}). 잠시 후 다시 시도해 주세요.`);
  }
}

export async function requestStudioCandidates(input: StudioLearningInput, token: string): Promise<StudioGenerationCandidate[]> {
  const authorization = required(token, "Studio 인증");
  const response = await fetch("/api/studio/v1/generations", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${authorization}`,
      "Content-Type": "application/json",
      "Idempotency-Key": crypto.randomUUID(),
    },
    body: JSON.stringify(buildStudioGenerationRequest(input)),
  });
  const body = await readJson<StudioGenerationEnvelope>(response, "구조 초안 만들기");
  if (!response.ok || !body.data) {
    const field = body.error?.field_errors?.[0];
    throw new Error(field ? `${field.field}: ${field.reason}` : body.error?.message || "후보 생성에 실패했습니다");
  }
  if (body.data.candidates.length !== 3) throw new Error("Studio가 후보 세 장을 반환하지 않았습니다");
  return body.data.candidates.map((candidate) => ({
    ...candidate,
    generation_id: body.data!.job_id,
  }));
}

export async function regenerateStudioCandidates(jobId: string, token: string): Promise<StudioGenerationCandidate[]> {
  const authorization = required(token, "Studio 인증");
  const generationId = required(jobId, "기존 생성 작업");
  const response = await fetch(`/api/studio/v1/regenerations/${encodeURIComponent(generationId)}`, {
    method: "POST",
    headers: { Authorization: `Bearer ${authorization}` },
  });
  const body = await readJson<StudioRegenerationEnvelope>(response, "구조 초안 다시 만들기");
  if (!response.ok || !body.data) {
    throw new Error(body.error?.message || "무료 재생성에 실패했습니다");
  }
  const replacement = body.data.replacement;
  if (replacement.candidates.length !== 3) throw new Error("Studio가 대체 후보 세 장을 반환하지 않았습니다");
  return replacement.candidates.map((candidate) => ({ ...candidate, generation_id: replacement.job_id }));
}

export type StudioDerivationKind = "text" | "card" | "video";

export interface StudioDerivationQuote {
  currency: string;
  total_minor: number;
  lines: Array<{ kind: StudioDerivationKind; label: string; unit_minor: number }>;
  assumptions: string[];
}

export interface StudioDerivationBatch {
  batch_id: string;
  job_id: string;
  candidate_id: string;
  status: "succeeded" | "partially_succeeded" | "failed";
  cost: {
    currency: string;
    quoted_minor: number;
    charged_minor: number;
    free_regeneration_consumed: boolean;
  };
  items: Array<{
    kind: StudioDerivationKind;
    label: string;
    status: "succeeded" | "failed";
    draft_id: string | null;
    handoff_id: string | null;
    summary: string;
    charged_minor: number;
    failure_reason: string | null;
  }>;
  discarded_at: string | null;
}

// 확정 전에 값을 먼저 받아 화면에 보인다. 회원이 이 값을 보고 확정을 눌러야
// 아래 requestStudioDerivations 가 같은 값을 함께 보내 서버 검사를 통과한다.
export async function quoteStudioDerivations(
  jobId: string,
  kinds: readonly StudioDerivationKind[],
  token: string,
): Promise<StudioDerivationQuote> {
  const authorization = required(token, "Studio 인증");
  const query = kinds.length ? `?kinds=${kinds.join(",")}` : "";
  const response = await fetch(
    `/api/studio/v1/generations/${encodeURIComponent(required(jobId, "기존 생성 작업"))}/derivations${query}`,
    { headers: { Authorization: `Bearer ${authorization}` } },
  );
  const body = await readJson<{ data?: { quote: StudioDerivationQuote }; error?: { message?: string } }>(response, "비용 확인");
  if (!response.ok || !body.data) throw new Error(body.error?.message || "값을 불러오지 못했습니다");
  return body.data.quote;
}

export async function requestStudioDerivations(input: {
  jobId: string;
  candidateId: string;
  kinds: readonly StudioDerivationKind[];
  acknowledgedCost: { currency: string; totalMinor: number };
  token: string;
}): Promise<StudioDerivationBatch> {
  const authorization = required(input.token, "Studio 인증");
  const response = await fetch(
    `/api/studio/v1/generations/${encodeURIComponent(required(input.jobId, "기존 생성 작업"))}/derivations`,
    {
      method: "POST",
      headers: {
        Authorization: `Bearer ${authorization}`,
        "Content-Type": "application/json",
        "Idempotency-Key": crypto.randomUUID(),
      },
      body: JSON.stringify({
        candidate_id: input.candidateId,
        kinds: input.kinds,
        acknowledged_cost: {
          currency: input.acknowledgedCost.currency,
          total_minor: input.acknowledgedCost.totalMinor,
        },
      }),
    },
  );
  const body = await readJson<{ data?: StudioDerivationBatch; error?: { message?: string } }>(response, "다른 형식 만들기");
  if (!body.data) throw new Error(body.error?.message || "같이 만들기에 실패했습니다");
  return body.data;
}

export async function discardStudioDerivations(batchId: string, token: string): Promise<StudioDerivationBatch> {
  const authorization = required(token, "Studio 인증");
  const response = await fetch(`/api/studio/v1/derivations/${encodeURIComponent(required(batchId, "파생 작업"))}`, {
    method: "DELETE",
    headers: { Authorization: `Bearer ${authorization}` },
  });
  const body = await readJson<{ data?: StudioDerivationBatch; error?: { message?: string } }>(response, "다른 형식 만들기");
  if (!response.ok || !body.data) throw new Error(body.error?.message || "파생물을 버리지 못했습니다");
  return body.data;
}
