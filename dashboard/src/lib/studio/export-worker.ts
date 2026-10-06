import crypto from "node:crypto";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { CARD_LOGICAL_HEIGHT, CARD_LOGICAL_WIDTH, type CardDeckV3 } from "./card-element-contract";
import { cardSlideRenderModel } from "./card-render-model";
import { renderCardSlidePng } from "./card-slide-render";
import { resolveCardAssetUrls } from "./card-assets";
import { signImageToken } from "@/lib/image-token";
import { mediaStore } from "@/lib/media-store";
import type { ClaimedExportItem } from "./export-contract";
import { PostgresExportRepository } from "./export-repository";
import { sha256Hex } from "./export-source-hash";

const CARD_RENDER_TIMEOUT_MS = 120_000;

export interface ExportArtifact {
  key: string;
  sha256: string;
  contentType: string;
  byteSize: number;
  width: number;
  height: number;
}

export interface ExportWorkerDependencies {
  repository: Pick<PostgresExportRepository, "heartbeat" | "complete" | "fail">;
  render(item: ClaimedExportItem, outputPath: string): Promise<void>;
  put(tenantId: string, filename: string, body: Buffer): Promise<void>;
  afterUpload?(item: ClaimedExportItem, artifact: ExportArtifact): Promise<void>;
}

export function exportArtifactFilename(item: Pick<ClaimedExportItem, "job_id" | "ordinal" | "source_hash">): string {
  return `export-${item.job_id}-${item.ordinal}-${item.source_hash.slice(0, 16)}.png`;
}

function publicOrigin(): string {
  const origin = process.env.OSMU_PUBLIC_URL?.replace(/\/+$/, "") ?? "";
  const parsed = new URL(origin);
  const local = parsed.hostname === "localhost" || parsed.hostname === "127.0.0.1";
  if (parsed.protocol !== "https:" && !(local && parsed.protocol === "http:")) throw new Error("CARD_RENDER_PUBLIC_URL_MISSING");
  return origin;
}

function assetIds(deck: CardDeckV3): string[] {
  const ids = new Set<string>();
  for (const slide of deck.slides) {
    if (slide.background.kind === "image" && !slide.background.asset_id.startsWith("builtin:")) ids.add(slide.background.asset_id);
    for (const element of slide.elements) {
      if ((element.type === "image" || element.type === "sticker" || element.type === "logo")
        && !element.asset_id.startsWith("builtin:")) ids.add(element.asset_id);
    }
  }
  return [...ids];
}

async function realRender(item: ClaimedExportItem, outputPath: string): Promise<void> {
  const deck = item.request_payload.deck;
  const slide = deck.slides.find((candidate) => candidate.id === item.item_key);
  if (!slide || slide.content_state === "empty") throw new Error("CARD_DECK_INVALID");
  const origin = publicOrigin();
  const urls = await resolveCardAssetUrls(item.tenant_id, assetIds(deck), (filename) => {
    const token = signImageToken(item.tenant_id, filename, 15 * 60 * 1000);
    if (!token) throw new Error("CARD_RENDER_PUBLIC_URL_MISSING");
    return `${origin}/api/images/deliver/${encodeURIComponent(token)}`;
  });
  await renderCardSlidePng({ model: cardSlideRenderModel(deck, slide.id, urls), outputPath });
}

function publicError(error: unknown): { code: string; detail: string; retryable: boolean } {
  const message = error instanceof Error ? error.message : "unknown export worker error";
  if (message.includes("CARD_DECK_INVALID") || message.includes("CARD_ASSET_INVALID")) {
    return { code: message.includes("ASSET") ? "CARD_ASSET_INVALID" : "CARD_DECK_INVALID", detail: message, retryable: false };
  }
  if (message.includes("FONT_LOAD_FAILED") || message.includes("CARD_RENDER_PUBLIC_URL_MISSING")) {
    return { code: message.includes("FONT") ? "FONT_LOAD_FAILED" : "CARD_RENDER_PUBLIC_URL_MISSING", detail: message, retryable: false };
  }
  return { code: message === "CARD_RENDER_TIMEOUT" ? "CARD_RENDER_TIMEOUT" : "CARD_RENDER_FAILED", detail: message, retryable: true };
}

export function realExportWorkerDependencies(repository = new PostgresExportRepository()): ExportWorkerDependencies {
  return {
    repository,
    render: realRender,
    put: async (tenantId, filename, body) => mediaStore.put(tenantId, filename, body, "image/png"),
  };
}

export class ExportItemWorker {
  constructor(private readonly dependencies: ExportWorkerDependencies) {}

  async process(item: ClaimedExportItem): Promise<boolean> {
    const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "studio-export-"));
    const filename = exportArtifactFilename(item);
    const outputPath = path.join(tmpDir, filename);
    const heartbeat = setInterval(() => void this.dependencies.repository.heartbeat(item), 15_000);
    try {
      let timeout: ReturnType<typeof setTimeout> | undefined;
      try {
        await Promise.race([
          this.dependencies.render(item, outputPath),
          new Promise<never>((_, reject) => {
            timeout = setTimeout(() => reject(new Error("CARD_RENDER_TIMEOUT")), CARD_RENDER_TIMEOUT_MS);
          }),
        ]);
      } finally {
        if (timeout) clearTimeout(timeout);
      }
      const body = fs.readFileSync(outputPath);
      const deck = item.request_payload.deck;
      const artifact: ExportArtifact = {
        key: filename,
        sha256: sha256Hex(body),
        contentType: "image/png",
        byteSize: body.byteLength,
        width: CARD_LOGICAL_WIDTH,
        height: CARD_LOGICAL_HEIGHT[deck.ratio],
      };
      await this.dependencies.put(item.tenant_id, filename, body);
      await this.dependencies.afterUpload?.(item, artifact);
      return this.dependencies.repository.complete(item, artifact);
    } catch (error) {
      const failure = publicError(error);
      await this.dependencies.repository.fail(item, failure.code, failure.detail, failure.retryable);
      return false;
    } finally {
      clearInterval(heartbeat);
      fs.rmSync(tmpDir, { recursive: true, force: true });
    }
  }
}

export function workerId(): string {
  return `${os.hostname()}:${process.pid}:${crypto.randomBytes(4).toString("hex")}`;
}
