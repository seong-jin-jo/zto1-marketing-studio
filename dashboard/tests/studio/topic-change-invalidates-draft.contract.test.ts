import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

// 2026-10-01 실측(회장 지적): 생성실에서 "주제로 바로 초안 만들기" 에 새 주제를 입력하고
// "초안 만들기" 를 눌러도 구조 초안 A/B/C(candidates) 와 그중 고른 quickStructure 가
// 이전 주제 그대로 남아 새 주제가 반영되지 않았다. 원인은 candidates/quickStructure 가
// "구조 초안 3개 보기" 문답 흐름의 topic 으로만 만들어지고, 빠른 시작 입력칸에서 주제를
// 바꿔도 무효화되지 않았기 때문이다.
//
// 계약: 구조 초안을 만들 때의 주제를 기억해 두고, 현재 주제와 달라지면 candidates·
// selected·quickStructure 를 비워 옛 주제로 만든 구조를 다시 쓰지 못하게 한다.
const src = (p: string) => readFileSync(resolve(__dirname, "../../src", p), "utf8");

describe("주제를 바꾸면 옛 구조 초안을 버린다", () => {
  it("구조 초안을 만들 때의 주제를 기억하는 자리가 있다", () => {
    const rooms = src("components/studio/StudioRooms.tsx");
    expect(rooms, "candidatesTopicRef 가 없다").toContain("candidatesTopicRef");
    // generate() 로 새 후보를 받으면 그 시점의 주제를 기억해 둔다.
    expect(rooms).toMatch(/setCandidates\(next\);\s*setSelected\(null\);\s*candidatesTopicRef\.current = topic;/);
  });

  it("주제가 기억해 둔 값과 달라지면 candidates/selected/quickStructure 를 비운다", () => {
    const rooms = src("components/studio/StudioRooms.tsx");
    expect(rooms).toMatch(/if \(candidatesTopicRef\.current === null\) return;/);
    expect(rooms).toMatch(/if \(candidatesTopicRef\.current === topic\) return;/);
    // useEffect 의존 배열이 topic 이어야 주제가 바뀔 때마다 이 검사가 돈다.
    expect(rooms).toMatch(/setCandidates\(\[\]\);\s*setSelected\(null\);\s*setQuickStructure\(null\);\s*candidatesTopicRef\.current = null;\s*\}, \[topic\]\);/);
  });

  it("새로 시작·주제 변경 무효화 둘 다 candidatesTopicRef 를 초기화한다", () => {
    const rooms = src("components/studio/StudioRooms.tsx");
    // "새로 시작" 리셋 경로에서도 다음 세션으로 옛 주제 기억이 넘어가면 안 된다.
    expect(rooms).toMatch(/candidatesTopicRef\.current = null;\s*\}, \[resetToken, workspaceId\]\);/);
  });
});
