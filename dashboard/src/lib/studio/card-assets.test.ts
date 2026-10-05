import { beforeEach, describe, expect, it, vi } from "vitest";

const H = vi.hoisted(() => ({ existing: new Set<string>() }));

vi.mock("@/lib/media-store", () => ({
  mediaStore: { exists: vi.fn(async (_tenantId: string, filename: string) => H.existing.has(filename)) },
}));

import { resolveCardAssetUrls } from "./card-assets";

beforeEach(() => { H.existing = new Set(["owned.png"]); });

describe("S2 카드 asset resolver", () => {
  it("테넌트 저장소에 실제 존재하는 이미지 파일만 렌더 URL로 해석한다", async () => {
    await expect(resolveCardAssetUrls("tenant-a", ["owned.png"], (filename) => `signed:${filename}`))
      .resolves.toEqual({ "owned.png": "signed:owned.png" });
  });

  it.each(["missing.png", "../other/secret.png", "payload.txt"])("소유권·경로·MIME 계약 밖 asset %s를 거절한다", async (assetId) => {
    await expect(resolveCardAssetUrls("tenant-a", [assetId], (filename) => `signed:${filename}`))
      .rejects.toThrow("CARD_ASSET_INVALID");
  });
});
