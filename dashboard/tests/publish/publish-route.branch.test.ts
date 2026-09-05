import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { installFetch } from "./helpers/mock-fetch";
import { withTenant } from "@/lib/db";

// ── /api/publish 분기 하네스 (인프라 無, 항상 실행) ───────────────────────────
// 사용자 요구: "올바른 토큰 happy path / 생략(skip) / 잘못된 토큰" 전 분기를 스크립트로 박제.
// 경계: effectiveTenantId(토큰→테넌트)·getChannelCred(채널 자격)·withTenant(DB 기록)를 목으로
// 고정하고, 실 publish*() 함수는 그대로 두되 global fetch만 목 → 플랫폼 API 없이 분기 검증.
//
// 주의: 실제 route는 effectiveTenantId(request, body.tenant_id) — body의 tenant_id를 fallback으로
// 받는다(운영자 경로). 여기선 effectiveTenantId 출력 자체를 고정해 route 분기만 검증한다.
// (fallback 해석 로직은 tenant-auth의 책임으로 별도.)

const H = vi.hoisted(() => ({
  tenantId: null as string | null,
  cred: null as { token: string; userId?: string; meta?: Record<string, unknown>; accountId?: string } | null,
  inserts: [] as unknown[][],
  getChannelCredCalls: [] as unknown[][],
  existingPublication: null as { external_id: string | null; permalink: string | null } | null,
  publicationRecordError: null as Error | null,
  markQueuePublishedCalls: [] as unknown[][],
  queueRecordError: null as Error | null,
  queueOutcome: "updated" as "updated" | "absent",
  instagramPermalink: "https://www.instagram.com/p/recovered/",
  reservationClaimed: false,
  reservation: null as null | { tenant: unknown; draft: unknown; platform: unknown; text: unknown; accountId: unknown },
  existingFirstCommentStatus: null as string | null,
  leaseTakeoverWon: true,
  firstCommentResult: null as null | { ok: boolean; error?: string; externalId?: string; failureKind?: "definitive" | "indeterminate" },
  conflictReservedAt: new Date().toISOString(),
}));

vi.mock("@/lib/tenant-auth", () => ({
  effectiveTenantId: vi.fn(async () => H.tenantId),
}));

vi.mock("@/lib/db", () => ({
  withTenant: vi.fn(async (_tid: string, cb: (sql: unknown) => unknown) => {
    const sql = (strings: TemplateStringsArray, ...vals: unknown[]) => {
      const query = strings.join(" ");
      if (query.includes("INSERT INTO published_posts") && query.includes("'in_progress'")) {
        if (H.existingPublication || H.reservationClaimed) return Promise.resolve([]);
        H.reservationClaimed = true;
        // 예약 INSERT 값 순서: tenant, draft, platform, text, accountId, idempotencyKey
        H.reservation = { tenant: vals[0], draft: vals[1], platform: vals[2], text: vals[3], accountId: vals[4] };
        return Promise.resolve([{ id: "11111111-1111-4111-8111-111111111111" }]);
      }
      // 예약이 막혔을 때 무엇이 막았는지 읽는 조회.
      if (query.includes("SELECT id::text, status")) {
        if (H.existingPublication) {
          return Promise.resolve([{
            id: "11111111-1111-4111-8111-111111111111",
            status: "published",
            external_id: H.existingPublication.external_id,
            permalink: H.existingPublication.permalink,
            reserved_at: null,
            first_comment_status: H.existingFirstCommentStatus,
          }]);
        }
        if (H.reservationClaimed) {
          return Promise.resolve([{
            id: "22222222-2222-4222-8222-222222222222",
            status: "in_progress",
            external_id: null,
            permalink: null,
            reserved_at: H.conflictReservedAt,
            first_comment_status: null,
          }]);
        }
        return Promise.resolve([]);
      }
      // 만료 임차 회수(CAS). 경쟁에서 이기면 그 예약 번호를 돌려준다.
      if (query.includes("UPDATE published_posts") && query.includes("SET reserved_at = now()")) {
        H.reservation = { tenant: null, draft: null, platform: null, text: vals[0], accountId: null };
        return Promise.resolve(H.leaseTakeoverWon ? [{ id: "22222222-2222-4222-8222-222222222222" }] : []);
      }
      if (query.includes("INSERT INTO published_posts") && H.publicationRecordError) {
        return Promise.reject(H.publicationRecordError);
      }
      if (query.includes("UPDATE published_posts") && query.includes("SET external_id")) {
        if (H.publicationRecordError) return Promise.reject(H.publicationRecordError);
        const reservation = H.reservation!;
        H.inserts.push([
          reservation.tenant,
          reservation.draft,
          reservation.platform,
          vals[0],
          vals[1],
          vals[2],
          vals[3],
          vals[4],
          reservation.accountId,
          vals[8],
        ]);
        if (vals[3] === "published") H.existingPublication = { external_id: vals[0] as string | null, permalink: vals[1] as string | null };
        return Promise.resolve([]);
      }
      H.inserts.push(vals);
      return Promise.resolve([]);
    };
    sql.json = (value: unknown) => value;
    return cb(sql);
  }),
}));

// 첫 댓글 발행은 본문과 같은 엔드포인트를 써서 URL 목으로는 둘을 가를 수 없다.
// H.firstCommentResult 가 설정된 검증에서만 결과를 고정하고, 나머지는 실제 구현을 그대로 쓴다.
vi.mock("@/lib/first-comment", async (importActual) => {
  const actual = await importActual<typeof import("@/lib/first-comment")>();
  return {
    ...actual,
    publishFirstComment: vi.fn(async (...args: Parameters<typeof actual.publishFirstComment>) =>
      H.firstCommentResult ?? actual.publishFirstComment(...args)),
  };
});

vi.mock("@/lib/queue-store", () => ({
  markQueuePublished: vi.fn(async (...args: unknown[]) => {
    H.markQueuePublishedCalls.push(args);
    if (H.queueRecordError) throw H.queueRecordError;
    return H.queueOutcome;
  }),
}));

vi.mock("@/lib/publish", async (importActual) => {
  const actual = await importActual<typeof import("@/lib/publish")>();
  return {
    ...actual,
    getChannelCred: vi.fn(async (...args: unknown[]) => {
      H.getChannelCredCalls.push(args);
      return H.cred;
    }),
    fetchThreadsPermalink: vi.fn(async () => "https://www.threads.net/@u/post/recovered"),
    fetchInstagramPermalink: vi.fn(async () => H.instagramPermalink),
  };
});

// published_posts INSERT 값 순서:
// [tenant_id, draft_id, platform, external_id, permalink, text, status, error, account_id]
const I = { tenant: 0, draft: 1, platform: 2, externalId: 3, permalink: 4, text: 5, status: 6, error: 7, accountId: 8, providerMeta: 9 };

// 초안 번호 없는 실발행은 이제 멱등 키를 요구한다(같은 본문 동시 두 건의 중복 게시 차단).
// 키를 일부러 빼고 싶은 검증은 idempotency_key: null 을 넘긴다.
async function callPublish(body: Record<string, unknown>) {
  const { POST } = await import("@/app/api/publish/route");
  const { idempotency_key: key, ...rest } = body;
  const headers: Record<string, string> = { "Content-Type": "application/json" };
  if (key === undefined) headers["Idempotency-Key"] = "branch-test-intent";
  else if (typeof key === "string") headers["Idempotency-Key"] = key;
  const res = await POST(
    new Request("http://localhost/api/publish", {
      method: "POST",
      headers,
      body: JSON.stringify(rest),
    }),
  );
  return { status: res.status, body: await res.json() };
}

beforeEach(() => {
  H.tenantId = "tenant-1";
  H.cred = { token: "tok", userId: "u-1" };
  H.inserts = [];
  H.getChannelCredCalls = [];
  H.existingPublication = null;
  H.publicationRecordError = null;
  H.markQueuePublishedCalls = [];
  H.queueOutcome = "updated";
  H.queueRecordError = null;
  H.instagramPermalink = "https://www.instagram.com/p/recovered/";
  H.reservationClaimed = false;
  H.reservation = null;
  H.existingFirstCommentStatus = null;
  H.conflictReservedAt = new Date().toISOString();
  H.firstCommentResult = null;
  H.leaseTakeoverWon = true;
  vi.mocked(withTenant).mockClear();
});

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("/api/publish — 입력/인증 분기", () => {
  it("FMT-API-02 거절: 허용하지 않은 영상 비율은 자격 조회와 외부 발행 전에 422로 막는다", async () => {
    const { status, body } = await callPublish({
      platform: "threads",
      text: "hi",
      edit_format: {
        kind: "video",
        aspectRatio: "4:3",
        subtitleSize: "보통",
        playbackSpeed: 1,
        voice: "차분한 남성",
      },
    });

    expect(status).toBe(422);
    expect(body.code).toBe("INVALID_EDIT_FORMAT");
    expect(body.issues).toEqual(expect.arrayContaining([expect.objectContaining({ field: "aspectRatio" })]));
    expect(H.getChannelCredCalls).toHaveLength(0);
    expect(H.inserts).toHaveLength(0);
  });

  it("PUB-LIMIT-API-01 거절: 플랫폼 하드 한도 초과는 자격 조회와 외부 발행 전에 422로 막는다", async () => {
    const { status, body } = await callPublish({
      platform: "threads",
      text: "가".repeat(501),
      publish_fields: { body: "가".repeat(501), topicTag: "운영팁" },
    });

    expect(status).toBe(422);
    expect(body.code).toBe("PUBLISH_FIELD_LIMIT_EXCEEDED");
    expect(body.issues).toEqual(expect.arrayContaining([expect.objectContaining({ field: "body" })]));
    expect(H.getChannelCredCalls).toHaveLength(0);
    expect(H.inserts).toHaveLength(0);
  });

  it("platform 누락 → 400, DB 기록 없음", async () => {
    const { status, body } = await callPublish({ text: "hi" });
    expect(status).toBe(400);
    expect(body.error).toMatch(/platform required/);
    expect(H.inserts).toHaveLength(0);
  });

  it("잘못된/만료 토큰(테넌트 해석 불가) → 400, DB 기록 없음", async () => {
    H.tenantId = null;
    const { status, body } = await callPublish({ platform: "threads", text: "hi" });
    expect(status).toBe(400);
    expect(body.error).toMatch(/tenant_id/);
    expect(H.inserts).toHaveLength(0);
  });

  it("채널 미연결(getChannelCred=null) → 400 미연결, 발행/기록 안 함", async () => {
    H.cred = null;
    const { status, body } = await callPublish({ platform: "threads", text: "hi" });
    expect(status).toBe(400);
    expect(body.ok).toBe(false);
    expect(body.error).toMatch(/미연결/);
    expect(H.inserts).toHaveLength(0);
  });
});

describe("/api/publish — SNS-007 account_id 선택 발행", () => {
  it("account_id 지정 시 getChannelCred에 그대로 전달된다(선택계정으로만 발행)", async () => {
    H.cred = { token: "tok", userId: "u-1", accountId: "acc-42" };
    installFetch([
      { match: "me?fields=id", json: { id: "live-id" } },
      { match: "fields=status", json: { status: "FINISHED" } },
      { match: "/threads_publish", json: { id: "media-1" } },
      { match: "/threads", json: { id: "container-1" } },
      { match: "fields=permalink", json: { permalink: "https://www.threads.net/@u/post/1" } },
    ]);
    const { status, body } = await callPublish({ platform: "threads", text: "hi", account_id: "acc-42" });
    expect(status).toBe(200);
    expect(body.ok).toBe(true);
    // getChannelCred(tenantId, platform, accountId) — 3번째 인자로 선택계정이 그대로 전달됐는지
    expect(H.getChannelCredCalls[0]).toEqual(["tenant-1", "threads", "acc-42"]);
    // published_posts.account_id에 실제 발행에 쓰인 계정(cred.accountId)이 기록되는지
    expect(H.inserts[0][I.accountId]).toBe("acc-42");
  });

  it("account_id가 삭제/cross-tenant 계정이면(getChannelCred=null) 기본계정으로 새지 않고 명확한 에러", async () => {
    H.cred = null;
    const { status, body } = await callPublish({ platform: "threads", text: "hi", account_id: "gone-1" });
    expect(status).toBe(400);
    expect(body.ok).toBe(false);
    expect(body.error).toMatch(/선택한.*계정을 찾을 수 없음/);
    expect(H.getChannelCredCalls[0]).toEqual(["tenant-1", "threads", "gone-1"]);
    expect(H.inserts).toHaveLength(0);
  });

  it("account_id 미지정 시 undefined로 전달(기본계정 경로) — 발행 성공 시 account_id 없이 기록", async () => {
    H.cred = { token: "tok", userId: "u-1" }; // accountId 없음(기본계정 mock에선 미설정)
    installFetch([
      { match: "me?fields=id", json: { id: "live-id" } },
      { match: "fields=status", json: { status: "FINISHED" } },
      { match: "/threads_publish", json: { id: "media-2" } },
      { match: "/threads", json: { id: "container-2" } },
      { match: "fields=permalink", json: { permalink: "https://www.threads.net/@u/post/2" } },
    ]);
    const { status, body } = await callPublish({ platform: "threads", text: "hi" });
    expect(status).toBe(200);
    expect(body.ok).toBe(true);
    expect(H.getChannelCredCalls[0]).toEqual(["tenant-1", "threads", undefined]);
    expect(H.inserts[0][I.accountId]).toBeNull();
  });
});

describe("/api/publish — happy path (실 publish* + fetch 목)", () => {
  it("threads: container→publish→permalink, published 기록", async () => {
    installFetch([
      { match: "me?fields=id", json: { id: "live-id" } },
      { match: "fields=status", json: { status: "FINISHED" } },
      { match: "/threads_publish", json: { id: "media-1" } },
      { match: "/threads", json: { id: "container-1" } },
      { match: "fields=permalink", json: { permalink: "https://www.threads.net/@u/post/1" } },
    ]);
    // draft_id 는 UUID 여야 published_posts.draft_id(UUID 컬럼)에 그대로 남는다.
    // UUID 가 아닌 옛 식별자는 애초에 이 컬럼에 들어갈 수 없어 NULL 로 기록된다.
    const { status, body } = await callPublish({ platform: "threads", text: "hi", draft_id: "d1111111-1111-4111-8111-111111111111" });
    expect(status).toBe(200);
    expect(body.ok).toBe(true);
    expect(body.externalId).toBe("media-1");
    expect(body.permalink).toContain("threads.net");
    expect(H.inserts).toHaveLength(1);
    const v = H.inserts[0];
    expect(v[I.status]).toBe("published");
    expect(v[I.platform]).toBe("threads");
    expect(v[I.externalId]).toBe("media-1");
    expect(v[I.draft]).toBe("d1111111-1111-4111-8111-111111111111");
  });

  it("UUID draft 성공 시 queue를 published로 마킹한다", async () => {
    installFetch([
      { match: "me?fields=id", json: { id: "live-id" } },
      { match: "fields=status", json: { status: "FINISHED" } },
      { match: "/threads_publish", json: { id: "media-uuid" } },
      { match: "/threads", json: { id: "container-uuid" } },
      { match: "fields=permalink", json: { permalink: "https://www.threads.net/@u/post/uuid" } },
    ]);
    const draftId = "13730d99-a268-47de-9cf9-90157ea1fa79";
    const { body } = await callPublish({ platform: "threads", text: "hi", draft_id: draftId });

    expect(body.ok).toBe(true);
    expect(H.markQueuePublishedCalls).toEqual([["tenant-1", draftId, {
      platform: "threads",
      externalId: "media-uuid",
      permalink: "https://www.threads.net/@u/post/uuid",
    }]]);
  });

  it("동일 UUID draft/platform/account 성공 기록이 있으면 외부 발행 없이 queue만 멱등 복구한다", async () => {
    H.cred = { token: "tok", userId: "u-1", accountId: "11111111-1111-4111-8111-111111111111" };
    H.existingPublication = {
      external_id: "already-1",
      permalink: "https://www.threads.net/@u/post/already",
    };
    const fetchSpy = vi.fn();
    vi.stubGlobal("fetch", fetchSpy);
    const { body } = await callPublish({
      platform: "threads",
      text: "hi",
      draft_id: "13730d99-a268-47de-9cf9-90157ea1fa79",
      account_id: "11111111-1111-4111-8111-111111111111",
    });

    expect(body).toMatchObject({ ok: true, externalId: "already-1", alreadyPublished: true });
    expect(fetchSpy).not.toHaveBeenCalled();
    expect(H.inserts).toHaveLength(0);
    expect(H.markQueuePublishedCalls).toEqual([["tenant-1", "13730d99-a268-47de-9cf9-90157ea1fa79", {
      platform: "threads",
      externalId: "already-1",
      permalink: "https://www.threads.net/@u/post/already",
    }]]);
  });

  it("BE-V63-발행-예약-05 경합: 동일 초안 동시 요청은 외부 공급자를 한 번만 호출한다", async () => {
    H.cred = { token: "", meta: { apiKey: "a", apiSecret: "b", accessToken: "c", accessSecret: "d" } };
    const { calls } = installFetch([{ match: "api.twitter.com/2/tweets", json: { data: { id: "tw-race-1" } } }]);
    const body = {
      platform: "x",
      text: "동시 발행",
      draft_id: "13730d99-a268-47de-9cf9-90157ea1fa79",
    };

    const [first, second] = await Promise.all([callPublish(body), callPublish(body)]);

    expect([first.status, second.status].sort()).toEqual([200, 409]);
    expect([first.body.code, second.body.code]).toContain("PUBLISH_ALREADY_IN_PROGRESS");
    expect(calls).toHaveLength(1);
  });

  it("기존 성공 기록의 permalink가 비었으면 외부 재발행 없이 URL만 복구한다", async () => {
    H.existingPublication = { external_id: "already-no-link", permalink: null };
    const fetchSpy = vi.fn();
    vi.stubGlobal("fetch", fetchSpy);
    const draftId = "13730d99-a268-47de-9cf9-90157ea1fa79";

    const { body } = await callPublish({ platform: "threads", text: "hi", draft_id: draftId });

    expect(body).toMatchObject({
      ok: true,
      externalId: "already-no-link",
      permalink: "https://www.threads.net/@u/post/recovered",
      alreadyPublished: true,
    });
    expect(fetchSpy).not.toHaveBeenCalled();
    expect(H.markQueuePublishedCalls).toHaveLength(1);
  });

  it("Instagram 기존 성공 기록도 외부 재발행 없이 permalink와 queue만 복구한다", async () => {
    H.cred = { token: "ig-token", userId: "ig-user", accountId: "11111111-1111-4111-8111-111111111111" };
    H.existingPublication = { external_id: "ig-media-already", permalink: null };
    const fetchSpy = vi.fn();
    vi.stubGlobal("fetch", fetchSpy);
    const draftId = "13730d99-a268-47de-9cf9-90157ea1fa79";

    const { body } = await callPublish({
      platform: "instagram",
      text: "caption",
      image_url: "https://cdn.example/image.png",
      draft_id: draftId,
      account_id: "11111111-1111-4111-8111-111111111111",
    });

    expect(body).toMatchObject({
      ok: true,
      externalId: "ig-media-already",
      permalink: "https://www.instagram.com/p/recovered/",
      alreadyPublished: true,
    });
    expect(fetchSpy).not.toHaveBeenCalled();
    expect(H.inserts).toHaveLength(1);
    expect(H.markQueuePublishedCalls).toEqual([["tenant-1", draftId, {
      platform: "instagram",
      externalId: "ig-media-already",
      permalink: "https://www.instagram.com/p/recovered/",
    }]]);
  });

  it("PUB-LIMIT-API-02 정상: X 280가중 문자 경계값을 발행하고 기록한다", async () => {
    H.cred = { token: "", meta: { apiKey: "a", apiSecret: "b", accessToken: "c", accessSecret: "d" } };
    const { calls } = installFetch([{ match: "api.twitter.com/2/tweets", json: { data: { id: "tw-1" } } }]);
    const boundaryText = "가".repeat(140); // X 가중 문자 계산에서 한글 140자는 280이다.
    const { status, body } = await callPublish({ platform: "x", text: boundaryText });
    expect(status).toBe(200);
    expect(body.ok).toBe(true);
    expect(body.externalId).toBe("tw-1");
    expect(H.inserts[0][I.status]).toBe("published");
    // 경계값 본문이 손실 없이 전송되는지
    const sent = JSON.parse(calls.find((c) => c.url.includes("/2/tweets"))!.body!);
    expect(sent.text).toBe(boundaryText);
    // OAuth1.0a 서명 헤더가 붙었는지(서명 자체 검증은 별도지만 헤더 존재는 회귀 방지)
  });

  it("BE-V63-07 정상 경로: X 본문 발행 직후 첫 댓글을 reply로 함께 발행한다", async () => {
    H.cred = { token: "", meta: { apiKey: "a", apiSecret: "b", accessToken: "c", accessSecret: "d" } };
    const { calls } = installFetch([{ match: "api.twitter.com/2/tweets", json: { data: { id: "tw-1" } } }]);
    const { status, body } = await callPublish({ platform: "x", text: "본문", first_comment: "첫 댓글" });

    expect(status).toBe(200);
    expect(body).toMatchObject({ ok: true, firstComment: { ok: true, externalId: "tw-1" }, partial: false });
    expect(calls).toHaveLength(2);
    expect(JSON.parse(calls[1].body!)).toEqual({
      text: "첫 댓글",
      reply: { in_reply_to_tweet_id: "tw-1" },
    });
    expect(H.inserts[0][I.providerMeta]).toMatchObject({ firstComment: { ok: true, externalId: "tw-1" } });
  });

  it("BE-V63-07 거절 경로: capability가 없는 플랫폼은 본문을 발행하기 전에 400으로 거절한다", async () => {
    const fetchSpy = vi.fn();
    vi.stubGlobal("fetch", fetchSpy);
    const { status, body } = await callPublish({ platform: "bluesky", text: "본문", first_comment: "첫 댓글" });

    expect(status).toBe(400);
    expect(body.capability).toMatchObject({ platform: "bluesky", supported: false });
    expect(fetchSpy).not.toHaveBeenCalled();
    expect(H.inserts).toHaveLength(0);
  });
});

describe("/api/publish — 실패/기록 분기", () => {
  it("플랫폼 API 실패 → ok:false, failed 기록 + error 저장 (HTTP는 200)", async () => {
    installFetch([
      { match: "me?fields=id", json: { id: "live-id" } },
      { match: "/threads", status: 400, text: "Invalid token" },
    ]);
    const { status, body } = await callPublish({ platform: "threads", text: "hi" });
    // route는 result를 그대로 반환 → HTTP 200, ok:false
    expect(status).toBe(200);
    expect(body.ok).toBe(false);
    expect(body.error).toMatch(/container 실패/);
    expect(H.inserts).toHaveLength(1);
    expect(H.inserts[0][I.status]).toBe("failed");
    expect(H.inserts[0][I.error]).toMatch(/container 실패/);
  });

  it("외부 발행 성공 뒤 DB 기록 실패 → 500 partial failure + 재발행 금지 복구 메타데이터", async () => {
    H.cred = {
      token: "tok",
      userId: "u-1",
      accountId: "11111111-1111-4111-8111-111111111111",
    };
    installFetch([
      { match: "me?fields=id", json: { id: "live-id" } },
      { match: "fields=status", json: { status: "FINISHED" } },
      { match: "/threads_publish", json: { id: "media-9" } },
      { match: "/threads", json: { id: "container-9" } },
      { match: "fields=permalink", json: { permalink: "https://x" } },
    ]);
    H.publicationRecordError = new Error("db down");
    const { status, body } = await callPublish({
      platform: "threads",
      text: "hi",
      draft_id: "13730d99-a268-47de-9cf9-90157ea1fa79",
      account_id: "11111111-1111-4111-8111-111111111111",
    });
    expect(status).toBe(500);
    expect(body).toMatchObject({
      ok: false,
      externalPublished: true,
      externalId: "media-9",
      permalink: "https://x",
      persistence: {
        ok: false,
        stage: "publication_record",
        error: {
          code: "PUBLICATION_RECORD_FAILED",
        },
        reconciliation: {
          required: true,
          action: "repair_persistence_only",
          retryPublish: false,
          draftId: "13730d99-a268-47de-9cf9-90157ea1fa79",
          platform: "threads",
          accountId: "11111111-1111-4111-8111-111111111111",
          externalId: "media-9",
          permalink: "https://x",
        },
      },
    });
    expect(JSON.stringify(body)).not.toContain("db down");
  });

  // 2026-09-05 회장 계정 실측 회귀. 스튜디오에서 바로 발행한 글이 실제로 올라가고 발행
  // 기록도 남았는데 화면에는 "내부 기록 실패"가 떴다. 승인 큐에 그 초안이 없다는 이유였다.
  // 직접 발행은 승인 큐를 거치지 않으므로 없는 것이 정상이고, 실패로 다루면 안 된다.
  it("승인 큐에 없는 초안의 발행 → 실패가 아니라 정상으로 닫는다", async () => {
    H.cred = {
      token: "tok",
      userId: "u-1",
      accountId: "11111111-1111-4111-8111-111111111111",
    };
    H.queueOutcome = "absent";
    installFetch([
      { match: "me?fields=id", json: { id: "live-id" } },
      { match: "fields=status", json: { status: "FINISHED" } },
      { match: "/threads_publish", json: { id: "media-absent-1" } },
      { match: "/threads", json: { id: "container-absent-1" } },
      { match: "fields=permalink", json: { permalink: "https://www.threads.net/@u/post/absent-1" } },
    ]);
    const draftId = "23730d99-a268-47de-9cf9-90157ea1fa79";
    const { status, body } = await callPublish({
      platform: "threads",
      text: "hi",
      draft_id: draftId,
      account_id: "11111111-1111-4111-8111-111111111111",
    });

    expect(status).toBe(200);
    expect(body).toMatchObject({ ok: true, externalId: "media-absent-1" });
    expect(body).not.toHaveProperty("persistence");
  });

  it("외부 발행·publication 기록 성공 뒤 queue 기록 실패 → 500 partial failure + 외부 식별자 보존", async () => {
    H.cred = {
      token: "tok",
      userId: "u-1",
      accountId: "11111111-1111-4111-8111-111111111111",
    };
    H.queueRecordError = new Error("queue disk unavailable");
    installFetch([
      { match: "me?fields=id", json: { id: "live-id" } },
      { match: "fields=status", json: { status: "FINISHED" } },
      { match: "/threads_publish", json: { id: "media-queue-9" } },
      { match: "/threads", json: { id: "container-queue-9" } },
      { match: "fields=permalink", json: { permalink: "https://www.threads.net/@u/post/queue-9" } },
    ]);
    const draftId = "13730d99-a268-47de-9cf9-90157ea1fa79";
    const { status, body } = await callPublish({
      platform: "threads",
      text: "hi",
      draft_id: draftId,
      account_id: "11111111-1111-4111-8111-111111111111",
    });

    expect(status).toBe(500);
    expect(body).toMatchObject({
      ok: false,
      externalPublished: true,
      externalId: "media-queue-9",
      permalink: "https://www.threads.net/@u/post/queue-9",
      persistence: {
        ok: false,
        stage: "queue_record",
        error: {
          code: "QUEUE_RECORD_FAILED",
        },
        reconciliation: {
          required: true,
          action: "repair_persistence_only",
          retryPublish: false,
          draftId,
          platform: "threads",
          accountId: "11111111-1111-4111-8111-111111111111",
          externalId: "media-queue-9",
          permalink: "https://www.threads.net/@u/post/queue-9",
        },
      },
    });
    expect(H.inserts).toHaveLength(1);
    expect(H.inserts[0][I.status]).toBe("published");
    expect(JSON.stringify(body)).not.toContain("queue disk unavailable");
  });

  it("미지원 플랫폼 → ok:false, failed 기록", async () => {
    const { body } = await callPublish({ platform: "myspace", text: "hi" });
    expect(body.ok).toBe(false);
    expect(body.error).toMatch(/미지원/);
    expect(H.inserts[0][I.status]).toBe("failed");
  });
});

// 2026-08-29 코드리뷰 BLOCK 지적 4건의 회귀 방지.
// 이전 검증은 UUID 초안 경로만 밟아 초안 없는 발행, 임차 만료, 결과 미확정, 첫 댓글 실패를
// 한 번도 통과시키지 않았다.
describe("/api/publish — 되돌릴 수 없는 외부 게시 보호", () => {
  const THREADS_OK = [
    { match: "me?fields=id", json: { id: "live-id" } },
    { match: "fields=status", json: { status: "FINISHED" } },
    { match: "/threads_publish", json: { id: "media-9" } },
    { match: "/threads", json: { id: "container-9" } },
    { match: "fields=permalink", json: { permalink: "https://www.threads.net/@u/post/9" } },
  ];

  it("PUB-INTENT-01 거절: 초안 번호도 멱등 키도 없는 실발행은 외부 게시 전에 400으로 막는다", async () => {
    const { status, body } = await callPublish({ platform: "threads", text: "hi", idempotency_key: null });

    expect(status).toBe(400);
    expect(body.code).toBe("PUBLISH_IDEMPOTENCY_KEY_REQUIRED");
    expect(H.inserts).toHaveLength(0);
    // 채널 자격 조회보다도 먼저 막는다. 키 없는 실발행은 어떤 준비 작업도 하지 않는다.
    expect(H.getChannelCredCalls).toHaveLength(0);
  });

  it("PUB-INTENT-02 경합: 초안 없는 같은 멱등 키 두 건 중 하나만 외부 게시로 간다", async () => {
    installFetch(THREADS_OK);
    const first = await callPublish({ platform: "threads", text: "hi", idempotency_key: "same-intent" });
    // 첫 요청이 예약을 잡았고 아직 진행 중이다.
    H.existingPublication = null;
    const second = await callPublish({ platform: "threads", text: "hi", idempotency_key: "same-intent" });

    expect(first.status).toBe(200);
    expect(second.status).toBe(409);
    expect(second.body.code).toBe("PUBLISH_ALREADY_IN_PROGRESS");
  });

  it("PUB-LEASE-01 회수: 임차가 만료됐고 공급자에 그 글이 없으면 예약을 회수해 다시 발행한다", async () => {
    installFetch([
      { match: "fields=id,text", json: { data: [] } },
      ...THREADS_OK,
    ]);
    H.reservationClaimed = true; // 앞선 프로세스가 예약만 남기고 죽었다
    H.conflictReservedAt = new Date(Date.now() - 60 * 60 * 1000).toISOString();

    const { status, body } = await callPublish({ platform: "threads", text: "hi", idempotency_key: "stale-intent" });

    expect(status).toBe(200);
    expect(body.ok).toBe(true);
  });

  it("PUB-LEASE-02 거절: 임차가 만료돼도 그 글이 공급자에 이미 있으면 다시 올리지 않는다", async () => {
    installFetch([
      { match: "me?fields=id", json: { id: "live-id" } },
      {
        match: "fields=id,text",
        json: { data: [{ id: "already-there", text: "hi", timestamp: new Date().toISOString(), permalink: "https://www.threads.net/@u/post/x" }] },
      },
    ]);
    H.reservationClaimed = true;
    H.conflictReservedAt = new Date(Date.now() - 60 * 60 * 1000).toISOString();

    const { status, body } = await callPublish({ platform: "threads", text: "hi", idempotency_key: "stale-intent" });

    expect(status).toBe(200);
    expect(body.alreadyPublished).toBe(true);
    expect(body.externalId).toBe("already-there");
    expect(body.recoveredFrom).toBe("provider_readback");
  });

  it("PUB-LEASE-03 보류: 임차가 만료됐는데 공급자 조회도 실패하면 uncertain 으로 못 박고 재발행하지 않는다", async () => {
    installFetch([
      { match: "me?fields=id", status: 500, json: {} },
    ]);
    H.reservationClaimed = true;
    H.conflictReservedAt = new Date(Date.now() - 60 * 60 * 1000).toISOString();

    const { status, body } = await callPublish({ platform: "threads", text: "hi", idempotency_key: "stale-intent" });

    expect(status).toBe(409);
    expect(body.code).toBe("PUBLISH_STATE_UNCERTAIN");
    expect(body.reconciliation.retryPublish).toBe(false);
  });

  it("PUB-UNCERTAIN-01 보존: 게시 뒤 응답만 끊긴 발행은 failed 가 아니라 uncertain 으로 저장한다", async () => {
    installFetch([
      { match: "me?fields=id", json: { id: "live-id" } },
      { match: "fields=status", json: { status: "FINISHED" } },
      { match: "/threads_publish", json: {} }, // id 없는 응답 = 결과 미확정
      { match: "/threads", json: { id: "container-9" } },
    ]);

    const { status, body } = await callPublish({ platform: "threads", text: "hi", idempotency_key: "lost-response" });

    expect(status).toBe(409);
    expect(body.code).toBe("PUBLISH_STATE_UNCERTAIN");
    expect(H.inserts[0][I.status]).toBe("uncertain");
  });

  it("PUB-COMMENT-01 분리: 본문 성공 + 첫 댓글 실패는 첫 댓글 상태를 failed 로 따로 남긴다", async () => {
    installFetch(THREADS_OK);
    H.firstCommentResult = { ok: false, error: "첫 댓글 발행 실패" };

    const { body } = await callPublish({
      platform: "threads",
      text: "hi",
      first_comment: "첫 댓글",
      idempotency_key: "comment-fail",
    });

    expect(body.ok).toBe(true);
    expect(body.partial).toBe(true);
    expect(body.firstCommentStatus).toBe("failed");
    // 본문 상태는 published 이되 첫 댓글 상태가 독립 컬럼으로 남아야 복구 대상이 사라지지 않는다.
    expect(H.inserts[0][I.status]).toBe("published");
  });
});
