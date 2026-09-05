import { describe, it, expect, vi, beforeEach } from "vitest";

// R2 자격증명이 응답으로 새지 않는지 고정한다.
// 종전 GET 은 R2_ACCESS_KEY_ID 와 R2_SECRET_ACCESS_KEY 원문을 그대로 내려
// 브라우저 입력칸에 채웠다. 설정 여부만 알려주면 화면은 충분히 그려진다.
vi.mock("fs", async () => {
  const actual = await vi.importActual<typeof import("fs")>("fs");
  return {
    ...actual,
    default: {
      ...actual,
      readFileSync: () =>
        [
          "R2_ACCESS_KEY_ID=akid-should-not-leak",
          "R2_SECRET_ACCESS_KEY=secret-should-not-leak",
          "R2_BUCKET=osmu-media",
          "R2_ENDPOINT=https://example.invalid",
          "R2_PUBLIC_URL=https://cdn.example.invalid",
        ].join("\n"),
    },
  };
});

describe("GET /api/r2-config 자격증명 비노출", () => {
  beforeEach(() => vi.resetModules());

  it("키 원문을 내려주지 않고 설정 여부만 알려준다", async () => {
    const { GET } = await import("@/app/api/r2-config/route");
    const body = await (await GET()).json();
    const serialized = JSON.stringify(body);

    expect(serialized).not.toContain("akid-should-not-leak");
    expect(serialized).not.toContain("secret-should-not-leak");
    expect(body.accessKeyIdSet).toBe(true);
    expect(body.secretAccessKeySet).toBe(true);
    expect(body.bucket).toBe("osmu-media");
    expect(body.endpoint).toBe("https://example.invalid");
    expect(body).not.toHaveProperty("publicUrl");
  });
});
