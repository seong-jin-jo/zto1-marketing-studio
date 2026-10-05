import fs from "node:fs";
import path from "node:path";
import { bundle } from "@remotion/bundler";

const ENTRY = path.join(process.cwd(), "remotion", "entry.ts");
const MAX_CONCURRENT_RENDERS = 1;
export const MAX_WAITING_RENDERS = 2;
let cachedBundleUrl: string | null = null;
let activeRenderCount = 0;
const renderWaitQueue: Array<() => void> = [];

export class RemotionRenderBusyError extends Error {
  readonly code = "CARD_RENDER_BUSY";
  readonly status = 503;

  constructor() {
    super("CARD_RENDER_BUSY: 렌더 작업이 몰려 새 요청을 바로 시작할 수 없습니다.");
    this.name = "RemotionRenderBusyError";
  }
}

export async function getRemotionBundleUrl(): Promise<string> {
  if (cachedBundleUrl && fs.existsSync(cachedBundleUrl)) return cachedBundleUrl;
  cachedBundleUrl = await bundle({
    entryPoint: ENTRY,
    onProgress: () => {},
    webpackOverride: (configuration) => ({
      ...configuration,
      resolve: {
        ...configuration.resolve,
        alias: {
          ...configuration.resolve?.alias,
          "@": path.join(process.cwd(), "src"),
        },
      },
    }),
  });
  return cachedBundleUrl;
}

export function remotionBrowserExecutable(): string | undefined {
  return process.env.REMOTION_CHROME_PATH || undefined;
}

async function acquireRenderSlot(): Promise<void> {
  if (activeRenderCount < MAX_CONCURRENT_RENDERS) {
    activeRenderCount += 1;
    return;
  }
  if (renderWaitQueue.length >= MAX_WAITING_RENDERS) throw new RemotionRenderBusyError();
  await new Promise<void>((resolve) => renderWaitQueue.push(resolve));
  activeRenderCount += 1;
}

function releaseRenderSlot(): void {
  activeRenderCount -= 1;
  renderWaitQueue.shift()?.();
}

export async function withRemotionRenderSlot<T>(render: () => Promise<T>): Promise<T> {
  await acquireRenderSlot();
  try {
    return await render();
  } finally {
    releaseRenderSlot();
  }
}

export function remotionRenderSlotDebugState(): { active: number; waiting: number } {
  return { active: activeRenderCount, waiting: renderWaitQueue.length };
}
