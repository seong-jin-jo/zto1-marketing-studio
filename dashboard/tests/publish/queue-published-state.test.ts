import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";

const H = vi.hoisted(() => ({ updates: [] as { text: string; values: unknown[] }[] }));

vi.mock("@/lib/db", () => ({
  withTenant: vi.fn(async (_tenantId: string, cb: (sql: unknown) => unknown) => {
    const sql = (strings: TemplateStringsArray, ...values: unknown[]) => {
      H.updates.push({ text: strings.join(" "), values });
      return Promise.resolve([]);
    };
    sql.json = (value: unknown) => value;
    return cb(sql);
  }),
}));

describe("markQueuePublished", () => {
  const tenantId = "587cee76-deca-480e-8fdd-808a30ec86eb";
  const postId = "13730d99-a268-47de-9cf9-90157ea1fa79";
  let dataDir: string;
  let markQueuePublished: typeof import("@/lib/queue-store").markQueuePublished;

  beforeAll(async () => {
    dataDir = fs.mkdtempSync(path.join(os.tmpdir(), "osmu-published-"));
    process.env.DATA_DIR = dataDir;
    vi.resetModules();
    ({ markQueuePublished } = await import("@/lib/queue-store"));
  });

  afterAll(() => {
    fs.rmSync(dataDir, { recursive: true, force: true });
    delete process.env.DATA_DIR;
  });

  it("updates the tenant queue file and DB shadow after a successful publish", async () => {
    const tenantDir = path.join(dataDir, "tenants", tenantId);
    fs.mkdirSync(tenantDir, { recursive: true });
    fs.writeFileSync(path.join(tenantDir, "queue.json"), JSON.stringify({
      version: 2,
      posts: [{ id: postId, status: "draft", text: "launch" }],
    }));

    const found = await markQueuePublished(tenantId, postId, {
      platform: "threads",
      externalId: "media-1",
      permalink: "https://www.threads.net/@osmu/post/1",
    });
    const queue = JSON.parse(fs.readFileSync(path.join(tenantDir, "queue.json"), "utf8"));

    // 2026-09-05: 반환값이 참·거짓에서 "updated"·"absent" 로 바뀌었다. 큐에 없는 것과
    // 갱신에 실패한 것을 호출부가 구분해야 하기 때문이다(스튜디오 직접 발행은 큐에 없다).
    expect(found).toBe("updated");
    expect(queue.posts[0]).toMatchObject({
      id: postId,
      status: "published",
      publishedPlatform: "threads",
      externalId: "media-1",
      permalink: "https://www.threads.net/@osmu/post/1",
    });
    expect(queue.posts[0].publishedAt).toMatch(/^\d{4}-\d{2}-\d{2}T/);
    expect(H.updates).toHaveLength(1);
    expect(H.updates[0].text).toContain("UPDATE queue_posts");
    expect(H.updates[0].values).toContain(postId);
  });
});
