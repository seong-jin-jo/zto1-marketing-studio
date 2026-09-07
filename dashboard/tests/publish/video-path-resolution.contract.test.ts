import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

// 2026-09-07 판정 후속.
// 영상 발행 경로가 옛 영상 폴더(data/videos) 한 곳만 봐서, 생성실이 만든 숏폼 영상
// (data/studio/{작업공간})을 올리면 파일이 있는데도 "video not found" 로 끝났다.
// 오늘 아침 배달 경로에서 똑같은 이유로 화면에 영상이 안 떴고 그때는 배달 쪽만 고쳤다.
// 계약: 영상을 찾는 두 곳(옛 영상 폴더·작업 공간 폴더)을 배달 경로와 발행 경로가 함께 본다.
const read = (p: string) => readFileSync(resolve(__dirname, "../../src", p), "utf8");

describe("영상 파일 탐색 경로", () => {
  it("발행 경로가 작업 공간 폴더도 본다", () => {
    const src = read("app/api/video/publish/route.ts");
    expect(src).toContain("tenantMediaDir");
    expect(src).toContain('dataPath("videos")');
  });

  it("배달 경로와 발행 경로가 같은 두 곳을 본다", () => {
    const publish = read("app/api/video/publish/route.ts");
    const deliver = read("app/api/media/[token]/route.ts");
    for (const src of [publish, deliver]) {
      expect(src).toContain('dataPath("videos")');
      expect(src).toContain("tenantMediaDir");
    }
  });

  it("작업 공간 식별자가 없어도 탐색이 예외로 죽지 않는다", () => {
    const src = read("app/api/video/publish/route.ts");
    // tenantMediaDir 는 형식이 틀리면 던진다. 그 예외로 옛 폴더 탐색까지 잃으면 안 된다.
    expect(src).toMatch(/try\s*\{[\s\S]*tenantMediaDir[\s\S]*\}\s*catch/);
  });
});
