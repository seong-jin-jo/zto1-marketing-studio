import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

// 2026-09-09 회장 지적: "발행실에서는 스레드는 컴포넌트 위치가 왜 살짝 아래로 내려갔냐."
// 실측하니 편집 칸 시작점이 채널마다 달랐다. X 1417, Facebook 1448, Threads 1532 픽셀.
//
// 2026-09-22 교차 코드리뷰(PR #77) C3 — 계약을 다시 쓴다. 카드 총 높이를 강제로
// 맞추는 접근(h-full·self-stretch·mt-auto 로 편집 칸을 바닥에 붙이기)은 수학적으로
// 무효였다: 총 높이가 고정이고 미리보기가 flex-1 로 남는 공간을 먹으면, 편집 칸의
// top 좌표는 "고정된 카드 높이 − 편집 칸 자신의 높이" 로만 정해지고 미리보기 내용
// 길이는 계산에서 아예 빠진다. 채널마다 편집 칸 칩 개수가 달라 그 자신의 높이가
// 다르니 top 이 어긋났다 — 총 높이를 맞추는 것 자체가 원인이었다.
//
// 새 계약: 카드 총 높이는 채널마다 달라도 된다. 대신 ①헤더를 고정 한 줄로 ②미리보기
// 영역을 채널 형태별 고정 비율/캡핑 높이로 ③편집 칸 칩 구성을 같은 채널군 안에서
// 균일하게 만들어, 편집 칸의 top(헤더 높이 + 미리보기 높이)이 같은 줄에서 균일해지게
// 한다. 실측 증거는 scripts/measure-publish-room-alignment.mjs 산출값을 참고.
const src = (p: string) => readFileSync(resolve(__dirname, "../../src", p), "utf8");

describe("미리보기 카드가 한 줄에서 시작한다", () => {
  it("그리드가 카드를 같은 높이로 늘리려 하지 않는다(카드 높이를 강제로 맞추지 않는다)", () => {
    const page = src("app/studio/page.tsx");
    expect(page).not.toContain('className="grid items-start gap-stack-section md:grid-cols-2 xl:grid-cols-3"');
    expect(page).toContain('className="grid gap-stack-section md:grid-cols-2 xl:grid-cols-3"');
    expect(page).toContain('className="flex min-w-0 flex-col rounded-surface');
  });

  it("Frame 은 더 이상 h-full·self-stretch 로 카드 총 높이를 강제하지 않는다", () => {
    const preview = src("components/studio/PlatformPreview.tsx");
    // 이 문자열들이 다시 나타나면 C3 가 밝힌 무효한 접근으로 되돌아간 것이다.
    expect(preview).not.toContain('className="flex h-full w-full max-w-sm flex-col self-stretch"');
    expect(preview).toContain('<div className="flex w-full max-w-sm flex-col" data-preview-card={p}>');
  });

  it("편집 칸은 mt-auto 로 바닥에 붙지 않고 미리보기 바로 아래 자연스러운 흐름을 따른다", () => {
    const preview = src("components/studio/PlatformPreview.tsx");
    expect(preview).not.toMatch(/mt-auto border-t border-border pt-stack" data-testid=\{`inline-editor-/);
    expect(preview).toMatch(/mt-stack border-t border-border pt-stack" data-testid=\{`inline-editor-/);
  });

  it("헤더 계정 배지는 고정 높이 별도 줄이라 헤더 줄 수가 채널마다 갈리지 않는다(M1)", () => {
    const preview = src("components/studio/PlatformPreview.tsx");
    expect(preview).toMatch(/account \? \(\s*<div className="mb-stack-tight min-h-control-touch px-micro">/);
  });

  it("텍스트 채널 본문은 line-clamp 로 높이를 캡핑해 초안 길이에 따라 미리보기 높이가 출렁이지 않는다", () => {
    const preview = src("components/studio/PlatformPreview.tsx");
    for (const testId of ["preview-body-threads", "preview-body-x", "preview-body-facebook"]) {
      const idx = preview.indexOf(`testId="${testId}"`);
      expect(idx, `${testId} 를 찾지 못함`).toBeGreaterThan(-1);
      expect(preview.slice(idx, idx + 400)).toMatch(/line-clamp-\d/);
    }
  });

  it("세로 영상 3채널의 편집 칸 칩 구성이 균일하다(캡션 트리거 하나만, 제목·해시태그는 오버레이로 이동)", () => {
    const preview = src("components/studio/PlatformPreview.tsx");
    expect(preview).toContain("isVideoPlatform ? (");
    expect(preview).toContain('testId={`preview-trigger-${platform}-caption`}');
    // 제목 칩은 영상 채널에서 만들지 않는다(오버레이가 유일 입구, C2 수정).
    expect(preview).toMatch(/contract\.title && !isVideoPlatform \? \(/);
  });
});
