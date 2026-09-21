export type StudioFieldError = {
  field: string;
  reason: string;
};

export class StudioApiError extends Error {
  readonly kind = "StudioApiError";
  readonly status: number;
  readonly code: string;
  readonly retryable: boolean;
  readonly fieldErrors: StudioFieldError[];
  readonly details: Record<string, unknown>;

  constructor(input: {
    status: number;
    code: string;
    message: string;
    retryable?: boolean;
    fieldErrors?: StudioFieldError[];
    details?: Record<string, unknown>;
    /** 사람에게 보여주는 message 뒤에 숨은 원인(예: postgres 원본 error). 응답 본문에는
     * 절대 안 나가고, studioFailure 가 5xx 일 때만 request_id 와 한 줄로 로그에 얹는 데 쓴다. */
    cause?: unknown;
  }) {
    super(input.message, input.cause !== undefined ? { cause: input.cause } : undefined);
    this.name = "StudioApiError";
    this.status = input.status;
    this.code = input.code;
    this.retryable = input.retryable ?? false;
    this.fieldErrors = input.fieldErrors ?? [];
    this.details = input.details ?? {};
  }
}

export function isStudioApiError(error: unknown): error is StudioApiError {
  if (error === null || typeof error !== "object") return false;
  const candidate = error as Partial<StudioApiError>;
  return candidate.kind === "StudioApiError"
    && typeof candidate.status === "number"
    && typeof candidate.code === "string"
    && typeof candidate.message === "string"
    && typeof candidate.retryable === "boolean"
    && Array.isArray(candidate.fieldErrors)
    && candidate.details !== null
    && typeof candidate.details === "object";
}
