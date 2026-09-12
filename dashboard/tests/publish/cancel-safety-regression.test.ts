// 2026-09-12 감사(docs/_archive/legacy-20260912/audit/osmu-code-review-2026-09-12.md)의
// 발행 중지 안전 MAJOR 4건을 감사 문서에 적힌 재현 절차 그대로 테스트로 옮긴 것이다.
//
// 회장이 가장 중요하게 보는 축: "고객이 발행을 멈췄는데 실제로는 올라가는가."
// 그래서 실제 외부 발행은 절대 일으키지 않고, 파일 상태와 판정 계약만으로 증명한다.
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import { createTempDir, setupTestEnv, cleanupTestEnv, copyFixture, readTempJson } from '../helpers';
import {
  claimPost,
  isClaimActive,
  verifyPublishable,
  type ClaimablePost,
} from '../../../extensions/threads-queue/src/queue-claim';

let tmpDir: string;

beforeEach(() => {
  vi.resetModules();
  tmpDir = createTempDir();
  setupTestEnv(tmpDir);
  copyFixture(tmpDir, 'queue.json');
});

afterEach(() => {
  cleanupTestEnv(tmpDir);
});

function params(postId: string) {
  return { params: Promise.resolve({ postId }) };
}

function queueFile() {
  return path.join(tmpDir, 'queue.json');
}

function readQueue(): { posts: Array<Record<string, unknown>> } {
  return JSON.parse(fs.readFileSync(queueFile(), 'utf-8'));
}

function writeQueue(queue: unknown) {
  fs.writeFileSync(queueFile(), JSON.stringify(queue, null, 2));
}

async function cancel(postId: string) {
  const { POST } = await import('@/app/api/queue/[postId]/cancel/route');
  return POST(new Request(`http://localhost/api/queue/${postId}/cancel`, { method: 'POST' }), params(postId));
}

// ─────────────────────────────────────────────────────────────────────────────
// MAJOR 1 — 발행기 경합 (threads-queue-tool.ts:345)
// 재현: worker A 가 get_approved 응답을 받은 직후 고객 B 가 cancel 200 을 받고,
// A 가 보관한 본문으로 공급자 게시 후 update_channel 을 호출하면 게시가 실제로 발생한다.
// ─────────────────────────────────────────────────────────────────────────────
describe('발행기 경합 — 취소가 200 을 준 뒤에는 외부 게시가 진행되지 않는다', () => {
  it('워커가 가져간(claim) 글을 고객이 취소하면, 공급자 호출 직전 재검증이 발행을 막는다', async () => {
    // 1) worker A 가 승인된 글을 가져가며 lease 를 건다.
    const queue = readQueue();
    const target = queue.posts.find((p) => p.id === 'post-002') as ClaimablePost;
    target.scheduledAt = '2026-04-02T12:30:00Z';
    const claim = claimPost(target, { workerId: 'worker-A', token: 'token-A' });
    expect(claim).not.toBeNull();
    writeQueue(queue);

    // worker A 는 이 시점에 본문 스냅샷을 손에 들고 있다.
    const snapshot = { ...target };

    // 2) 그 사이 고객 B 가 발행 중지를 눌러 200 을 받는다.
    const res = await cancel('post-002');
    expect(res.status).toBe(200);

    // 3) worker A 가 공급자를 부르기 직전 재검증한다. 파일에서 새로 읽는다.
    const fresh = readQueue().posts.find((p) => p.id === 'post-002') as ClaimablePost;
    const verdict = verifyPublishable(fresh, 'threads', { claimToken: 'token-A' });

    expect(verdict.ok).toBe(false);
    expect(verdict.ok === false && verdict.reason).toBe('post-canceled');
    // 스냅샷만 보면 아직 approved 로 보인다 — 바로 이것이 감사가 지적한 위험이다.
    expect(snapshot.status).toBe('approved');
    // 취소는 lease 도 함께 해제한다.
    expect(fresh.claim ?? null).toBeNull();
    expect(isClaimActive(fresh)).toBe(false);
  });

  it('한 채널만 취소된 경우에도 그 채널 발행은 막고, 살아 있는 채널은 막지 않는다', () => {
    const post: ClaimablePost = {
      id: 'post-race',
      status: 'approved',
      channels: {
        threads: { status: 'canceled' },
        x: { status: 'pending' },
      },
      claim: null,
    };
    claimPost(post, { workerId: 'worker-A', token: 'token-A' });

    const threads = verifyPublishable(post, 'threads', { claimToken: 'token-A' });
    expect(threads.ok).toBe(false);
    expect(threads.ok === false && threads.reason).toBe('channel-canceled');

    expect(verifyPublishable(post, 'x', { claimToken: 'token-A' }).ok).toBe(true);
  });

  it('같은 글을 두 워커가 동시에 가져갈 수 없다(lease)', () => {
    const post: ClaimablePost = { id: 'post-lease', status: 'approved', channels: { threads: { status: 'pending' } } };
    expect(claimPost(post, { workerId: 'A', token: 'tA' })).not.toBeNull();
    expect(claimPost(post, { workerId: 'B', token: 'tB' })).toBeNull();
    // 다른 워커의 토큰으로는 발행할 수 없다.
    const verdict = verifyPublishable(post, 'threads', { claimToken: 'tB' });
    expect(verdict.ok === false && verdict.reason).toBe('claim-mismatch');
  });

  it('만료된 lease 는 회수되어 큐가 멈추지 않는다', () => {
    const post: ClaimablePost = { id: 'post-expired', status: 'approved', channels: { threads: { status: 'pending' } } };
    const past = new Date('2026-04-02T12:00:00Z');
    claimPost(post, { workerId: 'A', token: 'tA', now: past, leaseMs: 1000 });
    const later = new Date('2026-04-02T12:10:00Z');
    expect(isClaimActive(post, later)).toBe(false);
    expect(claimPost(post, { workerId: 'B', token: 'tB', now: later })).not.toBeNull();
    // 죽은 워커 A 가 뒤늦게 돌아와도 발행하지 못한다.
    const verdict = verifyPublishable(post, 'threads', { claimToken: 'tA', now: later });
    expect(verdict.ok === false && verdict.reason).toBe('claim-mismatch');
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// MAJOR 2 — 부분 실패를 전체 성공으로 셈 (cancel/route.ts:58)
// 재현: 비 UUID queue ID 또는 DB 쓰기 실패 상태에서 취소하면 파일은 canceled,
// DB 는 approved 로 남는데 API 200 과 "발행 중지됨"이 표시된다.
// ─────────────────────────────────────────────────────────────────────────────
describe('부분 실패 — 파일 결과와 DB 미러 결과를 분리해 응답한다', () => {
  it('DB 미러가 적용 대상이 아니면(비 UUID) skipped 로 명시한다', async () => {
    const res = await cancel('post-002');
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.persistence).toBeDefined();
    expect(body.persistence.file).toBe('ok');
    expect(body.persistence.db).toBe('skipped');
  });

  it('DB 쓰기가 실패하면 deferred 로 보고하고 outbox 에 적어 수렴 경로를 남긴다', async () => {
    vi.doMock('@/lib/queue-store', async () => {
      const actual = await vi.importActual<typeof import('@/lib/queue-store')>('@/lib/queue-store');
      return {
        ...actual,
        mirrorQueuePostDetailed: vi.fn(async () => ({ status: 'failed', message: 'connection refused' })),
        mirrorQueuePost: vi.fn(async () => false),
      };
    });

    const res = await cancel('post-002');
    expect(res.status).toBe(200);
    const body = await res.json();
    // 핵심: 실패를 삼키고 통짜 성공으로 세지 않는다.
    expect(body.persistence.db).toBe('deferred');
    expect(body.persistence.dbReason).toContain('connection refused');

    const outbox = readTempJson<{ entries: Array<{ postId: string; attempts: number }> }>(
      tmpDir,
      'queue-mirror-outbox.json',
    );
    expect(outbox?.entries?.map((e) => e.postId)).toContain('post-002');
    vi.doUnmock('@/lib/queue-store');
  });

  it('밀린 미러는 drain 으로 다시 밀어 두 저장소를 수렴시킨다', async () => {
    const calls: string[] = [];
    vi.doMock('@/lib/queue-store', async () => {
      const actual = await vi.importActual<typeof import('@/lib/queue-store')>('@/lib/queue-store');
      return {
        ...actual,
        mirrorQueuePostDetailed: vi.fn(async (_t: unknown, post: { id: string }) => {
          calls.push(post.id);
          return calls.length === 1 ? { status: 'failed', message: 'db down' } : { status: 'ok' };
        }),
      };
    });

    await cancel('post-002');
    const { drainQueueMirrorOutbox, readQueueMirrorOutbox } = await import('@/lib/queue-mirror-outbox');
    expect(readQueueMirrorOutbox()).toHaveLength(1);

    const drained = await drainQueueMirrorOutbox();
    expect(drained.converged).toBe(1);
    expect(drained.stillPending).toBe(0);
    expect(readQueueMirrorOutbox()).toHaveLength(0);
    vi.doUnmock('@/lib/queue-store');
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// MAJOR 3 — 부분 발행을 성과에서 숨김 (cancel/route.ts:41)
// 재현: Threads published, X pending 인 글을 취소하면 Threads 채널 정보는 남지만
// post.status 가 canceled 가 되어 성과실과 저성과 후보에서 빠진다.
// ─────────────────────────────────────────────────────────────────────────────
describe('부분 발행 — 이미 올라간 글은 취소 후에도 성과 표본에 남는다', () => {
  it('취소 응답이 이미 발행된 채널을 명시한다', async () => {
    const queue = readQueue();
    const target = queue.posts.find((p) => p.id === 'post-002') as Record<string, unknown>;
    (target.channels as Record<string, unknown>).threads = {
      status: 'published',
      publishedAt: '2026-04-02T13:00:00Z',
      mediaId: 'media-1',
    };
    writeQueue(queue);

    const res = await cancel('post-002');
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.partiallyPublished).toBe(true);
    expect(body.alreadyPublishedChannels).toEqual(['threads']);
    expect(body.post.channels.threads.status).toBe('published');
    expect(body.post.channels.x.status).toBe('canceled');
  });

  it('성과 판정은 최상위 status 가 아니라 채널별 published 로 한다', async () => {
    const { isPerformancePublished, isPartiallyPublished } = await import('@/lib/post-publish-state');
    const partiallyPublished = {
      id: 'p',
      status: 'canceled' as const,
      channels: {
        threads: { status: 'published' as const, publishedAt: '2026-04-02T13:00:00Z', error: null },
        x: { status: 'canceled' as const, publishedAt: null, error: null },
      },
    };
    expect(isPerformancePublished(partiallyPublished)).toBe(true);
    expect(isPartiallyPublished(partiallyPublished)).toBe(true);

    const nothingPublished = {
      id: 'q',
      status: 'canceled' as const,
      channels: {
        threads: { status: 'canceled' as const, publishedAt: null, error: null },
        x: { status: 'canceled' as const, publishedAt: null, error: null },
      },
    };
    expect(isPerformancePublished(nothingPublished)).toBe(false);
  });

  it('저성과 후보 조회가 부분 발행 후 취소된 글을 표본에서 빠뜨리지 않는다', async () => {
    const queue = readQueue();
    const oldEnough = new Date(Date.now() - 1000 * 60 * 60 * 24 * 30).toISOString();
    queue.posts.push({
      id: 'post-partial',
      text: '부분 발행 후 중지된 글',
      status: 'canceled',
      generatedAt: oldEnough,
      engagement: { views: 3, likes: 0, replies: 0 },
      channels: {
        threads: { status: 'published', publishedAt: oldEnough, mediaId: 'media-partial' },
        x: { status: 'canceled', publishedAt: null, error: null },
      },
    });
    writeQueue(queue);

    const { GET } = await import('@/app/api/threads/low-engagement-candidates/route');
    const res = await GET(new Request('http://localhost/api/threads/low-engagement-candidates'));
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.candidates.map((c: { id: string }) => c.id)).toContain('post-partial');
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// MAJOR 4 — 종료 상태 덮어쓰기 (cancel/route.ts:34)
// 재현: {status:"published"} 이고 channels 가 없는 글에 POST 하면 cancellable 0 인데도
// 409 가 아니라 post.status 와 canceledAt 이 덮인다.
// ─────────────────────────────────────────────────────────────────────────────
describe('종료 상태 — channels 가 없는 레거시 글을 덮어쓰지 않는다', () => {
  it('channels 없는 레거시 published 글은 409 로 거절하고 상태를 보존한다', async () => {
    const queue = readQueue();
    queue.posts.push({
      id: 'legacy-published',
      text: '레거시 발행 완료 글',
      status: 'published',
      publishedAt: '2026-04-01T09:00:00Z',
      threadsMediaId: 'legacy-media',
    });
    writeQueue(queue);

    const res = await cancel('legacy-published');
    expect(res.status).toBe(409);
    const body = await res.json();
    expect(body.code).toBe('NOTHING_TO_CANCEL');

    const onDisk = readQueue().posts.find((p) => p.id === 'legacy-published') as Record<string, unknown>;
    expect(onDisk.status).toBe('published');
    expect(onDisk.canceledAt).toBeUndefined();
  });

  it('channels 없는 레거시 failed 글도 덮어쓰지 않는다', async () => {
    const queue = readQueue();
    queue.posts.push({ id: 'legacy-failed', text: '레거시 실패 글', status: 'failed', error: 'provider 5xx' });
    writeQueue(queue);

    const res = await cancel('legacy-failed');
    expect(res.status).toBe(409);

    const onDisk = readQueue().posts.find((p) => p.id === 'legacy-failed') as Record<string, unknown>;
    expect(onDisk.status).toBe('failed');
    expect(onDisk.canceledAt).toBeUndefined();
    expect(onDisk.error).toBe('provider 5xx');
  });

  it('이미 취소된 글을 다시 취소해도 canceledAt 이 덮이지 않는다', async () => {
    const first = await cancel('post-002');
    expect(first.status).toBe(200);
    const firstCanceledAt = (readQueue().posts.find((p) => p.id === 'post-002') as Record<string, unknown>).canceledAt;

    const second = await cancel('post-002');
    expect(second.status).toBe(409);
    const secondCanceledAt = (readQueue().posts.find((p) => p.id === 'post-002') as Record<string, unknown>).canceledAt;
    expect(secondCanceledAt).toBe(firstCanceledAt);
  });

  it('channels 없는 레거시 approved 글은 정규화 후 정상 취소된다', async () => {
    const queue = readQueue();
    queue.posts.push({ id: 'legacy-approved', text: '레거시 승인 글', status: 'approved' });
    writeQueue(queue);

    const res = await cancel('legacy-approved');
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.post.status).toBe('canceled');
    expect(body.post.channels.threads.status).toBe('canceled');
  });
});

// 발행기 본체(extensions/threads-queue)가 실제로 이 가드를 경유하는지 소스 계약으로 고정한다.
// 순수 모듈만 통과시키고 도구는 옛 경로를 쓰면 경합은 그대로 남기 때문이다.
describe('발행기 도구 계약 — get_approved/update_channel 이 가드를 경유한다', () => {
  const toolSrc = () =>
    fs.readFileSync(
      path.resolve(__dirname, '../../../extensions/threads-queue/src/threads-queue-tool.ts'),
      'utf-8',
    );

  it('get_approved 가 lease 를 걸고 이미 claim 된 글을 돌려주지 않는다', () => {
    const src = toolSrc();
    expect(src).toMatch(/claimPost/);
    expect(src).toMatch(/isClaimActive/);
  });

  it('공급자 호출 직전 재검증 행동(verify_claim)이 도구에 존재한다', () => {
    expect(toolSrc()).toMatch(/case "verify_claim"/);
  });

  it('update_channel 이 published/failed 기록 전에 재검증해 취소된 글을 막는다', () => {
    const src = toolSrc();
    const updateChannel = src.slice(src.indexOf('case "update_channel"'));
    expect(updateChannel).toMatch(/verifyPublishable/);
  });

  it('취소 상태가 도구의 타입 계약에 존재한다', () => {
    expect(toolSrc()).toMatch(/"canceled"/);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// 2026-09-13 Codex 교차 리뷰(review-only)가 짚은 잔여 결함 7건의 경계 테스트.
// 감사 4건을 닫은 첫 커밋(b9bb9fc9)에 남아 있던 구멍들이다.
// ─────────────────────────────────────────────────────────────────────────────
describe('Codex 교차 리뷰 잔여 결함 — 경계 케이스', () => {
  it('MAJOR 1: 발행기도 대시보드와 같은 자물쇠(${file}.lock)를 쓴다', async () => {
    const { withQueueLock } = await import('../../../extensions/threads-queue/src/queue-lock');
    const target = path.join(tmpDir, 'lock-probe.json');
    fs.writeFileSync(target, '{}');

    let insideSaw = false;
    await withQueueLock(target, async () => {
      // 잠금 규약이 proper-lockfile 과 같아야 두 프로세스가 실제로 다툰다.
      insideSaw = fs.existsSync(`${target}.lock`);
    });
    expect(insideSaw).toBe(true);
    // 해제되면 자물쇠가 사라진다.
    expect(fs.existsSync(`${target}.lock`)).toBe(false);

    // 모듈이 있는 것만으로는 아무 것도 못 막는다. 발행기 도구가 실제로 경유해야 한다.
    const toolSrc = fs.readFileSync(
      path.resolve(__dirname, '../../../extensions/threads-queue/src/threads-queue-tool.ts'),
      'utf-8',
    );
    expect(toolSrc).toMatch(/withQueueLock\(queuePath/);
    // 큐 읽기가 잠금 안에서 일어나야 한다(잠금 밖 읽기는 lost update 를 못 막는다).
    const lockIdx = toolSrc.indexOf('withQueueLock(queuePath');
    const readIdx = toolSrc.indexOf('await readQueue(queuePath)');
    expect(lockIdx).toBeGreaterThan(-1);
    expect(readIdx).toBeGreaterThan(lockIdx);
  });

  it('MAJOR 1: 잠금을 못 잡으면 조용히 진행하지 않고 실패한다(fail-open 금지)', async () => {
    const { withQueueLock } = await import('../../../extensions/threads-queue/src/queue-lock');
    const target = path.join(tmpDir, 'lock-busy.json');
    fs.writeFileSync(target, '{}');
    fs.mkdirSync(`${target}.lock`); // 다른 프로세스가 잡고 있는 상황

    await expect(withQueueLock(target, async () => 'never')).rejects.toThrow(/queue lock timeout/);
    fs.rmdirSync(`${target}.lock`);
  }, 20000);

  it('MAJOR 1: 죽은 프로세스가 남긴 낡은 자물쇠는 회수한다(큐 영구 정지 방지)', async () => {
    const { withQueueLock } = await import('../../../extensions/threads-queue/src/queue-lock');
    const target = path.join(tmpDir, 'lock-stale.json');
    fs.writeFileSync(target, '{}');
    fs.mkdirSync(`${target}.lock`);
    const old = new Date(Date.now() - 60_000);
    fs.utimesSync(`${target}.lock`, old, old);

    await expect(withQueueLock(target, async () => 'ok')).resolves.toBe('ok');
  }, 20000);

  it('MAJOR 2: lease 잔여 시간이 부족하면 발행을 시작하지 않는다', () => {
    const now = new Date('2026-04-02T12:00:00Z');
    const post: ClaimablePost = { id: 'p', status: 'approved', channels: { threads: { status: 'pending' } } };
    claimPost(post, { workerId: 'A', token: 'tA', now, leaseMs: 10_000 });

    // 발행 시작 직전 재검증(verify_claim)은 여유를 요구한다.
    const start = verifyPublishable(post, 'threads', { claimToken: 'tA', now, requireHeadroom: true });
    expect(start.ok).toBe(false);
    expect(start.ok === false && start.reason).toBe('claim-headroom');

    // 이미 끝난 호출의 결과 기록까지 막으면 외부만 발행된 더 나쁜 상태가 되므로 통과시킨다.
    expect(verifyPublishable(post, 'threads', { claimToken: 'tA', now }).ok).toBe(true);
  });

  it('MAJOR 3: 취소 뒤 도착한 낡은 skipped 가 최상위 상태를 published 로 뒤집지 못한다', async () => {
    const queue = readQueue();
    const target = queue.posts.find((p) => p.id === 'post-002') as Record<string, unknown>;
    (target.channels as Record<string, unknown>).threads = {
      status: 'published',
      publishedAt: '2026-04-02T13:00:00Z',
      mediaId: 'm1',
    };
    writeQueue(queue);
    await cancel('post-002');

    const after = readQueue().posts.find((p) => p.id === 'post-002') as Record<string, unknown>;
    const channels = after.channels as Record<string, { status: string }>;
    expect(channels.x.status).toBe('canceled');
    expect(after.status).toBe('canceled');

    // 발행기 계약: 취소된 글은 어떤 채널도 덮이지 않는다.
    const verdict = verifyPublishable(after as ClaimablePost, 'x', {});
    expect(verdict.ok).toBe(false);
    expect(verdict.ok === false && verdict.reason).toBe('post-canceled');

    // 최상위가 아직 살아 있어도 canceled 채널 단독으로 막힌다.
    const channelOnly = verifyPublishable(
      { id: 'z', status: 'approved', channels: { x: { status: 'canceled' } } },
      'x',
      {},
    );
    expect(channelOnly.ok === false && channelOnly.reason).toBe('channel-canceled');

    const toolSrc = fs.readFileSync(
      path.resolve(__dirname, '../../../extensions/threads-queue/src/threads-queue-tool.ts'),
      'utf-8',
    );
    const updateChannel = toolSrc.slice(toolSrc.indexOf('case "update_channel"'));
    // skipped 를 포함한 모든 상태 기록이 취소된 채널에서 막힌다.
    expect(updateChannel).toMatch(/existingChannelStatus === "canceled"/);
    // 집계도 canceled 를 완료로 세지 않는다.
    expect(updateChannel).toMatch(/anyCanceled/);
  });

  it('MAJOR 4: 살아 있는 claim 이 걸린 글은 토큰 없이 최종 상태를 기록할 수 없다', () => {
    const post: ClaimablePost = { id: 'p', status: 'approved', channels: { threads: { status: 'pending' } } };
    claimPost(post, { workerId: 'A', token: 'tA' });

    const noToken = verifyPublishable(post, 'threads', {});
    expect(noToken.ok).toBe(false);
    expect(noToken.ok === false && noToken.reason).toBe('claim-required');

    // 소유자는 통과한다.
    expect(verifyPublishable(post, 'threads', { claimToken: 'tA' }).ok).toBe(true);
  });

  it('MAJOR 4: claim 이 없는 레거시 경로는 기존대로 상태 검사만으로 통과한다', () => {
    const post: ClaimablePost = { id: 'p', status: 'approved', channels: { threads: { status: 'pending' } } };
    expect(verifyPublishable(post, 'threads', {}).ok).toBe(true);
  });

  it('MAJOR 5: drain 은 낡은 스냅샷이 아니라 큐의 현재 상태를 민다', async () => {
    const pushed: Array<Record<string, unknown>> = [];
    vi.doMock('@/lib/queue-store', async () => {
      const actual = await vi.importActual<typeof import('@/lib/queue-store')>('@/lib/queue-store');
      return {
        ...actual,
        mirrorQueuePostDetailed: vi.fn(async (_t: unknown, post: Record<string, unknown>) => {
          pushed.push(post);
          return pushed.length === 1 ? { status: 'failed', message: 'db down' } : { status: 'ok' };
        }),
      };
    });

    await cancel('post-002');

    // 그 사이 같은 글이 파일에서 더 최신 상태로 바뀐다.
    const queue = readQueue();
    const target = queue.posts.find((p) => p.id === 'post-002') as Record<string, unknown>;
    target.text = '나중에 고친 본문';
    writeQueue(queue);

    const { drainQueueMirrorOutbox } = await import('@/lib/queue-mirror-outbox');
    await drainQueueMirrorOutbox();

    expect(pushed).toHaveLength(2);
    // 두 번째로 민 것이 스냅샷이 아니라 현재 파일 상태여야 한다(역행 금지).
    expect(pushed[1].text).toBe('나중에 고친 본문');
    vi.doUnmock('@/lib/queue-store');
  });

  it('MINOR 6: outbox 상한 초과분은 조용히 사라지지 않고 폐기 수가 기록된다', async () => {
    vi.doMock('@/lib/queue-store', async () => {
      const actual = await vi.importActual<typeof import('@/lib/queue-store')>('@/lib/queue-store');
      return {
        ...actual,
        mirrorQueuePostDetailed: vi.fn(async () => ({ status: 'failed', message: 'db down' })),
      };
    });
    const { readQueueMirrorOutbox } = await import('@/lib/queue-mirror-outbox');
    const { mutateJson, dataPath } = await import('@/lib/file-io');
    const many = Array.from({ length: 510 }, (_, i) => ({
      postId: `bulk-${i}`,
      tenantId: null,
      post: { id: `bulk-${i}` },
      reason: 'db down',
      attempts: 1,
      firstFailedAt: '2026-04-02T12:00:00Z',
      lastFailedAt: '2026-04-02T12:00:00Z',
    }));
    await mutateJson(dataPath('queue-mirror-outbox.json'), () => ({ entries: many }), { entries: [] });

    await cancel('post-002');

    const file = readTempJson<{ entries: unknown[]; droppedCount: number }>(tmpDir, 'queue-mirror-outbox.json');
    expect(file?.entries).toHaveLength(500);
    expect(file?.droppedCount).toBeGreaterThan(0);
    expect(readQueueMirrorOutbox()).toHaveLength(500);
    vi.doUnmock('@/lib/queue-store');
  });

  it('MINOR 7: 레거시 정규화가 발행기 migratePost 와 같은 채널 구성을 만든다', async () => {
    const { normalizeChannels } = await import('@/lib/post-publish-state');
    const withImage = normalizeChannels({ id: 'a', status: 'approved', imageUrl: 'https://x/y.png' });
    expect(Object.keys(withImage).sort()).toEqual(['instagram', 'threads', 'x']);
    expect(withImage.threads.status).toBe('pending');
    expect(withImage.x.status).toBe('skipped');
    expect(withImage.instagram.status).toBe('pending');

    const noImage = normalizeChannels({ id: 'b', status: 'approved' });
    expect(noImage.instagram.status).toBe('skipped');

    // draft 는 두 구현 모두 채널을 만들지 않는다.
    expect(Object.keys(normalizeChannels({ id: 'c', status: 'draft' }))).toHaveLength(0);
  });
});
