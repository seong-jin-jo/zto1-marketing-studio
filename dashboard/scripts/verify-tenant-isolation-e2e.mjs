import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import postgres from "postgres";

const BASE_URL = (process.env.ISOLATION_BASE_URL || "http://localhost:3456").replace(/\/$/, "");
const MARKER_A = `QA_ISO_A_${Date.now()}`;
const MARKER_B = `QA_ISO_B_${Date.now()}`;
const results = [];

function loadLocalEnv() {
  const envPath = path.resolve(process.cwd(), ".env.local");
  if (!fs.existsSync(envPath)) return;
  for (const line of fs.readFileSync(envPath, "utf8").split(/\r?\n/)) {
    const match = line.match(/^([A-Za-z_][A-Za-z0-9_]*)=(.*)$/);
    if (!match || process.env[match[1]] !== undefined) continue;
    let value = match[2].trim();
    if ((value.startsWith('"') && value.endsWith('"')) || (value.startsWith("'") && value.endsWith("'"))) {
      value = value.slice(1, -1);
    }
    process.env[match[1]] = value;
  }
}

loadLocalEnv();

const databaseUrl = process.env.DATABASE_URL;
const operatorToken = process.env.DASHBOARD_AUTH_TOKEN;
const secretKey = process.env.OSMU_SECRET_KEY;
if (!databaseUrl || !operatorToken || !secretKey) {
  throw new Error("DATABASE_URL, DASHBOARD_AUTH_TOKEN, OSMU_SECRET_KEY가 필요합니다.");
}

const sql = postgres(databaseUrl, { max: 3, idle_timeout: 5, connect_timeout: 8, onnotice: () => {} });
const repoRoot = path.resolve(process.cwd(), "..");
const dataRoot = process.env.DATA_DIR || path.join(repoRoot, "data");
const configRoot = process.env.CONFIG_DIR || path.join(repoRoot, "config");

function bearer(token) {
  return { Authorization: `Bearer ${token}` };
}

async function request(routePath, { token, method = "GET", body } = {}) {
  const headers = token ? bearer(token) : {};
  if (body !== undefined) headers["Content-Type"] = "application/json";
  const response = await fetch(`${BASE_URL}${routePath}`, {
    method,
    headers,
    body: body === undefined ? undefined : JSON.stringify(body),
    redirect: "manual",
  });
  const text = await response.text();
  return { status: response.status, text };
}

async function issueToken(tenantId, label) {
  const response = await request("/api/tenant-tokens", {
    token: operatorToken,
    method: "POST",
    body: { tenant_id: tenantId, label },
  });
  if (response.status !== 200) throw new Error(`토큰 발급 실패: HTTP ${response.status}`);
  const parsed = JSON.parse(response.text);
  if (!parsed.token || !parsed.id) throw new Error("토큰 발급 응답이 불완전합니다.");
  return parsed;
}

async function revokeToken(id) {
  const response = await request(`/api/tenant-tokens?id=${encodeURIComponent(id)}`, {
    token: operatorToken,
    method: "DELETE",
  });
  if (response.status !== 200) throw new Error(`토큰 폐기 실패: HTTP ${response.status}`);
}

function addResult(category, name, response, passed, note) {
  results.push({ category, name, status: response.status, passed, note });
}

function writeTenantFiles(tenantId, marker, queueId, blogId) {
  const tenantData = path.join(dataRoot, "tenants", tenantId);
  const tenantConfig = path.join(configRoot, "tenants", tenantId);
  fs.mkdirSync(path.join(tenantData, "images"), { recursive: true });
  fs.mkdirSync(tenantConfig, { recursive: true });
  const jsonFiles = {
    "queue.json": { posts: [{ id: queueId, text: marker, topic: marker, status: "draft", generatedAt: new Date().toISOString() }] },
    "blog-queue.json": { posts: [{ id: blogId, title: marker, content: marker, status: "draft" }] },
    "popular-posts.json": { posts: [{ id: `${marker}-popular`, text: marker }] },
    "activity.json": [{ id: `${marker}-activity`, message: marker }],
    "agent-logs.json": [{ id: `${marker}-log`, message: marker }],
    "notification-log.json": [{ id: `${marker}-notification`, message: marker }],
    "settings.json": { marker },
    "onboarding.json": { completed: false, marker },
  };
  for (const [name, value] of Object.entries(jsonFiles)) {
    fs.writeFileSync(path.join(tenantData, name), JSON.stringify(value, null, 2));
  }
  for (const [name, value] of Object.entries({
    "prompt-guide.txt": marker,
    "prompt-guide.threads.txt": marker,
    "search-keywords.txt": marker,
    "search-keywords.threads.txt": marker,
    "blog-guide.txt": marker,
    "blog-keywords.txt": marker,
  })) {
    fs.writeFileSync(path.join(tenantData, name), value);
  }
  fs.writeFileSync(path.join(tenantData, "images", `${marker}.txt`), marker);
  fs.writeFileSync(path.join(tenantConfig, "channel-settings.json"), JSON.stringify({ threads: { marker } }, null, 2));
  return { tenantData, tenantConfig };
}

function hashDirectory(root) {
  if (!fs.existsSync(root)) return "missing";
  const hash = crypto.createHash("sha256");
  const walk = (dir) => {
    for (const entry of fs.readdirSync(dir, { withFileTypes: true }).sort((a, b) => a.name.localeCompare(b.name))) {
      const full = path.join(dir, entry.name);
      hash.update(path.relative(root, full));
      if (entry.isDirectory()) walk(full);
      else hash.update(fs.readFileSync(full));
    }
  };
  walk(root);
  return hash.digest("hex");
}

function expiredJwtShape() {
  const encode = (value) => Buffer.from(JSON.stringify(value)).toString("base64url");
  return `${encode({ alg: "HS256", typ: "JWT" })}.${encode({ sub: "qa-expired", exp: 1 })}.expired`;
}

const readCases = ({ tenantB, draftB, postB }) => [
  ["READ-01", "/api/activity"],
  ["READ-02", "/api/agent-logs"],
  ["READ-03", "/api/alerts"],
  ["READ-04", "/api/analytics"],
  ["READ-05", "/api/blog-guide"],
  ["READ-06", "/api/blog-keywords"],
  ["READ-07", "/api/blog-queue"],
  ["READ-08", "/api/blog-stats"],
  ["READ-09", "/api/brand/sync-repo"],
  ["READ-10", "/api/brand/sync-wiki"],
  ["READ-11", "/api/channel-config"],
  ["READ-12", "/api/channel-settings"],
  ["READ-13", "/api/channel-settings/threads"],
  ["READ-14", "/api/channels/qa-isolation/accounts"],
  ["READ-15", "/api/connect/threads"],
  ["READ-16", "/api/connect/readiness"],
  ["READ-17", `/api/engagement?post_id=${postB}`],
  ["READ-18", "/api/errors"],
  ["READ-19", "/api/growth"],
  ["READ-20", "/api/guide"],
  ["READ-21", "/api/guide/threads"],
  ["READ-22", "/api/images"],
  ["READ-23", "/api/integrations"],
  ["READ-24", "/api/isolation-proof"],
  ["READ-25", "/api/keyword-bank"],
  ["READ-26", "/api/keywords"],
  ["READ-27", "/api/keywords/threads"],
  ["READ-28", "/api/me"],
  ["READ-29", "/api/metrics"],
  ["READ-30", "/api/notification-log"],
  ["READ-31", "/api/onboarding"],
  ["READ-32", "/api/overview"],
  ["READ-33", "/api/popular"],
  ["READ-34", "/api/product-source"],
  ["READ-35", `/api/publish?draft_id=${draftB}`],
  ["READ-36", "/api/queue"],
  ["READ-37", "/api/schedule"],
  ["READ-38", "/api/settings"],
  ["READ-39", "/api/sourcing/import-to-queue"],
  ["READ-40", "/api/sourcing"],
  ["READ-41", "/api/studio/brand-setup"],
  ["READ-42", "/api/studio/drafts"],
  ["READ-43", "/api/studio/engine-status"],
  ["READ-44", "/api/suggestions"],
  ["READ-45", "/api/threads-username"],
  ["READ-46", "/api/tiktok/creator-info"],
  ["READ-47", `/api/tiktok/publish-status?post_id=${postB}`],
  ["READ-48", "/api/trend-report"],
  ["READ-49", "/api/usage"],
  ["READ-50", "/api/video/list"],
  ["READ-51", "/api/voice-tone"],
  ["READ-52", "/api/weekly-report"],
  ["READ-53", "/api/weekly-summary"],
  ["READ-54", "/api/youtube/status"],
  ["READ-55", "/api/performance/learned-rules"],
  ["READ-56", "/api/threads/low-engagement-candidates"],
  // 2026-09-06 신설: 고객이 자기 생성 이력을 보는 경로. 남의 작업 공간 것이 새면 안 된다.
  ["READ-57", "/api/studio/generation-history"],
  // 2026-09-07: 만든 그림·영상을 화면이 불러오는 경로. 종전에는 쿼리 tenant_id 를 그대로
  // 믿어 인증된 고객이 다른 작업 공간 파일을 받아 갈 수 있었다. 이제 부르는 쪽 토큰으로
  // 테넌트를 확정하므로 이 목록에 들어와 공격을 받아야 한다.
  ["READ-58", "/api/higgsfield/asset/probe.png"],
  // 학습 정보 서버 보관소. 남의 작업 공간 브랜드 지식이 새면 그 자체가 영업기밀 유출이다.
  ["READ-59", "/api/studio/learning"],
].map(([name, routePath]) => {
  const url = new URL(`${BASE_URL}${routePath}`);
  url.searchParams.set("tenant_id", tenantB);
  return [name, `${url.pathname}${url.search}`];
});

let tenantA;
let tenantB;
let tokenA;
let tokenB;
let revokedToken;
let bPaths;

try {
  await sql`select 1`;
  const suffix = `${Date.now()}-${crypto.randomBytes(3).toString("hex")}`;
  const [createdA, createdB] = await sql.begin(async (tx) => {
    const [a] = await tx`
      insert into tenants (slug, name, status, tier)
      values (${`qa-isolation-a-${suffix}`}, 'QA Isolation A', 'active', 'team') returning id`;
    const [b] = await tx`
      insert into tenants (slug, name, status, tier)
      values (${`qa-isolation-b-${suffix}`}, 'QA Isolation B', 'active', 'team') returning id`;
    return [a, b];
  });
  tenantA = createdA.id;
  tenantB = createdB.id;

  const issuedA = await issueToken(tenantA, `qa-isolation-a-${suffix}`);
  const issuedB = await issueToken(tenantB, `qa-isolation-b-${suffix}`);
  const issuedRevoked = await issueToken(tenantA, `qa-isolation-revoked-${suffix}`);
  tokenA = issuedA.token;
  tokenB = issuedB.token;
  revokedToken = issuedRevoked.token;
  await revokeToken(issuedRevoked.id);

  const draftA = crypto.randomUUID();
  const draftB = crypto.randomUUID();
  const queueA = crypto.randomUUID();
  const queueB = crypto.randomUUID();
  const blogA = crypto.randomUUID();
  const blogB = crypto.randomUUID();
  const postB = crypto.randomUUID();
  const accountB = crypto.randomUUID();
  const scheduleB = crypto.randomUUID();

  await sql.begin(async (tx) => {
    await tx`insert into drafts (id, tenant_id, idea, payload, status) values
      (${draftA}::uuid, ${tenantA}::uuid, ${MARKER_A}, ${tx.json({ marker: MARKER_A })}, 'draft'),
      (${draftB}::uuid, ${tenantB}::uuid, ${MARKER_B}, ${tx.json({ marker: MARKER_B, editor_handoff: { revision: 1 } })}, 'draft')`;
    await tx`insert into brand_guides (tenant_id, prompt_guide, visual_rules, source)
      values (${tenantB}::uuid, ${MARKER_B}, ${tx.json({ marker: MARKER_B })}, 'qa')`;
    await tx`insert into integrations (tenant_id, kind, label, secret_enc, meta)
      values (${tenantB}::uuid, 'qa', ${MARKER_B}, armor(pgp_sym_encrypt(${MARKER_B}, ${secretKey})), ${tx.json({ marker: MARKER_B })})`;
    await tx`insert into channel_accounts
      (id, tenant_id, provider, external_account_id, display_name, username, secret_enc, meta, is_default, status)
      values (${accountB}::uuid, ${tenantB}::uuid, 'qa-isolation', ${MARKER_B}, ${MARKER_B}, ${MARKER_B},
        armor(pgp_sym_encrypt(${MARKER_B}, ${secretKey})), ${tx.json({ marker: MARKER_B })}, true, 'active')`;
    await tx`insert into published_posts
      (id, tenant_id, draft_id, platform, external_id, provider_post_id, text, status, account_id)
      values (${postB}::uuid, ${tenantB}::uuid, ${draftB}::uuid, 'qa-isolation', ${MARKER_B}, ${MARKER_B}, ${MARKER_B}, 'published', ${accountB}::uuid)`;
    await tx`insert into engagement_items
      (tenant_id, published_post_id, platform, provider_comment_id, state, reply_text)
      values (${tenantB}::uuid, ${postB}::uuid, 'qa-isolation', ${MARKER_B}, 'deferred', ${MARKER_B})`;
    await tx`insert into queue_posts (id, tenant_id, text, topic, status, payload)
      values (${queueB}::uuid, ${tenantB}::uuid, ${MARKER_B}, ${MARKER_B}, 'draft', ${tx.json({ marker: MARKER_B })})`;
    await tx`insert into schedules (id, tenant_id, draft_id, platforms, scheduled_at, status, payload, account_id)
      values (${scheduleB}::uuid, ${tenantB}::uuid, ${draftB}::uuid, ARRAY['qa-isolation'], now() + interval '1 day', 'scheduled', ${tx.json({ marker: MARKER_B })}, ${accountB}::uuid)`;
    await tx`insert into growth_metrics (tenant_id, channel, followers, following) values (${tenantB}::uuid, ${MARKER_B}, 7, 3)`;
    await tx`insert into viral_signals (tenant_id, source, external_ref, content, score) values (${tenantB}::uuid, 'qa', ${MARKER_B}, ${MARKER_B}, 1)`;
    await tx`insert into wiki_docs (tenant_id, path, title, content, hash) values (${tenantB}::uuid, ${`${MARKER_B}.md`}, ${MARKER_B}, ${MARKER_B}, ${MARKER_B})`;
    await tx`insert into usage_events (tenant_id, event_type, quantity, meta) values (${tenantB}::uuid, ${MARKER_B}, 1, ${tx.json({ marker: MARKER_B })})`;
    await tx`insert into subscriptions (tenant_id, tier, status) values (${tenantB}::uuid, 'team', 'active')`;
    await tx`insert into usage_quotas (tenant_id, period, shorts_used, generations_used) values (${tenantB}::uuid, '2099-12', 7, 11)`;
  });

  writeTenantFiles(tenantA, MARKER_A, queueA, blogA);
  bPaths = writeTenantFiles(tenantB, MARKER_B, queueB, blogB);
  const bDataHashBefore = hashDirectory(bPaths.tenantData);
  const bConfigHashBefore = hashDirectory(bPaths.tenantConfig);

  const own = await request(`/api/studio/drafts?tenant_id=${tenantA}`, { token: tokenA });
  addResult("정상", "HAPPY-01 A 토큰으로 A 초안 읽기", own, own.status === 200 && own.text.includes(MARKER_A), "자기 데이터가 보여야 한다");
  const ownB = await request(`/api/studio/drafts?tenant_id=${tenantB}`, { token: tokenB });
  addResult("정상", "HAPPY-02 B 토큰으로 B 초안 읽기", ownB, ownB.status === 200 && ownB.text.includes(MARKER_B), "B 데이터 존재 증명");

  const cases = readCases({ tenantB, draftB, postB });
  for (const [name, routePath] of cases) {
    const cross = await request(routePath, { token: tokenA });
    addResult("교차 읽기", `${name} ${routePath.split("?")[0]}`, cross, !cross.text.includes(MARKER_B), "A 토큰과 B tenant_id");

    const anonymous = await request(routePath);
    addResult("무토큰", `${name} ${routePath.split("?")[0]}`, anonymous, anonymous.status === 401, "Authorization 없음");

    const revoked = await request(routePath, { token: revokedToken });
    addResult("폐기 토큰", `${name} ${routePath.split("?")[0]}`, revoked, revoked.status === 401, "폐기된 osmu 토큰");
  }

  const expired = await request("/api/me", { token: expiredJwtShape() });
  addResult(
    "만료 토큰",
    "AUTH-EXP-01 과거 exp JWT",
    expired,
    expired.status === 401 || expired.status === 503,
    expired.status === 503 ? "Supabase 검증기 미구성 상태에서도 fail-closed" : "만료 세션 거절",
  );

  const mutationCases = [
    ["WRITE-01 큐 수정", `/api/queue/${queueB}/update`, "POST", { tenant_id: tenantB, text: "ATTACKED" }],
    ["WRITE-02 큐 승인", `/api/queue/${queueB}/approve`, "POST", { tenant_id: tenantB, hours: 1 }],
    ["WRITE-03 큐 검토 요청", `/api/queue/${queueB}/request-review`, "POST", { tenant_id: tenantB }],
    ["WRITE-04 큐 삭제", `/api/queue/${queueB}/delete`, "POST", { tenant_id: tenantB }],
    ["WRITE-05 블로그 수정", `/api/blog-queue/${blogB}/update`, "POST", { tenant_id: tenantB, title: "ATTACKED" }],
    ["WRITE-06 블로그 삭제", `/api/blog-queue/${blogB}/delete`, "POST", { tenant_id: tenantB }],
    ["WRITE-07 채널 기본계정", `/api/channels/qa-isolation/accounts/${accountB}/default?tenant_id=${tenantB}`, "POST", {}],
    ["WRITE-08 채널 삭제", `/api/channels/qa-isolation/accounts/${accountB}?tenant_id=${tenantB}`, "DELETE", undefined],
    ["WRITE-09 편집실 수정", `/api/studio/drafts/${draftB}/editor`, "PATCH", { tenant_id: tenantB, expected_revision: 1, operation: "mark_ready" }],
    ["WRITE-10 편집실 큐 인계", `/api/studio/drafts/${draftB}/enqueue`, "POST", { tenant_id: tenantB }],
    ["WRITE-11 댓글 상태 수정", "/api/engagement", "POST", { tenant_id: tenantB, action: "defer", post_id: postB, comment_id: MARKER_B }],
    ["WRITE-12 이미지 삭제", `/api/images/${encodeURIComponent(`${MARKER_B}.txt`)}`, "DELETE", undefined],
  ];

  for (const [name, routePath, method, body] of mutationCases) {
    const response = await request(routePath, { token: tokenA, method, body });
    addResult("교차 변경", name, response, !response.text.includes(MARKER_B), "B 객체 ID로 수정 또는 삭제 시도");
  }

  const redirectGuide = await request("/api/guide", { token: tokenA, method: "POST", body: { tenant_id: tenantB, guide: `${MARKER_A}_BODY_REBOUND` } });
  addResult("몸통 위조", "BODY-01 guide tenant_id 위조", redirectGuide, redirectGuide.status === 200, "B가 아니라 A 공간에 써야 한다");
  const redirectIntegration = await request("/api/integrations", {
    token: tokenA,
    method: "POST",
    body: { tenant_id: tenantB, kind: "qa-body-spoof", label: MARKER_A, secret: MARKER_A, meta: { marker: MARKER_A } },
  });
  addResult("몸통 위조", "BODY-02 integration tenant_id 위조", redirectIntegration, redirectIntegration.status === 200, "DB 쓰기 범위가 A로 재결정돼야 한다");
  const redirectSchedule = await request("/api/schedule", {
    token: tokenA,
    method: "POST",
    body: { tenant_id: tenantB, platforms: ["threads"], scheduled_at: new Date(Date.now() + 86_400_000).toISOString(), payload: { marker: MARKER_A } },
  });
  addResult("몸통 위조", "BODY-03 schedule tenant_id 위조", redirectSchedule, redirectSchedule.status === 200, "DB 쓰기 범위가 A로 재결정돼야 한다");

  const [bDb] = await sql`
    select
      (select idea from drafts where id = ${draftB}::uuid) as draft_idea,
      (select text from queue_posts where id = ${queueB}::uuid) as queue_text,
      (select display_name from channel_accounts where id = ${accountB}::uuid) as account_name,
      (select status from schedules where id = ${scheduleB}::uuid) as schedule_status,
      (select reply_text from engagement_items where tenant_id = ${tenantB}::uuid and provider_comment_id = ${MARKER_B}) as reply_text`;
  const bDbIntact = Object.values(bDb).every((value) => value === MARKER_B || value === "scheduled");
  const bFilesIntact = hashDirectory(bPaths.tenantData) === bDataHashBefore && hashDirectory(bPaths.tenantConfig) === bConfigHashBefore;
  const [aRedirectCounts] = await sql`
    select
      (select count(*)::int from integrations where tenant_id = ${tenantA}::uuid and kind = 'qa-body-spoof' and label = ${MARKER_A}) as integrations,
      (select count(*)::int from integrations where tenant_id = ${tenantB}::uuid and kind = 'qa-body-spoof' and label = ${MARKER_A}) as leaked_integrations,
      (select count(*)::int from schedules where tenant_id = ${tenantA}::uuid and payload->>'marker' = ${MARKER_A}) as schedules,
      (select count(*)::int from schedules where tenant_id = ${tenantB}::uuid and payload->>'marker' = ${MARKER_A}) as leaked_schedules`;
  addResult("사후 검증", "POST-01 B 데이터베이스 불변", { status: 200 }, bDbIntact, "수정과 삭제 공격 뒤 원값 유지");
  addResult("사후 검증", "POST-02 B 파일 불변", { status: 200 }, bFilesIntact, "파일 해시 유지");
  addResult(
    "사후 검증",
    "POST-03 몸통 tenant_id 무시",
    { status: 200 },
    aRedirectCounts.integrations === 1 && aRedirectCounts.leaked_integrations === 0 && aRedirectCounts.schedules === 1 && aRedirectCounts.leaked_schedules === 0,
    "A에만 생성되고 B에는 0건",
  );

  const failures = results.filter((result) => !result.passed);
  const summary = {
    generatedAt: new Date().toISOString(),
    baseUrl: BASE_URL,
    tenantA,
    tenantB,
    markerA: MARKER_A,
    markerB: MARKER_B,
    total: results.length,
    passed: results.length - failures.length,
    failed: failures.length,
    results,
  };
  if (process.env.ISOLATION_REPORT_JSON) {
    fs.writeFileSync(process.env.ISOLATION_REPORT_JSON, JSON.stringify(summary, null, 2));
  }
  console.log(JSON.stringify(summary));
  if (failures.length) process.exitCode = 1;
} finally {
  if (tenantA || tenantB) {
    await sql`delete from tenants where id in (${tenantA ?? null}::uuid, ${tenantB ?? null}::uuid)`.catch(() => {});
  }
  if (tenantA) {
    fs.rmSync(path.join(dataRoot, "tenants", tenantA), { recursive: true, force: true });
    fs.rmSync(path.join(configRoot, "tenants", tenantA), { recursive: true, force: true });
  }
  if (tenantB) {
    fs.rmSync(path.join(dataRoot, "tenants", tenantB), { recursive: true, force: true });
    fs.rmSync(path.join(configRoot, "tenants", tenantB), { recursive: true, force: true });
  }
  await sql.end({ timeout: 5 });
}
