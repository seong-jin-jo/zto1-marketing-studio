import { Buffer } from "node:buffer";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
import { extractAnonCandidates, extractSupabaseBase, mergeMissingPublicEnv, parseEnv } from "../../../scripts/recover-osmu-local-public-env.mjs";

function jwt(payload: Record<string, string>) {
  const header = Buffer.from(JSON.stringify({ alg: "HS256", typ: "JWT" })).toString("base64url");
  const body = Buffer.from(JSON.stringify(payload)).toString("base64url");
  return `${header}.${body}.fixture-signature`;
}

describe("OSMU local public Supabase env recovery", () => {
  it("FE-AUTH-ENV-01 기존 DB와 토큰을 보존하고 빠진 공개값만 멱등 추가한다", () => {
    const original = "DATABASE_URL=postgres://local\nDASHBOARD_AUTH_TOKEN=keep-me\n";
    const recovered = { NEXT_PUBLIC_SUPABASE_URL: "https://project-ref.supabase.co", NEXT_PUBLIC_SUPABASE_ANON_KEY: "anon-public-value" };
    const first = mergeMissingPublicEnv(original, recovered);
    expect(mergeMissingPublicEnv(first, recovered)).toBe(first);
    expect(parseEnv(first).get("DATABASE_URL")).toBe("postgres://local");
    expect(parseEnv(first).get("DASHBOARD_AUTH_TOKEN")).toBe("keep-me");
  });

  it("FE-AUTH-ENV-02 다른 기존 공개값은 덮어쓰지 않고 거절한다", () => {
    expect(() => mergeMissingPublicEnv("NEXT_PUBLIC_SUPABASE_URL=https://other.supabase.co\n", {
      NEXT_PUBLIC_SUPABASE_URL: "https://project-ref.supabase.co", NEXT_PUBLIC_SUPABASE_ANON_KEY: "anon-public-value",
    })).toThrow(/refusing to overwrite/);
  });

  it("FE-AUTH-ENV-03 운영 preflight의 Supabase origin만 수용한다", () => {
    expect(extractSupabaseBase("https://project-ref.supabase.co/auth/v1/authorize?provider=google")).toBe("https://project-ref.supabase.co");
    expect(() => extractSupabaseBase("https://attacker.example/auth/v1/authorize")).toThrow(/unexpected Supabase origin/);
  });

  it("FE-AUTH-ENV-04 동일 프로젝트의 anon JWT만 후보로 채택한다", () => {
    const accepted = jwt({ role: "anon", ref: "project-ref" });
    const source = `${jwt({ role: "service_role", ref: "project-ref" })} ${accepted} ${jwt({ role: "anon", ref: "other-ref" })}`;
    expect(extractAnonCandidates(source, "project-ref")).toEqual([accepted]);
  });

  it("FE-AUTH-ENV-05 감독 프로세스는 복구 성공 뒤에만 로컬 Next 앱을 기동한다", () => {
    const supervisor = readFileSync(resolve(process.cwd(), "../scripts/osmu-supervisor.sh"), "utf8");
    const recovery = supervisor.indexOf("recover-osmu-local-public-env.mjs");
    const nextDev = supervisor.indexOf("npm run dev -- -p 3456", recovery);
    expect(recovery).toBeGreaterThan(-1);
    expect(nextDev).toBeGreaterThan(recovery);
    expect(supervisor.slice(recovery, nextDev)).toContain("return 1");
  });
});
