// @vitest-environment jsdom
/**
 * 세션맥락 실측(2026-09-22, 9444 회원 계정): 생성실에서 형식을 "카드뉴스"로 고르고
 * 구조 초안(A/B/C)을 선택해도 "카톡 말풍선 카드뉴스 9장 만들기" 진입 버튼이 없었다.
 * `StudioRooms.tsx`의 "다른 형식도 같이"(alsoKinds) 흐름은 주 형식이 아닌 갈래에만
 * derivations를 부르는데, 카드 덱(chat_bubble)은 그 derivations(kinds=["card"])에서만
 * 만들어진다. 주 형식이 기본값인 카드뉴스면 회원은 말풍선 덱을 영원히 못 만든다.
 *
 * PR #74 교차 리뷰(REQUEST_CHANGES, scratchpad/pr74-review.md) MAJOR 6건 반영판. 형식만
 * 통과하는 얕은 테스트(회장 지적, 실수.md 2026-09-11 "눈이 아니라 자로")를 재발시키지
 * 않도록 (b)(M3)는 콜백 호출까지, (d)는 실제 DOM 렌더까지 확인한다.
 *
 * 로그인 벽 뒤 실제 클릭 자체(브라우저 왕복)는 이 테스트가 검증하지 못한다 — "미검증"으로
 * 남기고 9444 운영 회원 계정 실측은 컨트롤러가 별도로 한다.
 */
import "@testing-library/jest-dom/vitest";
import { cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { CreateRoom } from "@/components/studio/StudioRooms";
import type { StudioGenerationCandidate } from "@/lib/studio/generation/client";
import type { CardDeck } from "@/lib/studio/card-deck-contract";
import { cardDeckFixture, FIXTURE_STUDIO_CONTENT_GENERATOR, generationRequestFixture } from "./generation-fixture";
import { MemoryDerivationSink, MemoryGenerationRepository } from "./generation-memory-repository";
import { GenerationService } from "@/lib/studio/generation/service";
import { parseGenerationRequest } from "@/lib/studio/generation/contracts";
import { derivationQuote } from "@/lib/studio/generation/derivation";

const WORKSPACE_ID = "11111111-1111-4111-8111-111111111111";

function candidate(overrides: Partial<StudioGenerationCandidate> = {}): StudioGenerationCandidate {
  return {
    generation_id: "job-primary-card-1",
    candidate_id: "candidate-a-1",
    ordinal: 1,
    label: "A",
    angle: "problem_first",
    title: "1인 사업자를 위한 100일 준비",
    rationale: "문제 제시형",
    format: { content_branch: "text_image", preview_kind: "structured_storyboard", quality: "draft", outline: ["기초", "실행", "점검"] },
    ...overrides,
  };
}

function seedDraft(input: {
  primaryKind: "card" | "text" | "video";
  alsoKinds?: ("card" | "text" | "video")[];
  candidates: StudioGenerationCandidate[];
  selected: "A" | "B" | "C" | null;
}) {
  const value = {
    primaryKind: input.primaryKind,
    alsoKinds: input.alsoKinds ?? [],
    questionIndex: 5,
    purpose: "신뢰 높이기",
    audience: "예비 고객",
    rightsConfirmed: true,
    topicOpen: false,
    candidates: input.candidates,
    selected: input.selected,
    quickStructure: null,
  };
  localStorage.setItem(`studio_create_state:${WORKSPACE_ID}`, JSON.stringify(value));
}

function baseProps() {
  return {
    workspaceId: WORKSPACE_ID,
    workspaceName: "테스트 작업실",
    guide: "",
    topic: "100일 준비 로드맵",
    onTopicChange: vi.fn(),
    onOpenLearning: vi.fn(),
    onCandidateSelect: vi.fn(),
    onOpenEditor: vi.fn(),
    onPrimaryKindChange: vi.fn(),
    onAlsoKindsChange: vi.fn(),
  };
}

function jsonResponse(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json" } });
}

/**
 * `CreateRoom` 은 마운트되면 헤더 학습 규칙 표시를 위해 항상
 * `/api/performance/learned-rules` 를 GET 으로 부른다(useLearnedRules). 이 호출이
 * 파생(derivations) 견적 GET 과 "method 없음" 이라는 특징을 공유해서, 예전 판은
 * 이 무관한 호출이 quoteCallCount 를 먼저 소비해 M6(견적 실패) 시나리오가 실제로는
 * 한 번도 실패하지 않은 채 통과 판정을 받을 뻔했다(2026-09-22 자체 재현). URL 로
 * 명시적으로 갈라 무관한 호출은 조용히 빈 값을 돌려주고, derivations 호출만 시나리오
 * 핸들러로 넘긴다.
 */
function withLearnedRulesStub(
  handler: (input: RequestInfo | URL, init?: RequestInit) => Promise<Response>,
): ReturnType<typeof vi.fn> {
  return vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = String(input);
    if (url.includes("/api/performance/learned-rules")) return jsonResponse({ rules: [] });
    return handler(input, init);
  });
}

function quoteResponse(totalMinor = 300) {
  return jsonResponse({
    data: {
      quote: {
        currency: "KRW",
        total_minor: totalMinor,
        lines: [{ kind: "card", label: "카드뉴스", unit_minor: totalMinor }],
        assumptions: [],
      },
    },
  });
}

function succeededBatchResponse(input: { candidateId: string; draftId: string; hookType?: string }) {
  return jsonResponse({
    data: {
      batch_id: `batch-${input.draftId}`,
      job_id: "job-primary-card-1",
      candidate_id: input.candidateId,
      status: "succeeded",
      cost: { currency: "KRW", quoted_minor: 300, charged_minor: 300, free_regeneration_consumed: false },
      items: [
        {
          kind: "card",
          label: "카드뉴스",
          status: "succeeded",
          draft_id: input.draftId,
          handoff_id: `handoff-${input.draftId}`,
          summary: "카드뉴스 파생",
          charged_minor: 300,
          failure_reason: null,
          deck_summary: { slides: 9, hook_type: input.hookType ?? "auto", cta_keyword: "순서", template: "chat_bubble" },
        },
      ],
      discarded_at: null,
    },
  }, 201);
}

function failedBatchResponse(input: { candidateId: string; reason: string }) {
  return jsonResponse({
    data: {
      batch_id: "batch-failed-1",
      job_id: "job-primary-card-1",
      candidate_id: input.candidateId,
      status: "failed",
      cost: { currency: "KRW", quoted_minor: 300, charged_minor: 0, free_regeneration_consumed: false },
      items: [
        {
          kind: "card",
          label: "카드뉴스",
          status: "failed",
          draft_id: null,
          handoff_id: null,
          summary: "카드뉴스 파생",
          charged_minor: 0,
          failure_reason: input.reason,
          deck_summary: null,
        },
      ],
      discarded_at: null,
    },
  }, 207);
}

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
  localStorage.clear();
});

beforeEach(() => {
  localStorage.setItem("dashboard_auth_token", "test-token");
});

describe("(a)(b) 주 형식이 카드뉴스면 카톡 말풍선 카드뉴스 9장 버튼이 alsoKinds와 무관하게 뜬다", () => {
  it("버튼 클릭 시 kinds/acknowledged_cost/options.card.hook_type 을 실은 요청이 나가고, 응답 덱이 9장 썸네일로 렌더되며 onDerivationSucceeded 가 draft_id 로 불린다", async () => {
    seedDraft({ primaryKind: "card", candidates: [candidate()], selected: "A" });
    const deck = cardDeckFixture();
    let postBody: Record<string, unknown> | null = null;
    let idempotencyKey: string | null = null;

    const fetchMock = withLearnedRulesStub(async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = String(input);
      if (!url.includes("/derivations")) throw new Error(`예상하지 못한 fetch 호출: ${url}`);
      if (!init || init.method === undefined) return quoteResponse(300);
      if (init.method === "POST") {
        postBody = JSON.parse(String(init.body));
        idempotencyKey = (init.headers as Record<string, string>)["Idempotency-Key"];
        return succeededBatchResponse({ candidateId: "candidate-a-1", draftId: "draft-primary-card-1" });
      }
      throw new Error(`예상하지 못한 메서드: ${init.method}`);
    });
    vi.stubGlobal("fetch", fetchMock);

    const onDerivationSucceeded = vi.fn(async () => undefined);
    const deckByDraftId = (draftId: string): CardDeck | null => (draftId === "draft-primary-card-1" ? deck : null);

    render(<CreateRoom {...baseProps()} cardDeckByDraftId={deckByDraftId} onDerivationSucceeded={onDerivationSucceeded} />);

    const button = await screen.findByRole("button", { name: "카톡 말풍선 카드뉴스 9장 만들기" }, { timeout: 10000 });
    // CI 풀스위트에서만 겪은 실패(run 35650517215)의 공통 패턴: 확정 버튼은 견적
    // GET 이 끝나기 전에도 먼저 렌더된다(disabled 만 다르다). findByRole 은 "존재"만
    // 기다리므로, CPU 경합 아래 견적이 늦게 오면 이 시점에 버튼이 아직 disabled 일
    // 수 있다 — 그 상태로 클릭하면 jsdom 이 disabled 엘리먼트의 클릭을 무시해
    // 아무 요청도 안 나간다. 활성화를 명시적으로 기다린 뒤에만 클릭한다.
    await waitFor(() => expect(button).toBeEnabled(), { timeout: 10000 });
    // 견적이 실제로 화면에 보인 뒤에만 확정할 수 있다(설계 §7.1 확정 전 값 노출 계약).
    expect(screen.getByText("300원")).toBeInTheDocument();

    fireEvent.click(button);

    await waitFor(() => expect(postBody).not.toBeNull(), { timeout: 10000 });
    expect(postBody).toMatchObject({
      candidate_id: "candidate-a-1",
      kinds: ["card"],
      acknowledged_cost: { currency: "KRW", total_minor: 300 },
      options: { card: { hook_type: "auto" } },
    });
    expect(idempotencyKey).toBeTruthy();

    // (M3) hist 재검증 콜백이 실제로 draft_id 와 함께 불린다(목 주입만으로 통과시키지 않음).
    await waitFor(() => expect(onDerivationSucceeded).toHaveBeenCalledWith("draft-primary-card-1"), { timeout: 10000 });

    // (b) 응답 draft_id로 찾은 덱이 9장 썸네일 스트립으로 렌더된다.
    await waitFor(() => {
      const strip = document.querySelector("[data-card-deck-thumbnail-strip]");
      expect(strip).not.toBeNull();
      expect(strip!.childElementCount).toBe(deck.slides.length);
    }, { timeout: 10000 });
    // 9장 캔버스 렌더는 CI 부하 아래서 기본 waitFor 1000ms·it 5000ms 를 넘을 수 있다
    // (CI run 35648090908 에서 이 테스트가 실제로 타임아웃 — 풀스위트 병렬 실행의
    // CPU 경합 아래서 로컬 단독 실행보다 훨씬 느리다. waitFor 마진을 넉넉히 잡는다).
  }, 15000);

  it("훅 공식 칩을 바꾸고 확정하면 그 값이 options.card.hook_type 에 실린다", async () => {
    seedDraft({ primaryKind: "card", candidates: [candidate()], selected: "A" });
    let postBody: Record<string, unknown> | null = null;

    const fetchMock = withLearnedRulesStub(async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = String(input);
      if (!init || init.method === undefined) return quoteResponse(300);
      if (init.method === "POST") {
        postBody = JSON.parse(String(init.body));
        return succeededBatchResponse({ candidateId: "candidate-a-1", draftId: "draft-primary-card-1", hookType: "question" });
      }
      throw new Error(`예상하지 못한 fetch 호출: ${url}`);
    });
    vi.stubGlobal("fetch", fetchMock);

    render(<CreateRoom {...baseProps()} />);

    const confirmBlock = await screen.findByText("카톡 말풍선 카드뉴스 9장", undefined, { timeout: 10000 });
    const group = confirmBlock.closest("[data-create-primary-card-deck-confirm]") as HTMLElement;
    fireEvent.click(within(group).getByRole("button", { name: "질문형" }));
    const confirmButton = within(group).getByRole("button", { name: "카톡 말풍선 카드뉴스 9장 만들기" });
    // CI 풀스위트 재현 실패 대응(2026-09-22 CI run 35650517215): 확정 블록은 견적
    // GET 이 아직 안 끝난 상태에서도 먼저 렌더된다(disabled 만 다르다). findByRole 은
    // "존재"만 기다리고 "활성화"는 안 기다리므로, 견적이 늦게 도착하는 CPU 경합
    // 아래서는 disabled 버튼을 클릭해 아무 일도 안 일어난다(jsdom 도 disabled
    // 엘리먼트의 click 알고리즘을 지킨다). 클릭 전 항상 활성화를 명시적으로 기다린다.
    await waitFor(() => expect(confirmButton).toBeEnabled(), { timeout: 10000 });
    fireEvent.click(confirmButton);

    await waitFor(() => expect(postBody).not.toBeNull(), { timeout: 10000 });
    expect(postBody).toMatchObject({ options: { card: { hook_type: "question" } } });
  });
});

describe("M1 후보가 바뀌면 이전 후보의 카드 덱 상태가 남지 않는다", () => {
  it("'구조 초안 다시 고르기' 로 다른 후보를 고르면 옛 덱 결과가 사라지고 새 후보에 확정 버튼이 다시 뜬다", async () => {
    const candidateA = candidate({ candidate_id: "candidate-a-1", label: "A" });
    const candidateB = candidate({ candidate_id: "candidate-b-1", label: "B", title: "다른 구조" });
    seedDraft({ primaryKind: "card", candidates: [candidateA, candidateB], selected: "A" });

    const fetchMock = withLearnedRulesStub(async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = String(input);
      if (!init || init.method === undefined) return quoteResponse(300);
      if (init.method === "POST") {
        const body = JSON.parse(String(init.body)) as { candidate_id: string };
        return succeededBatchResponse({ candidateId: body.candidate_id, draftId: `draft-${body.candidate_id}` });
      }
      throw new Error(`예상하지 못한 fetch 호출: ${url}`);
    });
    vi.stubGlobal("fetch", fetchMock);
    const deck = cardDeckFixture();
    const deckByDraftId = (draftId: string): CardDeck | null => (draftId === "draft-candidate-a-1" ? deck : null);

    render(<CreateRoom {...baseProps()} cardDeckByDraftId={deckByDraftId} />);

    const buttonA = await screen.findByRole("button", { name: "카톡 말풍선 카드뉴스 9장 만들기" }, { timeout: 10000 });
    // CI 풀스위트 재현 실패 대응(run 35650517215): 견적이 도착하기 전엔 버튼이
    // disabled 다 — 그 상태로 클릭하면 아무 요청도 안 나간다.
    await waitFor(() => expect(buttonA).toBeEnabled(), { timeout: 10000 });
    fireEvent.click(buttonA);
    await waitFor(() => {
      const strip = document.querySelector("[data-card-deck-thumbnail-strip]");
      expect(strip).not.toBeNull();
    }, { timeout: 10000 });

    // 다른 후보를 다시 고른다.
    fireEvent.click(screen.getByRole("button", { name: "구조 초안 다시 고르기" }));
    fireEvent.click(await screen.findByRole("button", { name: "B 구조 초안 선택" }, { timeout: 10000 }));

    // 옛 후보(A)의 결과 블록이 새 후보(B) 밑에 남지 않는다.
    await waitFor(() => {
      expect(document.querySelector("[data-create-primary-card-deck-result]")).toBeNull();
    }, { timeout: 10000 });
    // B 에서도 확정 버튼이 다시 뜬다(전에는 primaryCardDeckBatch 가 안 비워져 영구히 숨었다).
    // B 는 새 견적을 다시 받아야 하므로(fetchPrimaryCardDeckQuote 가 candidate_id 변경에
    // 걸려 재실행) 버튼이 존재해도 잠깐 disabled 일 수 있다 — 활성화까지 기다려 확인한다.
    const buttonB = await screen.findByRole("button", { name: "카톡 말풍선 카드뉴스 9장 만들기" }, { timeout: 10000 });
    await waitFor(() => expect(buttonB).toBeEnabled(), { timeout: 10000 });
  }, 15000);
});

describe("M2 실패한 배치도 재시도할 수 있다", () => {
  it("실패 사유를 보여주고 '다시 만들기' 로 재시도하면 새로 확정할 수 있다(다른 Idempotency-Key로)", async () => {
    seedDraft({ primaryKind: "card", candidates: [candidate()], selected: "A" });
    let postCount = 0;
    const idempotencyKeys: string[] = [];
    const fetchMock = withLearnedRulesStub(async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = String(input);
      if (!init || init.method === undefined) return quoteResponse(300);
      if (init.method === "POST") {
        postCount += 1;
        idempotencyKeys.push((init.headers as Record<string, string>)["Idempotency-Key"]);
        if (postCount === 1) return failedBatchResponse({ candidateId: "candidate-a-1", reason: "invalid_output: CTA 장에 댓글 키워드 유도가 없습니다" });
        return succeededBatchResponse({ candidateId: "candidate-a-1", draftId: "draft-retry-1" });
      }
      throw new Error(`예상하지 못한 fetch 호출: ${url}`);
    });
    vi.stubGlobal("fetch", fetchMock);

    render(<CreateRoom {...baseProps()} />);

    const confirmButton = await screen.findByRole("button", { name: "카톡 말풍선 카드뉴스 9장 만들기" }, { timeout: 10000 });
    // CI 풀스위트 재현 실패 대응(run 35650517215): 견적이 도착하기 전엔 버튼이
    // disabled 다 — 그 상태로 클릭하면 아무 요청도 안 나가 이 시나리오 자체가 성립 안 한다.
    await waitFor(() => expect(confirmButton).toBeEnabled(), { timeout: 10000 });
    fireEvent.click(confirmButton);
    await screen.findByText(/만들지 못했습니다/, undefined, { timeout: 10000 });
    expect(screen.getByText(/CTA 장에 댓글 키워드 유도가 없습니다/)).toBeInTheDocument();

    const retryButton = await screen.findByRole("button", { name: "다시 만들기" }, { timeout: 10000 });
    expect(retryButton).toBeEnabled();
    fireEvent.click(retryButton);

    await waitFor(() => expect(postCount).toBe(2), { timeout: 10000 });
    await waitFor(() => expect(screen.getByText(/9장을 만들었습니다/)).toBeInTheDocument(), { timeout: 10000 });

    // M7(재리뷰 2026-09-22): 서버는 같은 Idempotency-Key 면 status 와 무관하게 같은
    // 배치를 그대로 돌려준다(아래 서비스 계약 테스트가 실제 코드로 증명). m1 에서
    // 재시도 간 키를 재사용하도록 고쳤다면 "다시 만들기" 가 같은 실패를 반복 반환할
    // 뻔했다. 실패하면 키를 비워 재시도가 반드시 새 키를 쓰게 고쳤으므로 두 POST 의
    // Idempotency-Key 는 서로 달라야 한다.
    expect(idempotencyKeys).toHaveLength(2);
    expect(idempotencyKeys[0]).toBeTruthy();
    expect(idempotencyKeys[1]).toBeTruthy();
    expect(idempotencyKeys[0]).not.toBe(idempotencyKeys[1]);
  }, 15000);
});

describe("M7 서버(GenerationService.derive)는 같은 Idempotency-Key 면 실패 배치도 그대로 돌려준다", () => {
  it("같은 키로 다시 부르면 같은 실패 배치가 반환되고(서버 멱등의 한계), 다른 키로 부르면 새 배치가 만들어진다", async () => {
    const repository = new MemoryGenerationRepository();
    // "card" 파생은 항상 실패하게 만든다(MemoryDerivationSink failKinds).
    const sink = new MemoryDerivationSink(["card"]);
    const service = new GenerationService(repository, sink, FIXTURE_STUDIO_CONTENT_GENERATOR);

    const request = parseGenerationRequest(generationRequestFixture());
    const job = await service.create("member-m7", `create-${crypto.randomUUID()}`, request);
    const quote = derivationQuote(["card"]);
    const acknowledgedCost = { currency: quote.currency, total_minor: quote.totalMinor };

    const sameKey = `idem-m7-${crypto.randomUUID()}`;
    const first = await service.derive("member-m7", job.jobId, job.candidates[0].candidateId, ["card"], acknowledgedCost, sameKey, [WORKSPACE_ID]);
    expect(first.status).toBe("failed");

    const second = await service.derive("member-m7", job.jobId, job.candidates[0].candidateId, ["card"], acknowledgedCost, sameKey, [WORKSPACE_ID]);
    // 서버 실측: 같은 키는 실패 배치를 그대로 재반환한다. LLM 을 다시 안 부른다 —
    // 이것이 M7 이 지적한 회귀의 근본 원인이다.
    expect(second.batchId).toBe(first.batchId);
    expect(second.status).toBe("failed");

    const newKey = `idem-m7-retry-${crypto.randomUUID()}`;
    const third = await service.derive("member-m7", job.jobId, job.candidates[0].candidateId, ["card"], acknowledgedCost, newKey, [WORKSPACE_ID]);
    // 다른 키(=클라이언트가 실패 후 비운 idempotencyKeyRef 로 다시 만든 요청)는
    // 서버가 실제로 새 파생 시도를 만든다. makePrimaryCardDeck 의 "실패하면 키를
    // 비운다" 고침이 실제로 재시도를 되살리는지 서버 코드로 증명한다.
    expect(third.batchId).not.toBe(first.batchId);
  });
});

describe("M4 성공한 덱은 편집실 진입 때 draft_id 를 넘긴다", () => {
  it("'편집실에서 다듬기' 를 누르면 onOpenEditor 가 방금 만든 draft_id 를 받는다", async () => {
    seedDraft({ primaryKind: "card", candidates: [candidate()], selected: "A" });
    const fetchMock = withLearnedRulesStub(async (input: RequestInfo | URL, init?: RequestInit) => {
      if (!init || init.method === undefined) return quoteResponse(300);
      if (init.method === "POST") return succeededBatchResponse({ candidateId: "candidate-a-1", draftId: "draft-edit-1" });
      throw new Error(`예상하지 못한 fetch 호출: ${String(input)}`);
    });
    vi.stubGlobal("fetch", fetchMock);
    const onOpenEditor = vi.fn();

    render(<CreateRoom {...baseProps()} onOpenEditor={onOpenEditor} />);
    const confirmButton = await screen.findByRole("button", { name: "카톡 말풍선 카드뉴스 9장 만들기" }, { timeout: 10000 });
    // CI 풀스위트 재현 실패 대응(run 35650517215): 견적이 도착하기 전엔 버튼이 disabled 다.
    await waitFor(() => expect(confirmButton).toBeEnabled(), { timeout: 10000 });
    fireEvent.click(confirmButton);
    await waitFor(() => expect(screen.getByText(/9장을 만들었습니다/)).toBeInTheDocument(), { timeout: 10000 });

    fireEvent.click(screen.getByRole("button", { name: "편집실에서 다듬기" }));
    expect(onOpenEditor).toHaveBeenCalledWith("draft-edit-1");
  }, 15000);
});

describe("M6 견적을 못 불러오면 이유와 재시도를 보여준다", () => {
  it("GET 견적이 실패하면 단추만 죽이지 않고 이유 문구 + 다시 시도 버튼을 보여주며, 재시도가 성공하면 정상 확정할 수 있다", async () => {
    seedDraft({ primaryKind: "card", candidates: [candidate()], selected: "A" });
    let quoteCallCount = 0;
    const fetchMock = withLearnedRulesStub(async (input: RequestInfo | URL, init?: RequestInit) => {
      if (!init || init.method === undefined) {
        quoteCallCount += 1;
        if (quoteCallCount === 1) return jsonResponse({ error: { message: "일시적으로 값을 계산할 수 없습니다" } }, 500);
        return quoteResponse(300);
      }
      if (init.method === "POST") return succeededBatchResponse({ candidateId: "candidate-a-1", draftId: "draft-quote-retry-1" });
      throw new Error(`예상하지 못한 fetch 호출: ${String(input)}`);
    });
    vi.stubGlobal("fetch", fetchMock);

    render(<CreateRoom {...baseProps()} />);

    await screen.findByText(/비용을 불러오지 못했습니다/, undefined, { timeout: 10000 });
    const confirmButton = screen.getByRole("button", { name: "카톡 말풍선 카드뉴스 9장 만들기" });
    expect(confirmButton).toBeDisabled();

    fireEvent.click(screen.getByRole("button", { name: "다시 시도" }));

    await waitFor(() => expect(screen.getByText("300원")).toBeInTheDocument(), { timeout: 10000 });
    expect(screen.queryByText(/비용을 불러오지 못했습니다/)).toBeNull();
    expect(confirmButton).toBeEnabled();
  }, 15000);
});

describe("m1 더블클릭은 중복 청구를 만들지 않는다", () => {
  it("확정 단추를 연속으로 두 번 눌러도 POST 는 한 번만 나간다", async () => {
    seedDraft({ primaryKind: "card", candidates: [candidate()], selected: "A" });
    let postCount = 0;
    const resolvePostRef: { current: (() => void) | null } = { current: null };
    const fetchMock = withLearnedRulesStub(async (input: RequestInfo | URL, init?: RequestInit) => {
      if (!init || init.method === undefined) return quoteResponse(300);
      if (init.method === "POST") {
        postCount += 1;
        await new Promise<void>((resolve) => { resolvePostRef.current = resolve; });
        return succeededBatchResponse({ candidateId: "candidate-a-1", draftId: "draft-dedupe-1" });
      }
      throw new Error(`예상하지 못한 fetch 호출: ${String(input)}`);
    });
    vi.stubGlobal("fetch", fetchMock);

    render(<CreateRoom {...baseProps()} />);
    const button = await screen.findByRole("button", { name: "카톡 말풍선 카드뉴스 9장 만들기" }, { timeout: 10000 });
    // CI 풀스위트 재현 실패 대응(run 35650517215): 견적이 도착하기 전엔 버튼이
    // disabled 다 — 그 상태로 클릭 3연타를 해도 하나도 안 나가 postCount 가 계속
    // 0 이라 "1이어야 한다" 단언이 타임아웃까지 실패한다(m1 더블클릭 방어가 아니라
    // 애초에 클릭 자체가 안 먹힌 것). 활성화를 기다린 뒤에만 연타한다.
    await waitFor(() => expect(button).toBeEnabled(), { timeout: 10000 });
    fireEvent.click(button);
    fireEvent.click(button);
    fireEvent.click(button);

    await waitFor(() => expect(postCount).toBe(1), { timeout: 10000 });
    resolvePostRef.current?.();
    await waitFor(() => expect(screen.getByText(/9장을 만들었습니다/)).toBeInTheDocument(), { timeout: 10000 });
  }, 15000);
});

describe("부정 케이스: 주 형식이 카드뉴스가 아니면 primary 확정 블록이 안 뜬다", () => {
  it.each(["text", "video"] as const)("primaryKind=%s 면 카톡 말풍선 카드뉴스 9장 확정 블록이 없다", async (kind) => {
    seedDraft({ primaryKind: kind, candidates: [candidate({ format: { content_branch: kind === "video" ? "video" : "text_image", preview_kind: "structured_storyboard", quality: "draft", outline: ["기초", "실행", "점검"] } })], selected: "A" });
    vi.stubGlobal("fetch", vi.fn(async () => { throw new Error("이 시험에서는 fetch 가 불리면 안 된다"); }));

    render(<CreateRoom {...baseProps()} />);

    await screen.findByRole("button", { name: "편집실에서 다듬기" }, { timeout: 10000 });
    expect(screen.queryByRole("button", { name: "카톡 말풍선 카드뉴스 9장 만들기" })).toBeNull();
    expect(document.querySelector("[data-create-primary-card-deck-confirm]")).toBeNull();
  });
});

describe("(d) 기존 주형식 text + also=card 경로는 회귀 0으로 유지된다(실제 DOM)", () => {
  it("also=card 를 고르면 also 블록에서만 카톡 말풍선 카드뉴스 9장 버튼이 뜨고 primary 확정 블록은 없다", async () => {
    seedDraft({ primaryKind: "text", alsoKinds: ["card"], candidates: [candidate({ format: { content_branch: "text_image", preview_kind: "structured_storyboard", quality: "draft", outline: ["기초", "실행", "점검"] } })], selected: "A" });
    const fetchMock = withLearnedRulesStub(async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = String(input);
      if (url.includes("kinds=card") && (!init || init.method === undefined)) return quoteResponse(300);
      throw new Error(`예상하지 못한 fetch 호출: ${url}`);
    });
    vi.stubGlobal("fetch", fetchMock);

    render(<CreateRoom {...baseProps()} />);

    const button = await screen.findByRole("button", { name: "카톡 말풍선 카드뉴스 9장 만들기" }, { timeout: 10000 });
    // also 블록 소속(확정 단추의 부모가 also-confirm 영역)임을 실제로 확인한다.
    expect(button.closest("[data-create-also-confirm]")).not.toBeNull();
    // primary 전용 확정 블록은 렌더되지 않는다(주 형식이 card 가 아니므로).
    expect(document.querySelector("[data-create-primary-card-deck-confirm]")).toBeNull();
  });
});

describe("(c) 서버는 주 갈래와 같은 kind(card)의 파생을 거부하지 않는다", () => {
  it("content_branch=text_image(카드뉴스 주 형식)로 만든 작업에 kinds=[\"card\"] 파생을 그대로 허용한다", async () => {
    const repository = new MemoryGenerationRepository();
    const sink = new MemoryDerivationSink();
    const service = new GenerationService(repository, sink, FIXTURE_STUDIO_CONTENT_GENERATOR);

    const rawRequest = generationRequestFixture();
    (rawRequest as { learning_context: { u3: { content_branch: string } } }).learning_context.u3.content_branch = "text_image";
    const request = parseGenerationRequest(rawRequest);
    const job = await service.create("member-primary-card", `create-${crypto.randomUUID()}`, request);

    const quote = derivationQuote(["card"]);
    const batch = await service.derive(
      "member-primary-card",
      job.jobId,
      job.candidates[0].candidateId,
      ["card"],
      { currency: quote.currency, total_minor: quote.totalMinor },
      `derive-${crypto.randomUUID()}`,
      [WORKSPACE_ID],
    );

    expect(batch.status).toBe("succeeded");
    expect(batch.items).toHaveLength(1);
    expect(batch.items[0].kind).toBe("card");
    expect(batch.items[0].status).toBe("succeeded");
  });

  it("주 형식 text + also=card 파생도 서버에서 여전히 성공한다(회귀 확인)", async () => {
    const repository = new MemoryGenerationRepository();
    const sink = new MemoryDerivationSink();
    const service = new GenerationService(repository, sink, FIXTURE_STUDIO_CONTENT_GENERATOR);

    const request = parseGenerationRequest(generationRequestFixture());
    const job = await service.create("member-also-card", `create-${crypto.randomUUID()}`, request);

    const quote = derivationQuote(["card"]);
    const batch = await service.derive(
      "member-also-card",
      job.jobId,
      job.candidates[0].candidateId,
      ["card"],
      { currency: quote.currency, total_minor: quote.totalMinor },
      `derive-${crypto.randomUUID()}`,
      [WORKSPACE_ID],
    );

    expect(batch.status).toBe("succeeded");
    expect(batch.items[0].kind).toBe("card");
  });
});
