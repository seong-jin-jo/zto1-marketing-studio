import crypto from "node:crypto";

export type RecoveryStage = "publication_record" | "queue_record" | "usage_record";

export interface RecoveryProof {
  tenantId: string;
  publicationId: string;
  draftId: string | null;
  platform: string;
  accountId: string | null;
  externalId: string | null;
  permalink: string | null;
  occurredAt: string;
  stage: RecoveryStage;
  expiresAt: number;
}

const LIFETIME_MS = 24 * 60 * 60 * 1000;

function signingKey(): Buffer {
  const secret = process.env.OSMU_SECRET_KEY || process.env.DASHBOARD_AUTH_TOKEN;
  if (!secret) throw new Error("발행 복구 서명키가 설정되지 않았습니다.");
  // The existing secret is never used directly as the HMAC key for another purpose.
  return crypto.createHmac("sha256", "osmu-publish-recovery-key-v1").update(secret).digest();
}

export function issueRecoveryProof(input: Omit<RecoveryProof, "expiresAt">): string {
  const payload = Buffer.from(JSON.stringify({ ...input, expiresAt: Date.now() + LIFETIME_MS })).toString("base64url");
  const signature = crypto.createHmac("sha256", signingKey()).update(payload).digest("base64url");
  return `${payload}.${signature}`;
}

export function verifyRecoveryProof(token: string): RecoveryProof | null {
  const parts = token.split(".");
  if (parts.length !== 2 || parts[0].length > 4096 || parts[1].length !== 43) return null;
  let expected: Buffer;
  try {
    expected = crypto.createHmac("sha256", signingKey()).update(parts[0]).digest();
    const supplied = Buffer.from(parts[1], "base64url");
    if (supplied.length !== expected.length || !crypto.timingSafeEqual(supplied, expected)) return null;
    const proof = JSON.parse(Buffer.from(parts[0], "base64url").toString("utf8")) as RecoveryProof;
    if (!proof || typeof proof !== "object" || !Number.isSafeInteger(proof.expiresAt)
      || proof.expiresAt < Date.now() || proof.expiresAt > Date.now() + LIFETIME_MS
      || !["publication_record", "queue_record", "usage_record"].includes(proof.stage)
      || !Number.isFinite(Date.parse(proof.occurredAt))) return null;
    return proof;
  } catch {
    return null;
  }
}
