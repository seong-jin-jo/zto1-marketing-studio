import { ApiResponseError } from "./api";

export const GENERATOR_BUSY_RETRY_DELAYS_MS = [1_000, 2_000] as const;

export function isGeneratorBusyResponse(error: unknown): boolean {
  if (!(error instanceof ApiResponseError) || error.status !== 503) return false;
  return (error.payload as { code?: unknown } | null)?.code === "GENERATOR_BUSY";
}

export async function retryGeneratorBusy<T>(
  operation: () => Promise<T>,
  wait: (milliseconds: number) => Promise<void> = (milliseconds) =>
    new Promise((resolve) => setTimeout(resolve, milliseconds)),
): Promise<T> {
  for (let attempt = 0; ; attempt += 1) {
    try {
      return await operation();
    } catch (error) {
      const delay = GENERATOR_BUSY_RETRY_DELAYS_MS[attempt];
      if (!isGeneratorBusyResponse(error) || delay === undefined) throw error;
      await wait(delay);
    }
  }
}
