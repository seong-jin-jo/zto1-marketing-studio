import { describe, expect, it, vi, afterEach } from "vitest";
import { publishLinkedIn } from "@/lib/publish";

// 2026-09-08: 아홉 채널 가운데 LinkedIn 만 발행 코드가 두 경로 어디에도 없었다.
// 나머지는 전부 구현돼 있고 연결이나 배선만 남은 상태였다. 이 한 칸을 채우면서 계약을 박는다.
const cred = { token: "t", userId: "abc123", meta: {}, accountId: "acc" } as never;

afterEach(() => vi.restoreAllMocks());

describe("publishLinkedIn", () => {
  it("정상: 게시물 식별자와 주소를 돌려준다", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => new Response(JSON.stringify({ id: "urn:li:share:777" }), { status: 201 })));
    const r = await publishLinkedIn(cred, "본문");
    expect(r.ok).toBe(true);
    expect(r.externalId).toBe("urn:li:share:777");
    expect(r.permalink).toContain("linkedin.com/feed/update");
  });

  it("정상: 사람 식별자가 URN 이 아니면 URN 으로 감싼다", async () => {
    const spy = vi.fn(async () => new Response(JSON.stringify({ id: "x" }), { status: 201 }));
    vi.stubGlobal("fetch", spy);
    await publishLinkedIn(cred, "본문");
    const body = JSON.parse(String((spy.mock.calls[0] as unknown as [string, RequestInit])[1].body));
    expect(body.author).toBe("urn:li:person:abc123");
    expect(body.visibility["com.linkedin.ugc.MemberNetworkVisibility"]).toBe("PUBLIC");
  });

  it("거절: 본문이 비면 외부 호출을 하지 않는다", async () => {
    const spy = vi.fn();
    vi.stubGlobal("fetch", spy);
    const r = await publishLinkedIn(cred, "   ");
    expect(r.ok).toBe(false);
    expect(spy).not.toHaveBeenCalled();
  });

  it("거절: 계정 식별자가 없으면 지어내지 않고 막는다", async () => {
    const spy = vi.fn();
    vi.stubGlobal("fetch", spy);
    const r = await publishLinkedIn({ token: "t", meta: {}, accountId: "a" } as never, "본문");
    expect(r.ok).toBe(false);
    expect(r.error).toContain("계정 식별자");
    expect(spy).not.toHaveBeenCalled();
  });

  it("거절: 401 은 재연결을 안내하고 확정 실패로 둔다", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => new Response("", { status: 401 })));
    const r = await publishLinkedIn(cred, "본문");
    expect(r.ok).toBe(false);
    expect(r.error).toContain("다시 연결");
    expect(r.failureKind).toBe("definitive");
  });

  it("거절: 식별자 없는 성공 응답을 성공으로 단정하지 않는다", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => new Response(JSON.stringify({}), { status: 201 })));
    const r = await publishLinkedIn(cred, "본문");
    expect(r.ok).toBe(false);
    expect(r.failureKind).toBe("indeterminate");
  });

  it("거절: 제공자 원문을 그대로 노출하지 않는다", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => new Response("내부 스택 추적 상세", { status: 500 })));
    const r = await publishLinkedIn(cred, "본문");
    expect(r.error).not.toContain("내부 스택");
    expect(r.error).toContain("500");
  });
});
