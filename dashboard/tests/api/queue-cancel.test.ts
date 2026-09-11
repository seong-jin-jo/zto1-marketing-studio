import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import { createTempDir, setupTestEnv, cleanupTestEnv, copyFixture, readTempJson } from '../helpers';

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

describe('POST /api/queue/[postId]/cancel — 발행 중지 (시험 1: 정상 경로)', () => {
  it('아직 발행 전인 승인된 작업물의 대기 채널을 모두 canceled 로 바꾼다', async () => {
    const { POST } = await import('@/app/api/queue/[postId]/cancel/route');
    const res = await POST(new Request('http://localhost/api/queue/post-002/cancel', { method: 'POST' }), params('post-002'));
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.post.status).toBe('canceled');
    expect(body.post.channels.threads.status).toBe('canceled');
    expect(body.post.channels.x.status).toBe('canceled');
    expect(body.post.canceledAt).toBeTruthy();

    const onDisk = readTempJson<{ posts: Array<{ id: string; status: string }> }>(tmpDir, 'queue.json');
    const post = onDisk?.posts.find((p) => p.id === 'post-002');
    expect(post?.status).toBe('canceled');
  });
});

describe('POST /api/queue/[postId]/cancel — 발행 중지 (시험 2: 거절 조건)', () => {
  it('이미 전 채널이 발행 완료된 작업물은 중지를 거절한다', async () => {
    const { POST } = await import('@/app/api/queue/[postId]/cancel/route');
    const res = await POST(new Request('http://localhost/api/queue/post-003/cancel', { method: 'POST' }), params('post-003'));
    expect(res.status).toBe(409);
    const body = await res.json();
    expect(body.code).toBe('NOTHING_TO_CANCEL');

    const onDisk = readTempJson<{ posts: Array<{ id: string; status: string }> }>(tmpDir, 'queue.json');
    const post = onDisk?.posts.find((p) => p.id === 'post-003');
    // 거절 시 기존 published 상태를 건드리지 않는다.
    expect(post?.status).toBe('published');
  });

  it('존재하지 않는 작업물은 404를 반환한다', async () => {
    const { POST } = await import('@/app/api/queue/[postId]/cancel/route');
    const res = await POST(new Request('http://localhost/api/queue/no-such-post/cancel', { method: 'POST' }), params('no-such-post'));
    expect(res.status).toBe(404);
  });
});

describe('POST /api/queue/[postId]/cancel — 발행 중지 (시험 3: 경합 — 일부 채널만 먼저 발행됨)', () => {
  it('이미 발행된 채널은 그대로 두고, 아직 대기 중인 채널만 취소한다', async () => {
    // cron 이 threads 는 이미 발행을 끝내고 x 는 아직 pending 인 중간 상태를 파일에 직접 반영한다.
    // (get_approved → update_channel 이 순차로 도는 실제 경합 상황의 스냅샷)
    const filePath = path.join(tmpDir, 'queue.json');
    const raw = JSON.parse(fs.readFileSync(filePath, 'utf-8'));
    const target = raw.posts.find((p: { id: string }) => p.id === 'post-002');
    target.channels.threads = { status: 'published', publishedAt: '2026-04-02T13:00:00Z' };
    fs.writeFileSync(filePath, JSON.stringify(raw, null, 2));

    const { POST } = await import('@/app/api/queue/[postId]/cancel/route');
    const res = await POST(new Request('http://localhost/api/queue/post-002/cancel', { method: 'POST' }), params('post-002'));
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.post.channels.threads.status).toBe('published');
    expect(body.post.channels.threads.publishedAt).toBe('2026-04-02T13:00:00Z');
    expect(body.post.channels.x.status).toBe('canceled');
    // 나머지 채널이 취소됐으므로 최상위 상태는 이 취소 요청이 결정한다.
    expect(body.post.status).toBe('canceled');
  });
});
