import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { signMediaToken, verifyMediaToken, mediaSigningConfigured } from "@/lib/media-token";

// SNS-015: 서명 미디어 배달 토큰 — 만료·변조·cross-tenant·불투명성 계약.
const SECRET = "test-media-signing-secret-0123456789";
const BASE64URL_ALPHABET = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789-_";

function nonCanonicalSignatureAlias(token: string): string {
  const [body, signature] = token.split(".");
  const lastIndex = BASE64URL_ALPHABET.indexOf(signature.at(-1)!);
  expect(lastIndex).toBeGreaterThanOrEqual(0);
  // HMAC-SHA256 is 32 bytes: its final base64url symbol has four data bits
  // and two zero pad bits, so changing only those low two bits is an alias.
  expect(lastIndex & 0b000011).toBe(0);
  const alias = `${signature.slice(0, -1)}${BASE64URL_ALPHABET[lastIndex | 1]}`;
  expect(Buffer.from(alias, "base64url")).toEqual(Buffer.from(signature, "base64url"));
  return `${body}.${alias}`;
}

describe("media-token", () => {
  beforeEach(() => {
    process.env.MEDIA_SIGNING_SECRET = SECRET;
  });
  afterEach(() => {
    delete process.env.MEDIA_SIGNING_SECRET;
    vi.restoreAllMocks();
  });

  it("서명 후 검증하면 같은 테넌트/파일명을 돌려준다", () => {
    const t = signMediaToken("tenantA", "clip.mp4")!;
    expect(t).toBeTruthy();
    expect(verifyMediaToken(t)).toMatchObject({ tenantId: "tenantA", filename: "clip.mp4" });
  });

  // ⚠️ 이 토큰은 서명(HMAC)만 되어 있고 암호화되지 않는다. 아래 두 테스트가 그 계약의 실제 경계다:
  // (a) 서명 비밀은 절대 토큰에 실리지 않는다 / (b) payload는 URL-safe 문자만 쓴다.
  // "파일명·테넌트가 감춰진다(불투명/기밀)"는 주장은 **하지 않는다** — 그 반대가 참임을 (c)가 못박는다.
  it("서명 비밀은 토큰에 실리지 않고, 토큰은 URL-safe 문자만 쓴다", () => {
    const t = signMediaToken("tenantA", "secret-clip.mp4")!;
    expect(t).not.toContain(SECRET);
    expect(t).toMatch(/^[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+$/);
  });

  it("기밀성은 제공하지 않는다 — payload는 base64url 평문 JSON이라 누구나 디코드 가능", () => {
    const t = signMediaToken("tenantA", "secret-clip.mp4")!;
    const body = t.split(".")[0];
    const decoded = JSON.parse(
      Buffer.from(body.replace(/-/g, "+").replace(/_/g, "/"), "base64").toString("utf8"),
    ) as { t: string; f: string };
    // 즉, 토큰을 가진 사람은 테넌트ID와 파일명을 읽을 수 있다. 보안 보장은 변조불가 + 만료뿐.
    expect(decoded.t).toBe("tenantA");
    expect(decoded.f).toBe("secret-clip.mp4");
  });

  it("만료된 토큰은 거부한다", () => {
    const t = signMediaToken("tenantA", "clip.mp4", 1000, 1_000_000)!;
    expect(verifyMediaToken(t, 1_000_500)).not.toBeNull();
    expect(verifyMediaToken(t, 1_002_000)).toBeNull();
  });

  it("변조된 payload/서명은 거부한다", () => {
    const t = signMediaToken("tenantA", "clip.mp4")!;
    const [body, sig] = t.split(".");
    // payload만 다른 테넌트로 바꿔치기 → 서명 불일치
    const forgedBody = Buffer.from(JSON.stringify({ v: 1, t: "tenantB", f: "clip.mp4", e: Date.now() + 60000 }))
      .toString("base64").replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
    expect(verifyMediaToken(`${forgedBody}.${sig}`)).toBeNull();
    expect(verifyMediaToken(`${body}.${sig.slice(0, -2)}AA`)).toBeNull();
    expect(verifyMediaToken(body)).toBeNull();
  });

  it("canonical 서명은 통과하고 같은 바이트의 non-canonical base64url alias는 거부한다", () => {
    const canonical = signMediaToken("tenantA", "clip.mp4")!;
    const alias = nonCanonicalSignatureAlias(canonical);

    expect(verifyMediaToken(canonical)).toMatchObject({ tenantId: "tenantA", filename: "clip.mp4" });
    expect(verifyMediaToken(alias)).toBeNull();
  });

  it("다른 비밀로 서명된 토큰(cross-deploy)은 거부한다", () => {
    const t = signMediaToken("tenantA", "clip.mp4")!;
    process.env.MEDIA_SIGNING_SECRET = "another-media-signing-secret-98765";
    expect(verifyMediaToken(t)).toBeNull();
  });

  it("경로 traversal 파일명과 불량 테넌트는 서명 자체를 거부한다", () => {
    expect(signMediaToken("tenantA", "../../etc/passwd")).toBeNull();
    expect(signMediaToken("tenantA", "a/b.mp4")).toBeNull();
    expect(signMediaToken("tenantA", ".subtitle-bakes.json")).toBeNull();
    expect(signMediaToken("../x", "clip.mp4")).toBeNull();
  });

  it("비밀 미설정이면 서명 불가(무서명 공개 URL 발급 금지)", () => {
    delete process.env.MEDIA_SIGNING_SECRET;
    const prev = process.env.DASHBOARD_AUTH_TOKEN;
    delete process.env.DASHBOARD_AUTH_TOKEN;
    expect(mediaSigningConfigured()).toBe(false);
    expect(signMediaToken("tenantA", "clip.mp4")).toBeNull();
    if (prev !== undefined) process.env.DASHBOARD_AUTH_TOKEN = prev;
  });
});
