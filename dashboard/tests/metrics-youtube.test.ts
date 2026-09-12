import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { isMetricsCollected, emptyMetricLabel } from "@/lib/metrics-support";

// 경쟁사 비교 문서의 다섯 번째 과제("성과 수집을 Threads 외 채널로")의 남은 칸이다.
// 2026-09-10 실측: 회장 계정에 YouTube 가 연결돼 있는데도 수집 대상이 아니었다. 숏폼을
// 올려도 그 결과가 영영 안 돌아왔다. **되받을 숫자가 없으면 다음 제안이 뻔해진다.**
const read = (p: string) => readFileSync(resolve(process.cwd(), p), "utf8");

describe("YouTube 성과 수집", () => {
  it("수집 채널 목록에 YouTube 와 쇼츠가 있다", () => {
    expect(isMetricsCollected("youtube")).toBe(true);
    expect(isMetricsCollected("shorts")).toBe(true);
  });

  it("수집 채널의 빈 값은 미수집이지 측정 미지원이 아니다", () => {
    // 둘은 다르다. 앞은 기다리면 채워지고 뒤는 영영 안 채워진다.
    expect(emptyMetricLabel("youtube", null)).toBe("미수집");
    // tiktok 은 2026-09-13 에 수집을 만들었으므로 이제 "미수집" 쪽이다.
    expect(emptyMetricLabel("tiktok", null)).toBe("미수집");
  });

  it("수집 경로가 YouTube 를 실제로 부른다", () => {
    const route = read("src/app/api/metrics/route.ts");
    expect(route).toContain("fetchYouTubeMetrics");
    // 쇼츠도 같은 자격증명으로 읽는다. 갈래 이름이 다르다는 이유로 한쪽만 읽으면
    // 그쪽 성과가 영영 안 모인다.
    expect(route).toContain("platform IN ('youtube', 'shorts')");
  });

  it("YouTube 만 연결한 사람도 수집을 돌릴 수 있다", () => {
    const route = read("src/app/api/metrics/route.ts");
    expect(route).toContain("!fbCred && !ytCred");
  });

  it("응답에서 빠진 영상은 기다려도 안 채워진다고 표시한다", () => {
    // 비공개·삭제 영상은 오류가 아니라 빠짐으로 온다. 표시하지 않으면 무한정 기다린다.
    const route = read("src/app/api/metrics/route.ts");
    expect(route).toContain("video_not_visible");
  });

  it("한 번에 묶어 묻는다", () => {
    // 영상마다 따로 부르면 하루 할당량에 금방 닿는다.
    const publish = read("src/lib/publish.ts");
    expect(publish).toMatch(/videoIds\.filter\(Boolean\)\.slice\(0, 50\)/);
  });
});
