import fs from "fs";
import path from "path";
import { readJson, dataPath } from "./file-io";
import { tenantVideosDir } from "./storage";

export interface ClippingConfig {
  provider?: "reap" | "ssemble" | "";
  apiKey?: string;
  baseUrl?: string;
}

export interface ClipCandidate {
  id: string;
  url: string; // local filename after save, or original for reference
  title?: string;
  caption?: string;
  viralScore?: number;
  duration?: number;
  startSec?: number;
}

export interface RepurposeResult {
  provider: string;
  clips: ClipCandidate[];
  raw?: any;
}

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
async function downloadClipToLocal(originalUrl: string, clipId: string, tenantId: string | null): Promise<string> {
  try {
    const videosDir = tenantVideosDir(tenantId);
    if (!videosDir) throw new Error("invalid tenant id");
    if (!fs.existsSync(videosDir)) fs.mkdirSync(videosDir, { recursive: true });
    const filename = `clip-${clipId}-${Date.now()}.mp4`;
    const filePath = path.join(videosDir, filename);
    const res = await fetch(originalUrl);
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const buf = Buffer.from(await res.arrayBuffer());
    fs.writeFileSync(filePath, buf);
    return filename; // return filename, UI will use as /videos/filename or the list style
  } catch (e) {
    console.error("Failed to download clip, using original url", e);
    return originalUrl; // fallback
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

  const clips: ClipCandidate[] = await Promise.all(rawClips.map(async (c: any) => ({
    ...c,
    url: await downloadClipToLocal(c.url, c.id, tenantId),
  })));

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

  const clips: ClipCandidate[] = await Promise.all(rawClips.map(async (c: any) => ({
    ...c,
    url: await downloadClipToLocal(c.url, c.id, tenantId),
  })));

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
