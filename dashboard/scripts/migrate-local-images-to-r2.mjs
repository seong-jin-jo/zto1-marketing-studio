#!/usr/bin/env node

import { HeadObjectCommand, PutObjectCommand, S3Client } from "@aws-sdk/client-s3";
import fs from "node:fs";
import path from "node:path";

const REQUIRED_ENV = ["R2_ACCESS_KEY_ID", "R2_SECRET_ACCESS_KEY", "R2_BUCKET", "R2_ENDPOINT"];
const missing = REQUIRED_ENV.filter((key) => !process.env[key]?.trim());
if (missing.length > 0) {
  console.error(`R2 환경변수가 누락됐습니다: ${missing.join(", ")}`);
  process.exit(1);
}

// R2_PUBLIC_URL은 의도적으로 사용하지 않는다. 비공개 버킷의 객체는 기존
// /api/images/deliver/<HMAC 토큰> 경로가 읽어 외부 플랫폼에 전달한다.
const bucket = process.env.R2_BUCKET;
const dataDir = process.env.DATA_DIR || path.resolve(process.cwd(), "../data");
const tenantsDir = path.join(dataDir, "tenants");
const dryRun = process.argv.includes("--dry-run");
const allowedExtensions = new Set([".jpg", ".jpeg", ".png", ".gif", ".webp"]);
const contentTypes = {
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".png": "image/png",
  ".gif": "image/gif",
  ".webp": "image/webp",
};

const client = new S3Client({
  region: "auto",
  endpoint: process.env.R2_ENDPOINT,
  credentials: {
    accessKeyId: process.env.R2_ACCESS_KEY_ID,
    secretAccessKey: process.env.R2_SECRET_ACCESS_KEY,
  },
});

function isNotFound(error) {
  return error?.$metadata?.httpStatusCode === 404 || error?.name === "NotFound" || error?.name === "NoSuchKey";
}

async function objectExists(key) {
  try {
    await client.send(new HeadObjectCommand({ Bucket: bucket, Key: key }));
    return true;
  } catch (error) {
    if (isNotFound(error)) return false;
    throw error;
  }
}

if (!fs.existsSync(tenantsDir)) {
  console.error(`테넌트 이미지 경로가 없습니다: ${tenantsDir}`);
  process.exit(1);
}

let migrated = 0;
let skipped = 0;
let failed = 0;

for (const tenantEntry of fs.readdirSync(tenantsDir, { withFileTypes: true })) {
  if (!tenantEntry.isDirectory() || !/^[A-Za-z0-9_-]{1,64}$/.test(tenantEntry.name)) continue;
  const imagesDir = path.join(tenantsDir, tenantEntry.name, "images");
  if (!fs.existsSync(imagesDir) || !fs.statSync(imagesDir).isDirectory()) continue;

  for (const imageEntry of fs.readdirSync(imagesDir, { withFileTypes: true })) {
    const extension = path.extname(imageEntry.name).toLowerCase();
    if (!imageEntry.isFile() || !allowedExtensions.has(extension) || !/^[A-Za-z0-9._-]{1,255}$/.test(imageEntry.name)) {
      skipped += 1;
      continue;
    }

    const key = `tenants/${tenantEntry.name}/images/${imageEntry.name}`;
    try {
      if (await objectExists(key)) {
        skipped += 1;
        continue;
      }
      if (!dryRun) {
        await client.send(
          new PutObjectCommand({
            Bucket: bucket,
            Key: key,
            Body: fs.createReadStream(path.join(imagesDir, imageEntry.name)),
            ContentType: contentTypes[extension],
          }),
        );
      }
      migrated += 1;
      console.log(`${dryRun ? "이전 예정" : "이전 완료"}: ${key}`);
    } catch (error) {
      failed += 1;
      console.error(`이전 실패: ${key} (${error instanceof Error ? error.message : "알 수 없는 오류"})`);
    }
  }
}

console.log(`결과: 이전 ${migrated}개, 건너뜀 ${skipped}개, 실패 ${failed}개${dryRun ? " (점검 모드)" : ""}`);
if (failed > 0) process.exit(1);
