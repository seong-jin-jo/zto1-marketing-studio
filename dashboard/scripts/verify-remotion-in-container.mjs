// 컨테이너 안에서 Remotion이 실제로 렌더되는지 확인하는 1회용 스크립트.
// 2026-10-02: Alpine chromium + REMOTION_CHROME_PATH 조합이 실제로 동작하는지는
// 로컬 macOS에서 돌린 통합 테스트로는 증명되지 않는다(로컬은 Remotion 기본 다운로드
// Chrome Headless Shell을 쓴다). docker run으로 이 스크립트를 실행해 운영 이미지
// 안에서 직접 렌더한다.
import { bundle } from "@remotion/bundler";
import { renderMedia, selectComposition } from "@remotion/renderer";
import path from "path";

async function main() {
  const entry = path.join(process.cwd(), "remotion", "entry.ts");
  const browserExecutable = process.env.REMOTION_CHROME_PATH || undefined;
  console.log("REMOTION_CHROME_PATH =", browserExecutable);
  const bundleUrl = await bundle({ entryPoint: entry, onProgress: () => {} });
  const composition = await selectComposition({
    serveUrl: bundleUrl,
    id: "outro-logo-reveal",
    inputProps: { brandName: "CONTAINER-TEST", logoUrl: "", primaryColor: "#000000" },
    browserExecutable,
  });
  const outputLocation = "/tmp/container-render.mp4";
  await renderMedia({
    composition,
    serveUrl: bundleUrl,
    codec: "h264",
    outputLocation,
    inputProps: { brandName: "CONTAINER-TEST", logoUrl: "", primaryColor: "#000000" },
    browserExecutable,
    chromiumOptions: { gl: "swangle" },
  });
  console.log("RENDER_OK", outputLocation);
}

main().catch((err) => {
  console.error("RENDER_FAILED", err);
  process.exit(1);
});
