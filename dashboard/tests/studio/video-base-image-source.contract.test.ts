import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

// 2026-09-08 코드 감사 F-05 재발 방지.
// 영상 생성 라우트는 서버 내부 경로(localPath)만 받았다. 그래서 방금 만든 그림으로는 영상이
// 됐지만, 승인함이나 달력에서 가져온 작업물로는 안 됐다. 그쪽은 웹 주소만 갖고 있기 때문이다.
// 화면에는 "valid localPath required (먼저 /api/higgsfield/image 호출)" 라는 개발자 말이
// 그대로 떴다. 발행 경로는 이미 파일 이름으로 서버 경로를 풀고 있었다. 생성 경로만 달랐다.
//
// 그리고 그 "파일 찾기" 가 라우트마다 복사돼 있었다(배달·영상 발행·재서명, 그리고 생성만 아예
// 없음). 복사본이 넷이면 넷이 서로 다르게 낡는다. 규칙이 갈라진 자리에서 결함이 났다.
// 계약: 파일 찾기는 resolveGeneratedFile 하나뿐이고, 영상 생성도 파일 이름을 받는다.
const src = (path: string) => readFileSync(resolve(__dirname, "../../src", path), "utf8");

const ROUTES = [
  "app/api/media/[token]/route.ts",
  "app/api/media/resign/route.ts",
  "app/api/video/publish/route.ts",
  "app/api/higgsfield/video/route.ts",
];

describe("만든 파일 찾기는 한 곳이다", () => {
  it("네 라우트가 모두 정본 함수를 부른다", () => {
    for (const r of ROUTES) {
      expect(src(r), `${r} 가 정본 함수를 안 쓴다`).toContain("resolveGeneratedFile(");
    }
  });

  it("라우트가 자기만의 탐색을 다시 만들지 않는다", () => {
    for (const r of ROUTES) {
      const text = src(r);
      expect(text, `${r} 에 탐색 복사본이 남아 있다`).not.toMatch(/for \(const dir of \[dataPath\("videos"\)/);
    }
  });

  it("영상 생성이 파일 이름으로도 바탕 그림을 받는다", () => {
    const text = src("app/api/higgsfield/video/route.ts");
    expect(text).toContain("body.filename");
    // 개발자 말이 그대로 사용자에게 나가면 안 된다(주석에 남은 사고 기록은 제외).
    const code = text.split("\n").filter((l) => !l.trim().startsWith("//")).join("\n");
    expect(code).not.toContain("valid localPath required");
    expect(text).toContain("영상의 바탕이 될 그림을 찾지 못했습니다");
  });

  it("화면도 내부 경로가 없으면 파일 이름을 넘긴다", () => {
    const text = src("app/studio/page.tsx");
    expect(text).toMatch(/genVideo\(\{ localPath: source\?\.localPath, filename: baseFilename \}\)/);
  });
});
