import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

// 2026-09-07 판정 후속.
// 영상 발행 경로가 옛 영상 폴더(data/videos) 한 곳만 봐서, 생성실이 만든 숏폼 영상
// (data/studio/{작업공간})을 올리면 파일이 있는데도 "video not found" 로 끝났다.
// 그날 아침 배달 경로에서 똑같은 이유로 화면에 영상이 안 떴고 그때는 배달 쪽만 고쳤다.
//
// 2026-09-08 후속. 같은 탐색이 배달·발행·재서명 세 곳에 복사돼 있었고, 영상 생성만 아예
// 다른 규칙(서버 내부 경로만)을 써서 승인함에서 가져온 작업물로는 영상을 못 만들었다
// (코드 감사 F-05). 복사본을 늘려 가며 계약을 거는 것이 문제였다. 규칙을 한 함수로 모으고,
// 계약도 그 함수와 "모두가 그 함수를 부른다" 에 건다.
const read = (p: string) => readFileSync(resolve(__dirname, "../../src", p), "utf8");

const CALLERS = [
  "app/api/video/publish/route.ts",
  "app/api/media/[token]/route.ts",
  "app/api/media/resign/route.ts",
  "app/api/higgsfield/video/route.ts",
];

describe("영상 파일 탐색 경로", () => {
  it("폴더 목록 정본이 두 곳을 모두 본다", () => {
    const src = read("lib/storage.ts");
    const fn = src.slice(src.indexOf("export function generatedMediaDirs"));
    expect(fn).toContain('dataPath("videos")');
    expect(fn).toContain("tenantMediaDir");
  });

  it("목록과 단건 해석이 같은 폴더 목록 정본을 쓴다", () => {
    const storage = read("lib/storage.ts");
    const listRoute = read("app/api/video/list/route.ts");
    const resolver = storage.slice(storage.indexOf("export function resolveGeneratedFile"));
    expect(resolver).toContain("generatedMediaDirs(tenantId)");
    expect(listRoute).toContain("generatedMediaDirs(tenantId)");
    expect(listRoute).not.toContain('dataPath("videos")');
  });

  it("목록에서 노출한 생성실 영상 삭제도 단건 해석 정본을 쓴다", () => {
    const deleteRoute = read("app/api/video/delete/route.ts");
    expect(deleteRoute).toContain("resolveGeneratedFile(");
    expect(deleteRoute).not.toContain('dataPath("videos")');
  });

  it("작업 공간 식별자가 없어도 탐색이 예외로 죽지 않는다", () => {
    const src = read("lib/storage.ts");
    const fn = src.slice(
      src.indexOf("export function generatedMediaDirs"),
      src.indexOf("export function resolveGeneratedFile"),
    );
    // tenantMediaDir 는 형식이 틀리면 던진다. 그 예외로 옛 폴더 탐색까지 잃으면 안 된다.
    expect(fn).toMatch(/try\s*\{[\s\S]*tenantMediaDir[\s\S]*\}\s*catch/);
  });

  it("배달·발행·재서명·영상생성이 모두 그 한 함수를 부른다", () => {
    for (const p of CALLERS) {
      expect(read(p), `${p} 가 정본 함수를 안 쓴다`).toContain("resolveGeneratedFile(");
    }
  });
});
