import { db } from "@/lib/db";

export type OAuthCredentialFieldKey = "clientId" | "clientSecret" | "configId";
export type OAuthCredentialSource = "db" | "env";

export interface OAuthCredentialFieldDefinition {
  key: OAuthCredentialFieldKey;
  env: string;
  label: string;
  secret: boolean;
}

export interface OAuthCredentialDefinition {
  provider: string;
  label?: string;
  fields: OAuthCredentialFieldDefinition[];
  consoleUrl?: string;
  docsUrl?: string;
  setupSteps?: string[];
  setupSource?: "official" | "generic";
  externalReview?: "required" | "unknown";
}

export interface StoredOAuthCredentialRow {
  provider: string;
  client_id: string | null;
  client_secret: string | null;
  config_id: string | null;
  updated_at: string;
}

export interface ResolvedOAuthCredentialSet {
  provider: string;
  complete: boolean;
  source: OAuthCredentialSource;
  values: Partial<Record<OAuthCredentialFieldKey, string>>;
  configured: OAuthCredentialFieldKey[];
  missing: OAuthCredentialFieldKey[];
  updatedAt: string | null;
  externalReview: "required" | "unknown";
  reason?: "credential_store_unavailable";
}

export class OAuthCredentialEnvIncompleteError extends Error {
  readonly missing: string[];

  constructor(missing: string[]) {
    super("environment OAuth credential set is incomplete");
    this.name = "OAuthCredentialEnvIncompleteError";
    this.missing = missing;
  }
}

export class OAuthCredentialAlreadyStoredError extends Error {
  constructor() {
    super("OAuth credential set is already stored in DB");
    this.name = "OAuthCredentialAlreadyStoredError";
  }
}

const baseFields = (idEnv: string, secretEnv: string, idLabel = "Client ID", secretLabel = "Client Secret"): OAuthCredentialFieldDefinition[] => [
  { key: "clientId", env: idEnv, label: idLabel, secret: false },
  { key: "clientSecret", env: secretEnv, label: secretLabel, secret: true },
];

// 콘솔 클릭 경로는 공식 문서에서 현재 UI 명칭이 확인된 경우만 official이다.
// Meta/Naver/Tumblr처럼 콘솔 UI가 문서에서 고정 확인되지 않은 경로는 "일반 경로"로 정직하게 표시한다.
export const OAUTH_CREDENTIAL_DEFINITIONS: Record<string, OAuthCredentialDefinition> = {
  instagram: {
    provider: "instagram",
    label: "Instagram",
    fields: baseFields("IG_APP_ID", "IG_APP_SECRET", "App ID", "App Secret"),
    consoleUrl: "https://developers.facebook.com/apps/",
    docsUrl: "https://developers.facebook.com/docs/instagram-platform/instagram-api-with-instagram-login/business-login",
    setupSteps: [
      "일반 경로: Meta for Developers → My Apps → 앱 선택 → Instagram 제품 설정",
      "Instagram Login의 OAuth redirect URI에 아래 Callback URL을 등록",
      "앱의 App ID와 App Secret을 아래 필드에 저장",
    ],
    setupSource: "generic",
    externalReview: "required",
  },
  threads: {
    provider: "threads",
    label: "Threads",
    fields: baseFields("THREADS_APP_ID", "THREADS_APP_SECRET", "App ID", "App Secret"),
    consoleUrl: "https://developers.facebook.com/apps/",
    docsUrl: "https://developers.facebook.com/docs/threads/get-started/get-started-with-oauth",
    setupSteps: [
      "일반 경로: Meta for Developers → My Apps → 앱 선택 → Threads 제품 설정",
      "Threads OAuth redirect URI에 아래 Callback URL을 등록",
      "앱의 App ID와 App Secret을 아래 필드에 저장",
    ],
    setupSource: "generic",
    externalReview: "required",
  },
  x: {
    provider: "x",
    label: "X",
    fields: baseFields("X_CLIENT_ID", "X_CLIENT_SECRET"),
    consoleUrl: "https://console.x.com/",
    docsUrl: "https://docs.x.com/fundamentals/authentication/oauth-2-0/authorization-code",
    setupSteps: [
      "Developer Console → App → Settings → User authentication settings에서 OAuth 2.0 활성화",
      "Web App/Confidential client를 선택하고 Callback URL을 정확히 등록",
      "Keys and Tokens → Client ID와 Client Secret을 아래 필드에 저장",
    ],
    setupSource: "official",
    externalReview: "unknown",
  },
  linkedin: {
    provider: "linkedin",
    label: "LinkedIn",
    fields: baseFields("LINKEDIN_CLIENT_ID", "LINKEDIN_CLIENT_SECRET"),
    consoleUrl: "https://www.linkedin.com/developers/apps",
    docsUrl: "https://learn.microsoft.com/en-us/linkedin/shared/authentication/authorization-code-flow",
    setupSteps: [
      "LinkedIn Developer Portal → My apps → 앱 선택 → Auth",
      "Authorized redirect URLs에 아래 HTTPS Callback URL을 등록",
      "같은 Auth 탭의 Client ID와 Client Secret을 아래 필드에 저장",
    ],
    setupSource: "official",
    externalReview: "unknown",
  },
  youtube: {
    provider: "youtube",
    label: "YouTube",
    fields: baseFields("YOUTUBE_CLIENT_ID", "YOUTUBE_CLIENT_SECRET"),
    consoleUrl: "https://console.cloud.google.com/auth/clients",
    docsUrl: "https://developers.google.com/youtube/v3/guides/auth/server-side-web-apps",
    setupSteps: [
      "Google Cloud Console → Google Auth platform → Clients → Web application client 생성/선택",
      "Authorized redirect URIs에 아래 Callback URL을 정확히 등록",
      "Client ID와 Client Secret을 아래 필드에 저장하고 YouTube Data API 사용 설정 확인",
    ],
    setupSource: "official",
    externalReview: "required",
  },
  naver_blog: {
    provider: "naver_blog",
    label: "Naver Blog",
    fields: baseFields("NAVER_CLIENT_ID", "NAVER_CLIENT_SECRET"),
    consoleUrl: "https://developers.naver.com/apps/",
    docsUrl: "https://developers.naver.com/docs/login/api/api.md",
    setupSteps: [
      "일반 경로: NAVER Developers → Application → 애플리케이션 등록/선택",
      "네이버 로그인 API와 서비스 URL·Callback URL을 등록",
      "Client ID와 Client Secret을 아래 필드에 저장",
    ],
    setupSource: "generic",
    externalReview: "required",
  },
  pinterest: {
    provider: "pinterest",
    label: "Pinterest",
    fields: baseFields("PINTEREST_APP_ID", "PINTEREST_APP_SECRET", "App ID", "App Secret"),
    consoleUrl: "https://developers.pinterest.com/apps/",
    docsUrl: "https://developers.pinterest.com/docs/getting-started/set-up-authentication-and-authorization/",
    setupSteps: [
      "Pinterest Developers → My apps → 대상 앱의 Manage → Configure",
      "Redirect URIs에 아래 Callback URL을 정확히 등록",
      "API keys의 App ID와 App secret key를 아래 필드에 저장",
    ],
    setupSource: "official",
    externalReview: "required",
  },
  tumblr: {
    provider: "tumblr",
    label: "Tumblr",
    fields: baseFields("TUMBLR_CONSUMER_KEY", "TUMBLR_CONSUMER_SECRET", "Consumer Key", "Consumer Secret"),
    consoleUrl: "https://www.tumblr.com/oauth/apps",
    docsUrl: "https://www.tumblr.com/docs/en/api/v2#oauth2-authorization",
    setupSteps: [
      "일반 경로: Tumblr Applications → 앱 등록/선택",
      "OAuth2 redirect/callback 항목에 아래 Callback URL을 등록",
      "Consumer Key와 Consumer Secret을 아래 필드에 저장",
    ],
    setupSource: "generic",
    externalReview: "unknown",
  },
  tiktok: {
    provider: "tiktok",
    label: "TikTok",
    fields: baseFields("TIKTOK_CLIENT_KEY", "TIKTOK_CLIENT_SECRET", "Client Key", "Client Secret"),
    consoleUrl: "https://developers.tiktok.com/apps/",
    docsUrl: "https://developers.tiktok.com/doc/login-kit-web",
    setupSteps: [
      "TikTok for Developers → Manage apps → 앱 선택 → Login Kit 추가",
      "Login Kit product configuration에 아래 HTTPS Redirect URI를 등록",
      "앱 페이지의 Client Key와 Client Secret을 아래 필드에 저장",
    ],
    setupSource: "official",
    externalReview: "required",
  },
  slack: {
    provider: "slack",
    label: "Slack",
    fields: baseFields("SLACK_CLIENT_ID", "SLACK_CLIENT_SECRET"),
    consoleUrl: "https://api.slack.com/apps",
    docsUrl: "https://docs.slack.dev/authentication/installing-with-oauth/",
    setupSteps: [
      "Slack App Management → 앱 선택 → Basic Information → App Credentials 확인",
      "OAuth & Permissions → Redirect URLs에 아래 HTTPS Callback URL 추가",
      "Bot Token Scopes에 chat:write를 추가하고 Client ID/Secret을 아래 필드에 저장",
    ],
    setupSource: "official",
    externalReview: "unknown",
  },
  line: {
    provider: "line",
    label: "LINE",
    fields: baseFields("LINE_CLIENT_ID", "LINE_CLIENT_SECRET", "Channel ID", "Channel Secret"),
    consoleUrl: "https://developers.line.biz/console/",
    docsUrl: "https://developers.line.biz/en/docs/line-login/integrate-line-login/",
    setupSteps: [
      "LINE Developers Console → Provider → LINE Login channel 생성/선택",
      "LINE Login 탭 → Callback URL에 아래 URL을 등록하고 Web app 유형 확인",
      "Basic settings의 Channel ID와 Channel secret을 아래 필드에 저장",
    ],
    setupSource: "official",
    externalReview: "unknown",
  },
  facebook: {
    provider: "facebook",
    label: "Facebook",
    fields: [
      ...baseFields("FB_APP_ID", "FB_APP_SECRET", "App ID", "App Secret"),
      { key: "configId", env: "FB_CONFIG_ID", label: "설정 식별자", secret: false },
    ],
    consoleUrl: "https://developers.facebook.com/apps/",
    docsUrl: "https://developers.facebook.com/docs/facebook-login/facebook-login-for-business",
    setupSteps: [
      "일반 경로: Meta for Developers → My Apps → 앱 선택 → Facebook Login for Business",
      "Login configuration을 만들고 아래 Callback URL·필요 권한을 등록",
      "App ID, App Secret, 생성된 Configuration ID를 아래 필드에 저장",
    ],
    setupSource: "generic",
    externalReview: "required",
  },
};

export function getOAuthCredentialDefinition(provider: string): OAuthCredentialDefinition | null {
  return Object.hasOwn(OAUTH_CREDENTIAL_DEFINITIONS, provider)
    ? OAUTH_CREDENTIAL_DEFINITIONS[provider]
    : null;
}

function rowValue(row: StoredOAuthCredentialRow, key: OAuthCredentialFieldKey): string | null {
  if (key === "clientId") return row.client_id;
  if (key === "clientSecret") return row.client_secret;
  return row.config_id;
}

export function resolveCredentialSet(
  definition: OAuthCredentialDefinition,
  dbRow: StoredOAuthCredentialRow | null,
  env: Record<string, string | undefined> = process.env,
): ResolvedOAuthCredentialSet {
  const source: OAuthCredentialSource = dbRow ? "db" : "env";
  const candidate = Object.fromEntries(definition.fields.map((field) => [
    field.key,
    (dbRow ? rowValue(dbRow, field.key) : env[field.env])?.trim() || "",
  ])) as Record<OAuthCredentialFieldKey, string>;
  const configured = definition.fields
    .filter((field) => Boolean(candidate[field.key]))
    .map((field) => field.key);
  const missing = definition.fields
    .filter((field) => !candidate[field.key])
    .map((field) => field.key);
  const complete = missing.length === 0;

  return {
    provider: definition.provider,
    complete,
    source,
    values: complete
      ? Object.fromEntries(definition.fields.map((field) => [field.key, candidate[field.key]]))
      : {},
    configured,
    missing,
    updatedAt: dbRow?.updated_at || null,
    externalReview: definition.externalReview || "unknown",
  };
}

async function loadStoredCredentials(providers: string[]): Promise<StoredOAuthCredentialRow[]> {
  if (!process.env.DATABASE_URL || providers.length === 0) return [];
  const key = process.env.OSMU_SECRET_KEY || "";
  const sql = db();
  return sql<StoredOAuthCredentialRow[]>`
    SELECT
      provider,
      CASE WHEN client_id_enc <> '' AND ${key} <> ''
        THEN pgp_sym_decrypt(dearmor(client_id_enc), ${key}) ELSE NULL END AS client_id,
      CASE WHEN client_secret_enc <> '' AND ${key} <> ''
        THEN pgp_sym_decrypt(dearmor(client_secret_enc), ${key}) ELSE NULL END AS client_secret,
      CASE WHEN config_id_enc IS NOT NULL AND config_id_enc <> '' AND ${key} <> ''
        THEN pgp_sym_decrypt(dearmor(config_id_enc), ${key}) ELSE NULL END AS config_id,
      updated_at::text
    FROM oauth_app_credentials
    WHERE provider = ANY(${providers})`;
}

function isUndefinedTableError(error: unknown): boolean {
  return Boolean(
    error
    && typeof error === "object"
    && "code" in error
    && (error as { code?: unknown }).code === "42P01",
  );
}

function unavailableCredentialSet(definition: OAuthCredentialDefinition): ResolvedOAuthCredentialSet {
  return {
    provider: definition.provider,
    complete: false,
    source: "db",
    values: {},
    configured: [],
    missing: definition.fields.map((field) => field.key),
    updatedAt: null,
    externalReview: definition.externalReview || "unknown",
    reason: "credential_store_unavailable",
  };
}

export async function resolveOAuthCredentialSets(
  providers: string[],
): Promise<Record<string, ResolvedOAuthCredentialSet>> {
  const definitions = [...new Set(providers)]
    .map((provider) => getOAuthCredentialDefinition(provider))
    .filter((definition): definition is OAuthCredentialDefinition => Boolean(definition));
  if (definitions.length === 0) return {};

  try {
    const rows = await loadStoredCredentials(definitions.map((definition) => definition.provider));
    const rowsByProvider = new Map(rows.map((row) => [row.provider, row]));
    return Object.fromEntries(definitions.map((definition) => [
      definition.provider,
      resolveCredentialSet(definition, rowsByProvider.get(definition.provider) || null),
    ]));
  } catch (error) {
    // expand/contract 배포 또는 명시적 rollback으로 additive table이 아직/더 이상 없으면 기존 env
    // credential 세트를 계속 쓴다. 반면 DB 장애·복호화 실패·권한 오류는 env로 우회하지 않고 fail-closed.
    if (isUndefinedTableError(error)) {
      return Object.fromEntries(definitions.map((definition) => [
        definition.provider,
        resolveCredentialSet(definition, null),
      ]));
    }
    // DB row 조회/복호화가 실패했는데 env로 우회하면 DB 우선 계약과 partial fail-closed를 깨뜨린다.
    return Object.fromEntries(definitions.map((definition) => [
      definition.provider,
      unavailableCredentialSet(definition),
    ]));
  }
}

export async function resolveOAuthCredentialSet(provider: string): Promise<ResolvedOAuthCredentialSet | null> {
  const definition = getOAuthCredentialDefinition(provider);
  if (!definition) return null;
  const resolved = await resolveOAuthCredentialSets([provider]);
  return resolved[provider] || null;
}

function maskedValue(configured: boolean): string | null {
  return configured ? "••••••••" : null;
}

export async function listOAuthCredentialMetadata(origin: string) {
  const definitions = Object.values(OAUTH_CREDENTIAL_DEFINITIONS);
  const resolvedByProvider = process.env.DATABASE_URL && process.env.OSMU_SECRET_KEY
    ? await resolveOAuthCredentialSets(definitions.map((definition) => definition.provider))
    : Object.fromEntries(definitions.map((definition) => [
      definition.provider,
      unavailableCredentialSet(definition),
    ]));
  return definitions.map((definition) => {
    const resolved = resolvedByProvider[definition.provider];
    const configured = new Set(resolved?.configured || []);
    return {
      provider: definition.provider,
      label: definition.label || definition.provider,
      fields: definition.fields.map((field) => ({
        ...field,
        configured: configured.has(field.key),
        maskedValue: maskedValue(configured.has(field.key)),
      })),
      complete: Boolean(resolved?.complete),
      credentialsConfigured: Boolean(resolved?.complete),
      source: resolved?.source || "env",
      updatedAt: resolved?.updatedAt || null,
      missing: definition.fields.filter((field) => !configured.has(field.key)).map((field) => field.env),
      requiredSecrets: definition.fields.map((field) => field.env),
      callbackUrl: `${origin}/api/connect/${definition.provider}/callback`,
      consoleUrl: definition.consoleUrl,
      docsUrl: definition.docsUrl,
      setupSteps: definition.setupSteps,
      setupSource: definition.setupSource,
      externalReview: definition.externalReview || "unknown",
      unavailableReason: resolved?.reason,
    };
  });
}

export function validateOAuthCredentialValues(
  provider: unknown,
  values: unknown,
): { ok: true; provider: string; values: Record<OAuthCredentialFieldKey, string> } | { ok: false } {
  const definition = getOAuthCredentialDefinition(String(provider || ""));
  if (!definition || !values || typeof values !== "object" || Array.isArray(values)) return { ok: false };
  const record = values as Record<string, unknown>;
  const allowed = new Set(definition.fields.map((field) => field.key));
  if (Object.keys(record).some((key) => !allowed.has(key as OAuthCredentialFieldKey))) return { ok: false };

  const normalized = {} as Record<OAuthCredentialFieldKey, string>;
  for (const field of definition.fields) {
    const value = record[field.key];
    if (typeof value !== "string") return { ok: false };
    const trimmed = value.trim();
    if (!trimmed || trimmed.length > 4096 || /[\u0000\r\n]/.test(trimmed)) return { ok: false };
    normalized[field.key] = trimmed;
  }
  return { ok: true, provider: definition.provider, values: normalized };
}

export async function upsertOAuthCredentialSet(
  provider: string,
  values: Record<string, string>,
): Promise<{ updatedAt: string }> {
  const definition = getOAuthCredentialDefinition(provider);
  const key = process.env.OSMU_SECRET_KEY || "";
  if (!definition || !process.env.DATABASE_URL || !key) throw new Error("credential store unavailable");
  const clientId = values.clientId;
  const clientSecret = values.clientSecret;
  const configId = definition.fields.some((field) => field.key === "configId") ? values.configId : null;
  const sql = db();
  return sql.begin(async (tx) => {
    const [row] = await tx<{ updated_at: string }[]>`
      INSERT INTO oauth_app_credentials (
        provider, client_id_enc, client_secret_enc, config_id_enc, updated_at
      ) VALUES (
        ${provider},
        armor(pgp_sym_encrypt(${clientId}, ${key})),
        armor(pgp_sym_encrypt(${clientSecret}, ${key})),
        CASE WHEN ${configId}::text IS NULL
          THEN NULL
          ELSE armor(pgp_sym_encrypt(${configId}, ${key}))
        END,
        now()
      )
      ON CONFLICT (provider) DO UPDATE SET
        client_id_enc = EXCLUDED.client_id_enc,
        client_secret_enc = EXCLUDED.client_secret_enc,
        config_id_enc = EXCLUDED.config_id_enc,
        updated_at = now()
      RETURNING updated_at::text`;
    await tx`
      INSERT INTO oauth_credential_audit (provider, action)
      VALUES (${provider}, 'update')`;
    return { updatedAt: row.updated_at };
  }) as Promise<{ updatedAt: string }>;
}

export async function importOAuthCredentialSetFromEnv(
  provider: string,
): Promise<{ updatedAt: string }> {
  const definition = getOAuthCredentialDefinition(provider);
  const key = process.env.OSMU_SECRET_KEY || "";
  if (!definition) throw new Error("unknown OAuth provider");
  if (!process.env.DATABASE_URL || !key) throw new Error("credential store unavailable");

  const values: Partial<Record<OAuthCredentialFieldKey, string>> = {};
  const missing: string[] = [];
  for (const field of definition.fields) {
    const value = process.env[field.env]?.trim() || "";
    if (!value || value.length > 4096 || /[\u0000\r\n]/.test(value)) {
      missing.push(field.env);
      continue;
    }
    values[field.key] = value;
  }
  if (missing.length > 0) throw new OAuthCredentialEnvIncompleteError(missing);

  const clientId = values.clientId as string;
  const clientSecret = values.clientSecret as string;
  const configId = definition.fields.some((field) => field.key === "configId")
    ? values.configId as string
    : null;
  const sql = db();
  return sql.begin(async (tx) => {
    // DO NOTHING은 동시 import까지 포함해 기존 DB 세트를 절대 덮어쓰지 않는 원자적 경계다.
    // env 값은 이 INSERT의 암호화 파라미터로만 전달하고 응답·오류·감사 행에는 포함하지 않는다.
    const [row] = await tx<{ updated_at: string }[]>`
      INSERT INTO oauth_app_credentials (
        provider, client_id_enc, client_secret_enc, config_id_enc, updated_at
      ) VALUES (
        ${provider},
        armor(pgp_sym_encrypt(${clientId}, ${key})),
        armor(pgp_sym_encrypt(${clientSecret}, ${key})),
        CASE WHEN ${configId}::text IS NULL
          THEN NULL
          ELSE armor(pgp_sym_encrypt(${configId}, ${key}))
        END,
        now()
      )
      ON CONFLICT (provider) DO NOTHING
      RETURNING updated_at::text`;
    if (!row) throw new OAuthCredentialAlreadyStoredError();
    await tx`
      INSERT INTO oauth_credential_audit (provider, action)
      VALUES (${provider}, 'import')`;
    return { updatedAt: row.updated_at };
  }) as Promise<{ updatedAt: string }>;
}

export async function deleteOAuthCredentialSet(provider: string): Promise<{ deleted: boolean }> {
  if (!getOAuthCredentialDefinition(provider)) throw new Error("unknown OAuth provider");
  const sql = db();
  return sql.begin(async (tx) => {
    const [deleted] = await tx<{ provider: string }[]>`
      DELETE FROM oauth_app_credentials
      WHERE provider = ${provider}
      RETURNING provider`;
    if (deleted) {
      await tx`
        INSERT INTO oauth_credential_audit (provider, action)
        VALUES (${provider}, 'delete')`;
    }
    return { deleted: Boolean(deleted) };
  }) as Promise<{ deleted: boolean }>;
}

export async function revealOAuthCredentialSet(provider: string): Promise<{
  provider: string;
  source: OAuthCredentialSource;
  values: Partial<Record<OAuthCredentialFieldKey, string>>;
  imported: boolean;
}> {
  const definition = getOAuthCredentialDefinition(provider);
  const key = process.env.OSMU_SECRET_KEY || "";
  if (!definition) throw new Error("unknown OAuth provider");
  if (!process.env.DATABASE_URL || !key) throw new Error("credential store unavailable");
  const sql = db();
  return sql.begin(async (tx) => {
    const loadDbRow = async (): Promise<StoredOAuthCredentialRow | null> => {
      const [row] = await tx<StoredOAuthCredentialRow[]>`
        SELECT
          provider,
          CASE WHEN client_id_enc <> ''
            THEN pgp_sym_decrypt(dearmor(client_id_enc), ${key}) ELSE NULL END AS client_id,
          CASE WHEN client_secret_enc <> ''
            THEN pgp_sym_decrypt(dearmor(client_secret_enc), ${key}) ELSE NULL END AS client_secret,
          CASE WHEN config_id_enc IS NOT NULL AND config_id_enc <> ''
            THEN pgp_sym_decrypt(dearmor(config_id_enc), ${key}) ELSE NULL END AS config_id,
          updated_at::text
        FROM oauth_app_credentials
        WHERE provider = ${provider}
        FOR UPDATE`;
      return row || null;
    };

    let row = await loadDbRow();
    let imported = false;
    if (!row) {
      const values: Partial<Record<OAuthCredentialFieldKey, string>> = {};
      const missing: string[] = [];
      for (const field of definition.fields) {
        const value = process.env[field.env]?.trim() || "";
        if (!value || value.length > 4096 || /[\u0000\r\n]/.test(value)) {
          missing.push(field.env);
          continue;
        }
        values[field.key] = value;
      }
      if (missing.length > 0) throw new OAuthCredentialEnvIncompleteError(missing);

      const clientId = values.clientId as string;
      const clientSecret = values.clientSecret as string;
      const configId = definition.fields.some((field) => field.key === "configId")
        ? values.configId as string
        : null;
      const [inserted] = await tx<{ updated_at: string }[]>`
        INSERT INTO oauth_app_credentials (
          provider, client_id_enc, client_secret_enc, config_id_enc, updated_at
        ) VALUES (
          ${provider},
          armor(pgp_sym_encrypt(${clientId}, ${key})),
          armor(pgp_sym_encrypt(${clientSecret}, ${key})),
          CASE WHEN ${configId}::text IS NULL
            THEN NULL
            ELSE armor(pgp_sym_encrypt(${configId}, ${key}))
          END,
          now()
        )
        ON CONFLICT (provider) DO NOTHING
        RETURNING updated_at::text`;
      if (inserted) {
        imported = true;
        await tx`
          INSERT INTO oauth_credential_audit (provider, action)
          VALUES (${provider}, 'import')`;
      }
      // 충돌 시에도 기존 DB 행이 정본이다. env로 덮어쓰거나 env 원문을 바로 응답하지 않고
      // 같은 트랜잭션에서 DB 행을 다시 잠가 복호화한 결과만 reveal한다.
      row = await loadDbRow();
    }

    if (!row) throw new Error("credential set unavailable");
    const resolved = resolveCredentialSet(definition, row, {});
    if (!resolved.complete || resolved.source !== "db") throw new Error("credential set unavailable");
    await tx`
      INSERT INTO oauth_credential_audit (provider, action)
      VALUES (${provider}, 'reveal')`;
    return {
      provider,
      source: resolved.source,
      values: resolved.values,
      imported,
    };
  }) as Promise<{
    provider: string;
    source: OAuthCredentialSource;
    values: Partial<Record<OAuthCredentialFieldKey, string>>;
    imported: boolean;
  }>;
}
