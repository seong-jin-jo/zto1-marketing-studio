import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

// This package has no jsdom/@testing-library/react dependency (vitest.config.ts uses
// environment: 'node'; no existing test in this repo mounts a full React component tree —
// see tests/setup.ts). Mounting login/page.tsx or studio/page.tsx to click-simulate a failed
// vs successful API response is out of scope for a minimal-footprint addition, so this
// contract test instead statically proves the "fire only after confirmed backend success"
// requirement by asserting the trackEvent(...) call sites are lexically inside the
// success-guarded branch, not before it / not unconditionally in the handler.
//
// This is deliberately a source-shape check, not a full behavioral test — see the final report
// RED_TEAM section for what was traced by hand (the actual variables passed at each call site).
//
// 2026-07-16: Google-only auth decision (owner directive) removed all email/password sign-in,
// sign-up, email-confirm resend, and password reset/recovery code from customer login UI — SMTP
// is not being introduced. The prior "sign_up fires on data.user" / "login fires on
// signInWithPassword session" contract tests asserted on code paths that no longer exist and are
// removed here rather than weakened. The OAuth-only contracts below (marker set/consume timing,
// PKCE coverage, one-shot dedupe) are unaffected and still hold.

const dashboardRoot = path.resolve(__dirname, "../..");

function read(relPath: string): string {
  return readFileSync(path.join(dashboardRoot, relPath), "utf8");
}

describe("login/page.tsx: Google-only auth — no email/password auth surface", () => {
  it("never calls Supabase email/password or recovery APIs from the customer login UI", () => {
    const src = read("src/app/login/page.tsx");
    expect(src).not.toContain("signInWithPassword");
    expect(src).not.toContain("auth.signUp(");
    expect(src).not.toContain("resetPasswordForEmail");
    expect(src).not.toContain("updateUser(");
    expect(src).not.toContain("auth.resend(");
  });

  it("does not read or branch on a signup query/mode param — Google is the only entry point", () => {
    const src = read("src/app/login/page.tsx");
    expect(src).not.toContain('mode === "signup"');
    expect(src).not.toContain('get("mode")');
  });
});

describe("publish_success fires only after confirmed API success, not on click alone", () => {
  it("studio/page.tsx: publish_success trackEvent only fires inside `if (r?.ok)` after apiPost('/api/publish') resolves", () => {
    const src = read("src/app/studio/page.tsx");
    const attemptIdx = src.indexOf('trackEvent({ name: "publish_attempt"');
    const apiCallIdx = src.indexOf('apiPost<{ ok?: boolean; partial?: boolean;', attemptIdx);
    const successIdx = src.indexOf('if (r?.ok && !r.partial)', apiCallIdx);
    const trackSuccessIdx = src.indexOf('trackEvent({ name: "publish_success"', successIdx);
    // publish_attempt must precede the API call (submission time), publish_success must be
    // strictly after the API call resolves and inside the ok-branch.
    expect(attemptIdx).toBeGreaterThan(-1);
    expect(attemptIdx).toBeLessThan(apiCallIdx);
    expect(successIdx).toBeGreaterThan(apiCallIdx);
    expect(trackSuccessIdx).toBeGreaterThan(successIdx);
    expect(trackSuccessIdx - successIdx).toBeLessThan(120); // same line/branch, not a distant unconditional call
  });

  it("studio/page.tsx: publish_success is NOT called in the error branch (else push to errs)", () => {
    const src = read("src/app/studio/page.tsx");
    const elseIdx = src.indexOf("else errs.push(`${LABEL[p]}: ${r?.error");
    const errsLineEnd = src.indexOf("\n", elseIdx);
    const errsLine = src.slice(elseIdx, errsLineEnd);
    expect(errsLine).not.toContain("publish_success");
  });

  it("studio/page.tsx: externalPublished partial failure is reconciled without automatic external republish or publish_success", () => {
    const src = read("src/app/studio/page.tsx");
    const publishStart = src.indexOf("async function publish()");
    const publishEnd = src.indexOf("function loadDraft(", publishStart);
    const block = src.slice(publishStart, publishEnd);
    const preflightGuard = block.indexOf("Object.keys(publishReconciliations).length > 0");
    const apiCall = block.indexOf('apiPost<{ ok?: boolean; partial?: boolean;');
    const partialGuard = block.indexOf("isExternalPublishPersistenceError(e)");
    const preserveUrl = block.indexOf("e.payload.permalink", partialGuard);
    const boundedParallelJoin = block.indexOf(
      "await runWithConcurrency(targets, PUBLISH_CONCURRENCY",
      preflightGuard,
    );
    // The draft save also carries per-platform progress and media; match the
    // reconciliation contract without pinning the optional trailing arguments.
    const persistPartial = block.indexOf('save("partial", pendingReconciliations, did,');

    expect(preflightGuard).toBeGreaterThan(-1);
    expect(preflightGuard).toBeLessThan(apiCall);
    expect(partialGuard).toBeGreaterThan(-1);
    expect(preserveUrl).toBeGreaterThan(partialGuard);
    expect(boundedParallelJoin).toBeGreaterThan(preflightGuard);
    expect(persistPartial).toBeGreaterThan(partialGuard);
    expect(block.slice(partialGuard, persistPartial)).not.toContain('name: "publish_success"');
    expect(block).not.toContain("retryPublish(");
  });

  it("studio draft API persists and restores reconciliation metadata across reloads", () => {
    const src = read("src/app/api/studio/drafts/route.ts");
    expect(src).toContain("publishReconciliations: body.publishReconciliations ?? {}");
    expect(src).toContain("publishReconciliations: r.payload?.publishReconciliations ?? null");
  });
});

describe("OAuth login tracking covers PKCE (not just implicit-flow hash tokens)", () => {
  // 2026-07-14 Codex review #5: the old implementation only tracked `login` when a hash token
  // (#access_token=...) was present in the URL — the implicit flow. Supabase's PKCE flow returns
  // via `?code=...` with no hash token at all, so OAuth logins through PKCE were silently never
  // tracked. Fix: set a non-PII sessionStorage marker right before the redirect, consume it only
  // after a session is actually confirmed on return, covering both flows without duplicate fires.

  it("google(): sets the pending marker in sessionStorage before redirecting, after authUrl is confirmed", () => {
    const src = read("src/app/login/page.tsx");
    const googleBlockStart = src.indexOf("const google = async ()");
    const googleBlockEnd = src.indexOf("finally { setBusy(false); }", googleBlockStart);
    const block = src.slice(googleBlockStart, googleBlockEnd);
    const authUrlGuardIdx = block.indexOf("if (!r.ok || !d.authUrl)");
    const markerSetIdx = block.indexOf("sessionStorage.setItem(OAUTH_PENDING_KEY");
    const redirectIdx = block.indexOf("window.location.href = d.authUrl");
    expect(authUrlGuardIdx).toBeGreaterThan(-1);
    expect(markerSetIdx).toBeGreaterThan(authUrlGuardIdx); // only set once we know we're about to redirect
    expect(markerSetIdx).toBeLessThan(redirectIdx); // set BEFORE navigating away
  });

  it("enter(): consumes the marker only inside the confirmed-session callback, gated by a one-shot ref (no duplicate fires)", () => {
    const src = read("src/app/login/page.tsx");
    const enterBlockStart = src.indexOf("const enter = (accessToken: string)");
    const enterBlockEnd = src.indexOf("sb.auth.getSession()", enterBlockStart);
    const block = src.slice(enterBlockStart, enterBlockEnd);
    expect(block).toContain("oauthTrackedRef.current");
    expect(block).toContain("sessionStorage.getItem(OAUTH_PENDING_KEY)");
    expect(block).toContain("sessionStorage.removeItem(OAUTH_PENDING_KEY)");
    const oneShotGuardIdx = block.indexOf("if (!oauthTrackedRef.current)");
    const trackIdx = block.indexOf('trackEvent({ name: "login", params: { method: "oauth" } })');
    const markerConsumeIdx = block.indexOf("oauthTrackedRef.current = true");
    expect(oneShotGuardIdx).toBeGreaterThan(-1);
    expect(markerConsumeIdx).toBeGreaterThan(oneShotGuardIdx);
    expect(trackIdx).toBeGreaterThan(markerConsumeIdx);
  });

  // 2026-07-14 Codex review round 2: hadHashToken alone is NOT a valid OAuth signal — email
  // confirmation and password-recovery callbacks also returned via #access_token=... under the
  // old email-auth UI. That UI is gone (Google-only, 2026-07-16), but the marker remains the
  // sole classification truth source (defense in depth against any future hash-returning flow).
  it("(a) the oauth-tracking condition inside enter() checks ONLY oauthPending — hadHashToken is never OR'd in", () => {
    const src = read("src/app/login/page.tsx");
    const enterBlockStart = src.indexOf("const enter = (accessToken: string)");
    const enterBlockEnd = src.indexOf("sb.auth.getSession()", enterBlockStart);
    const block = src.slice(enterBlockStart, enterBlockEnd);
    expect(block).toContain("if (oauthPending)");
    expect(block).not.toContain("hadHashToken || oauthPending");
    expect(block).not.toContain("oauthPending || hadHashToken");
  });

  it("(b) marker present + confirmed session tracks oauth login exactly once (already covered by the one-shot-ref test above; re-asserted for locality)", () => {
    const src = read("src/app/login/page.tsx");
    const enterBlockStart = src.indexOf("const enter = (accessToken: string)");
    const enterBlockEnd = src.indexOf("sb.auth.getSession()", enterBlockStart);
    const block = src.slice(enterBlockStart, enterBlockEnd);
    const guardIdx = block.indexOf("if (oauthPending)");
    const trackIdx = block.indexOf('trackEvent({ name: "login", params: { method: "oauth" } })');
    expect(guardIdx).toBeGreaterThan(-1);
    expect(trackIdx).toBeGreaterThan(guardIdx);
    expect(trackIdx - guardIdx).toBeLessThan(200); // same guarded block, not a distant unconditional call
  });

  it("(d) an OAuth callback error (error=/error_code= in hash or query) clears the marker before enter() could ever consume it", () => {
    const src = read("src/app/login/page.tsx");
    const effectStart = src.indexOf("const sb = createBrowserSupabase();", src.indexOf("useEffect(() => {"));
    const enterStart = src.indexOf("const enter = (accessToken: string)");
    const block = src.slice(effectStart, enterStart);
    expect(block).toContain("isOAuthCallbackError");
    expect(block).toMatch(/error=/);
    expect(block).toMatch(/error_code=/);
    const errorCheckIdx = block.indexOf("isOAuthCallbackError =");
    const clearIdx = block.indexOf("sessionStorage.removeItem(OAUTH_PENDING_KEY)");
    expect(errorCheckIdx).toBeGreaterThan(-1);
    expect(clearIdx).toBeGreaterThan(errorCheckIdx); // clear happens after computing the error flag
    expect(clearIdx).toBeLessThan(enterStart - effectStart); // and strictly before enter() is defined/called
  });

  it("the pending marker key is a plain non-PII literal, not derived from email/user data", () => {
    const src = read("src/app/login/page.tsx");
    const keyDeclIdx = src.indexOf('const OAUTH_PENDING_KEY = "osmu_oauth_pending"');
    expect(keyDeclIdx).toBeGreaterThan(-1);
  });
});
