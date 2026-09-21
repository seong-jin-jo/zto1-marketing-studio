// @vitest-environment jsdom
/**
 * 세션맥락 실측(2026-09-22, 9444 회원 계정): 생성실에서 형식을 "카드뉴스"로 고르고
 * 구조 초안(A/B/C)을 선택해도 "카톡 말풍선 카드뉴스 9장 만들기" 진입 버튼이 없었다.
 * `StudioRooms.tsx`의 "다른 형식도 같이"(alsoKinds) 흐름은 주 형식이 아닌 갈래에만
 * derivations를 부르는데, 카드 덱(chat_bubble)은 그 derivations(kinds=["card"])에서만
 * 만들어진다. 주 형식이 기본값인 카드뉴스면 회원은 말풍선 덱을 영원히 못 만든다.
 *
 * 계약:
 *  (a) 주 형식이 card면 구조 선택 직후 alsoKinds 선택과 무관하게 버튼이 뜬다. 클릭하면
 *      kinds=["card"]로 확정 요청이 나간다.
 *  (b) 응답의 draft_id로 찾은 덱을 CardDeckThumbnailStrip으로 9장 렌더한다.
 *  (c) 서버(service.derive)는 "주 갈래와 같은 kind" 를 거부하지 않는다(계약 확인).
 *  (d) 기존 주형식 text + also=card 경로는 회귀 0으로 유지된다(소스 계약).
 *
 * 로그인 벽 뒤 실제 클릭 자체(브라우저 왕복)는 이 테스트가 검증하지 못한다 — "미검증"으로
 * 남기고 9444 운영 회원 계정 실측은 컨트롤러가 별도로 한다.
 */
import "@testing-library/jest-dom/vitest";
import fs from "fs";
import path from "path";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
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
const roomsSrc = fs.readFileSync(path.resolve(__dirname, "../../src/components/studio/StudioRooms.tsx"), "utf8");

function candidateFixture(): StudioGenerationCandidate {
  return {
    generation_id: "job-primary-card-1",
    candidate_id: "candidate-a-1",
    ordinal: 1,
    label: "A",
    angle: "problem_first",
    title: "1인 사업자를 위한 100일 준비",
    rationale: "문제 제시형",
    format: { content_branch: "text_image", preview_kind: "structured_storyboard", quality: "draft", outline: ["기초", "실행", "점검"] },
  };
}

function seedSelectedCardDraft() {
  const value = {
    primaryKind: "card",
    alsoKinds: [],
    questionIndex: 5,
    purpose: "신뢰 높이기",
    audience: "예비 고객",
    rightsConfirmed: true,
    topicOpen: false,
    candidates: [candidateFixture()],
    selected: "A",
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
    onCandidateSelect: vi.fn(),
    onOpenEditor: vi.fn(),
    onPrimaryKindChange: vi.fn(),
    onAlsoKindsChange: vi.fn(),
  } as const;
}

function jsonResponse(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json" } });
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
  it("버튼이 노출되고 클릭하면 kinds=[\"card\"]로 확정 요청이 나가며, 응답 덱이 9장 썸네일로 렌더된다", async () => {
    seedSelectedCardDraft();
    const deck = cardDeckFixture();
    let postBody: Record<string, unknown> | null = null;

    const fetchMock = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = String(input);
      if (url.includes("/derivations") && (!init || init.method === undefined)) {
        // GET 견적
        return jsonResponse({
          data: {
            quote: {
              currency: "KRW",
              total_minor: 300,
              lines: [{ kind: "card", label: "카드뉴스", unit_minor: 300 }],
              assumptions: [],
            },
          },
        });
      }
      if (url.includes("/derivations") && init?.method === "POST") {
        postBody = JSON.parse(String(init.body));
        return jsonResponse({
          data: {
            batch_id: "batch-1",
            job_id: "job-primary-card-1",
            candidate_id: "candidate-a-1",
            status: "succeeded",
            cost: { currency: "KRW", quoted_minor: 300, charged_minor: 300, free_regeneration_consumed: false },
            items: [
              {
                kind: "card",
                label: "카드뉴스",
                status: "succeeded",
                draft_id: "draft-primary-card-1",
                handoff_id: "handoff-1",
                summary: "카드뉴스 파생",
                charged_minor: 300,
                failure_reason: null,
                deck_summary: { slides: 9, hook_type: "pain", cta_keyword: "순서", template: "chat_bubble" },
              },
            ],
            discarded_at: null,
          },
        }, 201);
      }
      throw new Error(`예상하지 못한 fetch 호출: ${url}`);
    });
    vi.stubGlobal("fetch", fetchMock);

    const deckByDraftId = (draftId: string): CardDeck | null => (draftId === "draft-primary-card-1" ? deck : null);

    render(<CreateRoom {...baseProps()} cardDeckByDraftId={deckByDraftId} />);

    const button = await screen.findByRole("button", { name: "카톡 말풍선 카드뉴스 9장 만들기" });
    expect(button).toBeEnabled();

    fireEvent.click(button);

    await waitFor(() => expect(postBody).not.toBeNull());
    expect(postBody).toMatchObject({ candidate_id: "candidate-a-1", kinds: ["card"] });

    // (b) 응답 draft_id로 찾은 덱이 9장 썸네일 스트립으로 렌더된다.
    await waitFor(() => {
      const strip = document.querySelector("[data-card-deck-thumbnail-strip]");
      expect(strip).not.toBeNull();
    });
    const strip = document.querySelector("[data-card-deck-thumbnail-strip]")!;
    await waitFor(() => {
      expect(strip.childElementCount).toBe(deck.slides.length);
    });
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
});

describe("(d) 기존 주형식 text + also=card 경로는 회귀 0으로 유지된다", () => {
  it("alsoQuote/alsoBatch 렌더 조건과 confirmAlsoKinds 배선이 그대로 남아 있다", () => {
    // 새 버튼(primaryCardDeckBatch)을 추가하면서 기존 also 흐름의 조건문을 건드리지
    // 않았는지 소스로 고정한다. 이 문자열이 사라지면 기존 also=card 경로가 깨진 것이다.
    expect(roomsSrc).toContain("selectedCandidate && alsoQuote && !alsoBatch");
    expect(roomsSrc).toContain("onClick={confirmAlsoKinds}");
    expect(roomsSrc).toMatch(/alsoKinds\.includes\("card"\) && alsoKinds\.length === 1 \? "카톡 말풍선 카드뉴스 9장 만들기" : "선택한 형식의 구성 초안 만들기"/);
    // 새 버튼 블록은 alsoBatch/alsoQuote 상태를 건드리지 않는 별도 상태(primaryCardDeckBatch)를 쓴다.
    expect(roomsSrc).toContain("primaryCardDeckBatch");
    expect(roomsSrc).toContain("setPrimaryCardDeckBatch(null)");
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
