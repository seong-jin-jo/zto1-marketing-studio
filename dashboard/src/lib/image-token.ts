// SNS-016: 테넌트 스코프 + 단수명 서명 이미지 배달 토큰.
//
// media-token.ts(영상 전용)와 형식은 같지만 서명 키를 별도 컨텍스트("osmu-image-delivery-v1")로
// 유도해 두 토큰이 서로 재생(replay)되지 않게 목적(purpose)을 분리한다 — 이미지 토큰으로
// /api/media/<token>(영상 배달)을 열거나 그 반대가 통과하지 않는다(서명 키가 다르므로 검증 실패).
//
// 만료는 영상(15분)과 다르게 30일로 길게 잡는다: 고객 큐 이미지는 업로드 시점에 URL을 발급받아
// queue.json에 영속 저장되고, 예약 발행이 며칠 뒤 실행될 때 그 URL로 Meta/Threads API에 그대로
// 전달된다. 짧은 TTL을 쓰면 예약 발행 시점에 이미 만료돼 발행이 조용히 실패한다.
import crypto from "crypto";
import { isSafeMediaFilename } from "@/lib/media-token";

export { isSafeMediaFilename };

export const IMAGE_TOKEN_TTL_MS = 30 * 24 * 60 * 60 * 1000;

export interface ImageTokenPayload {
  tenantId: string;
  filename: string;
  expiresAt: number;
}

function signingKey(): Buffer | null {
  const raw = process.env.MEDIA_SIGNING_SECRET || process.env.DASHBOARD_AUTH_TOKEN || "";
  if (raw.length < 16) return null;
  return crypto.createHmac("sha256", "osmu-image-delivery-v1").update(raw).digest();
}

export function imageSigningConfigured(): boolean {
  return signingKey() !== null;
}

function b64u(buf: Buffer): string {
  return buf.toString("base64").replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

function unb64u(s: string): Buffer {
  return Buffer.from(s.replace(/-/g, "+").replace(/_/g, "/"), "base64");
}

export function signImageToken(
  tenantId: string,
  filename: string,
  ttlMs: number = IMAGE_TOKEN_TTL_MS,
  now: number = Date.now(),
): string | null {
  const key = signingKey();
  if (!key) return null;
  if (!tenantId || !/^[A-Za-z0-9_-]{1,64}$/.test(tenantId)) return null;
  if (!isSafeMediaFilename(filename)) return null;
  const payload = JSON.stringify({ v: 1, t: tenantId, f: filename, e: now + Math.max(1000, ttlMs) });
  const body = b64u(Buffer.from(payload, "utf8"));
  const sig = b64u(crypto.createHmac("sha256", key).update(body).digest());
  return `${body}.${sig}`;
}

function parseImageToken(token: string, now: number, requireUnexpired: boolean): ImageTokenPayload | null {
  const key = signingKey();
  if (!key || !token || token.length > 2048) return null;
  const dot = token.indexOf(".");
  if (dot <= 0 || dot !== token.lastIndexOf(".")) return null;
  const body = token.slice(0, dot);
  const sig = token.slice(dot + 1);
  if (!/^[A-Za-z0-9_-]+$/.test(body) || !/^[A-Za-z0-9_-]+$/.test(sig)) return null;
  const expected = crypto.createHmac("sha256", key).update(body).digest();
  const got = unb64u(sig);
  if (got.length !== expected.length) return null;
  if (b64u(got) !== sig) return null;
  if (!crypto.timingSafeEqual(got, expected)) return null;
  let parsed: { v?: number; t?: string; f?: string; e?: number };
  try {
    parsed = JSON.parse(unb64u(body).toString("utf8"));
  } catch {
    return null;
  }
  if (parsed.v !== 1 || typeof parsed.t !== "string" || typeof parsed.f !== "string" || typeof parsed.e !== "number") {
    return null;
  }
  if (!/^[A-Za-z0-9_-]{1,64}$/.test(parsed.t) || !isSafeMediaFilename(parsed.f)) return null;
  if (!Number.isFinite(parsed.e) || (requireUnexpired && !(parsed.e > now))) return null;
  return { tenantId: parsed.t, filename: parsed.f, expiresAt: parsed.e };
}

export function verifyImageToken(token: string, now: number = Date.now()): ImageTokenPayload | null {
  return parseImageToken(token, now, true);
}

/** 만료만 무시하고 서명, 목적, 테넌트, 파일명 형식을 검증한다. 재발급 경로 전용이다. */
export function verifyImageTokenSignature(token: string): ImageTokenPayload | null {
  return parseImageToken(token, Date.now(), false);
}

/**
 * 큐에 저장된 자사 이미지 URL을 발행 직전에 갱신한다. 만료된 토큰도 HMAC 서명 자체가 유효하고
 * 요청 테넌트와 일치할 때만 새 토큰을 발급한다. 따라서 30일을 넘긴 예약은 살리되, 위조·타
 * 테넌트 토큰은 갱신 경로로 우회하지 못한다. 외부 HTTPS 이미지는 그대로 통과시킨다.
 */
export function refreshImageDeliveryUrl(tenantId: string, imageUrl: string): string | null {
  let parsedUrl: URL;
  try {
    parsedUrl = new URL(imageUrl);
  } catch {
    return null;
  }
  if (parsedUrl.protocol !== "https:") return null;

  const prefix = "/api/images/deliver/";
  if (!parsedUrl.pathname.startsWith(prefix)) return imageUrl;
  if (parsedUrl.search || parsedUrl.hash) return null;

  const encoded = parsedUrl.pathname.slice(prefix.length);
  if (!encoded || encoded.includes("/")) return null;
  let token: string;
  try {
    token = decodeURIComponent(encoded);
  } catch {
    return null;
  }

  // 만료 여부만 무시하고 HMAC·payload 형식은 모두 검증한다. tenantId가 다르면 갱신 금지.
  const claim = parseImageToken(token, Date.now(), false);
  if (!claim || claim.tenantId !== tenantId) return null;
  const renewed = signImageToken(tenantId, claim.filename);
  const origin = process.env.OSMU_PUBLIC_URL?.replace(/\/+$/, "") || "";
  if (!renewed || !origin.startsWith("https://")) return null;
  return `${origin}${prefix}${renewed}`;
}
