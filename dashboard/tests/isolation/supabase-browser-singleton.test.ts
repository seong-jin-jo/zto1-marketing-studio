import { afterEach, describe, expect, it, vi } from "vitest";

const H = vi.hoisted(() => ({
  createClient: vi.fn(() => ({ auth: {} })),
}));

vi.mock("@supabase/supabase-js", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@supabase/supabase-js")>();
  return { ...actual, createClient: H.createClient };
});

afterEach(() => {
  vi.unstubAllEnvs();
  vi.resetModules();
  H.createClient.mockClear();
});

describe("createBrowserSupabase", () => {
  it("같은 브라우저 세션에서는 하나의 GoTrueClient만 재사용한다", async () => {
    vi.stubEnv("NEXT_PUBLIC_SUPABASE_URL", "https://example.supabase.co");
    vi.stubEnv("NEXT_PUBLIC_SUPABASE_ANON_KEY", "anon-key");

    const { createBrowserSupabase } = await import("@/lib/supabase");
    const first = createBrowserSupabase();
    const second = createBrowserSupabase();

    expect(second).toBe(first);
    expect(H.createClient).toHaveBeenCalledTimes(1);
  });
});
