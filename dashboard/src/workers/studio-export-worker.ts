import http from "node:http";
import postgres from "postgres";
import { validateMediaStoreConfiguration } from "@/lib/media-store";
import { ExportItemWorker, realExportWorkerDependencies, workerId } from "@/lib/studio/export-worker";
import { PostgresExportRepository } from "@/lib/studio/export-repository";
import { requireStudioExportWorkerEnv } from "./studio-export-worker-env";

const concurrency = Number(process.env.EXPORT_RENDER_CONCURRENCY ?? "1");
if (concurrency !== 1) throw new Error("EXPORT_RENDER_CONCURRENCY must be 1 until capacity approval");
const requiredEnvironment = requireStudioExportWorkerEnv();
validateMediaStoreConfiguration();

const healthPort = Number(process.env.EXPORT_WORKER_HEALTH_PORT ?? "34620");
const databaseUrl = requiredEnvironment.DATABASE_URL;
// Advisory locks are connection-scoped. postgres.js defaults max_lifetime to a random
// 45–90 minutes, so the lock connection must opt out of lifetime recycling.
const advisoryLockPool = postgres(databaseUrl, { max: 1, max_lifetime: null });
const repository = new PostgresExportRepository();
const itemWorker = new ExportItemWorker(realExportWorkerDependencies(repository));
const id = workerId();
let role: "starting" | "active" | "standby" | "draining" | "failed" = "starting";
let lastError: string | null = null;
let lastActivityAt = new Date().toISOString();
let stopping = false;

const health = http.createServer((_request, response) => {
  const ready = role === "active" || role === "standby";
  response.writeHead(ready ? 200 : 503, { "Content-Type": "application/json", "Cache-Control": "no-store" });
  response.end(JSON.stringify({ status: role, worker_id: id, last_activity_at: lastActivityAt, last_error: lastError }));
});
health.listen(healthPort, "0.0.0.0");

const delay = (milliseconds: number) => new Promise((resolve) => setTimeout(resolve, milliseconds));

async function main(): Promise<void> {
  const session = await advisoryLockPool.reserve();
  try {
    let acquired = false;
    while (!stopping && !acquired) {
      const [lock] = await session<{ acquired: boolean }[]>`
        SELECT pg_try_advisory_lock(hashtextextended('studio-export-render-worker-v1',0)) AS acquired`;
      acquired = lock?.acquired === true;
      if (acquired) break;
      role = "standby";
      await delay(5_000);
    }
    if (!acquired) return;
    role = "active";
    let tenantCursor = 0;
    let lastReclaimAt = 0;
    while (!stopping) {
      await session`SELECT 1`;
      const tenants = await repository.runnableTenants();
      if (Date.now() - lastReclaimAt >= 30_000) {
        for (const tenantId of tenants) await repository.reclaimExpired(tenantId);
        lastReclaimAt = Date.now();
      }
      if (tenants.length === 0) {
        await delay(1_000);
        continue;
      }
      const tenantId = tenants[tenantCursor % tenants.length];
      tenantCursor = (tenantCursor + 1) % tenants.length;
      const item = await repository.claim(tenantId, id);
      if (!item) continue;
      lastActivityAt = new Date().toISOString();
      await itemWorker.process(item);
    }
  } finally {
    role = "draining";
    session.release();
    await advisoryLockPool.end({ timeout: 5 });
  }
}

for (const signal of ["SIGTERM", "SIGINT"] as const) {
  process.on(signal, () => {
    stopping = true;
    role = "draining";
    setTimeout(() => process.exit(0), 125_000).unref();
  });
}

main().catch((error) => {
  role = "failed";
  lastError = error instanceof Error ? error.message : "worker failed";
  setTimeout(() => process.exit(1), 1_000).unref();
});
