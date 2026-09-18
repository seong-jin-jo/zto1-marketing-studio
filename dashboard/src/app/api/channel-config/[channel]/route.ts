import { readJson, writeJson, configPath } from "@/lib/file-io";
import { verifyChannel } from "@/lib/verify-channel";
import { effectiveTenantId } from "@/lib/tenant-auth";
import { runWithTenant } from "@/lib/tenant-context";
import { withTenant } from "@/lib/db";
import { isMaskedSecret } from "@/lib/secret-mask";
import { setDefaultAccount, syncLegacyIntegration, upsertChannelAccount } from "@/lib/channel-accounts";

interface OpenClawConfig {
  plugins?: {
    entries?: Record<string, { enabled?: boolean; config?: Record<string, string> }>;
  };
}

function shouldPersistSecretInput(value: unknown): value is string {
  return typeof value === "string" && Boolean(value.trim()) && !isMaskedSecret(value);
}

// 수동 입력 키를 대시보드 "직접 발행"(publish.ts getChannelCred)이 읽는 integrations 테이블로 브리지한다.
// openclaw.json(위)은 게이트웨이 extension 경로용, integrations(아래)는 대시보드 직접 발행용 —
// 같은 키를 두 곳에 채워야 UI 수동입력 → /api/publish 경로가 끊기지 않는다.
// getChannelCred가 이해하는 채널(직접발행 함수 존재)만 대상:
//   threads/instagram/x/facebook(P5) + bluesky/telegram/discord/slack(credential·webhook 방식, 이번 차수).
// 그 외(line/naver_blog/tiktok/linkedin/pinterest/tumblr/youtube)는
// 직접발행 함수가 없어 게이트웨이 extension(openclaw.json)만으로 발행 → 브리지 불필요.
function toIntegration(channel: string, cfg: Record<string, string>): { secret: string; meta: Record<string, unknown> } | null {
  if (channel === "threads") return { secret: cfg.accessToken || "", meta: { userId: cfg.userId || null, api: "threads_login" } };
  if (channel === "instagram") return { secret: cfg.accessToken || "", meta: { userId: cfg.userId || null, api: "instagram_login" } };
  if (channel === "facebook") return { secret: cfg.accessToken || "", meta: { userId: cfg.pageId || null, api: "facebook_graph" } };
  if (channel === "x") {
    // X는 4키 OAuth1.0a — token 컬럼 미사용, 4키를 meta에 적재(publish.ts의 X 발행이 소비).
    return { secret: "", meta: { apiKey: cfg.apiKey || null, apiKeySecret: cfg.apiKeySecret || null, accessToken: cfg.accessToken || null, accessTokenSecret: cfg.accessTokenSecret || null, api: "x_oauth1" } };
  }
  // bluesky: App Password를 secret(token)으로, handle은 meta(publishBluesky가 createSession identifier로 사용).
  if (channel === "bluesky") return { secret: cfg.appPassword || "", meta: { handle: cfg.handle || null, api: "bluesky_app_password" } };
  // telegram: Bot Token을 secret으로, chatId는 meta(발행 대상 채팅방 — 없으면 publishTelegram이 명확히 에러).
  if (channel === "telegram") return { secret: cfg.botToken || "", meta: { chatId: cfg.chatId || null, api: "telegram_bot" } };
  // discord/slack: webhook URL 자체를 secret(token)으로 — 별도 meta 불필요.
  if (channel === "discord") return { secret: cfg.webhookUrl || "", meta: { api: "discord_webhook" } };
  if (channel === "slack") return { secret: cfg.webhookUrl || "", meta: { api: "slack_webhook" } };
  return null;
}

async function bridgeToIntegrations(tenantId: string | null, channel: string, cfg: Record<string, string>, saved: boolean): Promise<void> {
  if (!tenantId || !saved) return; // 검증 실패(키 미저장)면 브리지 안 함
  const key = process.env.OSMU_SECRET_KEY;
  if (!key) return; // 암호화 키 없으면 DB 저장 불가(openclaw.json 게이트웨이 경로는 이미 기록됨)
  const m = toIntegration(channel, cfg);
  if (!m) return; // 직접발행 미지원 채널 — 게이트웨이 extension만(브리지 대상 아님)
  try {
    await withTenant(tenantId, (sql) => sql`
      INSERT INTO integrations (tenant_id, kind, label, secret_enc, meta)
      VALUES (${tenantId}, 'channel', ${channel},
              armor(pgp_sym_encrypt(${m.secret}, ${key})),
              ${sql.json(m.meta as Parameters<typeof sql.json>[0])})
      ON CONFLICT (tenant_id, kind, label) DO UPDATE
        SET secret_enc = EXCLUDED.secret_enc, meta = EXCLUDED.meta`);
  } catch { /* DB 미가용 — openclaw.json(게이트웨이)만으로 진행(파일 기반 상태 유지) */ }
}

const PLUGIN_MAP: Record<string, string> = {
  threads: "threads-publish",
  x: "x-publish",
  facebook: "facebook-publish",
  bluesky: "bluesky-publish",
  instagram: "instagram-publish",
  linkedin: "linkedin-publish",
  pinterest: "pinterest-publish",
  tumblr: "tumblr-publish",
  tiktok: "tiktok-publish",
  youtube: "youtube-publish",
  telegram: "telegram-publish",
  discord: "discord-publish",
  slack: "slack-publish",
  line: "line-publish",
  naver_blog: "naver-blog-publish",
  blog: "sample-blog",
};

export async function POST(request: Request, { params }: { params: Promise<{ channel: string }> }) {
  // 테넌트 컨텍스트로 감싸 파일 I/O를 테넌트별로 격리
  const __t = await effectiveTenantId(request, null);
  return runWithTenant(__t, async () => {
  const { channel } = await params;
  const data = await request.json();
  const cfgPath = configPath("openclaw.json");
  // 신규 tenant는 아직 openclaw.json이 없을 수 있다(DB-first 저장이 SSOT, 파일은 게이트웨이용
  // 캐시). 파일 부재를 404로 취급하면 신규 tenant가 채널 연결 자체를 못 한다(SNS-005) —
  // 빈 config로 시작해 writeJson이 최초 파일을 만들도록 한다.
  const config = readJson<OpenClawConfig>(cfgPath) ?? {};

  // Threads: update multiple plugins
  if (channel === "threads") {
    const plugins = (config.plugins ??= {}).entries ??= {};
    for (const pname of ["threads-publish", "threads-insights", "threads-search", "threads-growth"]) {
      const p = (plugins[pname] ??= { enabled: true, config: {} });
      if (!p.config) p.config = {};
      if (shouldPersistSecretInput(data.accessToken)) {
        p.config.accessToken = data.accessToken.trim();
      }
      if (shouldPersistSecretInput(data.userId)) {
        p.config.userId = data.userId.trim();
      }
    }
    const tpCfg = plugins["threads-publish"]?.config || {};
    const result = await verifyChannel("threads", tpCfg);
    for (const pname of ["threads-publish", "threads-insights", "threads-search", "threads-growth"]) {
      if (plugins[pname]) plugins[pname].enabled = result.verified;
    }
    writeJson(cfgPath, config);
    await bridgeToIntegrations(__t, "threads", tpCfg, result.verified || !!result.unverified);
    return Response.json({ ok: true, ...result });
  }

  // X: custom key mapping
  if (channel === "x") {
    const plugins = (config.plugins ??= {}).entries ??= {};
    const xp = (plugins["x-publish"] ??= { enabled: false, config: {} });
    if (!xp.config) xp.config = {};
    for (const key of ["apiKey", "apiKeySecret", "accessToken", "accessTokenSecret"]) {
      if (shouldPersistSecretInput(data[key])) {
        xp.config[key] = data[key].trim();
      }
    }
    const result = await verifyChannel("x", xp.config || {});
    xp.enabled = result.verified;
    writeJson(cfgPath, config);
    await bridgeToIntegrations(__t, "x", xp.config || {}, result.verified || !!result.unverified);
    return Response.json({ ok: true, ...result });
  }

  // Generic channel
  const pluginName = PLUGIN_MAP[channel];
  if (!pluginName) {
    return Response.json({ error: `Unknown channel: ${channel}` }, { status: 400 });
  }

  const plugins = (config.plugins ??= {}).entries ??= {};
  const p = (plugins[pluginName] ??= { enabled: false, config: {} });
  if (!p.config) p.config = {};

  for (const [key, val] of Object.entries(data)) {
    if (shouldPersistSecretInput(val)) {
      p.config[key] = val.trim();
    }
  }

  const result = await verifyChannel(channel, p.config || {});
  // 이 세 채널의 수동 연결은 발행 계정(channel_accounts)의 기본 계정이어야 한다.
  // integrations만 갱신하면 연결 화면은 미연결이고 예약 발행도 대상 계정을 찾지 못한다.
  if (result.verified && ["slack", "telegram", "discord"].includes(channel)) {
    const credential = toIntegration(channel, p.config || {});
    if (!__t || !credential?.secret) {
      return Response.json({ verified: false, error: "연결 정보를 저장할 수 없습니다. 로그인 상태를 확인하고 다시 시도해 주세요." }, { status: 503 });
    }
    try {
      const account = await upsertChannelAccount({
        tenantId: __t,
        provider: channel,
        externalId: "manual",
        displayName: result.account || `${channel} webhook`,
        accessToken: credential.secret,
        meta: credential.meta,
      });
      if (account.isDefault) await syncLegacyIntegration(__t, channel, account.id);
      else {
        // 예전 Slack OAuth 토큰이 기본이면 webhook으로 교체해야 실제 발행이 가능하다.
        const selected = await setDefaultAccount(__t, channel, account.id);
        if (!selected.ok) throw new Error("default account selection failed");
      }
    } catch {
      return Response.json({ verified: false, error: "연결 정보를 저장하지 못했습니다. 잠시 후 다시 시도해 주세요." }, { status: 503 });
    }
  }
  p.enabled = result.verified;
  writeJson(cfgPath, config);
  // facebook/instagram은 직접발행 대상 → integrations 브리지(toIntegration이 그 외 채널은 null로 무시).
  if (!["slack", "telegram", "discord"].includes(channel)) {
    await bridgeToIntegrations(__t, channel, p.config || {}, result.verified || !!result.unverified);
  }
  return Response.json({ ok: true, enabled: p.enabled, ...result });
  });
}
