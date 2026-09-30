import { beforeEach, describe, expect, it, vi } from "vitest";
import { containsInstructionPlaceholder } from "@/lib/studio/generated-copy";
import { parseCandidateOutput, StudioLlmExecutionError } from "@/lib/studio/generation/llm";

const H = vi.hoisted(() => ({ prompt: "", output: "" }));

vi.mock("@/lib/tenant-auth", () => ({ effectiveTenantId: vi.fn(async () => "tenant-placeholder") }));
vi.mock("@/lib/wiki-retrieve", () => ({ getWikiContext: vi.fn(async () => ({ text: "", mode: "none", docs: 0 })) }));
vi.mock("@/lib/studio/learned-rules-context", () => ({ getLearnedRulesContext: vi.fn(async () => "") }));
vi.mock("@/lib/github", () => ({ fetchRepoFile: vi.fn() }));
vi.mock("@/lib/anthropic", () => ({
  generateText: vi.fn(async (prompt: string) => { H.prompt = prompt; return H.output; }),
  sharedGenerationQuotaErrorResponse: vi.fn(() => null),
  sharedAiApprovalErrorResponse: vi.fn(() => null),
}));

const completeOutput = (slide: string) => JSON.stringify({
  threads: "오늘 바로 적용할 수 있는 세 가지 순서를 정리했습니다.",
  facebook: "작은 팀도 오늘부터 콘텐츠 순서를 정리할 수 있습니다.",
  x: "콘텐츠 순서를 오늘 정리해 보세요.",
  instagram: { caption: "오늘 할 일을 한 장씩 정리했습니다.", hashtags: ["콘텐츠"], slides: [slide, "한 번에 한 단계씩 시작하세요."] },
  shorts: { hook: "막막함부터 줄여보세요.", body: "할 일을 세 단계로 나눕니다.", cta: "첫 단계부터 적어보세요." },
  image_prompt: "A notebook beside a ceramic cup on a wooden desk, soft morning light.",
});

async function requestStudioText() {
  const { POST } = await import("@/app/api/studio/text/route");
  const response = await POST(new Request("http://localhost/api/studio/text", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ idea: "콘텐츠 운영 순서", tenant_id: "tenant-placeholder" }),
  }));
  return { status: response.status, body: await response.json() as { ok?: boolean; error?: string } };
}

beforeEach(() => {
  vi.resetModules();
  H.prompt = "";
  H.output = completeOutput("막막한 콘텐츠 운영, 순서부터 정리하세요.");
});

describe("GENERATED-PLACEHOLDER-01 생성 문구 자리표시 차단", () => {
  it.each([
    ["(브랜드명 입력)", true],
    ["(여기에 내용을 채우기)", true],
    ["[브랜드명]", true],
    ["{{서비스명}}", true],
    ["가격(부가세 포함)", false],
    ["신청서(작성 기준은 홈페이지 참고)", false],
    ["제품(입력 전압 220V)", false],
  ])("PR95-R9-PLACEHOLDER-01 표: %s 차단 여부는 %s", (value, expected) => {
    expect(containsInstructionPlaceholder(value)).toBe(expected);
  });

  it.each([
    // 10차 리뷰 오탐 제거 — 통과해야 함
    ["(옵션 추가)", false],
    ["(고객 직접 작성)", false],
    ["(자동 입력)", false],
    ["(카드 등록 없이 추가)", false],
    ["[장소] 강남역 3번 출구", false],
    ["[가격] 월 9,900원", false],
    ["[날짜] 10월 3일", false],
    ["가격(부가세 포함)", false],
    ["신청서(작성 기준은 홈페이지 참고)", false],
    ["제품(입력 전압 220V)", false],
    // 10차 리뷰 누락 보강 — 막아야 함
    ["(브랜드명)", true],
    ["(서비스명)", true],
    ["(링크)", true],
    ["(주소)", true],
    ["(브랜드명 입력)", true],
    ["(여기에 내용을 채우기)", true],
    ["[브랜드명]", true],
    ["{{서비스명}}", true],
    ["(브랜드가 실제로 제공하는 서비스 한 문장으로 대체)", true],
  ])("PR95-R10-PLACEHOLDER-01 표: %s 차단 여부는 %s", (value, expected) => {
    expect(containsInstructionPlaceholder(value)).toBe(expected);
  });

  it.each([
    // 11차 리뷰 MAJOR 재현: 문장 중간·줄바꿈 뒤 자리표시(이전 "뒤에 값이 이어지면 통과" 규칙이
    // 전부 놓쳤던 사례). 리뷰 원문 표 10행 그대로, 기대값만 올바르게 교정.
    ["(브랜드가 실제로 제공하는 서비스 한 문장으로 대체) 지금 바로 확인하세요", true],
    ["(브랜드명)의 새 서비스를 소개합니다", true],
    ["{{서비스명}}으로 시작하세요", true],
    ["안녕하세요, [브랜드명]입니다.", true],
    ["첫 줄 (서비스명 입력)\n둘째 줄 본문", true],
    ["(서비스 이름을 직접 입력하세요) 를 통해", true],
    ["(브랜드명을 넣으세요) 오늘 시작", true],
    ["[INSERT brand description] today", true],
    ["자세한 내용은 (링크) 참고", true],
    ["(your brand description here)", true],
  ])("PR95-R11-MIDSENTENCE-01 표: %s 차단 여부는 %s", (value, expected) => {
    expect(containsInstructionPlaceholder(value)).toBe(expected);
  });

  it.each([
    // 11차 리뷰: 필드명+동사가 명령형 어미 없이 맨 동사형으로만 쓰인 애매한 사례는 정밀도
    // 우선 원칙에 따라 통과시킨다(필드 정체성 이름 "명"류가 아닌 일반 명사이므로).
    ["이번 주 신청 마감(내용 추가)", false],
    ["배송 안내(주소 입력)", false],
    ["운영 시간(시간 추가)", false],
    ["문의(연락처)", false],
  ])("PR95-R11-MINOR-BARE-01 표: %s 차단 여부는 %s", (value, expected) => {
    expect(containsInstructionPlaceholder(value)).toBe(expected);
  });

  it.each([
    // 11차 리뷰: 줄 맨 앞 "[항목명] 값" 공지 항목 제목 — 유일한 허용 예외
    ["[장소] 강남역 3번 출구", false],
    ["[가격] 월 9,900원", false],
    ["[날짜] 10월 3일", false],
  ])("PR95-R11-LABEL-VALUE-01 표: %s 차단 여부는 %s", (value, expected) => {
    expect(containsInstructionPlaceholder(value)).toBe(expected);
  });

  it.each([
    // 11차 리뷰: 일반 마케팅 문구 표본 — 정상 통과 유지
    ["오늘만 20% 할인(선착순 100명)", false],
    ["[공지] 추석 연휴 휴무 안내", false],
    ["무료 상담 신청(링크는 프로필에)", false],
    ["아메리카노(샷 추가)", false],
    ["[이벤트] 댓글 남기면 추첨", false],
    ["가격: 29,000원(배송비 포함)", false],
    ["신메뉴 출시(한정 수량)", false],
    ["참여 방법(댓글 작성)", false],
    ["(후기 작성)", false],
  ])("PR95-R11-MARKETING-SAMPLE-01 표: %s 차단 여부는 %s", (value, expected) => {
    expect(containsInstructionPlaceholder(value)).toBe(expected);
  });

  it.each([
    // 12차 리뷰: NAME_FIELD_SUFFIX가 "명으로 끝나는 모든 낱말"을 잡던 오탐 수정.
    // 허용 목록(브랜드/서비스/상품/제품/행사/가게/상호/업체/회사/매장/이벤트/캠페인/프로그램)
    // 밖의 낱말 뒤에 오는 맨 동사형과 숫자+명은 통과시킨다.
    ["모집 인원(5명 추가)", false],
    ["당첨자 발표(20명 추가)", false],
    ["업데이트 안내(상세 설명 추가)", false],
    ["계약서(서명 추가)", false],
    ["회원가입(실명 입력)", false],
    ["(Tag your friends here)", false],
    ["(Replace 쿠폰 2장 증정)", false],
  ])("PR95-R12-NAMEFIELD-ALLOW-01 표: %s 차단 여부는 %s", (value, expected) => {
    expect(containsInstructionPlaceholder(value)).toBe(expected);
  });

  it.each([
    // 12차 리뷰: 기존 차단 기대 유지 — 허용 목록 안의 정체성 이름 계열은 계속 차단.
    ["(URL)", true],
    ["(상호명)", true],
    ["[링크]", true],
    ["(가게 이름 입력)", true],
    ["(행사명 추가)", true],
    ["(상품명 입력)", true],
  ])("PR95-R12-NAMEFIELD-BLOCK-01 표: %s 차단 여부는 %s", (value, expected) => {
    expect(containsInstructionPlaceholder(value)).toBe(expected);
  });

  it("GENERATED-PLACEHOLDER-01A 정상: 괄호 속 작성 지시는 자리표시로 판정하고 일반 보충설명은 허용한다", () => {
    expect(containsInstructionPlaceholder("(브랜드가 실제로 제공하는 서비스 한 문장으로 대체)")).toBe(true);
    expect(containsInstructionPlaceholder("(서비스 이름을 직접 입력하세요)")).toBe(true);
    expect(containsInstructionPlaceholder("(담당자가 문구를 작성해 주세요)")).toBe(true);
    expect(containsInstructionPlaceholder("(브랜드명을 넣으세요)")).toBe(true);
    expect(containsInstructionPlaceholder("(여기에 내용을 적으세요)")).toBe(true);
    expect(containsInstructionPlaceholder("[INSERT brand description]")).toBe(true);
    expect(containsInstructionPlaceholder("오늘은 온라인으로 진행합니다(서울 외 지역 포함).")).toBe(false);
    expect(containsInstructionPlaceholder("신청서(작성 기준은 홈페이지 참고)")).toBe(false);
    expect(containsInstructionPlaceholder("제품(입력 전압 220V)")).toBe(false);
    expect(containsInstructionPlaceholder("가격(부가세 포함)")).toBe(false);
    expect(containsInstructionPlaceholder("배터리(사용자가 직접 교체 가능)")).toBe(false);
  });

  it("GENERATED-PLACEHOLDER-01B 거절: 기존 텍스트 생성 응답에 자리표시가 남으면 카드·발행 상태로 승격하지 않는다", async () => {
    H.output = completeOutput("(브랜드가 실제로 제공하는 서비스 한 문장으로 대체)");

    const { status, body } = await requestStudioText();

    expect(status).toBe(200);
    expect(body.ok).toBe(false);
    expect(body.error).toContain("자리표시");
  });

  it("GENERATED-PLACEHOLDER-01C 정상·거절: 프롬프트는 빈 학습 정보 때 일반 문장을 요구하고 새 후보 생성도 같은 자리표시를 거절한다", async () => {
    const { body } = await requestStudioText();
    expect(body.ok).toBe(true);
    expect(H.prompt).toContain("학습 정보가 비어 있으면");
    expect(H.prompt).toContain("완성된 일반 문장");

    const payload = {
      candidates: [
        { label: "A", angle: "problem_first", title: "문제부터 정리하기", rationale: "문제를 먼저 짚고 실행 순서를 안내하는 구성입니다.", outline: ["막힌 지점을 적습니다.", "(서비스 한 문장으로 대체)", "첫 행동을 정합니다."] },
        { label: "B", angle: "proof_first", title: "기록으로 확인하기", rationale: "실행 기록을 먼저 보고 다음 행동을 고르는 구성입니다.", outline: ["기록을 확인합니다.", "차이를 비교합니다.", "다음 순서를 고릅니다."] },
        { label: "C", angle: "process_first", title: "순서대로 실행하기", rationale: "준비부터 확인까지 그대로 따라 하는 구성입니다.", outline: ["준비물을 모읍니다.", "한 단계씩 실행합니다.", "결과를 확인합니다."] },
      ],
    };
    expect(() => parseCandidateOutput(JSON.stringify(payload), [])).toThrowError(StudioLlmExecutionError);
    expect(() => parseCandidateOutput(JSON.stringify(payload), [])).toThrow(/자리표시/);
  });
});
