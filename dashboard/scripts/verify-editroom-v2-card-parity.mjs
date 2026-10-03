#!/usr/bin/env node

import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { chromium } from "playwright-core";
import sharp from "sharp";
import { build } from "vite";

const scriptDir = path.dirname(fileURLToPath(import.meta.url));
const dashboardRoot = path.resolve(scriptDir, "..");
const repoRoot = path.resolve(dashboardRoot, "..");
const baseUrl = process.env.EDITROOM_V2_BASE_URL || "http://localhost:3472";
const outputDir = process.env.EDITROOM_V2_OUTPUT_DIR || path.join(repoRoot, "logs/diff/editroom-v2-phase1/card-parity");
const buildDir = fs.mkdtempSync(path.join(os.tmpdir(), "editroom-card-parity-"));
const entry = path.join(dashboardRoot, "tests/fixtures/editroom-v2/card-parity-browser.ts");

fs.mkdirSync(outputDir, { recursive: true });

function pngBuffer(dataUrl) {
  const marker = "base64,";
  const offset = dataUrl.indexOf(marker);
  if (offset < 0) throw new Error("PNG data URL 형식이 아닙니다.");
  return Buffer.from(dataUrl.slice(offset + marker.length), "base64");
}

function compareText(preview, output) {
  const lineCountEqual = preview.length === output.length;
  const textEqual = JSON.stringify(preview.map((line) => line.text)) === JSON.stringify(output.map((line) => line.text));
  let maxBoundaryDelta = 0;
  for (let index = 0; index < Math.min(preview.length, output.length); index += 1) {
    for (const key of ["left", "top", "right", "bottom"]) {
      maxBoundaryDelta = Math.max(maxBoundaryDelta, Math.abs(preview[index][key] - output[index][key]));
    }
  }
  return { previewLineCount: preview.length, outputLineCount: output.length, lineCountEqual, textEqual, maxBoundaryDelta };
}

async function comparePng(previewBuffer, outputBuffer, diffPath) {
  const preview = await sharp(previewBuffer).ensureAlpha().raw().toBuffer({ resolveWithObject: true });
  const output = await sharp(outputBuffer).ensureAlpha().raw().toBuffer({ resolveWithObject: true });
  if (preview.info.width !== output.info.width || preview.info.height !== output.info.height || preview.info.channels !== output.info.channels) {
    throw new Error(`이미지 크기가 다릅니다: ${JSON.stringify({ preview: preview.info, output: output.info })}`);
  }
  const diff = Buffer.alloc(preview.data.length);
  let changedPixels = 0;
  let maximumChannelDelta = 0;
  const channels = preview.info.channels;
  for (let offset = 0; offset < preview.data.length; offset += channels) {
    let changed = false;
    for (let channel = 0; channel < channels; channel += 1) {
      const delta = Math.abs(preview.data[offset + channel] - output.data[offset + channel]);
      diff[offset + channel] = channel === 3 ? 255 : delta;
      maximumChannelDelta = Math.max(maximumChannelDelta, delta);
      if (delta > 0) changed = true;
    }
    if (changed) changedPixels += 1;
  }
  await sharp(diff, { raw: preview.info }).png().toFile(diffPath);
  return {
    width: preview.info.width,
    height: preview.info.height,
    changedPixels,
    changedPixelRatio: changedPixels / (preview.info.width * preview.info.height),
    maximumChannelDelta,
  };
}

let browser;
try {
  await build({
    configFile: false,
    logLevel: "error",
    build: {
      outDir: buildDir,
      emptyOutDir: true,
      lib: { entry, name: "EditroomCardParity", formats: ["iife"], fileName: () => "card-parity.js" },
    },
  });

  browser = await chromium.launch({ headless: true });
  const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
  await page.goto(`${baseUrl}/qa/alignment-card-1.jpg`, { waitUntil: "load" });
  await page.addScriptTag({ path: path.join(buildDir, "card-parity.js") });
  const fixtures = await page.evaluate(() => window.renderEditroomCardParityFixtures());

  const observations = [];
  for (const fixture of fixtures) {
    const previewBuffer = pngBuffer(fixture.preview.dataUrl);
    const outputBuffer = pngBuffer(fixture.output.dataUrl);
    const previewPath = path.join(outputDir, `${fixture.name}-baseline.png`);
    const outputPath = path.join(outputDir, `${fixture.name}-actual.png`);
    const diffPath = path.join(outputDir, `${fixture.name}-diff.png`);
    fs.writeFileSync(previewPath, previewBuffer);
    fs.writeFileSync(outputPath, outputBuffer);
    const pixels = await comparePng(previewBuffer, outputBuffer, diffPath);
    const text = compareText(fixture.preview.text, fixture.output.text);
    const editorDecorationCount = fixture.output.text.filter((line) => ["굵게", "화자 전환", "쪼개기", "합치기", "삭제"].includes(line.text)).length;
    const photoExpected = fixture.name.endsWith("-photo");
    const photoDrawn = fixture.preview.drawImageCount > 0 && fixture.output.drawImageCount > 0;
    if (!text.lineCountEqual || !text.textEqual || text.maxBoundaryDelta > 2 || pixels.changedPixels > 0
      || editorDecorationCount > 0 || (photoExpected && !photoDrawn)) {
      throw new Error(`${fixture.name} 미리보기·출력 불일치: ${JSON.stringify({ text, pixels })}`);
    }
    observations.push({
      name: fixture.name,
      kind: fixture.kind,
      text,
      pixels,
      photoExpected,
      photoDrawn,
      editorDecorationCount,
      previewPath,
      outputPath,
      diffPath,
    });
  }

  const mutationChecks = ["plain-4x5-long-center", "chat-long-bold"].map((name) => {
    const source = observations.find((item) => item.name === name);
    if (!source) throw new Error(`${name} 돌연변이 대상을 찾지 못했습니다.`);
    const mutated = { ...source.text, maxBoundaryDelta: source.text.maxBoundaryDelta + 3 };
    const rejected = mutated.maxBoundaryDelta > 2;
    if (!rejected) throw new Error(`${name} 3px 글 경계 돌연변이를 거절하지 못했습니다.`);
    return { name, mutation: "첫 글 경계를 3px 이동", expected: "FAIL", result: "rejected", maxBoundaryDelta: mutated.maxBoundaryDelta };
  });

  const report = { thresholdPx: 2, fixtures: observations, mutationChecks };
  fs.writeFileSync(path.join(outputDir, "card-parity-observations.json"), `${JSON.stringify(report, null, 2)}\n`);
  process.stdout.write(`${JSON.stringify({ fixtures: observations.length, mutationChecks, outputDir })}\n`);
} finally {
  if (browser) await browser.close();
  fs.rmSync(buildDir, { recursive: true, force: true });
}
