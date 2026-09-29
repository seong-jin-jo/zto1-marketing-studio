import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const H = vi.hoisted(() => ({ tenantId: "tenant-text-card" }));

vi.mock("@/lib/tenant-auth", () => ({
  effectiveTenantId: vi.fn(async () => H.tenantId),
}));

vi.mock("@/lib/queue-store", () => ({
  mirrorQueuePost: vi.fn(async () => true),
}));

describe("PR95-R1-LIFECYCLE-02 글자 내장 표식의 발행 대기열 저장·복구", () => {
  let dataDir: string;

  beforeEach(() => {
    dataDir = fs.mkdtempSync(path.join(os.tmpdir(), "osmu-text-card-queue-"));
    process.env.DATA_DIR = dataDir;
    vi.resetModules();
  });

  afterEach(() => {
    fs.rmSync(dataDir, { recursive: true, force: true });
    delete process.env.DATA_DIR;
  });

  it("정상: queue/add와 publish-return-context가 여러 장과 표식을 함께 보존한다", async () => {
    const { POST } = await import("@/app/api/queue/add/route");
    const response = await POST(new Request("http://localhost/api/queue/add", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        tenant_id: H.tenantId,
        draftId: "draft-text-card",
        text: "발행할 카드",
        imageUrl: "/api/images/deliver/one",
        imageUrls: ["/api/images/deliver/one", "/api/images/deliver/two"],
        textEmbedded: true,
        editLines: ["첫 카드", "둘째 카드"],
        cardTextPositions: ["top-center", "bottom-center"],
        editFormat: { kind: "card", aspectRatio: "4:5", subtitleSize: "보통", background: "작업실 책상" },
      }),
    }));
    const body = await response.json();
    expect(response.status).toBe(200);
    expect(body.post).toEqual(expect.objectContaining({
      imageUrls: ["/api/images/deliver/one", "/api/images/deliver/two"],
      textEmbedded: true,
      editLines: ["첫 카드", "둘째 카드"],
      cardTextPositions: ["top-center", "bottom-center"],
      editFormat: { kind: "card", aspectRatio: "4:5", subtitleSize: "보통", background: "작업실 책상" },
    }));

    const { buildPublishReturnContext, buildPublishReturnWork, readPublishReturnRequest } = await import("@/lib/publish-return-context");
    const context = buildPublishReturnContext(body.post, "inbox");
    expect(context).toEqual(expect.objectContaining({ textEmbedded: true }));
    expect(context?.returnUrl).toContain("text_embedded=1");
    expect(readPublishReturnRequest(context!.returnUrl)).toEqual(expect.objectContaining({ textEmbedded: true }));
    expect(buildPublishReturnWork(body.post)).toEqual(expect.objectContaining({
      imageUrl: "/api/images/deliver/one",
      imageUrls: ["/api/images/deliver/one", "/api/images/deliver/two"],
      textEmbedded: true,
      editLines: ["첫 카드", "둘째 카드"],
      cardTextPositions: ["top-center", "bottom-center"],
      editFormat: { kind: "card", aspectRatio: "4:5", subtitleSize: "보통", background: "작업실 책상" },
      cardSourceRestorable: true,
    }));
  });

  it("경계: 표식 없는 구형 큐는 이미지 장수만 보고 글자 내장 카드로 추측하지 않는다", async () => {
    const { buildPublishReturnWork } = await import("@/lib/publish-return-context");
    const work = buildPublishReturnWork({
      id: "queue-legacy",
      text: "구형 카드",
      imageUrl: "/api/images/deliver/one",
      imageUrls: ["/api/images/deliver/one", "/api/images/deliver/two"],
    });
    expect(work).toEqual(expect.objectContaining({ textEmbedded: false }));
  });

  it("PR95-R2-QUEUE-DECK-01 경계: 원본 정보 없는 여러 장 글자 카드는 복원 가능으로 거짓 판정하지 않는다", async () => {
    const { buildPublishReturnWork } = await import("@/lib/publish-return-context");
    const work = buildPublishReturnWork({
      id: "queue-unrestorable",
      text: "합쳐진 발행 본문",
      imageUrl: "/api/images/deliver/one",
      imageUrls: ["/api/images/deliver/one", "/api/images/deliver/two"],
      textEmbedded: true,
    });
    expect(work).toEqual(expect.objectContaining({
      textEmbedded: true,
      cardSourceRestorable: false,
      editLines: [],
    }));
  });
});
