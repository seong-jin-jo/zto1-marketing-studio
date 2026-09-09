import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

// 2026-09-09 회장 지적: "실제 플랫폼별 미리보기 화면 그대로인건 맞아?"
// 모양은 실제와 비슷했는데 숫자가 가짜였다. 아직 아무 데도 안 올린 글에 Threads "좋아요
// 124개", X "답글 24 · 리포스트 57 · 좋아요 312", Facebook "반응 248", Instagram
// "좋아요 1,284개" 가 붙어 있었다. 시간도 "1시간 전" 이었다.
//
// 성과실에서는 못 잰 것을 "미수집" 이라고 정직하게 적으면서 발행실에서는 없는 숫자를 지어
// 보이면 앞뒤가 안 맞는다. 그 숫자를 본 사람은 이미 성과가 난 줄 안다.
// 계약: 레이아웃은 실제 그대로 두되 숫자 자리는 아직 없다고 적는다.
const raw = readFileSync(resolve(__dirname, "../../src/components/studio/PlatformPreview.tsx"), "utf8");
// 주석에는 사고 경위로 그 숫자들이 남아 있어야 한다. 왜 이렇게 됐는지가 거기 있다.
// 검사는 실제로 화면에 나가는 코드에만 한다.
const src = raw
  .replace(/\/\*[\s\S]*?\*\//g, "")
  .split("\n")
  .filter((line) => !line.trim().startsWith("//"))
  .join("\n");

describe("미리보기가 없는 숫자를 지어내지 않는다", () => {
  it("가짜 반응 수가 남아 있지 않다", () => {
    for (const fake of ["좋아요 124개", "답글 18개", "반응 248", "댓글 32", "좋아요 1,284개"]) {
      expect(src, `"${fake}" 가 아직 화면에 있다`).not.toContain(fake);
    }
    // X 는 아이콘 옆에 숫자를 직접 붙이고 있었다.
    expect(src).not.toMatch(/\{P\(I\.chat\)\}\d/);
    expect(src).not.toMatch(/\{P\(I\.heart\)\}\d/);
    expect(src).not.toMatch(/\{P\(I\.repost\)\}\d/);
  });

  it("가짜 경과 시간이 남아 있지 않다", () => {
    // 아직 안 올린 글에 "1시간 전" 은 거짓이다.
    expect(src).not.toContain(">1시간<");
    expect(src).not.toContain("· 1분");
    expect(src).toContain("지금");
  });

  it("그 자리에 무엇이 채워질지 대신 적는다", () => {
    // 자리를 그냥 비우면 레이아웃이 실제와 달라지고, 사용자는 왜 비었는지 모른다.
    for (const platform of ["threads", "x", "facebook", "instagram"]) {
      expect(src, `${platform} 반응 자리 표식이 없다`).toContain(`data-preview-engagement="${platform}"`);
    }
    expect(src).toContain("올리면 여기에");
  });
});
