import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { applyEditorOperation, createEditorHandoff, type EditorHandoff } from "@/lib/studio/editor-handoff";

const H = vi.hoisted(() => ({
  tenantId: "11111111-1111-4111-8111-111111111111" as string | null,
  draftId: "draft-editor-1",
  handoff: null as EditorHandoff | null,
  updateAllowed: true,
  queueCalls: [] as Array<Record<string, unknown>>,
  queueOptions: [] as Array<Record<string, unknown>>,
  generatedText: "",
  latestExport: {
    blocker: null as string | null,
    is_latest: true,
    current_source_hash: "a".repeat(64),
    latest_export: { export_id: "22222222-2222-4222-8222-222222222222", status: "succeeded" },
  } as {
    blocker: string | null;
    is_latest: boolean;
    current_source_hash: string;
    latest_export: { export_id: string; status: string } | null;
    first_empty_slide?: { order: number; number: number; item_key: string };
  },
  authFailure: null as null | { reason: "invalid" | "unavailable" | "forbidden"; message: string; code?: string },
}));

vi.mock("@/lib/anthropic", () => ({
  generateText: vi.fn(async () => H.generatedText),
  sharedAiApprovalErrorResponse: vi.fn(() => null),
  sharedGenerationQuotaErrorResponse: vi.fn(() => null),
}));

vi.mock("@/lib/tenant-auth", () => {
  class AuthError extends Error {
    readonly status: 401 | 403 | 503;
    readonly code: string;
    constructor(reason: "invalid" | "unavailable" | "forbidden", message: string, code?: string) {
      super(message);
      this.status = reason === "unavailable" ? 503 : reason === "forbidden" ? 403 : 401;
      this.code = code ?? (reason === "unavailable" ? "service_unavailable" : reason === "forbidden" ? "forbidden" : "invalid_token");
    }
  }
  return {
    AuthError,
    effectiveTenantId: vi.fn(async () => {
      if (H.authFailure) throw new AuthError(H.authFailure.reason, H.authFailure.message, H.authFailure.code);
      return H.tenantId;
    }),
  };
});

vi.mock("@/lib/studio/editor-handoff-store", () => ({
  saveEditorHandoff: vi.fn(async (_tenantId: string, input: { handoff: EditorHandoff }) => {
    H.handoff = input.handoff;
    return { draftId: H.draftId, handoff: input.handoff };
  }),
  loadEditorHandoff: vi.fn(async () => H.handoff ? {
    draft: { id: H.draftId, idea: H.handoff.summary, payload: { editor_handoff: H.handoff }, status: "draft" },
    handoff: H.handoff,
  } : null),
  updateEditorHandoff: vi.fn(async (_tenantId: string, _draftId: string, _expected: number, handoff: EditorHandoff) => {
    if (!H.updateAllowed) return false;
    H.handoff = handoff;
    return true;
  }),
}));

vi.mock("@/lib/tenant-context", () => ({
  runWithTenant: vi.fn(async (_tenantId: string, callback: () => unknown) => callback()),
  currentTenantId: vi.fn(() => H.tenantId),
}));

vi.mock("@/lib/queue-add", async (importOriginal) => {
  const original = await importOriginal<typeof import("@/lib/queue-add")>();
  return {
    ...original,
    addQueuePost: vi.fn(async (_tenantId: string, input: Record<string, unknown>, options: Record<string, unknown> = {}) => {
      H.queueCalls.push(input);
      H.queueOptions.push(options);
      return { post: { id: "queue-1", ...input }, reused: false };
    }),
  };
});

vi.mock("@/lib/studio/export-repository", async () => {
  const { ExportQueueError } = await vi.importActual<typeof import("@/lib/studio/export-contract")>("@/lib/studio/export-contract");
  return {
    exportRepository: () => ({
      withLatestForPublish: vi.fn(async (_tenantId: string, _draftId: string, kind: "card_deck" | "video", publish: (receipt: Record<string, unknown>) => unknown) => {
        if (H.latestExport.blocker || !H.latestExport.is_latest || H.latestExport.latest_export?.status !== "succeeded") {
          const code = H.latestExport.blocker ?? "NO_SUCCESSFUL_EXPORT";
          throw new ExportQueueError(409, code, "latest export blocked", H.latestExport.first_empty_slide ? { first_empty_slide: H.latestExport.first_empty_slide } : {});
        }
        return publish({
          exportId: H.latestExport.latest_export.export_id,
          sourceHash: H.latestExport.current_source_hash,
          kind,
          artifactKeys: kind === "video" ? ["export-final.mp4"] : ["slide-1.png", "slide-2.png"],
        });
      }),
    }),
  };
});

function handoffBody() {
  return {
    kind: "video",
    summary: "제품 설명 영상 원본",
    source: { generation_id: "generation-1", candidate_id: "candidate-a" },
    payload: {
      asset_url: "/media/source.mp4",
      scenes: [
        { id: "scene-a", order: 0, title: "시작", lines: [{ id: "line-a", order: 0, text: "시작 문장" }] },
        { id: "scene-b", order: 1, title: "끝", lines: [{ id: "line-b", order: 0, text: "끝 문장" }] },
      ],
    },
  };
}

beforeEach(() => {
  process.env.MEDIA_SIGNING_SECRET = "editroom-s4-test-signing-secret";
  H.tenantId = "11111111-1111-4111-8111-111111111111";
  H.draftId = "draft-editor-1";
  H.handoff = null;
  H.updateAllowed = true;
  H.queueCalls = [];
  H.queueOptions = [];
  H.generatedText = "";
  H.latestExport = {
    blocker: null,
    is_latest: true,
    current_source_hash: "a".repeat(64),
    latest_export: { export_id: "22222222-2222-4222-8222-222222222222", status: "succeeded" },
  };
  H.authFailure = null;
});

afterEach(() => {
  delete process.env.MEDIA_SIGNING_SECRET;
});

describe("Studio 편집 인계 HTTP 통합 계약", () => {
  it("BE-V63-34 정상 경로: handoff API가 kind와 payload를 draft에 저장한다", async () => {
    const { POST } = await import("@/app/api/studio/handoffs/route");
    const response = await POST(new Request("http://localhost/api/studio/handoffs", {
      method: "POST",
      body: JSON.stringify({ tenant_id: H.tenantId, handoff: handoffBody() }),
    }));
    const body = await response.json();

    expect(response.status).toBe(201);
    expect(response.headers.get("X-Contract-Version")).toBe("1.0");
    expect(body).toEqual(expect.objectContaining({ draft_id: H.draftId, handoff: expect.objectContaining({ kind: "video" }) }));
  });

  it("BE-V63-34 거절 경로: tenant가 없으면 handoff를 저장하지 않는다", async () => {
    H.tenantId = null;
    const { POST } = await import("@/app/api/studio/handoffs/route");
    const response = await POST(new Request("http://localhost/api/studio/handoffs", {
      method: "POST",
      body: JSON.stringify({ handoff: handoffBody() }),
    }));
    expect(response.status).toBe(401);
  });

  it("BE-V63-35 정상 경로: 챗봇 명령이 실제 장면 순서 변경 handler로 라우팅된다", async () => {
    H.handoff = createEditorHandoff(handoffBody());
    const { POST } = await import("@/app/api/studio/commands/route");
    const response = await POST(new Request("http://localhost/api/studio/commands", {
      method: "POST",
      body: JSON.stringify({
        tenant_id: H.tenantId,
        action: "reorder_scenes",
        draft_id: H.draftId,
        expected_revision: 0,
        ordered_ids: ["scene-b", "scene-a"],
      }),
    }));
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body.command).toEqual(expect.objectContaining({ action: "reorder_scenes", executed: true }));
    expect(body.handoff.payload.scenes.map((scene: { id: string }) => scene.id)).toEqual(["scene-b", "scene-a"]);
  });

  it("BE-V63-35 거절 경로: 지원하지 않는 챗봇 명령은 가능한 명령 목록과 422를 반환한다", async () => {
    const { POST } = await import("@/app/api/studio/commands/route");
    const response = await POST(new Request("http://localhost/api/studio/commands", {
      method: "POST",
      body: JSON.stringify({ tenant_id: H.tenantId, action: "publish_without_review" }),
    }));
    const body = await response.json();
    expect(response.status).toBe(422);
    expect(body.code).toBe("CHAT_COMMAND_NOT_SUPPORTED");
  });

  it("S5-AC3 정상: 말투 후보 3개만 반환하고 숫자가 달라진 후보에는 사실 경고를 붙인다", async () => {
    H.generatedText = JSON.stringify({ candidates: [
      { id: "a", label: "후보 1", lines: ["9시간 중 오답은 몇 분이야?"] },
      { id: "b", label: "후보 2", lines: ["10시간 중 오답은 몇 분이야?"] },
      { id: "c", label: "후보 3", lines: ["오답 복습은 9시간 중 몇 분이야?"] },
    ] });
    const { POST } = await import("@/app/api/studio/commands/route");
    const response = await POST(new Request("http://localhost/api/studio/commands", {
      method: "POST",
      body: JSON.stringify({ tenant_id: H.tenantId, action: "suggest_chat_tone", tone: "warm", lines: ["9시간 중 오답은 몇 분이야?"] }),
    }));
    const body = await response.json();
    expect(response.status).toBe(200);
    expect(body.candidates).toHaveLength(3);
    expect(body.candidates[0].fact_warnings).toEqual([]);
    expect(body.candidates[1].fact_warnings.join(" ")).toContain("9시간");
    expect(body.candidates[1].fact_warnings.join(" ")).toContain("10시간");
    expect(body.fact_warning).toContain("적용 전에");
  });

  it("S5-AC3 거절: 후보가 3개가 아니면 ok:false로 끝내고 원문을 적용하지 않는다", async () => {
    H.generatedText = JSON.stringify({ candidates: [{ id: "a", label: "하나", lines: ["문장"] }] });
    const { POST } = await import("@/app/api/studio/commands/route");
    const response = await POST(new Request("http://localhost/api/studio/commands", {
      method: "POST",
      body: JSON.stringify({ tenant_id: H.tenantId, action: "suggest_chat_tone", tone: "short", lines: ["문장"] }),
    }));
    expect(response.status).toBe(200);
    expect(await response.json()).toEqual(expect.objectContaining({ ok: false }));
  });

  it("S5-AC3 거절: 문자열 아닌 줄과 2천자를 넘는 줄은 AI 호출 전에 400으로 막는다", async () => {
    const { POST } = await import("@/app/api/studio/commands/route");
    for (const lines of [[{ text: "문장" }], ["가".repeat(2_001)]]) {
      const response = await POST(new Request("http://localhost/api/studio/commands", {
        method: "POST",
        body: JSON.stringify({ tenant_id: H.tenantId, action: "suggest_chat_tone", tone: "short", lines }),
      }));
      expect(response.status).toBe(400);
      expect(await response.json()).toEqual(expect.objectContaining({ code: "CHAT_TONE_LINES_INVALID" }));
    }
  });

  it("S5-R2-MINOR 인증 검증 장애를 작업 공간 없음 401로 숨기지 않고 AuthError 상태로 돌려준다", async () => {
    H.authFailure = { reason: "unavailable", message: "인증 검증기를 사용할 수 없습니다.", code: "auth_verifier_unavailable" };
    const { POST } = await import("@/app/api/studio/commands/route");
    const response = await POST(new Request("http://localhost/api/studio/commands", {
      method: "POST",
      body: JSON.stringify({ tenant_id: H.tenantId, action: "suggest_chat_tone", tone: "short", lines: ["문장"] }),
    }));
    expect(response.status).toBe(503);
    expect(await response.json()).toEqual(expect.objectContaining({ code: "auth_verifier_unavailable" }));
  });

  it("BE-V63-36 경합 경로: 저장 직전 revision이 바뀌면 409로 끝내고 덮어쓰지 않는다", async () => {
    H.handoff = createEditorHandoff(handoffBody());
    H.updateAllowed = false;
    const { PATCH } = await import("@/app/api/studio/drafts/[draftId]/editor/route");
    const response = await PATCH(new Request("http://localhost/api/studio/drafts/draft/editor", {
      method: "PATCH",
      body: JSON.stringify({ tenant_id: H.tenantId, operation: "delete_line", line_id: "line-a", expected_revision: 0 }),
    }), { params: Promise.resolve({ draftId: H.draftId }) });
    expect(response.status).toBe(409);
  });

  it("BE-V63-37·S4-AC5 정상: ready Studio draft를 최신 export ID·hash와 함께 OpenClaw 큐에 넣는다", async () => {
    H.handoff = applyEditorOperation(createEditorHandoff(handoffBody()), 0, { operation: "mark_ready" });
    const { POST } = await import("@/app/api/studio/commands/route");
    const response = await POST(new Request("http://localhost/api/studio/commands", {
      method: "POST",
      body: JSON.stringify({ tenant_id: H.tenantId, action: "enqueue_openclaw", draft_id: H.draftId }),
    }));
    const body = await response.json();

    expect(response.status).toBe(201);
    expect(body.command).toEqual(expect.objectContaining({ action: "enqueue_openclaw", executed: true }));
    expect(H.queueCalls[0]).toEqual(expect.objectContaining({
      sourceContext: expect.objectContaining({
        type: "studio_handoff",
        draftId: H.draftId,
        exportId: "22222222-2222-4222-8222-222222222222",
        exportSourceHash: "a".repeat(64),
      }),
    }));
    expect(H.queueOptions[0]).toEqual(expect.objectContaining({
      preparedMedia: expect.objectContaining({
        videoFilename: "export-final.mp4",
        videoUrl: expect.stringContaining("/api/exports/deliver/"),
      }),
    }));
  });

  it("S4-AC6 거절: 클라이언트를 우회해도 최신 내보내기가 아니면 큐 등록을 막는다", async () => {
    H.handoff = applyEditorOperation(createEditorHandoff(handoffBody()), 0, { operation: "mark_ready" });
    H.latestExport = {
      blocker: "EXPORT_SOURCE_STALE",
      is_latest: false,
      current_source_hash: "b".repeat(64),
      latest_export: { export_id: "22222222-2222-4222-8222-222222222222", status: "succeeded" },
    };
    const { POST } = await import("@/app/api/studio/drafts/[draftId]/enqueue/route");
    const response = await POST(new Request("http://localhost/api/studio/drafts/draft-editor-1/enqueue", {
      method: "POST",
      body: JSON.stringify({ tenant_id: H.tenantId }),
    }), { params: Promise.resolve({ draftId: H.draftId }) });

    expect(response.status).toBe(409);
    expect(await response.json()).toMatchObject({ code: "EXPORT_SOURCE_STALE" });
    expect(H.queueCalls).toHaveLength(0);
  });

  it.each([
    ["EMPTY_SLIDE", { first_empty_slide: { order: 5, number: 6, item_key: "slide-6" } }],
    ["EXPORT_FAILED", {}],
    ["NO_SUCCESSFUL_EXPORT", {}],
  ])("S4-AC4·AC6 거절: %s이면 직접 enqueue API도 409로 막는다", async (blocker, details) => {
    H.handoff = applyEditorOperation(createEditorHandoff(handoffBody()), 0, { operation: "mark_ready" });
    H.latestExport = {
      blocker,
      is_latest: false,
      current_source_hash: "a".repeat(64),
      latest_export: { export_id: "22222222-2222-4222-8222-222222222222", status: "failed" },
      ...details,
    };
    const { POST } = await import("@/app/api/studio/drafts/[draftId]/enqueue/route");
    const response = await POST(new Request("http://localhost/api/studio/drafts/draft-editor-1/enqueue", {
      method: "POST",
      body: JSON.stringify({ tenant_id: H.tenantId }),
    }), { params: Promise.resolve({ draftId: H.draftId }) });

    expect(response.status).toBe(409);
    expect(await response.json()).toMatchObject({ code: blocker, ...details });
    expect(H.queueCalls).toHaveLength(0);
  });
});
