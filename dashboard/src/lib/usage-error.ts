import { ApiResponseError, AuthRequiredError } from "./api";

export function classifyUsageError(error: unknown): { delayed: boolean; message?: string } {
  if (!error) return { delayed: false };
  if (error instanceof ApiResponseError && (error.payload as { status?: unknown } | null)?.status === "delayed") {
    return { delayed: true };
  }
  if (error instanceof AuthRequiredError) {
    return { delayed: false, message: "로그인이 필요합니다. 다시 로그인한 뒤 사용량을 불러와 주세요." };
  }
  if (error instanceof ApiResponseError) {
    return { delayed: false, message: `사용량을 불러오지 못했습니다 (${error.status}). ${error.message}` };
  }
  return { delayed: false, message: "네트워크 연결을 확인한 뒤 사용량을 다시 불러와 주세요." };
}
