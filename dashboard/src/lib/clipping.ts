import fs from "fs";
import path from "path";
import crypto from "crypto";
import { readJson, dataPath } from "./file-io";
import { tenantVideosDir } from "./storage";

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

// 127.0.0.0/8, 10/8, 172.16/12, 192.168/16, 169.254/16(클라우드 메타데이터 포함),
// 0.0.0.0, localhost, IPv6 루프백/링크로컬/ULA을 대략 차단한다. DNS 리바인딩까지 막는
// 완전한 SSRF 방어는 아니다 — "최소한 스킴 제한 + 사설·루프백 IP 호스트 차단"이라는
// 리뷰 요구 범위 안의 방어다(MINOR-3, 코드리뷰 2026-09-26).
function isPrivateOrLoopbackHost(hostname: string): boolean {
  const h = hostname.toLowerCase().replace(/^\[|\]$/g, "");
  if (h === "localhost" || h.endsWith(".localhost")) return true;
  const ipv4 = h.match(/^(\d{1,3})\.(\d{1,3})\.(\d{1,3})\.(\d{1,3})$/);
  if (ipv4) {
    const a = Number(ipv4[1]);
    const b = Number(ipv4[2]);
    if (a === 127 || a === 10 || a === 0) return true;
    if (a === 172 && b >= 16 && b <= 31) return true;
    if (a === 192 && b === 168) return true;
    if (a === 169 && b === 254) return true; // 169.254.169.254 클라우드 메타데이터 포함
    return false;
  }
  if (h === "::1" || h === "::") return true;
  if (h.startsWith("fe80:") || h.startsWith("fc") || h.startsWith("fd")) return true; // link-local/ULA
  return false;
}

function isSafeExternalMediaUrl(raw: string): boolean {
  try {
    const u = new URL(raw);
    if (u.protocol !== "http:" && u.protocol !== "https:") return false;
    if (isPrivateOrLoopbackHost(u.hostname)) return false;
    return true;
  } catch {
    return false;
  }
}

async function downloadClipToLocal(originalUrl: string, tenantId: string | null): Promise<{ url: string; localSaveFailed: boolean }> {
  try {
    const videosDir = tenantVideosDir(tenantId);
    if (!videosDir) throw new Error("invalid tenant id");
    if (!isSafeExternalMediaUrl(originalUrl)) throw new Error("unsafe external url (scheme or private/loopback host)");
    if (!fs.existsSync(videosDir)) fs.mkdirSync(videosDir, { recursive: true });
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
    const res = await fetch(originalUrl);
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
