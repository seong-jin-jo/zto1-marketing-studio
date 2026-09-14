import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

// 2026-09-09 실사용에서 찾았다.
// 생성실에서 "카드뉴스" 를 골랐는데 화면에는 "선택한 형식: 영상" 이 뜨고 영상 구성으로
// 만들어졌다. 복원 효과가 학습 정보 로드에 맞물려 다시 돌면서, 방금 고른 값을 저장된 옛
// 값이나 온보딩 기본값으로 덮어썼기 때문이다.
// 사람이 방금 누른 것을 화면이 몰래 되돌리면 무엇을 고르든 소용이 없다.
// 계약: 손으로 고른 형식은 복원 효과가 덮지 않는다. 다만 "새로 시작" 하면 표식도 내린다.
const src = readFileSync(resolve(__dirname, "../../src/components/studio/StudioRooms.tsx"), "utf8");

describe("손으로 고른 형식은 되돌아가지 않는다", () => {
  it("손으로 고르면 표식이 선다", () => {
    expect(src).toContain("pickedByHand");
    expect(src).toMatch(/pickedByHand\.current = true;\s*\n\s*setPrimaryKind\(kind\)/);
  });

  it("복원 효과가 그 표식을 존중한다", () => {
    // 세 자리 모두 지켜야 한다. 하나라도 빠지면 그 경로에서 덮인다.
    expect(src).toMatch(/if \(!pickedByHand\.current\) setPrimaryKind\(null\)/);
    expect(src).toMatch(/if \(!pickedByHand\.current\) \{[\s\S]{0,200}onboardingKind/);
    expect(src).toMatch(/if \(!pickedByHand\.current\) setPrimaryKind\(saved\.primaryKind\)/);
  });

  it("새로 시작하면 표식을 내린다", () => {
    // 안 내리면 다음 작업에서 옛 선택이 굳어 복원이 영영 안 먹는다.
    expect(src).toMatch(/pickedByHand\.current = false;[\s\S]{0,200}setPrimaryKind\(null\)/);
  });
});
