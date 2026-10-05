import fs from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

const read = (relative: string) => fs.readFileSync(path.join(process.cwd(), relative), "utf8");

describe("S2-AC3~5 공용 CardSlideScene 서버 PNG 계약", () => {
  it("Remotion Root가 4:5·1:1 CardSlideComposition을 등록하고 같은 CardSlideScene을 쓴다", () => {
    const root = read("remotion/Root.tsx");
    const composition = read("remotion/CardSlideComposition.tsx");
    expect(root).toContain("CardSlideComposition-4x5");
    expect(root).toContain("CardSlideComposition-1x1");
    expect(composition).toContain("CardSlideScene");
    expect(composition).toContain('renderMode="export"');
  });

  it("인트로·아웃트로와 카드 정지화상이 bundle cache와 render slot을 공용 runtime에서 공유한다", () => {
    expect(read("src/lib/intro-outro-render.ts")).toContain('from "@/lib/remotion-runtime"');
    const runtime = read("src/lib/remotion-runtime.ts");
    expect(runtime).toContain("getRemotionBundleUrl");
    expect(runtime).toContain("withRemotionRenderSlot");
    expect(runtime).toContain('"@": path.join(process.cwd(), "src")');
    expect(read("src/lib/studio/card-slide-render.ts")).toContain("renderStill");
  });

  it("S2-AC5 기존 Canvas PNG는 flag off fallback으로 남고 flag on 서버 렌더 경로와 분리된다", () => {
    const page = read("src/app/studio/page.tsx");
    expect(page).toContain("cardDeckV3RenderingEnabled");
    expect(page).toContain("renderAndUploadCardDeck");
    expect(read("src/lib/studio/card-deck-v3-publish-gate.ts")).toContain("prepareDraftCardDeckV3ForPublish");
  });
});
