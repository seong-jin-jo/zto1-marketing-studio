import crypto from "node:crypto";

export type RecoveryStage = "publication_record" | "queue_record" | "usage_record" | "first_comment_record";

export interface FirstCommentRecoveryResult {
  status: "not_requested" | "published" | "failed" | "uncertain";
  error: string | null;
  externalId: string | null;
}

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
  firstComment?: FirstCommentRecoveryResult;
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

export function verifyRecoveryProofDetailed(token: string):
  { proof: RecoveryProof; reason: null } | { proof: null; reason: "expired" | "invalid" } {
  const parts = token.split(".");
  if (parts.length !== 2 || parts[0].length > 4096 || parts[1].length !== 43) return { proof: null, reason: "invalid" };
  let expected: Buffer;
  try {
    expected = crypto.createHmac("sha256", signingKey()).update(parts[0]).digest();
    const supplied = Buffer.from(parts[1], "base64url");
    if (supplied.length !== expected.length || !crypto.timingSafeEqual(supplied, expected)) return { proof: null, reason: "invalid" };
    const proof = JSON.parse(Buffer.from(parts[0], "base64url").toString("utf8")) as RecoveryProof;
    if (!proof || typeof proof !== "object" || !Number.isSafeInteger(proof.expiresAt)
      || proof.expiresAt > Date.now() + LIFETIME_MS
      || !["publication_record", "queue_record", "usage_record", "first_comment_record"].includes(proof.stage)
      || (proof.firstComment && (
        !["not_requested", "published", "failed", "uncertain"].includes(proof.firstComment.status)
        || (["published", "not_requested"].includes(proof.firstComment.status) && proof.firstComment.error !== null)
        || (["failed", "uncertain"].includes(proof.firstComment.status) && typeof proof.firstComment.error !== "string")
        || (proof.firstComment.externalId !== null && typeof proof.firstComment.externalId !== "string")
        || (proof.firstComment.status === "not_requested" && proof.firstComment.externalId !== null)))
      || (proof.stage === "first_comment_record" && (!proof.firstComment
        || proof.firstComment.status === "not_requested"))
      || !Number.isFinite(Date.parse(proof.occurredAt))) return { proof: null, reason: "invalid" };
    if (proof.expiresAt < Date.now()) return { proof: null, reason: "expired" };
    return { proof, reason: null };
  } catch {
    return { proof: null, reason: "invalid" };
  }
}

export function verifyRecoveryProof(token: string): RecoveryProof | null {
  return verifyRecoveryProofDetailed(token).proof;
}
