import { describe, it, expect, afterEach, vi } from "vitest";
import { installFetch } from "./helpers/mock-fetch";
import {
  publishBluesky, publishTelegram, publishDiscord, publishSlack,
  isSafePublicImageUrl, isAllowedServerFetchImageHost, truncateChars, truncateGraphemes,
} from "@/lib/publish";

// Slack cred는 이번 출시 계약대로 meta.api==="slack_webhook"이 있어야 발행 허용(publish.ts).
// happy-path 테스트들의 공통 cred — OAuth 방식 충돌 테스트는 이 필드를 일부러 뺀다.
const slackWebhookCred = (token: string) => ({ token, meta: { api: "slack_webhook" } });

// ── credential/webhook 방식 4채널 발행 함수 계약 테스트 (2026-07) ────────────────
// 대상: publishBluesky/publishTelegram/publishDiscord/publishSlack (lib/publish.ts).
// 이 4채널은 OAuth 앱 등록이 필요 없다(handle+app password / bot token / webhook URL 직접 입력) —
// 그래서 credential-only 분기(자격증명 누락)와 실 API happy/실패 분기까지 fetch mock만으로
// 자기완결 검증 가능하다. 실발행(실 토큰) 라이브 검증은 이번 범위 밖(자격증명 없음).
//
// 각 채널 공통으로 확인하는 3가지 셀프심문:
//  1) 자격증명이 meta에만 있고 token(secret)이 없을 때 → 명확한 에러(크래시 아님)
//  2) 이미지가 있을 때 채널 관례대로 처리(Bluesky=blob 업로드/Telegram=sendPhoto/Discord=embed/Slack=image block)
//  3) API가 2xx 아닌 에러 코드를 반환할 때 → ok:false + 상태코드 포함 에러 메시지

afterEach(() => {
  // installFetch가 vi.stubGlobal("fetch", ...)로 전역을 바꾸므로 테스트 간 누수 방지.
  vi.unstubAllGlobals();
  // isAllowedServerFetchImageHost가 읽는 OSMU_PUBLIC_URL/OSMU_PUBLISH_IMAGE_HOSTS 누수 방지.
  vi.unstubAllEnvs();
});

// 기존(2026-07) Bluesky 이미지 첨부 테스트들은 서버-fetch allowlist가 신설되기 전에 작성돼
// cdn.example.com을 임의 공개 URL로 취급했다. allowlist 신설 후에도 그 시나리오(정당하게
// 허용된 CDN 호스트에서 이미지 첨부)를 그대로 검증하려면 그 호스트를 명시적으로 허용해야 한다.
const allowCdnExampleHost = () => vi.stubEnv("OSMU_PUBLISH_IMAGE_HOSTS", "cdn.example.com");

describe("publishBluesky — AT Protocol (createSession → createRecord)", () => {
  it("happy path: 세션 생성 → 게시 → permalink 조립", async () => {
    installFetch([
      {
        match: "com.atproto.server.createSession",
        json: { accessJwt: "jwt-1", did: "did:plc:abc123" },
      },
      {
        match: "com.atproto.repo.createRecord",
        json: { uri: "at://did:plc:abc123/app.bsky.feed.post/rkey1" },
      },
    ]);
    const result = await publishBluesky({ token: "app-pw", meta: { handle: "user.bsky.social" } }, "hello bluesky");
    expect(result.ok).toBe(true);
    expect(result.externalId).toBe("at://did:plc:abc123/app.bsky.feed.post/rkey1");
    expect(result.permalink).toBe("https://bsky.app/profile/user.bsky.social/post/rkey1");
  });

  it("이미지 첨부: uploadBlob 경유 후 createRecord에 embed 포함", async () => {
    allowCdnExampleHost();
    const { calls } = installFetch([
      { match: "com.atproto.server.createSession", json: { accessJwt: "jwt-1", did: "did:plc:abc" } },
      {
        match: "com.atproto.repo.uploadBlob",
        json: { blob: { $type: "blob", ref: "cid-1" } },
        headers: { "content-type": "image/jpeg" },
      },
      { match: "com.atproto.repo.createRecord", json: { uri: "at://did:plc:abc/app.bsky.feed.post/rkey2" } },
      { match: "https://cdn.example.com/img.jpg", headers: { "content-type": "image/jpeg" } },
    ]);
    const result = await publishBluesky(
      { token: "app-pw", meta: { handle: "user.bsky.social" } },
      "with image",
      "https://cdn.example.com/img.jpg",
    );
    expect(result.ok).toBe(true);
    const createRecordCall = calls.find((c) => c.url.includes("createRecord"))!;
    const sentRecord = JSON.parse(createRecordCall.body!).record;
    expect(sentRecord.embed).toBeDefined();
    expect(sentRecord.embed.$type).toBe("app.bsky.embed.images");
  });

  it("handle(meta) 없음 → 명확한 에러, 네트워크 호출 없음", async () => {
    const { calls } = installFetch([]);
    const result = await publishBluesky({ token: "app-pw", meta: {} }, "hi");
    expect(result.ok).toBe(false);
    expect(result.error).toMatch(/handle/);
    expect(calls).toHaveLength(0);
  });

  it("appPassword(token) 없음 → 명확한 에러", async () => {
    const result = await publishBluesky({ token: "", meta: { handle: "user.bsky.social" } }, "hi");
    expect(result.ok).toBe(false);
    expect(result.error).toMatch(/App Password/);
  });

  it("createSession 실패(잘못된 비밀번호) → ok:false + 상태코드", async () => {
    installFetch([{ match: "createSession", status: 401, text: "Invalid identifier or password" }]);
    const result = await publishBluesky({ token: "wrong-pw", meta: { handle: "user.bsky.social" } }, "hi");
    expect(result.ok).toBe(false);
    expect(result.error).toMatch(/세션 실패\(401\)/);
  });

  // SSRF 가드: 서버가 직접 fetch하는 유일 경로라 사설/메타데이터 주소는 이미지 fetch를 스킵하고
  // 텍스트만 발행한다(발행 자체는 성공, imageUrl로 내부망을 긁지 못함).
  it("사설/메타데이터 image_url → 이미지 fetch 스킵, 텍스트만 발행(내부망 SSRF 차단)", async () => {
    const { calls } = installFetch([
      { match: "com.atproto.server.createSession", json: { accessJwt: "jwt-1", did: "did:plc:abc" } },
      { match: "com.atproto.repo.createRecord", json: { uri: "at://did:plc:abc/app.bsky.feed.post/rkey3" } },
    ]);
    const result = await publishBluesky(
      { token: "app-pw", meta: { handle: "user.bsky.social" } },
      "text only",
      "http://169.254.169.254/latest/meta-data/", // 클라우드 메타데이터 — 차단 대상
    );
    expect(result.ok).toBe(true); // 텍스트 발행은 성공
    expect(calls.some((c) => c.url.includes("169.254.169.254"))).toBe(false); // 서버가 내부주소를 fetch하지 않음
    expect(calls.some((c) => c.url.includes("uploadBlob"))).toBe(false); // blob 업로드도 없음
    const createRecordCall = calls.find((c) => c.url.includes("createRecord"))!;
    expect(JSON.parse(createRecordCall.body!).record.embed).toBeUndefined(); // 이미지 embed 없음
  });
});

// ── 공식 한도 절단 (2차 감사 — 2026-07 공식문서 실조사) ──────────────────────────
// Bluesky lexicon: text maxGraphemes=300·maxLength(UTF-8)=3000, 이미지 개당 1,000,000바이트.
// Telegram: sendMessage text 4096 / sendPhoto caption 1024. Discord: content 2000. Slack: section 3000.
const FAM = "\u{1F469}\u200D\u{1F469}\u200D\u{1F467}\u200D\u{1F466}"; // 가족 ZWJ 이모지 = 1자소, 11 UTF-16 유닛, 25 UTF-8바이트

describe("publishBluesky — 공식 한도(300자소/3000바이트/이미지 1MB) 강제", () => {
  const routes = () => [
    { match: "com.atproto.server.createSession", json: { accessJwt: "jwt", did: "did:plc:abc" } },
    { match: "com.atproto.repo.createRecord", json: { uri: "at://did:plc:abc/app.bsky.feed.post/rk" } },
  ];
  const cred = { token: "app-pw", meta: { handle: "user.bsky.social" } };

  it("300자소 초과 텍스트 → createRecord 본문이 정확히 300자소로 절단", async () => {
    const { calls } = installFetch(routes());
    const result = await publishBluesky(cred, "a".repeat(350));
    expect(result.ok).toBe(true);
    const sent = JSON.parse(calls.find((c) => c.url.includes("createRecord"))!.body!).record;
    expect(sent.text).toBe("a".repeat(300));
  });

  it("ZWJ 이모지(다코드포인트 자소)는 경계에서 통째로 유지 — 절단이 자소를 쪼개지 않음", async () => {
    const { calls } = installFetch(routes());
    await publishBluesky(cred, "a".repeat(299) + FAM + "b".repeat(10)); // 300번째 자소 = FAM
    const sent = JSON.parse(calls.find((c) => c.url.includes("createRecord"))!.body!).record;
    expect(sent.text).toBe("a".repeat(299) + FAM);
  });

  it("3000 UTF-8바이트 한도 — 대형 이모지 연속이면 자소 300개보다 바이트가 먼저 걸림", async () => {
    const { calls } = installFetch(routes());
    await publishBluesky(cred, FAM.repeat(300)); // 300자소지만 7500바이트
    const sent = JSON.parse(calls.find((c) => c.url.includes("createRecord"))!.body!).record;
    expect(sent.text).toBe(FAM.repeat(120)); // 120 × 25바이트 = 정확히 3000
    expect(new TextEncoder().encode(sent.text).length).toBe(3000);
  });

  it("1MB(1,000,000바이트) 초과 이미지(Content-Length 없음, 단일 청크) → 스트리밍 중 초과 감지, uploadBlob 스킵", async () => {
    allowCdnExampleHost();
    const { calls } = installFetch([
      ...routes(),
      { match: "cdn.example.com/big.jpg", headers: { "content-type": "image/jpeg" }, arrayBuffer: new ArrayBuffer(1_000_001) },
    ]);
    const result = await publishBluesky(cred, "big image", "https://cdn.example.com/big.jpg");
    expect(result.ok).toBe(true);
    expect(calls.some((c) => c.url.includes("uploadBlob"))).toBe(false);
    expect(JSON.parse(calls.find((c) => c.url.includes("createRecord"))!.body!).record.embed).toBeUndefined();
  });

  it("image/* 아닌 content-type(HTML 등) → 업로드 스킵(비이미지 응답을 blob으로 올리지 않음)", async () => {
    allowCdnExampleHost();
    const { calls } = installFetch([
      ...routes(),
      { match: "cdn.example.com/page", headers: { "content-type": "text/html" }, text: "<html/>" },
    ]);
    const result = await publishBluesky(cred, "not an image", "https://cdn.example.com/page");
    expect(result.ok).toBe(true);
    expect(calls.some((c) => c.url.includes("uploadBlob"))).toBe(false);
  });

  it("이미지 fetch는 redirect:manual + 타임아웃 signal — 내부망 302 우회·행 방지", async () => {
    allowCdnExampleHost();
    const { calls } = installFetch([
      ...routes(),
      { match: "cdn.example.com/img.jpg", headers: { "content-type": "image/jpeg" } },
    ]);
    await publishBluesky(cred, "img", "https://cdn.example.com/img.jpg");
    const imgCall = calls.find((c) => c.url === "https://cdn.example.com/img.jpg")!;
    expect(imgCall.redirect).toBe("manual");
    expect(imgCall.hasSignal).toBe(true);
    expect(calls.find((c) => c.url.includes("createSession"))!.hasSignal).toBe(true);
  });

  // ── Content-Length 선차단 + 스트리밍 조기 cancel(메모리 DoS 방지, 2026-07 하드닝) ──────────
  it("Content-Length가 1,000,000 초과로 선언되면 body를 읽지 않고 즉시 스킵(reader 자체를 만들지 않음)", async () => {
    allowCdnExampleHost();
    const { calls } = installFetch([
      ...routes(),
      {
        match: "cdn.example.com/declared-big.jpg",
        headers: { "content-type": "image/jpeg", "content-length": "5000000" },
        // bodyChunks를 일부러 주지 않음 — Content-Length 선차단이 정말 "읽지 않고" 스킵하는지
        // 검증하려는 것이라 스트림이 실제로 소비돼도(빈 스트림) 결과는 동일해야 함.
      },
    ]);
    const result = await publishBluesky(cred, "declared big", "https://cdn.example.com/declared-big.jpg");
    expect(result.ok).toBe(true);
    expect(calls.some((c) => c.url.includes("uploadBlob"))).toBe(false);
    expect(JSON.parse(calls.find((c) => c.url.includes("createRecord"))!.body!).record.embed).toBeUndefined();
  });

  it("Content-Length 없이 청크 스트리밍 — 누적이 1,000,000 초과하는 즉시 reader.cancel() 후 스킵", async () => {
    allowCdnExampleHost();
    // 600,000바이트씩 2청크 = 1,200,000바이트(한도 초과) — 2번째 청크에서 넘는 순간 cancel.
    const chunk = new Uint8Array(600_000).fill(1);
    const { calls } = installFetch([
      ...routes(),
      { match: "cdn.example.com/chunked-big.jpg", headers: { "content-type": "image/jpeg" }, bodyChunks: [chunk, chunk] },
    ]);
    const result = await publishBluesky(cred, "chunked big", "https://cdn.example.com/chunked-big.jpg");
    expect(result.ok).toBe(true);
    expect(calls.some((c) => c.url.includes("uploadBlob"))).toBe(false);
    expect(JSON.parse(calls.find((c) => c.url.includes("createRecord"))!.body!).record.embed).toBeUndefined();
    const imgCall = calls.find((c) => c.url.includes("chunked-big.jpg"))!;
    expect(imgCall.bodyCancelled).toBe(true); // 전체를 다 읽지 않고 초과 시점에 조기 중단됐음을 관찰
  });

  it("정확히 1,000,000바이트(경계값)는 허용 — uploadBlob 호출됨", async () => {
    allowCdnExampleHost();
    const exact = new Uint8Array(1_000_000).fill(2);
    const { calls } = installFetch([
      ...routes(),
      { match: "cdn.example.com/exact.jpg", headers: { "content-type": "image/jpeg" }, bodyChunks: [exact] },
      {
        match: "com.atproto.repo.uploadBlob",
        json: { blob: { $type: "blob", ref: "cid-exact" } },
        headers: { "content-type": "image/jpeg" },
      },
    ]);
    const result = await publishBluesky(cred, "exact 1MB", "https://cdn.example.com/exact.jpg");
    expect(result.ok).toBe(true);
    expect(calls.some((c) => c.url.includes("uploadBlob"))).toBe(true);
    const createRecordCall = calls.find((c) => c.url.includes("createRecord"))!;
    expect(JSON.parse(createRecordCall.body!).record.embed).toBeDefined();
    const imgCall = calls.find((c) => c.url.includes("exact.jpg"))!;
    expect(imgCall.bodyCancelled).toBeFalsy();
  });
});

// ── SSRF 가드 2단계: server-fetch exact-host allowlist (2026-07 DNS rebinding 하드닝) ──────
describe("isAllowedServerFetchImageHost — server-fetch exact-host allowlist", () => {
  it("allowlist가 비어있으면(OSMU_PUBLIC_URL·OSMU_PUBLISH_IMAGE_HOSTS 둘 다 미설정) 공개 https URL도 거부", () => {
    expect(isAllowedServerFetchImageHost("https://cdn.example.com/img.jpg")).toBe(false);
  });

  it("OSMU_PUBLIC_URL의 hostname은 자동으로 허용된다", () => {
    vi.stubEnv("OSMU_PUBLIC_URL", "https://dashboard.example.com");
    expect(isAllowedServerFetchImageHost("https://dashboard.example.com/assets/img.jpg")).toBe(true);
    expect(isAllowedServerFetchImageHost("https://other.example.com/img.jpg")).toBe(false);
  });

  it("OSMU_PUBLISH_IMAGE_HOSTS 쉼표구분 exact hostname은 허용된다(공백 트림·대소문자 무시)", () => {
    vi.stubEnv("OSMU_PUBLISH_IMAGE_HOSTS", " cdn.example.com , Assets.Example.NET ");
    expect(isAllowedServerFetchImageHost("https://cdn.example.com/img.jpg")).toBe(true);
    expect(isAllowedServerFetchImageHost("https://assets.example.net/img.jpg")).toBe(true);
  });

  it("suffix/wildcard 매칭은 허용하지 않는다 — evil-cdn.example.com.attacker.tld 류 우회 차단", () => {
    vi.stubEnv("OSMU_PUBLISH_IMAGE_HOSTS", "cdn.example.com");
    expect(isAllowedServerFetchImageHost("https://cdn.example.com.attacker.tld/img.jpg")).toBe(false);
    expect(isAllowedServerFetchImageHost("https://evil-cdn.example.com/img.jpg")).toBe(false);
    expect(isAllowedServerFetchImageHost("https://sub.cdn.example.com/img.jpg")).toBe(false);
  });

  it("비표준 포트 명시는 거부(기본 443만 허용)", () => {
    vi.stubEnv("OSMU_PUBLISH_IMAGE_HOSTS", "cdn.example.com");
    expect(isAllowedServerFetchImageHost("https://cdn.example.com:8443/img.jpg")).toBe(false);
    // 기본 포트를 명시해도(:443) WHATWG URL이 정규화해 빈 포트가 되므로 허용.
    expect(isAllowedServerFetchImageHost("https://cdn.example.com:443/img.jpg")).toBe(true);
  });

  it("http(비-https) 스킴은 거부", () => {
    vi.stubEnv("OSMU_PUBLISH_IMAGE_HOSTS", "cdn.example.com");
    expect(isAllowedServerFetchImageHost("http://cdn.example.com/img.jpg")).toBe(false);
  });

  it("userinfo(사용자정보) 포함 URL은 거부 — https://user:pass@host 우회 차단", () => {
    vi.stubEnv("OSMU_PUBLISH_IMAGE_HOSTS", "cdn.example.com");
    expect(isAllowedServerFetchImageHost("https://user:pass@cdn.example.com/img.jpg")).toBe(false);
    expect(isAllowedServerFetchImageHost("https://user@cdn.example.com/img.jpg")).toBe(false);
  });

  it("깨진 URL은 거부(크래시 아님)", () => {
    vi.stubEnv("OSMU_PUBLISH_IMAGE_HOSTS", "cdn.example.com");
    expect(isAllowedServerFetchImageHost("not a url")).toBe(false);
  });
});

// allowlist에 없는 공개 호스트(unallowlisted) → publishBluesky가 이미지 fetch 자체를 하지 않음(no-fetch).
describe("publishBluesky — server-fetch allowlist 미포함 공개 호스트는 이미지 fetch 자체를 스킵", () => {
  const routes = () => [
    { match: "com.atproto.server.createSession", json: { accessJwt: "jwt", did: "did:plc:abc" } },
    { match: "com.atproto.repo.createRecord", json: { uri: "at://did:plc:abc/app.bsky.feed.post/rk" } },
  ];
  const cred = { token: "app-pw", meta: { handle: "user.bsky.social" } };

  it("공개 https이고 사설 IP도 아니지만 allowlist 미포함 → uploadBlob/이미지 fetch 없이 텍스트만 발행", async () => {
    // allowlist 관련 env 전부 미설정 상태(afterEach의 vi.unstubAllEnvs()로 이전 테스트 오염 없음 보장).
    const { calls } = installFetch(routes());
    const result = await publishBluesky(cred, "unallowlisted host", "https://not-on-allowlist.example.com/img.jpg");
    expect(result.ok).toBe(true);
    expect(calls.some((c) => c.url.includes("not-on-allowlist.example.com"))).toBe(false);
    expect(calls.some((c) => c.url.includes("uploadBlob"))).toBe(false);
    const createRecordCall = calls.find((c) => c.url.includes("createRecord"))!;
    expect(JSON.parse(createRecordCall.body!).record.embed).toBeUndefined();
  });
});

describe("공식 한도 절단 — Telegram/Discord/Slack", () => {
  it("Telegram sendMessage: 4096자 초과 텍스트 절단", async () => {
    const { calls } = installFetch([{ match: "/sendMessage", json: { ok: true, result: { message_id: 1 } } }]);
    await publishTelegram({ token: "bot-token", meta: { chatId: "1" } }, "x".repeat(5000));
    expect(JSON.parse(calls[0].body!).text).toBe("x".repeat(4096));
    expect(calls[0].hasSignal).toBe(true);
  });

  it("Telegram: 서로게이트 쌍(astral) 문자에서도 4096 유닛 이내 + 쌍 미분리", async () => {
    const { calls } = installFetch([{ match: "/sendMessage", json: { ok: true, result: { message_id: 1 } } }]);
    await publishTelegram({ token: "bot-token", meta: { chatId: "1" } }, "\u{1F600}".repeat(3000)); // 각 2유닛
    const sent = JSON.parse(calls[0].body!).text as string;
    expect(sent.length).toBe(4096); // 2048개 × 2유닛
    expect(sent.endsWith("\u{1F600}")).toBe(true); // 반쪽 서로게이트 없음
  });

  it("Telegram sendPhoto: caption 1024자 절단", async () => {
    const { calls } = installFetch([{ match: "/sendPhoto", json: { ok: true, result: { message_id: 2 } } }]);
    await publishTelegram({ token: "bot-token", meta: { chatId: "1" } }, "c".repeat(2000), "https://cdn.example.com/i.jpg");
    expect(JSON.parse(calls[0].body!).caption).toBe("c".repeat(1024));
  });

  it("Discord: content 2000자 절단", async () => {
    const { calls } = installFetch([{ match: "discord.com/api/webhooks", json: { id: "m" } }]);
    await publishDiscord({ token: "https://discord.com/api/webhooks/1/abc" }, "d".repeat(2500));
    expect(JSON.parse(calls[0].body!).content).toBe("d".repeat(2000));
    expect(calls[0].hasSignal).toBe(true);
  });

  it("Slack: section 블록 text 3000자 절단(top-level text는 원문 유지)", async () => {
    const { calls } = installFetch([{ match: "hooks.slack.com", text: "ok" }]);
    await publishSlack(slackWebhookCred("https://hooks.slack.com/services/T1/B1/x"), "s".repeat(3500), "https://cdn.example.com/i.jpg");
    const sent = JSON.parse(calls[0].body!);
    expect(sent.blocks[0].text.text).toBe("s".repeat(3000));
    expect(sent.text).toBe("s".repeat(3500));
    expect(calls[0].hasSignal).toBe(true);
  });
});

describe("truncateChars / truncateGraphemes — 절단 헬퍼 계약", () => {
  it("truncateChars: 한도 이내 원문 그대로, null/undefined 안전", () => {
    expect(truncateChars("hello", 10)).toBe("hello");
    expect(truncateChars("", 10)).toBe("");
    expect(truncateChars(undefined as unknown as string, 10)).toBe("");
  });
  it("truncateChars: 코드포인트·UTF-16 유닛 둘 다 max 이하(셈법 불명 대비 보수 절단)", () => {
    const out = truncateChars("\u{1F600}".repeat(10), 5); // 각 1코드포인트·2유닛
    expect(out).toBe("\u{1F600}".repeat(2)); // 3개면 6유닛 > 5 → 2개
  });
  it("truncateGraphemes: 자소·바이트 이중 한도", () => {
    expect(truncateGraphemes("한글텍스트", 300, 3000)).toBe("한글텍스트");
    expect(truncateGraphemes("abc", 2, 3000)).toBe("ab");
    expect(truncateGraphemes(FAM + FAM, 300, 30)).toBe(FAM); // 2번째 자소(25바이트)에서 바이트 한도
  });
});

describe("isSafePublicImageUrl — SSRF 가드", () => {
  it("공개 https URL은 허용", () => {
    expect(isSafePublicImageUrl("https://cdn.example.com/img.jpg")).toBe(true);
    expect(isSafePublicImageUrl("http://pub-abc.r2.dev/x.png")).toBe(true);
  });
  it("사설/루프백/링크로컬/메타데이터/localhost는 차단", () => {
    for (const bad of [
      "http://169.254.169.254/latest/meta-data/", // AWS/GCP 메타데이터
      "http://127.0.0.1:8080/", "http://localhost/x", "http://10.0.0.5/", "http://192.168.1.1/",
      "http://172.16.0.1/", "http://100.64.0.1/", "http://[::1]/", "http://0.0.0.0/",
    ]) {
      expect(isSafePublicImageUrl(bad)).toBe(false);
    }
  });
  it("http/https 아닌 스킴·깨진 URL은 차단", () => {
    expect(isSafePublicImageUrl("file:///etc/passwd")).toBe(false);
    expect(isSafePublicImageUrl("ftp://host/x")).toBe(false);
    expect(isSafePublicImageUrl("not a url")).toBe(false);
  });
});

describe("publishTelegram — Bot API (sendMessage / sendPhoto)", () => {
  it("happy path(텍스트만): sendMessage", async () => {
    const { calls } = installFetch([
      { match: "/sendMessage", json: { ok: true, result: { message_id: 42 } } },
    ]);
    const result = await publishTelegram({ token: "bot-token", meta: { chatId: "123456" } }, "hello telegram");
    expect(result.ok).toBe(true);
    expect(result.externalId).toBe("42");
    // URL 템플릿: `${TELEGRAM_API}/bot${token}/${method}` → token="bot-token"이면 경로가 "/botbot-token/..."
    expect(calls[0].url).toContain("/botbot-token/sendMessage");
  });

  it("이미지 있음 → sendPhoto(caption)", async () => {
    const { calls } = installFetch([
      { match: "/sendPhoto", json: { ok: true, result: { message_id: 43 } } },
    ]);
    const result = await publishTelegram(
      { token: "bot-token", meta: { chatId: "123456" } },
      "caption text",
      "https://cdn.example.com/img.jpg",
    );
    expect(result.ok).toBe(true);
    expect(calls[0].url).toContain("/sendPhoto");
    const sent = JSON.parse(calls[0].body!);
    expect(sent.photo).toBe("https://cdn.example.com/img.jpg");
    expect(sent.caption).toBe("caption text");
  });

  it("Bot Token(token) 없음 → 명확한 에러", async () => {
    const result = await publishTelegram({ token: "", meta: { chatId: "123456" } }, "hi");
    expect(result.ok).toBe(false);
    expect(result.error).toMatch(/Bot Token/);
  });

  it("Chat ID(meta) 없음 → 명확한 에러 — botToken만 있고 meta 미설정인 실제 시나리오", async () => {
    const result = await publishTelegram({ token: "bot-token", meta: {} }, "hi");
    expect(result.ok).toBe(false);
    expect(result.error).toMatch(/Chat ID/);
  });

  it("Telegram API가 ok:false 반환(예: 채팅 없음) → 명확한 에러", async () => {
    installFetch([{ match: "/sendMessage", json: { ok: false, description: "Bad Request: chat not found" } }]);
    const result = await publishTelegram({ token: "bot-token", meta: { chatId: "999" } }, "hi");
    expect(result.ok).toBe(false);
    expect(result.error).toMatch(/chat not found/);
  });
});

describe("publishDiscord — Incoming Webhook", () => {
  it("happy path: content 전송, ?wait=true로 메시지 id 회수", async () => {
    const { calls } = installFetch([
      { match: "discord.com/api/webhooks/1/abc", json: { id: "msg-1" } },
    ]);
    const result = await publishDiscord(
      { token: "https://discord.com/api/webhooks/1/abc" },
      "hello discord",
    );
    expect(result.ok).toBe(true);
    expect(result.externalId).toBe("msg-1");
    expect(calls[0].url).toContain("wait=true");
    expect(JSON.parse(calls[0].body!).content).toBe("hello discord");
  });

  it("이미지 있음 → embeds[0].image.url", async () => {
    const { calls } = installFetch([{ match: "discord.com/api/webhooks", json: { id: "msg-2" } }]);
    const result = await publishDiscord(
      { token: "https://discord.com/api/webhooks/1/abc" },
      "with image",
      "https://cdn.example.com/img.jpg",
    );
    expect(result.ok).toBe(true);
    const sent = JSON.parse(calls[0].body!);
    expect(sent.embeds[0].image.url).toBe("https://cdn.example.com/img.jpg");
  });

  it("Webhook URL(token) 없음 → 명확한 에러, 네트워크 호출 없음", async () => {
    const { calls } = installFetch([]);
    const result = await publishDiscord({ token: "" }, "hi");
    expect(result.ok).toBe(false);
    expect(result.error).toMatch(/Webhook URL/);
    expect(calls).toHaveLength(0);
  });

  it("webhook 무효(404) → ok:false + 상태코드", async () => {
    installFetch([{ match: "discord.com/api/webhooks", status: 404, text: "Unknown Webhook" }]);
    const result = await publishDiscord({ token: "https://discord.com/api/webhooks/1/bad" }, "hi");
    expect(result.ok).toBe(false);
    expect(result.error).toMatch(/실패\(404\)/);
  });

  // 사용처 호스트 고정: integrations 행이 비-URL(OAuth 토큰)이나 딴 호스트로 덮여도
  // 서버가 임의 대상을 fetch하지 않는다(크래시·SSRF 방지).
  it("discord.com 웹훅이 아닌 secret(비-URL/딴 호스트) → 명확한 에러, 네트워크 호출 없음", async () => {
    const { calls } = installFetch([]);
    for (const bad of ["xoxb-not-a-url", "https://evil.example.com/api/webhooks/1/abc", "http://discord.com/api/webhooks/1/abc", "https://discord.com/other/path"]) {
      const result = await publishDiscord({ token: bad }, "hi");
      expect(result.ok).toBe(false);
      expect(result.error).toMatch(/Webhook URL 형식/);
    }
    expect(calls).toHaveLength(0);
  });
});

describe("publishSlack — Incoming Webhook", () => {
  it("happy path: text만 전송(externalId 없음 — Slack 사양)", async () => {
    const { calls } = installFetch([
      { match: "hooks.slack.com/services/T1/B1/xyz", text: "ok" },
    ]);
    const result = await publishSlack(slackWebhookCred("https://hooks.slack.com/services/T1/B1/xyz"), "hello slack");
    expect(result.ok).toBe(true);
    expect(result.externalId).toBeUndefined();
    expect(JSON.parse(calls[0].body!).text).toBe("hello slack");
  });

  it("이미지 있음 → blocks에 image 블록 포함", async () => {
    const { calls } = installFetch([{ match: "hooks.slack.com", text: "ok" }]);
    const result = await publishSlack(
      slackWebhookCred("https://hooks.slack.com/services/T1/B1/xyz"),
      "with image",
      "https://cdn.example.com/img.jpg",
    );
    expect(result.ok).toBe(true);
    const sent = JSON.parse(calls[0].body!);
    const imageBlock = sent.blocks.find((b: { type: string }) => b.type === "image");
    expect(imageBlock.image_url).toBe("https://cdn.example.com/img.jpg");
  });

  it("Webhook URL(token) 없음 → 명확한 에러, 네트워크 호출 없음", async () => {
    const { calls } = installFetch([]);
    const result = await publishSlack(slackWebhookCred(""), "hi");
    expect(result.ok).toBe(false);
    expect(result.error).toMatch(/Webhook URL/);
    expect(calls).toHaveLength(0);
  });

  it("webhook 무효(400 invalid_payload) → ok:false + 상태코드", async () => {
    installFetch([{ match: "hooks.slack.com", status: 400, text: "invalid_payload" }]);
    const result = await publishSlack(slackWebhookCred("https://hooks.slack.com/services/T1/B1/bad"), "hi");
    expect(result.ok).toBe(false);
    expect(result.error).toMatch(/실패\(400\)/);
  });

  // Slack은 이번 출시에서 Incoming Webhook만 정직하게 지원한다(OAuth 앱/xoxb 봇 토큰 미지원).
  // ChannelConnect가 더 이상 Slack을 OAUTH_LABELS에 노출하지 않지만, connect/[provider]/callback
  // 경로가 과거에 같은 integrations 행(kind=channel,label=slack)을 xoxb 액세스 토큰으로 덮어썼을
  // 가능성은 여전히 있다 — 그래서 발행 직전 meta.api==="slack_webhook"을 요구해 방식 충돌을 막는다.
  it("meta.api!=='slack_webhook'(OAuth 토큰이 행을 덮어씀) → host 무관 명확한 에러, 네트워크 호출 없음", async () => {
    const { calls } = installFetch([]);
    // meta 없음(레거시 OAuth 연결) / meta.api가 다른 값 / URL 자체는 유효한 webhook 형식이어도 거부.
    for (const cred of [
      { token: "https://hooks.slack.com/services/T1/B1/xyz" }, // meta 없음
      { token: "https://hooks.slack.com/services/T1/B1/xyz", meta: { api: "slack_oauth" } },
      { token: "xoxb-123-456-abc", meta: { api: "slack_oauth" } },
    ]) {
      const result = await publishSlack(cred, "hi");
      expect(result.ok).toBe(false);
      expect(result.error).toMatch(/Incoming Webhook만 지원/);
    }
    expect(calls).toHaveLength(0);
  });

  // meta.api는 맞아도(bridge가 정직하게 slack_webhook을 찍었어도) secret 자체가 비-URL/딴 호스트면
  // 여전히 거부돼야 한다(host 검사는 meta 검사와 별개의 방어선 — 값 자체가 오염된 경우 대비).
  it("meta.api='slack_webhook'인데 secret이 비-URL/딴 호스트 → 여전히 거부, 네트워크 호출 없음", async () => {
    const { calls } = installFetch([]);
    for (const bad of ["xoxb-123-456-abc", "https://evil.example.com/services/T1/B1/xyz", "http://hooks.slack.com/services/T1/B1/xyz"]) {
      const result = await publishSlack(slackWebhookCred(bad), "hi");
      expect(result.ok).toBe(false);
      expect(result.error).toMatch(/Webhook URL 형식/);
    }
    expect(calls).toHaveLength(0);
  });
});

describe("외부 게시 응답 불명확성 공통 계약", () => {
  const cases = [
    { name: "Telegram", call: () => publishTelegram({ token: "bot-token", meta: { chatId: "1" } }, "body"), match: "api.telegram.org" },
    { name: "Discord", call: () => publishDiscord({ token: "https://discord.com/api/webhooks/1/abc" }, "body"), match: "discord.com" },
    { name: "Slack", call: () => publishSlack(slackWebhookCred("https://hooks.slack.com/services/T1/B1/abc"), "body"), match: "hooks.slack.com" },
  ];
  for (const item of cases) {
    it(`REVIEW-20260918-28 보류: ${item.name} 외부 POST 503은 자동 재시도할 실패가 아니다`, async () => {
      installFetch([{ match: item.match, status: 503, text: "server error" }]);
      expect(await item.call()).toMatchObject({ ok: false, failureKind: "indeterminate" });
    });
    it(`REVIEW-20260918-28 보류: ${item.name} 외부 POST 응답 유실도 자동 재시도하지 않는다`, async () => {
      vi.stubGlobal("fetch", vi.fn(async () => { throw new Error("response lost"); }));
      expect(await item.call()).toMatchObject({ ok: false, failureKind: "indeterminate" });
    });
  }
  it("REVIEW-20260918-28 보류: Slack 2xx인데 공식 ok 본문이 없으면 성공으로 기록하지 않는다", async () => {
    installFetch([{ match: "hooks.slack.com", status: 200, text: "" }]);
    expect(await publishSlack(slackWebhookCred("https://hooks.slack.com/services/T1/B1/abc"), "body"))
      .toMatchObject({ ok: false, failureKind: "indeterminate" });
  });
});
