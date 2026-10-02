// Higgsfield 생성기 호출 전체 동시 상한 — 서버측 백그라운드 완료 루프가 여러 작업을 동시에
// 폴링하면서 VM에 부담을 주지 않게 한다(세션맥락: "루프 전체 동시 생성기 호출 상한").
// 화면 GET 경로와 백그라운드 루프가 같은 프로세스 메모리의 이 세마포어를 공유한다.
const MAX_CONCURRENT = Number(process.env.HIGGSFIELD_MAX_CONCURRENT_CALLS || 3);

let active = 0;
const queue: Array<() => void> = [];

function acquire(): Promise<void> {
  if (active < MAX_CONCURRENT) {
    active += 1;
    return Promise.resolve();
  }
  return new Promise((resolve) => {
    queue.push(() => {
      active += 1;
      resolve();
    });
  });
}

function release(): void {
  active = Math.max(0, active - 1);
  const next = queue.shift();
  if (next) next();
}

export async function withHiggsfieldConcurrency<T>(fn: () => Promise<T>): Promise<T> {
  await acquire();
  try {
    return await fn();
  } finally {
    release();
  }
}

/** 테스트 전용 — 모듈 전역 상태를 초기화한다. */
export function __resetHiggsfieldConcurrencyForTest(): void {
  active = 0;
  queue.length = 0;
}
