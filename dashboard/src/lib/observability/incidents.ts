import { withTenant } from "@/lib/db";

export const INCIDENT_CATEGORIES = [
  "publish_failed",
  "token_expired",
  "generation_failed",
  "external_service_error",
] as const;
export const INCIDENT_SOURCES = [
  "threads",
  "instagram",
  "x",
  "facebook",
  "bluesky",
  "telegram",
  "discord",
  "slack",
  "youtube",
  "linkedin",
  "pinterest",
  "tumblr",
  "tiktok",
  "line",
  "naver_blog",
  "shared_ai",
  "studio",
  "unknown_platform",
] as const;
export const INCIDENT_REASONS = [
  "http_4xx",
  "http_429",
  "http_5xx",
  "network_error",
  "provider_unreachable",
  "token_expired",
  "token_revoked",
  "timeout",
  "provider_unavailable",
  "provider_rate_limited",
  "output_limit",
  "spawn_failed",
  "exit_nonzero",
  "stdin_failed",
  "unknown",
] as const;

export type IncidentCategory = (typeof INCIDENT_CATEGORIES)[number];
export type IncidentSource = (typeof INCIDENT_SOURCES)[number];
export type IncidentReason = (typeof INCIDENT_REASONS)[number];
export type IncidentIntervention = "human" | "automatic";
export type IncidentSeverity = "critical" | "error" | "warning";

const INCIDENT_SOURCE_SET = new Set<string>(INCIDENT_SOURCES);

export function normalizeIncidentSource(value: unknown): IncidentSource {
  return typeof value === "string" && INCIDENT_SOURCE_SET.has(value)
    ? value as IncidentSource
    : "unknown_platform";
}

export interface OperationalIncidentInput {
  workspaceId: string;
  category: IncidentCategory;
  source: IncidentSource;
  reasonCode: IncidentReason;
  severity: IncidentSeverity;
  intervention: IncidentIntervention;
  resourceKey?: string;
}

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

function fingerprint(input: Pick<OperationalIncidentInput, "category" | "source" | "reasonCode" | "resourceKey">): string {
  const base = `${input.category}:${input.source}:${input.reasonCode}`;
  return input.resourceKey ? `${base}:${input.resourceKey}` : base;
}

export async function recordOperationalIncident(input: OperationalIncidentInput): Promise<boolean> {
  if (!UUID_RE.test(input.workspaceId)) return false;

  try {
    await withTenant(input.workspaceId, async (tx) => {
      await tx`
        INSERT INTO operational_incidents (
          tenant_id, fingerprint, category, source, reason_code, severity, intervention
        ) VALUES (
          ${input.workspaceId},
          ${fingerprint(input)},
          ${input.category},
          ${input.source},
          ${input.reasonCode},
          ${input.severity},
          ${input.intervention}
        )
        ON CONFLICT (tenant_id, fingerprint) WHERE status = 'open'
        DO UPDATE SET
          severity = EXCLUDED.severity,
          intervention = EXCLUDED.intervention,
          occurrences = operational_incidents.occurrences + 1,
          last_seen_at = now()
      `;
    });
    return true;
  } catch {
    console.error(JSON.stringify({
      ts: new Date().toISOString(),
      kind: "operational_incident_store_failed",
      category: input.category,
      source: input.source,
      workspace_id: input.workspaceId,
    }));
    return false;
  }
}

export async function recoverOperationalIncidents(
  workspaceId: string,
  match: Pick<OperationalIncidentInput, "category" | "source" | "resourceKey">,
): Promise<boolean> {
  if (!UUID_RE.test(workspaceId)) return false;

  try {
    await withTenant(workspaceId, async (tx) => {
      if (match.resourceKey) {
        await tx`
          UPDATE operational_incidents
          SET status = 'recovered', recovered_at = now(), last_seen_at = now()
          WHERE tenant_id = ${workspaceId}
            AND category = ${match.category}
            AND source = ${match.source}
            AND fingerprint LIKE ${`${match.category}:${match.source}:%:${match.resourceKey}`}
            AND status = 'open'
        `;
      } else {
        await tx`
          UPDATE operational_incidents
          SET status = 'recovered', recovered_at = now(), last_seen_at = now()
          WHERE tenant_id = ${workspaceId}
            AND category = ${match.category}
            AND source = ${match.source}
            AND status = 'open'
        `;
      }
    });
    return true;
  } catch {
    console.error(JSON.stringify({
      ts: new Date().toISOString(),
      kind: "operational_incident_recovery_failed",
      category: match.category,
      source: match.source,
      workspace_id: workspaceId,
    }));
    return false;
  }
}

export async function recoverUnconfiguredChannelIncidents(
  workspaceId: string,
  configuredSources: IncidentSource[],
): Promise<boolean> {
  if (!UUID_RE.test(workspaceId)) return false;

  try {
    await withTenant(workspaceId, async (tx) => {
      await tx`
        UPDATE operational_incidents
        SET status = 'recovered', recovered_at = now(), last_seen_at = now()
        WHERE tenant_id = ${workspaceId}
          AND category IN ('token_expired', 'external_service_error')
          AND status = 'open'
          AND NOT (source = ANY(${configuredSources}::text[]))
      `;
    });
    return true;
  } catch {
    console.error(JSON.stringify({
      ts: new Date().toISOString(),
      kind: "operational_incident_configuration_recovery_failed",
      workspace_id: workspaceId,
    }));
    return false;
  }
}
