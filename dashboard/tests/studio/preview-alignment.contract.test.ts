import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

// 2026-09-09 회장 지적: "발행실에서는 스레드는 컴포넌트 위치가 왜 살짝 아래로 내려갔냐."
// 실측하니 편집 칸 시작점이 채널마다 달랐다. X 1417, Facebook 1448, Threads 1532 픽셀.
// 미리보기 내용 높이가 채널마다 다른데 카드가 각자 내용만큼만 높아져서다.
// 나란히 놓인 카드가 제각각 다른 높이에서 시작하면 눈이 줄을 못 잡는다.
// 계약: 같은 줄의 카드는 같은 높이를 갖고, 그 아래 편집 칸은 한 줄에서 시작한다.
const src = (p: string) => readFileSync(resolve(__dirname, "../../src", p), "utf8");

describe("미리보기 카드가 한 줄에서 시작한다", () => {
  it("그리드가 카드를 같은 높이로 늘린다", () => {
    const page = src("app/studio/page.tsx");
    // items-start 면 카드가 각자 내용만큼만 높아져 아래 칸이 어긋난다.
    expect(page).not.toContain('className="grid items-start gap-stack-section md:grid-cols-2 xl:grid-cols-3"');
    expect(page).toContain('className="grid gap-stack-section md:grid-cols-2 xl:grid-cols-3"');
    expect(page).toContain('className="flex min-w-0 flex-col rounded-surface');
  });

  it("카드 안에서 미리보기가 남은 높이를 채운다", () => {
    const preview = src("components/studio/PlatformPreview.tsx");
    expect(preview).toContain('className="flex h-full w-full max-w-sm flex-col"');
    expect(preview).toContain('<div className="flex flex-1 flex-col">{children}</div>');
  });

  it("편집 칸이 카드 바닥에 붙는다", () => {
    const preview = src("components/studio/PlatformPreview.tsx");
    // mt-stack 이면 미리보기 바로 아래에 붙어 채널마다 다른 높이에서 시작한다.
    expect(preview).toMatch(/mt-auto border-t border-border pt-stack" data-testid=\{`inline-editor-/);
  });
});
