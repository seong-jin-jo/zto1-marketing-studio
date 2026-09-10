// 2026-09-08 정정: 생성 계열 라우트가 상류 실패에 502 를 쓰면 앞단 리버스 프록시가 우리
// JSON 본문을 HTML 오류 페이지로 갈아치워, 회장 화면에 "502" 라는 숫자만 떴다. 사용자가
// 이유를 볼 수 있도록 200+ok:false 로 바꿨다(운영·알림 계열의 fail-closed 502 는 유지).
import { describe, it, expect, beforeEach, vi } from "vitest";
import fs from "fs";
import os from "os";
import path from "path";

// generateText 호출부 6개 라우트의 429 계약 검증:
// SharedGenerationQuotaError(공유 claude -p 월 한도 초과)만 429 + code=shared_generation_quota_exceeded로
// 매핑되고, 그 외 에러는 각 라우트의 기존 오류 계약(502/500 등)을 그대로 유지해야 한다.
//
// generateText 자체(quota reserve/release 로직)는 tests/anthropic-quota.test.ts에서 상태머신으로
// 검증하므로, 여기서는 "라우트가 그 결과를 어떻게 HTTP로 매핑하나"만 본다 — @/lib/anthropic을
// 부분 mock(SharedGenerationQuotaError·sharedGenerationQuotaErrorResponse는 실물 유지)해 격리.

const H = vi.hoisted(() => ({
  genImpl: null as null | ((prompt: string, tenantId: string | null) => Promise<string>),
}));

vi.mock("@/lib/anthropic", async (importActual) => {
  const actual = await importActual<typeof import("@/lib/anthropic")>();
  return {
    ...actual,
    generateText: vi.fn((prompt: string, tenantId: string | null) => {
      if (!H.genImpl) throw new Error("test genImpl not set");
      return H.genImpl(prompt, tenantId);
    }),
  };
});

vi.mock("@/lib/tenant-auth", () => ({
  effectiveTenantId: vi.fn(async (_req: Request, fb?: string | null) => fb ?? "tenant-1"),
}));

vi.mock("@/lib/wiki-retrieve", () => ({
  getWikiContext: vi.fn(async () => ({ mode: "none" as const, text: "", docs: 0 })),
}));

vi.mock("@/lib/github", () => ({
  RepoTokenDecryptionError: class RepoTokenDecryptionError extends Error {},
  getRepoToken: vi.fn(async () => null),
  getRepoInfo: vi.fn(async () => ({ ok: true, status: 200, defaultBranch: "main", private: false })),
  fetchRepoFile: vi.fn(async () => ({ ok: true, text: "# 문서\n충분히 긴 마크다운 본문입니다. ".repeat(3), status: 200 })),
  listWikiFiles: vi.fn(async () => ({ paths: ["a.md"], truncated: false, status: 200, markdownCount: 1 })),
  extractTitle: vi.fn(() => "제목"),
}));

function genericSql() {
  return Object.assign((_s: TemplateStringsArray, ..._v: unknown[]) => Promise.resolve([]), { json: (v: unknown) => v });
}

vi.mock("@/lib/db", () => ({
  withTenant: vi.fn(async (_t: string, cb: (sql: unknown) => unknown) => cb(genericSql())),
}));

let tmpDir: string;

beforeEach(() => {
  vi.resetModules();
  H.genImpl = null;
  tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "osmu-quota-route-"));
  process.env.DATA_DIR = tmpDir;
  process.env.CONFIG_DIR = tmpDir;
});

async function importErrorClass() {
  const mod = await import("@/lib/anthropic");
  return mod.SharedGenerationQuotaError;
}

async function importApprovalErrorClass() {
  const mod = await import("@/lib/anthropic");
  return mod.SharedAiApprovalRequiredError;
}

function postJson(url: string, body: Record<string, unknown>) {
  return new Request(url, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
}

describe("generateText 호출 라우트 — SharedGenerationQuotaError → 429 계약", () => {
  it("POST /api/queue/seed", async () => {
    const QuotaError = await importErrorClass();
    H.genImpl = async () => { throw new QuotaError("2026-07", 100, 100); };
    const { POST } = await import("@/app/api/queue/seed/route");
    const res = await POST(postJson("http://localhost/api/queue/seed", { count: 2 }));
    const body = await res.json();
    expect(res.status).toBe(429);
    expect(body.code).toBe("shared_generation_quota_exceeded");
  }, 15_000);

  it("POST /api/studio/brand-setup", async () => {
    const QuotaError = await importErrorClass();
    H.genImpl = async () => { throw new QuotaError("2026-07", 100, 100); };
    const { POST } = await import("@/app/api/studio/brand-setup/route");
    const res = await POST(postJson("http://localhost/api/studio/brand-setup", {
      tenant_id: "tenant-1",
      answers: { service: "x", target: "y", tone: "z", banned: "", hooks: "", visual: "" },
    }));
    const body = await res.json();
    expect(res.status).toBe(429);
    expect(body.code).toBe("shared_generation_quota_exceeded");
  });

  it("POST /api/studio/text", async () => {
    const QuotaError = await importErrorClass();
    H.genImpl = async () => { throw new QuotaError("2026-07", 100, 100); };
    const { POST } = await import("@/app/api/studio/text/route");
    const res = await POST(postJson("http://localhost/api/studio/text", { idea: "신메뉴", tenant_id: "tenant-1" }));
    const body = await res.json();
    expect(res.status).toBe(429);
    expect(body.code).toBe("shared_generation_quota_exceeded");
  });

  it("POST /api/video/refine-clip", async () => {
    const QuotaError = await importErrorClass();
    H.genImpl = async () => { throw new QuotaError("2026-07", 100, 100); };
    const { POST } = await import("@/app/api/video/refine-clip/route");
    const res = await POST(postJson("http://localhost/api/video/refine-clip", { caption: "원본 캡션", tenant_id: "tenant-1" }));
    const body = await res.json();
    expect(res.status).toBe(429);
    expect(body.code).toBe("shared_generation_quota_exceeded");
  });

  it("POST /api/brand/sync-repo", async () => {
    const QuotaError = await importErrorClass();
    H.genImpl = async () => { throw new QuotaError("2026-07", 100, 100); };
    const { POST } = await import("@/app/api/brand/sync-repo/route");
    const res = await POST(postJson("http://localhost/api/brand/sync-repo", {
      tenant_id: "tenant-1", repo: "owner/repo", path: "README.md",
    }));
    const body = await res.json();
    expect(res.status).toBe(429);
    expect(body.code).toBe("shared_generation_quota_exceeded");
  });

  it("POST /api/brand/sync-wiki — best-effort 톤재증류 안에서도 quota는 삼켜지지 않고 429로 표면화", async () => {
    const QuotaError = await importErrorClass();
    H.genImpl = async () => { throw new QuotaError("2026-07", 100, 100); };
    const { POST } = await import("@/app/api/brand/sync-wiki/route");
    const res = await POST(postJson("http://localhost/api/brand/sync-wiki", { tenant_id: "tenant-1", repo: "owner/repo" }));
    const body = await res.json();
    expect(res.status).toBe(429);
    expect(body.code).toBe("shared_generation_quota_exceeded");
  });
});

describe("generateText 호출 라우트 — SharedAiApprovalRequiredError → 403 shared_ai_approval_required 계약", () => {
  it("POST /api/queue/seed", async () => {
    const ApprovalError = await importApprovalErrorClass();
    H.genImpl = async () => { throw new ApprovalError(); };
    const { POST } = await import("@/app/api/queue/seed/route");
    const res = await POST(postJson("http://localhost/api/queue/seed", { count: 2 }));
    const body = await res.json();
    expect(res.status).toBe(403);
    expect(body.code).toBe("shared_ai_approval_required");
  });

  it("POST /api/studio/brand-setup", async () => {
    const ApprovalError = await importApprovalErrorClass();
    H.genImpl = async () => { throw new ApprovalError(); };
    const { POST } = await import("@/app/api/studio/brand-setup/route");
    const res = await POST(postJson("http://localhost/api/studio/brand-setup", {
      tenant_id: "tenant-1",
      answers: { service: "x", target: "y", tone: "z", banned: "", hooks: "", visual: "" },
    }));
    const body = await res.json();
    expect(res.status).toBe(403);
    expect(body.code).toBe("shared_ai_approval_required");
  });

  it("POST /api/studio/text", async () => {
    const ApprovalError = await importApprovalErrorClass();
    H.genImpl = async () => { throw new ApprovalError(); };
    const { POST } = await import("@/app/api/studio/text/route");
    const res = await POST(postJson("http://localhost/api/studio/text", { idea: "신메뉴", tenant_id: "tenant-1" }));
    const body = await res.json();
    expect(res.status).toBe(403);
    expect(body.code).toBe("shared_ai_approval_required");
  });

  it("POST /api/video/refine-clip", async () => {
    const ApprovalError = await importApprovalErrorClass();
    H.genImpl = async () => { throw new ApprovalError(); };
    const { POST } = await import("@/app/api/video/refine-clip/route");
    const res = await POST(postJson("http://localhost/api/video/refine-clip", { caption: "원본 캡션", tenant_id: "tenant-1" }));
    const body = await res.json();
    expect(res.status).toBe(403);
    expect(body.code).toBe("shared_ai_approval_required");
  });

  it("POST /api/brand/sync-repo", async () => {
    const ApprovalError = await importApprovalErrorClass();
    H.genImpl = async () => { throw new ApprovalError(); };
    const { POST } = await import("@/app/api/brand/sync-repo/route");
    const res = await POST(postJson("http://localhost/api/brand/sync-repo", {
      tenant_id: "tenant-1", repo: "owner/repo", path: "README.md",
    }));
    const body = await res.json();
    expect(res.status).toBe(403);
    expect(body.code).toBe("shared_ai_approval_required");
  });

  it("POST /api/brand/sync-wiki — best-effort 톤재증류 안에서도 미승인은 삼켜지지 않고 403으로 표면화", async () => {
    const ApprovalError = await importApprovalErrorClass();
    H.genImpl = async () => { throw new ApprovalError(); };
    const { POST } = await import("@/app/api/brand/sync-wiki/route");
    const res = await POST(postJson("http://localhost/api/brand/sync-wiki", { tenant_id: "tenant-1", repo: "owner/repo" }));
    const body = await res.json();
    expect(res.status).toBe(403);
    expect(body.code).toBe("shared_ai_approval_required");
  });
});

describe("generateText 호출 라우트 — 그 외 에러는 기존 오류 계약(quota 아닌 일반 실패) 보존", () => {
  it("studio/text: 일반 Error는 200+ok:false(quota 매핑 아님, 프록시가 문구를 삼키지 않게)", async () => {
    H.genImpl = async () => { throw new Error("claude -p 알수없는 실패"); };
    const { POST } = await import("@/app/api/studio/text/route");
    const res = await POST(postJson("http://localhost/api/studio/text", { idea: "x", tenant_id: "tenant-1" }));
    const body = await res.json();
    expect(res.status).toBe(200);
    expect(body.code).toBeUndefined();
  });

  it("video/refine-clip: 일반 Error는 여전히 500(quota 매핑 아님)", async () => {
    H.genImpl = async () => { throw new Error("claude -p 알수없는 실패"); };
    const { POST } = await import("@/app/api/video/refine-clip/route");
    const res = await POST(postJson("http://localhost/api/video/refine-clip", { caption: "c", tenant_id: "tenant-1" }));
    const body = await res.json();
    expect(res.status).toBe(500);
    expect(body.code).toBeUndefined();
  });

  it("queue/seed: 일반 Error는 여전히 502(quota 매핑 아님)", async () => {
    H.genImpl = async () => { throw new Error("claude -p 알수없는 실패"); };
    const { POST } = await import("@/app/api/queue/seed/route");
    const res = await POST(postJson("http://localhost/api/queue/seed", { count: 1 }));
    const body = await res.json();
    expect(res.status).toBe(502);
    expect(body.code).toBeUndefined();
  });

  it("brand/sync-wiki: 일반 Error(quota 아님)는 기존처럼 삼켜지고 200 ok(문서 저장은 유지)", async () => {
    H.genImpl = async () => { throw new Error("증류 실패(quota 아님)"); };
    const { POST } = await import("@/app/api/brand/sync-wiki/route");
    const res = await POST(postJson("http://localhost/api/brand/sync-wiki", { tenant_id: "tenant-1", repo: "owner/repo" }));
    const body = await res.json();
    expect(res.status).toBe(200);
    expect(body.ok).toBe(true);
    expect(body.toneUpdated).toBe(false);
  });
});
