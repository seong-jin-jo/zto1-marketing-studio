import { z } from "zod";
import { AuthError } from "@/lib/tenant-auth";
import type { CardDeckV3 } from "./card-element-contract";
import { canonicalJson, sha256Hex } from "./export-source-hash";
import { resolveStudioPrincipal } from "./generation/identity";
import { StudioApiError } from "./generation/errors";

export const exportKindSchema = z.enum(["card_deck"]);
export type ExportKind = z.infer<typeof exportKindSchema>;
export type ExportJobStatus = "queued" | "processing" | "succeeded" | "partially_failed" | "failed" | "cancelled";
export type ExportItemStatus = "queued" | "processing" | "succeeded" | "failed" | "cancelled";

const hashSchema = z.string().regex(/^[0-9a-f]{64}$/);
const uuidPattern = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
export const createExportSchema = z.strictObject({
  kind: exportKindSchema,
  expected_source_revision: z.number().int().min(0),
  expected_source_hash: hashSchema,
  item_keys: z.null(),
});
export const retryExportSchema = z.strictObject({
  item_keys: z.array(z.string().min(1).max(160)).min(1).max(100),
}).superRefine((input, context) => {
  if (new Set(input.item_keys).size !== input.item_keys.length) {
    context.addIssue({ code: "custom", path: ["item_keys"], message: "item_keys must be unique" });
  }
});

export type CreateExportInput = z.infer<typeof createExportSchema>;
export type RetryExportInput = z.infer<typeof retryExportSchema>;

export class ExportQueueError extends Error {
  constructor(
    readonly status: number,
    readonly code: string,
    message: string,
    readonly details?: Record<string, unknown>,
  ) {
    super(message);
    this.name = "ExportQueueError";
  }
}

export function parseCreateExport(value: unknown): CreateExportInput {
  const result = createExportSchema.safeParse(value);
  if (!result.success) throw new ExportQueueError(400, "INVALID_EXPORT_REQUEST", "내보내기 요청 형식이 올바르지 않습니다");
  return result.data;
}

export function parseRetryExport(value: unknown): RetryExportInput {
  const result = retryExportSchema.safeParse(value);
  if (!result.success) throw new ExportQueueError(400, "INVALID_EXPORT_REQUEST", "재시도 요청 형식이 올바르지 않습니다");
  return result.data;
}

export function parseIdempotencyKey(request: Request): string {
  const value = request.headers.get("Idempotency-Key")?.trim() ?? "";
  if (!value || value.length > 255) {
    throw new ExportQueueError(400, "INVALID_EXPORT_REQUEST", "Idempotency-Key는 1자 이상 255자 이하여야 합니다");
  }
  return value;
}

export function parseDraftId(value: string): string {
  if (!uuidPattern.test(value)) throw new ExportQueueError(404, "DRAFT_NOT_FOUND", "초안을 찾을 수 없습니다");
  return value;
}

export function parseExportId(value: string): string {
  if (!uuidPattern.test(value)) throw new ExportQueueError(404, "EXPORT_NOT_FOUND", "내보내기를 찾을 수 없습니다");
  return value;
}

export function exportRequestHash(input: CreateExportInput): string {
  return sha256Hex(canonicalJson(input));
}

export async function exportMemberId(request: Request): Promise<string> {
  return (await resolveStudioPrincipal(request)).memberId;
}

export function exportErrorResponse(error: unknown): Response {
  if (error instanceof ExportQueueError) {
    return Response.json({ error: error.message, code: error.code, ...error.details }, { status: error.status });
  }
  if (error instanceof AuthError) {
    return Response.json({ error: error.message, code: error.code }, { status: error.status });
  }
  if (error instanceof StudioApiError) {
    return Response.json({ error: error.message, code: error.code }, { status: error.status });
  }
  return Response.json({ error: "내보내기 대기열 처리에 실패했습니다", code: "EXPORT_ENQUEUE_FAILED" }, { status: 500 });
}

export interface ExportItemRecord {
  item_key: string;
  ordinal: number;
  status: ExportItemStatus;
  attempt_count: number;
  artifact_key: string | null;
  error_code: string | null;
}

export interface ExportJobRecord {
  id: string;
  draft_id: string;
  kind: ExportKind;
  status: ExportJobStatus;
  source_revision: number;
  source_hash: string;
  total_items: number;
  succeeded_items: number;
  failed_items: number;
  created_at: Date | string;
  updated_at: Date | string;
  finished_at: Date | string | null;
  items: ExportItemRecord[];
}

export interface ClaimedExportItem {
  id: string;
  tenant_id: string;
  job_id: string;
  draft_id: string;
  item_key: string;
  ordinal: number;
  source_hash: string;
  attempt_count: number;
  max_attempts: number;
  lease_token: string;
  request_payload: { deck: CardDeckV3 };
}
