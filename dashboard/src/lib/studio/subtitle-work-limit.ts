const GLOBAL_LIMIT = 2;
const WAITING_LIMIT = 8;

type Waiter = {
  tenantId: string;
  resolve: (release: (() => void) | null) => void;
};

let active = 0;
const activeTenants = new Set<string>();
const waiting: Waiter[] = [];

function releaseFor(tenantId: string): () => void {
  let released = false;
  return () => {
    if (released) return;
    released = true;
    active -= 1;
    activeTenants.delete(tenantId);
    pump();
  };
}

function pump(): void {
  if (active >= GLOBAL_LIMIT) return;
  const index = waiting.findIndex((entry) => !activeTenants.has(entry.tenantId));
  if (index < 0) return;
  const [entry] = waiting.splice(index, 1);
  active += 1;
  activeTenants.add(entry.tenantId);
  entry.resolve(releaseFor(entry.tenantId));
  pump();
}

/** 테넌트당 1개, 프로세스 전체 2개만 ffprobe/ffmpeg 작업을 실행한다. */
export async function acquireSubtitleSlot(tenantId: string): Promise<(() => void) | null> {
  if (active < GLOBAL_LIMIT && !activeTenants.has(tenantId)) {
    active += 1;
    activeTenants.add(tenantId);
    return releaseFor(tenantId);
  }
  if (waiting.length >= WAITING_LIMIT) return null;
  return new Promise((resolve) => {
    waiting.push({ tenantId, resolve });
    pump();
  });
}

export const subtitleWorkLimitTesting = {
  reset() {
    active = 0;
    activeTenants.clear();
    waiting.splice(0).forEach((entry) => entry.resolve(null));
  },
};
