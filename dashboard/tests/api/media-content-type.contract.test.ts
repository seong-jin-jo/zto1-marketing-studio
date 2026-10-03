import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

// 2026-09-08 회장 실사용 재발 방지.
// 생성실에서 만든 그림이 화면에 안 떴다. 만들기는 성공했고 파일도 있었다. 원인은 생성기가
// WebP 를 주는데 우리가 ".png" 라는 이름으로 저장하고, 배달할 때 확장자만 보고
// image/png 라고 알려 준 것이다. 브라우저는 png 라고 들은 바이트가 webp 라 그리기를
// 거부했고, 사용자에게는 "생성이 안 된다" 로 보였다.
// 계약: 배달은 파일 내용을 보고 종류를 정하고, 저장은 실제 확장자를 쓴다.
const read = (p: string) => readFileSync(resolve(__dirname, "../../src", p), "utf8");

describe("만든 그림이 화면에 뜨는 조건", () => {
  it("배달 라우트는 확장자만 믿지 않고 파일 앞머리를 본다", () => {
    const src = read("app/api/media/[token]/route.ts");
    expect(src).toContain("sniffContentType");
    expect(src).toContain("WEBP");
    expect(src).toMatch(/sniffContentType\(fp, declared\)/);
  });

  it("이미지 저장은 생성기가 준 실제 확장자를 쓴다", () => {
    // 2026-10-01 비동기 전환: 다운로드·저장은 POST(접수)가 아니라 완료 처리 로직이 한다.
    // 2026-10-02 서버측 백그라운드 완료 루프 추가로 그 완료 처리 로직(다운로드·확장자
    // 판정 포함)이 job/[id]/route.ts에서 higgsfield-finalize.ts로 옮겨갔다(GET 라우트와
    // 백그라운드 루프가 공유하기 위함).
    const src = read("lib/higgsfield-finalize.ts");
    expect(src).not.toContain("`img_${Date.now()}.png`");
    expect(src).toContain("png|jpe?g|webp");
  });
});
