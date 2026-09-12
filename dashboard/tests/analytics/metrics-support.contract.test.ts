import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { emptyMetricLabel, isMetricsCollected } from "@/lib/metrics-support";

// 2026-09-09 회장 지적: "성과 수집이 Threads 만."
// POST /api/metrics 는 Threads 만 수집한다. 다른 채널은 수집 시도 자체를 안 하므로 서버가
// 남기는 "측정 불가" 표식도 안 생긴다. 그래서 그 글들은 화면에서 영원히 "미수집" 으로 남고,
// 사용자는 기다리면 채워지는 줄 알고 무한정 기다린다.
// 계약: 세 상태를 다른 말로 적는다. 그리고 수집 지원 목록은 한 곳에만 산다.
const src = (p: string) => readFileSync(resolve(__dirname, "../../src", p), "utf8");

describe("성과 수집 지원 여부를 화면이 정직하게 말한다", () => {
  it("수집하는 채널과 안 하는 채널을 가른다", () => {
    expect(isMetricsCollected("threads")).toBe(true);
    // 2026-09-09 같은 날 X 수집을 만들었다. 만든 채널은 만들었다고, 안 만든 채널은
    // 안 만들었다고 말해야 화면이 정직해진다.
    expect(isMetricsCollected("x")).toBe(true);
    // 2026-09-09 같은 날 Instagram·Facebook 수집도 만들었다.
    expect(isMetricsCollected("instagram")).toBe(true);
    expect(isMetricsCollected("facebook")).toBe(true);
    // 2026-09-10: youtube·shorts 는 수집을 만들었으므로 여기서 뺀다. 만들었는데도 "미지원"
    // 이라고 말하면 그것도 거짓말이다.
    expect(isMetricsCollected("reels")).toBe(true);
    expect(isMetricsCollected("instagram_reels")).toBe(true);
    expect(isMetricsCollected("tiktok")).toBe(true);
    for (const platform of [null, ""]) {
      expect(isMetricsCollected(platform), `${platform} 를 수집한다고 말하면 안 된다`).toBe(false);
    }
  });

  it("빈 자리에 적는 말이 이유마다 다르다", () => {
    // 기다리면 채워진다
    expect(emptyMetricLabel("threads", null)).toBe("미수집");
    // 계정을 바꾸기 전까지 안 채워진다
    expect(emptyMetricLabel("threads", { code: "no_permission" })).toBe("측정 불가");
    // TikTok 수집을 만들었으므로 빈 값과 제공자 거절을 구분한다.
    expect(emptyMetricLabel("tiktok", null)).toBe("미수집");
    expect(emptyMetricLabel("tiktok", { code: "video_not_visible" })).toBe("측정 불가");
    // 수집을 만든 채널은 빈 값이 "미수집"(기다리면 채워짐)이다.
    expect(emptyMetricLabel("youtube", null)).toBe("미수집");
    expect(emptyMetricLabel("instagram_reels", null)).toBe("미수집");
    // X 는 수집을 만들었으므로 Threads 와 같은 규칙을 탄다.
    expect(emptyMetricLabel("x", null)).toBe("미수집");
    expect(emptyMetricLabel("x", { code: "post_not_in_account" })).toBe("측정 불가");
  });

  it("성과 화면이 그 함수를 쓴다", () => {
    const room = src("components/home/PerformanceRoom.tsx");
    expect(room).toContain("emptyMetricLabel(post.platform, post.metrics_blocked)");
    // 옛 방식이 남아 있으면 그 칸만 계속 거짓말한다.
    expect(room).not.toContain('post.metrics_blocked ? "측정 불가" : "미수집"');
  });

  it("수집 지원 목록이 한 곳에만 산다", () => {
    const lib = src("lib/metrics-support.ts");
    expect(lib).toContain("METRICS_COLLECTED_PLATFORMS");
    // 새 채널 수집을 만들면 여기 한 줄을 추가한다는 약속이 코드에 적혀 있어야 한다.
    expect(lib).toContain("새 채널의 수집을 만들면 여기 한 줄을 추가한다");
  });
});
