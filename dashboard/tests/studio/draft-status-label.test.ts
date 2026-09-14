import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { draftStatusLabel } from "@/lib/studio/draft-status-label";

// 2026-09-10 실측: 작업물 전체 목록이 상태를 draft·published·partial 로 **영어 그대로**
// 보여 주고 있었다. 한국어 화면에 영어가 튀어나온 것이고, 더 나쁜 것은 partial 이 무슨
// 뜻인지 이 화면만 보고는 알 수 없다는 것이다. 일부 채널만 나갔다는 뜻인데 그 말을 안
// 해 주면 사용자는 다 나간 줄 알고 넘어간다.
describe("작업물 상태는 회장 언어로 말한다", () => {
  it("영어 상태를 우리말로 옮긴다", () => {
    expect(draftStatusLabel("draft")).toBe("작성 중");
    expect(draftStatusLabel("published")).toBe("발행함");
    expect(draftStatusLabel("scheduled")).toBe("예약함");
    expect(draftStatusLabel("stopped")).toBe("멈춤");
  });

  it("일부만 나간 것을 그렇게 말한다", () => {
    // 다 나간 것과 다르다. 같은 말로 쓰면 사용자가 나머지를 영영 안 올린다.
    expect(draftStatusLabel("partial")).toBe("일부만 나감");
  });

  it("모르는 상태를 영어로 흘리지 않는다", () => {
    expect(draftStatusLabel("weird_new_state")).toBe("작성 중");
    expect(draftStatusLabel(undefined)).toBe("작성 중");
    expect(draftStatusLabel("")).toBe("작성 중");
  });

  it("목록이 상태를 그대로 찍지 않는다", () => {
    const src = readFileSync(resolve(process.cwd(), "src/app/studio/page.tsx"), "utf8");
    expect(src).toContain("draftStatusLabel((draft as { status?: string }).status)");
    expect(src).not.toContain('.status || "초안"');
  });
});
