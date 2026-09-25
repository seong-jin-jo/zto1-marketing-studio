import fs from "fs";
import path from "path";
import crypto from "crypto";
import net from "net";
import dns from "dns";
import { Agent } from "undici";
import { readJson, dataPath } from "./file-io";
import { tenantVideosDir, checkGeneratedMediaDirSafety } from "./storage";

export interface ClippingConfig {
  provider?: "reap" | "ssemble" | "";
  apiKey?: string;
  baseUrl?: string;
}

export interface ClipCandidate {
  id: string;
  url: string; // local filename after save, or original external URL if local save failed
  title?: string;
  caption?: string;
  viralScore?: number;
  duration?: number;
  startSec?: number;
  // ADR-007(MINOR-2, 코드리뷰 2026-09-26): 로컬 저장이 실패하면 url은 원본 외부 URL로
  // 조용히 폴백한다 — 호출 쪽이 "이게 우리 서버에 저장된 파일인지, 아직 외부 URL인지"를
  // 구분할 수 있게 이 표식을 함께 싣는다. true면 url이 외부 원본이다.
  localSaveFailed?: boolean;
}

export interface RepurposeResult {
  provider: string;
  clips: ClipCandidate[];
  raw?: any;
}

// clipping-config.json(제공자 API 키)은 module-scope에서 한 번 평가된다. 이는 테넌트별
// 컨텍스트를 놓친 버그가 아니라, 이 키 자체가 설계상 운영자가 한 번 설정하는 공유
// 3rd-party 자격증명이라 그렇다(MINOR-1, 코드리뷰 2026-09-26 — 이전 주석이 "테넌트
// 컨텍스트를 놓쳤다"는 식으로 오해를 살 수 있게 적혀 있어 정정한다). 향후 테넌트별
// 클리핑 제공자 키를 지원하게 되면 이 가정 자체를 재검토해야 한다.
const CONFIG_PATH = dataPath("clipping-config.json");

export function getClippingConfig(): ClippingConfig {
  return readJson<ClippingConfig>(CONFIG_PATH) || {};
}

// tenantId를 인자로 받아 storage.tenantVideosDir로 폴더를 고정한다(MAJOR, 코드리뷰
// 2026-09-25 파생건). 종전엔 dataPath("videos")를 썼는데, 이 함수는 호출 시점의
// AsyncLocalStorage 테넌트 컨텍스트로 경로를 고른다 — repurpose 라우트가 runWithTenant로
// 감싸지 않은 채 repurposeVideo를 불렀으므로 테넌트로 로그인해 만든 클립이 실제로는
// 운영자 공유 data/videos에 저장됐다. storage.ts의 saveMedia/tenantVideosDir처럼 인자
// tenantId만으로 경로를 계산하면 호출부의 컨텍스트 유무와 무관하게 항상 같은 값이 나온다.

// 사설/루프백/특수 IP 대역 차단 목록(net.BlockList). MINOR-3(2026-09-26) 1차 방어가
// 정규식 기반이었는데, IPv4-mapped IPv6 리터럴(`[::ffff:127.0.0.1]`, `[::ffff:7f00:1]`)로
// 우회가 실측됐다(리뷰어 P10) — 정규식이 IPv6 표현을 아예 몰랐다. net.isIP로 리터럴
// 종류를 판정하고 net.BlockList로 대역을 검사하는 방식으로 바꾼다. IPv4-mapped IPv6는
// 내장 IPv4로 풀어 같은 IPv4 규칙으로 검사한다(아래 normalizeIpLiteral).
const SSRF_BLOCKLIST = new net.BlockList();
// IPv4: 루프백, 이 네트워크, 사설(10/8, 172.16/12, 192.168/16), 링크로컬(169.254/16 —
// 169.254.169.254 클라우드 메타데이터 포함), CGNAT(100.64/10), 벤치마킹(198.18/15).
SSRF_BLOCKLIST.addSubnet("127.0.0.0", 8, "ipv4");
SSRF_BLOCKLIST.addSubnet("0.0.0.0", 8, "ipv4");
SSRF_BLOCKLIST.addSubnet("10.0.0.0", 8, "ipv4");
SSRF_BLOCKLIST.addSubnet("172.16.0.0", 12, "ipv4");
SSRF_BLOCKLIST.addSubnet("192.168.0.0", 16, "ipv4");
SSRF_BLOCKLIST.addSubnet("169.254.0.0", 16, "ipv4");
SSRF_BLOCKLIST.addSubnet("100.64.0.0", 10, "ipv4");
SSRF_BLOCKLIST.addSubnet("198.18.0.0", 15, "ipv4");
// 멀티캐스트(224.0.0.0/4)·제한 브로드캐스트(255.255.255.255/32) — 클립 다운로드 대상이
// 될 이유가 없는 트래픽이다(MINOR, 재리뷰 2026-09-26).
SSRF_BLOCKLIST.addSubnet("224.0.0.0", 4, "ipv4");
SSRF_BLOCKLIST.addAddress("255.255.255.255", "ipv4");
// IPv6: 루프백(::1), 미지정(::), 링크로컬(fe80::/10), ULA(fc00::/7).
SSRF_BLOCKLIST.addAddress("::1", "ipv6");
SSRF_BLOCKLIST.addAddress("::", "ipv6");
SSRF_BLOCKLIST.addSubnet("fe80::", 10, "ipv6");
SSRF_BLOCKLIST.addSubnet("fc00::", 7, "ipv6");
// IPv4-compatible(::/96, 사실상 폐지됐지만 하위 32비트가 IPv4로 해석될 수 있다),
// IPv4-translated(::ffff:0:0:0/96, RFC 6052 — IPv4-mapped(::ffff:0:0/96)와 다른 대역),
// NAT64(64:ff9b::/96) — 전부 안에 IPv4 주소를 실어나를 수 있는 특수 IPv6 대역이라
// normalizeIpLiteral이 못 푸는 형태로도 사설/루프백 IPv4를 가리킬 수 있다(MINOR,
// 재리뷰 2026-09-26).
SSRF_BLOCKLIST.addSubnet("::", 96, "ipv6");
SSRF_BLOCKLIST.addSubnet("::ffff:0:0:0", 96, "ipv6");
SSRF_BLOCKLIST.addSubnet("64:ff9b::", 96, "ipv6");

// normalizeIpLiteral / isPrivateOrLoopbackHost / isSafeExternalMediaUrl은 회귀 테스트가
// 우회 케이스(IPv4-mapped IPv6 두 종, 도메인 오탐 등)를 이 함수들에 직접 걸어 검증할 수
// 있도록 export한다 — 모듈 내부 전용이지 공개 API 계약이 아니다.

/**
 * IPv6 리터럴 안에 IPv4-mapped 주소(`::ffff:a.b.c.d` 점표기, `::ffff:7f00:1` 16진 표기)가
 * 들어 있으면 그 IPv4로 풀어서 돌려준다. 순수 IPv6면 그대로, IP 리터럴이 아니면(도메인명)
 * null을 돌려준다 — 도메인명은 여기서 판정하지 않는다(MINOR-3b, 코드리뷰 2026-09-26:
 * "fc"/"fd" 접두 문자열 매칭이 "fdn.example.com" 같은 평범한 도메인까지 차단했다. IP
 * 리터럴로 확인된 값에만 BlockList 규칙을 적용해야 이 오탐이 사라진다).
 */
export function normalizeIpLiteral(hostnameRaw: string): { address: string; family: "ipv4" | "ipv6" } | null {
  const h = hostnameRaw.startsWith("[") && hostnameRaw.endsWith("]") ? hostnameRaw.slice(1, -1) : hostnameRaw;
  const kind = net.isIP(h);
  if (kind === 4) return { address: h, family: "ipv4" };
  if (kind === 6) {
    const dotted = h.match(/^::ffff:(\d{1,3}\.\d{1,3}\.\d{1,3}\.\d{1,3})$/i);
    if (dotted && net.isIP(dotted[1]) === 4) return { address: dotted[1], family: "ipv4" };
    const hex = h.match(/^::ffff:([0-9a-f]{1,4}):([0-9a-f]{1,4})$/i);
    if (hex) {
      const hi = parseInt(hex[1], 16);
      const lo = parseInt(hex[2], 16);
      const addr = `${(hi >> 8) & 0xff}.${hi & 0xff}.${(lo >> 8) & 0xff}.${lo & 0xff}`;
      return { address: addr, family: "ipv4" };
    }
    return { address: h, family: "ipv6" };
  }
  return null;
}

// 테스트 전용 주입 지점 — 루프백을 진짜로 여는 대신 "차단목록 판정 함수" 자체를
// 바꿔치기해, 실제 dispatcher·connect.lookup 훅 경로를 로컬 HTTP 서버로 통째로
// 실측할 수 있게 한다(재리뷰 2026-09-26: mock fetch로는 훅이 한 번도 실행되지 않아
// 이 결함을 놓쳤다는 지적 — 그래서 fetch는 절대 mock하지 않고, 이 판정 함수만 바꾼다).
// 프로덕션 코드 경로는 이 값을 절대 설정하지 않는다.
let ssrfBlocklistCheckOverrideForTests: ((address: string, family: "ipv4" | "ipv6") => boolean) | null = null;

export function __setSsrfBlocklistCheckForTests(
  override: ((address: string, family: "ipv4" | "ipv6") => boolean) | null,
): void {
  ssrfBlocklistCheckOverrideForTests = override;
}

function ssrfBlocklistCheck(address: string, family: "ipv4" | "ipv6"): boolean {
  return ssrfBlocklistCheckOverrideForTests
    ? ssrfBlocklistCheckOverrideForTests(address, family)
    : SSRF_BLOCKLIST.check(address, family);
}

export function isPrivateOrLoopbackHost(hostnameRaw: string): boolean {
  const h = hostnameRaw.toLowerCase();
  if (h === "localhost" || h.endsWith(".localhost")) return true;
  const norm = normalizeIpLiteral(h);
  if (!norm) return false; // IP 리터럴이 아닌 도메인명 — connect-lookup 훅이 해석된 주소를 따로 검사한다.
  return ssrfBlocklistCheck(norm.address, norm.family);
}

export function isSafeExternalMediaUrl(raw: string): boolean {
  try {
    const u = new URL(raw);
    if (u.protocol !== "http:" && u.protocol !== "https:") return false;
    if (isPrivateOrLoopbackHost(u.hostname)) return false;
    return true;
  } catch {
    return false;
  }
}

// DNS 리바인딩 방어: fetch가 실제로 커넥션을 여는 시점의 dns.lookup 훅에서, 해석된
// 주소를 SSRF_BLOCKLIST로 한 번 더 검사한다. isSafeExternalMediaUrl은 "요청 시점의
// 호스트 문자열"만 보므로, 공개 도메인이 나중에(또는 재조회 시) 사설 IP로 응답하는
// 경우를 못 잡는다 — 그 구멍을 이 훅이 메운다.
//
// ★한계(MINOR-3 지시 "구현이 과하면 lookup 검사까지만" 범위): 이 훅은 "연결을 열 때"
// 검사하지만, TCP 커넥션이 실제로 맺어지는 순간과 훅 콜백 사이에는 여전히 이론상 TOCTOU
// 틈이 있다(다른 스레드/프로세스가 그 사이 라우팅을 바꾸는 등, 이 애플리케이션 계층에서
// 막을 수 없는 시나리오). 또한 이 dispatcher를 지나지 않는 fetch 호출(다른 모듈이 별도
// dispatcher 없이 fetch를 쓰는 경우)에는 이 방어가 적용되지 않는다 — clipping.ts 안의
// 모든 외부 클립 다운로드 fetch가 이 dispatcher를 쓰도록 통일했다.
//
// BLOCK(2026-09-26 재리뷰 MAJOR-1) — happy-eyeballs 때문에 net.connect가 이 훅을
// options.all=true로 부르고 "주소 배열"을 기대하는데, 이전 판은 항상 "단일 주소"
// (err, address, family)만 돌려줬다. Node 20/22 둘 다에서 ERR_INVALID_IP_ADDRESS로
// 클립 다운로드가 전부 실패했다(example.com·google robots.txt 모두 재현, scratchpad/
// disp.mjs). 콜백 계약은 options.all 값을 그대로 따른다 — all이면 배열, 아니면 첫
// 주소 하나. 차단 목록 검사는 어느 경우든 해석된 주소 "전부"에 적용한다.
type NodeLookupCallback = (
  err: NodeJS.ErrnoException | null,
  address: string | dns.LookupAddress[],
  family?: number,
) => void;

// 독립 함수로 뽑아 export한다 — 회귀 테스트가 undici Agent 생성 없이 이 훅 하나만
// 단위로 부를 수 있게(options.all=true일 때 배열을 돌려주는지 등, 재리뷰 2026-09-26).
export function ssrfAwareLookup(hostname: string, options: dns.LookupOptions, callback: NodeLookupCallback): void {
  dns.lookup(hostname, { ...options, all: true }, (err, addresses) => {
    if (err) return callback(err, "");
    if (!addresses || addresses.length === 0) {
      return callback(new Error(`SSRF lookup: ${hostname} resolved to no addresses`), "");
    }
    for (const a of addresses) {
      const fam = a.family === 6 ? "ipv6" : "ipv4";
      if (ssrfBlocklistCheck(a.address, fam)) {
        callback(new Error(`SSRF blocked: ${hostname} resolved to private/loopback address ${a.address}`), "");
        return;
      }
    }
    // net.connect(happy-eyeballs)가 all:true로 부르면 배열 계약, 아니면 단일 주소
    // 계약이다 — 호출부가 무엇을 요청했는지에 맞춰 그대로 돌려준다.
    if (options.all) {
      callback(null, addresses);
      return;
    }
    const first = addresses[0];
    callback(null, first.address, first.family);
  });
}

const ssrfSafeDispatcher = new Agent({
  connect: {
    lookup: ssrfAwareLookup,
  },
});

const MAX_CLIP_REDIRECTS = 3;
// 클립 하나를 받는 데 걸릴 수 있는 최대 시간. 제공자가 응답을 시작만 하고 끝내지 않으면
// (또는 느린 네트워크) repurpose 요청 전체가 무한정 걸린다 — 상한을 둔다(MINOR, 재리뷰
// 2026-09-26).
const CLIP_DOWNLOAD_TIMEOUT_MS = 60_000;

/**
 * 매 hop마다 URL을 재검사하며 리다이렉트를 최대 MAX_CLIP_REDIRECTS번까지만 따라간다.
 * fetch(redirect:"manual")로 리다이렉트를 자동으로 따라가지 않게 하고, Location 헤더를
 * 우리가 직접 검증한 뒤에만 다음 요청을 보낸다 — 첫 URL은 공개 호스트를 가리키다가
 * 리다이렉트로 사설 IP를 가리키는 우회를 막는다(MINOR-3, 코드리뷰 2026-09-26).
 */
export async function fetchClipWithValidatedRedirects(startUrl: string): Promise<Response> {
  let currentUrl = startUrl;
  const signal = AbortSignal.timeout(CLIP_DOWNLOAD_TIMEOUT_MS);
  for (let hop = 0; hop <= MAX_CLIP_REDIRECTS; hop++) {
    if (!isSafeExternalMediaUrl(currentUrl)) {
      throw new Error(`unsafe external url at redirect hop ${hop} (scheme or private/loopback host)`);
    }
    const res = await fetch(currentUrl, { redirect: "manual", dispatcher: ssrfSafeDispatcher, signal } as RequestInit);
    if (res.status >= 300 && res.status < 400) {
      const location = res.headers.get("location");
      // 이 hop의 응답 본문을 다 안 읽고 버리면 커넥션이 안 닫힌 채 쌓인다(재리뷰
      // 2026-09-26 MINOR) — 다음 hop으로 넘어가기 전에 반드시 비운다.
      await res.body?.cancel();
      if (!location) throw new Error(`redirect without Location header at hop ${hop}`);
      if (hop === MAX_CLIP_REDIRECTS) throw new Error(`too many redirects (> ${MAX_CLIP_REDIRECTS})`);
      currentUrl = new URL(location, currentUrl).toString();
      continue;
    }
    return res;
  }
  throw new Error(`too many redirects (> ${MAX_CLIP_REDIRECTS})`);
}

async function downloadClipToLocal(originalUrl: string, tenantId: string | null): Promise<{ url: string; localSaveFailed: boolean }> {
  try {
    const videosDir = tenantVideosDir(tenantId);
    if (!videosDir) throw new Error("invalid tenant id");
    if (!isSafeExternalMediaUrl(originalUrl)) throw new Error("unsafe external url (scheme or private/loopback host)");
    if (!fs.existsSync(videosDir)) fs.mkdirSync(videosDir, { recursive: true });
    // MINOR-4(리뷰어 P11, 코드리뷰 2026-09-26): tenants/A/videos가 tenants/B/videos로 가는
    // 심볼릭 링크면(예: 운영 실수 또는 경합 상태) 여기까지 오는 어떤 검사도 그 사실을
    // 못 잡는다 — 저장 직전에 storage.checkGeneratedMediaDirSafety로 이 폴더가 DATA_DIR
    // 아래 논리 경로 그대로인지(링크로 다른 작업 공간을 가리키지 않는지) 마지막으로
    // 확인한다. "safe"가 아니면 쓰지 않고 localSaveFailed로 닫는다.
    if (checkGeneratedMediaDirSafety(videosDir) !== "safe") {
      throw new Error("videos dir is not safe (symlink or path escape) — refusing to write");
    }
    // MAJOR-2(코드리뷰 2026-09-26, 리뷰어 P9 재현): 파일명을 제공자 clipId로 만들면
    // (`clip-${clipId}-...`) 그 제공자가 "x/../../../<B>/videos/pwn" 같은 id를 돌려줬을 때
    // path.join이 상위 경로로 그대로 벗어나 다른 테넌트 폴더에 쓴다. 파일명은 clipId와
    // 전혀 무관하게 crypto.randomUUID()로 만든다(storage.saveMedia와 동일 패턴) — 외부
    // 입력이 파일명 문자열에 단 한 글자도 섞이지 않는다.
    const filename = `clip-${crypto.randomUUID()}.mp4`;
    const filePath = path.join(videosDir, filename);
    // 2중 방어: 위 filename이 이미 randomUUID 기반이라 이탈이 불가능하지만, 다음 사람이
    // filename 생성 로직을 실수로 바꿔도 여기서 막히도록 containment를 직접 확인한다.
    const resolvedDir = path.resolve(videosDir);
    const resolvedFile = path.resolve(filePath);
    if (resolvedFile !== path.join(resolvedDir, filename)) {
      throw new Error("path containment violation");
    }
    const res = await fetchClipWithValidatedRedirects(originalUrl);
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const buf = Buffer.from(await res.arrayBuffer());
    fs.writeFileSync(filePath, buf);
    return { url: filename, localSaveFailed: false };
  } catch (e) {
    // ADR-007(MINOR-2, 코드리뷰 2026-09-26): 조용히 원본 URL로 폴백하지 않는다 — 로컬
    // 저장이 왜 실패했는지 로그로 남기고, 호출 쪽이 판별할 수 있게 localSaveFailed를
    // 함께 돌려준다(응답에 실려 UI/후속 로직이 "우리 서버 파일이 아니다"를 알 수 있다).
    console.error(
      `[clipping.downloadClipToLocal] 로컬 저장 실패, 원본 URL로 폴백: reason=${e instanceof Error ? e.message : String(e)}`,
    );
    return { url: originalUrl, localSaveFailed: true };
  }
}

async function callReap(apiKey: string, videoUrl: string, tenantId: string | null, options: any = {}): Promise<RepurposeResult> {
  const base = "https://api.reap.video/v1/automation";
  // Example based on public docs: create clips job
  const createRes = await fetch(`${base}/clips`, {
    method: "POST",
    headers: {
      "Authorization": `Bearer ${apiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      videoUrl,
      ...options,
    }),
  });

  if (!createRes.ok) {
    const err = await createRes.text();
    throw new Error(`Reap create failed: ${createRes.status} ${err}`);
  }

  const { projectId } = await createRes.json();

  // Poll (simple for 0차)
  let status = "processing";
  let attempts = 0;
  while (status !== "completed" && attempts < 30) {
    await new Promise(r => setTimeout(r, 3000));
    const sRes = await fetch(`${base}/status/${projectId}`, {
      headers: { "Authorization": `Bearer ${apiKey}` },
    });
    const s = await sRes.json();
    status = s.status || s.state || "processing";
    attempts++;
  }

  const res = await fetch(`${base}/clips/${projectId}`, {
    headers: { "Authorization": `Bearer ${apiKey}` },
  });
  const data = await res.json();

  // Normalize - Reap returns clips array in their format
  const rawClips = (data.clips || data.results || []).map((c: any, i: number) => ({
    id: c.id || `reap-${i}`,
    url: c.url || c.downloadUrl || c.videoUrl,
    title: c.title,
    caption: c.caption || c.description,
    viralScore: c.viral_score || c.score,
    duration: c.duration,
  })).filter((c: any) => c.url);

  const clips: ClipCandidate[] = await Promise.all(rawClips.map(async (c: any) => {
    const dl = await downloadClipToLocal(c.url, tenantId);
    return { ...c, url: dl.url, localSaveFailed: dl.localSaveFailed };
  }));

  return { provider: "reap", clips, raw: data };
}

async function callSsemble(apiKey: string, videoUrl: string, tenantId: string | null, options: any = {}): Promise<RepurposeResult> {
  const base = "https://aiclipping.ssemble.com/api/v1";
  const createRes = await fetch(`${base}/shorts/create`, {
    method: "POST",
    headers: {
      "X-API-Key": apiKey,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      url: videoUrl,
      preferredLength: options.preferredLength || "under60sec",
      ...options,
    }),
  });

  if (!createRes.ok) {
    const err = await createRes.text();
    throw new Error(`Ssemble create failed: ${createRes.status} ${err}`);
  }

  const { data: createData } = await createRes.json();
  const requestId = createData.requestId;

  // Poll
  let status = "processing";
  let attempts = 0;
  while (status !== "completed" && attempts < 30) {
    await new Promise(r => setTimeout(r, 3000));
    const sRes = await fetch(`${base}/shorts/${requestId}/status`, {
      headers: { "X-API-Key": apiKey },
    });
    const sData = await sRes.json();
    status = sData.data?.status || "processing";
    attempts++;
  }

  const res = await fetch(`${base}/shorts/${requestId}`, {
    headers: { "X-API-Key": apiKey },
  });
  const final = await res.json();
  const shorts = final.data?.shorts || [];

  const rawClips = shorts.map((s: any, i: number) => ({
    id: s.id || `ssemble-${i}`,
    url: s.video_url,
    title: s.title,
    caption: s.caption,
    viralScore: s.viral_score,
    duration: s.duration,
  })).filter((c: any) => c.url);

  const clips: ClipCandidate[] = await Promise.all(rawClips.map(async (c: any) => {
    const dl = await downloadClipToLocal(c.url, tenantId);
    return { ...c, url: dl.url, localSaveFailed: dl.localSaveFailed };
  }));

  return { provider: "ssemble", clips, raw: final };
}

/**
 * Main entry: repurpose long video using configured provider.
 * Supports YouTube URL (and file ref later).
 */
export async function repurposeVideo(input: { videoUrl?: string; fileRef?: string }, tenantId: string | null, options: any = {}): Promise<RepurposeResult> {
  const cfg = getClippingConfig();
  const provider = (cfg.provider || "reap") as "reap" | "ssemble";
  const apiKey = cfg.apiKey || "";

  if (!apiKey) {
    // 0차 dev fallback: mock some clips (for testing without key)
    return {
      provider: "mock",
      clips: [
        { id: "mock-1", url: input.videoUrl || "https://example.com/mock-clip1.mp4", title: "Hook clip", caption: "강력한 첫 문장으로 시작", viralScore: 8.5, duration: 45 },
        { id: "mock-2", url: input.videoUrl || "https://example.com/mock-clip2.mp4", title: "Key insight", caption: "핵심 인사이트 3가지", viralScore: 7.2, duration: 38 },
      ],
    };
  }

  const url = input.videoUrl;
  if (!url) throw new Error("videoUrl required for now (file support later)");

  if (provider === "ssemble") {
    return callSsemble(apiKey, url, tenantId, options);
  }
  return callReap(apiKey, url, tenantId, options);
}
