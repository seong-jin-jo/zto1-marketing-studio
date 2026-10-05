import path from "node:path";
import { mediaStore } from "@/lib/media-store";
import { isSafeMediaFilename } from "@/lib/media-token";

const CARD_ASSET_EXTENSIONS = new Set([".jpg", ".jpeg", ".png", ".gif", ".webp"]);

/** 안정 asset id를 테넌트 저장소 안의 실제 이미지로 검증한 뒤 렌더 URL로 바꾼다. */
export async function resolveCardAssetUrls(
  tenantId: string,
  assetIds: Iterable<string>,
  deliveryUrl: (filename: string) => string,
): Promise<Record<string, string>> {
  const result: Record<string, string> = {};
  for (const assetId of new Set(assetIds)) {
    const extension = path.extname(assetId).toLowerCase();
    if (!isSafeMediaFilename(assetId) || !CARD_ASSET_EXTENSIONS.has(extension)) {
      throw new Error("CARD_ASSET_INVALID");
    }
    if (!await mediaStore.exists(tenantId, assetId)) {
      throw new Error("CARD_ASSET_INVALID");
    }
    result[assetId] = deliveryUrl(assetId);
  }
  return result;
}
