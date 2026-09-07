// SNS-015: 테넌트 스코프 + 단수명 서명 미디어 배달 토큰.
//
// 왜 필요한가: Instagram Reels 컨테이너는 Meta 서버가 직접 가져갈 수 있는 공개 HTTPS video_url을
// 요구한다. 기존 /api/higgsfield/asset/<file>?tenant_id=... 는 (a) data/studio 전용이라 영상
// 업로드 경로(data/videos)를 못 서빙하고 (b) 만료가 없어 한번 나간 URL이 영원히 산다. 그래서
// "테넌트에 묶이고, 변조하면 즉시 거부되고, 짧게 만료되는" 전용 토큰을 별도로 둔다.
// 토큰 안에 인증 토큰·내부 절대경로는 절대 넣지 않는다(파일명 + 테넌트 + 만료만).
//
// ⚠️ 기밀성 주장 금지: 이 토큰은 **서명(HMAC)되었을 뿐 암호화되지 않았다.** payload는 base64url
// 인코딩된 평문 JSON이므로 토큰을 가진 사람은 tenantId·파일명·만료시각을 그대로 읽을 수 있다.
// 이 토큰이 제공하는 보장은 두 가지뿐이다 — (1) 변조 불가(tamper-evident: 서명 불일치 → 거부),
// (2) 만료. "URL만 봐서는 무엇을 여는지 모른다(불투명/암호화)"는 보장은 **하지 않는다.**
// 노출 최소화 효과(리퍼러·로그에 원문 파일명이 안 찍힘)는 부수효과지 보안 경계가 아니다.
//
// 형식: base64url(JSON payload) "." base64url(HMAC-SHA256(payload))
//   payload = { v: 1, t: <tenantId>, f: <filename>, e: <만료 epoch ms> }
// 검증은 상수시간 비교 + 만료 확인. 실패는 전부 동일하게 null(존재 여부 열거 차단).
import crypto from "crypto";

/**
 * 기본 수명.
 *
 * 2026-09-08 회장 실사용: 생성실에서 만든 카드뉴스가 편집실에서 사라졌다. 원인은 이 값이
 * 15분이었던 것이다. 화면은 만들 때 받은 서명 주소를 그대로 들고 있는데, 15분이 지나면
 * 그 주소가 죽어 이미지도 영상도 화면에서 없어진다. 만들고 문구를 다듬고 채널마다 손보고
 * 발행까지 가는 한 편의 작업은 15분보다 길다. 즉 정상 사용에서 반드시 깨지는 값이었다.
 *
 * 이 토큰이 여는 것은 한 작업 공간의 파일 하나에 대한 읽기뿐이고, 위조는 서명이 막는다.
 * 그래서 수명을 작업 세션 길이에 맞춘다. 외부 제공자가 받아가는 경로(릴스 등)는 발행
 * 시점에 따로 서명하므로 이 값과 무관하다.
 */
export const MEDIA_TOKEN_TTL_MS = 12 * 60 * 60 * 1000;

export interface MediaTokenPayload {
  tenantId: string;
  filename: string;
  expiresAt: number;
}

/**
 * 서명 비밀. 전용 env(MEDIA_SIGNING_SECRET) 우선, 없으면 이미 배포에 존재하는
 * DASHBOARD_AUTH_TOKEN을 유도키(HKDF 유사)로 파생해 쓴다 — 원문을 그대로 키로 쓰지 않는다.
 * 둘 다 없거나 너무 짧으면 null → 서명 자체를 거부(서명 없는 공개 URL 발급 금지).
 */
function signingKey(): Buffer | null {
  // 2026-09-07: 배포 컨테이너에 앞의 두 값이 없어 서명이 발급되지 않았고, 그래서 만든
  // 그림과 영상이 화면에 안 떴다(img·video 태그는 인증 헤더를 못 붙인다). 배포에 반드시
  // 있는 OSMU_SECRET_KEY 까지 파생 후보에 넣는다. 원문을 키로 쓰지 않는 것은 그대로다.
  const raw = process.env.MEDIA_SIGNING_SECRET || process.env.DASHBOARD_AUTH_TOKEN || process.env.OSMU_SECRET_KEY || "";
  if (raw.length < 16) return null;
  return crypto.createHmac("sha256", "osmu-media-delivery-v1").update(raw).digest();
}

export function mediaSigningConfigured(): boolean {
  return signingKey() !== null;
}

function b64u(buf: Buffer): string {
  return buf.toString("base64").replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

function unb64u(s: string): Buffer {
  return Buffer.from(s.replace(/-/g, "+").replace(/_/g, "/"), "base64");
}

/** 파일명 화이트리스트 — 단일 파일명만, 경로 구분자/상위참조/NUL 금지. */
export function isSafeMediaFilename(name: string): boolean {
  if (!name || name.length > 200) return false;
  if (name.includes("/") || name.includes("\\") || name.includes("..") || name.includes("\0")) return false;
  return /^[A-Za-z0-9._-]+$/.test(name);
}

/** 서명 토큰 발급. 비밀 미설정·불량 입력이면 null(호출부는 이를 "발행 불가"로 정직하게 처리). */
export function signMediaToken(
  tenantId: string,
  filename: string,
  ttlMs: number = MEDIA_TOKEN_TTL_MS,
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

/** 검증. 변조·만료·형식오류·비밀 미설정 전부 null. */
export function verifyMediaToken(token: string, now: number = Date.now()): MediaTokenPayload | null {
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
  if (!(parsed.e > now)) return null;
  return { tenantId: parsed.t, filename: parsed.f, expiresAt: parsed.e };
}
