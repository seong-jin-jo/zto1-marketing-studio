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
import { tenantVideosDir } from "@/lib/storage";
import { runWithTenant } from "@/lib/tenant-context";
import type { ClaimedExportItem } from "./export-contract";
import { PostgresExportRepository } from "./export-repository";
import { sha256Hex } from "./export-source-hash";
import { probeRenderedVideo, renderVideoExport } from "./video-export-renderer";
import { VideoRenderAssetError } from "./video-render-assets";

const CARD_RENDER_TIMEOUT_MS = 120_000;
const VIDEO_RENDER_TIMEOUT_MS = 240_000;

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

export function exportArtifactFilename(item: Pick<ClaimedExportItem, "job_id" | "ordinal" | "source_hash" | "kind">): string {
  return `export-${item.job_id}-${item.ordinal}-${item.source_hash.slice(0, 16)}.${item.kind === "video" ? "mp4" : "png"}`;
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
  if (item.kind === "video") {
    if (!("video" in item.request_payload)) throw new Error("VIDEO_EXPORT_INVALID");
    await renderVideoExport(item.tenant_id, item.request_payload.video, outputPath);
    return;
  }
  if (!("deck" in item.request_payload)) throw new Error("CARD_DECK_INVALID");
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
  if (error instanceof VideoRenderAssetError) return { code: error.code, detail: error.message, retryable: error.code === "VIDEO_VOICE_RENDER_FAILED" };
  if (message.startsWith("VIDEO_") || message.startsWith("PLAYBACK_") || message === "SUBTITLE_FONT_MISSING") {
    return { code: message, detail: message, retryable: message === "VIDEO_PROBE_FAILED" || message === "VIDEO_RENDER_FAILED" };
  }
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
    put: async (tenantId, filename, body) => {
      const video = filename.endsWith(".mp4");
      await mediaStore.put(tenantId, filename, body, video ? "video/mp4" : "image/png");
      if (video) {
        await runWithTenant(tenantId, async () => {
          const dir = tenantVideosDir(tenantId);
          if (!dir) throw new Error("VIDEO_EXPORT_INVALID_TENANT");
          fs.mkdirSync(dir, { recursive: true });
          fs.writeFileSync(path.join(dir, filename), body);
        });
      }
    },
  };
}

export class ExportItemWorker {
  constructor(private readonly dependencies: ExportWorkerDependencies) {}

  async process(item: ClaimedExportItem): Promise<boolean> {
    const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "studio-export-"));
    const filename = exportArtifactFilename(item);
    const outputPath = path.join(tmpDir, filename);
    const heartbeat = setInterval(() => {
      void this.dependencies.repository.heartbeat(item).catch(() => undefined);
    }, 15_000);
    try {
      let timeout: ReturnType<typeof setTimeout> | undefined;
      try {
        await Promise.race([
          this.dependencies.render(item, outputPath),
          new Promise<never>((_, reject) => {
            timeout = setTimeout(() => reject(new Error(item.kind === "video" ? "VIDEO_RENDER_TIMEOUT" : "CARD_RENDER_TIMEOUT")), item.kind === "video" ? VIDEO_RENDER_TIMEOUT_MS : CARD_RENDER_TIMEOUT_MS);
          }),
        ]);
      } finally {
        if (timeout) clearTimeout(timeout);
      }
      const body = fs.readFileSync(outputPath);
      let width: number;
      let height: number;
      let contentType: string;
      if (item.kind === "video") {
        const info = await probeRenderedVideo(outputPath);
        width = info.width;
        height = info.height;
        contentType = "video/mp4";
      } else {
        if (!("deck" in item.request_payload)) throw new Error("CARD_DECK_INVALID");
        width = CARD_LOGICAL_WIDTH;
        height = CARD_LOGICAL_HEIGHT[item.request_payload.deck.ratio];
        contentType = "image/png";
      }
      const artifact: ExportArtifact = {
        key: filename,
        sha256: sha256Hex(body),
        contentType,
        byteSize: body.byteLength,
        width,
        height,
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
