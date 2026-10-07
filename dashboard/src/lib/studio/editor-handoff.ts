import crypto from "node:crypto";
import type { AddQueuePostInput, StudioHandoffSourceContext } from "@/lib/queue-add";

export const EDITOR_HANDOFF_CONTRACT_VERSION = "1.0";
export const EDITOR_HANDOFF_KINDS = ["text", "image", "video", "card", "audio"] as const;

export type EditorHandoffKind = typeof EDITOR_HANDOFF_KINDS[number];

export type EditorLine = {
  id: string;
  order: number;
  text: string;
  visible: boolean;
  deleted_at: string | null;
};

export type EditorScene = {
  id: string;
  order: number;
  title: string;
  lines: EditorLine[];
};

export type EditorSlide = {
  id: string;
  order: number;
  text: string;
  image_url: string | null;
};

export type EditorHandoffPayload =
  | { kind: "text"; body: string }
  | { kind: "image"; asset_url: string; alt_text: string }
  | { kind: "video"; asset_url: string; scenes: EditorScene[] }
  | { kind: "card"; slides: EditorSlide[] }
  | { kind: "audio"; asset_url: string; lines: EditorLine[] };

export type EditorMutationRecord = {
  operation: EditorOperation["operation"];
  target_id: string | null;
  revision: number;
  at: string;
};

export type EditorHandoff = {
  contract_version: typeof EDITOR_HANDOFF_CONTRACT_VERSION;
  handoff_id: string;
  kind: EditorHandoffKind;
  summary: string;
  source: {
    generation_id: string | null;
    candidate_id: string | null;
  };
  payload: EditorHandoffPayload;
  revision: number;
  status: "editing" | "ready_for_openclaw";
  history: EditorMutationRecord[];
  created_at: string;
  updated_at: string;
};

export type EditorOperation =
  | { operation: "reorder_scenes"; ordered_ids: string[] }
  | { operation: "delete_line"; line_id: string }
  | { operation: "restore_line"; line_id: string }
  | { operation: "mark_ready" };

export class EditorContractError extends Error {
  constructor(message: string, readonly status = 400, readonly code = "INVALID_EDITOR_CONTRACT") {
    super(message);
  }
}

function record(value: unknown): Record<string, unknown> | null {
  return value !== null && typeof value === "object" && !Array.isArray(value)
    ? value as Record<string, unknown>
    : null;
}

function requiredText(value: unknown, field: string, max = 10_000): string {
  const normalized = typeof value === "string" ? value.trim() : "";
  if (!normalized || normalized.length > max) {
    throw new EditorContractError(`${field} must be a non-empty string up to ${max} characters`);
  }
  return normalized;
}

function optionalText(value: unknown, field: string, max = 2_000): string | null {
  if (value === null || value === undefined || value === "") return null;
  return requiredText(value, field, max);
}

function assetReference(value: unknown, field: string): string {
  const reference = requiredText(value, field, 2_000);
  if (/^(?:javascript|data):/i.test(reference)) {
    throw new EditorContractError(`${field} uses a forbidden scheme`);
  }
  return reference;
}

function ordered<T extends { id: string; order: number }>(items: T[], field: string): T[] {
  const ids = new Set(items.map((item) => item.id));
  if (ids.size !== items.length) throw new EditorContractError(`${field} ids must be unique`);
  const orders = items.map((item) => item.order).sort((a, b) => a - b);
  if (orders.some((value, index) => value !== index)) {
    throw new EditorContractError(`${field} order must be contiguous from zero`);
  }
  return [...items].sort((a, b) => a.order - b.order);
}

function parseLines(value: unknown, field: string): EditorLine[] {
  if (!Array.isArray(value) || value.length === 0) {
    throw new EditorContractError(`${field} must contain at least one line`);
  }
  const lines = value.map((entry, index) => {
    const input = record(entry);
    if (!input) throw new EditorContractError(`${field}.${index} must be an object`);
    const order = Number(input.order);
    if (!Number.isSafeInteger(order) || order < 0) {
      throw new EditorContractError(`${field}.${index}.order must be a non-negative integer`);
    }
    return {
      id: requiredText(input.id, `${field}.${index}.id`, 120),
      order,
      text: requiredText(input.text, `${field}.${index}.text`),
      visible: input.visible !== false,
      deleted_at: input.visible === false ? optionalText(input.deleted_at, `${field}.${index}.deleted_at`) : null,
    };
  });
  return ordered(lines, field);
}

function parsePayload(kind: EditorHandoffKind, value: unknown): EditorHandoffPayload {
  const payload = record(value);
  if (!payload) throw new EditorContractError("payload must be an object");
  if (kind === "text") return { kind, body: requiredText(payload.body, "payload.body") };
  if (kind === "image") {
    return {
      kind,
      asset_url: assetReference(payload.asset_url, "payload.asset_url"),
      alt_text: requiredText(payload.alt_text, "payload.alt_text", 1_000),
    };
  }
  if (kind === "video") {
    if (!Array.isArray(payload.scenes) || payload.scenes.length === 0) {
      throw new EditorContractError("payload.scenes must contain at least one scene");
    }
    const scenes = payload.scenes.map((entry, index) => {
      const scene = record(entry);
      if (!scene) throw new EditorContractError(`payload.scenes.${index} must be an object`);
      const order = Number(scene.order);
      if (!Number.isSafeInteger(order) || order < 0) {
        throw new EditorContractError(`payload.scenes.${index}.order must be a non-negative integer`);
      }
      return {
        id: requiredText(scene.id, `payload.scenes.${index}.id`, 120),
        order,
        title: requiredText(scene.title, `payload.scenes.${index}.title`, 500),
        lines: parseLines(scene.lines, `payload.scenes.${index}.lines`),
      };
    });
    return {
      kind,
      asset_url: assetReference(payload.asset_url, "payload.asset_url"),
      scenes: ordered(scenes, "payload.scenes"),
    };
  }
  if (kind === "card") {
    if (!Array.isArray(payload.slides) || payload.slides.length === 0) {
      throw new EditorContractError("payload.slides must contain at least one slide");
    }
    const slides = payload.slides.map((entry, index) => {
      const slide = record(entry);
      if (!slide) throw new EditorContractError(`payload.slides.${index} must be an object`);
      const order = Number(slide.order);
      if (!Number.isSafeInteger(order) || order < 0) {
        throw new EditorContractError(`payload.slides.${index}.order must be a non-negative integer`);
      }
      return {
        id: requiredText(slide.id, `payload.slides.${index}.id`, 120),
        order,
        text: requiredText(slide.text, `payload.slides.${index}.text`),
        image_url: slide.image_url ? assetReference(slide.image_url, `payload.slides.${index}.image_url`) : null,
      };
    });
    return { kind, slides: ordered(slides, "payload.slides") };
  }
  return {
    kind,
    asset_url: assetReference(payload.asset_url, "payload.asset_url"),
    lines: parseLines(payload.lines, "payload.lines"),
  };
}

export function createEditorHandoff(value: unknown, now = new Date()): EditorHandoff {
  const input = record(value);
  if (!input) throw new EditorContractError("handoff must be an object");
  const kind = EDITOR_HANDOFF_KINDS.includes(input.kind as EditorHandoffKind)
    ? input.kind as EditorHandoffKind
    : null;
  if (!kind) throw new EditorContractError("kind must be text, image, video, card, or audio");
  const source = record(input.source) ?? {};
  const timestamp = now.toISOString();
  return {
    contract_version: EDITOR_HANDOFF_CONTRACT_VERSION,
    handoff_id: crypto.randomUUID(),
    kind,
    summary: requiredText(input.summary, "summary", 2_000),
    source: {
      generation_id: optionalText(source.generation_id, "source.generation_id", 120),
      candidate_id: optionalText(source.candidate_id, "source.candidate_id", 120),
    },
    payload: parsePayload(kind, input.payload),
    revision: 0,
    status: "editing",
    history: [],
    created_at: timestamp,
    updated_at: timestamp,
  };
}

export function parseEditorOperation(value: unknown): { expected_revision: number; change: EditorOperation } {
  const input = record(value);
  if (!input) throw new EditorContractError("editor command must be an object");
  const expected = Number(input.expected_revision);
  if (!Number.isSafeInteger(expected) || expected < 0) {
    throw new EditorContractError("expected_revision must be a non-negative integer");
  }
  if (input.operation === "reorder_scenes") {
    if (!Array.isArray(input.ordered_ids) || input.ordered_ids.length === 0) {
      throw new EditorContractError("ordered_ids must contain scene ids");
    }
    return { expected_revision: expected, change: { operation: input.operation, ordered_ids: input.ordered_ids.map((id, index) => requiredText(id, `ordered_ids.${index}`, 120)) } };
  }
  if (input.operation === "delete_line" || input.operation === "restore_line") {
    return { expected_revision: expected, change: { operation: input.operation, line_id: requiredText(input.line_id, "line_id", 120) } };
  }
  if (input.operation === "mark_ready") {
    return { expected_revision: expected, change: { operation: input.operation } };
  }
  throw new EditorContractError("unsupported editor operation");
}

function replaceLine(lines: EditorLine[], lineId: string, visible: boolean, now: string): EditorLine[] | null {
  let found = false;
  const next = lines.map((line) => {
    if (line.id !== lineId) return line;
    found = true;
    if (line.visible === visible) {
      throw new EditorContractError(visible ? "line is already visible" : "line is already deleted", 409, "EDITOR_STATE_CONFLICT");
    }
    return { ...line, visible, deleted_at: visible ? null : now };
  });
  return found ? next : null;
}

export function applyEditorOperation(
  handoff: EditorHandoff,
  expectedRevision: number,
  change: EditorOperation,
  now = new Date(),
): EditorHandoff {
  if (handoff.revision !== expectedRevision) {
    throw new EditorContractError("editor revision does not match", 409, "EDITOR_REVISION_CONFLICT");
  }
  const timestamp = now.toISOString();
  let payload = handoff.payload;
  let targetId: string | null = null;

  if (change.operation === "reorder_scenes") {
    if (payload.kind !== "video") {
      throw new EditorContractError("scene reorder is only available for video handoffs", 422, "EDITOR_OPERATION_NOT_ALLOWED");
    }
    const currentIds = payload.scenes.map((scene) => scene.id).sort();
    const requestedIds = [...change.ordered_ids].sort();
    if (new Set(change.ordered_ids).size !== change.ordered_ids.length || currentIds.join("\0") !== requestedIds.join("\0")) {
      throw new EditorContractError("ordered_ids must contain every scene exactly once", 422, "EDITOR_SCENE_SET_MISMATCH");
    }
    const byId = new Map(payload.scenes.map((scene) => [scene.id, scene]));
    payload = {
      ...payload,
      scenes: change.ordered_ids.map((id, order) => ({ ...byId.get(id)!, order })),
    };
  } else if (change.operation === "delete_line" || change.operation === "restore_line") {
    targetId = change.line_id;
    const visible = change.operation === "restore_line";
    if (payload.kind === "video") {
      let found = false;
      const scenes = payload.scenes.map((scene) => {
        const lines = replaceLine(scene.lines, change.line_id, visible, timestamp);
        if (!lines) return scene;
        found = true;
        return { ...scene, lines };
      });
      if (!found) throw new EditorContractError("line_id was not found", 404, "EDITOR_LINE_NOT_FOUND");
      payload = { ...payload, scenes };
    } else if (payload.kind === "audio") {
      const lines = replaceLine(payload.lines, change.line_id, visible, timestamp);
      if (!lines) throw new EditorContractError("line_id was not found", 404, "EDITOR_LINE_NOT_FOUND");
      payload = { ...payload, lines };
    } else {
      throw new EditorContractError("line operations require video or audio handoffs", 422, "EDITOR_OPERATION_NOT_ALLOWED");
    }
  }

  const revision = handoff.revision + 1;
  return {
    ...handoff,
    payload,
    revision,
    status: change.operation === "mark_ready" ? "ready_for_openclaw" : "editing",
    history: [...handoff.history, {
      operation: change.operation,
      target_id: targetId,
      revision,
      at: timestamp,
    }].slice(-50),
    updated_at: timestamp,
  };
}

export function handoffQueueInput(
  handoff: EditorHandoff,
  draftId: string,
  exportReceipt?: { exportId: string; sourceHash: string },
): AddQueuePostInput {
  if (handoff.status !== "ready_for_openclaw") {
    throw new EditorContractError("handoff must be marked ready before enqueue", 409, "EDITOR_HANDOFF_NOT_READY");
  }
  const sourceContext: StudioHandoffSourceContext = {
    type: "studio_handoff",
    handoffId: handoff.handoff_id,
    draftId,
    kind: handoff.kind,
    revision: handoff.revision,
    generationId: handoff.source.generation_id,
    candidateId: handoff.source.candidate_id,
    ...(exportReceipt ? { exportId: exportReceipt.exportId, exportSourceHash: exportReceipt.sourceHash } : {}),
  };
  const media = handoff.payload;
  return {
    text: handoff.summary,
    topic: "studio-handoff",
    imageUrl: media.kind === "image" ? media.asset_url : null,
    imageUrls: media.kind === "card" ? media.slides.map((slide) => slide.image_url).filter((url): url is string => Boolean(url)) : null,
    videoUrl: media.kind === "video" ? media.asset_url : null,
    sourceContext,
    // 발행실 고정은 export가 동일하면 같은 의도다. handoff revision을 키에 섞으면
    // 같은 export를 다시 누를 때 승인 큐 항목이 늘어날 수 있으므로 export ID 하나로
    // 멱등 범위를 고정한다. export가 없는 OpenClaw 검토 요청은 기존 handoff revision
    // 범위를 그대로 유지한다.
    idempotencyKey: exportReceipt
      ? `studio-export:${exportReceipt.exportId}`
      : `studio-handoff:${handoff.handoff_id}:revision:${handoff.revision}`,
  };
}
