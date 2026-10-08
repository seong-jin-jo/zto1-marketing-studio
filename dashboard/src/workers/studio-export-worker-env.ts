export const REQUIRED_STUDIO_EXPORT_WORKER_ENV = [
  "DATABASE_URL",
  "MEDIA_SIGNING_SECRET",
  "OSMU_PUBLIC_URL",
] as const;

export type StudioExportWorkerEnvKey = (typeof REQUIRED_STUDIO_EXPORT_WORKER_ENV)[number];

export function requireStudioExportWorkerEnv(
  environment: Partial<Record<string, string | undefined>> = process.env,
): Record<StudioExportWorkerEnvKey, string> {
  const resolved = {} as Record<StudioExportWorkerEnvKey, string>;
  for (const key of REQUIRED_STUDIO_EXPORT_WORKER_ENV) {
    const value = environment[key]?.trim();
    if (!value) throw new Error(`${key} is required for the persistent export worker`);
    resolved[key] = value;
  }
  return resolved;
}
