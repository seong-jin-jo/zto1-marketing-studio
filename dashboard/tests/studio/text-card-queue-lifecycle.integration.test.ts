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

  it.each([
    ["문자열 아닌 editLines", { editLines: ["정상", 7] }],
    ["최대 장수 초과 editLines", { editLines: Array.from({ length: 11 }, (_, index) => `${index + 1}장`) }],
    ["장당 길이 초과 editLines", { editLines: ["가".repeat(501)] }],
    ["허용되지 않은 cardTextPositions", { editLines: ["한 장"], cardTextPositions: ["somewhere"] }],
    ["장수와 다른 cardTextPositions", { editLines: ["첫 장", "둘째 장"], cardTextPositions: ["center"] }],
    ["규격을 어긴 editFormat", { editLines: ["한 장"], cardTextPositions: ["center"], editFormat: { kind: "card", aspectRatio: "16:9", subtitleSize: "보통", background: "작업실 책상" } }],
  ])("PR95-R3-QUEUE-01 거절: %s는 저장 전에 400으로 막는다", async (_label, invalidFields) => {
    const { POST } = await import("@/app/api/queue/add/route");
    const response = await POST(new Request("http://localhost/api/queue/add", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        tenant_id: H.tenantId,
        text: "검증할 카드",
        imageUrls: ["/api/images/deliver/one", "/api/images/deliver/two"],
        textEmbedded: true,
        ...invalidFields,
      }),
    }));
    expect(response.status).toBe(400);
    expect(await response.json()).toEqual({ error: expect.any(String) });
  });

  it("PR95-R3-QUEUE-02 경계: 위치를 생략한 카드는 기본 중앙값 복구를 위해 빈 배열을 허용한다", async () => {
    const { POST } = await import("@/app/api/queue/add/route");
    const response = await POST(new Request("http://localhost/api/queue/add", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        tenant_id: H.tenantId,
        text: "기본 위치 카드",
        imageUrls: ["/api/images/deliver/one", "/api/images/deliver/two"],
        textEmbedded: true,
        editLines: ["첫 카드", "둘째 카드"],
        cardTextPositions: [],
        editFormat: { kind: "card", aspectRatio: "4:5", subtitleSize: "보통", background: "작업실 책상" },
      }),
    }));
    expect(response.status).toBe(200);
  });

  it.each([
    [
      "이미지와 대본 장수가 다름",
      {
        imageUrls: ["/api/images/deliver/one", "/api/images/deliver/two"],
        textEmbedded: true,
        editLines: ["첫 카드"],
        cardTextPositions: [],
        editFormat: { kind: "card", aspectRatio: "4:5", subtitleSize: "보통", background: "작업실 책상" },
      },
    ],
    [
      "일반 카드도 이미지와 대본 장수가 다름",
      {
        imageUrls: ["/api/images/deliver/one", "/api/images/deliver/two"],
        textEmbedded: false,
        editLines: ["첫 카드"],
      },
    ],
    [
      "글자 내장 표식은 있지만 이미지 배열이 없음",
      {
        textEmbedded: true,
        editLines: ["첫 카드"],
        cardTextPositions: [],
        editFormat: { kind: "card", aspectRatio: "4:5", subtitleSize: "보통", background: "작업실 책상" },
      },
    ],
    [
      "글자 내장 표식은 있지만 대본이 없음",
      {
        imageUrls: ["/api/images/deliver/one"],
        textEmbedded: true,
        cardTextPositions: [],
        editFormat: { kind: "card", aspectRatio: "4:5", subtitleSize: "보통", background: "작업실 책상" },
      },
    ],
    [
      "글자 내장 표식은 있지만 위치 배열이 없음",
      {
        imageUrls: ["/api/images/deliver/one"],
        textEmbedded: true,
        editLines: ["첫 카드"],
        editFormat: { kind: "card", aspectRatio: "4:5", subtitleSize: "보통", background: "작업실 책상" },
      },
    ],
    [
      "글자 내장 표식은 있지만 카드 편집 형식이 없음",
      {
        imageUrls: ["/api/images/deliver/one"],
        textEmbedded: true,
        editLines: ["첫 카드"],
        cardTextPositions: [],
      },
    ],
    [
      "글자 내장 카드가 영상 편집 형식을 사용함",
      {
        imageUrls: ["/api/images/deliver/one"],
        textEmbedded: true,
        editLines: ["첫 카드"],
        cardTextPositions: [],
        editFormat: { kind: "video", aspectRatio: "9:16", subtitleSize: "보통", playbackSpeed: 1, voice: "차분한 남성" },
      },
    ],
    [
      "textEmbedded가 문자열임",
      {
        imageUrls: ["/api/images/deliver/one"],
        textEmbedded: "true",
      },
    ],
    [
      "textEmbedded가 숫자임",
      {
        imageUrls: ["/api/images/deliver/one"],
        textEmbedded: 1,
      },
    ],
    [
      "textEmbedded가 null임",
      {
        imageUrls: ["/api/images/deliver/one"],
        textEmbedded: null,
      },
    ],
    [
      "textEmbedded가 객체임",
      {
        imageUrls: ["/api/images/deliver/one"],
        textEmbedded: {},
      },
    ],
  ])("PR95-R4-QUEUE-01 거절: %s 요청은 기존 오류 형식의 400을 반환한다", async (_label, fields) => {
    const { POST } = await import("@/app/api/queue/add/route");
    const response = await POST(new Request("http://localhost/api/queue/add", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        tenant_id: H.tenantId,
        text: "교차 계약을 검증할 카드",
        ...fields,
      }),
    }));
    expect(response.status).toBe(400);
    expect(await response.json()).toEqual({ error: expect.any(String) });
  });

  it("PR95-R4-QUEUE-02 경계: textEmbedded를 생략한 구형 요청은 계속 저장한다", async () => {
    const { POST } = await import("@/app/api/queue/add/route");
    const response = await POST(new Request("http://localhost/api/queue/add", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        tenant_id: H.tenantId,
        text: "표식 도입 전 구형 요청",
        imageUrls: ["/api/images/deliver/legacy"],
      }),
    }));
    expect(response.status).toBe(200);
    expect(await response.json()).toEqual(expect.objectContaining({
      post: expect.objectContaining({ textEmbedded: false }),
    }));
  });

  it("PR95-R4-QUEUE-03 정상: 명시적인 textEmbedded false도 일반 카드로 계속 저장한다", async () => {
    const { POST } = await import("@/app/api/queue/add/route");
    const response = await POST(new Request("http://localhost/api/queue/add", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        tenant_id: H.tenantId,
        text: "글자 비내장 일반 카드",
        imageUrls: ["/api/images/deliver/plain"],
        textEmbedded: false,
      }),
    }));
    expect(response.status).toBe(200);
    expect(await response.json()).toEqual(expect.objectContaining({
      post: expect.objectContaining({ textEmbedded: false }),
    }));
  });
});
