import { mutateJson, readJson, dataPath } from "./file-io";
import { mirrorQueuePostDetailed, type QueueMirrorPost } from "./queue-store";

// 파일(queue.json)과 DB(queue_posts) 두 저장소를 수렴시키는 outbox.
//
// 갭: docs/_archive/legacy-20260912/audit/osmu-code-review-2026-09-12.md 의 MAJOR
// "cancel/route.ts:58 — JSON 취소 뒤 mirrorQueuePost 의 false 를 무시하고 {ok:true} 를
// 반환해 부분 실패를 전체 성공으로 센다 ... 재시도 가능한 outbox 또는 상태 버전으로
// 두 저장소를 수렴시킨다".
//
// 계약:
//  - queue.json 이 여전히 진실의 원천이다. 파일 쓰기가 성공하면 고객 요청은 성립한 것이다.
//  - DB 미러가 실패하면 그 사실을 응답에 그대로 드러내고(deferred) outbox 에 적는다.
//    "조용한 성공"을 만들지 않는다.
//  - drainQueueMirrorOutbox 가 나중에 같은 항목을 다시 밀어 두 저장소를 맞춘다.

const OUTBOX_FILE = "queue-mirror-outbox.json";
const MAX_ENTRIES = 500;

export interface QueueMirrorOutboxEntry {
  postId: string;
  tenantId: string | null;
  post: QueueMirrorPost;
  reason: string;
  attempts: number;
  firstFailedAt: string;
  lastFailedAt: string;
}

interface OutboxFile {
  entries: QueueMirrorOutboxEntry[];
  /** 상한을 넘겨 버려진 항목 수. 조용히 사라지면 운영자가 불일치를 영영 모른다. */
  droppedCount?: number;
  lastDroppedAt?: string | null;
}

export function readQueueMirrorOutbox(): QueueMirrorOutboxEntry[] {
  return (readJson<OutboxFile>(dataPath(OUTBOX_FILE)) || { entries: [] }).entries || [];
}

async function writeOutbox(fn: (entries: QueueMirrorOutboxEntry[]) => QueueMirrorOutboxEntry[]): Promise<void> {
  await mutateJson<OutboxFile>(
    dataPath(OUTBOX_FILE),
    (cur) => {
      const next = fn(cur.entries || []);
      // Codex 교차 리뷰 MINOR 6 — 상한 초과분을 조용히 버리면 DB 불일치가 기록 없이 사라진다.
      // 버리더라도 몇 건을 버렸는지는 남기고 운영 로그로 소리를 낸다.
      const overflow = Math.max(0, next.length - MAX_ENTRIES);
      if (overflow > 0) {
        console.error(`[queue-mirror-outbox] 상한 초과로 ${overflow}건을 폐기한다. DB 미러가 계속 실패하고 있다.`);
      }
      return {
        entries: next.slice(-MAX_ENTRIES),
        droppedCount: (cur.droppedCount ?? 0) + overflow,
        lastDroppedAt: overflow > 0 ? new Date().toISOString() : (cur.lastDroppedAt ?? null),
      };
    },
    { entries: [], droppedCount: 0, lastDroppedAt: null },
  );
}

export type QueuePersistenceResult = {
  /** queue.json 쓰기 결과. 이 경로가 성공해야 고객 요청이 성립한다. */
  file: "ok";
  /** DB 미러 결과. deferred 면 outbox 에 적혀 있고 아직 두 저장소가 어긋나 있다. */
  db: "ok" | "skipped" | "deferred";
  /** deferred 인 이유(고객 안내가 아니라 운영 진단용). */
  dbReason?: string;
};

/**
 * queue.json 쓰기 직후 호출한다. DB 미러 실패를 삼키지 않고 outbox 에 적은 뒤
 * 호출부가 응답에 분리해 실을 수 있는 결과를 돌려준다.
 */
export async function mirrorQueuePostWithOutbox(
  tenantId: string | null,
  post: QueueMirrorPost,
): Promise<QueuePersistenceResult> {
  const outcome = await mirrorQueuePostDetailed(tenantId, post);
  if (outcome.status === "ok") {
    await clearQueueMirrorOutboxEntry(post.id);
    return { file: "ok", db: "ok" };
  }
  if (outcome.status === "skipped") {
    // DB 적용 대상이 아니다(운영자 모드·레거시 id). 어긋남이 아니므로 outbox 에 넣지 않는다.
    return { file: "ok", db: "skipped", dbReason: outcome.reason };
  }

  const now = new Date().toISOString();
  await writeOutbox((entries) => {
    const existing = entries.find((e) => e.postId === post.id);
    if (existing) {
      existing.attempts += 1;
      existing.lastFailedAt = now;
      existing.reason = outcome.message;
      existing.post = post;
      existing.tenantId = tenantId;
      return entries;
    }
    return [
      ...entries,
      {
        postId: post.id,
        tenantId,
        post,
        reason: outcome.message,
        attempts: 1,
        firstFailedAt: now,
        lastFailedAt: now,
      },
    ];
  });
  return { file: "ok", db: "deferred", dbReason: outcome.message };
}

async function clearQueueMirrorOutboxEntry(postId: string): Promise<void> {
  const entries = readQueueMirrorOutbox();
  if (!entries.some((e) => e.postId === postId)) return;
  await writeOutbox((cur) => cur.filter((e) => e.postId !== postId));
}

/**
 * 밀린 미러를 다시 민다. 성공한 항목만 outbox 에서 빠진다.
 *
 * Codex 교차 리뷰 MAJOR 5: 처음엔 outbox 에 담아둔 payload 를 그대로 다시 upsert 했다.
 * 그 사이 같은 글에 새 취소나 발행 결과가 반영됐으면 DB 가 과거 상태로 역행한다.
 * queue.json 이 진실의 원천이므로, 밀 때는 저장된 스냅샷이 아니라 파일의 현재 글을
 * 다시 읽어서 민다. 스냅샷은 글이 사라진 경우의 최후 수단으로만 쓴다.
 */
export async function drainQueueMirrorOutbox(): Promise<{
  total: number;
  converged: number;
  stillPending: number;
}> {
  const entries = readQueueMirrorOutbox();
  const live = readJson<{ posts: Array<Record<string, unknown>> }>(dataPath("queue.json")) || { posts: [] };
  const converged: string[] = [];
  for (const entry of entries) {
    const current = (live.posts || []).find((p) => p.id === entry.postId) as QueueMirrorPost | undefined;
    const outcome = await mirrorQueuePostDetailed(entry.tenantId, current ?? entry.post);
    if (outcome.status === "ok" || outcome.status === "skipped") converged.push(entry.postId);
  }
  if (converged.length > 0) {
    await writeOutbox((cur) => cur.filter((e) => !converged.includes(e.postId)));
  }
  return {
    total: entries.length,
    converged: converged.length,
    stillPending: entries.length - converged.length,
  };
}
