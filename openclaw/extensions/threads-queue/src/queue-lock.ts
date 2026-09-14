import fs from "node:fs/promises";
import crypto from "node:crypto";
import path from "node:path";

// queue.json 의 교차 프로세스 잠금. 대시보드와 발행기가 같은 자물쇠를 쓴다.
//
// 갭(2026-09-13 Codex 교차 리뷰 MAJOR 1): 대시보드는 mutateJson 안에서
// proper-lockfile 로 queue.json 을 잠그는데, 발행기 extension 의 readQueue/writeQueue 는
// 잠금 없이 읽고 썼다. 임시파일 + rename 은 "쓰기" 만 원자적으로 만들 뿐
// "읽고 고쳐 쓰기(read-modify-write)" 사이의 경합은 막지 못한다.
// 그래서 발행기가 취소 직전에 읽어둔 낡은 큐를 그대로 되써서 고객의 취소를
// 통째로 덮어버리는 lost update 가 남아 있었다. 3중 관문을 다 통과해도
// 파일이 되돌아가면 소용이 없다.
//
// 왜 이 구현인가: proper-lockfile 은 `${file}.lock` 디렉터리를 mkdir 로 만들어 잠근다
// (dashboard/node_modules/proper-lockfile/lib/lockfile.js 의 getLockFile·acquireLock).
// 같은 규약을 그대로 따르면 의존성을 새로 넣지 않고도 두 프로세스가 실제로
// 같은 자물쇠를 놓고 다툰다. extension 은 openclaw 런타임에서 돌아 dashboard 의
// node_modules 를 쓸 수 없으므로 규약만 맞춘다.

const STALE_MS = 10_000; // proper-lockfile 기본값과 동일
const RETRY_DELAY_MS = 50;
const MAX_WAIT_MS = 5_000;

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

function lockPath(filePath: string): string {
  return `${filePath}.lock`;
}

function ownerPath(filePath: string): string {
  return path.join(lockPath(filePath), "owner");
}

async function tryAcquire(filePath: string, ownerToken: string): Promise<boolean> {
  try {
    await fs.mkdir(lockPath(filePath));
    try {
      await fs.writeFile(ownerPath(filePath), ownerToken, { encoding: "utf-8", flag: "wx" });
    } catch (error) {
      await fs.rm(lockPath(filePath), { recursive: true, force: true });
      throw error;
    }
    return true;
  } catch (e) {
    const err = e as NodeJS.ErrnoException;
    if (err.code !== "EEXIST") throw e;
    // 잠금이 이미 있다. 죽은 프로세스가 남긴 것이면 회수한다(그렇지 않으면 큐가 영구히 멈춘다).
    try {
      const stat = await fs.stat(lockPath(filePath));
      if (Date.now() - stat.mtimeMs > STALE_MS) {
        const stalePath = `${lockPath(filePath)}.stale.${process.pid}.${crypto.randomUUID()}`;
        await fs.rename(lockPath(filePath), stalePath).catch(() => {});
        await fs.rm(stalePath, { recursive: true, force: true }).catch(() => {});
      }
    } catch {
      /* 그 사이 풀렸다 — 다음 회차에 다시 시도한다 */
    }
    return false;
  }
}

/**
 * queue.json 을 잠근 상태에서 fn 을 실행한다. fn 안에서 반드시 파일을 새로 읽어라
 * (잠금 밖에서 읽어둔 값을 쓰면 이 잠금은 아무 것도 지키지 못한다).
 *
 * 잠금을 못 잡으면 예외를 던진다. 조용히 잠금 없이 진행하는 것이 이 결함의 원인이었으므로
 * fail-open 하지 않는다.
 */
export async function withQueueLock<T>(filePath: string, fn: () => Promise<T>): Promise<T> {
  const deadline = Date.now() + MAX_WAIT_MS;
  const ownerToken = crypto.randomUUID();
  let acquired = false;
  while (!(acquired = await tryAcquire(filePath, ownerToken))) {
    if (Date.now() > deadline) {
      throw new Error(`queue lock timeout: ${lockPath(filePath)} (다른 프로세스가 큐를 쓰고 있습니다)`);
    }
    await sleep(RETRY_DELAY_MS);
  }
  let stopped = false;
  let heartbeat = Promise.resolve();
  const timer = setInterval(() => {
    if (stopped) return;
    heartbeat = heartbeat.then(async () => {
      const currentOwner = await fs.readFile(ownerPath(filePath), "utf-8").catch(() => "");
      if (currentOwner !== ownerToken) return;
      const now = new Date();
      await fs.utimes(lockPath(filePath), now, now).catch(() => {});
    });
  }, Math.max(1_000, Math.floor(STALE_MS / 3)));
  timer.unref();
  try {
    return await fn();
  } finally {
    stopped = true;
    clearInterval(timer);
    await heartbeat.catch(() => {});
    const currentOwner = await fs.readFile(ownerPath(filePath), "utf-8").catch(() => "");
    if (currentOwner === ownerToken) {
      const releasePath = `${lockPath(filePath)}.release.${process.pid}.${ownerToken}`;
      const moved = await fs.rename(lockPath(filePath), releasePath).then(() => true).catch(() => false);
      if (moved) await fs.rm(releasePath, { recursive: true, force: true }).catch(() => {});
    }
  }
}
