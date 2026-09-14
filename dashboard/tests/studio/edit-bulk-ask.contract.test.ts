import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

// 2026-09-09 회장 지시 둘.
// "편집실 AI 챗봇은 왜 다른곳이랑 UI가 다름?" 다른 방은 같은 대화창을 쓰는데 편집실만
// 버튼판이었다. 같은 역할이면 같은 모양이어야 한다.
// "AI 챗봇에서는 '자막에서 어투 이렇게 바꿔줘' 이렇게 요청할수도있는거고." 고정 단추
// 셋으로는 그 말을 받을 수 없었다.
//
// 기준은 변경의 크기와 종류다. 한 곳을 정확히 바꾸는 것은 손이 빠르고(모든 줄이 입력칸),
// 여러 곳을 같은 규칙으로 바꾸는 것은 말이 빠르다. 편집실은 둘 다 준다.
const src = (p: string) => readFileSync(resolve(__dirname, "../../src", p), "utf8");

describe("편집실 대화창", () => {
  it("다른 방과 같은 대화창 머리를 쓴다", () => {
    const rooms = src("components/studio/StudioRooms.tsx");
    // 다른 방의 AssistantPanel 과 같은 표식(동그란 O 와 대기 상태)을 갖는다.
    expect(rooms).toMatch(/data-edit-helper[\s\S]{0,900}지금 대기 중/);
  });

  it("말로 시킬 자리가 있다", () => {
    const rooms = src("components/studio/StudioRooms.tsx");
    expect(rooms).toContain("data-bulk-ask");
    expect(rooms).toContain("자막 어투를 더 부드럽게 바꿔줘");
    expect(rooms).toContain("/api/studio/edit-bulk");
  });

  it("이 방의 강조는 발행실 이동 하나뿐이다", () => {
    const rooms = src("components/studio/StudioRooms.tsx");
    // 도구 단추가 같은 강조를 가지면 다음 단계가 묻힌다.
    expect(rooms).not.toMatch(/<Button type="submit" variant="primary"[\s\S]{0,120}시키기/);
  });

  it("서버가 줄 수와 순서를 지킨다", () => {
    const route = src("app/api/studio/edit-bulk/route.ts");
    expect(route).toContain("줄의 개수를 바꾸지 마세요");
    expect(route).toContain("줄의 순서를 바꾸지 마세요");
    // 개수가 다르면 어느 줄이 어느 줄이 됐는지 알 수 없다. 조용히 덮으면 작업물이 망가진다.
    expect(route).toMatch(/next\.length !== lines\.length/);
    expect(route).toContain("적용하지 않았습니다");
  });

  it("한 번에 고칠 양에 상한이 있다", () => {
    const route = src("app/api/studio/edit-bulk/route.ts");
    expect(route).toMatch(/lines\.length > 60/);
  });
});
