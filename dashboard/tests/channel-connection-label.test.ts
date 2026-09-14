import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import {
  connectionLabel,
  connectionBadgeClass,
  CONNECTION_IN_USE,
  CONNECTION_LINKED,
} from "@/lib/channel-connection-label";

// 2026-09-09 실측: 같은 화면 안에서 연결 상태를 세 가지 말로 불렀다. 사이드바의 Threads 는
// "사용 중", 같은 사이드바의 YouTube 는 "연결됨", 설정 화면은 영어로 "Connected".
// 같은 상태를 세 가지로 부르면 사용자는 세 가지 상태가 있다고 읽는다. 무엇이 다른지
// 찾느라 시간을 쓰고, 결국 못 찾고 화면을 못 믿게 된다.
describe("연결 상태를 부르는 말은 하나다", () => {
  it("연결되고 켜져 있으면 사용 중", () => {
    expect(connectionLabel({ connected: true, enabled: true })).toBe(CONNECTION_IN_USE);
  });

  it("연결됐지만 꺼져 있으면 연결됨", () => {
    expect(connectionLabel({ connected: true, enabled: false })).toBe(CONNECTION_LINKED);
  });

  it("켜고 끄는 개념이 없는 채널은 연결이 곧 사용이다", () => {
    expect(connectionLabel({ connected: true }, { togglable: false })).toBe(CONNECTION_IN_USE);
  });

  it("연결 안 됨은 배지를 달지 않는다", () => {
    // 없는 것에 배지를 다는 것은 소음이다.
    expect(connectionLabel({ connected: false })).toBe("");
    expect(connectionLabel(undefined)).toBe("");
  });

  it("말과 색이 따로 놀지 않는다", () => {
    expect(connectionBadgeClass(CONNECTION_IN_USE)).toContain("success");
    expect(connectionBadgeClass(CONNECTION_LINKED)).toContain("accent");
  });

  it("한국어 화면에 영어 상태말이 남아 있지 않다", () => {
    const files = [
      "src/components/settings/ChannelsSettings.tsx",
      "src/components/layout/Sidebar.tsx",
    ];
    for (const file of files) {
      const src = readFileSync(resolve(process.cwd(), file), "utf8");
      expect(src).not.toMatch(/["'>]Connected["'<]/);
    }
  });

  it("상태말을 화면마다 손으로 쓰지 않고 한 곳에서 가져다 쓴다", () => {
    const src = readFileSync(
      resolve(process.cwd(), "src/components/layout/Sidebar.tsx"),
      "utf8",
    );
    expect(src).toContain("channel-connection-label");
    // 손으로 박은 상태말이 남아 있으면 다음에 또 갈라진다.
    expect(src).not.toMatch(/status: "(사용 중|연결됨)"/);
  });
});
