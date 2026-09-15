import fs from "node:fs/promises";
import path from "node:path";
import lockfile from "proper-lockfile";

// dashboard/src/lib/file-io.ts와 같은 proper-lockfile 구현과 재시도 규약을 쓴다.
// `${file}.lock` 안에 독자 파일을 넣으면 상대 프로세스의 stale 정리가 영구 실패한다.
// 게시 워커의 정상 임계 구간(최대 약 13초) 끝자락에 합류한 프로세스도
// 잠금이 풀릴 때까지 기다릴 수 있도록 총 3.55초의 재시도 여유를 둔다.
const RETRIES = { retries: 7, factor: 2, minTimeout: 50, maxTimeout: 1_000 } as const;
const EMPTY_QUEUE = { version: 2, posts: [] } as const;

async function initializeQueueFile(filePath: string): Promise<void> {
  try {
    const raw = await fs.readFile(filePath, "utf8");
    if (raw.trim()) return;
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code !== "ENOENT") throw error;
  }

  const tempPath = `${filePath}.init.${process.pid}`;
  try {
    await fs.writeFile(tempPath, JSON.stringify(EMPTY_QUEUE, null, 2), "utf8");
    await fs.rename(tempPath, filePath);
  } finally {
    await fs.rm(tempPath, { force: true }).catch(() => {});
  }
}

/** queue.json을 두 프로세스가 같은 잠금 규약으로 직렬화한다. */
export async function withQueueLock<T>(filePath: string, fn: () => Promise<T>): Promise<T> {
  await fs.mkdir(path.dirname(filePath), { recursive: true });
  let release: Awaited<ReturnType<typeof lockfile.lock>>;
  try {
    // realpath:false면 대상 파일이 아직 없어도 같은 `${filePath}.lock`을 먼저 잡을 수 있다.
    // 첫 프로세스가 잠금 안에서 완전한 JSON을 원자 배치하므로 다른 독자가 0바이트 파일을
    // 관찰하지 않는다. Dashboard의 proper-lockfile 사용자도 같은 lock 경로에서 기다린다.
    release = await lockfile.lock(filePath, { retries: RETRIES, realpath: false });
  } catch (error) {
    if (error instanceof Error && (error as NodeJS.ErrnoException).code === "ELOCKED") {
      throw new Error("queue lock timeout");
    }
    throw error;
  }
  try {
    await initializeQueueFile(filePath);
    return await fn();
  } finally {
    await release();
  }
}
