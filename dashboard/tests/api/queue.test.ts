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

describe('GET /api/queue', () => {
  it('returns all posts with total', async () => {
    const { GET } = await import('@/app/api/queue/route');
    const res = await GET(new Request('http://localhost/api/queue'));
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.posts).toHaveLength(3);
    expect(body.total).toBe(3);
  });

  it('filters by status=draft', async () => {
    const { GET } = await import('@/app/api/queue/route');
    const res = await GET(new Request('http://localhost/api/queue?status=draft'));
    const body = await res.json();
    expect(body.posts).toHaveLength(1);
    expect(body.posts[0].status).toBe('draft');
    expect(body.total).toBe(1);
  });

  it('returns sorted by generatedAt descending', async () => {
    const { GET } = await import('@/app/api/queue/route');
    const res = await GET(new Request('http://localhost/api/queue'));
    const body = await res.json();
    expect(body.posts[0].id).toBe('post-003');
    expect(body.posts[2].id).toBe('post-001');
  });
});

describe('POST /api/queue/[postId]/approve', () => {
  it('changes status to approved', async () => {
    const { POST } = await import('@/app/api/queue/[postId]/approve/route');
    const res = await POST(
      new Request('http://localhost/api/queue/post-001/approve', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ hours: 0 }),
      }),
      { params: Promise.resolve({ postId: 'post-001' }) }
    );
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.ok).toBe(true);
    expect(body.post.status).toBe('approved');
    expect(body.post.approvedAt).toBeDefined();

    // Verify persisted
    const queue = readTempJson<{ posts: Array<Record<string, unknown>> }>(tmpDir, 'queue.json');
    const post = queue!.posts.find(p => p.id === 'post-001');
    expect(post!.status).toBe('approved');
  });

  it('returns 404 for missing post', async () => {
    const { POST } = await import('@/app/api/queue/[postId]/approve/route');
    const res = await POST(
      new Request('http://localhost/api/queue/nonexistent/approve', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ hours: 0 }),
      }),
      { params: Promise.resolve({ postId: 'nonexistent' }) }
    );
    expect(res.status).toBe(404);
  });
});

describe('POST /api/queue/[postId]/delete', () => {
  it('removes post from queue', async () => {
    const { POST } = await import('@/app/api/queue/[postId]/delete/route');
    const res = await POST(
      new Request('http://localhost/api/queue/post-001/delete', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({}),
      }),
      { params: Promise.resolve({ postId: 'post-001' }) }
    );
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.ok).toBe(true);

    const queue = readTempJson<{ posts: Array<Record<string, unknown>> }>(tmpDir, 'queue.json');
    expect(queue!.posts).toHaveLength(2);
    expect(queue!.posts.find(p => p.id === 'post-001')).toBeUndefined();
  });

  it('returns 404 for missing post', async () => {
    const { POST } = await import('@/app/api/queue/[postId]/delete/route');
    const res = await POST(
      new Request('http://localhost/api/queue/nonexistent/delete', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({}),
      }),
      { params: Promise.resolve({ postId: 'nonexistent' }) }
    );
    expect(res.status).toBe(404);
  });
});

describe('POST /api/queue/bulk-approve', () => {
  it('approves multiple draft posts', async () => {
    const { POST } = await import('@/app/api/queue/bulk-approve/route');
    const res = await POST(
      new Request('http://localhost/api/queue/bulk-approve', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ids: ['post-001'], intervalHours: 2 }),
      })
    );
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.ok).toBe(true);
    expect(body.approved).toBe(1);

    const queue = readTempJson<{ posts: Array<Record<string, unknown>> }>(tmpDir, 'queue.json');
    const post = queue!.posts.find(p => p.id === 'post-001');
    expect(post!.status).toBe('approved');
  });

  it('V70-INBOX-10 거절: 공백 본문이 섞인 일괄 승인은 일부 항목도 승인하지 않는다', async () => {
    const queue = readTempJson<{ posts: Array<Record<string, unknown>> }>(tmpDir, 'queue.json');
    queue!.posts.push({ id: 'post-empty', text: ' \n\t ', status: 'draft' });
    fs.writeFileSync(path.join(tmpDir, 'queue.json'), JSON.stringify(queue, null, 2));

    const { POST } = await import('@/app/api/queue/bulk-approve/route');
    const res = await POST(
      new Request('http://localhost/api/queue/bulk-approve', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ids: ['post-001', 'post-empty'], intervalHours: 2 }),
      })
    );

    expect(res.status).toBe(422);
    expect(await res.json()).toMatchObject({
      code: 'REVIEW_CONTENT_MISSING',
      invalid: [{ id: 'post-empty', missingFields: ['body'] }],
    });
    const persisted = readTempJson<{ posts: Array<Record<string, unknown>> }>(tmpDir, 'queue.json');
    expect(persisted!.posts.find((post) => post.id === 'post-001')!.status).toBe('draft');
    expect(persisted!.posts.find((post) => post.id === 'post-empty')!.status).toBe('draft');
  });
});

describe('POST /api/queue/bulk-delete', () => {
  it('deletes multiple posts', async () => {
    const { POST } = await import('@/app/api/queue/bulk-delete/route');
    const res = await POST(
      new Request('http://localhost/api/queue/bulk-delete', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ids: ['post-001', 'post-002'] }),
      })
    );
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.ok).toBe(true);
    expect(body.deleted).toBe(2);

    const queue = readTempJson<{ posts: Array<Record<string, unknown>> }>(tmpDir, 'queue.json');
    expect(queue!.posts).toHaveLength(1);
    expect(queue!.posts[0].id).toBe('post-003');
  });
});
