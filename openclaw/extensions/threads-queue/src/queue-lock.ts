import fs from "node:fs/promises";
import path from "node:path";
import lockfile from "proper-lockfile";

// dashboard/src/lib/file-io.ts와 같은 proper-lockfile 구현과 재시도 규약을 쓴다.
// `${file}.lock` 안에 독자 파일을 넣으면 상대 프로세스의 stale 정리가 영구 실패한다.
// 게시 워커의 정상 임계 구간(최대 약 13초) 끝자락에 합류한 프로세스도
// 잠금이 풀릴 때까지 기다릴 수 있도록 총 3.55초의 재시도 여유를 둔다.
const RETRIES = { retries: 7, factor: 2, minTimeout: 50, maxTimeout: 1_000 } as const;

/** queue.json을 두 프로세스가 같은 잠금 규약으로 직렬화한다. */
export async function withQueueLock<T>(filePath: string, fn: () => Promise<T>): Promise<T> {
  await fs.mkdir(path.dirname(filePath), { recursive: true });
  const handle = await fs.open(filePath, "a");
  await handle.close();
  let release: Awaited<ReturnType<typeof lockfile.lock>>;
  try {
    release = await lockfile.lock(filePath, { retries: RETRIES });
  } catch (error) {
    if (error instanceof Error && (error as NodeJS.ErrnoException).code === "ELOCKED") {
      throw new Error("queue lock timeout");
    }
    throw error;
  }
  try {
    return await fn();
  } finally {
    await release();
  }
}
